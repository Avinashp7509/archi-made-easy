// Monthly cost estimate from authored prices only. Nothing is priced unless the document
// carries a price for it, and nothing is counted unless its quantity is known.
//
// The estimate is built from meters (billing.mjs): one billed dimension of one component,
// with a price, a unit and, ideally, a source. Each meter is computed or left out with a
// reason; a meter whose usage is unknown is never counted as zero.
//
//   monthly_total_usd   only when the estimate is complete: every priceable component is
//                       priced on every dimension its pricing model bills, and every
//                       quantity is known. Otherwise null.
//   subtotal_usd        the sum of what could be computed. When status is "partial" it is
//                       a lower bound and must be shown as partial, never as the total.
//   status, reasons     the completeness of the estimate (evidence.mjs).
//   confidence          how auditable the prices are: separate from completeness. Correct
//                       arithmetic over unsourced prices is still an unaudited estimate.

import { reason, combineStatuses } from './evidence.mjs';
import { DIMENSIONS, PRICING_MODELS, QUANTITY_BASES, SECONDS_PER_MONTH as MONTH_SECONDS, HOURS_PER_MONTH, GIB_IN_GB, meterCharge, freshness, isSourced } from './billing.mjs';

export const SECONDS_PER_MONTH = MONTH_SECONDS; // 730 hours
export const COST_SCHEMA_VERSION = 2;
/** Authored usage and modelled load may differ by this share before they count as contradictory. */
export const USAGE_TOLERANCE = 0.1;
const KB_PER_GB = 1_048_576;
const round = (value, digits = 2) => (typeof value === 'number' && Number.isFinite(value) ? Math.round(value * 10 ** digits) / 10 ** digits : value);
const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Dimensions a meter covers when checking a pricing model (the legacy base is instance time). */
function coveredDimensions(meter) {
  return meter.dimension === 'instance-months-legacy' ? ['instance-hours', 'flat'] : [meter.dimension];
}

/**
 * The monthly quantity of one meter, in the meter's unit, with the inputs it came from.
 * Returns { quantity } or { missing: [...], code } when it cannot be derived.
 */
