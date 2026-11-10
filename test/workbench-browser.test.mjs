// The architecture workbench in a real browser: the frame around the canvas, every mode,
// the simulation flow (set up, run, impact, before and after, recovery), actionable
// findings, agreement with the command-line engine, clean exports, and the inherited
// layout gate. The wider visual matrix is scripts/visual-qa.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ChromeVisualBrowser, findChrome } from '../archi-made-easy/bin/visual-check.mjs';
import { buildModel } from '../archi-made-easy/workbench/model.mjs';
import { simulate } from '../archi-made-easy/workbench/sim.mjs';
import { review } from '../archi-made-easy/workbench/review.mjs';
import { buildScenarios } from '../archi-made-easy/workbench/scenarios.mjs';
import { figures, previewPatches, recoveryPlan } from '../archi-made-easy/workbench/remedy.mjs';
import { toMermaidMarkdown } from '../archi-made-easy/workbench/exporters/mermaid.mjs';
import { toStructurizr } from '../archi-made-easy/workbench/exporters/structurizr.mjs';
import { toDrawio } from '../archi-made-easy/workbench/exporters/drawio.mjs';
import { toRfc } from '../archi-made-easy/workbench/exporters/rfc.mjs';
import { buildWorkbenchData } from '../archi-made-easy/workbench/embed.mjs';
import { authoredWebHa } from '../scripts/visual-qa-fixtures.mjs';

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'archi-made-easy');
const chrome = process.env.ARCHI_MADE_EASY_CHROME ? findChrome() : null;
const plain = (value) => JSON.parse(JSON.stringify(value));

