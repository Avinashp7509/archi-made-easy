// Architecture review: structural and requirement checks over the operational model,
// organised by Well-Architected pillar, with an overall score.
//
// Every finding states its basis. "authored" means it rests on values in the document;
// "assumed" means it rests on inferred roles or default values, counts half toward the
// score, and should be confirmed before acting on it.

import { simulate } from './sim.mjs';
import { estimateCost } from './cost.mjs';

export const PILLARS = Object.freeze(['Reliability', 'Security', 'Performance', 'Cost', 'Operational Excellence', 'Sustainability']);
export const WEIGHTS = Object.freeze({ critical: 15, high: 8, medium: 4, low: 1 });
export const CHATTY_EGRESS_RPS = 100;
export const DEEP_CHAIN_HOPS = 3;
const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
const ASYNC = new Set(['async-queue', 'async-pubsub', 'event-stream']);
const STATEFUL = new Set(['stateful-db', 'object-store']);

/**
 * Rule registry: the single list of what this version checks. `status` is "implemented" for
 * every entry here. `consequence` says what the problem leads to if it is left as it is.
 */
export const RULES = Object.freeze([
  { id: 'spof', title: 'Single point of failure on a critical path', pillars: ['Reliability'], severity: 'high', status: 'implemented',
    consequence: 'When this component fails, every request that depends on it fails until it is restored.' },
  { id: 'deep-sync-chain', title: 'Deep synchronous call chain', pillars: ['Reliability', 'Performance'], severity: 'medium', status: 'implemented',
    consequence: 'One slow or failed component at the end of the chain holds up every caller above it, so a local fault becomes a full outage.' },
  { id: 'timeout-hierarchy', title: 'Caller timeout shorter than the callee retry budget', pillars: ['Reliability'], severity: 'high', status: 'implemented',
    consequence: 'The caller gives up and may retry while the callee is still working, which multiplies load during an incident and can apply an operation twice.' },
  { id: 'unprotected-async-consumer', title: 'Asynchronous consumer without dead-letter handling or idempotency', pillars: ['Reliability', 'Operational Excellence'], severity: 'medium', status: 'implemented',
    consequence: 'A message that cannot be processed is retried forever or dropped, and a redelivered message can be applied twice.' },
  { id: 'zero-trust-violation', title: 'Public entry reaches a data store directly without authentication', pillars: ['Security'], severity: 'critical', status: 'implemented',
    consequence: 'Anyone who can reach the public entry has a direct network path to the data store.' },
  { id: 'chatty-cross-boundary-egress', title: 'High-volume synchronous calls across a region or zone boundary', pillars: ['Cost'], severity: 'medium', status: 'implemented',
    consequence: 'Every call pays network latency and data-transfer cost, and the boundary becomes a shared failure point for both sides.' },
  { id: 'missing-recovery-objectives', title: 'Stateful component without recovery objectives', pillars: ['Operational Excellence'], severity: 'low', status: 'implemented',
    consequence: 'Nobody can say how much data may be lost or how long recovery may take, so backups cannot be judged sufficient.' },
  { id: 'idle-over-provisioning', title: 'Idle capacity kept running', pillars: ['Sustainability', 'Cost'], severity: 'low', status: 'implemented',
    consequence: 'Capacity is paid for and powered without serving load.' },
  { id: 'unencrypted-data-store', title: 'Data store not encrypted at rest', pillars: ['Security'], severity: 'high', status: 'implemented',
    consequence: 'Stored data is readable from the underlying disks, snapshots and backups.' },
  { id: 'requirement-availability', title: 'Modelled availability below the stated target', pillars: ['Reliability'], severity: 'high', status: 'implemented',
    consequence: 'The design as declared cannot meet the stated availability target.' },
  { id: 'requirement-latency', title: 'Modelled P99 latency above the stated target', pillars: ['Performance'], severity: 'high', status: 'implemented',
    consequence: 'The slowest one percent of requests exceed the stated latency target.' },
  { id: 'requirement-capacity', title: 'Modelled capacity below the stated peak load', pillars: ['Performance'], severity: 'high', status: 'implemented',
    consequence: 'At the stated peak a component saturates: requests queue, slow down or fail.' },
  { id: 'requirement-recovery', title: 'Recovery objectives weaker than required', pillars: ['Reliability'], severity: 'high', status: 'implemented',
    consequence: 'A failure would lose more data or take longer to recover than the stated objectives allow.' },
  { id: 'requirement-budget', title: 'Estimated monthly cost above the stated budget', pillars: ['Cost'], severity: 'medium', status: 'implemented',
    consequence: 'The design as declared costs more than the stated budget.' },
]);
const RULE = Object.fromEntries(RULES.map((rule) => [rule.id, rule]));

