# Base design (approved 2026-11-10)

> Read this together with [PLAN.md](PLAN.md), which overrides it. The 2026-11-10 amendments:
> - The product is renamed Archi-Made-Easy. Folder, CLI, JavaScript namespace and skill are all renamed, not only the skill.
> - Natural-language-first routing, a knowledge layer, alternatives and before/after comparison are added.
> - The phase order changes.
>
> Paths and names below use the upstream names in effect when this design was written. Phase 1 renames them.
> The "Context" paragraph about approval authorising only a PDF is historical: the build is authorised.

## Context

The goal is a downstream fork of `tt-a1i/archify` that keeps everything upstream does and adds an "architecture workbench": operational metadata on architecture diagrams, a deterministic simulation and review engine, an interactive workbench inside the rendered HTML, multi-format export, three flagship examples, and entrypoints for other coding agents.

This turn is audit and plan only. The workspace is empty and plan mode forbids writes, so upstream was audited read-only over the network at commit `11b0d60` (main, 2026-11-08). Nothing was cloned and `doctor`/`validate` have not been run yet; that is Phase 0.

**What approving this plan does.** You asked for the full plan as a PDF so you can review it and plan improvements on your own before guiding the build. Approval therefore authorises one action only: writing that PDF (see "On approval" in Part 5). No clone and no implementation starts until you come back with your changes.

Decisions already made with you:

- **Clone:** into this workspace with `--filter=blob:none` (full history, about 110 MB of files).
- **Workbench UI:** one toolbar toggle, closed by default, auto-opens when the diagram has authored operational data.
- **Skill name:** renamed to `archify-workbench`.

## Part 1. Baseline audit of upstream

### Where the brief and the repo disagree

| Brief assumes | Upstream actually has | Consequence for the plan |
|---|---|---|
| Modes include `c4`, `er`, `state`, `mindmap` | 10 diagram types (architecture, workflow, sequence, dataflow, lifecycle, erd, class, tree, timeline, waterfall) plus `explainer`. C4 is listed as killed / not planned in `ROADMAP.md`. | C4 is built as levels and drill-down on the architecture type, not a new mode. |
| CLI has `verify` | No `verify`. Commands: render, compare, deliver, patch, finalize, preview, validate, migrate, inspect, check, visual-check, browser-check, guide, brands, examples, doctor, demo | Nothing to preserve for `verify`; `check --require-provenance` plays that role. |
| Edit `archify/assets/template.html` | It is generated from `viewer/template.source.html` plus `viewer/*.js` and `viewer/viewer.css` by `scripts/generate-viewer.mjs`; `check:viewer` fails on drift | All UI work goes into `viewer/` sources, then regenerate. |
| Schemas can take optional fields freely | Every object is `additionalProperties: false`; validators are ajv-standalone code committed in `archify/renderers/shared/generated-validators.mjs` | Real schema edits plus `generate:validators`. |
| SKILL.md under 500 lines | `test/skill-metadata.test.mjs` caps it at 160 lines (137 today) and the description at 1024 bytes | New guidance lives in references; SKILL.md grows by about 12 lines. |
| `AGENTS.md` and `archify/references/` are new | Both exist (contributor guidance; 9 reference docs) | Append, do not replace. |
| Rendered HTML can read the diagram model | The source JSON is not embedded; only SVG `data-node-*` / `data-edge-*` attributes survive | A new embedded data slot carries the operational model. |

### Structure

- `archify/` is the shipped skill: `SKILL.md`, `bin/`, `schemas/`, `renderers/`, `references/`, `assets/template.html`, `locales/`, `examples/`, `explainer/`, `delta/`, `recipes/`.
- Repo root holds development material: `viewer/` (template sources), `scripts/` (generators, packaging), `test/` (about 196 `*.test.mjs` on `node --test`), `examples/` (golden HTML), `docs/`, `website/`, `integrations/`, `archify.zip`.
- Runtime is zero-dependency, Node 18 or later. `ajv` and `simple-icons` are dev-only. The browser gate drives a system Chrome/Edge over CDP; there is no puppeteer or playwright.
- Licence is Apache-2.0 (older contributions MIT). `NOTICE` and `THIRD_PARTY_NOTICES.md` must be kept, and there is no trademark grant for the Archify name.

### CLI (`archify/bin/archify.mjs`, 289 KB)

- Dispatch is one `switch` near line 7207; help text comes from `COMMAND_USAGE` near line 2192. `test/cli.test.mjs` pins the help output.
- `validate`: parse, schema check (`renderers/shared/validator.mjs`), spawn the renderer into a temp dir, run `scripts/check-render-output.mjs`, print a JSON receipt whose `nextAction` is `finalize … --candidate-sha256`.
- `finalize` (`bin/finalize.mjs`): `validate → deliver → check --require-provenance → browser-check`, writing `.delivery.json` and `.finalize.json` sidecars.
- Diagnostic shape: `{code, severity: 'error'|'warning', message, subject, evidence, supportedFixes}` with namespaced codes (`schema/`, `layout/`, `composition/`, `engineering/`, `viewer/` …).
- `renderers/shared/engineering-profiles.mjs` is an existing pure semantic-check module that returns diagnostic arrays. It is the model for the review pass.

