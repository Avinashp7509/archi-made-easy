import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(__dirname, '..', 'archi-made-easy');
const repoRoot = path.resolve(skillRoot, '..');
const assetPath = path.join(repoRoot, 'docs', 'assets', 'archi-made-easy-live-proof.gif');
const receiptPath = path.join(repoRoot, 'docs', 'assets', 'archi-made-easy-live-proof.json');

const readmeLanguages = [
  {
    file: 'README.md',
    href: './README.md',
    label: 'English',
    demos: '## See Archi-Made-Easy in action',
    preview: '## Preview',
    quickStart: '## Quick start',
    contributing: '## Contributing',
    noRepository: /No repository is required/,
  },
  {
    file: 'README_EN.md',
    href: './README.md',
    label: 'English',
    demos: '## See Archi-Made-Easy in action',
    preview: '## Preview',
    quickStart: '## Quick start',
    contributing: '## Contributing',
    noRepository: /No repository is required/,
  },
  {
    file: 'README_ZH.md',
    href: './README_ZH.md',
    label: '简体中文',
    demos: '## 看看 Archi-Made-Easy 能做什么',
    preview: '## 预览',
    quickStart: '## 快速开始',
    contributing: '## 参与贡献',
    noRepository: /不需要绑定代码库/,
  },
  {
    file: 'README_JA.md',
    href: './README_JA.md',
    label: '日本語',
    demos: '## 実際の Archi-Made-Easy',
    preview: '## プレビュー',
    quickStart: '## クイックスタート',
    contributing: '## コントリビュート',
    noRepository: /リポジトリは不要です/,
  },
];

function sectionIndex(readme, filename, heading) {
  const index = readme.indexOf(heading);
  assert.ok(index >= 0, `${filename}: section heading ${heading} is missing`);
  return index;
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function git(cwd, args, env = process.env) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', env }).trim();
}

// Git for Windows installs bash.exe beside the git.exe that owns the repository.
// `git --exec-path` returns GIT_EXEC_PATH unchanged, so discovery must not walk
// up from that override: a missing directory there would hide the installed Bash.
function gitBashForWindows(cwd, env = process.env) {
  const discoveryEnv = { ...env };
  for (const key of Object.keys(discoveryEnv)) {
    if (key.toUpperCase() === 'GIT_EXEC_PATH') delete discoveryEnv[key];
  }
  const execPath = git(cwd, ['--exec-path'], discoveryEnv);
  const gitExe = path.resolve(execPath, '..', '..', 'bin', 'git.exe');
  const gitBash = path.resolve(execPath, '..', '..', '..', 'bin', 'bash.exe');
  return { gitExe, gitBash };
}

function shellForFixture() {
  if (process.platform !== 'win32') return 'bash';
  const { gitBash } = gitBashForWindows(repoRoot);
  assert.ok(fs.existsSync(gitBash), `Git Bash is required for the Windows fixture: ${gitBash}`);
  return gitBash;
}

function writeStarHistoryCharts(cwd, version) {
  const assets = path.join(cwd, 'assets');
  fs.mkdirSync(assets, { recursive: true });
  fs.writeFileSync(path.join(assets, 'star-history-light.svg'), `<svg><title>light ${version}</title></svg>\n`);
  fs.writeFileSync(path.join(assets, 'star-history-dark.svg'), `<svg><title>dark ${version}</title></svg>\n`);
}

function skipSubBlocks(buffer, start) {
  let offset = start;
  while (offset < buffer.length) {
    const size = buffer[offset];
    offset += 1;
    if (size === 0) return offset;
    offset += size;
  }
  throw new Error('GIF sub-block runs past end of file');
}

function inspectGif(buffer) {
  assert.match(buffer.subarray(0, 6).toString('ascii'), /^GIF8[79]a$/);
  const width = buffer.readUInt16LE(6);
  const height = buffer.readUInt16LE(8);
  const packed = buffer[10];
  let offset = 13;
  if (packed & 0x80) offset += 3 * (2 ** ((packed & 0x07) + 1));
  let frameCount = 0;
  let durationCentiseconds = 0;
  let trailer = false;

  while (offset < buffer.length) {
    const marker = buffer[offset];
    offset += 1;
    if (marker === 0x3b) {
      trailer = true;
      break;
    }
    if (marker === 0x21) {
      const label = buffer[offset];
      offset += 1;
      if (label === 0xf9) {
        const blockSize = buffer[offset];
        offset += 1;
        assert.equal(blockSize, 4, 'unexpected graphic-control block size');
        durationCentiseconds += buffer.readUInt16LE(offset + 1);
        offset += blockSize;
        assert.equal(buffer[offset], 0, 'graphic-control block missing terminator');
        offset += 1;
      } else {
        offset = skipSubBlocks(buffer, offset);
      }
      continue;
    }
    if (marker === 0x2c) {
      frameCount += 1;
      const localPacked = buffer[offset + 8];
      offset += 9;
      if (localPacked & 0x80) offset += 3 * (2 ** ((localPacked & 0x07) + 1));
      offset += 1;
      offset = skipSubBlocks(buffer, offset);
      continue;
    }
    throw new Error(`unexpected GIF marker 0x${marker.toString(16)} at ${offset - 1}`);
  }
  assert.equal(trailer, true, 'GIF trailer missing');
  return { width, height, frameCount, durationSeconds: durationCentiseconds / 100 };
}

