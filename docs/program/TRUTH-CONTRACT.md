# Truth, completeness and evidence contract

This records why the contract exists, what it is, which QA findings it closes, and what it does not cover.

Agents and authors read [the skill reference](../../archi-made-easy/references/truth-and-evidence-contract.md). This page is for maintainers and reviewers.

## Contents

- [Summary](#summary)
- [The two reports](#the-two-reports)
- [Where the wrong state entered](#where-the-wrong-state-entered)
- [Failure classes](#failure-classes)
- [The contract](#the-contract)
- [Findings and their status](#findings-and-their-status)
- [Invariants and the tests that hold them](#invariants-and-the-tests-that-hold-them)
- [Evidence](#evidence)
- [What changed for existing documents and consumers](#what-changed-for-existing-documents-and-consumers)
- [Limits](#limits)

## Summary

Two QA reports on Microsoft 365 Copilot Edition v1.0.0 (15 November 2026) found that the engine could present a result it had not calculated as a result:

- a 10x traffic run with no stated load reported "no component is affected" and 0% traffic lost;
- a request price with no stated usage reported a cost of $0, and a cost score of 100.

Both are the same defect. A value that was unknown became a value. The fix is one contract that every analysis and every output follows, not a patch per screenshot.

## The two reports

| Report | Scope | Release blocker |
|---|---|---|
| Architecture creation + simulation QA dossier | Two prompts (Azure online store, AWS food delivery), review, failure and traffic simulation, desktop and mobile | P0: a traffic multiplier with no baseline returns false reassurance |
| FinOps QA dossier | AWS, Azure and GCP scaffolds, request-priced functions, the packaged e-commerce example | P0: missing usage is presented as $0 |

Both reports name what to keep: the honest no-data default, the modelled and assumed labels, deterministic arithmetic, offline pages, accessible controls and the readable canvas. All are kept.

## Where the wrong state entered

The pipeline is: prompt, host agent, architecture document, `buildModel` (defaults and inference), `simulate` and `estimateCost`, `review`, then the outputs (JSON, plain text, the page, the design document).

| Stage | What went wrong |
|---|---|
| Document and schema | Correct. The scaffolds invent no load and no price. The schema could not express how a service is billed, or where a price came from. |
| `buildModel` | Recorded only "authored" or "assumed". A role default (`single-instance` for an identity provider) and a fact about the system looked the same downstream. A load stated on a non-entry component was dropped without a word. |
| `simulate` | With no baseline it propagated a placeholder load of 1 to find the capacity limit, then computed "traffic lost" from that placeholder: `0`. It set `saturated: false` for every component. The only sign was a sentence in `warnings`. |
| `estimateCost` | For a request price with no load it added `0` and a note, counted the component as priced, and returned `monthly_total_usd: 0`. |
| `review` | Scored only the findings that fired. A rule that could not run fired nothing, so it counted as a pass. A pillar with no rule that could run scored 100. |
| Outputs | Each formatted the result itself. The page rounded money to whole dollars, headed any figure "Total", printed "No component is affected" whenever the list was empty, and did not show the cost notes. |
| Tests | Asserted the defect. `test/workbench-analysis.test.mjs` required `requests_usd` to equal `0` when the load was not set. No test compared what the outputs said, only that the two copies of the engine agreed. |

The earliest point is the engine, not the page. The page made it worse, but a correct page could not have fixed a result object that said `0`.

## Failure classes

Each class is one missing invariant. The report findings are samples of them.

| Class | Report samples | Earliest causal defect | Why nothing stopped it | Missing invariant | Correction |
|---|---|---|---|---|---|
| **A. Unknown became a value** | 10x reports no impact and 0% lost. Missing usage is $0. `saturated: false` with no load. | `sim.mjs` and `cost.mjs` computed with placeholders and zeros, and returned plain numbers. | The result had no field for "not calculated". A note in an array is not a state. | A figure that was not calculated is `null` with a reason, and the result says so in a typed `status`. | `evidence.mjs`: statuses and reasons. `sim.mjs` and `cost.mjs` return `status`, `reasons`, `missing` and per-calculation assessments. |
| **B. A part was shown as the whole** | $0.60 of requests headed "Total". $15,878 as a total with no provenance. Latency and availability with no load shown as final. | One field, `monthly_total_usd`, held totals and subtotals alike. | Coverage was a count beside the number, not a condition on it. | A total exists only when complete. Otherwise the number is a subtotal, labelled, and a lower bound. | `monthly_total_usd` is `null` unless `status` is `complete`; `subtotal_usd` carries the rest. Lower bounds are marked in simulation too. |
| **C. Not evaluated counted as passed** | Cost pillar 100 with one of ten priced. "No rule fired". Review 100 on illustrative prices. | `review.mjs` had no record of whether a rule ran. | The score was 100 minus penalties: no evidence, no penalty. | A check that could not run is listed as a gap. A score is given with its coverage and its worst case. Missing evidence never raises the floor. | Per-rule evaluation, `gaps`, `score_floor`, `coverage`, pillar `status`, and `dimensions` that keep six things apart. |
| **D. Each output decided for itself** | $0.60 shown as $1. The cost note hidden in the page. Coverage 0/10 beside a list of nine. | Formatting and wording lived in `viewer/workbench.js`, the command line and the exporter separately. | The parity test compared the two engine copies, not what the outputs said. | Every surface prints the same words for the same result. | `present.mjs`: one presenter that the command line, the page and the design document all call. Renderer-equivalence tests. |
| **E. A default was treated as a fact** | "Run Entra ID across two zones". A circuit breaker proposed on the users' own call. | `defaults.mjs` gives every role a redundancy; findings and fixes read it as the design's. | Findings were only marked "assumed", then acted on in full. | A default stays visibly a default. A fix is offered only where the design can apply it. | `origin` per value (authored, default, inferred, derived, unknown). `managed_by`. Provider-managed redundancy is a gap, not a finding. Fixes need an owned caller. |
| **F. The question answered was not the question asked** | A zone test that removed the region. "Answered" hiding a failed order. An async consumer as the system's capacity. Two components named "Aurora". | One scenario picked "the largest region or zone". Composite availability counted any answer. | Nothing named the exact target or the meaning of a figure. | A scenario names exactly what it fails. A figure states what it counts. Unknown placement gives a range, not a verdict. | Zone and region scenarios split; `fails` text; best and worst case `bounds`; `journeys`; separate async drain ceiling; unique display names. |
| **G. The model could not represent the input, and said nothing** | A function billed per request and per GB-second, priced by requests only. No region, SKU, plan, source or date. | The schema had three cost fields. | A valid request price produced a valid, precise, wrong-looking bill. | What cannot be represented is reported as unsupported or partial. Every price can carry its source. | `billing.mjs`: billing dimensions, units, pricing models, quantity bases, allowances, tiers, sources and freshness. An undeclared or uncovered billing model is partial. |

## The contract

Four engine modules, all pure and shared by the command line and the page:

| Module | Holds |
|---|---|
| `workbench/evidence.mjs` | The vocabulary: seven statuses, seven origins, the reason catalogue (each with a message and what to supply), the rules for combining statuses, and evidence confidence. |
| `workbench/requirements.mjs` | What each calculation requires, which defaults it may use, its units, when it applies, what it becomes when an input is missing, its uncertainty and what its output means. |
| `workbench/billing.mjs` | Billing dimensions and their units with conversion factors, pricing models and the dimensions each bills, how billed seconds are counted, allowances and tiers, price sources and freshness. No prices. |
| `workbench/present.mjs` | The words. Every surface calls these: cost headline, component cost, cost lines, simulation headline, review headline, the text for an empty findings list, and money and unit-price formatting. |

The rules:

1. A calculation with a missing essential input is `inconclusive`. Nothing about its outcome is stated.
2. A number exists only for `complete` and `partial`. With `partial` it is a subset or a lower bound and is labelled.
3. Combining parts never yields something more complete than the least complete part allows.
4. Completeness and confidence are separate. Defaults do not make a result incomplete; they make it low-confidence, and they are listed.
5. No renderer formats a status, a total or a headline on its own.

## Findings and their status

### Architecture and simulation report

| Priority | Finding | Status | Held by |
|---|---|---|---|
| P0 | Traffic multiplier with no baseline returns false reassurance | **Fixed.** `inconclusive`, reason `missing-baseline-load`; outcome figures are `null`; no comparison table, no recovery list; the ceiling is shown as a ceiling. JSON, text, page and design document agree. | `qa-report-regressions` "QA P0" (four tests); `truth-contract` property and equivalence tests; `truth-contract-browser` |
| P1 | Zone and region blackout are conflated | **Fixed.** Scenario `b` is one zone, `g` is the region; each names what it fails. With no zone drawn, the result is a best and worst case, and the page marks components that fail only in the worst case as at risk, not down. | "QA P1: zone loss and region loss…", "QA P1: a zone-redundant design…" |
| P1 | Managed Entra ID receives a customer-deployment fix | **Fixed** for the class: provider-managed services with unstated redundancy are a gap with no fix. Identity, CDN, third-party and model roles are inferred as provider-managed; `managed_by` overrides. | "QA P1: a provider-managed identity service…" |
| P2 | Answered KPI hides failed business journeys | **Fixed in part.** A contained failure marks availability `partial` with the reason, in every output. Declared request traces are reported as journeys that are served, degraded or failed. Journeys are not inferred when none are declared. | "QA P2: a contained database outage…" |
| P2 | Circuit-breaker fixes generated for every edge | **Fixed.** Offered only where the caller is owned by the design. | "QA P2: circuit-breaker fixes…" (every pattern and provider) |
| P2 | Duplicate service labels make scenario targets ambiguous | **Fixed.** Unique display names from the description, then the id. | "QA P2: two components with one label…" |
| P2 | Secondary async consumer limits headline capacity | **Fixed.** The request-path ceiling and the asynchronous drain ceiling are separate. | "QA P2: a background consumer…" |
| P3 | Mobile inspector obscures topology | **Not changed.** The status and the reason are checked to stay on screen at 390 px. Snap states for the sheet are a layout change and were left out of this work on purpose. | `truth-contract-browser` "narrow screens" |

### FinOps report

| Priority | Finding | Status | Held by |
|---|---|---|---|
| P0 | Missing usage becomes $0 | **Fixed.** The meter is left out with `missing-usage-baseline`; no total; a fixed part is a partial subtotal; egress with no flow is left out with a reason; a completeness gap replaces "no rule fired". | "FinOps P0" (five tests); browser "FinOps P0" |
| P1 | Billing dimensions are not representable | **Fixed** as a model: requests, memory-seconds, vCPU-seconds, instance-hours, storage, operations, transfer, flat; allowances, tiers, concurrency, quantity basis. No provider price list is included, by design. | `truth-contract` finops fixtures; units tests |
| P1 | No price provenance or freshness | **Fixed.** Each meter can carry provider, service, meter, SKU, region, plan, commitment, URL, retrieval and effective dates. Unsourced and stale prices are reported. | "finops fixture: price evidence…" |
| P1 | Cost pillar can score 100 with 1 of 10 priced | **Fixed.** The pillar is partial with a floor, or "not assessed" when there is no cost data. | "FinOps P1: the cost pillar…" |
| P2 | Whole-dollar rounding | **Fixed.** Cents below $100; unit prices are never rounded. | `truth-contract` money tests; browser "keeps its cents" |
| P2 | Actor counted in coverage | **Fixed.** The denominator is priceable components. | "FinOps P2: the coverage denominator…" |
| P2 | Large total wraps | **Fixed.** The figure does not break, and the strip does not clip it. | browser "one line, at every width" |
| P3 | Mobile context loss | **Not changed.** See above. | |
| P3 | Local favicon 404 | **Fixed.** An empty inline icon. | browser accessibility test |

## Invariants and the tests that hold them

| Invariant | Test |
|---|---|
| Missing usage never becomes zero cost | `truth-contract`: "a cost total exists exactly when the estimate is complete…", "permutations: a serverless meter set…" |
| Missing evidence never becomes "no finding" | "a review score is bounded by its floor…", the gap checks in the permutation tests |
| Partial coverage never becomes a complete score | the review property test; "FinOps P1: the cost pillar…" |
| Unknown placement never becomes a definite outcome | "QA P1: a zone-redundant design…" |
| Inferred and assumed values stay visibly so | "assumed and inferred values are counted and listed…", "an authored value replaced by a default…" |
| Every displayed number can be traced | "units: every computed cost line can be recomputed…" |
| Equivalent inputs give equivalent meaning on every surface | "equivalence: command-line JSON, plain text, the browser engine and the design document…" |
| Rewording without changing meaning does not change the result | "metamorphic: the same design written differently…" |
| Removing required information never increases completeness or confidence | "metamorphic: removing a required fact…" |
| Contradictory input is rejected or invalid | the two "contradictions" tests |
| Unit and dimension validity | the two "units" tests; "contract: billing dimensions…" |
| Extreme values stay finite and typed | "extremes" |

The generated designs come from a seeded generator, so a failure names its seed.

## Evidence

| What | Where |
|---|---|
| The report scenarios as tests that fail on the earlier code: 19 of 20 fail on `0edf771`; the one that passes checks behaviour that was to be preserved | [acceptance/truth-contract/before-fix-HEAD-0edf771.txt](acceptance/truth-contract/before-fix-HEAD-0edf771.txt) |
| Test runs on the final tree: counts, commands, and the comparison with the Windows baseline | [acceptance/truth-contract/README.md](acceptance/truth-contract/README.md) |
| Plain-text engine output for AWS, Azure, Google Cloud, hybrid and on-premises documents, and the FinOps cases | [acceptance/truth-contract/cli/](acceptance/truth-contract/cli/INDEX.md) |
| Screenshots of the running page, written by `test/truth-contract-browser.test.mjs` | [../visual-qa/truth-contract/](../visual-qa/truth-contract/) |
| Defects found and fixed in the interface, including four found during this work | [../visual-qa/DEFECT-REGISTER.md](../visual-qa/DEFECT-REGISTER.md), D-038 to D-048 |

Image exports (SVG, PNG) and print carry no modelled figure: workbench marks are removed from them, as before. The design document is the export that carries figures, and it is held to the same words as the other outputs.

## Changelog entry, held back

`CHANGELOG.md` and the version are unchanged. The repository's release-identity check requires a development version (for example `1.1.0-dev.1`) as soon as "Unreleased" lists a change, and that in turn requires the update manifest of the published 1.0.0 release, which has not been published. Both are the owner's release steps. Until then the package in this tree differs from the published 1.0.0 while still naming itself 1.0.0: do not release it under that number.

The entry, ready to paste under "Unreleased" when the development version starts:

**Fixed**

- A result that was not calculated is no longer shown as a result. A 10x traffic run with no stated load is `inconclusive` instead of "no component is affected" and 0% lost. A usage price with no stated usage is left out instead of counted as $0.
- A subtotal is no longer shown as a total. `monthly_total_usd` is `null` unless the estimate is complete; `subtotal_usd` carries the partial figure, labelled.
- A check that could not run is no longer a pass. The review lists such checks under `gaps`, gives the score with its coverage and its lowest possible value, and shows a pillar with nothing assessed as "not assessed" rather than 100.
- Zone loss and region loss are separate scenarios (`b` and `g`). Each scenario states exactly what it fails.
- A provider-managed service is no longer told to redeploy across zones, and circuit-breaker fixes are offered only where the design owns the caller.
- Two components with one label are told apart in scenario targets and results.
- A queue or stream consumer is no longer the headline capacity of the request path.
- Money keeps its cents below $100; unit prices are never rounded; the coverage denominator counts priceable components; a large figure no longer wraps or clips; pages carry an inline icon.

**Added**

- Truth, completeness and evidence contract across simulation, cost, review and every output: a typed `status`, machine-readable `reasons`, the missing inputs, and an `origin` for each value.
- Billing-dimension model for cost: meters by dimension and unit, pricing models, free allowances, tiers, quantity basis, price sources and freshness. No provider price list.
- Best and worst case (`bounds`) when an outcome depends on an unstated fact; `journeys` from declared request traces; `trace` with the calculation, equation and inputs behind each headline figure.
- `operational.managed_by`, `finops.pricing_model`, `finops.usage`, `finops.meters`, `traffic.egress_price_source`, `workbench.as_of`; `--as-of` on `simulate` and `review`; `--fault zone=down`.
- Test suites `truth-contract`, `qa-report-regressions` and `truth-contract-browser`.

**Changed**

- `simulate` JSON and the cost estimate are `schemaVersion` 2. Figures that were not calculated are `null`. `coverage.components` counts priceable components.
- Seven preset scenarios instead of six.
- The earlier cost fields still work. A component priced only with them is partial until it declares `pricing_model`.

## What changed for existing documents and consumers

No document needs to change. Results read differently where they were not complete before.

| Area | Before | Now |
|---|---|---|
| `simulate` JSON | `schemaVersion` 1 | `schemaVersion` 2. Adds `status`, `reasons`, `missing`, `assessments`, `confidence`, `trace`, `display`, `bounds`. `ingress_share`, `composite_sla_percent` and latency are `null` when not calculated. `saturated` is `null` with no load. |
| Capacity | `max_sustainable_rps` over every component | Over the blocking request path. Queue and stream consumers are in `async_drain_ceiling_rps`. |
| Scenarios | Six: `b` was "zone or region" | Seven: `b` is `zone-loss`, `g` is `region-blackout`. Each has `fails`, `target_labels` and `readiness`. |
| Cost JSON | `monthly_total_usd` always a number when anything was priced | `null` unless complete; `subtotal_usd` holds the computed sum. `coverage.components` counts priceable components. Adds `status`, `reasons`, `omitted`, `billing`, `confidence`, and per-meter detail. |
| Earlier cost fields | The whole model | Still read, as meters with no source. A component priced only this way is partial until it declares `pricing_model`. |
| Review JSON | `score`, `pillars.<name>.score` | Adds `status`, `score_floor`, `coverage`, `gaps`, `rule_results`, `dimensions`. A pillar's `score` is `null` when nothing was assessed. |
| Comparisons | Cost compared on totals | On totals when both are complete, otherwise on subtotals, and the row says so. |

## Limits

- **No provider price list.** The estimate is arithmetic over the prices in the document. The billing model can represent how a function, a container service, a database or storage is billed; it does not know what any provider charges.
- **The agent still writes the document.** The engine cannot stop an agent from inventing a load and writing it as authored. The skill instructions forbid it and the model reports what is missing, which removes the reason to invent. This was not tested with live agent runs in this work.
- **Rewording a prompt.** The invariance test covers the same design written differently as a document. Whether two wordings of a prompt give the same document depends on the host model and is not tested here.
- **Journeys are declared, not inferred.** Without `workbench.traces`, a contained failure is reported as "answered is not successful", without naming the operations.
- **Overload is not turned into errors.** When a component saturates, availability and traffic lost are marked as lower bounds; the amount shed is not derived.
- **Provider-managed is an inference from the role.** A self-hosted identity server is treated as provider-managed until `managed_by` says otherwise.
- **Freshness needs a reference date.** With no `workbench.as_of` or `--as-of`, the age of a price is not judged, and that is stated.
- **Mobile sheet.** Unchanged, as noted above.
