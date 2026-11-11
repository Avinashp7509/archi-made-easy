#!/usr/bin/env node
// Build the Microsoft 365 Copilot Edition of the skill: archi-made-easy-copilot.zip.
//
// The Full Edition (archi-made-easy/, archi-made-easy.zip) is not changed. This script stages
// the same tracked skill files with scripts/stage-clean-skill.mjs, then applies only these
// edition transforms, each asserted so that a change in the source makes the build fail:
//
//   1. SKILL.md is replaced by editions/copilot/SKILL.md (Agent Builder: SKILL.md at the ZIP
//      root, instructions under 20,000 characters, browser-free commands, explicit fallback).
//   2. NOTICE, LICENSE and LICENSE-MIT become NOTICE.txt, LICENSE.txt, LICENSE-MIT.txt
//      (Agent Builder accepts listed file types only), and the one module that embeds them in
//      every page reads the new names. The notice text in pages is unchanged.
//   3. Left out: the explainer's page renderer assets (explainer/vendor/**, deeper than three
//      folders; explainer/reader.css, not an accepted type), the rendered example pages
//      (examples/*.html, 17 MB of output, not needed to run), the agent installer (install.mjs)
//      and the explainer authoring guide. The explainer modules that diagram checks import stay.
//   4. skill-release.json has no update manifest URL: the sandbox has no network.
//
// Usage:
//   node scripts/build-copilot-skill.mjs [out.zip]     build (official Node 22 with zlib 1.3.1-e00f703,
//                                                      like scripts/build-zip.sh, for byte-stable output)
//   node scripts/build-copilot-skill.mjs --verify <zip> unpack a ZIP and compare it with a fresh staging,
//                                                      then check Agent Builder's package rules (any Node)
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sameEntry } from '../archi-made-easy/renderers/shared/path-semantics.mjs';
import { stageCleanSkill } from './stage-clean-skill.mjs';
import { extractZip } from './release-archive.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const COPILOT_ZIP = 'archi-made-easy-copilot.zip';

/** Microsoft 365 Copilot Agent Builder skill package rules (Microsoft Learn, updated 2026-11-04). */
export const AGENT_BUILDER_RULES = Object.freeze({
  maxZipBytes: 50 * 1024 * 1024,
  maxFileBytes: 25 * 1024 * 1024,
  maxFiles: 350,
  maxDepth: 3,
  maxInstructionChars: 20000,
  types: Object.freeze(['json', 'xml', 'yaml', 'yml', 'ini', 'config', 'utf8', 'docx', 'doc', 'docm', 'pdf', 'txt', 'rtf', 'md',
    'ppt', 'pptx', 'ppsm', 'xlsx', 'xls', 'xlsm', 'csv', 'tsv', 'html', 'htm', 'png', 'jpg', 'jpeg', 'gif', 'bmp', 'log',
    'py', 'js', 'mjs', 'cjs', 'ts', 'mts', 'sh', 'bash']),
});

const RENAMES = Object.freeze({ NOTICE: 'NOTICE.txt', LICENSE: 'LICENSE.txt', 'LICENSE-MIT': 'LICENSE-MIT.txt' });
const NOTICES_MODULE = 'renderers/shared/software-notices.mjs';
const NOTICES_FROM = "fs.readFileSync(new URL(`../../${name}`, import.meta.url), 'utf8')";
const NOTICES_TO = "fs.readFileSync(new URL(`../../${({ NOTICE: 'NOTICE.txt', LICENSE: 'LICENSE.txt', 'LICENSE-MIT': 'LICENSE-MIT.txt' })[name] || name}`, import.meta.url), 'utf8')";
const LEFT_OUT = [
  (rel) => rel.startsWith('explainer/vendor/'),
  (rel) => rel === 'explainer/reader.css',
  (rel) => /^examples\/[^/]+\.html$/.test(rel),
  (rel) => rel === 'install.mjs',
  (rel) => rel === 'references/explainer-authoring.md',
];

const walk = (dir, base = dir) => fs.readdirSync(dir, { withFileTypes: true })
  .flatMap((entry) => (entry.isDirectory() ? walk(path.join(dir, entry.name), base) : [path.relative(base, path.join(dir, entry.name)).split(path.sep).join('/')]));

