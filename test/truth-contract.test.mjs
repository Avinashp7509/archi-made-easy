// The truth, completeness and evidence contract (archi-made-easy/workbench/evidence.mjs),
// held as invariants rather than as examples.
//
//   Missing usage never becomes zero cost.
//   Missing evidence never becomes "no finding".
//   Partial coverage never becomes a complete score.
//   Unknown placement never becomes a definite outcome.
//   Inferred and assumed values stay visibly so.
//   Every displayed number can be traced to inputs, an equation and their origins.
//   Equivalent inputs give equivalent meaning on every output surface.
//   Removing required information can only reduce completeness, never increase confidence.
//
// The report scenarios themselves are in qa-report-regressions.test.mjs. Here the same
// classes are exercised on generated, permuted, contradictory and extreme inputs that no
// report mentions. Random inputs come from a seeded generator: a failure prints its seed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadKnowledge } from '../archi-made-easy/bin/workbench.mjs';
import { validateSchema } from '../archi-made-easy/renderers/shared/validator.mjs';
import { scaffold } from '../archi-made-easy/workbench/scaffold.mjs';
import { buildModel } from '../archi-made-easy/workbench/model.mjs';
import { simulate } from '../archi-made-easy/workbench/sim.mjs';
import { estimateCost } from '../archi-made-easy/workbench/cost.mjs';
import { review, RULES } from '../archi-made-easy/workbench/review.mjs';
import { buildScenarios, runScenario } from '../archi-made-easy/workbench/scenarios.mjs';
import { buildFmea } from '../archi-made-easy/workbench/fmea.mjs';
import { figures, recoveryPlan } from '../archi-made-easy/workbench/remedy.mjs';
import { toRfc } from '../archi-made-easy/workbench/exporters/rfc.mjs';
import { STATUSES, ORIGINS, REASONS, combineStatuses, concludeStatus, confidenceOf, isDefinitive } from '../archi-made-easy/workbench/evidence.mjs';
import { CALCULATIONS, INPUTS, UNITS, checkCalculation } from '../archi-made-easy/workbench/requirements.mjs';
import { DIMENSIONS, PRICING_MODELS, QUANTITY_BASES, GIB_IN_GB, PRICE_MAX_AGE_DAYS, meterCharge, freshness } from '../archi-made-easy/workbench/billing.mjs';
import { formatUsd, formatPrice, formatCost, formatNodeCost, costLines, simulationHeadline, reviewHeadline, noFindingsText, statusLabel } from '../archi-made-easy/workbench/present.mjs';
import { buildWorkbenchData } from '../archi-made-easy/workbench/embed.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skillRoot = path.join(repoRoot, 'archi-made-easy');
const cli = path.join(skillRoot, 'bin/archi-made-easy.mjs');
const knowledge = loadKnowledge();
const plain = (value) => JSON.parse(JSON.stringify(value));
const clone = (value) => structuredClone(value);
const model = (document) => buildModel(document).model;
const codes = (list) => list.map((item) => item.code);
const SECONDS = 2_628_000;

// ---------------------------------------------------------------------------------------
// Fixtures and generators
// ---------------------------------------------------------------------------------------

function patternDocument(patternId, providerId) {
  return scaffold({ slots: knowledge.slots, pattern: knowledge.patterns.find((p) => p.id === patternId), provider: knowledge.providers.find((p) => p.id === providerId) });
}

/** A provider-neutral design with every figure authored: the "complete" reference case. */
function authoredDesign() {
  const source = { origin: 'imported', provider: 'example-cloud', service: 'Functions', region: 'region-1', plan: 'on-demand', url: 'https://pricing.example.com/functions', retrieved_at: '2026-11-01' };
  return {
    schema_version: 1, diagram_type: 'architecture', meta: { title: 'Authored design', output: 'authored-design.html', quality_profile: 'standard' },
    layout: { mode: 'grid', cols: 4 },
    components: [
      { id: 'clients', type: 'external', label: 'Clients', row: 0, col: 0, operational: { capacity: { baseline_rps: 40 } } },
      { id: 'api', type: 'backend', label: 'API', row: 0, col: 1, operational: {
        role: 'stateless-compute', sla_percent: 99.95, redundancy: 'multi-az', capacity: { max_rps: 200, autoscale_min: 2, autoscale_max: 4 }, latency: { p50_ms: 20, p99_ms: 120 },
        security: { auth_method: 'jwt' },
        finops: { pricing_model: 'provisioned-instance', meters: [{ id: 'hours', dimension: 'instance-hours', unit: 'hour', price: 0.1, currency: 'USD', source }] },
      } },
      { id: 'fn', type: 'backend', label: 'Resize function', row: 0, col: 2, operational: {
        role: 'stateless-compute', sla_percent: 99.9, redundancy: 'multi-az', capacity: { max_rps: 500 }, latency: { p50_ms: 30, p99_ms: 300 },
        finops: {
          pricing_model: 'serverless-request', usage: { avg_duration_ms: 1000, memory_gb: 0.5 },
          meters: [
            { id: 'requests', dimension: 'requests', unit: 'request', price: 0.2, per: 1000000, currency: 'USD', free_allowance: 1000000, source },
            { id: 'compute', dimension: 'memory-seconds', unit: 'GB-second', price: 0.0000166667, currency: 'USD', free_allowance: 400000, quantity_basis: 'request-duration', source },
          ],
        },
      } },
      { id: 'db', type: 'database', label: 'Orders DB', row: 0, col: 3, operational: {
        role: 'stateful-db', sla_percent: 99.99, redundancy: 'multi-az', capacity: { max_rps: 1000 }, latency: { p50_ms: 4, p99_ms: 40 },
        dr: { rpo_sec: 60, rto_sec: 600 }, security: { auth_method: 'iam', encryption_at_rest: true },
        finops: { pricing_model: 'provisioned-with-storage', usage: { instances: 2, storage_gb: 200 }, meters: [
          { id: 'compute', dimension: 'instance-hours', unit: 'hour', price: 0.5, currency: 'USD', source },
          { id: 'storage', dimension: 'storage-gb-month', unit: 'GB-month', price: 0.1, currency: 'USD', source },
        ] },
      } },
    ],
    connections: [
      { id: 'clients-api', from: 'clients', to: 'api', label: 'HTTPS', operational: { call_semantics: 'sync-blocking', resilience: { timeout_ms: 3000 } } },
      { id: 'api-fn', from: 'api', to: 'fn', label: 'invoke', operational: { call_semantics: 'sync-blocking', resilience: { timeout_ms: 1500, circuit_breaker_enabled: true } } },
      { id: 'api-db', from: 'api', to: 'db', label: 'SQL', operational: { call_semantics: 'sync-blocking', resilience: { timeout_ms: 500 } } },
    ],
    workbench: { as_of: '2026-11-15', entrypoints: ['clients'] },
  };
}

/** mulberry32: a small seeded generator, so a failing case can be replayed from its seed. */
function rng(seed) {
  let a = seed >>> 0;
  const next = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { next, int: (n) => Math.floor(next() * n), pick: (list) => list[Math.floor(next() * list.length)], chance: (p) => next() < p };
}

const LABELS = { frontend: ['Web', 'Edge cache', 'Storefront'], backend: ['API', 'Worker', 'Checkout service', 'Auth service', 'Model gateway'], database: ['Orders DB', 'Redis cache', 'Blob store', 'Ledger'],
  messagebus: ['Queue', 'Kafka stream', 'Events'], security: ['Identity', 'Key vault'], external: ['Payments API', 'Partner'], cloud: ['Load balancer', 'CDN', 'Functions'] };