// The GIF and its receipt were captured from the viewer before the product rename and
// must be re-captured (Phase 7; needs ffmpeg). Tracked in test/identity-guard.test.mjs.
test('README motion proof is compact, looping, and backed by current gallery artifacts', { todo: 'pending re-capture from the renamed viewer (Phase 7, needs ffmpeg)' }, () => {
  const builder = fs.readFileSync(path.join(repoRoot, 'scripts', 'build-readme-showcase.mjs'), 'utf8');
  assert.match(builder, /\?embed=1&theme=dark\$\{scene\.hash\}/);
  assert.doesNotMatch(builder, /play=1|#view=/);
  assert.match(builder, /path\.relative\(from, to\)\.split\(path\.sep\)\.join\('\/'\)/);
  const buffer = fs.readFileSync(assetPath);
  const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  const inspected = inspectGif(buffer);

  assert.deepEqual(inspected, { width: 960, height: 540, frameCount: 54, durationSeconds: 5.4 });
  assert.ok(buffer.includes(Buffer.from('NETSCAPE2.0')), 'GIF must loop continuously');
  assert.ok(buffer.byteLength <= 3 * 1024 * 1024, `README GIF is too large: ${buffer.byteLength} bytes`);
  assert.equal(receipt.schemaVersion, 1);
  assert.equal(receipt.generator, 'scripts/build-readme-showcase.mjs');
  assert.equal(receipt.output, 'docs/assets/archi-made-easy-live-proof.gif');
  assert.equal(receipt.width, inspected.width);
  assert.equal(receipt.height, inspected.height);
  assert.equal(receipt.frameCount, inspected.frameCount);
  assert.equal(receipt.durationSeconds, inspected.durationSeconds);
  assert.equal(receipt.bytes, buffer.byteLength);
  assert.equal(receipt.sha256, sha256(assetPath));
  assert.deepEqual(receipt.scenes.map(scene => scene.id), ['signal-flow', 'blueprint', 'classic']);
  for (const scene of receipt.scenes) {
    const artifact = path.join(repoRoot, scene.artifact);
    assert.ok(fs.existsSync(artifact), `${scene.id}: source artifact missing`);
    assert.equal(scene.artifactSha256, sha256(artifact), `${scene.id}: source artifact drift; rebuild README showcase`);
    assert.match(scene.receipt, /9\/9 checks/);
  }
});

test('Windows command lookup and ffmpeg launch keep their boundary diagnostics', async () => {
  const showcase = await import(pathToFileURL(path.join(repoRoot, 'scripts', 'build-readme-showcase.mjs')).href);
  const selected = String.raw`C:\Tools\ffmpeg.EXE`;
  const lookup = showcase.commandPath('ffmpeg', () => ({
    status: 0,
    stdout: `\r\n${selected}\r\nC:\\Other\\ffmpeg.exe\r\n`,
  }), 'win32');
  assert.equal(lookup, selected);
  assert.equal(showcase.commandPath('ffmpeg', () => ({
    status: 1,
    stdout: '',
    error: new Error('where failed'),
  }), 'win32'), null);
  assert.throws(
    () => showcase.launchFfmpeg(selected, ['-version'], () => ({
      status: null,
      stderr: '',
      error: Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }),
    })),
    /ffmpeg failed:\s*spawn ENOENT/,
  );
});

function fakeChrome({ exitBeforeStop = false, closeOn = null } = {}) {
  const child = new EventEmitter();
  child.exitCode = null;
  child.signalCode = null;
  child.stderr = new PassThrough();
  child.stdout = new PassThrough();
  child.stdio = [null, child.stdout, child.stderr, new PassThrough(), new PassThrough()];
  child.kill = (signal) => {
    child.signalCode = signal;
    if (closeOn === signal) {
      child.exitCode = null;
      queueMicrotask(() => child.emit('close', null, signal));
    }
    return true;
  };
  if (exitBeforeStop) {
    child.exitCode = 0;
    child.emit('close', 0, null);
  }
  return child;
}

