// Truth, completeness and evidence contract shared by every workbench output.
//
// Every analysis (simulation, cost, review, scenario, comparison) states, next to its
// figures, how far those figures can be trusted:
//
//   status       what was computed: complete, partial, inconclusive, unknown, invalid,
//                unsupported or not_applicable (see STATUSES);
//   reasons      machine-readable codes with a sentence each, saying why it is not complete;
//   missing      the inputs that would make it more complete, with their units;
//   assumptions  the values the model used that the document does not state;
//   affects      which outputs a reason touches.
//
// Renderers never decide these: they print what the assessment says. A figure whose
// assessment is not complete must never be shown as a definitive result.
// Pure: no I/O, no clock, no randomness.

/** Where a decision-relevant value came from. */
export const ORIGINS = Object.freeze([
  'authored',  // stated explicitly in the document by its author
  'derived',   // computed deterministically from other values
  'inferred',  // guessed from names, types or structure (for example a role from a label)
  'default',   // a documented planning default (defaults.mjs)
  'measured',  // observed in a running system
  'imported',  // copied from an external source, such as a price list, with a reference
  'unknown',   // not available: never silently replaced by zero, false or empty
]);

/** Completeness of an analysis or of one of its figures. */
export const STATUSES = Object.freeze([
  'complete',       // every required input was available and the calculation ran
  'partial',        // some parts were computed; a numeric value is a lower bound or a subset
  'inconclusive',   // the calculation ran, but an essential input is missing: no conclusion
  'unknown',        // nothing to evaluate: no input of the kind this analysis needs
  'unsupported',    // the input exists but the model cannot represent it
  'invalid',        // the inputs contradict each other or are out of range
  'not_applicable', // the question does not apply to this design
]);

/** Statuses under which a figure may be presented as a definitive result. */
export function isDefinitive(status) { return status === 'complete'; }

/** Statuses under which a number exists at all (possibly as a lower bound). */
export function hasValue(status) { return status === 'complete' || status === 'partial'; }

/**
 * Reason codes. Each is stable and machine-readable; the message is the default sentence,
 * and `ask` says what the reader can supply to resolve it.
 */
