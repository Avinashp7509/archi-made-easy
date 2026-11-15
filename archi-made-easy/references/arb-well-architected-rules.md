# Architecture review rules

Read this when the user asks for a review, a risk assessment, an architecture review board (ARB) scorecard, or "is this design sound?".

## Contents

- [Running a review](#running-a-review)
- [What a finding contains](#what-a-finding-contains)
- [Rules implemented in this version](#rules-implemented-in-this-version)
- [Score, floor and coverage](#score-floor-and-coverage)
- [Checks that could not run](#checks-that-could-not-run)
- [What is not covered](#what-is-not-covered)
- [Framework alignment](#framework-alignment)
- [How to report a review](#how-to-report-a-review)

## Running a review

```bash
node bin/archi-made-easy.mjs review <architecture.json>
node bin/archi-made-easy.mjs review <architecture.json> --json
node bin/archi-made-easy.mjs review <architecture.json> --strict
```

- `--strict` exits non-zero when a critical finding exists.
- `validate` and `finalize` add a `review` block to their receipts for documents that carry operational data. `--arb warn|strict|off` controls it; `--arb warn` requests it for a document without operational data.
- The review is advisory. It never changes whether the diagram itself passes its gates, except under `--arb strict`.

## What a finding contains

`id`, `rule`, `title`, `pillar`, `severity` (`critical`, `high`, `medium`, `low`), `affectedNodes`, `affectedEdges`, `evidence`, `consequence`, `remediation`, `fixes`, and `basis`.

- `evidence` is what in this design triggered the rule. `consequence` is what it leads to if left as it is. `remediation` is the recommended change in words.
- `fixes` is the part of the remediation that can be expressed as an edit to operational fields: a list of `{ target: "component" | "connection", id, operational, summary }`. It is empty when the change needs a figure only the user can give (a recovery objective, a budget) or a structural change. The page uses it to preview a change; to apply one, make the same edit in the document.

`basis` is `authored` when the finding rests on values in the document. It is `assumed` when it rests on an inferred role or a default value; confirm an assumed finding with the user before treating it as fact.

A fix is offered only where the design can apply it. A provider-managed service (an identity provider, a CDN, a third-party API, a hosted model) is not told to run across more zones, and a circuit breaker is proposed only on a connection whose caller the design owns, never on a call made by the users or by a provider's service.

## Rules implemented in this version

| Rule | Pillar | Severity | Fires when |
|---|---|---|---|
| `spof` | Reliability | high | A single-instance component is needed by every request through an entry, with no fallback. A provider-managed service whose redundancy is not stated is reported as a gap, not a finding |
| `deep-sync-chain` | Reliability, Performance | medium | More than 3 blocking calls in a row with no circuit breaker or asynchronous step |
| `timeout-hierarchy` | Reliability | high | A caller's timeout is shorter than its callee's timeout × attempts. Authored timeouts only. |
| `unprotected-async-consumer` | Reliability, Operational Excellence | medium | An asynchronous connection has neither a dead-letter destination nor an idempotency guarantee |
| `zero-trust-violation` | Security | critical | A public entry connects straight to a database that declares no authentication |
| `chatty-cross-boundary-egress` | Cost | medium | A blocking connection carries at least 100 requests/s across a region or zone boundary and has an egress price. Needs authored load. |
| `missing-recovery-objectives` | Operational Excellence | low | A database or object store has no RPO or RTO |
| `idle-over-provisioning` | Sustainability, Cost | low | A component runs below 10% utilisation with more than one minimum instance. Authored load and capacity only. |
| `unencrypted-data-store` | Security | high or medium | A data store is declared unencrypted (high), or a compliance requirement is stated and encryption is not declared (medium) |
| `requirement-availability` | Reliability | high | Modelled availability is below `requirements.availability_target_percent` |
| `requirement-latency` | Performance | high | Modelled critical-path P99 exceeds `requirements.p99_latency_ms`. With no load stated the modelled latency is a lower bound: above the target it is a finding, below it the target is not confirmed (a gap) |
| `requirement-capacity` | Performance | high | Modelled max sustainable load is below `requirements.peak_rps` |
| `requirement-recovery` | Reliability | high | A data store's RPO or RTO is weaker than required |
| `requirement-budget` | Cost | medium | Estimated monthly cost exceeds `requirements.monthly_budget_usd`. A partial estimate is a lower bound: above the budget it is a finding, below it the budget is not confirmed (a gap) |

Each rule has a test with one design that must trigger it and one that must not.

## Score, floor and coverage

A review keeps apart what a single number would blur (`dimensions` in the JSON):

| Field | Meaning |
|---|---|
| Score (`score`) | 100 − the sum of finding weights, not below 0. Weights: critical 15, high 8, medium 4, low 1. An assumed finding counts half. It covers only the rules that ran. `null` when none could run. |
| Floor (`score_floor`) | The worst case the evidence allows: every finding counted in full, and every check that could not run counted as a finding. Removing a fact from the document can lower it and never raises it. |
| Status (`status`) | `complete` when every applicable rule was fully evaluated, otherwise `partial` or `inconclusive`. |
| Coverage (`coverage`) | How many rules apply to this design and how many were fully evaluated. |
| Confidence (`confidence`) | How many of the model's inputs are stated rather than assumed: `high`, `medium` or `low`. |
| Cost and model run (`cost`, `simulation`) | How complete the cost estimate and the model run are. |

Each pillar has `score`, `floor`, `status` and the number of rules run. A pillar in which nothing could be assessed has `score: null` and is shown as "not assessed". It is never 100. The Cost pillar also depends on the cost estimate: with an incomplete estimate it is partial, and with no cost data it is not assessed.

The score summarises the findings of the rules that ran. It is not a certification and says nothing about aspects the rules do not cover. A high score with low coverage says little: always give both.

## Checks that could not run

`gaps` lists every place a rule applies but could not be evaluated, with `rule`, `code`, `subjects`, a `message` saying why, and an `ask` saying what to supply. `rule_results` gives the status of each rule.

| A check cannot run when | Rules affected |
|---|---|
| A provider-managed service on the request path does not state its redundancy | `spof` |
| A chained blocking call has no `timeout_ms` | `timeout-hierarchy` |
| No entry point states `baseline_rps` | `chatty-cross-boundary-egress`, `idle-over-provisioning` |
| A data store does not state `encryption_at_rest` | `unencrypted-data-store` |
| A data store does not state the `rpo_sec` or `rto_sec` being required | `requirement-recovery` |
| The modelled figure is a lower bound that is still within the target | `requirement-latency`, `requirement-budget` |

A gap is not a pass and not a finding. Where a list of findings is empty and gaps exist, the output says "not fully checked", never "no rule fired".

## What is not covered

This version does not check: network design, identity and access policies, data classification, secrets handling, observability, deployment and release practice, backup testing, capacity planning beyond the steady-state model, licensing, or organisational readiness. A clean review means none of the listed rules fired, not that the design is complete.

## Framework alignment

The pillars follow the structure shared by the major cloud frameworks. The rules are this product's own checks; they are aligned to these frameworks by topic and are not a reproduction of them.

| Framework | Reference |
|---|---|
| Azure Well-Architected Framework | https://learn.microsoft.com/azure/well-architected/ |
| AWS Well-Architected Framework | https://docs.aws.amazon.com/wellarchitected/latest/framework/welcome.html |
| Google Cloud Well-Architected Framework | https://cloud.google.com/architecture/framework |
| NIST SP 800-207, Zero Trust Architecture | https://csrc.nist.gov/pubs/sp/800/207/final |

Do not tell a user that a design "complies with" or "passes" any of these frameworks on the strength of this review.

## How to report a review

- State that it is a model-based review of the declared design.
- Give the score with its coverage and its floor: "94/100, partial: 4 of 8 applicable rules evaluated, as low as 37". Then the count of findings by severity, and the findings in order, each with its evidence and fix.
- List the checks that could not run and what would let them run. Do not describe them as passed.
- Say "not assessed" for a pillar with no score.
- Mark assumed findings as needing confirmation.
- Say what the review does not cover when the user is relying on it for a decision.
- Offer to apply the fixes and rerun the review to show the change.
