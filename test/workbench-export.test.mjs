// Exporters: Mermaid, draw.io, Structurizr DSL and the RFC document, plus the export command.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadKnowledge } from '../archi-made-easy/bin/workbench.mjs';
import { scaffold } from '../archi-made-easy/workbench/scaffold.mjs';
import { buildModel } from '../archi-made-easy/workbench/model.mjs';
import { toMermaidFlowchart, toMermaidC4, toMermaidSequences, toMermaidMarkdown } from '../archi-made-easy/workbench/exporters/mermaid.mjs';
import { toDrawio, componentBoxes } from '../archi-made-easy/workbench/exporters/drawio.mjs';
import { toStructurizr } from '../archi-made-easy/workbench/exporters/structurizr.mjs';
import { toRfc } from '../archi-made-easy/workbench/exporters/rfc.mjs';
import { safeId, idMap, boundaryForest, plural } from '../archi-made-easy/workbench/exporters/shared.mjs';

const cli = fileURLToPath(new URL('../archi-made-easy/bin/archi-made-easy.mjs', import.meta.url));
const knowledge = loadKnowledge();
function pattern(id, provider = 'azure') {
  const document = scaffold({ slots: knowledge.slots, pattern: knowledge.patterns.find((p) => p.id === id), provider: knowledge.providers.find((p) => p.id === provider) });
  return { document, model: buildModel(document).model };
}
const count = (text, needle) => text.split(needle).length - 1;

test('identifiers are safe, unique and stable', () => {
  assert.equal(safeId('api-db'), 'api_db');
  assert.equal(safeId('end'), 'n_end');
  assert.equal(safeId('9lives'), 'n_9lives');
  const map = idMap(['a-b', 'a_b', 'a.b']);
  assert.equal(new Set(map.values()).size, 3);
  assert.deepEqual([...idMap(['z', 'a']).keys()], ['a', 'z']);
  assert.deepEqual([plural(1, 'boundary'), plural(2, 'boundary'), plural(0, 'component')], ['1 boundary', '2 boundaries', '0 components']);
});

test('nested boundaries form a forest and each component has one home', () => {
  const { model } = pattern('web-ha');
  model.boundaries.push({ id: 'inner', label: 'Inner', kind: 'security-group', scope: 'trust-zone', members: ['app', 'db'], basis: {} });
  const forest = boundaryForest(model);
  assert.deepEqual(forest.roots.map((b) => b.id), ['region']);
  assert.deepEqual(forest.children('region').map((b) => b.id), ['inner']);
  assert.deepEqual(forest.members('inner'), ['app', 'db']);
  assert.equal(forest.members('region').includes('app'), false);
  assert.deepEqual(forest.loose, ['cdn', 'identity', 'static', 'users']);
});

test('Mermaid flowchart: every component and connection once, shapes by role, async dashed', () => {
  const { model } = pattern('web-ha');
  const text = toMermaidFlowchart(model);
  assert.match(text, /^flowchart LR\n/);
  for (const node of model.nodes) assert.equal(count(text, `"${node.label}<br/>`), 1, node.id);
  assert.equal(count(text, '-->') + count(text, '-.->'), model.edges.length);
  assert.match(text, /users\(\["Users<br\/>Browser \/ mobile"\]\)/);
  assert.match(text, /db\[\("Azure SQL<br\/>Primary"\)\]/);
  assert.match(text, /queue\[\["Service Bus<br\/>Background jobs"\]\]/);
  assert.match(text, /app -\.->\|"enqueue"\| queue/);
  assert.match(text, /app -->\|"SQL"\| db/);
  assert.match(text, /subgraph boundary_region\["Region \(zone-redundant\)"\]/);
  assert.equal(count(text, 'subgraph'), count(text, '\n  end') + count(text, '\n    end'));
});

