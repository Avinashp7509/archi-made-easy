# Failure and what-if simulation

Read this when the user asks what happens if something fails, slows down or gets a traffic spike: "what if the database fails?", "simulate 20x traffic", "what is the blast radius of losing a region?".

## Contents

- [What the simulation is](#what-the-simulation-is)
- [Commands](#commands)
- [Fault states](#fault-states)
- [The built-in scenarios](#the-built-in-scenarios)
- [How failure spreads](#how-failure-spreads)
- [Reading a result](#reading-a-result)
- [How to report it](#how-to-report-it)

## What the simulation is

An analytical model of the architecture as declared in the document. It is deterministic: the same document and inputs always give the same result. It is not a load test and measures nothing.

- It uses the values in the document. Where a value is missing it uses a default for the component's role and counts it as assumed.
- It treats failures as independent and load as steady.
- It is good for ranking risks, showing how a failure spreads, and comparing design options. It does not predict production behaviour.
- Every result states how complete it is (`status`) and why (`reasons`). A result that is not `complete` is not a conclusion: see [truth-and-evidence-contract.md](truth-and-evidence-contract.md).

## Commands

```bash
node bin/archi-made-easy.mjs simulate <architecture.json> --list-scenarios
node bin/archi-made-easy.mjs simulate <architecture.json> --scenario a
node bin/archi-made-easy.mjs simulate <architecture.json> --scenario all --json
node bin/archi-made-easy.mjs simulate <architecture.json> --fault db=down --fault edge:api-cache=partitioned
node bin/archi-made-easy.mjs simulate <architecture.json> --fault zone=down
node bin/archi-made-easy.mjs simulate <architecture.json> --multiplier 20 --cache-hit 0.8
node bin/archi-made-easy.mjs simulate <architecture.json> --fmea
```

- `--fault <target>=<state>` names a component, connection or boundary by id. Prefix `node:`, `edge:` or `boundary:` when an id is ambiguous.
- `--fault zone=down` loses one availability zone when the diagram draws none: each component keeps the units its redundancy places in other zones.
- `--multiplier` scales ingress traffic (0.1 to 100). `--cache-hit` is the cache hit ratio (0 to 0.99); it defaults to 0, meaning no cache benefit is assumed.
- Add `--json` for the full result. Without it you get a plain-language summary.

## Fault states

| State | Effect in the model |
|---|---|
| `healthy` | Normal |
| `degraded` | Latency ×3 |
| `brownout` | Half the requests fail; capacity halves |
| `down` | Serves nothing |
| `partitioned` | Up but unreachable: every connection to and from it is cut |
| `surge` | 20× load on that component |

On a boundary, `down` is a blackout of everything inside it, and `partitioned` cuts every connection crossing it.

## The built-in scenarios

| Id | Key | What is applied |
|---|---|---|
| a | `database-outage` | The busiest database goes down: the whole service, not one replica |
| b | `zone-loss` | One availability zone is lost. With a zone boundary drawn, that boundary. With none, each component loses one unit if its redundancy spans zones |
| c | `flash-crowd` | 10× traffic |
| d | `provider-brownout` | The busiest external service or model provider becomes slow |
| e | `cache-stampede` | Every cache goes down and the hit ratio drops to 0 |
| f | `edge-breach` | Lists what is reachable from the public entry without passing an authenticated component |
| g | `region-blackout` | The largest region boundary is blacked out: every zone in it |

- A scenario with no matching target is reported as not applicable, with the reason.
- Each scenario has a `fails` sentence that says exactly what it takes away, and `target_labels` that tell apart components sharing a label. Use them when you report.
- Each scenario has a `readiness`. A scenario that changes load is `inconclusive` when no entry point states `baseline_rps`: it can be run, and its result says what is missing.
- Losing a zone and losing a region are different failures. A design meant to survive a zone outage is tested with `b`, never with `g`.

### Zone loss with no zone drawn

Most diagrams draw a region and no zones. Scenario `b` then cannot know which zone each component runs in:

- A `multi-az` or `active-active-multi-region` component loses one unit and keeps serving.
- A component with a single unit is lost only if it runs in the lost zone. The model runs both cases and reports them in `bounds.best` and `bounds.worst`.
- If the two cases differ, the result is `inconclusive` with reason `placement-unknown`, and names the components the outcome depends on. State their `redundancy`, or draw the zones, to get a definite answer.

## How failure spreads

For a blocking call whose target is failing or cut off:

1. If the call has a fallback (a `fallback_edge_id`, or a `failover-route` to a component of the same role) and the fallback is healthy, traffic moves to it and the caller stays healthy.
2. Otherwise, if the call has a circuit breaker, the caller is degraded: it fails fast and loses that feature.
3. Otherwise the caller fails too, and the same rule applies to its own callers.

Other rules:

- Asynchronous calls (`async-queue`, `async-pubsub`, `event-stream`) never spread failure upstream. A slow consumer builds queue lag instead.
- A component with `active-passive-dr` redundancy that goes down recovers on its replica. The result reports its RTO, RPO and the writes at risk.
- In a zone loss, a `multi-az` component loses one unit of capacity instead of failing. In a region blackout only `active-active-multi-region` components survive.
- Retries multiply load on a struggling dependency. The model reports the amplification and flags a retry storm when amplified load exceeds capacity.
- A caller that is failing only because a dependency is down keeps attempting it unless a circuit breaker stops the calls.

## Reading a result

Read `status` and `reasons` first.

- `status`: `complete`, `partial` or `inconclusive`. `reasons` and `missing` say why and what to supply. `assessments` gives the same per calculation.
- `kpis.composite_sla_percent`: share of requests that get any answer, including a degraded one. It is the product over the components every request needs, with redundancy and fallbacks applied. It is not the share of successful operations.
- `kpis.journeys`: each request trace declared in `workbench.traces`, as `served`, `degraded` or `failed` under these conditions.
- `kpis.critical_path`: the slowest blocking path and its P50, P95 and P99.
- `kpis.max_sustainable_rps` and `limiting_node`: the capacity ceiling of the blocking request path. A ceiling, not evidence that a load is safe.
- `kpis.async_drain_ceiling_rps` and `async_limiting_node`: the rate at which queue and stream consumers drain. Above it a backlog grows; requests are not refused.
- `kpis.active_spofs`: single-instance components that every request depends on.
- `kpis.blast_radius`: affected components and the share of entry traffic lost. `ingress_share` is `null` when it was not calculated; `ingress_share_is_floor` marks a lower bound.
- `bounds`: the best and worst case, when the outcome depends on a fact the document does not state.
- `nodes.<id>.state` and `cause`: `ok`, `degraded` or `failing`, with the reason chain. `saturated` is `null` when the load is not known.
- `events`: fallbacks, failovers, saturation, queue lag, retry storms, timeout inversions.
- `confidence` and `basis`: how many inputs were authored and how many assumed, and which ones.
- `trace`: for each headline figure, the calculation, its equation and its inputs with their origins.

Loads, utilisation and traffic lost need `baseline_rps` on an entry component. Without it they are `null`. A run that changes the load is then `inconclusive`: it has nothing to multiply. The capacity ceiling is still given.

## How to report it

- Say that this is a model of the declared design, in the first sentence.
- When `status` is not `complete`, say so first, with the reason and what to supply. Do not describe an outcome for an `inconclusive` run.
- Name exactly what was failed, from the scenario's `fails` sentence: a zone is not a region, and a database outage is not the loss of one replica.
- Lead with the effect: what fails, what keeps working, and why.
- "Answered" is not "successful". When a failure is contained, say which operations still fail.
- State the assumed inputs when they matter to the conclusion, and offer to rerun with real figures.
- Never quote a modelled number as a measured or guaranteed value.
- When the user asks for a fix, name the change in the document (a circuit breaker, a fallback, redundancy), apply it, and rerun to show the difference.
