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
| What does it cost? | `finops` meters on components, with their usage and price sources; `traffic.egress_cost_per_gb_usd` and `payload_kb` on connections |

Missing values are assumed from the component's role and labelled as assumptions. Two things are never assumed: load (`baseline_rps`) and prices. Without a load, load-dependent figures are `null` and a change in load is `inconclusive`. Without a price, nothing is priced.

Every result states how complete it is. Read [truth-and-evidence-contract.md](truth-and-evidence-contract.md) before reporting a figure.

## Capacity and traffic

- Capacity of a component = `max_rps` × `autoscale_max`.
- Ingress = `baseline_rps` × traffic multiplier. Each component serves at most its capacity; the rest is shed.
- A connection carries the source's served load × `request_multiplier`.
- With a cache hit ratio H:
  - a CDN or inline cache passes on 1 − H of its load;
  - a service that also calls a healthy cache sends its database 1 − H × `read_write_ratio` of its load;
  - a failed cache sends everything to the database.
- Utilisation = load ÷ capacity. At 100% a component is saturated.
- The capacity ceiling (`max_sustainable_rps`) is the ingress at which the first component on the blocking request path reaches 100%. `limiting_node` names it. It is a ceiling computed from capacities, authored or assumed. It is not evidence that a given load is safe.
- A consumer behind a queue or stream that receives more than it can drain builds lag at the difference. It does not refuse requests, so it is reported separately as `async_drain_ceiling_rps` and is not the limit of the request path.
- With no `baseline_rps` on an entry point, loads, utilisation and saturation are `null`, not zero and not "not saturated".

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

The estimate is arithmetic over prices stated in the document. It is not a provider bill, and the tool has no price list: every price comes from the author, ideally with its source. A month is 730 hours.

```bash
node bin/archi-made-easy.mjs simulate <architecture.json> --cost --json
node bin/archi-made-easy.mjs simulate <architecture.json> --cost --as-of 2026-11-15
```

### Meters

A component's cost is the sum of its meters. A meter is one billed dimension:

```json
"finops": {
  "pricing_model": "serverless-request",
  "usage": { "avg_duration_ms": 1000, "memory_gb": 0.5 },
  "meters": [
    { "id": "requests", "dimension": "requests", "unit": "request", "price": 0.20, "per": 1000000, "currency": "USD", "free_allowance": 1000000,
      "source": { "provider": "…", "service": "…", "meter": "…", "sku": "…", "region": "…", "plan": "on-demand", "url": "https://…", "retrieved_at": "2026-11-15" } },
    { "id": "duration", "dimension": "memory-seconds", "unit": "GB-second", "price": 0.0000166667, "currency": "USD", "free_allowance": 400000, "quantity_basis": "request-duration" }
  ]
}
```

| Dimension | Units | Monthly quantity comes from |
|---|---|---|
| `requests` | `request` | `usage.requests_per_month`, else modelled load × seconds in a month |
| `memory-seconds` | `GB-second`, `GiB-second` | billed seconds × memory (`usage.memory_gb` or `memory_gib`, else `capacity.memory_gb`) |
| `vcpu-seconds` | `vCPU-second`, `vCPU-hour` | billed seconds × vCPUs (`usage.vcpu`, else `capacity.cpu_cores`) |
| `instance-hours` | `hour`, `month` | instances × 730 (`usage.instances`, else the modelled instance count) |
| `storage-gb-month` | `GB-month`, `GiB-month`, `TB-month` | `usage.storage_gb` |
| `operations` | `operation` | `usage.operations_per_month` |
| `data-transfer-gb` | `GB`, `GiB`, `TB` | `usage.transfer_gb_per_month` |
| `flat` | `month` | one per month |
| `other` | none | not calculated: reported as unsupported and left out |

- Cost of a meter = max(0, quantity − `free_allowance`) ÷ `per` × `price`. With `tiers` instead of `price`, each tier applies up to its `up_to`.
- `quantity_basis` is required for `memory-seconds` and `vcpu-seconds`, because providers count billed seconds differently:
  - `request-duration`: each request is billed for its own duration (requests × `avg_duration_ms`);
  - `instance-time`: instances are billed while serving (requests × `avg_duration_ms` ÷ `concurrency`);
  - `provisioned`: capacity is billed all month (instances × seconds in a month).
