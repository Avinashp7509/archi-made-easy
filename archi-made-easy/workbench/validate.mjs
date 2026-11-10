// Semantic checks of architecture workbench data that JSON Schema cannot express:
// cross-references, percentile order, ranges and uniqueness. Runs inside every command
// that loads a diagram (validate, render, deliver, finalize). Documents without
// operational or workbench data produce no diagnostics.

import { buildModel } from './model.mjs';
import { MAX_LEVEL_DEPTH, levelDepth } from './levels.mjs';

/** Collect model diagnostics for a document and, recursively, its drill-down documents. */
export function workbenchDiagnostics(document, where = '') {
  const { diagnostics } = buildModel(document);
  const prefixed = diagnostics.map((d) => (where ? { ...d, message: `${where}: ${d.message}`, subject: { ...d.subject, drilldown: where } } : d));
  const nested = (document.workbench?.drilldowns || []).flatMap((drilldown) => workbenchDiagnostics(drilldown.spec, where ? `${where} › ${drilldown.id}` : `drilldown ${drilldown.id}`));
  return [...prefixed, ...nested];
}

/**
 * Throw a structured diagnostic error when workbench data is inconsistent.
 * @param {string} diagramType
 * @param {object} diagram schema-valid document
 * @param {(message: string, diagnostics: object[]) => never} throwDiagnosticError
 */
export function validateWorkbenchData(diagramType, diagram, throwDiagnosticError) {
  if (diagramType !== 'architecture') return;
  const errors = workbenchDiagnostics(diagram).filter((d) => d.severity === 'error');
  const depth = 1 + levelDepth(diagram);
  if (depth > MAX_LEVEL_DEPTH) {
    errors.push({
      code: 'workbench/drilldown-depth', severity: 'error',
      message: `Child diagrams are nested ${depth} levels deep; at most ${MAX_LEVEL_DEPTH} levels are supported.`,
      subject: { collection: 'workbench.drilldowns' }, evidence: { depth, maximum: MAX_LEVEL_DEPTH },
      supportedFixes: ['move the deepest child diagrams into a document of their own'],
    });
  }
  if (errors.length === 0) return;
  const message = `Workbench data has ${errors.length} problem${errors.length === 1 ? '' : 's'}:\n${errors.map((e) => `  ${e.message}`).join('\n')}`;
  throwDiagnosticError(message, errors.map((e) => ({ ...e, supportedFixes: e.supportedFixes?.length ? e.supportedFixes : ['correct the reference or value named in the message'] })));
}
