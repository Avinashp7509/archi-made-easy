#!/usr/bin/env node
// Clean-environment acceptance for the release archive (PLAN.md acceptance tests 1 to 3):
// unpack archi-made-easy.zip into an empty folder, install it with the bundled installer
// into a fresh home directory, then, from the installed copy only: doctor; finalize (all
// four gates) on the inherited example; and for every flagship and provider example,
// scaffold, finalize at showcase quality, review, every preset scenario and every export,
// then each page opened offline in a browser with its figures compared with `simulate`.
// Nothing from the source checkout is used after unpacking.
//
//   node scripts/acceptance-clean-install.mjs [--zip <path>] [--agent <id> ...] [--evidence <file>] [--keep]
//
// Exit 0 only if every step passes. Writes a JSON evidence record when --evidence is given.

import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { extractZip } from './release-archive.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function arg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}
const zipPath = path.resolve(arg('--zip', path.join(repoRoot, 'archi-made-easy.zip')));
const evidencePath = arg('--evidence');
const keep = process.argv.includes('--keep');
const agents = process.argv.flatMap((value, index, all) => (value === '--agent' ? [all[index + 1]] : []));
if (agents.length === 0) agents.push('claude-code', 'codex');

export { extractZip };

function run(command, args, options = {}) {
  const started = Date.now();
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 1 << 26, ...options });
  return { status: result.status, stdout: result.stdout || '', stderr: result.stderr || '', ms: Date.now() - started };
}


// ---- acceptance tests 2 and 3: the showcase set, from the installed copy only ---------------
const FLAGSHIPS = ['global-fintech-payment-mesh', 'enterprise-agentic-ai-platform', 'cloud-native-ecommerce-c4'];
const PROVIDER_EXAMPLES = [['azure', 'zero-trust'], ['aws', 'event-driven'], ['gcp', 'microservices'], ['onprem', 'hybrid']];
const EXPORTS = [['mermaid', 'md'], ['drawio', 'drawio'], ['structurizr', 'dsl'], ['rfc', 'md'], ['html', 'html']];
const parsed = (result) => { try { return JSON.parse(result.stdout); } catch { return null; } };

/**
 * For each flagship and each provider example: scaffold (provider examples), finalize at
 * showcase quality, review, every preset scenario and every export format. Then each page
 * is opened with the network switched off and its figures are compared with `simulate`.
 */
