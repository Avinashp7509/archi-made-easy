// Before/after comparison of two designs, and of a design against its authored
// alternatives: modelled KPIs side by side, and review findings opened and closed.

import { buildModel, applyAlternative } from './model.mjs';
import { simulate } from './sim.mjs';
import { estimateCost } from './cost.mjs';
import { review } from './review.mjs';

const round = (value, digits = 5) => (typeof value === 'number' && Number.isFinite(value) ? Math.round(value * 10 ** digits) / 10 ** digits : value);

/** The comparable numbers of one design. */
export function designSnapshot(model) {
  const result = simulate(model);
  const cost = estimateCost(model, result);
  const reviewed = review(model);
  return {
    components: model.nodes.filter((n) => !n.actor).length,
    connections: model.edges.length,
    composite_sla_percent: result.kpis.composite_sla_percent,
    critical_path_p99_ms: result.kpis.critical_path?.p99_ms ?? null,
    max_sustainable_rps: result.kpis.max_sustainable_rps,
    single_points_of_failure: result.kpis.active_spofs.length,
    monthly_cost_usd: cost.monthly_total_usd,
    review_score: reviewed.score,
    findings: reviewed.findings.map(({ id, rule, title, severity, basis }) => ({ id, rule, title, severity, basis })),
    assumed_inputs: result.basis.assumed_inputs,
  };
}

const METRICS = [
  // key, label, unit, direction: +1 = higher is better, -1 = lower is better
  ['composite_sla_percent', 'Composite availability', '%', 1],
  ['critical_path_p99_ms', 'Critical-path P99', 'ms', -1],
  ['max_sustainable_rps', 'Max sustainable load', 'requests/s', 1],
  ['single_points_of_failure', 'Single points of failure', '', -1],
  ['monthly_cost_usd', 'Estimated monthly cost', 'USD', -1],
  ['review_score', 'Review score', '/100', 1],
];

function deltas(base, head) {
  return METRICS.map(([key, label, unit, direction]) => {
    const before = base[key]; const after = head[key];
    const change = before == null || after == null ? null : round(after - before);
    const verdict = change == null ? 'not comparable' : change === 0 ? 'unchanged' : (change > 0) === (direction > 0) ? 'better' : 'worse';
    return { metric: key, label, unit, before, after, change, verdict };
  });
}

/** Compare two models (base = before, head = after). */
export function compareDesigns(baseModel, headModel) {
  const base = designSnapshot(baseModel); const head = designSnapshot(headModel);
  const baseIds = new Set(base.findings.map((f) => f.id)); const headIds = new Set(head.findings.map((f) => f.id));
  const baseNodes = new Set(baseModel.nodes.map((n) => n.id)); const headNodes = new Set(headModel.nodes.map((n) => n.id));
  return {
    kind: 'analytical-model',
    base: { title: baseModel.title, ...base },
    head: { title: headModel.title, ...head },
    metrics: deltas(base, head),
    findings: {
      closed: base.findings.filter((f) => !headIds.has(f.id)),
      opened: head.findings.filter((f) => !baseIds.has(f.id)),
      unchanged: head.findings.filter((f) => baseIds.has(f.id)).length,
    },
    components: {
      added: [...headNodes].filter((id) => !baseNodes.has(id)).sort(),
      removed: [...baseNodes].filter((id) => !headNodes.has(id)).sort(),
    },
    note: 'Both sides are analytical models of declared designs. Differences in assumed inputs can change a result as much as differences in design.',
  };
}

/** Compare a document with each alternative authored in workbench.alternatives. */
export function compareAlternatives(document) {
  const baseModel = buildModel(document).model;
  const alternatives = document.workbench?.alternatives || [];
  return {
    kind: 'analytical-model',
    baseline: { title: baseModel.title, ...designSnapshot(baseModel) },
    alternatives: alternatives.map((alternative) => {
      const comparison = compareDesigns(baseModel, buildModel(applyAlternative(document, alternative.id)).model);
      return { id: alternative.id, title: alternative.title, description: alternative.description ?? null, metrics: comparison.metrics, findings: comparison.findings, snapshot: comparison.head };
    }),
  };
}
