# Archi-Made-Easy design system

This is the design the viewer and workbench are built to. It answers the redesign requirement in [PHASE5-UX-ADDENDUM.md](../program/PHASE5-UX-ADDENDUM.md). The problems it responds to are listed in the [visual differentiation audit](VISUAL-DIFFERENTIATION-AUDIT.md).

## Product idea

The upstream viewer is a **document**: a title, a diagram card, notes underneath, and a floating pill of controls. A reader scrolls it.

Archi-Made-Easy adds an **instrument** around the same diagram: a fixed frame of controls around a work surface, like a CAD or observability tool. An architect stays on one screen, picks a lens on the left, reads the result on the right, and the diagram in the middle never moves out of view.

Three rules drive every layout decision:

1. The canvas is always fully visible. Panels take space from the page margins and the diagram refits; nothing floats over it.
2. Each question an architect asks has one place: a mode on the left rail, with its controls and results in the inspector on the right.
3. Every number says what it is: modelled, assumed, authored or measured.

## Layout

The page has two states.

### Workbench on

```
+------+----------------------------------------------------+--------------+
| mode | [mark] Title                 style theme present   |              |
| rail |                              [Workbench]  Export   |  inspector   |
| 68px +----------------------------------------------------+  360px,      |
|      |                                                    |  collapsible |
|      |                canvas (the diagram)                |              |
|      |                                                    |              |
|      |  legend                          canvas tools      |              |
|      +----------------------------------------------------+              |
|      | MODELLED  answered  p99  load  single  cost  review |              |
+------+----------------------------------------------------+--------------+
         vitals bar, 52px                 notes and index follow below the first screen
```

| Region | Behaviour |
|---|---|
| Mode rail | Fixed to the left, the full height of the window. One labelled button per workbench experience. Choosing a mode opens the inspector for it; choosing the current mode again collapses the inspector. |
| Title strip and toolbar | The title with the product mark, and the tools: style, theme, motion, present, the **Workbench** toggle, and Export (the one filled button). The strip is painted to the window edges. |
| Inspector | Fixed to the right, the full height of the window, 360px wide (400px on screens 1600px and wider). Content depends on the mode and the selection. The canvas refits when it opens or closes. |
| Vitals bar | Fixed along the bottom, between the rail and the inspector. Six modelled figures and the basis of the model. Under a scenario each changed figure shows its healthy value. |
| Canvas | The diagram, its legend and the canvas tools (route, lens, find, guide, zoom). |
| Notes and index | In the page flow under the canvas. |

The regions are fixed to the window and reserve their space through the page padding (`--ame-rail`, `--ame-inspector`, `--ame-vitals`), which the inherited reader layout already measures. So the diagram is scaled to the space left over and is never covered.

### Workbench off

The page keeps the inherited geometry exactly: the same paddings, the same header box, the same toolbar position. Only the paint is new (title strip, mark, squared controls, flat canvas, new palette, component cards). The mode rail is reduced to a column of icons in the left page margin, where it takes no space from the page.

Why: the inherited reader layout, canvas-tool placement and browser gate are tuned to that geometry, and about 300 inherited browser tests check it. A first version of this design replaced the header with a fixed command bar; that changed the page's height and width budget and broke eleven of those tests (see D-023 in the [defect register](DEFECT-REGISTER.md)). Keeping the geometry while the workbench is off preserves every inherited guarantee; the frame appears when the reader, or the document's own data, turns the workbench on.

An architecture produced by this skill carries operational data, so it opens with the workbench on. An architecture without any (for example one drawn by the inherited product) opens with it off.

### Responsive behaviour (workbench on)

| Width | Rail | Inspector | Vitals bar |
|---|---|---|---|
| 1200px and wider | left, labelled | docked right and the canvas refits, **if the diagram's labels stay at 6px or more beside it**; otherwise a drawer over the right edge of the canvas, and the diagram keeps its size | one row, every figure visible |
| 900 to 1199px | left, narrower | a drawer over the right edge of the canvas, closed by default | one row |
| below 900px | tab bar along the bottom | a sheet above the vitals bar, about half the height, closed by default | above the tab bar, scrolls sideways |

Below 900px with the workbench off there is no rail; the toolbar's Workbench button is the way in. On a phone not everything is on screen at once: the order of priority is canvas, then modes, then the sheet on demand.

Presentation mode hides the rail, vitals bar and inspector. Embedded pages (`?embed=1`) show the canvas only.

## Identity

- **Mark.** An arch with a keystone: two piers and the wedge that locks them. It sits before the title, drawn as CSS masks in the text colour with the keystone in the accent colour.
- **Voice.** Labels are short and concrete: "Simulate", "Run scenario", "Recovery options". No exclamation marks and no marketing words in the interface.

## Colour

Neutral greys carry the interface, so that colour on screen always means something. There is one accent. Component categories and model states each have their own hue.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#ECEDEF` | `#0B0C0E` | page behind the regions |
| `--panel` | `#FAFAFA` | `#131417` | canvas and panels |
| `--panel-border` | `#D5D7DB` | `#26282E` | hairlines |
| `--text` | `#15171A` | `#F2F3F5` | text |
| `--text-muted` | `#555B66` | `#A0A6B1` | secondary text |
| `--ame-accent` | `#2F4FE0` | `#8DA2FF` | active mode, focus ring, links |
| `--ame-critical` | `#C4281C` | `#FF7A6B` | failing, critical findings |
| `--ame-warning` | `#9A5B00` | `#F2B24A` | degraded, saturated, medium findings |
| `--ame-ok` | `#0B7A54` | `#4FD3A1` | healthy, recovered, improved |

Component categories (stroke colour; the fill is the stroke mixed into the surface):

