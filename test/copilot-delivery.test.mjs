// Regression tests for the first real Microsoft 365 Copilot Agent Builder run (2026-11-11):
// `check /mnt/data/gcp-million-users.html` returned input/artifact-unreadable, "The artifact is
// not a stable regular file (delivery-artifact-inspection-failed)", and no page was delivered.
//
// The message means the file did not exist. Two causes reproduce it here, and which one occurred
// in Agent Builder is not established (a later v1.0.0 run there did deliver the page):
//   - an error in the generated document: `export html` refuses to write;
//   - an output folder that refuses the engine's hard-link page writer (emulated): `render` and
//     `export html` stop safely and write nothing.
//
// The Copilot Edition's bin/copilot-deliver.mjs renders and checks in a folder where the writer
// works, then delivers the checked bytes with an exclusive create and proves them by SHA-256.
// The restricted folders are emulated (test/helpers/copilot-restricted-fs.mjs); this is not a
// test inside Microsoft's sandbox.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { COPILOT_ZIP } from '../scripts/build-copilot-skill.mjs';
import { extractZip } from '../scripts/release-archive.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const emulator = pathToFileURL(path.join(repoRoot, 'test', 'helpers', 'copilot-restricted-fs.mjs')).href;
const REPORTED = 'Could not read the HTML artifact: The artifact is not a stable regular file (delivery-artifact-inspection-failed).';

let work; let edition; let cli; let deliver; let doc; let reference; let referenceSha;

const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const folder = (name) => { const dir = path.join(work, name); fs.mkdirSync(dir, { recursive: true }); return dir; };
const files = (dir) => fs.readdirSync(dir);

/** Run a skill script with the given folders restricted. */
function run(script, args, { restricted = [], faults = 'nolink,inozero', cwd = work, extraEnv = {} } = {}) {
  const env = {
    ...process.env,
    ARCHI_MADE_EASY_UPDATE_CHECK_DISABLED: '1',
    ARCHI_MADE_EASY_BRAND_CAPTURE_DISABLED: '1',
    ARCHI_FS_RESTRICTED: Array.isArray(restricted) ? restricted.join(path.delimiter) : restricted,
    ARCHI_FS_FAULTS: faults,
    NODE_OPTIONS: `--import=${emulator}`,
    ...extraEnv,
  };
  const result = spawnSync(process.execPath, [script, ...args], { cwd, env, encoding: 'utf8', timeout: 300000 });
  let body = null; try { body = JSON.parse(result.stdout); } catch { /* not JSON */ }
  return { ...result, body };
}
const codes = (result) => (result.body?.diagnostics || []).map((d) => d.code);

before(() => {
  work = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'archi-made-easy-copilot-delivery-')));
  edition = path.join(work, 'skill');
  extractZip(fs.readFileSync(path.join(repoRoot, COPILOT_ZIP)), edition);
  cli = path.join(edition, 'bin', 'archi-made-easy.mjs');
  deliver = path.join(edition, 'bin', 'copilot-deliver.mjs');
  doc = path.join(edition, 'examples', 'web-app.architecture.json');
  // The page an unrestricted render produces: every delivered page must equal it byte for byte.
  reference = path.join(folder('reference'), 'page.html');
  const plain = run(cli, ['render', 'architecture', doc, reference, '--quality', 'showcase']);
  assert.equal(plain.status, 0, plain.stderr);
  referenceSha = sha(reference);
});

after(() => { if (work) fs.rmSync(work, { recursive: true, force: true }); });

describe('the Agent Builder failure, reproduced', () => {
  it('render into a folder without hard links or inode numbers writes nothing, and check then reports the exact Agent Builder error', () => {
    const mnt = folder('mnt-repro');
    const target = path.join(mnt, 'gcp-million-users.html');
    const render = run(cli, ['render', 'architecture', doc, target, '--quality', 'showcase'], { restricted: mnt });
    assert.notEqual(render.status, 0);
    assert.match(`${render.stdout}${render.stderr}`, /output\/target-indeterminate/);
    assert.deepEqual(files(mnt), [], 'the writer must leave nothing behind');
    const check = run(cli, ['check', target, '--json'], { restricted: mnt });
    assert.equal(check.body.ok, false);
    assert.equal(check.body.diagnostics[0].code, 'input/artifact-unreadable');
    assert.equal(check.body.diagnostics[0].message, REPORTED);
  });

  it('an error in the generated document makes export html write nothing on an ordinary folder, and check then reports the same error', () => {
    const out = folder('plain-repro');
    const parsed = JSON.parse(fs.readFileSync(doc, 'utf8'));
    parsed.connections.push({ from: parsed.components[0].id, to: 'no-such-component' });
    const bad = path.join(out, 'candidate.json');
    fs.writeFileSync(bad, JSON.stringify(parsed));
    const target = path.join(out, 'gcp-million-users.html');
    const exported = run(cli, ['export', 'html', bad, target, '--force', '--json']);
    assert.equal(exported.status, 1);
    assert.equal(fs.existsSync(target), false);
    const check = run(cli, ['check', target, '--json']);
    assert.equal(check.body.diagnostics[0].message, REPORTED);
  });
});