test('showcase shutdown clears its timer and bounds a forced stop', async () => {
  const showcase = await import(pathToFileURL(path.join(repoRoot, 'scripts', 'build-readme-showcase.mjs')).href);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'archi-made-easy-showcase-profile-'));
  const started = Date.now();
  await showcase.stopChrome(fakeChrome({ exitBeforeStop: true }), profile);
  assert.ok(Date.now() - started < 1000, 'an already exited browser must not wait for the losing timer');
  fs.rmSync(profile, { recursive: true, force: true });

  const retained = fs.mkdtempSync(path.join(os.tmpdir(), 'archi-made-easy-showcase-profile-'));
  const forced = fakeChrome();
  await assert.rejects(
    () => showcase.stopChrome(forced, retained, 20),
    new RegExp(`Chrome did not exit; profile retained at ${retained.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
  );
  assert.equal(forced.signalCode, 'SIGKILL');
  assert.equal(fs.existsSync(retained), true);
  fs.rmSync(retained, { recursive: true, force: true });

  const graceful = fakeChrome({ closeOn: 'SIGTERM' });
  const gracefulStarted = Date.now();
  await showcase.stopChrome(graceful, profile);
  assert.equal(graceful.signalCode, 'SIGTERM');
  assert.ok(Date.now() - gracefulStarted < 1000, 'a prompt close must cancel the shutdown timer');
});

test('showcase navigation failure cancels its unused load waiter', async () => {
  const showcase = await import(pathToFileURL(path.join(repoRoot, 'scripts', 'build-readme-showcase.mjs')).href);
  const child = fakeChrome();
  const cdp = new showcase.PipeCdp(child);
  const loaded = cdp.waitFor('Page.loadEventFired', 'session');
  let rejected = false;
  loaded.catch(() => { rejected = true; });
  const originalWrite = child.stdio[3].write.bind(child.stdio[3]);
  child.stdio[3].write = () => { throw new Error('navigation pipe closed'); };
  await assert.rejects(() => cdp.send('Page.navigate', { url: 'about:blank' }, 'session'), /navigation pipe closed/);
  loaded.cancel();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(rejected, false);
  child.stdio[3].write = originalWrite;
  cdp.failAll(new Error('test finished'));
});

test('Windows Git Bash discovery ignores GIT_EXEC_PATH', { skip: process.platform !== 'win32' }, () => {
  const missing = path.join(os.tmpdir(), 'archi-made-easy-missing-git-exec-path');
  const normal = gitBashForWindows(repoRoot);
  for (const key of ['GIT_EXEC_PATH', 'Git_Exec_Path', 'git_exec_path']) {
    const overridden = gitBashForWindows(repoRoot, { ...process.env, [key]: missing });
    assert.equal(overridden.gitBash, normal.gitBash);
    assert.equal(fs.existsSync(overridden.gitBash), true);
    assert.equal(fs.existsSync(overridden.gitExe), true);
  }
  assert.equal(fs.existsSync(missing), false);
});

test('showcase CLI runs through a filesystem alias while imports remain inert', (t) => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'archi-made-easy-showcase-alias-'));
  t.after(() => fs.rmSync(scratch, {recursive:true, force:true}));
  const script = path.join(repoRoot, 'scripts/build-readme-showcase.mjs');
  const alias = path.join(scratch, 'showcase.mjs');
  try { fs.symlinkSync(script, alias, 'file'); }
  catch (error) {
    if (process.platform === 'win32' && ['EPERM','EACCES'].includes(error.code)) {
      t.skip('Windows host does not permit creating file symlinks'); return;
    }
    throw error;
  }
  // A deliberately empty tool search path makes actual main() fail quickly,
  // without launching a browser or generating a GIF.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toLowerCase() !== 'path'));
  env.PATH = '';
  const direct = spawnSync(process.execPath, [script], {env, encoding:'utf8'});
  const linked = spawnSync(process.execPath, [alias], {env, encoding:'utf8'});
  assert.equal(direct.status, 1, direct.stderr);
  assert.equal(linked.status, 1, 'alias must execute main, not silently succeed');
  assert.match(linked.stderr, /ffmpeg|Chrome or Chromium is required/);
  const imported = spawnSync(process.execPath, ['--input-type=module','--eval', `await import(${JSON.stringify(pathToFileURL(alias).href)})`], {env,encoding:'utf8'});
  assert.equal(imported.status, 0, imported.stderr);
});


test('outer capture cleanup retains a live Chrome profile and cleans ordinary failures', async () => {
  const showcase = await import(pathToFileURL(path.join(repoRoot, 'scripts/build-readme-showcase.mjs')).href);
  let retained;
  await assert.rejects(showcase.withCaptureDirectory(async root => {
    retained = root;
    const profile = path.join(root, 'profile'); fs.mkdirSync(profile);
    await showcase.stopChrome(fakeChrome(), profile, 5);
  }), /Chrome did not exit; profile retained/);
  try { assert.equal(fs.existsSync(path.join(retained, 'profile')), true); }
  finally { fs.rmSync(retained, {recursive:true, force:true}); }
  let removed;
  const original = new Error('capture failed');
  await assert.rejects(showcase.withCaptureDirectory(async root => {removed=root; throw original;}), error => error===original);
  assert.equal(fs.existsSync(removed), false);
});
