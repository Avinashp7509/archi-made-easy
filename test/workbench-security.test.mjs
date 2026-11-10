// Security properties of the workbench: authored text can never become markup or script in
// the page, in a child diagram or in an export, and the level view cannot reach the page
// that opened it. Findings and reasoning: docs/program/SECURITY-REVIEW.md. The same hostile
// document is opened in a real browser in test/workbench-browser.test.mjs.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { unpackLevel } from '../archi-made-easy/workbench/levels.mjs';
import { buildModel } from '../archi-made-easy/workbench/model.mjs';
import { toDrawio } from '../archi-made-easy/workbench/exporters/drawio.mjs';
import { toMermaidMarkdown } from '../archi-made-easy/workbench/exporters/mermaid.mjs';
import { toRfc } from '../archi-made-easy/workbench/exporters/rfc.mjs';
import { toStructurizr } from '../archi-made-easy/workbench/exporters/structurizr.mjs';
import { mdText } from '../archi-made-easy/workbench/exporters/shared.mjs';
import { hostileDocument, HOSTILE } from '../scripts/visual-qa-fixtures.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const renderer = path.join(root, 'archi-made-easy/renderers/architecture/render-architecture.mjs');
const checker = path.join(root, 'archi-made-easy/scripts/check-render-output.mjs');
const cli = path.join(root, 'archi-made-easy/bin/archi-made-easy.mjs');
const count = (text, part) => text.split(part).length - 1;
const slot = (html, id) => JSON.parse(html.match(new RegExp(`<script id="${id}" type="application/json">([\\s\\S]*?)</script>`))[1]);

function render(document, directory, name) {
  const input = path.join(directory, `${name}.architecture.json`);
  const output = path.join(directory, `${name}.html`);
  fs.writeFileSync(input, JSON.stringify(document));
  const result = spawnSync(process.execPath, [renderer, input, output], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr);
  return { input, output, html: fs.readFileSync(output, 'utf8') };
}
// What must never reach a page as live markup, whatever the authored text was.
const LIVE = ['<script>window.__pwned', '<img src=x onerror', '<svg onload', '<iframe srcdoc', '<b>Q7</b>', '<i>x7', '<s>c7', '<i>z7', 'onerror="window.__pwned', 'onload="window.__pwned', 'href="javascript:'];

test('hostile authored text is carried as text: no markup, no extra script, one diagram', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'archi-made-easy-security-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const hostile = render(hostileDocument(), directory, 'hostile');
  const benign = render(hostileDocument({ benign: true }), directory, 'benign');
  for (const payload of LIVE) assert.equal(hostile.html.includes(payload), false, `the page holds live markup: ${payload}`);
  for (const tag of ['<script', '<iframe', '<img', '<a ', '<svg']) assert.equal(count(hostile.html, tag), count(benign.html, tag), `authored text adds no ${tag} element`);
  const check = spawnSync(process.execPath, [checker, hostile.output], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  assert.equal(check.status, 0, check.stdout.slice(0, 1500));
  assert.equal(JSON.parse(check.stdout).checks.find((entry) => entry.name === 'single_svg').ok, true, 'a label that says <svg is not a second diagram');

  // The data the workbench reads holds the authored strings exactly.
  const source = hostileDocument();
  const data = slot(hostile.html, 'archi-made-easy-workbench-data').document;
  assert.equal(data.meta.title, source.meta.title);
  assert.deepEqual(data.workbench.adrs, source.workbench.adrs);
  assert.deepEqual(data.workbench.traces, source.workbench.traces);
  assert.deepEqual(data.workbench.requirements, source.workbench.requirements);
  assert.deepEqual(data.components.map((component) => [component.label, component.sublabel]), source.components.map((component) => [component.label, component.sublabel]));

  // The child diagram is held to the same rule.
  const levels = slot(hostile.html, 'archi-made-easy-levels-data').levels;
  assert.equal(levels[0].title, source.workbench.drilldowns[0].title);
  const child = unpackLevel(levels[0].html, hostile.html);
  const benignChild = unpackLevel(slot(benign.html, 'archi-made-easy-levels-data').levels[0].html, benign.html);
  for (const payload of LIVE) assert.equal(child.includes(payload), false, `the child page holds live markup: ${payload}`);
  for (const tag of ['<script', '<iframe', '<img']) assert.equal(count(child, tag), count(benignChild, tag));
});