/** Stage the Copilot Edition into `destination` (created). Returns the sorted file list. */
export function stageCopilotEdition(destination) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'archi-made-easy-copilot-stage-'));
  try {
    const full = path.join(work, 'archi-made-easy');
    stageCleanSkill({ repoRoot, destination: full });
    fs.mkdirSync(destination, { recursive: true });
    for (const rel of walk(full)) {
      if (LEFT_OUT.some((test) => test(rel)) || rel === 'SKILL.md') continue;
      const target = path.join(destination, RENAMES[rel] ?? rel);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(full, rel), target);
    }
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
  // 1. Copilot instructions at the root.
  fs.copyFileSync(path.join(repoRoot, 'editions', 'copilot', 'SKILL.md'), path.join(destination, 'SKILL.md'));
  // 2. Notices under accepted file names, read by the module that embeds them.
  const notices = path.join(destination, NOTICES_MODULE);
  const source = fs.readFileSync(notices, 'utf8');
  if (source.split(NOTICES_FROM).length !== 2) throw new Error(`${NOTICES_MODULE} changed: the notice-path transform no longer applies`);
  fs.writeFileSync(notices, source.replace(NOTICES_FROM, NOTICES_TO));
  for (const [from, to] of Object.entries(RENAMES)) {
    if (!fs.existsSync(path.join(destination, to)) || fs.existsSync(path.join(destination, from))) throw new Error(`rename ${from} -> ${to} failed`);
  }
  // 4. No update manifest: the sandbox has no network.
  const releasePath = path.join(destination, 'skill-release.json');
  const release = JSON.parse(fs.readFileSync(releasePath, 'utf8'));
  if (!('updateManifestUrl' in release)) throw new Error('skill-release.json has no updateManifestUrl field');
  release.updateManifestUrl = null;
  fs.writeFileSync(releasePath, `${JSON.stringify(release, null, 2)}\n`);
  return walk(destination).sort();
}

const extension = (rel) => (rel.match(/\.([^./]+)$/) || [, ''])[1].toLowerCase();

/** Check an unpacked edition against Agent Builder's package rules. Returns { ok, problems, facts }. */
export function checkAgentBuilderRules(dir, zipBytes = null) {
  const files = walk(dir).sort();
  const problems = [];
  const sizes = Object.fromEntries(files.map((rel) => [rel, fs.statSync(path.join(dir, rel)).size]));
  const depth = (rel) => rel.split('/').length - 1;
  const skill = fs.existsSync(path.join(dir, 'SKILL.md')) ? fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8') : null;
  if (!skill) problems.push('SKILL.md is not at the package root');
  const front = skill?.match(/^---\n([\s\S]*?)\n---\n/);
  const field = (name) => front?.[1].match(new RegExp(`^${name}:\\s*(.+)$`, 'm'))?.[1].trim().replace(/^"|"$/g, '');
  if (!field('name')) problems.push('SKILL.md front matter has no name');
  if (!field('description')) problems.push('SKILL.md front matter has no description');
  const instructions = skill ? skill.slice(front ? front[0].length : 0) : '';
  if (skill && skill.length >= AGENT_BUILDER_RULES.maxInstructionChars) problems.push(`SKILL.md is ${skill.length} characters (limit ${AGENT_BUILDER_RULES.maxInstructionChars})`);
  if (files.length > AGENT_BUILDER_RULES.maxFiles) problems.push(`${files.length} files (limit ${AGENT_BUILDER_RULES.maxFiles})`);
  if (zipBytes != null && zipBytes > AGENT_BUILDER_RULES.maxZipBytes) problems.push(`ZIP is ${zipBytes} bytes (limit 50 MB)`);
  for (const rel of files) {
    if (depth(rel) > AGENT_BUILDER_RULES.maxDepth) problems.push(`${rel}: deeper than ${AGENT_BUILDER_RULES.maxDepth} folders`);
    if (!AGENT_BUILDER_RULES.types.includes(extension(rel))) problems.push(`${rel}: file type not accepted by Agent Builder`);
    if (sizes[rel] > AGENT_BUILDER_RULES.maxFileBytes) problems.push(`${rel}: larger than 25 MB`);
  }
  const lower = new Map();
  for (const rel of files) { const key = rel.toLowerCase(); if (lower.has(key)) problems.push(`duplicate path (case): ${lower.get(key)} and ${rel}`); lower.set(key, rel); }
  const byHash = new Map();
  for (const rel of files) {
    const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, rel))).digest('hex');
    if (byHash.has(hash) && sizes[rel] > 0) problems.push(`duplicate content: ${byHash.get(hash)} and ${rel}`);
    byHash.set(hash, rel);
  }
  return {
    ok: problems.length === 0, problems,
    facts: {
      files: files.length, unpackedBytes: Object.values(sizes).reduce((a, b) => a + b, 0), maxDepth: Math.max(...files.map(depth)),
      skillMdChars: skill?.length ?? 0, instructionChars: instructions.length, name: field('name'), descriptionChars: field('description')?.length ?? 0,
      types: [...new Set(files.map(extension))].sort(),
    },
  };
}

