// Simulation engine tests. Expected values are worked out by hand from the formulas in
// docs/program/BASE-DESIGN.md Part 4, and written next to each assertion.
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildModel } from '../archi-made-easy/workbench/model.mjs';
import { simulate, nodeAvailability, pathPercentiles } from '../archi-made-easy/workbench/sim.mjs';

const close = (actual, expected, tolerance = 1e-3, message = '') => assert.ok(Math.abs(actual - expected) <= tolerance, `${message} expected ${expected}, got ${actual}`);

/** web -> api -> db, all blocking, with authored numbers. */
function chain({ apiDb = {}, webApi = {}, db = {}, api = {} } = {}) {
  return {
    schema_version: 1, diagram_type: 'architecture', meta: { title: 'Chain', output: 'c.html' },
    components: [
      { id: 'web', type: 'frontend', label: 'Web', operational: { role: 'ingress', sla_percent: 99.95, capacity: { baseline_rps: 100, max_rps: 1000 }, latency: { p50_ms: 5, p99_ms: 50 } } },
      { id: 'api', type: 'backend', label: 'API', operational: { role: 'stateless-compute', sla_percent: 99.9, capacity: { max_rps: 200 }, latency: { p50_ms: 20, p99_ms: 200 }, ...api } },
      { id: 'db', type: 'database', label: 'DB', operational: { role: 'stateful-db', sla_percent: 99.95, capacity: { max_rps: 500 }, latency: { p50_ms: 5, p99_ms: 80 }, ...db } },
    ],
    connections: [
      { id: 'web-api', from: 'web', to: 'api', operational: { call_semantics: 'sync-blocking', ...webApi } },
      { id: 'api-db', from: 'api', to: 'db', operational: { call_semantics: 'sync-blocking', ...apiDb } },
    ],
  };
}
const sim = (document, inputs) => simulate(buildModel(document).model, inputs);

test('healthy chain: loads, utilisation, limit and composite availability', () => {
  const r = sim(chain());
  assert.equal(r.kind, 'analytical-model');
  assert.deepEqual([r.nodes.web.load_rps, r.nodes.api.load_rps, r.nodes.db.load_rps], [100, 100, 100]);
  assert.equal(r.nodes.api.utilisation, 0.5);   // 100 / 200
  assert.equal(r.nodes.db.utilisation, 0.2);    // 100 / 500
  assert.equal(r.kpis.max_sustainable_rps, 200); // min(1000, 200, 500) per unit of ingress
  assert.equal(r.kpis.limiting_node, 'api');
  assert.equal(r.kpis.headroom, 2);
  // 0.9995 * 0.999 * 0.9995 = 0.99800125
  close(r.kpis.composite_sla_percent, 99.80012, 1e-4);
  assert.deepEqual(r.kpis.active_spofs, ['api', 'db', 'web']);
  assert.deepEqual(r.kpis.blast_radius.nodes, []);
  assert.deepEqual(r.events, []);
  assert.equal(r.basis.load_known, true);
});

test('a blocking dependency failure cascades; a circuit breaker contains it', () => {
  const cascade = sim(chain(), { faults: { nodes: { db: 'down' } } });
  assert.deepEqual([cascade.nodes.db.state, cascade.nodes.api.state, cascade.nodes.web.state], ['failing', 'failing', 'failing']);
  assert.equal(cascade.kpis.composite_sla_percent, 0);
  assert.equal(cascade.kpis.blast_radius.ingress_share, 1);
  assert.match(cascade.nodes.api.cause.join(' '), /api-db is a blocking call with no circuit breaker or fallback/);
  assert.equal(cascade.kpis.max_sustainable_rps, 0);

  const contained = sim(chain({ apiDb: { resilience: { circuit_breaker_enabled: true } } }), { faults: { nodes: { db: 'down' } } });
  assert.deepEqual([contained.nodes.db.state, contained.nodes.api.state, contained.nodes.web.state], ['failing', 'degraded', 'ok']);
  assert.deepEqual(contained.kpis.blast_radius.nodes, ['api', 'db']);
  assert.equal(contained.kpis.blast_radius.ingress_share, 0);
});

