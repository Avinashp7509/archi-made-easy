// Before/after comparison and authored alternatives.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildModel } from '../archi-made-easy/workbench/model.mjs';
import { compareDesigns, compareAlternatives, designSnapshot } from '../archi-made-easy/workbench/compare.mjs';

const cli = fileURLToPath(new URL('../archi-made-easy/bin/archi-made-easy.mjs', import.meta.url));

function design(dbRedundancy = 'single-instance') {
  return {
    schema_version: 1, diagram_type: 'architecture', meta: { title: `DB ${dbRedundancy}`, output: 'd.html', quality_profile: 'standard' },
    layout: { mode: 'grid' },
    components: [
      { id: 'web', type: 'frontend', label: 'Web', row: 0, col: 0, operational: { role: 'ingress', redundancy: 'multi-az', sla_percent: 99.99, capacity: { baseline_rps: 100, max_rps: 5000 }, latency: { p50_ms: 5, p99_ms: 30 } } },
      { id: 'api', type: 'backend', label: 'API', row: 0, col: 1, operational: { role: 'stateless-compute', redundancy: 'multi-az', sla_percent: 99.95, capacity: { max_rps: 1000 }, latency: { p50_ms: 20, p99_ms: 120 } } },
      { id: 'db', type: 'database', label: 'DB', row: 0, col: 2, operational: { role: 'stateful-db', redundancy: dbRedundancy, sla_percent: 99.9, capacity: { max_rps: 2000 }, latency: { p50_ms: 5, p99_ms: 40 }, dr: { rpo_sec: 5, rto_sec: 60 }, security: { encryption_at_rest: true, auth_method: 'iam' }, finops: { monthly_base_cost_usd: dbRedundancy === 'single-instance' ? 300 : 600 } } },
    ],
    connections: [
      { id: 'web-api', from: 'web', to: 'api', label: 'HTTPS', operational: { call_semantics: 'sync-blocking' } },
      { id: 'api-db', from: 'api', to: 'db', label: 'SQL', operational: { call_semantics: 'sync-blocking' } },
    ],
  };
}

test('snapshot carries the comparable figures of one design', () => {
  const snapshot = designSnapshot(buildModel(design()).model);
  assert.equal(snapshot.components, 3);
  assert.equal(snapshot.single_points_of_failure, 1);
  assert.equal(snapshot.monthly_cost_usd, 300);
  // (1 - 0.0001^2) * (1 - 0.0005^2) * 0.999 = 0.99899974
  assert.ok(Math.abs(snapshot.composite_sla_percent - 99.89997) < 1e-4, String(snapshot.composite_sla_percent));
  assert.deepEqual(snapshot.findings.map((f) => f.id), ['spof:db']);
});

test('making the database zone-redundant closes the finding and shows the trade-off', () => {
  const comparison = compareDesigns(buildModel(design('single-instance')).model, buildModel(design('multi-az')).model);
  const metric = Object.fromEntries(comparison.metrics.map((m) => [m.metric, m]));
  assert.equal(metric.composite_sla_percent.verdict, 'better');
  assert.equal(metric.single_points_of_failure.before, 1);
  assert.equal(metric.single_points_of_failure.after, 0);
  assert.equal(metric.single_points_of_failure.verdict, 'better');
  assert.equal(metric.monthly_cost_usd.change, 300);
  assert.equal(metric.monthly_cost_usd.verdict, 'worse', 'higher cost is reported as worse, not hidden');
  assert.equal(metric.review_score.verdict, 'better');
  assert.equal(metric.critical_path_p99_ms.verdict, 'unchanged');
  assert.deepEqual(comparison.findings.closed.map((f) => f.id), ['spof:db']);
  assert.deepEqual(comparison.findings.opened, []);
  assert.deepEqual(comparison.components, { added: [], removed: [] });
  assert.equal(comparison.kind, 'analytical-model');
});

