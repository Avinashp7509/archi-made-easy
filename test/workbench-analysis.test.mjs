// Scenario presets, FMEA and cost estimation.
import test from 'node:test';
import assert from 'node:assert/strict';

import { loadKnowledge } from '../archi-made-easy/bin/workbench.mjs';
import { scaffold } from '../archi-made-easy/workbench/scaffold.mjs';
import { buildModel } from '../archi-made-easy/workbench/model.mjs';
import { simulate } from '../archi-made-easy/workbench/sim.mjs';
import { buildScenarios, runScenario, breachReach } from '../archi-made-easy/workbench/scenarios.mjs';
import { buildFmea } from '../archi-made-easy/workbench/fmea.mjs';
import { estimateCost, SECONDS_PER_MONTH } from '../archi-made-easy/workbench/cost.mjs';

const knowledge = loadKnowledge();
const patternModel = (patternId, providerId = 'azure') => buildModel(scaffold({
  slots: knowledge.slots,
  pattern: knowledge.patterns.find((p) => p.id === patternId),
  provider: knowledge.providers.find((p) => p.id === providerId),
})).model;

function priced() {
  return {
    schema_version: 1, diagram_type: 'architecture', meta: { title: 'Priced', output: 'p.html' },
    components: [
      { id: 'web', type: 'frontend', label: 'Web', operational: { role: 'ingress', capacity: { baseline_rps: 100, max_rps: 1000 } } },
      { id: 'api', type: 'backend', label: 'API', operational: { role: 'stateless-compute', capacity: { max_rps: 60, autoscale_min: 2, autoscale_max: 10 }, finops: { monthly_base_cost_usd: 200, cost_per_million_requests_usd: 0.5 } } },
      { id: 'db', type: 'database', label: 'DB', operational: { role: 'stateful-db', capacity: { max_rps: 5000 }, finops: { monthly_base_cost_usd: 400, storage_gb: 500, storage_cost_per_gb_usd: 0.1 } } },
    ],
    boundaries: [
      { id: 'r1', kind: 'region', label: 'Region 1', wraps: ['web', 'api'], operational: { scope: 'region' } },
      { id: 'r2', kind: 'region', label: 'Region 2', wraps: ['db'], operational: { scope: 'region' } },
    ],
    connections: [
      { id: 'web-api', from: 'web', to: 'api', operational: { call_semantics: 'sync-blocking' } },
      { id: 'api-db', from: 'api', to: 'db', operational: { call_semantics: 'sync-blocking', traffic: { payload_kb: 4, egress_cost_per_gb_usd: 0.02 } } },
    ],
  };
}

test('six scenarios are generated in order, with deterministic targets', () => {
  const model = patternModel('web-ha');
  const scenarios = buildScenarios(model);
  assert.deepEqual(scenarios.map((s) => s.id), ['a', 'b', 'c', 'd', 'e', 'f']);
  assert.deepEqual(scenarios.map((s) => s.key), ['database-outage', 'zone-blackout', 'flash-crowd', 'provider-brownout', 'cache-stampede', 'edge-breach']);
  const by = Object.fromEntries(scenarios.map((s) => [s.id, s]));
  assert.deepEqual(by.a.targets, ['db']);
  assert.deepEqual(by.a.inputs.faults, { nodes: { db: 'down' } });
  assert.deepEqual(by.b.targets, ['region']);
  assert.equal(by.c.inputs.multiplier, 10);
  assert.equal(by.d.applicable, false, 'web-ha has no external provider');
  assert.match(by.d.reason, /No external service/);
  assert.deepEqual(by.e.targets, ['cache']);
  assert.equal(by.e.inputs.cacheHit, 0);
  assert.deepEqual(by.f.targets, ['users'], 'the entry nothing else calls');
  assert.equal(JSON.stringify(buildScenarios(model)), JSON.stringify(scenarios));
});

test('every scenario runs on every reference pattern', () => {
  for (const pattern of knowledge.patterns.filter((p) => p.status === 'implemented')) {
    const model = patternModel(pattern.id, 'onprem');
    for (const scenario of buildScenarios(model)) {
      const outcome = runScenario(model, scenario);
      if (!scenario.applicable) { assert.ok(outcome.reason, `${pattern.id}/${scenario.id}`); continue; }
      assert.equal(outcome.result.kind, 'analytical-model', `${pattern.id}/${scenario.id}`);
      assert.ok(Array.isArray(outcome.result.kpis.blast_radius.nodes));
    }
  }
});

test('scenario outcomes follow the architecture', () => {
  const web = patternModel('web-ha');
  const scenarios = Object.fromEntries(buildScenarios(web).map((s) => [s.id, s]));
  // The database is redundant across zones but a whole-component outage still stops the app.
  const outage = runScenario(web, scenarios.a).result;
  assert.equal(outage.nodes.db.state, 'failing');
  assert.equal(outage.nodes.app.state, 'failing');
  // The cache call has a circuit breaker: losing the cache degrades, it does not fail.
  const stampede = runScenario(web, scenarios.e).result;
  assert.equal(stampede.nodes.app.state, 'degraded');
  assert.equal(stampede.nodes.lb.state, 'ok');

  // AI platform: the model call has a fallback route, so a provider outage is absorbed.
  const ai = patternModel('ai-agent-platform');
  const down = simulate(ai, { faults: { nodes: { model: 'down' } } });
  assert.equal(down.nodes.router.state, 'ok');
  assert.equal(down.edges['router-fallback'].state, 'fallback-active');
});

