// The workbench data the architecture renderer embeds in the page, and the template slot
// that carries it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { loadKnowledge } from '../archi-made-easy/bin/workbench.mjs';
import { scaffold } from '../archi-made-easy/workbench/scaffold.mjs';
import { buildModel } from '../archi-made-easy/workbench/model.mjs';
import { buildWorkbenchData, WORKBENCH_DATA_VERSION } from '../archi-made-easy/workbench/embed.mjs';
import { applyTemplate } from '../archi-made-easy/renderers/shared/utils.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skillRoot = path.join(repoRoot, 'archi-made-easy');
const DATA_RE = /<script id="archi-made-easy-workbench-data" type="application\/json">([\s\S]*?)<\/script>/g;
const plain = (value) => JSON.parse(JSON.stringify(value));

function render(type, inputPath, t) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'archi-made-easy-embed-'));
  t.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
  const output = path.join(scratch, 'out.html');
  execFileSync(process.execPath, [path.join(skillRoot, `renderers/${type}/render-${type}.mjs`), inputPath, output]);
  return fs.readFileSync(output, 'utf8');
}
function embedded(html) {
  const matches = [...html.matchAll(DATA_RE)];
  return matches.map((match) => JSON.parse(match[1]));
}

test('the embedded document builds the same model as the full document', () => {
  const knowledge = loadKnowledge();
  let checked = 0;
  for (const pattern of knowledge.patterns) {
    for (const provider of knowledge.providers) {
      const document = scaffold({ slots: knowledge.slots, pattern, provider });
      const data = buildWorkbenchData(document);
      assert.equal(data.schemaVersion, WORKBENCH_DATA_VERSION);
      assert.deepEqual(plain(buildModel(data.document)), plain(buildModel(document)), `${pattern.id}/${provider.id}`);
      checked += 1;
    }
  }
  assert.equal(checked, knowledge.patterns.length * knowledge.providers.length);
  for (const name of fs.readdirSync(path.join(skillRoot, 'examples')).filter((file) => file.endsWith('.architecture.json'))) {
    const document = JSON.parse(fs.readFileSync(path.join(skillRoot, 'examples', name), 'utf8'));
    assert.deepEqual(plain(buildModel(buildWorkbenchData(document).document)), plain(buildModel(document)), name);
  }
});

test('role hints that live outside labels survive embedding', () => {
  // Role inference reads the tag and a catalog brand name; dropping either would give the
  // page a different model from the command line.
  const base = { schema_version: 1, diagram_type: 'architecture', meta: { title: 'Hints', output: 'h.html' }, connections: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }] };
  for (const hint of [{ tag: 'Redis' }, { brand: 'redis' }, { sublabel: 'Redis cluster' }, { tag: 'Kafka' }, { brand: 'kafka' }]) {
    const document = { ...base, components: [
      { id: 'a', type: 'frontend', label: 'Client', row: 0, col: 0 },
      { id: 'b', type: 'backend', label: 'Service', row: 0, col: 1 },
      { id: 'c', type: 'database', label: 'Store', row: 0, col: 2, ...hint },
    ] };
    assert.deepEqual(plain(buildModel(buildWorkbenchData(document).document)), plain(buildModel(document)), JSON.stringify(hint));
  }
});

test('icons and brand image addresses never reach the page data', () => {
  const component = (extra) => ({ id: 'a', type: 'backend', label: 'A', row: 0, col: 0, ...extra });
  const embed = (extra) => buildWorkbenchData({ schema_version: 1, diagram_type: 'architecture', meta: { title: 'T' }, components: [component(extra)], connections: [] }).document.components[0];
  assert.equal(embed({ brand: 'redis' }).brand, 'redis');
  for (const extra of [
    { icon: 'calendar' },
    { brand: 'https://user:secret@example.com/mark.png?session=abc' },
    { brand: { url: 'https://example.com/mark.png?token=abc', sha256: 'a'.repeat(64) } },
  ]) {
    const data = embed(extra);
    assert.deepEqual(Object.keys(data).sort(), ['col', 'id', 'label', 'row', 'type'], JSON.stringify(extra));
    assert.equal(/secret|token|session|calendar/.test(JSON.stringify(data)), false);
    // The model does not read them either, so the page and the command line still agree.
    const document = { schema_version: 1, diagram_type: 'architecture', meta: { title: 'T' }, components: [component(extra)], connections: [] };
    assert.deepEqual(plain(buildModel(buildWorkbenchData(document).document)), plain(buildModel(document)));
  }
});

