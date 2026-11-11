# Launch copy for 1.0.0

Paste-ready text for the public launch of Archi-Made-Easy 1.0.0. Nothing here has been posted. Use it only after the publication steps in [LAUNCH.md](LAUNCH.md) have run with the owner's approval, and after the checks in [Before posting](#before-posting) pass.

Every statement comes from the final [README.md](../../../README.md) or from the [release acceptance report](../RELEASE-ACCEPTANCE.md). Every number comes from the acceptance report, and the [sources table](#sources) says where. Figures from the workbench are modelled, never measured, and the copy says so each time. The copy makes no ranking, popularity, certification, sponsorship or skills.sh listing claim. The project's origin is credited through links to NOTICE and ATTRIBUTION.md, never by name.

## Before posting

- [ ] The repository `https://github.com/Avinashp7509/archi-made-easy` is public, the CI workflow has run on `main`, and the `v1.0.0` GitHub Release exists with `archi-made-easy.zip` attached (LAUNCH.md, steps 1 to 4).
- [ ] The Skills CLI check in [section 5](#5-skills-cli-and-skillssh) passes. Until it does, replace `npx skills add Avinashp7509/archi-made-easy` in every post with the archive install: download `archi-made-easy.zip` from the Release, unpack it, and run `node archi-made-easy/install.mjs --agent claude-code`.
- [ ] The numbers below still match the acceptance report. If a CI fix after the first push changed the release and the report was updated (LAUNCH.md, step 2), update this file from the report first.
- [ ] Images: attach only files from `docs/assets/` that are recorded in [capture-manifest.json](../../assets/capture-manifest.json), which were captured from the running pages. Suitable ones: `archi-made-easy-demo.gif` (the 37-second walkthrough), `archi-made-easy-workbench.png` (caption: "Simulate mode on the bundled fintech example: region A lost, failover to region B. All figures are modelled.") and `github-social-preview.png` for link previews. `archi-made-easy-install-demo.png` is a rendered terminal transcript, not a product screenshot; do not present it as one.
- [ ] When someone asks for a number that is not in this file, link to the acceptance report instead of estimating.

## 1. GitHub "About"

**Description** (186 characters; GitHub allows 350):

```text
AI-native architecture workbench: generate interactive system diagrams from natural language, review risks, simulate failures, model capacity and cost, and export architecture artifacts.
```

**Topics** (15; GitHub allows 20):

```text
ai-agents agent-skills architecture-diagrams solution-architecture enterprise-architecture cloud-architecture architecture-as-code claude-code azure aws gcp chaos-engineering system-design software-architecture platform-engineering
```

**Website:** leave empty for 1.0.0. GitHub Pages is off, so there is no project site yet.

This description and topic set replace the earlier proposal under "Repository" in LAUNCH.md. `chaos-engineering` names the topic area of the failure scenarios; the copy below says that they are modelled and that nothing is injected into a running system (README, "Failure and chaos scenarios").

## 2. Launch announcement

For the GitHub Release discussion or a blog post (about 250 words). Title:

```text
Archi-Made-Easy 1.0.0: from one prompt to an interactive architecture
```

Body (Markdown):

````markdown
Archi-Made-Easy is an Agent Skill for AI coding agents. Describe a system in plain words, such as "Build a highly available e-commerce architecture on Azure." Your agent writes the architecture document, checks it, and gives you one HTML page that opens offline. You never write JSON, schemas or commands.

The page carries a workbench with nine modes around the diagram. Explore a component and see which of its inputs are stated and which are assumed. Review the design's risks, each with evidence and a recommended change. Simulate a database outage, a region blackout or a traffic surge, watch the failure spread, and preview recovery options. Read capacity, latency and monthly cost, open a C4 level, and hand the design off as Mermaid, draw.io, Structurizr or a design document.

Every workbench figure is modelled by a deterministic analytical model of the design as declared, with each input tagged authored or assumed. It ranks risks and shows how failures spread; it does not replace load tests or failover drills.

Before release, on Windows 11 with Chrome: 0 failures in the real-browser suite, 744 interface states checked with 0 critical and 0 high defects, and a clean install from the release archive passing 23 of 23 steps. Claude Code ran nine plain-language prompts in 13 recorded runs, with 10 passes. Six other agents are verified for install placement only.

`npx skills add Avinashp7509/archi-made-easy`

What was tested, and what was not: [release acceptance report](https://github.com/Avinashp7509/archi-made-easy/blob/main/docs/program/RELEASE-ACCEPTANCE.md). Apache-2.0; origin and credits in [NOTICE](https://github.com/Avinashp7509/archi-made-easy/blob/main/NOTICE) and [ATTRIBUTION.md](https://github.com/Avinashp7509/archi-made-easy/blob/main/ATTRIBUTION.md). Feedback is welcome in [Issues](https://github.com/Avinashp7509/archi-made-easy/issues).
````

## 3. LinkedIn post

About 180 words. LinkedIn does not render Markdown; paste as plain text.

```text
"What happens if the database fails?" Ask an AI coding agent with Archi-Made-Easy installed, and the answer comes from a model of your design, not from memory.

Archi-Made-Easy 1.0.0 is out: an open-source Agent Skill (Apache-2.0). Describe a system in plain words; the agent writes the architecture, checks it and returns one HTML page that opens offline.

In that page you can:
→ explore each component, with every input tagged authored or assumed
→ review risks, each with evidence and a recommended change
→ break the design virtually: a database outage, a region blackout, a traffic surge
→ read modelled capacity, latency and monthly cost
→ hand it off as Mermaid, draw.io, Structurizr or a design document

Every figure is modelled from the design as declared, not measured. It ranks risks; it does not replace load tests.

Before release, on Windows 11 with Claude Code: 13 recorded runs of nine plain-language prompts, 10 passes, and 744 interface states checked with 0 critical and 0 high defects. The acceptance report, limitations included, is in the repository.

Install (the Skills CLI needs Node.js 22.20+):
npx skills add Avinashp7509/archi-made-easy

https://github.com/Avinashp7509/archi-made-easy

#SoftwareArchitecture #SolutionArchitecture #AIAgents #CloudArchitecture #ClaudeCode
```

## 4. Developer-community post

**Hacker News.** Title (76 characters; the limit is 80):

```text
Show HN: Archi-Made-Easy – an Agent Skill for interactive architecture pages
```

Submit the repository URL as the link and post the body below as the first comment. Hacker News renders no Markdown: remove the `**` emphasis and the backticks, keep each URL on its own line, and indent the command by two spaces.

**dev.to.** Title:

```text
Archi-Made-Easy 1.0.0: an Agent Skill that turns a plain-language request into an interactive architecture page
```

Body (Markdown):

````markdown
**What it is.** Archi-Made-Easy is an Agent Skill: a folder with a `SKILL.md`, task guides, JSON schemas, renderers, a command line and a deterministic modelling engine, which an installer copies into your coding agent's skill folder. You describe a system in plain words; the agent writes an architecture document, runs the skill's checks, and returns one standalone HTML page. Apache-2.0, Node.js 18 or newer, no runtime npm dependencies.

**How it works.**

1. You ask, for example: "Build a highly available e-commerce architecture on Azure."
2. The agent writes the architecture document. When a reference pattern is close (highly available web, multi-region active-active, microservices, event-driven, data platform, zero trust, AI agent platform, hybrid, migration landing zone), it starts from that pattern with Azure, AWS, GCP or on-premises service names filled in. The skill tells it to ask at most three questions, each with a default, and to write down everything it assumes.
3. `finalize` validates the document against its JSON schema, renders the page, runs nine artifact checks on the diagram (single SVG, finite geometry, orthogonal arrows, label and route clearance, crossings, corridors, container borders, route rhythm, legend clearance), and runs a real-browser layout check in both themes. Without Chrome, Chromium or Edge, that gate is reported as skipped and `finalize` does not pass.
4. The result is one HTML file with the viewer, the engine and the data inline. It opens from disk with no network, and its figures equal what the command line prints for the same inputs.
5. Follow-up questions ("What if we lose a region?", "Simulate a 20x increase in traffic.") are answered by running `simulate` and `review` on the same document, not by guessing.

The page has a workbench with nine modes: Explore, Review, Simulate, Security, Performance, FinOps, Optimize, Decide and Handoff. Handoff downloads Mermaid, draw.io, Structurizr DSL and a Markdown design document, made by the same exporter code as the command line. A component can open into its own C4 diagram one level down, carried in the same file.

**Modelled versus measured.**

Modelled, which is every figure in the page: availability of the request path from each component's availability and redundancy, with fallbacks and circuit breakers; critical-path P50, P95 and P99 from a lognormal fit per hop, summed with Fenton-Wilkinson; load, saturation, maximum sustainable load and retry amplification; monthly cost from prices written in the document; and how a failure spreads. Every figure is tagged MODELLED and every input AUTHORED or ASSUMED, and the page states that it contains no measurements. Missing values are planning defaults per role, not provider SLAs. Failures are treated as independent. Nothing is priced unless the document carries a price. The engine has no randomness, clock or I/O, so the same document always gives the same figures; repeatable does not mean that they predict production.

Measured, which is the release evidence. It all ran on one machine: Windows 11, Node 24.18.0 and Chrome.

- Full unit and integration suite, 3,580 tests: the only failures are the 43 known Windows-only baseline failures (symlink permissions, path separators, `git init --template=`, 8.3 short names), with none new.
- Real-browser suite: 316 tests, 309 pass, 0 fail, 7 skipped.
- Visual QA: 744 interface states across 12 documents, six viewports and two themes: 0 critical, 0 high and 12 medium findings, all of them one inherited small-label defect.
- Clean install from the release archive: 23 of 23 steps, ending with seven showcase pages opened in Chrome with the network switched off, their figures equal to the command line.
- Claude Code 2.1.219: nine plain-language prompts, 13 recorded runs, 10 passes, and every prompt passed after at most one diagnosed rerun. The total reported cost was $29.00. Create requests took about 9 to 51 minutes at `xhigh` effort, nearly all of it model reasoning before the first draft; the skill's commands take seconds.
- The release archive rebuilds byte-identical: SHA-256 `ca480ef81f1c65751538b0ac69fa0fea01c774153a7a22995b577d4bb4b162ef`.

**Limitations.**

- Only Claude Code was exercised, on Windows 11 at `xhigh` effort, and 12 of the 13 runs used release candidates whose guidance differs from 1.0.0. Every run was a single turn, so clarifying questions were not exercised. Codex, GitHub Copilot, Cursor, OpenCode, Windsurf and Gemini CLI are verified for install placement only.
- Linux and macOS are covered by CI only, and the page was tested in Chrome only.
- The review checks a fixed, documented rule set. Network design, IAM policies, data classification, secrets, observability and backup testing are not checked, and the score is not a certification. Whether a design is sound still depends on the agent and on your own review.
- Security and failure analysis are structural: reachability over the declared relationships, and a model of how failures spread. Nothing is injected into a running system, and it is not a threat model or a penetration test.
- The draw.io and Structurizr exports were checked by parsing, not by opening them in diagrams.net or Structurizr. The Mermaid parser check predates the latest escaping changes.
- On phones and tablets, the smallest diagram labels render under 6px until you zoom. The workbench text is English only. Changes made in the page are not saved back to the document.
- Diagrams from a code repository or a requirements document are partly verified; PDF and DOCX input is not verified.
- The security review was done by the implementing agent with tests. It is not an independent audit.

**Try it.**

```bash
npx skills add Avinashp7509/archi-made-easy
```

The Skills CLI needs Node.js 22.20 or newer. Or download `archi-made-easy.zip` from the GitHub Release, unpack it, and run `node archi-made-easy/install.mjs --agent claude-code` (or `codex`, `github-copilot`, `cursor`, `opencode`, `windsurf`, `gemini-cli`). Then open a new agent session and ask: "Build a highly available e-commerce architecture on Azure." To look before installing, clone the repository and open the example pages in `archi-made-easy/examples/` in a browser.

**Feedback wanted.**

- Runs with an agent other than Claude Code: did it find the skill, and did it follow it?
- Installs and `finalize` on Linux and macOS, and the page in browsers other than Chrome.
- Places where a modelled figure or an ASSUMED label could mislead a reader.
- Rules you would want the review to check next, and whether the draw.io and Structurizr exports open cleanly in their own tools.

Bugs: the issue form, with the `finalize --json` receipt if you have one. Vulnerabilities: privately, as described in SECURITY.md.

Repository: https://github.com/Avinashp7509/archi-made-easy
Evidence: https://github.com/Avinashp7509/archi-made-easy/blob/main/docs/program/RELEASE-ACCEPTANCE.md
Origin and credits: Archi-Made-Easy is derived from an Apache-2.0 open-source project and keeps its notices; see https://github.com/Avinashp7509/archi-made-easy/blob/main/NOTICE and https://github.com/Avinashp7509/archi-made-easy/blob/main/ATTRIBUTION.md
````

## 5. Skills CLI and skills.sh

Paste-ready (Release discussion, a reply, or a short post):

```text
Install with the Skills CLI:

  npx skills add Avinashp7509/archi-made-easy

The Skills CLI needs Node.js 22.20 or newer; the skill itself needs Node.js 18 or newer. It installs the repository's one skill, archi-made-easy, into your agent's skill folder. Restart the agent or open a new session so that it discovers the skill, then ask in plain words. Without the Skills CLI, download archi-made-easy.zip from the GitHub Release, unpack it, and run: node archi-made-easy/install.mjs --agent claude-code
```

Maintainer note, not for posting:

- At release, the Skills CLI path was tested only with Skills CLI 1.7.0 against a local copy of the repository and the release archive (Codex, `--copy --yes`). Installing from GitHub with the Skills CLI, its default interactive flow and discovery through skills.sh were not verified, because the repository was not public (README, "Install with the Skills CLI"; acceptance report, section 1).
- After publication, from a clean machine and without touching an existing installation: `npx skills add Avinashp7509/archi-made-easy --list --full-depth` must list exactly one skill, `archi-made-easy`; then run the install (LAUNCH.md, step 5).
- Then look the repository up on skills.sh. Nothing in this file says that it is listed there. Any mention of skills.sh needs the listing to have been seen first, and a reviewed change to this file; never state a rank or an install count.

## Sources

| Used in the copy | Source |
|---|---|
| Real-browser suite: 316 tests, 309 pass, 0 fail, 7 skipped | Acceptance report, section 2 |
| Full suite: 3,580 tests; the 43 failures are the Windows-only baseline set, none new | Acceptance report, section 2 |
| 744 interface states, 12 documents, six viewports, two themes; 0 critical, 0 high, 12 medium (one defect, D-016) | Acceptance report, sections 2 and 3 |
| Clean install: 23 of 23 steps; seven showcase pages opened offline, figures equal to `simulate --json` | Acceptance report, section 4 |
| Claude Code 2.1.219; nine prompts, 13 runs, 10 passes; each failure diagnosed and rerun once; 12 runs on release candidates; $29.00 total reported | Acceptance report, sections 5 and 8 |
| Create requests about 9 to 51 minutes at `xhigh` effort; commands take seconds | Acceptance report, section 10 |
| Windows 11, Node 24.18.0, Chrome; Linux and macOS through CI only; six agents with install placement only | Acceptance report, introduction, sections 1 and 9 |
| Nine artifact checks; nine workbench modes | Acceptance report, sections 5 and 6; README, "Validation and quality gates" and "The workbench" |
| Archive rebuilt byte-identical; SHA-256 | Acceptance report, section 8 |
| Security review by the implementing agent, not an independent audit | Acceptance report, section 6 |
| Labels under 6px on phones and tablets; English-only workbench; exports checked by parsing; Mermaid check before the latest escaping | Acceptance report, section 10; README, "Limitations" |
| Product description, workbench modes, review pillars, scenarios, exports, model method, install commands, Node.js versions, the Skills CLI test scope | README: introduction, "The solution", "What you can do", "Quick start", "Limitations" |
| Licence and origin | README, "Licence and attribution"; [NOTICE](../../../NOTICE), [ATTRIBUTION.md](../../../ATTRIBUTION.md) |
