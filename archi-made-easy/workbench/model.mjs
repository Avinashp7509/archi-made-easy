// Operational model: an architecture document normalised for review, simulation and the
// workbench. Pure and deterministic (no I/O, no clock, no randomness).
//
// Every operational value carries its basis in `basis`: "authored" when it came from the
// document, "assumed" when it came from defaults.mjs or inference. Outputs built on the
// model must surface that distinction; nothing assumed may be presented as measured.

import { EDGE_DEFAULTS, ROLE_DEFAULTS, inferCallSemantics, inferRole } from './defaults.mjs';

export const MODEL_SCHEMA_VERSION = 1;
const Z95 = 1.6448536269514722;
const Z99 = 2.3263478740408408;

function has(object, key) {
  return object != null && Object.prototype.hasOwnProperty.call(object, key) && object[key] !== undefined && object[key] !== null;
}

/** Copy `value` (authored) or `fallback` (assumed) into target[key], recording the basis. */
function pick(target, basis, path, authoredSource, key, fallback) {
  if (has(authoredSource, key)) {
    target[key] = authoredSource[key];
    basis[path] = 'authored';
  } else if (fallback !== undefined && fallback !== null) {
    target[key] = fallback;
    basis[path] = 'assumed';
  } else {
    target[key] = null;
  }
}

/** p95 from p50 and p99 under a lognormal fit (used only when p95 is not authored). */
export function lognormalP95(p50, p99) {
  if (!(p50 > 0) || !(p99 > 0)) return null;
  const mu = Math.log(p50);
  const sigma = Math.max(0, (Math.log(p99) - mu) / Z99);
  return Math.exp(mu + Z95 * sigma);
}

function round(value, digits = 3) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return value;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function boundaryScope(boundary) {
  if (has(boundary.operational, 'scope')) return { scope: boundary.operational.scope, basis: 'authored' };
  if (boundary.kind === 'security-group') return { scope: 'trust-zone', basis: 'assumed' };
  const label = `${boundary.label}`;
  if (/\b(az|availability zone|zone [a-z0-9]|[a-z]{2}-[a-z]+-\d[a-z])\b/i.test(label)) return { scope: 'availability-zone', basis: 'assumed' };
  if (/\b(region|[a-z]{2}-[a-z]+-\d|us east|us west|europe|asia|eastus|westus|westeurope|northeurope)\b/i.test(label)) return { scope: 'region', basis: 'assumed' };
  return { scope: null, basis: null };
}

/**
 * Build the operational model.
 * @param {object} document a schema-valid architecture document
 * @returns {{ model: object, diagnostics: object[] }}
 */
