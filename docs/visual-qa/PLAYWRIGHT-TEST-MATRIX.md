# Browser QA matrix

How the interface is tested in a real browser, what each run covers, and how to repeat it. The requirement is in [PHASE5-UX-ADDENDUM.md](../program/PHASE5-UX-ADDENDUM.md), sections 4 to 7. Results are in [FINAL-VISUAL-ACCEPTANCE.md](FINAL-VISUAL-ACCEPTANCE.md); defects in [DEFECT-REGISTER.md](DEFECT-REGISTER.md).

## Three layers

| Layer | What it is | When it runs | Command |
|---|---|---|---|
| 1. Automated visual QA | `scripts/visual-qa.mjs`: renders six documents, drives every workbench state at six viewports in both themes, and runs in-page defect checks in each state. Optional screenshots and pixel comparison. | On demand, and before accepting interface work | `node scripts/visual-qa.mjs --shots` |
| 2. Workbench browser test | `test/workbench-browser.test.mjs`: 13 subtests with real pointer and keyboard input; compares the page with the command-line engine value for value. | In the browser suite (`npm run test:browser`) | `node --test test/workbench-browser.test.mjs` |
| 3. Playwright MCP inspection | Interactive: open the rendered page, click through it, take screenshots, look at them, fix, repeat. Used throughout the redesign and for the upstream baseline capture. | While working on the interface | `docs/visual-qa/tools/` |

Layers 1 and 2 drive Chrome through the repository's own zero-dependency browser harness (the one the inherited layout gate uses), so they run anywhere the test suite runs. Layer 3 needs the Playwright MCP server.

All three need Chrome, Chromium or Edge. Set `ARCHI_MADE_EASY_CHROME` to its path if it is not found.

## Viewports and themes

| Viewport | Size | Layout expected |
|---|---|---|
| Full HD desktop | 1920 x 1080 | rail left, inspector docked (400px), vitals bar along the bottom, canvas refits |
| Standard laptop | 1440 x 900 | rail left, inspector docked (360px), vitals bar along the bottom, canvas refits |
| Compact laptop | 1366 x 768 | same |
| Smaller desktop | 1280 x 800 | same |
| Tablet | 768 x 1024 | modes as a tab bar along the bottom, vitals bar above it, inspector as a sheet |
| Mobile | 390 x 844 | same; the toolbar keeps every tool on screen |

Every state runs in the light and the dark theme. Layer 1 emulates reduced motion so that screenshots are repeatable; the step-by-step propagation playback is tested with motion on in layer 2.

## Documents

| Name | What | Why |
|---|---|---|
| `web-ha` | Highly available web application on AWS with authored load, capacity, latency, cost, exposure, a trace and an alternative. 10 components. | The complete architecture every workflow is demonstrated on |
| `long-labels` | The same with a 107-character title, a long subtitle and component labels at the longest the renderer accepts | Edge case: long text |
| `dense` | Microservices pattern on Azure | Edge case: more components and connections |
| `web-app` | The inherited example, no operational data | An inherited architecture: workbench off by default |
| `fintech` | Flagship: global fintech payment mesh, two active regions, 12 components on six columns | A wide diagram; a region can be lost and the mesh keeps answering |
| `ai-platform` | Flagship: enterprise agentic AI platform, 11 components, a fallback model provider | A design with one review finding to act on; a provider brownout |
| `ecommerce-c4` | Flagship: cloud-native e-commerce at C4 container level, 9 components, three child diagrams | Levels; a single region that can be lost |
| `c4-catalog-service`, `c4-checkout-service`, `c4-fulfilment-service` | The three child diagrams of `ecommerce-c4`, each as the page of its own that a level opens | A child page meets the same checks as any page |
| `workflow`, `sequence` | Inherited examples of other diagram types | Compatibility: new paint only, no workbench |

The renderer refuses a component label that would overflow its box (`architecture/component-label-overflow`), so a cut-off component label cannot reach the browser. That guard is inherited and unchanged.

## Workflows

Letters follow the addendum. "Auto" is layer 1 (state id in `scripts/visual-qa.mjs`), "Test" is layer 2 (subtest in `test/workbench-browser.test.mjs`), "MCP" is layer 3.

