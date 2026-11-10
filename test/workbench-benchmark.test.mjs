// Regression benchmarks: recorded figures of the flagship examples, time budgets for the
// engine and size budgets for the pages. Budgets are several times what the code needs
// today, so they catch a change of order, not machine noise.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { FLAGSHIPS, RECORD_PATH, currentFigures, providerExamples } from '../scripts/record-flagship-figures.mjs';
import { buildModel } from '../archi-made-easy/workbench/model.mjs';
import { simulate } from '../archi-made-easy/workbench/sim.mjs';
import { review } from '../archi-made-easy/workbench/review.mjs';
import { buildFmea } from '../archi-made-easy/workbench/fmea.mjs';
import { recoveryPlan } from '../archi-made-easy/workbench/remedy.mjs';
import { buildScenarios } from '../archi-made-easy/workbench/scenarios.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const example = (name) => JSON.parse(fs.readFileSync(path.join(root, 'archi-made-easy', 'examples', name), 'utf8'));
const elapsed = (run) => { const started = process.hrtime.bigint(); run(); return Number(process.hrtime.bigint() - started) / 1e6; };

test('the flagship figures equal the recorded benchmark', () => {
  const recorded = JSON.parse(fs.readFileSync(RECORD_PATH, 'utf8'));
  assert.deepEqual(currentFigures(), recorded, 'run `node scripts/record-flagship-figures.mjs`, read the diff, and commit it if the change is intended');
  assert.deepEqual(Object.keys(recorded.examples), [...FLAGSHIPS, ...providerExamples()]);
  assert.equal(providerExamples().length, 4, 'one example per provider pack');
});

test('the recorded benchmark holds what the flagships are meant to show', () => {
  const { examples } = JSON.parse(fs.readFileSync(RECORD_PATH, 'utf8'));
  const [fintech, ai, shop] = FLAGSHIPS.map((name) => examples[name]);
  for (const entry of [fintech, ai, shop]) {
    // Healthy, every flagship answers, has no single point of failure and states its cost.
    assert.ok(entry.healthy.composite_sla_percent > 99.9 && entry.healthy.composite_sla_percent < 100, entry.title);
    assert.equal(entry.healthy.single_points_of_failure, 0, entry.title);
    assert.equal(entry.healthy.affected_components, 0, entry.title);
    assert.ok(entry.healthy.monthly_cost_usd > 0, entry.title);
    // A tenfold load saturates something in each of them.
    assert.ok(entry.scenarios.c.figures.affected_components > 0, `${entry.title}: flash crowd`);
  }
  // Two regions: losing one leaves the mesh answering. One region: losing it stops the shop.
  assert.ok(fintech.scenarios.b.figures.composite_sla_percent > 99, 'the payment mesh survives a region');
  assert.equal(shop.scenarios.b.figures.composite_sla_percent, 0, 'the single-region shop does not');
  assert.equal(shop.scenarios.b.figures.ingress_lost_percent, 100);
  // The agent platform has no region boundary, and its review holds one finding to act on.
  assert.equal(ai.scenarios.b.applicable, false);
  assert.deepEqual(ai.healthy.findings.map((finding) => finding.id.split(':')[0]), ['timeout-hierarchy']);
  // The shop carries three levels, each with figures of its own.
  assert.deepEqual(Object.keys(shop.levels), ['catalog-service', 'checkout-service', 'fulfilment-service']);
  for (const level of Object.values(shop.levels)) assert.equal(level.healthy.review_score, 100, level.title);
});

test('model-quality floors: what a showcase document may not fall below', () => {
  const { examples } = JSON.parse(fs.readFileSync(RECORD_PATH, 'utf8'));
  for (const name of FLAGSHIPS) {
    const { healthy, title } = examples[name];
    assert.ok(healthy.review_score >= 90, `${title}: review score ${healthy.review_score}`);
    assert.ok(healthy.findings.every((finding) => finding.severity !== 'critical'), title);
    // A flagship meets the availability and capacity it asks of itself.
    const requirements = example(name).workbench.requirements;
    assert.ok(healthy.composite_sla_percent >= requirements.availability_target_percent, `${title}: availability`);
    assert.ok(healthy.max_sustainable_rps >= requirements.peak_rps, `${title}: capacity ${healthy.max_sustainable_rps} against a peak of ${requirements.peak_rps}`);
    assert.ok(healthy.critical_path_p99_ms <= requirements.p99_latency_ms, `${title}: latency`);
    if (requirements.monthly_budget_usd != null) assert.ok(healthy.monthly_cost_usd <= requirements.monthly_budget_usd, `${title}: cost`);
  }
  // A provider example is a starting point: its review may hold findings, never a critical one.
  for (const name of providerExamples()) {
    const { healthy, title } = examples[name];
    assert.ok(healthy.review_score >= 80, `${title}: review score ${healthy.review_score}`);
    assert.ok(healthy.findings.every((finding) => finding.severity !== 'critical'), title);
    assert.equal(healthy.affected_components, 0, title);
  }
});

