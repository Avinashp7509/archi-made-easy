// The browser copy of the workbench engine (viewer/workbench-engine.js) is generated from
// the modules in archi-made-easy/workbench/. These tests run both copies on the same
// inputs and require identical output, so a figure in the page always equals the figure
// the command line prints.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadKnowledge } from '../archi-made-easy/bin/workbench.mjs';
import { scaffold } from '../archi-made-easy/workbench/scaffold.mjs';
import { buildModel, applyAlternative } from '../archi-made-easy/workbench/model.mjs';
import { simulate, FAULT_STATES } from '../archi-made-easy/workbench/sim.mjs';
import { estimateCost } from '../archi-made-easy/workbench/cost.mjs';
import { buildScenarios, runScenario, breachReach } from '../archi-made-easy/workbench/scenarios.mjs';
import { buildFmea } from '../archi-made-easy/workbench/fmea.mjs';
import { review, RULES, PILLARS } from '../archi-made-easy/workbench/review.mjs';
import { compareDesigns, compareAlternatives } from '../archi-made-easy/workbench/compare.mjs';
import { applyPatches, figures, compareFigures, previewPatches, recoveryOptions, recoveryPlan } from '../archi-made-easy/workbench/remedy.mjs';
import { toMermaidMarkdown } from '../archi-made-easy/workbench/exporters/mermaid.mjs';
import { toDrawio } from '../archi-made-easy/workbench/exporters/drawio.mjs';
import { toStructurizr } from '../archi-made-easy/workbench/exporters/structurizr.mjs';
import { toRfc } from '../archi-made-easy/workbench/exporters/rfc.mjs';
import { buildEngine, generateWorkbenchEngine, ENGINE_API, ENGINE_MODULES } from '../scripts/generate-workbench-engine.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fragmentPath = path.join(repoRoot, 'viewer', 'workbench-engine.js');
const source = {
  buildModel, applyAlternative, simulate, FAULT_STATES, estimateCost, buildScenarios, runScenario, breachReach,
  buildFmea, review, RULES, PILLARS, compareDesigns, compareAlternatives, toMermaidMarkdown, toDrawio, toStructurizr, toRfc,
  applyPatches, figures, compareFigures, previewPatches, recoveryOptions, recoveryPlan,
};

function loadFragment() {
  const namespace = {};
  // The fragment is a classic script that assigns ArchiMadeEasy.workbenchEngine.
  // eslint-disable-next-line no-new-func
  new Function('ArchiMadeEasy', fs.readFileSync(fragmentPath, 'utf8'))(namespace);
  return namespace.workbenchEngine;
}
// JSON round trip: the comparison is on values, independent of prototype identity.
const plain = (value) => JSON.parse(JSON.stringify(value));

const knowledge = loadKnowledge();
const documents = [];
for (const pattern of knowledge.patterns) {
  for (const provider of knowledge.providers) {
    documents.push({ name: `${pattern.id}/${provider.id}`, document: scaffold({ slots: knowledge.slots, pattern, provider }) });
  }
}

function authored() {
  return {
    schema_version: 1, diagram_type: 'architecture', meta: { title: 'Authored parity fixture', output: 'p.html' },
    layout: { mode: 'grid' },
    components: [
      { id: 'web', type: 'frontend', label: 'Web', row: 0, col: 0, operational: { role: 'ingress', capacity: { baseline_rps: 300, max_rps: 5000 }, security: { public_exposed: true } } },
      { id: 'api', type: 'backend', label: 'API', row: 0, col: 1, operational: { sla_percent: 99.9, redundancy: 'multi-az', capacity: { max_rps: 200, autoscale_min: 2, autoscale_max: 8 }, latency: { p50_ms: 30, p99_ms: 180 }, finops: { monthly_base_cost_usd: 120, cost_per_million_requests_usd: 0.6 }, security: { auth_method: 'jwt' } } },
      { id: 'cache', type: 'database', label: 'Redis cache', row: 1, col: 1, operational: { role: 'cache', capacity: { max_rps: 40000 } } },
      { id: 'db', type: 'database', label: 'Orders DB', row: 0, col: 2, operational: { sla_percent: 99.95, redundancy: 'active-passive-dr', capacity: { max_rps: 900 }, latency: { p50_ms: 5, p99_ms: 40 }, dr: { rpo_sec: 60, rto_sec: 300 }, finops: { monthly_base_cost_usd: 380, storage_gb: 100, storage_cost_per_gb_usd: 0.12 } } },
      { id: 'queue', type: 'messagebus', label: 'Jobs', row: 1, col: 2 },
      { id: 'worker', type: 'backend', label: 'Worker', row: 1, col: 3, operational: { capacity: { max_rps: 50, autoscale_min: 1, autoscale_max: 4 } } },
    ],
    boundaries: [{ id: 'zone', kind: 'region', label: 'Zone A', wraps: ['api', 'cache', 'db'], operational: { scope: 'availability-zone' } }],
    connections: [
      { id: 'web-api', from: 'web', to: 'api', operational: { resilience: { timeout_ms: 2000, retries: 1 } } },
      { id: 'api-cache', from: 'api', to: 'cache', operational: { resilience: { circuit_breaker_enabled: true } } },
      { id: 'api-db', from: 'api', to: 'db', operational: { resilience: { timeout_ms: 800, retries: 2 }, traffic: { read_write_ratio: 0.8, payload_kb: 3 } } },
      { id: 'api-queue', from: 'api', to: 'queue', operational: { traffic: { request_multiplier: 0.2 } } },
      { id: 'queue-worker', from: 'queue', to: 'worker' },
    ],
    workbench: {
      alternatives: [{ id: 'single-zone-db', title: 'Single-instance database', component_overrides: [{ id: 'db', operational: { redundancy: 'single-instance' } }] }],
      traces: [{ id: 'order', title: 'Place an order', kind: 'happy', steps: [{ edge: 'web-api' }, { edge: 'api-db', note: 'write the order' }] }],
    },
  };
}
documents.push({ name: 'authored fixture', document: authored() });

