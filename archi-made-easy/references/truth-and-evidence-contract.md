# Truth, completeness and evidence contract

Read this before you report any modelled figure: a simulation result, a cost, a review score or a scenario outcome. It applies to what you write in your reply as much as to what the tools print.

## Contents

- [The rule](#the-rule)
- [Statuses](#statuses)
- [Where a value came from](#where-a-value-came-from)
- [What you must never do](#what-you-must-never-do)
- [Simulation](#simulation)
- [Cost](#cost)
- [Review](#review)
- [When the user gives no numbers](#when-the-user-gives-no-numbers)
- [Reporting a result](#reporting-a-result)
- [For maintainers](#for-maintainers)

## The rule

A figure that was not calculated is never shown as a result. Every analysis carries a `status` and `reasons` next to its figures. Read them before the numbers, and pass them on.

The same canonical result feeds the JSON, the plain text, the page and the design document. The words come from `workbench/present.mjs`. Do not rephrase a status into something stronger.

## Statuses

| Status | Meaning | How to report it |
|---|---|---|
| `complete` | Every required input was available and the calculation ran. | State the figure. Say it is modelled. |
| `partial` | Part was computed. A number is a subset or a lower bound. | Say "at least" or "partial", and name what is missing. |
| `inconclusive` | An essential input is missing. No conclusion is drawn. | Say it is inconclusive and what to supply. Give no outcome. |
| `unknown` | There was nothing to evaluate (for example no cost data). | Say there is no data. Do not say zero. |
| `unsupported` | The input exists but the model cannot represent it. | Say it is outside the model. |
| `invalid` | Stated values contradict each other. | Name the contradiction. Give no figure. |
| `not_applicable` | The question does not apply to this design. | Say so, or leave it out. |

Only `complete` is a definitive result. Combining parts never gives something more complete than the least complete part allows.

## Where a value came from

Each decision-relevant value in the model has an origin (`node.origin`, `edge.origin`, and `inputs[].origin` on cost meters):

| Origin | Meaning |
|---|---|
| `authored` | Stated in the document by its author. |
| `derived` | Computed from other values. |
| `inferred` | Guessed from a label, a type or the structure, such as a role read from a name. |
| `default` | A documented planning default for the role. |
| `imported` | Copied from an external source, with a reference (prices). |
| `measured` | Observed in a running system. The workbench has none. |
| `unknown` | Not available. It stays `null`. |

`result.confidence` summarises this: `high`, `medium` or `low`, from the share of inputs that are authored, imported or measured. Confidence is separate from completeness. A complete calculation over defaults is complete and low-confidence.

## What you must never do

- Turn unknown into zero, false, empty, healthy, secure, resilient, inexpensive or complete.
- Report a subtotal as a total, or a lower bound as the value.
- Report "no finding" where a rule could not run. The review lists those under `gaps`.
- Report "no component is affected", "0% lost" or "nothing to recover" for an `inconclusive` run.
- Invent a load, a price, an SLA, a recovery objective, a region or a pricing plan the user did not give. Leave it out; the model will say what is missing.
- Round a figure so that it means something else. `$0.60` is not `$1`; a unit price of `$0.000016` is not `$0.00`.
- Drop the reason. If the tool says why something is not complete, your reply says it too.

## Simulation

`simulate` returns `status`, `reasons`, `missing`, one assessment per calculation in `assessments`, `confidence`, and `trace` (the calculation, equation and inputs behind each headline figure).

- **A change in load needs a baseline.** With no `capacity.baseline_rps` on an entry point, a load multiplier has nothing to multiply. The run is `inconclusive` with reason `missing-baseline-load`. Availability, latency and traffic lost are `null`. Ask for the current requests per second.
- **The capacity ceiling is still reported.** It comes from capacities, authored or assumed. It is a ceiling. It is not evidence that a given load is safe.
- **Zone and region are different failures.** Scenario `b` loses one availability zone. Scenario `g` loses the whole region. Each scenario's `fails` field says exactly what it takes away. Name that in your reply.
- **Unknown placement gives a range.** When no zone is drawn, a component with one unit is lost only if it runs in the lost zone. The run then reports a best and a worst case in `bounds`. If they differ, the result is `inconclusive` and names the components it depends on.
- **Answered is not successful.** Composite availability counts any answer, including a degraded one. When a circuit breaker contains a failure, the operation that needed the failed component still fails. Declare request traces (`workbench.traces`) to see which journeys fail (`kpis.journeys`).
- **With no load stated**, load-dependent effects are not evaluated. Availability, latency and traffic lost are then `partial`: they do not include overload.

Scenario readiness is known before running: `simulate --list-scenarios` marks a scenario that will be inconclusive and why.

## Cost

`simulate --cost` returns the estimate. See [capacity-latency-and-finops.md](capacity-latency-and-finops.md#cost) for the meter model.

- `monthly_total_usd` exists only when `status` is `complete`. Otherwise it is `null`.
- `subtotal_usd` is the sum of what could be computed. With `partial` it is a lower bound: say "at least".
- A meter with a price and no quantity is left out with a reason (`missing-usage-baseline`, `missing-meter-quantity`). It is never `$0`.
- A component that does not say how it is billed (`finops.pricing_model`) cannot be called complete: nobody can tell whether a billed dimension is missing.
- Arithmetic and pricing are separate. `arithmetic_status` says whether the stated meters were computed. `billing_status` says whether they cover what the service bills. `confidence` says whether the prices have a source.
- A price with no source (provider, region, URL, retrieval date) is an authored figure, not a checked provider price. Say so.

Do not present the estimate as a provider bill. It is arithmetic over the prices in the document. Taxes, support, credits, negotiated discounts and currency conversion are outside the model.

## Review

`review` returns six things that must stay apart (`dimensions`):

| Dimension | Field | Meaning |
|---|---|---|
| Architecture quality | `score` | Penalties from the findings of the rules that ran. |
| Worst case | `score_floor` | The score if assumed findings counted in full and every check that could not run had found a problem. |
| Evaluation completeness | `coverage`, `status` | How many applicable rules were fully evaluated. |
| Evidence confidence | `confidence` | How many inputs are stated rather than assumed. |
| Price coverage | `cost` | How much of the design the estimate covers. |
| Simulation coverage | `simulation` | Which model calculations were complete. |

- Never report a score without its coverage. "94/100, partial: 4 of 8 applicable rules evaluated" is the result. "94/100" alone is not.
- `gaps` lists every check that applies and could not run, with what to supply. They are not passes.
- A pillar with nothing assessed has `score: null`. It is "not assessed", not 100.
- A provider-managed service (an identity provider, a CDN, a third-party API) is not given a fix the customer cannot deploy. Its unstated redundancy is a gap to confirm with the provider.
- Circuit-breaker fixes are offered only where the caller is something the design owns.

## When the user gives no numbers

That is normal. Do this:

1. Author the document without the number. Do not fill it in.
2. Run the analysis. It reports what is missing.
3. Tell the user what was calculated and what was not, and ask for the missing input in plain words: "How many requests a second does this serve today?"

A scaffold states no load and no prices on purpose. Its 10x scenario is inconclusive and its cost is "no data". Both are correct.

## Reporting a result

Lead with the status when it is not `complete`.

Good:

> The 10x run is **inconclusive**: the design states no current load, so there is nothing to multiply. The request path tops out at about 2,000 requests a second on assumed capacities; that is a ceiling, not evidence that 10x is safe. Tell me the current requests per second and I will rerun it.

> Cost: **at least $0.60 a month, partial.** Only Lambda's request meter is priced. Lambda also bills compute time, eight services have no cost data, and no price has a source.

Bad:

> At 10x no component is affected and no traffic is lost.

> The design costs $1 a month.

## For maintainers

- The contract lives in `workbench/evidence.mjs` (statuses, origins, reasons), `workbench/requirements.mjs` (what each calculation requires), `workbench/billing.mjs` (billing dimensions, units, pricing models) and `workbench/present.mjs` (the words every surface prints).
- Add a requirement to the table, not to a renderer. A renderer formats nothing on its own judgement.
- Add a reason to `REASONS` with a message and an ask.
- The invariants are held by `test/truth-contract.test.mjs`, `test/qa-report-regressions.test.mjs` and `test/truth-contract-browser.test.mjs`.
