// The six built-in architect scenarios, derived deterministically from a model.
// Targets are chosen by highest modelled load, then most inbound traffic edges, then id.

import { simulate } from './sim.mjs';

const TRAFFIC_EXCLUDED = new Set(['replication-sync', 'replication-async', 'heartbeat']);

function ranked(model, baseline, predicate) {
  // Standby (failover) routes carry no traffic in normal operation, so they do not make a target "busy".
  const inbound = (id) => model.edges.filter((edge) => edge.to === id && !TRAFFIC_EXCLUDED.has(edge.call_semantics) && edge.call_semantics !== 'failover-route').length;
  return model.nodes.filter(predicate).map((node) => ({ id: node.id, load: baseline.nodes[node.id].load_rps ?? -1, inbound: inbound(node.id) }))
    .sort((a, b) => (b.load - a.load) || (b.inbound - a.inbound) || (a.id < b.id ? -1 : 1));
}

/**
 * Nodes an attacker reaches from `start` by following traffic edges, stopping at any
 * component that declares an authentication method.
 */
export function breachReach(model, start) {
  const nodeById = new Map(model.nodes.map((node) => [node.id, node]));
  const exposed = new Set([start]);
  const stopped = new Set();
  const queue = [start];
  while (queue.length) {
    const id = queue.shift();
    for (const edge of model.edges.filter((e) => e.from === id && !TRAFFIC_EXCLUDED.has(e.call_semantics)).sort((a, b) => (a.id < b.id ? -1 : 1))) {
      const target = nodeById.get(edge.to);
      if (!target || exposed.has(target.id)) continue;
      const auth = target.security.auth_method;
      if (auth && auth !== 'none') { stopped.add(target.id); continue; }
      exposed.add(target.id);
      queue.push(target.id);
    }
  }
  exposed.delete(start);
  const zones = new Set([...exposed].map((id) => nodeById.get(id).security.trust_zone).filter(Boolean));
  return {
    start,
    reachable_without_authentication: [...exposed].sort(),
    stopped_by_authentication: [...stopped].filter((id) => !exposed.has(id)).sort(),
    trust_zones_reached: [...zones].sort(),
    note: 'Structural reachability over declared relationships; components with no declared auth_method are treated as unauthenticated.',
  };
}

/** @returns {object[]} six scenarios, each { id, key, title, applicable, reason?, targets, inputs, analysis? } */
export function buildScenarios(model) {
  const baseline = simulate(model);
  const scenario = (id, key, title, targets, inputs, extra = {}) => (targets.length || extra.always
    ? { id, key, title, applicable: true, targets, inputs: { multiplier: 1, cacheHit: 0, faults: {}, ...inputs }, ...(extra.analysis ? { analysis: extra.analysis } : {}) }
    : { id, key, title, applicable: false, reason: extra.reason, targets: [], inputs: null });

  const database = ranked(model, baseline, (n) => n.role === 'stateful-db')[0];
  const zone = [...model.boundaries].filter((b) => b.scope === 'region' || b.scope === 'availability-zone')
    .sort((a, b) => (b.members.length - a.members.length) || (a.id < b.id ? -1 : 1))[0];
  const provider = ranked(model, baseline, (n) => n.role === 'external-saas' || n.role === 'ai-model')[0];
  const caches = model.nodes.filter((n) => n.role === 'cache').map((n) => n.id).sort();
  const publicEntry = model.entrypoints.map((id) => model.nodes.find((n) => n.id === id))
    .filter(Boolean).sort((a, b) => (Number(b.security.public_exposed === true) - Number(a.security.public_exposed === true)) || (a.id < b.id ? -1 : 1))[0];

  return [
    scenario('a', 'database-outage', 'Primary database or stateful storage outage', database ? [database.id] : [],
      database ? { faults: { nodes: { [database.id]: 'down' } } } : {}, { reason: 'No stateful database in this architecture.' }),
    scenario('b', 'zone-blackout', 'Availability zone or region blackout', zone ? [zone.id] : [],
      zone ? { faults: { boundaries: { [zone.id]: 'down' } } } : {}, { reason: 'No boundary is marked as a region or availability zone.' }),
    scenario('c', 'flash-crowd', '10x flash crowd', [], { multiplier: 10 }, { always: true }),
    scenario('d', 'provider-brownout', 'Third-party API or model provider high-latency brownout', provider ? [provider.id] : [],
      provider ? { faults: { nodes: { [provider.id]: 'degraded' } } } : {}, { reason: 'No external service or model provider in this architecture.' }),
    scenario('e', 'cache-stampede', 'Cache stampede or cold cache', caches,
      caches.length ? { cacheHit: 0, faults: { nodes: Object.fromEntries(caches.map((id) => [id, 'down'])) } } : {}, { reason: 'No cache in this architecture.' }),
    scenario('f', 'edge-breach', 'Compromised edge or zero-trust boundary breach', publicEntry ? [publicEntry.id] : [],
      {}, { reason: 'No entry component.', analysis: publicEntry ? { kind: 'breach-reach', ...breachReach(model, publicEntry.id) } : null }),
  ];
}

/** Run one scenario and return its simulation result (plus breach analysis for scenario f). */
export function runScenario(model, scenario) {
  if (!scenario.applicable) return { scenario: scenario.id, applicable: false, reason: scenario.reason };
  const result = simulate(model, scenario.inputs);
  return { scenario: scenario.id, applicable: true, title: scenario.title, targets: scenario.targets, ...(scenario.analysis ? { analysis: scenario.analysis } : {}), result };
}
