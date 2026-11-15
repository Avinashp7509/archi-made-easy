// `review` and `simulate` commands, and the compact review block for receipts.
// Loaded on demand by archi-made-easy.mjs. All analysis logic lives in workbench/.

import fs from 'node:fs';
import path from 'node:path';

import { validateSchema } from '../renderers/shared/validator.mjs';
import { buildModel } from '../workbench/model.mjs';
import { workbenchDiagnostics } from '../workbench/validate.mjs';
import { simulate, FAULT_STATES } from '../workbench/sim.mjs';
import { buildScenarios, runScenario } from '../workbench/scenarios.mjs';
import { buildFmea } from '../workbench/fmea.mjs';
import { estimateCost } from '../workbench/cost.mjs';
import { review } from '../workbench/review.mjs';
import { compareDesigns, compareAlternatives } from '../workbench/compare.mjs';
import { formatCost, costLines, simulationHeadline, reviewHeadline, noFindingsText, statusLabel } from '../workbench/present.mjs';

const MODEL_NOTE = 'Analytical model of the declared architecture, not a measurement.';

export class UsageError extends Error {}

/** Read and check an architecture document. Throws UsageError with a readable message. */
export function loadArchitecture(inputPath, cwd = process.cwd()) {
  const absolute = path.resolve(cwd, inputPath);
  let document;
  try { document = JSON.parse(fs.readFileSync(absolute, 'utf8')); } catch (error) {
    throw new UsageError(`Could not read ${inputPath}: ${error.message}`);
  }
  if (document?.diagram_type !== 'architecture') throw new UsageError(`${inputPath} is not an architecture document (diagram_type is "${document?.diagram_type}").`);
  try { validateSchema('architecture', document); } catch (error) {
    throw new UsageError(`${inputPath} is not a valid architecture document:\n${error.message}`);
  }
  const problems = workbenchDiagnostics(document).filter((d) => d.severity === 'error');
  if (problems.length) throw new UsageError(`${inputPath} has inconsistent workbench data:\n${problems.map((d) => `  [${d.code}] ${d.message}`).join('\n')}`);
  return { path: absolute, document, model: buildModel(document).model };
}

function numberOption(name, raw, { min, max }) {
  const value = Number(raw);
  if (raw === undefined || !Number.isFinite(value) || value < min || value > max) throw new UsageError(`${name} must be a number from ${min} to ${max}.`);
  return value;
}

/** A reference date for price freshness: yyyy-mm-dd. */
function dateOption(raw) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw ?? '') || Number.isNaN(Date.parse(raw))) throw new UsageError('--as-of must be a date, yyyy-mm-dd.');
  return raw;
}

/** Parse `db=down`, `node:db=down`, `edge:api-db=partitioned`, `boundary:region=down`. */
export function parseFault(spec, model) {
  const match = /^(?:(node|edge|boundary):)?([^=]+)=(.+)$/.exec(spec);
  if (!match) throw new UsageError(`--fault expects <target>=<state>, for example db=down. Got "${spec}".`);
  const [, kind, id, state] = match;
  if (!FAULT_STATES.includes(state)) throw new UsageError(`Unknown fault state "${state}". States: ${FAULT_STATES.join(', ')}.`);
  const tables = { node: model.nodes, edge: model.edges, boundary: model.boundaries };
  const kinds = (kind ? [kind] : ['node', 'edge', 'boundary']).filter((k) => tables[k].some((item) => item.id === id));
  if (kinds.length === 0) throw new UsageError(`"${id}" names no ${kind ?? 'component, connection or boundary'} in this architecture.`);
  if (kinds.length > 1) throw new UsageError(`"${id}" is ambiguous (${kinds.join(', ')}). Prefix it, for example ${kinds[0]}:${id}=${state}.`);
  return { kind: kinds[0], id, state };
}

const pct = (value) => (value == null ? 'not available' : `${value}%`);
/** Names for output: unique per component, so two components with one label stay distinct. */
function labelOf(model) {
  const labels = new Map(model.nodes.map((n) => [n.id, model.display?.[n.id] ?? n.label]));
  return (id) => labels.get(id) ?? id;
}

/** The cost block: the canonical headline, then every reason and omission. */
export function formatCostText(cost, model) {
  const head = formatCost(cost);
  const name = labelOf(model);
  const lines = [`Monthly cost. ${head.label}: ${head.text} (${head.qualifier}; ${head.coverage}). Status: ${statusLabel(cost.status)}.`];
  for (const line of costLines(cost, name)) lines.push(`  ${line}`);
  return lines.join('\n');
}