test('a cut edge behaves like a failed dependency', () => {
  const r = sim(chain(), { faults: { edges: { 'api-db': 'partitioned' } } });
  assert.equal(r.edges['api-db'].state, 'cut');
  assert.equal(r.nodes.db.state, 'ok');
  assert.equal(r.nodes.api.state, 'failing');
});

test('saturation clips served load and is reported', () => {
  const r = sim(chain(), { multiplier: 3 });
  assert.equal(r.nodes.api.load_rps, 300);
  assert.equal(r.nodes.api.served_rps, 200);
  assert.equal(r.nodes.api.utilisation, 1.5);
  assert.equal(r.nodes.api.saturated, true);
  assert.equal(r.nodes.api.state, 'degraded');
  assert.equal(r.nodes.db.load_rps, 200); // only what the API could serve
  assert.deepEqual(r.events.filter((e) => e.type === 'saturation').map((e) => e.node), ['api']);
  close(r.kpis.headroom, 200 / 300, 1e-4);
});

test('retries amplify load on a saturated dependency (fixed point)', () => {
  // One retry: alpha = 1 + p, p = 1 - 200/L, L = 300 * (1 + p)  =>  L^2 - 600 L + 60000 = 0  =>  L = 473.205
  const r = sim(chain({ webApi: { resilience: { retries: 1 } } }), { multiplier: 3 });
  close(r.nodes.api.load_rps, 473.205, 0.01);
  close(r.edges['web-api'].amplification, 1.5774, 1e-3); // 1 + (1 - 200/473.205)
  assert.equal(r.events.some((e) => e.type === 'retry-storm'), false, 'amplification below 2 is not a storm');
});

test('retries against a dead dependency multiply calls and flag a storm', () => {
  const r = sim(chain({ apiDb: { resilience: { retries: 2 } } }), { faults: { nodes: { db: 'down' } } });
  assert.equal(r.nodes.api.state, 'failing');
  assert.equal(r.edges['api-db'].amplification, 3); // retries + 1 when every attempt fails
  assert.equal(r.nodes.db.load_rps, 300);            // 100 requests, each attempted three times
  // A circuit breaker fails fast instead: no attempts reach the dead dependency.
  const guarded = sim(chain({ apiDb: { resilience: { retries: 2, circuit_breaker_enabled: true } } }), { faults: { nodes: { db: 'down' } } });
  assert.equal(guarded.nodes.db.load_rps, 0);
  assert.equal(guarded.events.some((e) => e.type === 'retry-storm'), false);
  assert.deepEqual(r.events.filter((e) => e.type === 'retry-storm').map((e) => [e.node, e.amplification]), [['db', 3]]);
});

test('timeout inversion is reported when the callee is unhealthy', () => {
  const doc = chain({ webApi: { resilience: { timeout_ms: 1000 } }, apiDb: { resilience: { timeout_ms: 800, retries: 1, circuit_breaker_enabled: true } } });
  assert.equal(sim(doc).events.length, 0);
  const r = sim(doc, { faults: { nodes: { db: 'down' } } });
  // 1000 ms < 800 ms * (1 + 1)
  assert.deepEqual(r.events.filter((e) => e.type === 'timeout-inversion'), [{ type: 'timeout-inversion', caller: 'web-api', callee: 'api-db' }]);
});

test('a cache absorbs reads, and a failed cache sends them back to the database', () => {
  const doc = chain();
  doc.components.push({ id: 'cache', type: 'database', label: 'Redis', operational: { role: 'cache', capacity: { max_rps: 5000 } } });
  doc.connections.push({ id: 'api-cache', from: 'api', to: 'cache', operational: { call_semantics: 'sync-blocking', resilience: { circuit_breaker_enabled: true } } });
  // db flow = 100 * (1 - 0.8 * 0.8) = 36 (read_write_ratio defaults to 0.8)
  assert.equal(sim(doc, { cacheHit: 0.8 }).nodes.db.load_rps, 36);
  assert.equal(sim(doc, { cacheHit: 0 }).nodes.db.load_rps, 100);
  const stampede = sim(doc, { cacheHit: 0.8, faults: { nodes: { cache: 'down' } } });
  assert.equal(stampede.nodes.db.load_rps, 100);
  assert.equal(stampede.nodes.api.state, 'degraded');
});