test('embedding keeps only what the model reads', () => {
  const document = {
    schema_version: 1, diagram_type: 'architecture',
    meta: { title: 'Scope', subtitle: 'not needed', output: 'scope.html', visual_preset: 'blueprint' },
    components: [
      { id: 'a', type: 'backend', label: 'A', row: 0, col: 0, sources: [{ path: 'src/a.js' }] },
      { id: 'b', type: 'database', label: 'B', row: 0, col: 1, operational: { drilldown_diagram_id: 'b-detail' } },
    ],
    connections: [{ id: 'a-b', from: 'a', to: 'b', label: 'SQL', variant: 'emphasis', route: 'orthogonal' }],
    cards: [{ title: 'Notes', items: ['x'] }, { title: 'Assumptions', items: ['y'] }],
    workbench: { drilldowns: [{ id: 'b-detail', title: 'B in detail', spec: { schema_version: 1, diagram_type: 'architecture', meta: { title: 'Child' }, components: [], connections: [] } }] },
  };
  const data = buildWorkbenchData(document).document;
  assert.deepEqual(data.meta, { title: 'Scope' });
  assert.deepEqual(Object.keys(data.components[0]).sort(), ['col', 'id', 'label', 'row', 'type']);
  assert.deepEqual(data.connections, [{ id: 'a-b', from: 'a', to: 'b', label: 'SQL' }]);
  assert.deepEqual(data.cards, [{ title: 'Assumptions', items: ['y'] }]);
  assert.deepEqual(data.workbench.drilldowns, [{ id: 'b-detail', title: 'B in detail' }], 'child diagrams are listed, not copied');
  assert.equal(JSON.stringify(document).includes('"spec"'), true, 'the input is not mutated');
});

test('a rendered architecture page carries exactly one data block and no unresolved slot', (t) => {
  const input = path.join(skillRoot, 'examples', 'web-app.architecture.json');
  const html = render('architecture', input, t);
  const blocks = embedded(html);
  assert.equal(blocks.length, 1);
  assert.deepEqual(blocks[0], plain(buildWorkbenchData(JSON.parse(fs.readFileSync(input, 'utf8')))));
  assert.equal(html.includes('ARCHI_MADE_EASY:WORKBENCH_DATA'), false, 'the data slot is resolved');
  assert.equal(html.split('ARCHI_MADE_EASY:WORKBENCH_BLOCK_START').length, 2, 'the scripts are the template\'s, byte for byte');
  assert.match(html, /<button id="btn-workbench" type="button" hidden/, 'the toolbar toggle is hidden until the workbench script shows it');
  assert.equal(html.split('ArchiMadeEasy.workbenchEngine = (function () {').length, 2, 'the engine is inlined once');
  assert.equal(html.split('ArchiMadeEasy.workbench = (function () {').length, 2, 'the workbench is inlined once');
});

test('markup in authored text cannot close the data block', (t) => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'archi-made-easy-embed-src-'));
  t.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
  const document = JSON.parse(fs.readFileSync(path.join(skillRoot, 'examples', 'web-app.architecture.json'), 'utf8'));
  const hostile = '</script><script>window.injected = true</script><!--';
  document.workbench = { adrs: [{ id: 'adr-1', title: 'Decision', status: 'accepted', decision: hostile }] };
  const input = path.join(scratch, 'hostile.architecture.json');
  fs.writeFileSync(input, JSON.stringify(document));
  const html = render('architecture', input, t);
  const blocks = embedded(html);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].document.workbench.adrs[0].decision, hostile, 'the text round-trips');
  assert.equal(html.includes('<script>window.injected'), false, 'and never appears as markup');
});

test('other diagram types carry no workbench data and no workbench scripts', (t) => {
  const architectureBytes = render('architecture', path.join(skillRoot, 'examples', 'web-app.architecture.json'), t).length;
  for (const [type, example] of [['workflow', 'agent-tool-call.workflow.json'], ['sequence', 'cache-miss-request.sequence.json']]) {
    const html = render(type, path.join(skillRoot, 'examples', example), t);
    assert.equal(embedded(html).length, 0, type);
    assert.equal(html.includes('ARCHI_MADE_EASY:WORKBENCH'), false, type);
    // Pages that cannot use the workbench are delivered without its scripts.
    assert.equal(html.includes('ArchiMadeEasy.workbenchEngine'), false, `${type}: no engine`);
    assert.equal(html.includes('ArchiMadeEasy.workbench = '), false, `${type}: no workbench script`);
    assert.match(html, /<button id="btn-workbench" type="button" hidden/, `${type}: the toolbar toggle stays hidden`);
    assert.ok(html.length < architectureBytes - 150000, `${type}: at least 150 KB smaller than an architecture page`);
  }
});

test('a template without the workbench slot still renders', () => {
  const template = fs.readFileSync(path.join(skillRoot, 'assets', 'template.html'), 'utf8');
  const slot = '    <!-- ARCHI_MADE_EASY:WORKBENCH_DATA -->\n';
  assert.equal(template.split(slot).length, 2, 'the shipped template has one slot');
  const options = {
    title: 'T', subtitle: 'S', svg: '<svg viewBox="0 0 10 10"></svg>', cards: '<div class="cards"></div>',
    workbenchData: { schemaVersion: 1, document: { components: [], connections: [] } },
  };
  const withSlot = applyTemplate(template, options);
  const withoutSlot = applyTemplate(template.replace(slot, ''), options);
  const withoutData = applyTemplate(template, { ...options, workbenchData: null });
  assert.equal([...withSlot.matchAll(DATA_RE)].length, 1);
  assert.equal([...withoutSlot.matchAll(DATA_RE)].length, 0, 'an older custom template renders without the workbench');
  assert.equal([...withoutData.matchAll(DATA_RE)].length, 0);
  assert.equal(withoutData.includes('ARCHI_MADE_EASY:WORKBENCH_DATA'), false);
});