### The nine quality checks (`archify/scripts/check-render-output.mjs`)

`single_svg`, `finite_svg`, `orthogonal_arrows`, `label_route_clearance`, `relationship_crossings`, `relationship_corridors`, `container_border_runs`, `route_rhythm`, `legend_clearance`.

- `single_svg`, `finite_svg`, `orthogonal_arrows` and `legend_clearance` always block.
- `label_route_clearance`, `relationship_crossings`, `relationship_corridors` and `route_rhythm` block only under `--quality showcase`.
- `single_svg` counts every `<svg` substring in the whole file, including inside scripts. New viewer code must never contain that literal.
- A separate browser gate (`bin/visual-check.mjs`) checks overflow, clipping, toolbar/legend/stage clearance and text readability at several viewports in both themes.

### Schemas (`archify/schemas/`)

- JSON Schema draft 2020-12. Documents declare `schema_version` and `diagram_type`.
- Architecture root: `meta`, `components`, optional `layout`, `boundaries`, `connections`, `cards`.
- Component: `id`, `type` (`frontend|backend|database|cloud|security|messagebus|external`), `label`, optional `sublabel`, `tag`, `icon`, `brand`, `sources`, `row`, `col`, `pos`, `size`.
- Connection: `from`, `to`, optional `id`, `label`, `variant` (`default|emphasis|security|dashed`), routing fields.
- Boundary: `kind` (`region|security-group`), `label`, `wraps`, optional `pad`. Boundaries have no `id` today.
- `schemas/README.md` states additive backward-compatible fields need no version bump.

### Viewer and template

- `template.html` is 787 KB: fonts 95 KB, CSS 202 KB, markup 35 KB, one classic script 451 KB of readable IIFE modules under a global `Archify`.
- Hydration is `applyTemplate` in `archify/renderers/shared/utils.mjs` (markers `ARCHIFY:SVG_SLOT_START/END`, `CARDS_SLOT`, `I18N_DATA`, `SOURCE_EVIDENCE_DATA`).
- SVG hooks: `g#node-<id>[data-node-id]`, `path[data-edge-id][data-edge-from][data-edge-to]`, boundary `rect[data-composition-frame-id]` (array index, not an id).
- Existing features to reuse rather than rebuild:
  - `Archify.focus`: Semantic Passport (the node detail panel) and `computeReachability`, a pure upstream/downstream BFS.
  - Route Probe / `playJourney`: step-by-step path playback.
  - `Archify.motion`: the Motion Governor that owns all animation and reduced-motion handling.
  - `viewer/export.js`: Export menu with SVG, PNG, JPEG, WebP, share cards and WebM; `viewer/export-cleanup.js` strips viewer state from exports by denylist.
  - Explainer child embedding: gzip-packed child HTML opened in a sandboxed `srcdoc` iframe (`archify/explainer/diagrams.mjs`, `render.mjs`, `reader.js`).
- No event bus exists. State is exposed as `data-*` attributes and module APIs.

### Byte-exact gates that every change must satisfy

- `check:validators`, `check:viewer`, `check:brand-marks` (generated files in sync).
- `test/golden.mjs`: re-rendered examples must byte-match `examples/*.html` and `archify/examples/*.html`.
- `archify.zip` is rebuilt and byte-compared in CI, and that requires official Node 22 with a specific zlib. Local Node is 24.18.
- Any viewer change therefore sets off a regeneration cascade:
  - the template itself;
  - every golden HTML in `examples/` and `archify/examples/`;
  - `examples/checkout-platform-delta.html` and its receipt (`test/architecture-delta.test.mjs`);
  - `docs/gallery/**`, which `test/gallery.test.mjs` byte-compares;
  - `docs/assets/archify-live-proof.json`, which pins hashes of gallery artifacts and needs Chrome and ffmpeg to rebuild.

### Test constraints found by stress-testing the design

- `test/cli.test.mjs` copies `archify.mjs` alone into an empty folder and runs `doctor`, so `archify.mjs` cannot statically import new modules.
- `test/generate-viewer.test.mjs` hard-codes the fragment marker map and fixtures; adding a fragment means extending that test.
- `test/i18n.test.mjs` requires 100% key coverage in the six bundled catalogs (ar, en, es, ko, zh-CN, zh-TW) and above 90% in the six example catalogs (de, fr, it, ja, pt, ru), which have room for only about 26 more untranslated keys.
- `test/golden.mjs` keeps its own `GOLDEN` list, separate from `TARGETS` in `render-examples.mjs`.
- `test/desktop-reader-browser.test.mjs` runs the browser layout gate on every `archify/examples/*.html`, so the flagship examples are checked with the workbench auto-opened.
- `test/path-boundary-contract.test.mjs` pattern-scans `archify/bin`, `archify/scripts` and `scripts` for path-comparison idioms that graph code would trip. `archify/workbench/` is not scanned.
- New browser tests must be listed in `scripts/browser-test-inventory.mjs`.
- Packaging is a denylist over tracked files under `archify/`, so new files there ship automatically, including anything placed in `archify/scripts/`.
- ajv runs in strict mode: no `format`, no `x-*` keywords, no union types, explicit `type` on every object.