/** A random, structurally valid architecture: an entry actor, a DAG, and randomly omitted operational facts. */
function randomDocument(seed) {
  const r = rng(seed);
  const count = 3 + r.int(6);
  const components = [{ id: 'users', type: 'external', label: 'Users', row: 0, col: 0, ...(r.chance(0.5) ? { operational: { capacity: { baseline_rps: 1 + r.int(2000) } } } : {}) }];
  for (let i = 1; i < count; i += 1) {
    const type = r.pick(Object.keys(LABELS));
    const op = {};
    if (r.chance(0.5)) op.sla_percent = r.pick([99, 99.9, 99.95, 99.99, 100, 90]);
    if (r.chance(0.5)) op.redundancy = r.pick(['single-instance', 'multi-az', 'active-active-multi-region', 'active-passive-dr']);
    if (r.chance(0.6)) { const min = 1 + r.int(3); op.capacity = { ...(r.chance(0.8) ? { max_rps: r.pick([5, 50, 500, 5000, 100000]) } : {}), ...(r.chance(0.5) ? { autoscale_min: min, autoscale_max: min + r.int(4) } : {}) }; }
    if (r.chance(0.5)) { const p50 = 1 + r.int(200); op.latency = { p50_ms: p50, p99_ms: p50 * (1 + r.int(20)) }; }
    if (r.chance(0.4)) op.dr = { ...(r.chance(0.7) ? { rpo_sec: r.int(3600) } : {}), ...(r.chance(0.7) ? { rto_sec: r.int(7200) } : {}) };
    if (r.chance(0.5)) op.security = { ...(r.chance(0.5) ? { auth_method: r.pick(['none', 'jwt', 'iam', 'mtls']) } : {}), ...(r.chance(0.5) ? { encryption_at_rest: r.chance(0.7) } : {}) };
    if (r.chance(0.35)) {
      op.finops = r.chance(0.5)
        ? { ...(r.chance(0.7) ? { monthly_base_cost_usd: r.int(900) } : {}), ...(r.chance(0.6) ? { cost_per_million_requests_usd: r.pick([0.2, 0.4, 3.5]) } : {}), ...(r.chance(0.3) ? { storage_gb: r.int(500), storage_cost_per_gb_usd: 0.1 } : {}) }
        : { ...(r.chance(0.6) ? { pricing_model: r.pick(Object.keys(PRICING_MODELS)) } : {}),
          usage: { ...(r.chance(0.5) ? { avg_duration_ms: 1 + r.int(2000) } : {}), ...(r.chance(0.5) ? { memory_gb: r.pick([0.128, 0.5, 2]) } : {}), ...(r.chance(0.4) ? { vcpu: r.pick([0.25, 1, 4]) } : {}), ...(r.chance(0.3) ? { concurrency: 1 + r.int(80) } : {}), ...(r.chance(0.3) ? { storage_gb: r.int(900) } : {}) },
          meters: [
            ...(r.chance(0.7) ? [{ id: 'requests', dimension: 'requests', unit: 'request', price: 0.2, per: 1000000, currency: r.chance(0.9) ? 'USD' : 'EUR', ...(r.chance(0.5) ? { free_allowance: 1000000 } : {}) }] : []),
            ...(r.chance(0.6) ? [{ id: 'memory', dimension: 'memory-seconds', unit: r.pick(['GB-second', 'GiB-second']), price: 0.0000167, currency: 'USD', quantity_basis: r.pick(Object.keys(QUANTITY_BASES)) }] : []),
            ...(r.chance(0.3) ? [{ id: 'cpu', dimension: 'vcpu-seconds', unit: 'vCPU-second', price: 0.000024, currency: 'USD', quantity_basis: r.pick(Object.keys(QUANTITY_BASES)) }] : []),
            ...(r.chance(0.3) ? [{ id: 'storage', dimension: 'storage-gb-month', unit: 'GB-month', tiers: [{ up_to: 100, price: 0.1 }, { price: 0.05 }], currency: 'USD' }] : []),
            ...(r.chance(0.2) ? [{ id: 'licence', dimension: 'other', currency: 'USD', description: 'Per-seat licence' }] : []),
            { id: 'flat', dimension: 'flat', unit: 'month', price: r.int(50), currency: 'USD' },
          ] };
      if (!Object.keys(op.finops).length) delete op.finops;
    }
    components.push({ id: `c${i}`, type, label: r.pick(LABELS[type]), row: 1 + Math.floor((i - 1) / 4), col: (i - 1) % 4, ...(Object.keys(op).length ? { operational: op } : {}) });
  }
  const connections = [];
  const connect = (from, to) => {
    if (connections.some((c) => c.from === from && c.to === to)) return;
    const op = {};
    if (r.chance(0.4)) op.call_semantics = r.pick(['sync-blocking', 'sync-blocking', 'async-queue', 'event-stream']);
    if (r.chance(0.4)) op.resilience = { ...(r.chance(0.6) ? { timeout_ms: 50 + r.int(5000) } : {}), ...(r.chance(0.4) ? { retries: r.int(4) } : {}), ...(r.chance(0.4) ? { circuit_breaker_enabled: r.chance(0.5) } : {}), ...(r.chance(0.2) ? { idempotent: r.chance(0.5) } : {}) };
    if (r.chance(0.2)) op.traffic = { ...(r.chance(0.5) ? { request_multiplier: r.pick([0.1, 1, 3]) } : {}), ...(r.chance(0.5) ? { egress_cost_per_gb_usd: 0.02 } : {}) };
    connections.push({ id: `${from}-${to}`, from, to, ...(Object.keys(op).length ? { operational: op } : {}) });
  };
  for (let i = 1; i < count; i += 1) connect(components[r.int(i)].id, components[i].id);
  for (let extra = r.int(3); extra > 0; extra -= 1) { const a = r.int(count - 1); connect(components[a].id, components[a + 1 + r.int(count - a - 1)].id); }
  const document = { schema_version: 1, diagram_type: 'architecture', meta: { title: `Generated ${seed}`, output: `generated-${seed}.html`, quality_profile: 'standard' }, layout: { mode: 'grid', cols: 4 }, components, connections };
  if (r.chance(0.5) && count > 3) {
    const members = components.slice(1).filter(() => r.chance(0.6)).map((c) => c.id);
    if (members.length) document.boundaries = [{ id: 'zone-1', kind: 'region', label: r.pick(['Region east', 'Zone a']), wraps: members, operational: { scope: r.pick(['region', 'availability-zone']) } }];
  }
  if (r.chance(0.4)) document.workbench = { requirements: { ...(r.chance(0.6) ? { availability_target_percent: 99.9 } : {}), ...(r.chance(0.6) ? { p99_latency_ms: 400 } : {}), ...(r.chance(0.5) ? { peak_rps: 800 } : {}), ...(r.chance(0.5) ? { monthly_budget_usd: 500 } : {}), ...(r.chance(0.3) ? { rpo_sec: 300, rto_sec: 900 } : {}) } };
  return document;
}

const SEEDS = Array.from({ length: 150 }, (_, index) => 7919 * (index + 1));
/** Generated documents whose model has no error diagnostics (the engine's valid input). */
const GENERATED = SEEDS.map((seed) => ({ seed, document: randomDocument(seed) })).filter(({ document }) => buildModel(document).diagnostics.every((d) => d.severity !== 'error'));
const RUNS = [{}, { multiplier: 10 }, { multiplier: 0.5, cacheHit: 0.5 }, { faults: { zone: 'down' } }];

function nonFinite(value, at = '$', found = []) {
  if (typeof value === 'number' && !Number.isFinite(value)) found.push(at);
  else if (value && typeof value === 'object') for (const [key, inner] of Object.entries(value)) nonFinite(inner, `${at}.${key}`, found);
  return found;
}
/** How much was computed: used to check that removing information never moves this up. */
const RANK = { complete: 3, partial: 2, inconclusive: 1, unknown: 1, unsupported: 1, not_applicable: 1, invalid: 0 };

function runCli(t, document, ...args) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'archi-made-easy-truth-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'in.json'), JSON.stringify(document));
  const result = spawnSync(process.execPath, [cli, args[0], 'in.json', ...args.slice(1)], { cwd: dir, encoding: 'utf8', env: { ...process.env, ARCHI_MADE_EASY_UPDATE_CHECK_DISABLED: '1', ARCHI_MADE_EASY_BRAND_CAPTURE_DISABLED: '1' } });
  let json = null;
  try { json = JSON.parse(result.stdout); } catch { /* text output */ }
  return { ...result, json, dir };
}

// ---------------------------------------------------------------------------------------
// 1. Schema contract: the vocabulary and the declarations are complete and closed
// ---------------------------------------------------------------------------------------

test('contract: the status and origin vocabularies are closed, and every reason says what to supply', () => {
  assert.deepEqual([...STATUSES].sort(), ['complete', 'inconclusive', 'invalid', 'not_applicable', 'partial', 'unknown', 'unsupported']);
  assert.deepEqual([...ORIGINS].sort(), ['authored', 'default', 'derived', 'imported', 'inferred', 'measured', 'unknown']);
  for (const status of STATUSES) assert.ok(statusLabel(status) && statusLabel(status) !== 'undefined', status);
  for (const [code, entry] of Object.entries(REASONS)) {
    assert.match(code, /^[a-z]+(-[a-z]+)*$/, code);
    assert.ok(entry.message.endsWith('.') && entry.ask.endsWith('.'), `${code} has a sentence and an ask`);
  }
  assert.equal(isDefinitive('complete'), true);
  for (const status of STATUSES.filter((s) => s !== 'complete')) assert.equal(isDefinitive(status), false, status);
});

test('contract: every calculation declares inputs, defaults, units, applicability, missing-input behaviour, uncertainty and meaning', () => {
  for (const [id, calculation] of Object.entries(CALCULATIONS)) {
    for (const key of ['title', 'applies', 'when_missing', 'uncertainty', 'semantics']) assert.ok(typeof calculation[key] === 'string' && calculation[key].length > 3, `${id}.${key}`);
    for (const key of ['requires', 'optional', 'defaults', 'outputs']) assert.ok(Array.isArray(calculation[key]), `${id}.${key}`);
    assert.ok(STATUSES.includes(calculation.when_missing), id);
    for (const input of [...calculation.requires, ...(calculation.conditional ?? []).flatMap((rule) => rule.requires)]) assert.ok(INPUTS[input], `${id} requires a declared input: ${input}`);
    for (const unit of Object.values(calculation.units)) assert.ok(unit === null || UNITS[unit], `${id} uses a declared unit: ${unit}`);
    assert.ok(calculation.outputs.length > 0, `${id} names its outputs`);
  }
  for (const [key, input] of Object.entries(INPUTS)) {
    assert.ok(REASONS[input.reasonCode], `${key} maps to a reason`);
    assert.equal(typeof input.present, 'function', key);
  }
});

test('contract: every review rule declares what it requires and where it applies', () => {
  for (const rule of RULES) {
    assert.ok(Array.isArray(rule.requires), rule.id);
    assert.ok(typeof rule.applies === 'string' && rule.applies.length > 5, rule.id);
  }
});

test('contract: billing dimensions have convertible units and pricing models bill known dimensions', () => {
  for (const [id, dimension] of Object.entries(DIMENSIONS)) {
    if (dimension.unsupported) continue;
    const factors = Object.values(dimension.units);
    assert.ok(factors.length > 0 && factors.every((factor) => factor > 0) && factors[0] === 1, `${id}: the first unit is the base unit`);
  }
  for (const [id, pricing] of Object.entries(PRICING_MODELS)) {
    for (const dimension of [...pricing.bills.flat(), ...pricing.optional]) assert.ok(DIMENSIONS[dimension], `${id} bills ${dimension}`);
  }
  // The schema lists the same dimensions, units and pricing models: one vocabulary.
  const schema = JSON.parse(fs.readFileSync(path.join(skillRoot, 'schemas/common.schema.json'), 'utf8')).$defs;
  assert.deepEqual([...schema.billingMeter.properties.dimension.enum].sort(), Object.keys(DIMENSIONS).sort());
  assert.deepEqual([...schema.billingMeter.properties.unit.enum].sort(), [...new Set(Object.values(DIMENSIONS).flatMap((d) => Object.keys(d.units)))].sort());
  assert.deepEqual([...schema.nodeOperational.properties.finops.properties.pricing_model.enum].sort(), Object.keys(PRICING_MODELS).sort());
  assert.deepEqual([...schema.billingMeter.properties.quantity_basis.enum].sort(), Object.keys(QUANTITY_BASES).sort());
});

