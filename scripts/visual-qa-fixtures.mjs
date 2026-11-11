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
  // The scaffold's cards describe the scaffold. This document changes the database to a
  // single instance and states figures, so the cards must say so (an agent reviewing the
  // document found the contradictions).
  const replaceItem = (title, from, to) => {
    const card = document.cards.find((c) => c.title === title);
    const index = card ? card.items.findIndex((item) => from.test(item)) : -1;
    if (index < 0) throw new Error(`authoredWebHa: no "${title}" card item matching ${from}`);
    card.items[index] = to;
  };
  replaceItem('Availability', /standby/i, 'Aurora runs as a single instance; a standby in a second zone is the alternative in Decide');
  replaceItem('Security', /encrypted/i, 'Aurora is encrypted at rest; encryption of the other stores is not stated');
  replaceItem('Assumptions', /not set/i, 'Load, capacity, latency and cost figures are illustrative test values, not measurements');
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

/** Text an author (or a document taken from an untrusted repository) could try to smuggle in. */
export const HOSTILE = Object.freeze({
  script: '</script><script>window.__pwned=1</script>',
  image: '"><img src=x onerror="window.__pwned=1">',
  svg: '<svg onload="window.__pwned=1">',
  frame: '<!-- --><iframe srcdoc="<script>parent.__pwned=1</script>">',
  // Markdown that would be a link and a tracking image in an exported document.
  link: '[click](javascript:window.__pwned=1) ![p](https://tracker.invalid/p.png) `code` *bold* a|b; %% x',
  // Short enough for a component label and a sublabel.
  bold: '<b>Q7</b>',
  italic: '"><i>x7',
});

/**
 * A small architecture with hostile text in every authored text field the workbench or the
 * page shows: title, labels, cards, operational strings, requirements, decision records,
 * traces, alternatives and a child diagram. With `benign`, the same document with harmless
 * text in the same places, for comparison.
 */
export function hostileDocument({ benign = false, child = true } = {}) {
  const h = benign ? Object.fromEntries(Object.keys(HOSTILE).map((key) => [key, `text ${key}`])) : HOSTILE;
  const short = (key) => (benign ? 'Text' : HOSTILE[key]);
  return {
    schema_version: 1, diagram_type: 'architecture',
    meta: { title: `Shop ${h.script}`, subtitle: h.image, output: 'hostile.html' },
    layout: { mode: 'grid', origin: [40, 110], cols: 3, cellW: 130, cellH: 60, gapX: 80, gapY: 80 },
    components: [
      { id: 'users', type: 'external', label: 'Users', sublabel: short('italic'), row: 0, col: 0, operational: { role: 'ingress', capacity: { baseline_rps: 10 } } },
      { id: 'app', type: 'backend', label: short('bold'), sublabel: short('italic'), row: 0, col: 1,
        operational: { role: 'stateless-compute', sla_percent: 99.9, redundancy: 'multi-az', capacity: { max_rps: 100 }, latency: { p50_ms: 10, p99_ms: 50 },
          security: { trust_zone: h.image, auth_method: 'jwt', compliance_tags: [h.svg] }, finops: { cloud_provider: h.image, instance_tier: h.svg, monthly_base_cost_usd: 10 },
          ...(child ? { drilldown_diagram_id: 'inside' } : {}) } },
      { id: 'db', type: 'database', label: 'Store', sublabel: short('bold'), row: 0, col: 2,
        operational: { role: 'stateful-db', sla_percent: 99.9, redundancy: 'multi-az', capacity: { max_rps: 100 }, dr: { rpo_sec: 60, rto_sec: 600, backup_strategy: h.script }, security: { encryption_at_rest: true } } },
    ],
    boundaries: [{ id: 'zone', kind: 'security-group', label: benign ? 'Zone' : 'Zone <i>z7', wraps: ['app', 'db'] }],
    connections: [
      { id: 'users-app', from: 'users', to: 'app', label: benign ? 'calls' : '<s>c7</s>', operational: { resilience: { timeout_ms: 2000, retries: 0 } } },
      { id: 'app-db', from: 'app', to: 'db', label: 'SQL', operational: { resilience: { timeout_ms: 500, retries: 0 } } },
    ],
    cards: [
      { title: `Notes ${h.svg}`, dot: 'cyan', items: [h.script, h.image, h.frame] },
      { title: 'Assumptions', dot: 'amber', items: [h.script, 'Every figure here is an illustrative test value'] },
    ],
    workbench: {
      entrypoints: ['users'],
      requirements: { availability_target_percent: 99, peak_rps: 20, compliance: [h.script], data_residency: [h.image] },
      adrs: [{ id: 'adr-1', title: h.svg, status: 'accepted', context: h.script, decision: h.image, consequences: `${h.frame} ${h.link}`,
        alternatives: [{ option: h.script, pros: [h.image], cons: [h.link] }] }],
      traces: [{ id: 'trace-1', title: `${h.script}; participant x`, kind: 'happy', steps: [{ edge: 'users-app', note: `${h.image}; ${h.link}` }, { edge: 'app-db', note: h.svg }] }],
      alternatives: [{ id: 'alt-1', title: h.image, description: h.svg, component_overrides: [{ id: 'app', operational: { capacity: { max_rps: 50 } } }] }],
      ...(child ? { drilldowns: [{ id: 'inside', title: `Inside ${h.script}`, spec: hostileDocument({ benign, child: false }) }] } : {}),
    },
  };
}