test('breach reach stops at authenticated components', () => {
  const zero = patternModel('zero-trust');
  const reach = breachReach(zero, 'users');
  assert.deepEqual(reach.reachable_without_authentication, []);
  assert.deepEqual(reach.stopped_by_authentication, ['pep']);

  const open = buildModel({ schema_version: 1, diagram_type: 'architecture', meta: { title: 'Open', output: 'o.html' },
    components: [{ id: 'web', type: 'frontend', label: 'Web' }, { id: 'api', type: 'backend', label: 'API' }, { id: 'db', type: 'database', label: 'DB', operational: { security: { auth_method: 'iam' } } }],
    connections: [{ from: 'web', to: 'api' }, { from: 'api', to: 'db' }] }).model;
  const exposed = breachReach(open, 'web');
  assert.deepEqual(exposed.reachable_without_authentication, ['api']);
  assert.deepEqual(exposed.stopped_by_authentication, ['db']);
});

test('FMEA has one row per component, ordered by severity, with derived controls', () => {
  const model = patternModel('web-ha');
  const fmea = buildFmea(model);
  assert.equal(fmea.rows.length, model.nodes.filter((n) => !n.actor).length);
  assert.equal(fmea.rows.some((r) => r.component === 'users'), false, 'the user population is an actor, not a component that fails');
  const order = { critical: 0, high: 1, medium: 2, low: 3 };
  const severities = fmea.rows.map((row) => order[row.severity]);
  assert.deepEqual(severities, [...severities].sort((a, b) => a - b));
  const row = (id) => fmea.rows.find((r) => r.component === id);
  // The CDN is the only public entry: losing it loses all ingress.
  assert.equal(row('cdn').severity, 'critical');
  assert.equal(row('cdn').ingress_share_lost, 1);
  // The cache sits behind a circuit breaker.
  assert.ok(row('cache').existing_controls.includes('Circuit breaker on a caller'));
  assert.notEqual(row('cache').severity, 'critical');
  // The worker is reached only through a queue.
  assert.ok(row('worker').existing_controls.includes('Reached only asynchronously'));
  assert.equal(row('worker').severity, 'low');
  assert.ok(row('db').recommended_actions.some((a) => /recovery time/.test(a)));
  assert.match(fmea.note, /occurrence and detection are not rated/);
  assert.equal(JSON.stringify(buildFmea(model)), JSON.stringify(fmea));
});

test('cost: base, request, storage and egress follow the formulas', () => {
  const model = buildModel(priced()).model;
  const cost = estimateCost(model, simulate(model));
  // api: 100 rps / 60 per instance -> 2 instances (the minimum): base 200 * 2 / 2 = 200
  //      requests: 0.5 * 100 * 2,628,000 / 1e6 = 131.40
  assert.deepEqual(cost.nodes.api, { priced: true, instances: 2, base_usd: 200, requests_usd: 131.4, storage_usd: 0, total_usd: 331.4 });
  // db: base 400 + storage 500 * 0.1 = 450
  assert.deepEqual(cost.nodes.db, { priced: true, instances: 1, base_usd: 400, requests_usd: 0, storage_usd: 50, total_usd: 450 });
  assert.deepEqual(cost.nodes.web, { priced: false });
  // egress: 100 rps * 4 KB * 2,628,000 s / 1,048,576 = 1002.50 GB -> $20.05
  const gb = 100 * 4 * SECONDS_PER_MONTH / 1_048_576;
  assert.equal(cost.egress['api-db'].gb_per_month, Math.round(gb * 100) / 100);
  assert.equal(cost.egress['api-db'].cost_usd, Math.round(gb * 0.02 * 100) / 100);
  assert.equal(cost.monthly_total_usd, Math.round((331.4 + 450 + gb * 0.02) * 100) / 100);
  assert.deepEqual(cost.coverage, { priced_components: 2, components: 3 });
  assert.match(cost.notes[0], /1 of 3 components have no cost data/);
});

test('cost: instances scale with load; nothing is priced without cost data', () => {
  const model = buildModel(priced()).model;
  // 4x load: 400 rps / 60 -> 7 instances: base 200 * 7 / 2 = 700
  assert.equal(estimateCost(model, simulate(model, { multiplier: 4 })).nodes.api.base_usd, 700);
  const bare = patternModel('web-ha');
  const none = estimateCost(bare, simulate(bare));
  assert.equal(none.monthly_total_usd, null, 'a scaffold has no prices, so no total is invented');
  assert.equal(none.coverage.priced_components, 0);
});

test('cost: request and egress cost are left out when load is not set', () => {
  const doc = priced();
  delete doc.components[0].operational.capacity.baseline_rps;
  const model = buildModel(doc).model;
  const cost = estimateCost(model, simulate(model));
  assert.equal(cost.nodes.api.requests_usd, 0);
  assert.equal(cost.nodes.api.instances, 2);
  assert.deepEqual(cost.egress, {});
  assert.ok(cost.notes.some((n) => /request cost left out because load is not set/.test(n)));
  assert.ok(cost.notes.some((n) => /egress cost left out because load is not set/.test(n)));
});
