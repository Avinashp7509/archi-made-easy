# Visual differentiation audit

Compares the upstream viewer (tt-a1i/archify at commit `11b0d60`) with Archi-Made-Easy as it stood before the redesign (git ref `refs/backup/phase5-functional`), and sets the redesign target for each element. The target design is in [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md).

## Verdict

**Before the redesign, Archi-Made-Easy was the upstream interface with one button and one dock added.** Measured on the same document at the same viewports:

- every colour token read from the page is identical to upstream;
- title, body and node-label fonts are identical;
- header, canvas, legend, notes and index occupy the same rectangles to the pixel;
- the only differences are a Workbench button in the toolbar and a dock at the bottom.

Evidence: [upstream-baseline/observations.json](upstream-baseline/observations.json) and [archi-made-easy-before/observations.json](archi-made-easy-before/observations.json). Compare [upstream](upstream-baseline/web-ha-1440x900-light-initial.png) with [before](archi-made-easy-before/web-ha-1440x900-light-initial.png).

## How the evidence was gathered

| Kind | Meaning in this document |
|---|---|
| **Observed** | Seen in the running page through Playwright: a screenshot in this folder, or a value read from the live DOM. |
| **Source** | Read in the repository source or documentation, not exercised in the browser for this audit. |

- Upstream pages were rendered by the upstream renderer from an isolated checkout at `11b0d60`, into a scratch folder outside that checkout. The checkout was not modified (`git status` clean before and after).
- Both products rendered the same 10-component document (`web-ha`), plus the bundled web-app, workflow and sequence examples.
- Capture script: [tools/capture-baseline.playwright.js](tools/capture-baseline.playwright.js). 74 screenshots: six viewports in both themes, ten interaction states, and the pre-redesign workbench states.
- One console message was recorded during capture: a 404 for `favicon.ico` from the local file server. It is not produced by either product.

## Element by element

Priority: **P0** blocks Phase 5 acceptance; **P1** required for Phase 5; **P2** improvement that may follow.

### 1. Page composition

| | |
|---|---|
| Upstream (observed) | A scrolling document. Title top left, floating control pill top right, one large rounded card holding the diagram, then note cards and a node index. At 1440 x 900 the page is 1280px tall, so notes start below the first screen. [Screenshot](upstream-baseline/web-ha-1440x900-light-initial.png), [lower part](upstream-baseline/web-ha-1440x900-light-notes-and-index.png). |
| Before (observed) | The same document with a dock pinned to the viewport floor. [Screenshot](archi-made-easy-before/web-ha-1440x900-light-workbench-open.png). |
| Similarity and weakness | Identical composition. The dock covers the legend and the bottom of the diagram (dock top 721px; legend 676 to 727px) until the reader scrolls. The analysis tools are an afterthought at the edge of a document. |
| Redesign | An application frame when the workbench is on: mode rail on the left, inspector on the right, vitals bar along the bottom, all fixed to the window. They take space from the page margins, so the diagram refits and is never covered. With the workbench off the page keeps the inherited geometry (see the design system for why) under new paint. |
| Expected improvement | The whole diagram and the analysis are visible together on one screen. No scrolling between cause (diagram) and effect (figures). |
| Priority | P0 |
| Acceptance | With the workbench on at 1280 x 800 and wider, no panel overlaps the diagram, its legend or the canvas tools (automated geometry check). With it off, every inherited layout test passes unchanged. |

### 2. Header and toolbar

| | |
|---|---|
| Upstream (observed) | A pulsing dot and a 24px title in the page flow. A floating group at top right: theme switch, style menu, motion, present, and a filled Export pill. |
| Before (observed) | The same, with a "Workbench" button added; the toolbar grew from 364px to 469px. |
| Similarity and weakness | Identical. No product identity anywhere on the page. On a narrow page the title and the floating toolbar compete for the same row. |
| Redesign | A title strip painted to the window edges, with the product mark before the title and squared tools at its right end, including the Workbench toggle. The header and toolbar keep their inherited boxes; only their paint changes. Search stays with the canvas tools, next to zoom, where it acts. |
| Expected improvement | The product is recognisable; the workbench has one explicit switch; inherited title and toolbar clearance guarantees still hold. |
| Priority | P0 |
| Acceptance | The mark and strip are painted on every page; every tool is on screen at every tested width (automated); the inherited header-clearance tests pass unchanged. |

### 3. Canvas surface

| | |
|---|---|
| Upstream (observed) | White (light) or navy (dark) card, 16px radius, soft shadow, dotted grid. |
| Before (observed) | Identical. |
| Similarity and weakness | Identical. The large radius and shadow make the diagram a picture in a page, not a work surface. |
| Redesign | A flat surface with a hairline border and 10px radius that fills the frame. Neutral grey palette instead of slate blue. A quiet cross-mark grid. |
| Expected improvement | More of the screen goes to the diagram; less decoration around it. |
| Priority | P1 |
| Acceptance | Canvas area at 1440 x 900 with the workbench off is at least as large as upstream's. Surface and grid colours differ from upstream's tokens. |

