// The Microsoft 365 Copilot Edition (archi-made-easy-copilot.zip) is a repackaging of the Full
// Edition for Agent Builder. These tests prove, from the committed ZIP itself:
//   - it is exactly what scripts/build-copilot-skill.mjs stages from the tracked sources;
//   - it meets Agent Builder's published package rules;
//   - the engine runs from the unpacked ZIP with no network, for every command the edition's
//     SKILL.md tells the agent to use, and renders pages byte-identical to the Full Edition's;
//   - hostile text is escaped in the page.
// They do not (and cannot) prove behaviour inside Microsoft's sandbox.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { AGENT_BUILDER_RULES, COPILOT_ZIP, checkAgentBuilderRules, verifyCopilotZip } from '../scripts/build-copilot-skill.mjs';
import { importClosure } from '../scripts/copilot-edition/import-closure.mjs';
import { extractZip } from '../scripts/release-archive.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const zipPath = path.join(repoRoot, COPILOT_ZIP);
const fullCli = path.join(repoRoot, 'archi-made-easy', 'bin', 'archi-made-easy.mjs');

let work; let edition; let cli; let noNet; let env;

before(() => {
  work = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'archi-made-easy-copilot-test-')));
  edition = path.join(work, 'skill');
  extractZip(fs.readFileSync(zipPath), edition);
  cli = path.join(edition, 'bin', 'archi-made-easy.mjs');
  // Any attempt to reach the network fails loudly, as it would in the Agent Builder sandbox.
  noNet = path.join(work, 'no-network.mjs');
  fs.writeFileSync(noNet, [
    "import net from 'node:net'; import dns from 'node:dns'; import http from 'node:http'; import https from 'node:https';",
    'const deny = (what) => () => { throw new Error(`network blocked: ${what}`); };',
    "net.connect = net.createConnection = deny('net.connect'); net.Socket.prototype.connect = deny('socket.connect');",
    "dns.lookup = deny('dns.lookup'); dns.resolve = deny('dns.resolve'); dns.promises.lookup = deny('dns.promises.lookup');",
    "http.request = http.get = deny('http.request'); https.request = https.get = deny('https.request');",
    "globalThis.fetch = deny('fetch');",
  ].join('\n'));
  env = {
    ...process.env,
    NODE_OPTIONS: `--import=${pathToFileURL(noNet).href}`,
    ARCHI_MADE_EASY_UPDATE_CHECK_DISABLED: '1',
    ARCHI_MADE_EASY_BRAND_CAPTURE_DISABLED: '1',
  };
});

after(() => { if (work) fs.rmSync(work, { recursive: true, force: true }); });

const run = (args, cwd, script = cli) => spawnSync(process.execPath, [script, ...args], { cwd, env, encoding: 'utf8', timeout: 120000 });
const json = (result) => { try { return JSON.parse(result.stdout); } catch { return null; } };
const okJson = (result, label) => {
  const body = json(result);
  assert.equal(result.status, 0, `${label} exited ${result.status}: ${result.stdout.slice(0, 600)}${result.stderr.slice(0, 600)}`);
  assert.equal(body?.ok, true, `${label} did not report ok`);
  return body;
};

