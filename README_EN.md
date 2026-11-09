<h1 align="center">Archi-Made-Easy</h1>

<p align="center"><strong>Describe a system in plain language. Get an interactive, reviewable architecture.</strong></p>

<p align="center">
  <img src="https://img.shields.io/badge/version-0.1.0--dev.0-0EA5E9?style=flat-square" alt="version 0.1.0-dev.0">
  <img src="https://img.shields.io/badge/license-Apache--2.0-22C55E?style=flat-square" alt="Apache-2.0">
</p>

Current development version: `v0.1.0-dev.0`. Archi-Made-Easy has not been released yet. Everything below describes the development line.

Archi-Made-Easy is an Agent Skill for AI coding agents. You ask for an architecture, a review, or a what-if in your own words. The agent writes the structured description, renders it, and gives you a single offline HTML file you can explore and share.

## What it does today

- **Eleven document types.** Architecture, workflow, sequence, dataflow, lifecycle, ER, class, tree, timeline and waterfall diagrams, plus one-page explainers that embed them.
- **Quality-gated output.** Every diagram is checked before it is delivered: schema validation, nine geometric and visual checks, and a real-browser layout check in light and dark themes.
- **An interactive viewer in one file.** Pan and zoom, node focus and dependency reach, route tracing, search, presentation mode, and export to SVG, PNG and share cards. No server and no network access.
- **Base and head comparison** of two architecture versions.

## In development

The [program plan](docs/program/PLAN.md) and its [checklist](docs/program/CHECKLIST.md) track this work:
- an architecture workbench with failure and chaos scenarios, traffic and capacity, latency and availability, security and trust boundaries, cost, C4 drill-down, FMEA, ADRs and alternatives;
- an architecture review scorecard;
- knowledge packs for Azure, AWS, GCP and on-premises;
- export to Mermaid, draw.io, Structurizr and Markdown design documents;
- installers and release packages for Claude Code, Codex, GitHub Copilot, Cursor and other Agent Skills clients.

Each capability is listed as available only once it is implemented and tested.

## Try it from a clone

Requires Node.js 18 or newer. A Chrome, Chromium or Edge installation is optional; it enables the browser layout check and image export.

```bash
node archi-made-easy/bin/archi-made-easy.mjs doctor
node archi-made-easy/bin/archi-made-easy.mjs finalize architecture archi-made-easy/examples/web-app.architecture.json out/web-app.html --quality showcase
```

Agent installation instructions will be published with the first release.

## Licence and origin

Apache License 2.0. Archi-Made-Easy is derived from an Apache-2.0 open-source project. See [NOTICE](NOTICE) and [ATTRIBUTION.md](ATTRIBUTION.md) for its origin and the original copyright notices.
