# Phase 5 addendum: original workbench UI and Playwright visual QA

Status: **mandatory, open.** Recorded 2026-11-10. These are the owner's requirements, kept verbatim. They extend [PLAN.md](PLAN.md) and the Phase 5 section of [CHECKLIST.md](CHECKLIST.md); they replace nothing. Phase 5 is not complete, and is not committed as complete, until the acceptance conditions in Part B section 8 pass with evidence in [docs/visual-qa/](../visual-qa/).

Working documents this addendum requires:

- [docs/visual-qa/VISUAL-DIFFERENTIATION-AUDIT.md](../visual-qa/VISUAL-DIFFERENTIATION-AUDIT.md)
- [docs/visual-qa/PLAYWRIGHT-TEST-MATRIX.md](../visual-qa/PLAYWRIGHT-TEST-MATRIX.md)
- [docs/visual-qa/DEFECT-REGISTER.md](../visual-qa/DEFECT-REGISTER.md)
- [docs/visual-qa/FINAL-VISUAL-ACCEPTANCE.md](../visual-qa/FINAL-VISUAL-ACCEPTANCE.md)
- Screenshot sets: `docs/visual-qa/upstream-baseline/`, `docs/visual-qa/archi-made-easy-before/`, `docs/visual-qa/archi-made-easy-after/`

The design decisions made in response are recorded in [docs/visual-qa/DESIGN-SYSTEM.md](../visual-qa/DESIGN-SYSTEM.md).

---

## Part A. Redesign requirement (verbatim)

The Phase 3 output is functionally promising, but I am not satisfied with the visual identity. The interface still looks substantially like the upstream Archify UI.

I approve continuing the engineering implementation, but I am adding a mandatory Phase 5 requirement:

**Archi-Made-Easy must have a genuinely original, premium, world-class Architecture Workbench UI/UX.**

Preserve the working rendering, validation, simulation and review engines, but substantially redesign the user-facing experience.

Requirements:

1. Create an independent Archi-Made-Easy design system with original visual identity, typography, navigation, component styling, icons, interaction patterns and responsive layouts.

2. Make the architecture canvas the hero of the experience. Prioritize diagram readability, intelligent layout, professional cloud icons, accessible colors and clear dependency relationships.

3. Build a dedicated architecture engineering workbench with integrated Explore, Review, Simulate, Security, Performance, FinOps and Optimization experiences.

4. Implement a professional simulation experience: select a failure scenario, run the model, visualize dependency propagation, inspect the impact, compare before/after states and explore recovery options.

5. Make architecture findings actionable. Clicking a risk should highlight the affected components and explain the problem, evidence, consequences and recommended changes.

6. Clearly distinguish actual measurements from modeled predictions and assumed values. Investigate the displayed 0% availability and failing components to confirm whether they represent an intentional scenario or a defect.

7. The final interface must feel like an independent architecture engineering product, not a reskinned fork.

8. Do not sacrifice upstream diagram capabilities, technical correctness, browser compatibility, accessibility or performance.

9. Before finalizing Phase 5, generate screenshots of the redesigned interface, run visual regression tests and demonstrate the interactive workbench with at least one complete architecture.

10. Keep the product portable as an installable Agent Skill that can generate standalone interactive HTML artifacts without requiring a hosted backend.

Use the current UI only as a functional baseline, not as the target design.

Continue the approved implementation phases, incorporating this redesign into Phase 5. Do not claim completion until the visual and functional acceptance criteria pass.

---

## Part B. Playwright MCP visual QA and original UI redesign (verbatim)

# MANDATORY PHASE 5 ADDENDUM — PLAYWRIGHT MCP VISUAL QA & ORIGINAL UI REDESIGN

This instruction extends the previously approved Archi-Made-Easy UX Vision and Phase 5 acceptance requirements. Do not replace or discard any previous requirements.

You have access to Playwright MCP. Use it extensively to inspect, interact with, screenshot, test, critique, and iteratively improve the actual browser-rendered application.

**PRIMARY OBJECTIVE**

Transform Archi-Made-Easy into a visually distinctive, technically sophisticated, world-class Architecture Engineering Workbench.

