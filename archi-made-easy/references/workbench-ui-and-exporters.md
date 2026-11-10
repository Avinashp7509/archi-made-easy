# Exports, comparison and the workbench

Read this when the user asks for the architecture in another format (Mermaid, draw.io, Structurizr, a design document), wants to compare two designs or options, or asks about the interactive workbench.

## Contents

- [Export formats](#export-formats)
- [Comparing designs](#comparing-designs)
- [Comparing authored alternatives](#comparing-authored-alternatives)
- [Images](#images)
- [Interactive workbench](#interactive-workbench)
- [Bundled examples](#bundled-examples)

## Export formats

```bash
node bin/archi-made-easy.mjs export <format> <architecture.json> <output> [--force] [--json]
```

| Format | Output | Use for |
|---|---|---|
| `html` | Standalone interactive HTML | Same result as `render`. For a checked deliverable, use `finalize`. |
| `mermaid` | Markdown with three Mermaid blocks: flowchart, C4 and sequence | Wikis, READMEs, pull requests |
| `drawio` | `.drawio` file for diagrams.net | Teams that edit diagrams by hand afterwards |
| `structurizr` | Structurizr DSL (`workspace.dsl`) | C4 model tooling |
| `rfc` | Markdown design document | Design reviews and architecture decision meetings |

Notes for each:

- **mermaid.** Databases, queues, external systems and people get distinct shapes; asynchronous and standby connections are dashed. The sequence diagram follows `workbench.traces` when authored, otherwise the request path from the entry points.
- **drawio.** Components keep the positions the document declares (grid cells or `pos`). Boundaries become dashed frames.
- **structurizr.** People for actors, external software systems for external services, containers for everything else, groups for boundaries, with context and container views.
- **rfc.** Sections: summary, requirements and assumptions, architecture, modelled behaviour, review, failure modes, scenarios, decisions. Modelled figures are labelled as such; assumed values carry an asterisk.

An existing output file is never replaced without `--force`.

## Comparing designs

Before and after, or option A against option B, as two documents:

```bash
node bin/archi-made-easy.mjs review <after.json> --against <before.json>
```

The result lists, side by side: composite availability, critical-path P99, max sustainable load, single points of failure, estimated monthly cost and review score, each marked better, worse, unchanged or not comparable. It also lists the review findings closed and opened, and components added and removed.

For a visual before/after of the diagram itself, use `compare architecture <base.json> <head.json> <output.html>` (see `references/delivery-contract.md`).

A worse number is reported as worse. Do not hide a trade-off such as higher cost for higher availability; state it.

## Comparing authored alternatives

Options can live inside one document as `workbench.alternatives`. Each alternative overrides operational fields of named components or connections:

```json
"workbench": { "alternatives": [
  { "id": "ha-db", "title": "Zone-redundant database",
    "component_overrides": [{ "id": "db", "operational": { "redundancy": "multi-az" } }] }
] }
```

```bash
node bin/archi-made-easy.mjs review <architecture.json> --alternatives
```

Each alternative is compared with the authored design using the same measures. Use this when the user asks "what if we made X redundant?" or "compare a cheaper option" and the structure of the diagram stays the same.

## Images

SVG, PNG, JPEG, WebP, share cards and WebM come from the viewer: open the HTML and use the Export menu (see `references/viewer-runtime.md`). Command-line image export is not available in this version.

## Interactive workbench

Every rendered architecture page carries a workbench. It runs in the page, offline, on the same engine as `review` and `simulate`, so a figure in the page equals the figure the command line prints for the same inputs. Other diagram types do not have it.

**Layout.** With the workbench on, the page is a frame around the diagram:

| Region | Where | What it holds |
|---|---|---|
| Title strip and toolbar | top | title, and the tools: style, theme, present, **Workbench**, Export |
| Mode rail | left (a tab bar at the bottom on a phone or tablet) | one button per mode |
| Vitals bar | along the bottom | six modelled figures and how many inputs are authored and assumed |
| Inspector | right, docked; the diagram refits beside it (a sheet on a phone or tablet) | the current mode's controls and results |

With the workbench off, the page is the plain diagram page, with the mode rail reduced to a column of icons in the left margin.

**Turning it on.** The **Workbench** button in the toolbar turns the frame on and off. Choosing a mode on the rail also turns it on, with the inspector open for that mode; choosing the same mode again collapses the inspector. A document with authored operational data starts with the workbench on and the inspector closed; any other architecture starts with it off. A link can open a mode: add `?workbench=<mode>` to the address.

**Modes.**

| Mode | The reader's question | What they get |
|---|---|---|
| `explore` | What is this component? | Properties with each input tagged authored or assumed, what it depends on, what calls it |
| `review` | What is wrong with this design? | Score by pillar and the findings. Selecting a finding spotlights the affected components and shows problem, evidence, consequence and recommended change, with a preview of the figures after the change where the model can make it |
| `simulate` | What happens when something fails? | See below |
| `security` | What is exposed? | Entry points and what each reaches without authentication, declared protection per component, security findings |
| `performance` | Where does it saturate? | Live load and cache sliders, the critical path, utilisation per component, headroom |
| `finops` | What does it cost? | Monthly total, cost by component, and which components carry no cost data |
| `optimize` | What should change first? | The previewable changes ranked by how much each raises the review score, and all of them together |
| `decide` | Why is it built this way? | Authored decision records, alternatives compared, request traces stepped on the diagram |
| `handoff` | How do I take it elsewhere? | Downloads of the Mermaid, draw.io, Structurizr and design-document files that `export` writes |

**Simulate, step by step.**

1. Choose one of the six preset scenarios, or mark components on the diagram (each click cycles healthy, degraded, down, partitioned), and set load and cache.
2. Press **Run scenario**. Nothing is shown as failing before this.
3. The failure is drawn outward from its origin one ring of callers at a time.
4. Impact: which components are affected and why, and how much entry traffic is not served.
5. Before and after: the healthy figures beside the figures under the scenario.
6. Recovery options: changes that would reduce this failure (a standby, redundancy, circuit breakers), each with a preview under the same failure, and a switch to show the diagram with the change applied.

**Levels (C4 drill-down).** A component can open into a diagram of its own, one level down: a C4 container into its component diagram, for example. Author the child as a complete architecture document in `workbench.drilldowns` (`id`, optional `title`, `spec`) and name it from the component with `operational.drilldown_diagram_id`; `operational.c4_level` states the level a component belongs to (`context`, `container`, `component`, `code`).

- The page stays one file. Each child is rendered to a complete page and carried inside the parent, without the stylesheet and scripts the two share, so a child adds tens of kilobytes (about 60 KB each in the bundled e-commerce example), not a second page of more than a megabyte.
- In Explore, the components that open a level carry a `ZOOM IN` marker and are listed under **Levels**. The marker, the **Open** button of a selected component, or a double click opens the level.
- The level is the child's own page, with its own workbench, figures, review and scenarios, shown under a bar with **Back** and the path. It runs in a sandboxed frame and follows the parent's theme.
- A child goes through the same renderer and the same artifact checks as its parent: a child that fails them fails the parent, and the diagnostic names the child. A document may hold four children, and levels nest three deep at most.
- `review` and `simulate` on the command line read the document you give them. To analyse a child there, save its `spec` as a file of its own.

**How figures are labelled.** Every figure is tagged `MODELLED`. Inputs are tagged `AUTHORED` or `ASSUMED`. The page states that it contains no measurements. Under a scenario or changed load, the vitals bar names the condition and each changed figure shows its healthy value. Say the same when you relay a figure to the user.

**What stays out of exports.** Fault states, badges, spotlights and trace marks are exploration state. Image exports and printing never include them.

**Limits to state when asked.**

- The workbench text is English only in this version; the rest of the viewer is localised.
- The browser layout gate of `finalize` loads the top-level page. Child diagrams pass the render checks with their parent; open each level once and look at it before you deliver.
- Exports (`mermaid`, `drawio`, `structurizr`, `rfc`) cover the document you give them, not its child diagrams.
- Changes made in the workbench are not saved. To keep one, edit the document and render again.
- Recovery options and change previews are in the page only; the command line has `review` and `simulate`.
- All figures are an analytical model of the declared design. See [Failure and chaos simulation](chaos-and-failure-simulation.md) and [Capacity, latency, availability and cost](capacity-latency-and-finops.md) for what the model does and does not cover.

## Bundled examples

Read one of these documents when you need a worked example of authored operational data. Every figure in them is an illustrative design target, stated as such in the document; none is a vendor commitment or a measurement.

| Document in `examples/` | What it shows |
|---|---|
| `global-fintech-payment-mesh.architecture.json` | Two active regions, fallback routes between them, circuit breakers on fraud scoring and identity, requirements, decision records, traces and an alternative. Losing a region leaves it answering. Its review holds one finding. |
| `enterprise-agentic-ai-platform.architecture.json` | An agent runtime behind a gateway, with retrieval, tools, a semantic cache and a second model provider behind a router. Its review holds one finding, a timeout hierarchy, with a previewable fix. |
| `cloud-native-ecommerce-c4.architecture.json` | A C4 container diagram whose three services each open into a component diagram (`workbench.drilldowns`). One region: the region scenario stops it, and a decision record says why that was accepted. |
| `providers/azure-zero-trust.architecture.json`, `providers/aws-event-driven.architecture.json`, `providers/gcp-microservices.architecture.json`, `providers/onprem-hybrid.architecture.json` | What `scaffold <pattern> --provider <provider>` writes: a starting point with provider service names, to adapt to the request. Their reviews hold findings: a starting point is not a finished design. |

The first three are also delivered rendered (`examples/<name>.html`).
