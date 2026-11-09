import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateSchema } from '../archi-made-easy/renderers/shared/validator.mjs';

const cli = fileURLToPath(new URL('../archi-made-easy/bin/archi-made-easy.mjs', import.meta.url));

function full() {
  return {
    schema_version: 1,
    diagram_type: 'architecture',
    meta: { title: 'Workbench fields', output: 'workbench-fields.html', quality_profile: 'standard' },
    layout: { mode: 'grid', cols: 4 },
    components: [
      { id: 'web', type: 'frontend', label: 'Web', row: 0, col: 0, operational: { role: 'ingress', capacity: { baseline_rps: 200, max_rps: 5000 }, security: { public_exposed: true, auth_method: 'oauth2-oidc' } } },
      { id: 'api', type: 'backend', label: 'API', row: 0, col: 1, operational: {
        role: 'stateless-compute', c4_level: 'container', drilldown_diagram_id: 'api-inside', sla_percent: 99.9, redundancy: 'multi-az',
        capacity: { max_rps: 800, cpu_cores: 2, memory_gb: 4, autoscale_min: 2, autoscale_max: 10, scaling_lag_sec: 60 },
        latency: { p50_ms: 20, p95_ms: 90, p99_ms: 200 },
        dr: { rpo_sec: 0, rto_sec: 300, backup_strategy: 'stateless; redeploy' },
        finops: { cloud_provider: 'azure', instance_tier: 'P1v3', monthly_base_cost_usd: 140, cost_per_million_requests_usd: 0.2 },
        security: { trust_zone: 'app', auth_method: 'jwt', encryption_in_transit: true, compliance_tags: ['PCI-DSS'] },
      } },
      { id: 'db', type: 'database', label: 'DB', row: 0, col: 2, operational: { role: 'stateful-db', dr: { rpo_sec: 5, rto_sec: 60 }, finops: { storage_gb: 100, storage_cost_per_gb_usd: 0.12 }, security: { encryption_at_rest: true } } },
      { id: 'dlq', type: 'messagebus', label: 'Dead letters', row: 1, col: 2 },
    ],
    boundaries: [{ id: 'zone-a', kind: 'region', label: 'Zone A', wraps: ['api', 'db'], operational: { scope: 'availability-zone' } }],
    connections: [
      { id: 'c1', from: 'web', to: 'api', operational: { call_semantics: 'sync-blocking', protocol: 'HTTPS/REST', resilience: { timeout_ms: 2000, retries: 1, backoff_strategy: 'exponential', jitter: true, circuit_breaker_enabled: true, circuit_breaker_threshold_pct: 50, idempotent: true }, traffic: { request_multiplier: 1, payload_kb: 4, read_write_ratio: 0.9 } } },
      { id: 'c2', from: 'api', to: 'db', operational: { protocol: 'SQL', resilience: { timeout_ms: 500, dlq_node_id: 'dlq' }, traffic: { egress_cost_per_gb_usd: 0.02 } } },
    ],
    workbench: {
      entrypoints: ['web'],
      requirements: { availability_target_percent: 99.9, p99_latency_ms: 800, peak_rps: 2000, rpo_sec: 60, rto_sec: 900, monthly_budget_usd: 5000, users: 100000, regions: ['eastus'], data_residency: ['US'], compliance: ['PCI-DSS'] },
      adrs: [{ id: 'adr-1', title: 'Use a managed database', status: 'accepted', context: 'Small team.', decision: 'Managed PostgreSQL.', alternatives: [{ option: 'Self-hosted', pros: ['control'], cons: ['operations'] }], consequences: 'Vendor limits apply.' }],
      traces: [{ id: 'happy', title: 'Checkout', kind: 'happy', steps: [{ edge: 'c1', note: 'request' }, { edge: 'c2' }] }],
      alternatives: [{ id: 'bigger-db', title: 'Larger database', description: 'Scale up.', component_overrides: [{ id: 'db', operational: { capacity: { max_rps: 6000 } } }], connection_overrides: [{ id: 'c2', operational: { resilience: { retries: 2 } } }] }],
      drilldowns: [{ id: 'api-inside', title: 'Inside the API', spec: {
        schema_version: 1, diagram_type: 'architecture', meta: { title: 'API internals', output: 'api-inside.html' },
        layout: { mode: 'grid' },
        components: [{ id: 'handler', type: 'backend', label: 'Handler', row: 0, col: 0 }, { id: 'repo', type: 'backend', label: 'Repository', row: 0, col: 1 }],
        connections: [{ id: 'i1', from: 'handler', to: 'repo' }],
      } }],
    },
  };
}

