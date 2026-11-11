---
name: archi-made-easy
description: "Design, review and simulate software architectures from plain language, and produce a checked, interactive architecture page (standalone HTML workbench), Mermaid, draw.io and Structurizr exports, and review, failure, traffic and cost reports. Also workflow, sequence, data-flow, lifecycle, ERD, class, tree, timeline and waterfall diagrams. Use when the user asks to design, draw or explain a system ('highly available e-commerce on Azure'), turn a requirements document into an architecture, review a design for risks, ask what happens if a database, zone or provider fails, simulate a traffic surge, estimate or lower cost, or compare options. Run this skill's scripts for those answers; never estimate modelled figures yourself."
license: Apache-2.0
metadata:
  version: "1.0.1"
  engine-version: "1.0.0"
  edition: "Microsoft 365 Copilot"
  author: Avinash Roy
---

# Archi-Made-Easy (Microsoft 365 Copilot Edition)

Turn a plain-language request into an architecture the user can explore: a checked, standalone HTML page with an interactive workbench (inspect components, review risks, simulate failures and load, read modelled cost), plus text exports and reports. The engine is the skill's own JavaScript, run in the script sandbox. It needs no network and installs nothing.

`SKILL_DIR` below is the folder that contains this file. Run every command with Node.js as `node SKILL_DIR/bin/archi-made-easy.mjs <command> …` (the engine) or `node SKILL_DIR/bin/copilot-deliver.mjs <command> …` (the delivery adapter, used only when the engine reports `output/…` diagnostics). If you run code through Python, call the same command with `subprocess.run(["node", …], capture_output=True, text=True)` and read both the exit code and stdout. Keep your working files (such as `candidate.json`) in a writable working folder, not in `SKILL_DIR`.

`OUT_DIR` below is the folder your environment returns files to the user from: `/mnt/data` when it exists, otherwise the working folder.