export function formatSimulation(model, result, heading = 'Simulation') {
  const name = labelOf(model);
  const lines = [`${heading}. ${MODEL_NOTE}`];
  const faults = [...Object.entries(result.inputs.faults.nodes), ...Object.entries(result.inputs.faults.edges), ...Object.entries(result.inputs.faults.boundaries)].filter(([, s]) => s !== 'healthy');
  if (result.inputs.faults.zone === 'down') faults.push(['one availability zone (not drawn)', 'down']);
  lines.push(`Conditions: ${result.inputs.multiplier}x traffic, cache hit ${Math.round(result.inputs.cacheHit * 100)}%${faults.length ? `, faults: ${faults.map(([id, s]) => `${id} ${s}`).join(', ')}` : ', no faults'}`);
  // The headline is the canonical one: the same words as the workbench and the design document.
  const head = simulationHeadline(model, result);
  const inconclusive = result.status === 'inconclusive';
  lines.push(`Status: ${statusLabel(result.status)}`, `Result: ${head.text}`, ...head.lines.map((line) => `  ${line}`));
  const k = result.kpis;
  const marked = (key) => (result.assessments[key].status === 'complete' ? '' : ` [${statusLabel(result.assessments[key].status)}]`);
  const limit = k.limiting_node ? ` (limit: ${name(k.limiting_node)})` : '';
  const ingress = k.ingress_rps != null ? `; current ingress ${k.ingress_rps} requests/s, headroom ${k.headroom}x` : '';
  // A figure whose assessment is inconclusive is not printed as a value: with a best and a
  // worst case it is given as that range, otherwise as "inconclusive".
  const unsettled = (key) => result.assessments[key].status === 'inconclusive';
  const split = result.bounds && !result.bounds.agree ? result.bounds : null;
  if (unsettled('availability')) lines.push(`Composite availability: inconclusive${split ? ` (worst case ${pct(split.worst.composite_sla_percent)}, best case ${pct(split.best.composite_sla_percent)})` : ''}`);
  else lines.push(`Composite availability (requests answered, including degraded answers): ${pct(k.composite_sla_percent)}${marked('availability')}`);
  if (unsettled('latency')) lines.push('Critical path latency: inconclusive');
  else {
    lines.push(k.critical_path?.p99_ms != null
      ? `Critical path: P50 ${k.critical_path.p50_ms} ms, P95 ${k.critical_path.p95_ms} ms, P99 ${k.critical_path.p99_ms} ms (${k.critical_path.nodes.map((id) => name(id)).join(' → ')})${marked('latency')}`
      : 'Critical path: none served (every entry is failing)');
  }
  // The ceiling comes from capacities, authored or assumed. It is reported in every case,
  // and never as evidence that a load is safe.
  lines.push(unsettled('capacity') ? 'Capacity ceiling of the request path: inconclusive' : k.max_sustainable_rps == null ? 'Capacity ceiling of the request path: not available' : `Capacity ceiling of the request path: ${k.max_sustainable_rps} requests/s${limit}${ingress}`);
  if (k.async_drain_ceiling_rps != null) lines.push(`Asynchronous drain ceiling: ${k.async_drain_ceiling_rps} requests/s (limit: ${name(k.async_limiting_node)}); above it a backlog grows, requests are not refused`);
  lines.push(`Single points of failure on the request path: ${k.active_spofs.length ? k.active_spofs.map(name).join(', ') : 'none found'}`);
  const affected = k.blast_radius.nodes;
  if (inconclusive && !(result.bounds && !result.bounds.agree)) lines.push('Affected components: not calculated');
  else if (affected.length) {
    lines.push(`Affected components (${affected.length})${inconclusive ? ', in the worst case' : ''}:`);
    for (const id of affected) lines.push(`  ${name(id)}: ${result.nodes[id].state}${result.nodes[id].cause.length ? ` (${result.nodes[id].cause.at(-1)})` : ''}`);
    const share = k.blast_radius.ingress_share;
    if (split) lines.push(`Ingress traffic lost: between ${Math.round((split.best.ingress_share ?? 0) * 100)}% (best case) and ${Math.round((split.worst.ingress_share ?? 0) * 100)}% (worst case)`);
    else if (share != null && !k.blast_radius.ingress_share_is_floor) lines.push(`Ingress traffic lost: ${Math.round(share * 100)}%`);
    else if (share != null && share > 0) lines.push(`Ingress traffic lost: at least ${Math.round(share * 100)}%`);
    else if (share != null) lines.push('Ingress traffic lost: no entry fails; loss to overload was not evaluated');
  } else lines.push(k.blast_radius.status === 'complete' ? 'Affected components: none' : 'Affected components: none fail; load-dependent effects not evaluated');
  for (const event of result.events) {
    if (event.type === 'fallback') lines.push(`Fallback: ${event.edge} switched to ${event.to}`);
    else if (event.type === 'dr-failover') lines.push(`Failover: ${name(event.node)} recovers on its replica (RTO ${event.rto_sec ?? 'not set'} s, RPO ${event.rpo_sec ?? 'not set'} s)`);
    else if (event.type === 'saturation') lines.push(`Saturated: ${name(event.node)} at ${Math.round(event.utilisation * 100)}% of capacity`);
    else if (event.type === 'queue-lag') lines.push(`Queue lag: ${name(event.node)} falls behind by ${event.growth_rps} messages/s`);
    else if (event.type === 'retry-storm') lines.push(`Retry storm: ${name(event.node)} receives ${event.amplification}x amplified load${event.self_sustaining ? ' and does not settle' : ''}`);
    else if (event.type === 'timeout-inversion') lines.push(`Timeout inversion: ${event.caller} gives up before ${event.callee} finishes retrying`);
  }
  for (const warning of result.warnings) lines.push(`Note: ${warning}`);
  for (const item of result.reasons) lines.push(`Not complete (${item.code}): ${item.message}`);
  for (const ask of head.asks) lines.push(`To resolve: ${ask}`);
  lines.push(`Inputs: ${result.basis.authored_inputs} authored, ${result.basis.assumed_inputs} assumed. Assumed values are role defaults, not facts about your system. Evidence confidence: ${result.confidence.level}.`);
  return lines.join('\n');
}