test('the engine stays within its time budget', () => {
  for (const name of FLAGSHIPS) {
    const document = example(name);
    const time = elapsed(() => {
      const { model } = buildModel(document);
      simulate(model, {});
      review(model, {});
      buildFmea(model, {});
      for (const scenario of buildScenarios(model)) if (scenario.applicable) recoveryPlan(document, scenario.inputs);
    });
    assert.ok(time < 1500, `${name}: model, review, failure table and six recovery plans took ${time.toFixed(0)} ms`);
  }
  // A layered graph far larger than a readable diagram: 300 components, 10 layers.
  const layers = 10; const perLayer = 30;
  const components = []; const connections = [];
  for (let layer = 0; layer < layers; layer += 1) {
    for (let index = 0; index < perLayer; index += 1) {
      const id = `n${layer}_${index}`;
      components.push({ id, type: layer === 0 ? 'external' : 'backend', label: id, row: index, col: layer,
        operational: layer === 0 ? { role: 'ingress', capacity: { baseline_rps: 10 } } : { role: 'stateless-compute', sla_percent: 99.9, redundancy: 'multi-az', capacity: { max_rps: 5000 }, latency: { p50_ms: 5, p99_ms: 20 } } });
      if (layer > 0) for (const offset of [0, 1, 7]) connections.push({ id: `e${layer}_${index}_${offset}`, from: `n${layer - 1}_${(index + offset) % perLayer}`, to: id, operational: { resilience: { timeout_ms: 1000 * (layers - layer), retries: 0 } } });
    }
  }
  const large = { schema_version: 1, diagram_type: 'architecture', meta: { title: 'Large', output: 'large.html' }, components, connections };
  let model;
  const build = elapsed(() => { model = buildModel(large).model; });
  const run = elapsed(() => { simulate(model, {}); simulate(model, { multiplier: 10, faults: { nodes: { n5_3: 'down' } } }); });
  assert.equal(model.nodes.length, 300);
  assert.ok(build < 2000 && run < 4000, `300 components: model ${build.toFixed(0)} ms, two simulations ${run.toFixed(0)} ms`);
});

test('rendering stays within its time and size budget', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'archi-made-easy-benchmark-'));
  try {
    const times = {};
    const render = (type, name) => {
      const output = path.join(directory, `${name}.html`);
      const started = process.hrtime.bigint();
      const result = spawnSync(process.execPath, [path.join(root, `archi-made-easy/renderers/${type}/render-${type}.mjs`), path.join(root, 'archi-made-easy', 'examples', name), output], { encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      times[name] = Number(process.hrtime.bigint() - started) / 1e6;
      return fs.statSync(output).size;
    };
    const KB = 1024;
    const sequence = render('sequence', 'cache-miss-request.sequence.json');
    const [fintech, ai, shop] = FLAGSHIPS.map((name) => render('architecture', name));
    // A page that cannot use the workbench is delivered without it.
    assert.ok(sequence < fintech - 120 * KB, `sequence ${sequence} against architecture ${fintech}`);
    for (const [name, size] of [['fintech', fintech], ['agent platform', ai]]) assert.ok(size < 1400 * KB, `${name}: ${size} bytes`);
    // Three child diagrams add well under one page between them, because each is stored
    // without the stylesheet and scripts it shares with the parent.
    assert.ok(shop - ai < 400 * KB, `three levels add ${shop - ai} bytes`);
    assert.ok(shop < 1700 * KB, `shop: ${shop} bytes`);
    // Rendering includes starting Node. The page with three child diagrams renders four pages.
    for (const [name, time] of Object.entries(times)) assert.ok(time < (name === FLAGSHIPS[2] ? 30000 : 12000), `${name} rendered in ${time.toFixed(0)} ms`);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
