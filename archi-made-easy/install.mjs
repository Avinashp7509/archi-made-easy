#!/usr/bin/env node
// Archi-Made-Easy installer. Zero dependencies; Node.js 18 or newer.
//
// Copies this skill folder into the skill directory of one or more AI coding agents,
// then runs `doctor` from the installed copy.
//
//   node install.mjs --agent claude-code                 global install for one agent
//   node install.mjs --agent cursor --agent codex        several agents
//   node install.mjs --agent claude-code --project .     project install
//   node install.mjs --dest <skills-dir>                 any other Agent Skills client
//   node install.mjs --list                              show agents and target folders
//   options: --dry-run, --uninstall, --replace, --no-verify, --json
//
// Safety: an existing folder is replaced only if this installer created it (it carries
// INSTALL_MARKER) and --replace is given. Unmanaged folders are never modified.
//
// Target folders mirror the agent registry of the `skills` CLI (vercel-labs/skills,
// MIT, version 1.7.0). An agent's own documentation is authoritative; see
// references/installation.md for the evidence level of each agent.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SKILL_NAME = 'archi-made-easy';
export const INSTALL_MARKER = '.archi-made-easy-install.json';
const skillRoot = path.dirname(fileURLToPath(import.meta.url));

// Never copied into an agent's skill directory. Mirrors scripts/stage-clean-skill.mjs
// (the release packager) so an install from a source checkout matches a release;
// test/installer.test.mjs fails if the two lists drift.
export const EXCLUDED_SEGMENTS = new Set(['.DS_Store', '.hive', '.workbuddy', 'node_modules', INSTALL_MARKER]);
export const EXCLUDED_FILES = new Set(['package-lock.json', 'scripts/generate-brand-marks.mjs', 'scripts/generate-validators.mjs']);

export function agentTable(env = process.env, home = os.homedir()) {
  const configHome = env.XDG_CONFIG_HOME?.trim() || path.join(home, '.config');
  const codexHome = env.CODEX_HOME?.trim() || path.join(home, '.codex');
  const claudeHome = env.CLAUDE_CONFIG_DIR?.trim() || path.join(home, '.claude');
  return {
    'claude-code': { name: 'Claude Code', project: '.claude/skills', global: path.join(claudeHome, 'skills') },
    codex: { name: 'OpenAI Codex', project: '.agents/skills', global: path.join(codexHome, 'skills') },
    'github-copilot': { name: 'GitHub Copilot', project: '.agents/skills', global: path.join(home, '.copilot', 'skills') },
    cursor: { name: 'Cursor', project: '.agents/skills', global: path.join(home, '.cursor', 'skills') },
    opencode: { name: 'OpenCode', project: '.agents/skills', global: path.join(configHome, 'opencode', 'skills') },
    windsurf: { name: 'Windsurf', project: '.windsurf/skills', global: path.join(home, '.codeium', 'windsurf', 'skills') },
    'gemini-cli': { name: 'Gemini CLI', project: '.agents/skills', global: path.join(home, '.gemini', 'skills') },
  };
}

export function parseArgs(argv) {
  const options = { agents: [], dests: [], project: null, dryRun: false, uninstall: false, replace: false, verify: true, json: false, list: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = () => {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) throw new UsageError(`${arg} needs a value`);
      i += 1;
      return next;
    };
    if (arg === '--agent') options.agents.push(value());
    else if (arg === '--dest') options.dests.push(value());
    else if (arg === '--project') options.project = value();
    else if (arg === '--global') options.project = null;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--uninstall') options.uninstall = true;
    else if (arg === '--replace') options.replace = true;
    else if (arg === '--no-verify') options.verify = false;
    else if (arg === '--json') options.json = true;
    else if (arg === '--list') options.list = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new UsageError(`unknown option ${arg}`);
  }
  return options;
}

export class UsageError extends Error {}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function packageVersion() {
  return readJson(path.join(skillRoot, 'package.json'))?.version ?? 'unknown';
}

/** Resolve every requested target to { label, dir } where dir is <skills-dir>/archi-made-easy. */
export function resolveTargets(options, env = process.env, home = os.homedir()) {
  const table = agentTable(env, home);
  const targets = [];
  for (const id of options.agents) {
    const agent = table[id];
    if (!agent) throw new UsageError(`unknown agent "${id}". Known: ${Object.keys(table).join(', ')}. For another client use --dest <skills-dir>.`);
    const base = options.project ? path.resolve(options.project, agent.project) : agent.global;
    targets.push({ label: `${agent.name} (${options.project ? 'project' : 'global'})`, agent: id, dir: path.join(base, SKILL_NAME) });
  }
  for (const dest of options.dests) targets.push({ label: `custom (${dest})`, agent: null, dir: path.join(path.resolve(dest), SKILL_NAME) });
  // Several agents can share one folder (for example .agents/skills in a project).
  const seen = new Map();
  for (const target of targets) {
    // The targets usually do not exist yet, so they are compared by name with the same rule
    // as isSamePath: case folds only where the file system usually ignores case.
    const key = pathKey(target.dir);
    if (seen.has(key)) seen.get(key).label += `, ${target.label}`;
    else seen.set(key, target);
  }
  return [...seen.values()];
}

function pathKey(value) {
  const resolved = path.resolve(value);
  return process.platform === 'win32' || process.platform === 'darwin' ? resolved.toLowerCase() : resolved;
}

