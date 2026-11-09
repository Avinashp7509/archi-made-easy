// Review rule tests. Every rule in the registry has one fixture that must trigger it and
// one that must not; the last test fails if a rule is added without both.
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildModel } from '../archi-made-easy/workbench/model.mjs';
import { review, RULES, WEIGHTS, PILLARS } from '../archi-made-easy/workbench/review.mjs';

/** A sound baseline: redundant tiers, breaker, encrypted data with recovery objectives. */
function sound() {
  return {
    schema_version: 1, diagram_type: 'architecture', meta: { title: 'Sound', output: 's.html' },
    components: [
      { id: 'web', type: 'frontend', label: 'Web', operational: { role: 'ingress', redundancy: 'multi-az', sla_percent: 99.99, capacity: { baseline_rps: 200, max_rps: 2000 }, latency: { p50_ms: 5, p99_ms: 30 }, security: { public_exposed: true } } },
      { id: 'api', type: 'backend', label: 'API', operational: { role: 'stateless-compute', redundancy: 'multi-az', sla_percent: 99.95, capacity: { max_rps: 1000 }, latency: { p50_ms: 20, p99_ms: 120 } } },
      { id: 'db', type: 'database', label: 'DB', operational: { role: 'stateful-db', redundancy: 'multi-az', sla_percent: 99.95, capacity: { max_rps: 2000 }, latency: { p50_ms: 5, p99_ms: 40 }, dr: { rpo_sec: 5, rto_sec: 60 }, security: { encryption_at_rest: true, auth_method: 'iam' } } },
    ],
    connections: [
      { id: 'web-api', from: 'web', to: 'api', operational: { call_semantics: 'sync-blocking', resilience: { timeout_ms: 3000 } } },
      { id: 'api-db', from: 'api', to: 'db', operational: { call_semantics: 'sync-blocking', resilience: { timeout_ms: 1000, retries: 1 } } },
    ],
  };
}
const run = (document, inputs) => review(buildModel(document).model, inputs);
const rules = (result) => [...new Set(result.findings.map((f) => f.rule))].sort();
const edit = (mutate) => { const d = sound(); mutate(d); return d; };

