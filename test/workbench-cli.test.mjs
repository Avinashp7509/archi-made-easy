// CLI behaviour of review, simulate and the --arb option on validate.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const skillRoot = fileURLToPath(new URL('../archi-made-easy/', import.meta.url));
const cli = path.join(skillRoot, 'bin/archi-made-easy.mjs');

function workspace(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'archi-made-easy-wbcli-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const run = (...args) => {
    const result = spawnSync(process.execPath, [cli, ...args], { cwd: dir, encoding: 'utf8' });
    let json = null;
    try { json = JSON.parse(result.stdout); } catch { /* text output */ }
    return { ...result, json };
  };
  assert.equal(run('scaffold', 'web-ha', '--provider', 'azure', '--out', 'web.json').status, 0);
  assert.equal(run('scaffold', 'ai-agent-platform', '--provider', 'aws', '--out', 'ai.json').status, 0);
  return { dir, run };
}

/** A design with a critical finding: a public entry straight into an unauthenticated database. */
function risky(dir) {
  const document = {
    schema_version: 1, diagram_type: 'architecture', meta: { title: 'Risky', output: 'risky.html', quality_profile: 'standard' },
    layout: { mode: 'grid' },
    components: [
      { id: 'web', type: 'frontend', label: 'Web', row: 0, col: 0, operational: { role: 'ingress', security: { public_exposed: true } } },
      { id: 'db', type: 'database', label: 'DB', row: 0, col: 1, operational: { role: 'stateful-db', security: { auth_method: 'none' } } },
    ],
    connections: [{ id: 'web-db', from: 'web', to: 'db', label: 'SQL' }],
  };
  fs.writeFileSync(path.join(dir, 'risky.json'), JSON.stringify(document));
}

test('review prints findings in plain language and as JSON', (t) => {
  const { run } = workspace(t);
  const text = run('review', 'web.json');
  assert.equal(text.status, 0, text.stderr);
  assert.match(text.stdout, /^Architecture review\. Analytical model of the declared architecture, not a measurement\./);
  assert.match(text.stdout, /Score: \d+(\.\d+)?\/100/);
  assert.match(text.stdout, /Pillars: Reliability \d+/);
  assert.match(text.stdout, /\[(HIGH|MEDIUM|LOW)\] .+ \((Reliability|Security|Performance|Cost|Operational Excellence|Sustainability); (authored|assumed)\)/);
  assert.match(text.stdout, /Fix: /);
  assert.doesNotMatch(text.stdout, /Users is a single instance/, 'the user population is not infrastructure');

  const json = run('review', 'web.json', '--json');
  assert.equal(json.json.ok, true);
  assert.equal(json.json.command, 'review');
  assert.equal(json.json.kind, 'analytical-model');
  assert.ok(json.json.findings.every((f) => f.id && f.pillar && f.severity && f.evidence && f.remediation && f.basis));
  assert.ok(json.json.rules_checked.length >= 14);
});

test('review --strict exits non-zero only when a critical finding exists', (t) => {
  const { dir, run } = workspace(t);
  assert.equal(run('review', 'web.json', '--strict').status, 0);
  risky(dir);
  const strict = run('review', 'risky.json', '--strict', '--json');
  assert.equal(strict.status, 1);
  assert.equal(strict.json.counts.critical, 1);
  assert.equal(strict.json.findings[0].rule, 'zero-trust-violation');
  assert.equal(run('review', 'risky.json').status, 0, 'without --strict a review never fails the command');
});