test('contract: the schema accepts meters with provenance and rejects what it cannot mean', () => {
  const good = authoredDesign();
  validateSchema('architecture', good);
  const bad = (mutate, what) => { const document = authoredDesign(); mutate(document); assert.throws(() => validateSchema('architecture', document), undefined, what); };
  bad((d) => { d.components[2].operational.finops.meters[0].dimension = 'gigawatts'; }, 'unknown dimension');
  bad((d) => { d.components[2].operational.finops.meters[0].unit = 'furlong'; }, 'unknown unit');
  bad((d) => { d.components[2].operational.finops.meters[0].price = -1; }, 'negative price');
  bad((d) => { delete d.components[2].operational.finops.meters[0].currency; }, 'a price needs a currency');
  bad((d) => { d.components[2].operational.finops.meters[0].source.url = 'ftp://prices'; }, 'source url must be https');
  bad((d) => { d.components[2].operational.finops.meters[0].source.retrieved_at = 'last week'; }, 'dates are yyyy-mm-dd');
  bad((d) => { d.components[2].operational.finops.pricing_model = 'magic'; }, 'unknown pricing model');
  bad((d) => { d.components[1].operational.managed_by = 'nobody'; }, 'unknown manager');
  bad((d) => { d.components[2].operational.finops.usage.surprise = 1; }, 'unknown usage field');
  bad((d) => { d.workbench.as_of = 'today'; }, 'as_of is a date');
});

test('contract: every result on every pattern and provider carries a valid status and well-formed assessments', () => {
  for (const pattern of knowledge.patterns) {
    for (const provider of knowledge.providers) {
      const m = model(scaffold({ slots: knowledge.slots, pattern, provider }));
      for (const inputs of RUNS) {
        const result = simulate(m, inputs);
        assert.ok(STATUSES.includes(result.status), `${pattern.id}/${provider.id}`);
        assert.deepEqual(Object.keys(result.assessments).sort(), ['availability', 'blast_radius', 'capacity', 'ingress_loss', 'latency', 'structure', 'traffic']);
        for (const [key, item] of Object.entries(result.assessments)) {
          assert.ok(STATUSES.includes(item.status), key);
          assert.ok(item.status === 'complete' || item.status === 'not_applicable' || item.reasons.length > 0, `${pattern.id}/${provider.id} ${key}: a status other than complete states a reason`);
          for (const entry of item.reasons) assert.ok(entry.code && entry.message, key);
        }
        assert.equal(result.status === 'complete', result.reasons.filter((item) => item.code !== 'independence-assumption').length === 0 && Object.values(result.assessments).every((item) => item.status === 'complete'));
      }
      const cost = estimateCost(m, simulate(m));
      assert.equal(cost.status, 'unknown', 'a scaffold invents no price');
      assert.ok(STATUSES.includes(review(m).status));
    }
  }
});

test('contract: status algebra', () => {
  assert.equal(combineStatuses(['complete', 'complete']), 'complete');
  assert.equal(combineStatuses(['complete', 'unknown']), 'partial');
  assert.equal(combineStatuses(['unknown', 'inconclusive']), 'inconclusive');
  assert.equal(combineStatuses(['unknown', 'unknown']), 'unknown');
  assert.equal(combineStatuses(['complete', 'invalid']), 'invalid');
  assert.equal(combineStatuses(['not_applicable']), 'not_applicable');
  assert.equal(combineStatuses(['not_applicable', 'complete']), 'complete');
  // An essential part that is missing never yields a conclusion, whatever else is complete.
  assert.equal(concludeStatus(['complete', 'inconclusive'], ['complete']), 'inconclusive');
  assert.equal(concludeStatus(['unknown'], ['complete']), 'inconclusive');
  assert.equal(concludeStatus(['complete'], ['unknown']), 'partial');
  assert.equal(concludeStatus(['complete'], ['complete']), 'complete');
  // Combining can never produce something more complete than its least complete part allows.
  for (const a of STATUSES) for (const b of STATUSES) {
    const combined = combineStatuses([a, b]);
    if (combined === 'complete') assert.ok([a, b].every((s) => s === 'complete' || s === 'not_applicable') && [a, b].includes('complete'), `${a}+${b}`);
  }
  assert.equal(confidenceOf(['authored', 'authored', 'default', 'inferred']).level, 'medium');
  assert.equal(confidenceOf(['default', 'inferred', 'unknown']).level, 'low');
  assert.equal(confidenceOf([]).level, 'unknown');
});

// ---------------------------------------------------------------------------------------
// 2. Property-based: generated designs
// ---------------------------------------------------------------------------------------

test(`property: generated designs are valid input (${GENERATED.length} of ${SEEDS.length} seeds)`, () => {
  assert.ok(GENERATED.length >= 100, `enough generated designs: ${GENERATED.length}`);
  for (const { seed, document } of GENERATED.slice(0, 40)) assert.doesNotThrow(() => validateSchema('architecture', document), `seed ${seed}`);
});

test('property: no result contains a non-finite number, and results are deterministic', () => {
  for (const { seed, document } of GENERATED) {
    const m = model(document);
    for (const inputs of RUNS) {
      const result = simulate(m, inputs);
      const cost = estimateCost(m, result);
      assert.deepEqual(nonFinite({ result, cost }), [], `seed ${seed} ${JSON.stringify(inputs)}`);
      assert.equal(JSON.stringify(simulate(model(clone(document)), inputs)), JSON.stringify(result), `seed ${seed}`);
    }
    assert.deepEqual(nonFinite(review(m)), [], `seed ${seed}`);
  }
});

test('property: unknown load is never zero load, false saturation or a calculated outcome', () => {
  for (const { seed, document } of GENERATED) {
    const m = model(document);
    const known = m.entrypoints.some((id) => m.nodes.find((n) => n.id === id).capacity.baseline_rps != null);
    for (const inputs of RUNS) {
      const result = simulate(m, inputs);
      const at = `seed ${seed} ${JSON.stringify(inputs)}`;
      if (!known) {
        for (const node of Object.values(result.nodes)) assert.deepEqual([node.load_rps, node.served_rps, node.utilisation, node.saturated, node.queue_lag_rps], [null, null, null, null, null], at);
        for (const edge of Object.values(result.edges)) assert.equal(edge.flow_rps, null, at);
        assert.deepEqual([result.kpis.ingress_rps, result.kpis.headroom], [null, null], at);
        assert.notEqual(result.status, 'complete', at);
        assert.ok(codes(result.reasons).includes('missing-baseline-load'), at);
      }
      if (!known && inputs.multiplier != null && inputs.multiplier !== 1) {
        assert.equal(result.status, 'inconclusive', at);
        assert.deepEqual([result.kpis.blast_radius.ingress_share, result.kpis.composite_sla_percent, result.kpis.critical_path?.p99_ms ?? null], [null, null, null], at);
        const head = simulationHeadline(m, result);
        assert.deepEqual([head.show_comparison, head.show_recovery], [false, false], at);
        assert.doesNotMatch(head.text, /No component is affected|not served\.$/, at);
      }
      // A share is reported exactly when its assessment has a value; never as a silent zero.
      const share = result.kpis.blast_radius.ingress_share;
      assert.equal(share != null, ['complete', 'partial'].includes(result.assessments.ingress_loss.status) && m.entrypoints.length > 0, at);
      // The headline never claims "no component is affected" unless that was established.
      if (/No component is affected/.test(simulationHeadline(m, result).text)) assert.equal(result.kpis.blast_radius.status, 'complete', at);
    }
  }
});

test('property: a cost total exists exactly when the estimate is complete, and equals the sum of its meters', () => {
  let complete = 0; let partial = 0; let unknown = 0;
  for (const { seed, document } of GENERATED) {
    const m = model(document);
    for (const inputs of [{}, { multiplier: 3 }]) {
      const cost = estimateCost(m, simulate(m, inputs));
      const at = `seed ${seed}`;
      assert.equal(cost.monthly_total_usd != null, cost.status === 'complete', at);
      if (cost.status === 'complete') { complete += 1; assert.equal(cost.monthly_total_usd, cost.subtotal_usd, at); }
      if (cost.status === 'partial') partial += 1;
      if (cost.status === 'unknown') { unknown += 1; assert.deepEqual([cost.subtotal_usd, cost.coverage.priced_components], [null, 0], at); }
      let sum = 0; let computed = 0;
      for (const [id, entry] of Object.entries(cost.nodes)) {
        if (!entry.priced) { assert.equal(entry.subtotal_usd, undefined, at); continue; }
        assert.equal(entry.total_usd != null, entry.status === 'complete', `${at} ${id}: a component total needs a complete component`);
        for (const meter of entry.meters) {
          // A meter has a cost exactly when it was computed; a meter left out has a reason and no figure.
          assert.equal(meter.cost_usd != null, meter.status === 'complete' || meter.status === 'partial', `${at} ${id}/${meter.id}`);
          if (meter.cost_usd == null) { assert.ok(meter.reasons.length > 0, `${at} ${id}/${meter.id}`); assert.equal(meter.quantity, null); }
          else { sum += meter.cost_usd; computed += 1; assert.ok(meter.cost_usd >= 0 && meter.inputs.length > 0 && meter.equation.length > 0, `${at} ${id}/${meter.id}: traceable`); }
        }
      }
      for (const entry of Object.values(cost.egress)) if (entry.cost_usd != null) { sum += entry.cost_usd; computed += 1; }
      assert.equal(cost.coverage.meters.computed, computed, at);
      if (computed) assert.ok(Math.abs(sum - cost.subtotal_usd) < 0.01 * Math.max(1, computed), `${at}: subtotal ${cost.subtotal_usd} is the sum of its lines ${sum}`);
      else assert.equal(cost.subtotal_usd, null, `${at}: nothing computed is not $0`);
      // The words follow the status.
      const head = formatCost(cost);
      assert.equal(head.definitive, cost.status === 'complete', at);
      if (cost.status !== 'complete') assert.notEqual(head.label, 'Total' === head.label && cost.status !== 'unknown' ? 'Total' : null, at);
      if (cost.status === 'partial') assert.match(head.text, /^at least \$/, at);
    }
  }
  assert.ok(partial > 10 && unknown > 10, `the generator reaches partial (${partial}) and unknown (${unknown}) estimates; complete: ${complete}`);
});

