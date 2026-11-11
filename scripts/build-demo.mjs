#!/usr/bin/env node
// Build the hosted interactive demo: docs/demo/index.html.
//
// The page is the checkout architecture (scripts/demo/checkout.architecture.json) rendered by
// the skill's own renderer, with a guided layer added (scripts/demo/guided.css and guided.js):
// one question, "what happens if the database fails?", answered by the page's own workbench
// and engine. Nothing in the skill changes. Usage:
//   node scripts/build-demo.mjs           write docs/demo/
//   node scripts/build-demo.mjs --check   exit 1 if docs/demo/ is not what this script builds
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sameEntry } from '../archi-made-easy/renderers/shared/path-semantics.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(repoRoot, 'scripts', 'demo');
const outDir = path.join(repoRoot, 'docs', 'demo');
const SITE = 'https://avinashp7509.github.io/archi-made-easy/demo/';
const TITLE = 'What happens if the database fails? · Archi-Made-Easy demo';
const DESCRIPTION = 'Take down the database of an online shop checkout, see what fails, and compare a standby database. An interactive, modelled architecture, in your browser.';

const escapeAttr = (value) => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function buildDemo() {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'archi-made-easy-demo-'));
  try {
    const rendered = path.join(work, 'index.html');
    const run = spawnSync(process.execPath, [
      path.join(repoRoot, 'archi-made-easy', 'renderers', 'architecture', 'render-architecture.mjs'),
      path.join(source, 'checkout.architecture.json'), rendered,
    ], { encoding: 'utf8' });
    if (run.status !== 0) throw new Error(`render failed: ${run.stderr || run.stdout}`);
    let html = fs.readFileSync(rendered, 'utf8').replace(/\r\n/g, '\n');

    const css = fs.readFileSync(path.join(source, 'guided.css'), 'utf8').replace(/\r\n/g, '\n');
    const js = fs.readFileSync(path.join(source, 'guided.js'), 'utf8').replace(/\r\n/g, '\n');
    // The page must stay one diagram with no way for the layer to end its own element early.
    for (const [name, text] of [['guided.css', css], ['guided.js', js]]) {
      if (/<svg|<\/script|<\/style/i.test(text)) throw new Error(`${name} must not contain <svg, </script or </style`);
    }
    const mark = fs.readFileSync(path.join(repoRoot, 'docs', 'assets', 'archi-made-easy-mark.svg'));
    const head = [
      `<meta name="description" content="${escapeAttr(DESCRIPTION)}">`,
      `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml;base64,${mark.toString('base64')}">`,
      `<link rel="canonical" href="${SITE}">`,
      `<meta property="og:type" content="website">`,
      `<meta property="og:title" content="${escapeAttr(TITLE)}">`,
      `<meta property="og:description" content="${escapeAttr(DESCRIPTION)}">`,
      `<meta property="og:url" content="${SITE}">`,
      `<meta property="og:image" content="${SITE}preview.png">`,
      `<meta name="twitter:card" content="summary_large_image">`,
      `<style id="archi-made-easy-demo-style">\n${css}</style>`,
    ].join('\n');

    if (!/<title>[^<]*<\/title>/.test(html)) throw new Error('rendered page has no <title>');
    html = html.replace(/<title>[^<]*<\/title>/, `<title>${TITLE.replace(/&/g, '&amp;')}</title>`);
    if (!/<html\b[^>]*>/.test(html)) throw new Error('rendered page has no <html> element');
    html = html.replace(/<html\b([^>]*)>/, '<html$1 data-demo="checkout">');
    const headEnd = html.indexOf('</head>');
    html = `${html.slice(0, headEnd)}${head}\n${html.slice(headEnd)}`;
    const bodyEnd = html.lastIndexOf('</body>');
    if (bodyEnd < 0) throw new Error('rendered page has no </body>');
    html = `${html.slice(0, bodyEnd)}<script id="archi-made-easy-demo-script">\n${js}</script>\n${html.slice(bodyEnd)}`;

    return {
      'index.html': html,
      'checkout.architecture.json': fs.readFileSync(path.join(source, 'checkout.architecture.json'), 'utf8').replace(/\r\n/g, '\n'),
    };
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

if (process.argv[1] && sameEntry(process.argv[1], fileURLToPath(import.meta.url)).status === 'match') {
  const files = buildDemo();
  if (process.argv.includes('--check')) {
    const stale = Object.entries(files).filter(([name, text]) => {
      const file = path.join(outDir, name);
      return !fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== text;
    }).map(([name]) => name);
    if (stale.length) { console.error(`docs/demo is out of date: ${stale.join(', ')}. Run node scripts/build-demo.mjs`); process.exit(1); }
    console.log('docs/demo is up to date');
  } else {
    fs.mkdirSync(outDir, { recursive: true });
    for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(outDir, name), text);
    console.log(`wrote docs/demo/ (${Object.keys(files).join(', ')}; index.html ${Buffer.byteLength(files['index.html'])} bytes)`);
  }
}