## Part 2. Design

### Principles

1. Old documents validate, render and produce the same receipts as before. New behaviour is triggered only by new fields or new flags.
2. One engine, written once as import-free ESM in `archify/workbench/`, with a generated browser copy. A parity test proves both give identical output.
3. Deterministic: no randomness, no clock, sorted iteration, fixed rounding at the output boundary.
4. Every inferred value is marked `assumed` in the model and shown as such in the UI and reports. Review rules that compare numbers fire only on authored numbers.
5. Reuse the Passport, journey player, Motion Governor and Export menu instead of adding parallel surfaces.

### File-by-file blueprint

New files:

| Path | Purpose |
|---|---|
| `archify/workbench/model.mjs` | Architecture doc → normalised operational model; reference checks |
| `archify/workbench/defaults.mjs` | Role inference and default numbers per role |
| `archify/workbench/sim.mjs` | Traffic, saturation, faults, retry storms, failover, SLA, latency |
| `archify/workbench/scenarios.mjs` | The six presets, generated per diagram |
| `archify/workbench/review.mjs` | ARB rules and score |
| `archify/workbench/fmea.mjs` | Failure-mode table from single-fault runs |
| `archify/workbench/cost.mjs` | Monthly cost and egress |
| `archify/workbench/exporters/{mermaid,drawio,structurizr,rfc}.mjs` | Text exporters |
| `archify/workbench/index.mjs` | Public surface |
| `archify/bin/workbench.mjs` | Thin `review`, `simulate`, `export` command wrappers, loaded with `await import` inside the handlers; all graph logic stays in `archify/workbench/` |
| `scripts/generate-workbench-engine.mjs` | Builds `viewer/workbench-engine.js`; `--check` for drift. Lives in root `scripts/` so it is not shipped in the skill |
| `viewer/workbench-engine.js` | Generated IIFE copy (`Archify.workbenchEngine`) |
| `viewer/workbench.js`, `viewer/workbench.css` | Workbench UI |
| `archify/references/chaos-and-failure-simulation.md` | Reference, with table of contents |
| `archify/references/capacity-latency-and-finops.md` | Reference, with table of contents |
| `archify/references/arb-well-architected-rules.md` | Reference, with table of contents |
| `archify/references/workbench-ui-and-exporters.md` | Reference, with table of contents |
| `archify/examples/global-fintech-payment-mesh.architecture.json` | Flagship 1 |
| `archify/examples/enterprise-agentic-ai-platform.architecture.json` | Flagship 2 |
| `archify/examples/cloud-native-ecommerce-c4.architecture.json` plus 2–3 child `*.architecture.json` | Flagship 3 with drill-down |
| Rendered HTML for the three, in `archify/examples/` and `examples/` | Goldens |
| `.github/copilot-instructions.md`, `.github/agents/architect-workbench.agent.md` | Copilot entrypoints |
| `.cursor/rules/archify-workbench.mdc` | Cursor entrypoint |
| `test/workbench-*.test.mjs` | Schema, engine, parity, review, exporters, CLI, browser tests |
| `docs/workbench/BASELINE.md` | Phase 0 results at the audited commit |

Modified files:

| Path | Change |
|---|---|
| `archify/schemas/common.schema.json`, `architecture.schema.json`, `schemas/README.md` | New optional definitions and fields (Part 3) |
| `archify/renderers/shared/generated-validators.mjs` | Regenerated |
| `archify/renderers/shared/utils.mjs` (`applyTemplate`) | New optional `ARCHIFY:WORKBENCH_DATA` slot, handled like `SOURCE_EVIDENCE_DATA` and serialised with the existing `serializeScriptJson` |
| `archify/renderers/shared/cli.mjs`, `renderers/architecture/render-architecture.mjs` | Build and pass the workbench data; accept pre-rendered drill-down children; optional boundary `id` |
| `archify/bin/archify.mjs` | Three `COMMAND_USAGE` entries and `case`s; `--arb` extracted before the known-options check on `validate` and `finalize`; new commands added to the JSON-error allowlist; new runtime files in `doctor`; a prepare step that renders drill-down children by subprocess |
| `archify/bin/finalize.mjs` | Carry the review block into the finalize receipt |
| `viewer/template.source.html`, `scripts/generate-viewer.mjs` | New fragment markers, data slot, one toolbar button (hidden when there is no data) |
| `viewer/focus.js` | One callback slot so the workbench can add an Operational section to the Passport before it is positioned |
| `viewer/route-probe.js` | One exported entry point that plays an explicit edge sequence (today it only plays the shortest path between two nodes) |
| `viewer/motion-governor.js` | A `workbench` owner label |
| `viewer/export.js`, `viewer/export-cleanup.js` | Handoff menu group; strip workbench overlays from exports |
| `archify/assets/template.html` | Regenerated |
| `archify/locales/*.json` (6) and `archify/examples/locales/*.json` (6) | `viewer.workbench.*` strings in every catalog |
| `archify/scripts/render-examples.mjs`, `test/golden.mjs` | Three entries in `TARGETS` and in `GOLDEN` |
| `test/generate-viewer.test.mjs`, `scripts/browser-test-inventory.mjs` | New fragment markers in the pinned map and fixtures; new browser tests registered |
| All golden HTML, the delta example, `docs/gallery/**`, `docs/assets/archify-live-proof.json` | Regenerated because the template changed |
| `archify/SKILL.md` | Rename plus a short Workbench section; stays within 160 lines |
| `AGENTS.md` | Appended section pointing agents at the skill; existing text untouched |
| `archify/package.json`, root `package.json` | `generate:workbench-engine`, `check:workbench-engine`, added to `test:generated` |
| `scripts/stage-clean-skill.mjs` and packaging scripts | Ship `archify/workbench/` and `bin/workbench.mjs`; staged folder named `archify-workbench` |
| `test/cli.test.mjs` | Help list gains three commands |
| Name-pinning tests and docs (`test/skill-metadata.test.mjs`, `test/skill-installation.test.mjs`, `test/cursor-onboarding.test.mjs`, `llms.txt`, README install commands, `archify/skill-release.json`, `scripts/check-release-identity.mjs`) | Expected name string changes to `archify-workbench`; assertion logic unchanged |
| `NOTICE`, `README.md` | Fork attribution and a Workbench section |
| `archify.zip` | Rebuilt |

Rename scope: the skill identity changes (frontmatter `name`, installed and zipped folder name, docs, the name-pinning tests). The source directory `archify/` and the CLI path `archify/bin/archify.mjs` keep their names, as your brief uses them throughout. Phase 7 starts with a grep for every pinned `archify` skill-name string so none is missed.

### CLI additions

- `archify review <architecture.json> [--json]`: ARB report.
- `archify simulate <architecture.json> [--scenario <a-f>] [--rps-multiplier N] [--cache-hit N] [--fault <target>=<state>]… [--json]`.
- `archify export <format> <architecture.json> <out>` with formats `html`, `svg`, `png`, `mermaid`, `mermaid-c4`, `mermaid-sequence`, `drawio`, `structurizr`, `rfc`.
  - `html` delegates to the existing render path.
  - `svg` and `png` drive the viewer's own export code through the headless browser that `visual-check.mjs` already locates, so CLI and in-page exports match. Without a browser they fail with a clear diagnostic.
  - `drawio` takes node boxes from the existing layout report (`validate --layout-json`).
- `validate` and `finalize` gain `--arb warn|strict|off`, modelled on the existing `--writing` flag.
  - Default: the review runs when the document contains authored `operational` or `workbench` data, otherwise it is off. Receipts for existing examples stay byte-identical.
  - Findings appear as `review/*` warnings in `diagnostics` plus a `review` block. `strict` makes critical findings fail.

### Viewer workbench

- **Data slot.** `<script id="archify-workbench-data" type="application/json">` holds the normalised model (with `<` escaped) for architecture diagrams. Other diagram types get no slot and the workbench stays dormant.
- **Toggle.** One toolbar button. Closed by default; opens on load when the model has authored data or the URL has `?workbench=<mode>`. Auto-open shows only the command bar and ribbon, not the drawer, and that state must pass the browser layout gate because the flagship examples are tested in it.
- **Isolation.** All viewer fragments share one script block, so `workbench.js` does nothing at all when the data slot is absent; an error there must never stop the modules after it.
- **Command bar.** Mode switcher (Explore, Chaos, Traffic, Security, FinOps, C4), scenario preset select, traffic multiplier slider (1x–50x) and cache hit slider (0–99%).
- **Explore.** Clicking a node opens the existing Passport, extended with an Operational section (specs, SLA, scaling, security, cost). No second drawer.
- **Chaos.** Capture-phase click and Enter/Space handlers (the pattern `viewer/route-probe.js` already uses) cycle Healthy → Degraded → Down → Partitioned on nodes, edges and boundaries; the remaining states (Brownout, 20x surge) are in a context menu and the presets. Chaos mode and route picking are mutually exclusive.
  - Results are written as `data-wb-state` attributes and styled in CSS.
  - Red pulse on failed paths and retry storms, amber badges on saturated paths, emerald flow on active failover routes.
  - Each state also has a text badge, so meaning never depends on colour or motion. Animation is claimed through the Motion Governor.