test('the committed engine fragment is what the generator produces now', () => {
  assert.equal(fs.readFileSync(fragmentPath, 'utf8').replace(/\r\n/g, '\n'), buildEngine());
  assert.doesNotThrow(() => generateWorkbenchEngine({ check: true }));
});

test('the fragment exposes exactly the declared interface and no literal the artifact gate counts', () => {
  const engine = loadFragment();
  assert.deepEqual(Object.keys(engine).sort(), Object.keys(ENGINE_API).sort());
  assert.deepEqual(Object.keys(source).sort(), Object.keys(ENGINE_API).sort(), 'this test covers every exported name');
  const text = fs.readFileSync(fragmentPath, 'utf8');
  assert.equal(text.includes('<svg'), false);
  assert.equal(/<\/script/i.test(text), false);
  assert.equal(/\bimport\s|\bexport\s|\brequire\(|\bprocess\./.test(text.replace(/\/\/.*$/gm, '')), false, 'no module or Node syntax');
  for (const module of ENGINE_MODULES) assert.ok(fs.existsSync(path.join(repoRoot, 'archi-made-easy', 'workbench', module)), module);
});

test('constants are identical', () => {
  const engine = loadFragment();
  assert.deepEqual(plain(engine.FAULT_STATES), plain(FAULT_STATES));
  assert.deepEqual(plain(engine.PILLARS), plain(PILLARS));
  assert.deepEqual(plain(engine.RULES.map((rule) => ({ ...rule, check: undefined }))), plain(RULES.map((rule) => ({ ...rule, check: undefined }))));
});

test('model, simulation, scenarios, failure modes, cost and review are identical on every pattern and provider', () => {
  const engine = loadFragment();
  assert.equal(documents.length, knowledge.patterns.length * knowledge.providers.length + 1);
  for (const { name, document } of documents) {
    const a = buildModel(document);
    const b = engine.buildModel(document);
    assert.deepEqual(plain(b), plain(a), `${name}: model`);
    const inputs = [
      {},
      { multiplier: 10 },
      { multiplier: 3, cacheHit: 0.8 },
      { faults: { nodes: { [a.model.nodes.at(-1).id]: 'down' } } },
      { faults: { nodes: { [a.model.nodes[1].id]: 'brownout' }, edges: { [a.model.edges[0].id]: 'partitioned' } } },
      ...(a.model.boundaries.length ? [{ faults: { boundaries: { [a.model.boundaries[0].id]: 'down' } } }] : []),
    ];
    for (const input of inputs) {
      const expected = simulate(a.model, input);
      const actual = engine.simulate(b.model, input);
      assert.deepEqual(plain(actual), plain(expected), `${name}: simulate ${JSON.stringify(input)}`);
      assert.deepEqual(plain(engine.estimateCost(b.model, actual)), plain(estimateCost(a.model, expected)), `${name}: cost`);
    }
    const scenarios = buildScenarios(a.model);
    assert.deepEqual(plain(engine.buildScenarios(b.model)), plain(scenarios), `${name}: scenarios`);
    for (const scenario of scenarios.filter((s) => s.applicable)) {
      assert.deepEqual(plain(engine.runScenario(b.model, scenario)), plain(runScenario(a.model, scenario)), `${name}: scenario ${scenario.id}`);
    }
    for (const node of a.model.nodes.slice(0, 2)) {
      assert.deepEqual(plain(engine.breachReach(b.model, node.id)), plain(breachReach(a.model, node.id)), `${name}: breach ${node.id}`);
    }
    assert.deepEqual(plain(engine.buildFmea(b.model)), plain(buildFmea(a.model)), `${name}: fmea`);
    assert.deepEqual(plain(engine.review(b.model)), plain(review(a.model)), `${name}: review`);
    assert.deepEqual(plain(engine.review(b.model, { multiplier: 5, cacheHit: 0.5 })), plain(review(a.model, { multiplier: 5, cacheHit: 0.5 })), `${name}: review under load`);
  }
});

test('exports are byte-identical', () => {
  const engine = loadFragment();
  for (const { name, document } of documents) {
    const a = buildModel(document).model;
    const b = engine.buildModel(document).model;
    assert.equal(engine.toMermaidMarkdown(b), toMermaidMarkdown(a), `${name}: mermaid`);
    assert.equal(engine.toDrawio(document, b), toDrawio(document, a), `${name}: drawio`);
    assert.equal(engine.toStructurizr(b), toStructurizr(a), `${name}: structurizr`);
    assert.equal(engine.toRfc(document, b), toRfc(document, a), `${name}: rfc`);
  }
});

test('alternatives and design comparison are identical', () => {
  const engine = loadFragment();
  const document = authored();
  assert.deepEqual(plain(engine.compareAlternatives(document)), plain(compareAlternatives(document)));
  assert.deepEqual(plain(engine.applyAlternative(document, 'single-zone-db')), plain(applyAlternative(document, 'single-zone-db')));
  const base = buildModel(document).model;
  const head = buildModel(applyAlternative(document, 'single-zone-db')).model;
  assert.deepEqual(
    plain(engine.compareDesigns(engine.buildModel(document).model, engine.buildModel(engine.applyAlternative(document, 'single-zone-db')).model)),
    plain(compareDesigns(base, head)),
  );
});

test('what-if edits, previews and recovery plans are identical', () => {
  const engine = loadFragment();
  const document = authored();
  const patches = [{ target: 'component', id: 'db', operational: { redundancy: 'multi-az' } }, { target: 'connection', id: 'api-db', operational: { resilience: { circuit_breaker_enabled: true } } }];
  assert.deepEqual(plain(engine.applyPatches(document, patches)), plain(applyPatches(document, patches)));
  for (const inputs of [{}, { faults: { nodes: { db: 'down' } } }, { faults: { boundaries: { zone: 'down' } } }, { multiplier: 20, cacheHit: 0.5 }]) {
    const model = buildModel(document).model;
    assert.deepEqual(plain(engine.figures(engine.buildModel(document).model, inputs)), plain(figures(model, inputs)), JSON.stringify(inputs));
    assert.deepEqual(plain(engine.compareFigures(engine.figures(engine.buildModel(document).model, {}), engine.figures(engine.buildModel(document).model, inputs))), plain(compareFigures(figures(model, {}), figures(model, inputs))));
    assert.deepEqual(plain(engine.previewPatches(document, patches, inputs)), plain(previewPatches(document, patches, inputs)));
    assert.deepEqual(plain(engine.recoveryOptions(engine.buildModel(document).model, engine.simulate(engine.buildModel(document).model, inputs))), plain(recoveryOptions(model, simulate(model, inputs))));
    assert.deepEqual(plain(engine.recoveryPlan(document, inputs)), plain(recoveryPlan(document, inputs)));
  }
  for (const { name, document: scaffolded } of documents.slice(0, 12)) {
    const target = buildModel(scaffolded).model.nodes.at(-1).id;
    const inputs = { faults: { nodes: { [target]: 'down' } } };
    assert.deepEqual(plain(engine.recoveryPlan(scaffolded, inputs)), plain(recoveryPlan(scaffolded, inputs)), name);
  }
});

test('a module the generator cannot translate is rejected, not silently dropped', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'archi-made-easy-engine-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const workbench = path.join(root, 'archi-made-easy', 'workbench');
  fs.cpSync(path.join(repoRoot, 'archi-made-easy', 'workbench'), workbench, { recursive: true });
  fs.mkdirSync(path.join(root, 'viewer'));
  assert.equal(buildEngine({ root }), buildEngine(), 'a copy of the sources builds the same fragment');

  const cost = path.join(workbench, 'cost.mjs');
  const original = fs.readFileSync(cost, 'utf8');
  const line = (text) => `${text}\n`;
  const cases = [
    [line("import * as everything from './sim.mjs';") + original, /import form the generator does not understand/],
    [line("import fs from 'node:fs';") + original, /import form the generator does not understand/],
    [original + line('') + line('export default estimateCost;'), /export form the generator does not understand/],
    [line("import { review } from './review.mjs';") + original, /not earlier in ENGINE_MODULES/],
    [original.replace('export function estimateCost', 'function estimateCost'), /does not export estimateCost/],
    [original + line('') + line("const markup = '<svg>';"), /must not contain the literal/],
    [original + line('') + line('const limit = Infinity;'), /bare names NaN or Infinity/],
  ];
  for (const [text, expected] of cases) {
    fs.writeFileSync(cost, text);
    assert.throws(() => buildEngine({ root }), expected);
    assert.throws(() => generateWorkbenchEngine({ root }), expected);
    assert.equal(fs.existsSync(path.join(root, 'viewer', 'workbench-engine.js')), false, 'nothing is written on failure');
  }
  fs.writeFileSync(cost, original);
  generateWorkbenchEngine({ root });
  assert.doesNotThrow(() => generateWorkbenchEngine({ root, check: true }));
  fs.appendFileSync(cost, line('') + line('// edited'));
  assert.throws(() => generateWorkbenchEngine({ root, check: true }), /stale/);
});
