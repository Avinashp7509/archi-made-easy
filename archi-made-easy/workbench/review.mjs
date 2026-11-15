// Architecture review: structural and requirement checks over the operational model,
// organised by Well-Architected pillar, with an overall score.
//
// Every finding states its basis. "authored" means it rests on values in the document;
// "assumed" means it rests on inferred roles or default values, counts half toward the
// score, and should be confirmed before acting on it.
//
// A rule that cannot run is not a rule that passed. Each rule declares what it needs
// (`requires`); the review records, per rule, whether it was evaluated, and lists every
// place it could not be as a gap. The result keeps six things apart:
//   quality (score)            penalties from the findings of the rules that ran;
//   score_floor                the score if every rule that could not run had fired;
//   evaluation completeness    how many applicable rules ran;
//   evidence confidence        how many inputs are authored rather than assumed;
//   price coverage             how much of the design the cost estimate covers;
//   simulation coverage        which model calculations were complete.
// A high score with low coverage is a high score about little: outputs show both.

import { reason, combineStatuses } from './evidence.mjs';
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
 * `requires` lists the inputs the rule needs and `applies` the designs it concerns: a rule
 * with a missing input is reported as not evaluated, never as passed.
 */
export const RULES = Object.freeze([
  { id: 'spof', title: 'Single point of failure on a critical path', pillars: ['Reliability'], severity: 'high', status: 'implemented',
    requires: ['an entry point', 'redundancy of each component on the request path (role default allowed; a provider-managed service needs it stated)'], applies: 'designs with an entry point',
    consequence: 'When this component fails, every request that depends on it fails until it is restored.' },
  { id: 'deep-sync-chain', title: 'Deep synchronous call chain', pillars: ['Reliability', 'Performance'], severity: 'medium', status: 'implemented',
    requires: ['an entry point', 'call semantics of each connection (inferred from the target role when not stated)'], applies: 'designs with an entry point',
    consequence: 'One slow or failed component at the end of the chain holds up every caller above it, so a local fault becomes a full outage.' },
  { id: 'timeout-hierarchy', title: 'Caller timeout shorter than the callee retry budget', pillars: ['Reliability'], severity: 'high', status: 'implemented',
    requires: ['resilience.timeout_ms on both calls of each chained pair of blocking calls'], applies: 'designs where one blocking call follows another',
    consequence: 'The caller gives up and may retry while the callee is still working, which multiplies load during an incident and can apply an operation twice.' },
  { id: 'unprotected-async-consumer', title: 'Asynchronous consumer without dead-letter handling or idempotency', pillars: ['Reliability', 'Operational Excellence'], severity: 'medium', status: 'implemented',
    requires: ['resilience.dlq_node_id or resilience.idempotent on each asynchronous connection'], applies: 'designs with a queue, topic or stream connection',
    consequence: 'A message that cannot be processed is retried forever or dropped, and a redelivered message can be applied twice.' },
  { id: 'zero-trust-violation', title: 'Public entry reaches a data store directly without authentication', pillars: ['Security'], severity: 'critical', status: 'implemented',
    requires: ['security.auth_method of each database reached from a public entry (not stated counts as none, marked assumed)'], applies: 'designs with a database',
    consequence: 'Anyone who can reach the public entry has a direct network path to the data store.' },
  { id: 'chatty-cross-boundary-egress', title: 'High-volume synchronous calls across a region or zone boundary', pillars: ['Cost'], severity: 'medium', status: 'implemented',
    requires: ['traffic.egress_cost_per_gb_usd on connections that cross a region or zone', 'capacity.baseline_rps on an entry point'], applies: 'designs with a priced connection across a region or zone boundary',
    consequence: 'Every call pays network latency and data-transfer cost, and the boundary becomes a shared failure point for both sides.' },
  { id: 'missing-recovery-objectives', title: 'Stateful component without recovery objectives', pillars: ['Operational Excellence'], severity: 'low', status: 'implemented',
    requires: [], applies: 'designs with a stateful component',
    consequence: 'Nobody can say how much data may be lost or how long recovery may take, so backups cannot be judged sufficient.' },
  { id: 'idle-over-provisioning', title: 'Idle capacity kept running', pillars: ['Sustainability', 'Cost'], severity: 'low', status: 'implemented',
    requires: ['capacity.baseline_rps on an entry point', 'capacity.max_rps stated on the component'], applies: 'components with a stated minimum of more than one instance',
    consequence: 'Capacity is paid for and powered without serving load.' },
  { id: 'unencrypted-data-store', title: 'Data store not encrypted at rest', pillars: ['Security'], severity: 'high', status: 'implemented',
    requires: ['security.encryption_at_rest on each data store'], applies: 'designs with a stateful component',
    consequence: 'Stored data is readable from the underlying disks, snapshots and backups.' },
  { id: 'requirement-availability', title: 'Modelled availability below the stated target', pillars: ['Reliability'], severity: 'high', status: 'implemented',
    requires: ['workbench.requirements.availability_target_percent', 'modelled composite availability'], applies: 'when an availability target is stated',
    consequence: 'The design as declared cannot meet the stated availability target.' },
  { id: 'requirement-latency', title: 'Modelled P99 latency above the stated target', pillars: ['Performance'], severity: 'high', status: 'implemented',
    requires: ['workbench.requirements.p99_latency_ms', 'modelled critical-path latency'], applies: 'when a latency target is stated',
    consequence: 'The slowest one percent of requests exceed the stated latency target.' },
  { id: 'requirement-capacity', title: 'Modelled capacity below the stated peak load', pillars: ['Performance'], severity: 'high', status: 'implemented',
    requires: ['workbench.requirements.peak_rps', 'modelled capacity ceiling'], applies: 'when a peak load is stated',
    consequence: 'At the stated peak a component saturates: requests queue, slow down or fail.' },
  { id: 'requirement-recovery', title: 'Recovery objectives weaker than required', pillars: ['Reliability'], severity: 'high', status: 'implemented',
    requires: ['workbench.requirements.rpo_sec or rto_sec', 'dr.rpo_sec and dr.rto_sec on each stateful component'], applies: 'when recovery objectives are required',
    consequence: 'A failure would lose more data or take longer to recover than the stated objectives allow.' },
  { id: 'requirement-budget', title: 'Estimated monthly cost above the stated budget', pillars: ['Cost'], severity: 'medium', status: 'implemented',
    requires: ['workbench.requirements.monthly_budget_usd', 'a complete cost estimate, or a partial one already above the budget'], applies: 'when a monthly budget is stated',
    consequence: 'The design as declared costs more than the stated budget.' },
]);
const RULE = Object.fromEntries(RULES.map((rule) => [rule.id, rule]));

