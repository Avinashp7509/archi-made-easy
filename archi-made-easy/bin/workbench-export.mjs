// `export` command: write an architecture document in another format.
// Loaded on demand by archi-made-easy.mjs.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadArchitecture, UsageError } from './workbench-analysis.mjs';
import { toMermaidMarkdown } from '../workbench/exporters/mermaid.mjs';
import { toDrawio } from '../workbench/exporters/drawio.mjs';
import { toStructurizr } from '../workbench/exporters/structurizr.mjs';
import { toRfc } from '../workbench/exporters/rfc.mjs';

export const EXPORT_FORMATS = Object.freeze({
  html: { extension: '.html', description: 'Standalone interactive HTML (same as render)' },
  mermaid: { extension: '.md', description: 'Markdown with Mermaid flowchart, C4 and sequence diagrams' },
  drawio: { extension: '.drawio', description: 'draw.io / diagrams.net file' },
  structurizr: { extension: '.dsl', description: 'Structurizr DSL workspace' },
  rfc: { extension: '.md', description: 'Architecture design document with review, failure modes and scenarios' },
});
export const EXPORT_USAGE = `<${Object.keys(EXPORT_FORMATS).join('|')}> <architecture.json> <output> [--force] [--json]`;

/** @returns {number} exit code */
export function commandExport(args, { stdout = process.stdout, stderr = process.stderr, cwd = process.cwd() } = {}) {
  const json = args.includes('--json');
  const fail = (message, code = 'export/invalid-arguments', status = 2) => {
    if (json) stdout.write(`${JSON.stringify({ schemaVersion: 1, ok: false, command: 'export', diagnostics: [{ code, severity: 'error', message }] }, null, 2)}\n`);
    else stderr.write(`${message}\n`);
    return status;
  };
  const unknown = args.find((arg) => arg.startsWith('--') && !['--json', '--force'].includes(arg));
  if (unknown) return fail(`Unknown export option ${unknown}.`);
  const [format, input, output, ...extra] = args.filter((arg) => !arg.startsWith('--'));
  if (!format || !input || !output || extra.length) return fail(`Usage: archi-made-easy export ${EXPORT_USAGE}`);
  if (format === 'svg' || format === 'png') {
    return fail(`Image export is done in the viewer: open the HTML and use Export → ${format.toUpperCase()}. Command-line ${format.toUpperCase()} export is not available in this version.`, 'export/format-not-available');
  }
  if (!EXPORT_FORMATS[format]) return fail(`Unknown format "${format}". Formats: ${Object.keys(EXPORT_FORMATS).join(', ')}.`, 'export/unknown-format');

  let loaded;
  try { loaded = loadArchitecture(input, cwd); } catch (error) {
    if (error instanceof UsageError) return fail(error.message, 'export/invalid-input');
    throw error;
  }
  const outputPath = path.resolve(cwd, output);
  if (fs.existsSync(outputPath) && !args.includes('--force')) return fail(`${output} already exists. Choose another output, or pass --force to replace it.`, 'export/output-exists');

  if (format === 'html') {
    const cli = path.join(path.dirname(fileURLToPath(import.meta.url)), 'archi-made-easy.mjs');
    const rendered = spawnSync(process.execPath, [cli, 'render', 'architecture', loaded.path, outputPath], { cwd, encoding: 'utf8' });
    if (rendered.status !== 0) return fail(`Rendering failed:\n${(rendered.stderr || rendered.stdout).trim()}`, 'export/render-failed', 1);
  } else {
    const text = format === 'mermaid' ? toMermaidMarkdown(loaded.model)
      : format === 'drawio' ? toDrawio(loaded.document, loaded.model)
        : format === 'structurizr' ? toStructurizr(loaded.model)
          : toRfc(loaded.document, loaded.model);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, text.endsWith('\n') ? text : `${text}\n`);
  }
  const bytes = fs.statSync(outputPath).size;
  if (json) stdout.write(`${JSON.stringify({ schemaVersion: 1, ok: true, command: 'export', format, input: loaded.path, output: { path: outputPath, bytes } }, null, 2)}\n`);
  else stdout.write(`Wrote ${output} (${EXPORT_FORMATS[format].description}).\n`);
  return 0;
}
