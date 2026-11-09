# Failure and what-if simulation

Read this when the user asks what happens if something fails, slows down or gets a traffic spike: "what if the database fails?", "simulate 20x traffic", "what is the blast radius of losing a region?".

## Contents

- [What the simulation is](#what-the-simulation-is)
- [Commands](#commands)
- [Fault states](#fault-states)
- [The six built-in scenarios](#the-six-built-in-scenarios)
- [How failure spreads](#how-failure-spreads)
- [Reading a result](#reading-a-result)
- [How to report it](#how-to-report-it)

## What the simulation is

An analytical model of the architecture as declared in the document. It is deterministic: the same document and inputs always give the same result. It is not a load test and measures nothing.

- It uses the values in the document. Where a value is missing it uses a default for the component's role and counts it as assumed.
- It treats failures as independent and load as steady.
- It is good for ranking risks, showing how a failure spreads, and comparing design options. It does not predict production behaviour.

## Commands

```bash
node bin/archi-made-easy.mjs simulate <architecture.json> --list-scenarios
node bin/archi-made-easy.mjs simulate <architecture.json> --scenario a
node bin/archi-made-easy.mjs simulate <architecture.json> --scenario all --json
node bin/archi-made-easy.mjs simulate <architecture.json> --fault db=down --fault edge:api-cache=partitioned
node bin/archi-made-easy.mjs simulate <architecture.json> --multiplier 20 --cache-hit 0.8
node bin/archi-made-easy.mjs simulate <architecture.json> --fmea
```

- `--fault <target>=<state>` names a component, connection or boundary by id. Prefix `node:`, `edge:` or `boundary:` when an id is ambiguous.
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

## The six built-in scenarios

| Id | Key | What is applied |
|---|---|---|
| a | `database-outage` | The busiest database goes down |
| b | `zone-blackout` | The largest region or zone boundary is blacked out |
| c | `flash-crowd` | 10× traffic |
| d | `provider-brownout` | The busiest external service or model provider becomes slow |
| e | `cache-stampede` | Every cache goes down and the hit ratio drops to 0 |
| f | `edge-breach` | Lists what is reachable from the public entry without passing an authenticated component |

A scenario with no matching target is reported as not applicable, with the reason.

## How failure spreads

For a blocking call whose target is failing or cut off:

1. If the call has a fallback (a `fallback_edge_id`, or a `failover-route` to a component of the same role) and the fallback is healthy, traffic moves to it and the caller stays healthy.
2. Otherwise, if the call has a circuit breaker, the caller is degraded: it fails fast and loses that feature.
3. Otherwise the caller fails too, and the same rule applies to its own callers.

Other rules:

- Asynchronous calls (`async-queue`, `async-pubsub`, `event-stream`) never spread failure upstream. A slow consumer builds queue lag instead.
- A component with `active-passive-dr` redundancy that goes down recovers on its replica. The result reports its RTO, RPO and the writes at risk.
- In a zone blackout, a `multi-az` component loses one unit of capacity instead of failing. In a region blackout only `active-active-multi-region` components survive.
- Retries multiply load on a struggling dependency. The model reports the amplification and flags a retry storm when amplified load exceeds capacity.
- A caller that is failing only because a dependency is down keeps attempting it unless a circuit breaker stops the calls.

## Reading a result

- `kpis.composite_sla_percent`: availability of the request path. It is the product over the components every request needs, with redundancy and fallbacks applied.
- `kpis.critical_path`: the slowest blocking path and its P50, P95 and P99.
- `kpis.max_sustainable_rps` and `limiting_node`: the load at which the first component saturates.
- `kpis.active_spofs`: single-instance components that every request depends on.
- `kpis.blast_radius`: affected components and the share of ingress traffic lost.
- `nodes.<id>.state` and `cause`: `ok`, `degraded` or `failing`, with the reason chain.
- `events`: fallbacks, failovers, saturation, queue lag, retry storms, timeout inversions.
- `basis`: how many inputs were authored and how many assumed. `warnings`: what could not be modelled.

Loads, utilisation and cost-per-request need `baseline_rps` on an entry component. Without it they are reported as not available; capacity limits are still given.

## How to report it

- Say that this is a model of the declared design, in the first sentence.
- Lead with the effect: what fails, what keeps working, and why.
- State the assumed inputs when they matter to the conclusion, and offer to rerun with real figures.
- Never quote a modelled number as a measured or guaranteed value.
- When the user asks for a fix, name the change in the document (a circuit breaker, a fallback, redundancy), apply it, and rerun to show the difference.
