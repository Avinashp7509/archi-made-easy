// draw.io / diagrams.net export: an uncompressed mxfile that opens with the same placement
// the document declares (grid cells or explicit positions).

import { ASYNC, PASSIVE, boundaryForest, xmlEscape } from './shared.mjs';

const DEFAULT_GRID = { origin: [40, 80], gapX: 30, gapY: 40, cellW: 130, cellH: 64 };
const DEFAULT_SIZE = [130, 60];
const PAD = 28;
const STYLE = {
  frontend: 'fillColor=#dbeafe;strokeColor=#2563eb;',
  backend: 'fillColor=#d1fae5;strokeColor=#059669;',
  database: 'fillColor=#ede9fe;strokeColor=#7c3aed;',
  cloud: 'fillColor=#fef3c7;strokeColor=#d97706;',
  security: 'fillColor=#ffe4e6;strokeColor=#e11d48;',
  messagebus: 'fillColor=#ffedd5;strokeColor=#ea580c;',
  external: 'fillColor=#f1f5f9;strokeColor=#64748b;',
};

/** Top-left position and size of every component, from the document's own layout. */
export function componentBoxes(document) {
  const grid = document.layout?.mode === 'grid' ? { ...DEFAULT_GRID, ...document.layout } : null;
  const boxes = new Map();
  let fallback = 0;
  for (const component of document.components) {
    const [width, height] = Array.isArray(component.size) ? component.size : grid ? [grid.cellW, grid.cellH] : DEFAULT_SIZE;
    let position;
    if (Array.isArray(component.pos) && component.pos.length === 2) position = component.pos;
    else if (grid && Number.isInteger(component.row) && Number.isInteger(component.col)) {
      position = [grid.origin[0] + component.col * (grid.cellW + grid.gapX), grid.origin[1] + component.row * (grid.cellH + grid.gapY)];
    } else { position = [40 + (fallback % 5) * 180, 80 + Math.floor(fallback / 5) * 120]; fallback += 1; }
    boxes.set(component.id, { x: position[0], y: position[1], width, height });
  }
  return boxes;
}

export function toDrawio(document, model) {
  const boxes = componentBoxes(document);
  const typeOf = new Map(document.components.map((c) => [c.id, c.type]));
  const forest = boundaryForest(model);
  const cells = ['<mxCell id="0"/>', '<mxCell id="1" parent="0"/>'];

  const everyMember = (boundary) => model.boundaries.find((b) => b.id === boundary.id).members.filter((id) => boxes.has(id));
  const emitBoundary = (boundary, depth) => {
    const members = everyMember(boundary).map((id) => boxes.get(id));
    if (members.length) {
      const pad = PAD + depth * 0;
      const x = Math.min(...members.map((b) => b.x)) - pad;
      const y = Math.min(...members.map((b) => b.y)) - pad - 14;
      const right = Math.max(...members.map((b) => b.x + b.width)) + pad;
      const bottom = Math.max(...members.map((b) => b.y + b.height)) + pad;
      const style = `rounded=1;whiteSpace=wrap;html=1;dashed=1;fillColor=none;strokeColor=${boundary.kind === 'security-group' ? '#e11d48' : '#d97706'};verticalAlign=top;align=left;spacingLeft=8;fontStyle=1;`;
      cells.push(`<mxCell id="b-${xmlEscape(boundary.id)}" value="${xmlEscape(boundary.label)}" style="${style}" vertex="1" parent="1"><mxGeometry x="${x}" y="${y}" width="${right - x}" height="${bottom - y}" as="geometry"/></mxCell>`);
    }
    for (const child of forest.children(boundary.id)) emitBoundary(child, depth + 1);
  };
  // Outer boundaries first so inner ones and components draw on top.
  for (const boundary of forest.roots) emitBoundary(boundary, 0);

  for (const node of [...model.nodes].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const box = boxes.get(node.id);
    if (!box) continue;
    const cylinder = ['stateful-db', 'object-store', 'cache'].includes(node.role);
    const base = cylinder ? 'shape=cylinder3;boundedLbl=1;size=8;' : node.actor ? 'shape=umlActor;verticalLabelPosition=bottom;verticalAlign=top;' : 'rounded=1;';
    const value = node.sublabel ? `${xmlEscape(node.label)}&lt;br&gt;&lt;font style=&quot;font-size:10px&quot;&gt;${xmlEscape(node.sublabel)}&lt;/font&gt;` : xmlEscape(node.label);
    cells.push(`<mxCell id="n-${xmlEscape(node.id)}" value="${value}" style="${base}whiteSpace=wrap;html=1;${STYLE[typeOf.get(node.id)] ?? STYLE.backend}" vertex="1" parent="1"><mxGeometry x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" as="geometry"/></mxCell>`);
  }
  for (const edge of [...model.edges].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (!boxes.has(edge.from) || !boxes.has(edge.to)) continue;
    const dashed = ASYNC.has(edge.call_semantics) || PASSIVE.has(edge.call_semantics) ? 'dashed=1;' : '';
    cells.push(`<mxCell id="e-${xmlEscape(edge.id)}" value="${xmlEscape(edge.label ?? '')}" style="edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;endArrow=block;${dashed}" edge="1" parent="1" source="n-${xmlEscape(edge.from)}" target="n-${xmlEscape(edge.to)}"><mxGeometry relative="1" as="geometry"/></mxCell>`);
  }
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<mxfile host="Archi-Made-Easy">',
    `  <diagram id="architecture" name="${xmlEscape(model.title || 'Architecture')}">`,
    '    <mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" math="0" shadow="0">',
    '      <root>',
    ...cells.map((line) => `        ${line}`),
    '      </root>',
    '    </mxGraphModel>',
    '  </diagram>',
    '</mxfile>',
    '',
  ].join('\n');
}