test('an inline CDN passes only cache misses', () => {
  const doc = chain();
  doc.components[0].operational.role = 'cdn';
  assert.equal(sim(doc, { cacheHit: 0.9 }).nodes.api.load_rps, 10); // 100 * (1 - 0.9)
});

test('a fallback edge takes the traffic and keeps the caller healthy', () => {
  const doc = chain();
  doc.components.push({ id: 'db2', type: 'database', label: 'Replica', operational: { role: 'stateful-db', sla_percent: 99.95, capacity: { max_rps: 500 } } });
  doc.connections[1].operational.resilience = { fallback_edge_id: 'api-db2' };
  doc.connections.push({ id: 'api-db2', from: 'api', to: 'db2', operational: { call_semantics: 'failover-route' } });
  const healthy = sim(doc);
  assert.equal(healthy.nodes.db2.load_rps, 0);
  assert.equal(healthy.edges['api-db2'].carries_traffic, false);
  // api needs db OR db2: 0.9995 * 0.999 * (1 - 0.0005^2) = 0.99850025
  close(healthy.kpis.composite_sla_percent, 99.85002, 1e-4);

  const failed = sim(doc, { faults: { nodes: { db: 'down' } } });
  assert.equal(failed.nodes.api.state, 'ok');
  assert.equal(failed.nodes.db2.load_rps, 100);
  assert.equal(failed.edges['api-db'].state, 'failed-over');
  assert.equal(failed.edges['api-db2'].state, 'fallback-active');
  assert.deepEqual(failed.events.filter((e) => e.type === 'fallback'), [{ type: 'fallback', edge: 'api-db', to: 'api-db2' }]);
});

test('disaster-recovery failover reports RTO and write exposure', () => {
  const doc = chain({ db: { redundancy: 'active-passive-dr', dr: { rto_sec: 300, rpo_sec: 60 } } });
  const r = sim(doc, { faults: { nodes: { db: 'down' } } });
  assert.equal(r.nodes.db.state, 'degraded');
  assert.equal(r.nodes.api.state, 'ok');
  // writes at risk = rpo * inbound flow * (1 - read fraction) = 60 * 100 * 0.2
  assert.deepEqual(r.nodes.db.failover, { rto_sec: 300, rpo_sec: 60, writes_at_risk: 1200 });
  assert.deepEqual(r.events.filter((e) => e.type === 'dr-failover'), [{ type: 'dr-failover', node: 'db', rto_sec: 300, rpo_sec: 60 }]);
});

test('a zone blackout removes one unit of a zone-redundant node and downs the rest', () => {
  const doc = chain({ api: { redundancy: 'multi-az' }, apiDb: { resilience: { circuit_breaker_enabled: true } } });
  doc.boundaries = [{ id: 'zone-a', kind: 'region', label: 'Zone A', wraps: ['api', 'db'], operational: { scope: 'availability-zone' } }];
  const r = sim(doc, { faults: { boundaries: { 'zone-a': 'down' } } });
  assert.equal(r.nodes.api.units_lost, 1);
  assert.equal(r.nodes.api.capacity_rps, 100); // half of 200
  assert.equal(r.nodes.db.state, 'failing');   // single instance inside the zone
  // availability of the surviving unit: 0.999
  close(r.nodes.api.availability, 0.999, 1e-9);
  const partition = sim(doc, { faults: { boundaries: { 'zone-a': 'partitioned' } } });
  assert.equal(partition.edges['web-api'].state, 'cut');
  assert.equal(partition.edges['api-db'].state, 'ok');
});

test('asynchronous edges do not cascade, and a slow consumer builds lag', () => {
  const doc = chain();
  doc.components.push(
    { id: 'queue', type: 'messagebus', label: 'Queue', operational: { role: 'message-broker', capacity: { max_rps: 10000 } } },
    { id: 'worker', type: 'backend', label: 'Worker', operational: { role: 'stateless-compute', capacity: { max_rps: 40 } } },
  );
  doc.connections.push(
    { id: 'api-queue', from: 'api', to: 'queue', operational: { call_semantics: 'async-queue' } },
    { id: 'queue-worker', from: 'queue', to: 'worker', operational: { call_semantics: 'async-queue' } },
  );
  const down = sim(doc, { faults: { nodes: { worker: 'down' } } });
  assert.equal(down.nodes.queue.state, 'ok');
  assert.equal(down.nodes.api.state, 'ok');
  const slow = sim(doc);
  assert.equal(slow.nodes.worker.queue_lag_rps, 60); // 100 arriving, 40 drained
  assert.deepEqual(slow.events.filter((e) => e.type === 'queue-lag'), [{ type: 'queue-lag', node: 'worker', growth_rps: 60 }]);
});

