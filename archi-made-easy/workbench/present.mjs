// Canonical presentation of workbench results.
//
// The command line, the plain-text output, the design document and the in-page workbench
// all print what these functions return. That is what keeps them equivalent: a renderer
// formats nothing on its own judgement, so it cannot turn "partial" into a total, "unknown"
// into zero, or an inconclusive run into "no component is affected".
//
// Each function takes a canonical result (simulate, estimateCost, review) and returns
// plain data: a status, the words to show, and what to ask the reader for.

import { STATUS_LABELS } from './evidence.mjs';

const thousands = (text) => text.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/**
 * Money as text. Cents are kept below $100 so that $0.60 is never shown as $1; from $100
 * whole dollars are shown. Null is not a number and has no money text: use formatCost.
 */
export function formatUsd(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const abs = Math.abs(value);
  const text = abs < 100 ? abs.toFixed(2) : thousands(String(Math.round(abs)));
  return `${value < 0 ? '-' : ''}$${text}`;
}

/**
 * A unit price as text, never rounded: a rate of $0.000016 per GB-second is not "$0.00".
 * At least two decimals are shown; beyond that, every stated digit (up to twelve places).
 */
export function formatPrice(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const [whole, fraction = ''] = Math.abs(value).toFixed(12).split('.');
  const digits = fraction.replace(/0+$/, '').padEnd(2, '0');
  return `${value < 0 ? '-' : ''}$${thousands(whole)}.${digits}`;
}

/** A quantity with its unit in words: "3,000,000 requests", "1 hour", "250 GB". */
export function formatQuantity(quantity, unit) {
  if (typeof quantity !== 'number' || !Number.isFinite(quantity)) return null;
  const rounded = Math.round(quantity * 100) / 100;
  const [whole, fraction] = String(rounded).split('.');
  const plural = rounded !== 1 && !/B$/.test(unit) ? 's' : '';
  return `${thousands(whole)}${fraction ? `.${fraction}` : ''} ${unit}${plural}`;
}

export function statusLabel(status) { return STATUS_LABELS[status] ?? String(status); }

/** A share (0..1) as a whole percentage, or null. */
function sharePercent(share) { return share == null ? null : Math.round(share * 100); }

/**
 * The words for a cost figure from its status: a subtotal reads "at least" (or "≥" in the
 * short form used where space is tight), never as a total. No form drops a digit.
 */
export function costText(status, total, subtotal, short = false) {
  if (status === 'complete') return formatUsd(total);
  if (status === 'partial' && subtotal != null) return `${short ? '≥' : 'at least'} ${formatUsd(subtotal)}`;
  if (status === 'unknown') return 'no data';
  if (status === 'inconclusive') return 'not calculated';
  return status === 'invalid' ? 'invalid inputs' : statusLabel(status);
}

/**
 * The headline of a cost estimate.
 * @returns {{ status, label, value, text, qualifier, coverage, definitive }}
 *   `value` is the number shown (total or subtotal) or null; `text` is what to print.
 */
export function formatCost(cost) {
  const { priced_components: priced, components, meters } = cost.coverage;
  const coverage = `${priced} of ${components} priceable component${components === 1 ? '' : 's'} priced; ${meters.computed} of ${meters.total} meter${meters.total === 1 ? '' : 's'} calculated`;
  switch (cost.status) {
    case 'complete':
      return { status: 'complete', label: 'Total', value: cost.monthly_total_usd, text: costText('complete', cost.monthly_total_usd), short: costText('complete', cost.monthly_total_usd), qualifier: 'a month', coverage, definitive: true };
    case 'partial':
      return { status: 'partial', label: 'Partial subtotal', value: cost.subtotal_usd, text: costText('partial', null, cost.subtotal_usd), short: costText('partial', null, cost.subtotal_usd, true), qualifier: 'a month, not the total', coverage, definitive: false };
    case 'unknown':
      return { status: 'unknown', label: 'Total', value: null, text: 'no data', short: 'no data', qualifier: 'no component carries cost data', coverage, definitive: false };
    case 'inconclusive':
      return { status: 'inconclusive', label: 'Not calculated', value: null, text: 'not calculated', short: 'not calculated', qualifier: 'prices are stated, but no quantity to apply them to', coverage, definitive: false };
    default:
      return { status: cost.status, label: statusLabel(cost.status), value: null, text: costText(cost.status, null, null), short: costText(cost.status, null, null), qualifier: 'see the reasons listed', coverage, definitive: false };
  }
}

