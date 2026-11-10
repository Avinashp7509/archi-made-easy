// Documents the visual QA and the workbench browser test render. They are built from the
// bundled knowledge packs, so they change only when the packs do.

import { loadKnowledge } from '../archi-made-easy/bin/workbench.mjs';
import { scaffold } from '../archi-made-easy/workbench/scaffold.mjs';

function scaffolded(patternId, providerId) {
  const knowledge = loadKnowledge();
  return scaffold({
    slots: knowledge.slots,
    pattern: knowledge.patterns.find((p) => p.id === patternId),
    provider: knowledge.providers.find((p) => p.id === providerId),
  });
}

/**
 * A complete architecture with authored operational data: the highly available web
 * application on AWS, with load, capacity, latency, cost, an exposure flag and a request
 * trace stated. Ten components, nine connections, one region boundary.
 */
export function authoredWebHa() {
  const document = scaffolded('web-ha', 'aws');
  const component = Object.fromEntries(document.components.map((c) => [c.id, c]));
  const set = (id, operational) => { component[id].operational = { ...(component[id].operational || {}), ...operational }; };
  set('users', { capacity: { baseline_rps: 400 } });
  set('lb', { sla_percent: 99.99, capacity: { max_rps: 20000 }, finops: { monthly_base_cost_usd: 25 } });
  set('app', { sla_percent: 99.95, redundancy: 'multi-az', capacity: { max_rps: 300, autoscale_min: 2, autoscale_max: 6 }, latency: { p50_ms: 40, p99_ms: 220 }, finops: { monthly_base_cost_usd: 140, cost_per_million_requests_usd: 0.4 }, security: { auth_method: 'jwt', trust_zone: 'app' } });
  set('db', { sla_percent: 99.95, redundancy: 'single-instance', capacity: { max_rps: 1500 }, latency: { p50_ms: 6, p99_ms: 45 }, finops: { monthly_base_cost_usd: 410, storage_gb: 200, storage_cost_per_gb_usd: 0.115 }, security: { encryption_at_rest: true, trust_zone: 'data' } });
  set('cache', { capacity: { max_rps: 50000 }, finops: { monthly_base_cost_usd: 90 } });
  set('cdn', { security: { public_exposed: true } });
  for (const connection of document.connections) {
    if (connection.id === 'app-db') connection.operational = { ...(connection.operational || {}), resilience: { timeout_ms: 800, retries: 2 }, traffic: { read_write_ratio: 0.8 } };
  }
  document.workbench = {
    ...(document.workbench || {}),
    traces: [{ id: 'page-view', title: 'Page view', kind: 'happy', steps: [{ edge: 'users-cdn' }, { edge: 'cdn-lb', note: 'cache miss' }, { edge: 'lb-app' }, { edge: 'app-db', note: 'read' }] }],
    alternatives: [{ id: 'standby-db', title: 'Database with a standby', description: 'Aurora with a standby in a second zone', component_overrides: [{ id: 'db', operational: { redundancy: 'active-passive-dr', dr: { rto_sec: 120, rpo_sec: 5 } } }] }],
  };
  return document;
}

/**
 * The same architecture with a very long title and subtitle, and component labels at the
 * longest the renderer accepts. (The renderer refuses a label that would overflow its
 * component, so a cut-off component label cannot be produced; the long page title can.)
 */
export function longLabelWebHa() {
  const document = authoredWebHa();
  document.meta.title = 'Highly available customer-facing web application platform for the retail division, production environment';
  document.meta.subtitle = 'Zone-redundant deployment with an edge cache, an application tier that scales out, a relational database and background processing';
  const rename = { app: ['Order Mgmt API v2', 'Stateless, autoscale'], db: ['Customer Orders', 'Primary, relational'], cache: ['Session+Read Cache', 'Sessions, hot reads'] };
  for (const component of document.components) {
    if (rename[component.id]) [component.label, component.sublabel] = rename[component.id];
  }
  return document;
}

/** A denser architecture: the microservices pattern on Azure. */
export function denseMicroservices() {
  return scaffolded('microservices', 'azure');
}
