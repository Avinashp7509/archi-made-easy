// The exact scenarios of the two QA reports on Microsoft 365 Copilot Edition v1.0.0
// (15 November 2026): "Architecture creation + simulation" and "FinOps". Each test is named
// after the report finding it reproduces and failed on the code those reports tested.
//
// These are the samples. The failure classes behind them (unknown shown as zero, a partial
// figure shown as a total, a check that could not run shown as passed, a renderer deciding
// on its own) are held by invariants in truth-contract.test.mjs.
//
// Only interfaces that existed before the fix are imported here, so the same file runs
// against the earlier code and fails there on behaviour, not on a missing module.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadKnowledge } from '../archi-made-easy/bin/workbench.mjs';
import { scaffold } from '../archi-made-easy/workbench/scaffold.mjs';
import { buildModel } from '../archi-made-easy/workbench/model.mjs';
import { simulate } from '../archi-made-easy/workbench/sim.mjs';
import { estimateCost } from '../archi-made-easy/workbench/cost.mjs';
import { review } from '../archi-made-easy/workbench/review.mjs';
import { buildScenarios, runScenario } from '../archi-made-easy/workbench/scenarios.mjs';
import { figures, compareFigures, recoveryPlan } from '../archi-made-easy/workbench/remedy.mjs';
import { toRfc } from '../archi-made-easy/workbench/exporters/rfc.mjs';

const skillRoot = fileURLToPath(new URL('../archi-made-easy/', import.meta.url));
const cli = path.join(skillRoot, 'bin/archi-made-easy.mjs');
const knowledge = loadKnowledge();

/** The scaffold the report's host agent started from, for a pattern and a provider. */
function candidate(patternId, providerId) {
  return scaffold({ slots: knowledge.slots, pattern: knowledge.patterns.find((p) => p.id === patternId), provider: knowledge.providers.find((p) => p.id === providerId) });
}
const component = (document, id) => document.components.find((c) => c.id === id);
const operational = (document, id) => (component(document, id).operational ??= {});
const model = (document) => buildModel(document).model;
const codes = (list) => list.map((item) => item.code);

function runCli(t, document, ...args) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'archi-made-easy-qa-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'candidate.json'), JSON.stringify(document));
  const result = spawnSync(process.execPath, [cli, args[0], 'candidate.json', ...args.slice(1)], { cwd: dir, encoding: 'utf8', env: { ...process.env, ARCHI_MADE_EASY_UPDATE_CHECK_DISABLED: '1' } });
  let json = null;
  try { json = JSON.parse(result.stdout); } catch { /* text output */ }
  return { ...result, json };
}

// Words that reassure. None may appear for a run that calculated nothing.
const REASSURANCE = /No component is affected|Affected components: none\b(?! fail)|Ingress traffic lost: 0%|0% of entry traffic|Nothing to recover from|no component affected/i;

// ---------------------------------------------------------------------------------------
// Report 1, P0: "Traffic multiplier without baseline returns false reassurance"
// Prompt: "Design a food-delivery backend on AWS. What happens ... with 10x traffic?"
// ---------------------------------------------------------------------------------------

test('QA P0: 10x traffic with no baseline load is inconclusive in the engine, with the reason', () => {
  const document = candidate('microservices', 'aws');
  const m = model(document);
  assert.ok(m.entrypoints.every((id) => m.nodes.find((n) => n.id === id).capacity.baseline_rps == null), 'the candidate states no load, as in the report');
  const result = simulate(m, { multiplier: 10 });
  assert.equal(result.status, 'inconclusive');
  assert.ok(codes(result.reasons).includes('missing-baseline-load'));
  assert.ok(result.missing.some((item) => /baseline_rps/.test(item.input)), 'the missing input is named');
  // Nothing about the outcome is stated: not "0% lost", not an unchanged availability or latency.
  assert.equal(result.kpis.blast_radius.ingress_share, null);
  assert.equal(result.kpis.composite_sla_percent, null);
  assert.equal(result.kpis.critical_path.p99_ms, null);
  assert.ok(Object.values(result.nodes).every((node) => node.load_rps == null && node.saturated == null), 'unknown load is not "not saturated"');
  // The ceiling is still reported, as a ceiling.
  assert.ok(result.kpis.max_sustainable_rps > 0);
});

