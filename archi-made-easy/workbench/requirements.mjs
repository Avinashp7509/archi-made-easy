// Declarative requirements of every calculation the workbench performs.
//
// Each entry states, in one place, what a calculation needs, which defaults it may use,
// its units, when it applies, how it behaves when an input is missing, and what its output
// means. The engines (sim, cost, review) read this table to decide the status of their
// results; renderers read it to explain a figure. No requirement lives in a renderer.
//
// An input key names a check in INPUTS. `when_missing` is the status the calculation takes
// when a required input is absent; `essential_when` lists the run conditions under which
// the calculation decides the conclusion (otherwise it only supports it).

import { assessment, reason } from './evidence.mjs';

/** Units used by workbench outputs, with the physical dimension each measures. */
export const UNITS = Object.freeze({
  'requests/s': { dimension: 'rate', description: 'requests per second' },
  'messages/s': { dimension: 'rate', description: 'messages per second' },
  ms: { dimension: 'time', description: 'milliseconds' },
  s: { dimension: 'time', description: 'seconds' },
  percent: { dimension: 'share', description: 'percent, 0 to 100' },
  ratio: { dimension: 'share', description: 'fraction, 0 to 1 (utilisation may exceed 1)' },
  count: { dimension: 'count', description: 'a whole number' },
  'USD/month': { dimension: 'money-rate', description: 'US dollars per month' },
  'GB/month': { dimension: 'volume-rate', description: 'gigabytes per month' },
});

/** Inputs a calculation can require, each with a check over the model and run conditions. */
export const INPUTS = Object.freeze({
  'topology.entrypoints': {
    unit: null, subject: 'the design',
    description: 'at least one entry component where requests arrive',
    present: (model) => model.entrypoints.length > 0,
    reasonCode: 'no-entry-point',
  },
  'entry.capacity.baseline_rps': {
    unit: 'requests/s', subject: 'an entry component',
    description: 'normal offered load on at least one entry component',
    present: (model) => model.entrypoints.some((id) => model.nodes.find((n) => n.id === id)?.capacity.baseline_rps != null),
    reasonCode: 'missing-baseline-load',
  },
});

/**
 * The calculations. `requires` must all be present; `defaults` lists inputs the
 * calculation may take from role defaults (the result then records them as assumptions).
 */