test('Architecture workbench in the browser', {
  skip: chrome ? false : 'Set ARCHI_MADE_EASY_CHROME to run real-browser workbench checks.',
}, async (t) => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'archi-made-easy-workbench-'));
  t.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
  const document = authoredWebHa();
  // The page builds its model from the embedded document; the tests compare against the same.
  const pageDocument = buildWorkbenchData(document).document;
  const model = buildModel(pageDocument).model;
  assert.equal(model.authored, true);
  const renderTo = (type, input, name) => {
    const output = path.join(scratch, name);
    execFileSync(process.execPath, [path.join(skillRoot, `renderers/${type}/render-${type}.mjs`), input, output]);
    return output;
  };
  const authoredInput = path.join(scratch, 'authored.architecture.json');
  fs.writeFileSync(authoredInput, JSON.stringify(document));
  const files = {
    authored: renderTo('architecture', authoredInput, 'authored.html'),
    inherited: renderTo('architecture', path.join(skillRoot, 'examples', 'web-app.architecture.json'), 'inherited.html'),
    workflow: renderTo('workflow', path.join(skillRoot, 'examples', 'agent-tool-call.workflow.json'), 'workflow.html'),
  };

  const browser = new ChromeVisualBrowser(chrome);
  t.after(() => browser.close());
  const session = await browser.sessionPromise;
  const send = (method, params = {}) => browser.cdp.send(method, params, session);
  await browser.cdp.send('Browser.setDownloadBehavior', { behavior: 'deny' });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.workbenchTestErrors = [];
    addEventListener('error', e => workbenchTestErrors.push(e.message));
    addEventListener('unhandledrejection', e => workbenchTestErrors.push(String(e.reason)));` });
  async function evaluate(expression, awaitPromise = false) {
    const result = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
    assert.equal(result.exceptionDetails, undefined, result.exceptionDetails?.exception?.description);
    return result.result?.value;
  }
  const settle = `(async () => { const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); await document.fonts.ready; await frame(); await ArchiMadeEasy.readerLayout.whenStable(); await ArchiMadeEasy.viewerChromeLayout.whenStable(); await frame(); })()`;
  async function load(file, { query = '', width = 1440, height = 900, reducedMotion = true } = {}) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: reducedMotion ? 'reduce' : 'no-preference' }] });
    const loaded = browser.cdp.waitFor('Page.loadEventFired', session);
    const result = await send('Page.navigate', { url: `${pathToFileURL(file).href}?theme=light${query}` });
    assert.equal(result.errorText, undefined);
    await loaded;
    await evaluate(settle, true);
    assert.deepEqual(await evaluate('workbenchTestErrors'), []);
  }
  async function clickAt(selector) {
    const point = await evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: point.x, y: point.y, button: 'left', clickCount: 1 });
  }
  const clickNode = (id) => clickAt(`[data-node-id="${id}"] rect:not(.c-mask)`);
  const PRELUDE = `const w = ArchiMadeEasy.workbench; const html = document.documentElement; const svg = document.querySelector('.diagram-container > svg');
    const visible = (s) => { const e = document.querySelector(s); return Boolean(e) && !e.hidden && getComputedStyle(e).display !== 'none'; };
    const box = (s) => { const r = document.querySelector(s).getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
    const marks = () => svg.querySelectorAll('[data-workbench-overlay], [data-wb-state], [data-wb-edge], [data-wb-fault], [data-wb-lit], [data-wb-pending]').length;`;
  const page = (expression) => evaluate(`(() => { ${PRELUDE} return (${expression}); })()`);
  const act = async (expression) => { await evaluate(`(() => { ${PRELUDE} ${expression} })()`); await evaluate(settle, true); };

  await t.test('workbench off: the page keeps the inherited geometry; the toolbar toggle and the gutter rail turn the frame on', async () => {
    await load(files.inherited);
    const state = await page(`{ available: w.available, on: w.isOn(), open: w.isOpen(), padding: getComputedStyle(document.body).paddingLeft + ' ' + getComputedStyle(document.body).paddingRight,
      header: box('.header'), container: box('.container'), toolbar: box('.toolbar'), rail: box('#workbench-rail'), canvas: box('.diagram-container'),
      mark: getComputedStyle(document.querySelector('.header .pulse-dot'), '::before').maskImage !== 'none', strip: getComputedStyle(document.querySelector('.header')).borderImageSource !== 'none',
      title: document.querySelector('.header h1').textContent, toggle: [document.getElementById('btn-workbench').hidden, document.getElementById('btn-workbench').getAttribute('aria-pressed')],
      labels: [...document.querySelectorAll('.ame-rail-label')].filter(l => getComputedStyle(l).display !== 'none').length, railNames: [...document.querySelectorAll('.ame-rail-btn')].map(b => b.title).filter(Boolean).length,
      vitals: visible('#workbench-vitals'), inspector: visible('#workbench-inspector'), modes: [...document.querySelectorAll('.ame-rail-btn')].map(b => b.getAttribute('data-workbench-mode')),
      marks: marks(), root: html.getAttribute('data-workbench'), diagram: box('.diagram-container > svg'), overflowX: html.scrollWidth > innerWidth }`);
    assert.equal(state.available, true);
    assert.deepEqual([state.on, state.open, state.vitals, state.inspector, state.marks, state.root, state.overflowX], [false, false, false, false, 0, null, false]);
    // The inherited page: 2rem side padding, the header at the top of the page column.
    assert.equal(state.padding, '32px 32px', 'the frame takes no space while it is off');
    assert.deepEqual([state.header.left, state.container.left, state.canvas.left], [32, 32, 32]);
    assert.ok(state.toolbar.right <= state.container.right + 1 && state.toolbar.top < state.header.bottom, 'the tools sit at the right end of the title strip');
    assert.deepEqual([state.mark, state.strip, state.title], [true, true, 'Sample Web App'], 'product mark and title strip are painted');
    // The rail is a column of icons inside the page gutter; every icon has a name.
    assert.ok(state.rail.left === 0 && state.rail.right <= state.canvas.left, `rail ${state.rail.right}px wide, canvas starts at ${state.canvas.left}`);
    assert.deepEqual([state.labels, state.railNames], [0, 9]);
    assert.deepEqual(state.modes, ['explore', 'review', 'simulate', 'security', 'performance', 'finops', 'optimize', 'decide', 'handoff']);
    assert.deepEqual(state.toggle, [false, 'false'], 'the toolbar offers the workbench');

    // The toolbar toggle turns the frame on (inspector closed) and off again, restoring the page exactly.
    await act(`document.getElementById('btn-workbench').click();`);
    const toggled = await page(`{ on: w.isOn(), open: w.isOpen(), pressed: document.getElementById('btn-workbench').getAttribute('aria-pressed'), vitals: box('#workbench-vitals'), rail: box('#workbench-rail'), canvas: box('.diagram-container'),
      labels: [...document.querySelectorAll('.ame-rail-label')].filter(l => getComputedStyle(l).display !== 'none').length, inner: [innerWidth, innerHeight], overflowX: html.scrollWidth > innerWidth }`);
    assert.deepEqual([toggled.on, toggled.open, toggled.pressed, toggled.labels, toggled.overflowX], [true, false, 'true', 9, false]);
    assert.ok(toggled.rail.right <= toggled.canvas.left && toggled.rail.width > 60, 'the rail is labelled and the canvas starts after it');
    assert.ok(Math.abs(toggled.vitals.bottom - toggled.inner[1]) <= 1 && toggled.vitals.left >= toggled.rail.right - 1, 'the vitals bar runs along the bottom, after the rail');
    await act(`document.getElementById('btn-workbench').click();`);
    const off = await page(`{ on: w.isOn(), vitals: visible('#workbench-vitals'), marks: marks(), root: html.getAttribute('data-workbench'), diagram: box('.diagram-container > svg'), padding: getComputedStyle(document.body).paddingLeft + ' ' + getComputedStyle(document.body).paddingRight }`);
    assert.deepEqual([off.on, off.vitals, off.marks, off.root, off.padding], [false, false, 0, null, '32px 32px']);
    assert.deepEqual(off.diagram, state.diagram, 'the diagram returns to its original place and size');

    // A mode on the rail turns the workbench on with its inspector open.
    await act(`document.querySelector('[data-workbench-mode="review"]').click();`);
    const on = await page(`{ on: w.isOn(), open: w.isOpen(), mode: w.state().mode, inspector: visible('#workbench-inspector'), pressed: document.querySelector('[data-workbench-mode="review"]').getAttribute('aria-pressed'),
      strip: document.getElementById('workbench-vitals').textContent, authored: w.result().basis.authored_inputs, assumed: w.result().basis.assumed_inputs }`);
    assert.deepEqual([on.on, on.open, on.mode, on.inspector, on.pressed], [true, true, 'review', true, 'true']);
    assert.match(on.strip, /modelled\s*not measured/i);
    assert.equal(on.authored, 0, 'an inherited document states no operational input');
    assert.match(on.strip, new RegExp(`0 authored, ${on.assumed} assumed inputs`));
  });

  await t.test('an authored architecture starts with the workbench on, the inspector closed and nothing covering the canvas', async () => {
    await load(files.authored);
    const state = await page(`{ on: w.isOn(), open: w.isOpen(), figures: w.figures(), result: w.result(), review: w.review(), marks: svg.querySelectorAll('[data-wb-state], [data-wb-fault], .workbench-badge').length,
      rail: box('#workbench-rail'), vitals: box('#workbench-vitals'), canvas: box('.diagram-container'), nav: box('.diagram-nav'), legend: box('svg [data-legend]'),
      readouts: [...document.querySelectorAll('.ame-readout')].map(r => [r.getAttribute('data-readout'), r.querySelector('.ame-readout-value').textContent]),
      condition: Boolean(document.querySelector('[data-workbench-condition]')), overflowX: html.scrollWidth > innerWidth, overflow: html.getAttribute('data-reader-overflow') }`);
    assert.deepEqual([state.on, state.open, state.marks, state.condition, state.overflowX], [true, false, 0, false, false]);
    assert.deepEqual(state.result, plain(simulate(model, {})), 'the page runs the same engine as the command line');
    assert.deepEqual(state.figures, plain(figures(model, {})));
    assert.deepEqual(state.review, plain(review(model, {})));
    assert.deepEqual(state.readouts.map((r) => r[0]), ['availability', 'latency', 'load', 'spof', 'cost', 'score']);
    assert.equal(state.readouts[0][1], `${Math.floor(state.figures.composite_sla_percent * 1000) / 1000}%`, 'a share below 100 is floored, never rounded up');
    // The regions frame the canvas; they do not cover it, its tools or its legend.
    assert.ok(state.rail.right <= state.canvas.left, 'rail is left of the canvas');
    assert.ok(state.canvas.bottom <= state.vitals.top, 'the canvas ends above the vitals bar');
    assert.ok(state.nav.bottom <= state.vitals.top && state.legend.bottom <= state.vitals.top, 'canvas tools and legend are clear of the vitals bar');
    assert.equal(state.overflow, null, 'the reader fits the diagram in the space left over');

    // Opening the inspector docks it: the canvas refits beside it and is still not covered.
    await act(`document.querySelector('[data-workbench-mode="explore"]').click();`);
    const docked = await page(`{ open: w.isOpen(), inspector: box('#workbench-inspector'), canvas: box('.diagram-container'), svgBox: box('.diagram-container > svg'), overflowX: html.scrollWidth > innerWidth }`);
    assert.equal(docked.open, true);
    assert.ok(docked.canvas.right <= docked.inspector.left, 'the canvas ends before the inspector begins');
    assert.ok(docked.svgBox.right <= docked.canvas.right + 1 && docked.svgBox.width > 600, `the diagram refits (${Math.round(docked.svgBox.width)}px wide)`);
    assert.equal(docked.overflowX, false);
  });

  await t.test('embedded pages, presentation and a requested mode', async () => {
    await load(files.authored, { query: '&embed=1' });
    assert.deepEqual(await page(`[w.isOn(), visible('.header'), visible('.toolbar'), visible('#workbench-rail')]`), [false, false, false, false], 'an embedded page is the canvas only');
    await load(files.authored, { query: '&present=1' });
    assert.deepEqual(await page(`[visible('#workbench-rail'), visible('#workbench-vitals'), visible('.toolbar')]`), [false, false, true], 'presentation keeps the tools and hides the frame');
    await load(files.inherited, { query: '&workbench=performance' });
    assert.deepEqual(await page('[w.isOn(), w.isOpen(), w.state().mode]'), [true, true, 'performance']);
    await load(files.inherited, { query: '&workbench=chaos' });
    assert.equal(await page('w.state().mode'), 'simulate', 'an older link still opens the matching mode');
    await load(files.inherited, { query: '&workbench=nonsense' });
    assert.deepEqual(await page('[w.isOn(), w.state().mode]'), [true, 'explore']);
  });

  await t.test('Explore: selecting a component on the canvas fills the inspector and keeps the canvas clear', async () => {
    await load(files.authored);
    await clickNode('app');
    await evaluate(settle, true);
    const state = await page(`{ open: w.isOpen(), mode: w.state().mode, selected: w.state().selected, text: document.getElementById('workbench-body').textContent,
      passport: visible('.focus-chip'), focused: document.querySelector('[data-node-id="app"]').getAttribute('aria-pressed'),
      assumedTags: document.querySelectorAll('#workbench-body .ame-kv .ame-tag--assumed').length, authoredTags: document.querySelectorAll('#workbench-body .ame-kv .ame-tag--authored').length }`);
    assert.deepEqual([state.open, state.mode, state.selected, state.focused], [true, 'explore', 'app', 'true']);
    assert.equal(state.passport, false, 'the floating passport does not cover the canvas while the workbench is on');
    assert.match(state.text, /ECS Fargate/);
    assert.match(state.text, /Depends on \(3\)/);
    assert.match(state.text, /Called by \(1\)/);
    const node = model.nodes.find((n) => n.id === 'app');
    const assumed = ['role', 'redundancy', 'sla_percent', 'capacity.max_rps', 'latency.p99_ms'].filter((key) => node.basis[key] === 'assumed').length;
    assert.equal(state.assumedTags, assumed, 'exactly the assumed inputs are tagged assumed');
    assert.ok(state.authoredTags >= 3);
    // A dependency in the inspector is a way to move through the graph.
    await act(`document.querySelector('#workbench-body [data-workbench-node="db"]').click();`);
    assert.deepEqual(await page(`[w.state().selected, /Aurora/.test(document.getElementById('workbench-body').textContent)]`), ['db', true]);
  });

  await t.test('Simulate: nothing fails until Run; then the canvas, figures, comparison and recovery options all follow the engine', async () => {
    await load(files.authored);
    const scenarios = buildScenarios(model);
    await act(`document.querySelector('[data-workbench-mode="simulate"]').click();`);
    const cards = await page(`[...document.querySelectorAll('[data-workbench-scenario]')].map(c => [c.getAttribute('data-workbench-scenario'), c.disabled])`);
    assert.deepEqual(cards, scenarios.map((s) => [s.id, !s.applicable]));
    assert.equal(await page(`document.querySelector('[data-workbench-run]').disabled`), true, 'Run is not offered before anything is set up');

    // Set up scenario A: the target is marked as pending, nothing is shown as failing.
    await act(`document.querySelector('[data-workbench-scenario="a"]').click();`);
    const setup = await page(`{ failing: svg.querySelectorAll('[data-wb-state]').length, pending: [...svg.querySelectorAll('[data-wb-pending]')].map(n => n.getAttribute('data-node-id')), badges: [...svg.querySelectorAll('.workbench-badge text')].map(n => n.textContent),
      condition: Boolean(document.querySelector('[data-workbench-condition]')), figures: w.figures(), run: document.querySelector('[data-workbench-run]').disabled, setup: document.querySelector('[data-workbench-setup]').textContent }`);
    assert.deepEqual([setup.failing, setup.pending, setup.badges, setup.condition, setup.run], [0, ['db'], ['WILL BE DOWN'], false, false]);
    assert.deepEqual(setup.figures, plain(figures(model, {})), 'figures stay at the healthy baseline until Run');
    assert.match(setup.setup, /Primary database or stateful storage outage/);

    // Run.
    const inputs = scenarios.find((s) => s.id === 'a').inputs;
    const expected = simulate(model, inputs);
    await act(`document.querySelector('[data-workbench-run]').click();`);
    const ran = await page(`{ result: w.result(), figures: w.figures(), plan: w.plan(), state: w.state().sim,
      failing: [...svg.querySelectorAll('g[data-wb-state="failing"]')].map(n => n.getAttribute('data-node-id')).sort(), edge: svg.querySelector('path[data-edge-id="app-db"]').getAttribute('data-wb-edge'),
      badges: [...svg.querySelectorAll('.workbench-badge text')].map(n => n.textContent).sort(),
      availability: document.querySelector('[data-readout="availability"]').textContent, condition: document.querySelector('[data-workbench-condition]').textContent,
      impact: document.querySelector('[data-workbench-impact]').textContent, steps: [...document.querySelectorAll('[data-workbench-propagation] li')].map(li => li.textContent.split(':')[0]),
      body: document.getElementById('workbench-body').textContent, options: [...document.querySelectorAll('[data-workbench-option]')].map(o => o.getAttribute('data-workbench-option')) }`);
    assert.deepEqual(ran.result, plain(expected));
    assert.deepEqual(ran.figures, plain(figures(model, inputs)));
    const failing = Object.keys(expected.nodes).filter((id) => expected.nodes[id].state === 'failing').sort();
    assert.deepEqual(ran.failing, failing, 'the canvas shows exactly what the model says fails');
    assert.equal(ran.edge, 'failing');
    assert.ok(ran.badges.includes('DOWN') && ran.badges.includes('FAILING') && ran.badges.includes('NOT SERVED'), ran.badges.join(','));
    // The 0% is never bare: it names the condition and shows the healthy value.
    assert.match(ran.availability, /Answered now\s*0%\s*healthy: 99\.85%/);
    assert.match(ran.condition, /Condition: Primary database or stateful storage outage/);
    assert.match(ran.impact, new RegExp(`modelled\\s*${failing.length} components of ${model.nodes.length} affected\\. 100% of entry traffic is not served`, 'i'));
    assert.equal(ran.steps[0], 'Aurora', 'propagation is listed from the origin outward');
    assert.equal(ran.steps.at(-1), 'Users');
    assert.match(ran.body, /5\. Before and after/);
    assert.match(ran.body, /Healthy\s*Scenario/i);
    const plan = recoveryPlan(pageDocument, inputs);
    assert.deepEqual(ran.plan, plain(plan));
    assert.deepEqual(ran.options, plan.options.map((o) => o.id));
    assert.deepEqual(ran.options, ['standby:db', 'circuit-breakers']);

    // A recovery option: its preview is the engine's, and the diagram can show the recovered state.
    await act(`document.querySelector('[data-workbench-option="standby:db"]').click();`);
    const option = await page(`{ detail: document.querySelector('[data-workbench-option-detail="standby:db"]').textContent, lit: [...svg.querySelectorAll('g[data-wb-lit]')].map(n => n.getAttribute('data-node-id')), spotlight: svg.getAttribute('data-wb-spotlight') }`);
    assert.match(option.detail, /Same failure, with this change\s*modelled/i);
    assert.match(option.detail, /Components affected\s*5\s*1\s*better/i);
    assert.deepEqual([option.lit, option.spotlight], [['db'], null], 'the option outlines what it changes without dimming the failure');
    await act(`document.querySelector('[data-workbench-view="option"]').click();`);
    const recovered = await page(`{ recovered: [...svg.querySelectorAll('g[data-wb-state="recovered"]')].map(n => n.getAttribute('data-node-id')).sort(), db: svg.querySelector('[data-node-id="db"]').getAttribute('data-wb-state'), badges: [...svg.querySelectorAll('.workbench-badge text')].map(n => n.textContent).sort() }`);
    assert.deepEqual(recovered.recovered, failing.filter((id) => id !== 'db'), 'everything but the database recovers');
    assert.equal(recovered.db, 'degraded');
    assert.ok(recovered.badges.includes('ON STANDBY') && recovered.badges.includes('RECOVERED'));
    // The vitals bar follows the diagram: it shows the option's figures and names the change.
    const bar = await page(`{ availability: document.querySelector('[data-readout="availability"]').textContent, condition: document.querySelector('[data-workbench-condition]').textContent, engine: w.plan().options[0].preview.after.composite_sla_percent }`);
    assert.match(bar.condition, /Primary database or stateful storage outage, with the change: Add a standby for Aurora/);
    assert.ok(bar.availability.includes(`${Math.floor(bar.engine * 1000) / 1000}%`) && /healthy: 99\.85%/.test(bar.availability), bar.availability);
    await act(`document.querySelector('[data-workbench-view="scenario"]').click();`);
    assert.match(await page(`document.querySelector('[data-readout="availability"]').textContent`), /Answered now\s*0%/, 'back to the scenario as declared');

    // Reset: the canvas and the figures return to the healthy state.
    await act(`document.querySelector('[data-workbench-reset]').click();`);
    const reset = await page(`{ marks: svg.querySelectorAll('[data-wb-state], [data-wb-edge], [data-wb-fault], .workbench-badge').length, figures: w.figures(), condition: Boolean(document.querySelector('[data-workbench-condition]')), ran: w.state().sim.ran }`);
    assert.deepEqual([reset.marks, reset.condition, reset.ran], [0, false, false]);
    assert.deepEqual(reset.figures, plain(figures(model, {})));
    assert.deepEqual(await evaluate('workbenchTestErrors'), []);
  });

  await t.test('Simulate: marking components by pointer and keyboard, and propagation played step by step', async () => {
    await load(files.authored, { query: '&workbench=simulate', reducedMotion: false });
    // Not armed: a click selects, it does not inject.
    await clickNode('db');
    assert.deepEqual(await page(`[w.state().sim.faults.nodes, w.state().selected]`), [{}, 'db']);
    await act(`document.querySelector('[data-workbench-arm]').click();`);
    await clickNode('db');
    assert.deepEqual(await page(`[w.state().sim.faults.nodes, document.querySelector('[data-node-id="db"]').getAttribute('aria-pressed')]`), [{ db: 'degraded' }, 'false'], 'a marking click sets a fault and does not open Focus');
    await clickNode('db');
    assert.deepEqual(await page(`w.state().sim.faults.nodes`), { db: 'down' });
    // Keyboard: Enter on the focused component continues the cycle (down, partitioned, healthy).
    await evaluate(`document.querySelector('[data-node-id="db"]').focus()`);
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    assert.deepEqual(await page(`w.state().sim.faults.nodes`), { db: 'partitioned' });
    await act(`w.setFault('node', 'db', 'down'); w.setFault('boundary', 'region', 'down');`);
    assert.equal(await page(`svg.querySelectorAll('[data-wb-state]').length`), 0, 'still nothing fails before Run');

    // Run with motion allowed: the failure is revealed one ring of callers at a time.
    await evaluate(`document.querySelector('[data-workbench-run]').click()`);
    const first = await page(`{ wave: w.state().sim.wave, shown: svg.querySelectorAll('g[data-wb-state]').length }`);
    const total = Object.values(simulate(model, { faults: { nodes: { db: 'down' }, boundaries: { region: 'down' } } }).nodes).filter((n) => n.state !== 'ok').length;
    assert.equal(first.wave, 0);
    assert.ok(first.shown > 0 && first.shown < total, `the first step shows the origin only (${first.shown} of ${total})`);
    await evaluate(`new Promise(resolve => setTimeout(resolve, 2600))`, true);
    const last = await page(`{ shown: svg.querySelectorAll('g[data-wb-state]').length, result: w.result() }`);
    assert.equal(last.shown, total, 'after playback every affected component is shown');
    assert.deepEqual(last.result, plain(simulate(model, { faults: { nodes: { db: 'down' }, boundaries: { region: 'down' } } })));
    assert.deepEqual(await evaluate('workbenchTestErrors'), []);
  });

  await t.test('Review and Optimize: a finding spotlights what it affects, explains itself and previews its fix', async () => {
    await load(files.authored);
    const reviewed = review(model, {});
    await act(`document.querySelector('[data-workbench-mode="review"]').click();`);
    const listed = await page(`[...document.querySelectorAll('[data-workbench-finding]')].map(f => f.getAttribute('data-workbench-finding'))`);
    assert.deepEqual(listed, reviewed.findings.map((f) => f.id));
    assert.equal(await page(`document.querySelector('.ame-rail-count').textContent`), String(reviewed.findings.length));
    for (const finding of reviewed.findings) {
      await act(`w.selectFinding(${JSON.stringify(finding.id)});`);
      const shown = await page(`{ nodes: [...svg.querySelectorAll('g[data-wb-lit]')].map(n => n.getAttribute('data-node-id')).sort(), edges: [...new Set([...svg.querySelectorAll('path[data-wb-lit]')].map(p => p.getAttribute('data-edge-id')))].sort(),
        spotlight: svg.getAttribute('data-wb-spotlight'), detail: document.querySelector('[data-workbench-finding-detail]').textContent }`);
      assert.deepEqual(shown.nodes, finding.affectedNodes, `${finding.id}: components`);
      assert.deepEqual(shown.edges, finding.affectedEdges, `${finding.id}: connections`);
      assert.equal(shown.spotlight, 'true');
      for (const part of ['Problem', 'Evidence', 'Consequence', 'Recommended change']) assert.ok(shown.detail.includes(part), `${finding.id}: ${part}`);
      assert.ok(shown.detail.includes(finding.evidence) && shown.detail.includes(finding.consequence) && shown.detail.includes(finding.remediation), finding.id);
      if (finding.fixes.length) {
        const preview = previewPatches(pageDocument, finding.fixes, {});
        const score = preview.metrics.find((m) => m.metric === 'review_score');
        assert.match(shown.detail, /If you make this change\s*modelled/i);
        assert.ok(shown.detail.replace(/\s+/g, ' ').includes(`${score.before} /100`) && shown.detail.replace(/\s+/g, ' ').includes(`${score.after} /100`), `${finding.id}: score ${score.before} to ${score.after}`);
      } else {
        assert.match(shown.detail, /cannot be previewed/);
      }
    }
    // Optimize ranks the previewable changes by score gain.
    await act(`document.querySelector('[data-workbench-mode="optimize"]').click();`);
    const changes = await page(`w.changes()`);
    const expected = reviewed.findings.filter((f) => f.fixes.length).map((f) => ({ id: f.id, gain: previewPatches(pageDocument, f.fixes, {}).metrics.find((m) => m.metric === 'review_score').change }))
      .sort((a, b) => (b.gain - a.gain) || (a.id < b.id ? -1 : 1));
    assert.deepEqual(changes.map(({ id, gain }) => ({ id, gain })), expected);
    await act(`document.querySelector('[data-workbench-change]').click();`);
    assert.deepEqual(await page(`[...svg.querySelectorAll('g[data-wb-lit]')].map(n => n.getAttribute('data-node-id')).sort()`), reviewed.findings.find((f) => f.id === expected[0].id).affectedNodes);
    assert.match(await page(`document.getElementById('workbench-body').textContent`), /All \d+ together/);
    assert.deepEqual(await evaluate('workbenchTestErrors'), []);
  });

  await t.test('Security, Performance, FinOps, Decide and Handoff each show their own view', async () => {
    await load(files.authored);
    await act(`document.querySelector('[data-workbench-mode="security"]').click();`);
    const security = await page(`{ badges: [...svg.querySelectorAll('.workbench-badge text')].map(n => n.textContent), text: document.getElementById('workbench-body').textContent }`);
    assert.ok(security.badges.includes('PUBLIC') && security.badges.includes('JWT'), security.badges.join(','));
    assert.match(security.text, /Entry points/);
    assert.match(security.text, /"Not stated" means the document says nothing/);

    await act(`document.querySelector('[data-workbench-mode="performance"]').click(); const load = document.getElementById('workbench-perf-load'); load.value = '10'; load.dispatchEvent(new Event('input', { bubbles: true }));`);
    const perf = await page(`{ result: w.result(), inputs: w.inputs(), strip: document.getElementById('workbench-vitals').textContent, badges: [...svg.querySelectorAll('.workbench-badge text')].map(n => n.textContent), text: document.querySelector('[data-workbench-performance]').textContent, output: document.querySelector('output[for="workbench-perf-load"]').textContent }`);
    assert.deepEqual(perf.result, plain(simulate(model, { multiplier: 10 })));
    assert.deepEqual([perf.inputs.multiplier, perf.output], [10, '10x']);
    assert.match(perf.strip, /Condition: 10x load/);
    assert.ok(perf.badges.some((b) => /^SATURATED \d+%$/.test(b)), perf.badges.join(','));
    assert.match(perf.text, /Critical path/);
    assert.match(perf.text, /Utilisation/);
    // Leaving Performance returns the figures to baseline: the load belongs to that mode.
    await act(`document.querySelector('[data-workbench-mode="finops"]').click();`);
    const finops = await page(`{ figures: w.figures(), badges: [...svg.querySelectorAll('.workbench-badge text')].map(n => n.textContent), text: document.getElementById('workbench-body').textContent, condition: Boolean(document.querySelector('[data-workbench-condition]')) }`);
    assert.deepEqual(finops.figures, plain(figures(model, {})));
    assert.equal(finops.condition, false);
    assert.ok(finops.badges.includes('no cost data') && finops.badges.some((b) => /^\$[\d,]+\/mo$/.test(b)), finops.badges.join(','));
    assert.match(finops.text, /This total is incomplete: \d+ components carry no cost data/);

    await act(`document.querySelector('[data-workbench-mode="decide"]').click(); document.querySelector('[data-workbench-trace="next"]').click();`);
    const decide = await page(`{ current: svg.querySelector('path[data-edge-id="cdn-lb"]').getAttribute('data-wb-edge'), done: svg.querySelector('path[data-edge-id="users-cdn"]').getAttribute('data-wb-edge'), later: svg.querySelector('path[data-edge-id="app-db"]').getAttribute('data-wb-edge'),
      step: document.querySelector('#workbench-body [aria-current="step"]').textContent, text: document.getElementById('workbench-body').textContent }`);
    assert.deepEqual([decide.current, decide.done, decide.later, decide.step], ['trace-current', 'trace-done', null, 'CloudFront to ALB: cache miss']);
    assert.match(decide.text, /Database with a standby/);
    assert.match(decide.text, /Zone redundancy before multi-region/);

    const downloads = await evaluate(`(async () => {
      document.querySelector('[data-workbench-mode="handoff"]').click();
      const original = URL.createObjectURL; const blobs = [];
      URL.createObjectURL = function (blob) { blobs.push(blob); return original.call(URL, blob); };
      try { document.querySelectorAll('[data-workbench-export]').forEach(button => button.click()); } finally { URL.createObjectURL = original; }
      return { names: [...document.querySelectorAll('[data-workbench-export]')].map(button => button.getAttribute('data-workbench-export')), texts: await Promise.all(blobs.map(blob => blob.text())),
        traceMarks: document.querySelectorAll('.diagram-container [data-wb-edge^="trace"]').length };
    })()`, true);
    assert.deepEqual(downloads.names, ['highly-available-web-application-on-amazon-web-services.mermaid.md', 'highly-available-web-application-on-amazon-web-services.drawio', 'workspace.dsl', 'highly-available-web-application-on-amazon-web-services.rfc.md']);
    assert.equal(downloads.texts[0], toMermaidMarkdown(model));
    assert.equal(downloads.texts[1], toDrawio(pageDocument, model));
    assert.equal(downloads.texts[2], toStructurizr(model));
    assert.equal(downloads.texts[3], toRfc(pageDocument, model));
    assert.equal(downloads.traceMarks, 0, 'trace marks leave with the mode');
    assert.deepEqual(await evaluate('workbenchTestErrors'), []);
  });

  await t.test('keyboard: rail buttons are reachable in order, and Escape collapses the inspector back to its button', async () => {
    await load(files.authored);
    const order = await page(`[...document.querySelectorAll('.toolbar button, .ame-rail button')].filter(b => !b.hidden && b.offsetParent && !b.closest('[role="menu"]')).map(b => b.id || b.getAttribute('data-workbench-mode'))`);
    assert.deepEqual(order.slice(-9), ['explore', 'review', 'simulate', 'security', 'performance', 'finops', 'optimize', 'decide', 'handoff']);
    assert.ok(order.indexOf('btn-workbench') < order.indexOf('btn-export') && order.indexOf('btn-export') < order.indexOf('explore'), 'toolbar first, then the rail');
    await evaluate(`document.querySelector('[data-workbench-mode="review"]').focus()`);
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await evaluate(settle, true);
    assert.deepEqual(await page(`[w.isOpen(), w.state().mode, document.querySelector('[data-workbench-mode="review"]').getAttribute('aria-expanded')]`), [true, 'review', 'true']);
    await evaluate(`document.getElementById('workbench-body').focus()`);
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await evaluate(settle, true);
    assert.deepEqual(await page(`[w.isOpen(), w.isOn(), document.activeElement.getAttribute('data-workbench-mode')]`), [false, true, 'review']);
  });

  await t.test('an export taken during a simulation equals the pristine export', async () => {
    async function exportedSvg(action) {
      await load(files.authored);
      return evaluate(`(async () => {
        ${action}
        const svg = document.querySelector('.diagram-container > svg');
        const before = svg.outerHTML;
        const original = URL.createObjectURL; let blob;
        URL.createObjectURL = function (value) { if (value.type.startsWith('image/svg+xml')) blob = value; return original.call(URL, value); };
        try { await ArchiMadeEasy.exportMenu.run('svg'); } finally { URL.createObjectURL = original; }
        if (!blob) throw new Error('Export did not produce SVG');
        const text = await blob.text();
        const root = new DOMParser().parseFromString(text, 'image/svg+xml').documentElement;
        const marks = '[data-workbench-overlay], [data-wb-state], [data-wb-edge], [data-wb-fault], [data-wb-lit], [data-wb-pending], .workbench-badge';
        return { text, liveUnchanged: before === svg.outerHTML, liveMarks: svg.querySelectorAll(marks).length,
          exportedMarks: root.querySelectorAll(marks).length + ['data-wb-mode', 'data-wb-arm', 'data-wb-spotlight'].filter(a => root.hasAttribute(a)).length };
      })()`, true);
    }
    const pristine = await exportedSvg('ArchiMadeEasy.workbench.off();');
    assert.equal(pristine.liveMarks, 0);
    for (const action of [
      `const w = ArchiMadeEasy.workbench; w.setMode('simulate'); w.setFault('node', 'db', 'down'); w.setFault('boundary', 'region', 'degraded'); w.run({ instant: true }); w.chooseOption('circuit-breakers');`,
      `const w = ArchiMadeEasy.workbench; w.setMode('review'); w.selectFinding(w.review().findings[0].id);`,
      `const w = ArchiMadeEasy.workbench; w.setMode('simulate'); w.chooseScenario('a'); w.arm(true);`,
    ]) {
      const active = await exportedSvg(action);
      assert.ok(active.liveMarks > 0, 'the live diagram shows workbench state');
      assert.equal(active.liveUnchanged, true, 'exporting does not disturb the live diagram');
      assert.equal(active.exportedMarks, 0);
      assert.equal(active.text.replace(/ style=""/g, ''), pristine.text.replace(/ style=""/g, ''));
      assert.equal(/data-wb-|data-workbench-overlay|workbench-badge|[.]ame-/.test(active.text), false, 'not even the workbench styles travel with an export');
    }
  });

  await t.test('the inherited browser layout gate passes with the workbench on and off', async () => {
    // The gate is unchanged from the inherited product. It loads the artifact itself: the
    // authored page turns its workbench on, the inherited page leaves it off.
    const gate = (file, name) => {
      const result = spawnSync(process.execPath, [path.join(skillRoot, 'bin', 'archi-made-easy.mjs'), 'visual-check', file, '--json', '--out-dir', path.join(scratch, name)], { encoding: 'utf8' });
      assert.equal(result.status, 0, result.stdout.slice(0, 2000) + result.stderr);
      return JSON.parse(result.stdout);
    };
    for (const [file, name] of [[files.authored, 'gate-on'], [files.inherited, 'gate-off'], [files.workflow, 'gate-workflow']]) {
      const receipt = gate(file, name);
      assert.equal(receipt.ok, true, name);
      assert.deepEqual(receipt.diagnostics, [], name);
      assert.ok(receipt.containment.viewports.length >= 4);
      for (const viewport of receipt.containment.viewports) {
        assert.deepEqual([viewport.ok, viewport.overflowX, viewport.viewerChromeOk, viewport.readabilityOk], [true, false, true, true], `${name} ${viewport.width}x${viewport.height}`);
      }
    }
  });

  await t.test('narrow screens: modes become a tab bar and the inspector a sheet; other diagram types have no workbench', async () => {
    await load(files.authored, { width: 390, height: 844 });
    const narrow = await page(`{ overflowX: html.scrollWidth > innerWidth, rail: box('#workbench-rail'), nav: box('.diagram-nav'), inner: [innerWidth, innerHeight], open: w.isOpen() }`);
    assert.equal(narrow.overflowX, false);
    assert.ok(narrow.rail.top > narrow.inner[1] / 2 && Math.round(narrow.rail.width) === narrow.inner[0], 'the rail is a bar along the bottom');
    assert.equal(narrow.open, false);
    await act(`document.querySelector('[data-workbench-mode="review"]').click();`);
    const sheet = await page(`{ overflowX: html.scrollWidth > innerWidth, sheet: box('#workbench-inspector'), vitals: box('#workbench-vitals'), rail: box('#workbench-rail'), inner: [innerWidth, innerHeight],
      tools: [...document.querySelectorAll('.toolbar-group > button, .export-wrap > button, .preset-wrap > button')].filter(b => !b.hidden && b.offsetParent).every(b => b.getBoundingClientRect().left >= 0 && b.getBoundingClientRect().right <= innerWidth) }`);
    assert.equal(sheet.tools, true, 'every tool stays on screen at phone width');
    assert.equal(sheet.overflowX, false);
    assert.ok(Math.abs(sheet.sheet.bottom - sheet.vitals.top) <= 1 && Math.abs(sheet.vitals.bottom - sheet.rail.top) <= 1 && sheet.sheet.top > sheet.inner[1] * 0.3, 'sheet, vitals bar and tab bar stack at the bottom; the top of the screen stays with the canvas');
    await act(`document.querySelector('[data-workbench-mode="review"]').click();`);
    assert.equal(await page(`w.isOpen()`), false, 'tapping the mode again puts the sheet away');

    await load(files.workflow);
    assert.deepEqual(await evaluate(`[typeof ArchiMadeEasy.workbench, typeof ArchiMadeEasy.workbenchEngine, document.getElementById('btn-workbench').hidden, document.getElementById('workbench-rail'), document.documentElement.getAttribute('data-ame-rail')]`), ['undefined', 'undefined', true, null, null]);
    assert.deepEqual(await evaluate('workbenchTestErrors'), []);
  });
});
