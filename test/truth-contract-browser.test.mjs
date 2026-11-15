// The truth, completeness and evidence contract in a real browser: what a reader actually
// sees in the workbench for an inconclusive run, a missing usage figure, a partial cost and
// a partly evaluated review, and that the page's figures are the command-line engine's.
//
// The scenarios are those of the two QA reports on Copilot Edition v1.0.0 plus adjacent
// ones. The semantic checks read the rendered DOM; the same run can write screenshots
// (set ARCHI_MADE_EASY_TRUTH_SHOTS to a directory) for docs/visual-qa/truth-contract/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ChromeVisualBrowser, findChrome } from '../archi-made-easy/bin/visual-check.mjs';
import { loadKnowledge } from '../archi-made-easy/bin/workbench.mjs';
import { scaffold } from '../archi-made-easy/workbench/scaffold.mjs';
import { buildModel } from '../archi-made-easy/workbench/model.mjs';
import { simulate } from '../archi-made-easy/workbench/sim.mjs';
import { estimateCost } from '../archi-made-easy/workbench/cost.mjs';
import { review } from '../archi-made-easy/workbench/review.mjs';
import { formatCost, simulationHeadline, reviewHeadline } from '../archi-made-easy/workbench/present.mjs';
import { buildWorkbenchData } from '../archi-made-easy/workbench/embed.mjs';

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'archi-made-easy');
const chrome = process.env.ARCHI_MADE_EASY_CHROME ? findChrome() : null;
const shotsDirectory = process.env.ARCHI_MADE_EASY_TRUTH_SHOTS || null;
const plain = (value) => JSON.parse(JSON.stringify(value));
const knowledge = loadKnowledge();

function candidate(pattern, provider, title) {
  const document = scaffold({ slots: knowledge.slots, pattern: knowledge.patterns.find((p) => p.id === pattern), provider: knowledge.providers.find((p) => p.id === provider) });
  document.meta.title = title;
  return document;
}
const operational = (document, id) => (document.components.find((c) => c.id === id).operational ??= {});

/** The documents under test: the two report prompts, the FinOps cases, and a metered component. */
function fixtures() {
  const missing = candidate('web-ha', 'aws', 'FinOps missing-load QA');
  operational(missing, 'worker').finops = { cost_per_million_requests_usd: 0.2 };
  const priced = candidate('web-ha', 'aws', 'FinOps priced-input QA');
  operational(priced, 'worker').finops = { cost_per_million_requests_usd: 0.2 };
  operational(priced, 'users').capacity = { baseline_rps: 3_000_000 / 2_628_000 };
  const metered = candidate('web-ha', 'azure', 'FinOps metered QA');
  operational(metered, 'users').capacity = { baseline_rps: 3_000_000 / 2_628_000 };
  metered.workbench = { ...(metered.workbench || {}), as_of: '2026-11-15' };
  const source = { origin: 'imported', provider: 'example-cloud', service: 'Functions', region: 'example-region-1', plan: 'on-demand', url: 'https://pricing.example.com/functions', retrieved_at: '2026-11-15' };
  operational(metered, 'worker').finops = {
    pricing_model: 'serverless-request', usage: { requests_per_month: 3_000_000, avg_duration_ms: 1000, memory_gb: 0.5 },
    meters: [
      { id: 'executions', dimension: 'requests', unit: 'request', price: 0.2, per: 1000000, currency: 'USD', free_allowance: 1000000, source },
      { id: 'duration', dimension: 'memory-seconds', unit: 'GB-second', price: 0.000016, currency: 'USD', free_allowance: 400000, quantity_basis: 'request-duration', source },
    ],
  };
  return {
    food: candidate('microservices', 'aws', 'Food delivery platform'),
    store: candidate('web-ha', 'azure', 'Highly available online store'),
    none: candidate('web-ha', 'gcp', 'FinOps no-data QA'),
    missing, priced, metered,
  };
}

// Words that reassure. None may be on screen for a run that calculated nothing.
const REASSURANCE = 'No component is affected|Nothing to recover from|0% of entry traffic|unchanged';