export const CALCULATIONS = Object.freeze({
  'structure.propagation': {
    title: 'Failure propagation over declared connections',
    requires: [], optional: ['edge.call_semantics', 'edge.resilience.circuit_breaker_enabled', 'edge.resilience.fallback_edge_id', 'node.redundancy'],
    defaults: ['edge.call_semantics (from the target role)', 'node.redundancy (from the role)'],
    units: { state: null },
    applies: 'always',
    when_missing: 'unknown',
    uncertainty: 'Deterministic over declared connections; a connection that is not drawn is not modelled.',
    semantics: 'Which components fail or degrade, and through which connections, when the injected faults hold.',
    outputs: ['nodes.*.state', 'edges.*.state', 'kpis.blast_radius.nodes', 'events'],
  },
  'availability.composite': {
    title: 'Composite availability (requests answered)',
    requires: ['topology.entrypoints'], optional: ['node.sla_percent', 'node.redundancy'],
    defaults: ['node.sla_percent', 'node.redundancy'],
    // Overload turns into errors, which this model does not derive: under a change in load
    // with no baseline, availability is not repeated from the healthy state.
    conditional: [{ when: 'load-scaled', requires: ['entry.capacity.baseline_rps'], status: 'inconclusive' }],
    units: { composite_sla_percent: 'percent' },
    applies: 'always',
    when_missing: 'unknown',
    uncertainty: 'Assumes independent failures; above 99.99% this assumption dominates and the figure is an upper bound.',
    semantics: 'Share of requests that receive any answer, including degraded answers. It is not the share of successful business operations.',
    outputs: ['kpis.composite_sla_percent'],
  },
  'latency.critical-path': {
    title: 'Critical-path latency',
    requires: ['topology.entrypoints'], optional: ['node.latency.p50_ms', 'node.latency.p99_ms', 'edge.resilience.timeout_ms'],
    defaults: ['node.latency.p50_ms', 'node.latency.p99_ms'],
    // Under a load change, queueing depends on load: without a baseline the figure cannot move.
    conditional: [{ when: 'load-scaled', requires: ['entry.capacity.baseline_rps'], status: 'inconclusive' }],
    units: { p50_ms: 'ms', p95_ms: 'ms', p99_ms: 'ms' },
    applies: 'always',
    when_missing: 'unknown',
    uncertainty: 'Lognormal hops summed with the Fenton-Wilkinson method; queueing from M/M/1 utilisation when load is known.',
    semantics: 'Latency percentiles of the slowest synchronous path from an entry point.',
    outputs: ['kpis.critical_path'],
  },
  'traffic.load': {
    title: 'Offered load, utilisation, saturation and queue lag',
    requires: ['entry.capacity.baseline_rps'], optional: ['edge.traffic.request_multiplier', 'node.capacity.max_rps', 'node.capacity.autoscale_max'],
    defaults: ['edge.traffic.request_multiplier = 1', 'node.capacity.max_rps', 'node.capacity.autoscale_max = autoscale_min'],
    units: { load_rps: 'requests/s', utilisation: 'ratio', queue_lag_rps: 'messages/s', ingress_rps: 'requests/s', headroom: 'ratio' },
    applies: 'always',
    // Essential to any conclusion about a change in load: a surge with no baseline is inconclusive.
    essential_when: ['load-scaled'],
    conditional: [{ when: 'load-scaled', requires: ['entry.capacity.baseline_rps'], status: 'inconclusive' }],
    // With no change in load, missing load only means the load figures are not reported.
    when_missing: 'unknown',
    uncertainty: 'Linear steady state; retries amplify load through a fixed-point iteration.',
    semantics: 'Requests per second offered to each component and its share of capacity.',
    outputs: ['nodes.*.load_rps', 'nodes.*.served_rps', 'nodes.*.utilisation', 'nodes.*.saturated', 'nodes.*.queue_lag_rps', 'edges.*.flow_rps', 'kpis.ingress_rps', 'kpis.headroom'],
  },
  'capacity.ceiling': {
    title: 'Capacity ceiling of the request path',
    requires: ['topology.entrypoints'], optional: ['node.capacity.max_rps', 'node.capacity.autoscale_max'],
    defaults: ['node.capacity.max_rps', 'node.capacity.autoscale_max'],
    units: { max_sustainable_rps: 'requests/s', async_drain_ceiling_rps: 'requests/s' },
    applies: 'always',
    when_missing: 'unknown',
    uncertainty: 'Linear in entry load; the ceiling is only as good as the capacities it is computed from.',
    semantics: 'The entry load at which the first synchronous component reaches its capacity. A ceiling, not evidence that any given load is safe. Asynchronous consumers are reported separately: they build a backlog, they do not refuse requests.',
    outputs: ['kpis.max_sustainable_rps', 'kpis.limiting_node', 'kpis.async_drain_ceiling_rps'],
  },
  'traffic.ingress-loss': {
    title: 'Entry traffic lost',
    requires: ['topology.entrypoints'], optional: ['entry.capacity.baseline_rps'],
    defaults: [],
    // When load changes, loss depends on saturation: without load the share is not known.
    conditional: [{ when: 'load-scaled', requires: ['entry.capacity.baseline_rps'], status: 'inconclusive' }],
    units: { ingress_share: 'ratio' },
    applies: 'always',
    when_missing: 'unknown',
    uncertainty: 'Counts traffic arriving at entry components that fail. Requests shed by saturated components downstream are not counted, so with saturation the figure is a lower bound.',
    semantics: 'Share of entry traffic that is not answered because its entry component is failing.',
    outputs: ['kpis.blast_radius.ingress_share'],
  },
  'cost.monthly': {
    title: 'Monthly cost estimate',
    requires: [], optional: ['node.finops.meters', 'node.finops.usage', 'entry.capacity.baseline_rps'],
    defaults: [],
    units: { monthly_total_usd: 'USD/month', subtotal_usd: 'USD/month' },
    applies: 'when any component or connection carries a price',
    when_missing: 'unknown',
    uncertainty: 'Arithmetic over the stated meters only. Taxes, support, credits, negotiated discounts and currency conversion are outside the model.',
    semantics: 'A total is given only when every priceable component is priced on every dimension its pricing model bills and every quantity is known. Otherwise a subtotal is given, labelled partial; it is a lower bound.',
    outputs: ['cost.monthly_total_usd', 'cost.subtotal_usd'],
  },
});

/**
 * Check one calculation's requirements under given run conditions.
 * @param {string} id key of CALCULATIONS
 * @param {object} model from buildModel()
 * @param {{ loadScaled?: boolean }} conditions
 * @returns {object} an assessment (complete when every requirement is met)
 */
export function checkCalculation(id, model, conditions = {}) {
  const calculation = CALCULATIONS[id];
  if (!calculation) throw new Error(`unknown calculation "${id}"`);
  const required = [...calculation.requires];
  let status = calculation.when_missing;
  for (const rule of calculation.conditional ?? []) {
    if (rule.when === 'load-scaled' && conditions.loadScaled) required.push(...rule.requires);
  }
  const missing = [];
  const reasons = [];
  for (const key of new Set(required)) {
    const input = INPUTS[key];
    if (input.present(model)) continue;
    missing.push({ input: key, unit: input.unit, subject: input.subject, description: input.description });
    if (!reasons.some((r) => r.code === input.reasonCode)) reasons.push(reason(input.reasonCode, { affects: calculation.outputs }));
    const conditional = (calculation.conditional ?? []).find((rule) => rule.when === 'load-scaled' && conditions.loadScaled && rule.requires.includes(key));
    if (conditional) status = conditional.status;
  }
  if (missing.length === 0) return assessment('complete', { affects: calculation.outputs });
  return assessment(status, { reasons, missing, affects: calculation.outputs });
}

/** Whether a calculation decides the conclusion of a run under the given conditions. */
export function isEssential(id, conditions = {}) {
  const calculation = CALCULATIONS[id];
  return (calculation.essential_when ?? []).some((when) => when === 'load-scaled' && conditions.loadScaled);
}
