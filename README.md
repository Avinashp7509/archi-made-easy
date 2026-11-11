<h1 align="center">Archi-Made-Easy</h1>

<h3 align="center">From One Prompt to an Interactive Architecture Workbench</h3>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.0.0-0EA5E9?style=flat-square" alt="version 1.0.0">
  <img src="https://img.shields.io/badge/license-Apache--2.0-22C55E?style=flat-square" alt="Apache-2.0">
  <img src="https://img.shields.io/badge/Agent%20Skill-Claude%20Code%20tested-8DA2FF?style=flat-square" alt="Agent Skill, tested with Claude Code">
</p>

<p align="center"><strong>Describe your system. Generate an architecture. Explore it. Break it virtually. Understand the risks. Improve the design.</strong></p>

Current stable version: `v1.0.0`.

Archi-Made-Easy is an open-source Agent Skill that turns natural-language requirements into professional, interactive architecture diagrams, with architecture review, failure simulation, performance analysis and cost modelling. You talk to your coding agent in plain words; the agent writes the architecture document, checks it and gives you one offline HTML file to explore and share, with every assumption it made listed. You never write JSON, schemas or command lines.

<p align="center"><img src="docs/assets/archi-made-easy-demo.gif" alt="37-second walkthrough of the workbench: a generated architecture, a component, a review finding, a region failure and its impact, recovery options, ten times the load, monthly cost, a C4 level opened, and the exports" width="900"></p>

<p align="center"><sub>Every frame above is a screenshot of the running pages in <a href="archi-made-easy/examples/">archi-made-easy/examples/</a>, taken by <a href="scripts/capture-demo-gif.mjs">scripts/capture-demo-gif.mjs</a>.</sub></p>

## Install

Requires Node.js 18 or newer and an agent that can run shell commands. Chrome, Chromium or Edge is optional: `finalize` uses it for the real-browser layout check. Images (SVG, PNG, JPEG, WebP, WebM) are exported from the page's own Export menu, in whatever browser opens it.

```bash
npx skills add Avinashp7509/archi-made-easy
```

Or from a clone, with the bundled installer, which needs nothing but Node:

```bash
git clone https://github.com/Avinashp7509/archi-made-easy.git
cd archi-made-easy
node archi-made-easy/install.mjs --agent claude-code   # or codex, github-copilot, cursor, opencode, windsurf, gemini-cli
```

