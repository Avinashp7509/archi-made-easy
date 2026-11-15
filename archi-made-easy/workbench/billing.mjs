// Billing-dimension model for FinOps estimates. Provider-independent: it knows how cloud
// services are billed in general (per request, per GB-second of memory, per vCPU-second,
// per instance-hour, per GB-month stored, per operation, per GB transferred, flat), not
// any provider's prices. Prices always come from the document, with their source.
//
// A meter is one billed dimension of one component:
//   { id, dimension, unit, price | tiers, per, currency, free_allowance, quantity_basis, source }
// Its monthly quantity is derived from the document's usage figures or the modelled load;
// when that quantity cannot be derived the meter is left out with a reason, never zero.
//
// The legacy fields monthly_base_cost_usd, cost_per_million_requests_usd and
// storage_gb + storage_cost_per_gb_usd are read through an adapter into the same meters.

export const SECONDS_PER_MONTH = 2_628_000; // 730 hours
export const HOURS_PER_MONTH = 730;
export const GIB_IN_GB = 1.073741824;
/** A price whose retrieval date is older than this, against the reference date, is stale. */
export const PRICE_MAX_AGE_DAYS = 90;

/**
 * Billing dimensions. `units` maps each accepted unit to its size in the dimension's base
 * unit (the first key). `quantity` says how the monthly quantity is obtained.
 */
export const DIMENSIONS = Object.freeze({
  requests: { units: { request: 1 }, quantity: 'requests per month: finops.usage.requests_per_month, else modelled load × seconds per month' },
  'memory-seconds': { units: { 'GB-second': 1, 'GiB-second': GIB_IN_GB }, quantity: 'billed seconds × memory (finops.usage.memory_gb or memory_gib, else capacity.memory_gb)', basis: true },
  'vcpu-seconds': { units: { 'vCPU-second': 1, 'vCPU-hour': 3600 }, quantity: 'billed seconds × vCPUs (finops.usage.vcpu, else capacity.cpu_cores)', basis: true },
  'instance-hours': { units: { hour: 1, month: HOURS_PER_MONTH }, quantity: 'instances × 730 hours (finops.usage.instances, else the modelled instance count)' },
  'storage-gb-month': { units: { 'GB-month': 1, 'GiB-month': GIB_IN_GB, 'TB-month': 1000 }, quantity: 'finops.usage.storage_gb' },
  operations: { units: { operation: 1 }, quantity: 'finops.usage.operations_per_month' },
  'data-transfer-gb': { units: { GB: 1, GiB: GIB_IN_GB, TB: 1000 }, quantity: 'finops.usage.transfer_gb_per_month' },
  flat: { units: { month: 1 }, quantity: 'one per month' },
  other: { units: {}, quantity: 'not modelled', unsupported: true },
});

/** How billed seconds are counted for memory and vCPU dimensions. */
export const QUANTITY_BASES = Object.freeze({
  'request-duration': 'each request is billed for its own duration: requests × average duration',
  'instance-time': 'instances are billed while serving: requests × average duration ÷ concurrency per instance',
  provisioned: 'capacity is billed all month while it exists: instances × seconds per month',
});

/**
 * Pricing models: the dimensions a service billed this way charges. Each entry of `bills`
 * is a set of alternatives of which at least one must be priced.
 */
export const PRICING_MODELS = Object.freeze({
  'serverless-request': { bills: [['requests'], ['memory-seconds', 'vcpu-seconds']], optional: ['data-transfer-gb'], description: 'function-style: per request and per compute-second of each request' },
  'serverless-instance': { bills: [['vcpu-seconds'], ['memory-seconds']], optional: ['requests', 'data-transfer-gb'], description: 'container-style: per vCPU- and memory-second while instances serve, often with a request fee' },
  'provisioned-instance': { bills: [['instance-hours']], optional: ['storage-gb-month', 'data-transfer-gb'], description: 'per instance-hour for capacity that runs all month' },
  'provisioned-with-storage': { bills: [['instance-hours'], ['storage-gb-month']], optional: ['operations', 'data-transfer-gb'], description: 'managed databases and similar: compute hours plus stored data' },
  storage: { bills: [['storage-gb-month']], optional: ['operations', 'data-transfer-gb'], description: 'per GB-month stored, often with operation and transfer fees' },
  'data-transfer': { bills: [['data-transfer-gb']], optional: [], description: 'per GB transferred' },
  'flat-monthly': { bills: [['flat']], optional: [], description: 'a fixed monthly charge' },
});