export const REASONS = Object.freeze({
  'missing-baseline-load': {
    message: 'No entry component states its normal load (capacity.baseline_rps), so load, utilisation, saturation, queue lag and latency under load were not calculated.',
    ask: 'State the current requests per second on at least one entry point (capacity.baseline_rps).',
  },
  'load-shedding-not-included': {
    message: 'A component saturates; requests it cannot serve are not counted as lost entry traffic, so the share lost is a lower bound.',
    ask: 'Confirm what the saturated component does with excess load (queue, reject, autoscale).',
  },
  'missing-timeout': {
    message: 'A failing blocking call has no timeout_ms, so the time callers wait for it is not included: latency is a lower bound.',
    ask: 'State resilience.timeout_ms on the blocking calls into failing components.',
  },
  'no-entry-point': {
    message: 'No component receives external traffic, so nothing can be measured from an entry point.',
    ask: 'Mark the component where requests enter (workbench.entrypoints or an ingress role).',
  },
  'entrypoints-inferred': {
    message: 'Entry points were inferred from the diagram, not stated.',
    ask: 'List the entry components in workbench.entrypoints.',
  },
  'answered-includes-degraded': {
    message: 'Requests answered counts any response, including degraded answers from callers that contain a failure: operations that need the failed component do not succeed.',
    ask: 'Declare request traces (workbench.traces) for the journeys that matter to see which ones fail.',
  },
  'placement-unknown': {
    message: 'Which zone each component runs in is not stated, so the outcome is given as a range: the worst case assumes every component with one unit runs in the lost zone.',
    ask: 'Place components in availability-zone boundaries, or state redundancy for each component.',
  },
  'defaults-used': {
    message: 'Some inputs are planning defaults for the component\'s role, not facts about this system.',
    ask: 'Replace assumed values with authored figures.',
  },
  'independence-assumption': {
    message: 'Availability this high depends on the assumption that components fail independently.',
    ask: 'Treat the figure as an upper bound; shared software, configuration and provider-wide incidents are not modelled.',
  },
  'cycle-excluded': {
    message: 'A cycle in the request graph was excluded from traffic propagation.',
    ask: 'Check whether the cycle carries traffic and break it with an asynchronous step if so.',
  },
  'no-cost-data': {
    message: 'No component carries cost data, so no estimate was made.',
    ask: 'Add finops meters with prices and their source to the components you want priced.',
  },
  'unpriced-component': {
    message: 'Some components carry no cost data, so any total leaves them out.',
    ask: 'Add finops meters to the components listed, or confirm they cost nothing.',
  },
  'missing-usage-baseline': {
    message: 'A usage-priced meter has a price but no usage to multiply: the load is not stated. It is left out, not counted as zero.',
    ask: 'State capacity.baseline_rps on an entry point, or finops.usage for the component.',
  },
  'missing-meter-quantity': {
    message: 'A meter needs a usage figure that is not stated (for example duration, memory or concurrency).',
    ask: 'State the missing finops.usage field named in the meter.',
  },
  'billing-model-undeclared': {
    message: 'Some priced components do not say how their service is billed (finops.pricing_model), so it cannot be told whether every billed dimension is included.',
    ask: 'Set finops.pricing_model and price every dimension it lists.',
  },
  'billing-dimension-missing': {
    message: 'The declared pricing model bills dimensions that have no meter, so the component total leaves them out.',
    ask: 'Add a meter for each dimension listed.',
  },
  'unsupported-billing-dimension': {
    message: 'A meter bills a dimension the model cannot calculate, so it is left out.',
    ask: 'Express the charge with a supported dimension, or keep it outside the estimate.',
  },
  'unsupported-currency': {
    message: 'A price is not in USD; currency conversion is not modelled, so it is left out.',
    ask: 'State the price in USD with its source and date.',
  },
  'unsupported-billing-structure': {
    message: 'The billing structure cannot be represented by the meter model.',
    ask: 'Price this component outside the estimate.',
  },
  'egress-flow-unknown': {
    message: 'A connection crossing a region or zone has a transfer price but no traffic flow: the load is not stated. It is left out, not counted as zero.',
    ask: 'State the current requests per second on at least one entry point (capacity.baseline_rps).',
  },
  'price-unsourced': {
    message: 'Some prices have no source (provider, region, URL, retrieval date), so they cannot be audited.',
    ask: 'Add a source to each meter: provider, service, region, currency, url and retrieved_at.',
  },
  'price-stale': {
    message: 'Some prices were retrieved longer ago than the freshness limit.',
    ask: 'Check the prices against the provider\'s current list and update retrieved_at.',
  },
  'price-age-unknown': {
    message: 'Some prices carry a retrieval date, but no reference date was given to judge how old they are.',
    ask: 'Pass a reference date (--as-of) to check freshness.',
  },
  'contradictory-input': {
    message: 'Two stated values contradict each other.',
    ask: 'Correct one of the values named.',
  },
  'rule-input-missing': {
    message: 'A review rule could not be evaluated because an input it needs is not stated: no finding is not evidence that the design passes it.',
    ask: 'State the inputs named so the rule can run.',
  },
  'provider-managed-redundancy': {
    message: 'This is a provider-managed service whose redundancy the document does not state; it is not something the design can deploy differently.',
    ask: 'Confirm the provider\'s availability commitment and state it as sla_percent and redundancy.',
  },
  'cost-estimate-incomplete': {
    message: 'The cost estimate is not complete, so cost checks cover only the part that was priced.',
    ask: 'Resolve the cost gaps listed in FinOps.',
  },
  'load-dependent-unevaluated': {
    message: 'Load-dependent effects (saturation, queueing, retry pressure) were not evaluated because the load is not stated.',
    ask: 'State the current requests per second on at least one entry point (capacity.baseline_rps).',
  },
});

/** One reason entry. Extra fields (subjects, inputs) are kept as given. */
export function reason(code, extra = {}) {
  const known = REASONS[code];
  return { code, message: extra.message ?? known?.message ?? code, ask: extra.ask ?? known?.ask ?? null, ...Object.fromEntries(Object.entries(extra).filter(([key]) => key !== 'message' && key !== 'ask')) };
}

/**
 * An assessment: the completeness record of one calculation.
 * @param {string} status one of STATUSES
 * @param {{ reasons?: object[], missing?: object[], assumptions?: object[], affects?: string[], evidence?: object[] }} parts
 */
