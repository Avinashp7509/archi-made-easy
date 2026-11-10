// Render the child diagrams of an architecture document (workbench.drilldowns), so the
// parent page can carry them. Each child goes through the same renderer and the same
// artifact check as a top-level document, in its own process: a child that fails either
// one fails the parent, with the child named in the diagnostic.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createOwnedTempDirectory } from '../shared/owned-temp-directory.mjs';
import { throwDiagnosticError } from '../shared/diagnostics.mjs';

const MAX_BUFFER = 64 * 1024 * 1024;

function childFailure(drilldown, stage, result) {
  let diagnostics = [];
  let reason = '';
  try {
    const payload = JSON.parse(String(stage === 'render' ? result.stderr : result.stdout || '').trim());
    if (stage === 'render' && Array.isArray(payload?.diagnostics)) {
      diagnostics = payload.diagnostics;
      reason = payload.error || '';
    } else if (stage === 'check') {
      const failed = (payload?.checks || []).filter((check) => check.ok === false);
      reason = failed.map((check) => `${check.name}${check.details?.length ? ` (${check.details[0]})` : ''}`).join('; ');
    }
  } catch {
    // A child that fails without a readable receipt still fails the parent, without
    // copying a raw stack into the message.
  }
  const what = stage === 'render' ? 'could not be rendered' : 'failed the artifact check';
  const message = `Child diagram "${drilldown.id}" ${what}${reason ? `: ${reason}` : '.'}`;
  const subject = { drilldown: drilldown.id };
  throwDiagnosticError(message, diagnostics.length
    ? diagnostics.map((entry) => ({ ...entry, message: `Child diagram "${drilldown.id}": ${entry.message}`, subject: { ...entry.subject, ...subject } }))
    : [{
      code: stage === 'render' ? 'workbench/drilldown-render' : 'workbench/drilldown-check',
      severity: 'error', message, subject,
      evidence: { stage, status: result.status ?? null },
      supportedFixes: ['validate the child document on its own with the same quality profile and repair what it reports'],
    }]);
}

/**
 * @param {Array<{ id: string, title?: string, spec: object }>|undefined} drilldowns
 * @param {{ rendererPath: string, checkerPath: string }} tools
 * @returns {Promise<Array<{ id: string, title: string, html: string }>|null>}
 */
export async function renderLevels(drilldowns, { rendererPath, checkerPath }) {
  if (!drilldowns?.length) return null;
  const temporary = createOwnedTempDirectory('archi-made-easy-levels-');
  try {
    return drilldowns.map((drilldown, index) => {
      const specification = path.join(temporary.path, `level-${index}.architecture.json`);
      const output = path.join(temporary.path, `level-${index}.html`);
      fs.writeFileSync(specification, JSON.stringify(drilldown.spec), { flag: 'wx' });
      const options = { encoding: 'utf8', maxBuffer: MAX_BUFFER, windowsHide: true, env: { ...process.env, ARCHI_MADE_EASY_DIAGNOSTIC_FORMAT: 'json' } };
      const render = spawnSync(process.execPath, [rendererPath, specification, output], options);
      if (render.status !== 0) childFailure(drilldown, 'render', render);
      const check = spawnSync(process.execPath, [checkerPath, output], options);
      if (check.status !== 0) childFailure(drilldown, 'check', check);
      return { id: drilldown.id, title: drilldown.title ?? drilldown.spec.meta.title, html: fs.readFileSync(output, 'utf8') };
    });
  } finally {
    await temporary.cleanup();
  }
}
