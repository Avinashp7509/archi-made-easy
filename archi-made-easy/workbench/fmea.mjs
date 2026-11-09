// Failure Mode and Effects Analysis: one row per component, built by failing that
// component alone in the model and reading what the simulation reports.
//
// Occurrence and detection ratings are not produced: they depend on operating history
// the model does not have. Rows carry a severity class derived from the modelled effect.

import { simulate } from './sim.mjs';

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

function severityOf(result, nodeCount, selfId) {
  const { ingress_share: share, nodes } = result.kpis.blast_radius;
  const others = nodes.filter((id) => id !== selfId);
  if (share != null && share >= 0.5) return 'critical';
  if ((share != null && share > 0) || others.some((id) => result.nodes[id].state === 'failing')) return 'high';
  if (others.length > 0) return 'medium';
  return nodeCount > 0 ? 'low' : 'low';
}

function controls(model, node) {
  const found = [];
  const inbound = model.edges.filter((edge) => edge.to === node.id);
  if (node.redundancy !== 'single-instance') found.push(`Redundancy: ${node.redundancy}`);
  if (inbound.some((edge) => edge.resilience.circuit_breaker_enabled)) found.push('Circuit breaker on a caller');
  if (inbound.some((edge) => edge.resilience.fallback_edge_id != null)) found.push('Fallback route from a caller');
  if (inbound.length && inbound.every((edge) => ['async-queue', 'async-pubsub', 'event-stream'].includes(edge.call_semantics))) found.push('Reached only asynchronously');
  if (node.dr.backup_strategy) found.push(`Backups: ${node.dr.backup_strategy}`);
  return found;
}

function recommendation(model, node, result) {
  const callers = model.edges.filter((edge) => edge.to === node.id && edge.call_semantics === 'sync-blocking'
    && !edge.resilience.circuit_breaker_enabled && edge.resilience.fallback_edge_id == null);
  const advice = [];
  if (node.redundancy === 'single-instance') advice.push('Run more than one instance across failure domains');
  if (callers.length && result.kpis.blast_radius.nodes.length > 1) advice.push(`Add a circuit breaker or fallback on ${callers.map((edge) => edge.id).join(', ')}`);
  if (['stateful-db', 'object-store'].includes(node.role) && (node.dr.rto_sec == null || node.dr.rpo_sec == null)) advice.push('Define recovery time and recovery point objectives');
  return advice;
}

/** @returns {{ rows: object[], basis: object }} rows sorted by severity, then component id */
export function buildFmea(model, { multiplier = 1, cacheHit = 0 } = {}) {
  // Actors (users, client systems) are sources of traffic, not components that can fail.
  const rows = model.nodes.filter((node) => !node.actor).map((node) => {
    const result = simulate(model, { multiplier, cacheHit, faults: { nodes: { [node.id]: 'down' } } });
    const self = result.nodes[node.id];
    const affected = result.kpis.blast_radius.nodes.filter((id) => id !== node.id);
    return {
      component: node.id,
      label: node.label,
      role: node.role,
      failure_mode: 'Component unavailable',
      local_effect: self.failover ? 'Fails over to the disaster-recovery replica' : 'Stops serving',
      affected_components: affected,
      failing_components: affected.filter((id) => result.nodes[id].state === 'failing'),
      ingress_share_lost: result.kpis.blast_radius.ingress_share,
      severity: severityOf(result, model.nodes.length, node.id),
      recovery: { rto_sec: node.dr.rto_sec, rpo_sec: node.dr.rpo_sec, failover: Boolean(self.failover), writes_at_risk: self.failover?.writes_at_risk ?? null },
      existing_controls: controls(model, node),
      recommended_actions: recommendation(model, node, result),
      events: result.events.map((event) => event.type).filter((type, index, all) => all.indexOf(type) === index),
    };
  }).sort((a, b) => (SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]) || (a.component < b.component ? -1 : 1));
  return {
    kind: 'analytical-model',
    rows,
    note: 'Each row fails one component alone. Severity reflects the modelled effect on traffic and other components; occurrence and detection are not rated.',
  };
}
