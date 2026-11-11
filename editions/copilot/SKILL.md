---
name: archi-made-easy
description: "Design, review and simulate software architectures from plain language, and produce a checked, interactive architecture page (standalone HTML workbench), Mermaid, draw.io and Structurizr exports, and review, failure, traffic and cost reports. Also workflow, sequence, data-flow, lifecycle, ERD, class, tree, timeline and waterfall diagrams. Use when the user asks to design, draw or explain a system ('highly available e-commerce on Azure'), turn a requirements document into an architecture, review a design for risks, ask what happens if a database, zone or provider fails, simulate a traffic surge, estimate or lower cost, or compare options. Run this skill's scripts for those answers; never estimate modelled figures yourself."
license: Apache-2.0
metadata:
  version: "1.0.0"
  edition: "Microsoft 365 Copilot"
  author: Avinash Roy
---

# Archi-Made-Easy (Microsoft 365 Copilot Edition)

Turn a plain-language request into an architecture the user can explore: a checked, standalone HTML page with an interactive workbench (inspect components, review risks, simulate failures and load, read modelled cost), plus text exports and reports. The engine is the skill's own JavaScript, run in the script sandbox. It needs no network and installs nothing.

`SKILL_DIR` below is the folder that contains this file. Run every command with Node.js as `node SKILL_DIR/bin/archi-made-easy.mjs <command> …`. If you run code through Python, call the same command with `subprocess.run(["node", …], capture_output=True, text=True)`. Write your working files (the architecture document, the page, exports) in a writable working folder, not in `SKILL_DIR`.

Always set these two environment variables for every command, because the sandbox has no network: `ARCHI_MADE_EASY_UPDATE_CHECK_DISABLED=1` and `ARCHI_MADE_EASY_BRAND_CAPTURE_DISABLED=1`.

## Step 0: check the environment once

Run `node --version`.

- **Node.js 18 or newer is available → engine mode** (below). Everything in this skill works except the real-browser layout check and image export, which need a browser the sandbox does not have.
- **Node.js is missing, older than 18, or scripts cannot run → fallback mode** (end of this file). Say so in one line, then continue.

Never ask the user to install Node.js, npm or Git: the skill runs in the Copilot sandbox, not on their computer.

## Talking with the user

- Users describe what they want in their own words. Never ask them for JSON, schemas, commands or notation.
- Ask only for facts that change the architecture materially (cloud provider if it matters and is not stated, scale, hard compliance needs): at most three questions, each with a default. Assume the rest and list every assumption in the reply and in the page (an `Assumptions` card).
- Never present an invented availability figure, price, latency or load as real. Every figure the engine produces is **modelled** from the declared design; inputs the user did not state are **assumed**. Say so whenever you quote a figure.
- Reply in the user's language, briefly: what you made, the key takeaway, the assumptions, and the files.

## Engine mode

Read [Intents](references/intents.md) for the playbook of each kind of request. For the document fields, read [Operational model and scaffolds](references/operational-model.md) and [Authoring defaults](references/authoring-defaults.md) before writing a new architecture. Examples in `SKILL_DIR/examples/*.json` teach the document shape; do not copy their facts.

### Create an architecture (also from a requirements document)

1. Pick the closest reference pattern and provider, and start from it:
   `node SKILL_DIR/bin/archi-made-easy.mjs scaffold --list`
   `node SKILL_DIR/bin/archi-made-easy.mjs scaffold <pattern> --provider azure|aws|gcp|onprem --title "<title>" --output <slug>.html --out candidate.json --json`
   For a requirements document, read it first and record its targets (availability, load, latency, recovery, budget, residency, compliance) in `workbench.requirements` as the operational-model reference describes.
2. Edit `candidate.json` so it matches the request: rename, add or remove components and connections, keep the `row`/`col` grid tidy, record the user's facts, keep an `Assumptions` card for the rest. Set `meta.quality_profile` to `"showcase"`.
3. Validate (schema, layout and the nine artifact checks):
   `node SKILL_DIR/bin/archi-made-easy.mjs validate architecture candidate.json --quality showcase --json`
   A non-zero exit is never success: read the diagnostics, fix the named field or layout problem, and validate again (at most three rounds; for tangled routes read [Architecture layout repair](references/architecture-layout-repair.md)).
4. Produce the interactive page and check it:
   `node SKILL_DIR/bin/archi-made-easy.mjs export html candidate.json <slug>.html --force --json`
   `node SKILL_DIR/bin/archi-made-easy.mjs check <slug>.html --json`
5. Summarise with the engine, not from your own estimate:
   `node SKILL_DIR/bin/archi-made-easy.mjs review candidate.json --json`
   `node SKILL_DIR/bin/archi-made-easy.mjs simulate candidate.json --scenario all --json`
6. Return the page `<slug>.html` to the user as a file (and `candidate.json` if they may want to edit it later). The page works offline in any modern browser: the user opens it to explore the workbench (Explore, Review, Simulate, Security, Performance, FinOps, Optimize, Decide, Handoff). If the platform cannot return files, say so and use the fallback outputs for this answer.

### Review, failure, traffic and cost questions

Run the model on the architecture document (the one you made, or one the user provides) and answer from its output. Say the results are modelled from the declared design and name the assumed inputs that matter.

