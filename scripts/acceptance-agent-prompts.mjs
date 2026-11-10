#!/usr/bin/env node
// Acceptance test 4 (docs/program/PLAN.md, section 9): a real agent with the skill installed
// receives each of the nine example prompts of the product vision, in plain language, and
// must return a valid interactive artifact or an evidence-based answer.
//
//   node scripts/acceptance-agent-prompts.mjs --zip archi-made-easy.zip --out <evidence-dir> [--only 1,4] [--budget-usd 15]
//
// For each prompt: a fresh project folder outside this repository, the skill installed into
// it from the release archive with the bundled installer (project scope), the prompt's
// fixture files copied in, then one headless Claude Code run in that folder. The agent uses
// the account and the model configured for Claude Code on this machine. Nothing is retried.
// If the agent ends its turn with a question instead of a result, as the skill tells it to
// when a critical fact is missing, it gets one reply accepting its defaults, in the same
// session, and that is recorded. Runs are sequential; each has a spending cap and a time limit.
//
// These runs are billed to the account. Run them only with the owner's consent.

import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractZip } from './release-archive.mjs';
import { sameEntry } from '../archi-made-easy/renderers/shared/path-semantics.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtures = path.join(repoRoot, 'test', 'fixtures', 'acceptance');

/** The nine prompts, verbatim from the product brief, with the files a user would have. */
export const PROMPTS = [
  { id: 1, prompt: 'Build a highly available e-commerce architecture on Azure.', kind: 'create', fixture: null },
  { id: 2, prompt: 'Create a secure banking application architecture.', kind: 'create', fixture: null },
  { id: 3, prompt: 'Design a multi-region AWS architecture for 10 million users.', kind: 'create', fixture: null },
  { id: 4, prompt: 'Review this solution architecture and identify risks.', kind: 'analyse', fixture: 'existing-architecture' },
  { id: 5, prompt: 'What happens if the database fails?', kind: 'analyse', fixture: 'existing-architecture' },
  { id: 6, prompt: 'Simulate a 20x increase in traffic.', kind: 'analyse', fixture: 'existing-architecture' },
  { id: 7, prompt: 'Optimize this architecture for lower cost.', kind: 'analyse', fixture: 'existing-architecture' },
  { id: 8, prompt: 'Convert my application repository into an interactive architecture diagram.', kind: 'create', fixture: 'application-repository' },
  { id: 9, prompt: 'Create an architecture from my uploaded requirements document.', kind: 'create', fixture: 'requirements-document' },
];
const FOLLOW_UP = 'Go ahead with your suggested defaults.';
// The tools a coding agent normally has, minus the network and sub-agents: the run must be
// explainable from the skill alone.
const TOOLS = 'Bash,Read,Write,Edit,Glob,Grep,Skill,TodoWrite';

function arg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

function findClaude() {
  const candidates = [
    process.env.ARCHI_MADE_EASY_CLAUDE,
    path.join(os.homedir(), '.local', 'bin', process.platform === 'win32' ? 'claude.exe' : 'claude'),
  ].filter(Boolean);
  for (const candidate of candidates) if (fs.existsSync(candidate)) return candidate;
  const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['claude'], { encoding: 'utf8' });
  return which.status === 0 ? which.stdout.split(/\r?\n/)[0].trim() : null;
}

/** The environment of a user's own terminal: no variables of the session that started this script. */
function userEnvironment() {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_AGENT_SDK|CLAUDE_PID|ARCHI_MADE_EASY_)/.test(key)));
  // The release identity is still a placeholder, so there is no update feed to ask.
  env.ARCHI_MADE_EASY_UPDATE_CHECK_DISABLED = '1';
  return env;
}

function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name); const target = path.join(to, entry.name);
    if (entry.isDirectory()) copyTree(source, target); else fs.copyFileSync(source, target);
  }
}
function listFiles(directory, base = directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === '.claude' || entry.name === 'node_modules' ? [] : listFiles(full, base);
    return [path.relative(base, full).split(path.sep).join('/')];
  });
}

/** One headless turn. Resolves with the parsed stream and the final result record. */
function runTurn(claude, args, { cwd, env, transcript, timeoutMs }) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(claude, args, { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const out = fs.createWriteStream(transcript, { flags: 'a' });
    let buffer = ''; let stderr = ''; const events = []; let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs);
    child.stdout.on('data', (chunk) => {
      out.write(chunk);
      buffer += chunk.toString('utf8');
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).trim(); buffer = buffer.slice(newline + 1);
        if (!line) continue;
        try { events.push(JSON.parse(line)); } catch { /* a partial or non-JSON line stays in the transcript */ }
      }
    });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
    child.on('close', (code) => {
      clearTimeout(timer); out.end();
      resolve({ code, timedOut, stderr: stderr.slice(-4000), events, ms: Date.now() - started, result: events.filter((event) => event.type === 'result').pop() ?? null });
    });
  });
}

