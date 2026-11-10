// Levels: child diagrams (workbench.drilldowns) rendered, carried in the parent page and
// restored from it. The browser side is covered in test/workbench-browser.test.mjs.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { LEVELS_DATA_VERSION, MAX_LEVEL_DEPTH, levelDepth, packLevel, sharedBlocks, sharedKey, unpackLevel } from '../archi-made-easy/workbench/levels.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const renderer = path.join(root, 'archi-made-easy/renderers/architecture/render-architecture.mjs');
const checker = path.join(root, 'archi-made-easy/scripts/check-render-output.mjs');
const flagship = path.join(root, 'archi-made-easy/examples/cloud-native-ecommerce-c4.architecture.json');

function inTemp(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'archi-made-easy-levels-test-'));
  try { return run(directory); } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}
function render(document, directory, name, env = {}) {
  const input = path.join(directory, `${name}.architecture.json`);
  const output = path.join(directory, `${name}.html`);
  fs.writeFileSync(input, JSON.stringify(document));
  const result = spawnSync(process.execPath, [renderer, input, output], { encoding: 'utf8', env: { ...process.env, ...env }, maxBuffer: 64 * 1024 * 1024 });
  return { result, output, html: result.status === 0 ? fs.readFileSync(output, 'utf8') : null };
}
function levelsData(html) {
  const match = html.match(/<script id="archi-made-easy-levels-data" type="application\/json">([\s\S]*?)<\/script>/);
  return match ? JSON.parse(match[1]) : null;
}
const small = (id, extra = {}) => ({
  schema_version: 1, diagram_type: 'architecture',
  meta: { title: `Diagram ${id}`, output: `${id}.html` },
  layout: { mode: 'grid', origin: [40, 110], cols: 2, cellW: 130, cellH: 60, gapX: 80, gapY: 80 },
  components: [
    { id: 'a', type: 'backend', label: 'Service A', row: 0, col: 0, ...(extra.operational ? { operational: extra.operational } : {}) },
    { id: 'b', type: 'database', label: 'Store B', row: 0, col: 1 },
  ],
  connections: [{ id: 'a-b', from: 'a', to: 'b' }],
  ...(extra.workbench ? { workbench: extra.workbench } : {}),
});

test('a block key is the length and the FNV-1a hash of the text', () => {
  assert.equal(sharedKey(''), '0:811c9dc5');
  assert.equal(sharedKey('a'), '1:e40c292c');
  assert.notEqual(sharedKey('ab'), sharedKey('ba'));
});

test('the page computes the same block key as the build', () => {
  const source = fs.readFileSync(path.join(root, 'viewer/workbench.js'), 'utf8');
  const body = source.match(/function sharedKey\(text\) \{([\s\S]*?)\n      \}/);
  assert.ok(body, 'viewer/workbench.js defines sharedKey(text)');
  const pageKey = new Function('text', body[1]);
  for (const sample of ['', 'a', 'body { color: red }', 'ünïcödé ✓ 漢字 \u{1F600}', 'x'.repeat(70000)]) {
    assert.equal(pageKey(sample), sharedKey(sample), JSON.stringify(sample.slice(0, 20)));
  }
});

test('packing replaces only the large blocks both pages have, and unpacking restores the page', () => {
  const css = `body{margin:0}/*${'c'.repeat(20000)}*/`;
  const js = `var shared=1;//${'j'.repeat(20000)}`;
  const own = `var own=2;//${'o'.repeat(20000)}`;
  const parent = `<html><head><style>${css}</style></head><body><p>parent</p><script>${js}</script></body></html>`;
  const child = `<html><head><style>${css}</style><style>.small{}</style></head><body><p>child</p><script type="application/json">{"k":1}</script><script>${js}</script><script>${own}</script></body></html>`;
  const packed = packLevel(child, parent);
  assert.ok(packed.length < child.length - 39000, 'both shared blocks are gone');
  assert.ok(packed.includes(`<style>/*ame-shared:${sharedKey(css)}*/</style>`));
  assert.ok(packed.includes(`<script>/*ame-shared:${sharedKey(js)}*/</script>`));
  assert.ok(packed.includes('<style>.small{}</style>'), 'a small block stays literal');
  assert.ok(packed.includes(own), 'a block the parent lacks stays literal');
  assert.equal(unpackLevel(packed, parent), child);
  assert.throws(() => unpackLevel(packed, '<html></html>'), /has no block/);
  assert.equal(sharedBlocks(parent).size, 2);
});

test('line endings are normalised the way the HTML parser does, so keys match in the page', () => {
  const css = `a{}\n/*${'c'.repeat(20000)}*/\nb{}`;
  const parent = `<style>${css}</style>`;
  const child = `<style>${css.replaceAll('\n', '\r\n')}</style><p>x</p>`;
  const packed = packLevel(child, parent);
  assert.ok(packed.startsWith('<style>/*ame-shared:'));
  assert.equal(unpackLevel(packed, parent), `<style>${css}</style><p>x</p>`);
});

test('a marker that belongs to a grandchild, inside data, is left alone', () => {
  const css = `/*${'c'.repeat(20000)}*/`;
  const parent = `<style>${css}</style>`;
  const grandchildMarker = `\\u003cstyle\\u003e/*ame-shared:${sharedKey(css)}*/\\u003c/style\\u003e`;
  const child = `<style>${css}</style><script type="application/json">{"html":"${grandchildMarker}"}</script>`;
  const restored = unpackLevel(packLevel(child, parent), parent);
  assert.equal(restored, child);
  assert.ok(restored.includes(grandchildMarker));
});