test('property: a review score is bounded by its floor, and "complete" means every applicable rule ran', () => {
  for (const { seed, document } of GENERATED) {
    const reviewed = review(model(document));
    const at = `seed ${seed}`;
    if (reviewed.score != null) assert.ok(reviewed.score_floor <= reviewed.score, at);
    assert.ok(reviewed.coverage.evaluated <= reviewed.coverage.applicable && reviewed.coverage.applicable <= reviewed.coverage.rules, at);
    if (reviewed.status === 'complete') { assert.equal(reviewed.gaps.length, 0, at); assert.equal(reviewed.coverage.evaluated, reviewed.coverage.applicable, at); }
    if (reviewed.gaps.some((gap) => gap.rule)) assert.notEqual(reviewed.status, 'complete', at);
    for (const [pillar, value] of Object.entries(reviewed.pillars)) {
      assert.equal(value.score != null, value.status === 'complete' || value.status === 'partial', `${at} ${pillar}: nothing assessed is not 100`);
      if (value.score != null) assert.ok(value.floor <= value.score, `${at} ${pillar}`);
    }
    // No empty list of findings is ever described as a clean result while checks are open.
    for (const pillar of [undefined, ...Object.keys(reviewed.pillars)]) {
      const open = reviewed.gaps.some((gap) => !pillar || gap.pillars.includes(pillar));
      if (open) assert.match(noFindingsText(reviewed, pillar), /not fully checked/, `${at} ${pillar}`);
    }
    const head = reviewHeadline(reviewed);
    assert.equal(head.definitive, reviewed.status === 'complete', at);
    if (reviewed.status !== 'complete') assert.match(head.text, new RegExp(statusLabel(reviewed.status)), at);
  }
});

test('property: assumed and inferred values are counted and listed, never silently merged with authored ones', () => {
  for (const { seed, document } of GENERATED) {
    const m = model(document);
    const result = simulate(m);
    for (const node of m.nodes.filter((n) => !n.actor)) {
      const authored = (key) => key.split('.').reduce((value, part) => value?.[part], document.components.find((c) => c.id === node.id).operational ?? {}) != null;
      for (const key of ['role', 'sla_percent', 'redundancy', 'capacity.max_rps', 'latency.p50_ms', 'latency.p99_ms']) {
        assert.equal(node.origin[key] === 'authored', authored(key), `seed ${seed} ${node.id}.${key}`);
        assert.equal(result.basis.assumed.some((item) => item.subject === node.id && item.input === key), !authored(key), `seed ${seed} ${node.id}.${key} is listed as assumed`);
      }
    }
    assert.equal(result.confidence.counts.authored + result.confidence.counts.default + result.confidence.counts.inferred + result.confidence.counts.unknown + result.confidence.counts.derived, result.confidence.inputs, `seed ${seed}`);
  }
});

// ---------------------------------------------------------------------------------------
// 3. Metamorphic relations
// ---------------------------------------------------------------------------------------

/** Every authored fact that has no default: removing one leaves strictly less information. */
function removableFacts(document) {
  const facts = [];
  document.components.forEach((component, index) => {
    const op = component.operational ?? {};
    if (op.capacity?.baseline_rps != null) facts.push({ what: `${component.id}.baseline_rps`, remove: (d) => { delete d.components[index].operational.capacity.baseline_rps; } });
    if (op.security?.encryption_at_rest != null) facts.push({ what: `${component.id}.encryption_at_rest`, remove: (d) => { delete d.components[index].operational.security.encryption_at_rest; } });
    for (const key of ['rpo_sec', 'rto_sec']) if (op.dr?.[key] != null) facts.push({ what: `${component.id}.dr.${key}`, remove: (d) => { delete d.components[index].operational.dr[key]; } });
    for (const key of Object.keys(op.finops?.usage ?? {})) facts.push({ what: `${component.id}.usage.${key}`, cost: true, remove: (d) => { delete d.components[index].operational.finops.usage[key]; } });
  });
  (document.connections ?? []).forEach((connection, index) => {
    if (connection.operational?.resilience?.timeout_ms != null) facts.push({ what: `${connection.id}.timeout_ms`, remove: (d) => { delete d.connections[index].operational.resilience.timeout_ms; } });
  });
  return facts;
}

test('metamorphic: removing a required fact never makes a result more complete, a cost larger in coverage, or a score floor higher', () => {
  let checked = 0;
  for (const { seed, document } of [...GENERATED, { seed: 'authored', document: authoredDesign() }]) {
    const before = { m: model(document) };
    for (const fact of removableFacts(document)) {
      const less = clone(document); fact.remove(less);
      if (buildModel(less).diagnostics.some((d) => d.severity === 'error')) continue;
      const after = model(less);
      const at = `seed ${seed}: without ${fact.what}`;
      for (const inputs of [{}, { multiplier: 10 }, { faults: { nodes: { [before.m.nodes.at(-1).id]: 'down' } } }]) {
        const a = simulate(before.m, inputs); const b = simulate(after, inputs);
        assert.ok(RANK[b.status] <= RANK[a.status], `${at} ${JSON.stringify(inputs)}: simulation ${a.status} -> ${b.status}`);
        for (const key of Object.keys(a.assessments)) assert.ok(RANK[b.assessments[key].status] <= RANK[a.assessments[key].status], `${at}: ${key} ${a.assessments[key].status} -> ${b.assessments[key].status}`);
        assert.ok(b.confidence.grounded_share <= a.confidence.grounded_share || a.confidence.grounded_share == null, `${at}: confidence`);
        const ca = estimateCost(before.m, a); const cb = estimateCost(after, b);
        assert.ok(RANK[cb.status] <= RANK[ca.status] || ca.status === 'invalid', `${at}: cost ${ca.status} -> ${cb.status}`);
        assert.ok(cb.coverage.meters.computed <= ca.coverage.meters.computed || ca.status === 'invalid', `${at}: meters computed`);
      }
      const ra = review(before.m); const rb = review(after);
      if (!fact.cost && ra.score_floor != null && rb.score_floor != null) assert.ok(rb.score_floor <= ra.score_floor, `${at}: floor ${ra.score_floor} -> ${rb.score_floor}`);
      checked += 1;
    }
  }
  assert.ok(checked > 150, `facts removed: ${checked}`);
});

test('metamorphic: an authored value replaced by a default stays visible as such and lowers confidence', () => {
  for (const { seed, document } of GENERATED.slice(0, 60)) {
    const before = simulate(model(document));
    document.components.forEach((component, index) => {
      for (const key of ['sla_percent', 'redundancy']) {
        if (component.operational?.[key] == null || component.type === 'external') continue;
        const less = clone(document); delete less.components[index].operational[key];
        const m = model(less);
        const node = m.nodes.find((n) => n.id === component.id);
        if (node.actor) continue;
        const after = simulate(m);
        assert.notEqual(node.origin[key], 'authored', `seed ${seed} ${component.id}.${key}`);
        assert.equal(node.basis[key], 'assumed');
        assert.ok(after.basis.assumed.some((item) => item.subject === component.id && item.input === key));
        assert.ok(after.confidence.grounded_share < before.confidence.grounded_share, `seed ${seed} ${component.id}.${key}: confidence falls`);
      }
    });
  }
});

test('metamorphic: the same design written differently gives the same result', () => {
  for (const { seed, document } of GENERATED.slice(0, 60)) {
    const m = model(document);
    // Reordered: the order components and connections are written in carries no meaning.
    const shuffled = clone(document);
    shuffled.components.reverse(); shuffled.connections.reverse();
    const reordered = model(shuffled);
    for (const inputs of RUNS) {
      const a = simulate(m, inputs); const b = simulate(reordered, inputs);
      assert.deepEqual(plain({ status: b.status, kpis: b.kpis, nodes: b.nodes, reasons: codes(b.reasons).sort() }), plain({ status: a.status, kpis: a.kpis, nodes: a.nodes, reasons: codes(a.reasons).sort() }), `seed ${seed} reordered`);
    }
    assert.deepEqual(plain(estimateCost(reordered, simulate(reordered))), plain(estimateCost(m, simulate(m))), `seed ${seed} cost reordered`);
    const ra = review(m); const rb = review(reordered);
    assert.deepEqual([rb.score, rb.score_floor, rb.status, rb.findings.map((f) => f.id), rb.gaps.map((g) => g.id)], [ra.score, ra.score_floor, ra.status, ra.findings.map((f) => f.id), ra.gaps.map((g) => g.id)], `seed ${seed} review reordered`);

    // Reworded: with roles and call semantics stated, labels are only words.
    const stated = clone(document);
    stated.components.forEach((component) => { (component.operational ??= {}).role = m.nodes.find((n) => n.id === component.id).role; });
    stated.connections.forEach((connection) => { (connection.operational ??= {}).call_semantics = m.edges.find((e) => e.id === connection.id).call_semantics; });
    const reworded = clone(stated);
    reworded.components.forEach((component, index) => { component.label = `Thing ${index}`; delete component.sublabel; });
    reworded.meta.title = 'Another title';
    const sa = simulate(model(stated)); const sb = simulate(model(reworded));
    assert.deepEqual(plain({ status: sb.status, kpis: { ...sb.kpis }, nodes: sb.nodes }), plain({ status: sa.status, kpis: { ...sa.kpis }, nodes: sa.nodes }), `seed ${seed} reworded`);
    assert.equal(review(model(reworded)).score, review(model(stated)).score, `seed ${seed} reworded review`);
    // Without stated roles, a role read from a label is marked inferred, so the dependence is visible.
    for (const node of m.nodes) if (document.components.find((c) => c.id === node.id).operational?.role == null) assert.equal(node.origin.role, 'inferred');
  }
});

test('metamorphic: load is linear (baseline times multiplier), and a partial cost is a lower bound of the completed one', () => {
  for (const { seed, document } of GENERATED.slice(0, 80)) {
    const users = document.components[0];
    if (users.operational?.capacity?.baseline_rps == null) {
      // Filling in the missing load can only add cost lines: the earlier subtotal was a lower bound.
      const m = model(document);
      const partial = estimateCost(m, simulate(m));
      const filled = clone(document); filled.components[0].operational = { capacity: { baseline_rps: 25 } };
      const fm = model(filled);
      const complete = estimateCost(fm, simulate(fm));
      if (partial.subtotal_usd != null && complete.status !== 'invalid') assert.ok(complete.subtotal_usd >= partial.subtotal_usd - 0.01, `seed ${seed}: ${partial.subtotal_usd} <= ${complete.subtotal_usd}`);
      assert.ok(complete.coverage.meters.computed >= partial.coverage.meters.computed || complete.status === 'invalid', `seed ${seed}`);
      continue;
    }
    const scaled = clone(document); scaled.components[0].operational.capacity.baseline_rps *= 4;
    const a = simulate(model(document), { multiplier: 4 }); const b = simulate(model(scaled), { multiplier: 1 });
    for (const id of Object.keys(a.nodes)) assert.ok(Math.abs((a.nodes[id].load_rps ?? 0) - (b.nodes[id].load_rps ?? 0)) <= 0.002 * Math.max(1, a.nodes[id].load_rps ?? 0), `seed ${seed} ${id}`);
    assert.equal(a.kpis.max_sustainable_rps, b.kpis.max_sustainable_rps, `seed ${seed}: the ceiling does not depend on the load`);
  }
});