test('comparison reports added and removed components and not-comparable metrics', () => {
  const head = design('multi-az');
  head.components.push({ id: 'cache', type: 'database', label: 'Redis', row: 1, col: 1, operational: { role: 'cache', redundancy: 'multi-az' } });
  head.connections.push({ id: 'api-cache', from: 'api', to: 'cache', label: 'read', operational: { call_semantics: 'sync-blocking', resilience: { circuit_breaker_enabled: true } } });
  const base = design();
  delete base.components[2].operational.finops;
  const comparison = compareDesigns(buildModel(base).model, buildModel(head).model);
  assert.deepEqual(comparison.components.added, ['cache']);
  const cost = comparison.metrics.find((m) => m.metric === 'monthly_cost_usd');
  assert.equal(cost.before, null);
  assert.equal(cost.verdict, 'not comparable');
});

test('authored alternatives are compared with the baseline', () => {
  const document = design();
  document.workbench = { alternatives: [
    { id: 'ha-db', title: 'Zone-redundant database', description: 'Survives a zone failure.', component_overrides: [{ id: 'db', operational: { redundancy: 'multi-az', finops: { monthly_base_cost_usd: 600 } } }] },
    { id: 'breaker', title: 'Circuit breaker on the database call', connection_overrides: [{ id: 'api-db', operational: { resilience: { circuit_breaker_enabled: true } } }] },
  ] };
  const result = compareAlternatives(document);
  assert.equal(result.baseline.single_points_of_failure, 1);
  assert.deepEqual(result.alternatives.map((a) => a.id), ['ha-db', 'breaker']);
  const [ha, breaker] = result.alternatives;
  assert.equal(ha.metrics.find((m) => m.metric === 'single_points_of_failure').after, 0);
  assert.equal(ha.metrics.find((m) => m.metric === 'monthly_cost_usd').after, 600);
  assert.deepEqual(ha.findings.closed.map((f) => f.id), ['spof:db']);
  // With a breaker the database is no longer on the hard path: availability rises, the SPOF leaves the path.
  assert.equal(breaker.metrics.find((m) => m.metric === 'composite_sla_percent').verdict, 'better');
  assert.equal(breaker.metrics.find((m) => m.metric === 'monthly_cost_usd').verdict, 'unchanged');
  assert.equal(JSON.stringify(compareAlternatives(document)), JSON.stringify(result));
});

test('review --against and --alternatives on the command line', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'archi-made-easy-compare-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const run = (...args) => spawnSync(process.execPath, [cli, ...args], { cwd: dir, encoding: 'utf8' });
  fs.writeFileSync(path.join(dir, 'before.json'), JSON.stringify(design('single-instance')));
  fs.writeFileSync(path.join(dir, 'after.json'), JSON.stringify(design('multi-az')));
  const text = run('review', 'after.json', '--against', 'before.json');
  assert.equal(text.status, 0, text.stderr);
  assert.match(text.stdout, /^Design comparison\. Analytical model of the declared architecture, not a measurement\./);
  assert.match(text.stdout, /Single points of failure: 1 → 0 \(-1\) better/);
  assert.match(text.stdout, /Estimated monthly cost: 300 USD → 600 USD \(\+300\) worse/);
  assert.match(text.stdout, /Findings closed \(1\):\n  \[high\] Single point of failure on a critical path \(spof:db\)/);
  const json = JSON.parse(run('review', 'after.json', '--against', 'before.json', '--json').stdout);
  assert.equal(json.mode, 'against');
  assert.equal(json.findings.closed.length, 1);

  const withAlternatives = design();
  withAlternatives.workbench = { alternatives: [{ id: 'ha-db', title: 'Zone-redundant database', component_overrides: [{ id: 'db', operational: { redundancy: 'multi-az' } }] }] };
  fs.writeFileSync(path.join(dir, 'alt.json'), JSON.stringify(withAlternatives));
  const alternatives = run('review', 'alt.json', '--alternatives');
  assert.equal(alternatives.status, 0, alternatives.stderr);
  assert.match(alternatives.stdout, /Zone-redundant database \(ha-db\)/);
  assert.match(alternatives.stdout, /Findings: 1 closed, 0 opened/);

  assert.equal(run('review', 'after.json', '--alternatives').status, 2, 'no alternatives authored');
  assert.equal(run('review', 'after.json', '--against').status, 2);
  assert.equal(run('review', 'after.json', '--against', 'before.json', '--alternatives').status, 2);
  assert.equal(run('review', 'after.json', '--against', 'missing.json').status, 2);
});
