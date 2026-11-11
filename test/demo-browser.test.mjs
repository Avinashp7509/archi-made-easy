// The hosted demo journey in a real browser (docs/demo/index.html): fail the database, see
// what fails, compare a standby, switch the diagram, start again, open a shared link, and read
// it on a phone. Model facts are checked in test/demo.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ChromeVisualBrowser, findChrome } from '../archi-made-easy/bin/visual-check.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const page = pathToFileURL(path.join(root, 'docs/demo/index.html')).href;
const chromeConfigured = Object.prototype.hasOwnProperty.call(process.env, 'ARCHI_MADE_EASY_CHROME');
const chrome = chromeConfigured ? findChrome() : null;
if (chromeConfigured && !chrome) throw new Error(`ARCHI_MADE_EASY_CHROME does not resolve to an executable browser: ${process.env.ARCHI_MADE_EASY_CHROME}`);

const STATES = `[...document.querySelectorAll('[data-wb-state][data-node-id]')].map((e) => e.getAttribute('data-node-id') + '=' + e.getAttribute('data-wb-state')).sort().join(',')`;

test('demo: the database failure, the standby comparison, reset, shared links and the phone layout', {
  skip: chrome ? false : 'Set ARCHI_MADE_EASY_CHROME to run the real-browser demo journey.',
}, async (t) => {
  const browser = new ChromeVisualBrowser(chrome);
  t.after(() => browser.close());
  const session = await browser.sessionPromise;
  const send = (method, params = {}) => browser.cdp.send(method, params, session);
  async function run(expression) {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    assert.equal(result.exceptionDetails, undefined, result.exceptionDetails?.exception?.description);
    return result.result?.value;
  }
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  async function open(url, width = 1440, height = 900, mobile = false) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
    // A fresh visit each time: going from the page to the same page with only a new #fragment
    // would not load it again, which is not what someone opening a shared link gets.
    const blank = browser.cdp.waitFor('Page.loadEventFired', session);
    await send('Page.navigate', { url: 'about:blank' });
    await blank;
    const loaded = browser.cdp.waitFor('Page.loadEventFired', session);
    await send('Page.navigate', { url });
    await loaded;
    await run(`new Promise((resolve, reject) => { const t = Date.now(); (function poll() { if (document.documentElement.hasAttribute('data-demo-ready') || ${url.includes('?full') ? 'true' : 'false'}) resolve(); else if (Date.now() - t > 15000) reject(new Error('demo not ready')); else setTimeout(poll, 50); })(); })`);
  }
  const click = (action) => run(`document.querySelector('[data-demo-action="${action}"]').click()`);

  await open(page);
  assert.equal(await run(STATES), '', 'the diagram starts with nothing failed');
  assert.equal(await run(`document.querySelector('[data-demo-step="failure"]').hidden`), true);

  await click('fail');
  await wait(1800);
  assert.equal(await run(STATES), 'checkout=failing,gateway=failing,orders_db=failing,shoppers=failing');
  assert.equal(await run('location.hash'), '#database-fails');
  assert.equal(await run('document.activeElement.id'), 'demo-fail-h');
  assert.match(await run(`document.querySelector('[data-demo-step="failure"]').innerText`), /100%[\s\S]*3 of 6/);

  await click('standby');
  await wait(600);
  assert.equal(await run(STATES), 'checkout=recovered,gateway=recovered,orders_db=degraded,shoppers=recovered');
  assert.equal(await run('location.hash'), '#with-standby');
  const rows = await run(`[...document.querySelectorAll('.demo-table tbody tr')].map((r) => [...r.querySelectorAll('td')].map((c) => c.firstChild.textContent))`);
  assert.deepEqual(rows.slice(0, 3), [['100%', '0%'], ['3', '0'], ['1', '0']]);
  assert.match(rows[3][0], /^99\.\d{3}%$/);

  await run(`document.querySelector('.demo-seg [data-view="scenario"]').click()`);
  await wait(300);
  assert.match(await run(STATES), /orders_db=failing/, 'the switch shows the failure without the standby');
  await run(`document.querySelector('.demo-seg [data-view="option"]').click()`);
  await wait(300);
  assert.match(await run(STATES), /orders_db=degraded/);

  await click('reset');
  await wait(300);
  assert.equal(await run(STATES), '');
  assert.equal(await run('location.hash'), '');
  assert.equal(await run(`document.activeElement.getAttribute('data-demo-action')`), 'fail');

  // A shared link opens the same result.
  await open(`${page}#with-standby`);
  await wait(400);
  assert.equal(await run(STATES), 'checkout=recovered,gateway=recovered,orders_db=degraded,shoppers=recovered');
  assert.equal(await run(`document.querySelector('[data-demo-step="standby"]').hidden`), false);

  // On a phone: the question comes before the diagram, nothing scrolls sideways, labels stay readable.
  await open(page, 390, 844, true);
  const phone = await run(`(() => {
    const svg = document.querySelector('.diagram-container svg'); const scale = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
    const sizes = [...svg.querySelectorAll('[data-node-id] text')].map((t) => parseFloat(getComputedStyle(t).fontSize) * scale);
    const top = (s) => document.querySelector(s).getBoundingClientRect().top;
    return { overflow: document.documentElement.scrollWidth - innerWidth, smallest: Math.min(...sizes), buttonBeforeDiagram: top('[data-demo-action="fail"]') < top('.diagram-container'), buttonOnFirstScreen: document.querySelector('[data-demo-action="fail"]').getBoundingClientRect().bottom <= innerHeight };
  })()`);
  assert.equal(phone.overflow, 0);
  assert.ok(phone.smallest >= 7.5, `smallest diagram label ${phone.smallest}px`);
  assert.equal(phone.buttonBeforeDiagram, true);
  assert.equal(phone.buttonOnFirstScreen, true);

  // ?full shows the whole workbench instead.
  await open(`${page}?full`);
  await wait(300);
  assert.equal(await run(`document.documentElement.hasAttribute('data-demo')`), false);
  assert.equal(await run(`getComputedStyle(document.getElementById('workbench-rail')).display !== 'none'`), true);
});