### 4. Components (nodes)

| | |
|---|---|
| Upstream (observed) | Rounded rectangle, category-tinted fill, 1.25 to 1.5px category-coloured outline, small category glyph top left, mono label and sublabel. |
| Before (observed) | Identical. |
| Similarity and weakness | Identical, and the strongest visual signature of upstream. Tinted fills lower the contrast of the sublabel on some categories. |
| Redesign | A component card: neutral surface and outline, with the category shown by an accent bar on the left edge and the glyph. Category colours are a new set (see the design system). |
| Expected improvement | Labels sit on a neutral surface with higher contrast; category is still readable at a glance; state overlays (failing, degraded) stand out because the resting card is quiet. |
| Priority | P1 |
| Acceptance | Node fill and outline differ from upstream; sublabel contrast is at least 4.5:1 in both themes (automated); all inherited geometry checks still pass. |

### 5. Connections

| | |
|---|---|
| Upstream (observed) | Grey orthogonal lines with arrowheads; emphasised path in green; dashed violet for asynchronous; label chips on the line. |
| Before (observed) | Identical. |
| Similarity and weakness | Identical. Functional and readable; routing itself is good and is kept. |
| Redesign | Keep routing. New line and emphasis colours from the design system. Under simulation, the failing path is drawn in the critical colour with a dash pattern, and fallback routes in the ok colour. |
| Expected improvement | Failure propagation is legible along the lines, not only on the nodes. |
| Priority | P1 |
| Acceptance | During a simulated failure every connection into a failing component is marked; a connection's state is also given in the inspector's impact list (not colour only). |

### 6. Component inspection

| | |
|---|---|
| Upstream (observed) | Clicking a component opens a floating "Semantic Passport" over the canvas with its neighbours and reach counts. [Screenshot](upstream-baseline/web-ha-1440x900-dark-focus-node-inspector.png). |
| Before (observed) | The same passport. Operational properties were in a separate "Component" tab of the bottom dock, closed by default. |
| Similarity and weakness | Identical primary interaction. The passport covers part of the diagram it describes. Operational data was two clicks away and out of sight. |
| Redesign | The inspector's Explore mode: properties with their basis (authored or assumed), callers and dependencies, and reach actions. While the inspector is open the floating passport is not shown, so nothing covers the canvas. |
| Expected improvement | One place for everything about a component; the diagram stays clear. |
| Priority | P0 |
| Acceptance | Selecting a component with the workbench on fills the inspector and leaves the canvas uncovered; with the workbench off the inherited passport still works (inherited tests pass). |

### 7. Mode switching

| | |
|---|---|
| Upstream | None: there are no analysis modes. |
| Before (observed) | Five small text buttons at the top left of the dock: Explore, Chaos, Traffic, Security, FinOps. [Screenshot](archi-made-easy-before/web-ha-1440x900-light-workbench-open.png). |
| Weakness | Easy to miss; the dock must already be open; "Chaos" and "Traffic" are engine words, not user tasks; no Review or Optimize mode. |
| Redesign | A labelled rail on the left: Explore, Review, Simulate, Security, Performance, FinOps, Optimize, Decide, Handoff. Always visible on architecture pages; choosing a mode turns the workbench on. |
| Expected improvement | The product's capabilities are discoverable at a glance; one click from a closed workbench to any analysis. |
| Priority | P0 |
| Acceptance | Each mode is reachable by pointer and keyboard, changes the canvas overlay and inspector, and is exercised in the browser test. |

### 8. Failure simulation

| | |
|---|---|
| Upstream | None. |
| Before (observed) | Click a component to cycle fault states; a scenario drop-down; results in an "Impact" tab. [Screenshot](archi-made-easy-before/web-ha-1440x900-light-workbench-impact.png). |
| Weakness | No explicit run step, so a first-time reader sees a diagram full of "FAILING" badges and "0%" without having asked for it. No before-and-after. No recovery guidance. Propagation appears all at once. |
| Redesign | Simulate mode: choose a scenario card or mark components, press Run, watch the failure travel outward step by step, read the impact with baseline and change side by side, then try recovery options and see the figures after each. |
| Expected improvement | The reader always knows a result belongs to a scenario they ran, what changed, and what would fix it. |
| Priority | P0 |
| Acceptance | No fault state is on the canvas until Run is pressed (or a fault is injected by the reader); every figure under a scenario shows its baseline; at least one recovery option is offered for a single-instance failure and its preview equals the engine's result for the patched design. |

### 9. Key figures and their meaning

| | |
|---|---|
| Upstream | None. |
| Before (observed) | Six tiles in the dock and one small line of text: "Analytical model of the declared design, not a measurement". |
| Weakness | With a database marked down the first tile read "Composite availability 0%" with no reference to the fault or the healthy value. The owner reasonably asked whether that was a defect. The "model, not measurement" note was 11px grey text at the far right. |
| Finding | The 0% was the intended result of an injected fault (single-instance database down, blocking callers, no fallback), not an engine defect. The defect is in presentation. Recorded as D-001 in the [defect register](DEFECT-REGISTER.md). |
| Redesign | A vitals bar led by a `MODELLED` tag and the count of authored and assumed inputs. Under a scenario the bar names the condition and each changed figure reads, for example, "Answered now 0%, healthy: 99.85%". Assumed inputs are tagged where they are shown. |
| Expected improvement | A figure cannot be mistaken for a measurement or for the healthy state. |
| Priority | P0 |
| Acceptance | Every figure carries a visible basis tag; under any fault the availability figure names the condition and shows the baseline (browser test asserts the text). |