const LEGACY_ID = { base: 'legacy-base', requests: 'legacy-requests', storage: 'legacy-storage' };

/**
 * Normalise a component's finops object into meters, usage and declarations.
 * Pure; returns problems for the caller to report as diagnostics.
 * @returns {{ meters: object[], usage: object, pricing_model: string|null, problems: object[], legacy: boolean }}
 */
export function normaliseFinops(fin = {}) {
  const meters = [];
  const problems = [];
  const legacy = fin.monthly_base_cost_usd != null || fin.cost_per_million_requests_usd != null || (fin.storage_gb != null && fin.storage_cost_per_gb_usd != null);
  // Legacy fields: a monthly base for the minimum footprint (scaled with the instance count),
  // a price per million requests, and storage size × price per GB-month. All USD, no source.
  if (fin.monthly_base_cost_usd != null) meters.push({ id: LEGACY_ID.base, dimension: 'instance-months-legacy', unit: 'month', price: fin.monthly_base_cost_usd, per: 1, currency: 'USD', free_allowance: 0, tiers: null, quantity_basis: null, source: null, legacy: true });
  if (fin.cost_per_million_requests_usd != null) meters.push({ id: LEGACY_ID.requests, dimension: 'requests', unit: 'request', price: fin.cost_per_million_requests_usd, per: 1_000_000, currency: 'USD', free_allowance: 0, tiers: null, quantity_basis: null, source: null, legacy: true });
  if (fin.storage_gb != null && fin.storage_cost_per_gb_usd != null) meters.push({ id: LEGACY_ID.storage, dimension: 'storage-gb-month', unit: 'GB-month', price: fin.storage_cost_per_gb_usd, per: 1, currency: 'USD', free_allowance: 0, tiers: null, quantity_basis: null, source: null, legacy: true, legacy_quantity: fin.storage_gb });
  else if ((fin.storage_gb != null) !== (fin.storage_cost_per_gb_usd != null)) {
    problems.push({ code: 'workbench/finops-incomplete-pair', message: 'storage_gb and storage_cost_per_gb_usd must be given together.' });
  }

  (fin.meters || []).forEach((meter, index) => {
    const id = meter.id ?? `meter-${index}`;
    const dimension = DIMENSIONS[meter.dimension];
    if (!dimension) { problems.push({ code: 'workbench/finops-unknown-dimension', message: `meter ${id}: unknown dimension "${meter.dimension}".` }); return; }
    if (!dimension.unsupported && !(meter.unit in dimension.units)) {
      problems.push({ code: 'workbench/finops-unit-mismatch', message: `meter ${id}: unit "${meter.unit}" does not measure ${meter.dimension} (expected one of ${Object.keys(dimension.units).join(', ')}).` });
    }
    if (meter.price == null && !meter.tiers?.length) problems.push({ code: 'workbench/finops-no-price', message: `meter ${id}: give price or tiers.` });
    if (meter.price != null && meter.tiers?.length) problems.push({ code: 'workbench/finops-price-and-tiers', message: `meter ${id}: give price or tiers, not both.` });
    if (meter.tiers?.length) {
      const bounds = meter.tiers.map((tier) => tier.up_to);
      const open = bounds.findIndex((bound) => bound == null);
      if (open !== -1 && open !== bounds.length - 1) problems.push({ code: 'workbench/finops-tier-order', message: `meter ${id}: only the last tier may be open-ended.` });
      const closed = bounds.filter((bound) => bound != null);
      if (closed.some((bound, i) => i > 0 && bound <= closed[i - 1])) problems.push({ code: 'workbench/finops-tier-order', message: `meter ${id}: tier limits must increase.` });
    }
    if (dimension.basis && meter.quantity_basis == null) {
      problems.push({ code: 'workbench/finops-basis-required', message: `meter ${id}: ${meter.dimension} needs quantity_basis (${Object.keys(QUANTITY_BASES).join(', ')}), because providers count billed seconds differently.` });
    }
    meters.push({
      id, dimension: meter.dimension, unit: meter.unit ?? null, price: meter.price ?? null, per: meter.per ?? 1, currency: meter.currency,
      free_allowance: meter.free_allowance ?? 0, tiers: meter.tiers ? meter.tiers.map((tier) => ({ up_to: tier.up_to ?? null, price: tier.price })) : null,
      quantity_basis: meter.quantity_basis ?? null, source: meter.source ? { ...meter.source } : null, description: meter.description ?? null, legacy: false,
    });
  });

  // The same dimension billed twice on one component would be counted twice.
  const dims = meters.map((meter) => (meter.dimension === 'instance-months-legacy' ? 'instance-hours' : meter.dimension)).filter((d) => d !== 'other');
  for (const dimension of new Set(dims.filter((d, i) => dims.indexOf(d) !== i))) {
    problems.push({ code: 'workbench/finops-double-count', message: `${dimension} is billed by more than one meter (a legacy field and a meter, or two meters): it would be counted twice.` });
  }
  if (fin.usage?.memory_gb != null && fin.usage?.memory_gib != null) problems.push({ code: 'workbench/finops-memory-twice', message: 'usage states memory twice (memory_gb and memory_gib): give one.' });
  if (fin.pricing_model != null && !PRICING_MODELS[fin.pricing_model]) problems.push({ code: 'workbench/finops-unknown-pricing-model', message: `unknown pricing_model "${fin.pricing_model}".` });
  return { meters, usage: { ...(fin.usage || {}) }, pricing_model: fin.pricing_model ?? null, problems, legacy };
}

