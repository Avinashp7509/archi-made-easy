**Archi-Made-Easy Microsoft 365 Copilot Edition 1.0.1** (`copilot-v1.0.1`, 2026-11-15). This is the final 1.0.1 release. It supersedes the pre-release `copilot-v1.0.1-rc1`, which contained only the delivery adapter.

**Fixed: a result that was not calculated is no longer shown as a result.** Two QA reports on copilot-v1.0.0 (15 November 2026) found that the engine could reassure on figures it had not computed. 1.0.1 fixes the cause in the engine, so every output is affected: the command line, JSON, the HTML workbench and the design-document export.

- **Simulation truthfulness.**
  - A traffic multiplier with no stated load is **inconclusive**, with the reason (`missing-baseline-load`) and what to supply (current requests per second on an entry point). It no longer reports "no component is affected", 0% traffic lost, unchanged before-and-after figures or "nothing to recover from". The capacity ceiling is still shown, labelled as a ceiling.
  - Losing one availability zone (scenario B) and losing the region (scenario G) are separate scenarios, and each names exactly what it fails. With no zone drawn, a zone loss gives a best and a worst case; components lost only in the worst case are marked "at risk", not "down".
  - "Requests answered" is no longer presented as success when a contained failure means operations fail. Declared request traces are reported as journeys that are served, degraded or failed.
  - A queue or stream consumer is no longer reported as the capacity of the request path.
- **FinOps completeness.**
  - A price with no usage is left out with a reason, never counted as $0. With nothing computable the cost reads "not calculated".
  - A total is given only when the estimate is complete. Otherwise the figure is "at least $…", a partial subtotal, with what was left out.
  - Prices can be given per billing dimension (requests, memory-seconds, vCPU-seconds, instance-hours, storage, operations, data transfer, flat), with free allowances, tiers and a source (provider, service, SKU, region, plan, URL, dates). Unsourced and stale prices are reported. No provider price list is included.
  - Coverage counts priceable components only (not the users), and amounts keep their cents ($0.60 is no longer shown as $1).
- **Review.** A score is shown with how many rules could be evaluated and how low it could be. Checks that could not run are listed, not counted as passes; a pillar with nothing assessed reads "not assessed", not 100. No change is proposed to a provider-managed service such as an identity provider.

**Also in 1.0.1:**

- **Step checks in `SKILL.md`.** `check` runs only after `validate` and `export html` succeed; the failed step's own error is reported; the agent makes at most three safe corrections. `SKILL.md` also teaches the agent to read a result's status before its figures and never to invent a load or a price.
- **`bin/copilot-deliver.mjs`**, the delivery adapter first published in rc1, used only when the engine reports an `output/…` folder error.

**Engine.** The engine files are the Full Edition's, from the same commit: the Full Edition 1.0.0 engine plus the fixes above, which are not yet in a Full Edition release. `engine-version` still records 1.0.0. Pages are byte-identical to the Full Edition's at that commit.

**Changes a reader of JSON output may notice.** `simulate` returns `status`, `reasons` and per-calculation assessments, and figures it could not calculate are `null`. The cost total is `null` unless the estimate is complete; `subtotal_usd` holds the partial figure. There are seven preset scenarios instead of six. Existing architecture documents need no change.

**Package.** `archi-made-easy-copilot.zip`: 1,852,173 bytes, 219 files, folders two levels deep, `SKILL.md` at the root (16,836 characters). SHA-256 `e371d34ac0ee0bb267a461a1963d9e801d49d718becb5237fdd9f824daa8ee14`, also in the attached `.sha256` file.

**Verification.**
- **Done, locally** (Windows 11; tests on Node.js 24, build on Node.js 22): the edition's package and offline tests; the two reports' scenarios as tests (20 of 20 pass); the invariant suite (33 of 33); real-browser checks of the page (9 of 9); the full unit suite (only the 43 known Windows-only failures), the browser suite (0 failures) and the visual QA matrix (0 critical, 0 high).
- **Not done:** any run of 1.0.1 inside Microsoft 365 Copilot Agent Builder, and the browser interactions of a page delivered there.

All figures the engine produces are modelled from the declared design, not measured.
