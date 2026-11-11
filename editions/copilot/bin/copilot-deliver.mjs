#!/usr/bin/env node
// Microsoft 365 Copilot Edition: render, check and deliver files where the sandbox's output
// folder cannot host the engine's atomic writer.
//
// Why this exists. The engine publishes every HTML page with a no-clobber hard link and checks
// each file's inode and link count, so that a page is never half-written or swapped. Mounted
// sandbox folders (such as /mnt/data in a code-interpreter container) may refuse hard links or
// report no inode numbers. There, `render` and `export html` fail safely and write nothing, and a
// later `check` on that path reports "not a stable regular file" because the file does not exist.
//
// What this adapter does, without weakening any engine check:
//   1. finds a private working folder where the engine's own writer works (probing it first);
//   2. runs the unchanged engine there: validate, render, then check on the rendered page;
//   3. copies the checked bytes to the requested path with an exclusive, no-follow create and a
//      rename (or, where rename is refused, a direct exclusive create), never following or
//      replacing a symbolic link, and never replacing a file without --force;
//   4. reads the delivered file back and proves it is byte-identical (SHA-256) to the checked page.
// If no folder can host the writer, it delivers nothing, says so, and returns text fallbacks.
//
// Usage:
//   node bin/copilot-deliver.mjs probe [folder…] [--json]
//   node bin/copilot-deliver.mjs html <diagram.json> <output.html> [--type architecture] [--quality showcase|standard] [--force] [--json]
//   node bin/copilot-deliver.mjs export <mermaid|drawio|structurizr|rfc> <architecture.json> <output> [--force] [--json]
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(SKILL_DIR, 'bin', 'archi-made-easy.mjs');
const TYPES = ['architecture', 'workflow', 'sequence', 'dataflow', 'lifecycle', 'erd', 'class', 'tree', 'timeline', 'waterfall'];
const EXPORTS = ['mermaid', 'drawio', 'structurizr', 'rfc'];
const POSIX = process.platform !== 'win32';
const NOFOLLOW = POSIX ? (fs.constants.O_NOFOLLOW || 0) : 0;
const COMMAND_TIMEOUT_MS = 180000;

const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const errorInfo = (error) => ({ systemCode: error?.code ?? 'unknown', syscall: error?.syscall, message: String(error?.message ?? error).slice(0, 300) });
const diag = (code, message, evidence = {}) => ({ code, severity: 'error', message, evidence });
const unique = (items) => [...new Set(items.filter(Boolean).map((item) => path.resolve(item)))];

// ---------------------------------------------------------------- filesystem capability probe

/** Probe what one folder supports. Creates and removes only its own uniquely named files. */
export function probeFolder(folder) {
  const result = { folder: path.resolve(folder), exists: false };
  let info;
  try { info = fs.lstatSync(result.folder); } catch (error) { return { ...result, error: errorInfo(error) }; }
  result.exists = true;
  result.symbolicLink = info.isSymbolicLink();
  try { result.directory = fs.statSync(result.folder).isDirectory(); } catch (error) { return { ...result, directory: false, error: errorInfo(error) }; }
  if (!result.directory) return result;
  const tag = `.archi-made-easy-probe-${process.pid}-${crypto.randomBytes(6).toString('hex')}`;
  const first = path.join(result.folder, `${tag}-a`); const second = path.join(result.folder, `${tag}-b`); const third = path.join(result.folder, `${tag}-c`);
  const step = (name, run) => { try { result[name] = run() ?? true; } catch (error) { result[name] = false; (result.errors ||= {})[name] = errorInfo(error); } return result[name]; };
  try {
    if (!step('createExclusive', () => {
      const fd = fs.openSync(first, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | NOFOLLOW, 0o600);
      try { fs.writeSync(fd, 'probe'); } finally { fs.closeSync(fd); }
    })) return result;
    step('fileSync', () => { const fd = fs.openSync(first, fs.constants.O_RDONLY); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); } });
    step('inodeNumbers', () => { const ino = fs.lstatSync(first, { bigint: true }).ino; if (ino === 0n) throw Object.assign(new Error('inode number is 0'), { code: 'ENOINODE' }); });
    step('hardLink', () => fs.linkSync(first, second));
    if (result.hardLink) step('linkCount', () => { const n = fs.lstatSync(first).nlink; if (n !== 2) throw Object.assign(new Error(`link count ${n}, expected 2`), { code: 'ENLINK' }); });
    step('rename', () => fs.renameSync(first, third));
    if (POSIX) step('directorySync', () => { const fd = fs.openSync(result.folder, fs.constants.O_RDONLY); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); } });
  } finally {
    for (const file of [first, second, third]) { try { fs.unlinkSync(file); } catch { /* not created */ } }
  }
  result.engineWriter = Boolean(result.createExclusive && result.inodeNumbers && result.hardLink && result.linkCount && result.rename && (!POSIX || result.directorySync));
  return result;
}

