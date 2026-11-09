# Intents: from plain language to an artifact

Read this when the user describes what they want in their own words rather than naming a diagram type. Users never need to know the schemas, JSON, CLI or notation; you translate.

## Contents

- [How to handle any request](#how-to-handle-any-request)
- [Asking versus assuming](#asking-versus-assuming)
- [Intent playbooks](#intent-playbooks)
- [Not available yet](#not-available-yet)
- [Reporting](#reporting)

## How to handle any request

1. Identify the intent (table below) and the subject: system, product, process, data or decision.
2. Decide whether anything critical is missing ([Asking versus assuming](#asking-versus-assuming)). Ask only then.
3. Choose the artifact: a native diagram type from the Type router in `SKILL.md`, or an `explainer` page when the answer needs several sections.
4. Author the candidate yourself, then run `finalize` exactly as `SKILL.md` describes. Never ask the user to write or edit JSON.
5. Report the link, the key takeaway, and every assumption you made.

| Intent | Typical words | Artifact |
|---|---|---|
| Create | "design / build / create / draw an architecture for …", "highly available e-commerce on Azure", "secure banking app" | `architecture` (plus `sequence` or `dataflow` when the request is about a flow) |
| From a repository | "turn my repo into a diagram", "how is this codebase structured" | `architecture` or `tree`, following `references/repository-authoring.md` with `--repo-root` evidence |
| From a document | "from my requirements document / RFC / notes" | The type that fits the document's subject; requirements become labels, boundaries and cards |
| From Mermaid | pasted Mermaid code | The mapped type in `SKILL.md` Mermaid input |
| Explain | "explain this architecture", "make it a one-pager" | `explainer`, following `references/explainer-authoring.md` |
| Compare versions | "what changed between these two designs" | `compare architecture <base> <head>` (see `references/delivery-contract.md`) |
| Export | "give me an SVG / PNG / share card" | The viewer's Export menu (see `references/viewer-runtime.md`) |
| Review, what-if, optimise | "identify risks", "what if the database fails", "simulate 20x traffic", "lower the cost" | Not available yet. See [Not available yet](#not-available-yet). |

## Asking versus assuming

Ask only for facts that would change the architecture materially and that you cannot reasonably infer. Ask at most three questions in one message, each with a sensible default the user can accept with "go ahead". Typical critical facts:

- the cloud provider or platform, when the user states none and the choice changes the services shown (Azure, AWS, GCP, on-premises or hybrid);
- scale or criticality, when it decides between single-region, multi-zone or multi-region designs;
- a hard constraint such as data residency, a named compliance regime, or an existing system that must stay.

Everything else is assumed. Make every assumption visible:
- in the diagram, through a card titled `Assumptions`, or labels and sublabels;
- in your reply, as a short list.

Never invent facts presented as real: no SLAs, prices, user counts or compliance certifications. Use clearly marked illustrative values instead, or leave them out.

For an everyday or personal subject, ask for missing personal facts (dates, amounts, rules) instead of inventing them.

## Intent playbooks

### Create an architecture from a description

- Start from the user's goal and the main user journey. Add the components that journey needs, then the supporting tiers (identity, data, messaging, observability) the stated qualities require: "highly available" implies redundancy across zones; "secure" implies identity, a gateway and trust boundaries.
- Use the provider's real service names when a provider is named (for example Azure Front Door, AWS Application Load Balancer, Google Cloud Run), with `brand` marks only when available (`references/brand-marks.md`).
- Show trust and network boundaries with `boundaries` (`region`, `security-group`).
- Keep to what the request needs. No component count is a target.

### Turn a repository into a diagram

- Follow `references/repository-authoring.md`. Trace the requested behaviour in the code and cite evidence with `sources`.
- Pass `--repo-root` to `finalize`.
- If the request is broad ("diagram my repo"), choose the most useful abstraction and say which one you chose.

### Turn a requirements document into an architecture

- Extract the functional scope, actors, integrations and the non-functional requirements: availability, latency, data residency, security, budget.
- Map each requirement to something visible: a component, a boundary, a label or a card.
- List requirements you could not represent in the reply. Do not silently drop them.

### Explain or summarise an architecture

- Use an `explainer` page: the conclusion first, then panels, with native diagrams embedded where they carry the explanation.

## Not available yet

These capabilities are planned and are not part of this version:
- architecture review and scorecards;
- failure and chaos simulation;
- traffic and capacity modelling;
- availability and latency analysis;
- cost estimation;
- workbench scenarios;
- export to Mermaid, draw.io, Structurizr or design documents.

When a user asks for one:

1. Say plainly that this version does not include it yet.
2. Offer the closest available help. Draw the architecture, making the relevant property visible (redundancy, single points of failure you can see in the structure, trust boundaries). Or write an `explainer` that reasons about the question qualitatively.
3. Present such reasoning as your engineering judgement, never as a computed or measured result. Do not produce numbers that look like model output.

## Reporting

Follow the Output section of `SKILL.md`. For architecture requests, also include:
- the assumptions you made;
- the requirements you could not represent;
- for analysis-style questions, a clear line between what the diagram shows and what is your judgement.
