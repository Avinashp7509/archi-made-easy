// Helpers shared by the text exporters. Pure and deterministic.

// Words the target grammars treat as keywords. `link` was found by parsing exports with the
// real Mermaid library: it is a keyword in sequence diagrams.
const RESERVED = new Set([
  // Mermaid flowchart and C4
  'end', 'graph', 'subgraph', 'class', 'style', 'click', 'default', 'direction', 'linkstyle', 'classdef',
  // Mermaid sequence diagrams
  'link', 'links', 'note', 'participant', 'actor', 'loop', 'alt', 'else', 'opt', 'par', 'and', 'rect', 'activate', 'deactivate',
  'title', 'box', 'autonumber', 'critical', 'option', 'break', 'create', 'destroy', 'over', 'properties', 'details',
  // Structurizr DSL
  'workspace', 'model', 'views', 'person', 'container', 'group', 'softwaresystem', 'component', 'element', 'styles', 'include', 'this',
]);

/** Identifier safe for Mermaid and Structurizr: letters, digits and underscores; never a reserved word. */
export function safeId(id) {
  const cleaned = String(id).replace(/[^A-Za-z0-9_]/g, '_');
  return RESERVED.has(cleaned.toLowerCase()) || /^[0-9]/.test(cleaned) ? `n_${cleaned}` : cleaned;
}

/** Map every id to a unique safe identifier (stable: ids are processed in sorted order). */
export function idMap(ids) {
  const used = new Set();
  const map = new Map();
  for (const id of [...ids].sort()) {
    let candidate = safeId(id);
    for (let n = 2; used.has(candidate); n += 1) candidate = `${safeId(id)}_${n}`;
    used.add(candidate);
    map.set(id, candidate);
  }
  return map;
}

export const ASYNC = new Set(['async-queue', 'async-pubsub', 'event-stream']);
export const PASSIVE = new Set(['replication-sync', 'replication-async', 'failover-route', 'heartbeat']);

const VERB = {
  'sync-blocking': 'calls', 'async-queue': 'enqueues to', 'async-pubsub': 'publishes to', 'event-stream': 'sends events to',
  'replication-sync': 'replicates to', 'replication-async': 'replicates to', 'failover-route': 'fails over to', heartbeat: 'checks health of',
};

/** The connection's own label, or a plain verb for its call semantics. */
export function edgeText(edge) {
  return edge.label || VERB[edge.call_semantics] || 'uses';
}

/** "1 boundary", "2 boundaries", "3 components". */
export function plural(count, word) {
  if (count === 1) return `1 ${word}`;
  return `${count} ${word.endsWith('y') ? `${word.slice(0, -1)}ies` : `${word}s`}`;
}

/**
 * Arrange boundaries as a forest: a boundary is nested in the smallest boundary whose
 * members strictly contain its own. Each component belongs to its smallest boundary.
 */
export function boundaryForest(model) {
  const boundaries = [...model.boundaries].sort((a, b) => (a.members.length - b.members.length) || (a.id < b.id ? -1 : 1));
  const contains = (outer, inner) => outer.members.length > inner.members.length && inner.members.every((id) => outer.members.includes(id));
  const parent = new Map();
  for (const boundary of boundaries) {
    const host = boundaries.find((other) => other.id !== boundary.id && contains(other, boundary));
    parent.set(boundary.id, host ? host.id : null);
  }
  const home = new Map();
  for (const node of model.nodes) {
    const owner = boundaries.find((boundary) => boundary.members.includes(node.id));
    home.set(node.id, owner ? owner.id : null);
  }
  const children = (id) => boundaries.filter((boundary) => parent.get(boundary.id) === id).sort((a, b) => (a.id < b.id ? -1 : 1));
  const members = (id) => model.nodes.filter((node) => home.get(node.id) === id).map((node) => node.id).sort();
  return { roots: children(null), children, members, loose: members(null) };
}

export function xmlEscape(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Every character sequence a consumer of the text exports may read as the end of a line:
// CommonMark, Mermaid and Java's line reader (Structurizr) all end a line at a lone CR as
// well as at LF and CRLF. Vertical tab, form feed, NEL and the Unicode line and paragraph
// separators are folded too.
const LINE_BREAKS = /\s*(?:\r\n|[\r\n\u000b\u000c\u0085\u2028\u2029])\s*/g;

/** Authored text on one line: every line break, with the spaces around it, becomes one space. */
export function oneLine(value) {
  return String(value ?? '').replace(LINE_BREAKS, ' ');
}

/**
 * Authored text as Markdown text. Whatever the author wrote, it comes out as text: it
 * cannot become emphasis, a link with hidden text, an image, a table cell boundary, a code
 * span or raw HTML, and it stays on one line. Two limits: where the text starts a line,
 * wrap it in `mdLineStart` so it cannot start a block; and a bare http(s), www or e-mail
 * address may still be shown as a link by renderers that autolink them (GitHub does), with
 * the address itself as the visible text.
 */
export function mdText(value) {
  return oneLine(value).replace(/[\\`*_[\]<>|]/g, '\\$&');
}

/**
 * Escaped authored text (from `mdText`) placed at the start of a line, for example as a
 * list item: no leading indentation (an indented code block), and a leading heading, list,
 * rule or fence marker is escaped. `*` and `>` are escaped by `mdText` already.
 */
export function mdLineStart(escaped) {
  return String(escaped).replace(/^\s+/, '').replace(/^([#+~=-])/, '\\$1').replace(/^(\d{1,9})([.)])/, '$1\\$2');
}

/** Markdown the exporter wrote itself (authored parts already escaped), for a table cell. */
export function preformatted(markdown) {
  return { markdown: String(markdown) };
}

/** Markdown table cell: authored text is escaped; preformatted Markdown passes through. */
export function cell(value) {
  if (value == null || value === '') return '';
  return typeof value === 'object' && typeof value.markdown === 'string' ? value.markdown : mdText(value);
}

/**
 * Authored text for a draw.io label. Labels there are HTML inside an XML attribute, so the
 * text is escaped once for HTML, to be shown as written, and once more for the attribute.
 */
export function xmlHtmlText(value) {
  return xmlEscape(xmlEscape(value ?? ''));
}

export function mdTable(headers, rows) {
  return [`| ${headers.join(' | ')} |`, `|${headers.map(() => '---').join('|')}|`, ...rows.map((row) => `| ${row.map(cell).join(' | ')} |`)].join('\n');
}
