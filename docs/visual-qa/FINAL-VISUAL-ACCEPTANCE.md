# Final visual acceptance

The acceptance record for the redesigned interface, against section 8 of [PHASE5-UX-ADDENDUM.md](../program/PHASE5-UX-ADDENDUM.md). Objective results come first, each with the command that produced it. The subjective assessment is separate and says so.

Environment for both records: Windows 11, Chrome (system install), Node 24.18.0, 2026-11-10. The workspace is inside OneDrive.

## Phase 6 record: the three flagship examples and levels

Phase 6 applied the same visual QA to the three flagship examples, added levels (a component opening into its own diagram, used for C4 drill-down) and one scaffolded example per provider. This record supersedes the Phase 5 numbers below; the Phase 5 record is kept as it was.

### Verdict

**Accepted with recorded limitations.** No critical or high defect is open. The only medium defect class is the inherited one (D-016): diagram labels under 6px on phones and tablets until the reader zooms.

### Objective results

All suites ran on git tree `c7342b1`, one after another, with nothing else running.

| Check | Result |
|---|---|
| Automated visual QA, full matrix (`node scripts/visual-qa.mjs --shots`) | **744 states**: 12 documents, six viewports, two themes. **0 critical, 0 high**, 12 medium (all D-016). 0 runtime errors. 182 screenshots in [archi-made-easy-after/](archi-made-easy-after/). Report: [automated-report.json](automated-report.json) |
| Playwright MCP walkthrough of the three flagships ([tools/mcp-flagship-walkthrough.playwright.js](tools/mcp-flagship-walkthrough.playwright.js)) | Real pointer and keyboard input at six viewports in both themes: first view, a component, a review finding, a scenario run, and on the C4 example a level opened and left with Escape. **156 states, 0 problems.** 8 screenshots in [mcp-walkthrough/](mcp-walkthrough/) |
| Workbench browser test (`node --test test/workbench-browser.test.mjs`) | 15 of 15 subtests, including the new "with the frame on, a diagram at the reader floor stays above the vitals bar…" and "levels: a component opens into its own diagram…" |
| Serial browser suite (`npm run test:browser -- --concurrency=1`) | 315 tests: **308 pass, 0 fail**, 7 skipped |
| Full unit and integration suite, outside OneDrive (`npm run test:full`) | 3,572 tests: 3,329 pass, 44 fail, 198 skipped. 43 failures are the Phase 0 baseline set. The 44th, `class: bus coordination preserves authored sides with empty via`, hit its 20-second subprocess timeout once; rerun alone on the same tree it passes with the rest of its file (22 of 22, 1.2 s). Logged in `.baseline/phase6-final/`. |
| `finalize --quality showcase` on the 3 flagships and 4 provider examples | 7 of 7 pass all four gates (validate, deliver, check, browser-check) |
| Benchmarks (`test/workbench-benchmark.test.mjs`) | Recorded figures equal ([flagship-figures.json](../../test/fixtures/flagship-figures.json)); quality floors, engine and render time budgets and page size budgets hold |

### Against the upstream baseline

Measured with [tools/compare-with-upstream.mjs](tools/compare-with-upstream.mjs) ([upstream-comparison.json](upstream-comparison.json)), same document, viewport, theme and state, both sets captured from running pages:

- **Colour tokens:** 0 of the 14 tokens read from the upstream page have the same value here ([upstream](upstream-baseline/observations.json), [final](archi-made-easy-after/observations.json)).
- **Pixels:** across 18 screenshot pairs, a median of 61.6% of pixels differ at all (25.2% to 100%), and 11.6% differ clearly, by more than 24 of 255 in a channel (7.2% to 19.3%). The clear share is low because most of each frame is light background in both products; a grey that moved from one light value to another counts as "at all" but not "clearly".
- **Composition:** with the workbench on, which is how every flagship and every scaffolded architecture opens, the page is a frame that upstream has no counterpart for: a mode rail on the left (68px), a vitals bar along the bottom (52px) and an inspector on the right. Upstream's page is a scrolling document with a floating control pill ([upstream 1440 x 900](upstream-baseline/web-ha-1440x900-light-initial.png), [final 1440 x 900](archi-made-easy-after/web-ha-1440x900-light-initial.png)).
- **Not measured as different:** with the workbench off, the page keeps the inherited geometry by decision (limitation 1 below).