// ---------------------------------------------------------------------------------------
// 4. Missing-field permutations
// ---------------------------------------------------------------------------------------

test('permutations: a serverless meter set is complete only with every input; each missing input is named and nothing becomes zero', () => {
  const base = authoredDesign();
  const fn = (d) => d.components.find((c) => c.id === 'fn').operational.finops;
  const removals = {
    load: (d) => { delete d.components[0].operational.capacity.baseline_rps; },
    duration: (d) => { delete fn(d).usage.avg_duration_ms; },
    memory: (d) => { delete fn(d).usage.memory_gb; },
    'compute meter': (d) => { fn(d).meters = fn(d).meters.filter((meter) => meter.id !== 'compute'); },
    'pricing model': (d) => { delete fn(d).pricing_model; },
  };
  const names = Object.keys(removals);
  for (let mask = 0; mask < 2 ** names.length; mask += 1) {
    const removed = names.filter((_, bit) => mask & (2 ** bit));
    const document = clone(base);
    for (const name of removed) removals[name](document);
    const m = model(document);
    const cost = estimateCost(m, simulate(m));
    const entry = cost.nodes.fn;
    const at = `without ${removed.join(', ') || 'nothing'}`;
    assert.equal(entry.status === 'complete', removed.length === 0, at);
    assert.equal(cost.status === 'complete', removed.length === 0, at);
    assert.equal(cost.monthly_total_usd != null, removed.length === 0, at);
    const reasonCodes = codes(entry.reasons);
    if (removed.includes('load')) assert.ok(reasonCodes.includes('missing-usage-baseline'), at);
    if (removed.includes('duration') && !removed.includes('load') && !removed.includes('compute meter')) assert.ok(entry.meters.find((meter) => meter.id === 'compute').missing.some((item) => /avg_duration_ms/.test(item.input)), at);
    if (removed.includes('memory') && !removed.includes('compute meter')) assert.ok(entry.meters.find((meter) => meter.id === 'compute').missing.some((item) => /memory_gb/.test(item.input)), at);
    if (removed.includes('compute meter') && !removed.includes('pricing model')) assert.ok(reasonCodes.includes('billing-dimension-missing'), at);
    if (removed.includes('pricing model')) assert.ok(reasonCodes.includes('billing-model-undeclared'), at);
    for (const meter of entry.meters) if (meter.status !== 'complete') assert.equal(meter.cost_usd, null, `${at}: ${meter.id} is left out, not zero`);
    // The reader sees the gap in words on the component, too.
    if (removed.length) assert.notEqual(formatNodeCost(entry).status, 'complete', at);
    if (removed.length) assert.doesNotMatch(formatNodeCost(entry).text, /^\$[\d.,]+\/mo$/, at);
  }
});

test('permutations: every optional operational fact can be absent, alone or together, without a figure appearing from nowhere', () => {
  const base = authoredDesign();
  const paths = [['components', 0, 'operational', 'capacity', 'baseline_rps'], ['components', 1, 'operational', 'sla_percent'], ['components', 1, 'operational', 'capacity', 'max_rps'], ['components', 3, 'operational', 'dr'], ['components', 3, 'operational', 'security', 'encryption_at_rest'], ['connections', 2, 'operational', 'resilience', 'timeout_ms'], ['workbench', 'entrypoints']];
  for (let mask = 0; mask < 2 ** paths.length; mask += 1) {
    const document = clone(base);
    paths.forEach((trail, bit) => { if (mask & (2 ** bit)) { const parent = trail.slice(0, -1).reduce((value, key) => value[key], document); delete parent[trail.at(-1)]; } });
    const m = model(document);
    for (const inputs of [{}, { multiplier: 10 }, { faults: { nodes: { db: 'down' } } }]) {
      const result = simulate(m, inputs);
      assert.deepEqual(nonFinite(result), []);
      if (mask & 1) assert.equal(result.kpis.ingress_rps, null);
      if ((mask & 1) && inputs.multiplier === 10) assert.equal(result.status, 'inconclusive');
    }
    const reviewed = review(m);
    if (mask & 16) assert.ok(reviewed.gaps.some((gap) => gap.rule === 'unencrypted-data-store'), 'unstated encryption is a gap, not a pass');
    if (mask & 8) assert.ok(reviewed.findings.some((f) => f.rule === 'missing-recovery-objectives'));
  }
});

// ---------------------------------------------------------------------------------------
// 5. Contradictory input
// ---------------------------------------------------------------------------------------

test('contradictions: inconsistent documents are rejected with a diagnostic that names the conflict', () => {
  const diagnose = (mutate) => { const document = authoredDesign(); mutate(document); return buildModel(document).diagnostics; };
  const fn = (d) => d.components[2].operational.finops;
  const cases = [
    ['workbench/latency-order', (d) => { d.components[1].operational.latency = { p50_ms: 500, p99_ms: 100 }; }],
    ['workbench/autoscale-range', (d) => { d.components[1].operational.capacity = { autoscale_min: 5, autoscale_max: 2 }; }],
    ['workbench/finops-unit-mismatch', (d) => { fn(d).meters[1].unit = 'GB-month'; }],
    ['workbench/finops-price-and-tiers', (d) => { fn(d).meters[0].tiers = [{ price: 0.1 }]; }],
    ['workbench/finops-no-price', (d) => { delete fn(d).meters[0].price; }],
    ['workbench/finops-tier-order', (d) => { delete fn(d).meters[0].price; fn(d).meters[0].tiers = [{ up_to: 500, price: 0.2 }, { up_to: 100, price: 0.1 }]; }],
    ['workbench/finops-basis-required', (d) => { delete fn(d).meters[1].quantity_basis; }],
    ['workbench/finops-double-count', (d) => { fn(d).cost_per_million_requests_usd = 0.2; }],
    ['workbench/finops-memory-twice', (d) => { fn(d).usage.memory_gib = 0.5; }],
    ['workbench/finops-incomplete-pair', (d) => { d.components[3].operational.finops.storage_gb = 10; }],
  ];
  for (const [code, mutate] of cases) {
    const found = diagnose(mutate).filter((d) => d.severity === 'error');
    assert.ok(found.some((d) => d.code === code), `${code}: ${JSON.stringify(found.map((d) => d.code))}`);
  }
  // A load stated where the model cannot use it is reported, not dropped.
  const warned = diagnose((d) => { d.components[1].operational.capacity.baseline_rps = 10; });
  assert.ok(warned.some((d) => d.code === 'workbench/baseline-not-on-entry' && d.severity === 'warning'));
});

test('contradictions: validate refuses a contradictory document, and stated usage that disagrees with the modelled load is invalid, not averaged', (t) => {
  const broken = authoredDesign();
  broken.components[2].operational.finops.meters[1].unit = 'GB-month';
  const where = runCli(t, broken, 'review').dir;
  const refused = spawnSync(process.execPath, [cli, 'validate', 'architecture', 'in.json', '--json'], { cwd: where, encoding: 'utf8' });
  assert.notEqual(refused.status, 0);
  assert.match(refused.stdout + refused.stderr, /does not measure memory-seconds/);

  // 40 requests a second is about 105 million a month; the document also says 3 million.
  const document = authoredDesign();
  document.components[2].operational.finops.usage.requests_per_month = 3_000_000;
  const m = model(document);
  const cost = estimateCost(m, simulate(m));
  assert.equal(cost.status, 'invalid');
  assert.equal(cost.monthly_total_usd, null);
  assert.ok(cost.nodes.fn.meters.every((meter) => meter.status === 'invalid' && meter.cost_usd == null));
  assert.match(cost.nodes.fn.reasons.find((item) => item.code === 'contradictory-input').message, /3000000 requests a month.*modelled load/);
  assert.equal(formatCost(cost).text, 'invalid inputs');
});

// ---------------------------------------------------------------------------------------
// 6. Units and dimensional analysis
// ---------------------------------------------------------------------------------------

test('units: the same quantity priced in another unit of the same dimension costs the same', () => {
  const priceOf = (mutate) => { const document = authoredDesign(); mutate(document.components.find((c) => c.id === 'fn').operational.finops, document.components.find((c) => c.id === 'db').operational.finops); const m = model(document); return estimateCost(m, simulate(m)); };
  const base = priceOf(() => {});
  const close = (a, b, what) => assert.ok(Math.abs(a - b) <= 0.01, `${what}: ${a} vs ${b}`);
  // Memory stated in GiB and priced per GiB-second: the same memory, the same bill.
  const gib = priceOf((fn) => { fn.usage = { avg_duration_ms: 1000, memory_gib: 0.5 / GIB_IN_GB }; fn.meters[1] = { ...fn.meters[1], unit: 'GiB-second', price: fn.meters[1].price * GIB_IN_GB, free_allowance: 400000 / GIB_IN_GB }; });
  close(gib.nodes.fn.total_usd, base.nodes.fn.total_usd, 'GB-second vs GiB-second');
  // Database: per hour or per month (730 hours); per GB-month or per TB-month.
  const month = priceOf((fn, db) => { db.meters[0] = { ...db.meters[0], unit: 'month', price: 0.5 * 730 }; });
  close(month.nodes.db.total_usd, base.nodes.db.total_usd, 'hour vs month');
  const tb = priceOf((fn, db) => { db.meters[1] = { ...db.meters[1], unit: 'TB-month', price: 0.1 * 1000 }; });
  close(tb.nodes.db.total_usd, base.nodes.db.total_usd, 'GB-month vs TB-month');
  // A price per million and the same price per unit.
  const each = priceOf((fn) => { fn.meters[0] = { ...fn.meters[0], per: 1, price: 0.2 / 1000000 }; });
  close(each.nodes.fn.total_usd, base.nodes.fn.total_usd, 'per million vs per request');
});

