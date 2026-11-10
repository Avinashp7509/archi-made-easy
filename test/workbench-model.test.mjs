import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildModel, applyAlternative, lognormalP95 } from '../archi-made-easy/workbench/model.mjs';
import { inferRole, inferCallSemantics, ROLE_DEFAULTS } from '../archi-made-easy/workbench/defaults.mjs';

const skillRoot = fileURLToPath(new URL('../archi-made-easy/', import.meta.url));
const example = (name) => JSON.parse(fs.readFileSync(path.join(skillRoot, 'examples', name), 'utf8'));

function doc(extra = {}) {
  return {
    schema_version: 1, diagram_type: 'architecture', meta: { title: 'T', output: 't.html' },
    components: [
      { id: 'web', type: 'frontend', label: 'Web app' },
      { id: 'gw', type: 'backend', label: 'API Gateway' },
      { id: 'svc', type: 'backend', label: 'Orders service' },
      { id: 'db', type: 'database', label: 'Orders DB' },
      { id: 'cache', type: 'database', label: 'Redis cache' },
      { id: 'bus', type: 'messagebus', label: 'Kafka', sublabel: 'events' },
      { id: 'llm', type: 'external', label: 'LLM provider' },
    ],
    connections: [
      { id: 'c1', from: 'web', to: 'gw' },
      { id: 'c2', from: 'gw', to: 'svc' },
      { id: 'c3', from: 'svc', to: 'db' },
      { id: 'c4', from: 'svc', to: 'cache' },
      { id: 'c5', from: 'svc', to: 'bus' },
      { from: 'svc', to: 'llm' },
    ],
    ...extra,
  };
}

test('roles are inferred from type and keywords, and marked assumed', () => {
  const { model, diagnostics } = buildModel(doc());
  assert.deepEqual(diagnostics, []);
  const role = Object.fromEntries(model.nodes.map((n) => [n.id, n.role]));
  assert.deepEqual(role, { web: 'ingress', gw: 'gateway', svc: 'stateless-compute', db: 'stateful-db', cache: 'cache', bus: 'stream', llm: 'ai-model' });
  for (const node of model.nodes) assert.equal(node.basis.role, 'assumed');
  assert.equal(model.authored, false);
  assert.deepEqual(model.entrypoints, ['web']);
  assert.equal(model.entrypointsBasis, 'assumed');
});

test('defaults fill missing values and every filled value is labelled assumed', () => {
  const { model } = buildModel(doc());
  const db = model.nodes.find((n) => n.id === 'db');
  assert.equal(db.sla_percent, ROLE_DEFAULTS['stateful-db'].sla_percent);
  assert.equal(db.basis.sla_percent, 'assumed');
  assert.equal(db.capacity.max_rps, 2000);
  assert.equal(db.basis['capacity.max_rps'], 'assumed');
  assert.equal(db.capacity.baseline_rps, null, 'no default load is invented');
  assert.equal(db.finops.monthly_base_cost_usd, null, 'no default price is invented');
  assert.equal(db.dr.rto_sec, null);
  const web = model.nodes.find((n) => n.id === 'web');
  assert.equal(web.security.public_exposed, true);
  assert.equal(web.basis['security.public_exposed'], 'assumed');
});

test('authored values win and are labelled authored', () => {
  const d = doc();
  d.components[3].operational = { role: 'stateful-db', sla_percent: 99.99, redundancy: 'multi-az', capacity: { max_rps: 5000, autoscale_min: 2, autoscale_max: 4 }, latency: { p50_ms: 3, p95_ms: 12, p99_ms: 40 } };
  const { model, diagnostics } = buildModel(d);
  assert.deepEqual(diagnostics, []);
  const db = model.nodes.find((n) => n.id === 'db');
  assert.equal(db.sla_percent, 99.99);
  assert.equal(db.basis.sla_percent, 'authored');
  assert.equal(db.redundancy, 'multi-az');
  assert.equal(db.capacity.autoscale_max, 4);
  assert.equal(db.latency.p95_ms, 12);
  assert.equal(db.basis['latency.p95_ms'], 'authored');
  assert.equal(model.authored, true);
});