function meterQuantity(meter, node, context) {
  const { load, multiplier, instances, instancesOrigin } = context;
  const usage = node.finops.usage;
  const inputs = [];
  const missing = [];
  const need = (label, value, origin, unit) => {
    if (value == null) { missing.push({ input: label, unit, subject: node.id }); return null; }
    inputs.push({ input: label, value, unit, origin });
    return value;
  };
  // Requests per month: stated usage (scaled with the run's load multiplier), else modelled load.
  const requests = () => {
    if (usage.requests_per_month != null) {
      inputs.push({ input: 'finops.usage.requests_per_month', value: usage.requests_per_month, unit: 'requests/month', origin: 'authored' });
      if (multiplier !== 1) inputs.push({ input: 'load multiplier', value: multiplier, unit: 'ratio', origin: 'authored' });
      const stated = usage.requests_per_month * multiplier;
      if (load != null) {
        const modelled = load * MONTH_SECONDS;
        if (Math.abs(stated - modelled) > USAGE_TOLERANCE * Math.max(stated, modelled)) {
          return { contradiction: `finops.usage.requests_per_month gives ${round(stated)} requests a month, but the modelled load on ${node.id} gives ${round(modelled)}.` };
        }
      }
      return { value: stated };
    }
    if (load != null) {
      inputs.push({ input: 'modelled load', value: load, unit: 'requests/s', origin: 'derived' }, { input: 'seconds per month', value: MONTH_SECONDS, unit: 's', origin: 'default' });
      return { value: load * MONTH_SECONDS };
    }
    return { value: null };
  };
  const billedSeconds = () => {
    if (meter.quantity_basis === 'provisioned') {
      inputs.push({ input: 'instances', value: instances, unit: 'count', origin: instancesOrigin }, { input: 'seconds per month', value: MONTH_SECONDS, unit: 's', origin: 'default' });
      return { value: instances * MONTH_SECONDS };
    }
    const r = requests();
    if (r.contradiction) return r;
    if (r.value == null) return { value: null, code: 'missing-usage-baseline' };
    const duration = need('finops.usage.avg_duration_ms', usage.avg_duration_ms, 'authored', 'ms');
    let seconds = duration == null ? null : r.value * duration / 1000;
    if (meter.quantity_basis === 'instance-time') {
      const concurrency = need('finops.usage.concurrency', usage.concurrency, 'authored', 'requests per instance');
      seconds = seconds == null || concurrency == null ? null : seconds / concurrency;
    }
    return { value: seconds, code: 'missing-meter-quantity' };
  };

  let base = null; let code = 'missing-meter-quantity';
  switch (meter.dimension) {
    case 'requests': {
      const r = requests();
      if (r.contradiction) return { contradiction: r.contradiction, inputs };
      base = r.value; code = 'missing-usage-baseline';
      if (base == null) missing.push({ input: 'capacity.baseline_rps on an entry point, or finops.usage.requests_per_month', unit: 'requests/s or requests/month', subject: node.id });
      break;
    }
    case 'memory-seconds':
    case 'vcpu-seconds': {
      const seconds = billedSeconds();
      if (seconds.contradiction) return { contradiction: seconds.contradiction, inputs };
      if (seconds.value == null && seconds.code === 'missing-usage-baseline') {
        code = 'missing-usage-baseline';
        missing.push({ input: 'capacity.baseline_rps on an entry point, or finops.usage.requests_per_month', unit: 'requests/s or requests/month', subject: node.id });
      }
      const size = meter.dimension === 'memory-seconds'
        ? (usage.memory_gb != null ? need('finops.usage.memory_gb', usage.memory_gb, 'authored', 'GB')
          : usage.memory_gib != null ? need('finops.usage.memory_gib', usage.memory_gib, 'authored', 'GiB') * GIB_IN_GB
            : need('finops.usage.memory_gb', node.capacity.memory_gb, node.origin['capacity.memory_gb'], 'GB'))
        : need('finops.usage.vcpu', usage.vcpu ?? node.capacity.cpu_cores, usage.vcpu != null ? 'authored' : node.origin['capacity.cpu_cores'], 'vCPU');
      base = seconds.value == null || size == null ? null : seconds.value * size;
      break;
    }
    case 'instance-hours':
      inputs.push({ input: 'instances', value: instances, unit: 'count', origin: instancesOrigin }, { input: 'hours per month', value: HOURS_PER_MONTH, unit: 'hour', origin: 'default' });
      base = instances * HOURS_PER_MONTH;
      break;
    case 'instance-months-legacy': {
      // The legacy base is the monthly cost of the minimum footprint, scaled with instances.
      const min = Math.max(1, node.capacity.autoscale_min ?? 1);
      inputs.push({ input: 'instances', value: instances, unit: 'count', origin: instancesOrigin }, { input: 'capacity.autoscale_min', value: min, unit: 'count', origin: node.origin['capacity.autoscale_min'] ?? 'default' });
      base = instances / min;
      break;
    }
    case 'storage-gb-month':
      base = need('finops.usage.storage_gb', usage.storage_gb ?? meter.legacy_quantity ?? null, 'authored', 'GB');
      break;
    case 'operations': {
      const value = need('finops.usage.operations_per_month', usage.operations_per_month, 'authored', 'operations/month');
      base = value == null ? null : value * multiplier;
      break;
    }
    case 'data-transfer-gb': {
      const value = need('finops.usage.transfer_gb_per_month', usage.transfer_gb_per_month, 'authored', 'GB/month');
      base = value == null ? null : value * multiplier;
      break;
    }
    case 'flat':
      inputs.push({ input: 'months', value: 1, unit: 'month', origin: 'default' });
      base = 1;
      break;
    default:
      return { unsupported: true, inputs };
  }
  if (base == null) return { missing, code, inputs };
  const factor = meter.dimension === 'instance-months-legacy' ? 1 : DIMENSIONS[meter.dimension].units[meter.unit];
  if (!(factor > 0)) return { unsupported: true, inputs };
  return { quantity: base / factor, inputs };
}

function describe(meter) {
  // The price as stated, digit for digit (no exponent form, no rounding).
  const stated = (value) => `$${Math.abs(value).toFixed(12).replace(/0+$/, '').replace(/\.$/, '')}`;
  const rate = meter.tiers?.length ? `tiered price (${meter.tiers.map((tier) => `${stated(tier.price)}${tier.up_to == null ? ' beyond' : ` up to ${tier.up_to}`}`).join(', ')})` : stated(meter.price);
  const per = meter.per === 1 ? meter.unit : `${meter.per} ${meter.unit}s`;
  const basis = meter.quantity_basis ? `; billed seconds: ${QUANTITY_BASES[meter.quantity_basis]}` : '';
  return `cost = max(0, quantity − free allowance) ÷ ${meter.per} × ${rate} per ${per}${basis}`;
}

