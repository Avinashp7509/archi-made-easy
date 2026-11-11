# Archi-Made-Easy 1.0.0

**From one prompt to an interactive architecture workbench.**

Archi-Made-Easy is an Agent Skill for AI coding agents. Describe a system in plain language; your agent writes the architecture document, checks it, and gives you one offline HTML page to explore: review it, break it virtually, read the modelled impact, and improve the design. You never write JSON, schemas or command lines.

## Install

```bash
npx skills add Avinashp7509/archi-made-easy
```

Or from this release's `archi-made-easy.zip`: unpack it and run `node archi-made-easy/install.mjs --agent claude-code` (or `codex`, `github-copilot`, `cursor`, `opencode`, `windsurf`, `gemini-cli`). Requires Node.js 18 or newer. Chrome, Chromium or Edge is optional and enables the real-browser layout check in `finalize`; images are exported from the page itself.

## What is in 1.0.0

- **Plain-language requests.** "Build a highly available e-commerce architecture on Azure", "what happens if the database fails?", "simulate a 20x increase in traffic", "optimize this for lower cost", "diagram my repository", "create an architecture from my requirements document". The agent asks only for facts that change the design and lists every assumption it makes, on the page and in its reply.
- **The workbench, in the page.** Nine modes around the diagram: Explore, Review, Simulate, Security, Performance, FinOps, Optimize, Decide and Handoff.
- **Failure simulation.** Six preset scenarios (database outage, zone or region blackout, tenfold surge, provider brownout, cold cache, compromised edge), or mark components yourself; run it, watch the failure spread, compare before and after, try recovery options.
- **Architecture review.** 14 rules across reliability, security, performance, cost, operational excellence and sustainability, each with evidence, consequence and a recommended change; where the change is an operational setting (redundancy, circuit breaker, timeout, idempotency, encryption at rest), a modelled preview of the figures after it.
- **Honest figures.** Availability, latency, capacity and cost are computed by an analytical model of the design as declared. Every figure is labelled *modelled*, every input *authored* or *assumed*; nothing is presented as measured.
- **Levels (C4 drill-down).** A component opens into its own diagram, carried in the same file.
- **Starting points.** Nine reference patterns on Azure, AWS, GCP and on-premises, with each provider's service names.
- **Exports.** Mermaid (flowchart, C4, sequence), draw.io, Structurizr DSL and a Markdown design document; SVG, PNG, JPEG, WebP, share cards and WebM from the viewer.
- **Eleven document types.** Architecture (with C4 levels), workflow, sequence, data flow, lifecycle, ER, class, tree, timeline, waterfall, and one-page explainers.
- **Quality gates on every page.** Diagram pages get schema validation, nine geometric and visual checks and, when Chrome, Chromium or Edge is available, a real-browser layout check in both themes before delivery. Explainers get their own structure and embedded-diagram checks, with the browser check on request.

Three complete examples ship rendered: a global fintech payment mesh, an enterprise agentic AI platform, and a cloud-native e-commerce platform at C4 level with three child diagrams.

## Verified before release

Where and on which revision each check ran is recorded in [RELEASE-ACCEPTANCE.md](https://github.com/Avinashp7509/archi-made-easy/blob/main/docs/program/RELEASE-ACCEPTANCE.md): the regression suites, the visual QA matrix and the clean install on the final tree and archive; the agent runs on the release candidates before it, with one rerun on the final archive.

- Unit, integration and real-browser suites; a visual QA matrix of 744 interface states at six screen sizes in both themes, with 0 critical and 0 high defects.
- A clean install from the release archive, then the four provider examples scaffolded, and all seven showcase examples (three flagships, four providers) finalized, reviewed, run through every preset scenario and exported from the installed copy; each page opened offline with figures equal to the command line.
- Nine plain-language prompts given to Claude Code with the skill freshly installed, with each run's commands, tokens, costs and final reply recorded (the raw event streams are not published: they carry account session identifiers).
- A security review of the page, the exports and the command line, with hostile-text tests for every output: authored text does not become markup, script, an image or a hidden link (a bare web address may be shown as a link by Markdown renderers that autolink).

## Known limitations

- The figures are a model of the declared design: they rank risks and show propagation; they are not load tests, failover drills or provider commitments.
- On phones and tablets, diagram labels render under 6px until you zoom.
- The workbench text is English only.
- A large architecture takes a while: with Claude Code at its `xhigh` effort setting (one below `max`), a design of 22 to 23 components from a requirements document took 32 and 51 minutes, almost all of it the agent reasoning before its first draft; the skill's own commands take seconds.
- Tested with Claude Code on Windows 11. The installer places the skill for six other agents, which were not exercised; Linux and macOS are covered by the CI workflows only.
- Update notices read one fixed manifest on this project's GitHub Pages once it is published; the skill never installs anything by itself.

## Licence and origin

Apache License 2.0. Archi-Made-Easy is derived from the Apache-2.0 project Archify (tt-a1i/archify, commit 11b0d60) and keeps its notices; see `NOTICE` and `ATTRIBUTION.md`.
