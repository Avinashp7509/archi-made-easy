// What-if edits to a design: apply a set of model edits ("patches"), preview what they
// change, and propose recovery options after a simulated failure.
//
// A patch is { target: 'component' | 'connection', id, operational, summary }. It changes
// operational fields only, never the structure of the diagram. Nothing here invents a
// figure: an option that would need a number only the owner can give (a recovery
// objective, a price) is listed without a patch and marked as not previewable.

import { buildModel } from './model.mjs';
import { simulate } from './sim.mjs';
import { estimateCost } from './cost.mjs';
import { review } from './review.mjs';

const round = (value, digits = 5) => (typeof value === 'number' && Number.isFinite(value) ? Math.round(value * 10 ** digits) / 10 ** digits : value);

function merge(base = {}, patch = {}) {
  const out = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    out[key] = value && typeof value === 'object' && !Array.isArray(value) ? merge(base[key], value) : value;
  }
  return out;
}

/**
 * Apply patches to a document and return a new document. Connections are addressed by
 * their authored id, or by `rel-<index>` when they have none (the id the model gives them).
 */
export function applyPatches(document, patches) {
  const components = new Map(); const connections = new Map();
  for (const patch of patches) {
    const table = patch.target === 'component' ? components : patch.target === 'connection' ? connections : null;
    if (!table) throw new Error(`unknown patch target "${patch.target}"`);
    table.set(patch.id, merge(table.get(patch.id), patch.operational));
  }
  const connectionId = (connection, index) => connection.id ?? `rel-${index}`;
  const knownComponents = new Set(document.components.map((c) => c.id));
  const knownConnections = new Set((document.connections || []).map(connectionId));
  for (const id of components.keys()) if (!knownComponents.has(id)) throw new Error(`patch names unknown component "${id}"`);
  for (const id of connections.keys()) if (!knownConnections.has(id)) throw new Error(`patch names unknown connection "${id}"`);
  return {
    ...document,
    components: document.components.map((c) => (components.has(c.id) ? { ...c, operational: merge(c.operational, components.get(c.id)) } : c)),
    connections: (document.connections || []).map((c, index) => (connections.has(connectionId(c, index)) ? { ...c, operational: merge(c.operational, connections.get(connectionId(c, index))) } : c)),
  };
}

const METRICS = [
  // key, label, unit, direction: +1 = higher is better, -1 = lower is better
  ['composite_sla_percent', 'Requests answered', '%', 1],
  ['critical_path_p99_ms', 'Critical-path P99', 'ms', -1],
  ['max_sustainable_rps', 'Max sustainable load', 'requests/s', 1],
  ['affected_components', 'Components affected', '', -1],
  ['ingress_lost_percent', 'Entry traffic lost', '%', -1],
  ['single_points_of_failure', 'Single points of failure', '', -1],
  ['monthly_cost_usd', 'Estimated monthly cost', 'USD', -1],
  ['review_score', 'Review score', '/100', 1],
];

/** The comparable figures of a model under given conditions (faults, load, cache). */
export function figures(model, inputs = {}) {
  const result = simulate(model, inputs);
  const cost = estimateCost(model, result);
  const reviewed = review(model, { multiplier: inputs.multiplier ?? 1, cacheHit: inputs.cacheHit ?? 0 });
  const share = result.kpis.blast_radius.ingress_share;
  return {
    composite_sla_percent: result.kpis.composite_sla_percent,
    critical_path_p99_ms: result.kpis.critical_path?.p99_ms ?? null,
    max_sustainable_rps: result.kpis.max_sustainable_rps,
    affected_components: result.kpis.blast_radius.nodes.length,
    ingress_lost_percent: share == null ? null : round(share * 100, 2),
    single_points_of_failure: result.kpis.active_spofs.length,
    monthly_cost_usd: cost.monthly_total_usd,
    review_score: reviewed.score,
    findings: reviewed.findings.map(({ id, title, severity }) => ({ id, title, severity })),
  };
}

/** Compare two sets of figures: one row per metric, with a verdict in words. */
export function compareFigures(before, after) {
  return METRICS.map(([key, label, unit, direction]) => {
    const a = before[key]; const b = after[key];
    const change = a == null || b == null ? null : round(b - a);
    const verdict = change == null ? 'not comparable' : change === 0 ? 'unchanged' : (change > 0) === (direction > 0) ? 'better' : 'worse';
    return { metric: key, label, unit, before: a, after: b, change, verdict };
  });
}

/**
 * Preview a change: the same conditions (faults, load, cache) on the design as declared
 * and on the design with the patches applied.
 */
export function previewPatches(document, patches, inputs = {}) {
  const before = figures(buildModel(document).model, inputs);
  const after = figures(buildModel(applyPatches(document, patches)).model, inputs);
  const beforeIds = new Set(before.findings.map((f) => f.id)); const afterIds = new Set(after.findings.map((f) => f.id));
  return {
    kind: 'analytical-model',
    patches: patches.map(({ target, id, operational, summary }) => ({ target, id, operational, summary })),
    before, after,
    metrics: compareFigures(before, after),
    findings: { closed: before.findings.filter((f) => !afterIds.has(f.id)), opened: after.findings.filter((f) => !beforeIds.has(f.id)) },
    note: 'Both columns are analytical models under the same conditions. The change is applied to the model only, not to the document.',
  };
}