- A unit must measure its dimension. `GB-second` and `GiB-second` are converted (1 GiB = 1.073741824 GB). A unit that does not measure the dimension is rejected by `validate`.
- Only USD is calculated. Another currency is reported as `unsupported` and left out.
- Egress applies to connections that cross a region or zone boundary and carry an egress price: monthly GB × price.

### Pricing models

`pricing_model` says how the service is billed, so the estimate knows which dimensions must be priced before the component can be called complete.

| `pricing_model` | Must be priced | Often also billed |
|---|---|---|
| `serverless-request` | `requests`, and `memory-seconds` or `vcpu-seconds` | `data-transfer-gb` |
| `serverless-instance` | `vcpu-seconds` and `memory-seconds` | `requests`, `data-transfer-gb` |
| `provisioned-instance` | `instance-hours` | `storage-gb-month`, `data-transfer-gb` |
| `provisioned-with-storage` | `instance-hours` and `storage-gb-month` | `operations`, `data-transfer-gb` |
| `storage` | `storage-gb-month` | `operations`, `data-transfer-gb` |
| `data-transfer` | `data-transfer-gb` | |
| `flat-monthly` | `flat` | |

Choose the model from how the provider bills the service you named. If you are not sure, leave `pricing_model` out: the component is then reported as partial, which is the truth.

### What the result says

| Field | Meaning |
|---|---|
| `status` | `complete`, `partial`, `inconclusive`, `unknown` (no cost data), `unsupported` or `invalid` |
| `monthly_total_usd` | The total. `null` unless `status` is `complete` |
| `subtotal_usd` | The sum of what was computed. With `partial` it is a lower bound |
| `arithmetic_status` | Whether the stated meters were all computed |
| `billing_status` | Whether the meters cover what the pricing models bill: `covered`, `undeclared` or `missing-dimensions` |
| `coverage` | Priced components out of priceable ones (actors such as users are not counted), and meters computed out of meters stated |
| `omitted` | Every meter left out, with its reason |
| `confidence` | Whether prices can be audited: `traceable`, `partly-sourced` or `unsourced`, and how many are stale against the reference date |
| `nodes.<id>.meters[]` | Each meter's quantity, the inputs it came from with their origins, the equation, the cost and the source |

- An estimate is `complete` only when every priceable component is priced, every meter has its quantity, and every priced component declares a pricing model whose dimensions are all priced.
- A meter with a price and no quantity is left out, never counted as $0. The usual cause is no `baseline_rps`: reason `missing-usage-baseline`.
- Stated usage that contradicts the modelled load by more than 10% makes the meter `invalid`. Correct one of the two.
- A price is fresh for 90 days from `source.retrieved_at`, judged against `workbench.as_of` or `--as-of`. With no reference date its age is not judged.

### Earlier cost fields

`monthly_base_cost_usd`, `cost_per_million_requests_usd` and `storage_gb` with `storage_cost_per_gb_usd` still work. They are read as meters with no source:

- `monthly_base_cost_usd` × instances ÷ `autoscale_min`, where instances = load ÷ `max_rps`, rounded up and kept between `autoscale_min` and `autoscale_max`;
- `cost_per_million_requests_usd` × monthly requests;
- `storage_gb` × `storage_cost_per_gb_usd`.

A component priced only this way does not declare how it is billed, so its figure is a partial subtotal. Add `pricing_model` to make it complete. Do not give the same dimension as an earlier field and as a meter: `validate` rejects the double count.

### Reporting a cost

- `complete`: "$18.73 a month, modelled from the stated prices." Say whether the prices have sources.
- `partial`: "at least $0.60 a month, partial", then what is left out.
- `inconclusive`: "not calculated", then what is missing. Never $0.
- `unknown`: "no cost data".

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
- Availability counts any answer, including a degraded one. Errors from overload are not derived: when a component saturates, availability and traffic lost are lower bounds.
- The cost estimate has no price list and does no currency conversion. Taxes, support, credits and negotiated discounts are outside it.