export function formatReview(result) {
  const lines = [`Architecture review. ${MODEL_NOTE}`, reviewHeadline(result).text];
  lines.push(`Pillars: ${Object.entries(result.pillars).map(([pillar, value]) => `${pillar} ${value.score == null ? `not assessed (${statusLabel(value.status)})` : `${value.score}${value.status === 'complete' ? '' : ` (${statusLabel(value.status)})`}`}`).join(' · ')}`);
  const counts = Object.entries(result.counts).filter(([, n]) => n > 0).map(([severity, n]) => `${n} ${severity}`).join(', ');
  lines.push(`Findings: ${result.findings.length ? counts : noFindingsText(result)}`);
  for (const finding of result.findings) {
    lines.push('', `[${finding.severity.toUpperCase()}] ${finding.title} (${finding.pillar}; ${finding.basis})`, `  ${finding.evidence}`, `  Fix: ${finding.remediation}`);
  }
  if (result.gaps.length) {
    lines.push('', `Not evaluated (${result.gaps.length}). These checks apply but could not be run; they are not passes:`);
    for (const gap of result.gaps) lines.push(`  [${gap.pillar}] ${gap.title}: ${gap.message}${gap.ask ? ` ${gap.ask}` : ''}`);
  }
  if (result.cost.status !== 'unknown') {
    const head = formatCost(result.cost);
    lines.push('', `Monthly cost. ${head.label}: ${head.text} (${head.qualifier}; ${head.coverage}). Status: ${statusLabel(result.cost.status)}.`);
  }
  lines.push('', `Rules: ${result.rules_checked.length}, ${result.coverage.applicable} applicable, ${result.coverage.evaluated} fully evaluated. ${result.note}`);
  return lines.join('\n');
}

const shown = (value, unit) => (value == null ? 'not available' : `${value}${unit && unit !== '/100' ? ` ${unit}` : unit}`);

function metricLines(metrics) {
  return metrics.map((m) => {
    const change = m.change == null ? '' : m.change === 0 ? '' : ` (${m.change > 0 ? '+' : ''}${m.change})`;
    return `  ${m.label}: ${shown(m.before, m.unit)} → ${shown(m.after, m.unit)}${change} ${m.verdict}`;
  });
}

