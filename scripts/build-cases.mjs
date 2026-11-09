#!/usr/bin/env node
// Re-render every published case page in docs/cases from its checked-in source:
// `<name>.<type>.json` diagrams and `<name>.archi-made-easy.md` explainers.
// Each page is rendered by the public CLI, so cases always carry the current viewer.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const casesRoot = path.join(repoRoot, 'docs', 'cases');
const cli = path.join(repoRoot, 'archi-made-easy', 'bin', 'archi-made-easy.mjs');
const TYPES = new Set(['architecture', 'workflow', 'sequence', 'dataflow', 'lifecycle', 'erd', 'class', 'tree', 'timeline', 'waterfall']);

function sources(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return sources(full);
    const diagram = entry.name.match(/^(.+)\.([a-z]+)\.json$/);
    if (diagram && TYPES.has(diagram[2])) return [{ type: diagram[2], input: full, output: path.join(directory, `${diagram[1]}.${diagram[2]}.html`) }];
    const explainer = entry.name.match(/^(.+)\.archi-made-easy\.md$/);
    if (explainer) return [{ type: 'explainer', input: full, output: path.join(directory, `${explainer[1]}.html`) }];
    return [];
  }).sort((a, b) => a.input.localeCompare(b.input));
}

// Cases that declare repository evidence are verified against a local checkout of the
// pinned revision: pass `--repos <dir>` holding checkouts named after each repository
// (for example <dir>/mco for https://github.com/mco-org/mco).
const reposFlag = process.argv.indexOf('--repos');
const reposRoot = reposFlag === -1 ? null : path.resolve(process.argv[reposFlag + 1] || '');

function repoRootArgs(input) {
  if (!input.endsWith('.json')) return [];
  const repository = JSON.parse(fs.readFileSync(input, 'utf8')).meta?.repository;
  if (!repository?.url) return [];
  const name = repository.url.replace(/\.git$/, '').split('/').pop();
  if (!reposRoot) throw new Error(`${path.basename(input)} declares evidence from ${repository.url}@${repository.revision}; pass --repos <dir> with a checkout at ${name}/`);
  return ['--repo-root', path.join(reposRoot, name)];
}

let failures = 0;
const all = sources(casesRoot);
for (const { type, input, output } of all) {
  let extra;
  try { extra = repoRootArgs(input); } catch (error) {
    failures += 1;
    console.error(`skipped ${path.relative(repoRoot, output)}: ${error.message}`);
    continue;
  }
  const result = spawnSync(process.execPath, [cli, 'render', type, input, output, ...extra], { encoding: 'utf8' });
  const label = path.relative(repoRoot, output).split(path.sep).join('/');
  if (result.status === 0) console.log(`rendered ${label}`);
  else {
    failures += 1;
    console.error(`failed ${label}\n${result.stderr || result.stdout}`);
  }
}
console.log(`${all.length - failures}/${all.length} case pages rendered`);
process.exitCode = failures ? 1 : 0;
