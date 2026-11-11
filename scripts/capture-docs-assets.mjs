#!/usr/bin/env node
// Re-capture the raster images of the documentation and the website from running pages.
//
//   node scripts/capture-docs-assets.mjs [--only name,name]
//
// Every image is taken by Chrome from a page this repository renders (the examples, the
// gallery and the case pages), in a stated state: a theme, a viewport, a menu open, a
// route traced, a scenario run. Share cards are the viewer's own Share Card export. The
// social card is scripts/social-card-template.html around a screenshot taken in the same
// run. Nothing is drawn or edited by hand. docs/assets/capture-manifest.json records the
// source page, viewport, density and state of each image.
//
// Run after the pages are regenerated (the regeneration cascade), with Chrome, Chromium
// or Edge installed (ARCHI_MADE_EASY_CHROME may name it).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ChromeVisualBrowser, findChrome } from '../archi-made-easy/bin/visual-check.mjs';
import { sameEntry } from '../archi-made-easy/renderers/shared/path-semantics.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = path.join(repoRoot, 'docs', 'assets');
const examples = (name) => path.join(repoRoot, 'archi-made-easy', 'examples', name);
const cases = (name) => path.join(repoRoot, 'docs', 'cases', name);
const gallery = (name) => path.join(repoRoot, 'docs', 'gallery', 'artifacts', name);

const W = 'const w = ArchiMadeEasy.workbench;';
/** One entry per image. `capture`: viewport, element (`.diagram-container`), or share-card. */
export const CAPTURES = [
  // The product's own page, with the workbench frame on: the website's light/dark comparison and the export menu.
  { name: 'archi-made-easy-light.png', page: examples('cloud-native-ecommerce-c4.html'), theme: 'light', viewport: [1400, 1100], capture: 'viewport' },
  { name: 'archi-made-easy-dark.png', page: examples('cloud-native-ecommerce-c4.html'), theme: 'dark', viewport: [1400, 1100], capture: 'viewport' },
  { name: 'archi-made-easy-menu.png', page: examples('cloud-native-ecommerce-c4.html'), theme: 'light', viewport: [1400, 1100], capture: 'viewport', state: 'export menu open',
    act: "ArchiMadeEasy.exportMenu.open(); await new Promise((resolve) => setTimeout(resolve, 400));" },
  // One image per diagram type for the website's type gallery. Architecture shows the workbench.
  { name: 'archi-made-easy-architecture.png', page: examples('global-fintech-payment-mesh.html'), theme: 'light', viewport: [1376, 772], scale: 2, capture: 'viewport', state: 'workbench on' },
  { name: 'archi-made-easy-class.png', page: examples('class-payments-rendered.html'), theme: 'light', viewport: [1280, 800], scale: 2, capture: 'element' },
  { name: 'archi-made-easy-dataflow.png', page: examples('dataflow-product-analytics.html'), theme: 'light', viewport: [1280, 800], scale: 2, capture: 'element' },
  { name: 'archi-made-easy-erd.png', page: examples('erd-orders-rendered.html'), theme: 'light', viewport: [1280, 800], scale: 2, capture: 'element' },
  { name: 'archi-made-easy-lifecycle.png', page: examples('lifecycle-agent-run.html'), theme: 'light', viewport: [1280, 800], scale: 2, capture: 'element' },
  { name: 'archi-made-easy-sequence.png', page: examples('sequence-cache-miss-request.html'), theme: 'light', viewport: [1280, 800], scale: 2, capture: 'element' },
  { name: 'archi-made-easy-timeline.png', page: examples('timeline-payment-incident-rendered.html'), theme: 'light', viewport: [1280, 800], scale: 2, capture: 'element' },
  { name: 'archi-made-easy-tree.png', page: examples('tree-payment-platform-rendered.html'), theme: 'light', viewport: [1280, 800], scale: 2, capture: 'element' },
  { name: 'archi-made-easy-waterfall.png', page: examples('waterfall-checkout-request-rendered.html'), theme: 'light', viewport: [1280, 800], scale: 2, capture: 'element' },
  { name: 'archi-made-easy-workflow.png', page: examples('workflow-agent-tool-call-rendered.html'), theme: 'light', viewport: [1280, 800], scale: 2, capture: 'element' },
  // The workbench during a failure scenario: shown on its own and inside the social card.
  { name: 'archi-made-easy-workbench.png', page: examples('global-fintech-payment-mesh.html'), theme: 'dark', viewport: [1440, 900], capture: 'viewport', state: 'Simulate: region A blackout, run',
    act: `${W} w.setMode('simulate'); w.chooseScenario('b'); w.run({ instant: true });` },
  // Share cards, from the viewer's Share Card export.
  { name: 'archi-made-easy-route-share-card.png', page: gallery('agent-tool-call.workflow.html'), hash: 'route=user~external', theme: 'dark', viewport: [1440, 900], capture: 'share-card', variant: 'route', state: 'route user to external' },
  { name: 'mco-runtime-share-card.png', page: cases('mco-runtime.architecture.html'), hash: 'route=callers~consumers', theme: 'dark', viewport: [1440, 900], capture: 'share-card', variant: 'route', state: 'route callers to consumers' },
  { name: 'mco-runtime-reach-share-card.png', page: cases('mco-runtime.architecture.html'), theme: 'dark', viewport: [1440, 900], capture: 'share-card', variant: 'reach', state: 'downstream of the command router',
    act: "ArchiMadeEasy.focus.set('router', { toggle: false, updateUrl: false }); ArchiMadeEasy.focus.reach('downstream', { toggle: false, updateUrl: false, reveal: false });" },
  // Case pages for the website gallery.
  ...['finalize-delivery', 'first-rental', 'p99-tail-latency', 'tls-first-visit'].map((name, index) => ({
    name: `explainer/${name}.webp`, page: cases(`explainer/${name}.html`), viewport: [640, [1152, 912, 882, 1124][index]], capture: 'viewport', format: 'webp', state: 'top of the page' })),
  ...['job-search.lifecycle', 'leave-plan.workflow', 'monthly-money.dataflow', 'renting.sequence'].map((name) => ({
    name: `life/${name}.webp`, page: cases(`life/${name}.html`), theme: 'light', viewport: [1440, 900], scale: 2, capture: 'element', format: 'webp' })),
  // Composed last: it shows the workbench screenshot taken above.
  { name: 'archi-made-easy-social-preview.png', compose: 'archi-made-easy-workbench.png', viewport: [1200, 630], capture: 'viewport', state: 'scripts/social-card-template.html around archi-made-easy-workbench.png' },
  // GitHub's repository social preview (Settings > Social preview), at its recommended 1280 x 640.
  { name: 'github-social-preview.png', compose: 'archi-made-easy-workbench.png', viewport: [1280, 640], capture: 'viewport', state: 'scripts/social-card-template.html around archi-made-easy-workbench.png' },
];