- **KPI ribbon.** Composite SLA, critical-path P99, max sustainable RPS, active SPOFs, monthly cost, ARB score. Recomputed on every change.
- **Architect drawer.** One bottom panel with four tabs: ARB scorecard, FMEA matrix, ADRs (authored in `workbench.adrs`), trace player (happy path and failover path, played through the existing journey player).
- **Security and FinOps modes.** Recolour nodes by trust zone / exposure and by monthly cost share, with a legend.
- **C4 navigator.** Double-click a node with `drilldown_diagram_id` to open its child diagram in a sandboxed `srcdoc` iframe with a breadcrumb.
  - Children are authored inline in the parent document, so the candidate hash covers them and they survive the snapshot copy that `validate` and `deliver` render from.
  - The CLI renders each child by subprocess before the parent (the architecture renderer is a script and cannot call itself), then embeds the child HTML as escaped JSON text.
  - Embedding is uncompressed on purpose: gzip output differs between platforms and would break the byte-exact goldens. Each child adds about 0.85 MB; children are capped at four per diagram and three levels deep.
  - Theme, preset and "back" travel over a token-checked `postMessage` bridge modelled on the explainer's (`archify/explainer/reader.js`).
- **Export and handoff.** A new group in the existing Export menu: Mermaid, Draw.io, Structurizr, RFC markdown, downloaded as text.
- **Rules.** No literal `<svg` in new code (`createElementNS` only). Overlays are tagged `data-workbench-overlay` and added to the export-cleanup denylist.
- **Strings.** Every UI string is a `viewer.workbench.*` key present in all twelve catalogs. I will write the eleven non-English translations myself; they should be treated as unreviewed until a native speaker checks them.

Upstream's `DESIGN.md` advises against new panels, dashboard shells and "blast radius" wording without evidence. The workbench knowingly departs from that, but only while it is open; the closed state looks like upstream.

## Part 3. Schema extensions

All fields optional. Shared definitions go in `common.schema.json` `$defs`; every new object is `additionalProperties: false`.

```jsonc
// common.schema.json $defs
"operationalRole": { "enum": ["ingress","gateway","stateless-compute","stateful-db","cache",
  "message-broker","stream","object-store","identity","external-saas","ai-model","cdn","load-balancer"] },

"nodeOperational": { "type": "object", "additionalProperties": false, "properties": {
  "role":        { "$ref": "#/$defs/operationalRole" },
  "c4_level":    { "enum": ["context","container","component","code"] },
  "drilldown_diagram_id": { "$ref": "#/$defs/id" },
  "sla_percent": { "type": "number", "minimum": 0, "maximum": 100 },
  "redundancy":  { "enum": ["single-instance","multi-az","active-active-multi-region","active-passive-dr"] },
  "capacity": { "type": "object", "additionalProperties": false, "properties": {
    "max_rps": { "type": "number", "exclusiveMinimum": 0 },      // per instance
    "baseline_rps": { "type": "number", "minimum": 0 },          // offered load at 1x (entry nodes)
    "cpu_cores": { "type": "number", "exclusiveMinimum": 0 },
    "memory_gb": { "type": "number", "exclusiveMinimum": 0 },
    "autoscale_min": { "type": "integer", "minimum": 1 },
    "autoscale_max": { "type": "integer", "minimum": 1 },
    "scaling_lag_sec": { "type": "number", "minimum": 0 } } },
  "latency": { "type": "object", "additionalProperties": false, "properties": {
    "p50_ms": { "type": "number", "minimum": 0 }, "p95_ms": { "type": "number", "minimum": 0 },
    "p99_ms": { "type": "number", "minimum": 0 } } },
  "dr": { "type": "object", "additionalProperties": false, "properties": {
    "rpo_sec": { "type": "number", "minimum": 0 }, "rto_sec": { "type": "number", "minimum": 0 },
    "backup_strategy": { "type": "string", "minLength": 1 } } },
  "finops": { "type": "object", "additionalProperties": false, "properties": {
    "cloud_provider": { "type": "string", "minLength": 1 }, "instance_tier": { "type": "string", "minLength": 1 },
    "monthly_base_cost_usd": { "type": "number", "minimum": 0 },
    "cost_per_million_requests_usd": { "type": "number", "minimum": 0 },
    "storage_gb": { "type": "number", "minimum": 0 }, "storage_cost_per_gb_usd": { "type": "number", "minimum": 0 } } },
  "security": { "type": "object", "additionalProperties": false, "properties": {
    "trust_zone": { "type": "string", "minLength": 1 },
    "auth_method": { "enum": ["none","api-key","basic","jwt","oauth2-oidc","saml","iam","mtls"] },
    "encryption_at_rest": { "type": "boolean" }, "encryption_in_transit": { "type": "boolean" },
    "compliance_tags": { "type": "array", "items": { "type": "string", "minLength": 1 }, "uniqueItems": true },
    "public_exposed": { "type": "boolean" } } } } },

"edgeOperational": { "type": "object", "additionalProperties": false, "properties": {
  "call_semantics": { "enum": ["sync-blocking","async-queue","async-pubsub","event-stream",
    "replication-sync","replication-async","failover-route","heartbeat"] },
  "protocol": { "enum": ["HTTPS/REST","gRPC","GraphQL","Kafka","AMQP","WebSockets","TCP","SQL","CDC"] },
  "resilience": { "type": "object", "additionalProperties": false, "properties": {
    "timeout_ms": { "type": "number", "exclusiveMinimum": 0 },
    "retries": { "type": "integer", "minimum": 0, "maximum": 10 },
    "backoff_strategy": { "enum": ["none","fixed","linear","exponential"] },
    "jitter": { "type": "boolean" },
    "circuit_breaker_enabled": { "type": "boolean" },
    "circuit_breaker_threshold_pct": { "type": "number", "minimum": 0, "maximum": 100 },
    "fallback_edge_id": { "$ref": "#/$defs/id" }, "dlq_node_id": { "$ref": "#/$defs/id" },
    "idempotent": { "type": "boolean" } } },
  "traffic": { "type": "object", "additionalProperties": false, "properties": {
    "request_multiplier": { "type": "number", "minimum": 0 },    // calls on this edge per request at the source
    "payload_kb": { "type": "number", "minimum": 0 },
    "read_write_ratio": { "type": "number", "minimum": 0, "maximum": 1 },  // fraction of calls that are reads
    "egress_cost_per_gb_usd": { "type": "number", "minimum": 0 } } } } }
```

