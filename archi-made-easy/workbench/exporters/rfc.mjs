// Architecture design document (RFC) in Markdown, assembled from the document, the model
// and the analysis results. Every modelled figure is labelled as such, and assumed inputs
// are marked with an asterisk.

import { simulate } from '../sim.mjs';
import { review } from '../review.mjs';
import { buildFmea } from '../fmea.mjs';
import { estimateCost } from '../cost.mjs';
import { buildScenarios, runScenario } from '../scenarios.mjs';
import { toMermaidFlowchart } from './mermaid.mjs';
import { mdTable, plural } from './shared.mjs';

const mark = (node, key, value) => (value == null ? 'not set' : `${value}${node.basis[key] === 'assumed' ? '*' : ''}`);
const seconds = (value) => (value == null ? 'not set' : `${value} s`);

export function toRfc(document, model) {
  const result = simulate(model);
  const findings = review(model);
  const fmea = buildFmea(model);
  const cost = estimateCost(model, result);
  const scenarios = buildScenarios(model).map((scenario) => ({ scenario, outcome: runScenario(model, scenario) }));
  const name = (id) => model.nodes.find((n) => n.id === id)?.label ?? id;
  const k = result.kpis;
  const out = [];
  const push = (...lines) => out.push(...lines);

  push(`# ${model.title}: architecture design`, '');
  push('> Generated from an Archi-Made-Easy architecture document. Figures under "Modelled behaviour", "Review", "Failure modes" and "Scenarios" come from an analytical model of the declared design. They are not measurements. Values marked with an asterisk (*) were assumed from the component\'s role because the document does not state them.', '');

  push('## 1. Summary', '');
  push(`- ${plural(model.nodes.filter((n) => !n.actor).length, 'component')}, ${plural(model.edges.length, 'connection')}, ${plural(model.boundaries.length, 'boundary')}.`);
  push(`- Entry points: ${model.entrypoints.map(name).join(', ') || 'none identified'}.`);
  push(`- Review score: ${findings.score}/100 with ${findings.findings.length} finding${findings.findings.length === 1 ? '' : 's'}.`);
  push(`- Inputs: ${result.basis.authored_inputs} authored, ${result.basis.assumed_inputs} assumed.`, '');

  const assumptions = (document.cards || []).find((card) => card.title === 'Assumptions');
  if (assumptions || model.requirements) {
    push('## 2. Requirements and assumptions', '');
    if (model.requirements) {
      const r = model.requirements;
      const rows = [
        ['Availability target', r.availability_target_percent != null ? `${r.availability_target_percent}%` : null],
        ['P99 latency target', r.p99_latency_ms != null ? `${r.p99_latency_ms} ms` : null],
        ['Peak load', r.peak_rps != null ? `${r.peak_rps} requests/s` : null],
        ['Users', r.users], ['RPO', r.rpo_sec != null ? `${r.rpo_sec} s` : null], ['RTO', r.rto_sec != null ? `${r.rto_sec} s` : null],
        ['Monthly budget', r.monthly_budget_usd != null ? `$${r.monthly_budget_usd}` : null],
        ['Regions', r.regions?.join(', ')], ['Data residency', r.data_residency?.join(', ')], ['Compliance', r.compliance?.join(', ')],
      ].filter(([, value]) => value != null && value !== '');
      if (rows.length) push(mdTable(['Requirement', 'Target'], rows), '');
    }
    if (assumptions) push('Assumptions:', '', ...assumptions.items.map((item) => `- ${item}`), '');
  }

  push('## 3. Architecture', '', '```mermaid', toMermaidFlowchart(model), '```', '');
  push('### Components', '');
  push(mdTable(['Component', 'Role', 'Redundancy', 'Unit SLA %', 'Capacity (requests/s)', 'P99 (ms)', 'Trust zone'],
    model.nodes.filter((n) => !n.actor).map((n) => [
      n.label, mark(n, 'role', n.role), mark(n, 'redundancy', n.redundancy), mark(n, 'sla_percent', n.sla_percent),
      n.capacity.max_rps == null ? 'not set' : `${n.capacity.max_rps * (n.capacity.autoscale_max ?? 1)}${n.basis['capacity.max_rps'] === 'assumed' ? '*' : ''}`,
      mark(n, 'latency.p99_ms', n.latency.p99_ms), n.security.trust_zone ?? '',
    ])), '');
  push('### Connections', '');
  push(mdTable(['From', 'To', 'Purpose', 'Semantics', 'Protocol', 'Resilience'],
    [...model.edges].sort((a, b) => (a.id < b.id ? -1 : 1)).map((e) => [
      name(e.from), name(e.to), e.label ?? '', `${e.call_semantics}${e.basis.call_semantics === 'assumed' ? '*' : ''}`, e.protocol ?? '',
      [e.resilience.timeout_ms != null ? `timeout ${e.resilience.timeout_ms} ms` : null, e.resilience.retries ? `${e.resilience.retries} retries` : null,
        e.resilience.circuit_breaker_enabled ? 'circuit breaker' : null, e.resilience.fallback_edge_id ? `fallback ${e.resilience.fallback_edge_id}` : null,
        e.resilience.dlq_node_id ? `dead letters to ${name(e.resilience.dlq_node_id)}` : null, e.resilience.idempotent ? 'idempotent' : null].filter(Boolean).join(', '),
    ])), '');

  push('## 4. Modelled behaviour', '');
  push(mdTable(['Measure', 'Modelled value'], [
    ['Composite availability', k.composite_sla_percent == null ? 'not available' : `${k.composite_sla_percent}%`],
    ['Critical path', k.critical_path ? k.critical_path.nodes.map(name).join(' → ') : 'none'],
    ['Critical-path latency', k.critical_path ? `P50 ${k.critical_path.p50_ms} ms, P95 ${k.critical_path.p95_ms} ms, P99 ${k.critical_path.p99_ms} ms` : 'not available'],
    ['Max sustainable load', k.max_sustainable_rps == null ? 'not available' : `${k.max_sustainable_rps} requests/s (limit: ${name(k.limiting_node)})`],
    ['Current ingress', k.ingress_rps == null ? 'not set' : `${k.ingress_rps} requests/s (headroom ${k.headroom}x)`],
    ['Single points of failure', k.active_spofs.length ? k.active_spofs.map(name).join(', ') : 'none'],
    ['Estimated monthly cost', cost.monthly_total_usd == null ? 'not available (no cost data)' : `$${cost.monthly_total_usd} (${cost.coverage.priced_components} of ${cost.coverage.components} components priced)`],
  ]), '');
  for (const warning of result.warnings) push(`- Note: ${warning}`);
  if (result.warnings.length) push('');

  push('## 5. Review', '');
  push(mdTable(['Pillar', 'Score', 'Findings'], Object.entries(findings.pillars).map(([pillar, value]) => [pillar, value.score, value.findings])), '');
  if (findings.findings.length) {
    push(mdTable(['Severity', 'Finding', 'Evidence', 'Remediation', 'Basis'], findings.findings.map((f) => [f.severity, f.title, f.evidence, f.remediation, f.basis])), '');
  } else push('No rule fired. This means none of the checked rules found a problem, not that the design is complete.', '');

  push('## 6. Failure modes', '');
  push(mdTable(['Component', 'Effect', 'Also affected', 'Ingress lost', 'Severity', 'RTO', 'RPO', 'Recommended'],
    fmea.rows.map((row) => [row.label, row.local_effect, row.affected_components.map(name).join(', ') || 'none',
      row.ingress_share_lost == null ? 'n/a' : `${Math.round(row.ingress_share_lost * 100)}%`, row.severity, seconds(row.recovery.rto_sec), seconds(row.recovery.rpo_sec), row.recommended_actions.join('; ')])), '');
  push(fmea.note, '');

  push('## 7. Scenarios', '');
  push(mdTable(['Scenario', 'Applied to', 'Outcome'], scenarios.map(({ scenario, outcome }) => {
    if (!outcome.applicable) return [scenario.title, 'n/a', `Not applicable: ${outcome.reason}`];
    const r = outcome.result;
    const failing = r.kpis.blast_radius.nodes.filter((id) => r.nodes[id].state === 'failing').map(name);
    const degraded = r.kpis.blast_radius.nodes.filter((id) => r.nodes[id].state === 'degraded').map(name);
    const parts = [failing.length ? `failing: ${failing.join(', ')}` : null, degraded.length ? `degraded: ${degraded.join(', ')}` : null,
      r.kpis.blast_radius.ingress_share != null ? `${Math.round(r.kpis.blast_radius.ingress_share * 100)}% of ingress lost` : null,
      outcome.analysis ? `reachable without authentication: ${outcome.analysis.reachable_without_authentication.map(name).join(', ') || 'nothing'}` : null].filter(Boolean);
    return [scenario.title, scenario.targets.map(name).join(', ') || 'all traffic', parts.join('; ') || 'no component affected'];
  })), '');

  if (model.adrs.length) {
    push('## 8. Decisions', '');
    for (const adr of model.adrs) {
      push(`### ${adr.title}`, '', `Status: ${adr.status}`, '');
      if (adr.context) push(`**Context.** ${adr.context}`, '');
      push(`**Decision.** ${adr.decision}`, '');
      if (adr.alternatives?.length) push(mdTable(['Alternative', 'For', 'Against'], adr.alternatives.map((a) => [a.option, (a.pros || []).join('; '), (a.cons || []).join('; ')])), '');
      if (adr.consequences) push(`**Consequences.** ${adr.consequences}`, '');
    }
  }

  push('## Appendix: how to read this document', '');
  push('- An asterisk (*) marks a value assumed from the component\'s role. Replace it with a real figure and regenerate.');
  push('- The model is steady-state and treats failures as independent. It ranks risks and shows propagation; it does not replace load or failover testing.');
  push(`- Review rules checked: ${findings.rules_checked.length}. The score summarises those rules only.`, '');
  return out.join('\n');
}