export function formatComparison(comparison) {
  const lines = [`Design comparison. ${MODEL_NOTE}`, `Before: ${comparison.base.title}`, `After:  ${comparison.head.title}`, ...metricLines(comparison.metrics)];
  if (comparison.components.added.length) lines.push(`Components added: ${comparison.components.added.join(', ')}`);
  if (comparison.components.removed.length) lines.push(`Components removed: ${comparison.components.removed.join(', ')}`);
  lines.push(`Findings closed (${comparison.findings.closed.length}):`, ...comparison.findings.closed.map((f) => `  [${f.severity}] ${f.title} (${f.id})`));
  lines.push(`Findings opened (${comparison.findings.opened.length}):`, ...comparison.findings.opened.map((f) => `  [${f.severity}] ${f.title} (${f.id})`));
  lines.push(`Findings unchanged: ${comparison.findings.unchanged}`, comparison.note);
  return lines.join('\n');
}

export function formatAlternatives(comparison) {
  const lines = [`Alternatives compared with the authored design. ${MODEL_NOTE}`];
  for (const alternative of comparison.alternatives) {
    lines.push('', `${alternative.title} (${alternative.id})${alternative.description ? `: ${alternative.description}` : ''}`, ...metricLines(alternative.metrics),
      `  Findings: ${alternative.findings.closed.length} closed, ${alternative.findings.opened.length} opened`);
  }
  return lines.join('\n');
}

function breachLine(analysis) {
  return `Reachable from ${analysis.start} without authentication: ${analysis.reachable_without_authentication.join(', ') || 'nothing'}; stopped at: ${analysis.stopped_by_authentication.join(', ') || 'nothing'}`;
}

function emit(stdout, json, payload, text) {
  stdout.write(json ? `${JSON.stringify(payload, null, 2)}\n` : `${text}\n`);
}

function failure(stdout, stderr, json, command, error) {
  if (!(error instanceof UsageError)) throw error;
  if (json) stdout.write(`${JSON.stringify({ schemaVersion: 1, ok: false, command, diagnostics: [{ code: `${command}/invalid-input`, severity: 'error', message: error.message }] }, null, 2)}\n`);
  else stderr.write(`${error.message}\n`);
  return 2;
}

export const REVIEW_USAGE = '<architecture.json> [--against <earlier.json> | --alternatives] [--multiplier N] [--cache-hit N] [--as-of yyyy-mm-dd] [--strict] [--json]';
export const SIMULATE_USAGE = '<architecture.json> [--scenario a..g|all] [--multiplier N] [--cache-hit N] [--fault <target>=<state>] [--list-scenarios] [--fmea] [--cost] [--as-of yyyy-mm-dd] [--json]';

/** review: findings and score. Exit 1 with --strict when a critical finding exists. */
export function commandReview(args, { stdout = process.stdout, stderr = process.stderr, cwd = process.cwd() } = {}) {
  const json = args.includes('--json');
  try {
    let input = null; let multiplier = 1; let cacheHit = 0; let strict = false; let against = null; let alternatives = false; let asOf;
    for (let i = 0; i < args.length; i += 1) {
      const arg = args[i];
      if (arg === '--json') continue;
      else if (arg === '--strict') strict = true;
      else if (arg === '--alternatives') alternatives = true;
      else if (arg === '--against') { against = args[++i]; if (!against) throw new UsageError('--against needs the path of the earlier design.'); }
      else if (arg === '--multiplier') multiplier = numberOption('--multiplier', args[++i], { min: 0.1, max: 100 });
      else if (arg === '--cache-hit') cacheHit = numberOption('--cache-hit', args[++i], { min: 0, max: 0.99 });
      else if (arg === '--as-of') asOf = dateOption(args[++i]);
      else if (arg.startsWith('--')) throw new UsageError(`Unknown review option ${arg}.`);
      else if (input === null) input = arg;
      else throw new UsageError(`Unexpected argument "${arg}".`);
    }
    if (!input) throw new UsageError(`Usage: archi-made-easy review ${REVIEW_USAGE}`);
    const { model, document, path: absolute } = loadArchitecture(input, cwd);
    if (against && alternatives) throw new UsageError('Use either --against or --alternatives, not both.');
    if (against) {
      const base = loadArchitecture(against, cwd);
      const comparison = compareDesigns(base.model, model);
      emit(stdout, json, { schemaVersion: 1, ok: true, command: 'review', mode: 'against', base: base.path, head: absolute, ...comparison }, formatComparison(comparison));
      return 0;
    }
    if (alternatives) {
      const comparison = compareAlternatives(document);
      if (comparison.alternatives.length === 0) throw new UsageError(`${input} has no workbench.alternatives to compare.`);
      emit(stdout, json, { schemaVersion: 1, ok: true, command: 'review', mode: 'alternatives', input: absolute, ...comparison }, formatAlternatives(comparison));
      return 0;
    }
    const result = review(model, { multiplier, cacheHit, asOf });
    emit(stdout, json, { schemaVersion: 1, ok: true, command: 'review', input: absolute, headline: reviewHeadline(result), ...result }, formatReview(result));
    return strict && result.counts.critical > 0 ? 1 : 0;
  } catch (error) { return failure(stdout, stderr, json, 'review', error); }
}