The installer is the path this release was tested with; the `npx skills` command installs the same skill from this repository using the [Skills CLI](https://github.com/vercel-labs/skills). Then start a new agent session and ask for an architecture. Details, project-level installs and uninstalling: [installation guide](archi-made-easy/references/installation.md).

## Five things to ask

```text
Build a highly available e-commerce architecture on Azure.
Review this solution architecture and identify risks.
What happens if the database fails?
Simulate a 20x increase in traffic.
Create an architecture from my uploaded requirements document.
```

Each of these was given, word for word, to Claude Code with the skill freshly installed; the run records (commands, tokens, costs and the agent's final reply) and the resulting pages are in the [acceptance runs](docs/program/acceptance/agent-runs/README.md).

## What you get

<table>
<tr>
<td width="50%"><img src="docs/assets/archi-made-easy-workbench.png" alt="The workbench during a region failure"><br><sub>A region failure: components marked down, the failover route, impact and healthy figures side by side.</sub></td>
<td width="50%"><img src="docs/assets/archi-made-easy-light.png" alt="A C4 container diagram whose services open into component diagrams"><br><sub>A C4 container diagram; each service opens into its own component diagram.</sub></td>
</tr>
</table>

**The workbench, in the page.** Nine modes around the diagram:

| Mode | Answers |
|---|---|
| Explore | What is this component, what does it depend on, which inputs are stated and which assumed? |
| Review | What is wrong with this design, why it matters, what to change, and what the figures would be after the change |
| Simulate | What happens when something fails: set up a scenario, run it, watch it spread, compare before and after, try recovery options |
| Security | What is exposed, what each entry point reaches, what protects it |
| Performance | Where it saturates under more load or a colder cache, and how slow it gets |
| FinOps | What it costs each month, by component, and how much of that is known |
| Optimize | Which changes improve the review most, previewed |
| Decide | Decision records, alternatives compared, request traces stepped on the diagram |
| Handoff | Mermaid, draw.io, Structurizr and design-document downloads |

**Failure scenarios.** Primary database or storage outage; availability zone or region blackout; a tenfold traffic surge; a third-party API or model provider brownout; a cold cache; a compromised edge. Or mark any component, connection or boundary as degraded, down or partitioned yourself.

**Architecture review.** 14 rules across reliability, security, performance, cost, operational excellence and sustainability: single points of failure, deep synchronous chains, timeout hierarchies, unprotected asynchronous consumers, zero-trust gaps, unencrypted stores, missing recovery objectives, idle capacity, and checks against stated requirements (availability, latency, peak load, recovery, budget).

**Honest figures.** Availability, latency, capacity and cost come from an analytical model of the design as declared. Every figure is labelled *modelled*, every input *authored* or *assumed*, and the page says that it contains no measurements. The model ranks risks and shows how failures propagate; it does not replace load testing, failover drills or a provider's own figures.

**Diagram types.** Architecture (with C4 levels), workflow, sequence, data flow, lifecycle and state, entity-relationship, class, tree, timeline and waterfall, plus one-page explainers that embed them.

**Starting points.** Nine reference patterns (highly available web, multi-region active-active, microservices, event-driven, data platform, zero trust, AI agent platform, hybrid, migration landing zone) on Azure, AWS, GCP and on-premises, with each provider's service names. No provider availability figure is shipped without a cited source.

**Exports.** Mermaid (flowchart, C4 and sequence), draw.io, Structurizr DSL and a Markdown design document, from the page or the command line; SVG, PNG, JPEG, WebP, share cards and WebM from the viewer.

**One offline file.** No server, no account, no network access. Pan, zoom, search, focus, route tracing and presentation mode included.

## Examples

| Example | What it shows |
|---|---|
| [Global fintech payment mesh](archi-made-easy/examples/global-fintech-payment-mesh.html) | Two active regions; losing one leaves payments answered |
| [Enterprise agentic AI platform](archi-made-easy/examples/enterprise-agentic-ai-platform.html) | Agents, retrieval, tools, a semantic cache and a fallback model provider; one finding with a previewable fix |
| [Cloud-native e-commerce, C4](archi-made-easy/examples/cloud-native-ecommerce-c4.html) | Container level; three services open into component diagrams |
| [Provider starting points](archi-made-easy/examples/providers/) | What the agent starts from on Azure, AWS, GCP and on-premises |

Open a page in any modern browser; each document beside it is the source it was rendered from.

## Supported agents

| Agent | Status |
|---|---|
| Claude Code | **Tested.** Nine plain-language requests run end to end with the skill freshly installed, on Windows 11 ([evidence](docs/program/acceptance/agent-runs/README.md)) |
| OpenAI Codex, GitHub Copilot, Cursor, OpenCode, Windsurf, Gemini CLI | **Installation verified.** The installer places the skill where each agent reads skills and `doctor` passes from the installed copy; not yet exercised with the agent itself |
| Other Agent Skills clients | Untested; install with `--dest <skills folder>` |

The skill needs an agent that can run `node` commands. The release candidate was tested on Windows 11; the continuous-integration workflows include Linux, macOS and Windows jobs, which run once the repository is on GitHub. See the [compatibility matrix](archi-made-easy/references/installation.md#compatibility-matrix).

## Evidence and limitations

What was tested, and how, before this release: [release acceptance report](docs/program/RELEASE-ACCEPTANCE.md). In short:

- unit and integration suites, the real-browser suite, and a visual QA matrix of 744 interface states at six screen sizes in both themes;
- a clean install from the release archive, then the four provider examples scaffolded, and all seven showcase examples (three flagships, four providers) finalized, reviewed, run through every preset scenario and exported from the installed copy;
- a [security review](docs/program/SECURITY-REVIEW.md) of the page, the exports and the command line.

Known limitations:

- The figures are a model of the declared design, not a measurement or a guarantee.
- On phones and tablets, diagram labels are smaller than 6px until you zoom ([defect register](docs/visual-qa/DEFECT-REGISTER.md), D-016).
- The workbench is in English only.
- Agents other than Claude Code, and Linux and macOS outside CI, have not been exercised.
- A large architecture takes a while: with Claude Code at its `xhigh` effort setting (one below `max`), a design of 22 to 23 components from a requirements document took 32 and 51 minutes, almost all of it the agent reasoning before its first draft (the skill's own commands take seconds). Smaller requests took 6 to 21 minutes; questions about an existing design, 1 to 2.

## Contributing

Issues and pull requests are welcome; read [CONTRIBUTING.md](CONTRIBUTING.md) first. Changes to what a reader sees are held to the [visual QA specification](docs/program/PHASE5-UX-ADDENDUM.md) and its [design system](docs/visual-qa/DESIGN-SYSTEM.md).

## Security

Please report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

## Licence and acknowledgements

Apache License 2.0. Archi-Made-Easy is derived from an Apache-2.0 open-source project and keeps its notices; see [NOTICE](NOTICE) and [ATTRIBUTION.md](ATTRIBUTION.md) for the origin and the original copyright notices. Contributions to the original work made before its own MIT-to-Apache change remain available under MIT ([LICENSE-MIT](LICENSE-MIT)); bundled third-party components (the JetBrains Mono font, Simple Icons brand data, the vendored explainer renderer) keep their own licences, listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