The final interface must offer substantially better clarity, usability, interaction design, architecture exploration, failure simulation and engineering insight than the upstream Archify interface.

Do not claim originality merely because the branding, colors or CSS have changed.

### 1. CAPTURE THE UPSTREAM VISUAL BASELINE

Use the upstream GitHub repository:

https://github.com/tt-a1i/archify

Inspect the original viewer source, documentation, screenshots and representative architecture examples.

Where practical, render the upstream application at the audited baseline commit in an isolated environment.

Use Playwright MCP to capture actual upstream screenshots at consistent viewport sizes.

Record:
- Overall page composition
- Diagram canvas design
- Navigation and toolbar placement
- Component and connection styling
- Typography and color system
- Node inspector interactions
- Hover, focus and selection behavior
- Search, zoom and navigation
- Export interactions
- Responsive behavior
- Light and dark themes
- Visual hierarchy and information density

Save screenshots and baseline findings under:

`docs/visual-qa/upstream-baseline/`

Clearly distinguish directly observed behavior from conclusions drawn only from repository source or documentation.

Do not modify or contaminate the isolated upstream baseline.

### 2. CREATE A VISUAL DIFFERENTIATION AUDIT

Create:

`docs/visual-qa/VISUAL-DIFFERENTIATION-AUDIT.md`

Compare upstream Archify against the current Archi-Made-Easy implementation.

For every major visual and interaction element, document:

1. Upstream behavior and appearance
2. Current Archi-Made-Easy behavior and appearance
3. Similarities and UX weaknesses
4. Proposed redesign
5. Expected usability improvement
6. Implementation priority
7. Screenshot evidence
8. Acceptance criteria

Identify areas where the interface looks or behaves like a lightly modified version of upstream.

Prioritize meaningful independent product design—not arbitrary visual changes that reduce usability.

### 3. DESIGN A DISTINCTIVE ARCHI-MADE-EASY EXPERIENCE

Develop an original design system for Archi-Made-Easy.

The architecture canvas must remain the hero of the experience.

Design a professional engineering environment with:

- Distinctive global application header
- Contextual architecture navigation
- Spacious, legible architecture canvas
- High-quality cloud service iconography
- Clean component cards and boundaries
- Clear relationship and dependency routing
- Intuitive mode switching
- Context-sensitive properties inspector
- Accessible light and dark themes
- Consistent typography, spacing and motion
- Professional simulation controls
- Clear findings and recommendations
- Minimal unnecessary visual clutter

Explore alternative layout patterns such as a compact contextual rail, collapsible inspector, and dedicated scenario controls.

Do not automatically preserve the existing bottom dock merely because it has already been implemented.

Choose the layout that best supports real architecture workflows.

Preserve all tested functional capabilities while redesigning the user-facing experience.

### 4. USE PLAYWRIGHT MCP FOR EXHAUSTIVE VISUAL AND INTERACTION QA

Create a repeatable browser QA matrix.

Test the following experiences:

A. Architecture generation and initial rendering

B. Diagram readability and component placement

C. Architecture navigation, pan, zoom and search

D. Component inspection and dependency highlighting

E. Workbench mode switching

F. Failure and chaos simulation

G. Traffic and performance analysis

H. Security analysis

I. FinOps analysis

J. Architecture review and remediation

K. Architecture decisions and alternatives

L. C4 drill-down when implemented

M. Diagram and report export

N. Light/dark themes

O. Responsive layouts

P. Keyboard accessibility and focus management

Q. Long labels, dense architectures and edge cases

R. Browser console and runtime errors

S. Visual changes introduced by resetting and rerunning simulations

T. Compatibility with inherited diagram types

For each applicable workflow, exercise controls through Playwright MCP instead of relying solely on source-code inspection.

### 5. TEST MULTIPLE VIEWPORTS

At minimum, test:

- 1920 × 1080 — Full HD desktop
- 1440 × 900 — Standard laptop
- 1366 × 768 — Compact laptop
- 1280 × 800 — Smaller desktop
- 768 × 1024 — Tablet
- 390 × 844 — Mobile

Test both light and dark themes.

Use consistent viewport dimensions for upstream-versus-new comparisons.

Test both the initial page state and interaction states with inspectors, scenario controls and dialogs open.

