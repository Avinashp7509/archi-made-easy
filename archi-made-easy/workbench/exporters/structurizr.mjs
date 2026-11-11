// Structurizr DSL export. Actors become people, external services become external software
// systems, and every other component becomes a container of one software system. The
// smallest boundary around a component becomes a group.

import { PASSIVE, boundaryForest, edgeText, idMap, oneLine } from './shared.mjs';

// Authored text as one Structurizr DSL string. The DSL is read a line at a time (a lone CR
// also ends a line), so every line break is folded. Its only escape is \" and a backslash is
// otherwise literal, so a quote is written as \" and a value that ends in a backslash gets an
// invisible word joiner before the closing quote. It substitutes ${NAME} with constants and
// environment variables, so a word joiner is put between $ and {.
const WORD_JOINER = '\u2060';
const q = (value) => {
  let text = oneLine(value).replace(/"/g, '\\"').replace(/\$\{/g, () => `$${WORD_JOINER}{`);
  if (text.endsWith('\\')) text += WORD_JOINER;
  return `"${text}"`;
};
const isExternal = (node) => ['external-saas', 'ai-model'].includes(node.role);

export function toStructurizr(model) {
  const ids = idMap([...model.nodes.map((n) => n.id), 'system']);
  const forest = boundaryForest(model);
  const nodeById = new Map(model.nodes.map((n) => [n.id, n]));
  const lines = [`workspace ${q(model.title || 'Architecture')} ${q('Exported from an Archi-Made-Easy architecture document.')} {`, '', '  model {'];

  for (const node of model.nodes.filter((n) => n.actor).sort((a, b) => (a.id < b.id ? -1 : 1))) {
    lines.push(`    ${ids.get(node.id)} = person ${q(node.label)} ${q(node.sublabel || '')}`);
  }
  for (const node of model.nodes.filter((n) => !n.actor && isExternal(n)).sort((a, b) => (a.id < b.id ? -1 : 1))) {
    lines.push(`    ${ids.get(node.id)} = softwareSystem ${q(node.label)} ${q(node.sublabel || '')} "External"`);
  }
  lines.push(`    ${ids.get('system')} = softwareSystem ${q(model.title || 'System')} {`);
  const container = (id, pad) => {
    const node = nodeById.get(id);
    const tag = ['stateful-db', 'object-store', 'cache'].includes(node.role) ? 'Database' : ['message-broker', 'stream'].includes(node.role) ? 'Queue' : 'Service';
    lines.push(`${pad}${ids.get(id)} = container ${q(node.label)} ${q(node.sublabel || '')} ${q(node.role)} ${q(tag)}`);
  };
  const internal = (id) => { const node = nodeById.get(id); return !node.actor && !isExternal(node); };
  for (const id of forest.loose.filter(internal)) container(id, '      ');
  const emitGroup = (boundary, depth) => {
    const pad = '      ' + '  '.repeat(depth);
    const own = forest.members(boundary.id).filter(internal);
    const nested = forest.children(boundary.id);
    if (own.length === 0 && nested.length === 0) return;
    lines.push(`${pad}group ${q(boundary.label)} {`);
    for (const id of own) container(id, `${pad}  `);
    for (const child of nested) emitGroup(child, depth + 1);
    lines.push(`${pad}}`);
  };
  for (const boundary of forest.roots) emitGroup(boundary, 0);
  lines.push('    }', '');

  for (const edge of [...model.edges].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (!ids.has(edge.from) || !ids.has(edge.to) || edge.from === edge.to) continue;
    const description = edgeText(edge);
    const technology = edge.protocol ?? (PASSIVE.has(edge.call_semantics) ? edge.call_semantics : '');
    lines.push(`    ${ids.get(edge.from)} -> ${ids.get(edge.to)} ${q(description)}${technology ? ` ${q(technology)}` : ''}`);
  }
  lines.push('  }', '', '  views {',
    `    systemContext ${ids.get('system')} "context" {`, '      include *', '      autolayout lr', '    }',
    `    container ${ids.get('system')} "containers" {`, '      include *', '      autolayout lr', '    }',
    '    styles {',
    '      element "Person" {', '        shape person', '      }',
    '      element "Database" {', '        shape cylinder', '      }',
    '      element "Queue" {', '        shape pipe', '      }',
    '      element "External" {', '        background #999999', '        color #ffffff', '      }',
    '    }', '  }', '}', '');
  return lines.join('\n');
}