const worst = (...bases) => (bases.some((basis) => basis === 'assumed' || basis == null) ? 'assumed' : 'authored');

/**
 * @param {object} model from buildModel()
 * @param {{ multiplier?: number, cacheHit?: number }} inputs conditions to review under
 * @returns {{ findings: object[], score: number, pillars: object, rules: object[], kind: string }}
 */
export function review(model, { multiplier = 1, cacheHit = 0 } = {}) {
  const result = simulate(model, { multiplier, cacheHit });
  const cost = estimateCost(model, result);
  const nodeById = new Map(model.nodes.map((n) => [n.id, n]));
  const edges = [...model.edges].sort((a, b) => (a.id < b.id ? -1 : 1));
  const outgoing = (id) => edges.filter((edge) => edge.from === id);
  const findings = [];
  // `fixes` are the part of the remediation that can be expressed as an edit to the model:
  // { target: 'component' | 'connection', id, operational, summary }. They let a reader
  // preview the effect of a change. Remediation that needs a figure only the owner can give
  // (a recovery objective, a budget) or a structural change has no fix.
  const add = (ruleId, { nodes = [], edges: edgeIds = [], evidence, remediation, basis, severity, fixes = [] }) => {
    const rule = RULE[ruleId];
    findings.push({
      id: `${ruleId}:${[...nodes, ...edgeIds].join(',') || 'design'}`,
      rule: ruleId, title: rule.title, pillar: rule.pillars[0], pillars: rule.pillars,
      severity: severity ?? rule.severity, affectedNodes: [...nodes].sort(), affectedEdges: [...edgeIds].sort(),
      evidence, consequence: rule.consequence, remediation, fixes, basis,
    });
  };

  // 1. Single points of failure on an entry's hard-dependency path.
  for (const id of result.kpis.active_spofs) {
    const node = nodeById.get(id);
    add('spof', {
      nodes: [id], basis: worst(node.basis.redundancy, node.basis.role),
      evidence: `${node.label} is a single instance that every request through an entry depends on.`,
      remediation: `Run ${node.label} across at least two failure domains (multi-az), or give its callers a fallback.`,
      fixes: [{ target: 'component', id, operational: { redundancy: 'multi-az' }, summary: `Run ${node.label} across at least two zones` }],
    });
  }

  // 2. Deep synchronous chains with no circuit breaker or asynchronous hop.
  {
    const hard = (edge) => edge.call_semantics === 'sync-blocking' && !edge.resilience.circuit_breaker_enabled;
    const memo = new Map();
    const longest = (id, seen = new Set()) => {
      if (memo.has(id)) return memo.get(id);
      let best = { hops: 0, path: [id], edges: [] };
      for (const edge of outgoing(id).filter(hard)) {
        if (seen.has(edge.to)) continue;
        const child = longest(edge.to, new Set([...seen, id]));
        if (child.hops + 1 > best.hops) best = { hops: child.hops + 1, path: [id, ...child.path], edges: [edge.id, ...child.edges] };
      }
      memo.set(id, best);
      return best;
    };
    const chains = model.entrypoints.map((id) => longest(id)).filter((chain) => chain.hops > DEEP_CHAIN_HOPS).sort((a, b) => b.hops - a.hops);
    if (chains.length) {
      const chain = chains[0];
      add('deep-sync-chain', {
        nodes: chain.path, edges: chain.edges,
        basis: worst(...chain.edges.map((id) => edges.find((e) => e.id === id).basis.call_semantics)),
        evidence: `${chain.hops} blocking hops in a row (${chain.path.join(' → ')}) with no circuit breaker or asynchronous step. A slow or failed component at the end stalls every caller.`,
        remediation: 'Add circuit breakers with timeouts along the chain, or move a step behind a queue or event stream.',
        fixes: chain.edges.map((edgeId) => ({ target: 'connection', id: edgeId, operational: { resilience: { circuit_breaker_enabled: true } }, summary: `Add a circuit breaker on ${edgeId}` })),
      });
    }
  }

  // 3. Timeout hierarchy (authored timeouts only).
  for (const callee of edges) {
    if (callee.call_semantics !== 'sync-blocking' || callee.resilience.timeout_ms == null) continue;
    const budget = callee.resilience.timeout_ms * ((callee.resilience.retries ?? 0) + 1);
    for (const caller of edges.filter((edge) => edge.to === callee.from && edge.call_semantics === 'sync-blocking' && edge.resilience.timeout_ms != null)) {
      if (caller.resilience.timeout_ms < budget) {
        add('timeout-hierarchy', {
          nodes: [caller.from, callee.from, callee.to], edges: [caller.id, callee.id], basis: 'authored',
          evidence: `${caller.id} times out after ${caller.resilience.timeout_ms} ms, but ${callee.id} may take ${budget} ms (${callee.resilience.timeout_ms} ms × ${(callee.resilience.retries ?? 0) + 1} attempts). The caller gives up while work continues downstream.`,
          remediation: `Raise the timeout on ${caller.id} above ${budget} ms, or lower the timeout or retries on ${callee.id}.`,
          // 10% above the callee's budget, rounded up to 50 ms: derived from the authored values.
          fixes: [{ target: 'connection', id: caller.id, operational: { resilience: { timeout_ms: Math.ceil((budget * 1.1) / 50) * 50 } }, summary: `Raise the timeout on ${caller.id} to ${Math.ceil((budget * 1.1) / 50) * 50} ms` }],
        });
      }
    }
  }

  // 4. Asynchronous consumers without dead-letter handling or idempotency.
  for (const edge of edges) {
    if (!ASYNC.has(edge.call_semantics) || edge.resilience.dlq_node_id != null || edge.resilience.idempotent === true) continue;
    add('unprotected-async-consumer', {
      nodes: [edge.to], edges: [edge.id], basis: worst(edge.basis.call_semantics),
      evidence: `${edge.id} delivers messages to ${nodeById.get(edge.to)?.label ?? edge.to} with no dead-letter destination and no idempotency guarantee. A message that keeps failing blocks or is lost; a redelivered message may be applied twice.`,
      remediation: 'Declare a dead-letter destination (dlq_node_id) or make the consumer idempotent.',
      fixes: [{ target: 'connection', id: edge.id, operational: { resilience: { idempotent: true } }, summary: `Make the consumer of ${edge.id} idempotent` }],
    });
  }

  // 5. Public entry straight into a data store with no authentication contract.
  for (const edge of edges) {
    const from = nodeById.get(edge.from); const to = nodeById.get(edge.to);
    if (!from || !to || to.role !== 'stateful-db') continue;
    const exposed = from.security.public_exposed === true || from.role === 'ingress' || from.role === 'cdn';
    const auth = to.security.auth_method;
    if (!exposed || (auth && auth !== 'none')) continue;
    add('zero-trust-violation', {
      nodes: [from.id, to.id], edges: [edge.id],
      basis: worst(from.basis['security.public_exposed'] ?? from.basis.role, to.basis.role, auth === 'none' ? 'authored' : 'assumed'),
      evidence: `${from.label} is publicly reachable and connects straight to ${to.label}, which declares ${auth === 'none' ? 'no authentication' : 'no authentication method'}. There is no gateway or service tier between the internet and the data.`,
      remediation: `Put a gateway or application tier between ${from.label} and ${to.label}, and require authenticated access (for example mTLS or workload identity) on ${to.label}.`,
    });
  }

  // 6. Chatty synchronous calls across a region or zone boundary with an egress price.
  for (const [edgeId, item] of Object.entries(cost.egress)) {
    const edge = edges.find((e) => e.id === edgeId);
    const flow = result.edges[edgeId].flow_rps;
    if (edge.call_semantics !== 'sync-blocking' || flow == null || flow < CHATTY_EGRESS_RPS) continue;
    add('chatty-cross-boundary-egress', {
      nodes: [edge.from, edge.to], edges: [edgeId], basis: 'authored',
      evidence: `${edgeId} carries ${flow} requests per second across a region or zone boundary: about ${item.gb_per_month} GB and $${item.cost_usd} of egress a month in this model.`,
      remediation: 'Keep chatty calls inside one boundary, batch them, or replicate the data so reads stay local.',
    });
  }

  // 7. Stateful components without recovery objectives.
  for (const node of model.nodes.filter((n) => STATEFUL.has(n.role) && (n.dr.rto_sec == null || n.dr.rpo_sec == null))) {
    add('missing-recovery-objectives', {
      nodes: [node.id], basis: worst(node.basis.role),
      evidence: `${node.label} holds data but has no ${[node.dr.rpo_sec == null ? 'recovery point (RPO)' : null, node.dr.rto_sec == null ? 'recovery time (RTO)' : null].filter(Boolean).join(' or ')} objective.`,
      remediation: `Set dr.rpo_sec and dr.rto_sec for ${node.label} and confirm the backup strategy meets them.`,
    });
  }

  // 8. Idle over-provisioning (authored load and capacity only).
  for (const node of model.nodes) {
    const util = result.nodes[node.id].utilisation;
    if (util == null || util >= 0.1 || !(node.capacity.autoscale_min > 1) || node.basis['capacity.max_rps'] !== 'authored') continue;
    add('idle-over-provisioning', {
      nodes: [node.id], basis: 'authored',
      evidence: `${node.label} runs at ${Math.round(util * 1000) / 10}% of its capacity with a minimum of ${node.capacity.autoscale_min} instances.`,
      remediation: 'Lower the minimum instance count or use a smaller tier, keeping the redundancy you need.',
    });
  }

  // 9. Data stores not encrypted at rest.
  const complianceStated = (model.requirements?.compliance?.length ?? 0) > 0;
  for (const node of model.nodes.filter((n) => STATEFUL.has(n.role))) {
    const value = node.security.encryption_at_rest;
    if (value === true || (value == null && !complianceStated && node.security.compliance_tags.length === 0)) continue;
    add('unencrypted-data-store', {
      nodes: [node.id], basis: value === false ? 'authored' : 'assumed', severity: value === false ? 'high' : 'medium',
      evidence: value === false ? `${node.label} is declared as not encrypted at rest.` : `${node.label} is in scope of a stated compliance requirement but does not declare encryption at rest.`,
      remediation: `Enable encryption at rest on ${node.label} and record it in security.encryption_at_rest.`,
      fixes: [{ target: 'component', id: node.id, operational: { security: { encryption_at_rest: true } }, summary: `Encrypt ${node.label} at rest` }],
    });
  }

  // Requirement checks: the design against stated targets.
  const req = model.requirements;
  const modelBasis = result.basis.assumed_inputs > 0 ? 'assumed' : 'authored';
  if (req) {
    const sla = result.kpis.composite_sla_percent;
    if (req.availability_target_percent != null && sla != null && sla < req.availability_target_percent) {
      add('requirement-availability', {
        nodes: result.kpis.active_spofs, basis: modelBasis,
        evidence: `Modelled composite availability is ${sla}% against a target of ${req.availability_target_percent}%.`,
        remediation: 'Remove single points of failure on the request path, or add fallbacks for the least available dependencies.',
      });
    }
    const p99 = result.kpis.critical_path?.p99_ms;
    if (req.p99_latency_ms != null && p99 != null && p99 > req.p99_latency_ms) {
      add('requirement-latency', {
        nodes: result.kpis.critical_path.nodes.filter((id) => nodeById.has(id)), basis: modelBasis,
        evidence: `Modelled critical-path P99 is ${p99} ms against a target of ${req.p99_latency_ms} ms (path: ${result.kpis.critical_path.nodes.join(' → ')}).`,
        remediation: 'Shorten the synchronous path: cache, parallelise, or move steps behind a queue.',
      });
    }
    const limit = result.kpis.max_sustainable_rps;
    if (req.peak_rps != null && limit != null && limit < req.peak_rps) {
      add('requirement-capacity', {
        nodes: result.kpis.limiting_node ? [result.kpis.limiting_node] : [], basis: modelBasis,
        evidence: `The model sustains ${limit} requests per second; the stated peak is ${req.peak_rps}. The limit is ${nodeById.get(result.kpis.limiting_node)?.label ?? 'unknown'}.`,
        remediation: 'Raise the capacity or autoscaling ceiling of the limiting component, or reduce the load reaching it.',
      });
    }
    for (const node of model.nodes.filter((n) => STATEFUL.has(n.role))) {
      const gaps = [];
      if (req.rpo_sec != null && node.dr.rpo_sec != null && node.dr.rpo_sec > req.rpo_sec) gaps.push(`RPO ${node.dr.rpo_sec} s exceeds the required ${req.rpo_sec} s`);
      if (req.rto_sec != null && node.dr.rto_sec != null && node.dr.rto_sec > req.rto_sec) gaps.push(`RTO ${node.dr.rto_sec} s exceeds the required ${req.rto_sec} s`);
      if (gaps.length) add('requirement-recovery', { nodes: [node.id], basis: 'authored', evidence: `${node.label}: ${gaps.join('; ')}.`, remediation: 'Tighten replication or backup frequency and rehearse failover to meet the objectives.' });
    }
    if (req.monthly_budget_usd != null && cost.monthly_total_usd != null && cost.monthly_total_usd > req.monthly_budget_usd) {
      add('requirement-budget', {
        basis: 'authored',
        evidence: `Estimated cost is $${cost.monthly_total_usd} a month against a budget of $${req.monthly_budget_usd}, covering ${cost.coverage.priced_components} of ${cost.coverage.components} components.`,
        remediation: 'Review the largest cost lines first; right-size tiers and minimum instance counts.',
      });
    }
  }

  findings.sort((a, b) => (SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]) || (a.id < b.id ? -1 : 1));
  const penalty = (finding) => WEIGHTS[finding.severity] * (finding.basis === 'assumed' ? 0.5 : 1);
  const score = Math.max(0, Math.round((100 - findings.reduce((sum, finding) => sum + penalty(finding), 0)) * 10) / 10);
  const pillars = Object.fromEntries(PILLARS.map((pillar) => {
    const own = findings.filter((finding) => finding.pillar === pillar);
    return [pillar, { score: Math.max(0, Math.round((100 - own.reduce((sum, finding) => sum + penalty(finding), 0)) * 10) / 10), findings: own.length }];
  }));
  return {
    kind: 'analytical-model',
    score,
    pillars,
    counts: Object.fromEntries(Object.keys(WEIGHTS).map((severity) => [severity, findings.filter((f) => f.severity === severity).length])),
    findings,
    kpis: result.kpis,
    cost: { monthly_total_usd: cost.monthly_total_usd, coverage: cost.coverage },
    basis: { ...result.basis, assumed_findings: findings.filter((f) => f.basis === 'assumed').length },
    rules_checked: RULES.map(({ id, title, pillars: rulePillars }) => ({ id, title, pillars: rulePillars })),
    note: 'Findings come from an analytical model of the declared architecture. Those marked "assumed" rest on inferred roles or default values and count half toward the score.',
  };
}