/** What the agent did, from its tool calls: commands run and skill use. */
function summariseTools(events) {
  const commands = []; const skills = []; let toolCalls = 0;
  for (const event of events) {
    if (event.type !== 'assistant') continue;
    for (const part of event.message?.content || []) {
      if (part.type !== 'tool_use') continue;
      toolCalls += 1;
      if (part.name === 'Skill') skills.push(part.input?.skill ?? part.input?.name ?? '?');
      if (part.name === 'Bash') {
        const command = String(part.input?.command ?? '');
        const verb = command.match(/archi-made-easy\.mjs"?\s+([a-z-]+)/);
        if (verb) commands.push(verb[1]);
      }
    }
  }
  return { toolCalls, skills, archiMadeEasyCommands: commands };
}

function verifyArtifact(file, installedCli, env) {
  const run = (args) => spawnSync(process.execPath, [installedCli, ...args], { encoding: 'utf8', env, maxBuffer: 1 << 26 });
  const parse = (result) => { try { return JSON.parse(result.stdout); } catch { return null; } };
  const html = fs.readFileSync(file, 'utf8');
  const check = parse(run(['check', file, '--json']));
  const browser = parse(run(['browser-check', file, '--json']));
  return {
    file: path.basename(file), bytes: html.length,
    interactiveWorkbench: html.includes('id="archi-made-easy-workbench-data"'),
    checks: check ? { ok: check.ok, passed: (check.checks || []).filter((c) => c.ok).length, total: (check.checks || []).length } : null,
    browserCheck: browser ? { ok: browser.ok, status: browser.status ?? null } : null,
  };
}

async function main() {
  const zipPath = path.resolve(arg('--zip', path.join(repoRoot, 'archi-made-easy.zip')));
  const outDirectory = path.resolve(arg('--out', path.join(repoRoot, 'docs', 'program', 'acceptance', 'agent-runs')));
  const only = arg('--only') ? new Set(arg('--only').split(',').map(Number)) : null;
  const budget = Number(arg('--budget-usd', '15'));
  const timeoutMs = Number(arg('--timeout-min', '30')) * 60000;
  const claude = findClaude();
  if (!claude) throw new Error('Claude Code is not installed: no claude executable found.');
  fs.mkdirSync(outDirectory, { recursive: true });
  const zipBytes = fs.readFileSync(zipPath);
  const version = spawnSync(claude, ['--version'], { encoding: 'utf8' }).stdout.trim();
  const env = userEnvironment();
  const records = [];

  for (const entry of PROMPTS.filter((p) => !only || only.has(p.id))) {
    const project = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `ame-agent-${entry.id}-`)));
    const release = path.join(project, '..', `${path.basename(project)}-release`);
    fs.mkdirSync(release);
    extractZip(zipBytes, release);
    const install = spawnSync(process.execPath, [path.join(release, 'archi-made-easy', 'install.mjs'), '--agent', 'claude-code', '--project', project, '--json'], { encoding: 'utf8', env });
    let installed = null;
    try { installed = JSON.parse(install.stdout).results?.[0] ?? null; } catch { /* reported below */ }
    if (entry.fixture) copyTree(path.join(fixtures, entry.fixture), project);
    // "This architecture" is one the user made earlier: the document and its page, rendered
    // here by the installed copy, as the skill would have left them.
    if (entry.fixture === 'existing-architecture' && installed) {
      spawnSync(process.execPath, [path.join(installed.dir, 'bin', 'archi-made-easy.mjs'), 'render', 'architecture', 'solution.architecture.json', 'solution.html'], { cwd: project, env, encoding: 'utf8' });
    }
    const before = new Set(listFiles(project));
    const transcript = path.join(outDirectory, `prompt-${entry.id}.stream.jsonl`);
    fs.rmSync(transcript, { force: true });
    const base = ['--output-format', 'stream-json', '--verbose', '--tools', TOOLS, '--allowedTools', TOOLS, '--permission-mode', 'dontAsk', '--strict-mcp-config', '--max-budget-usd', String(budget)];
    console.log(`prompt ${entry.id}: ${entry.prompt}`);
    const turns = [];
    const first = await runTurn(claude, ['-p', entry.prompt, ...base], { cwd: project, env, transcript, timeoutMs });
    turns.push(first);
    let produced = listFiles(project).filter((file) => !before.has(file));
    const finalText = (turn) => String(turn.result?.result ?? '');
    const asked = !first.timedOut && first.result && !first.result.is_error && produced.filter((file) => file.endsWith('.html')).length === 0 && /\?\s*$|\?\s*\n|go ahead/i.test(finalText(first)) && entry.kind === 'create';
    if (asked && first.result.session_id) {
      console.log(`  the agent asked a question; one reply: "${FOLLOW_UP}"`);
      const second = await runTurn(claude, ['-p', FOLLOW_UP, '--resume', first.result.session_id, ...base], { cwd: project, env, transcript, timeoutMs });
      turns.push(second);
      produced = listFiles(project).filter((file) => !before.has(file));
    }
    const installedCli = installed ? path.join(installed.dir, 'bin', 'archi-made-easy.mjs') : null;
    // Browser-check evidence folders hold captures, not deliverables.
    const pages = produced.filter((file) => file.endsWith('.html') && file.split('/').every((segment) => !/browser-check/.test(segment)));
    const artifacts = installedCli ? pages.map((file) => verifyArtifact(path.join(project, file), installedCli, env)) : [];
    const sum = (key) => turns.reduce((total, turn) => total + (turn.result?.usage?.[key] ?? 0), 0);
    const tools = summariseTools(turns.flatMap((turn) => turn.events));
    const record = {
      id: entry.id, prompt: entry.prompt, kind: entry.kind, fixture: entry.fixture,
      installed: installed ? { status: installed.status, doctor: installed.verify?.ok ?? null } : { status: 'failed', note: install.stderr.slice(-400) },
      turns: turns.map((turn, index) => ({
        prompt: index === 0 ? entry.prompt : FOLLOW_UP, exit: turn.code, timedOut: turn.timedOut, ms: turn.ms,
        subtype: turn.result?.subtype ?? null, isError: turn.result?.is_error ?? null, numTurns: turn.result?.num_turns ?? null,
        costUsd: turn.result?.total_cost_usd ?? null, models: turn.result?.modelUsage ? Object.keys(turn.result.modelUsage) : null,
        stderr: turn.code === 0 ? undefined : turn.stderr,
      })),
      usage: { input_tokens: sum('input_tokens'), output_tokens: sum('output_tokens'), cache_creation_input_tokens: sum('cache_creation_input_tokens'), cache_read_input_tokens: sum('cache_read_input_tokens') },
      costUsd: Math.round(turns.reduce((total, turn) => total + (turn.result?.total_cost_usd ?? 0), 0) * 10000) / 10000,
      tools, filesProduced: produced, artifacts,
      finalAnswer: finalText(turns[turns.length - 1]),
    };
    records.push(record);
    // The project folder is kept until the evidence is read: its artifacts are copied next to the transcript.
    const artifactDirectory = path.join(outDirectory, `prompt-${entry.id}-files`);
    fs.rmSync(artifactDirectory, { recursive: true, force: true });
    for (const file of produced) { const target = path.join(artifactDirectory, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(path.join(project, file), target); }
    fs.writeFileSync(path.join(outDirectory, `prompt-${entry.id}.json`), `${JSON.stringify(record, null, 2)}\n`);
    console.log(`  ${record.turns.map((turn) => `${turn.subtype ?? 'no result'} in ${Math.round(turn.ms / 1000)} s`).join(', ')}; $${record.costUsd}; ${pages.length} page(s); commands: ${tools.archiMadeEasyCommands.join(' ') || 'none'}`);
    fs.rmSync(project, { recursive: true, force: true });
    fs.rmSync(release, { recursive: true, force: true });
  }
  const summary = {
    schemaVersion: 1, kind: 'agent-prompt-acceptance', date: new Date().toISOString(), platform: `${os.platform()} ${os.release()}`, node: process.version,
    agent: `Claude Code ${version}`, archive: { file: path.basename(zipPath), sha256: crypto.createHash('sha256').update(zipBytes).digest('hex') },
    settings: { tools: TOOLS, permissionMode: 'dontAsk', mcpServers: 'none', budgetUsdPerTurn: budget, timeoutMinutes: timeoutMs / 60000, followUp: FOLLOW_UP },
    totalCostUsd: Math.round(records.reduce((total, record) => total + record.costUsd, 0) * 10000) / 10000,
    runs: records.map(({ id, prompt, costUsd, artifacts, tools, turns }) => ({ id, prompt, costUsd, turns: turns.length, pages: artifacts.length, commands: tools.archiMadeEasyCommands })),
  };
  fs.writeFileSync(path.join(outDirectory, only ? `summary-${[...only].join('-')}.json` : 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`total cost $${summary.totalCostUsd}`);
}

if (process.argv[1] && sameEntry(process.argv[1], fileURLToPath(import.meta.url)).status === 'match') {
  main().catch((error) => { console.error(error.stack || String(error)); process.exitCode = 1; });
}
