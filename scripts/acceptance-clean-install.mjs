#!/usr/bin/env node
// Clean-environment acceptance for the release archive (PLAN.md acceptance tests 1 and 2):
// unpack archi-made-easy.zip into an empty folder, install it with the bundled installer
// into a fresh home directory, then run doctor and a full finalize (all four gates)
// from the installed copy only. Nothing from the source checkout is used after unpacking.
//
//   node scripts/acceptance-clean-install.mjs [--zip <path>] [--agent <id> ...] [--evidence <file>] [--keep]
//
// Exit 0 only if every step passes. Writes a JSON evidence record when --evidence is given.

import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

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

/** Minimal reader for the stored/deflated archives written by scripts/write-deterministic-zip.mjs. */
export function extractZip(buffer, destination) {
  const eocd = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error('not a zip archive (no end of central directory)');
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const root = path.resolve(destination);
  const files = [];
  for (let i = 0; i < count; i += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('corrupt central directory');
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);
    offset += 46 + nameLength + extraLength + commentLength;
    // Entry names are portable logical paths: validate them lexically, never by native prefix.
    const segments = name.replace(/\/$/, '').split('/');
    if (/^[\\/]|^[A-Za-z]:|\\/.test(name) || segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
      throw new Error(`unsafe entry path: ${name}`);
    }
    const target = path.join(root, ...segments);
    if (name.endsWith('/')) { fs.mkdirSync(target, { recursive: true }); continue; }
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const data = buffer.subarray(start, start + compressedSize);
    const bytes = method === 0 ? data : method === 8 ? zlib.inflateRawSync(data) : null;
    if (!bytes) throw new Error(`unsupported compression method ${method} for ${name}`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
    files.push(name);
  }
  return files;
}

function run(command, args, options = {}) {
  const started = Date.now();
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 1 << 26, ...options });
  return { status: result.status, stdout: result.stdout || '', stderr: result.stderr || '', ms: Date.now() - started };
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