function validateCli(t, document) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'archi-made-easy-workbench-schema-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const input = path.join(dir, 'candidate.json');
  fs.writeFileSync(input, JSON.stringify(document));
  const result = spawnSync(process.execPath, [cli, 'validate', 'architecture', input, '--json'], { cwd: dir, encoding: 'utf8' });
  let receipt = null;
  try { receipt = JSON.parse(result.stdout); } catch { /* reported by caller */ }
  return { ...result, receipt };
}

test('the schema accepts every workbench field', () => {
  assert.doesNotThrow(() => validateSchema('architecture', full()));
});

test('unknown fields stay rejected inside the new objects', () => {
  for (const mutate of [
    (d) => { d.components[1].operational.capacity.max_qps = 1; },
    (d) => { d.connections[0].operational.resilience.retry = 1; },
    (d) => { d.workbench.requirements.availability = 99; },
    (d) => { d.boundaries[0].operational.zone = 'a'; },
    (d) => { d.workbench.drilldowns[0].spec.components[0].colour = 'red'; },
    (d) => { d.workbench.unknown = true; },
  ]) {
    const d = full();
    mutate(d);
    assert.throws(() => validateSchema('architecture', d), /must NOT have additional properties/);
  }
});

test('enums and ranges are enforced', () => {
  for (const mutate of [
    (d) => { d.components[1].operational.role = 'database'; },
    (d) => { d.components[1].operational.sla_percent = 101; },
    (d) => { d.connections[0].operational.resilience.retries = 11; },
    (d) => { d.connections[0].operational.protocol = 'FTP'; },
    (d) => { d.connections[0].operational.traffic.read_write_ratio = 1.5; },
    (d) => { d.workbench.adrs[0].status = 'maybe'; },
  ]) {
    const d = full();
    mutate(d);
    assert.throws(() => validateSchema('architecture', d));
  }
});

test('validate accepts a complete workbench document end to end', (t) => {
  const result = validateCli(t, full());
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.receipt.ok, true);
});

test('validate reports bad workbench references with structured diagnostics', (t) => {
  const d = full();
  d.connections[1].operational.resilience.dlq_node_id = 'ghost';
  d.workbench.drilldowns[0].spec.connections.push({ from: 'handler', to: 'repo', operational: { resilience: { fallback_edge_id: 'nope' } } });
  const result = validateCli(t, d);
  assert.notEqual(result.status, 0);
  const diagnostics = result.receipt?.diagnostics ?? [];
  const unknown = diagnostics.filter((d) => d.code === 'workbench/unknown-reference').map((d) => d.message);
  assert.ok(unknown.some((m) => /dlq_node_id "ghost"/.test(m)), unknown.join('\n'));
  assert.ok(unknown.some((m) => /^drilldown api-inside: .*fallback_edge_id "nope"/.test(m)), unknown.join('\n'));
});

test('an architecture without positions gets a layout diagnostic, not a crash', (t) => {
  const d = full();
  delete d.layout;
  for (const c of d.components) { delete c.row; delete c.col; }
  const result = validateCli(t, d);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /architecture\/missing-component-position/);
  assert.doesNotMatch(result.stdout + result.stderr, /TypeError|internal\/unclassified/);
});