/** simulate: one run, a named scenario, all scenarios, the scenario list, or the FMEA table. */
export function commandSimulate(args, { stdout = process.stdout, stderr = process.stderr, cwd = process.cwd() } = {}) {
  const json = args.includes('--json');
  try {
    let input = null; let multiplier = null; let cacheHit = null; let scenarioKey = null; let asOf;
    const faultSpecs = []; const flags = new Set();
    for (let i = 0; i < args.length; i += 1) {
      const arg = args[i];
      if (arg === '--json') continue;
      else if (['--list-scenarios', '--fmea', '--cost'].includes(arg)) flags.add(arg);
      else if (arg === '--multiplier') multiplier = numberOption('--multiplier', args[++i], { min: 0.1, max: 100 });
      else if (arg === '--cache-hit') cacheHit = numberOption('--cache-hit', args[++i], { min: 0, max: 0.99 });
      else if (arg === '--as-of') asOf = dateOption(args[++i]);
      else if (arg === '--scenario') { scenarioKey = args[++i]; if (!scenarioKey) throw new UsageError('--scenario needs a value.'); }
      else if (arg === '--fault') { const spec = args[++i]; if (!spec) throw new UsageError('--fault needs a value.'); faultSpecs.push(spec); }
      else if (arg.startsWith('--')) throw new UsageError(`Unknown simulate option ${arg}.`);
      else if (input === null) input = arg;
      else throw new UsageError(`Unexpected argument "${arg}".`);
    }
    if (!input) throw new UsageError(`Usage: archi-made-easy simulate ${SIMULATE_USAGE}`);
    const { model, path: absolute } = loadArchitecture(input, cwd);
    const scenarios = buildScenarios(model);
    const base = { schemaVersion: 1, ok: true, command: 'simulate', input: absolute };

    if (flags.has('--list-scenarios')) {
      const rows = scenarios.map((s) => {
        const detail = s.applicable
          ? ` (fails: ${s.fails})${s.readiness.status === 'ready' ? '' : ` [${s.readiness.status}: ${s.readiness.reasons.map((r) => r.code).join(', ')}]`}`
          : ` [not applicable: ${s.reason}]`;
        return `  ${s.id}  ${s.key.padEnd(18)} ${s.title}${detail}`;
      });
      emit(stdout, json, { ...base, scenarios }, ['Scenarios:', ...rows].join('\n'));
      return 0;
    }
    if (flags.has('--fmea')) {
      const fmea = buildFmea(model, { multiplier: multiplier ?? 1, cacheHit: cacheHit ?? 0 });
      const name = labelOf(model);
      const rows = fmea.rows.map((row) => {
        const affects = row.affected_components.length ? row.affected_components.map(name).join(', ') : 'nothing else';
        const lost = row.ingress_share_lost == null ? '; ingress lost not calculated' : row.ingress_share_lost ? `; ${Math.round(row.ingress_share_lost * 100)}% of ingress lost` : '';
        const actions = row.recommended_actions.length ? `\n  Do: ${row.recommended_actions.join('; ')}` : '';
        return `[${row.severity.toUpperCase()}] ${row.label}: ${row.local_effect.toLowerCase()}; affects ${affects}${lost}${actions}`;
      });
      emit(stdout, json, { ...base, fmea }, [`Failure mode and effects analysis. ${MODEL_NOTE}`, ...rows, fmea.note].join('\n'));
      return 0;
    }
    if (scenarioKey === 'all') {
      if (faultSpecs.length) throw new UsageError('--scenario all cannot be combined with --fault.');
      const outcomes = scenarios.map((scenario) => runScenario(model, scenario));
      const text = outcomes.map((outcome, index) => {
        if (!outcome.applicable) return `Scenario ${scenarios[index].id}: ${scenarios[index].title}\nNot applicable: ${outcome.reason}`;
        const body = formatSimulation(model, outcome.result, `Scenario ${outcome.scenario}: ${outcome.title}`);
        return outcome.analysis ? `${body}\n${breachLine(outcome.analysis)}` : body;
      }).join('\n\n');
      emit(stdout, json, { ...base, outcomes }, text);
      return 0;
    }

    let inputs = { multiplier: 1, cacheHit: 0, faults: { nodes: {}, edges: {}, boundaries: {} } };
    let scenario = null;
    if (scenarioKey) {
      scenario = scenarios.find((s) => s.id === scenarioKey || s.key === scenarioKey);
      if (!scenario) throw new UsageError(`Unknown scenario "${scenarioKey}". Use one of ${scenarios.map((s) => `${s.id} (${s.key})`).join(', ')}, or all.`);
      if (!scenario.applicable) {
        emit(stdout, json, { ...base, scenario: { id: scenario.id, key: scenario.key }, applicable: false, reason: scenario.reason }, `Scenario ${scenario.id}: ${scenario.title}\nNot applicable: ${scenario.reason}`);
        return 0;
      }
      const f = scenario.inputs.faults;
      inputs = { multiplier: scenario.inputs.multiplier, cacheHit: scenario.inputs.cacheHit, faults: { nodes: { ...f.nodes }, edges: { ...f.edges }, boundaries: { ...f.boundaries }, ...(f.zone ? { zone: f.zone } : {}) } };
    }
    if (multiplier != null) inputs.multiplier = multiplier;
    if (cacheHit != null) inputs.cacheHit = cacheHit;
    const tableFor = { node: 'nodes', edge: 'edges', boundary: 'boundaries' };
    for (const spec of faultSpecs) {
      // One availability zone, not drawn in the diagram (unless something is named "zone").
      if (spec === 'zone=down' && ![...model.nodes, ...model.edges, ...model.boundaries].some((item) => item.id === 'zone')) { inputs.faults.zone = 'down'; continue; }
      const fault = parseFault(spec, model);
      inputs.faults[tableFor[fault.kind]][fault.id] = fault.state;
    }
    const result = simulate(model, inputs);
    const payload = { ...base, result };
    payload.status = result.status;
    payload.headline = simulationHeadline(model, result);
    if (scenario) payload.scenario = { id: scenario.id, key: scenario.key, title: scenario.title, targets: scenario.targets, target_labels: scenario.target_labels, fails: scenario.fails, readiness: scenario.readiness, ...(scenario.analysis ? { analysis: scenario.analysis } : {}) };
    let text = formatSimulation(model, result, scenario ? `Scenario ${scenario.id}: ${scenario.title}` : 'Simulation');
    if (scenario?.analysis) text += `\n${breachLine(scenario.analysis)}`;
    if (flags.has('--cost')) {
      const cost = estimateCost(model, result, { asOf });
      payload.cost = cost;
      payload.cost_headline = formatCost(cost);
      text += `\n${formatCostText(cost, model)}`;
    }
    emit(stdout, json, payload, text);
    return 0;
  } catch (error) { return failure(stdout, stderr, json, 'simulate', error); }
}