```jsonc
// architecture.schema.json additions
components[].operational        → { "$ref": "common…/nodeOperational" }
connections[].operational       → { "$ref": "common…/edgeOperational" }
boundaries[].id                 → common id (optional; needed as a fault target)
boundaries[].operational        → { scope: "region"|"availability-zone"|"trust-zone", trust_zone?: string }
workbench (root, optional)      → {
  entrypoints: [id],                         // overrides inferred ingress nodes
  adrs:   [{ id, title, status: "proposed"|"accepted"|"superseded", context, decision,
             alternatives: [{ option, pros: [string], cons: [string] }], consequences }],
  traces: [{ id, title, kind: "happy"|"failover", steps: [{ edge: id, note?: string }] }],
  drilldowns: [{ id, title?, spec }]         // spec = a complete inline architecture document ("$ref": "#")
}
```

Schema keywords are limited to what ajv strict mode accepts (see the test constraints in Part 1).

Reference integrity (`fallback_edge_id`, `dlq_node_id`, `drilldown_diagram_id`, trace edges, entrypoints) cannot be expressed in JSON Schema. `model.mjs` checks it and reports `workbench/unknown-reference` errors; this only runs when the new fields are present.

Inferred defaults when a field is absent (all marked `assumed`):

- **Role** from component `type`, refined by label/icon keywords: `frontend` → ingress when it has no inbound edges; `backend` → stateless-compute (gateway or load-balancer on keyword); `database` → stateful-db (cache, object-store on keyword); `messagebus` → message-broker (stream on keyword); `security` → identity; `external` → external-saas (ai-model on keyword); `cloud` → stateless-compute (cdn on keyword).
- **Call semantics**: target is a broker → async-queue; target is a stream → event-stream; otherwise sync-blocking.
- **Numbers** per role (SLA, per-instance max RPS, p50/p99) from one table in `defaults.mjs`, documented in `capacity-latency-and-finops.md`. Redundancy defaults to `single-instance` except managed roles (cdn, object-store, external-saas, ai-model).

## Part 4. Simulation formulas

Notation: node `v`, edge `e = (u → v)`, ingress multiplier `M`, cache hit ratio `H`. Sync edges are `sync-blocking`; async edges are `async-queue`, `async-pubsub`, `event-stream`. Replication, failover-route and heartbeat edges carry no request traffic.

**Graph preparation.** Entry nodes are `workbench.entrypoints`, else nodes with role ingress/cdn, else nodes with no inbound traffic edges. Back edges found by a DFS from the entries in id order are excluded from propagation and reported, so propagation runs on a DAG in topological order.

**Capacity.** `C_v = max_rps × autoscale_max` (or `× 1` without autoscaling), multiplied by a health factor: Healthy 1, Degraded 1, Brownout 0.5, Down/Partitioned 0. Redundant nodes that lose one of `N` units keep `(N−1)/N`.

**Traffic.**

- Entry: `λ_v = baseline_rps × M` (×20 more under a DDoS fault on that node).
- Served: `s_v = min(λ_v, C_v)`.
- Edge flow: `f_e = s_u × request_multiplier × k_e`, where the cache factor `k_e` is
  - `1 − H` when `u` is an inline cache or CDN,
  - `1 − H × read_write_ratio` when `u` also calls a healthy cache and `v` is a stateful store,
  - `1` otherwise. A Down cache sets `H = 0` for its callers (stampede).
- `λ_v = Σ f_e` over inbound traffic edges.
- Utilisation `ρ_v = λ_v / C_v`. Amber at `ρ ≥ 0.8`, saturated at `ρ ≥ 1`.
- Async consumers: queue lag grows at `max(0, λ_v − C_v)` messages per second; producers are not blocked.
- Max sustainable RPS: the model is linear in `M`, so `M* = min_v (C_v / λ_v at M=1)` over nodes reachable by sync edges, and the answer is `M* × Σ baseline_rps`.