test('call semantics follow the target role unless authored', () => {
  const { model } = buildModel(doc());
  const edge = (id) => model.edges.find((e) => e.id === id);
  assert.equal(edge('c3').call_semantics, 'sync-blocking');
  assert.equal(edge('c5').call_semantics, 'event-stream');
  assert.equal(inferCallSemantics('message-broker'), 'async-queue');
  assert.equal(edge('rel-5').idAuthored, false, 'connections without ids get stable synthetic ids');
});

test('p95 is derived from p50 and p99 under a lognormal fit when not authored', () => {
  assert.ok(Math.abs(lognormalP95(10, 10) - 10) < 1e-9);
  // mu = ln 20, sigma = (ln 200 - ln 20) / 2.3263 = 0.98979; p95 = exp(mu + 1.6449 * sigma) = 101.88
  const p95 = lognormalP95(20, 200);
  assert.ok(Math.abs(p95 - 101.88) < 0.05, `p95 ${p95}`);
  assert.equal(lognormalP95(0, 10), null);
});

test('cross-references are checked', () => {
  const d = doc({ workbench: { entrypoints: ['nope'], traces: [{ id: 't', title: 'T', kind: 'happy', steps: [{ edge: 'missing' }] }] } });
  d.connections[2].operational = { resilience: { fallback_edge_id: 'c4', dlq_node_id: 'ghost' } };
  d.connections[0].operational = { resilience: { fallback_edge_id: 'zzz' } };
  d.components[2].operational = { drilldown_diagram_id: 'inner', latency: { p50_ms: 50, p99_ms: 10 }, capacity: { autoscale_min: 5, autoscale_max: 2 } };
  const codes = buildModel(d).diagnostics.map((x) => `${x.code}:${x.subject.reference ?? x.subject.node ?? ''}`).sort();
  assert.deepEqual(codes, [
    'workbench/autoscale-range:svc',
    'workbench/latency-order:svc',
    'workbench/unknown-reference:ghost',
    'workbench/unknown-reference:inner',
    'workbench/unknown-reference:missing',
    'workbench/unknown-reference:nope',
    'workbench/unknown-reference:zzz',
  ]);
});

test('a fallback must start at the same component', () => {
  const d = doc();
  d.connections[2].operational = { resilience: { fallback_edge_id: 'c1' } };
  assert.deepEqual(buildModel(d).diagnostics.map((x) => x.code), ['workbench/fallback-source']);
});

test('boundaries carry scope and trust zones to their members', () => {
  const d = doc({ boundaries: [
    { kind: 'security-group', label: 'PCI zone', wraps: ['db'] },
    { id: 'east', kind: 'region', label: 'East US region', wraps: ['svc', 'db'], operational: { scope: 'region' } },
    { kind: 'region', label: 'Backend', wraps: ['gw'] },
  ] });
  const { model } = buildModel(d);
  const [pci, east, plain] = model.boundaries;
  assert.equal(pci.scope, 'trust-zone');
  assert.equal(pci.basis.scope, 'assumed');
  assert.equal(east.id, 'east');
  assert.equal(east.basis.scope, 'authored');
  assert.equal(plain.scope, null, 'a visual grouping is not assumed to be a failure domain');
  const db = model.nodes.find((n) => n.id === 'db');
  assert.deepEqual(db.boundaries, ['boundary-0', 'east']);
  assert.equal(db.security.trust_zone, 'PCI zone');
});

test('alternatives override operational fields without touching others', () => {
  const d = doc({ workbench: { alternatives: [{ id: 'ha', title: 'HA database', component_overrides: [{ id: 'db', operational: { redundancy: 'multi-az' } }] }] } });
  d.components[3].operational = { sla_percent: 99.95 };
  const changed = applyAlternative(d, 'ha');
  const db = changed.components.find((c) => c.id === 'db');
  assert.deepEqual(db.operational, { sla_percent: 99.95, redundancy: 'multi-az' });
  assert.equal(d.components[3].operational.redundancy, undefined, 'the original document is not mutated');
  assert.throws(() => applyAlternative(d, 'nope'), /unknown alternative/);
});

// Architecture examples authored with operational data (the flagship examples). Every other
// bundled architecture example is inherited and carries none.
const FLAGSHIP_EXAMPLES = new Set(['global-fintech-payment-mesh.architecture.json', 'enterprise-agentic-ai-platform.architecture.json', 'cloud-native-ecommerce-c4.architecture.json']);