test('units: every computed cost line can be recomputed from the inputs, quantity, allowance and price it reports', () => {
  const m = model(authoredDesign());
  const cost = estimateCost(m, simulate(m));
  assert.equal(cost.status, 'complete');
  for (const [id, entry] of Object.entries(cost.nodes).filter(([, e]) => e.priced)) {
    for (const meter of entry.meters) {
      const billable = Math.max(0, meter.quantity - meter.free_allowance);
      assert.ok(Math.abs(billable / meter.per * meter.price - meter.cost_usd) < 0.01, `${id}/${meter.id}`);
      assert.ok(meter.inputs.every((input) => input.input && input.origin && input.value != null), `${id}/${meter.id}: every input has a value and an origin`);
      assert.match(meter.equation, /cost = /);
      assert.ok(meter.source.url && meter.source.retrieved_at && meter.source.region, `${id}/${meter.id}: priced from a source`);
    }
  }
  // Each headline figure of the simulation names its calculation, equation and inputs.
  const result = simulate(m);
  for (const [key, trace] of Object.entries(result.trace)) {
    assert.ok(CALCULATIONS[trace.calculation], key);
    assert.ok(trace.equation.length > 10 && trace.inputs.length > 0, key);
    for (const input of trace.inputs) assert.ok(ORIGINS.includes(input.origin), `${key}: ${input.subject}.${input.input}`);
  }
  // Tiers and allowances: 250 units, 100 free, then 100 at $2 and the rest at $1.
  assert.deepEqual(meterCharge({ per: 1, free_allowance: 100, tiers: [{ up_to: 100, price: 2 }, { up_to: null, price: 1 }] }, 250), { billable: 150, cost: 250, steps: [{ units: 100, price: 2 }, { units: 50, price: 1 }], unpriced_units: 0 });
  assert.equal(meterCharge({ per: 1000, free_allowance: 0, price: 5 }, 0).cost, 0);
  assert.equal(meterCharge({ per: 1, free_allowance: 500, price: 5 }, 100).cost, 0, 'inside the free allowance is a real zero');
  assert.equal(meterCharge({ per: 1, free_allowance: 0, tiers: [{ up_to: 10, price: 1 }] }, 25).unpriced_units, 15, 'beyond the last closed tier there is no price');
});

// ---------------------------------------------------------------------------------------
// 7. Extreme values
// ---------------------------------------------------------------------------------------

test('extremes: very large, very small and boundary values stay finite, typed and honest', () => {
  const cases = {
    'huge load': (d) => { d.components[0].operational.capacity.baseline_rps = 1e12; },
    'tiny capacity': (d) => { d.components[1].operational.capacity = { max_rps: 1e-6 }; },
    'zero load': (d) => { d.components[0].operational.capacity.baseline_rps = 0; },
    'availability 0': (d) => { d.components[1].operational.sla_percent = 0; },
    'availability 100': (d) => { for (const c of d.components.slice(1)) c.operational.sla_percent = 100; },
    'zero price': (d) => { for (const meter of d.components[2].operational.finops.meters) meter.price = 0; },
    'huge price': (d) => { d.components[2].operational.finops.meters[0].price = 1e9; },
    'zero duration is not allowed': null,
  };
  for (const [name, mutate] of Object.entries(cases).filter(([, value]) => value)) {
    const document = authoredDesign(); mutate(document);
    const m = model(document);
    for (const inputs of [{}, { multiplier: 100 }, { multiplier: 0.1, cacheHit: 0.99 }, { faults: { nodes: { db: 'down' }, zone: 'down' } }]) {
      const result = simulate(m, inputs);
      const cost = estimateCost(m, result);
      assert.deepEqual(nonFinite({ result, cost, review: review(m, { multiplier: inputs.multiplier ?? 1 }) }), [], name);
      assert.ok(STATUSES.includes(result.status) && STATUSES.includes(cost.status), name);
      assert.doesNotThrow(() => JSON.parse(JSON.stringify({ result, cost })), name);
      if (cost.status === 'complete') assert.ok(cost.monthly_total_usd >= 0, name);
    }
  }
  // A real zero is reported as zero and complete: zero is not the same as unknown.
  const free = authoredDesign(); for (const c of free.components) for (const meter of c.operational?.finops?.meters ?? []) { meter.price = 0; }
  const fm = model(free); const zero = estimateCost(fm, simulate(fm));
  assert.deepEqual([zero.status, zero.monthly_total_usd, formatCost(zero).text], ['complete', 0, '$0.00']);
  // 100% availability everywhere is 100, and anything less is never rounded up to it.
  const nearly = simulate(model(authoredDesign()));
  assert.ok(nearly.kpis.composite_sla_percent < 100);
  assert.throws(() => simulate(model(authoredDesign()), { multiplier: 0 }), /multiplier must be greater than 0/);
  assert.throws(() => simulate(model(authoredDesign()), { faults: { zone: 'sideways' } }), /zone fault/);
  // A wide graph: 300 components.
  const wide = authoredDesign();
  for (let i = 0; i < 300; i += 1) { wide.components.push({ id: `n${i}`, type: 'backend', label: `Service ${i}`, row: 2 + Math.floor(i / 4), col: i % 4 }); wide.connections.push({ id: `api-n${i}`, from: 'api', to: `n${i}` }); }
  const big = simulate(model(wide), { multiplier: 3 });
  assert.deepEqual(nonFinite(big), []);
  assert.equal(Object.keys(big.nodes).length, 304);
});

// ---------------------------------------------------------------------------------------
// 8. Provider-independent FinOps fixtures
// ---------------------------------------------------------------------------------------

/** One function component priced by request and by compute time, with configurable billing. */
function billed({ usage, meters, pricing_model = 'serverless-request', baseline = null, asOf = '2026-11-15' }) {
  return {
    schema_version: 1, diagram_type: 'architecture', meta: { title: 'Billing fixture', output: 'billing-fixture.html' },
    components: [
      { id: 'callers', type: 'external', label: 'Callers', ...(baseline != null ? { operational: { capacity: { baseline_rps: baseline } } } : {}) },
      { id: 'fn', type: 'backend', label: 'Function', operational: { role: 'stateless-compute', finops: { pricing_model, usage, meters } } },
    ],
    connections: [{ id: 'callers-fn', from: 'callers', to: 'fn' }],
    workbench: { as_of: asOf },
  };
}
const priceOf = (document, options) => { const m = model(document); return estimateCost(m, simulate(m), options); };
const src = (retrieved_at = '2026-11-10') => ({ origin: 'imported', provider: 'example-cloud', service: 'Compute', meter: 'Duration', sku: 'EX-123', region: 'region-1', plan: 'on-demand', commitment: 'none', url: 'https://pricing.example.com/compute', retrieved_at, effective_at: '2026-01-01' });

test('finops fixture: request plus memory-duration billing with free allowances (function-style)', () => {
  // 3,000,000 requests of 1 s at 0.5 GB: 1,500,000 GB-s, 400,000 free, at $0.0000166667 = $18.33;
  // requests: (3,000,000 - 1,000,000) x $0.20 per million = $0.40. Total $18.73.
  const cost = priceOf(billed({ usage: { requests_per_month: 3_000_000, avg_duration_ms: 1000, memory_gb: 0.5 }, meters: [
    { id: 'requests', dimension: 'requests', unit: 'request', price: 0.2, per: 1_000_000, currency: 'USD', free_allowance: 1_000_000, source: src() },
    { id: 'duration', dimension: 'memory-seconds', unit: 'GB-second', price: 0.0000166667, currency: 'USD', free_allowance: 400_000, quantity_basis: 'request-duration', source: src() },
  ] }));
  const [requests, duration] = cost.nodes.fn.meters;
  assert.deepEqual([requests.quantity, requests.billable_quantity, requests.cost_usd], [3_000_000, 2_000_000, 0.4]);
  assert.deepEqual([duration.quantity, duration.billable_quantity, duration.cost_usd], [1_500_000, 1_100_000, 18.3334]);
  assert.deepEqual([cost.status, cost.monthly_total_usd, cost.confidence.level], ['complete', 18.73, 'traceable']);
  // The request meter alone is 2% of that bill: it is reported as a partial subtotal that omits the duration dimension.
  const requestOnly = priceOf(billed({ usage: { requests_per_month: 3_000_000 }, meters: [{ id: 'requests', dimension: 'requests', unit: 'request', price: 0.2, per: 1_000_000, currency: 'USD', source: src() }] }));
  assert.deepEqual([requestOnly.status, requestOnly.monthly_total_usd, requestOnly.subtotal_usd], ['partial', null, 0.6]);
  assert.deepEqual(requestOnly.billing.missing_dimensions, { fn: ['memory-seconds or vcpu-seconds'] });
  assert.match(formatCost(requestOnly).text, /^at least \$0\.60$/);
  assert.ok(costLines(requestOnly).some((line) => /^Left out: fn, memory-seconds or vcpu-seconds/.test(line)), 'the dimension the pricing model bills and no meter covers is named');
  assert.match(requestOnly.nodes.fn.reasons.find((item) => item.code === 'billing-dimension-missing').message, /serverless-request bills memory-seconds or vcpu-seconds/);
});

