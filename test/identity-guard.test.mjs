// Product identity guard.
//
// The product is Archi-Made-Easy. The name of the work it was derived from may
// appear only where attribution requires it:
//   * the legal and attribution files (NOTICE, ATTRIBUTION.md, LICENSE files);
//   * the program records in docs/program/, which describe the imported baseline;
//   * the NOTICE text that every rendered page embeds verbatim (and pages that
//     nest other rendered pages embed it again, escaped).
// Everything else (code, identifiers, docs, examples, generated files) must use
// the Archi-Made-Easy identity.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGINAL = /archify/gi;

const ATTRIBUTION_FILES = [
  /^NOTICE$/,
  /^archi-made-easy\/NOTICE$/,
  /^ATTRIBUTION\.md$/,
  /(^|\/)LICENSE(-MIT)?$/,
  /^docs\/program\//,
  /^test\/identity-guard\.test\.mjs$/, // this guard must name what it searches for
];
const TEXT = /\.(?:js|mjs|cjs|ts|tsx|jsx|astro|json|md|mdc|html|css|ya?ml|txt|sh|ps1|py|toml|svg|xml|csv)$/i;
const TEXT_NAMES = /(^|\/)(?:\.gitignore|\.gitattributes|CODEOWNERS)$/;

// Raster captures taken from the viewer before the identity migration. Pixels cannot
// be searched, so every pre-migration capture is listed here and must be re-captured
// from the renamed viewer (Phase 7). The list may only shrink.
export const PENDING_RECAPTURE = [
  'docs/assets/archi-made-easy-architecture.png',
  'docs/assets/archi-made-easy-class.png',
  'docs/assets/archi-made-easy-dark.png',
  'docs/assets/archi-made-easy-dataflow.png',
  'docs/assets/archi-made-easy-demo-lens.png',
  'docs/assets/archi-made-easy-demo-reach.png',
  'docs/assets/archi-made-easy-demo-route.png',
  'docs/assets/archi-made-easy-erd.png',
  'docs/assets/archi-made-easy-lifecycle.png',
  'docs/assets/archi-made-easy-light.png',
  'docs/assets/archi-made-easy-live-proof.gif',
  'docs/assets/archi-made-easy-menu.png',
  'docs/assets/archi-made-easy-readme-hero.png',
  'docs/assets/archi-made-easy-route-share-card.png',
  'docs/assets/archi-made-easy-sequence.png',
  'docs/assets/archi-made-easy-social-preview.png',
  'docs/assets/archi-made-easy-timeline.png',
  'docs/assets/archi-made-easy-tree.png',
  'docs/assets/archi-made-easy-waterfall.png',
  'docs/assets/archi-made-easy-workflow.png',
  'docs/assets/explainer/finalize-delivery.webp',
  'docs/assets/explainer/first-rental.webp',
  'docs/assets/explainer/p99-tail-latency.webp',
  'docs/assets/explainer/tls-first-visit.webp',
  'docs/assets/life/job-search.lifecycle.webp',
  'docs/assets/life/leave-plan.workflow.webp',
  'docs/assets/life/monthly-money.dataflow.webp',
  'docs/assets/life/renting.sequence.webp',
  'docs/assets/mco-runtime-reach-share-card.png',
  'docs/assets/mco-runtime-share-card.png',
  'docs/assets/workflow-routing-clarity/maka-after.png',
  'docs/assets/workflow-routing-clarity/maka-before.png',
  'docs/assets/workflow-routing-clarity/openpi-after.png',
  'docs/assets/workflow-routing-clarity/openpi-before.png',
];

// Markers that open the original work's notice inside our NOTICE. An occurrence is
// attribution when it falls inside an embedded copy of that notice.
const NOTICE_OPENERS = ['is a modified version of a work published at'];
const NOTICE_SPAN = 3200;

function trackedFiles() {
  return execFileSync('git', ['ls-files', '-z'], { cwd: repoRoot, encoding: 'utf8', maxBuffer: 1 << 28 })
    .split('\0').filter(Boolean)
    .filter((file) => fs.existsSync(path.join(repoRoot, file)));
}