test('simulate: a fault, a scenario, the scenario list and all scenarios', (t) => {
  const { run } = workspace(t);
  const fault = run('simulate', 'web.json', '--fault', 'db=down');
  assert.equal(fault.status, 0, fault.stderr);
  assert.match(fault.stdout, /^Simulation\. Analytical model of the declared architecture, not a measurement\./);
  assert.match(fault.stdout, /faults: db down/);
  assert.match(fault.stdout, /Azure SQL: failing \(injected fault: down\)/);
  assert.match(fault.stdout, /Ingress traffic lost: 100%/);
  assert.match(fault.stdout, /Inputs: \d+ authored, \d+ assumed\./);

  const scenario = run('simulate', 'ai.json', '--scenario', 'provider-brownout', '--json');
  assert.equal(scenario.json.scenario.id, 'd');
  assert.deepEqual(scenario.json.result.inputs.faults.nodes, { model: 'degraded' });

  const list = run('simulate', 'web.json', '--list-scenarios');
  assert.match(list.stdout, /a  database-outage/);
  assert.match(list.stdout, /d  provider-brownout .*\[not applicable: No external service/);

  const all = run('simulate', 'web.json', '--scenario', 'all', '--json');
  assert.equal(all.json.outcomes.length, 6);
  assert.equal(all.json.outcomes[3].applicable, false);
  assert.equal(all.json.outcomes[5].analysis.kind, 'breach-reach');

  const fallback = run('simulate', 'ai.json', '--fault', 'node:model=down');
  assert.match(fallback.stdout, /Fallback: router-model switched to router-fallback/);
  assert.match(fallback.stdout, /Affected components \(1\)/);
});

test('simulate: FMEA, traffic and cost options', (t) => {
  const { run } = workspace(t);
  const fmea = run('simulate', 'web.json', '--fmea', '--json');
  assert.equal(fmea.json.fmea.rows.length, 9, 'ten components minus the users actor');
  assert.match(run('simulate', 'web.json', '--fmea').stdout, /^Failure mode and effects analysis\./);
  const surge = run('simulate', 'web.json', '--multiplier', '10', '--cache-hit', '0.9', '--cost');
  assert.match(surge.stdout, /Conditions: 10x traffic, cache hit 90%/);
  assert.match(surge.stdout, /Cost: not available \(no component has cost data\)\./);
  assert.match(surge.stdout, /No entry component has baseline_rps/);
});

test('review and simulate reject bad input with a clear message', (t) => {
  const { dir, run } = workspace(t);
  for (const args of [['simulate', 'web.json', '--fault', 'ghost=down'], ['simulate', 'web.json', '--fault', 'db=exploded'], ['simulate', 'web.json', '--scenario', 'z'],
    ['simulate', 'web.json', '--multiplier', '0'], ['simulate', 'missing.json'], ['review'], ['review', 'web.json', '--bogus'], ['simulate', 'web.json', '--scenario', 'all', '--fault', 'db=down']]) {
    const result = run(...args);
    assert.equal(result.status, 2, args.join(' '));
    assert.ok(result.stderr.trim().length > 0, args.join(' '));
  }
  assert.match(run('simulate', 'web.json', '--fault', 'ghost=down').stderr, /"ghost" names no component, connection or boundary/);
  fs.copyFileSync(path.join(skillRoot, 'examples/agent-tool-call.workflow.json'), path.join(dir, 'flow.json'));
  assert.match(run('review', 'flow.json').stderr, /not an architecture document/);
  const json = run('simulate', 'web.json', '--fault', 'ghost=down', '--json');
  assert.equal(json.json.ok, false);
  assert.equal(json.json.diagnostics[0].code, 'simulate/invalid-input');
});

test('validate attaches a review to documents with operational data, and only to those', (t) => {
  const { dir, run } = workspace(t);
  const authored = run('validate', 'architecture', 'web.json', '--json');
  assert.equal(authored.status, 0, authored.stdout + authored.stderr);
  assert.equal(authored.json.ok, true);
  assert.equal(typeof authored.json.review.score, 'number');
  assert.ok(Array.isArray(authored.json.review.findings));
  assert.match(run('validate', 'architecture', 'web.json').stdout, /\nreview score \d+(\.\d+)?\/100 \(/);

  // An inherited example has no operational data: its receipt carries no review.
  fs.copyFileSync(path.join(skillRoot, 'examples/web-app.architecture.json'), path.join(dir, 'inherited.json'));
  const inherited = run('validate', 'architecture', 'inherited.json', '--json');
  assert.equal(inherited.status, 0);
  assert.equal('review' in inherited.json, false);
  const inheritedText = run('validate', 'architecture', 'inherited.json').stdout.trim().split('\n');
  assert.equal(inheritedText.length, 1, 'text output is the single ok line, as before');
  assert.match(inheritedText[0], /^ok architecture /);

  // The review can be requested for it, or switched off for an authored document.
  assert.equal(typeof run('validate', 'architecture', 'inherited.json', '--arb', 'warn', '--json').json.review.score, 'number');
  assert.equal('review' in run('validate', 'architecture', 'web.json', '--arb', 'off', '--json').json, false);
});

test('validate --arb strict fails on a critical finding and warn does not', (t) => {
  const { dir, run } = workspace(t);
  risky(dir);
  const warn = run('validate', 'architecture', 'risky.json', '--json');
  assert.equal(warn.status, 0, warn.stdout);
  assert.equal(warn.json.review.counts.critical, 1);
  const strict = run('validate', 'architecture', 'risky.json', '--arb', 'strict', '--json');
  assert.equal(strict.status, 1);
  assert.equal(strict.json.ok, false);
  assert.ok(strict.json.diagnostics.some((d) => d.code === 'review/critical-findings'));
  assert.equal(strict.json.checks.every((check) => check.ok), true, 'the artifact checks themselves still pass');

  const bad = run('validate', 'architecture', 'risky.json', '--arb', 'maybe', '--json');
  assert.notEqual(bad.status, 0);
  fs.copyFileSync(path.join(skillRoot, 'examples/agent-tool-call.workflow.json'), path.join(dir, 'flow.json'));
  assert.notEqual(run('validate', 'workflow', 'flow.json', '--arb', 'warn').status, 0, '--arb is for architecture documents only');
});
