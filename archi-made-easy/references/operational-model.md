# Operational model and scaffolds

Read this when you create an architecture from a description, or when the user gives operational facts: availability targets, load, latency, recovery objectives, cost, security controls, decisions.

## Contents

- [Start from a pattern](#start-from-a-pattern)
- [What to record, and where](#what-to-record-and-where)
- [Authored versus assumed](#authored-versus-assumed)
- [Field reference](#field-reference)
- [Checks you may hit](#checks-you-may-hit)

## Start from a pattern

`scaffold` writes a complete, valid architecture candidate for a reference pattern on a chosen provider. Use it instead of authoring from an empty file whenever a pattern is close to the request.

```bash
node bin/archi-made-easy.mjs scaffold --list
node bin/archi-made-easy.mjs scaffold web-ha --provider azure --title "Shop platform" --output shop.html --out candidate.json --json
```

| Pattern | Use for |
|---|---|
| `web-ha` | Highly available web or mobile back end in one region |
| `multi-region-active-active` | Global users; a regional outage must not cause downtime |
| `event-driven` | Bursty workloads, several consumers of the same events |
| `microservices` | Independently deployed services behind a gateway |
| `data-platform` | Analytics and ML from several source systems |
| `zero-trust` | Regulated workloads, identity-based access |
| `ai-agent-platform` | Assistants and multi-agent systems on hosted models |
| `hybrid` | Cloud workloads beside systems that stay on-premises |
| `migration-landing-zone` | Hub-and-spoke foundation for a cloud migration |

Providers: `azure`, `aws`, `gcp`, `onprem` (provider-neutral). When the user names no provider and it matters, ask; otherwise use `onprem` and say so.

A scaffold is a starting point. After scaffolding:

1. Rename, add or remove components so the diagram matches the request. Keep the grid (`row`, `col`) tidy: main path on one row, branches directly above or below.
2. Replace the pattern's assumptions with the user's facts, and keep an `Assumptions` card for what remains assumed.
3. Add the operational facts the user gave (next section).
4. Run `finalize` as usual.

## What to record, and where

| The user says | Record it in |
|---|---|
| "99.95% available", "must survive a zone or region failure" | `workbench.requirements.availability_target_percent`; component `operational.redundancy` |
| "10 million users", "5,000 requests per second at peak" | `workbench.requirements.users`, `peak_rps`; entry component `operational.capacity.baseline_rps` |
| "under 300 ms" | `workbench.requirements.p99_latency_ms` |
| "lose at most 5 minutes of data", "back within an hour" | `workbench.requirements.rpo_sec`, `rto_sec`; database `operational.dr` |
| "budget of $20k a month" | `workbench.requirements.monthly_budget_usd` |
| "data must stay in the EU", "PCI-DSS" | `workbench.requirements.data_residency`, `compliance`; component `operational.security.compliance_tags` |
| A measured or quoted figure for one component | That component's `operational` (`sla_percent`, `capacity`, `latency`, `finops`) |
| Timeouts, retries, circuit breakers, queues | The connection's `operational.resilience` and `call_semantics` |
| "We chose X over Y because …" | `workbench.adrs` |
| "Compare a cheaper option" | `workbench.alternatives` |

## Authored versus assumed

- A value you write into the document is **authored**. Write only what the user stated, what a cited source states, or what you measured.
- A value you leave out is **assumed** by the model from the component's role, and is labelled as an assumption wherever it is shown.
- Never write an invented SLA, price, latency or load to make the model look complete. Leave it out.
- Scaffolds set structure only (roles, redundancy, call semantics, decisions). They contain no traffic, latency, availability or cost figures.
- Knowledge packs name services. They carry no SLA or price figures; such values need an official source and a date before they are added.

## Field reference

All fields are optional. Exact enums and ranges are in `schemas/common.schema.json` (`nodeOperational`, `edgeOperational`, `boundaryOperational`) and `schemas/architecture.schema.json` (`workbench`).

Component `operational`:

- `role`: `ingress`, `gateway`, `stateless-compute`, `stateful-db`, `cache`, `message-broker`, `stream`, `object-store`, `identity`, `external-saas`, `ai-model`, `cdn`, `load-balancer`.
- `sla_percent`: availability of one deployment unit.
- `redundancy`: `single-instance`, `multi-az`, `active-active-multi-region`, `active-passive-dr`.
- `capacity`: `max_rps` (per instance), `baseline_rps` (entry components), `autoscale_min`, `autoscale_max`, `cpu_cores`, `memory_gb`, `scaling_lag_sec`.
- `latency`: `p50_ms`, `p95_ms`, `p99_ms`, in ascending order.
- `dr`: `rpo_sec`, `rto_sec`, `backup_strategy`.
- `finops`: `cloud_provider`, `instance_tier`, `monthly_base_cost_usd`, `cost_per_million_requests_usd`, `storage_gb`, `storage_cost_per_gb_usd`.
- `security`: `trust_zone`, `auth_method`, `encryption_at_rest`, `encryption_in_transit`, `compliance_tags`, `public_exposed`.
- `c4_level`, `drilldown_diagram_id`: for child diagrams listed in `workbench.drilldowns`.

Connection `operational`:

- `call_semantics`: `sync-blocking`, `async-queue`, `async-pubsub`, `event-stream`, `replication-sync`, `replication-async`, `failover-route`, `heartbeat`.
- `protocol`: `HTTPS/REST`, `gRPC`, `GraphQL`, `Kafka`, `AMQP`, `WebSockets`, `TCP`, `SQL`, `CDC`.
- `resilience`: `timeout_ms`, `retries`, `backoff_strategy`, `jitter`, `circuit_breaker_enabled`, `circuit_breaker_threshold_pct`, `fallback_edge_id`, `dlq_node_id`, `idempotent`.
- `traffic`: `request_multiplier`, `payload_kb`, `read_write_ratio` (fraction of reads), `egress_cost_per_gb_usd`.

Boundary: optional `id`, and `operational.scope` (`region`, `availability-zone`, `trust-zone`) with optional `trust_zone`.

Give a connection an `id` whenever another field refers to it (`fallback_edge_id`, trace steps, alternatives).

## Checks you may hit

| Code | Meaning | Fix |
|---|---|---|
| `workbench/unknown-reference` | An id names nothing: a fallback connection, a dead-letter component, a drill-down, an entry point, a trace step or an alternative override | Correct the id, or give the target connection an `id` |
| `workbench/fallback-source` | A fallback connection starts at a different component | Point to a connection from the same source |
| `workbench/latency-order` | Percentiles are not ascending | Make p50 ≤ p95 ≤ p99 |
| `workbench/autoscale-range` | `autoscale_min` exceeds `autoscale_max` | Swap or correct them |
| `workbench/duplicate-value` | A list repeats a value | Remove the duplicate |
| `architecture/missing-component-position` | A component has no position | Use `layout { "mode": "grid" }` with `row` and `col`, or give `pos` |