/** The cost shown on one component (a diagram badge, a table cell), or null for an actor. */
export function formatNodeCost(entry) {
  if (!entry || entry.priceable === false) return null;
  // `text` stands alone (a badge), so it carries the status in words. `amount` is for a
  // row that shows the status beside it.
  if (!entry.priced) return { status: 'unknown', text: 'no cost data', amount: 'no cost data', tone: 'muted' };
  if (entry.status === 'complete') return { status: 'complete', text: `${formatUsd(entry.total_usd)}/mo`, amount: `${formatUsd(entry.total_usd)}/mo`, tone: 'info' };
  if (entry.subtotal_usd != null) return { status: entry.status, text: `≥ ${formatUsd(entry.subtotal_usd)}/mo partial`, amount: `≥ ${formatUsd(entry.subtotal_usd)}/mo`, tone: 'warn' };
  const words = entry.status === 'inconclusive' ? 'usage unknown' : statusLabel(entry.status);
  return { status: entry.status, text: words, amount: words, tone: 'warn' };
}

/**
 * Everything a reader must see next to a cost figure: why it is not complete, what was
 * left out, and whether the prices can be audited. One line each.
 */
export function costLines(cost, name = (id) => id) {
  const lines = [];
  const list = (ids) => ids.map(name).join(', ');
  for (const item of cost.reasons) {
    if (item.code === 'no-cost-data') { lines.push(item.message); continue; }
    lines.push(`${item.message}${item.subjects?.length ? ` (${list(item.subjects)})` : ''}`);
  }
  for (const item of cost.omitted) lines.push(`Left out: ${name(item.subject)}, ${item.dimension}${item.meter ? ` (${item.meter})` : ''}: ${statusLabel(item.status)}.`);
  if (cost.status !== 'unknown') {
    const c = cost.confidence;
    const evidence = c.level === 'traceable' ? `Price evidence: traceable (${c.sourced} of ${c.sourced + c.unsourced} prices carry a source).`
      : c.level === 'unsourced' ? `Price evidence: none. No price carries a source (provider, region, URL, retrieval date), so the figures are an authored worksheet, not a checked provider estimate.`
        : `Price evidence: partly sourced (${c.sourced} of ${c.sourced + c.unsourced} prices carry a source).`;
    lines.push(evidence);
    if (c.stale) lines.push(`${c.stale} price${c.stale === 1 ? ' was' : 's were'} retrieved more than the freshness limit before ${c.as_of}: check them against the current list.`);
    if (c.unchecked) lines.push(`${c.unchecked} price${c.unchecked === 1 ? ' has' : 's have'} a retrieval date but no reference date was given, so their age was not judged.`);
  }
  return lines;
}

/**
 * The headline of a simulation run.
 * @returns {{ status, tone, text, lines, asks, show_comparison, show_recovery }}
 *  - `text` never claims "no component is affected" unless the blast radius is complete;
 *  - `show_comparison` and `show_recovery` are false for an inconclusive run: a before/after
 *    table or a recovery list would imply an impact was calculated.
 */