/** Billable cost of a quantity (in meter units) after the free allowance and tiers. */
export function meterCharge(meter, quantity) {
  const billable = Math.max(0, quantity - (meter.free_allowance ?? 0));
  if (!meter.tiers?.length) return { billable, cost: (billable / meter.per) * meter.price, steps: [{ units: billable, price: meter.price }] };
  let remaining = billable; let from = 0; let cost = 0; const steps = [];
  for (const tier of meter.tiers) {
    if (remaining <= 0) break;
    const size = tier.up_to == null ? remaining : Math.max(0, Math.min(remaining, tier.up_to - from));
    if (size > 0) { cost += (size / meter.per) * tier.price; steps.push({ units: size, price: tier.price }); remaining -= size; }
    from = tier.up_to ?? from;
  }
  // Beyond the last closed tier with no open tier: the rest has no stated price.
  return { billable, cost, steps, unpriced_units: remaining > 0 ? remaining : 0 };
}

/** Freshness of a price source against a reference date (ISO yyyy-mm-dd), deterministic. */
export function freshness(source, asOf) {
  if (!source?.retrieved_at) return 'undated';
  if (!asOf) return 'unchecked';
  const days = (Date.parse(asOf) - Date.parse(source.retrieved_at)) / 86_400_000;
  if (!Number.isFinite(days)) return 'undated';
  if (days < 0) return 'future';
  return days > PRICE_MAX_AGE_DAYS ? 'stale' : 'current';
}

/** Whether a source carries enough to audit a price: provider, region, url and retrieval date. */
export function isSourced(source) {
  return Boolean(source && source.provider && source.region && source.url && source.retrieved_at);
}