- Risks and a review score: `review candidate.json --json`
- What if something fails: `simulate candidate.json --scenario a..f --json` (list them with `--list-scenarios`), or a specific component: `--fault <component-id>=down|degraded|brownout|partitioned`
- A traffic surge: `simulate candidate.json --multiplier 20 --json`; a colder cache: `--cache-hit 0`
- Failure modes table: `simulate candidate.json --fmea --json`
- Cost (only figures the document states; nothing is invented): `simulate candidate.json --cost --json`
- Lower cost or improve it: change the document, run `review` and `simulate` again, and report before and after.
- Compare two designs: `compare architecture base.json head.json compare.html --json`

Details: [Failure and what-if simulation](references/chaos-and-failure-simulation.md), [Capacity, latency, availability and cost](references/capacity-latency-and-finops.md), [Review rules](references/arb-well-architected-rules.md).

### Exports

`node SKILL_DIR/bin/archi-made-easy.mjs export mermaid|drawio|structurizr|rfc candidate.json <file> --force --json`

- `mermaid`: Markdown with Mermaid flowchart, C4 and sequence diagrams (renders in Microsoft Loop, Azure DevOps wikis, GitHub and many editors);
- `drawio`: a diagrams.net file;
- `structurizr`: a Structurizr DSL workspace;
- `rfc`: a Markdown design document with the review, failure modes and scenarios.

Image export (SVG, PNG) is done by the user in the page's own Export menu; there is no command-line image export.

### Other diagram types

For a process, an API call chain, a pipeline, a state machine, a database schema, a class model, a hierarchy, a timeline or a request's timing, choose `workflow`, `sequence`, `dataflow`, `lifecycle`, `erd`, `class`, `tree`, `timeline` or `waterfall`. Read the schema `SKILL_DIR/schemas/<type>.schema.json`, the matching example in `SKILL_DIR/examples/`, and [Authoring defaults](references/authoring-defaults.md); then:

`validate <type> candidate.json --quality showcase --json` → `render <type> candidate.json <slug>.html` → `check <slug>.html --json`.

When the right type is unclear: `node SKILL_DIR/bin/archi-made-easy.mjs guide "<the user's question>" --json`.

### What this edition cannot do

- The real-browser layout check (`finalize`, `browser-check`, `visual-check`) needs Chrome or Edge, which the sandbox does not have. `validate` and `check` still run the schema, layout and nine artifact checks. Tell the user the page was checked automatically but not in a browser.
- One-page explainer pages are not included in this edition (their renderer exceeds Microsoft's package rules). Answer such requests in text, or with a diagram.
- Brand logos fetched from a website need network access; built-in marks work.
- `doctor` reports the explainer runtime as missing in this edition; that is expected.

## Fallback mode (scripts cannot run)

Use this only when Step 0 found no usable Node.js or the sandbox refused the scripts. Tell the user plainly, once: "The Archi-Made-Easy engine could not run here, so the following is my own analysis, not computed by the engine; no interactive page or modelled figures."

Then give, as text or files:

1. **A Mermaid diagram** of the architecture (`flowchart LR`, components as nodes with their role, connections labelled with what they carry, boundaries as subgraphs).
2. **The architecture document** as JSON in this skill's format, following `SKILL_DIR/schemas/architecture.schema.json` and the examples, so the user can later render it with the Full Edition or an agent that can run it. Say it was not validated.
3. **A review report**: walk the design through the rules in [Review rules](references/arb-well-architected-rules.md) (single points of failure, deep synchronous chains, retry and timeout settings, unprotected asynchronous consumers, exposure of data stores, egress, recovery objectives) and list each finding with the affected components and a recommended change. Do not give a score, availability, latency, load or cost figure: those come only from the engine.
4. **Failure analysis in words** for a "what if" question: which components depend synchronously on the failed one and would fail with it, which are decoupled by a queue or a fallback, and what a change (redundancy, a standby, a circuit breaker) would alter. Mark it as reasoning, not simulation.

Never describe fallback output as equivalent to the engine's checked page or modelled results.

## Reference index

Read only what the request needs:

| Need | Reference |
|---|---|
| Request playbooks, ask-versus-assume | [references/intents.md](references/intents.md) |
| Starting patterns, operational fields, requirements | [references/operational-model.md](references/operational-model.md) |
| Layout and authoring rules | [references/authoring-defaults.md](references/authoring-defaults.md), [references/authoring-contract.md](references/authoring-contract.md) |
| Review rules | [references/arb-well-architected-rules.md](references/arb-well-architected-rules.md) |
| Simulation | [references/chaos-and-failure-simulation.md](references/chaos-and-failure-simulation.md) |
| Capacity, latency, availability, cost | [references/capacity-latency-and-finops.md](references/capacity-latency-and-finops.md) |
| Exports, comparison, the workbench | [references/workbench-ui-and-exporters.md](references/workbench-ui-and-exporters.md) |
| A real code repository | [references/repository-authoring.md](references/repository-authoring.md) |
| Brand marks | [references/brand-marks.md](references/brand-marks.md) |

Licence: Apache-2.0. Notices: `NOTICE.txt`, `LICENSE.txt`, `LICENSE-MIT.txt`, `THIRD_PARTY_NOTICES.md`.