test('QA P0: no unchanged before/after comparison and no "nothing to recover from" for the uncalculated surge', () => {
  const document = candidate('microservices', 'aws');
  const m = model(document);
  const rows = compareFigures(figures(m, {}), figures(m, { multiplier: 10 }));
  for (const metric of ['composite_sla_percent', 'critical_path_p99_ms', 'affected_components', 'ingress_lost_percent']) {
    assert.equal(rows.find((row) => row.metric === metric).verdict, 'not comparable', metric);
  }
  const plan = recoveryPlan(document, { multiplier: 10 });
  assert.equal(plan.status, 'inconclusive');
  assert.equal(plan.affected_components, null);
  assert.deepEqual(plan.options, []);
});

test('QA P0: command-line JSON, plain text and the design document agree that the surge is inconclusive', (t) => {
  const document = candidate('microservices', 'aws');
  const json = runCli(t, document, 'simulate', '--multiplier', '10', '--json');
  assert.equal(json.status, 0, json.stderr);
  assert.equal(json.json.result.status, 'inconclusive');
  assert.ok(codes(json.json.result.reasons).includes('missing-baseline-load'));
  const text = runCli(t, document, 'simulate', '--multiplier', '10').stdout;
  assert.match(text, /inconclusive/i);
  assert.match(text, /baseline_rps/);
  assert.match(text, /requests per second on at least one entry point/, 'the reader is told what to supply');
  assert.doesNotMatch(text, REASSURANCE);
  assert.match(text, /Capacity ceiling of the request path: \d+ requests\/s/, 'the ceiling is still shown, as a ceiling');
  const scenario = runCli(t, document, 'simulate', '--scenario', 'c').stdout;
  assert.match(scenario, /inconclusive/i);
  assert.doesNotMatch(scenario, REASSURANCE);
  const rfc = toRfc(document, model(document));
  const row = rfc.split('\n').find((line) => line.startsWith('| 10x flash crowd'));
  assert.match(row, /inconclusive/i);
  assert.doesNotMatch(row, REASSURANCE);
});

test('QA P0: with an authored baseline the surge is calculated: load, utilisation, saturation, latency, queue lag, affected components', () => {
  const document = candidate('microservices', 'aws');
  operational(document, 'users').capacity = { baseline_rps: 300 };
  operational(document, 'notifier').capacity = { ...(operational(document, 'notifier').capacity || {}), max_rps: 100 };
  const m = model(document);
  const calm = simulate(m, {});
  const surge = simulate(m, { multiplier: 10 });
  assert.notEqual(surge.status, 'inconclusive');
  assert.equal(surge.kpis.ingress_rps, 3000);
  assert.ok(Object.values(surge.nodes).some((node) => node.utilisation > 1 && node.saturated === true));
  assert.ok(surge.kpis.critical_path.p99_ms > calm.kpis.critical_path.p99_ms, 'latency rises under load');
  assert.ok(surge.events.some((event) => event.type === 'saturation'));
  assert.ok(surge.events.some((event) => event.type === 'queue-lag' && event.node === 'notifier'));
  assert.ok(surge.kpis.blast_radius.nodes.length > 0);
});

// ---------------------------------------------------------------------------------------
// Report 1, P1: "Zone and region blackout are conflated"
// Prompt: "Build a highly available online store on Azure that survives a zone outage."
// ---------------------------------------------------------------------------------------

test('QA P1: zone loss and region loss are separate scenarios, each naming its exact boundary', () => {
  const m = model(candidate('web-ha', 'azure'));
  const regionIds = new Set(m.boundaries.filter((b) => b.scope === 'region').map((b) => b.id));
  const scenarios = buildScenarios(m);
  const zone = scenarios.find((s) => /zone/.test(s.key));
  const region = scenarios.find((s) => /region/.test(s.key) && !/zone/.test(s.key));
  assert.ok(zone && region, 'one scenario for a zone, another for the region');
  assert.ok(zone.targets.every((id) => !regionIds.has(id)), 'the zone scenario never fails the region boundary');
  assert.ok(region.targets.every((id) => regionIds.has(id)));
  assert.match(zone.fails, /zone/i);
  assert.match(zone.fails, /not the region/i);
  assert.match(region.fails, /region/i);
});

