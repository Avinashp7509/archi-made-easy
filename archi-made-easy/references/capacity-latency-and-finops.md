# Capacity, latency, availability and cost

Read this when the user asks how much load a design can take, how fast or available it is, or what it costs, and when you need to explain where a modelled number comes from.

## Contents

- [Inputs that matter](#inputs-that-matter)
- [Capacity and traffic](#capacity-and-traffic)
- [Availability](#availability)
- [Latency](#latency)
- [Cost](#cost)
- [Defaults used when a value is missing](#defaults-used-when-a-value-is-missing)
- [Limits of the model](#limits-of-the-model)

## Inputs that matter

| Question | Needs in the document |
|---|---|
| How much load can it take? | `capacity.max_rps` (per instance) and `autoscale_max` per component |
| How loaded is it now? | `capacity.baseline_rps` on the entry component |
| How available is it? | `sla_percent` and `redundancy` per component; circuit breakers and fallbacks on connections |
| How fast is it? | `latency.p50_ms` and `p99_ms` per component |
| What does it cost? | `finops` on components; `traffic.egress_cost_per_gb_usd` and `payload_kb` on connections |

Missing values are assumed from the component's role and labelled as assumptions. Cost is the exception: nothing is priced without cost data.

## Capacity and traffic

- Capacity of a component = `max_rps` × `autoscale_max`.
- Ingress = `baseline_rps` × traffic multiplier. Each component serves at most its capacity; the rest is shed.
- A connection carries the source's served load × `request_multiplier`.
- With a cache hit ratio H:
  - a CDN or inline cache passes on 1 − H of its load;
  - a service that also calls a healthy cache sends its database 1 − H × `read_write_ratio` of its load;
  - a failed cache sends everything to the database.
- Utilisation = load ÷ capacity. At 100% a component is saturated.
- Max sustainable load is the ingress at which the first component reaches 100%. `limiting_node` names it.
- A consumer behind a queue or stream that receives more than it can drain builds lag at the difference.

## Availability

- `sla_percent` is the availability of one deployment unit.
- `multi-az` and `active-active-multi-region`: 1 − (1 − a)^N, with N = `autoscale_min` when it is at least 2, otherwise 2.
- `active-passive-dr`: 1 − (1 − a)(1 − 0.95 a). The 0.95 is the assumed chance that failover works.
- The request path multiplies the availability of every component a request must reach through blocking calls that have neither a fallback nor a circuit breaker. Each component counts once.
- A dependency with a fallback counts as 1 − (1 − primary)(1 − fallback).
- A call behind a circuit breaker is treated as optional: its failure degrades the caller but does not make the request fail.

## Latency

- Under load, a component's latency is multiplied by 1 ÷ (1 − utilisation), capped at 20. A `degraded` fault multiplies it by 3.
- The critical path is the slowest chain of blocking calls from an entry.
- Percentiles are not added directly, because the sum of P99s overstates the P99 of a sum. Each component is fitted to a lognormal distribution from its P50 and P99; means and variances are added along the path; the path's percentiles are read from the matched distribution.
- With a cache, the P50 and P95 weight cached hops by the miss ratio. The P99 uses the full miss path.

## Cost

A month is 730 hours.

- Instances = load ÷ `max_rps`, rounded up and kept between `autoscale_min` and `autoscale_max`.
- Component cost = `monthly_base_cost_usd` × instances ÷ `autoscale_min` + `cost_per_million_requests_usd` × monthly requests + `storage_gb` × `storage_cost_per_gb_usd`.
- Egress applies to connections that cross a region or zone boundary and carry an egress price: monthly GB × price.
- The total is reported with its coverage: how many components carried cost data. Components without it are left out and listed.

```bash
node bin/archi-made-easy.mjs simulate <architecture.json> --cost --json
```

## Defaults used when a value is missing

These are planning defaults for exploring a design. They are not measurements and not provider SLAs.

| Role | SLA % | Max RPS per instance | P50 ms | P99 ms | Redundancy |
|---|---|---|---|---|---|
| ingress | 99.95 | 10,000 | 5 | 50 | single-instance |
| cdn | 99.99 | 50,000 | 5 | 40 | active-active-multi-region |
| load-balancer, gateway | 99.95 | 10,000 | 5 | 50 | single-instance |
| stateless-compute | 99.9 | 1,000 | 20 | 200 | single-instance |
| stateful-db | 99.95 | 2,000 | 5 | 80 | single-instance |
| cache | 99.9 | 20,000 | 1 | 10 | single-instance |
| message-broker, stream | 99.95 | 20,000 | 5 | 50 | single-instance |
| object-store | 99.99 | 5,000 | 20 | 200 | multi-az |
| identity | 99.9 | 2,000 | 20 | 150 | single-instance |
| external-saas | 99.5 | 500 | 150 | 1,500 | multi-az |
| ai-model | 99.5 | 50 | 800 | 8,000 | multi-az |

An external component that only sends requests (users, client systems) is an actor. It has no availability, capacity or latency of its own.

Connections default to one call per request, 80% reads, 2 KB payloads, no retries and no circuit breaker. Timeouts and prices have no default.

## Limits of the model

- Steady state only: no warm-up, autoscaling delay or time-of-day pattern.
- Failures are treated as independent; correlated failures are understated.
- Latency under load uses a simple queueing factor.
- Results are only as good as the inputs. Replace assumed values with real ones before relying on a number.