describe('copilot-deliver html', () => {
  it('delivers the checked page into a restricted folder, byte-identical to an unrestricted render', () => {
    const mnt = folder('mnt-ok');
    const target = path.join(mnt, 'gcp-million-users.html');
    const result = run(deliver, ['html', doc, target, '--quality', 'showcase', '--json'], { restricted: mnt });
    assert.equal(result.status, 0, result.stdout);
    assert.equal(result.body.ok, true);
    assert.equal(result.body.checks.check, 'passed');
    assert.equal(result.body.artifact.sha256, referenceSha);
    assert.equal(result.body.artifact.sha256, result.body.checks.checkedSha256);
    assert.equal(sha(target), referenceSha);
    assert.deepEqual(files(mnt), ['gcp-million-users.html'], 'no partial files are left');
    assert.match(fs.readFileSync(target, 'utf8'), /archi-made-easy-workbench-data/, 'the interactive workbench is in the page');
  });

  it('finds another working folder when the temporary folder is restricted too', () => {
    const mnt = folder('mnt-tmp'); const tmp = folder('restricted-tmp'); const cwd = folder('cwd-ok');
    const result = run(deliver, ['html', doc, path.join(mnt, 'page.html'), '--json'], {
      restricted: [mnt, tmp], cwd, extraEnv: { TMPDIR: tmp, TEMP: tmp, TMP: tmp },
    });
    assert.equal(result.status, 0, result.stdout);
    assert.equal(sha(path.join(mnt, 'page.html')), referenceSha);
    assert.notEqual(path.resolve(result.body.workFolder), path.resolve(tmp));
  });

  it('delivers nothing and returns a labelled text fallback when no folder can host the page writer', () => {
    const mnt = folder('mnt-none');
    const result = run(deliver, ['html', doc, path.join(mnt, 'page.html'), '--json'], { restricted: '*' });
    assert.equal(result.status, 1);
    assert.equal(result.body.ok, false);
    assert.deepEqual(codes(result), ['copilot/html-unsupported']);
    assert.match(result.body.diagnostics[0].message, /not an interactive workbench/);
    assert.match(result.body.fallback.mermaidMarkdown, /flowchart/);
    assert.ok(result.body.probes.every((probe) => !probe.engineWriter));
    assert.deepEqual(files(mnt), []);
  });

  it('reports a read-only output folder, leaves it untouched and returns the fallback', () => {
    const mnt = folder('mnt-readonly');
    const result = run(deliver, ['html', doc, path.join(mnt, 'page.html'), '--json'], { restricted: mnt, faults: 'readonly' });
    assert.equal(result.status, 1);
    assert.deepEqual(codes(result), ['copilot/destination-not-writable']);
    assert.match(result.body.fallback.mermaidMarkdown, /flowchart/);
    assert.deepEqual(files(mnt), []);
  });

  it('falls back to an exclusive create where rename is refused, and still proves the bytes', () => {
    const mnt = folder('mnt-norename');
    const result = run(deliver, ['html', doc, path.join(mnt, 'page.html'), '--json'], { restricted: mnt, faults: 'nolink,inozero,norename' });
    assert.equal(result.status, 0, result.stdout);
    assert.equal(result.body.artifact.method, 'exclusive-create');
    assert.equal(sha(path.join(mnt, 'page.html')), referenceSha);
    assert.deepEqual(files(mnt), ['page.html']);
  });

  it('never replaces an existing file without --force, and replaces it with --force', () => {
    const mnt = folder('mnt-exists');
    const target = path.join(mnt, 'page.html');
    fs.writeFileSync(target, 'previous');
    const refused = run(deliver, ['html', doc, target, '--json'], { restricted: mnt });
    assert.equal(refused.status, 1);
    assert.deepEqual(codes(refused), ['copilot/destination-exists']);
    assert.equal(fs.readFileSync(target, 'utf8'), 'previous');
    const forced = run(deliver, ['html', doc, target, '--force', '--json'], { restricted: mnt });
    assert.equal(forced.status, 0, forced.stdout);
    assert.equal(sha(target), referenceSha);
  });

  it('rejects unsafe or invalid output paths without writing anything', () => {
    const mnt = folder('mnt-unsafe');
    fs.mkdirSync(path.join(mnt, 'a-folder.html'));
    fs.writeFileSync(path.join(mnt, 'not-a-folder'), 'x');
    for (const [target, code] of [
      [path.join(mnt, 'page.txt'), 'copilot/destination-invalid'],
      [path.join(mnt, 'a-folder.html'), 'copilot/destination-not-file'],
      [path.join(mnt, 'missing', 'page.html'), 'copilot/destination-folder-missing'],
      [path.join(mnt, 'not-a-folder', 'page.html'), 'copilot/destination-folder-missing'],
    ]) {
      const result = run(deliver, ['html', doc, target, '--json'], { restricted: mnt });
      assert.equal(result.status, 1, target);
      assert.deepEqual(codes(result), [code], target);
    }
    assert.deepEqual(files(mnt).sort(), ['a-folder.html', 'not-a-folder']);
  });

  it('refuses to write through a symbolic link', (t) => {
    const mnt = folder('mnt-link');
    const victim = path.join(folder('elsewhere'), 'victim.html');
    fs.writeFileSync(victim, 'keep me');
    try { fs.symlinkSync(victim, path.join(mnt, 'page.html')); } catch (error) { t.skip(`symbolic links unavailable here (${error.code})`); return; }
    for (const extra of [[], ['--force']]) {
      const result = run(deliver, ['html', doc, path.join(mnt, 'page.html'), '--json', ...extra], { restricted: mnt });
      assert.equal(result.status, 1);
      assert.deepEqual(codes(result), ['copilot/destination-is-link']);
    }
    assert.equal(fs.readFileSync(victim, 'utf8'), 'keep me');
  });

  it('returns document errors from validation instead of retrying elsewhere', () => {
    const bad = path.join(folder('bad-doc'), 'bad.json');
    const parsed = JSON.parse(fs.readFileSync(doc, 'utf8'));
    parsed.connections.push({ from: parsed.components[0].id, to: 'no-such-component' });
    fs.writeFileSync(bad, JSON.stringify(parsed));
    const result = run(deliver, ['html', bad, path.join(folder('mnt-bad'), 'page.html'), '--json']);
    assert.equal(result.status, 1);
    assert.equal(result.body.stage, 'validate');
    assert.ok(result.body.diagnostics.length > 0);
  });

  it('reports a missing input document', () => {
    const result = run(deliver, ['html', path.join(work, 'nope.json'), path.join(folder('mnt-in'), 'page.html'), '--json']);
    assert.deepEqual(codes(result), ['copilot/input-missing']);
  });

  it('delivers the other diagram types', () => {
    const mnt = folder('mnt-sequence');
    const input = path.join(edition, 'examples', 'async-job-roundtrip.sequence.json');
    const result = run(deliver, ['html', input, path.join(mnt, 'sequence.html'), '--type', 'sequence', '--json'], { restricted: mnt });
    assert.equal(result.status, 0, result.stdout);
    assert.equal(result.body.checks.check, 'passed');
  });
});

describe('copilot-deliver export and probe', () => {
  it('delivers a Mermaid export into a restricted folder', () => {
    const mnt = folder('mnt-mermaid');
    const result = run(deliver, ['export', 'mermaid', doc, path.join(mnt, 'diagram.md'), '--json'], { restricted: mnt });
    assert.equal(result.status, 0, result.stdout);
    assert.match(fs.readFileSync(path.join(mnt, 'diagram.md'), 'utf8'), /flowchart/);
  });

  it('probes folders and names the ones that cannot host the page writer', () => {
    const mnt = folder('mnt-probe');
    const result = run(deliver, ['probe', mnt, '--json'], { restricted: mnt });
    assert.equal(result.status, 0);
    const probe = result.body.probes.find((p) => path.resolve(p.folder) === path.resolve(mnt));
    assert.equal(probe.createExclusive, true);
    assert.equal(probe.hardLink, false);
    assert.equal(probe.errors.hardLink.systemCode, 'EPERM');
    assert.equal(probe.engineWriter, false);
    assert.ok(result.body.engineWriterFolders.length > 0);
    assert.equal(result.body.environment.node, process.version);
    assert.deepEqual(files(mnt), [], 'the probe removes its own files');
  });
});