test('QA P1: a zone-redundant design is not reported as failing a zone outage because a whole region was removed', () => {
  const document = candidate('web-ha', 'azure');
  const m = model(document);
  const zone = buildScenarios(m).find((s) => /zone/.test(s.key));
  const outcome = runScenario(m, zone).result;
  // The candidate does not say where the provider's identity service runs: the honest
  // result is a range, not an outage.
  assert.equal(outcome.status, 'inconclusive');
  assert.ok(codes(outcome.reasons).includes('placement-unknown'));
  assert.deepEqual(outcome.bounds.best.failing, [], 'in the best case nothing fails: every authored component is zone-redundant');
  assert.ok(outcome.bounds.worst.failing.includes('identity'));
  // Once that one fact is stated, the same scenario gives a definite answer: it survives.
  operational(document, 'identity').redundancy = 'multi-az';
  const stated = model(document);
  const survived = runScenario(stated, buildScenarios(stated).find((s) => /zone/.test(s.key))).result;
  assert.notEqual(survived.status, 'inconclusive');
  assert.deepEqual(survived.kpis.blast_radius.nodes.filter((id) => survived.nodes[id].state === 'failing'), []);
  assert.equal(survived.kpis.blast_radius.ingress_share, 0);
  // The region scenario still removes the region, and says so.
  const region = runScenario(stated, buildScenarios(stated).find((s) => s.key === 'region-blackout')).result;
  assert.equal(region.kpis.blast_radius.ingress_share, 1);
});

// ---------------------------------------------------------------------------------------
// Report 1, P1: "Managed Entra ID receives a customer-deployment fix"
// ---------------------------------------------------------------------------------------

test('QA P1: a provider-managed identity service gets no "run it multi-az" fix; its unknown redundancy is a question', () => {
  for (const provider of ['azure', 'aws', 'gcp']) {
    const m = model(candidate('web-ha', provider));
    const identity = m.nodes.find((n) => n.role === 'identity');
    const reviewed = review(m);
    const fixesOnIdentity = reviewed.findings.flatMap((f) => f.fixes).filter((fix) => fix.id === identity.id);
    assert.deepEqual(fixesOnIdentity, [], `${provider}: no change is proposed to a service the customer does not deploy`);
    assert.equal(reviewed.findings.some((f) => f.rule === 'spof' && f.affectedNodes.includes(identity.id)), false, provider);
    const gap = reviewed.gaps.find((g) => g.rule === 'spof' && g.subjects.includes(identity.id));
    assert.ok(gap, `${provider}: the unknown redundancy is reported as not evaluated`);
    assert.match(gap.message, /provider-managed/);
  }
});

// ---------------------------------------------------------------------------------------
// Report 1, P2 findings
// ---------------------------------------------------------------------------------------

test('QA P2: a contained database outage is not reported as plain availability; a declared journey fails', () => {
  const document = candidate('microservices', 'aws');
  document.workbench = { ...(document.workbench || {}), traces: [{ id: 'place-order', title: 'Place order', kind: 'normal', steps: [{ edge: 'users-gateway' }, { edge: 'gateway-orders' }, { edge: 'orders-db' }] }] };
  const m = model(document);
  const result = simulate(m, { faults: { nodes: { orders_db: 'down' } } });
  assert.ok(result.kpis.composite_sla_percent > 99, 'the gateway still answers, as the report observed');
  assert.notEqual(result.assessments.availability.status, 'complete');
  assert.ok(codes(result.assessments.availability.reasons).includes('answered-includes-degraded'));
  assert.deepEqual(result.kpis.journeys.map((j) => [j.id, j.status, j.blocked_at]), [['place-order', 'failed', 'orders']]);
});

test('QA P2: circuit-breaker fixes are offered only on connections whose caller the design owns', () => {
  let offered = 0;
  for (const pattern of knowledge.patterns) {
    for (const provider of knowledge.providers) {
      const m = model(scaffold({ slots: knowledge.slots, pattern, provider }));
      for (const fix of review(m).findings.flatMap((f) => f.fixes).filter((f) => f.target === 'connection' && f.operational.resilience?.circuit_breaker_enabled)) {
        const caller = m.nodes.find((n) => n.id === m.edges.find((e) => e.id === fix.id).from);
        assert.equal(caller.actor, false, `${pattern.id}/${provider.id}: ${fix.id} starts at an actor`);
        assert.notEqual(caller.managed_by, 'provider', `${pattern.id}/${provider.id}: ${fix.id} starts at a provider-managed service`);
        offered += 1;
      }
    }
  }
  assert.ok(offered > 0, 'fixes are still offered where they make sense');
});

