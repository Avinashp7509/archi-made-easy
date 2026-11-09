#!/usr/bin/env node
// One-time identity migration: upstream product name -> Archi-Made-Easy.
// Run with: node --expose-internals migrate-identity.mjs <repoRoot> [--apply] [--report <file>]
//
// Dependency-aware, not blind replacement:
//  * paths are moved with `git mv` so history and references stay consistent;
//  * JavaScript is tokenised with Node's bundled acorn so identifiers become
//    `ArchiMadeEasy` / `archiMadeEasy` / `ARCHI_MADE_EASY` while prose inside
//    strings and comments becomes `Archi-Made-Easy`;
//  * generated artifacts are NOT edited here; their generators rebuild them;
//  * legal and attribution files are never edited.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let acorn;
try { acorn = require('internal/deps/acorn/acorn/dist/acorn'); }
catch { console.error('Run with node --expose-internals (needs Node\'s bundled acorn).'); process.exit(2); }

const args = process.argv.slice(2);
const root = path.resolve(args[0] || '.');
const apply = args.includes('--apply');
const reportPath = args.includes('--report') ? args[args.indexOf('--report') + 1] : null;

const OLD = 'archify';

// ---------------------------------------------------------------------------
// Policy tables (reviewed in docs/program/IDENTITY-INVENTORY.md)
// ---------------------------------------------------------------------------

/** Paths removed (upstream project records, not capabilities). Prefix match. */
export const RETIRE = [
  'journal/',
  'docs/evidence/', 'docs/reviews/', 'docs/research/', 'docs/reading-evidence/',
  'docs/issue-52-visual-evidence/', 'docs/releases/',
  'docs/article-',
  'docs/cursor-acceptance-2026-07.md',
  'docs/deployment-ownership-profile-acceptance-2026-07-23.md',
  'docs/artifact-install-v2-measurement.md',
  'docs/skill-embedded-optional-update-notifier-design.md',
  'docs/assets/community/', 'docs/assets/support/', 'docs/assets/sponsors/',
  'tools/contributor-cards/',
  '.github/workflows/contributor-cards.yml', '.github/workflows/contributors.yml',
  '.github/workflows/star-history.yml', '.github/workflows/dsh.yml',
  'README_ZH.md', 'README_JA.md', 'README_KO.md',
  // Community-contributed case and evidence screenshots of the original UI.
  'docs/cases/community/',
  'docs/cases/astron-agent-runtime.architecture.visual-check.',
  // Unreferenced screenshots of the original product.
  'docs/assets/architecture-delta-proof.jpg', 'docs/assets/claude-skills-settings.png',
  'docs/assets/explainer-p99-zh.png', 'docs/assets/explainer-tls-en.png',
];

/** Never content-edited (legal / attribution / this program's own records). */
export const VERBATIM = [
  /(^|\/)LICENSE(-MIT)?$/,
  /(^|\/)NOTICE$/,
  /^ATTRIBUTION\.md$/,
  // Program records describe the baseline as it was; rewriting them would falsify history.
  /^docs\/program\//,
];

/** Rebuilt by their own generators after migration; never text-edited. */
export const GENERATED = [
  /^archify\/assets\/template\.html$/,
  /^archify\/renderers\/shared\/generated-validators\.mjs$/,
  /^archify\/renderers\/shared\/generated-brand-marks\.mjs$/,
  /^archify\/examples\/[^/]+\.html$/,
  /^examples\/[^/]+\.html$/,
  /^docs\/gallery\//,
  /^docs\/gallery\.html$/,
  /^docs\/guide\.html$/,
  /^docs\/start\.html$/,
  /^docs\/cases\/.*\.html$/,
  /^archify\.zip$/,
];

/** Specific tokens renamed before the generic rules (applied to paths and text). */
export const SPECIFIC = [
  // Upstream's own web domain and npm scope must never be re-pointed at look-alike names we do not own.
  ['https://archify.si', 'https://OWNER.github.io/archi-made-easy'],
  ['archify.si', 'OWNER.github.io/archi-made-easy'],
  ['@tt-a1i/archify-dsh', '@OWNER/archi-made-easy-dsh'],
  ['tt-a1i-archify-dsh', 'OWNER-archi-made-easy-dsh'],
  ['https://github.com/tt-a1i/archify', 'https://github.com/OWNER/archi-made-easy'],
  // Regex-escaped spellings inside test assertions (added after the first run; applied as a corrective pass).
  ['tt-a1i\\/archify', 'OWNER\\/archi-made-easy'],
  ['Archify\\.', 'ArchiMadeEasy\\.'],
  ['tt-a1i.github.io/archify', 'OWNER.github.io/archi-made-easy'],
  ['tt-a1i/archify', 'OWNER/archi-made-easy'],
  ['archify-dev-activity', 'project-dev-activity'],
  ['archify-repository', 'project-repository'],
  ['archify-repo-grid', 'project-repo-grid'],
  ['archify-repo', 'project-repo'],
  ['archify-review', 'archi-made-easy-review'],
  ['archify-tuning', 'archi-made-easy-tuning'],
  ['@tt-a1i\n', '@OWNER\n'],
];

