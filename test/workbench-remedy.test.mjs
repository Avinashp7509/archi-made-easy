// What-if edits: patches, previews, recovery options, and the fixes and consequences that
// review findings carry.
import test from 'node:test';
import assert from 'node:assert/strict';

import { loadKnowledge } from '../archi-made-easy/bin/workbench.mjs';
import { scaffold } from '../archi-made-easy/workbench/scaffold.mjs';
import { buildModel } from '../archi-made-easy/workbench/model.mjs';
import { simulate } from '../archi-made-easy/workbench/sim.mjs';
import { review, RULES } from '../archi-made-easy/workbench/review.mjs';
import { applyPatches, figures, compareFigures, previewPatches, recoveryOptions, recoveryPlan } from '../archi-made-easy/workbench/remedy.mjs';

/** entry -> api -> db, with a queue-fed worker; everything in one zone. */
function design() {
  return {
    schema_version: 1, diagram_type: 'architecture', meta: { title: 'Remedy fixture', output: 'r.html' },
    components: [
      { id: 'web', type: 'frontend', label: 'Web', operational: { role: 'ingress', capacity: { baseline_rps: 100, max_rps: 5000 } } },
      { id: 'api', type: 'backend', label: 'API', operational: { capacity: { max_rps: 400 } } },
      { id: 'db', type: 'database', label: 'DB', operational: { redundancy: 'single-instance', capacity: { max_rps: 2000 } } },
      { id: 'queue', type: 'messagebus', label: 'Queue' },
      { id: 'worker', type: 'backend', label: 'Worker', operational: { capacity: { max_rps: 500 } } },
    ],
    boundaries: [{ id: 'zone-a', kind: 'region', label: 'Zone A', wraps: ['api', 'db'], operational: { scope: 'availability-zone' } }],
    connections: [
      { id: 'web-api', from: 'web', to: 'api' },
      { id: 'api-db', from: 'api', to: 'db' },
      { from: 'api', to: 'queue' },
      { id: 'queue-worker', from: 'queue', to: 'worker' },
    ],
  };
}
const plain = (value) => JSON.parse(JSON.stringify(value));

test('applyPatches merges operational fields into a new document and leaves the input alone', () => {
  const document = design();
  const frozen = JSON.stringify(document);
  const patched = applyPatches(document, [
    { target: 'component', id: 'db', operational: { redundancy: 'multi-az' } },
    { target: 'component', id: 'db', operational: { security: { encryption_at_rest: true } } },
    { target: 'connection', id: 'api-db', operational: { resilience: { circuit_breaker_enabled: true } } },
    { target: 'connection', id: 'rel-2', operational: { resilience: { idempotent: true } } },
  ]);
  assert.equal(JSON.stringify(document), frozen, 'input is not mutated');
  const db = patched.components.find((c) => c.id === 'db');
  assert.deepEqual(db.operational, { redundancy: 'multi-az', capacity: { max_rps: 2000 }, security: { encryption_at_rest: true } }, 'existing fields survive, both patches apply');
  assert.deepEqual(patched.connections[1].operational, { resilience: { circuit_breaker_enabled: true } });
  assert.deepEqual(patched.connections[2].operational, { resilience: { idempotent: true } }, 'a connection without an id is addressed as rel-<index>');
  assert.equal(patched.connections[0], document.connections[0], 'untouched entries are reused');
  assert.throws(() => applyPatches(document, [{ target: 'component', id: 'nope', operational: {} }]), /unknown component "nope"/);
  assert.throws(() => applyPatches(document, [{ target: 'connection', id: 'rel-9', operational: {} }]), /unknown connection "rel-9"/);
  assert.throws(() => applyPatches(document, [{ target: 'boundary', id: 'zone-a', operational: {} }]), /unknown patch target/);
});