| Category | Light | Dark |
|---|---|---|
| frontend | `#0A6FB3` | `#63BFF5` |
| backend | `#1A7F5A` | `#5FD0A0` |
| database | `#6D45CF` | `#B39BFF` |
| cloud | `#9A6206` | `#EDB45C` |
| security | `#BF2D55` | `#FF8FA8` |
| messagebus | `#BD4F18` | `#FF9D66` |
| external | `#596170` | `#A6ADB9` |

Rules:

- Text on its background meets WCAG AA (4.5:1 for body text, 3:1 for large text and for the outlines of controls). The automated visual QA measures this.
- State is never shown by colour alone. A failing component has a text badge and a dashed outline as well as the critical colour.

## Typography

No new typeface is bundled. Two families already available to every page are used with distinct jobs:

| Role | Family | Use |
|---|---|---|
| Interface | the platform's own sans-serif (`system-ui`, Segoe UI Variable, SF Pro, Roboto, with the CJK fallbacks) | titles, prose, buttons |
| Data | JetBrains Mono (already embedded for diagram labels) | every figure, unit, identifier, badge, section label |

Scale: 11, 12, 13, 15, 18px. Section labels are 11px mono, upper case, letter-spaced 0.06em. Figures use tabular numerals.

Why no bundled display face: each embedded face adds about 40KB to every artifact and a third-party licence to carry. This is an owner decision; it can be revisited.

## Shape, spacing and motion

- Radius: 4px for controls, 8px for panels, 10px for the canvas. No pills, except status badges.
- Spacing: multiples of 4px.
- Elevation: regions are flat and separated by hairlines. Only menus and the mobile sheet cast a shadow.
- Motion: 120 to 200ms, ease-out, for panel open and close. The simulation plays the failure outward one dependency step at a time (about 350ms per step). With reduced motion set, every step is shown at once.

## Components

| Component | Description |
|---|---|
| Title strip | Mark and title on a strip painted to the window edges, with the toolbar at its right end. With the workbench on, the title takes one line. |
| Mode rail button | Icon above a short label; the active mode has an accent bar on its edge. With the workbench off, the icon alone, with the name as a tooltip and accessible name. |
| Readout | A figure in the vitals bar or inspector: mono label, value, unit, optional change against the baseline, and a basis tag. |
| Basis tag | `MODELLED`, `ASSUMED`, `AUTHORED` or `MEASURED`. See below. |
| Finding card | Severity, title, pillar. Selecting it spotlights the affected components and expands problem, evidence, consequence and recommended change. |
| Scenario card | A named failure or load case with what it does. One is selected at a time. |
| Compare table | Baseline against the current state, one row per figure, with better or worse stated in words. |
| Recovery option | A change that would reduce the impact, with a preview of the figures after the change. |
| Component card (on the canvas) | Surface-coloured card with a category-coloured accent bar and icon; the outline is neutral. |
| State badge (on the canvas) | Text badge on a component: `DOWN`, `FAILING`, `DEGRADED`, `SATURATED`, `ON REPLICA`, `NOT SERVED`. |
| Level marker (on the canvas) | Accent-filled `ZOOM IN` tag on the lower right corner of a component that opens into a diagram of its own. Shown in Explore; it can be clicked. |
| Level view | A child diagram opened over the whole page: a bar with **Back**, the path (parent, then child) and the level name, and under it the child's own page in a sandboxed frame, in the parent's theme. Escape on the bar, or Back, returns to the parent with focus where it was. The frame is shown when the child page reports that it has loaded. |

## Workbench experiences

| Mode | Question | Canvas | Inspector |
|---|---|---|---|
| Explore | What is this component and what does it depend on? | selection | properties with their basis, callers and dependencies |
| Review | What is wrong with this design? | spotlight on the selected finding | score by pillar, findings; each expands to problem, evidence, consequence, recommended change |
| Simulate | What happens when something fails? | fault states and propagation | scenario choice, Run, impact, before and after, recovery options |
| Security | What is exposed and what protects it? | exposure and authentication badges | exposed entries, unauthenticated paths, encryption, security findings |
| Performance | Where does it saturate and how slow is it? | utilisation badges | load and cache controls, critical path, saturation order |
| FinOps | What does it cost? | cost badges | total, cost by component, coverage of cost data |
| Optimize | What should change first? | spotlight on the selected change | ranked changes, each with a preview of the figures after it |
| Decide | Why is it built this way? | trace steps | decision records, alternatives compared, request traces |
| Handoff | How do I take it elsewhere? | none | downloads: Mermaid, draw.io, Structurizr, design document |

## Measured, modelled, assumed, authored

| Tag | Meaning | Where |
|---|---|---|
| `MODELLED` | Computed by the analytical model from the declared design. Not observed on a running system. | every figure the engine produces |
| `ASSUMED` | An input the document does not state; a default for the component's role was used. | inputs in Explore, and counted in the vitals bar |
| `AUTHORED` | An input stated in the document. | inputs in Explore |
| `MEASURED` | Observed on a real system. | never produced by this version: the page states "No measurements" |

A figure under a changed condition is never shown bare. The vitals bar names the condition ("Condition: Primary database or stateful storage outage") and each changed figure carries its healthy value ("Answered now 0%, healthy: 99.85%").

## What is deliberately kept from the inherited viewer

- Diagram geometry, labels in JetBrains Mono, and every rendering and layout check.
- Canvas tools: route, lens, find, guide, zoom, radar. They keep their behaviour and tests; only their appearance follows this system.
- The four style presets and both themes. The default preset carries this system; the other three keep their canvas treatments inside the new frame.
- Element ids and data attributes that tests and exports rely on.
