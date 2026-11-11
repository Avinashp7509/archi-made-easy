#!/usr/bin/env node
// The README's demonstration animation: a scripted walkthrough of the bundled examples in
// Chrome, one screenshot per step, encoded as an animated GIF. Every frame is a screenshot of
// a running page; nothing is drawn. No dependency: PNG decoding and GIF encoding are here.
//
//   node scripts/capture-demo-gif.mjs [output.gif]
//
// Writes docs/assets/archi-made-easy-demo.gif by default, and records the steps in
// docs/assets/capture-manifest.json.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ChromeVisualBrowser, findChrome } from '../archi-made-easy/bin/visual-check.mjs';
import { sameEntry } from '../archi-made-easy/renderers/shared/path-semantics.mjs';
import { decodePng } from '../docs/visual-qa/tools/compare-with-upstream.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const example = (name) => pathToFileURL(path.join(repoRoot, 'archi-made-easy', 'examples', name)).href;
const W = 'const w = ArchiMadeEasy.workbench;';
const VIEWPORT = [1280, 800];
const SCALE = 0.75; // frames are 960 x 600

/** Each step: the page, what is done on it, and how long the frame is shown (seconds). */
export const STEPS = [
  { page: example('global-fintech-payment-mesh.html'), theme: 'light', seconds: 3.5, caption: 'A generated architecture, with the workbench frame' },
  { act: `${W} w.setMode('explore'); w.select('pay_a');`, seconds: 3, caption: 'Explore: a component, its inputs tagged authored or assumed' },
  { act: `${W} if (ArchiMadeEasy.focus && ArchiMadeEasy.focus.clear) ArchiMadeEasy.focus.clear({}); w.setMode('review'); w.selectFinding(w.review().findings[0].id);`, seconds: 4, caption: 'Review: a finding, the components it affects and the fix' },
  { act: `${W} w.setMode('simulate'); w.chooseScenario('b');`, seconds: 2.5, caption: 'Simulate: choose a scenario' },
  { act: `${W} w.run({ instant: true });`, seconds: 4, caption: 'Run: region A lost, the failure and the healthy figures side by side' },
  { act: `${W} const option = w.plan() && w.plan().options[0]; if (option) w.chooseOption(option.id);`, seconds: 3.5, caption: 'Recovery options, previewed' },
  { act: `${W} w.reset(); w.setMode('performance'); w.setLoad(10, 0);`, seconds: 3.5, caption: 'Performance at ten times the load' },
  { act: `${W} w.setLoad(1, 0); w.setMode('finops');`, seconds: 3, caption: 'FinOps: modelled monthly cost by component' },
  { page: example('cloud-native-ecommerce-c4.html'), theme: 'light', act: `${W} w.setMode('explore');`, seconds: 3, caption: 'C4: containers that open into component diagrams' },
  { act: `${W} w.openLevel('checkout-service'); await new Promise((resolve, reject) => { const started = Date.now(); (function poll() { const level = w.level(); if (level && level.ready) resolve(); else if (Date.now() - started > 20000) reject(new Error('level not ready')); else setTimeout(poll, 50); })(); }); await new Promise((resolve) => setTimeout(resolve, 900));`, seconds: 4, caption: 'One level down: the checkout service' },
  { page: example('enterprise-agentic-ai-platform.html'), theme: 'dark', act: `${W} w.setMode('handoff');`, seconds: 3.5, caption: 'Hand off: Mermaid, draw.io, Structurizr, a design document' },
];

const SETTLE = `(async () => {
  const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  await document.fonts.ready; await frame();
  const a = window.ArchiMadeEasy;
  if (a && a.readerLayout) await a.readerLayout.whenStable().catch(() => {});
  if (a && a.viewerChromeLayout) await a.viewerChromeLayout.whenStable().catch(() => {});
  await frame(); await new Promise((resolve) => setTimeout(resolve, 300));
})()`;

// ---- GIF encoding -------------------------------------------------------------------------
/** A palette of the most frequent colours (15-bit buckets), and a lookup from bucket to index. */
function palette(image) {
  const counts = new Uint32Array(32768);
  const { data, channels } = image;
  for (let i = 0; i < data.length; i += channels) counts[((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3)] += 1;
  const buckets = [...counts.keys()].filter((key) => counts[key] > 0).sort((a, b) => counts[b] - counts[a]).slice(0, 256);
  const colours = buckets.map((key) => [((key >> 10) & 31) * 8 + 4, ((key >> 5) & 31) * 8 + 4, (key & 31) * 8 + 4]);
  while (colours.length < 256) colours.push([0, 0, 0]);
  const lookup = new Uint8Array(32768);
  for (let key = 0; key < 32768; key += 1) {
    if (!counts[key]) continue;
    const r = ((key >> 10) & 31) * 8 + 4; const g = ((key >> 5) & 31) * 8 + 4; const b = (key & 31) * 8 + 4;
    let best = 0; let distance = Infinity;
    for (let index = 0; index < buckets.length; index += 1) {
      const c = colours[index]; const d = (c[0] - r) ** 2 * 3 + (c[1] - g) ** 2 * 4 + (c[2] - b) ** 2 * 2;
      if (d < distance) { distance = d; best = index; if (d === 0) break; }
    }
    lookup[key] = best;
  }
  return { colours, lookup };
}

/** GIF LZW compression of 8-bit indices, packed into 255-byte sub-blocks. */
function lzw(indices) {
  const minCode = 8; const clear = 256; const end = 257;
  const out = []; let bits = 0; let bitCount = 0;
  let codeSize = minCode + 1; let next = end + 1;
  let table = new Map();
  const emit = (code) => { bits |= code << bitCount; bitCount += codeSize; while (bitCount >= 8) { out.push(bits & 255); bits >>>= 8; bitCount -= 8; } };
  emit(clear);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i += 1) {
    const k = indices[i]; const key = prefix * 256 + k;
    const found = table.get(key);
    if (found !== undefined) { prefix = found; continue; }
    emit(prefix);
    if (next < 4096) { table.set(key, next); next += 1; if (next > (1 << codeSize) && codeSize < 12) codeSize += 1; }
    else { emit(clear); table = new Map(); codeSize = minCode + 1; next = end + 1; }
    prefix = k;
  }
  emit(prefix);
  // A decoder adds its last entry after reading that code; if the table has just reached a
  // power of two, it reads the end code one bit wider.
  if (next === (1 << codeSize) && codeSize < 12) codeSize += 1;
  emit(end);
  if (bitCount > 0) out.push(bits & 255);
  const blocks = [];
  for (let i = 0; i < out.length; i += 255) { const chunk = out.slice(i, i + 255); blocks.push(chunk.length, ...chunk); }
  blocks.push(0);
  return Buffer.from(blocks);
}

