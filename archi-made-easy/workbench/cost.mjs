// Monthly cost estimate from authored cost inputs only. Nothing is priced unless the
// document carries a price for it: components without cost data are reported as
// "not set", and the total is given only together with its coverage.

export const SECONDS_PER_MONTH = 2_628_000; // 730 hours
const KB_PER_GB = 1_048_576;
const round = (value, digits = 2) => (typeof value === 'number' && Number.isFinite(value) ? Math.round(value * 10 ** digits) / 10 ** digits : value);

/**
 * @param {object} model from buildModel()
 * @param {object} result from simulate() for the same model
 */
export function estimateCost(model, result) {
  const nodes = {};
  let total = 0; let priced = 0;
  const notes = [];
  for (const node of [...model.nodes].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const f = node.finops;
    const hasAny = f.monthly_base_cost_usd != null || f.cost_per_million_requests_usd != null || (f.storage_gb != null && f.storage_cost_per_gb_usd != null);
    if (!hasAny) { nodes[node.id] = { priced: false }; continue; }
    const load = result.nodes[node.id].load_rps;
    const min = node.capacity.autoscale_min ?? 1;
    const max = Math.max(min, node.capacity.autoscale_max ?? min);
    const instances = load == null || !node.capacity.max_rps ? min : Math.min(max, Math.max(min, Math.ceil(load / node.capacity.max_rps)));
    const base = f.monthly_base_cost_usd != null ? f.monthly_base_cost_usd * instances / Math.max(1, min) : 0;
    let requests = 0;
    if (f.cost_per_million_requests_usd != null) {
      if (load == null) notes.push(`${node.id}: request cost left out because load is not set.`);
      else requests = f.cost_per_million_requests_usd * load * SECONDS_PER_MONTH / 1_000_000;
    }
    const storage = f.storage_gb != null && f.storage_cost_per_gb_usd != null ? f.storage_gb * f.storage_cost_per_gb_usd : 0;
    const sum = base + requests + storage;
    nodes[node.id] = { priced: true, instances, base_usd: round(base), requests_usd: round(requests), storage_usd: round(storage), total_usd: round(sum) };
    total += sum; priced += 1;
  }

  const zoneOf = (id) => new Set(model.boundaries.filter((b) => (b.scope === 'region' || b.scope === 'availability-zone') && b.members.includes(id)).map((b) => b.id));
  const egress = {};
  let egressTotal = 0;
  for (const edge of [...model.edges].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const price = edge.traffic.egress_cost_per_gb_usd;
    if (price == null || price === 0) continue;
    const from = zoneOf(edge.from); const to = zoneOf(edge.to);
    const crosses = [...from].some((id) => !to.has(id)) || [...to].some((id) => !from.has(id));
    if (!crosses) continue;
    const flow = result.edges[edge.id].flow_rps;
    if (flow == null) { notes.push(`${edge.id}: egress cost left out because load is not set.`); continue; }
    const gb = flow * edge.traffic.payload_kb * SECONDS_PER_MONTH / KB_PER_GB;
    egress[edge.id] = { gb_per_month: round(gb), cost_usd: round(gb * price) };
    egressTotal += gb * price;
  }

  const any = priced > 0 || Object.keys(egress).length > 0;
  return {
    kind: 'analytical-model',
    monthly_total_usd: any ? round(total + egressTotal) : null,
    compute_and_storage_usd: any ? round(total) : null,
    egress_usd: any ? round(egressTotal) : null,
    coverage: { priced_components: priced, components: model.nodes.length },
    nodes,
    egress,
    notes: [
      ...(priced < model.nodes.length ? [`${model.nodes.length - priced} of ${model.nodes.length} components have no cost data and are not included.`] : []),
      ...notes,
    ],
  };
}
