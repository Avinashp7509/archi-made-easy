// Architecture workbench commands. Loaded on demand by archi-made-easy.mjs so the main
// CLI keeps working when it is copied on its own. All analysis logic lives in workbench/.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describePatterns, scaffold, ScaffoldError } from '../workbench/scaffold.mjs';

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const knowledgeRoot = path.join(skillRoot, 'knowledge');

function readJson(...segments) {
  return JSON.parse(fs.readFileSync(path.join(knowledgeRoot, ...segments), 'utf8'));
}

function listJson(directory) {
  return fs.readdirSync(path.join(knowledgeRoot, directory)).filter((name) => name.endsWith('.json')).sort()
    .map((name) => readJson(directory, name));
}

export function loadKnowledge() {
  return { slots: readJson('slots.json'), patterns: listJson('patterns'), providers: listJson('providers') };
}

class UsageError extends Error {}

function parseScaffoldArgs(args) {
  const options = { pattern: null, provider: 'onprem', title: null, out: null, output: null, json: false, list: false, force: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = () => {
      const next = args[index + 1];
      if (next === undefined || next.startsWith('--')) throw new UsageError(`${arg} needs a value.`);
      index += 1;
      return next;
    };
    if (arg === '--list') options.list = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '--force') options.force = true;
    else if (arg === '--provider') options.provider = value();
    else if (arg === '--title') options.title = value();
    else if (arg === '--out') options.out = value();
    else if (arg === '--output') options.output = value();
    else if (arg.startsWith('--')) throw new UsageError(`Unknown scaffold option ${arg}.`);
    else if (options.pattern === null) options.pattern = arg;
    else throw new UsageError(`Unexpected argument "${arg}".`);
  }
  return options;
}

/**
 * scaffold --list [--json]
 * scaffold <pattern> [--provider azure|aws|gcp|onprem] [--title text] [--output name.html] [--out candidate.json] [--force] [--json]
 * @returns {number} exit code
 */
export function commandScaffold(args, { stdout = process.stdout, stderr = process.stderr, cwd = process.cwd() } = {}) {
  const failure = (message, code = 'scaffold/invalid-arguments') => {
    if (args.includes('--json')) stdout.write(`${JSON.stringify({ schemaVersion: 1, ok: false, command: 'scaffold', diagnostics: [{ code, severity: 'error', message }] }, null, 2)}\n`);
    else stderr.write(`${message}\n`);
    return 2;
  };
  let options;
  try { options = parseScaffoldArgs(args); } catch (error) {
    if (error instanceof UsageError) return failure(error.message);
    throw error;
  }
  const knowledge = loadKnowledge();
  const catalogue = describePatterns(knowledge.patterns);
  const providerIds = knowledge.providers.map((provider) => provider.id);

  if (options.list) {
    if (options.json) stdout.write(`${JSON.stringify({ schemaVersion: 1, ok: true, command: 'scaffold', patterns: catalogue, providers: knowledge.providers.map(({ id, name, version, reviewed }) => ({ id, name, version, reviewed })) }, null, 2)}\n`);
    else {
      stdout.write('Patterns:\n');
      for (const entry of catalogue) stdout.write(`  ${entry.id.padEnd(28)} ${entry.status === 'implemented' ? '' : `[${entry.status}] `}${entry.title}\n`);
      stdout.write(`\nProviders: ${providerIds.join(', ')}\n`);
    }
    return 0;
  }
  if (!options.pattern) return failure(`Name a pattern, or use --list. Patterns: ${catalogue.map((entry) => entry.id).join(', ')}.`);
  const pattern = knowledge.patterns.find((entry) => entry.id === options.pattern);
  if (!pattern) return failure(`Unknown pattern "${options.pattern}". Patterns: ${catalogue.map((entry) => entry.id).join(', ')}.`, 'scaffold/unknown-pattern');
  const provider = knowledge.providers.find((entry) => entry.id === options.provider);
  if (!provider) return failure(`Unknown provider "${options.provider}". Providers: ${providerIds.join(', ')}.`, 'scaffold/unknown-provider');

  let document;
  try {
    document = scaffold({ slots: knowledge.slots, pattern, provider }, { title: options.title, output: options.output });
  } catch (error) {
    if (error instanceof ScaffoldError) return failure(error.message, 'scaffold/unavailable-pattern');
    throw error;
  }
  const text = `${JSON.stringify(document, null, 2)}\n`;
  if (!options.out) {
    stdout.write(text);
    return 0;
  }
  const candidatePath = path.resolve(cwd, options.out);
  if (fs.existsSync(candidatePath) && !options.force) return failure(`${options.out} already exists. Choose another --out, or pass --force to replace it.`, 'scaffold/output-exists');
  fs.mkdirSync(path.dirname(candidatePath), { recursive: true });
  fs.writeFileSync(candidatePath, text);
  const next = `archi-made-easy finalize architecture ${options.out} ${document.meta.output} --quality showcase --json`;
  if (options.json) {
    stdout.write(`${JSON.stringify({
      schemaVersion: 1, ok: true, command: 'scaffold',
      pattern: { id: pattern.id, title: pattern.title },
      provider: { id: provider.id, name: provider.name, version: provider.version, reviewed: provider.reviewed },
      candidate: { path: candidatePath, components: document.components.length, connections: document.connections.length },
      guidance: 'Adapt the candidate to the request: rename, add or remove components, and replace assumptions with the user\'s facts. No traffic, latency, availability or cost figure is set.',
      nextAction: next,
    }, null, 2)}\n`);
  } else stdout.write(`Wrote ${options.out} (${pattern.title}, ${provider.name}).\nAdapt it to the request, then run:\n  ${next}\n`);
  return 0;
}