export function buildModel(document) {
  const diagnostics = [];
  const report = (code, message, subject = {}, severity = 'error') => diagnostics.push({ code, severity, message, subject, evidence: {}, supportedFixes: [] });

  const components = document.components || [];
  const connections = document.connections || [];
  const boundariesIn = document.boundaries || [];
  const workbench = document.workbench || {};
  const authored = components.some((c) => c.operational) || connections.some((c) => c.operational)
    || boundariesIn.some((b) => b.operational) || Object.keys(workbench).length > 0;

  const inbound = new Map(components.map((c) => [c.id, 0]));
  const outbound = new Map(components.map((c) => [c.id, 0]));
  for (const connection of connections) {
    inbound.set(connection.to, (inbound.get(connection.to) || 0) + 1);
    outbound.set(connection.from, (outbound.get(connection.from) || 0) + 1);
  }

  // Boundaries first, so nodes can record membership and inherited trust zones.
  const boundaries = boundariesIn.map((boundary, index) => {
    const { scope, basis: scopeBasis } = boundaryScope(boundary);
    const basis = {};
    if (scopeBasis) basis.scope = scopeBasis;
    const trustZone = has(boundary.operational, 'trust_zone') ? boundary.operational.trust_zone
      : boundary.kind === 'security-group' ? boundary.label : null;
    if (trustZone) basis.trust_zone = has(boundary.operational, 'trust_zone') ? 'authored' : 'assumed';
    return { id: boundary.id ?? `boundary-${index}`, idAuthored: Boolean(boundary.id), label: boundary.label, kind: boundary.kind, scope, trust_zone: trustZone, members: [...boundary.wraps], basis };
  });
  const memberOf = new Map();
  for (const boundary of boundaries) for (const member of boundary.members) {
    if (!memberOf.has(member)) memberOf.set(member, []);
    memberOf.get(member).push(boundary.id);
  }

  const nodes = components.map((component) => {
    const op = component.operational || {};
    const basis = {};
    const node = { id: component.id, label: component.label, type: component.type, sublabel: component.sublabel ?? null };
    if (has(op, 'role')) { node.role = op.role; basis.role = 'authored'; }
    else { node.role = inferRole(component, { inbound: inbound.get(component.id) || 0, outbound: outbound.get(component.id) || 0 }); basis.role = 'assumed'; }
    // An external entry component stands for the people or systems that send traffic. It is an
    // actor, not infrastructure: it has no availability, capacity or latency of its own.
    node.actor = component.type === 'external' && node.role === 'ingress';
    const defaults = node.actor ? { sla_percent: null, max_rps: null, p50_ms: null, p99_ms: null, redundancy: null } : ROLE_DEFAULTS[node.role];
    node.c4_level = op.c4_level ?? null;
    node.drilldown_diagram_id = op.drilldown_diagram_id ?? null;
    pick(node, basis, 'sla_percent', op, 'sla_percent', defaults.sla_percent);
    pick(node, basis, 'redundancy', op, 'redundancy', defaults.redundancy);

    const capacity = {}; const cap = op.capacity || {};
    pick(capacity, basis, 'capacity.max_rps', cap, 'max_rps', defaults.max_rps);
    pick(capacity, basis, 'capacity.baseline_rps', cap, 'baseline_rps', null);
    for (const key of ['cpu_cores', 'memory_gb', 'scaling_lag_sec']) pick(capacity, basis, `capacity.${key}`, cap, key, null);
    pick(capacity, basis, 'capacity.autoscale_min', cap, 'autoscale_min', node.actor ? null : 1);
    pick(capacity, basis, 'capacity.autoscale_max', cap, 'autoscale_max', has(cap, 'autoscale_min') ? cap.autoscale_min : node.actor ? null : 1);
    node.capacity = capacity;

    const latency = {}; const lat = op.latency || {};
    pick(latency, basis, 'latency.p50_ms', lat, 'p50_ms', defaults.p50_ms);
    pick(latency, basis, 'latency.p99_ms', lat, 'p99_ms', defaults.p99_ms);
    if (has(lat, 'p95_ms')) { latency.p95_ms = lat.p95_ms; basis['latency.p95_ms'] = 'authored'; }
    else if (latency.p50_ms != null && latency.p99_ms != null) { latency.p95_ms = round(lognormalP95(latency.p50_ms, latency.p99_ms)); basis['latency.p95_ms'] = 'assumed'; }
    else latency.p95_ms = null;
    node.latency = latency;

    const dr = {}; const drIn = op.dr || {};
    for (const key of ['rpo_sec', 'rto_sec', 'backup_strategy']) pick(dr, basis, `dr.${key}`, drIn, key, null);
    node.dr = dr;

    const finops = {}; const fin = op.finops || {};
    for (const key of ['cloud_provider', 'instance_tier', 'monthly_base_cost_usd', 'cost_per_million_requests_usd', 'storage_gb', 'storage_cost_per_gb_usd']) pick(finops, basis, `finops.${key}`, fin, key, null);
    node.finops = finops;

    const security = {}; const sec = op.security || {};
    const inheritedZone = (memberOf.get(component.id) || []).map((id) => boundaries.find((b) => b.id === id)).find((b) => b?.trust_zone)?.trust_zone ?? null;
    pick(security, basis, 'security.trust_zone', sec, 'trust_zone', inheritedZone);
    pick(security, basis, 'security.public_exposed', sec, 'public_exposed', ['ingress', 'cdn'].includes(node.role) ? true : null);
    for (const key of ['auth_method', 'encryption_at_rest', 'encryption_in_transit']) pick(security, basis, `security.${key}`, sec, key, null);
    security.compliance_tags = Array.isArray(sec.compliance_tags) ? [...sec.compliance_tags] : [];
    if (sec.compliance_tags) basis['security.compliance_tags'] = 'authored';
    node.security = security;

    node.boundaries = memberOf.get(component.id) || [];
    node.basis = basis;

    if (latency.p50_ms != null && latency.p99_ms != null && (latency.p50_ms > latency.p99_ms || (latency.p95_ms != null && (latency.p95_ms < latency.p50_ms || latency.p95_ms > latency.p99_ms)))) {
      report('workbench/latency-order', `${component.id}: latency percentiles must satisfy p50 ≤ p95 ≤ p99.`, { node: component.id });
    }
    if (capacity.autoscale_min != null && capacity.autoscale_max != null && capacity.autoscale_min > capacity.autoscale_max) {
      report('workbench/autoscale-range', `${component.id}: autoscale_min must not exceed autoscale_max.`, { node: component.id });
    }
    return node;
  });
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  const edges = connections.map((connection, index) => {
    const op = connection.operational || {};
    const basis = {};
    const edge = { id: connection.id ?? `rel-${index}`, idAuthored: Boolean(connection.id), from: connection.from, to: connection.to, label: connection.label ?? null };
    const targetRole = nodeById.get(connection.to)?.role;
    if (has(op, 'call_semantics')) { edge.call_semantics = op.call_semantics; basis.call_semantics = 'authored'; }
    else { edge.call_semantics = inferCallSemantics(targetRole); basis.call_semantics = 'assumed'; }
    edge.protocol = op.protocol ?? null;
    if (edge.protocol) basis.protocol = 'authored';

    const resilience = {}; const res = op.resilience || {};
    pick(resilience, basis, 'resilience.timeout_ms', res, 'timeout_ms', null);
    pick(resilience, basis, 'resilience.retries', res, 'retries', EDGE_DEFAULTS.retries);
    for (const key of ['backoff_strategy', 'jitter', 'circuit_breaker_threshold_pct', 'fallback_edge_id', 'dlq_node_id', 'idempotent']) pick(resilience, basis, `resilience.${key}`, res, key, null);
    pick(resilience, basis, 'resilience.circuit_breaker_enabled', res, 'circuit_breaker_enabled', EDGE_DEFAULTS.circuit_breaker_enabled);
    edge.resilience = resilience;

    const traffic = {}; const tr = op.traffic || {};
    pick(traffic, basis, 'traffic.request_multiplier', tr, 'request_multiplier', EDGE_DEFAULTS.request_multiplier);
    pick(traffic, basis, 'traffic.payload_kb', tr, 'payload_kb', EDGE_DEFAULTS.payload_kb);
    pick(traffic, basis, 'traffic.read_write_ratio', tr, 'read_write_ratio', EDGE_DEFAULTS.read_write_ratio);
    pick(traffic, basis, 'traffic.egress_cost_per_gb_usd', tr, 'egress_cost_per_gb_usd', null);
    edge.traffic = traffic;
    edge.basis = basis;
    return edge;
  });
  const edgeById = new Map(edges.filter((edge) => edge.idAuthored).map((edge) => [edge.id, edge]));

  // Uniqueness is checked here rather than with JSON Schema `uniqueItems`, which would add a
  // runtime dependency to the generated validators.
  const duplicates = (values) => values.filter((value, index) => values.indexOf(value) !== index);
  const uniqueLists = [
    ['workbench.entrypoints', workbench.entrypoints],
    ['workbench.requirements.regions', workbench.requirements?.regions],
    ['workbench.requirements.data_residency', workbench.requirements?.data_residency],
    ['workbench.requirements.compliance', workbench.requirements?.compliance],
    ...components.map((c) => [`${c.id}.operational.security.compliance_tags`, c.operational?.security?.compliance_tags]),
  ];
  for (const [where, list] of uniqueLists) {
    for (const value of new Set(duplicates(list || []))) report('workbench/duplicate-value', `${where}: "${value}" is listed more than once.`, { reference: value });
  }

  // Cross-references that JSON Schema cannot express.
  for (const edge of edges) {
    const { fallback_edge_id: fallback, dlq_node_id: dlq } = edge.resilience;
    if (fallback != null) {
      const target = edgeById.get(fallback);
      if (!target) report('workbench/unknown-reference', `${edge.id}: fallback_edge_id "${fallback}" names no connection id.`, { edge: edge.id, reference: fallback });
      else if (target.from !== edge.from) report('workbench/fallback-source', `${edge.id}: the fallback "${fallback}" must start at the same component (${edge.from}).`, { edge: edge.id, reference: fallback });
    }
    if (dlq != null && !nodeById.has(dlq)) report('workbench/unknown-reference', `${edge.id}: dlq_node_id "${dlq}" names no component.`, { edge: edge.id, reference: dlq });
  }
  const drilldownIds = new Set((workbench.drilldowns || []).map((d) => d.id));
  for (const node of nodes) {
    if (node.drilldown_diagram_id != null && !drilldownIds.has(node.drilldown_diagram_id)) {
      report('workbench/unknown-reference', `${node.id}: drilldown_diagram_id "${node.drilldown_diagram_id}" names no workbench.drilldowns entry.`, { node: node.id, reference: node.drilldown_diagram_id });
    }
  }
  for (const id of workbench.entrypoints || []) {
    if (!nodeById.has(id)) report('workbench/unknown-reference', `workbench.entrypoints: "${id}" names no component.`, { reference: id });
  }
  for (const trace of workbench.traces || []) {
    for (const step of trace.steps) {
      if (!edgeById.has(step.edge)) report('workbench/unknown-reference', `trace ${trace.id}: step edge "${step.edge}" names no connection id.`, { trace: trace.id, reference: step.edge });
    }
  }
  for (const alternative of workbench.alternatives || []) {
    for (const override of alternative.component_overrides || []) {
      if (!nodeById.has(override.id)) report('workbench/unknown-reference', `alternative ${alternative.id}: component "${override.id}" does not exist.`, { alternative: alternative.id, reference: override.id });
    }
    for (const override of alternative.connection_overrides || []) {
      if (!edgeById.has(override.id)) report('workbench/unknown-reference', `alternative ${alternative.id}: connection "${override.id}" names no connection id.`, { alternative: alternative.id, reference: override.id });
    }
  }

  // Entry points: authored, else edge-facing components nothing calls, else any edge-facing
  // component, else any component nothing calls.
  const hasInboundTraffic = (id) => edges.some((e) => e.to === id && !['replication-sync', 'replication-async', 'failover-route', 'heartbeat'].includes(e.call_semantics));
  const edgeFacing = nodes.filter((n) => n.role === 'ingress' || n.role === 'cdn');
  const NON_TRAFFIC = ['replication-sync', 'replication-async', 'failover-route', 'heartbeat'];
  const sendsTraffic = (id) => edges.some((e) => e.from === id && !NON_TRAFFIC.includes(e.call_semantics));
  const inferredEntrypoints = [edgeFacing.filter((n) => !hasInboundTraffic(n.id)), edgeFacing, nodes.filter((n) => !hasInboundTraffic(n.id) && sendsTraffic(n.id))]
    .find((candidates) => candidates.length > 0)?.map((n) => n.id) ?? [];
  const authoredEntrypoints = workbench.entrypoints?.length ? workbench.entrypoints.filter((id) => nodeById.has(id)) : [];
  const fallbackEntrypoints = authoredEntrypoints.length ? authoredEntrypoints : inferredEntrypoints;

  const model = {
    schemaVersion: MODEL_SCHEMA_VERSION,
    title: document.meta?.title ?? '',
    authored,
    entrypoints: fallbackEntrypoints,
    entrypointsBasis: workbench.entrypoints?.length ? 'authored' : 'assumed',
    nodes,
    edges,
    boundaries,
    requirements: workbench.requirements ? { ...workbench.requirements } : null,
    adrs: (workbench.adrs || []).map((adr) => ({ ...adr })),
    traces: (workbench.traces || []).map((trace) => ({ ...trace, steps: trace.steps.map((step) => ({ ...step })) })),
    alternatives: (workbench.alternatives || []).map((alternative) => ({ ...alternative })),
    drilldowns: (workbench.drilldowns || []).map(({ id, title }) => ({ id, title: title ?? id })),
  };
  return { model, diagnostics };
}

/** Apply one named alternative's overrides to a document (returns a new document). */
export function applyAlternative(document, alternativeId) {
  const alternative = (document.workbench?.alternatives || []).find((a) => a.id === alternativeId);
  if (!alternative) throw new Error(`unknown alternative "${alternativeId}"`);
  const merge = (base = {}, patch = {}) => {
    const out = { ...base };
    for (const [key, value] of Object.entries(patch)) {
      out[key] = value && typeof value === 'object' && !Array.isArray(value) ? merge(base[key], value) : value;
    }
    return out;
  };
  const componentPatches = new Map((alternative.component_overrides || []).map((o) => [o.id, o.operational]));
  const connectionPatches = new Map((alternative.connection_overrides || []).map((o) => [o.id, o.operational]));
  return {
    ...document,
    components: document.components.map((c) => (componentPatches.has(c.id) ? { ...c, operational: merge(c.operational, componentPatches.get(c.id)) } : c)),
    connections: (document.connections || []).map((c) => (c.id && connectionPatches.has(c.id) ? { ...c, operational: merge(c.operational, connectionPatches.get(c.id)) } : c)),
  };
}