### Defects found and fixed in Phase 6

All recorded in [DEFECT-REGISTER.md](DEFECT-REGISTER.md):

| ID | Severity | What | Found by |
|---|---|---|---|
| D-031 | high | Docking the inspector shrank a wide diagram's labels to 5.1px | automated matrix |
| D-032 | high | A level stayed blank for five seconds or more | Playwright MCP timing |
| D-033 | medium | Two child diagrams rendered 3.6px labels on a phone | automated matrix |
| D-034 | high | On the C4 example at 1366 x 768 the canvas ran under the vitals bar and the canvas tools sat on the legend | automated matrix, then Playwright MCP |
| D-035 | high | The page script spelled a closing body tag; an inherited test's probe landed inside the script | serial browser suite |

### What changed in the open limitations

- Limitation 4 of Phase 5 is closed: child diagrams open from the page (levels). Workbench text is still English only.
- D-016 now also shows on the six-column fintech example on phones (5.1 to 5.2px before zooming), the same inherited behaviour as the other wide diagrams.

## Phase 5 record

The record below is unchanged from the Phase 5 commit.

### Verdict (Phase 5)

**Accepted with recorded limitations.** Every criterion in section 8 has objective evidence below. Four limitations are open and listed at the end; none is of critical or high severity.

### Objective results

#### Automated visual QA, full matrix

`node scripts/visual-qa.mjs --shots` ([automated-report.json](automated-report.json))

| | |
|---|---|
| States exercised | 384: six documents, six viewports, two themes |
| Critical defects | 0 |
| High defects | 0 |
| Medium defects | 10 distinct, all one inherited limitation: diagram labels under 6px at 768px and 390px wide before zooming (D-016) |
| Runtime errors, uncaught rejections, `console.error` | 0 in 384 states |
| Screenshots written | 72, in [archi-made-easy-after/](archi-made-easy-after/) |

Notes the run records as by design, not as defects:

- On a phone or tablet, the open sheet covers the canvas tools and legend until it is closed (one tap on the mode).
- The inherited Focus view dims unrelated components below 3:1 contrast on purpose.
- With the inspector docked on a wide diagram, the smallest secondary labels render between 6.0 and 7.4px (D-017).

#### Workbench browser test

`node --test test/workbench-browser.test.mjs`: **13 of 13 subtests pass.** Real pointer and keyboard input; every figure and list on the page compared with the command-line engine for the same inputs.

#### Inherited gates

| Gate | Result |
|---|---|
| Inherited browser layout gate (`visual-check`), unchanged from the inherited product | Passes on the authored architecture with the workbench on, on an inherited architecture with it off, and on a workflow page: every viewport contained, no horizontal overflow, canvas-tool clearance and text readability hold |
| Nine render checks (`validate --quality showcase`) on the demonstration architecture | 9 of 9, no error diagnostics; the review block reports a score of 82 with 5 findings |
| Full unit and integration suite | See "Regression" below |
| Serial browser suite | See "Regression" below |

#### Regression

All three runs below were made on the same final tree (git tree `093ac83`), one after another with nothing else running.

| Suite | Result | Against the baseline |
|---|---|---|
| Full unit and integration suite (`npm run test:full`) | 3,554 tests: 3,312 pass, 43 fail, 198 skipped, 1 todo | The 43 failures are exactly the Phase 0 baseline set (Windows-only causes: symlink permission, path separators, `git init --template=`, 8.3 names). **No new failure, none removed.** |
| Serial browser suite (`npm run test:browser -- --concurrency=1`) | 312 tests: **305 pass, 0 fail**, 7 skipped | Phase 0: 297 tests, 289 pass. The 15 additional tests are the workbench and visual QA tests. |
| Automated visual QA, full matrix | 384 states: 0 critical, 0 high | as above |