test('the flagship carries its three child diagrams, each restorable byte for byte', () => inTemp((directory) => {
  const document = JSON.parse(fs.readFileSync(flagship, 'utf8'));
  const parent = render(document, directory, 'parent');
  assert.equal(parent.result.status, 0, parent.result.stderr);
  const data = levelsData(parent.html);
  assert.equal(data.schemaVersion, LEVELS_DATA_VERSION);
  assert.deepEqual(data.levels.map((level) => level.id), document.workbench.drilldowns.map((drilldown) => drilldown.id));
  // One inline SVG in the file, child diagrams included: the page-level check still holds.
  const check = spawnSync(process.execPath, [checker, parent.output], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  assert.equal(check.status, 0, check.stdout.slice(0, 2000));
  assert.equal(JSON.parse(check.stdout).checks.find((entry) => entry.name === 'single_svg').ok, true);
  for (const [index, drilldown] of document.workbench.drilldowns.entries()) {
    const alone = render(drilldown.spec, directory, `child-${index}`);
    assert.equal(alone.result.status, 0, alone.result.stderr);
    const level = data.levels[index];
    assert.equal(level.title, drilldown.title);
    assert.equal(unpackLevel(level.html, parent.html), alone.html.replace(/\r\n?/g, '\n'), `${drilldown.id} is the page its document renders to on its own`);
    assert.ok(level.html.length < alone.html.length / 4, `${drilldown.id} is stored without the shared stylesheet and scripts (${level.html.length} of ${alone.html.length})`);
    // The components that open a level name it.
    assert.ok(document.components.some((component) => component.operational?.drilldown_diagram_id === drilldown.id));
  }
}));

test('the page script never spells a closing page tag', () => {
  // Tools that add to a page, and an inherited browser test, splice before the first
  // closing body tag in the file. The workbench script once held that text as a string,
  // and the splice landed inside the script.
  const template = fs.readFileSync(path.join(root, 'archi-made-easy/assets/template.html'), 'utf8');
  for (const tag of ['</body>', '</html>', '</head>']) assert.equal(template.split(tag).length - 1, 1, `the template holds ${tag} once`);
  const source = fs.readFileSync(path.join(root, 'viewer/workbench.js'), 'utf8');
  assert.equal(/<\/(body|html|head|script|style)\b/i.test(source), false, 'viewer/workbench.js spells a closing page tag');
  assert.equal(/<(script|style|body|html)\b/i.test(source), false, 'viewer/workbench.js spells an opening page tag');
});

test('a document without child diagrams carries no levels data', () => inTemp((directory) => {
  const page = render(small('plain'), directory, 'plain');
  assert.equal(page.result.status, 0, page.result.stderr);
  assert.equal(levelsData(page.html), null);
  assert.ok(!page.html.includes('ARCHI_MADE_EASY:LEVELS_DATA'));
}));

test('a child diagram that cannot be rendered fails the parent and is named', () => inTemp((directory) => {
  const broken = small('inner');
  broken.components[1].col = 0; // two components in one cell
  const document = small('outer', { operational: { drilldown_diagram_id: 'inner' }, workbench: { drilldowns: [{ id: 'inner', spec: broken }] } });
  const page = render(document, directory, 'outer', { ARCHI_MADE_EASY_DIAGNOSTIC_FORMAT: 'json' });
  assert.notEqual(page.result.status, 0);
  const failure = JSON.parse(page.result.stderr.trim());
  assert.equal(failure.ok, false);
  assert.ok(failure.diagnostics.length > 0);
  assert.ok(failure.diagnostics.every((entry) => entry.message.startsWith('Child diagram "inner"') && entry.subject.drilldown === 'inner'), JSON.stringify(failure.diagnostics).slice(0, 600));
  assert.ok(!fs.existsSync(page.output), 'no parent page is written');
}));

test('child diagrams nest to a bounded depth', () => inTemp((directory) => {
  const nest = (depth) => (depth === 0 ? small('leaf') : small(`level-${depth}`, { operational: { drilldown_diagram_id: 'next' }, workbench: { drilldowns: [{ id: 'next', spec: nest(depth - 1) }] } }));
  assert.equal(levelDepth(nest(0)), 0);
  assert.equal(levelDepth(nest(2)), 2);
  const allowed = render(nest(MAX_LEVEL_DEPTH - 1), directory, 'allowed');
  assert.equal(allowed.result.status, 0, allowed.result.stderr);
  const outer = levelsData(allowed.html).levels[0];
  const middle = unpackLevel(outer.html, allowed.html);
  assert.equal(levelsData(middle).levels.length, 1, 'the child carries its own child');
  const tooDeep = render(nest(MAX_LEVEL_DEPTH), directory, 'too-deep', { ARCHI_MADE_EASY_DIAGNOSTIC_FORMAT: 'json' });
  assert.notEqual(tooDeep.result.status, 0);
  assert.ok(JSON.parse(tooDeep.result.stderr.trim()).diagnostics.some((entry) => entry.code === 'workbench/drilldown-depth'));
}));