test('finops fixture: instance-time billing divides by concurrency (container-style), and needs it stated', () => {
  // 10,000,000 requests of 400 ms at concurrency 20: 200,000 instance-seconds; 1 vCPU and 0.5 GiB.
  const meters = [
    { id: 'cpu', dimension: 'vcpu-seconds', unit: 'vCPU-second', price: 0.00002, currency: 'USD', free_allowance: 180_000, quantity_basis: 'instance-time', source: src() },
    { id: 'memory', dimension: 'memory-seconds', unit: 'GiB-second', price: 0.000002, currency: 'USD', quantity_basis: 'instance-time', source: src() },
    { id: 'requests', dimension: 'requests', unit: 'request', price: 0.4, per: 1_000_000, currency: 'USD', free_allowance: 2_000_000, source: src() },
  ];
  const usage = { requests_per_month: 10_000_000, avg_duration_ms: 400, vcpu: 1, memory_gib: 0.5, concurrency: 20 };
  const cost = priceOf(billed({ pricing_model: 'serverless-instance', usage, meters }));
  const by = Object.fromEntries(cost.nodes.fn.meters.map((meter) => [meter.id, meter]));
  assert.deepEqual([by.cpu.quantity, by.memory.quantity, by.requests.billable_quantity], [200_000, 100_000, 8_000_000]);
  assert.deepEqual([by.cpu.cost_usd, by.memory.cost_usd, by.requests.cost_usd], [0.4, 0.2, 3.2]);
  assert.deepEqual([cost.status, cost.monthly_total_usd], ['complete', 3.8]);
  // Without the concurrency the instance time is unknown: the two compute meters are left out, by name.
  const { concurrency, ...withoutConcurrency } = usage;
  const open = priceOf(billed({ pricing_model: 'serverless-instance', usage: withoutConcurrency, meters }));
  assert.equal(concurrency, 20);
  assert.deepEqual([open.status, open.monthly_total_usd, open.subtotal_usd], ['partial', null, 3.2]);
  for (const id of ['cpu', 'memory']) {
    const meter = open.nodes.fn.meters.find((item) => item.id === id);
    assert.deepEqual([meter.status, meter.cost_usd, meter.reasons[0].code], ['inconclusive', null, 'missing-meter-quantity']);
    assert.ok(meter.missing.some((item) => /concurrency/.test(item.input)));
  }
});

test('finops fixture: usage derived from modelled load, scaled by the run, with no stated usage', () => {
  const document = billed({ baseline: 10, usage: { avg_duration_ms: 200, memory_gb: 1 }, meters: [
    { id: 'requests', dimension: 'requests', unit: 'request', price: 1, per: 1_000_000, currency: 'USD' },
    { id: 'duration', dimension: 'memory-seconds', unit: 'GB-second', price: 0.00001, currency: 'USD', quantity_basis: 'request-duration' },
  ] });
  const cost = priceOf(document);
  const requests = 10 * SECONDS;
  assert.equal(cost.nodes.fn.meters[0].quantity, requests);
  assert.equal(cost.nodes.fn.meters[0].inputs.find((input) => input.input === 'modelled load').origin, 'derived');
  assert.equal(cost.monthly_total_usd, Math.round((requests / 1e6 + requests * 0.2 * 0.00001) * 100) / 100);
  const m = model(document);
  const surge = estimateCost(m, simulate(m, { multiplier: 3 }));
  assert.equal(surge.nodes.fn.meters[0].quantity, requests * 3);
});

test('finops fixture: what the model cannot represent is unsupported or partial, never a plausible number', () => {
  const euro = priceOf(billed({ usage: { requests_per_month: 1_000_000, avg_duration_ms: 100, memory_gb: 1 }, meters: [
    { id: 'requests', dimension: 'requests', unit: 'request', price: 0.2, per: 1_000_000, currency: 'EUR' },
    { id: 'duration', dimension: 'memory-seconds', unit: 'GB-second', price: 0.00001, currency: 'USD', quantity_basis: 'request-duration' },
  ] }));
  assert.deepEqual([euro.nodes.fn.meters[0].status, euro.nodes.fn.meters[0].cost_usd, euro.nodes.fn.meters[0].reasons[0].code], ['unsupported', null, 'unsupported-currency']);
  assert.deepEqual([euro.status, euro.monthly_total_usd, euro.subtotal_usd], ['partial', null, 1]);
  const other = priceOf(billed({ pricing_model: 'flat-monthly', usage: {}, meters: [{ id: 'seats', dimension: 'other', currency: 'USD', description: 'Per-seat licence, billed annually' }] }));
  assert.deepEqual([other.status, other.monthly_total_usd, other.subtotal_usd], ['unsupported', null, null]);
  assert.equal(formatCost(other).text, 'unsupported');
  const capped = priceOf(billed({ pricing_model: 'storage', usage: { storage_gb: 500 }, meters: [{ id: 'storage', dimension: 'storage-gb-month', unit: 'GB-month', currency: 'USD', tiers: [{ up_to: 100, price: 0.1 }] }] }));
  assert.deepEqual([capped.nodes.fn.meters[0].status, capped.status, capped.monthly_total_usd, capped.subtotal_usd], ['partial', 'partial', null, 10]);
});

test('finops fixture: price evidence is separate from arithmetic: sourced, unsourced, stale and undated', () => {
  const build = (source, asOf) => billed({ asOf, pricing_model: 'flat-monthly', usage: {}, meters: [{ id: 'flat', dimension: 'flat', unit: 'month', price: 100, currency: 'USD', ...(source ? { source } : {}) }] });
  const sourced = priceOf(build(src('2026-11-10'), '2026-11-15'));
  assert.deepEqual([sourced.status, sourced.arithmetic_status, sourced.billing_status, sourced.monthly_total_usd, sourced.confidence.level, sourced.nodes.fn.meters[0].freshness], ['complete', 'complete', 'covered', 100, 'traceable', 'current']);
  for (const key of ['provider', 'service', 'meter', 'sku', 'region', 'plan', 'commitment', 'url', 'retrieved_at', 'effective_at', 'origin']) assert.ok(sourced.nodes.fn.meters[0].source[key], `provenance field ${key} survives to the result`);
  // The same arithmetic with no source: still complete, and visibly unaudited.
  const bare = priceOf(build(null, '2026-11-15'));
  assert.deepEqual([bare.status, bare.monthly_total_usd, bare.confidence.level], ['complete', 100, 'unsourced']);
  assert.ok(codes(bare.confidence.reasons).includes('price-unsourced'));
  assert.ok(costLines(bare).some((line) => /authored worksheet, not a checked provider estimate/.test(line)));
  // Older than the freshness limit against the reference date: stale.
  const old = priceOf(build(src('2026-05-01'), '2026-11-15'));
  assert.deepEqual([old.nodes.fn.meters[0].freshness, old.confidence.level, old.confidence.stale], ['stale', 'partly-sourced', 1]);
  assert.ok(PRICE_MAX_AGE_DAYS > 0 && freshness(src('2026-11-10'), '2026-11-15') === 'current');
  // No reference date: the age is not judged, and that is said.
  const undated = build(src('2026-05-01')); delete undated.workbench;
  const unchecked = priceOf(undated);
  assert.deepEqual([unchecked.nodes.fn.meters[0].freshness, unchecked.confidence.unchecked], ['unchecked', 1]);
  assert.equal(priceOf(undated, { asOf: '2026-11-15' }).nodes.fn.meters[0].freshness, 'stale', 'a reference date can be given at run time');
  assert.equal(freshness(null, '2026-11-15'), 'undated');
});

// ---------------------------------------------------------------------------------------
// 9. Renderer equivalence: one canonical result, every surface
// ---------------------------------------------------------------------------------------

/** The browser copy of the engine, as a page runs it. */
function loadFragment() {
  const namespace = {};
  // eslint-disable-next-line no-new-func
  new Function('ArchiMadeEasy', fs.readFileSync(path.join(repoRoot, 'viewer', 'workbench-engine.js'), 'utf8'))(namespace);
  return namespace.workbenchEngine;
}

function surfaces() {
  const requestPriced = patternDocument('web-ha', 'aws');
  requestPriced.components.find((c) => c.id === 'worker').operational.finops = { cost_per_million_requests_usd: 0.2 };
  const partlyPriced = clone(requestPriced);
  partlyPriced.components.find((c) => c.id === 'users').operational = { capacity: { baseline_rps: 3_000_000 / SECONDS } };
  return [
    ['aws', patternDocument('microservices', 'aws')], ['azure', patternDocument('web-ha', 'azure')], ['gcp', patternDocument('event-driven', 'gcp')],
    ['hybrid', patternDocument('hybrid', 'azure')], ['on-premises', patternDocument('web-ha', 'onprem')], ['provider-neutral', authoredDesign()],
    ['request price, no load', requestPriced], ['request price, with load', partlyPriced],
    ['packaged example', JSON.parse(fs.readFileSync(path.join(skillRoot, 'examples/cloud-native-ecommerce-c4.architecture.json'), 'utf8'))],
  ];
}