export function assessment(status, parts = {}) {
  if (!STATUSES.includes(status)) throw new Error(`unknown status "${status}"`);
  return {
    status,
    reasons: parts.reasons ?? [],
    missing: parts.missing ?? [],
    assumptions: parts.assumptions ?? [],
    affects: parts.affects ?? [],
    ...(parts.evidence ? { evidence: parts.evidence } : {}),
  };
}

/**
 * Combine part statuses into the status of the whole.
 *  - not_applicable parts are ignored (all not_applicable: not_applicable);
 *  - any invalid part makes the whole invalid;
 *  - all complete: complete;
 *  - some complete or partial: partial (a value exists, but not all of it);
 *  - nothing computed: inconclusive if any part is, else unsupported, else unknown.
 */
export function combineStatuses(statuses) {
  const parts = statuses.filter((status) => status !== 'not_applicable');
  if (parts.length === 0) return 'not_applicable';
  if (parts.includes('invalid')) return 'invalid';
  if (parts.every((status) => status === 'complete')) return 'complete';
  if (parts.some((status) => status === 'complete' || status === 'partial')) return 'partial';
  if (parts.includes('inconclusive')) return 'inconclusive';
  if (parts.includes('unsupported')) return 'unsupported';
  return 'unknown';
}

/**
 * The status of a conclusion: essential parts decide whether a conclusion can be drawn at
 * all; supporting parts only make it partial. A missing essential input never yields a
 * complete or partial conclusion.
 */
export function concludeStatus(essential, supporting = []) {
  const needed = essential.filter((status) => status !== 'not_applicable');
  if (needed.includes('invalid') || supporting.includes('invalid')) return 'invalid';
  for (const status of ['unsupported', 'unknown', 'inconclusive']) {
    if (needed.includes(status)) return status === 'unknown' ? 'inconclusive' : status;
  }
  const all = [...needed, ...supporting.filter((status) => status !== 'not_applicable')];
  if (all.length === 0) return 'not_applicable';
  return all.every((status) => status === 'complete') ? 'complete' : 'partial';
}

/** Merge assessments: combined status (or the given one), reasons de-duplicated by code and subject. */
export function mergeAssessments(list, status) {
  const seen = new Set();
  const reasons = [];
  const missing = [];
  const assumptions = [];
  const affects = new Set();
  for (const item of list) {
    if (!item) continue;
    for (const entry of item.reasons) {
      const key = `${entry.code}|${JSON.stringify(entry.subjects ?? [])}`;
      if (!seen.has(key)) { seen.add(key); reasons.push(entry); }
    }
    for (const entry of item.missing) if (!missing.some((m) => m.input === entry.input && m.subject === entry.subject)) missing.push(entry);
    for (const entry of item.assumptions) if (!assumptions.some((a) => a.input === entry.input && a.subject === entry.subject)) assumptions.push(entry);
    for (const field of item.affects) affects.add(field);
  }
  return assessment(status ?? combineStatuses(list.filter(Boolean).map((item) => item.status)), { reasons, missing, assumptions, affects: [...affects] });
}

/**
 * Evidence confidence from the origins of the inputs a result rests on. Separate from
 * completeness: a complete calculation over defaults is still low-confidence.
 * Levels: high when at least 80% of inputs are authored, measured or imported; medium
 * from 40%; otherwise low. No inputs at all: unknown.
 */
export function confidenceOf(origins) {
  const counts = Object.fromEntries(ORIGINS.map((origin) => [origin, 0]));
  for (const origin of origins) counts[origin in counts ? origin : 'unknown'] += 1;
  const total = origins.length;
  // Derived values inherit the origin of what they were derived from, so callers pass the
  // origins of the underlying inputs; a bare "derived" adds no evidence of its own.
  const grounded = counts.authored + counts.measured + counts.imported;
  const share = total ? grounded / total : null;
  const level = share == null ? 'unknown' : share >= 0.8 ? 'high' : share >= 0.4 ? 'medium' : 'low';
  return { level, grounded_share: share == null ? null : Math.round(share * 1000) / 1000, counts, inputs: total };
}

/** Status words for people, used by every renderer. */
export const STATUS_LABELS = Object.freeze({
  complete: 'complete',
  partial: 'partial',
  inconclusive: 'inconclusive',
  unknown: 'unknown',
  unsupported: 'unsupported',
  invalid: 'invalid',
  not_applicable: 'not applicable',
});