Do not require every desktop feature to fit simultaneously on mobile. Implement thoughtful responsive behavior instead.

### 6. AUTOMATED VISUAL DEFECT DETECTION

Build a repeatable Playwright visual QA workflow that detects:

- Overlapping panels
- Clipped components
- Cut-off labels
- Horizontal overflow
- Unintended scrollbars
- Toolbar and legend collisions
- Off-screen controls
- Broken responsive layouts
- Invisible interaction targets
- Inconsistent spacing
- Low-contrast text
- Tiny unreadable labels
- Missing icons
- Broken image assets
- Stale UI after interaction
- Incorrect selection highlighting
- Simulation overlays that obscure essential content
- Export artifacts containing unwanted UI overlays
- Runtime errors and unhandled exceptions

Capture screenshot evidence for detected defects.

Use DOM geometry checks, screenshot comparisons, accessibility checks where available, and actual interaction tests.

Avoid treating screenshot similarity as the sole measure of usability.

### 7. REPEATABLE REDESIGN AND QA LOOP

Perform the following cycle:

1. Capture the current UI state.
2. Inspect it using Playwright MCP.
3. Identify specific visual and interaction problems.
4. Record severity and reproduction steps.
5. Implement targeted improvements.
6. Reload the actual browser application.
7. Re-execute the affected interactions.
8. Capture new screenshots.
9. Compare before and after.
10. Run focused functional and visual regression checks.

Repeat until all critical and high-severity visual defects are resolved.

Do not silently ignore failed tests or weaken inherited quality gates to make the release pass.

### 8. VISUAL ACCEPTANCE CRITERIA

Phase 5 must not be declared complete until:

- The user-facing interface has an independent Archi-Made-Easy identity.
- The product is meaningfully differentiated from upstream in layout, information architecture and interaction design.
- The architecture canvas remains readable during workbench interactions.
- No critical toolbar, legend or inspector collisions remain.
- Every implemented workbench mode has been tested in the browser.
- Failure simulation states are visually understandable.
- Modeled metrics are clearly labeled as analytical estimates.
- Desktop and laptop experiences pass visual QA.
- Narrow viewport layouts remain usable.
- Light and dark modes are consistent.
- Browser console errors are investigated.
- Existing inherited diagram functionality remains intact.
- Exported architecture artifacts remain clean.
- Screenshots document the verified final implementation.

Use objective checks wherever possible. Record subjective visual assessments separately from automated pass/fail evidence.

### 9. DELIVERABLES

Create and maintain:

`docs/visual-qa/upstream-baseline/`

`docs/visual-qa/archi-made-easy-before/`

`docs/visual-qa/archi-made-easy-after/`

`docs/visual-qa/VISUAL-DIFFERENTIATION-AUDIT.md`

`docs/visual-qa/PLAYWRIGHT-TEST-MATRIX.md`

`docs/visual-qa/DEFECT-REGISTER.md`

`docs/visual-qa/FINAL-VISUAL-ACCEPTANCE.md`

Add repeatable automated test scripts wherever feasible.

Every screenshot must be genuinely captured from the running application, not generated as a mockup.

### 10. PERSISTENCE AND IMPLEMENTATION CONTINUITY

Persist this complete requirement in the project documentation.

Add references to the visual QA specification in CLAUDE.md, AGENTS.md and the implementation checklist.

Make the visual differentiation audit and Playwright acceptance gate explicit Phase 5 completion conditions.

Preserve existing uncommitted Phase 5 work.

Complete the interrupted regeneration safely, establish the regression baseline, and then execute the redesign and visual QA.

After Phase 5 acceptance, proceed with Phases 6 and 7, while applying the same visual QA standards to the three flagship examples.

### FINAL INSTRUCTION

Do not deliver a cosmetic fork.

Deliver a genuinely differentiated Architecture Engineering Workbench whose visual quality, discoverability, accessibility, technical correctness and user experience justify its independent identity.

Use Playwright MCP as an active engineering and visual evaluation tool throughout development, not merely for a final screenshot.

Start by confirming Playwright MCP availability, inspecting the Git working tree, persisting this addendum, and capturing the upstream and current implementation baselines.

Then execute the redesign and exhaustive visual QA before committing Phase 5.