/** Occurrences of the original name that are not inside an embedded NOTICE copy. */
export function unattributedOccurrences(source) {
  const noticeRanges = [];
  for (const opener of NOTICE_OPENERS) {
    let from = 0;
    for (;;) {
      const index = source.indexOf(opener, from);
      if (index === -1) break;
      noticeRanges.push([index, index + NOTICE_SPAN]);
      from = index + opener.length;
    }
  }
  const found = [];
  for (const match of source.matchAll(ORIGINAL)) {
    // The original copyright line (embedded LICENSE-MIT) is attribution wherever it appears.
    if (/Copyright \(c\) \d{4} tt-a1i \($/.test(source.slice(Math.max(0, match.index - 40), match.index))) continue;
    if (!noticeRanges.some(([start, end]) => match.index >= start && match.index < end)) {
      found.push(source.slice(Math.max(0, match.index - 40), match.index + 40).replace(/\s+/g, ' '));
    }
  }
  return found;
}

test('the original product name appears only in attribution contexts', () => {
  const offenders = [];
  for (const file of trackedFiles()) {
    if (ATTRIBUTION_FILES.some((pattern) => pattern.test(file))) continue;
    if (!TEXT.test(file) && !TEXT_NAMES.test(file)) continue;
    const hits = unattributedOccurrences(fs.readFileSync(path.join(repoRoot, file), 'utf8'));
    if (hits.length) offenders.push(`${file} (${hits.length}): …${hits[0]}…`);
  }
  assert.deepEqual(offenders, [], `original product name outside attribution:\n${offenders.join('\n')}`);
});

test('no tracked path carries the original product name', () => {
  const paths = trackedFiles().filter((file) => /archify/i.test(file) && !/^docs\/program\//.test(file));
  assert.deepEqual(paths, []);
});

test('legal notices keep the original attribution', () => {
  for (const file of ['NOTICE', 'archi-made-easy/NOTICE']) {
    const notice = fs.readFileSync(path.join(repoRoot, file), 'utf8');
    assert.match(notice, /^Archi-Made-Easy\nCopyright \(c\) 2026 Avinash Roy\n/, file);
    assert.match(notice, /Copyright \(c\) 2026 tt-a1i \(Archify\)/, `${file} must keep the original copyright line`);
    assert.match(notice, /Copyright \(c\) 2025 Cocoon AI/, `${file} must keep the original copyright line`);
    assert.match(notice, /https:\/\/github\.com\/tt-a1i\/archify \(commit 11b0d6031853bdae89eed57e7979aabbf0034097\)/, file);
  }
  assert.equal(
    fs.readFileSync(path.join(repoRoot, 'NOTICE'), 'utf8'),
    fs.readFileSync(path.join(repoRoot, 'archi-made-easy/NOTICE'), 'utf8'),
    'the shipped skill must carry the same NOTICE as the repository',
  );
  assert.match(fs.readFileSync(path.join(repoRoot, 'LICENSE-MIT'), 'utf8'), /Copyright \(c\) 2026 tt-a1i \(Archify\)/);
});

test('pre-migration captures are tracked until re-captured', () => {
  const missing = PENDING_RECAPTURE.filter((file) => !fs.existsSync(path.join(repoRoot, file)));
  assert.deepEqual(missing, [], 'remove re-captured or deleted files from PENDING_RECAPTURE');
  assert.equal(new Set(PENDING_RECAPTURE).size, PENDING_RECAPTURE.length);
});

test('notice-context detection only excuses occurrences inside an embedded notice', () => {
  const notice = 'Archi-Made-Easy is a modified version of a work published at https://example.test/archify';
  assert.deepEqual(unattributedOccurrences(notice), []);
  assert.equal(unattributedOccurrences(`window.Archify = {}; ${notice}`).length, 1);
  assert.deepEqual(unattributedOccurrences('MIT License\n\nCopyright (c) 2026 tt-a1i (Archify)\n'), []);
  assert.equal(unattributedOccurrences('Built with Archify (c) 2026').length, 1);
});