test('Truth contract in the browser', {
  skip: chrome ? false : 'Set ARCHI_MADE_EASY_CHROME to run real-browser truth-contract checks.',
}, async (t) => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'archi-made-easy-truth-'));
  t.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
  const documents = fixtures();
  const files = {};
  for (const [name, document] of Object.entries(documents)) {
    const input = path.join(scratch, `${name}.architecture.json`);
    fs.writeFileSync(input, JSON.stringify(document));
    files[name] = path.join(scratch, `${name}.html`);
    execFileSync(process.execPath, [path.join(skillRoot, 'renderers/architecture/render-architecture.mjs'), input, files[name]]);
  }
  files.ecommerce = path.join(scratch, 'ecommerce.html');
  execFileSync(process.execPath, [path.join(skillRoot, 'renderers/architecture/render-architecture.mjs'), path.join(skillRoot, 'examples', 'cloud-native-ecommerce-c4.architecture.json'), files.ecommerce]);
  documents.ecommerce = JSON.parse(fs.readFileSync(path.join(skillRoot, 'examples', 'cloud-native-ecommerce-c4.architecture.json'), 'utf8'));
  // The page builds its model from the embedded document; comparisons use the same.
  const pageModel = (name) => buildModel(buildWorkbenchData(documents[name]).document).model;

  const browser = new ChromeVisualBrowser(chrome);
  t.after(() => browser.close());
  const session = await browser.sessionPromise;
  const send = (method, params = {}) => browser.cdp.send(method, params, session);
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.truthTestErrors = [];
    addEventListener('error', e => truthTestErrors.push(e.message));
    addEventListener('unhandledrejection', e => truthTestErrors.push(String(e.reason)));` });
  async function evaluate(expression, awaitPromise = false) {
    const result = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
    assert.equal(result.exceptionDetails, undefined, result.exceptionDetails?.exception?.description);
    return result.result?.value;
  }
  const settle = `(async () => { const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); await document.fonts.ready; await frame(); await ArchiMadeEasy.readerLayout.whenStable(); await ArchiMadeEasy.viewerChromeLayout.whenStable(); await frame(); })()`;
  async function load(name, { width = 1440, height = 1000, theme = 'light' } = {}) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    const loaded = browser.cdp.waitFor('Page.loadEventFired', session);
    const result = await send('Page.navigate', { url: `${pathToFileURL(files[name]).href}?theme=${theme}` });
    assert.equal(result.errorText, undefined);
    await loaded;
    await evaluate(settle, true);
  }
  const PRELUDE = `const w = ArchiMadeEasy.workbench; const svg = document.querySelector('.diagram-container > svg');
    const text = (s) => { const e = document.querySelector(s); return e ? e.textContent.replace(/\\s+/g, ' ').trim() : null; };
    const all = (s) => Array.from(document.querySelectorAll(s));
    const inspector = () => text('#workbench-inspector') || '';
    const vitals = () => text('#workbench-vitals') || '';
    const badges = () => all('.workbench-badge text').map((e) => e.textContent);
    const readout = (name) => { const e = document.querySelector('[data-readout="' + name + '"]'); return e ? { value: e.querySelector('.ame-readout-value').textContent, status: e.getAttribute('data-status'), note: (e.querySelector('.ame-readout-status') || {}).textContent || null, was: (e.querySelector('.ame-readout-was') || {}).textContent || null } : null; };
    const headings = () => all('#workbench-inspector h3').map((e) => e.textContent);`;
  const page = (expression) => evaluate(`(() => { ${PRELUDE} return (${expression}); })()`);
  const act = async (expression) => { await evaluate(`(() => { ${PRELUDE} ${expression} })()`); await evaluate(settle, true); };
  async function shot(name) {
    if (!shotsDirectory) return;
    fs.mkdirSync(shotsDirectory, { recursive: true });
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(shotsDirectory, `${name}.png`), Buffer.from(data, 'base64'));
  }
  const noErrors = async (where) => assert.deepEqual(await evaluate('truthTestErrors'), [], where);

  await t.test('QA P0: 10x traffic with no baseline is shown as inconclusive, with no reassurance and no comparison', async () => {
    await load('food');
    await act(`w.setMode('simulate'); w.chooseScenario('c'); w.run({ instant: true });`);
    const model = pageModel('food');
    const expected = simulate(model, { multiplier: 10 });
    const head = simulationHeadline(model, expected);
    assert.equal(expected.status, 'inconclusive');
    const seen = await page(`({ status: document.querySelector('[data-workbench-impact]').getAttribute('data-status'), impact: text('[data-workbench-impact]'), inspector: inspector(), vitals: vitals(), headings: headings(),
      needed: text('[data-workbench-needed]'), reasons: all('[data-workbench-reason]').map((e) => e.getAttribute('data-workbench-reason')), announced: text('#workbench-inspector [role="status"]'),
      availability: readout('availability'), latency: readout('latency'), load: readout('load'), marked: svg.querySelectorAll('[data-wb-state]').length, badges: badges(), result: w.result(), plan: w.plan().status })`);
    assert.equal(seen.status, 'inconclusive');
    assert.ok(seen.impact.includes(head.text), 'the page shows the engine headline');
    assert.match(seen.impact, /^modelled inconclusive Inconclusive\. 10x load was not calculated/);
    for (const surface of [seen.inspector, seen.vitals, seen.announced]) assert.doesNotMatch(surface, new RegExp(REASSURANCE), 'no success-like words anywhere on screen');
    assert.ok(seen.headings.includes('5. What is needed'));
    assert.ok(!seen.headings.includes('5. Before and after') && !seen.headings.includes('6. Recovery options'), 'no comparison and no recovery list for an uncalculated run');
    assert.match(seen.inspector, /requests per second on at least one entry point/, 'the reader is told what to supply');
    assert.match(seen.inspector, /Capacity ceiling: \d+ requests\/s .* not evidence that 10x the current load is below it/, 'the ceiling is shown, as a ceiling');
    assert.ok(seen.reasons.includes('missing-baseline-load'));
    assert.deepEqual([seen.availability.value, seen.availability.status, seen.latency.value, seen.latency.status], ['inconclusive', 'inconclusive', 'inconclusive', 'inconclusive']);
    assert.equal(seen.availability.was, null, 'no "healthy:" comparison beside a figure that was not calculated');
    assert.match(seen.load.value, /^[\d,]+\/s$/);
    assert.deepEqual([seen.marked, seen.badges], [0, []], 'the diagram marks nothing as affected or healthy');
    assert.equal(seen.plan, 'inconclusive');
    // The page's result is the command-line engine's, value for value.
    assert.deepEqual(seen.result, plain(expected));
    await act(`document.querySelector('[data-workbench-impact]').scrollIntoView({ block: 'start' });`);
    await shot('01-food-delivery-10x-inconclusive');

    // The same condition through the Performance sliders.
    await act(`w.setMode('performance'); w.setLoad(10, 0);`);
    const perf = await page(`({ status: document.querySelector('[data-workbench-performance-status]').getAttribute('data-status'), text: text('[data-workbench-performance-status]'), inspector: inspector(), availability: readout('availability') })`);
    assert.equal(perf.status, 'inconclusive');
    assert.match(perf.text, /Inconclusive\. 10x load was not calculated/);
    assert.match(perf.inspector, /End to end: inconclusive not calculated at this load/);
    assert.equal(perf.availability.value, 'inconclusive');
    await shot('02-food-delivery-performance-10x');
    for (const [width, height] of [[1280, 800], [1366, 768]]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      await evaluate(settle, true);
      const clipped = await page(`all('.ame-readout-value').filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent)`);
      assert.deepEqual(clipped, [], `${width}: no figure or status word in the vitals bar is cut off`);
    }
    await noErrors('10x');
  });

  await t.test('QA P1/P2: zone and region are separate scenarios with exact targets; duplicate labels are told apart', async () => {
    await load('store');
    await act(`w.setMode('simulate');`);
    const cards = await page(`Object.fromEntries(all('[data-workbench-scenario]').map((e) => [e.getAttribute('data-workbench-scenario'), e.textContent.replace(/\\s+/g, ' ').trim()]))`);
    assert.deepEqual(Object.keys(cards).sort(), ['a', 'b', 'c', 'd', 'e', 'f', 'g']);
    assert.match(cards.b, /Loss of one availability zone.*One availability zone, not the region/);
    assert.match(cards.g, /Region blackout.*the whole region, every zone in it/);
    assert.match(cards.c, /Will be inconclusive: State the current requests per second/, 'readiness is shown before the scenario is run');
    await act(`w.chooseScenario('b'); w.run({ instant: true });`);
    const model = pageModel('store');
    const zone = await page(`({ status: document.querySelector('[data-workbench-impact]').getAttribute('data-status'), impact: text('[data-workbench-impact]'), availability: readout('availability'), headings: headings(), result: w.result(), condition: text('[data-workbench-condition]'), inspector: inspector(),
      marks: { atRisk: Array.from(svg.querySelectorAll('[data-wb-state="at-risk"]')).map((e) => e.getAttribute('data-node-id')).sort(), failing: svg.querySelectorAll('[data-wb-state="failing"]').length, badges: badges().filter((b) => b !== 'DEGRADED') } })`);
    assert.equal(zone.status, 'inconclusive');
    assert.match(zone.impact, /Best case: no component fails .* Worst case: 2 components fail .* depends on where Entra ID runs/);
    assert.equal(zone.availability.value, 'inconclusive');
    // The diagram does not paint the worst case as the outcome: the one component that fails
    // only in the worst case, and the users behind it, are marked at risk, not down.
    assert.deepEqual(zone.marks, { atRisk: ['identity', 'users'], failing: 0, badges: ['AT RISK', 'AT RISK'] });
    assert.match(zone.inspector, /At risk \(fails only in the worst case\): Entra ID, Users\./);
    assert.ok(!zone.headings.includes('5. Before and after'));
    assert.deepEqual(zone.result, plain(simulate(model, { faults: { zone: 'down' } })));
    await shot('03-online-store-zone-loss-range');
    await act(`w.chooseScenario('g'); w.run({ instant: true });`);
    const region = await page(`({ impact: text('[data-workbench-impact]'), framed: svg.querySelectorAll('[data-wb-fault="down"]').length, headings: headings() })`);
    assert.match(region.impact, /8 components of 10 affected\. 100% of entry traffic is not served\./);
    assert.ok(region.framed > 0 && region.headings.includes('5. Before and after'));
    await shot('04-online-store-region-blackout');

    await load('food');
    await act(`w.setMode('simulate');`);
    assert.match(await page(`text('[data-workbench-scenario="a"]')`), /Fails: Aurora \(Orders data\): the whole service, not one replica/);
    await noErrors('scenarios');
  });

  await t.test('QA P1: review shows coverage and a floor beside the score, and lists what could not be checked', async () => {
    await load('store');
    await act(`w.setMode('review');`);
    const expected = review(pageModel('store'));
    const seen = await page(`({ status: document.querySelector('[data-workbench-score]').getAttribute('data-status'), score: text('[data-workbench-score]'), coverage: text('[data-workbench-coverage]'), gaps: all('[data-workbench-gap]').map((e) => e.getAttribute('data-workbench-gap')),
      inspector: inspector(), readout: readout('score'), review: { status: w.review().status, score: w.review().score, floor: w.review().score_floor, gaps: w.review().gaps.length } })`);
    assert.deepEqual(seen.review, { status: expected.status, score: expected.score, floor: expected.score_floor, gaps: expected.gaps.length });
    assert.equal(seen.status, 'partial');
    assert.match(seen.score, /partial$/);
    assert.ok(seen.coverage.toLowerCase().includes(reviewHeadline(expected).qualifier.toLowerCase()), 'the page shows the engine words for coverage and floor');
    assert.equal(seen.gaps.length, expected.gaps.length);
    assert.match(seen.inspector, /Entra ID is a provider-managed service/);
    assert.doesNotMatch(seen.inspector, /Run Entra ID across at least two/, 'no fix the customer cannot apply');
    assert.match(seen.inspector, /Cost\s*unknown\s*not assessed/, 'a pillar nothing could assess is not scored 100');
    assert.deepEqual(await page(`all('#workbench-inspector .ame-table-wrap, #workbench-inspector .ame-tag').filter((e) => { const r = e.getBoundingClientRect(); const box = document.querySelector('#workbench-body').getBoundingClientRect(); return r.right > box.right + 1 || e.scrollWidth > e.clientWidth + 1; }).map((e) => e.className + ': ' + e.textContent.slice(0, 60))`), [], 'no status tag or table is clipped in the inspector');
    assert.deepEqual([seen.readout.status, seen.readout.note], ['partial', 'partial']);
    await shot('05-online-store-review-coverage');
    await noErrors('review');
  });

  await t.test('FinOps P0: a request price with no usage is "not calculated", never $0, on every part of the page', async () => {
    await load('missing');
    await act(`w.setMode('finops');`);
    const model = pageModel('missing');
    const expected = estimateCost(model, simulate(model));
    assert.equal(expected.status, 'inconclusive');
    const seen = await page(`({ status: document.querySelector('[data-workbench-cost]').getAttribute('data-status'), total: text('[data-workbench-cost] strong'), headings: headings(), inspector: inspector(), vitals: vitals(), badges: badges(),
      omitted: all('[data-workbench-meter-omitted]').map((e) => e.getAttribute('data-workbench-meter-omitted')), nofindings: text('[data-workbench-nofindings]'), gaps: all('[data-workbench-gap]').map((e) => e.getAttribute('data-workbench-gap')),
      cost: readout('cost'), reasons: text('[data-workbench-cost-reasons]'), page: w.cost() })`);
    assert.deepEqual(seen.page, plain(expected), 'the page cost is the command-line cost');
    assert.deepEqual([seen.status, seen.total], ['inconclusive', formatCost(expected).text]);
    assert.equal(seen.total, 'not calculated');
    assert.ok(seen.headings.includes('Not calculated') && !seen.headings.includes('Total'), 'the section is not headed "Total"');
    for (const surface of [seen.inspector, seen.vitals, seen.badges.join(' ')]) assert.doesNotMatch(surface, /\$0(?![.\d])|\$0\.00/, 'no $0 anywhere');
    assert.ok(seen.badges.includes('usage unknown'), 'the diagram badge on the priced component says its usage is unknown');
    assert.ok(!seen.badges.some((badge) => /^\$/.test(badge)));
    assert.deepEqual(seen.omitted, ['missing-usage-baseline']);
    assert.match(seen.reasons, /left out, not counted as zero/i);
    assert.match(seen.nofindings, /not fully checked/);
    assert.ok(seen.gaps.includes('cost-estimate-incomplete'), 'an actionable completeness gap replaces "no rule fired"');
    assert.deepEqual([seen.cost.value, seen.cost.status], ['not calculated', 'inconclusive']);
    await shot('06-finops-missing-usage-not-zero');
    await noErrors('missing usage');
  });

  await t.test('FinOps P1/P2: a request-only price is a partial subtotal that keeps its cents', async () => {
    await load('priced');
    await act(`w.setMode('finops');`);
    const seen = await page(`({ status: document.querySelector('[data-workbench-cost]').getAttribute('data-status'), total: text('[data-workbench-cost] strong'), headings: headings(), inspector: inspector(), vitals: vitals(), badges: badges(), cost: readout('cost'), coverage: text('[data-workbench-cost-coverage]') })`);
    assert.deepEqual([seen.status, seen.total], ['partial', 'at least $0.60']);
    assert.ok(seen.headings.includes('Partial subtotal') && !seen.headings.includes('Total'));
    assert.ok(seen.badges.includes('≥ $0.60/mo partial'));
    for (const surface of [seen.inspector, seen.vitals, seen.badges.join(' ')]) assert.doesNotMatch(surface, /\$1(?![\d.,])/, '$0.60 is never rounded to $1');
    assert.deepEqual([seen.cost.value, seen.cost.status, seen.cost.note], ['≥ $0.60', 'partial', 'partial'], 'the strip uses the short form and says partial');
    assert.match(seen.coverage, /1 of 9 priceable components priced; 1 of 1 meter calculated/, 'the user actor is not in the denominator');
    assert.match(seen.inspector, /do not say how their service is billed/);
    assert.match(seen.inspector, /Price evidence: none/);
    await shot('07-finops-request-only-partial');

    // Every billed dimension priced, with a source: that component is complete and traceable.
    await load('metered');
    await act(`w.setMode('finops');`);
    const metered = await page(`({ total: text('[data-workbench-cost] strong'), badges: badges(), inspector: inspector(),
      meters: all('[data-workbench-meter]').map((e) => ({ id: e.getAttribute('data-workbench-meter'), text: e.textContent.replace(/\\s+/g, ' '), source: e.querySelector('[data-workbench-meter-source]').getAttribute('data-workbench-meter-source'), url: e.querySelector('[data-workbench-meter-source]').getAttribute('title'), equation: e.querySelector('[data-workbench-meter-equation]').textContent })),
      clipped: all('#workbench-inspector .ame-facts li, #workbench-inspector .ame-table-wrap').filter((e) => e.scrollWidth > e.clientWidth + 1).length })`);
    assert.equal(metered.total, 'at least $18.00', 'still a subtotal: eight other components are unpriced');
    assert.ok(metered.badges.includes('$18.00/mo'), 'the component priced on every billed dimension shows a total');
    assert.deepEqual(metered.meters.map((meter) => meter.id), ['worker/executions', 'worker/duration']);
    const duration = metered.meters[1];
    // (3,000,000 x 1 s x 0.5 GB - 400,000 free) x $0.000016 = $17.60: quantity, price, allowance, source and equation are all on screen.
    assert.match(duration.text, /memory-seconds: \$17\.60/);
    assert.match(duration.text, /1,500,000 GB-seconds a month, at \$0\.000016 per GB-second, 400,000 free\./, 'the unit price is shown unrounded');
    assert.match(duration.text, /Price source: example-cloud, Functions, example-region-1, on-demand, retrieved 2026-11-15\./);
    assert.deepEqual([duration.source, duration.url], ['sourced', 'https://pricing.example.com/functions']);
    assert.match(duration.equation, /Equation: cost = max\(0, quantity − free allowance\) ÷ 1 × \$0\.000016 per GB-second; billed seconds: each request is billed for its own duration/);
    assert.equal(metered.clipped, 0, 'no meter entry is cut off in the inspector');
    assert.match(metered.inspector, /Price evidence: traceable/);
    await shot('08-finops-metered-with-sources');

    // The honest empty state is unchanged.
    await load('none');
    await act(`w.setMode('finops');`);
    const none = await page(`({ status: document.querySelector('[data-workbench-cost]').getAttribute('data-status'), total: text('[data-workbench-cost] strong'), badges: badges(), cost: readout('cost') })`);
    assert.deepEqual([none.status, none.total, none.cost.value], ['unknown', 'no data', 'no data']);
    assert.ok(none.badges.length === 9 && none.badges.every((badge) => badge === 'no cost data'));
    await shot('09-finops-no-data-preserved');
    await noErrors('finops');
  });

  await t.test('FinOps (packaged example): the figure is a partial subtotal on one line, at every width', async () => {
    for (const [width, height] of [[1440, 1000], [1280, 800], [390, 844]]) {
      await load('ecommerce', { width, height });
      await act(`w.setMode('finops');`);
      const seen = await page(`(() => { const strong = document.querySelector('[data-workbench-cost] strong'); return { total: strong.textContent, lines: strong.getClientRects().length, status: document.querySelector('[data-workbench-cost]').getAttribute('data-status'), headings: headings(), overflow: document.documentElement.scrollWidth - window.innerWidth, inspector: inspector(),
        cost: readout('cost'), clipped: all('.ame-readout-value').filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent) }; })()`);
      assert.deepEqual([seen.total, seen.status], ['at least $15,878', 'partial'], `${width}`);
      assert.equal(seen.lines, 1, `${width}: the figure does not wrap inside itself`);
      // The strip shows every digit: a figure cut to "$15,8…" would be a different number.
      assert.deepEqual([seen.cost.value, seen.cost.note, seen.clipped], ['≥ $15,878', 'partial', []], `${width}: no figure in the strip is clipped`);
      assert.ok(seen.overflow <= 0, `${width}: no horizontal overflow`);
      assert.ok(seen.headings.includes('Partial subtotal'));
      assert.match(seen.inspector, /Price evidence: none/);
      if (width !== 1280) await shot(`10-ecommerce-partial-subtotal-${width}`);
    }
    await noErrors('ecommerce');
  });

  await t.test('accessibility: a status is always words, controls are named, and the result is announced', async () => {
    for (const [name, setup] of [['food', `w.setMode('simulate'); w.chooseScenario('c'); w.run({ instant: true });`], ['missing', `w.setMode('finops');`], ['store', `w.setMode('review');`]]) {
      await load(name);
      await act(setup);
      const seen = await page(`({
        tags: all('.ame-tag--status').map((e) => ({ text: e.textContent.trim(), status: e.getAttribute('data-status') })),
        unnamed: all('#workbench-inspector button, #workbench-rail button').filter((e) => !(e.textContent.trim() || e.getAttribute('aria-label'))).length,
        statusOnly: all('[data-status]').filter((e) => e.getAttribute('data-status') !== 'complete' && !new RegExp(e.getAttribute('data-status').replace('_', ' '), 'i').test(e.textContent) && !e.querySelector('.ame-tag--status') && !/no data|not calculated|at least/.test(e.textContent)).map((e) => e.outerHTML.slice(0, 120)),
        region: document.querySelector('#workbench-inspector').getAttribute('aria-labelledby'), live: document.querySelector('#workbench-inspector [role="status"]').getAttribute('aria-live'),
        tables: all('#workbench-inspector table.ame-table').every((table) => table.querySelectorAll('th[scope="col"]').length > 0),
        icon: Boolean(document.querySelector('link[rel="icon"]')),
      })`);
      assert.ok(seen.tags.length > 0 && seen.tags.every((tag) => tag.text.length > 0 && tag.text === tag.status.replace('_', ' ')), `${name}: every status tag carries its status as text`);
      assert.equal(seen.unnamed, 0, `${name}: every control has a name`);
      assert.deepEqual(seen.statusOnly, [], `${name}: no status is conveyed by colour or attribute alone`);
      assert.deepEqual([seen.region, seen.live, seen.tables, seen.icon], ['workbench-inspector-title', 'polite', true, true], name);
    }
    await noErrors('accessibility');
  });

  await t.test('narrow screens: the status and the reason stay on screen', async () => {
    await load('food', { width: 390, height: 844 });
    await act(`w.setMode('simulate'); w.chooseScenario('c'); w.run({ instant: true });`);
    const seen = await page(`(() => { const impact = document.querySelector('[data-workbench-impact]'); impact.scrollIntoView({ block: 'nearest' }); const r = impact.getBoundingClientRect(); return { status: impact.getAttribute('data-status'), inside: r.left >= 0 && r.right <= window.innerWidth + 1, overflow: document.documentElement.scrollWidth - window.innerWidth, vitals: vitals() }; })()`);
    assert.deepEqual([seen.status, seen.inside], ['inconclusive', true]);
    assert.ok(seen.overflow <= 0);
    assert.match(seen.vitals, /inconclusive/);
    await shot('11-food-delivery-10x-mobile');
    await noErrors('mobile');
  });
});