export function simulationHeadline(model, result) {
  const name = (id) => result.display?.[id] ?? model.display?.[id] ?? id;
  const k = result.kpis; const radius = k.blast_radius; const total = model.nodes.length;
  const asks = [...new Set(result.reasons.map((item) => item.ask).filter(Boolean))];
  const lines = [];
  if (result.status === 'inconclusive') {
    let text;
    if (result.bounds && !result.bounds.agree) {
      const { best, worst } = result.bounds;
      const describe = (side) => (side.failing.length ? `${side.failing.length} component${side.failing.length === 1 ? '' : 's'} fail${side.failing.length === 1 ? 's' : ''}${side.ingress_share ? ` and at least ${sharePercent(side.ingress_share)}% of entry traffic is not served` : ''}` : `no component fails (${side.affected.length} run with fewer units)`);
      const unplaced = (result.assessments.structure.reasons.find((item) => item.code === 'placement-unknown')?.subjects ?? []).map(name);
      text = `Inconclusive. Best case: ${describe(best)}. Worst case: ${describe(worst)}. The outcome depends on where ${unplaced.join(', ') || 'single-unit components'} run${unplaced.length === 1 ? 's' : ''}, which the document does not state.`;
      const onlyWorst = worst.failing.filter((id) => !best.failing.includes(id)).map(name);
      if (onlyWorst.length) lines.push(`At risk (fails only in the worst case): ${onlyWorst.join(', ')}.`);
    } else {
      const first = result.reasons.find((item) => item.code === 'missing-baseline-load') ?? result.reasons[0];
      text = `Inconclusive. ${result.inputs.multiplier !== 1 ? `${result.inputs.multiplier}x load was not calculated: there is no baseline load to multiply. ` : ''}${first ? first.message : ''}`.trim();
      if (k.max_sustainable_rps != null) lines.push(`Capacity ceiling: ${k.max_sustainable_rps} requests/s on the request path${k.limiting_node ? ` (first limit: ${name(k.limiting_node)})` : ''}. This is a ceiling computed from authored and assumed limits, not evidence that ${result.inputs.multiplier}x the current load is below it.`);
    }
    return { status: 'inconclusive', tone: 'inconclusive', text, lines, asks, show_comparison: false, show_recovery: false };
  }
  const affected = radius.nodes;
  const share = radius.ingress_share;
  let text;
  if (affected.length) {
    // Running with fewer units is not failing: say so, so a survived loss does not read as an outage.
    const failing = affected.filter((id) => result.nodes[id].state === 'failing').length;
    text = `${affected.length} component${affected.length === 1 ? '' : 's'} of ${total} affected${failing ? '' : ', none failing'}.`;
    // A lower bound of zero says nothing: the note about load-dependent effects covers it.
    if (share != null && !radius.ingress_share_is_floor) text += ` ${sharePercent(share)}% of entry traffic is not served.`;
    else if (share != null && share > 0) text += ` At least ${sharePercent(share)}% of entry traffic is not served.`;
    else if (share != null) text += ' Traffic lost to overload was not evaluated.';
  } else if (radius.status === 'complete') text = 'No component is affected under these conditions.';
  else text = 'No component fails under these conditions. Load-dependent effects (saturation, queueing) were not evaluated because no entry load is stated.';
  if (result.assessments.availability.reasons.some((item) => item.code === 'answered-includes-degraded')) {
    lines.push('Requests are still answered, but operations that need the failed component do not succeed: "answered" is not "successful".');
  }
  for (const journey of k.journeys ?? []) if (journey.status !== 'served') lines.push(`Journey "${journey.title}": ${journey.status}${journey.blocked_at ? ` at ${name(journey.blocked_at)}` : ''}.`);
  return { status: result.status, tone: affected.length ? 'critical' : result.status === 'complete' ? 'ok' : 'partial', text, lines, asks, show_comparison: true, show_recovery: true };
}

/**
 * The headline of a review: quality, and next to it how much was evaluated.
 * A score is never shown without its coverage.
 */
export function reviewHeadline(review) {
  const c = review.coverage;
  const score = review.score == null ? 'not scored' : `${review.score}/100`;
  const covered = c.applicable ? `${c.evaluated} of ${c.applicable} applicable rules fully evaluated` : 'no rule applies';
  const floor = review.score != null && review.score_floor !== review.score ? `; as low as ${review.score_floor}/100 if assumed findings count in full and the checks that could not run had found problems` : '';
  const confidence = review.confidence ? `; evidence confidence ${review.confidence.level}` : '';
  return {
    status: review.status,
    score,
    text: `Score: ${score} (${statusLabel(review.status)}: ${covered}${floor}${confidence})`,
    short: review.status === 'complete' ? score : `${score} ${statusLabel(review.status)}`,
    qualifier: `${covered}${floor}`,
    definitive: review.status === 'complete',
  };
}

/** One line per gap: what could not be checked and what to supply. */
export function gapLines(review) {
  return review.gaps.map((gap) => `${gap.title}: ${gap.message}${gap.ask ? ` ${gap.ask}` : ''}`);
}

/** What to say where a list of findings is empty: never "no rule fired" when rules could not run. */
export function noFindingsText(review, pillar) {
  const gaps = review.gaps.filter((gap) => !pillar || gap.pillars.includes(pillar));
  const state = pillar ? review.pillars[pillar]?.status : review.status;
  if (gaps.length || (state && state !== 'complete' && state !== 'not_applicable')) {
    return `No finding, but this was not fully checked: ${gaps.length} check${gaps.length === 1 ? '' : 's'} could not be evaluated. See what is missing below.`;
  }
  if (state === 'not_applicable') return 'No rule applies here.';
  return 'No rule fired here. That means none of the checked rules found a problem, not that this aspect is complete.';
}