test('figures and compareFigures report the same numbers as the engine, with verdicts in words', () => {
  const model = buildModel(design()).model;
  const inputs = { faults: { nodes: { db: 'down' } } };
  const result = simulate(model, inputs);
  const now = figures(model, inputs);
  assert.equal(now.composite_sla_percent, result.kpis.composite_sla_percent);
  assert.equal(now.affected_components, result.kpis.blast_radius.nodes.length);
  assert.equal(now.ingress_lost_percent, 100, 'the database is a hard dependency of the only entry');
  assert.equal(now.review_score, review(model).score, 'the review is of the design, not of the fault');
  const rows = compareFigures(figures(model, {}), now);
  const row = (key) => rows.find((r) => r.metric === key);
  assert.equal(row('composite_sla_percent').verdict, 'worse');
  assert.equal(row('affected_components').verdict, 'worse');
  assert.deepEqual([row('affected_components').before, row('affected_components').after], [0, 3], 'web, api and db; the queue and worker are not on a blocking path');
  assert.equal(row('review_score').verdict, 'unchanged');
  assert.equal(row('monthly_cost_usd').verdict, 'not comparable', 'no cost data is authored, so nothing is invented');
  assert.equal(row('critical_path_p99_ms').verdict, 'not comparable', 'nothing is served under the fault');
});

test('a failed single component: a standby and circuit breakers are offered, each previewed under the same fault', () => {
  const document = design();
  const inputs = { faults: { nodes: { db: 'down' } } };
  const plan = recoveryPlan(document, inputs);
  assert.equal(plan.kind, 'analytical-model');
  assert.equal(plan.affected_components, 3);
  assert.deepEqual(plan.options.map((o) => o.id), ['standby:db', 'circuit-breakers']);

  const [standby, breakers] = plan.options;
  assert.deepEqual(standby.patches, [{ target: 'component', id: 'db', operational: { redundancy: 'active-passive-dr' }, summary: 'Add a standby for DB' }]);
  assert.match(standby.rationale, /states neither for DB/, 'missing recovery objectives are said, not invented');
  assert.deepEqual(breakers.connections, ['api-db', 'web-api'], 'exactly the blocking calls that carried the failure');
  assert.deepEqual(breakers.components, ['api', 'web']);

  // Each preview is the engine run on the patched design under the same fault.
  for (const option of plan.options) {
    const patchedModel = buildModel(applyPatches(document, option.patches)).model;
    assert.deepEqual(plain(option.preview.after), plain(figures(patchedModel, inputs)), option.id);
    assert.deepEqual(plain(option.preview.before), plain(figures(buildModel(document).model, inputs)), option.id);
  }
  const after = (option, key) => option.preview.metrics.find((m) => m.metric === key);
  assert.deepEqual([after(standby, 'affected_components').before, after(standby, 'affected_components').after], [3, 1], 'only the database itself is affected, running on its standby');
  assert.equal(after(standby, 'ingress_lost_percent').after, 0);
  assert.deepEqual([after(breakers, 'affected_components').before, after(breakers, 'affected_components').after], [3, 2], 'the API degrades instead of failing; the entry is unaffected');
  assert.equal(after(breakers, 'ingress_lost_percent').verdict, 'better');
  // With the standby the takeover is reported with objectives that are not set.
  const takeover = simulate(buildModel(applyPatches(document, standby.patches)).model, inputs).events.find((e) => e.type === 'dr-failover');
  assert.deepEqual(takeover, { type: 'dr-failover', node: 'db', rto_sec: null, rpo_sec: null });
});

test('a lost zone: redundancy is offered for everything that ran only inside it', () => {
  const document = design();
  const inputs = { faults: { boundaries: { 'zone-a': 'down' } } };
  const plan = recoveryPlan(document, inputs);
  const redundancy = plan.options.find((o) => o.kind === 'redundancy');
  assert.equal(redundancy.id, 'redundancy:zone-a');
  assert.deepEqual(redundancy.components, ['api', 'db']);
  assert.deepEqual(redundancy.patches.map((p) => p.operational), [{ redundancy: 'multi-az' }, { redundancy: 'multi-az' }]);
  assert.match(redundancy.title, /2 components lost with Zone A across at least two zones/);
  const affected = redundancy.preview.metrics.find((m) => m.metric === 'affected_components');
  assert.equal(affected.verdict, 'better');
  assert.equal(redundancy.preview.metrics.find((m) => m.metric === 'ingress_lost_percent').after, 0, 'with a unit in another zone the path is served');
  assert.equal(plan.options.some((o) => o.kind === 'standby'), false, 'no component was failed directly');

  // A region-scoped boundary asks for a second region instead.
  const regional = design();
  regional.boundaries[0].operational.scope = 'region';
  const regionPlan = recoveryPlan(regional, inputs);
  assert.deepEqual(regionPlan.options.find((o) => o.kind === 'redundancy').patches.map((p) => p.operational.redundancy), ['active-active-multi-region', 'active-active-multi-region']);
});