test('QA P2: two components with one label are told apart in scenario targets and output', (t) => {
  const document = candidate('microservices', 'aws');
  const m = model(document);
  assert.equal(m.nodes.filter((n) => n.label === 'Aurora').length, 2, 'the report case: two Aurora databases');
  const database = buildScenarios(m).find((s) => s.key === 'database-outage');
  assert.notEqual(database.target_labels[0], 'Aurora');
  assert.match(database.target_labels[0], /Aurora \(.+\)/);
  const text = runCli(t, document, 'simulate', '--scenario', 'a').stdout;
  assert.match(text, /Aurora \(Orders data\): failing/);
});

test('QA P2: a background consumer is not the headline capacity of the request path', () => {
  const document = candidate('microservices', 'aws');
  operational(document, 'notifier').capacity = { max_rps: 50 };
  const k = simulate(model(document), {}).kpis;
  assert.notEqual(k.limiting_node, 'notifier');
  assert.ok(k.max_sustainable_rps > 50);
  assert.deepEqual([k.async_limiting_node, k.async_drain_ceiling_rps], ['notifier', 50]);
});

// ---------------------------------------------------------------------------------------
// Report 2, P0: "Missing usage is presented as $0"
// A valid request price on the worker (the report's Lambda), with no baseline traffic.
// ---------------------------------------------------------------------------------------

function requestPriced(provider = 'aws') {
  const document = candidate('web-ha', provider);
  operational(document, 'worker').finops = { cost_per_million_requests_usd: 0.2 };
  return document;
}

test('FinOps P0: a request price with no traffic is not a $0 estimate', () => {
  const m = model(requestPriced());
  const cost = estimateCost(m, simulate(m));
  assert.equal(cost.status, 'inconclusive');
  assert.equal(cost.monthly_total_usd, null);
  assert.equal(cost.subtotal_usd, null, 'nothing was computed, so there is not even a subtotal');
  assert.notEqual(cost.nodes.worker.requests_usd, 0);
  assert.equal(cost.nodes.worker.total_usd, null);
  assert.ok(codes(cost.reasons).includes('missing-usage-baseline'));
  assert.ok(cost.omitted.some((item) => item.subject === 'worker' && item.dimension === 'requests'));
});

test('FinOps P0: a fixed charge plus an uncomputable request meter gives a partial subtotal, labelled partial', () => {
  const document = requestPriced();
  operational(document, 'worker').finops.monthly_base_cost_usd = 40;
  const m = model(document);
  const cost = estimateCost(m, simulate(m));
  assert.equal(cost.status, 'partial');
  assert.equal(cost.subtotal_usd, 40);
  assert.equal(cost.monthly_total_usd, null, 'a subtotal is never returned as the total');
  assert.equal(cost.lower_bound, true);
  assert.ok(codes(cost.reasons).includes('missing-usage-baseline'));
});

test('FinOps P0: an egress price with no flow is left out with a reason, not silently dropped', () => {
  const document = candidate('multi-region-active-active', 'aws');
  const m0 = model(document);
  const zone = (id) => m0.boundaries.filter((b) => (b.scope === 'region' || b.scope === 'availability-zone') && b.members.includes(id)).map((b) => b.id).join();
  const crossing = m0.edges.find((e) => zone(e.from) !== zone(e.to));
  assert.ok(crossing, 'the pattern has a connection across a region');
  const connection = document.connections.find((c) => c.id === crossing.id);
  connection.operational = { ...(connection.operational || {}), traffic: { ...(connection.operational?.traffic || {}), egress_cost_per_gb_usd: 0.02 } };
  const m = model(document);
  const cost = estimateCost(m, simulate(m));
  assert.deepEqual([cost.egress[crossing.id].status, cost.egress[crossing.id].cost_usd], ['inconclusive', null]);
  assert.equal(cost.status, 'inconclusive');
  assert.equal(cost.monthly_total_usd, null);
  assert.ok(codes(cost.reasons).includes('egress-flow-unknown'));
});