function workFolderCandidates() {
  return unique([process.env.ARCHI_MADE_EASY_WORK_DIR, os.tmpdir(), POSIX && '/tmp', POSIX && '/dev/shm', POSIX && '/var/tmp', process.cwd(), os.homedir()]);
}

function environmentFacts() {
  return { node: process.version, platform: process.platform, arch: process.arch, cwd: process.cwd(), tmpdir: os.tmpdir(), home: os.homedir() };
}

// ---------------------------------------------------------------- engine runs

function engine(args, workFolder) {
  const env = {
    ...process.env,
    ARCHI_MADE_EASY_UPDATE_CHECK_DISABLED: '1',
    ARCHI_MADE_EASY_BRAND_CAPTURE_DISABLED: '1',
    // validate renders a trial page in the temporary folder: keep it in the probed work folder.
    TMPDIR: workFolder, TMP: workFolder, TEMP: workFolder,
  };
  const run = spawnSync(process.execPath, [CLI, ...args], { cwd: workFolder, env, encoding: 'utf8', timeout: COMMAND_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 });
  let body = null; try { body = JSON.parse(run.stdout); } catch { /* not JSON */ }
  return { status: run.status, body, stdout: run.stdout || '', stderr: run.stderr || '', error: run.error };
}

const engineDiagnostics = (result) => (result.body?.diagnostics || []).filter((d) => d.severity === 'error')
  .map((d) => ({ code: d.code, message: String(d.message).slice(0, 1200), ...(d.supportedFixes ? { supportedFixes: d.supportedFixes } : {}) }));

/** True when a failed run was refused by the output writer (the folder), not by the document. */
const writerRefused = (result) => /\[?output\/(target|parent|publication|candidate|recovery)[\w-]*/.test(`${result.stdout}\n${result.stderr}`)
  || /Output target stability could not be determined/.test(`${result.stdout}\n${result.stderr}`);

// ---------------------------------------------------------------- safe delivery

/** Resolve and vet a delivery path. Never follows or replaces a symbolic link. */
export function vetDestination(requested, { force = false, extensions = null } = {}) {
  if (typeof requested !== 'string' || !requested.trim()) return { problem: diag('copilot/destination-invalid', 'No output path was given.') };
  if (requested.includes('\0')) return { problem: diag('copilot/destination-invalid', 'The output path contains a NUL character.') };
  const absolute = path.resolve(requested);
  const name = path.basename(absolute);
  if (!name || name === '.' || name === '..') return { problem: diag('copilot/destination-invalid', 'The output path must name a file.', { path: absolute }) };
  if (extensions && !extensions.includes(path.extname(name).toLowerCase())) {
    return { problem: diag('copilot/destination-invalid', `The output file must end in ${extensions.join(' or ')}.`, { path: absolute }) };
  }
  let parent;
  try {
    if (!fs.statSync(path.dirname(absolute)).isDirectory()) throw Object.assign(new Error('not a directory'), { code: 'ENOTDIR' });
    parent = fs.realpathSync(path.dirname(absolute));
  } catch (error) {
    return { problem: diag('copilot/destination-folder-missing', `The output folder ${path.dirname(absolute)} does not exist or is not a folder.`, errorInfo(error)) };
  }
  const target = path.join(parent, name);
  let existing = null;
  try { existing = fs.lstatSync(target); } catch (error) {
    if (error.code !== 'ENOENT') return { problem: diag('copilot/destination-unreadable', `Cannot inspect ${target}.`, errorInfo(error)) };
  }
  if (existing?.isSymbolicLink()) return { problem: diag('copilot/destination-is-link', `${target} is a symbolic link; refusing to write through it.`, { path: target }) };
  if (existing && !existing.isFile()) return { problem: diag('copilot/destination-not-file', `${target} exists and is not a regular file.`, { path: target }) };
  if (existing && !force) return { problem: diag('copilot/destination-exists', `${target} already exists; pass --force to replace it.`, { path: target }) };
  return { target, parent, replaces: Boolean(existing) };
}

function writeAll(fd, buffer) {
  let offset = 0;
  while (offset < buffer.byteLength) {
    const wrote = fs.writeSync(fd, buffer, offset, buffer.byteLength - offset);
    if (wrote <= 0) throw Object.assign(new Error('short write'), { code: 'EIO', syscall: 'write' });
    offset += wrote;
  }
}

function createExclusive(file, buffer) {
  const fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | NOFOLLOW, 0o644);
  let syncError = null;
  try {
    writeAll(fd, buffer);
    try { fs.fsyncSync(fd); } catch (error) { syncError = error; } // some mounts refuse fsync; the read-back below still verifies the bytes
  } finally { fs.closeSync(fd); }
  return syncError;
}