test('no failure gives no options; saturation gives capacity options that carry no invented figures', () => {
  assert.deepEqual(recoveryPlan(design(), {}).options, []);
  const plan = recoveryPlan(design(), { multiplier: 10 });
  const model = buildModel(design()).model;
  const result = simulate(model, { multiplier: 10 });
  const saturated = model.nodes.filter((n) => result.nodes[n.id].saturated).map((n) => `capacity:${n.id}`);
  assert.ok(saturated.includes('capacity:api'), 'the API takes 1,000 requests a second against a capacity of 400');
  assert.deepEqual(plan.options.map((o) => o.id), saturated);
  for (const option of plan.options) {
    assert.equal(option.previewable, false);
    assert.deepEqual(option.patches, []);
    assert.equal('preview' in option, false);
    assert.match(option.rationale, /load test/);
  }
});

test('an option that would not improve this failure is not listed', () => {
  // The caller already has a breaker and the database a standby: nothing cascades.
  const document = applyPatches(design(), [
    { target: 'connection', id: 'api-db', operational: { resilience: { circuit_breaker_enabled: true } } },
    { target: 'component', id: 'db', operational: { redundancy: 'active-passive-dr', dr: { rto_sec: 120, rpo_sec: 30 } } },
  ]);
  const inputs = { faults: { nodes: { db: 'down' } } };
  const model = buildModel(document).model;
  assert.deepEqual(recoveryOptions(model, simulate(model, inputs)), []);
  assert.deepEqual(recoveryPlan(document, inputs).options, []);
});

test('every rule states a consequence, and every fix a finding carries applies and closes that finding', () => {
  for (const rule of RULES) assert.ok(rule.consequence && rule.consequence.endsWith('.'), rule.id);

  const knowledge = loadKnowledge();
  let fixesChecked = 0;
  for (const pattern of knowledge.patterns) {
    for (const provider of knowledge.providers) {
      const document = scaffold({ slots: knowledge.slots, pattern, provider });
      const reviewed = review(buildModel(document).model);
      for (const finding of reviewed.findings) {
        assert.equal(finding.consequence, RULES.find((r) => r.id === finding.rule).consequence);
        assert.ok(Array.isArray(finding.fixes));
        if (!finding.fixes.length) continue;
        for (const fix of finding.fixes) assert.ok(fix.summary && ['component', 'connection'].includes(fix.target), finding.id);
        const preview = previewPatches(document, finding.fixes);
        assert.ok(preview.findings.closed.some((closed) => closed.id === finding.id), `${pattern.id}/${provider.id}: ${finding.id} is closed by its own fix`);
        assert.ok(preview.metrics.find((m) => m.metric === 'review_score').change > 0, `${finding.id} raises the score`);
        fixesChecked += 1;
      }
    }
  }
  assert.ok(fixesChecked >= 36, `fixes exercised: ${fixesChecked}`);
});

test('a timeout fix is derived from the authored values, never from a default', () => {
  const document = design();
  document.connections[0].operational = { resilience: { timeout_ms: 500 } };
  document.connections[1].operational = { resilience: { timeout_ms: 400, retries: 2 } };
  const finding = review(buildModel(document).model).findings.find((f) => f.rule === 'timeout-hierarchy');
  // Callee budget: 400 ms x 3 attempts = 1200 ms. Fix: 10% above, rounded up to 50 ms = 1350 ms.
  assert.deepEqual(finding.fixes, [{ target: 'connection', id: 'web-api', operational: { resilience: { timeout_ms: 1350 } }, summary: 'Raise the timeout on web-api to 1350 ms' }]);
  assert.ok(previewPatches(document, finding.fixes).findings.closed.some((f) => f.id === finding.id));
});