test('FinOps P0: command-line JSON, plain text, review and the design document all carry the omission', (t) => {
  const document = requestPriced();
  const json = runCli(t, document, 'simulate', '--cost', '--json').json;
  assert.equal(json.cost.status, 'inconclusive');
  assert.equal(json.cost.monthly_total_usd, null);
  const text = runCli(t, document, 'simulate', '--cost').stdout;
  assert.match(text, /not calculated/);
  assert.match(text, /left out, not counted as zero/i);
  assert.doesNotMatch(text, /\$0\b(?!\.\d)/, 'no $0 figure anywhere');
  const reviewed = review(model(document));
  assert.notEqual(reviewed.pillars.Cost.score, 100, 'cost is not scored as perfect');
  assert.notEqual(reviewed.pillars.Cost.status, 'complete');
  assert.ok(reviewed.gaps.some((gap) => gap.pillar === 'Cost' && gap.code === 'cost-estimate-incomplete'), 'an actionable completeness gap replaces "no rule fired"');
  const reviewText = runCli(t, document, 'review').stdout;
  assert.match(reviewText, /Cost estimate is not complete/);
  const rfc = toRfc(document, model(document));
  assert.match(rfc, /Monthly cost: not calculated/);
  assert.match(rfc, /left out \(inconclusive\)/);
});

test('FinOps P0 (preserved): no cost fields is still "no data"; complete inputs still give a number', () => {
  const bare = model(candidate('web-ha', 'gcp'));
  const none = estimateCost(bare, simulate(bare));
  assert.deepEqual([none.status, none.monthly_total_usd, none.subtotal_usd, none.coverage.priced_components], ['unknown', null, null, 0]);
  const document = requestPriced();
  operational(document, 'users').capacity = { baseline_rps: 3_000_000 / 2_628_000 };
  const m = model(document);
  const cost = estimateCost(m, simulate(m));
  assert.equal(cost.nodes.worker.requests_usd, 0.6, '3M requests at $0.20 per million');
});

// ---------------------------------------------------------------------------------------
// Report 2, P1 and P2
// ---------------------------------------------------------------------------------------

test('FinOps P1: a request-only price does not look like the whole bill', (t) => {
  const document = requestPriced();
  operational(document, 'users').capacity = { baseline_rps: 3_000_000 / 2_628_000 };
  const m = model(document);
  const cost = estimateCost(m, simulate(m));
  // $0.60 is the request meter, correctly computed, and it is a subtotal.
  assert.equal(cost.subtotal_usd, 0.6);
  assert.equal(cost.monthly_total_usd, null);
  assert.equal(cost.status, 'partial');
  assert.ok(codes(cost.reasons).includes('billing-model-undeclared'), 'the estimate cannot tell whether duration is billed too, and says so');
  // P2 "whole-dollar rounding": $0.60 stays $0.60 in text.
  const text = runCli(t, document, 'simulate', '--cost').stdout;
  assert.match(text, /\$0\.60/);
  assert.doesNotMatch(text, /\$1\b/);
  assert.match(text, /Partial subtotal: at least \$0\.60/);
});

test('FinOps P1: the cost pillar cannot score 100 with one of nine priceable components priced', () => {
  const document = requestPriced();
  operational(document, 'users').capacity = { baseline_rps: 2 };
  const reviewed = review(model(document));
  assert.deepEqual([reviewed.cost.coverage.priced_components, reviewed.cost.coverage.components], [1, 9]);
  assert.equal(reviewed.pillars.Cost.status, 'partial');
  assert.equal(reviewed.dimensions.price_coverage.status, 'partial');
  assert.notEqual(reviewed.status, 'complete');
  assert.ok(reviewed.score_floor < reviewed.score, 'the score states how low it could be');
});

test('FinOps P2: the coverage denominator counts priceable resources, not the user actor', () => {
  const m = model(candidate('web-ha', 'aws'));
  const cost = estimateCost(m, simulate(m));
  const actors = m.nodes.filter((n) => n.actor).length;
  assert.equal(actors, 1);
  assert.equal(cost.coverage.components, m.nodes.length - actors);
  assert.equal(cost.coverage.unpriced.length, cost.coverage.components, 'the unpriced list and the denominator agree');
});

test('FinOps (packaged example): the illustrative total is a partial subtotal with unsourced prices, and is not reviewed as 100 complete', () => {
  const document = JSON.parse(fs.readFileSync(path.join(skillRoot, 'examples/cloud-native-ecommerce-c4.architecture.json'), 'utf8'));
  const m = model(document);
  const cost = estimateCost(m, simulate(m));
  assert.equal(cost.subtotal_usd, 15878, 'the arithmetic the report audited is unchanged');
  assert.equal(cost.monthly_total_usd, null);
  assert.equal(cost.status, 'partial');
  assert.equal(cost.confidence.level, 'unsourced');
  const reviewed = review(m);
  assert.notEqual(reviewed.status, 'complete');
  assert.notEqual(reviewed.pillars.Cost.status, 'complete');
});