test('surge multiplies the load on its target by twenty', () => {
  const r = sim(chain(), { faults: { nodes: { web: 'surge' } } });
  assert.equal(r.nodes.web.load_rps, 2000);
  assert.equal(r.nodes.web.saturated, true);
});

test('latency: single hop reproduces its own percentiles; queueing and degradation scale it', () => {
  const doc = chain();
  doc.connections = [];
  const alone = sim(doc);
  assert.deepEqual(alone.kpis.critical_path.nodes, ['web']);
  // utilisation 0.1 -> factor 1 / 0.9
  close(alone.kpis.critical_path.p50_ms, 5 / 0.9, 1e-3);
  close(alone.kpis.critical_path.p99_ms, 50 / 0.9, 1e-3);

  const r = sim(chain());
  assert.deepEqual(r.kpis.critical_path.nodes, ['web', 'api', 'db']);
  // per-hop p99 under load: 50/0.9, 200/0.5, 80/0.8
  const hops = [[5 / 0.9, 50 / 0.9], [40, 400], [6.25, 100]];
  const sumP99 = hops.reduce((s, h) => s + h[1], 0);
  const sumP50 = hops.reduce((s, h) => s + h[0], 0);
  assert.ok(r.kpis.critical_path.p99_ms < sumP99, 'path P99 is below the sum of P99s');
  assert.ok(r.kpis.critical_path.p99_ms > 400, 'path P99 exceeds the slowest hop');
  assert.ok(r.kpis.critical_path.p50_ms > sumP50, 'the median of a sum of skewed hops exceeds the sum of medians');
  assert.ok(r.kpis.critical_path.p50_ms <= r.kpis.critical_path.p95_ms && r.kpis.critical_path.p95_ms <= r.kpis.critical_path.p99_ms);

  const degraded = sim(chain(), { faults: { nodes: { db: 'degraded' } } });
  assert.equal(degraded.nodes.db.latency_ms.p99, 300); // 80 / 0.8 * 3
});

test('pathPercentiles: deterministic hops add exactly; one hop is returned unchanged', () => {
  const flat = pathPercentiles([{ p50: 10, p99: 10 }, { p50: 10, p99: 10 }]);
  for (const key of ['p50_ms', 'p95_ms', 'p99_ms']) close(flat[key], 20, 1e-9, key);
  const one = pathPercentiles([{ p50: 20, p99: 200 }]);
  close(one.p50_ms, 20, 1e-9); close(one.p99_ms, 200, 1e-6);
  close(pathPercentiles([{ constant: 500 }, { p50: 10, p99: 10 }]).p99_ms, 510, 1e-9);
});

test('latency is not reported for an entry that is failing; a breaker fails fast', () => {
  const failing = sim(chain({ apiDb: { resilience: { timeout_ms: 800, retries: 1 } } }), { faults: { nodes: { db: 'down' } } });
  assert.equal(failing.kpis.critical_path, null, 'every entry is failing, so there is no served path to time');
  const guarded = sim(chain({ apiDb: { resilience: { timeout_ms: 800, retries: 1, circuit_breaker_enabled: true } } }), { faults: { nodes: { db: 'down' } } });
  assert.deepEqual(guarded.kpis.critical_path.nodes, ['web', 'api', 'db (timeout)']);
  // The open breaker adds no wait: the path is web + api only.
  assert.ok(guarded.kpis.critical_path.p99_ms < 50 / 0.9 + 200 / 0.5);
});