### 10. Findings

| | |
|---|---|
| Upstream | None. |
| Before (observed) | A flat list in the "Review" tab: severity, title, evidence, fix. [Screenshot](archi-made-easy-before/web-ha-1440x900-light-workbench-review.png). |
| Weakness | Not connected to the diagram: the reader has to find the named component by eye. No consequence stated. No way to see what a fix would achieve. |
| Redesign | Review mode: selecting a finding spotlights the affected components and connections and expands to problem, evidence, consequence and recommended change. Where the change can be expressed as a model edit, "Preview this change" shows the figures after it. Optimize mode ranks those changes. |
| Expected improvement | From "there is a problem" to "this component, for this reason, and this is what fixing it buys" in one click. |
| Priority | P0 |
| Acceptance | Selecting a finding marks exactly its affected components and connections on the canvas (browser test compares with the engine's list); each finding shows the four parts. |

### 11. Canvas tools (route, lens, find, guide, zoom)

| | |
|---|---|
| Upstream (observed) | A floating pill at the bottom right of the canvas with text and icon buttons. [Search](upstream-baseline/web-ha-1440x900-dark-search.png), [lens](upstream-baseline/web-ha-1440x900-dark-lens.png), [route](upstream-baseline/web-ha-1440x900-dark-route.png). |
| Before (observed) | Identical; the dock pushed it upward. |
| Similarity and weakness | Identical. The tools themselves are good and are kept. |
| Redesign | Same tools and behaviour, drawn in the new system (squared, hairline). |
| Priority | P1 |
| Acceptance | All inherited canvas-tool tests pass unchanged; the dock never overlaps the legend (inherited gate). |

### 12. Notes and component index

| | |
|---|---|
| Upstream (observed) | A row of rounded cards and an index panel under the diagram. |
| Before (observed) | Identical. |
| Redesign | Kept in the page flow under the canvas, restyled as flat panels in the new system. |
| Priority | P2 |
| Acceptance | Present and readable in both themes; no horizontal overflow at 390px. |

### 13. Themes

| | |
|---|---|
| Upstream (observed) | Light: cool grey page, white card. Dark: navy page and card. [Light](upstream-baseline/web-ha-1440x900-light-initial.png), [dark](upstream-baseline/web-ha-1440x900-dark-initial.png). |
| Before (observed) | Identical values. |
| Redesign | Neutral graphite greys in both themes, one accent, new category hues. |
| Priority | P1 |
| Acceptance | No interface colour token equals upstream's; AA contrast holds in both themes (automated). |

### 14. Narrow screens

| | |
|---|---|
| Upstream (observed) | Toolbar on its own row; the diagram scrolls sideways inside its card; notes stack. [Screenshot](upstream-baseline/web-ha-390x844-light-initial.png). |
| Before (observed) | The same, with the dock covering the lower third including the canvas tools. [Screenshot](archi-made-easy-before/web-ha-390x844-light-workbench-impact.png). |
| Weakness | The dock hid the canvas tools on a phone. |
| Redesign | With the workbench on: modes as a tab bar along the bottom, the vitals bar above it, and the inspector as a sheet that opens on demand. The toolbar keeps every tool on screen. |
| Priority | P1 |
| Acceptance | At 390 x 844 and 768 x 1024: no horizontal page overflow, canvas tools reachable with the sheet closed, every mode reachable. |

### 15. Other diagram types

| | |
|---|---|
| Upstream (observed) | The same shell for all ten types. [Workflow](upstream-baseline/workflow-1440x900-light-initial.png), [sequence](upstream-baseline/sequence-1440x900-light-initial.png). |
| Before (observed) | Identical; pages grew by about 170KB because the workbench script was inlined in every type although only architecture uses it. Recorded as D-002. |
| Redesign | All types get the title strip, mark, palette and squared controls. Only architecture pages get the rail, vitals bar and inspector. The workbench script is left out of pages that cannot use it. |
| Priority | P1 |
| Acceptance | Inherited browser tests for every type pass; a non-architecture page is no larger than before the workbench by more than the new shell's own size. |

## Elements that looked like a lightly modified upstream

Everything in rows 1 to 6 and 11 to 15. The pre-redesign product added function (rows 7 to 10) without changing the surrounding product.

## What is not changed, and why

- **Diagram geometry and routing.** They are the inherited product's strength and are covered by nine render checks and a browser gate.
- **JetBrains Mono for diagram labels.** Label fitting is computed from this font's metrics; changing it would break layout.
- **The canvas tools' behaviour.** They work and are tested; they are restyled only.
