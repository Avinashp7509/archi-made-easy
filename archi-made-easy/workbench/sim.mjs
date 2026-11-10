// Deterministic architecture simulation: fault propagation, traffic, saturation, retry
// amplification, failover, composite availability and critical-path latency.
//
// This is an analytical steady-state model, not a measurement. It is linear in load,
// treats failures as independent, and uses whatever values the model carries, authored
// or assumed. Every result therefore states how many of its inputs were assumed.
// No randomness, no clock, no I/O: the same model and inputs always give the same output.

// "No limit". Spelled this way because a rendered page inlines this module, and the
// artifact checks reject any page that contains the bare non-finite number names.
const UNBOUNDED = Number.POSITIVE_INFINITY;
// Above this, the composite figure is dominated by the assumption that components fail
// independently, which real systems do not: the result carries a note saying so.
const INDEPENDENCE_NOTE_FROM = 0.9999;
export const INDEPENDENCE_NOTE = 'Availability this high depends on the assumption that components fail independently. Shared software, configuration and provider-wide incidents are not modelled and usually set the real limit.';

export const FAULT_STATES = Object.freeze(['healthy', 'degraded', 'brownout', 'down', 'partitioned', 'surge']);
export const SIM_SCHEMA_VERSION = 1;

const SYNC = 'sync-blocking';
const ASYNC = new Set(['async-queue', 'async-pubsub', 'event-stream']);
const NON_TRAFFIC = new Set(['replication-sync', 'replication-async', 'heartbeat']);
const STATEFUL = new Set(['stateful-db', 'object-store']);
const INLINE_CACHE = new Set(['cache', 'cdn']);
const Z = { p50: 0, p95: 1.6448536269514722, p99: 2.3263478740408408 };
const SURGE_FACTOR = 20;
const DEGRADED_LATENCY_FACTOR = 3;
const BROWNOUT_FAILURE = 0.5;
const MAX_QUEUE_FACTOR = 20;
const FAILOVER_SUCCESS = 0.95;
const RANK = { ok: 0, degraded: 1, failing: 2 };

const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const round = (value, digits = 3) => (typeof value === 'number' && Number.isFinite(value) ? Math.round(value * 10 ** digits) / 10 ** digits : value);

function redundantUnits(node) {
  if (node.redundancy === 'multi-az' || node.redundancy === 'active-active-multi-region') {
    return node.capacity.autoscale_min >= 2 ? node.capacity.autoscale_min : 2;
  }
  return 1;
}

/** Availability of a node from its unit availability and redundancy (fraction 0..1). */
export function nodeAvailability(node, unitsLost = 0) {
  if (node.actor && node.sla_percent == null) return 1;
  const a = Math.min(1, Math.max(0, (node.sla_percent ?? 0) / 100));
  if (node.redundancy === 'active-passive-dr') return 1 - (1 - a) * (1 - FAILOVER_SUCCESS * a);
  const units = Math.max(0, redundantUnits(node) - unitsLost);
  if (units === 0) return 0;
  return 1 - (1 - a) ** units;
}

/** Sum independent lognormal hops (Fenton-Wilkinson) and read a percentile from the fit. */
export function pathPercentiles(hops) {
  let meanAll = 0; let varAll = 0; let meanWeighted = 0; let varWeighted = 0; let constant = 0;
  for (const hop of hops) {
    if (hop.constant != null) { constant += hop.constant; continue; }
    const p50 = Math.max(hop.p50, 1e-9);
    const p99 = Math.max(hop.p99, p50);
    const mu = Math.log(p50);
    const sigma = (Math.log(p99) - mu) / Z.p99;
    const mean = Math.exp(mu + sigma * sigma / 2);
    const variance = (Math.exp(sigma * sigma) - 1) * Math.exp(2 * mu + sigma * sigma);
    meanAll += mean; varAll += variance;
    const weight = hop.weight ?? 1;
    meanWeighted += weight * mean; varWeighted += weight * variance;
  }
  const read = (mean, variance, z) => {
    if (mean <= 0) return constant;
    const sigma2 = Math.log(1 + variance / (mean * mean));
    return constant + Math.exp(Math.log(mean) - sigma2 / 2 + z * Math.sqrt(sigma2));
  };
  // The tail is the cache-miss path: P99 ignores hit weighting; P50 and P95 use it.
  return { p50_ms: read(meanWeighted, varWeighted, Z.p50), p95_ms: read(meanWeighted, varWeighted, Z.p95), p99_ms: read(meanAll, varAll, Z.p99) };
}

