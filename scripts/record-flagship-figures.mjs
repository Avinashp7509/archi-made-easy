#!/usr/bin/env node
// Regression benchmark for the analytical model: the figures of every flagship example
// (and of every child diagram it carries) and of every provider example, healthy and under
// each preset scenario.
//
//   node scripts/record-flagship-figures.mjs           write test/fixtures/flagship-figures.json
//   node scripts/record-flagship-figures.mjs --check   exit 1 if the engine no longer produces them
//
// A change to the engine or to an example that moves any figure shows up as a diff of the
// recorded file, to be read and accepted on purpose. The figures are modelled, never measured.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildModel } from '../archi-made-easy/workbench/model.mjs';
import { buildScenarios } from '../archi-made-easy/workbench/scenarios.mjs';
import { figures } from '../archi-made-easy/workbench/remedy.mjs';
import { sameEntry } from '../archi-made-easy/renderers/shared/path-semantics.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const RECORD_PATH = path.join(root, 'test', 'fixtures', 'flagship-figures.json');
export const FLAGSHIPS = [
  'global-fintech-payment-mesh.architecture.json',
  'enterprise-agentic-ai-platform.architecture.json',
  'cloud-native-ecommerce-c4.architecture.json',
];

/** The scaffolded example of each provider, as paths under archi-made-easy/examples. */
export function providerExamples() {
  return fs.readdirSync(path.join(root, 'archi-made-easy', 'examples', 'providers')).filter((name) => name.endsWith('.architecture.json')).sort().map((name) => `providers/${name}`);
}

function record(document) {
  const { model } = buildModel(document);
  const basis = figures(model, {});
  const scenarios = Object.fromEntries(buildScenarios(model).map((scenario) => [
    scenario.id,
    scenario.applicable ? { title: scenario.title, targets: scenario.targets, figures: figures(model, scenario.inputs) } : { title: scenario.title, applicable: false },
  ]));
  const levels = Object.fromEntries((document.workbench?.drilldowns || []).map((drilldown) => [drilldown.id, record(drilldown.spec)]));
  return {
    title: document.meta.title,
    components: model.nodes.length,
    connections: model.edges.length,
    healthy: basis,
    scenarios,
    ...(Object.keys(levels).length ? { levels } : {}),
  };
}

/** @returns {object} the figures the engine produces now */
export function currentFigures() {
  return {
    note: 'Modelled figures of the flagship and provider examples, recorded as a regression benchmark for the engine. Nothing here is measured.',
    examples: Object.fromEntries([...FLAGSHIPS, ...providerExamples()].map((name) => [name, record(JSON.parse(fs.readFileSync(path.join(root, 'archi-made-easy', 'examples', name), 'utf8')))])),
  };
}

if (process.argv[1] && sameEntry(process.argv[1], fileURLToPath(import.meta.url)).status === 'match') {
  const text = `${JSON.stringify(currentFigures(), null, 2)}\n`;
  if (process.argv.includes('--check')) {
    const recorded = fs.existsSync(RECORD_PATH) ? fs.readFileSync(RECORD_PATH, 'utf8').replace(/\r\n/g, '\n') : '';
    if (recorded !== text) {
      console.error('The flagship figures differ from test/fixtures/flagship-figures.json. Read the difference, then record it with: node scripts/record-flagship-figures.mjs');
      process.exit(1);
    }
    console.log('flagship figures match the record');
  } else {
    fs.writeFileSync(RECORD_PATH, text);
    console.log(`wrote ${path.relative(root, RECORD_PATH)}`);
  }
}
