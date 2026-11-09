# Exports, comparison and the workbench

Read this when the user asks for the architecture in another format (Mermaid, draw.io, Structurizr, a design document), wants to compare two designs or options, or asks about the interactive workbench.

## Contents

- [Export formats](#export-formats)
- [Comparing designs](#comparing-designs)
- [Comparing authored alternatives](#comparing-authored-alternatives)
- [Images](#images)
- [Interactive workbench](#interactive-workbench)

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

Not available in this version. The planned workbench runs inside the HTML: selecting components to inject faults, traffic and cache sliders, a scorecard, failure-mode and decision tabs, and drilling into child diagrams.

Until it ships, answer workbench-style questions with `review` and `simulate` on the command line, and say that the interactive version is not available yet.
