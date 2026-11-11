// Mermaid export: flowchart, C4 and sequence diagrams from an architecture model.

import { ASYNC, PASSIVE, boundaryForest, edgeText, idMap, mdText, oneLine } from './shared.mjs';

// Authored text inside a Mermaid diagram, written with Mermaid's entity codes so that it is
// text in every position. In a quoted label it cannot close the string, start a tag or end
// the code fence of the Markdown around it. Every line break is folded (Mermaid also ends a
// line at a lone CR). A percent sign is encoded even inside quotes, because Mermaid looks for
// `%%{init: …}%%` directives anywhere in the diagram text.
const CODES = { '#': '#35;', '"': '#quot;', '<': '#lt;', '>': '#gt;', '`': '#96;', ';': '#59;', '%': '#37;' };
const encode = (value, characters) => oneLine(value).replace(characters, (character) => CODES[character]);
const text = (value) => encode(value, /[#"<>`%]/g);
// Outside quotes (a title, a participant name, a message, a note) a semicolon would end the
// statement and a percent sign could start a comment, so those are encoded as well.
const bare = (value) => encode(value, /[#"<>`;%]/g);

function shape(node, id) {
  const label = `"${text(node.label)}${node.sublabel ? `<br/>${text(node.sublabel)}` : ''}"`;
  if (node.actor) return `${id}([${label}])`;
  if (['stateful-db', 'object-store', 'cache'].includes(node.role)) return `${id}[(${label})]`;
  if (['message-broker', 'stream'].includes(node.role)) return `${id}[[${label}]]`;
  if (['external-saas', 'ai-model'].includes(node.role)) return `${id}{{${label}}}`;
  return `${id}[${label}]`;
}

export function toMermaidFlowchart(model, { direction = 'LR' } = {}) {
  const ids = idMap([...model.nodes.map((n) => n.id), ...model.boundaries.map((b) => `boundary_${b.id}`)]);
  const nodeById = new Map(model.nodes.map((n) => [n.id, n]));
  const forest = boundaryForest(model);
  const lines = [`flowchart ${direction}`];
  const emitBoundary = (boundary, depth) => {
    const pad = '  '.repeat(depth);
    lines.push(`${pad}subgraph ${ids.get(`boundary_${boundary.id}`)}["${text(boundary.label)}"]`);
    for (const id of forest.members(boundary.id)) lines.push(`${pad}  ${shape(nodeById.get(id), ids.get(id))}`);
    for (const child of forest.children(boundary.id)) emitBoundary(child, depth + 1);
    lines.push(`${pad}end`);
  };
  for (const id of forest.loose) lines.push(`  ${shape(nodeById.get(id), ids.get(id))}`);
  for (const boundary of forest.roots) emitBoundary(boundary, 1);
  for (const edge of [...model.edges].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) continue;
    const dashed = ASYNC.has(edge.call_semantics) || PASSIVE.has(edge.call_semantics);
    const label = edge.label ? `|"${text(edge.label)}"|` : '';
    lines.push(`  ${ids.get(edge.from)} ${dashed ? '-.->' : '-->'}${label} ${ids.get(edge.to)}`);
  }
  return lines.join('\n');
}

export function toMermaidC4(model) {
  const ids = idMap([...model.nodes.map((n) => n.id), ...model.boundaries.map((b) => `boundary_${b.id}`)]);
  const nodeById = new Map(model.nodes.map((n) => [n.id, n]));
  const forest = boundaryForest(model);
  const levels = new Set(model.nodes.map((n) => n.c4_level).filter(Boolean));
  const context = levels.size === 1 && levels.has('context');
  const lines = [context ? 'C4Context' : 'C4Container', `  title ${bare(model.title)}`];
  const element = (node) => {
    const id = ids.get(node.id);
    const description = text(node.sublabel || '');
    if (node.actor) return `Person(${id}, "${text(node.label)}", "${description}")`;
    if (['external-saas', 'ai-model'].includes(node.role)) return `System_Ext(${id}, "${text(node.label)}", "${description}")`;
    if (context) return `System(${id}, "${text(node.label)}", "${description}")`;
    const kind = ['stateful-db', 'object-store', 'cache'].includes(node.role) ? 'ContainerDb' : ['message-broker', 'stream'].includes(node.role) ? 'ContainerQueue' : 'Container';
    return `${kind}(${id}, "${text(node.label)}", "${node.role}", "${description}")`;
  };
  const emitBoundary = (boundary, depth) => {
    const pad = '  '.repeat(depth);
    lines.push(`${pad}Boundary(${ids.get(`boundary_${boundary.id}`)}, "${text(boundary.label)}") {`);
    for (const id of forest.members(boundary.id)) lines.push(`${pad}  ${element(nodeById.get(id))}`);
    for (const child of forest.children(boundary.id)) emitBoundary(child, depth + 1);
    lines.push(`${pad}}`);
  };
  for (const id of forest.loose) lines.push(`  ${element(nodeById.get(id))}`);
  for (const boundary of forest.roots) emitBoundary(boundary, 1);
  for (const edge of [...model.edges].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) continue;
    const label = text(edgeText(edge));
    lines.push(`  Rel(${ids.get(edge.from)}, ${ids.get(edge.to)}, "${label}"${edge.protocol ? `, "${text(edge.protocol)}"` : ''})`);
  }
  return lines.join('\n');
}

/** Ordered request steps: an authored trace, or the blocking and async calls reachable from the entries. */
function defaultSteps(model) {
  const steps = [];
  const seen = new Set();
  const visit = (id) => {
    for (const edge of model.edges.filter((e) => e.from === id && !PASSIVE.has(e.call_semantics)).sort((a, b) => (a.id < b.id ? -1 : 1))) {
      if (seen.has(edge.id)) continue;
      seen.add(edge.id);
      steps.push({ edge: edge.id });
      visit(edge.to);
    }
  };
  for (const entry of [...model.entrypoints].sort()) visit(entry);
  return steps;
}

export function toMermaidSequences(model) {
  const ids = idMap(model.nodes.map((n) => n.id));
  const nodeById = new Map(model.nodes.map((n) => [n.id, n]));
  const edgeById = new Map(model.edges.map((e) => [e.id, e]));
  const traces = model.traces.length ? model.traces : [{ id: 'request-path', title: 'Request path', kind: 'happy', steps: defaultSteps(model) }];
  return traces.map((trace) => {
    const edges = trace.steps.map((step) => ({ step, edge: edgeById.get(step.edge) })).filter((item) => item.edge);
    const order = [];
    for (const { edge } of edges) for (const id of [edge.from, edge.to]) if (!order.includes(id)) order.push(id);
    const lines = ['sequenceDiagram', `  title ${bare(trace.title)}`];
    for (const id of order) {
      const node = nodeById.get(id);
      lines.push(`  ${node.actor ? 'actor' : 'participant'} ${ids.get(id)} as ${bare(node.label)}`);
    }
    for (const { step, edge } of edges) {
      const arrow = ASYNC.has(edge.call_semantics) ? '-)' : '->>';
      lines.push(`  ${ids.get(edge.from)}${arrow}${ids.get(edge.to)}: ${bare(edgeText(edge))}`);
      if (step.note) lines.push(`  Note over ${ids.get(edge.from)},${ids.get(edge.to)}: ${bare(step.note)}`);
    }
    return { id: trace.id, title: trace.title, kind: trace.kind, text: lines.join('\n') };
  });
}

/** One Markdown document with all three Mermaid views. */
export function toMermaidMarkdown(model) {
  const fence = (body) => `\`\`\`mermaid\n${body}\n\`\`\``;
  const sequences = toMermaidSequences(model);
  return [
    `# ${mdText(model.title)}`, '',
    '## Flowchart', '', fence(toMermaidFlowchart(model)), '',
    '## C4', '', fence(toMermaidC4(model)), '',
    ...sequences.flatMap((sequence) => [`## Sequence: ${mdText(sequence.title)}`, '', fence(sequence.text), '']),
  ].join('\n');
}
