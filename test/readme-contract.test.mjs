// Product README contract: the README is the first thing people read, so it must be
// accurate. It mirrors to README_EN.md, carries the package version, resolves every
// local link, and makes no popularity, endorsement or sponsorship claims the product
// cannot back.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readme = fs.readFileSync(path.join(repoRoot, 'README.md'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'archi-made-easy/package.json'), 'utf8'));

test('README.md and README_EN.md stay byte-identical', () => {
  assert.equal(fs.readFileSync(path.join(repoRoot, 'README_EN.md'), 'utf8'), readme);
});

test('README names the product and its current version', () => {
  assert.match(readme, /<h1[^>]*>Archi-Made-Easy<\/h1>|^# Archi-Made-Easy$/m);
  const shield = pkg.version.replaceAll('-', '--');
  assert.ok(readme.includes(`/badge/version-${shield}-`), 'version badge');
  assert.ok(readme.includes(`\`v${pkg.version}\``), 'version marker');
});

test('every local README link resolves', () => {
  const targets = [...readme.matchAll(/\]\(([^)\s]+)\)|(?:href|src)="([^"]+)"/g)]
    .map((match) => match[1] || match[2])
    .filter((target) => !/^(?:[a-z]+:|#)/i.test(target));
  assert.ok(targets.length > 0, 'README should link its own documents');
  const missing = targets.filter((target) => !fs.existsSync(path.join(repoRoot, decodeURIComponent(target.split(/[?#]/)[0]))));
  assert.deepEqual(missing, []);
});

test('README makes no unbacked popularity, sponsorship or community claims', () => {
  for (const pattern of [/\binstalls?\b.*\d+\s*K/i, /stargazers|star-history|trendshift/i, /\bsponsor/i, /wechat|alipay|discord|qq group/i]) {
    assert.doesNotMatch(readme, pattern);
  }
});

test('README credits the origin through NOTICE and ATTRIBUTION.md', () => {
  assert.match(readme, /\]\(NOTICE\)/);
  assert.match(readme, /\]\(ATTRIBUTION\.md\)/);
});
