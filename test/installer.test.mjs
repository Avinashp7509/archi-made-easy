import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const installer = path.join(repoRoot, 'archi-made-easy', 'install.mjs');
const { agentTable, INSTALL_MARKER, SKILL_NAME } = await import(new URL('../archi-made-easy/install.mjs', import.meta.url));

function sandbox(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'archi-made-easy-install-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  fs.mkdirSync(home);
  const env = { ...process.env, HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: '', CODEX_HOME: '', CLAUDE_CONFIG_DIR: '' };
  const run = (...args) => {
    const result = spawnSync(process.execPath, [installer, ...args], { encoding: 'utf8', env, cwd: root });
    return { ...result, json: (() => { try { return JSON.parse(result.stdout); } catch { return null; } })() };
  };
  return { root, home, env, run };
}

test('every supported agent installs globally into its documented folder and passes doctor', (t) => {
  const { home, run } = sandbox(t);
  const table = agentTable({}, home);
  const agents = Object.keys(table);
  const result = run(...agents.flatMap((id) => ['--agent', id]), '--json');
  assert.equal(result.status, 0, result.stdout + result.stderr);
  for (const id of agents) {
    const dir = path.join(table[id].global, SKILL_NAME);
    const record = result.json.results.find((r) => path.resolve(r.dir) === path.resolve(dir));
    assert.ok(record, `${id}: no result for ${dir}`);
    assert.equal(record.status, 'installed', id);
    assert.equal(record.verify.ok, true, `${id}: ${record.verify.output}`);
    assert.ok(fs.existsSync(path.join(dir, 'SKILL.md')), `${id}: SKILL.md`);
    assert.ok(fs.existsSync(path.join(dir, 'bin', `${SKILL_NAME}.mjs`)), `${id}: CLI`);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, INSTALL_MARKER), 'utf8')).skill, SKILL_NAME);
    assert.equal(fs.existsSync(path.join(dir, 'node_modules')), false, `${id}: no development dependencies`);
  }
});

test('agents sharing a project folder get one install', (t) => {
  const { root, run } = sandbox(t);
  const project = path.join(root, 'project');
  fs.mkdirSync(project);
  const result = run('--agent', 'cursor', '--agent', 'codex', '--agent', 'claude-code', '--project', project, '--no-verify', '--json');
  assert.equal(result.status, 0, result.stderr);
  const dirs = result.json.results.map((r) => path.relative(project, r.dir).split(path.sep).join('/')).sort();
  assert.deepEqual(dirs, ['.agents/skills/archi-made-easy', '.claude/skills/archi-made-easy']);
  assert.match(result.json.results.find((r) => r.dir.includes('.agents')).label, /Cursor.*OpenAI Codex|OpenAI Codex.*Cursor/);
});

test('an unmanaged existing folder is never modified', (t) => {
  const { root, run } = sandbox(t);
  const dest = path.join(root, 'skills');
  const existing = path.join(dest, SKILL_NAME);
  fs.mkdirSync(existing, { recursive: true });
  fs.writeFileSync(path.join(existing, 'mine.txt'), 'user file');
  for (const args of [['--dest', dest], ['--dest', dest, '--replace'], ['--dest', dest, '--uninstall']]) {
    const result = run(...args, '--no-verify', '--json');
    assert.equal(result.status, 1, args.join(' '));
    assert.equal(result.json.results[0].status, 'refused');
    assert.deepEqual(fs.readdirSync(existing), ['mine.txt']);
  }
});

test('managed installs replace only with --replace, and uninstall cleanly', (t) => {
  const { root, run } = sandbox(t);
  const dest = path.join(root, 'skills');
  assert.equal(run('--dest', dest, '--no-verify').status, 0);
  const again = run('--dest', dest, '--no-verify', '--json');
  assert.equal(again.status, 1);
  assert.match(again.json.results[0].reason, /--replace/);
  const replaced = run('--dest', dest, '--replace', '--no-verify', '--json');
  assert.equal(replaced.json.results[0].status, 'replaced');
  assert.equal(fs.readdirSync(dest).filter((name) => name.includes('.installing-')).length, 0, 'no staging folder left');
  const removed = run('--dest', dest, '--uninstall', '--json');
  assert.equal(removed.json.results[0].status, 'removed');
  assert.equal(fs.existsSync(path.join(dest, SKILL_NAME)), false);
});

test('dry run writes nothing and unknown agents are rejected', (t) => {
  const { root, run } = sandbox(t);
  const dest = path.join(root, 'skills');
  const dry = run('--dest', dest, '--dry-run', '--json');
  assert.equal(dry.status, 0);
  assert.equal(dry.json.results[0].status, 'would-install');
  assert.equal(fs.existsSync(dest), false);
  const unknown = run('--agent', 'not-an-agent');
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /unknown agent "not-an-agent"/);
  assert.match(unknown.stderr, /--dest/);
});

test('installer exclusions match the release packager', async () => {
  const installerModule = await import(new URL('../archi-made-easy/install.mjs', import.meta.url));
  const stager = fs.readFileSync(path.join(repoRoot, 'scripts', 'stage-clean-skill.mjs'), 'utf8');
  const block = (name) => [...stager.match(new RegExp('const ' + name + ' = new Set\\(\\[([\\s\\S]*?)\\]\\)'))[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const packagerFiles = block('EXCLUDED_FILES').map((file) => file.replace(/^archi-made-easy\//, ''));
  assert.deepEqual([...installerModule.EXCLUDED_FILES].sort(), packagerFiles.sort());
  const installerSegments = [...installerModule.EXCLUDED_SEGMENTS].filter((s) => s !== installerModule.INSTALL_MARKER);
  assert.deepEqual(installerSegments.sort(), block('EXCLUDED_SEGMENTS').sort());
});

test('a source-checkout install ships exactly what a release ships', (t) => {
  const { root, run } = sandbox(t);
  const dest = path.join(root, 'skills');
  assert.equal(run('--dest', dest, '--no-verify').status, 0);
  const installed = path.join(dest, SKILL_NAME);
  for (const excluded of ['package-lock.json', 'node_modules', 'scripts/generate-validators.mjs', 'scripts/generate-brand-marks.mjs']) {
    assert.equal(fs.existsSync(path.join(installed, excluded)), false, excluded);
  }
});
