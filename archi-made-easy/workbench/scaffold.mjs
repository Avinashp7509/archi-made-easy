// Scaffold: turn a reference pattern plus a provider pack into a complete, schema-valid
// architecture candidate. Pure and deterministic: callers pass the knowledge objects in.
//
// A scaffold is a starting point the agent adapts to the user's request. It carries
// structure (roles, redundancy, call semantics, decisions) but no traffic, latency,
// availability or cost figures: those must come from the user or a cited source.

function fill(text, tokens) {
  return String(text).replace(/\{([a-z_]+)\}/g, (whole, key) => (Object.hasOwn(tokens, key) ? tokens[key] : whole));
}

function mergeOperational(base = {}, patch = {}) {
  const out = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    out[key] = value && typeof value === 'object' && !Array.isArray(value) ? mergeOperational(base[key], value) : value;
  }
  return out;
}

export class ScaffoldError extends Error {}

/**
 * @param {object} knowledge { slots, pattern, provider }
 * @param {object} options { title?, output?, qualityProfile? }
 * @returns {object} architecture document
 */
export function scaffold({ slots, pattern, provider }, { title, output, qualityProfile = 'showcase' } = {}) {
  if (pattern.status !== 'implemented') throw new ScaffoldError(`pattern "${pattern.id}" is ${pattern.status}, not implemented`);
  const slotTable = slots.slots;
  const labelFor = (component) => component.label
    ?? (component.slot === 'users' ? slotTable.users.generic : provider.services[component.slot]?.label)
    ?? slotTable[component.slot].generic;

  const tokens = { region_term: provider.region_term, zone_term: provider.zone_term, provider: provider.name };
  for (const component of pattern.components) {
    if (!slotTable[component.slot]) throw new ScaffoldError(`pattern "${pattern.id}": unknown slot "${component.slot}"`);
    tokens[component.id] = labelFor(component);
  }

  const components = pattern.components.map((component) => {
    const slot = slotTable[component.slot];
    const out = { id: component.id, type: component.type ?? slot.type, label: labelFor(component) };
    if (component.sublabel) out.sublabel = fill(component.sublabel, tokens);
    if (component.tag) out.tag = fill(component.tag, tokens);
    out.row = component.row;
    out.col = component.col;
    out.operational = mergeOperational({ role: slot.role }, component.operational);
    return out;
  });

  const assumptions = [
    ...(pattern.assumptions || []),
    `Service choices follow the ${provider.name} pack (version ${provider.version}); confirm they fit your constraints`,
  ];

  const document = {
    schema_version: 1,
    diagram_type: 'architecture',
    meta: {
      title: title || (provider.id === 'onprem' ? pattern.title : `${pattern.title} on ${provider.name}`),
      output: output || `${pattern.id}-${provider.id}.html`,
      quality_profile: qualityProfile,
    },
    layout: { ...pattern.layout },
    components,
  };
  if (pattern.boundaries?.length) {
    document.boundaries = pattern.boundaries.map((boundary) => ({ ...boundary, label: fill(boundary.label, tokens), wraps: [...boundary.wraps] }));
  }
  document.connections = pattern.connections.map((connection) => ({ ...connection, ...(connection.label ? { label: fill(connection.label, tokens) } : {}) }));
  document.cards = [
    ...(pattern.cards || []).map((card) => ({ ...card, items: card.items.map((item) => fill(item, tokens)) })),
    { dot: 'amber', title: 'Assumptions', items: assumptions.map((item) => fill(item, tokens)) },
  ];
  const workbench = {};
  if (pattern.adrs?.length) workbench.adrs = pattern.adrs.map((adr) => ({ ...adr }));
  if (pattern.traces?.length) workbench.traces = pattern.traces.map((trace) => ({ ...trace }));
  if (Object.keys(workbench).length) document.workbench = workbench;
  return document;
}

/** One-line catalogue entries for `scaffold --list`. */
export function describePatterns(patterns) {
  return [...patterns].sort((a, b) => a.id.localeCompare(b.id)).map((pattern) => ({
    id: pattern.id,
    status: pattern.status,
    title: pattern.title,
    summary: pattern.summary,
    when_to_use: pattern.when_to_use || [],
  }));
}
