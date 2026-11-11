# Changelog

All notable changes to Archi-Made-Easy are recorded here. Versions follow [Semantic Versioning](https://semver.org/). Unreleased work uses a `-dev.N` prerelease version.

## [Unreleased]

## [1.0.0] - 2026-11-10

First release of Archi-Made-Easy. Evidence for every item: [release acceptance report](docs/program/RELEASE-ACCEPTANCE.md).

### Added

- **Plain-language architecture work through an Agent Skill.** The agent turns a request such as "highly available e-commerce on Azure", a repository or a requirements document into an architecture document, checks it and returns one offline HTML page with its assumptions listed. Questions about an existing architecture (risks, "what if the database fails", a traffic surge, cost) are answered by running the skill's model.
- **Architecture workbench in the page.** Explore, Review, Simulate, Security, Performance, FinOps, Optimize, Decide and Handoff around the diagram; a mode rail, an inspector and a vitals bar.
- **Analytical model** of availability, latency, capacity, failure propagation, retries, failover and monthly cost, with six preset scenarios (database outage, zone or region loss, tenfold load, provider brownout, cold cache, compromised edge), failure-mode tables and recovery options. Every figure is labelled modelled; every input authored or assumed.
- **Architecture review**: 14 rules across reliability, security, performance, cost, operational excellence and sustainability, with evidence, consequence and recommended change; for operational settings, a modelled preview of the figures after the change.
- **Levels (C4 drill-down)**: a component opens into its own diagram, carried in the same file.
- **Knowledge packs** for Azure, AWS, GCP and on-premises with nine reference patterns (`scaffold`).
- **Commands** `review`, `simulate`, `export` and `scaffold`, and `--arb` on `validate` and `finalize`.
- **Exports**: Mermaid (flowchart, C4, sequence), draw.io, Structurizr DSL and a Markdown design document.
- **Examples**: global fintech payment mesh, enterprise agentic AI platform, cloud-native e-commerce at C4 level with three child diagrams, and one starting point per provider.
- **Installer** `install.mjs` for Claude Code, Codex, GitHub Copilot, Cursor, OpenCode, Windsurf and Gemini CLI.
- **New product identity.** Archi-Made-Easy is established from an Apache-2.0 open-source foundation. See `NOTICE` and `ATTRIBUTION.md`. The skill, its CLI (`archi-made-easy`), its JavaScript namespace (`ArchiMadeEasy`), its environment variables (`ARCHI_MADE_EASY_*`), its template markers, packages and release archive all carry the new name. Documents written for the original software validate and render unchanged.

### Security

- Authored text is escaped for each export format: as text inside draw.io's HTML labels, as Markdown text in the design document, and with Mermaid's entity codes in diagrams. See [docs/program/SECURITY-REVIEW.md](docs/program/SECURITY-REVIEW.md).
- `ARCHI_MADE_EASY_BRAND_CAPTURE_DISABLED=1` refuses every remote brand request, including the digest re-check of a brand pinned in a document from someone else.
- `export --force` replaces only a regular file; it refuses a directory or a link at the output path with a diagnostic.

### Known limitations

- Figures are an analytical model of the declared design, not measurements, load tests or provider commitments.
- On phones and tablets, diagram labels render under 6px until the reader zooms (inherited behaviour).
- Tested on Windows 11 with Claude Code. Linux and macOS run in CI only; other agents are verified for installation placement, not use.
- The workbench text is English only.
- Update notices: an installed copy checks `https://avinashp7509.github.io/archi-made-easy/skill-updates/archi-made-easy/stable.json` for a newer release and only tells the user; it never installs anything. That manifest is served from the project's GitHub Pages, which is switched off for 1.0.0; until a later release enables Pages and publishes it, the check finds nothing. Turn it off with `ARCHI_MADE_EASY_UPDATE_CHECK_DISABLED=1`.
- The original project's journal, review evidence, translated READMEs, community, sponsor and donation material, and contributor tooling are not part of this repository.