/** Write `buffer` to a vetted destination and prove the result. */
export function deliverBytes(buffer, destination) {
  const { target, parent } = destination;
  const expected = sha256(buffer);
  const notes = [];
  const partial = path.join(parent, `.${path.basename(target)}.${crypto.randomBytes(6).toString('hex')}.partial`);
  let method;
  try {
    const syncError = createExclusive(partial, buffer);
    if (syncError) notes.push({ step: 'fsync', ...errorInfo(syncError) });
    try {
      // Re-check just before replacing: a link planted after vetting is refused, not followed.
      const now = (() => { try { return fs.lstatSync(target); } catch { return null; } })();
      if (now && (now.isSymbolicLink() || !now.isFile())) throw Object.assign(new Error('destination changed into a link or non-file'), { code: 'EDESTCHANGED' });
      if (now && !destination.replaces) throw Object.assign(new Error('destination was created by someone else'), { code: 'EEXIST' });
      fs.renameSync(partial, target);
      method = 'rename';
    } catch (error) {
      if (error.code === 'EDESTCHANGED' || error.code === 'EEXIST') throw error;
      notes.push({ step: 'rename', ...errorInfo(error) });
      fs.unlinkSync(partial);
      if (destination.replaces) {
        const now = fs.lstatSync(target);
        if (now.isSymbolicLink() || !now.isFile()) throw Object.assign(new Error('destination changed into a link or non-file'), { code: 'EDESTCHANGED' });
        fs.unlinkSync(target);
      }
      const syncError2 = createExclusive(target, buffer);
      if (syncError2) notes.push({ step: 'fsync', ...errorInfo(syncError2) });
      method = 'exclusive-create';
    }
  } catch (error) {
    try { fs.unlinkSync(partial); } catch { /* already gone */ }
    const readOnly = ['EACCES', 'EPERM', 'EROFS'].includes(error.code);
    return { ok: false, problem: diag(readOnly ? 'copilot/destination-not-writable' : 'copilot/delivery-failed', `Could not write ${target}: ${error.message}`, { ...errorInfo(error), notes }) };
  }
  // Prove the delivered file: a regular file (not a link) holding exactly the checked bytes.
  try {
    const info = fs.lstatSync(target);
    if (!info.isFile() || info.isSymbolicLink()) throw Object.assign(new Error('delivered path is not a regular file'), { code: 'ENOTREG' });
    const fd = fs.openSync(target, fs.constants.O_RDONLY | NOFOLLOW);
    let readBack; try { readBack = fs.readFileSync(fd); } finally { fs.closeSync(fd); }
    if (readBack.byteLength !== buffer.byteLength || sha256(readBack) !== expected) throw Object.assign(new Error('delivered bytes differ from the checked page'), { code: 'EMISMATCH' });
  } catch (error) {
    return { ok: false, problem: diag('copilot/delivery-verification-failed', `The file at ${target} could not be verified: ${error.message}`, { ...errorInfo(error), notes }) };
  }
  return { ok: true, artifact: { path: target, bytes: buffer.byteLength, sha256: expected, method, ...(notes.length ? { notes } : {}) } };
}