const TEXT_EXT = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.astro', '.json', '.md', '.mdc', '.html', '.css',
  '.yml', '.yaml', '.txt', '.sh', '.ps1', '.py', '.toml', '.svg', '.xml', '.dsl', '.csv', '.tsv', '.sql']);
const TEXT_NAMES = new Set(['.gitattributes', '.gitignore', 'CODEOWNERS', '.nojekyll', '.coderabbit.yaml']);
const CODE_EXT = new Set(['.js', '.mjs', '.cjs']);

// ---------------------------------------------------------------------------
// Name mapping
// ---------------------------------------------------------------------------

const ID_CHAR = /[A-Za-z0-9_$]/;

/** Map an occurrence inside a JavaScript identifier token. */
function mapIdentifier(name) {
  return name
    .replace(/ARCHIFY/g, 'ARCHI_MADE_EASY')
    .replace(/Archify/g, 'ArchiMadeEasy')
    .replace(/archify(?=_)|(?<=_)archify/g, 'archi_made_easy')
    .replace(/archify/g, (m, offset, whole) => (offset === 0 ? 'archiMadeEasy' : 'ArchiMadeEasy'));
}

/** True when the character before `index` is an identifier char that is not part of a `\x` escape. */
function idBefore(text, index) {
  const c = text[index - 1];
  if (!c || !ID_CHAR.test(c)) return false;
  if (text[index - 2] === '\\' && /[a-z]/.test(c)) return false; // \n \t \b ... escapes
  return true;
}

/** Map occurrences inside prose, strings, comments, markup, JSON, YAML, etc. */
export function mapText(text) {
  // Copyright and authorship lines are attribution: never rewritten, wherever they appear.
  const protectedLines = [];
  let out = text.replace(/[^\n]*\bCopyright\b[^\n]*/gi, line => {
    protectedLines.push(line);
    return `\u0000COPYRIGHT${protectedLines.length - 1}\u0000`;
  });
  out = mapTextUnprotected(out);
  return out.replace(/\u0000COPYRIGHT(\d+)\u0000/g, (m, i) => protectedLines[Number(i)]);
}

function mapTextUnprotected(text) {
  let out = text;
  for (const [from, to] of SPECIFIC) out = out.split(from).join(to);
  // Upper case: env vars, template markers, constants.
  out = out.replace(/ARCHIFY(?=[_:])/g, 'ARCHI_MADE_EASY');
  out = out.replace(/ARCHIFY/g, (m, i, s) => (idBefore(s, i) || ID_CHAR.test(s[i + m.length] || '') ? 'ARCHI_MADE_EASY' : 'ARCHI-MADE-EASY'));
  // Title case: namespace references inside strings vs product name in prose.
  out = out.replace(/Archify/g, (m, i, s) => {
    const after = s.slice(i + m.length);
    const identifierish = idBefore(s, i) || s[i - 1] === '.' || ID_CHAR.test(after[0] || '') || /^\.[A-Za-z_$]/.test(after) || /^\??\.\w/.test(after);
    return identifierish ? 'ArchiMadeEasy' : 'Archi-Made-Easy';
  });
  // Lower case: camelCase / snake_case identifiers inside strings, else kebab.
  out = out.replace(/archify/g, (m, i, s) => {
    const next = s[i + m.length] || '';
    if (s[i - 1] === '_' || next === '_') return 'archi_made_easy';
    if (/[A-Z0-9$]/.test(next)) return idBefore(s, i) ? 'ArchiMadeEasy' : 'archiMadeEasy';
    if (idBefore(s, i) && /[a-z]/.test(s[i - 1])) return 'ArchiMadeEasy'; // e.g. cliArchify-like joins
    return 'archi-made-easy';
  });
  return out;
}