describe('Copilot Edition package', () => {
  it('is exactly the build of the tracked sources and meets the Agent Builder package rules', () => {
    const report = verifyCopilotZip(zipPath);
    assert.deepEqual({ missing: report.missing, extra: report.extra, differ: report.differ }, { missing: [], extra: [], differ: [] },
      `${COPILOT_ZIP} is stale: run scripts/build-copilot-skill.mjs with Node 22 and commit the result`);
    assert.deepEqual(report.rules.problems, []);
    assert.ok(report.bytes < AGENT_BUILDER_RULES.maxZipBytes);
    assert.ok(report.rules.facts.maxDepth <= AGENT_BUILDER_RULES.maxDepth);
    assert.ok(report.rules.facts.files <= AGENT_BUILDER_RULES.maxFiles);
    // Downloads point at one published release asset, never at a repository file. The README moves
    // to a new edition version only after that release is verified; until then it describes the
    // previous release, so its package facts are checked only when it names this edition version.
    const readme = fs.readFileSync(path.join(repoRoot, 'README.md'), 'utf8');
    const version = fs.readFileSync(path.join(repoRoot, 'editions', 'copilot', 'SKILL.md'), 'utf8').match(/^ {2}version: "([^"]+)"$/m)?.[1];
    const downloads = [...readme.matchAll(/(?:\]\(|href=")([^)"\s]*archi-made-easy-copilot\.zip)(?=[)"])/g)].map((match) => match[1]);
    assert.ok(downloads.length >= 2, 'README should offer the Copilot download near the top and in its section');
    const linked = [...new Set(downloads)];
    assert.equal(linked.length, 1, 'README Copilot download links must all name one release');
    const linkedVersion = linked[0].match(/^https:\/\/github\.com\/Avinashp7509\/archi-made-easy\/releases\/download\/copilot-v(\d+\.\d+\.\d+)\/archi-made-easy-copilot\.zip$/)?.[1];
    assert.ok(linkedVersion, `README Copilot download must be a release asset URL: ${linked[0]}`);
    const order = (v) => v.split('.').map(Number).reduce((total, part) => total * 1000 + part, 0);
    assert.ok(order(linkedVersion) <= order(version), 'README cannot link a release newer than the edition');
    if (linkedVersion === version) {
      assert.ok(readme.includes(`\`${report.sha256}\``), 'README SHA-256 does not match the committed ZIP');
      assert.ok(readme.includes(`| ZIP size | ${report.bytes.toLocaleString('en-US')} bytes`), 'README ZIP size does not match');
      assert.ok(readme.includes(`| Files | ${report.rules.facts.files} (limit`), 'README file count does not match');
      assert.ok(readme.includes(`${report.rules.facts.skillMdChars.toLocaleString('en-US')} characters`), 'README SKILL.md length does not match');
    }
  });

  it('has SKILL.md at the root with Agent Builder metadata and no link to a missing file', () => {
    const skill = fs.readFileSync(path.join(edition, 'SKILL.md'), 'utf8');
    assert.match(skill, /^---\nname: archi-made-easy\ndescription: "[^"\n]{1,1024}"\n/);
    assert.ok(skill.length < AGENT_BUILDER_RULES.maxInstructionChars);
    for (const [, target] of skill.matchAll(/\]\(([^)#]+)\)/g)) {
      assert.ok(fs.existsSync(path.join(edition, target)), `SKILL.md links to missing ${target}`);
    }
    assert.equal(fs.readFileSync(path.join(edition, 'SKILL.md'), 'utf8'), fs.readFileSync(path.join(repoRoot, 'editions', 'copilot', 'SKILL.md'), 'utf8'));
  });

  it('keeps the licence and notices under accepted file names, with the Full Edition text', () => {
    for (const [full, copilot] of [['NOTICE', 'NOTICE.txt'], ['LICENSE', 'LICENSE.txt'], ['LICENSE-MIT', 'LICENSE-MIT.txt'], ['THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_NOTICES.md']]) {
      assert.equal(fs.readFileSync(path.join(edition, copilot), 'utf8'), fs.readFileSync(path.join(repoRoot, 'archi-made-easy', full), 'utf8'), copilot);
    }
    assert.equal(checkAgentBuilderRules(edition).ok, true);
  });

  it('is dependency-complete: only the explainer page renderer, which this edition leaves out, has unresolved imports', () => {
    const walk = (dir, base = dir) => fs.readdirSync(dir, { withFileTypes: true })
      .flatMap((entry) => (entry.isDirectory() ? walk(path.join(dir, entry.name), base) : [path.relative(base, path.join(dir, entry.name)).split(path.sep).join('/')]));
    const scripts = walk(edition).filter((rel) => /\.(mjs|js|cjs)$/.test(rel));
    const { missing } = importClosure(edition, scripts);
    const unexpected = missing.filter(({ from, to }) => !(['explainer/charts.mjs', 'explainer/render.mjs'].includes(from) && (to.startsWith('explainer/vendor/') || to === 'explainer/reader.css')));
    assert.deepEqual(unexpected, []);
  });
});

describe('Copilot Edition engine, offline from the unpacked ZIP', () => {
  it('runs the SKILL.md architecture flow: scaffold, validate, page, check, review, simulate, exports', () => {
    const cwd = fs.mkdtempSync(path.join(work, 'flow-'));
    okJson(run(['scaffold', '--list', '--json'], cwd), 'scaffold --list');
    okJson(run(['scaffold', 'web-ha', '--provider', 'azure', '--title', 'Highly available shop on Azure', '--output', 'shop.html', '--out', 'candidate.json', '--json'], cwd), 'scaffold');
    okJson(run(['validate', 'architecture', 'candidate.json', '--quality', 'showcase', '--json'], cwd), 'validate');
    // SKILL.md step 4: the delivery adapter validates, renders, checks and delivers the page.
    const deliver = path.join(edition, 'bin', 'copilot-deliver.mjs');
    const out = fs.mkdtempSync(path.join(work, 'out-'));
    const delivered = okJson(run(['html', 'candidate.json', path.join(out, 'shop.html'), '--quality', 'showcase', '--force', '--json'], cwd, deliver), 'copilot-deliver html');
    assert.equal(delivered.checks.check, 'passed');
    okJson(run(['check', path.join(out, 'shop.html'), '--json'], cwd), 'check on the delivered page');
    const page = fs.readFileSync(path.join(out, 'shop.html'), 'utf8');
    assert.match(page, /archi-made-easy-workbench-data/, 'the page carries the workbench model');
    const review = okJson(run(['review', 'candidate.json', '--json'], cwd), 'review');
    assert.ok(JSON.stringify(review).length > 200);
    okJson(run(['simulate', 'candidate.json', '--scenario', 'all', '--json'], cwd), 'simulate all');
    okJson(run(['simulate', 'candidate.json', '--multiplier', '20', '--json'], cwd), 'simulate surge');
    okJson(run(['simulate', 'candidate.json', '--fmea', '--json'], cwd), 'fmea');
    okJson(run(['simulate', 'candidate.json', '--cost', '--json'], cwd), 'cost');
    for (const format of ['mermaid', 'drawio', 'structurizr', 'rfc']) {
      okJson(run(['export', format, 'candidate.json', path.join(out, `out.${format}`), '--force', '--json'], cwd, deliver), `copilot-deliver export ${format}`);
      assert.ok(fs.statSync(path.join(out, `out.${format}`)).size > 100, `${format} export is empty`);
    }
    okJson(run(['guide', 'what happens if our payment database fails', '--json'], cwd), 'guide');
  });

  it('validates and renders every other diagram type, and compares two architectures', () => {
    const cwd = fs.mkdtempSync(path.join(work, 'types-'));
    const examples = path.join(edition, 'examples');
    for (const [type, file] of [['workflow', 'incident-response.workflow.json'], ['sequence', 'async-job-roundtrip.sequence.json'], ['dataflow', 'event-stream.dataflow.json'],
      ['lifecycle', 'agent-run.lifecycle.json'], ['erd', 'orders.erd.json'], ['class', 'payments.class.json'], ['tree', 'payment-platform.tree.json'],
      ['timeline', 'payment-incident.timeline.json'], ['waterfall', 'checkout-request.waterfall.json']]) {
      okJson(run(['validate', type, path.join(examples, file), '--json'], cwd), `validate ${type}`);
      const out = path.join(cwd, `${type}.html`);
      const render = run(['render', type, path.join(examples, file), out], cwd);
      assert.equal(render.status, 0, `render ${type}: ${render.stderr.slice(0, 600)}`);
      okJson(run(['check', out, '--json'], cwd), `check ${type}`);
    }
    okJson(run(['compare', 'architecture', path.join(examples, 'checkout-platform.base.architecture.json'), path.join(examples, 'checkout-platform.head.architecture.json'), path.join(cwd, 'compare.html'), '--json'], cwd), 'compare');
  });

  it('renders pages byte-identical to the Full Edition', () => {
    const cwd = fs.mkdtempSync(path.join(work, 'same-'));
    for (const [type, file] of [['architecture', 'global-fintech-payment-mesh.architecture.json'], ['architecture', 'web-app.architecture.json'], ['sequence', 'async-job-roundtrip.sequence.json']]) {
      const input = path.join(repoRoot, 'archi-made-easy', 'examples', file);
      const fromEdition = path.join(cwd, `copilot-${file}.html`); const fromFull = path.join(cwd, `full-${file}.html`);
      assert.equal(run(['render', type, input, fromEdition], cwd).status, 0);
      assert.equal(run(['render', type, input, fromFull], cwd, fullCli).status, 0);
      assert.ok(fs.readFileSync(fromEdition).equals(fs.readFileSync(fromFull)), `${file} renders differently in the Copilot Edition`);
    }
  });

  it('escapes hostile text from the user in the page', () => {
    const cwd = fs.mkdtempSync(path.join(work, 'escape-'));
    const doc = JSON.parse(fs.readFileSync(path.join(edition, 'examples', 'web-app.architecture.json'), 'utf8'));
    const hostile = '</script><img src=x onerror=alert(1)>';
    doc.meta.title = `Shop ${hostile}`;
    doc.components[0].label = '<img src=y>';
    fs.writeFileSync(path.join(cwd, 'hostile.json'), JSON.stringify(doc));
    const render = run(['render', 'architecture', 'hostile.json', 'hostile.html'], cwd);
    assert.equal(render.status, 0, render.stderr.slice(0, 600));
    const page = fs.readFileSync(path.join(cwd, 'hostile.html'), 'utf8');
    assert.ok(!page.includes('<img src=x onerror=alert(1)>'), 'hostile title reached the page unescaped');
    assert.ok(!page.includes('<img src=y>'), 'hostile label reached the page unescaped');
    assert.ok(page.includes('&lt;img src=y&gt;'), 'the label is shown as text');
  });
});
