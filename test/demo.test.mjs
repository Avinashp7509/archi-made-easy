// The hosted demo (docs/demo/): it is exactly what scripts/build-demo.mjs builds, it is still one
// checked diagram, and the model facts its wording depends on hold. The journey in a real
// browser is test/demo-browser.test.mjs.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildModel } from '../archi-made-easy/workbench/model.mjs';
import { simulate } from '../archi-made-easy/workbench/sim.mjs';
import { applyPatches, recoveryPlan } from '../archi-made-easy/workbench/remedy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const doc = JSON.parse(fs.readFileSync(path.join(root, 'scripts/demo/checkout.architecture.json'), 'utf8'));
const FAULT = { faults: { nodes: { orders_db: 'down' } } };

test('docs/demo is what scripts/build-demo.mjs builds from its sources', () => {
  const check = spawnSync(process.execPath, [path.join(root, 'scripts/build-demo.mjs'), '--check'], { encoding: 'utf8' });
  assert.equal(check.status, 0, check.stderr || check.stdout);
});

test('the demo page passes the nine artifact checks and carries the guided layer once', () => {
  const page = path.join(root, 'docs/demo/index.html');
  const result = spawnSync(process.execPath, [path.join(root, 'archi-made-easy/scripts/check-render-output.mjs'), page], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stdout.slice(0, 1500));
  assert.ok(JSON.parse(result.stdout).checks.every((check) => check.ok));
  const html = fs.readFileSync(page, 'utf8');
  assert.equal(html.split('id="archi-made-easy-demo-script"').length - 1, 1);
  assert.match(html, /<html[^>]* data-demo="checkout"/);
  assert.match(html, /<meta property="og:image" content="https:\/\/avinashp7509\.github\.io\/archi-made-easy\/demo\/preview\.png">/);
  const guided = fs.readFileSync(path.join(root, 'scripts/demo/guided.js'), 'utf8');
  for (const sink of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(']) assert.equal(guided.includes(sink), false, `guided.js uses ${sink}`);
});

test('the model facts the demo states hold for its design', () => {
  const { model } = buildModel(doc);
  const failure = simulate(model, FAULT);
  const state = (id) => failure.nodes[id].state;
  // "The database is down: every checkout fails"
  assert.equal(state('orders_db'), 'failing');
  assert.equal(state('checkout'), 'failing');
  assert.equal(state('gateway'), 'failing');
  assert.equal(failure.kpis.blast_radius.ingress_share, 1);
  // "Keeps running", including fulfilment of orders already queued
  for (const id of ['payments', 'events', 'fulfilment']) assert.equal(state(id), 'ok', id);
  // The improvement compared is the engine's own recovery option, and it helps this failure.
  const option = recoveryPlan(doc, FAULT).options.find((o) => o.id === 'standby:orders_db');
  assert.ok(option?.previewable, 'the standby option is offered and previewed');
  const withModel = buildModel(applyPatches(doc, option.patches)).model;
  const after = simulate(withModel, FAULT);
  assert.equal(after.kpis.blast_radius.ingress_share, 0);
  assert.equal(Object.values(after.nodes).filter((n) => n.state === 'failing').length, 0);
  assert.ok(after.events.some((event) => event.type === 'dr-failover'));
  // The takeover time and data loss are not stated, which the page says.
  assert.deepEqual([after.nodes.orders_db.failover.rto_sec, after.nodes.orders_db.failover.rpo_sec], [null, null]);
  // Normal-day availability improves, and only from assumed figures (the page labels them).
  const before = simulate(model, {}).kpis.composite_sla_percent;
  const improved = simulate(withModel, {}).kpis.composite_sla_percent;
  assert.ok(improved > before);
  assert.equal(model.nodes.find((n) => n.id === 'orders_db').basis.sla_percent, 'assumed');
  // No prices are stated, so the page says cost is not modelled.
  assert.equal(doc.components.some((c) => c.operational?.finops), false);
});
