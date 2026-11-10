// Role inference and default operational values.
//
// These values exist so that a diagram with no authored numbers can still be explored.
// They are planning defaults, not measurements and not provider SLAs: every value taken
// from here is marked `assumed` in the model and shown as such in every output.
// Provider-published figures live in the knowledge packs (knowledge/), with sources.

export const ROLES = Object.freeze([
  'ingress', 'gateway', 'stateless-compute', 'stateful-db', 'cache', 'message-broker', 'stream',
  'object-store', 'identity', 'external-saas', 'ai-model', 'cdn', 'load-balancer',
]);

export const REDUNDANCY = Object.freeze(['single-instance', 'multi-az', 'active-active-multi-region', 'active-passive-dr']);

export const CALL_SEMANTICS = Object.freeze([
  'sync-blocking', 'async-queue', 'async-pubsub', 'event-stream',
  'replication-sync', 'replication-async', 'failover-route', 'heartbeat',
]);

/** Per-role planning defaults (approved base design, section 3.4). */
export const ROLE_DEFAULTS = Object.freeze({
  ingress: { sla_percent: 99.95, max_rps: 10000, p50_ms: 5, p99_ms: 50, redundancy: 'single-instance' },
  cdn: { sla_percent: 99.99, max_rps: 50000, p50_ms: 5, p99_ms: 40, redundancy: 'active-active-multi-region' },
  'load-balancer': { sla_percent: 99.95, max_rps: 10000, p50_ms: 5, p99_ms: 50, redundancy: 'single-instance' },
  gateway: { sla_percent: 99.95, max_rps: 10000, p50_ms: 5, p99_ms: 50, redundancy: 'single-instance' },
  'stateless-compute': { sla_percent: 99.9, max_rps: 1000, p50_ms: 20, p99_ms: 200, redundancy: 'single-instance' },
  'stateful-db': { sla_percent: 99.95, max_rps: 2000, p50_ms: 5, p99_ms: 80, redundancy: 'single-instance' },
  cache: { sla_percent: 99.9, max_rps: 20000, p50_ms: 1, p99_ms: 10, redundancy: 'single-instance' },
  'message-broker': { sla_percent: 99.95, max_rps: 20000, p50_ms: 5, p99_ms: 50, redundancy: 'single-instance' },
  stream: { sla_percent: 99.95, max_rps: 20000, p50_ms: 5, p99_ms: 50, redundancy: 'single-instance' },
  'object-store': { sla_percent: 99.99, max_rps: 5000, p50_ms: 20, p99_ms: 200, redundancy: 'multi-az' },
  identity: { sla_percent: 99.9, max_rps: 2000, p50_ms: 20, p99_ms: 150, redundancy: 'single-instance' },
  'external-saas': { sla_percent: 99.5, max_rps: 500, p50_ms: 150, p99_ms: 1500, redundancy: 'multi-az' },
  'ai-model': { sla_percent: 99.5, max_rps: 50, p50_ms: 800, p99_ms: 8000, redundancy: 'multi-az' },
});

/** Edge defaults (approved base design, section 3.4). Timeouts and costs have no default. */
export const EDGE_DEFAULTS = Object.freeze({ request_multiplier: 1, read_write_ratio: 0.8, payload_kb: 2, retries: 0, circuit_breaker_enabled: false });

const KEYWORDS = [
  // Order matters: the first matching rule wins.
  [/\b(cdn|front ?door|cloudfront|cloud cdn|akamai|fastly|edge cache)\b/i, 'cdn'],
  [/\b(load ?balancer|alb|nlb|elb|application gateway|traffic manager|haproxy)\b/i, 'load-balancer'],
  [/\b(api ?gateway|gateway|apim|api management|kong|ingress controller|envoy)\b/i, 'gateway'],
  [/\b(redis|memcached|elasticache|cache)\b/i, 'cache'],
  [/\b(s3|blob|bucket|object storage|object store|gcs|cloud storage)\b/i, 'object-store'],
  [/\b(kafka|kinesis|event hubs?|pub\/?sub|stream|streaming)\b/i, 'stream'],
  [/\b(llm|gpt|claude|gemini|model|openai|bedrock|vertex|inference|embedding)\b/i, 'ai-model'],
  [/\b(auth|identity|idp|entra|cognito|okta|keycloak|oauth|sso)\b/i, 'identity'],
];

function keywordRole(text) {
  for (const [pattern, role] of KEYWORDS) if (pattern.test(text)) return role;
  return null;
}

/**
 * A brand given by catalog name ("redis") is a role hint. A brand given as an image URL or
 * a pinned image is not: it says nothing about the role, and its address must never be
 * copied anywhere. The icon is presentation only and is not a hint either: changing an
 * icon changes nothing else in the page.
 */
export function brandName(brand) {
  return typeof brand === 'string' && !/^https?:\/\//i.test(brand) ? brand : null;
}

/**
 * Infer an operational role from the component's existing fields.
 * @param {object} component architecture component
 * @param {{ inbound: number, outbound: number }} context number of inbound and outbound relationships
 */
export function inferRole(component, { inbound = 0, outbound = 0 } = {}) {
  const text = [component.label, component.sublabel, component.tag, brandName(component.brand)].filter(Boolean).join(' ');
  const keyword = keywordRole(text);
  switch (component.type) {
    case 'frontend':
      if (keyword === 'cdn') return 'cdn';
      return inbound === 0 ? 'ingress' : 'stateless-compute';
    case 'backend':
      return ['gateway', 'load-balancer', 'identity', 'ai-model', 'cache'].includes(keyword) ? keyword : 'stateless-compute';
    case 'database':
      return keyword === 'cache' || keyword === 'object-store' ? keyword : 'stateful-db';
    case 'messagebus':
      return keyword === 'stream' ? 'stream' : 'message-broker';
    case 'security':
      return keyword === 'gateway' ? 'gateway' : 'identity';
    case 'external':
      // An external party that only sends requests (users, client systems) is where traffic enters.
      if (inbound === 0 && outbound > 0) return 'ingress';
      return keyword === 'ai-model' ? 'ai-model' : 'external-saas';
    case 'cloud':
      return ['cdn', 'object-store', 'load-balancer', 'gateway'].includes(keyword) ? keyword : 'stateless-compute';
    default:
      return 'stateless-compute';
  }
}

/** Default call semantics for a relationship, from the target's role. */
export function inferCallSemantics(targetRole) {
  if (targetRole === 'message-broker') return 'async-queue';
  if (targetRole === 'stream') return 'event-stream';
  return 'sync-blocking';
}