test('equivalence: command-line JSON, plain text, the browser engine and the design document say the same thing', (t) => {
  const browser = loadFragment();
  for (const [name, document] of surfaces()) {
    const m = model(document);
    for (const [flag, inputs] of [[[], {}], [['--multiplier', '10'], { multiplier: 10 }], [['--fault', 'zone=down'], { faults: { zone: 'down' } }]]) {
      const at = `${name} ${flag.join(' ')}`;
      const canonical = simulate(m, inputs);
      const cost = estimateCost(m, canonical);
      const head = simulationHeadline(m, canonical);
      // JSON: the canonical object, unchanged.
      const json = runCli(t, document, 'simulate', ...flag, '--cost', '--json').json;
      assert.deepEqual(json.result, plain(canonical), `${at}: JSON result`);
      assert.deepEqual(json.cost, plain(cost), `${at}: JSON cost`);
      assert.deepEqual([json.status, json.headline.text, json.cost_headline.text], [canonical.status, head.text, formatCost(cost).text], at);
      // Plain text: the same status, headline, reasons and cost words.
      const text = runCli(t, document, 'simulate', ...flag, '--cost').stdout;
      assert.ok(text.includes(`Status: ${statusLabel(canonical.status)}`), `${at}: text status`);
      assert.ok(text.includes(head.text), `${at}: text headline`);
      for (const item of canonical.reasons) assert.ok(text.includes(item.message), `${at}: text states ${item.code}`);
      const costHead = formatCost(cost);
      assert.ok(text.includes(`${costHead.label}: ${costHead.text}`), `${at}: text cost`);
      for (const line of costLines(cost, (id) => m.display[id])) assert.ok(text.includes(line), `${at}: text cost line "${line}"`);
      if (cost.status !== 'complete') assert.doesNotMatch(text, /Monthly cost\. Total: \$/, `${at}: no total for an estimate that is not complete`);
      if (canonical.status === 'inconclusive') assert.doesNotMatch(text, /Affected components: none$|Ingress traffic lost: 0%/m, at);
      // The browser copy of the engine: identical objects and identical words.
      const pageDocument = buildWorkbenchData(document).document;
      const pageModel = browser.buildModel(pageDocument).model;
      const pageResult = browser.simulate(pageModel, inputs);
      assert.deepEqual(plain(pageResult), plain(simulate(model(pageDocument), inputs)), `${at}: page engine result`);
      assert.deepEqual(plain({ status: pageResult.status, kpis: pageResult.kpis, reasons: pageResult.reasons }), plain({ status: canonical.status, kpis: canonical.kpis, reasons: canonical.reasons }), `${at}: the embedded document gives the command-line result`);
      assert.deepEqual(plain(browser.simulationHeadline(pageModel, pageResult)), plain(head), `${at}: page headline`);
      assert.deepEqual(plain(browser.formatCost(browser.estimateCost(pageModel, pageResult))), plain(costHead), `${at}: page cost headline`);
      assert.deepEqual(plain(browser.figures(pageModel, inputs)), plain(figures(m, inputs)), `${at}: page figures`);
      assert.equal(browser.recoveryPlan(pageDocument, inputs).status, recoveryPlan(document, inputs).status, `${at}: recovery plan status`);
    }
    // Review and cost on every surface.
    const reviewed = review(m);
    const reviewJson = runCli(t, document, 'review', '--json').json;
    assert.deepEqual([reviewJson.status, reviewJson.score, reviewJson.score_floor, reviewJson.gaps.length, reviewJson.headline.text], [reviewed.status, reviewed.score, reviewed.score_floor, reviewed.gaps.length, reviewHeadline(reviewed).text], `${name}: review JSON`);
    const reviewText = runCli(t, document, 'review').stdout;
    assert.ok(reviewText.includes(reviewHeadline(reviewed).text), `${name}: review text headline`);
    for (const gap of reviewed.gaps) assert.ok(reviewText.includes(gap.message), `${name}: review text lists the gap ${gap.id}`);
    assert.deepEqual(plain(browser.reviewHeadline(browser.review(browser.buildModel(buildWorkbenchData(document).document).model))), plain(reviewHeadline(reviewed)), `${name}: page review headline`);
    // The design document: the same headlines, statuses and omissions, for the baseline and every scenario.
    const rfc = toRfc(document, m);
    const baseCost = estimateCost(m, simulate(m));
    assert.ok(rfc.includes(reviewHeadline(reviewed).text), `${name}: design document review headline`);
    assert.ok(rfc.includes(formatCost(baseCost).text), `${name}: design document cost words`);
    assert.ok(rfc.includes(`Cost estimate: ${statusLabel(baseCost.status)}`), `${name}: design document cost status`);
    for (const gap of reviewed.gaps) assert.ok(rfc.includes(gap.title), `${name}: design document lists ${gap.id}`);
    for (const scenario of buildScenarios(m).filter((s) => s.applicable)) {
      const outcome = runScenario(m, scenario).result;
      const row = rfc.split('\n').find((line) => line.startsWith(`| ${scenario.title} |`));
      assert.ok(row.includes(`| ${statusLabel(outcome.status)} |`), `${name}: design document status of ${scenario.key}`);
      // Table cells escape Markdown characters: compare the words.
      assert.ok(row.replace(/\\/g, '').includes(simulationHeadline(m, outcome).text), `${name}: design document outcome of ${scenario.key}`);
    }
    if (baseCost.status !== 'complete') assert.doesNotMatch(rfc, /\| Monthly cost: total \| \$/, `${name}: no total in the design document`);
    assert.equal(toRfc(buildWorkbenchData(document).document, model(buildWorkbenchData(document).document)).split('\n').filter((line) => /^\| Monthly cost/.test(line)).join(), rfc.split('\n').filter((line) => /^\| Monthly cost/.test(line)).join(), `${name}: page design document cost row`);
  }
});

test('equivalence: no text surface shows a figure the canonical result holds as null', (t) => {
  const document = patternDocument('web-ha', 'gcp');
  document.components.find((c) => c.id === 'worker').operational.finops = { cost_per_million_requests_usd: 0.4, monthly_base_cost_usd: 12 };
  const m = model(document);
  const canonical = simulate(m, { multiplier: 10 });
  const cost = estimateCost(m, canonical);
  assert.deepEqual([canonical.kpis.composite_sla_percent, canonical.kpis.blast_radius.ingress_share, cost.monthly_total_usd, cost.nodes.worker.requests_usd], [null, null, null, null]);
  const text = runCli(t, document, 'simulate', '--multiplier', '10', '--cost').stdout;
  const rfc = toRfc(document, m);
  // In the design document the surge is the flash-crowd row; the other rows are other scenarios.
  const surgeRow = rfc.split('\n').find((line) => line.startsWith('| 10x flash crowd'));
  for (const [name, surface] of [['text', text], ['design document', rfc]]) {
    assert.doesNotMatch(name === 'text' ? surface : surgeRow, /\b0% of (entry traffic|ingress)|Ingress traffic lost: 0%|no component/i, `${name}: no 0% lost`);
    assert.doesNotMatch(surface, /Total: \$|total \| \$/i, `${name}: no total`);
    assert.match(surface, /at least \$12\.00/, `${name}: the fixed part is shown as a partial subtotal`);
  }
  assert.match(text, /Composite availability: inconclusive/);
  assert.equal(formatUsd(null), null, 'null has no money text');
  assert.deepEqual([formatUsd(0.6), formatUsd(0.004), formatUsd(18.733), formatUsd(99.999), formatUsd(15878), formatUsd(1234567.8)], ['$0.60', '$0.00', '$18.73', '$100.00', '$15,878', '$1,234,568']);
  // A unit price is never rounded: every stated digit is shown.
  assert.deepEqual([formatPrice(0.000016), formatPrice(0.0000166667), formatPrice(0.2), formatPrice(3800), formatPrice(0.0000002), formatPrice(1.5)], ['$0.000016', '$0.0000166667', '$0.20', '$3,800.00', '$0.0000002', '$1.50']);
  assert.equal(formatPrice(null), null);
});

// ---------------------------------------------------------------------------------------
// 10. End to end: a candidate through every command and exported artifact
// ---------------------------------------------------------------------------------------

test('end to end: scaffold, validate, export, check, review, simulate and every hand-off format agree on status', (t) => {
  for (const [pattern, provider] of [['web-ha', 'azure'], ['microservices', 'aws'], ['event-driven', 'gcp'], ['hybrid', 'onprem']]) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'archi-made-easy-e2e-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const run = (...args) => {
      const result = spawnSync(process.execPath, [cli, ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, ARCHI_MADE_EASY_UPDATE_CHECK_DISABLED: '1', ARCHI_MADE_EASY_BRAND_CAPTURE_DISABLED: '1' } });
      let json = null;
      try { json = JSON.parse(result.stdout); } catch { /* text */ }
      return { ...result, json };
    };
    const at = `${pattern}/${provider}`;
    assert.equal(run('scaffold', pattern, '--provider', provider, '--output', 'page.html', '--out', 'candidate.json').status, 0, at);
    assert.equal(run('validate', 'architecture', 'candidate.json', '--quality', 'showcase', '--json').status, 0, at);
    const exported = run('export', 'html', 'candidate.json', 'page.html', '--force', '--json');
    assert.equal(exported.status, 0, `${at}: ${exported.stdout}${exported.stderr}`);
    const checked = run('check', 'page.html', '--json');
    assert.equal(checked.status, 0, `${at}: ${checked.stdout}`);
    const document = JSON.parse(fs.readFileSync(path.join(dir, 'candidate.json'), 'utf8'));
    const m = model(document);
    // The page carries the document the engine reads: its result is the command line's.
    const html = fs.readFileSync(path.join(dir, 'page.html'), 'utf8');
    const embedded = JSON.parse(/<script id="archi-made-easy-workbench-data" type="application\/json">([\s\S]*?)<\/script>/.exec(html)[1]).document;
    const surge = run('simulate', 'candidate.json', '--multiplier', '10', '--json').json.result;
    assert.deepEqual(plain(simulate(model(embedded), { multiplier: 10 }).kpis), surge.kpis, `${at}: the page's document gives the command line's figures`);
    assert.equal(surge.status, 'inconclusive', `${at}: a scaffold states no load`);
    assert.equal(run('review', 'candidate.json', '--json').json.status, review(m).status, at);
    assert.equal(run('simulate', 'candidate.json', '--scenario', 'all', '--json').json.outcomes.length, 7, at);
    assert.equal(run('simulate', 'candidate.json', '--fmea', '--json').json.fmea.status, buildFmea(m).status, at);
    // The page itself states no figure as text: figures are drawn by the workbench from the engine.
    assert.doesNotMatch(html.replace(/<script[\s\S]*?<\/script>/g, ''), /No component is affected|Nothing to recover from/, `${at}: no reassurance baked into the page markup`);
    for (const format of ['mermaid', 'drawio', 'structurizr', 'rfc']) {
      const out = run('export', format, 'candidate.json', `handoff.${format}`, '--force');
      assert.equal(out.status, 0, `${at} ${format}: ${out.stderr}`);
      assert.ok(fs.statSync(path.join(dir, `handoff.${format}`)).size > 100, `${at} ${format}`);
    }
    const rfc = fs.readFileSync(path.join(dir, 'handoff.rfc'), 'utf8');
    assert.equal(rfc, toRfc(document, m), `${at}: the exported design document is the engine's`);
    assert.match(rfc, /\| 10x flash crowd \| .* \| inconclusive \| Inconclusive\./, at);
  }
});

test('requirements: a calculation reports what it lacks from the declared table, under the conditions of the run', () => {
  const none = model(patternDocument('web-ha', 'azure'));
  assert.equal(checkCalculation('traffic.load', none, {}).status, 'unknown');
  const surge = checkCalculation('traffic.load', none, { loadScaled: true });
  assert.deepEqual([surge.status, codes(surge.reasons), surge.missing.map((item) => [item.input, item.unit])], ['inconclusive', ['missing-baseline-load'], [['entry.capacity.baseline_rps', 'requests/s']]]);
  assert.equal(checkCalculation('capacity.ceiling', none, { loadScaled: true }).status, 'complete', 'the ceiling does not need a load');
  assert.equal(checkCalculation('traffic.load', model(authoredDesign()), { loadScaled: true }).status, 'complete');
  assert.throws(() => checkCalculation('made.up', none), /unknown calculation/);
});