// ---------------------------------------------------------------- commands

function withWorkFolder(attempt) {
  const probes = workFolderCandidates().map(probeFolder);
  const usable = probes.filter((p) => p.engineWriter);
  const attempts = [];
  for (const candidate of usable) {
    let work;
    try { work = fs.mkdtempSync(path.join(candidate.folder, 'archi-made-easy-work-')); } catch (error) { attempts.push({ folder: candidate.folder, ...errorInfo(error) }); continue; }
    try {
      const outcome = attempt(work);
      attempts.push({ folder: candidate.folder, outcome: outcome.retry ? 'writer-refused' : outcome.ok ? 'ok' : 'failed' });
      if (!outcome.retry) return { ...outcome, attempts, probes };
    } finally {
      fs.rmSync(work, { recursive: true, force: true });
    }
  }
  return { ok: false, unsupported: true, attempts, probes };
}

function fallbackText(input) {
  // Text exports do not need the page writer; produce Mermaid in any writable folder.
  for (const folder of workFolderCandidates()) {
    let work;
    try { work = fs.mkdtempSync(path.join(folder, 'archi-made-easy-fallback-')); } catch { continue; }
    try {
      const out = path.join(work, 'diagram.md');
      const run = engine(['export', 'mermaid', input, out, '--force', '--json'], work);
      if (run.status === 0 && fs.existsSync(out)) return { mermaidMarkdown: fs.readFileSync(out, 'utf8') };
    } finally { fs.rmSync(work, { recursive: true, force: true }); }
  }
  return {};
}

function readableInput(file) {
  const absolute = path.resolve(file);
  try { if (!fs.statSync(absolute).isFile()) throw Object.assign(new Error('not a file'), { code: 'ENOTREG' }); } catch (error) {
    return { problem: diag('copilot/input-missing', `The diagram document ${absolute} does not exist or is not a file.`, errorInfo(error)) };
  }
  return { absolute };
}

function htmlCommand({ input, output, type = 'architecture', quality, force }) {
  if (!TYPES.includes(type)) return { ok: false, stage: 'arguments', diagnostics: [diag('copilot/unknown-type', `Unknown diagram type "${type}". Use one of: ${TYPES.join(', ')}.`)] };
  const source = readableInput(input); if (source.problem) return { ok: false, stage: 'input', diagnostics: [source.problem] };
  const destination = vetDestination(output, { force, extensions: ['.html', '.htm'] });
  if (destination.problem) return { ok: false, stage: 'destination', diagnostics: [destination.problem] };
  const qualityArgs = quality ? ['--quality', quality] : [];
  const run = withWorkFolder((work) => {
    const validate = engine(['validate', type, source.absolute, '--json', ...qualityArgs], work);
    if (validate.status !== 0) return writerRefused(validate) ? { retry: true } : { ok: false, stage: 'validate', diagnostics: engineDiagnostics(validate), engineExit: validate.status };
    const page = path.join(work, 'page.html');
    const render = engine(['render', type, source.absolute, page, ...qualityArgs], work);
    if (render.status !== 0 || !fs.existsSync(page)) return writerRefused(render) ? { retry: true } : { ok: false, stage: 'render', diagnostics: [diag('copilot/render-failed', `The engine could not render the page: ${(render.stderr || render.stdout).slice(0, 1200)}`)] };
    const check = engine(['check', page, '--json'], work);
    if (check.status !== 0 || check.body?.ok !== true) return { ok: false, stage: 'check', diagnostics: engineDiagnostics(check) };
    const buffer = fs.readFileSync(page);
    const delivered = deliverBytes(buffer, destination);
    if (!delivered.ok) return { ok: false, stage: 'deliver', diagnostics: [delivered.problem] };
    return { ok: true, artifact: delivered.artifact, checks: { validate: 'passed', check: 'passed', checkedSha256: sha256(buffer) } };
  });
  if (run.unsupported) {
    return {
      ok: false, stage: 'work-folder',
      diagnostics: [diag('copilot/html-unsupported', 'No folder in this environment supports the engine\'s safe page writer (it needs hard links and inode numbers), so no interactive page was produced. The text fallback below is not an interactive workbench.')],
      fallback: fallbackText(source.absolute), environment: environmentFacts(), probes: run.probes, attempts: run.attempts,
    };
  }
  const { probes, attempts, ...rest } = run;
  if (!rest.ok && rest.stage === 'deliver') return { ...rest, fallback: fallbackText(source.absolute), environment: environmentFacts(), workFolder: attempts.at(-1)?.folder };
  return { ...rest, workFolder: attempts.at(-1)?.folder };
}