test('Mermaid escapes quotes and line breaks in labels', () => {
  const { model } = pattern('web-ha');
  model.nodes[0].label = 'Say "hi"\nnow';
  const text = toMermaidFlowchart(model);
  assert.match(text, /Say #quot;hi#quot; now/);
  assert.doesNotMatch(text, /Say "hi"/);
});

test('Mermaid C4: people, containers, databases, queues and external systems', () => {
  const ai = pattern('ai-agent-platform', 'aws').model;
  const text = toMermaidC4(ai);
  assert.match(text, /^C4Container\n  title AI agent platform on Amazon Web Services/);
  assert.match(text, /Person\(users, "Users"/);
  assert.match(text, /System_Ext\(n_model, "Bedrock"/, '"model" is a reserved word, so the identifier is prefixed');
  assert.match(text, /ContainerDb\(semcache, "ElastiCache", "cache"/);
  assert.match(text, /Boundary\(boundary_platform, "Platform trust zone"\) \{/);
  assert.equal(count(text, 'Rel('), ai.edges.length);
  assert.match(text, /Rel\(gateway, orchestrator, "calls", "HTTPS\/REST"\)/, 'an unlabelled connection gets a plain verb');
  const context = pattern('web-ha').model;
  for (const node of context.nodes) node.c4_level = 'context';
  assert.match(toMermaidC4(context), /^C4Context\n/);
});

test('Mermaid sequence: authored traces, or the request path when none is authored', () => {
  const { model } = pattern('web-ha');
  const [auto] = toMermaidSequences(model);
  assert.equal(auto.id, 'request-path');
  assert.match(auto.text, /^sequenceDiagram\n  title Request path\n  actor users as Users/);
  assert.match(auto.text, /users->>cdn: HTTPS/);
  assert.match(auto.text, /app-\)queue: enqueue/, 'asynchronous calls use an open arrow');
  model.traces = [{ id: 'checkout', title: 'Checkout', kind: 'happy', steps: [{ edge: 'users-cdn', note: 'TLS' }, { edge: 'cdn-lb' }] }];
  const [authored] = toMermaidSequences(model);
  assert.equal(authored.title, 'Checkout');
  assert.match(authored.text, /Note over users,cdn: TLS/);
  assert.equal(count(authored.text, '->>'), 2);
  const markdown = toMermaidMarkdown(model);
  assert.equal(count(markdown, '```mermaid'), 3);
  assert.match(markdown, /## Sequence: Checkout/);
});

test('draw.io: valid structure, declared positions, one cell per component and connection', () => {
  const { document, model } = pattern('web-ha');
  const xml = toDrawio(document, model);
  assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>\n<mxfile host="Archi-Made-Easy">/);
  assert.equal(count(xml, '<mxCell '), 2 + model.nodes.length + model.edges.length + model.boundaries.length);
  assert.equal(count(xml, '<mxCell '), count(xml, '</mxCell>') + 2, 'every content cell is closed');
  // Grid: origin [40,110], cell 130x60, gaps 80: the app sits at col 3, row 1.
  const boxes = componentBoxes(document);
  assert.deepEqual(boxes.get('app'), { x: 40 + 3 * 210, y: 110 + 140, width: 130, height: 60 });
  assert.match(xml, /id="n-app"[^>]*><mxGeometry x="670" y="250" width="130" height="60"/);
  assert.match(xml, /id="e-app-queue"[^>]*dashed=1;[^>]*source="n-app" target="n-queue"/);
  assert.match(xml, /id="n-db"[^>]*shape=cylinder3/);
  assert.match(xml, /id="b-region" value="Region \(zone-redundant\)"/);
  const ids = [...xml.matchAll(/<mxCell id="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, 'cell ids are unique');
});

test('draw.io escapes markup in labels and uses explicit positions when given', () => {
  const document = { schema_version: 1, diagram_type: 'architecture', meta: { title: 'A & B <x>', output: 'x.html' },
    components: [{ id: 'a', type: 'backend', label: 'A <b> & "c"', pos: [10, 20], size: [200, 80] }, { id: 'b', type: 'database', label: 'B', pos: [300, 20] }],
    connections: [{ id: 'ab', from: 'a', to: 'b', label: 'x < y' }] };
  const xml = toDrawio(document, buildModel(document).model);
  assert.match(xml, /name="A &amp; B &lt;x&gt;"/);
  assert.match(xml, /value="A &lt;b&gt; &amp; &quot;c&quot;"/);
  assert.match(xml, /value="x &lt; y"/);
  assert.match(xml, /id="n-a"[^>]*><mxGeometry x="10" y="20" width="200" height="80"/);
  assert.doesNotMatch(xml, /<b>|x < y/);
});

test('Structurizr DSL: people, containers in groups, external systems, relationships, views', () => {
  const { model } = pattern('event-driven', 'gcp');
  const dsl = toStructurizr(model);
  assert.match(dsl, /^workspace "Event-driven processing on Google Cloud" /);
  assert.match(dsl, /clients = person "Producers" "Apps, devices"/);
  assert.match(dsl, /partner = softwareSystem "Partner API" "Webhook" "External"/);
  assert.match(dsl, /group "Region \(zone-redundant\)" \{\n\s+api = container "Apigee"/);
  assert.match(dsl, /stream = container "Pub\/Sub" "Ordered, retained" "stream" "Queue"/);
  assert.match(dsl, /store = container "Firestore" "Read model" "stateful-db" "Database"/);
  assert.equal(count(dsl, ' -> '), model.edges.length);
  assert.match(dsl, /container system "containers" \{\n      include \*\n      autolayout lr/);
  assert.equal(count(dsl, '{'), count(dsl, '}'), 'braces balance');
  assert.match(toStructurizr({ ...model, title: 'Say "hi"' }), /workspace "Say \\"hi\\""/);
});

test('RFC document: sections, labelled model figures and assumed-value marks', () => {
  const { document, model } = pattern('web-ha');
  const rfc = toRfc(document, model);
  for (const heading of ['## 1. Summary', '## 2. Requirements and assumptions', '## 3. Architecture', '### Components', '### Connections', '## 4. Modelled behaviour', '## 5. Review', '## 6. Failure modes', '## 7. Scenarios', '## 8. Decisions', '## Appendix']) {
    assert.ok(rfc.includes(heading), heading);
  }
  assert.match(rfc, /analytical model of the declared design\. They are not measurements\./);
  assert.match(rfc, /- 9 components, 9 connections, 1 boundary\./);
  assert.match(rfc, /\| App Service \| stateless-compute \| multi-az \| 99\.9\* \|/, 'an assumed SLA carries an asterisk; an authored role does not');
  assert.match(rfc, /Estimated monthly cost \| not available \(no cost data\)/);
  assert.match(rfc, /### Zone redundancy before multi-region/);
  assert.match(rfc, /occurrence and detection are not rated/);
  assert.equal(count(rfc, '```mermaid'), 1);
  // Every table row has the same number of cells as its header.
  for (const block of rfc.split('\n\n').filter((b) => b.startsWith('| '))) {
    const widths = block.split('\n').map((line) => line.replace(/\\\|/g, '').split('|').length);
    assert.equal(new Set(widths).size, 1, block.split('\n')[0]);
  }
});

test('RFC document includes stated requirements', () => {
  const { document } = pattern('web-ha');
  document.workbench.requirements = { availability_target_percent: 99.95, p99_latency_ms: 500, monthly_budget_usd: 20000, compliance: ['PCI-DSS'] };
  const rfc = toRfc(document, buildModel(document).model);
  assert.match(rfc, /\| Availability target \| 99\.95% \|/);
  assert.match(rfc, /\| Monthly budget \| \$20000 \|/);
  assert.match(rfc, /\| Compliance \| PCI-DSS \|/);
});

test('every exporter works on every pattern and is deterministic', () => {
  for (const p of knowledge.patterns.filter((x) => x.status === 'implemented')) {
    const { document, model } = pattern(p.id, 'onprem');
    for (const render of [() => toMermaidMarkdown(model), () => toDrawio(document, model), () => toStructurizr(model), () => toRfc(document, model)]) {
      const first = render();
      assert.ok(first.length > 200, p.id);
      assert.equal(render(), first, `${p.id}: deterministic`);
      assert.doesNotMatch(first, /undefined|\[object Object\]|NaN/, p.id);
    }
  }
});

test('export command writes each format and protects existing files', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'archi-made-easy-export-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const run = (...args) => spawnSync(process.execPath, [cli, ...args], { cwd: dir, encoding: 'utf8' });
  assert.equal(run('scaffold', 'microservices', '--provider', 'aws', '--out', 'a.json').status, 0);
  for (const [format, file, probe] of [['mermaid', 'a.mermaid.md', '```mermaid'], ['drawio', 'a.drawio', '<mxfile'], ['structurizr', 'workspace.dsl', 'workspace "'], ['rfc', 'a.rfc.md', '## 5. Review']]) {
    const result = run('export', format, 'a.json', file);
    assert.equal(result.status, 0, `${format}: ${result.stderr}`);
    assert.ok(fs.readFileSync(path.join(dir, file), 'utf8').includes(probe), format);
  }
  const html = run('export', 'html', 'a.json', 'a.html', '--json');
  assert.equal(html.status, 0, html.stdout + html.stderr);
  assert.equal(JSON.parse(html.stdout).format, 'html');
  assert.match(fs.readFileSync(path.join(dir, 'a.html'), 'utf8'), /<meta name="generator" content="archi-made-easy /);

  const again = run('export', 'rfc', 'a.json', 'a.rfc.md');
  assert.equal(again.status, 2);
  assert.match(again.stderr, /already exists/);
  assert.equal(run('export', 'rfc', 'a.json', 'a.rfc.md', '--force').status, 0);
  assert.equal(run('export', 'pdf', 'a.json', 'a.pdf').status, 2);
  assert.match(run('export', 'png', 'a.json', 'a.png').stderr, /Image export is done in the viewer/);
  assert.equal(run('export', 'rfc', 'missing.json', 'x.md').status, 2);
  assert.equal(run('export', 'rfc').status, 2);
});

test('ids that are keywords in the target grammars are prefixed', () => {
  // `link` is a keyword in Mermaid sequence diagrams; an unprefixed participant id fails to parse there.
  assert.equal(safeId('link'), 'n_link');
  assert.equal(safeId('note'), 'n_note');
  assert.equal(safeId('component'), 'n_component');
  const { model } = pattern('hybrid');
  const [sequence] = toMermaidSequences(model);
  assert.match(sequence.text, /participant n_link as ExpressRoute/);
  assert.doesNotMatch(sequence.text, /^\s*(?:participant|actor) link /m);
  assert.match(sequence.text, /core->>n_link: calls/);
});
