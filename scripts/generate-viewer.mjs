#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sameEntry } from '../archi-made-easy/renderers/shared/path-semantics.mjs';

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Each fragment maps a marker in `viewer/template.source.html` to a file in
// `viewer/`. The optional indent re-prefixes every non-empty source line so
// the inlined block sits inside the surrounding `<style>` / `<script>` tags at
// the same depth the marker occupies. JS fragments need no indent because their
// markers are already at column 0; the standalone CSS file needs four spaces.
const fragments = [
  ['/* ARCHI_MADE_EASY:VIEWER_CSS */', 'viewer.css', 4],
  ['/* ARCHI_MADE_EASY:EXPORT */', 'export.js'],
  ['/* ARCHI_MADE_EASY:READER_LAYOUT */', 'reader-layout.js'],
  ['/* ARCHI_MADE_EASY:CHROME_LAYOUT */', 'viewer-chrome-layout.js'],
  ['/* ARCHI_MADE_EASY:CAMERA */', 'viewer-camera.js'],
  ['/* ARCHI_MADE_EASY:RADAR */', 'semantic-radar.js'],
  ['/* ARCHI_MADE_EASY:MOTION_GOVERNOR */', 'motion-governor.js'],
  ['/* ARCHI_MADE_EASY:NODE_FINDER */', 'node-finder.js'],
  ['/* ARCHI_MADE_EASY:NODE_OUTLINE */', 'node-outline.js'],
  ['/* ARCHI_MADE_EASY:TREE_BRANCHES */', 'tree-branches.js'],
  ['/* ARCHI_MADE_EASY:FOCUS */', 'focus.js'],
  ['/* ARCHI_MADE_EASY:INTENT_TRACE */', 'intent-trace.js'],
  ['/* ARCHI_MADE_EASY:SEMANTIC_LENS */', 'semantic-lens.js'],
  ['/* ARCHI_MADE_EASY:ROUTE_PROBE */', 'route-probe.js'],
  ['/* ARCHI_MADE_EASY:EXPORT_CLEANUP */', 'export-cleanup.js'],
];
const childMarker = '/* ARCHI_MADE_EASY:EXPORT_CLEANUP */';
const childOwner = 'export.js';

function reindent(source, spaces) {
  if (!spaces) return source;
  const pad = ' '.repeat(spaces);
  return source
    .split('\n')
    .map((line) => (line.length === 0 ? line : pad + line))
    .join('\n');
}

export function generateViewer({ root = defaultRoot, check = false } = {}) {
  const output = path.join(root, 'archi-made-easy/assets/template.html');
  let generated = fs.readFileSync(path.join(root, 'viewer/template.source.html'), 'utf8');
  for (const [marker, file, indent = 0] of fragments) {
    const source = fs.readFileSync(path.join(root, 'viewer', file), 'utf8');
    const parts = generated.split(marker);
    if (parts.length !== 2) throw new Error(`Viewer source must contain exactly one ${file} marker.`);
    // Export owns the sole nested fragment; expand it before Cleanup.
    const expectedChild = file === childOwner ? childMarker : null;
    if (!source.trim() || (expectedChild && source.split(expectedChild).length !== 2) ||
        fragments.some(([slot]) => source.includes(slot) && slot !== expectedChild)) {
      throw new Error(`${file} source is empty or contains an unresolved marker.`);
    }
    // For indented fragments the marker line in the template ends with `\n`;
    // `split` leaves that `\n` at the head of `parts[1]`. Strip it so the
    // reindented source's trailing newline is the only separator — without
    // this we'd emit a blank line between the fragment and the surrounding
    // CSS, and every byte after the seam would shift.
    let tail = parts[1];
    if (indent && tail.startsWith('\n')) tail = tail.slice(1);
    // Preserve classic-script scope, execution position and literal source bytes,
    // including characters with String.replace semantics.
    generated = parts[0] + reindent(source, indent) + tail;
  }
  if (check) {
    if (!fs.existsSync(output) || fs.readFileSync(output, 'utf8') !== generated) {
      throw new Error('Viewer template is stale — run npm run generate:viewer from archi-made-easy/.');
    }
  } else {
    const temporary = `${output}.${process.pid}.tmp`;
    try {
      fs.writeFileSync(temporary, generated);
      fs.renameSync(temporary, output);
    } finally {
      fs.rmSync(temporary, { force: true });
    }
  }
}

if (process.argv[1] && sameEntry(process.argv[1], fileURLToPath(import.meta.url)).status === 'match') {
  try {
    const args = process.argv.slice(2);
    if (args.length > 1 || (args.length === 1 && args[0] !== '--check')) {
      throw new Error('Usage: node scripts/generate-viewer.mjs [--check]');
    }
    generateViewer({ check: args[0] === '--check' });
    if (args.length === 0) console.log('generated archi-made-easy/assets/template.html');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