async function showcase(skillDir, cli, { env, output }) {
  let passed = true;
  const node = process.execPath;
  const documents = FLAGSHIPS.map((name) => ({ name, input: path.join(skillDir, 'examples', `${name}.architecture.json`) }));
  for (const [provider, pattern] of PROVIDER_EXAMPLES) {
    const name = `${provider}-${pattern}`;
    const input = path.join(output, `${name}.architecture.json`);
    const scaffolded = run(node, [cli, 'scaffold', pattern, '--provider', provider, '--output', `${name}.html`, '--out', input, '--json'], { env, cwd: output });
    const bundled = path.join(skillDir, 'examples', 'providers', `${name}.architecture.json`);
    const same = scaffolded.status === 0 && fs.existsSync(bundled)
      && fs.readFileSync(input, 'utf8').replace(/\r\n/g, '\n') === fs.readFileSync(bundled, 'utf8').replace(/\r\n/g, '\n');
    passed = record(`scaffold ${pattern} on ${provider}`, same, { ms: scaffolded.ms, note: same ? 'equals the bundled provider example' : (scaffolded.stderr.trim() || 'differs from the bundled provider example') }) && passed;
    documents.push({ name, input });
  }

  const pages = [];
  for (const { name, input } of documents) {
    const html = path.join(output, `${name}.html`);
    const finalize = run(node, [cli, 'finalize', 'architecture', input, html, '--quality', 'showcase', '--json'], { env, cwd: output });
    const receipt = parsed(finalize);
    const review = parsed(run(node, [cli, 'review', input, '--json'], { env, cwd: output }));
    const simulated = parsed(run(node, [cli, 'simulate', input, '--scenario', 'all', '--json'], { env, cwd: output }));
    const exports = EXPORTS.map(([format, extension]) => {
      const target = path.join(output, `${name}.export-${format}.${extension}`);
      const result = run(node, [cli, 'export', format, input, target, '--json'], { env, cwd: output });
      return [format, result.status === 0 && fs.existsSync(target) && fs.statSync(target).size > 200];
    });
    const good = finalize.status === 0 && receipt?.ok === true && typeof review?.score === 'number'
      && simulated?.outcomes?.length === 6 && exports.every(([, fine]) => fine);
    passed = record(`showcase document: ${name}`, good, {
      ms: finalize.ms, gates: receipt?.gates ?? null, artifactBytes: fs.existsSync(html) ? fs.statSync(html).size : 0,
      reviewScore: review?.score ?? null, findings: review?.counts ?? null,
      scenarios: simulated?.outcomes?.map((outcome) => `${outcome.scenario}:${outcome.applicable ? 'run' : 'not applicable'}`).join(' ') ?? null,
      exports: Object.fromEntries(exports),
      note: good ? `review ${review.score}/100, ${exports.length} exports` : (finalize.stderr.trim().split('\n').slice(-2).join(' ') || 'finalize, review, simulate or an export failed'),
    }) && passed;
    if (good) pages.push({ name, input, html });
  }

  // The browser tooling comes from the installed copy too.
  const { ChromeVisualBrowser, findChrome } = await import(pathToFileURL(path.join(skillDir, 'bin', 'visual-check.mjs')).href);
  const chrome = findChrome();
  if (!chrome) return record('pages open offline and show the figures of the command line', false, { note: 'no Chrome, Chromium or Edge was found' }) && false;
  const browser = new ChromeVisualBrowser(chrome);
  try {
    const session = await browser.sessionPromise;
    const send = (method, params = {}) => browser.cdp.send(method, params, session);
    await send('Network.enable');
    await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    const evaluate = async (expression) => {
      const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result?.value;
    };
    for (const page of pages) {
      const loaded = browser.cdp.waitFor('Page.loadEventFired', session);
      await send('Page.navigate', { url: pathToFileURL(page.html).href });
      await loaded;
      const shown = await evaluate(`(async () => {
        await document.fonts.ready;
        const w = ArchiMadeEasy.workbench;
        const ribbon = () => [...document.querySelectorAll('#workbench-vitals [data-readout]')].map((e) => e.textContent.replace(/\\s+/g, ' ').trim());
        const healthy = { kpis: JSON.stringify(w.result().kpis), ribbon: ribbon(), on: w.isOn() };
        w.setMode('simulate'); w.chooseScenario('c'); w.run({ instant: true });
        const crowd = { kpis: JSON.stringify(w.result().kpis), ribbon: ribbon() };
        return { healthy, crowd, levels: w.levels().length, remote: performance.getEntriesByType('resource').map((e) => e.name).filter((name) => /^https?:/.test(name)) };
      })()`);
      const cliHealthy = JSON.stringify(parsed(run(node, [cli, 'simulate', page.input, '--json'], { env, cwd: output }))?.result?.kpis);
      const cliCrowd = JSON.stringify(parsed(run(node, [cli, 'simulate', page.input, '--scenario', 'c', '--json'], { env, cwd: output }))?.result?.kpis);
      const equal = shown.healthy.kpis === cliHealthy && shown.crowd.kpis === cliCrowd;
      const fine = equal && shown.healthy.on && shown.healthy.ribbon.length === 6 && shown.remote.length === 0;
      passed = record(`page offline, figures equal the command line: ${page.name}`, fine, {
        ribbonHealthy: shown.healthy.ribbon, ribbonTenTimesLoad: shown.crowd.ribbon, levels: shown.levels, remoteRequests: shown.remote.length,
        note: fine ? `healthy and 10x load equal simulate --json; ${shown.levels} child diagram${shown.levels === 1 ? '' : 's'}`
          : (!equal ? 'the page and the command line disagree' : shown.remote.length ? `the page requested ${shown.remote[0]}` : 'the workbench did not start with six readouts'),
      }) && passed;
    }
  } finally {
    await browser.close();
  }
  return passed;
}

const steps = [];
function record(name, ok, detail = {}) {
  steps.push({ name, ok, ...detail });
  console.log(`${ok ? 'pass' : 'FAIL'}  ${name}${detail.note ? ` - ${detail.note}` : ''}`);
  return ok;
}