| | Workflow | Auto | Test | MCP |
|---|---|---|---|---|
| A | Generation and initial rendering | `initial` on every document | "an authored architecture starts with the workbench on…" | baseline capture, redesign loop |
| B | Diagram readability and placement | checks 4, 8, 10 (clipped components, contrast, label size) in every state | inherited gate subtest | screenshots reviewed |
| C | Navigation, pan, zoom, search | `inherited-search`, `inherited-zoom` | inherited browser tests (finder, camera, radar) | baseline capture states `search`, `zoom-in` |
| D | Component inspection and dependency highlighting | `explore-component`, `inherited-focus` | "Explore: selecting a component…" | yes |
| E | Mode switching | every mode state; `inspector-collapsed` | first, third and eighth subtests | yes |
| F | Failure simulation | `simulate-setup`, `simulate-ran`, `simulate-recovery` | two "Simulate" subtests | yes |
| G | Traffic and performance | `performance-10x` | "Security, Performance, FinOps…" | yes |
| H | Security | `security` | same | yes |
| I | FinOps | `finops` | same | yes |
| J | Review and remediation | `review-finding`, `optimize-change` | "Review and Optimize…" | yes |
| K | Decisions and alternatives | `decide-trace` | "Security, Performance, FinOps, Decide and Handoff…" | yes |
| L | C4 drill-down (levels) | `levels-explore`, `level-open`, `level-closed` on `ecommerce-c4`; `initial`, `review-clean`, `simulate-store-outage`, `performance-10x` on each child page | "levels: a component opens into its own diagram…" (button, double click, canvas marker, Escape, Back, phone, dark theme); `test/workbench-levels.test.mjs` | opened and inspected at desktop and phone width |
| M | Diagram and report export | `export-menu`, `handoff` | "an export taken during a simulation…", handoff downloads | baseline capture state `export-menu` |
| N | Light and dark themes | every state in both | | both captured |
| O | Responsive layouts | every state at six viewports | "narrow screens…" | 390 and 768 captured |
| P | Keyboard and focus | `keyboard-rail` | "keyboard: rail buttons are reachable…", marking by Enter | |
| Q | Long labels, dense architectures | `long-labels`, `dense` documents | | yes |
| R | Console and runtime errors | error trap in every state | error list asserted empty in every subtest | console read during capture |
| S | Reset and rerun | `simulate-reset`, `workbench-off` | Reset in the Simulate subtest; off in the first subtest | yes |
| T | Inherited diagram types | `workflow`, `sequence`, `web-app` | "narrow screens… other diagram types have no workbench"; the inherited browser suite | captured |

## Automated defect checks (layer 1)

Run in the page in every state. Severity is what the check reports when it fires.

| # | Check | Detects | Severity |
|---|---|---|---|
| 1 | `horizontal-overflow` | page wider than the viewport, and the scrollbar that comes with it | high |
| 2 | `region-overlap`, `canvas-covered` | rail, vitals bar or docked inspector overlapping each other, or covering canvas that cannot be scrolled clear | high, critical |
| 3 | `toolbar-legend-collision` | canvas tools or legend under a region, or on each other at rest | high |
| 4 | `clipped-component` | a component outside the diagram's bounds | high |
| 5 | `off-screen-control`, `small-target`, `unnamed-control` | controls outside the viewport, smaller than 24 x 24px, or without a name | high, medium, high |
| 6 | `cut-off-label` | clipped text in buttons, cards and rail labels; a cut-off figure | medium, high |
| 7 | `unintended-scrollbar` | sideways scrolling inside a region that should not scroll | medium |
| 8 | `low-contrast` | text below WCAG AA (4.5:1, or 3:1 for large text and for intentionally dimmed diagram text), computed from the rendered colours including opacity | high |
| 9 | `tiny-text` | interface text set below 9px | medium |
| 10 | `unreadable-label`, `small-label` | diagram labels rendered below 6px (below 7.5px is a note) | high on desktop, medium on a phone |
| 11 | `overlay-obscures-label` | a simulation badge covering more than a fifth of a component name | high |
| 12 | `missing-icon`, `broken-image` | an icon with no image; an image that failed to load | high |
| 13 | `inconsistent-spacing` | canvas margin from the regions under 8px | medium |
| 14 | `stale-ui`, `unlabelled-model` | workbench marks or regions left behind; figures not labelled as modelled; a changed condition not named | high, critical |
| | `runtime-error` | any uncaught error, rejected promise or `console.error` | critical |
| | state expectations | per state: the right components failing, the right ones spotlit, recovery shown, mode content present, focus returned | high or critical |
| | `visual-regression` (`--compare`) | more than 1% of pixels differing from the committed screenshot | high |

Notes (not defects) record behaviour that is by design: the sheet covering the canvas tools while it is open on a narrow screen, and the inherited Focus view dimming unrelated components.

Export cleanliness (no workbench overlay in an exported SVG) is checked in layer 2, where the exported file is compared byte for byte with a pristine export.

## Running it

```sh
# every check, six viewports, both themes; writes docs/visual-qa/automated-report.json
node scripts/visual-qa.mjs

# also write the screenshots in docs/visual-qa/archi-made-easy-after/
node scripts/visual-qa.mjs --shots

# compare against the committed screenshots (same machine and browser as they were taken on)
node scripts/visual-qa.mjs --compare

# two viewports, one theme: a fast check while working
node scripts/visual-qa.mjs --quick
```

Exit code 1 means at least one critical or high defect.

Pixel comparison is a regression aid for one machine. Font rendering differs between systems, so `--compare` is not part of the test suite; the geometry, contrast and state checks are the portable gate.

## The loop used during the redesign

1. Render the documents and open them through Playwright MCP.
2. Screenshot, look, and list what is wrong.
3. Record anything of medium severity or above in the defect register.
4. Fix, regenerate the template, re-render.
5. Repeat the same interactions and screenshot again.
6. Run `node scripts/visual-qa.mjs --quick`, then the workbench browser test.
7. When both are clean, run the full matrix and the inherited suites.