/**
 * Compact review block for validate and finalize receipts. Returns null when the document
 * has no authored operational data and the review was not explicitly requested.
 */
export function reviewForReceipt(inputPath, { explicit = false, cwd = process.cwd() } = {}) {
  let loaded;
  try { loaded = loadArchitecture(inputPath, cwd); } catch { return null; }
  if (!loaded.model.authored && !explicit) return null;
  const result = review(loaded.model);
  return {
    kind: result.kind,
    status: result.status,
    score: result.score,
    score_floor: result.score_floor,
    coverage: result.coverage,
    headline: reviewHeadline(result).text,
    counts: result.counts,
    pillars: Object.fromEntries(Object.entries(result.pillars).map(([pillar, value]) => [pillar, value.score])),
    pillar_status: Object.fromEntries(Object.entries(result.pillars).map(([pillar, value]) => [pillar, value.status])),
    gaps: result.gaps.map(({ id, rule, title, pillar, code, subjects, message, ask }) => ({ id, rule, title, pillar, code, subjects, message, ask })),
    findings: result.findings.map(({ id, rule, title, pillar, severity, basis, affectedNodes, evidence, remediation }) => ({ id, rule, title, pillar, severity, basis, affectedNodes, evidence, remediation })),
    basis: result.basis,
    note: result.note,
  };
}