const work = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'archi-made-easy-acceptance-')));
const home = path.join(work, 'home');
const release = path.join(work, 'release');
const output = path.join(work, 'output');
for (const dir of [home, release, output]) fs.mkdirSync(dir);
// The skill runs under the user's normal environment (as it would inside an agent), with
// no repository-provided overrides; only the browser path may be set, as a user would.
const runEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('ARCHI_MADE_EASY_') || key === 'ARCHI_MADE_EASY_CHROME'));
runEnv.ARCHI_MADE_EASY_UPDATE_CHECK_DISABLED = '1';
// Installation goes into a fresh, empty home so the test never touches real agent folders.
// (A fake USERPROFILE is used for installing only: Chrome on Windows needs the real one.)
const installEnv = { ...runEnv, HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: '', CODEX_HOME: '', CLAUDE_CONFIG_DIR: '' };
const env = runEnv;

let ok = true;
try {
  const zipBytes = fs.readFileSync(zipPath);
  const files = extractZip(zipBytes, release);
  ok = record('unpack release archive', files.length > 0 && fs.existsSync(path.join(release, 'archi-made-easy', 'SKILL.md')), {
    archive: path.basename(zipPath), sha256: crypto.createHash('sha256').update(zipBytes).digest('hex'), entries: files.length, note: `${files.length} entries`,
  }) && ok;

  const install = run(process.execPath, [path.join(release, 'archi-made-easy', 'install.mjs'), ...agents.flatMap((id) => ['--agent', id]), '--json'], { env: installEnv, cwd: work });
  let installed = [];
  try { installed = JSON.parse(install.stdout).results; } catch { /* reported below */ }
  ok = record('install with the bundled installer', install.status === 0 && installed.length > 0 && installed.every((r) => r.status === 'installed' && r.verify?.ok), {
    agents, targets: installed.map((r) => ({ label: r.label, status: r.status, doctor: r.verify?.ok ?? null })), note: installed.map((r) => r.label).join('; ') || install.stderr.trim(),
  }) && ok;

  for (const target of installed) {
    const cli = path.join(target.dir, 'bin', 'archi-made-easy.mjs');
    const doctor = run(process.execPath, [cli, 'doctor'], { env, cwd: work });
    ok = record(`doctor from installed copy: ${target.label}`, doctor.status === 0, { ms: doctor.ms, note: doctor.stdout.trim().split('\n').pop() }) && ok;
  }

  const first = installed[0];
  if (first) {
    const cli = path.join(first.dir, 'bin', 'archi-made-easy.mjs');
    const example = path.join(first.dir, 'examples', 'web-app.architecture.json');
    const html = path.join(output, 'web-app.html');
    const finalize = run(process.execPath, [cli, 'finalize', 'architecture', example, html, '--quality', 'showcase', '--json'], { env, cwd: output });
    let receipt = null;
    try { receipt = JSON.parse(finalize.stdout); } catch { /* reported below */ }
    ok = record('finalize from installed copy (architecture, showcase)', finalize.status === 0 && receipt?.ok === true, {
      ms: finalize.ms, gates: receipt?.gates ?? null, artifactBytes: fs.existsSync(html) ? fs.statSync(html).size : 0,
      note: receipt ? JSON.stringify(receipt.gates) : finalize.stderr.trim().split('\n').slice(-2).join(' '),
    }) && ok;
    ok = (await showcase(first.dir, cli, { env, output })) && ok;
  }
} catch (error) {
  ok = record('acceptance run', false, { note: error.message });
} finally {
  const evidence = {
    schemaVersion: 1,
    kind: 'clean-install-acceptance',
    date: new Date().toISOString(),
    platform: `${os.platform()} ${os.release()}`,
    node: process.version,
    ok,
    steps,
  };
  if (evidencePath) {
    fs.mkdirSync(path.dirname(path.resolve(evidencePath)), { recursive: true });
    fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  }
  if (!keep) fs.rmSync(work, { recursive: true, force: true });
  else console.log(`kept: ${work}`);
  console.log(ok ? 'clean install acceptance passed' : 'clean install acceptance FAILED');
  process.exitCode = ok ? 0 : 1;
}