test('every bundled architecture example builds a model without errors', () => {
  const names = fs.readdirSync(path.join(skillRoot, 'examples')).filter((f) => f.endsWith('.architecture.json'));
  for (const flagship of FLAGSHIP_EXAMPLES) assert.ok(names.includes(flagship), `${flagship} is bundled`);
  for (const name of names) {
    const { model, diagnostics } = buildModel(example(name));
    assert.deepEqual(diagnostics, [], name);
    assert.ok(model.nodes.length > 0, name);
    assert.equal(model.authored, FLAGSHIP_EXAMPLES.has(name), `${name}: ${FLAGSHIP_EXAMPLES.has(name) ? 'a flagship states its operational data' : 'an inherited example has none'}`);
    for (const node of model.nodes) assert.ok(node.role, `${name}/${node.id}`);
  }
});

test('model building is deterministic', () => {
  const a = JSON.stringify(buildModel(doc()).model);
  const b = JSON.stringify(buildModel(doc()).model);
  assert.equal(a, b);
  assert.equal(inferRole({ type: 'cloud', label: 'Azure Front Door' }), 'cdn');
});

test('duplicate list values are reported (schemas avoid uniqueItems to stay dependency-free)', () => {
  const d = doc({ workbench: { entrypoints: ['web', 'web'], requirements: { compliance: ['PCI-DSS', 'PCI-DSS'] } } });
  d.components[3].operational = { security: { compliance_tags: ['GDPR', 'GDPR'] } };
  const codes = buildModel(d).diagnostics.filter((x) => x.code === 'workbench/duplicate-value').map((x) => x.subject.reference).sort();
  assert.deepEqual(codes, ['GDPR', 'PCI-DSS', 'web']);
});

test('inferred entry points prefer edge-facing components that nothing calls', () => {
  const d = doc();
  d.components.push({ id: 'cdn', type: 'cloud', label: 'CDN' });
  d.connections[0] = { id: 'c1', from: 'web', to: 'cdn' };
  d.connections.push({ id: 'c0', from: 'cdn', to: 'gw' });
  const { model } = buildModel(d);
  assert.equal(model.nodes.find((n) => n.id === 'cdn').role, 'cdn');
  assert.deepEqual(model.entrypoints, ['web'], 'the CDN receives traffic, so it is not an entry');
  const authored = buildModel({ ...d, workbench: { entrypoints: ['cdn'] } }).model;
  assert.deepEqual(authored.entrypoints, ['cdn']);
  assert.equal(authored.entrypointsBasis, 'authored');
});

test('an external entry component is an actor with no availability, capacity or latency of its own', () => {
  const d = doc();
  d.components[0] = { id: 'web', type: 'external', label: 'Users' };
  const { model } = buildModel(d);
  const users = model.nodes.find((n) => n.id === 'web');
  assert.equal(users.role, 'ingress');
  assert.equal(users.actor, true);
  assert.equal(users.sla_percent, null);
  assert.equal(users.capacity.max_rps, null);
  assert.equal(users.latency.p99_ms, null);
  assert.equal(users.redundancy, null);
  assert.equal(model.nodes.find((n) => n.id === 'gw').actor, false);
});

test('the capacity reference documents every role default', async () => {
  const fsMod = await import('node:fs');
  const text = fsMod.readFileSync(new URL('../archi-made-easy/references/capacity-latency-and-finops.md', import.meta.url), 'utf8');
  for (const [role, d] of Object.entries(ROLE_DEFAULTS)) {
    const row = text.split('\n').find((line) => line.startsWith('|') && line.split('|')[1].split(',').map((s) => s.trim()).includes(role));
    assert.ok(row, `${role} is documented`);
    const cells = row.split('|').map((c) => c.trim());
    assert.equal(Number(cells[2]), d.sla_percent, `${role} SLA`);
    assert.equal(Number(cells[3].replaceAll(',', '')), d.max_rps, `${role} max RPS`);
    assert.equal(Number(cells[4]), d.p50_ms, `${role} P50`);
    assert.equal(Number(cells[5].replaceAll(',', '')), d.p99_ms, `${role} P99`);
    assert.equal(cells[6], d.redundancy, `${role} redundancy`);
  }
});