/**
 * Recovery options after a simulation: changes that would reduce the impact of the same
 * failure. They are derived from the result, in a fixed order:
 *
 *   1. redundancy, for a component lost to a zone or region failure it does not survive;
 *   2. a standby, for a component that was failed directly (the model treats a direct
 *      "down" as loss of the whole component, which redundancy inside it does not cover);
 *   3. containment, with a circuit breaker on each blocking call that carries the failure;
 *   4. capacity, for a component that saturates (text only: the figures must be yours).
 *
 * Whether an option actually helps is decided by previewing it: see recoveryPlan().
 */
export function recoveryOptions(model, result) {
  const options = [];
  const injected = result.inputs?.faults?.nodes ?? {};
  const downBoundaries = model.boundaries.filter((b) => result.inputs?.faults?.boundaries?.[b.id] === 'down');
  const failedAtSource = model.nodes.filter((node) => {
    const r = result.nodes[node.id];
    return r.state === 'failing' && (r.fault === 'down' || r.fault === 'partitioned') && !r.failover;
  });

  for (const boundary of downBoundaries) {
    const lost = failedAtSource.filter((node) => !injected[node.id] && boundary.members.includes(node.id));
    if (!lost.length) continue;
    const region = boundary.scope === 'region';
    const redundancy = region ? 'active-active-multi-region' : 'multi-az';
    const where = region ? 'in a second region as well' : 'across at least two zones';
    const patches = lost.map((node) => ({ target: 'component', id: node.id, operational: { redundancy }, summary: `Run ${node.label} ${where}` }));
    options.push({
      id: `redundancy:${boundary.id}`, kind: 'redundancy', previewable: true, components: lost.map((node) => node.id), connections: [],
      title: lost.length === 1 ? patches[0].summary : `Run the ${lost.length} components lost with ${boundary.label} ${where}`,
      rationale: `${lost.map((node) => node.label).join(', ')} ${lost.length === 1 ? 'runs' : 'run'} only inside ${boundary.label}. With units outside it, losing ${boundary.label} leaves the others serving at reduced capacity.`,
      patches,
    });
  }

  for (const node of failedAtSource) {
    if (!injected[node.id] || node.actor || node.redundancy === 'active-passive-dr' || result.nodes[node.id].fault !== 'down') continue;
    const summary = `Add a standby for ${node.label}`;
    options.push({
      id: `standby:${node.id}`, kind: 'standby', previewable: true, components: [node.id], connections: [], title: summary,
      rationale: `A standby in another failure domain takes over when ${node.label} is lost. Service returns after the recovery time (RTO) and loses at most the recovery point (RPO) of writes. This document states neither for ${node.label}${node.dr.rto_sec == null || node.dr.rpo_sec == null ? ', so the preview shows the takeover with those two figures not set: they are yours to decide and test' : ''}.`,
      patches: [{ target: 'component', id: node.id, operational: { redundancy: 'active-passive-dr' }, summary }],
    });
  }

  const cascading = model.edges
    .filter((edge) => edge.call_semantics === 'sync-blocking' && !edge.resilience.circuit_breaker_enabled && edge.resilience.fallback_edge_id == null
      && result.nodes[edge.to]?.state === 'failing' && result.nodes[edge.from]?.state === 'failing' && result.edges[edge.id]?.state !== 'cut')
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  if (cascading.length) {
    options.push({
      id: 'circuit-breakers', kind: 'containment', previewable: true,
      components: [...new Set(cascading.map((edge) => edge.from))].sort(), connections: cascading.map((edge) => edge.id),
      title: cascading.length === 1 ? `Add a circuit breaker on ${cascading[0].id}` : `Add circuit breakers on the ${cascading.length} blocking calls that carry the failure`,
      rationale: 'Each caller blocks on a failing dependency and fails with it. A circuit breaker makes the caller fail fast and stay up without that dependency, so the failure stops spreading. Requests are answered, but whatever needed the failed component is missing from the answer.',
      patches: cascading.map((edge) => ({ target: 'connection', id: edge.id, operational: { resilience: { circuit_breaker_enabled: true } }, summary: `Add a circuit breaker on ${edge.id}` })),
    });
  }

  for (const node of model.nodes.filter((n) => result.nodes[n.id].saturated && result.nodes[n.id].state !== 'failing')) {
    options.push({
      id: `capacity:${node.id}`, kind: 'capacity', previewable: false, components: [node.id], connections: [], patches: [],
      title: `Raise the capacity of ${node.label}`,
      rationale: `${node.label} is at or above its declared capacity under these conditions. Raise its per-instance capacity or autoscaling ceiling (capacity.max_rps, capacity.autoscale_max) using figures from a load test, or reduce the load that reaches it with caching.`,
    });
  }
  return options;
}

/**
 * Recovery options for a document under given conditions, each previewed under the same
 * conditions. A previewable option is kept only when it improves a figure that describes
 * this failure (requests answered, components affected, traffic lost, load, latency), so
 * every option listed either shows its modelled effect or says why it cannot be modelled.
 */
const RECOVERY_METRICS = new Set(['composite_sla_percent', 'critical_path_p99_ms', 'max_sustainable_rps', 'affected_components', 'ingress_lost_percent']);
export function recoveryPlan(document, inputs = {}) {
  const model = buildModel(document).model;
  const result = simulate(model, inputs);
  const options = recoveryOptions(model, result)
    .map((option) => (option.previewable ? { ...option, preview: previewPatches(document, option.patches, inputs) } : option))
    .filter((option) => !option.previewable || option.preview.metrics.some((metric) => RECOVERY_METRICS.has(metric.metric) && metric.verdict === 'better'));
  return {
    kind: 'analytical-model',
    inputs: result.inputs,
    affected_components: result.kpis.blast_radius.nodes.length,
    options,
    note: 'Options are changes to the model, previewed under the same failure. They are not applied to the document and are not a substitute for testing the change.',
  };
}
