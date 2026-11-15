# Truth contract: test runs and evidence

What ran, where, on which tree, and what did not run. The contract and the root-cause analysis are in [TRUTH-CONTRACT.md](../../TRUTH-CONTRACT.md).

Everything here ran on one machine: Windows 11, Node 24.18.0, Chrome. The packages were built with Node 22.23.4 (zlib 1.3.1-e00f703). Nothing in this folder is a measurement of a running system: every figure the engine prints is modelled.

## Tree

- Base: `0edf771` on `main`.
- Tested tree: `4a909ddf200af7dc7f2a43d87e1e3a11ff4240d4` (the staged working tree, snapshotted with `git write-tree` into a clone outside OneDrive; the clone's tree was checked to be identical). It is not a commit on any branch. The tree that holds this page differs from it only by this page.
- `archi-made-easy.zip` SHA-256 `f81f9e840787484322b9fb3886b3e0c900c9649b6c9aaa3c453fdb4fd6b5028e`
- `archi-made-easy-copilot.zip` SHA-256 `e371d34ac0ee0bb267a461a1963d9e801d49d718becb5237fdd9f824daa8ee14`

## Before the fix

`test/qa-report-regressions.test.mjs` holds the exact scenarios of both QA reports. Run against an untouched export of `0edf771`: **19 of 20 fail.** The one that passes checks behaviour the reports asked to preserve (with a stated load, a surge is calculated). See [before-fix-HEAD-0edf771.txt](before-fix-HEAD-0edf771.txt).

## Final runs

| Run | Command | Result |
|---|---|---|
| Report scenarios | `node --test test/qa-report-regressions.test.mjs` | 20 of 20 pass |
| Invariants | `node --test test/truth-contract.test.mjs` | 33 of 33 pass: schema contract, generated designs (136 from 150 seeds), metamorphic relations, missing-field permutations, contradictions, units, extremes, provider-independent FinOps fixtures, renderer equivalence, end to end |
| Generated files | `npm run test:generated` | all checks pass |
| Full unit suite, outside OneDrive | `node scripts/run-tests.mjs` | 3,663 tests: 3,418 pass, 43 fail, 201 skipped. The 43 failures are exactly the 43 of the 1.0.0 release baseline (Windows-only); none is new |
| Browser suite, serial | `node scripts/run-browser-tests.mjs --concurrency=1` | 46 files, 326 tests: 319 pass, 0 fail, 7 skipped (the same 7 as the release baseline), 19 minutes |
| Truth contract in the browser | `node --test test/truth-contract-browser.test.mjs` | 8 subtests pass in Chrome (also inside the browser suite above); 12 screenshots written to [docs/visual-qa/truth-contract/](../../../visual-qa/truth-contract/) |
| Visual QA matrix | `node scripts/visual-qa.mjs` | 744 states (12 documents, six viewports, both themes): 0 critical, 0 high, 122 medium in 12 distinct findings, identical to the 1.0.0 baseline (all the accepted phone-width label finding D-016). Report: [automated-report.json](../../../visual-qa/automated-report.json) |

The unit suite has 43 known failures on Windows (symbolic links, path separators, 8.3 names). The gate is that the failing set equals that list, not that it is empty.

## Evidence files

- [cli/](cli/INDEX.md): plain-text engine output for the two report prompts, the FinOps cases, and hybrid and on-premises documents.
- [docs/visual-qa/truth-contract/](../../../visual-qa/truth-contract/): screenshots of the running page.

| Screenshot | Shows |
|---|---|
| `01-food-delivery-10x-inconclusive.png` | The report's P0 case: 10x with no stated load is inconclusive, with the ceiling as a ceiling and what to supply. No comparison, no recovery list. |
| `02-food-delivery-performance-10x.png` | The same condition through the Performance sliders. |
| `03-online-store-zone-loss-range.png` | Loss of one zone with unknown placement: a best and a worst case; Entra ID and Users marked at risk, not down. |
| `04-online-store-region-blackout.png` | Region blackout as its own scenario. |
| `05-online-store-review-coverage.png` | The score with its coverage and lowest possible value; pillars not assessed; the checks that could not run. |
| `06-finops-missing-usage-not-zero.png` | A request price with no usage: "not calculated", badge "usage unknown", a completeness gap. No $0. |
| `07-finops-request-only-partial.png` | A request-only price with usage: "at least $0.60", partial, with what is left out. |
| `08-finops-metered-with-sources.png` | A function priced on every billed dimension, with quantity, price, source and equation per meter. |
| `09-finops-no-data-preserved.png` | The honest empty state, unchanged. |
| `10-ecommerce-partial-subtotal-1440.png`, `-390.png` | The packaged example: the figure on one line, labelled a partial subtotal, with unsourced prices stated. |
| `11-food-delivery-10x-mobile.png` | The inconclusive state at 390 px. |

## What did not run

- **No live agent runs.** Whether a host agent follows the new instructions (leaves a load out instead of inventing one, reports a status before a figure) was not exercised. `scripts/acceptance-agent-prompts.mjs` exists for that and costs real agent time.
- **No Agent Builder run.** Behaviour of the Copilot Edition inside Microsoft's sandbox remains unverified, as before.
- **Playwright MCP inspection.** The Playwright browser profile was held by another session's server, so interactive inspection used the repository's own Chrome harness instead: the page was driven and screenshots were taken through `test/truth-contract-browser.test.mjs`, and each screenshot was looked at.
- **README showcase media** (`build:readme-showcase`) needs ffmpeg, which this machine does not have. The README screenshots under `docs/assets/` are from 1.0.0 and do not show the status tags.
- **Provider prices.** No price in any fixture is a provider's current price. The FinOps fixtures check arithmetic and representation, not a bill.

## Problems found while verifying

These came up during the runs and were fixed before the final runs above. They are recorded because each one would have shipped otherwise.

| Found by | Problem | Fix |
|---|---|---|
| Full unit suite, first pass | Ten failures from stale derived files and an unregistered test file | Regenerated every derived file; registered `truth-contract-browser` in the browser inventory |
| Browser suite, first pass | Two `workbench-browser` assertions still expected the old wording (an impact line without a status, a bare "$560/mo" badge on a partial component) | The assertions now require the engine's own words (`simulationHeadline`, `formatNodeCost`) |
| Quick visual QA matrix | Status tags below 4.5:1 contrast on tinted callouts (D-049); two content checks reading the old sentences | Status word in the body text colour, status colour on the border and a dot; checks read the contract's words |
| Full visual QA matrix | "inconclusive" cut off in the vitals bar at 1280 and 1366 wide (D-050) | Status words set smaller than figures; a browser test asserts nothing in the bar is clipped |
| Generated-files check, in a clean clone | The committed example pages lacked the last two CSS fixes: the example render had failed on OneDrive and the failure was not noticed | Renders now go to a temporary folder and are copied in, any failure stops the regeneration, and it ends with `test:generated` as proof |
| Browser suite, first pass | One Route Probe subtest stalled Chrome for 2.8 hours; the next files inherited a browser that would not exit | Environmental: every affected file passed when rerun alone, and the final serial run passed in full |