/** Tokenise JavaScript and map identifiers vs. non-code segments separately. */
export function mapJavaScript(source, sourceType = 'module') {
  const edits = [];
  const comments = [];
  const tokens = [];
  const opts = { ecmaVersion: 'latest', sourceType, allowHashBang: true, allowReturnOutsideFunction: true,
    allowAwaitOutsideFunction: true, allowImportExportEverywhere: true, onComment: comments, locations: false };
  for (const t of acorn.tokenizer(source, opts)) tokens.push(t);
  const segments = [];
  for (const t of tokens) {
    const label = t.type.label;
    if (label === 'name' || label === 'privateId') segments.push({ start: t.start, end: t.end, kind: 'id' });
    else if (label === 'string' || label === 'template' || label === 'regexp') segments.push({ start: t.start, end: t.end, kind: 'text' });
  }
  for (const c of comments) segments.push({ start: c.start, end: c.end, kind: 'text' });
  segments.sort((a, b) => a.start - b.start);
  let out = '';
  let cursor = 0;
  for (const seg of segments) {
    if (seg.start < cursor) continue;
    out += source.slice(cursor, seg.start);
    const piece = source.slice(seg.start, seg.end);
    out += /archify/i.test(piece) ? (seg.kind === 'id' ? mapIdentifier(piece) : mapText(piece)) : piece;
    cursor = seg.end;
  }
  out += source.slice(cursor);
  // Anything left outside tokens (should be none) falls back to text rules.
  return /archify/i.test(out) ? mapText(out) : out;
}

/** HTML: map inline classic/module scripts as JavaScript, everything else as text. */
export function mapHtml(source) {
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let out = '';
  let cursor = 0;
  let m;
  while ((m = re.exec(source))) {
    out += mapText(source.slice(cursor, m.index));
    const [whole, attrs, body] = m;
    const open = whole.slice(0, whole.indexOf('>') + 1);
    let mapped;
    if (/type\s*=\s*["']?(application|text)\/(json|ld\+json|template)/i.test(attrs) || !/archify/i.test(body)) mapped = mapText(body);
    else {
      try { mapped = mapJavaScript(body, /type\s*=\s*["']?module/i.test(attrs) ? 'module' : 'script'); }
      catch { mapped = mapText(body); }
    }
    out += mapText(open) + mapped + '</script>';
    cursor = m.index + whole.length;
  }
  return out + mapText(source.slice(cursor));
}

export function mapPath(p) {
  let out = p;
  for (const [from, to] of SPECIFIC) out = out.split(from).join(to);
  return out.split('/').map(seg => seg.replace(/ARCHIFY/g, 'ARCHI_MADE_EASY').replace(/Archify/g, 'Archi-Made-Easy').replace(/archify/g, 'archi-made-easy')).join('/');
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

function git(...a) { return execFileSync('git', a, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 }); }

function isText(p) {
  const base = path.posix.basename(p);
  return TEXT_EXT.has(path.posix.extname(p).toLowerCase()) || TEXT_NAMES.has(base);
}

function main() {
  const files = git('ls-files', '-z').split('\0').filter(Boolean);
  const report = { retired: [], moved: [], edited: [], generatedSkipped: [], verbatim: [], failedTokenise: [], binaryWithName: [] };

  const retired = files.filter(f => RETIRE.some(r => f === r || f.startsWith(r)));
  report.retired = retired;
  const live = files.filter(f => !retired.includes(f));

  // Content first (paths are still the old ones), then moves.
  for (const f of live) {
    const abs = path.join(root, f);
    if (VERBATIM.some(r => r.test(f))) { report.verbatim.push(f); continue; }
    if (GENERATED.some(r => r.test(f))) { report.generatedSkipped.push(f); continue; }
    if (!isText(f)) {
      const buf = fs.readFileSync(abs);
      if (buf.includes(OLD) || buf.includes('Archify')) report.binaryWithName.push(f);
      continue;
    }
    const before = fs.readFileSync(abs, 'utf8');
    if (!/archify/i.test(before) && !SPECIFIC.some(([s]) => before.includes(s))) continue;
    let after;
    const ext = path.posix.extname(f).toLowerCase();
    try {
      if (CODE_EXT.has(ext)) {
        try { after = mapJavaScript(before, 'module'); }
        catch { after = mapJavaScript(before, 'script'); }
      } else if (ext === '.html') after = mapHtml(before);
      else after = mapText(before);
    } catch (error) {
      report.failedTokenise.push(`${f}: ${error.message}`);
      after = mapText(before);
    }
    if (after !== before) {
      report.edited.push(f);
      if (apply) fs.writeFileSync(abs, after, 'utf8');
    }
  }

  // Path moves (directories first via file-level git mv of each file).
  for (const f of live) {
    const to = mapPath(f);
    if (to === f) continue;
    report.moved.push([f, to]);
  }
  if (apply) {
    if (retired.length) {
      for (let i = 0; i < retired.length; i += 200) git('rm', '-q', '--', ...retired.slice(i, i + 200));
    }
    for (const [from, to] of report.moved) {
      fs.mkdirSync(path.dirname(path.join(root, to)), { recursive: true });
      git('mv', '--', from, to);
    }
  }

  const summary = Object.fromEntries(Object.entries(report).map(([k, v]) => [k, v.length]));
  console.log(JSON.stringify(summary, null, 2));
  if (reportPath) fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
}

if (!process.env.MIGRATE_IDENTITY_NO_MAIN) main();