const worst = (...bases) => (bases.some((basis) => basis === 'assumed' || basis == null) ? 'assumed' : 'authored');

/**
 * @param {object} model from buildModel()
 * @param {{ multiplier?: number, cacheHit?: number }} inputs conditions to review under
 * @returns {{ findings: object[], score: number, pillars: object, rules: object[], kind: string }}
 */
export function review(model, { multiplier = 1, cacheHit = 0, asOf } = {}) {
  const result = simulate(model, { multiplier, cacheHit });
  const cost = estimateCost(model, result, { asOf });
  const nodeById = new Map(model.nodes.map((n) => [n.id, n]));
  const edges = [...model.edges].sort((a, b) => (a.id < b.id ? -1 : 1));
  const outgoing = (id) => edges.filter((edge) => edge.from === id);
  const name = (id) => model.display?.[id] ?? nodeById.get(id)?.label ?? id;
  const findings = [];
  // Per rule: how many subjects it was evaluated on, and every place it could not be.
  const evaluation = Object.fromEntries(RULES.map((rule) => [rule.id, { applicable: false, evaluated: 0, skipped: 0 }]));
  const gaps = [];
  const ran = (ruleId, count = 1) => { evaluation[ruleId].applicable = true; evaluation[ruleId].evaluated += count; };
  /** The rule applies here but could not be evaluated: record why, and what would let it run. */
  const gap = (ruleId, code, { subjects = [], message, ask, missing = [], instances } = {}) => {
    const rule = RULE[ruleId];
    evaluation[ruleId].applicable = true; evaluation[ruleId].skipped += 1;
    const entry = reason(code, { message, ask });
    // `instances`: how many findings this gap could be hiding (one per unchecked subject).
    gaps.push({ id: `${ruleId}:${code}:${[...subjects].sort().join(',') || 'design'}`, rule: ruleId, title: rule.title, pillar: rule.pillars[0], pillars: rule.pillars, code, subjects: [...subjects].sort(), instances: instances ?? Math.max(1, subjects.length), message: entry.message, ask: entry.ask, missing });
  };
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
  if (!model.entrypoints.length) gap('spof', 'no-entry-point');
  else ran('spof');
  for (const id of result.kpis.active_spofs) {
    const node = nodeById.get(id);
    // A provider-managed service whose redundancy is only a role default: its redundancy is
    // the provider's and is not known here. That is a question to confirm, not a single
    // point of failure the design can fix by redeploying the provider's service.
    if (node.managed_by === 'provider' && node.origin.redundancy !== 'authored') {
      gap('spof', 'provider-managed-redundancy', {
        subjects: [id],
        message: `${name(id)} is a provider-managed service and the document does not state its redundancy, so whether it is a single point of failure is not known. The model assumes one unit.`,
        ask: `Confirm the provider's availability commitment for ${name(id)} and state it (sla_percent, redundancy), or give its callers a fallback.`,
        missing: [{ input: 'redundancy', subject: id, unit: null }],
      });
      continue;
    }
    add('spof', {
      nodes: [id], basis: worst(node.basis.redundancy, node.basis.role),
      evidence: `${node.label} is a single instance that every request through an entry depends on.`,
      remediation: `Run ${node.label} across at least two failure domains (multi-az), or give its callers a fallback.`,
      fixes: [{ target: 'component', id, operational: { redundancy: 'multi-az' }, summary: `Run ${node.label} across at least two zones` }],
    });
  }

  // 2. Deep synchronous chains with no circuit breaker or asynchronous hop.
  {
    // `breakers` are connections treated as already protected (used to work out the fix).
    const deepest = (breakers = new Set()) => {
      const hard = (edge) => edge.call_semantics === 'sync-blocking' && !edge.resilience.circuit_breaker_enabled && !breakers.has(edge.id);
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
      return model.entrypoints.map((id) => longest(id)).filter((chain) => chain.hops > DEEP_CHAIN_HOPS).sort((a, b) => b.hops - a.hops);
    };
    if (!model.entrypoints.length) gap('deep-sync-chain', 'no-entry-point');
    else ran('deep-sync-chain');
    // A circuit breaker belongs to the caller. It can be previewed only where the caller is
    // something this design deploys: not the users, and not a provider's managed service.
    const ownsCaller = (edgeId) => {
      const from = nodeById.get(edges.find((e) => e.id === edgeId).from);
      return from && !from.actor && from.managed_by !== 'provider';
    };
    const chains = deepest();
    if (chains.length) {
      const chain = chains[0];
      // The fix: breakers on connections whose caller this design owns, added chain by chain
      // until no deep chain is left. If a deep chain has no such connection left, breakers
      // alone cannot close the finding and no previewable fix is offered.
      const breakers = new Set(); const fixEdges = [];
      for (let guard = 0; guard <= edges.length; guard += 1) {
        const left = deepest(breakers)[0];
        if (!left) break;
        const owned = left.edges.filter((id) => ownsCaller(id) && !breakers.has(id));
        if (!owned.length) { fixEdges.length = 0; break; }
        for (const id of owned) { breakers.add(id); fixEdges.push(id); }
      }
      add('deep-sync-chain', {
        nodes: chain.path, edges: chain.edges,
        basis: worst(...chain.edges.map((id) => edges.find((e) => e.id === id).basis.call_semantics)),
        evidence: `${chain.hops} blocking hops in a row (${chain.path.join(' → ')}) with no circuit breaker or asynchronous step. A slow or failed component at the end stalls every caller.`,
        remediation: 'Add circuit breakers with timeouts along the chain, or move a step behind a queue or event stream.',
        fixes: fixEdges.sort().map((edgeId) => ({ target: 'connection', id: edgeId, operational: { resilience: { circuit_breaker_enabled: true } }, summary: `Add a circuit breaker on ${edgeId}` })),
      });
    }
  }

  // 3. Timeout hierarchy (authored timeouts only). A chained pair with a missing timeout is
  // not evaluated: it is recorded as a gap, not passed.
  {
    const untimed = new Set(); let uncheckedPairs = 0;
    for (const callee of edges.filter((edge) => edge.call_semantics === 'sync-blocking')) {
      for (const caller of edges.filter((edge) => edge.to === callee.from && edge.call_semantics === 'sync-blocking')) {
        if (caller.resilience.timeout_ms != null && callee.resilience.timeout_ms != null) ran('timeout-hierarchy');
        else { uncheckedPairs += 1; if (caller.resilience.timeout_ms == null) untimed.add(caller.id); if (callee.resilience.timeout_ms == null) untimed.add(callee.id); }
      }
    }
    if (untimed.size) {
      gap('timeout-hierarchy', 'rule-input-missing', {
        subjects: [...untimed], instances: uncheckedPairs,
        message: `${untimed.size} chained blocking call${untimed.size === 1 ? ' has' : 's have'} no timeout_ms, so whether callers give up before callees finish was not checked.`,
        ask: 'State resilience.timeout_ms (and retries) on the blocking calls listed.',
        missing: [...untimed].sort().map((id) => ({ input: 'resilience.timeout_ms', subject: id, unit: 'ms' })),
      });
    }
  }
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
    if (!ASYNC.has(edge.call_semantics)) continue;
    ran('unprotected-async-consumer');
    if (edge.resilience.dlq_node_id != null || edge.resilience.idempotent === true) continue;
    add('unprotected-async-consumer', {
      // "Not stated" is not "declared absent": the finding is authored only when the
      // document says the consumer is not idempotent.
      nodes: [edge.to], edges: [edge.id], basis: worst(edge.basis.call_semantics, edge.resilience.idempotent === false ? 'authored' : 'assumed'),
      evidence: `${edge.id} delivers messages to ${nodeById.get(edge.to)?.label ?? edge.to} with no dead-letter destination and no idempotency guarantee. A message that keeps failing blocks or is lost; a redelivered message may be applied twice.`,
      remediation: 'Declare a dead-letter destination (dlq_node_id) or make the consumer idempotent.',
      fixes: [{ target: 'connection', id: edge.id, operational: { resilience: { idempotent: true } }, summary: `Make the consumer of ${edge.id} idempotent` }],
    });
  }

  // 5. Public entry straight into a data store with no authentication contract.
  for (const edge of edges) {
    const from = nodeById.get(edge.from); const to = nodeById.get(edge.to);
    if (!from || !to || to.role !== 'stateful-db') continue;
    ran('zero-trust-violation');
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
    if (item.status === 'not_applicable' || edge.call_semantics !== 'sync-blocking') continue;
    if (flow == null || item.cost_usd == null) {
      gap('chatty-cross-boundary-egress', 'missing-baseline-load', {
        subjects: [edgeId],
        message: `${edgeId} crosses a region or zone boundary and has a transfer price, but its traffic is not known, so whether it is chatty was not checked.`,
        missing: [{ input: 'capacity.baseline_rps', subject: 'an entry component', unit: 'requests/s' }],
      });
      continue;
    }
    ran('chatty-cross-boundary-egress');
    if (flow < CHATTY_EGRESS_RPS) continue;
    add('chatty-cross-boundary-egress', {
      nodes: [edge.from, edge.to], edges: [edgeId], basis: 'authored',
      evidence: `${edgeId} carries ${flow} requests per second across a region or zone boundary: about ${item.gb_per_month} GB and $${item.cost_usd} of egress a month in this model.`,
      remediation: 'Keep chatty calls inside one boundary, batch them, or replicate the data so reads stay local.',
    });
  }

  // 7. Stateful components without recovery objectives.
  ran('missing-recovery-objectives', model.nodes.filter((n) => STATEFUL.has(n.role)).length);
  if (!model.nodes.some((n) => STATEFUL.has(n.role))) evaluation['missing-recovery-objectives'].applicable = false;
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
    if (!(node.capacity.autoscale_min > 1)) continue;
    if (util == null || node.basis['capacity.max_rps'] !== 'authored') {
      const noLoad = result.nodes[node.id].load_rps == null;
      gap('idle-over-provisioning', noLoad ? 'missing-baseline-load' : 'rule-input-missing', {
        subjects: [node.id],
        message: `${name(node.id)} keeps at least ${node.capacity.autoscale_min} instances running, but ${noLoad ? 'its load is not known' : 'its capacity is not stated'}, so whether that capacity is idle was not checked.`,
        ask: noLoad ? undefined : `State capacity.max_rps for ${name(node.id)}.`,
        missing: [noLoad ? { input: 'capacity.baseline_rps', subject: 'an entry component', unit: 'requests/s' } : { input: 'capacity.max_rps', subject: node.id, unit: 'requests/s' }],
      });
      continue;
    }
    ran('idle-over-provisioning');
    if (util >= 0.1) continue;
    add('idle-over-provisioning', {
      nodes: [node.id], basis: 'authored',
      evidence: `${node.label} runs at ${Math.round(util * 1000) / 10}% of its capacity with a minimum of ${node.capacity.autoscale_min} instances.`,
      remediation: 'Lower the minimum instance count or use a smaller tier, keeping the redundancy you need.',
    });
  }

  // 9. Data stores not encrypted at rest.
  const complianceStated = (model.requirements?.compliance?.length ?? 0) > 0;
  {
    // Not stated, with no compliance requirement in scope: the rule has nothing to judge.
    const unstated = model.nodes.filter((n) => STATEFUL.has(n.role) && n.security.encryption_at_rest == null && !complianceStated && n.security.compliance_tags.length === 0);
    if (unstated.length) {
      gap('unencrypted-data-store', 'rule-input-missing', {
        subjects: unstated.map((n) => n.id),
        message: `${unstated.map((n) => name(n.id)).join(', ')} ${unstated.length === 1 ? 'does' : 'do'} not state whether data is encrypted at rest, so this was not checked.`,
        ask: 'State security.encryption_at_rest (true or false) on each data store.',
        missing: unstated.map((n) => ({ input: 'security.encryption_at_rest', subject: n.id, unit: null })),
      });
    }
  }
  for (const node of model.nodes.filter((n) => STATEFUL.has(n.role))) {
    const value = node.security.encryption_at_rest;
    if (value == null && !complianceStated && node.security.compliance_tags.length === 0) continue;
    ran('unencrypted-data-store');
    if (value === true) continue;
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
    if (req.availability_target_percent != null) { if (sla == null) gap('requirement-availability', 'rule-input-missing', { message: 'Composite availability could not be modelled, so the availability target was not checked.' }); else ran('requirement-availability'); }
    if (req.availability_target_percent != null && sla != null && sla < req.availability_target_percent) {
      add('requirement-availability', {
        nodes: result.kpis.active_spofs, basis: modelBasis,
        evidence: `Modelled composite availability is ${sla}% against a target of ${req.availability_target_percent}%.`,
        remediation: 'Remove single points of failure on the request path, or add fallbacks for the least available dependencies.',
      });
    }
    const p99 = result.kpis.critical_path?.p99_ms;
    // Without a load the modelled latency has no queueing in it: a lower bound. Above the
    // target it is already a finding; below it, meeting the target under load is not shown.
    if (req.p99_latency_ms != null) {
      if (p99 == null) gap('requirement-latency', 'rule-input-missing', { message: 'Critical-path latency could not be modelled, so the latency target was not checked.' });
      else if (p99 <= req.p99_latency_ms && !result.basis.load_known) {
        gap('requirement-latency', 'missing-baseline-load', {
          message: `Latency with no load is ${p99} ms, within the target of ${req.p99_latency_ms} ms, but latency under load was not calculated because the load is not stated: the target is not confirmed.`,
          missing: [{ input: 'capacity.baseline_rps', subject: 'an entry component', unit: 'requests/s' }],
        });
      } else ran('requirement-latency');
    }
    if (req.p99_latency_ms != null && p99 != null && p99 > req.p99_latency_ms) {
      add('requirement-latency', {
        nodes: result.kpis.critical_path.nodes.filter((id) => nodeById.has(id)), basis: modelBasis,
        evidence: `Modelled critical-path P99 is ${p99} ms against a target of ${req.p99_latency_ms} ms (path: ${result.kpis.critical_path.nodes.join(' → ')}).`,
        remediation: 'Shorten the synchronous path: cache, parallelise, or move steps behind a queue.',
      });
    }
    const limit = result.kpis.max_sustainable_rps;
    if (req.peak_rps != null) { if (limit == null) gap('requirement-capacity', 'rule-input-missing', { message: 'The capacity ceiling could not be modelled, so the stated peak load was not checked.' }); else ran('requirement-capacity'); }
    if (req.peak_rps != null && limit != null && limit < req.peak_rps) {
      add('requirement-capacity', {
        nodes: result.kpis.limiting_node ? [result.kpis.limiting_node] : [], basis: modelBasis,
        evidence: `The model sustains ${limit} requests per second; the stated peak is ${req.peak_rps}. The limit is ${nodeById.get(result.kpis.limiting_node)?.label ?? 'unknown'}.`,
        remediation: 'Raise the capacity or autoscaling ceiling of the limiting component, or reduce the load reaching it.',
      });
    }
    for (const node of model.nodes.filter((n) => STATEFUL.has(n.role))) {
      const shortfalls = [];
      const unstated = [];
      if (req.rpo_sec != null) { if (node.dr.rpo_sec == null) unstated.push('dr.rpo_sec'); else if (node.dr.rpo_sec > req.rpo_sec) shortfalls.push(`RPO ${node.dr.rpo_sec} s exceeds the required ${req.rpo_sec} s`); }
      if (req.rto_sec != null) { if (node.dr.rto_sec == null) unstated.push('dr.rto_sec'); else if (node.dr.rto_sec > req.rto_sec) shortfalls.push(`RTO ${node.dr.rto_sec} s exceeds the required ${req.rto_sec} s`); }
      if (req.rpo_sec == null && req.rto_sec == null) continue;
      if (unstated.length) {
        gap('requirement-recovery', 'rule-input-missing', {
          subjects: [node.id],
          message: `${name(node.id)} does not state ${unstated.join(' and ')}, so the required recovery objectives were not checked for it.`,
          ask: `State ${unstated.join(' and ')} for ${name(node.id)}.`,
          missing: unstated.map((input) => ({ input, subject: node.id, unit: 's' })),
        });
      }
      if (unstated.length < [req.rpo_sec, req.rto_sec].filter((value) => value != null).length) ran('requirement-recovery');
      if (shortfalls.length) add('requirement-recovery', { nodes: [node.id], basis: 'authored', evidence: `${node.label}: ${shortfalls.join('; ')}.`, remediation: 'Tighten replication or backup frequency and rehearse failover to meet the objectives.' });
    }
    if (req.monthly_budget_usd != null) {
      // A complete estimate is compared directly. A partial one is a lower bound: above the
      // budget it is already a finding; below it, nothing can be concluded.
      const figure = cost.status === 'complete' ? cost.monthly_total_usd : cost.status === 'partial' ? cost.subtotal_usd : null;
      if (figure != null && figure > req.monthly_budget_usd) {
        ran('requirement-budget');
        add('requirement-budget', {
          basis: 'authored',
          evidence: cost.status === 'complete'
            ? `Estimated cost is ${cost.monthly_total_usd} a month against a budget of ${req.monthly_budget_usd}, covering ${cost.coverage.priced_components} of ${cost.coverage.components} components.`
            : `The part of the cost that could be estimated is already ${cost.subtotal_usd} a month against a budget of ${req.monthly_budget_usd}. The estimate is partial (${cost.coverage.priced_components} of ${cost.coverage.components} components priced), so the real cost is higher.`,
          remediation: 'Review the largest cost lines first; right-size tiers and minimum instance counts.',
        });
      } else if (cost.status === 'complete') ran('requirement-budget');
      else {
        gap('requirement-budget', cost.status === 'unknown' ? 'no-cost-data' : 'cost-estimate-incomplete', {
          message: cost.status === 'unknown'
            ? `A budget of ${req.monthly_budget_usd} is stated, but no component carries cost data, so it was not checked.`
            : `A budget of ${req.monthly_budget_usd} is stated, but the cost estimate is ${cost.status}${cost.subtotal_usd != null ? ` (a subtotal of ${cost.subtotal_usd} so far)` : ''}, so staying within budget was not confirmed.`,
        });
      }
    }
  }

  // The cost estimate itself: when it is not complete, the Cost pillar says so with an
  // actionable gap instead of "no rule fired".
  if (cost.status !== 'complete' && cost.status !== 'unknown') {
    const first = cost.omitted[0];
    gaps.push({
      id: 'cost-estimate:incomplete', rule: null, title: 'Cost estimate is not complete', pillar: 'Cost', pillars: ['Cost'], code: 'cost-estimate-incomplete',
      subjects: [...new Set([...cost.omitted.map((item) => item.subject), ...cost.coverage.unpriced])].sort(),
      message: `The cost estimate is ${cost.status}: ${cost.coverage.priced_components} of ${cost.coverage.components} priceable components carry prices and ${cost.coverage.meters.computed} of ${cost.coverage.meters.total} meters could be calculated.${first ? ` For example ${name(first.subject)}: ${first.message}` : ''}`,
      ask: cost.reasons[0]?.ask ?? null, missing: cost.omitted.flatMap((item) => item.missing ?? []),
    });
  }
  gaps.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  findings.sort((a, b) => (SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]) || (a.id < b.id ? -1 : 1));
  const penalty = (finding) => WEIGHTS[finding.severity] * (finding.basis === 'assumed' ? 0.5 : 1);
  const tenth = (value) => Math.max(0, Math.round(value * 10) / 10);
  // Rule status: complete (ran everywhere it applies), partial (ran in some places),
  // inconclusive (applies, ran nowhere), not_applicable.
  const ruleResults = RULES.map((rule) => {
    const e = evaluation[rule.id];
    const status = !e.applicable ? 'not_applicable' : e.skipped === 0 ? 'complete' : e.evaluated > 0 ? 'partial' : 'inconclusive';
    return { id: rule.id, title: rule.title, pillars: rule.pillars, severity: rule.severity, status, evaluated: e.evaluated, not_evaluated: e.skipped, findings: findings.filter((f) => f.rule === rule.id).length, requires: rule.requires, applies: rule.applies };
  });
  const applicable = ruleResults.filter((rule) => rule.status !== 'not_applicable');
  const evaluatedRules = applicable.filter((rule) => rule.status === 'complete');
  // Quality: penalties of the findings found. Null when no rule could run at all.
  const anyRan = applicable.some((rule) => rule.status !== 'inconclusive');
  const score = tenth(100 - findings.reduce((sum, finding) => sum + penalty(finding), 0));
  // Floor: the worst case the evidence allows. Every finding counts in full, including the
  // assumed ones that count half in the score, and every gap counts as the findings it could
  // be hiding. Removing a fact from the document can therefore never raise the floor.
  const floorOf = (own, pillar) => tenth(100
    - own.reduce((sum, finding) => sum + WEIGHTS[finding.severity], 0)
    - gaps.filter((item) => item.rule && (!pillar || item.pillar === pillar)).reduce((sum, item) => sum + WEIGHTS[RULE[item.rule].severity] * item.instances, 0));
  const costOpen = cost.status !== 'complete';
  const pillars = Object.fromEntries(PILLARS.map((pillar) => {
    const own = findings.filter((finding) => finding.pillar === pillar);
    const rules = ruleResults.filter((rule) => rule.pillars[0] === pillar);
    const pillarApplicable = rules.filter((rule) => rule.status !== 'not_applicable');
    const pillarScore = tenth(100 - own.reduce((sum, finding) => sum + penalty(finding), 0));
    // The Cost pillar also depends on the estimate: an incomplete or absent estimate means
    // cost was not fully assessed, whatever the rules say.
    const parts = [...pillarApplicable.map((rule) => rule.status), ...(pillar === 'Cost' ? [cost.status] : [])];
    const status = parts.length ? combineStatuses(parts) : 'not_applicable';
    const assessed = status === 'complete' || status === 'partial';
    return [pillar, {
      // Null when nothing in this pillar could be assessed: not 100.
      score: assessed ? pillarScore : null,
      floor: assessed ? floorOf(own, pillar) : null,
      findings: own.length,
      status,
      rules: { applicable: pillarApplicable.length, evaluated: pillarApplicable.filter((rule) => rule.status === 'complete').length },
      gaps: gaps.filter((item) => item.pillar === pillar).length,
    }];
  }));
  const status = applicable.length ? combineStatuses([...applicable.map((rule) => rule.status), ...(costOpen && cost.status !== 'unknown' ? [cost.status] : [])]) : 'not_applicable';
  const coverage = {
    rules: RULES.length,
    applicable: applicable.length,
    evaluated: evaluatedRules.length,
    partial: applicable.filter((rule) => rule.status === 'partial').length,
    inconclusive: applicable.filter((rule) => rule.status === 'inconclusive').length,
    not_applicable: RULES.length - applicable.length,
    share: applicable.length ? Math.round((evaluatedRules.length / applicable.length) * 1000) / 1000 : null,
  };
  const calculations = Object.entries(result.assessments).map(([id, item]) => ({ id, status: item.status }));
  const scoreFloor = floorOf(findings);
  return {
    kind: 'analytical-model',
    // Completeness of the review itself: "complete" only when every applicable rule ran.
    status,
    // Quality from the rules that ran. Read it with `score_floor` and `coverage`.
    score: anyRan ? score : null,
    score_floor: anyRan ? scoreFloor : null,
    coverage,
    pillars,
    counts: Object.fromEntries(Object.keys(WEIGHTS).map((severity) => [severity, findings.filter((f) => f.severity === severity).length])),
    findings,
    // Where a rule applies but could not be evaluated, and what would let it run.
    gaps,
    rule_results: ruleResults,
    // The six things a score must not blur together.
    dimensions: {
      architecture_quality: { score: anyRan ? score : null, floor: anyRan ? scoreFloor : null, findings: findings.length },
      evaluation_completeness: { status, ...coverage },
      evidence_confidence: result.confidence,
      price_coverage: { status: cost.status, priced_components: cost.coverage.priced_components, components: cost.coverage.components, meters: cost.coverage.meters, price_evidence: cost.confidence.level },
      simulation_coverage: { status: result.status, calculations },
      unresolved: [...new Set([...gaps.map((item) => item.code), ...result.reasons.map((item) => item.code), ...(cost.status === 'unknown' ? [] : cost.reasons.map((item) => item.code))])].sort(),
    },
    kpis: result.kpis,
    cost: { status: cost.status, monthly_total_usd: cost.monthly_total_usd, subtotal_usd: cost.subtotal_usd, coverage: cost.coverage, confidence: cost.confidence.level },
    simulation: { status: result.status, reasons: result.reasons },
    confidence: result.confidence,
    basis: { ...result.basis, assumed_findings: findings.filter((f) => f.basis === 'assumed').length },
    rules_checked: RULES.map(({ id, title, pillars: rulePillars }) => ({ id, title, pillars: rulePillars })),
    note: 'Findings come from an analytical model of the declared architecture. Those marked "assumed" rest on inferred roles or default values and count half toward the score. A rule that could not be evaluated is listed under gaps: it is not a pass. The floor is the score if every assumed finding counted in full and every check that could not run had found a problem.',
  };
}