/** rule id -> [document that must trigger it, document that must not] */
const FIXTURES = {
  spof: [edit((d) => { d.components[1].operational.redundancy = 'single-instance'; }), sound()],
  'deep-sync-chain': [edit((d) => {
    d.components.push(...['s2', 's3', 's4'].map((id) => ({ id, type: 'backend', label: id, operational: { role: 'stateless-compute', redundancy: 'multi-az' } })));
    d.connections = [
      { id: 'e1', from: 'web', to: 'api', operational: { call_semantics: 'sync-blocking' } },
      { id: 'e2', from: 'api', to: 's2', operational: { call_semantics: 'sync-blocking' } },
      { id: 'e3', from: 's2', to: 's3', operational: { call_semantics: 'sync-blocking' } },
      { id: 'e4', from: 's3', to: 's4', operational: { call_semantics: 'sync-blocking' } },
      { id: 'e5', from: 's4', to: 'db', operational: { call_semantics: 'sync-blocking' } },
    ];
  }), sound()],
  'timeout-hierarchy': [edit((d) => { d.connections[0].operational.resilience.timeout_ms = 1500; }), sound()], // 1500 < 1000 * 2
  'unprotected-async-consumer': [
    edit((d) => { d.components.push({ id: 'q', type: 'messagebus', label: 'Queue', operational: { role: 'message-broker', redundancy: 'multi-az' } }); d.connections.push({ id: 'api-q', from: 'api', to: 'q', operational: { call_semantics: 'async-queue' } }); }),
    edit((d) => { d.components.push({ id: 'q', type: 'messagebus', label: 'Queue', operational: { role: 'message-broker', redundancy: 'multi-az' } }); d.connections.push({ id: 'api-q', from: 'api', to: 'q', operational: { call_semantics: 'async-queue', resilience: { idempotent: true } } }); }),
  ],
  'zero-trust-violation': [
    edit((d) => { d.components[2].operational.security.auth_method = 'none'; d.connections.push({ id: 'web-db', from: 'web', to: 'db', operational: { call_semantics: 'sync-blocking' } }); }),
    edit((d) => { d.connections.push({ id: 'web-db', from: 'web', to: 'db', operational: { call_semantics: 'sync-blocking' } }); }), // db requires IAM
  ],
  'chatty-cross-boundary-egress': [
    edit((d) => { d.boundaries = [{ id: 'r1', kind: 'region', label: 'Region 1', wraps: ['web', 'api'], operational: { scope: 'region' } }, { id: 'r2', kind: 'region', label: 'Region 2', wraps: ['db'], operational: { scope: 'region' } }]; d.connections[1].operational.traffic = { payload_kb: 8, egress_cost_per_gb_usd: 0.02 }; }),
    edit((d) => { d.boundaries = [{ id: 'r1', kind: 'region', label: 'Region 1', wraps: ['web', 'api', 'db'], operational: { scope: 'region' } }]; d.connections[1].operational.traffic = { payload_kb: 8, egress_cost_per_gb_usd: 0.02 }; }),
  ],
  'missing-recovery-objectives': [edit((d) => { delete d.components[2].operational.dr; }), sound()],
  'idle-over-provisioning': [edit((d) => { d.components[1].operational.capacity = { max_rps: 1000, autoscale_min: 4, autoscale_max: 8 }; }), sound()], // 200 / 8000 = 2.5%
  'unencrypted-data-store': [edit((d) => { d.components[2].operational.security.encryption_at_rest = false; }), sound()],
  // single-instance API: 0.9995 on the path, about 99.95% composite, below a 99.99% target
  'requirement-availability': [edit((d) => { d.components[1].operational.redundancy = 'single-instance'; d.workbench = { requirements: { availability_target_percent: 99.99 } }; }), edit((d) => { d.workbench = { requirements: { availability_target_percent: 99.9 } }; })],
  'requirement-latency': [edit((d) => { d.workbench = { requirements: { p99_latency_ms: 50 } }; }), edit((d) => { d.workbench = { requirements: { p99_latency_ms: 5000 } }; })],
  'requirement-capacity': [edit((d) => { d.workbench = { requirements: { peak_rps: 5000 } }; }), edit((d) => { d.workbench = { requirements: { peak_rps: 500 } }; })],
  'requirement-recovery': [edit((d) => { d.workbench = { requirements: { rpo_sec: 1, rto_sec: 30 } }; }), edit((d) => { d.workbench = { requirements: { rpo_sec: 60, rto_sec: 600 } }; })],
  'requirement-budget': [
    edit((d) => { d.components[1].operational.finops = { monthly_base_cost_usd: 900 }; d.workbench = { requirements: { monthly_budget_usd: 500 } }; }),
    edit((d) => { d.components[1].operational.finops = { monthly_base_cost_usd: 900 }; d.workbench = { requirements: { monthly_budget_usd: 5000 } }; }),
  ],
};

test('a sound design has no findings and scores 100', () => {
  const result = run(sound());
  assert.deepEqual(result.findings, []);
  assert.equal(result.score, 100);
  assert.deepEqual(Object.keys(result.pillars), [...PILLARS]);
  assert.equal(result.kind, 'analytical-model');
});

for (const [rule, [bad, good]] of Object.entries(FIXTURES)) {
  test(`rule ${rule}: fires on its failing fixture and stays quiet on its passing fixture`, () => {
    const failing = run(bad);
    assert.ok(rules(failing).includes(rule), `${rule} should fire; got ${rules(failing).join(', ') || 'nothing'}`);
    const finding = failing.findings.find((f) => f.rule === rule);
    for (const key of ['id', 'pillar', 'severity', 'evidence', 'remediation', 'basis']) assert.ok(finding[key], `${rule}: finding needs ${key}`);
    assert.ok(Array.isArray(finding.affectedNodes));
    assert.ok(['authored', 'assumed'].includes(finding.basis));
    assert.ok(failing.score < 100);
    assert.equal(rules(run(good)).includes(rule), false, `${rule} should not fire on its passing fixture`);
  });
}