test('node availability follows the redundancy formulas', () => {
  const node = (redundancy, autoscale_min = 1) => ({ sla_percent: 99, redundancy, capacity: { autoscale_min } });
  close(nodeAvailability(node('single-instance')), 0.99, 1e-12);
  close(nodeAvailability(node('multi-az')), 1 - 0.01 ** 2, 1e-12);          // two units
  close(nodeAvailability(node('multi-az', 3)), 1 - 0.01 ** 3, 1e-12);       // autoscale_min units
  close(nodeAvailability(node('active-passive-dr')), 1 - 0.01 * (1 - 0.95 * 0.99), 1e-12);
  close(nodeAvailability(node('multi-az'), 1), 0.99, 1e-12);                // one unit lost
});

test('without authored load, limits are still reported and loads are not invented', () => {
  const doc = chain();
  delete doc.components[0].operational.capacity.baseline_rps;
  const r = sim(doc);
  assert.equal(r.nodes.api.load_rps, null);
  assert.equal(r.nodes.api.utilisation, null);
  assert.equal(r.kpis.ingress_rps, null);
  assert.equal(r.kpis.max_sustainable_rps, 200);
  assert.equal(r.basis.load_known, false);
  assert.match(r.warnings.join(' '), /baseline_rps/);
});

test('cycles are excluded from propagation and reported', () => {
  const doc = chain();
  doc.connections.push({ id: 'db-api', from: 'db', to: 'api', operational: { call_semantics: 'sync-blocking' } });
  const r = sim(doc);
  assert.match(r.warnings.join(' '), /Cycle: db-api/);
  assert.equal(r.nodes.api.load_rps, 100);
});

test('inputs are validated and results are deterministic', () => {
  const model = buildModel(chain()).model;
  assert.throws(() => simulate(model, { multiplier: 0 }), /multiplier/);
  assert.throws(() => simulate(model, { cacheHit: 1 }), /cacheHit/);
  assert.throws(() => simulate(model, { faults: { nodes: { nope: 'down' } } }), /unknown node "nope"/);
  assert.throws(() => simulate(model, { faults: { nodes: { db: 'exploded' } } }), /unknown fault state/);
  const inputs = { multiplier: 2.5, cacheHit: 0.3, faults: { nodes: { db: 'brownout' } } };
  assert.equal(JSON.stringify(simulate(model, inputs)), JSON.stringify(simulate(model, inputs)));
});

test('results state how many inputs were assumed', () => {
  const bare = { schema_version: 1, diagram_type: 'architecture', meta: { title: 'B', output: 'b.html' }, components: [{ id: 'a', type: 'frontend', label: 'A' }, { id: 'b', type: 'database', label: 'B' }], connections: [{ from: 'a', to: 'b' }] };
  const r = sim(bare);
  assert.equal(r.basis.authored_inputs, 0);
  assert.ok(r.basis.assumed_inputs >= 10);
});

test('actors (users) do not limit capacity, lower availability, add latency or count as single points of failure', () => {
  const doc = chain();
  doc.components.unshift({ id: 'users', type: 'external', label: 'Users', operational: { capacity: { baseline_rps: 100 } } });
  delete doc.components[1].operational.capacity.baseline_rps;
  doc.connections.unshift({ id: 'users-web', from: 'users', to: 'web', operational: { call_semantics: 'sync-blocking' } });
  const withUsers = sim(doc);
  const plain = sim(chain());
  assert.equal(withUsers.kpis.composite_sla_percent, plain.kpis.composite_sla_percent);
  assert.equal(withUsers.kpis.max_sustainable_rps, plain.kpis.max_sustainable_rps);
  assert.deepEqual(withUsers.kpis.active_spofs, plain.kpis.active_spofs);
  assert.equal(withUsers.nodes.users.capacity_rps, null);
  assert.equal(withUsers.nodes.users.utilisation, null);
  assert.equal(withUsers.nodes.web.load_rps, 100);
  assert.deepEqual(withUsers.kpis.critical_path.nodes, ['users', 'web', 'api', 'db']);
  close(withUsers.kpis.critical_path.p99_ms, plain.kpis.critical_path.p99_ms, 1e-2);
  // A surge on the users is a 20x flood of the first real tier.
  assert.equal(sim(doc, { faults: { nodes: { users: 'surge' } } }).nodes.web.load_rps, 2000);
});
