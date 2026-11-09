# Architecture review rules

Read this when the user asks for a review, a risk assessment, an architecture review board (ARB) scorecard, or "is this design sound?".

## Contents

- [Running a review](#running-a-review)
- [What a finding contains](#what-a-finding-contains)
- [Rules implemented in this version](#rules-implemented-in-this-version)
- [Score](#score)
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

`id`, `rule`, `title`, `pillar`, `severity` (`critical`, `high`, `medium`, `low`), `affectedNodes`, `affectedEdges`, `evidence`, `remediation`, and `basis`.

`basis` is `authored` when the finding rests on values in the document. It is `assumed` when it rests on an inferred role or a default value; confirm an assumed finding with the user before treating it as fact.

## Rules implemented in this version

| Rule | Pillar | Severity | Fires when |
|---|---|---|---|
| `spof` | Reliability | high | A single-instance component is needed by every request through an entry, with no fallback |
| `deep-sync-chain` | Reliability, Performance | medium | More than 3 blocking calls in a row with no circuit breaker or asynchronous step |
| `timeout-hierarchy` | Reliability | high | A caller's timeout is shorter than its callee's timeout × attempts. Authored timeouts only. |
| `unprotected-async-consumer` | Reliability, Operational Excellence | medium | An asynchronous connection has neither a dead-letter destination nor an idempotency guarantee |
| `zero-trust-violation` | Security | critical | A public entry connects straight to a database that declares no authentication |
| `chatty-cross-boundary-egress` | Cost | medium | A blocking connection carries at least 100 requests/s across a region or zone boundary and has an egress price. Needs authored load. |
| `missing-recovery-objectives` | Operational Excellence | low | A database or object store has no RPO or RTO |
| `idle-over-provisioning` | Sustainability, Cost | low | A component runs below 10% utilisation with more than one minimum instance. Authored load and capacity only. |
| `unencrypted-data-store` | Security | high or medium | A data store is declared unencrypted (high), or a compliance requirement is stated and encryption is not declared (medium) |
| `requirement-availability` | Reliability | high | Modelled availability is below `requirements.availability_target_percent` |
| `requirement-latency` | Performance | high | Modelled critical-path P99 exceeds `requirements.p99_latency_ms` |
| `requirement-capacity` | Performance | high | Modelled max sustainable load is below `requirements.peak_rps` |
| `requirement-recovery` | Reliability | high | A data store's RPO or RTO is weaker than required |
| `requirement-budget` | Cost | medium | Estimated monthly cost exceeds `requirements.monthly_budget_usd` |

Each rule has a test with one design that must trigger it and one that must not.

## Score

Score = 100 − the sum of finding weights, not below 0. Weights: critical 15, high 8, medium 4, low 1. An assumed finding counts half. Each pillar has its own score from its own findings.

The score summarises the findings above. It is not a certification and says nothing about aspects the rules do not cover.

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
- Give the score and the count of findings by severity, then the findings in order, each with its evidence and fix.
- Mark assumed findings as needing confirmation.
- Say what the review does not cover when the user is relying on it for a decision.
- Offer to apply the fixes and rerun the review to show the change.
