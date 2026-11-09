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
import { validateSchema } from '../archi-made-easy/renderers/shared/validator.mjs';
import { ROLES } from '../archi-made-easy/workbench/defaults.mjs';

const cli = fileURLToPath(new URL('../archi-made-easy/bin/archi-made-easy.mjs', import.meta.url));
const knowledge = loadKnowledge();
const implemented = knowledge.patterns.filter((pattern) => pattern.status === 'implemented');

function scratch(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'archi-made-easy-scaffold-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
const run = (args, cwd) => spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' });

test('knowledge packs are versioned and carry no unsourced figures', () => {
  assert.deepEqual(knowledge.providers.map((p) => p.id).sort(), ['aws', 'azure', 'gcp', 'onprem']);
  for (const provider of knowledge.providers) {
    assert.match(provider.version, /^\d+\.\d+\.\d+$/, provider.id);
    assert.match(provider.reviewed, /^\d{4}-\d{2}-\d{2}$/, provider.id);
    assert.ok(provider.region_term && provider.zone_term, provider.id);
    for (const [slot, service] of Object.entries(provider.services)) {
      assert.ok(knowledge.slots.slots[slot], `${provider.id}: unknown slot ${slot}`);
      assert.deepEqual(Object.keys(service).sort(), ['label', 'name'], `${provider.id}/${slot}: only names are allowed without a source`);
      assert.ok(service.label.length <= 16, `${provider.id}/${slot}: label "${service.label}" must fit a node`);
    }
    // No SLA, price or quota value may appear without a cited source.
    assert.doesNotMatch(JSON.stringify(provider.services), /\d{2}\.\d+|\$|sla|price|cost/i, provider.id);
  }
  for (const slot of Object.values(knowledge.slots.slots)) assert.ok(ROLES.includes(slot.role));
});

test('every pattern declares its status and uses known slots', () => {
  assert.ok(implemented.length >= 9);
  for (const pattern of knowledge.patterns) {
    assert.ok(['implemented', 'planned'].includes(pattern.status), pattern.id);
    assert.ok(pattern.title && pattern.summary && pattern.when_to_use?.length, pattern.id);
    for (const component of pattern.components) assert.ok(knowledge.slots.slots[component.slot], `${pattern.id}: slot ${component.slot}`);
    assert.ok(pattern.assumptions?.length, `${pattern.id}: assumptions must be stated`);
    assert.ok(pattern.adrs?.length, `${pattern.id}: at least one decision record`);
  }
});

test('scaffolds are schema-valid, internally consistent and invent no figures', () => {
  for (const pattern of implemented) {
    for (const provider of knowledge.providers) {
      const where = `${pattern.id}/${provider.id}`;
      const document = scaffold({ slots: knowledge.slots, pattern, provider });
      assert.doesNotThrow(() => validateSchema('architecture', document), where);
      const { model, diagnostics } = buildModel(document);
      assert.deepEqual(diagnostics, [], where);
      assert.equal(model.authored, true, where);
      assert.ok(model.entrypoints.length > 0, where);
      for (const node of model.nodes) {
        assert.equal(node.basis.role, 'authored', `${where}/${node.id}`);
        // Structure is authored; numbers are never invented by a scaffold.
        for (const key of ['sla_percent', 'capacity.max_rps', 'latency.p50_ms', 'latency.p99_ms']) assert.notEqual(node.basis[key], 'authored', `${where}/${node.id}.${key}`);
        assert.equal(node.capacity.baseline_rps, null, `${where}/${node.id}`);
        assert.equal(node.finops.monthly_base_cost_usd, null, `${where}/${node.id}`);
      }
      for (const edge of model.edges) assert.equal(edge.basis.call_semantics, 'authored', `${where}/${edge.id}`);
      const assumptions = document.cards.find((card) => card.title === 'Assumptions');
      assert.ok(assumptions?.items.some((item) => item.includes(provider.name)), `${where}: assumptions name the provider pack`);
      assert.doesNotMatch(JSON.stringify(document), /\{[a-z_]+\}/, `${where}: unresolved token`);
    }
  }
});

test('every pattern on every provider passes validate at showcase quality', (t) => {
  const dir = scratch(t);
  for (const pattern of implemented) {
    for (const provider of knowledge.providers) {
      const file = `${pattern.id}-${provider.id}.json`;
      assert.equal(run(['scaffold', pattern.id, '--provider', provider.id, '--out', file], dir).status, 0, file);
      const result = run(['validate', 'architecture', file, '--quality', 'showcase', '--json'], dir);
      let receipt = null;
      try { receipt = JSON.parse(result.stdout); } catch { /* reported below */ }
      assert.equal(result.status, 0, `${file}: ${(receipt?.diagnostics || []).map((d) => `${d.code} ${d.message}`).join('; ') || result.stderr}`);
      assert.equal(receipt.checks.length, 9, file);
    }
  }
});

test('scaffold CLI lists, reports errors and never overwrites silently', (t) => {
  const dir = scratch(t);
  const list = JSON.parse(run(['scaffold', '--list', '--json'], dir).stdout);
  assert.deepEqual(list.patterns.map((p) => p.id), [...list.patterns.map((p) => p.id)].sort());
  assert.equal(list.providers.length, 4);

  const unknown = run(['scaffold', 'nope', '--json'], dir);
  assert.equal(unknown.status, 2);
  assert.equal(JSON.parse(unknown.stdout).diagnostics[0].code, 'scaffold/unknown-pattern');
  assert.equal(run(['scaffold', 'web-ha', '--provider', 'mars'], dir).status, 2);
  assert.equal(run(['scaffold', 'web-ha', '--bogus'], dir).status, 2);
  assert.equal(run(['scaffold'], dir).status, 2);

  const first = run(['scaffold', 'web-ha', '--provider', 'aws', '--title', 'Shop', '--output', 'shop.html', '--out', 'candidate.json', '--json'], dir);
  assert.equal(first.status, 0, first.stderr);
  const receipt = JSON.parse(first.stdout);
  assert.equal(receipt.ok, true);
  assert.match(receipt.nextAction, /finalize architecture candidate\.json shop\.html --quality showcase --json/);
  const written = JSON.parse(fs.readFileSync(path.join(dir, 'candidate.json'), 'utf8'));
  assert.equal(written.meta.title, 'Shop');
  assert.equal(written.meta.output, 'shop.html');

  const again = run(['scaffold', 'web-ha', '--out', 'candidate.json'], dir);
  assert.equal(again.status, 2);
  assert.match(again.stderr, /already exists/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'candidate.json'), 'utf8')).meta.title, 'Shop', 'existing file untouched');
  assert.equal(run(['scaffold', 'web-ha', '--out', 'candidate.json', '--force'], dir).status, 0);
});

test('scaffold output is deterministic', () => {
  const [pattern] = implemented;
  const [provider] = knowledge.providers;
  assert.equal(JSON.stringify(scaffold({ slots: knowledge.slots, pattern, provider })), JSON.stringify(scaffold({ slots: knowledge.slots, pattern, provider })));
});
