# Roadmap

The current stable version is `v1.0.0`.

This page lists what 1.0.0 contains and what comes next. Every next step answers a limitation recorded at release, and links to where it is recorded. No dates are promised, and the order is not a commitment. What actually ships is recorded in [CHANGELOG.md](CHANGELOG.md); the evidence for 1.0.0 is the [release acceptance report](docs/program/RELEASE-ACCEPTANCE.md).

## In 1.0.0

- **Plain-language requests through an Agent Skill:** the agent turns a description, a repository or a requirements document into an architecture document, checks it, and returns one offline HTML page with its assumptions listed.
- **Analysis questions answered by the model:** risks, "what if the database fails", a traffic surge and cost are answered by running `review` and `simulate`, never estimated by hand.
- **The workbench in the page:** nine modes around the diagram (Explore, Review, Simulate, Security, Performance, FinOps, Optimize, Decide, Handoff), with a mode rail, an inspector and a vitals bar.
- **Analytical model:** availability, latency, capacity, failure propagation, retries, failover and monthly cost; every figure is labelled modelled, every input authored or assumed.
- **Failure simulation:** six preset scenarios (database outage, zone or region loss, tenfold load, provider brownout, cold cache, compromised edge), failure-mode tables and recovery options.
- **Architecture review:** 14 rules across reliability, security, performance, cost, operational excellence and sustainability, each with evidence, consequence and a recommended change.
- **Levels (C4 drill-down):** a component opens into its own diagram, carried in the same file.
- **Starting points:** knowledge packs for Azure, AWS, GCP and on-premises with nine reference patterns (`scaffold`).
- **Exports:** Mermaid (flowchart, C4, sequence), draw.io, Structurizr DSL and a Markdown design document from the page or the command line; SVG, PNG, JPEG, WebP, share cards and WebM from the page's Export menu.
- **Eleven document types:** architecture, workflow, sequence, data flow, lifecycle, ER, class, tree, timeline, waterfall, and one-page explainers.
- **Quality gates before delivery:** diagram pages get schema validation, nine artifact checks and, when Chrome, Chromium or Edge is available, a real-browser layout check in both themes; explainers get their own structure and embedded-diagram checks.
- **Examples:** a global fintech payment mesh, an enterprise agentic AI platform, a cloud-native e-commerce platform at C4 level with three child diagrams, and one starting point per provider.
- **Installer:** `install.mjs` places the skill for Claude Code, Codex, GitHub Copilot, Cursor, OpenCode, Windsurf and Gemini CLI; Claude Code is the agent exercised in recorded runs.

## Next steps

Each item is tied to the limitation it addresses.

| Next step | Recorded limitation | Recorded in |
| --- | --- | --- |
| **Website and GitHub Pages**, which also turns on update notices | The website (`website/`) is not built or published for 1.0.0: its sources still use a placeholder domain and its toolchain has open advisories (S-07). An installed copy checks a fixed update manifest on the project's GitHub Pages and only tells the user about a newer release; until Pages serves that manifest, the check finds nothing. | [Release acceptance, section 10](docs/program/RELEASE-ACCEPTANCE.md#10-known-limitations); [security review, S-07](docs/program/SECURITY-REVIEW.md#findings); [launch steps](docs/program/release/LAUNCH.md#proposed-commands-run-only-after-approval) |
| **Readable labels on phones before zoom** | D-016: on a phone (390 × 844) and a tablet (768 × 1024), the smallest diagram labels render between 4.4 and 6.0px until the reader zooms, because the inherited viewer keeps a 720px minimum diagram width. Zoom and pan work. | [Defect register, D-016](docs/visual-qa/DEFECT-REGISTER.md); [release acceptance, section 3](docs/program/RELEASE-ACCEPTANCE.md#3-visual-qa) |
| **Level-marker hardening** | S-10: a level marker could also name the page's JSON data blocks, not only the shared style and script. Authored text cannot produce a raw marker, so this is defence in depth; it was accepted for 1.0.0 and scheduled for the next release with a test. | [Security review, S-10](docs/program/SECURITY-REVIEW.md#findings) |
| **Exercising agents other than Claude Code** | Codex, GitHub Copilot, Cursor, OpenCode, Windsurf and Gemini CLI are verified for installation placement only, not exercised in use. Linux and macOS are covered by the CI workflows, which run after the first push. | [Release acceptance, section 9](docs/program/RELEASE-ACCEPTANCE.md#9-platforms-and-agents); [compatibility matrix](archi-made-easy/references/installation.md#compatibility-matrix) |
| **Command-line image export** | SVG and PNG come only from the page's Export menu; the command line has no image export. | [Intents, "Not available yet"](archi-made-easy/references/intents.md#not-available-yet); [checklist, Phase 4](docs/program/CHECKLIST.md#phase-4-review-and-simulation) |
| **Verifying exports in draw.io, Structurizr and the Mermaid parser** | The draw.io and Structurizr exports were verified structurally and by parsing them as their consumers would, not opened in diagrams.net or Structurizr. The Mermaid exports were last checked against the real Mermaid parser before the escaping changes (S-03, S-12). | [Security review, "Not verified"](docs/program/SECURITY-REVIEW.md#not-verified); [Mermaid parser check](docs/program/acceptance/mermaid-parse-2026-11-10.md) |
| **Viewer translations** | Workbench text is English only, and the viewer's translations were not reviewed by native speakers. Translations of the README are not part of this repository yet. | [Release acceptance, section 10](docs/program/RELEASE-ACCEPTANCE.md#10-known-limitations); [intents, "Not available yet"](archi-made-easy/references/intents.md#not-available-yet); [changelog, 1.0.0 known limitations](CHANGELOG.md#known-limitations) |
| **Faster large create requests** | With Claude Code at its `xhigh` effort setting, create requests took about 9 to 51 minutes; the requirements-document request took 32 and 51 minutes and once did not finish within 30. Nearly all of that is the model reasoning before its first draft; the skill's commands take seconds. A guidance change in 1.0.0 did not shorten it, and lower effort settings were not measured. | [Agent runs, "Why the create runs take so long"](docs/program/acceptance/agent-runs/README.md#why-the-create-runs-take-so-long); [release acceptance, section 5](docs/program/RELEASE-ACCEPTANCE.md#5-real-agent-acceptance-acceptance-test-4) |

Other gaps recorded at release, not yet scheduled: saving a change made in the workbench back into the document ([intents](archi-made-easy/references/intents.md#not-available-yet)), and provider SLA figures with official sources, which the knowledge packs deliberately ship without ([checklist, Phase 3](docs/program/CHECKLIST.md#phase-3-creation-and-rendering)).

## Not planned

- A hosted service. Pages stay standalone offline HTML files.
- Measured performance claims. Simulations are analytical models of the declared design and are labelled as such.

## Suggest a change

Use the [feature request form](.github/ISSUE_TEMPLATE/feature-request.yml) for a short suggestion, or the [larger-change proposal](.github/ISSUE_TEMPLATE/improvement.yml) before implementing a substantial change ([CONTRIBUTING.md](CONTRIBUTING.md#choose-the-right-path)). How 1.0.0 was built, phase by phase, is recorded in [docs/program/PLAN.md](docs/program/PLAN.md) and [docs/program/CHECKLIST.md](docs/program/CHECKLIST.md).