/** Unpack `zip`, compare it with a fresh staging and check the package rules. */
export function verifyCopilotZip(zip) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'archi-made-easy-copilot-verify-'));
  try {
    const unpacked = path.join(work, 'zip'); const fresh = path.join(work, 'fresh');
    const entries = extractZip(fs.readFileSync(zip), unpacked);
    const staged = stageCopilotEdition(fresh);
    const inZip = walk(unpacked).sort();
    const missing = staged.filter((rel) => !inZip.includes(rel));
    const extra = inZip.filter((rel) => !staged.includes(rel));
    const differ = staged.filter((rel) => inZip.includes(rel) && !fs.readFileSync(path.join(unpacked, rel)).equals(fs.readFileSync(path.join(fresh, rel))));
    const rules = checkAgentBuilderRules(unpacked, fs.statSync(zip).size);
    return {
      zip: path.basename(zip), bytes: fs.statSync(zip).size, sha256: crypto.createHash('sha256').update(fs.readFileSync(zip)).digest('hex'),
      entries: entries.length, matchesSources: !missing.length && !extra.length && !differ.length, missing, extra, differ, rules,
    };
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

function buildZip(out) {
  const node = process.versions.node.split('.')[0];
  if (node !== '22' || process.versions.zlib !== '1.3.1-e00f703') {
    throw new Error(`byte-stable ${COPILOT_ZIP} builds need official Node 22 with zlib 1.3.1-e00f703 (current: Node ${process.versions.node}, zlib ${process.versions.zlib}); use --verify to check a ZIP with any Node`);
  }
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'archi-made-easy-copilot-build-'));
  try {
    const dir = path.join(work, 'edition');
    const files = stageCopilotEdition(dir);
    const rules = checkAgentBuilderRules(dir);
    if (!rules.ok) throw new Error(`the edition breaks Agent Builder's package rules:\n- ${rules.problems.join('\n- ')}`);
    const modes = path.join(work, 'modes.json');
    fs.writeFileSync(modes, JSON.stringify(Object.fromEntries(files.map((rel) => [rel, '100644']))));
    const run = spawnSync(process.execPath, [path.join(repoRoot, 'scripts', 'write-deterministic-zip.mjs'), dir, out, '--mode-manifest', modes, '--contents-only'], { encoding: 'utf8' });
    if (run.status !== 0) throw new Error(run.stderr || run.stdout);
    return { out, files: files.length, ...rules.facts };
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

if (process.argv[1] && sameEntry(process.argv[1], fileURLToPath(import.meta.url)).status === 'match') {
  const args = process.argv.slice(2);
  if (args[0] === '--verify') {
    const report = verifyCopilotZip(path.resolve(args[1] ?? path.join(repoRoot, COPILOT_ZIP)));
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.matchesSources && report.rules.ok ? 0 : 1;
  } else {
    const out = path.resolve(args[0] ?? path.join(repoRoot, COPILOT_ZIP));
    const result = buildZip(out);
    console.log(`built ${path.basename(out)}: ${result.files} files, depth ${result.maxDepth}, SKILL.md ${result.skillMdChars} characters`);
  }
}