**Gate every step on its result.** After each command, read its exit code and its JSON `ok` field before doing anything else.
- **Exit 0 and `"ok": true`:** success. For a command that writes a file, also confirm the file exists.
- **Anything else:** the step failed, and a file it should have written does not exist.
  - Never run `check` or any later step on a file from a failed step.
  - Never report a later "missing file" or `input/artifact-unreadable` message as the problem.
  - Report the failed step's own diagnostics: `code` and `message`.
  - Then make a safe correction (see [Correcting a failed step](#correcting-a-failed-step)).

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
3. **Validate** (schema, layout and the nine artifact checks):
   `node SKILL_DIR/bin/archi-made-easy.mjs validate architecture candidate.json --quality showcase --json`
   Continue only on exit 0 with `"ok": true`. Otherwise report its diagnostics and correct them (see [Correcting a failed step](#correcting-a-failed-step)), then validate again.
4. **Produce the page**, only after step 3 succeeded:
   `node SKILL_DIR/bin/archi-made-easy.mjs export html candidate.json OUT_DIR/<slug>.html --force --json`
   Continue only on exit 0 with `"ok": true` **and** a file at `OUT_DIR/<slug>.html`.
   - **The export reports document errors:** report them, correct them, and return to step 3.
   - **It fails with `output/…` diagnostics:** the output folder refused the engine's page writer. Use the delivery adapter instead; it renders and checks where the writer works, then copies the checked page to `OUT_DIR`:
     `node SKILL_DIR/bin/copilot-deliver.mjs html candidate.json OUT_DIR/<slug>.html --quality showcase --force --json`
     Success is exit 0 with `"ok": true`; `artifact.path` is the page. On `copilot/html-unsupported` or `destination-not-writable`, no page exists. Say so, give the receipt's `fallback.mermaidMarkdown`, and continue with the text outputs.
5. **Check the page**, only after step 4 produced it:
   `node SKILL_DIR/bin/archi-made-easy.mjs check OUT_DIR/<slug>.html --json`
   It must return `"ok": true`. (The adapter already ran `check`; if you used it, skip this step.) If `check` says `input/artifact-unreadable`, the page does not exist: go back to step 4's own error. Never present this message as the cause.
6. **Summarise with the engine,** not from your own estimate:
   `node SKILL_DIR/bin/archi-made-easy.mjs review candidate.json --json`
   `node SKILL_DIR/bin/archi-made-easy.mjs simulate candidate.json --scenario all --json`
7. **Return the page** to the user as a file, and `candidate.json` if they may want to edit it later. Offer only a page that passed step 5 (or the adapter's `"ok": true`). The page works offline in any modern browser, where the user opens the workbench: Explore, Review, Simulate, Security, Performance, FinOps, Optimize, Decide and Handoff. If the platform cannot return files, say so and use the fallback outputs.

### Correcting a failed step

1. Tell the user, in one or two lines, which step failed and why: the diagnostic `code` and the plain meaning of its `message`. Example: "Validation failed: the label 'Cloud Spanner multi-region primary database cluster' is too wide for its box."
2. Make the smallest change that fixes exactly what the diagnostic names. Prefer its `supportedFixes`. Examples:
   - shorten a label, and move the detail to `sublabel` or a card;
   - widen the named component;
   - correct a connection to an existing component id;
   - move a component to a free `row`/`col`;
   - remove a duplicate.
3. Keep everything the user asked for. Never remove a requested component, boundary or requirement to silence an error. Never edit files in `SKILL_DIR`, and never skip or weaken a check.
4. Run the failed step again, starting from step 3, at most three rounds. For tangled routes, read [Architecture layout repair](references/architecture-layout-repair.md).
5. If only `showcase`-quality layout gates still fail after three rounds, set `meta.quality_profile` to `"standard"`, validate with `--quality standard`, and say the page was checked at standard quality.
6. If it still fails, stop. Report the last diagnostics, deliver the text outputs (Mermaid export, review, simulation), and say no interactive page was produced.

### Review, failure, traffic and cost questions

Run the model on the architecture document (the one you made, or one the user provides) and answer from its output. Say the results are modelled from the declared design and name the assumed inputs that matter.

- Risks and a review score: `review candidate.json --json`
- What if something fails: `simulate candidate.json --scenario a..f --json` (list them with `--list-scenarios`), or a specific component: `--fault <component-id>=down|degraded|brownout|partitioned`
- A traffic surge: `simulate candidate.json --multiplier 20 --json`; a colder cache: `--cache-hit 0`
- Failure modes table: `simulate candidate.json --fmea --json`
- Cost (only figures the document states; nothing is invented): `simulate candidate.json --cost --json`
- Lower cost or improve it: change the document, run `review` and `simulate` again, and report before and after.
- Compare two designs: `compare architecture base.json head.json compare.html --json`, run with the working folder as the current folder (it writes a page with the engine's writer); if it fails with an `output/` diagnostic, describe the comparison in text instead.

Details: [Failure and what-if simulation](references/chaos-and-failure-simulation.md), [Capacity, latency, availability and cost](references/capacity-latency-and-finops.md), [Review rules](references/arb-well-architected-rules.md).

### Exports

`node SKILL_DIR/bin/archi-made-easy.mjs export mermaid|drawio|structurizr|rfc candidate.json OUT_DIR/<file> --force --json`

Gate it like step 4. If it fails with `output/…` diagnostics, use `node SKILL_DIR/bin/copilot-deliver.mjs export <format> candidate.json OUT_DIR/<file> --force --json`.

- `mermaid`: Markdown with Mermaid flowchart, C4 and sequence diagrams (renders in Microsoft Loop, Azure DevOps wikis, GitHub and many editors);
- `drawio`: a diagrams.net file;
- `structurizr`: a Structurizr DSL workspace;
- `rfc`: a Markdown design document with the review, failure modes and scenarios.

Image export (SVG, PNG) is done by the user in the page's own Export menu; there is no command-line image export.

### Other diagram types

For a process, an API call chain, a pipeline, a state machine, a database schema, a class model, a hierarchy, a timeline or a request's timing, choose `workflow`, `sequence`, `dataflow`, `lifecycle`, `erd`, `class`, `tree`, `timeline` or `waterfall`. Read the schema `SKILL_DIR/schemas/<type>.schema.json`, the matching example in `SKILL_DIR/examples/`, and [Authoring defaults](references/authoring-defaults.md); then:

`validate <type> candidate.json --json` → `render <type> candidate.json OUT_DIR/<slug>.html` → `check OUT_DIR/<slug>.html --json`. Gate each step as above. If `render` fails with `output/…` diagnostics, use `node SKILL_DIR/bin/copilot-deliver.mjs html candidate.json OUT_DIR/<slug>.html --type <type> --force --json`.

When the right type is unclear: `node SKILL_DIR/bin/archi-made-easy.mjs guide "<the user's question>" --json`.

### What this edition cannot do

- The real-browser layout check (`finalize`, `browser-check`, `visual-check`) needs Chrome or Edge, which the sandbox does not have. `validate` and `check` still run the schema, layout and nine artifact checks. Tell the user the page was checked automatically but not in a browser.
- One-page explainer pages are not included in this edition (their renderer exceeds Microsoft's package rules). Answer such requests in text, or with a diagram.
- Brand logos fetched from a website need network access; built-in marks work.
- `doctor` reports the explainer runtime as missing in this edition; that is expected.
- If a page step fails with `output/…` diagnostics, run `node SKILL_DIR/bin/copilot-deliver.mjs probe OUT_DIR --json` once and include its `probes` summary in your reply, so the failure can be diagnosed.

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