function encodeGif(frames) {
  const { width, height } = frames[0].image;
  const parts = [Buffer.from('GIF89a', 'latin1')];
  const screen = Buffer.alloc(7); screen.writeUInt16LE(width, 0); screen.writeUInt16LE(height, 2); screen[4] = 0; parts.push(screen);
  parts.push(Buffer.from([0x21, 0xff, 0x0b, ...Buffer.from('NETSCAPE2.0', 'latin1'), 0x03, 0x01, 0x00, 0x00, 0x00])); // loop forever
  for (const { image, seconds } of frames) {
    const { colours, lookup } = palette(image);
    const indices = new Uint8Array(width * height);
    for (let p = 0, i = 0; p < indices.length; p += 1, i += image.channels) indices[p] = lookup[((image.data[i] >> 3) << 10) | ((image.data[i + 1] >> 3) << 5) | (image.data[i + 2] >> 3)];
    const delay = Math.round(seconds * 100);
    parts.push(Buffer.from([0x21, 0xf9, 0x04, 0x00, delay & 255, delay >> 8, 0x00, 0x00]));
    const descriptor = Buffer.alloc(10); descriptor[0] = 0x2c; descriptor.writeUInt16LE(width, 5); descriptor.writeUInt16LE(height, 7); descriptor[9] = 0x87; // local table, 256 colours
    parts.push(descriptor, Buffer.from(colours.flat()), Buffer.from([8]), lzw(indices));
  }
  parts.push(Buffer.from([0x3b]));
  return Buffer.concat(parts);
}

async function main() {
  const output = path.resolve(process.argv[2] || path.join(repoRoot, 'docs', 'assets', 'archi-made-easy-demo.gif'));
  const chrome = findChrome();
  if (!chrome) throw new Error('No Chrome, Chromium or Edge found; set ARCHI_MADE_EASY_CHROME.');
  const browser = new ChromeVisualBrowser(chrome);
  const frames = [];
  try {
    const session = await browser.sessionPromise;
    const send = (method, params = {}) => browser.cdp.send(method, params, session);
    const evaluate = async (expression) => {
      const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result?.value;
    };
    await send('Emulation.setDeviceMetricsOverride', { width: VIEWPORT[0], height: VIEWPORT[1], deviceScaleFactor: SCALE, mobile: false });
    for (const step of STEPS) {
      if (step.page) {
        await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }, { name: 'prefers-color-scheme', value: step.theme }] });
        const loaded = browser.cdp.waitFor('Page.loadEventFired', session);
        await send('Page.navigate', { url: `${step.page}?theme=${step.theme}` });
        await loaded;
        await evaluate(SETTLE);
      }
      if (step.act) { await evaluate(`(async () => { ${step.act} })()`); await evaluate(SETTLE); }
      const png = Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64');
      frames.push({ image: decodePng(png), seconds: step.seconds, caption: step.caption });
      console.log(`frame ${frames.length}: ${step.caption}`);
    }
  } finally {
    await browser.close();
  }
  const gif = encodeGif(frames);
  fs.writeFileSync(output, gif);
  const total = frames.reduce((sum, frame) => sum + frame.seconds, 0);
  console.log(`${path.relative(repoRoot, output)}: ${frames.length} frames, ${total} s, ${frames[0].image.width}x${frames[0].image.height}, ${gif.length} bytes`);
  const manifestPath = path.join(repoRoot, 'docs', 'assets', 'capture-manifest.json');
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.images[path.basename(output)] = {
      source: 'scripts/capture-demo-gif.mjs', theme: 'light, dark for the last step', viewport: `${VIEWPORT[0]}x${VIEWPORT[1]}`, deviceScaleFactor: SCALE,
      capture: 'animated GIF of viewport screenshots', state: frames.map((frame) => frame.caption).join(' | '), seconds: total, bytes: gif.length,
    };
    manifest.images = Object.fromEntries(Object.entries(manifest.images).sort(([a], [b]) => (a < b ? -1 : 1)));
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }
}

if (process.argv[1] && sameEntry(process.argv[1], fileURLToPath(import.meta.url)).status === 'match') {
  main().catch((error) => { console.error(error.stack || String(error)); process.exitCode = 1; });
}