**Fault propagation.** Monotone fixed point over states `ok < degraded < failing`, at most `|V|` rounds. For each sync edge `u → v` where `v` is failing:

1. A valid `fallback_edge_id` whose target is not failing → `u` stays ok, the fallback edge is marked active.
2. Else `circuit_breaker_enabled` → `u` becomes degraded (fast fail, feature loss), no cascade.
3. Else → `u` becomes failing, with the causal chain recorded.

Async edges never cascade upstream. A partitioned boundary cuts every edge crossing it; a blacked-out boundary downs every wrapped node whose redundancy scope does not exceed the boundary's scope. Blast radius is the set of non-ok nodes plus the share of ingress traffic whose entry node is failing.

**Retry amplification.** Per-attempt failure probability `p_e`: 1 if `v` is failing, 0.5 in brownout, `max(0, 1 − C_v/λ_v)` if saturated, 1 if `3 × p99_v > timeout_ms` under Degraded, else 0.

- Amplification `α_e = (1 − p^(r+1)) / (1 − p)`, which is `r + 1` when `p = 1`.
- Along a sync path `α_path = Π α_e`.
- The loop `λ' = λ × α(p(λ'))` is iterated up to 20 rounds; divergence is reported as a self-sustaining storm.
- A storm is flagged when `α_path ≥ 2` and the amplified load exceeds `C_v`, or when a caller's `timeout_ms` is less than the callee edge's `timeout_ms × (retries + 1)`.

**Failover.**

- `active-passive-dr`: service resumes after `rto_sec`; write exposure is `rpo_sec × λ_v × (1 − read_write_ratio)` requests. A `replication-sync` edge to the replica sets RPO to 0.
- `failover-route` edges from the same source activate when the primary target fails.
- `multi-az` and `active-active-multi-region`: no RTO beyond health-check delay; capacity drops to `(N−1)/N` and saturation is rechecked.

**Composite SLA.** `sla_percent` is the SLA of one deployment unit.

- Node: `A_v = a` for single-instance, `1 − (1 − a)^N` for multi-az and active-active (`N` = `autoscale_min` if at least 2, else 2), `1 − (1 − a)(1 − 0.95a)` for active-passive.
- Path: take the set of hard dependencies of an entry (reachable through sync edges with no fallback and no circuit breaker) and multiply each `A_v` once. A dependency with a fallback contributes `1 − (1 − A_primary)(1 − A_fallback)`.
- The ribbon shows the minimum over entries. Nodes in a fault state contribute 0.

**Latency.** Node latency under load is `ℓ_v × min(20, 1/(1 − ρ_v))`, ×3 when Degraded. A failing callee contributes `timeout_ms × (retries + 1)`.

- The critical path is the longest sync path from an entry by summed p99.
- Percentiles are not summed directly. Each node is fitted to a lognormal (`μ = ln p50`, `σ = (ln p99 − ln p50)/2.326`), means and variances are summed along the path, and the path's P50/P95/P99 are read from the matched lognormal (Fenton–Wilkinson).
- A cached hop contributes with weight `1 − H` to the mean; the P99 uses the miss path whenever `H < 0.99`.

**Cost.** With 2,628,000 seconds per month:

- Node: `monthly_base_cost_usd × instances/max(1, autoscale_min) + cost_per_million × λ_v × 2.628 + storage_gb × storage_cost_per_gb_usd`, where `instances = clamp(ceil(λ_v / max_rps), autoscale_min, autoscale_max)`.
- Edge crossing a region or AZ boundary: `f_e × payload_kb × 2,628,000 / 1,048,576 × egress_cost_per_gb_usd`.

**Scenario presets.** Chosen deterministically (highest inbound traffic, ties by id):

- (a) primary stateful-db Down
- (b) largest AZ/region boundary blacked out
- (c) `M = 10`
- (d) the external-saas or ai-model node Degraded with brownout
- (e) every cache Down, giving `H = 0`
- (f) the public ingress node marked compromised, reporting every node reachable without crossing an authenticated edge

A preset with no matching target is listed as not applicable.

**ARB rules and score.** Finding shape: `{id, pillar, severity, affectedNodes, evidence, remediation, basis: "authored"|"assumed"}`.

1. SPOF: `single-instance` node in an entry's hard-dependency set with no fallback. Reliability.
2. Deep sync chain: more than 3 consecutive sync hops with no circuit breaker or async edge. Reliability / Performance.
3. Timeout hierarchy: caller `timeout_ms` less than callee `timeout_ms × (retries + 1)`. Authored values only. Reliability.
4. Unprotected async consumer: async edge with neither `dlq_node_id` nor `idempotent`. Reliability / Operational Excellence.
5. Zero-trust violation: `public_exposed` or ingress node with a direct edge to a stateful-db, with no gateway/compute hop and no `mtls` or other auth method. Security.
6. Chatty cross-boundary egress: sync edge crossing a region/AZ boundary with flow above a threshold and a non-zero egress cost. Cost.
7. Supporting rules so every pillar has coverage: stateful node without RPO/RTO (Operational Excellence); baseline utilisation under 10% with `autoscale_min > 1` (Sustainability / Cost).

