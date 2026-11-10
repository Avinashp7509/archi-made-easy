# Intents: from plain language to an artifact

Read this when the user describes what they want in their own words rather than naming a diagram type. Users never need to know the schemas, JSON, CLI or notation; you translate.

## Contents

- [How to handle any request](#how-to-handle-any-request)
- [Asking versus assuming](#asking-versus-assuming)
- [Intent playbooks](#intent-playbooks)
- [Review, what-if and cost](#review-what-if-and-cost)
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
| Compare | "what changed between these two designs", "compare these options", "before and after" | `review <after> --against <before>` for measures and findings; `review --alternatives` for options in one document; `compare architecture <base> <head>` for a visual diff. See [Exports, comparison and the workbench](workbench-ui-and-exporters.md). |
| Export | "give me Mermaid / draw.io / Structurizr / a design document", "an SVG or PNG" | `export <format>` for text formats (see [Exports, comparison and the workbench](workbench-ui-and-exporters.md)); the viewer's Export menu for images |
| Review | "review this architecture", "identify risks", "is this sound?" | `review <architecture.json>` (see [Review, what-if and cost](#review-what-if-and-cost)) |
| What-if | "what if the database fails", "simulate 20x traffic", "what is the blast radius" | `simulate <architecture.json>` with a scenario, a fault or a multiplier |
| Optimise | "lower the cost", "make it more resilient" | `review` and `simulate --cost`, change the document, rerun to show the difference |

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

- Start from a reference pattern when one is close: read [Operational model and scaffolds](operational-model.md), run `scaffold <pattern> --provider <provider> --out candidate.json`, then adapt the candidate. "Highly available e-commerce on Azure" is `web-ha` on `azure`; "secure banking application" is `zero-trust`; "multi-region for 10 million users" is `multi-region-active-active`.
- Record the facts the user gave (targets, load, budget, compliance) in `workbench.requirements` and the components' `operational` fields, as that reference describes. Leave out anything they did not state.
- When no pattern fits, author directly: start from the user's goal and the main user journey. Add the components that journey needs, then the supporting tiers (identity, data, messaging, observability) the stated qualities require: "highly available" implies redundancy across zones; "secure" implies identity, a gateway and trust boundaries.
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

## Review, what-if and cost

These questions are answered by running the model on an architecture document, never by estimating in your head.

1. Get the document. Use the one already made in this conversation or supplied by the user. If there is only a description, create the architecture first (above), then analyse it.
2. Run the command. Read the matching reference for options and for how to explain the result:
   - review, risks, scorecard: `review <architecture.json>` and [Architecture review rules](arb-well-architected-rules.md);
   - failures, blast radius, traffic spikes: `simulate <architecture.json> --scenario <a-f>`, `--fault <id>=<state>` or `--multiplier <n>`, and [Failure and what-if simulation](chaos-and-failure-simulation.md);
   - capacity, latency, availability, cost: `simulate … --cost` and [Capacity, latency, availability and cost](capacity-latency-and-finops.md);
   - failure modes table: `simulate … --fmea`.
3. Answer from the output. Every result is an analytical model of the declared design. Say so, and say which inputs were assumed when they affect the conclusion.
4. For "fix it" or "optimise it": change the document (add redundancy, a circuit breaker, a fallback, a cheaper tier), rerun, and report the before and after.

Never present a modelled number as measured, guaranteed, or a provider commitment. If the user gives real figures, record them in the document and rerun.

## Not available yet

These capabilities are planned and are not part of this version:
- command-line SVG and PNG export (use the viewer's Export menu);
- child diagrams opened by drilling into a component;
- workbench text in languages other than English;
- saving a change made in the workbench back into the document (edit the document and render again).

When a user asks for one, say plainly that this version does not include it yet, and offer the closest available help: the command-line review and simulation above, or the existing HTML viewer.

## Reporting

Follow the Output section of `SKILL.md`. For architecture requests, also include:
- the assumptions you made;
- the requirements you could not represent;
- for analysis questions, that the result is a model of the declared design, and which inputs were assumed.
- for an architecture page, that the Workbench button in the toolbar and the mode rail on the left (Review, Simulate, Optimize and the others) let them try failures, load and changes themselves (see [Exports, comparison and the workbench](workbench-ui-and-exporters.md)).