Two things about how these were run, so the numbers can be trusted:

- **The unit suite was run in a checkout of the same tree outside OneDrive.** Inside the OneDrive workspace, four packaging tests fail intermittently with "tracked package path changed while being read": OneDrive touches file metadata while the packager reads it. The same tests pass outside OneDrive. The tree hash of the checkout was verified equal to the workspace's before the run.
- **An earlier full run was discarded.** It overlapped with a run that had been stopped but whose child processes continued; the contention produced teardown failures ("Chrome did not exit"). Every file that failed there passed when rerun alone, and the complete suites were then rerun without overlap. Only the non-overlapping runs are reported here.

One inherited test expectation was changed for the redesign: the page background colours asserted for fixed-theme SVG exports (D-024). No other inherited test was edited to make it pass. The new tests' own additions to inherited test files are limited to registering the new template fragments and browser tests.

The earlier concern recorded as D-018 (a sequence-fitting test failing on the pre-redesign snapshot) does not occur on the final tree: that test passes.

#### Criteria of section 8

| Criterion | Evidence | Met |
|---|---|---|
| Independent Archi-Made-Easy identity | Product mark, title strip, neutral palette with one accent, component cards with a category bar, squared controls, mono data typography. Of the 14 light-theme colour tokens read from the upstream page, none has the same value here ([upstream values](upstream-baseline/observations.json), [design system](DESIGN-SYSTEM.md)). | Yes |
| Differentiated in layout, information architecture and interaction | With the workbench on: a frame of mode rail, inspector and vitals bar that upstream has no counterpart for; nine task modes; a run-based simulation flow; findings linked to the diagram. With the workbench off the page keeps the inherited geometry by decision (see limitations). | Yes, with that limitation |
| Canvas readable during workbench interactions | No region covers the canvas, its legend or its tools on docked layouts (checks 2 and 3, 0 defects). Label size floor 6px holds on desktop sizes (check 10, 0 defects). | Yes |
| No critical toolbar, legend or inspector collisions | Checks `region-overlap`, `canvas-covered`, `toolbar-legend-collision`: 0 defects in 384 states | Yes |
| Every workbench mode tested in the browser | Nine modes each have a state in the matrix and assertions in the browser test | Yes |
| Failure simulation visually understandable | Nothing fails before Run; text badges and dashed outlines as well as colour; propagation played outward; impact list in order; before and after table; recovery view. Asserted in the browser test. | Yes |
| Modelled metrics labelled as estimates | `MODELLED` tag on the vitals bar, inspector header and every preview; authored and assumed inputs tagged; "not measured" stated; a changed condition is named and the healthy value shown. Check `unlabelled-model`: 0 defects. | Yes |
| Desktop and laptop pass visual QA | 1920 x 1080, 1440 x 900, 1366 x 768, 1280 x 800: 0 critical, 0 high, 0 medium | Yes |
| Narrow viewports usable | 768 x 1024 and 390 x 844: no horizontal overflow, every tool on screen, every mode reachable from the tab bar. Label size before zooming is the open limitation D-016. | Yes, with that limitation |
| Light and dark consistent | Every state run in both; contrast check 0 defects in both | Yes |
| Console errors investigated | 0 errors in 384 states. The one message seen during baseline capture was the local file server's missing favicon. | Yes |
| Inherited diagram functionality intact | See "Regression": the inherited browser suite passes; one expectation changed (D-024, a palette value) | Yes |
| Exported artifacts clean | An SVG exported during a simulation, with a finding selected, or while marking, is byte-identical to a pristine export (browser test, three states) | Yes |
| Screenshots document the final implementation | 72 screenshots written by the same run that produced the report | Yes |

#### What was demonstrated on a complete architecture

The demonstration document is the highly available web application on AWS: ten components, nine connections, one region boundary, with authored load, capacity, latency, cost, an exposure flag, a request trace and an alternative. On it, in the browser:

1. Initial page: workbench on, inspector closed. [light](archi-made-easy-after/web-ha-1440x900-light-initial.png), [dark](archi-made-easy-after/web-ha-1440x900-dark-initial.png)
2. Explore a component. [screenshot](archi-made-easy-after/web-ha-1440x900-light-explore-component.png)
3. Review: a finding selected, its component spotlit, its fix previewed. [screenshot](archi-made-easy-after/web-ha-1440x900-light-review-finding.png)
4. Simulate: scenario set up, nothing failing yet. [screenshot](archi-made-easy-after/web-ha-1440x900-light-simulate-setup.png)
5. Simulate: run; five of ten components affected; the vitals bar names the condition and shows each healthy value. [light](archi-made-easy-after/web-ha-1440x900-light-simulate-ran.png), [dark](archi-made-easy-after/web-ha-1440x900-dark-simulate-ran.png)
6. A recovery option shown on the diagram, with the vitals bar following it. [screenshot](archi-made-easy-after/web-ha-1440x900-light-simulate-recovery.png)
7. Security, Performance at ten times load, FinOps, Optimize, Decide. [security](archi-made-easy-after/web-ha-1440x900-light-security.png), [performance](archi-made-easy-after/web-ha-1440x900-light-performance-10x.png), [finops](archi-made-easy-after/web-ha-1440x900-light-finops.png), [optimize](archi-made-easy-after/web-ha-1440x900-light-optimize-change.png), [decide](archi-made-easy-after/web-ha-1440x900-light-decide-trace.png)
8. The same on a phone. [initial](archi-made-easy-after/web-ha-390x844-light-initial.png), [simulation](archi-made-easy-after/web-ha-390x844-light-simulate-ran.png)

### Subjective assessment

This part is one reviewer's reading of the screenshots (the agent that built the interface), not a measurement. It needs the owner's eye.

- **Workbench on.** It reads as a tool, not a document: the rail, inspector and vitals bar make a recognisable frame, and the neutral greys let the category colours and the failure states carry the picture. It does not resemble the upstream page.
- **Workbench off.** It is recognisably the inherited page composition in new colours, with a title strip and a mark. This is the weakest point against "not a reskinned fork", and it is a deliberate trade (see the first limitation).
- **Simulation.** The run step, the outward propagation and the healthy values beside the failing ones answer the question that the first version raised ("is 0% a bug?").
- **Density.** The inspector is dense at 360px. Tables were cut to three or four columns to fit; long finding text wraps to many lines.
- **Typography.** The mono data type gives the figures a consistent voice. Titles and prose use the platform's own font, which is the same family upstream's stack resolves to on Windows. A bundled typeface would differentiate further and was not added (see the design system).
- **Icons.** The nine mode icons and the mark are original line drawings. Components on the canvas keep the inherited category glyphs; provider service icons were not added (their licences restrict redistribution, and none are bundled).

### Open limitations

| | Limitation | Why it is open |
|---|---|---|
| 1 | With the workbench off, the page keeps the inherited geometry under new paint. | A first frame that replaced the header broke eleven inherited layout tests (D-023). Keeping the geometry preserves every inherited guarantee. Architectures produced by this skill carry operational data and open with the frame on. If the owner prefers the frame always on, those tests have to be re-derived for the new page budget. |
| 2 | Diagram labels render under 6px on phones and tablets until the reader zooms (D-016). | Inherited behaviour, same as upstream; zoom and pan work. |
| 3 | The three non-default style presets keep their inherited canvas treatments (D-022), and the print stylesheet keeps the inherited print palette (D-021). | Out of scope for this phase by decision; recorded. |
| 4 | Workbench text is English only; child diagrams (C4 drill-down) cannot be opened from the page. | Recorded in the skill's references as not available; drill-down is scheduled with the C4 flagship example in Phase 6. |

### How to repeat this record

```sh
node scripts/visual-qa.mjs --shots          # matrix, report, screenshots
node --test test/workbench-browser.test.mjs # interaction and engine agreement
npm run test:full                           # unit and integration
npm run test:browser -- --concurrency=1     # inherited browser suite, serial
```
