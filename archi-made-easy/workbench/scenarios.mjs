// The built-in architect scenarios, derived deterministically from a model.
// Targets are chosen by highest modelled load, then most inbound traffic edges, then id.
//
// Each scenario names exactly what it fails. Losing one availability zone and losing a
// whole region are different failures and are separate scenarios: a zone-redundant design
// is expected to survive the first and not the second. Each scenario also states its
// readiness before it is run: whether the model has the inputs to draw a conclusion.

import { simulate } from './sim.mjs';
import { checkCalculation } from './requirements.mjs';

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

/**
 * @returns {object[]} the scenarios, each
 *   { id, key, title, applicable, reason?, targets, target_labels, fails, readiness, inputs, analysis? }
 * `fails` says in words exactly what the scenario takes away. `readiness` is
 * { status: 'ready' | 'inconclusive', reasons, missing }: an inconclusive scenario can
 * still be run, and its result says what is missing.
 */
export function buildScenarios(model) {
  const baseline = simulate(model);
  const display = (id) => model.display?.[id] ?? model.nodes.find((n) => n.id === id)?.label ?? id;
  const boundaryLabel = (boundary) => `${boundary.label} (${boundary.scope === 'region' ? 'region' : 'availability zone'}${boundary.basis.scope === 'assumed' ? ', inferred from its label' : ''})`;
  const scenario = (id, key, title, targets, inputs, extra = {}) => {
    if (!(targets.length || extra.always)) return { id, key, title, applicable: false, reason: extra.reason, targets: [], target_labels: [], fails: null, readiness: null, inputs: null };
    const merged = { multiplier: 1, cacheHit: 0, faults: {}, ...inputs };
    const check = checkCalculation('traffic.load', model, { loadScaled: merged.multiplier !== 1 });
    const blocked = merged.multiplier !== 1 && check.status !== 'complete';
    return {
      id, key, title, applicable: true, targets,
      target_labels: extra.target_labels ?? targets.map(display),
      fails: extra.fails,
      readiness: blocked ? { status: 'inconclusive', reasons: check.reasons, missing: check.missing } : { status: 'ready', reasons: [], missing: [] },
      inputs: merged, ...(extra.analysis ? { analysis: extra.analysis } : {}),
    };
  };

  const database = ranked(model, baseline, (n) => n.role === 'stateful-db')[0];
  const largest = (scope) => [...model.boundaries].filter((b) => b.scope === scope)
    .sort((a, b) => (b.members.length - a.members.length) || (a.id < b.id ? -1 : 1))[0];
  const zone = largest('availability-zone');
  const region = largest('region');
  const hasComponents = model.nodes.some((n) => !n.actor);
  const provider = ranked(model, baseline, (n) => n.role === 'external-saas' || n.role === 'ai-model')[0];
  const caches = model.nodes.filter((n) => n.role === 'cache').map((n) => n.id).sort();
  const publicEntry = model.entrypoints.map((id) => model.nodes.find((n) => n.id === id))
    .filter(Boolean).sort((a, b) => (Number(b.security.public_exposed === true) - Number(a.security.public_exposed === true)) || (a.id < b.id ? -1 : 1))[0];

  return [
    scenario('a', 'database-outage', 'Primary database or stateful storage outage', database ? [database.id] : [],
      database ? { faults: { nodes: { [database.id]: 'down' } } } : {},
      { reason: 'No stateful database in this architecture.', fails: database ? `${display(database.id)}: the whole service, not one replica` : null }),
    // One zone. With a zone drawn, that boundary fails. Without one, each component keeps the
    // units its redundancy places in other zones, and single-unit components give a range.
    zone
      ? scenario('b', 'zone-loss', 'Loss of one availability zone', [zone.id], { faults: { boundaries: { [zone.id]: 'down' } } },
        { target_labels: [boundaryLabel(zone)], fails: `${boundaryLabel(zone)}: every component unit inside it` })
      : scenario('b', 'zone-loss', 'Loss of one availability zone', [], { faults: { zone: 'down' } },
        { always: hasComponents, reason: 'No component in this architecture.', target_labels: ['One availability zone (none is drawn)'],
          fails: 'One availability zone, not the region. No zone is drawn, so each component loses one unit if its redundancy spans zones; a component with a single unit is lost only if it runs in that zone, which gives a best and a worst case' }),
    scenario('c', 'flash-crowd', '10x flash crowd', [], { multiplier: 10 }, { always: true, target_labels: ['All entry traffic'], fails: 'Nothing fails: entry load is multiplied by 10' }),
    scenario('d', 'provider-brownout', 'Third-party API or model provider high-latency brownout', provider ? [provider.id] : [],
      provider ? { faults: { nodes: { [provider.id]: 'degraded' } } } : {},
      { reason: 'No external service or model provider in this architecture.', fails: provider ? `${display(provider.id)}: slow, not down` : null }),
    scenario('e', 'cache-stampede', 'Cache stampede or cold cache', caches,
      caches.length ? { cacheHit: 0, faults: { nodes: Object.fromEntries(caches.map((id) => [id, 'down'])) } } : {},
      { reason: 'No cache in this architecture.', fails: caches.length ? `${caches.map(display).join(', ')}: down, with no cache hits` : null }),
    scenario('f', 'edge-breach', 'Compromised edge or zero-trust boundary breach', publicEntry ? [publicEntry.id] : [],
      {}, { reason: 'No entry component.', fails: publicEntry ? `Nothing fails: reach from ${display(publicEntry.id)} is traced` : null, analysis: publicEntry ? { kind: 'breach-reach', ...breachReach(model, publicEntry.id) } : null }),
    scenario('g', 'region-blackout', 'Region blackout', region ? [region.id] : [],
      region ? { faults: { boundaries: { [region.id]: 'down' } } } : {},
      { reason: 'No boundary is marked as a region.', target_labels: region ? [boundaryLabel(region)] : [], fails: region ? `${boundaryLabel(region)}: the whole region, every zone in it` : null }),
  ];
}

/** Run one scenario and return its simulation result (plus breach analysis for scenario f). */
export function runScenario(model, scenario) {
  if (!scenario.applicable) return { scenario: scenario.id, applicable: false, status: 'not_applicable', reason: scenario.reason };
  const result = simulate(model, scenario.inputs);
  return { scenario: scenario.id, applicable: true, status: result.status, title: scenario.title, targets: scenario.targets, target_labels: scenario.target_labels, fails: scenario.fails, ...(scenario.analysis ? { analysis: scenario.analysis } : {}), result };
}