test('draw.io export: an authored tag is text in the label, never HTML', () => {
  const document = hostileDocument();
  const drawio = toDrawio(document, buildModel(document).model);
  // A label is HTML inside an XML attribute. Read each one as draw.io does (undo the
  // attribute escaping) and list the tags left: only the exporter's own may remain.
  const own = ['<br>', '<font style="font-size:10px">', '</font>'];
  let labels = 0;
  for (const [, value] of drawio.matchAll(/ value="([^"]*)"/g)) {
    labels += 1;
    const html = value.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&amp;', '&');
    assert.deepEqual((html.match(/<\/?[a-zA-Z!][^>]*>/g) || []).filter((tag) => !own.includes(tag)), [], `live tag in a label: ${value.slice(0, 120)}`);
  }
  assert.ok(labels >= 6, 'components, connections and the boundary each carry a label');
  assert.ok(drawio.includes('&amp;lt;b&amp;gt;Q7&amp;lt;/b&amp;gt;'), 'the authored text is still there, as text');
  assert.equal(count(drawio, '<mxCell '), count(drawio, '</mxCell>') + 2, 'the XML keeps its structure');
  assert.equal(/<(script|img|svg|iframe|b|i|s)\b/.test(drawio), false, 'no authored tag in the file at all');
});

test('Mermaid, Structurizr and design-document exports keep authored text as text', () => {
  const document = hostileDocument();
  const { model } = buildModel(document);

  const mermaid = toMermaidMarkdown(model);
  const fences = [...mermaid.matchAll(/```mermaid\n([\s\S]*?)\n```/g)].map((match) => match[1]);
  assert.equal(fences.length, count(mermaid, '```') / 2, 'no authored text closes or opens a code fence');
  for (const body of fences) {
    assert.equal(/<(?!br\/>)/.test(body), false, 'no tag in a diagram but the exporter\'s own line break');
    // Every statement is the exporter's: an authored semicolon or line break cannot add one.
    for (const line of body.split('\n')) assert.equal(/;\s*\S/.test(line.replace(/#\w+;/g, '')), false, `a second statement on one line: ${line.slice(0, 120)}`);
    for (const line of body.split('\n')) assert.equal(count(line, '"') % 2, 0, `an open string: ${line.slice(0, 120)}`);
  }
  const outside = mermaid.replace(/```mermaid\n[\s\S]*?\n```/g, '');
  assert.equal(/(?<!\\)[<[]/.test(outside), false, 'headings hold no raw HTML and no link');

  const structurizr = toStructurizr(model);
  for (const line of structurizr.split('\n')) assert.equal((line.match(/(?<!\\)"/g) || []).length % 2, 0, `an open string: ${line.slice(0, 120)}`);
  assert.equal(count(structurizr, '{'), count(structurizr, '}'));

  const rfc = toRfc(document, model);
  const prose = rfc.replace(/```mermaid\n[\s\S]*?\n```/g, '');
  assert.equal(count(rfc, '```'), 2, 'one diagram block, opened and closed by the exporter');
  assert.equal(/(?<!\\)</.test(prose), false, 'no raw HTML in the design document');
  assert.equal(/(?<!\\)\[/.test(prose), false, 'no link or image in the design document');
  assert.ok(prose.includes(mdText(HOSTILE.script)) && prose.includes(mdText(HOSTILE.link)), 'the authored text is still there, as text');
  // Tables keep their shape whatever the cells hold.
  for (const block of prose.split('\n\n').filter((part) => part.startsWith('| '))) {
    const widths = block.split('\n').map((line) => line.replace(/\\\|/g, '').split('|').length);
    assert.equal(new Set(widths).size, 1, block.split('\n')[0]);
  }
});

test('the export command writes the same safe output', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'archi-made-easy-security-export-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const input = path.join(directory, 'hostile.architecture.json');
  fs.writeFileSync(input, JSON.stringify(hostileDocument()));
  const output = path.join(directory, 'hostile.drawio');
  const result = spawnSync(process.execPath, [cli, 'export', 'drawio', input, output, '--json'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const document = hostileDocument();
  assert.equal(fs.readFileSync(output, 'utf8'), toDrawio(document, buildModel(document).model));
});

test('the workbench script has no HTML sink and the level frame is sandboxed', () => {
  const source = fs.readFileSync(path.join(root, 'viewer/workbench.js'), 'utf8');
  for (const sink of ['.innerHTML', '.outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'new Function', 'setTimeout(\'', 'setTimeout("', 'javascript:']) {
    assert.equal(source.includes(sink), false, `viewer/workbench.js uses ${sink}`);
  }
  const sandbox = source.match(/sandbox: '([^']*)'/);
  assert.ok(sandbox, 'the level frame declares a sandbox');
  // Scripts, so the child page works; downloads and dialogs, for its own exports. Not the
  // parent's origin, not navigation of the parent, not popups.
  assert.deepEqual(sandbox[1].split(' ').sort(), ['allow-downloads', 'allow-modals', 'allow-scripts']);
  // A message counts only from the frame that was opened, with the token it was given.
  assert.match(source, /event\.source !== view\.frame\.contentWindow/);
  assert.match(source, /event\.data\.token !== view\.token/);
  assert.match(source, /window\.crypto\.getRandomValues/);
  // The only frame content is the child page from this page's own data.
  assert.equal(count(source, '.srcdoc ='), 1);
});