function isSamePath(a, b) {
  return pathKey(a) === pathKey(b);
}

function copyTree(from, to, relative = '') {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const rel = relative ? `${relative}/${entry.name}` : entry.name;
    if (EXCLUDED_SEGMENTS.has(entry.name) || EXCLUDED_FILES.has(rel)) continue;
    // Staging folders of an interrupted install are never copied.
    if (entry.name.includes('.installing-')) continue;
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isSymbolicLink()) continue; // never follow or reproduce links
    if (entry.isDirectory()) copyTree(source, target, rel);
    else if (entry.isFile()) fs.copyFileSync(source, target);
  }
}

/** Install, replace or uninstall one target. Returns a result record; never throws for per-target problems. */
export function applyTarget(target, options) {
  const { dir } = target;
  const markerPath = path.join(dir, INSTALL_MARKER);
  const exists = fs.existsSync(dir);
  const managed = exists && fs.existsSync(markerPath);
  if (isSamePath(dir, skillRoot)) return { ...target, status: 'skipped', reason: 'target is this package itself' };

  if (options.uninstall) {
    if (!exists) return { ...target, status: 'absent' };
    if (!managed) return { ...target, status: 'refused', reason: 'folder exists but was not installed by this installer; left untouched' };
    if (!options.dryRun) fs.rmSync(dir, { recursive: true, force: true });
    return { ...target, status: options.dryRun ? 'would-remove' : 'removed' };
  }

  if (exists && !managed) return { ...target, status: 'refused', reason: 'folder exists and is not managed by this installer; move it away or choose another target' };
  if (managed && !options.replace) return { ...target, status: 'refused', reason: `already installed (${readJson(markerPath)?.version ?? 'unknown version'}); rerun with --replace to update` };
  if (options.dryRun) return { ...target, status: managed ? 'would-replace' : 'would-install' };

  // Copy into a sibling staging folder, then swap, so a failed copy never leaves a half install.
  const staging = `${dir}.installing-${process.pid}`;
  fs.rmSync(staging, { recursive: true, force: true });
  copyTree(skillRoot, staging);
  fs.writeFileSync(path.join(staging, INSTALL_MARKER), `${JSON.stringify({
    schemaVersion: 1,
    skill: SKILL_NAME,
    version: packageVersion(),
    installedBy: 'archi-made-easy/install.mjs',
  }, null, 2)}\n`);
  if (managed) fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  fs.renameSync(staging, dir);
  return { ...target, status: managed ? 'replaced' : 'installed' };
}

/** Run `doctor` from an installed copy. */
export function verifyInstalled(dir) {
  const result = spawnSync(process.execPath, [path.join(dir, 'bin', `${SKILL_NAME}.mjs`), 'doctor'], { encoding: 'utf8' });
  return { ok: result.status === 0, output: `${result.stdout}${result.stderr}`.trim().split('\n').slice(-1)[0] };
}

const HELP = `Archi-Made-Easy installer ${packageVersion()}

  node install.mjs --agent <id> [--agent <id> ...] [--project <dir> | --global]
  node install.mjs --dest <skills-dir>
  node install.mjs --list
  Options: --dry-run  --uninstall  --replace  --no-verify  --json

Agents: ${Object.keys(agentTable()).join(', ')}`;

export function main(argv = process.argv.slice(2), env = process.env) {
  let options;
  try { options = parseArgs(argv); } catch (error) {
    console.error(`${error.message}\n\n${HELP}`);
    return 2;
  }
  if (options.help) { console.log(HELP); return 0; }
  if (options.list) {
    const table = agentTable(env);
    for (const [id, agent] of Object.entries(table)) console.log(`${id.padEnd(15)} ${agent.name.padEnd(15)} global: ${agent.global}  project: <dir>/${agent.project}`);
    return 0;
  }
  if (options.agents.length === 0 && options.dests.length === 0) {
    console.error(`Choose at least one --agent or --dest.\n\n${HELP}`);
    return 2;
  }
  let targets;
  try { targets = resolveTargets(options, env); } catch (error) {
    console.error(error.message);
    return 2;
  }
  const results = targets.map((target) => {
    try {
      const result = applyTarget(target, options);
      if (options.verify && (result.status === 'installed' || result.status === 'replaced')) result.verify = verifyInstalled(target.dir);
      return result;
    } catch (error) {
      return { ...target, status: 'failed', reason: error.message };
    }
  });
  const failed = results.filter((r) => r.status === 'refused' || r.status === 'failed' || (r.verify && !r.verify.ok));
  if (options.json) console.log(JSON.stringify({ schemaVersion: 1, version: packageVersion(), dryRun: options.dryRun, results }, null, 2));
  else {
    for (const r of results) {
      const verify = r.verify ? (r.verify.ok ? ' · doctor ok' : ` · doctor FAILED: ${r.verify.output}`) : '';
      console.log(`${r.status.padEnd(13)} ${r.label}\n              ${r.dir}${r.reason ? `\n              ${r.reason}` : ''}${verify}`);
    }
    if (!failed.length && !options.dryRun && !options.uninstall) console.log('\nRestart the agent (or open a new session) so it discovers the skill, then ask for an architecture in plain language.');
  }
  return failed.length ? 1 : 0;
}

if (process.argv[1] && isSamePath(process.argv[1], fileURLToPath(import.meta.url))) process.exitCode = main();