function exportCommand({ format, input, output, force }) {
  if (!EXPORTS.includes(format)) return { ok: false, stage: 'arguments', diagnostics: [diag('copilot/unknown-format', `Unknown export format "${format}". Use one of: ${EXPORTS.join(', ')}.`)] };
  const source = readableInput(input); if (source.problem) return { ok: false, stage: 'input', diagnostics: [source.problem] };
  const destination = vetDestination(output, { force });
  if (destination.problem) return { ok: false, stage: 'destination', diagnostics: [destination.problem] };
  for (const folder of workFolderCandidates()) {
    let work;
    try { work = fs.mkdtempSync(path.join(folder, 'archi-made-easy-export-')); } catch { continue; }
    try {
      const out = path.join(work, `export${path.extname(destination.target) || '.txt'}`);
      const run = engine(['export', format, source.absolute, out, '--force', '--json'], work);
      if (run.status !== 0 || !fs.existsSync(out)) return { ok: false, stage: 'export', diagnostics: engineDiagnostics(run) };
      const delivered = deliverBytes(fs.readFileSync(out), destination);
      return delivered.ok ? { ok: true, artifact: delivered.artifact } : { ok: false, stage: 'deliver', diagnostics: [delivered.problem] };
    } finally { fs.rmSync(work, { recursive: true, force: true }); }
  }
  return { ok: false, stage: 'work-folder', diagnostics: [diag('copilot/no-writable-folder', 'No writable working folder was found.')], environment: environmentFacts() };
}

function probeCommand(extra) {
  const folders = unique([...extra, ...workFolderCandidates(), POSIX && '/mnt/data']);
  const probes = folders.map(probeFolder);
  return { ok: true, environment: environmentFacts(), engineWriterFolders: probes.filter((p) => p.engineWriter).map((p) => p.folder), probes };
}

function parse(argv) {
  const flags = { json: false, force: false }; const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') flags.json = true;
    else if (arg === '--force') flags.force = true;
    else if (arg === '--type' || arg === '--quality') { flags[arg.slice(2)] = argv[i + 1]; i += 1; }
    else if (arg.startsWith('--')) return { error: `Unknown option ${arg}` };
    else positional.push(arg);
  }
  return { flags, positional };
}

function main(argv) {
  const [command, ...rest] = argv;
  const { flags, positional, error } = parse(rest);
  const usage = 'Usage: copilot-deliver.mjs probe [folder…] | html <diagram.json> <output.html> [--type T] [--quality showcase|standard] [--force] | export <format> <architecture.json> <output> [--force]  (add --json)';
  let result;
  if (error) result = { ok: false, stage: 'arguments', diagnostics: [diag('copilot/usage', `${error}. ${usage}`)] };
  else if (command === 'probe') result = probeCommand(positional);
  else if (command === 'html' && positional.length === 2) result = htmlCommand({ input: positional[0], output: positional[1], type: flags.type, quality: flags.quality, force: flags.force });
  else if (command === 'export' && positional.length === 3) result = exportCommand({ format: positional[0], input: positional[1], output: positional[2], force: flags.force });
  else result = { ok: false, stage: 'arguments', diagnostics: [diag('copilot/usage', usage)] };
  const receipt = { schemaVersion: 1, command: `copilot-deliver ${command ?? ''}`.trim(), ...result };
  if (flags.json || !result.ok) process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  else process.stdout.write(`delivered ${result.artifact?.path ?? ''}\n`);
  return result.ok ? 0 : (result.stage === 'arguments' ? 2 : 1);
}

const invokedDirectly = (() => {
  try { return Boolean(process.argv[1]) && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
})();
if (invokedDirectly) process.exitCode = main(process.argv.slice(2));
