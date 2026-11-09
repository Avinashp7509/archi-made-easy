import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const integrationRoot = path.resolve(here, '..');
const repoRoot = path.resolve(integrationRoot, '..', '..');
const packScript = path.join(integrationRoot, 'scripts', 'pack.mjs');
const release = JSON.parse(fs.readFileSync(path.join(integrationRoot, 'release.json'), 'utf8'));
const DSH_RELEASE_REF = release.sourceCommit;

const FORBIDDEN = [
  '/test/',
  'package-lock.json',
  '/node_modules/',
  '.hive',
  '.workbuddy',
  'probe-skills',
  'generate-brand-marks.mjs',
  'generate-validators.mjs',
  'distribution-acceptance',
];

function packTarball() {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'archi-made-easy-dsh-tarball-'));
  const out = path.join(scratch, 'OWNER-archi-made-easy-dsh-1.1.0.tgz');
  const result = spawnSync(process.execPath, [packScript, '--out', out, '--json'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  return { scratch, out, result };
}

test('pack command emits a real npm tarball with the expected identity and file list', () => {
  const { scratch, out, result } = packTarball();
  try {
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const receipt = JSON.parse(result.stdout);
    assert.equal(receipt.name, '@OWNER/archi-made-easy-dsh');
    assert.equal(receipt.version, '1.1.0');
    assert.equal(fs.existsSync(out), true);
    const files = receipt.files.map((file) => file.path.replace(/^package\//, ''));
    for (const required of [
      'package.json',
      'cordis.patch.yml',
      'lib/index.js',
      'README.md',
      'CHANGELOG.md',
      'LICENSE',
      'skills/archi-made-easy/SKILL.md',
      'skills/archi-made-easy/bin/archi-made-easy.mjs',
      'skills/archi-made-easy/LICENSE',
      'skills/archi-made-easy/LICENSE-MIT',
      'skills/archi-made-easy/NOTICE',
      'skills/archi-made-easy/THIRD_PARTY_NOTICES.md',
      'release.json',
    ]) {
      assert.ok(files.includes(required), `tarball missing ${required}`);
    }
    const skillEntries = files.filter((file) => file === 'skills/archi-made-easy/SKILL.md' || file.endsWith('/SKILL.md'));
    assert.deepEqual(skillEntries, ['skills/archi-made-easy/SKILL.md']);
    for (const notifierFile of [
      'skills/archi-made-easy/skill-release.json',
      'skills/archi-made-easy/scripts/check-update.mjs',
      'skills/archi-made-easy/scripts/update-contract.mjs',
    ]) {
      assert.equal(files.includes(notifierFile), true, `DSH 1.1.0 must contain ${notifierFile}`);
    }
    for (const file of files) {
      for (const forbidden of FORBIDDEN) {
        assert.equal(file.includes(forbidden), false, `tarball contains forbidden ${file}`);
      }
    }
    assert.equal(files.some((file) => file.startsWith('test/')), false);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test('packed Skill payload remains byte-identical to the declared immutable source commit', () => {
  const { scratch, out, result } = packTarball();
  try {
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const receipt = JSON.parse(result.stdout);
    const packedRoot = path.join(scratch, 'packed');
    fs.mkdirSync(packedRoot);
    const tar = spawnSync('tar', ['-xzf', path.basename(out), '-C', packedRoot], {
      cwd: path.dirname(out),
      encoding: 'utf8',
    });
    assert.equal(tar.status, 0, tar.stderr);
    const skillRoot = path.join(packedRoot, 'package', 'skills', 'archi-made-easy');
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(packedRoot, 'package', 'release.json'), 'utf8')), release);
    const skillFiles = receipt.files
      .map((file) => file.path.replace(/^package\//, ''))
      .filter((file) => file.startsWith('skills/archi-made-easy/'))
      .filter((file) => file !== 'skills/archi-made-easy/package.json');
    for (const packagedPath of skillFiles) {
      const relative = packagedPath.slice('skills/archi-made-easy/'.length);
      const tagged = spawnSync('git', [
        'show',
        `${DSH_RELEASE_REF}:archi-made-easy/${relative}`,
      ], {
        cwd: repoRoot,
        encoding: null,
      });
      assert.equal(tagged.status, 0, tagged.stderr?.toString('utf8'));
      assert.deepEqual(
        fs.readFileSync(path.join(skillRoot, ...relative.split('/'))),
        tagged.stdout,
        `${packagedPath} differs from ${DSH_RELEASE_REF}`,
      );
    }
    const skillPackage = JSON.parse(fs.readFileSync(path.join(skillRoot, 'package.json'), 'utf8'));
    assert.equal(skillPackage.version, release.skillVersion);
    const sourceManifest = spawnSync('git', ['show', `${DSH_RELEASE_REF}:archi-made-easy/package.json`], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    assert.equal(sourceManifest.status, 0, sourceManifest.stderr);
    const cleanManifest = JSON.parse(sourceManifest.stdout);
    delete cleanManifest.scripts;
    delete cleanManifest.devDependencies;
    assert.deepEqual(skillPackage, cleanManifest, 'only development metadata is stripped from the source manifest');
    for (const field of ['scripts', 'dependencies', 'devDependencies', 'optionalDependencies',
      'peerDependencies', 'bundledDependencies', 'bundleDependencies']) {
      assert.equal(Object.hasOwn(skillPackage, field), false, `packaged Skill must not declare ${field}`);
    }
    const skillRelease = JSON.parse(fs.readFileSync(path.join(skillRoot, 'skill-release.json'), 'utf8'));
    assert.equal(skillRelease.version, release.skillVersion);
    assert.equal(skillRelease.channel, 'stable');
    assert.match(fs.readFileSync(path.join(skillRoot, 'SKILL.md'), 'utf8'), /## Update awareness/);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});