function normaliseFaults(faults = {}) {
  const check = (table = {}) => {
    for (const state of Object.values(table)) if (!FAULT_STATES.includes(state)) throw new Error(`unknown fault state "${state}"`);
    return table;
  };
  return { nodes: check(faults.nodes), edges: check(faults.edges), boundaries: check(faults.boundaries) };
}

function survivesBoundary(node, boundary) {
  if (boundary.scope === 'availability-zone') return node.redundancy === 'multi-az' || node.redundancy === 'active-active-multi-region';
  if (boundary.scope === 'region') return node.redundancy === 'active-active-multi-region';
  return false;
}

/**
 * Run the model.
 * @param {object} model from buildModel()
 * @param {{ multiplier?: number, cacheHit?: number, faults?: object }} inputs
 */
export function simulate(model, { multiplier = 1, cacheHit = 0, faults: rawFaults } = {}) {
  if (!(multiplier > 0)) throw new Error('multiplier must be greater than 0');
  if (!(cacheHit >= 0 && cacheHit <= 0.99)) throw new Error('cacheHit must be between 0 and 0.99');
  const faults = normaliseFaults(rawFaults);
  const nodes = [...model.nodes].sort(byId);
  const edges = [...model.edges].sort(byId);
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const edgeById = new Map(edges.map((e) => [e.id, e]));
  const events = [];
  const warnings = [];
  for (const [kind, table, known] of [['node', faults.nodes, nodeById], ['edge', faults.edges, edgeById], ['boundary', faults.boundaries, new Map(model.boundaries.map((b) => [b.id, b]))]]) {
    for (const id of Object.keys(table)) if (!known.has(id)) throw new Error(`fault names unknown ${kind} "${id}"`);
  }

  // ---- 1. Direct fault state of every node and edge -------------------------------
  const info = new Map(nodes.map((n) => [n.id, { fault: faults.nodes[n.id] && faults.nodes[n.id] !== 'healthy' ? faults.nodes[n.id] : null, unitsLost: 0, failover: null, cause: [] }]));
  const cutEdges = new Set();
  const edgeFault = new Map();
  for (const edge of edges) {
    const state = faults.edges[edge.id];
    if (state === 'down' || state === 'partitioned') cutEdges.add(edge.id);
    else if (state && state !== 'healthy') edgeFault.set(edge.id, state);
  }
  for (const boundary of [...model.boundaries].sort(byId)) {
    const state = faults.boundaries[boundary.id];
    if (!state || state === 'healthy') continue;
    const members = new Set(boundary.members);
    if (state === 'partitioned') {
      for (const edge of edges) if (members.has(edge.from) !== members.has(edge.to)) cutEdges.add(edge.id);
      events.push({ type: 'partition', boundary: boundary.id, edges: edges.filter((e) => members.has(e.from) !== members.has(e.to)).map((e) => e.id) });
      continue;
    }
    for (const id of [...members].sort()) {
      const node = nodeById.get(id);
      const entry = info.get(id);
      if (!node || entry.fault === 'down') continue;
      if (state !== 'down') { entry.fault = entry.fault ?? state; continue; }
      if (survivesBoundary(node, boundary)) {
        entry.unitsLost = Math.min(redundantUnits(node) - 1, entry.unitsLost + 1);
        entry.cause.push(`lost one of ${redundantUnits(node)} units in ${boundary.label}`);
      } else if (node.redundancy === 'active-passive-dr' && boundary.scope === 'region') {
        entry.fault = 'down'; // resolved to a DR failover below
      } else entry.fault = 'down';
    }
    events.push({ type: 'blackout', boundary: boundary.id, state });
  }
  // A partitioned node is up but unreachable: cut every incident edge.
  for (const node of nodes) if (info.get(node.id).fault === 'partitioned') for (const edge of edges) if (edge.from === node.id || edge.to === node.id) cutEdges.add(edge.id);

  // ---- 2. Structural failure propagation (monotone fixed point) ---------------------
  const state = new Map();
  for (const node of nodes) {
    const entry = info.get(node.id);
    if (entry.fault === 'down' && node.redundancy === 'active-passive-dr') {
      entry.failover = { rto_sec: node.dr.rto_sec, rpo_sec: node.dr.rpo_sec };
      state.set(node.id, 'degraded');
      entry.cause.push('running on the disaster-recovery replica');
    } else if (entry.fault === 'down' || entry.fault === 'partitioned') {
      state.set(node.id, 'failing');
      entry.cause.push(`injected fault: ${entry.fault}`);
    } else if (entry.fault === 'degraded' || entry.fault === 'brownout' || entry.unitsLost > 0) {
      state.set(node.id, 'degraded');
      if (entry.fault) entry.cause.push(`injected fault: ${entry.fault}`);
    } else state.set(node.id, 'ok');
  }
  const outgoing = new Map(nodes.map((n) => [n.id, []]));
  const incoming = new Map(nodes.map((n) => [n.id, []]));
  for (const edge of edges) { outgoing.get(edge.from)?.push(edge); incoming.get(edge.to)?.push(edge); }
  const edgeState = new Map(edges.map((e) => [e.id, cutEdges.has(e.id) ? 'cut' : 'ok']));
  const blocked = (edge) => cutEdges.has(edge.id) || state.get(edge.to) === 'failing';
  const fallbackFor = (edge) => {
    const explicit = edge.resilience.fallback_edge_id != null ? edgeById.get(edge.resilience.fallback_edge_id) : null;
    const candidates = explicit ? [explicit] : outgoing.get(edge.from)
      .filter((other) => other.call_semantics === 'failover-route' && other.id !== edge.id && nodeById.get(other.to)?.role === nodeById.get(edge.to)?.role);
    return candidates.find((candidate) => !blocked(candidate)) ?? null;
  };
  const raise = (id, next, reason) => {
    if (RANK[next] > RANK[state.get(id)]) { state.set(id, next); info.get(id).cause.push(reason); return true; }
    return false;
  };
  const activeFallback = new Map();
  for (let round_ = 0; round_ <= nodes.length; round_ += 1) {
    let changed = false;
    activeFallback.clear();
    for (const edge of edges) {
      if (edge.call_semantics !== SYNC || !blocked(edge)) continue;
      const fallback = fallbackFor(edge);
      const why = cutEdges.has(edge.id) ? `${edge.id} is cut` : `${edge.to} is failing`;
      if (fallback) activeFallback.set(edge.id, fallback.id);
      else if (edge.resilience.circuit_breaker_enabled) changed = raise(edge.from, 'degraded', `${why}; circuit breaker on ${edge.id} fails fast`) || changed;
      else changed = raise(edge.from, 'failing', `${why}; ${edge.id} is a blocking call with no circuit breaker or fallback`) || changed;
    }
    if (!changed) break;
  }
  for (const [primary, fallback] of [...activeFallback].sort()) {
    edgeState.set(primary, cutEdges.has(primary) ? 'cut' : 'failed-over');
    edgeState.set(fallback, 'fallback-active');
    events.push({ type: 'fallback', edge: primary, to: fallback });
  }
  for (const node of nodes) {
    const failover = info.get(node.id).failover;
    if (failover) events.push({ type: 'dr-failover', node: node.id, rto_sec: failover.rto_sec, rpo_sec: failover.rpo_sec });
  }

  // ---- 3. Traffic graph: entries, back edges, topological order ---------------------
  const carriesTraffic = (edge) => !NON_TRAFFIC.has(edge.call_semantics) && (edge.call_semantics !== 'failover-route' || edgeState.get(edge.id) === 'fallback-active');
  const trafficEdges = edges.filter((edge) => !NON_TRAFFIC.has(edge.call_semantics));
  const entries = model.entrypoints.filter((id) => nodeById.has(id)).sort();
  const backEdges = new Set();
  {
    const colour = new Map();
    const visit = (id) => {
      colour.set(id, 1);
      for (const edge of outgoing.get(id).filter((e) => !NON_TRAFFIC.has(e.call_semantics))) {
        if (colour.get(edge.to) === 1) backEdges.add(edge.id);
        else if (!colour.has(edge.to)) visit(edge.to);
      }
      colour.set(id, 2);
    };
    for (const id of [...entries, ...nodes.map((n) => n.id)]) if (!colour.has(id)) visit(id);
  }
  if (backEdges.size) warnings.push(`Cycle: ${[...backEdges].sort().join(', ')} excluded from traffic propagation.`);
  const dag = trafficEdges.filter((edge) => !backEdges.has(edge.id));
  const order = [];
  {
    const indegree = new Map(nodes.map((n) => [n.id, 0]));
    for (const edge of dag) indegree.set(edge.to, indegree.get(edge.to) + 1);
    const ready = nodes.filter((n) => indegree.get(n.id) === 0).map((n) => n.id);
    while (ready.length) {
      const id = ready.shift();
      order.push(id);
      for (const edge of dag.filter((e) => e.from === id)) {
        indegree.set(edge.to, indegree.get(edge.to) - 1);
        if (indegree.get(edge.to) === 0) { ready.push(edge.to); ready.sort(); }
      }
    }
  }

  // ---- 4. Offered load, served load, flows, retry amplification ----------------------
  const baselines = entries.map((id) => nodeById.get(id).capacity.baseline_rps);
  const loadKnown = baselines.some((value) => value != null);
  if (!loadKnown) warnings.push('No entry component has baseline_rps: loads and utilisation are not reported; capacity limits still are.');
  // Without authored load, propagate one unit of ingress split equally so limits can still be derived.
  const entryLoad = new Map(entries.map((id, index) => [id, loadKnown ? (baselines[index] ?? 0) * multiplier : 1 / entries.length]));
  const totalIngress = [...entryLoad.values()].reduce((sum, value) => sum + value, 0);

  // Unlimited when a component declares no capacity (actors such as users).
  const ceiling = (node) => (node.capacity.max_rps == null ? UNBOUNDED : node.capacity.max_rps * (node.capacity.autoscale_max ?? 1));
  const capacityOf = (node) => {
    const entry = info.get(node.id);
    if (state.get(node.id) === 'failing') return 0;
    if (node.capacity.max_rps == null) return UNBOUNDED;
    const units = redundantUnits(node);
    const health = entry.fault === 'brownout' ? BROWNOUT_FAILURE : 1;
    return node.capacity.max_rps * (node.capacity.autoscale_max ?? 1) * health * ((units - entry.unitsLost) / units);
  };
  const cacheHealthyFor = (id) => outgoing.get(id).some((edge) => !blocked(edge) && nodeById.get(edge.to)?.role === 'cache');
  const hasCache = (id) => outgoing.get(id).some((edge) => nodeById.get(edge.to)?.role === 'cache');
  const cacheFactor = (edge) => {
    const from = nodeById.get(edge.from); const to = nodeById.get(edge.to);
    if (INLINE_CACHE.has(from.role)) return 1 - cacheHit;
    if (STATEFUL.has(to.role) && hasCache(edge.from)) return cacheHealthyFor(edge.from) ? 1 - cacheHit * edge.traffic.read_write_ratio : 1;
    return 1;
  };

  const run = (loads, scaleIsReal) => {
    const offered = new Map(nodes.map((n) => [n.id, 0]));
    const served = new Map(); const flow = new Map(edges.map((e) => [e.id, 0])); const amp = new Map(); const pathAmp = new Map(nodes.map((n) => [n.id, 1]));
    const lag = new Map(); const storms = [];
    for (const [id, value] of loads) offered.set(id, value * (info.get(id).fault === 'surge' ? SURGE_FACTOR : 1));
    for (const id of order) {
      const node = nodeById.get(id);
      const inbound = incoming.get(id).filter((edge) => !backEdges.has(edge.id) && carriesTraffic(edge));
      const capacity = capacityOf(node);
      const base = offered.get(id);
      let load = base;
      let converged = true;
      if (inbound.length) {
        const fault = info.get(id).fault;
        const faultP = state.get(id) === 'failing' ? 1 : fault === 'brownout' ? BROWNOUT_FAILURE : 0;
        let p = faultP;
        let previous = -1;
        converged = false;
        for (let i = 0; i < 20; i += 1) {
          load = base;
          for (const edge of inbound) {
            const slow = fault === 'degraded' && edge.resilience.timeout_ms != null && DEGRADED_LATENCY_FACTOR * (node.latency.p99_ms ?? 0) > edge.resilience.timeout_ms;
            const edgeP = Math.max(p, slow ? 1 : 0, edgeFault.get(edge.id) === 'brownout' ? BROWNOUT_FAILURE : 0);
            const retries = edge.call_semantics === SYNC ? edge.resilience.retries ?? 0 : 0;
            const alpha = edgeP >= 1 ? retries + 1 : (1 - edgeP ** (retries + 1)) / (1 - edgeP);
            amp.set(edge.id, alpha);
            load += flow.get(edge.id) * alpha;
          }
          if (Math.abs(load - previous) <= 1e-6 * Math.max(1, load)) { converged = true; break; }
          previous = load;
          p = Math.max(faultP, scaleIsReal && load > capacity && load > 0 ? 1 - capacity / load : 0);
        }
        const strongest = Math.max(1, ...inbound.filter((e) => e.call_semantics === SYNC).map((e) => pathAmp.get(e.from) * (amp.get(e.id) ?? 1)));
        pathAmp.set(id, strongest);
        if (scaleIsReal && (!converged || (strongest >= 2 && load > capacity))) storms.push({ node: id, amplification: strongest, converged });
      }
      if (info.get(id).fault === 'surge' && !loads.has(id)) load *= SURGE_FACTOR;
      offered.set(id, load);
      const out = state.get(id) === 'failing' ? 0 : scaleIsReal ? Math.min(load, capacity) : load;
      served.set(id, out);
      if (inbound.some((edge) => ASYNC.has(edge.call_semantics))) lag.set(id, scaleIsReal ? Math.max(0, load - capacity) : 0);
      for (const edge of outgoing.get(id)) {
        if (backEdges.has(edge.id) || NON_TRAFFIC.has(edge.call_semantics) || edge.call_semantics === 'failover-route') continue;
        const amount = out * edge.traffic.request_multiplier * cacheFactor(edge);
        if (!blocked(edge)) flow.set(edge.id, flow.get(edge.id) + amount);
        else if (activeFallback.has(edge.id)) flow.set(activeFallback.get(edge.id), flow.get(activeFallback.get(edge.id)) + amount);
        else if (!cutEdges.has(edge.id) && edge.call_semantics === SYNC && !edge.resilience.circuit_breaker_enabled
          && info.get(id).fault !== 'down' && info.get(id).fault !== 'partitioned') {
          // The caller is up but cannot complete: without a circuit breaker it keeps attempting
          // the failing dependency for every request it receives. Record those attempts so the
          // retry pressure on the failing tier is visible. A breaker fails fast and sends none.
          const attempts = (scaleIsReal ? Math.min(load, ceiling(node)) : load) * edge.traffic.request_multiplier * cacheFactor(edge);
          flow.set(edge.id, flow.get(edge.id) + attempts);
        }
      }
    }
    return { offered, served, flow, amp, pathAmp, lag, storms };
  };
  const live = run(entryLoad, loadKnown);

  // Capacity limit: the model is linear in ingress, so scale unit gains without clipping.
  const unit = loadKnown ? run(new Map(entries.map((id, index) => [id, (baselines[index] ?? 0)])), false) : live;
  const unitIngress = loadKnown ? baselines.reduce((sum, value) => sum + (value ?? 0), 0) : 1;
  let maxSustainable = null; let limitingNode = null;
  if (entries.length && unitIngress > 0) {
    maxSustainable = UNBOUNDED;
    for (const node of nodes) {
      const gain = unit.offered.get(node.id) / unitIngress;
      if (!(gain > 0)) continue;
      const limit = capacityOf(node) / gain;
      if (limit < maxSustainable) { maxSustainable = limit; limitingNode = node.id; }
    }
    if (!Number.isFinite(maxSustainable)) maxSustainable = null;
    if (entries.some((id) => state.get(id) === 'failing')) { maxSustainable = 0; }
  }

  // ---- 5. Availability ---------------------------------------------------------------
  const availability = new Map(nodes.map((n) => [n.id, state.get(n.id) === 'failing' ? 0 : nodeAvailability(n, info.get(n.id).unitsLost)]));
  const isHard = (edge) => edge.call_semantics === SYNC && !backEdges.has(edge.id) && !edge.resilience.circuit_breaker_enabled
    && edge.resilience.fallback_edge_id == null && !outgoing.get(edge.from).some((o) => o.call_semantics === 'failover-route' && nodeById.get(o.to)?.role === nodeById.get(edge.to)?.role);
  const hardSet = (start, seen = new Set()) => {
    const stack = [start];
    while (stack.length) {
      const id = stack.pop();
      if (seen.has(id)) continue;
      seen.add(id);
      for (const edge of outgoing.get(id)) if (isHard(edge)) stack.push(edge.to);
    }
    return seen;
  };
  const product = (ids) => [...ids].reduce((value, id) => value * availability.get(id), 1);
  const entrySla = new Map();
  const spofs = new Set();
  for (const entry of entries) {
    const required = hardSet(entry);
    let value = product(required);
    for (const id of [...required].sort()) {
      const node = nodeById.get(id);
      if (node.redundancy === 'single-instance' && !node.actor) spofs.add(id);
      for (const edge of outgoing.get(id)) {
        if (edge.call_semantics !== SYNC || backEdges.has(edge.id) || edge.resilience.circuit_breaker_enabled) continue;
        const fallback = edge.resilience.fallback_edge_id != null ? edgeById.get(edge.resilience.fallback_edge_id)
          : outgoing.get(id).find((o) => o.call_semantics === 'failover-route' && nodeById.get(o.to)?.role === nodeById.get(edge.to)?.role);
        if (!fallback || fallback.id === edge.id) continue;
        if (fallback.resilience.fallback_edge_id === edge.id && fallback.id < edge.id) continue; // count a mutual pair once
        const primary = product([...hardSet(edge.to)].filter((x) => !required.has(x)));
        const secondary = product([...hardSet(fallback.to)].filter((x) => !required.has(x)));
        value *= 1 - (1 - primary) * (1 - secondary);
      }
    }
    entrySla.set(entry, value);
  }
  const compositeSla = entries.length ? Math.min(...entrySla.values()) : null;
  if (compositeSla != null && compositeSla >= INDEPENDENCE_NOTE_FROM && compositeSla < 1) warnings.push(INDEPENDENCE_NOTE);

  // ---- 6. Latency --------------------------------------------------------------------
  const hopFor = (node) => {
    const capacity = capacityOf(node);
    const rho = loadKnown && capacity > 0 ? live.offered.get(node.id) / capacity : null;
    const queue = rho == null ? 1 : rho >= 1 ? MAX_QUEUE_FACTOR : Math.min(MAX_QUEUE_FACTOR, 1 / (1 - rho));
    const factor = queue * (info.get(node.id).fault === 'degraded' ? DEGRADED_LATENCY_FACTOR : 1);
    return { p50: (node.latency.p50_ms ?? 0) * factor, p99: (node.latency.p99_ms ?? 0) * factor };
  };
  const nodeLatency = new Map(nodes.map((n) => [n.id, hopFor(n)]));
  let unknownTimeout = false;
  const best = new Map(); // id -> { cost, hops, path }
  const reverse = [...order].reverse();
  for (const id of reverse) {
    const node = nodeById.get(id);
    const own = { ...nodeLatency.get(id) };
    let bestChild = null;
    for (const edge of outgoing.get(id)) {
      if (edge.call_semantics !== SYNC || backEdges.has(edge.id)) continue;
      let candidate;
      const target = activeFallback.has(edge.id) ? edgeById.get(activeFallback.get(edge.id)).to : edge.to;
      if (blocked(edge) && !activeFallback.has(edge.id)) {
        if (edge.resilience.timeout_ms == null) { unknownTimeout = true; continue; }
        const wait = edge.resilience.circuit_breaker_enabled ? 0 : edge.resilience.timeout_ms * ((edge.resilience.retries ?? 0) + 1);
        candidate = { cost: wait, hops: [{ constant: wait }], path: [`${edge.to} (timeout)`] };
      } else {
        const child = best.get(target);
        if (!child) continue;
        const slow = edgeFault.get(edge.id) === 'degraded' ? DEGRADED_LATENCY_FACTOR : 1;
        const weight = STATEFUL.has(nodeById.get(target).role) && hasCache(id) && cacheHealthyFor(id) ? 1 - cacheHit * edge.traffic.read_write_ratio : INLINE_CACHE.has(node.role) ? 1 - cacheHit : 1;
        const hops = child.hops.map((hop, index) => (index === 0 && hop.constant == null ? { ...hop, p50: hop.p50 * slow, p99: hop.p99 * slow, weight: (hop.weight ?? 1) * weight } : { ...hop, weight: hop.constant == null ? (hop.weight ?? 1) * weight : undefined }));
        candidate = { cost: child.cost * slow, hops, path: child.path };
      }
      if (!bestChild || candidate.cost > bestChild.cost) bestChild = candidate;
    }
    best.set(id, { cost: own.p99 + (bestChild?.cost ?? 0), hops: [own, ...(bestChild?.hops ?? [])], path: [id, ...(bestChild?.path ?? [])] });
  }
  let critical = null;
  for (const entry of entries) {
    const candidate = best.get(entry);
    if (candidate && state.get(entry) !== 'failing' && (!critical || candidate.cost > critical.cost)) critical = candidate;
  }
  const criticalPath = critical ? { nodes: critical.path, ...Object.fromEntries(Object.entries(pathPercentiles(critical.hops)).map(([k, v]) => [k, round(v)])) } : null;
  if (unknownTimeout) warnings.push('A failing blocking call has no timeout_ms: its wait cannot be modelled and is left out of latency.');

  // ---- 7. Assemble -------------------------------------------------------------------
  const nodeResults = {};
  let assumedInputs = 0; let authoredInputs = 0;
  for (const node of nodes) {
    for (const key of ['sla_percent', 'redundancy', 'capacity.max_rps', 'latency.p50_ms', 'latency.p99_ms', 'role']) {
      if (node.basis[key] === 'assumed') assumedInputs += 1; else if (node.basis[key] === 'authored') authoredInputs += 1;
    }
    const capacity = capacityOf(node);
    const load = loadKnown ? live.offered.get(node.id) : null;
    const utilisation = load != null && capacity > 0 ? load / capacity : load != null && load > 0 ? UNBOUNDED : null;
    const entry = info.get(node.id);
    const saturated = utilisation != null && utilisation >= 1 && state.get(node.id) !== 'failing';
    const failover = entry.failover ? {
      rto_sec: entry.failover.rto_sec, rpo_sec: entry.failover.rpo_sec,
      writes_at_risk: entry.failover.rpo_sec != null && load != null
        ? round(entry.failover.rpo_sec * incoming.get(node.id).reduce((sum, e) => sum + live.flow.get(e.id) * (1 - e.traffic.read_write_ratio), 0)) : null,
    } : null;
    const hop = nodeLatency.get(node.id);
    nodeResults[node.id] = {
      state: state.get(node.id) === 'ok' && saturated ? 'degraded' : state.get(node.id),
      fault: entry.fault,
      cause: saturated ? [...entry.cause, 'offered load exceeds capacity'] : entry.cause,
      load_rps: round(load), served_rps: loadKnown ? round(live.served.get(node.id)) : null,
      capacity_rps: Number.isFinite(capacity) ? round(capacity) : null, utilisation: utilisation === UNBOUNDED || !Number.isFinite(capacity) ? null : round(utilisation, 4), saturated,
      queue_lag_rps: live.lag.has(node.id) && loadKnown ? round(live.lag.get(node.id)) : null,
      latency_ms: { p50: round(hop.p50), p99: round(hop.p99) },
      availability: round(availability.get(node.id), 8),
      units_lost: entry.unitsLost, failover,
    };
    if (saturated) events.push({ type: 'saturation', node: node.id, utilisation: round(utilisation, 4) });
    if (nodeResults[node.id].queue_lag_rps > 0) events.push({ type: 'queue-lag', node: node.id, growth_rps: nodeResults[node.id].queue_lag_rps });
  }
  for (const storm of live.storms) events.push({ type: 'retry-storm', node: storm.node, amplification: round(storm.amplification), self_sustaining: !storm.converged });
  for (const edge of edges) {
    if (edge.call_semantics !== SYNC || state.get(edge.to) === 'ok' || cutEdges.has(edge.id)) continue;
    const caller = incoming.get(edge.from).find((e) => e.call_semantics === SYNC && e.resilience.timeout_ms != null);
    if (caller && edge.resilience.timeout_ms != null && caller.resilience.timeout_ms < edge.resilience.timeout_ms * ((edge.resilience.retries ?? 0) + 1)) {
      events.push({ type: 'timeout-inversion', caller: caller.id, callee: edge.id });
    }
  }
  const edgeResults = {};
  for (const edge of edges) {
    const amplification = live.amp.get(edge.id) ?? 1;
    let status = edgeState.get(edge.id);
    if (status === 'ok' && edgeFault.has(edge.id)) status = edgeFault.get(edge.id);
    if (status === 'ok' && state.get(edge.to) === 'failing') status = 'failing';
    if (status === 'ok' && amplification >= 2) status = 'retrying';
    edgeResults[edge.id] = { state: status, flow_rps: loadKnown ? round(live.flow.get(edge.id)) : null, amplification: round(amplification), carries_traffic: carriesTraffic(edge) && !backEdges.has(edge.id) };
  }
  const affected = nodes.filter((n) => nodeResults[n.id].state !== 'ok').map((n) => n.id);
  const failingIngress = entries.filter((id) => state.get(id) === 'failing').reduce((sum, id) => sum + entryLoad.get(id), 0);
  const order_ = { blackout: 0, partition: 1, 'dr-failover': 2, fallback: 3, saturation: 4, 'queue-lag': 5, 'retry-storm': 6, 'timeout-inversion': 7 };
  events.sort((a, b) => (order_[a.type] - order_[b.type]) || JSON.stringify(a).localeCompare(JSON.stringify(b)));

  return {
    schemaVersion: SIM_SCHEMA_VERSION,
    kind: 'analytical-model',
    inputs: { multiplier, cacheHit, faults },
    kpis: {
      // A share below 1 is never reported as 100%: rounding must not turn "almost always" into "always".
      composite_sla_percent: compositeSla == null ? null : (compositeSla < 1 ? Math.min(99.99999, round(compositeSla * 100, 5)) : 100),
      critical_path: criticalPath,
      max_sustainable_rps: maxSustainable == null ? null : round(maxSustainable),
      limiting_node: maxSustainable == null ? null : limitingNode,
      ingress_rps: loadKnown ? round(totalIngress) : null,
      headroom: loadKnown && maxSustainable != null && totalIngress > 0 ? round(maxSustainable / totalIngress, 4) : null,
      active_spofs: [...spofs].sort(),
      blast_radius: { nodes: affected, ingress_share: entries.length && totalIngress > 0 ? round(failingIngress / totalIngress, 4) : null },
    },
    nodes: nodeResults,
    edges: edgeResults,
    events,
    basis: { authored_inputs: authoredInputs, assumed_inputs: assumedInputs, load_known: loadKnown },
    warnings,
  };
}