test('every implemented rule has a failing and a passing fixture', () => {
  assert.deepEqual(Object.keys(FIXTURES).sort(), RULES.map((r) => r.id).sort());
  for (const rule of RULES) {
    assert.equal(rule.status, 'implemented');
    assert.ok(rule.pillars.every((pillar) => PILLARS.includes(pillar)), rule.id);
    assert.ok(WEIGHTS[rule.severity], rule.id);
  }
  const covered = new Set(RULES.flatMap((rule) => rule.pillars));
  assert.deepEqual([...covered].sort(), [...PILLARS].sort(), 'every pillar has at least one rule');
});

test('score: authored findings count in full, assumed findings count half', () => {
  const authored = run(FIXTURES['timeout-hierarchy'][0]);
  assert.equal(authored.findings.length, 1);
  assert.equal(authored.findings[0].basis, 'authored');
  assert.equal(authored.score, 100 - WEIGHTS.high);
  assert.equal(authored.pillars.Reliability.score, 100 - WEIGHTS.high);
  assert.equal(authored.pillars.Security.score, 100);

  // The same structure with no operational data: roles and redundancy are inferred.
  const bare = { schema_version: 1, diagram_type: 'architecture', meta: { title: 'Bare', output: 'b.html' }, components: [{ id: 'web', type: 'frontend', label: 'Web' }, { id: 'api', type: 'backend', label: 'API' }], connections: [{ from: 'web', to: 'api' }] };
  const assumed = run(bare);
  assert.ok(assumed.findings.length > 0);
  assert.ok(assumed.findings.every((f) => f.basis === 'assumed'));
  const expected = 100 - assumed.findings.reduce((sum, f) => sum + WEIGHTS[f.severity] / 2, 0);
  assert.equal(assumed.score, expected);
  assert.equal(assumed.basis.assumed_findings, assumed.findings.length);
});

test('findings are ordered by severity and are deterministic', () => {
  const doc = edit((d) => { d.components[1].operational.redundancy = 'single-instance'; d.components[2].operational.security.auth_method = 'none'; d.connections.push({ id: 'web-db', from: 'web', to: 'db', operational: { call_semantics: 'sync-blocking' } }); delete d.components[2].operational.dr; });
  const result = run(doc);
  const order = { critical: 0, high: 1, medium: 2, low: 3 };
  const severities = result.findings.map((f) => order[f.severity]);
  assert.deepEqual(severities, [...severities].sort((a, b) => a - b));
  assert.equal(result.findings[0].rule, 'zero-trust-violation');
  assert.equal(JSON.stringify(run(doc)), JSON.stringify(result));
  assert.equal(result.counts.critical, 1);
});

test('numeric rules do not fire on assumed numbers', () => {
  const doc = sound();
  for (const connection of doc.connections) delete connection.operational.resilience;
  delete doc.components[0].operational.capacity.baseline_rps;
  const result = run(doc);
  for (const rule of ['timeout-hierarchy', 'idle-over-provisioning', 'chatty-cross-boundary-egress']) assert.equal(rules(result).includes(rule), false, rule);
});

test('the rules reference lists exactly the implemented rules', async () => {
  const fs = await import('node:fs');
  const text = fs.readFileSync(new URL('../archi-made-easy/references/arb-well-architected-rules.md', import.meta.url), 'utf8');
  const documented = [...text.matchAll(/^\| `([a-z-]+)` \|/gm)].map((m) => m[1]).sort();
  assert.deepEqual(documented, RULES.map((r) => r.id).sort());
  for (const rule of RULES) {
    const row = text.split('\n').find((line) => line.startsWith(`| \`${rule.id}\` |`));
    assert.ok(row.includes(rule.pillars[0]), `${rule.id}: pillar`);
    assert.ok(row.includes(rule.severity), `${rule.id}: severity`);
  }
  assert.match(text, /critical 15, high 8, medium 4, low 1/);
});