const SETTLE = `(async () => {
  const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  await document.fonts.ready; await frame();
  const a = window.ArchiMadeEasy;
  if (a && a.readerLayout) await a.readerLayout.whenStable().catch(() => {});
  if (a && a.viewerChromeLayout) await a.viewerChromeLayout.whenStable().catch(() => {});
  await frame();
  await new Promise((resolve) => setTimeout(resolve, 250));
  window.scrollTo(0, 0);
  await frame();
})()`;

async function main() {
  const only = process.argv.includes('--only') ? new Set(process.argv[process.argv.indexOf('--only') + 1].split(',')) : null;
  const chrome = findChrome();
  if (!chrome) throw new Error('No Chrome, Chromium or Edge found; set ARCHI_MADE_EASY_CHROME.');
  const browser = new ChromeVisualBrowser(chrome);
  const manifestPath = path.join(assets, 'capture-manifest.json');
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : { images: {} };
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'archi-made-easy-assets-'));
  try {
    const session = await browser.sessionPromise;
    const send = (method, params = {}) => browser.cdp.send(method, params, session);
    const evaluate = async (expression) => {
      const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result?.value;
    };
    await browser.cdp.send('Browser.setDownloadBehavior', { behavior: 'deny' });
    for (const entry of CAPTURES.filter((item) => !only || only.has(item.name))) {
      const [width, height] = entry.viewport;
      const scale = entry.scale ?? 1;
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: false });
      await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }, { name: 'prefers-color-scheme', value: entry.theme ?? 'light' }] });
      let url;
      if (entry.compose) {
        const template = fs.readFileSync(path.join(repoRoot, 'scripts', 'social-card-template.html'), 'utf8');
        const page = path.join(scratch, 'social-card.html');
        fs.writeFileSync(page, template.replace('{{SCREENSHOT}}', () => pathToFileURL(path.join(assets, entry.compose)).href));
        url = pathToFileURL(page).href;
      } else {
        url = `${pathToFileURL(entry.page).href}${entry.theme ? `?theme=${entry.theme}` : ''}${entry.hash ? `#${entry.hash}` : ''}`;
      }
      const loaded = browser.cdp.waitFor('Page.loadEventFired', session);
      await send('Page.navigate', { url });
      await loaded;
      await evaluate(SETTLE);
      if (entry.act) { await evaluate(`(async () => { ${entry.act} })()`); await evaluate(SETTLE); }
      const target = path.join(assets, ...entry.name.split('/'));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      let bytes;
      if (entry.capture === 'share-card') {
        const base64 = await evaluate(`(async () => {
          const started = Date.now();
          const ready = () => ${entry.variant === 'route'
            ? 'ArchiMadeEasy.routeProbe && ArchiMadeEasy.routeProbe.exportSnapshot()'
            : 'ArchiMadeEasy.focus && ArchiMadeEasy.focus.reachabilitySnapshot && ArchiMadeEasy.focus.reachabilitySnapshot()'};
          while (!ready()) { if (Date.now() - started > 10000) throw new Error('no ${entry.variant} to share'); await new Promise((resolve) => setTimeout(resolve, 50)); }
          const blob = await ArchiMadeEasy.exportMenu.shareCard({ variant: ${JSON.stringify(entry.variant)} });
          const data = new Uint8Array(await blob.arrayBuffer());
          let text = ''; for (let i = 0; i < data.length; i += 0x8000) text += String.fromCharCode.apply(null, data.subarray(i, i + 0x8000));
          return btoa(text);
        })()`);
        bytes = Buffer.from(base64, 'base64');
      } else {
        const format = entry.format ?? 'png';
        const params = { format, captureBeyondViewport: entry.capture === 'element', ...(format === 'webp' ? { quality: 90 } : {}) };
        if (entry.capture === 'element') {
          const box = await evaluate(`(() => { const r = document.querySelector('.diagram-container').getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height }; })()`);
          params.clip = { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height), scale: 1 };
        }
        bytes = Buffer.from((await send('Page.captureScreenshot', params)).data, 'base64');
      }
      fs.writeFileSync(target, bytes);
      const errors = await evaluate('window.__assetErrors || []').catch(() => []);
      manifest.images[entry.name] = {
        source: entry.compose ? 'scripts/social-card-template.html' : path.relative(repoRoot, entry.page).split(path.sep).join('/'),
        ...(entry.hash ? { hash: entry.hash } : {}), theme: entry.theme ?? 'page default', viewport: `${width}x${height}`, deviceScaleFactor: scale,
        capture: entry.capture, ...(entry.state ? { state: entry.state } : {}), bytes: bytes.length, ...(errors.length ? { pageErrors: errors } : {}),
      };
      console.log(`${entry.name}: ${bytes.length} bytes`);
    }
  } finally {
    await browser.close();
    fs.rmSync(scratch, { recursive: true, force: true });
  }
  manifest.note = 'Images captured by scripts/capture-docs-assets.mjs from pages this repository renders. Nothing is drawn or edited by hand.';
  manifest.captured = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(manifestPath, `${JSON.stringify({ note: manifest.note, captured: manifest.captured, images: Object.fromEntries(Object.entries(manifest.images).sort(([a], [b]) => (a < b ? -1 : 1))) }, null, 2)}\n`);
}

if (process.argv[1] && sameEntry(process.argv[1], fileURLToPath(import.meta.url)).status === 'match') {
  main().catch((error) => { console.error(error.stack || String(error)); process.exitCode = 1; });
}
