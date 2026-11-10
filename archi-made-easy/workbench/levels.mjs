// Levels: child diagrams carried inside a parent page.
//
// An architecture document can hold child documents in workbench.drilldowns, one per
// component that names it in operational.drilldown_diagram_id (a C4 container that opens
// into its component diagram, for example). Each child is rendered to a complete page and
// the parent page carries it, so one HTML file still holds the whole model.
//
// A child page repeats the parent's stylesheet and scripts byte for byte, because both come
// from the same template. Those blocks are not stored twice: packLevel() replaces each
// block that the parent also has with a short marker, and the page puts its own copy back
// when the reader opens the level (viewer/workbench.js holds the same key function and the
// inverse step). A block the parent does not have stays in the child as it is.

export const LEVELS_DATA_VERSION = 1;
/** A top-level document plus at most two generations of children. */
export const MAX_LEVEL_DEPTH = 3;

// Only large blocks are shared: the template's stylesheet and its scripts. Small blocks
// (data, the diagram's own style) cost little and stay literal.
const SHARED_MIN_LENGTH = 16384;
const BLOCK_RE = /(<(style|script)\b[^>]*>)([\s\S]*?)(<\/\2>)/g;
// A marker only counts when it is the whole content of a style or script element. Markers
// that belong to a grandchild sit inside JSON, where "<" is escaped, and are left alone.
const MARKED_BLOCK_RE = /(<(style|script)\b[^>]*>)\/\*ame-shared:(\d+:[0-9a-f]{8})\*\/(<\/\2>)/g;

// The HTML parser turns CR LF and CR into LF, so the page sees LF only. Keys are computed
// on that form, which makes them the same in the build and in the browser.
const normalise = (html) => html.replace(/\r\n?/g, '\n');

/** Length and FNV-1a hash (over UTF-16 code units) of a block of text. */
export function sharedKey(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${text.length}:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

/** The blocks of a page that a child may share, by key. */
export function sharedBlocks(html) {
  const blocks = new Map();
  for (const match of normalise(html).matchAll(BLOCK_RE)) {
    if (match[3].length >= SHARED_MIN_LENGTH) blocks.set(sharedKey(match[3]), match[3]);
  }
  return blocks;
}

/**
 * Replace every block of the child page that the parent page also has with a marker.
 * @param {string} childHtml complete rendered child page
 * @param {string} parentHtml the page that will carry it
 * @returns {string} the packed child page
 */
export function packLevel(childHtml, parentHtml) {
  const available = sharedBlocks(parentHtml);
  return normalise(childHtml).replace(BLOCK_RE, (block, open, _tag, text, close) => {
    if (text.length < SHARED_MIN_LENGTH) return block;
    const key = sharedKey(text);
    return available.has(key) ? `${open}/*ame-shared:${key}*/${close}` : block;
  });
}

/**
 * Put the parent's blocks back into a packed child page: the inverse of packLevel().
 * @returns {string} the complete child page
 * @throws when the parent page lacks a block the child refers to
 */
export function unpackLevel(packedHtml, parentHtml) {
  const available = sharedBlocks(parentHtml);
  return packedHtml.replace(MARKED_BLOCK_RE, (_block, open, _tag, key, close) => {
    if (!available.has(key)) throw new Error(`unpackLevel: the parent page has no block ${key}`);
    return `${open}${available.get(key)}${close}`;
  });
}

/** Depth of the deepest chain of child documents below a document (0 when it has none). */
export function levelDepth(document) {
  const children = document?.workbench?.drilldowns || [];
  return children.length ? 1 + Math.max(...children.map((child) => levelDepth(child.spec))) : 0;
}
