// The showcase set: three flagship examples and one scaffolded example per provider.
// Each must validate at showcase quality, and review, every preset scenario and every
// export format must succeed on it through the command line, as a user's agent would run
// them. The browser side of the flagships is in test/workbench-browser.test.mjs and
// scripts/visual-qa.mjs.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { FLAGSHIPS } from '../scripts/record-flagship-figures.mjs';
import { loadKnowledge } from '../archi-made-easy/bin/workbench.mjs';
import { scaffold } from '../archi-made-easy/workbench/scaffold.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const examples = path.join(root, 'archi-made-easy', 'examples');
const cli = path.join(root, 'archi-made-easy', 'bin', 'archi-made-easy.mjs');

// One starting point per provider, each a different pattern.
export const PROVIDER_EXAMPLES = [
  ['azure', 'zero-trust'],
  ['aws', 'event-driven'],
  ['gcp', 'microservices'],
  ['onprem', 'hybrid'],
];
const providerFile = ([provider, pattern]) => path.join(examples, 'providers', `${provider}-${pattern}.architecture.json`);
const SHOWCASE = [...FLAGSHIPS.map((name) => path.join(examples, name)), ...PROVIDER_EXAMPLES.map(providerFile)];

function run(args, cwd) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  let json = null;
  try { json = JSON.parse(result.stdout); } catch { /* the caller reports stdout */ }
  return { ...result, json };
}

test('each provider example is the scaffold of its pattern, unchanged', () => {
  const knowledge = loadKnowledge();
  assert.deepEqual(PROVIDER_EXAMPLES.map(([provider]) => provider).sort(), knowledge.providers.map((provider) => provider.id).sort(), 'one example per provider pack');
  for (const [providerId, patternId] of PROVIDER_EXAMPLES) {
    const expected = scaffold({ slots: knowledge.slots, pattern: knowledge.patterns.find((pattern) => pattern.id === patternId), provider: knowledge.providers.find((provider) => provider.id === providerId) },
      { output: `${providerId}-${patternId}.html` });
    const file = providerFile([providerId, patternId]);
    assert.equal(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'), `${JSON.stringify(expected, null, 2)}\n`,
      `${path.basename(file)}: regenerate with scaffold ${patternId} --provider ${providerId} --output ${providerId}-${patternId}.html`);
  }
});

test('every showcase document validates at showcase quality and passes review, every scenario and every export', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'archi-made-easy-showcase-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  for (const file of SHOWCASE) {
    const name = path.basename(file);
    const validated = run(['validate', 'architecture', file, '--quality', 'showcase', '--json'], directory);
    assert.equal(validated.status, 0, `${name}: ${(validated.json?.diagnostics || []).map((d) => `${d.code} ${d.message}`).join('; ') || validated.stderr}`);
    assert.deepEqual([validated.json.checks.length, validated.json.checks.every((check) => check.ok)], [9, true], name);

    const reviewed = run(['review', file, '--json'], directory);
    assert.equal(reviewed.status, 0, `${name}: ${reviewed.stderr}`);
    const review = reviewed.json;
    assert.equal(typeof review.score, 'number', name);
    assert.equal(review.counts.critical, 0, `${name}: no critical finding in a showcase document`);

    const simulated = run(['simulate', file, '--scenario', 'all', '--json'], directory);
    assert.equal(simulated.status, 0, `${name}: ${simulated.stderr}`);
    const outcomes = simulated.json.outcomes;
    assert.equal(outcomes.length, 6, `${name}: six preset scenarios`);
    // The flash crowd applies to every architecture; each applicable scenario has a result.
    assert.ok(outcomes.some((outcome) => outcome.applicable), name);
    for (const outcome of outcomes) assert.equal(Boolean(outcome.result), outcome.applicable, `${name}: scenario ${outcome.scenario}`);

    for (const [format, extension] of [['mermaid', 'md'], ['drawio', 'drawio'], ['structurizr', 'dsl'], ['rfc', 'md'], ['html', 'html']]) {
      const output = path.join(directory, `${name}.${format}.${extension}`);
      const exported = run(['export', format, file, output, '--json'], directory);
      assert.equal(exported.status, 0, `${name} ${format}: ${exported.stdout.slice(0, 400)}${exported.stderr}`);
      assert.ok(fs.statSync(output).size > 200, `${name} ${format}: the file has content`);
    }
  }
});