Score is `100 − Σ weight`, floored at 0, with weights critical 15, high 8, medium 4, low 1. Findings on assumed values count at half weight and are labelled.

## Part 5. Phased checklist

### On approval: write the plan PDF, then stop

- Output: `Archify-Workbench-Plan.pdf` at the workspace root.
- Contents: everything in this plan, with the baseline audit expanded to full detail from the three audits (complete command and flag table, the nine checks with blocking rules, full architecture schema field list, viewer module map with APIs, test and CI gate inventory, contribution and licence constraints), plus a closing section listing the design decisions you are most likely to want to change.
- Method: the `pdf` skill; if its tooling is missing on this machine, build a print-styled HTML file and convert it with Edge headless (`msedge --headless --print-to-pdf`).
- Check: open the PDF, confirm page count, that tables and code blocks are not clipped, and that every section of this plan is present.
- Then stop and wait for your review. Phases 0–7 below run only after you say so, with whatever changes you bring back.

### Build phases (after your review)

Work happens on a `workbench` branch, with `origin` renamed to `upstream` (the GitHub CLI is not installed, so you add your own remote when ready). I will make one commit per phase and stop for your review after each.

Gate run at the end of every phase:

```
node archify/bin/archify.mjs doctor
node archify/bin/archify.mjs validate <mode> archify/examples/<slug>.<mode>.json --json   # every example
npm test
npm run test:generated
```

- **Phase 0. Baseline.** Partial clone, `npm ci` at root and in `archify/`, run the gate, `npm run test:full`, and the browser tests against Edge. Record results in `docs/workbench/BASELINE.md`. Any pre-existing failure on Windows/Node 24 is recorded before changes begin.
- **Phase 1. Schema and model.** Schema edits, regenerate validators, `model.mjs`, `defaults.mjs`. Tests: old examples unchanged, new fields accepted, unknown fields still rejected, bad references reported.
- **Phase 2. Engine.** `sim`, `scenarios`, `fmea`, `cost`; `simulate` command. Tests use small graphs with hand-computed expected values for every formula above.
- **Phase 3. ARB gate.** `review.mjs`, `review` command, `--arb` on `validate`/`finalize`. Test that receipts for existing examples are byte-identical.
- **Phase 4. Exporters.** Four text exporters and the `export` command; `svg`/`png` through the browser.
- **Phase 5. Viewer.** In order: engine generator and parity test; data slot and toggle; Explore/Passport; Chaos and Traffic overlays with the ribbon; drawer tabs; Security and FinOps modes; C4 drill-down; Handoff menu. Then run the full regeneration cascade from Part 1 (template, goldens, delta example, gallery, live-proof file), add and register browser tests, and run `visual-check` with the workbench open and closed in both themes.
- **Phase 6. Examples.** Three flagships at `--quality showcase` through `finalize`, added to `TARGETS`, committed in both example folders. Each is kept to roughly 16 nodes so the showcase geometry gates are reachable.
- **Phase 7. Packaging.** Skill rename, SKILL.md section, four references, agent entrypoints, `AGENTS.md` and README sections, `NOTICE`, zip rebuild, `npm run test:full`.

End-to-end check after Phase 7: finalize each flagship, open it in the browser, run every preset and confirm the ribbon matches `archify simulate --json` for the same inputs; export each format and open the results in Mermaid Live, diagrams.net and Structurizr Lite.

## Risks and open items

- **Scale.** This is a multi-session build. Phase 5 is the largest and carries the most risk against the browser layout gate.
- **Zip byte-identity** needs official Node 22; I will try `npx node@22` locally and tell you if it cannot be reproduced on this machine.
- **OneDrive** may lock files during the atomic-rename tests; if Phase 0 shows that, pausing sync for this folder is the fix.
- **Golden churn.** Every committed example HTML, the gallery and the live-proof file change once the template changes. That is regeneration, not a weakened check, but the diff is large, and the live-proof rebuild needs ffmpeg, which Phase 0 will check for.
- **Tests that must be extended.** The fragment-marker test, the two example inventories, the browser-test inventory and the name-pinning tests are edited to cover the additions. No assertion is removed or loosened.
- **Drill-down is the riskiest feature.** It adds a CLI prepare step, a message bridge and large files. If it proves unstable, the fallback is sibling HTML files linked with a breadcrumb, at the cost of single-file output for C4 examples.
- **`compare` ignores the new fields.** `archify/delta/architecture-delta.mjs` diffs by field allowlist, so operational changes will not show in a base/head comparison until that is extended; it is left out of this plan.
- **Translations** for eleven languages are machine-written by me and need native review.
- **Model limits.** The simulation is a linear steady-state model with independence assumptions. It ranks risks and shows propagation; it does not replace load testing, and the references will say so.
- **Trademark.** Apache-2.0 gives no right to the Archify name; worth a thought before publishing the fork publicly as `archify-workbench`.