/**
 * @param {object} model from buildModel()
 * @param {object} result from simulate() for the same model
 * @param {{ asOf?: string }} options reference date (yyyy-mm-dd) for price freshness;
 *   defaults to the document's workbench.as_of. With no date, freshness is not judged.
 */
export function estimateCost(model, result, options = {}) {
  const asOf = options.asOf ?? model.as_of ?? null;
  const multiplier = result.inputs?.multiplier ?? 1;
  const nodes = {};
  const omitted = [];
  const notes = [];
  const sourcing = { sourced: 0, unsourced: 0, stale: 0, undated: 0, unchecked: 0, current: 0 };
  const billing = { declared: [], undeclared: [], missing_dimensions: {} };
  const reasonSubjects = new Map(); // code -> Set(subject)
  const flag = (code, subject) => { if (!reasonSubjects.has(code)) reasonSubjects.set(code, new Set()); reasonSubjects.get(code).add(subject); };
  let subtotal = 0; let computed = 0; let meterCount = 0;
  const priceable = model.nodes.filter((node) => !node.actor).sort(byId);
  const priced = [];
  const parts = [];
  // Arithmetic alone: were the stated meters computed? Kept apart from whether the meters
  // cover what the provider bills (billing coverage).
  const arithmeticParts = [];

  for (const node of [...model.nodes].sort(byId)) {
    if (node.actor) { nodes[node.id] = { priced: false, priceable: false, status: 'not_applicable' }; continue; }
    const meters = node.finops.meters;
    if (!meters.length) {
      nodes[node.id] = { priced: false, priceable: true, status: 'unknown' };
      flag('unpriced-component', node.id);
      parts.push('unknown');
      continue;
    }
    priced.push(node.id);
    const load = result.nodes[node.id].load_rps;
    const min = node.capacity.autoscale_min ?? 1;
    const max = Math.max(min, node.capacity.autoscale_max ?? min);
    const modelled = load == null || !node.capacity.max_rps ? min : Math.min(max, Math.max(min, Math.ceil(load / node.capacity.max_rps)));
    const instances = node.finops.usage.instances ?? modelled;
    const instancesOrigin = node.finops.usage.instances != null ? 'authored' : load == null ? (node.origin['capacity.autoscale_min'] ?? 'default') : 'derived';
    const lines = [];
    let nodeSubtotal = 0; let nodeComputed = 0;
    const legacyUsd = { base_usd: null, requests_usd: null, storage_usd: null };
    for (const meter of meters) {
      meterCount += 1;
      const line = {
        id: meter.id, dimension: meter.dimension === 'instance-months-legacy' ? 'instance-hours' : meter.dimension, unit: meter.unit, currency: meter.currency ?? null,
        price: meter.price, per: meter.per, tiers: meter.tiers, free_allowance: meter.free_allowance, quantity_basis: meter.quantity_basis,
        status: 'complete', reasons: [], missing: [], inputs: [], quantity: null, billable_quantity: null, cost_usd: null,
        equation: describe(meter), source: meter.source, sourced: isSourced(meter.source), freshness: freshness(meter.source, asOf), legacy: Boolean(meter.legacy),
      };
      const leaveOut = (status, code, extra = {}) => {
        line.status = status; line.reasons.push(reason(code, extra)); flag(code, node.id);
        omitted.push({ subject: node.id, meter: meter.id, dimension: line.dimension, status, code, message: line.reasons.at(-1).message });
      };
      if (meter.dimension === 'other' || !(meter.dimension in DIMENSIONS || meter.dimension === 'instance-months-legacy')) leaveOut('unsupported', 'unsupported-billing-dimension');
      else if (meter.currency !== 'USD') leaveOut('unsupported', 'unsupported-currency');
      else {
        const q = meterQuantity(meter, node, { load, multiplier, instances, instancesOrigin });
        line.inputs = q.inputs ?? [];
        if (q.contradiction) leaveOut('invalid', 'contradictory-input', { message: q.contradiction });
        else if (q.unsupported) leaveOut('unsupported', 'unsupported-billing-dimension');
        else if (q.quantity == null) { line.missing = q.missing; leaveOut('inconclusive', q.code); }
        else {
          const charge = meterCharge(meter, q.quantity);
          line.quantity = round(q.quantity, 4);
          line.billable_quantity = round(charge.billable, 4);
          line.cost_usd = round(charge.cost, 4);
          nodeSubtotal += charge.cost; nodeComputed += 1; computed += 1;
          if (charge.unpriced_units > 0) {
            line.status = 'partial';
            line.reasons.push(reason('unsupported-billing-structure', { message: `${round(charge.unpriced_units, 4)} ${meter.unit}s lie beyond the last price tier and have no stated price.` }));
            flag('unsupported-billing-structure', node.id);
          }
          if (meter.id === 'legacy-base') legacyUsd.base_usd = round(charge.cost);
          if (meter.id === 'legacy-requests') legacyUsd.requests_usd = round(charge.cost);
          if (meter.id === 'legacy-storage') legacyUsd.storage_usd = round(charge.cost);
        }
      }
      // Evidence: can this price be audited, and how old is it?
      if (line.sourced) sourcing.sourced += 1; else { sourcing.unsourced += 1; flag('price-unsourced', node.id); }
      if (line.freshness === 'stale') { sourcing.stale += 1; flag('price-stale', node.id); }
      else if (line.freshness === 'undated' || line.freshness === 'future') sourcing.undated += 1;
      else if (line.freshness === 'unchecked') { sourcing.unchecked += 1; flag('price-age-unknown', node.id); }
      else sourcing.current += 1;
      lines.push(line);
    }

    // Billing coverage: does the set of meters cover what this kind of service bills?
    const reasons = [];
    let status = combineStatuses(lines.map((line) => line.status));
    arithmeticParts.push(status);
    const model_ = node.finops.pricing_model ? PRICING_MODELS[node.finops.pricing_model] : null;
    let billingCoverage;
    if (!model_) {
      billingCoverage = 'undeclared';
      billing.undeclared.push(node.id);
      reasons.push(reason('billing-model-undeclared', { subjects: [node.id] }));
      flag('billing-model-undeclared', node.id);
    } else {
      const have = new Set(meters.flatMap(coveredDimensions));
      const lacking = model_.bills.filter((group) => !group.some((dimension) => have.has(dimension))).map((group) => group.join(' or '));
      billing.declared.push(node.id);
      if (lacking.length) {
        billingCoverage = 'missing-dimensions';
        billing.missing_dimensions[node.id] = lacking;
        reasons.push(reason('billing-dimension-missing', { subjects: [node.id], dimensions: lacking, message: `${node.finops.pricing_model} bills ${lacking.join(', ')}, which ${node.id} has no meter for.` }));
        flag('billing-dimension-missing', node.id);
        for (const dimension of lacking) omitted.push({ subject: node.id, meter: null, dimension, status: 'unknown', code: 'billing-dimension-missing', message: `No meter for ${dimension}, which ${node.finops.pricing_model} bills.` });
      } else billingCoverage = 'covered';
    }
    // A component is complete only when every meter was computed and its billing is covered.
    if (billingCoverage !== 'covered' && status === 'complete') status = 'partial';
    const any = nodeComputed > 0;
    nodes[node.id] = {
      priced: true, priceable: true, status,
      // A component total exists only when it is complete; a partial figure is a subtotal.
      total_usd: status === 'complete' ? round(nodeSubtotal) : null,
      subtotal_usd: any ? round(nodeSubtotal) : null,
      instances, pricing_model: node.finops.pricing_model, billing_coverage: billingCoverage,
      meters: lines, reasons: [...reasons, ...lines.flatMap((line) => line.reasons)],
      ...legacyUsd,
    };
    if (any) subtotal += nodeSubtotal;
    parts.push(status === 'partial' && !any ? 'inconclusive' : status);
  }

  // Data transfer across region and zone boundaries.
  const zoneOf = (id) => new Set(model.boundaries.filter((b) => (b.scope === 'region' || b.scope === 'availability-zone') && b.members.includes(id)).map((b) => b.id));
  const egress = {};
  let egressTotal = 0; let egressComputed = 0;
  for (const edge of [...model.edges].sort(byId)) {
    const price = edge.traffic.egress_cost_per_gb_usd;
    if (price == null || price === 0) continue;
    const from = zoneOf(edge.from); const to = zoneOf(edge.to);
    const crosses = [...from].some((id) => !to.has(id)) || [...to].some((id) => !from.has(id));
    const source = edge.traffic.egress_price_source;
    const entry = { status: 'complete', reasons: [], gb_per_month: null, cost_usd: null, price_per_gb_usd: price, source, sourced: isSourced(source), freshness: freshness(source, asOf), inputs: [], equation: 'cost = flow × payload_kb × seconds per month ÷ KB per GB × price per GB' };
    if (!crosses) {
      // A transfer price on a connection that crosses no region or zone boundary is not applied.
      entry.status = 'not_applicable';
      entry.reasons.push({ code: 'egress-not-crossing', message: `${edge.id} has a transfer price but crosses no region or availability-zone boundary in this diagram, so the price is not applied.`, ask: 'Draw the region or zone boundary the connection crosses, or remove the price.' });
      egress[edge.id] = entry;
      continue;
    }
    meterCount += 1;
    if (entry.sourced) sourcing.sourced += 1; else { sourcing.unsourced += 1; flag('price-unsourced', edge.id); }
    const flow = result.edges[edge.id].flow_rps;
    if (flow == null) {
      entry.status = 'inconclusive';
      entry.reasons.push(reason('egress-flow-unknown', { subjects: [edge.id] }));
      flag('egress-flow-unknown', edge.id);
      omitted.push({ subject: edge.id, meter: 'egress', dimension: 'data-transfer-gb', status: 'inconclusive', code: 'egress-flow-unknown', message: entry.reasons[0].message });
      notes.push(`${edge.id}: egress cost left out because load is not set.`);
      parts.push('inconclusive');
      egress[edge.id] = entry;
      continue;
    }
    const gb = flow * edge.traffic.payload_kb * MONTH_SECONDS / KB_PER_GB;
    entry.gb_per_month = round(gb); entry.cost_usd = round(gb * price);
    entry.inputs = [{ input: 'flow', value: flow, unit: 'requests/s', origin: 'derived' }, { input: 'traffic.payload_kb', value: edge.traffic.payload_kb, unit: 'KB', origin: edge.origin['traffic.payload_kb'] ?? 'default' }];
    egress[edge.id] = entry;
    egressTotal += gb * price; egressComputed += 1; computed += 1;
    parts.push('complete');
  }

  const anyData = priced.length > 0 || Object.values(egress).some((entry) => entry.status !== 'not_applicable');
  const status = anyData ? combineStatuses(parts) : 'unknown';
  const anyComputed = computed > 0;
  const unpriced = priceable.filter((node) => !priced.includes(node.id)).map((node) => node.id);
  for (const item of omitted) if (item.code === 'missing-usage-baseline') notes.push(`${item.subject}: ${item.dimension} cost left out because load is not set.`);
  const reasons = anyData
    ? [...reasonSubjects].filter(([code]) => !code.startsWith('price-')).map(([code, subjects]) => reason(code, { subjects: [...subjects].sort() }))
    : [reason('no-cost-data')];
  const evidence = [...reasonSubjects].filter(([code]) => code.startsWith('price-')).map(([code, subjects]) => reason(code, { subjects: [...subjects].sort() }));
  const level = meterCount === 0 ? 'unknown' : sourcing.unsourced === 0 && sourcing.stale === 0 ? 'traceable' : sourcing.sourced === 0 ? 'unsourced' : 'partly-sourced';

  return {
    schemaVersion: COST_SCHEMA_VERSION,
    kind: 'analytical-model',
    status,
    reasons,
    currency: 'USD',
    // Null unless the estimate is complete. Never a subtotal.
    monthly_total_usd: status === 'complete' ? round(subtotal + egressTotal) : null,
    // The sum of what was computed; a lower bound when status is "partial".
    subtotal_usd: anyComputed ? round(subtotal + egressTotal) : null,
    lower_bound: status === 'partial',
    compute_and_storage_usd: priced.some((id) => nodes[id].subtotal_usd != null) ? round(subtotal) : null,
    egress_usd: egressComputed ? round(egressTotal) : null,
    coverage: {
      priced_components: priced.length,
      // Priceable components only: actors (users, client systems) are not resources.
      components: priceable.length,
      all_components: model.nodes.length,
      unpriced,
      meters: { total: meterCount, computed, omitted: meterCount - computed },
    },
    billing,
    // Two separate questions. Arithmetic: were the stated meters computed correctly and in
    // full? Billing coverage: do the stated meters cover everything the service bills?
    arithmetic_status: arithmeticParts.length ? combineStatuses(arithmeticParts) : 'unknown',
    billing_status: !priced.length ? 'unknown' : Object.keys(billing.missing_dimensions).length ? 'missing-dimensions' : billing.undeclared.length ? 'undeclared' : unpriced.length ? 'covered-for-priced-components' : 'covered',
    // Evidence confidence: whether the prices can be audited. Independent of `status`.
    confidence: { level, ...sourcing, as_of: asOf, reasons: evidence },
    omitted,
    nodes,
    egress,
    notes: [
      ...(unpriced.length ? [`${unpriced.length} of ${priceable.length} priceable components have no cost data and are not included.`] : []),
      ...notes,
    ],
  };
}
