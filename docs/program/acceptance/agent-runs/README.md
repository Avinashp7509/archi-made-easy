# Real-agent acceptance runs

Acceptance test 4 of [PLAN.md](../../PLAN.md): each of the nine example prompts of the product brief, given word for word to a real agent with the skill freshly installed. Harness: [`scripts/acceptance-agent-prompts.mjs`](../../../../scripts/acceptance-agent-prompts.mjs). Fixtures: [`test/fixtures/acceptance/`](../../../../test/fixtures/acceptance/).

## Setup

- Agent: Claude Code 2.1.219, headless (`-p`), on Windows 11, with the account and model configured on the machine (Claude Opus 5, plus Claude Haiku 4.5 for Claude Code's own small tasks).
- For each run: a fresh project folder outside the repository; the skill installed into it from the release archive with the bundled installer (project scope); the prompt's fixture copied in.
- Tools: Bash, Read, Write, Edit, Glob, Grep, Skill, TodoWrite (Claude Code's to-do list). Pre-approved shell commands: `node` only, in permission mode `dontAsk`. No MCP servers, no web access, no sub-agents. Spending cap $15 per turn.
- Claude Code ran with the settings configured on the machine, including reasoning effort `xhigh`. That setting is why the create runs are long: the agent composes the whole architecture document in one reasoning pass before writing it (runs 1, 8, 9: reasoning blocks of 54,000 to 64,000 estimated tokens; 9a restarted twice at the 64,000 mark and ran out of time).
- No automatic retries. A run that failed was rerun once, only after a diagnosis, and both runs are reported.
- Pages were re-checked independently: the nine artifact checks and the real-browser layout gate on a copy of each page alone.

Archives: candidate A `release-candidate.zip` (Phase 7 candidate A: before the skill description was widened); candidate B `release-candidate-b.zip` (Phase 7 candidate B: the skill description names review, failure, load and cost questions).

## Results

| Run | Prompt | Outcome | Skill used | Commands run | Page | Time | Cost (USD) |
|---|---|---|---|---|---|---|---|
| [1](run-1.json) | Build a highly available e-commerce architecture on Azure. | **pass** | yes | scaffold, doctor, finalize | [page](pages/run-1-azure-ha-ecommerce.html): checks 9/9, layout pass | 1263 s | 3.48 |
| [2](run-2.json) | Create a secure banking application architecture. | **pass** | yes | scaffold, doctor, finalize | [page](pages/run-2-secure-banking-platform.html): checks 9/9, layout pass | 548 s | 2.32 |
| [3](run-3.json) | Design a multi-region AWS architecture for 10 million users. | **pass** | yes | scaffold, finalize | [page](pages/run-3-multi-region-aws.html): checks 9/9, layout pass | 541 s | 1.99 |
| [4](run-4.json) | Review this solution architecture and identify risks. | **pass** | yes | review, simulate | — | 99 s | 0.56 |
| [5a](run-5a.json) | What happens if the database fails? | **fail** (see diagnosis) | no | none | — | 61 s | 0.21 |
| [5b](run-5b.json) | What happens if the database fails? | **pass** | yes | simulate, review | — | 77 s | 0.53 |
| [6a](run-6a.json) | Simulate a 20x increase in traffic. | **fail** (see diagnosis) | no | none | — | 572 s | 0.08 |
| [6b](run-6b.json) | Simulate a 20x increase in traffic. | **pass** | yes | simulate | — | 72 s | 0.53 |
| [7](run-7.json) | Optimize this architecture for lower cost. | **pass** | yes | simulate, help, review, finalize | [page](pages/run-7-cost-optimized.html): checks 9/9, layout pass | 346 s | 1.80 |
| [8](run-8.json) | Convert my application repository into an interactive architecture diagram. | **pass** | yes | finalize | [page](pages/run-8-parcelpoint-architecture.html): checks 9/9, layout pass | 949 s | 3.39 |
| [9a](run-9a.json) | Create an architecture from my uploaded requirements document. | **fail** (see diagnosis) | yes | scaffold | — | 1800 s | not reported |
| [9b](run-9b.json) | Create an architecture from my uploaded requirements document. | **pass** | yes | scaffold, finalize | [page](pages/run-9b-carelink-architecture.html): checks 9/9, layout pass | 1925 s | 6.25 |

Total reported cost: **$21.13** (run 9a was stopped before Claude Code reported its cost; it is not included).

## Diagnoses of the failed runs

- **5a.** The agent did not use the skill: it read the document and reasoned by hand, with no model run. The skill description named only diagram creation. Fixed in candidate B (description widened); rerun as 5b.
- **6a.** API error "Response stalled mid-stream" after two tool calls; the skill was not reached. Not a product failure. Rerun once as 6b.
- **9a.** Stopped by the harness time limit (30 minutes) while the agent was still authoring: one thinking block of about 64,000 tokens with two restarts, consistent with the stalled streams of 6a. No result record, so its cost was not reported. Rerun once as 9b with a 60-minute limit.

## What the passing runs show

- No run asked the user for JSON, a schema or a command. Every create request produced an interactive page that passes the nine artifact checks and the real-browser layout gate when re-checked here. Runs 1, 2, 3 and 7 carry an Assumptions card; run 9 an "Assumptions and open questions" card; run 8, a diagram of a repository backed by file-and-line evidence, states what the repository lacks instead. Every create reply except run 8's lists the assumptions made; run 8's states its scope (a runtime overview, not a file map) and that the folder is not a Git checkout.
- Analysis questions (review, database failure, 20x load, lower cost) were answered by running `review` and `simulate`, with every figure called modelled and the assumed inputs named, once the skill description covered them (5b, 6b, 7; 4 did so already on candidate A).
- Requests that gave no figures produced no invented figures: runs 1, 2 and 3 say so explicitly.
- The agent found real inconsistencies in the document it was asked to review (cards that contradicted the data). They are in the fixture, which is kept unchanged as the record.

## Why the create runs take so long

Measured from the timestamps in each run's event stream (the streams themselves are not published: they carry account session and request identifiers):

| Run | Total | Model generating (API time) | The skill's commands | Output tokens | Longest single model turn |
|---|---|---|---|---|---|
| 1 | 1,260 s | 1,245 s | 17 s | 97,549 | 790 s, reasoning of about 63,900 tokens |
| 8 | 947 s | 939 s | 10 s | 72,666 | 702 s, about 53,750 tokens |
| 9b | 1,923 s | 1,904 s | 20 s | 152,752 | 820 s, about 63,900 tokens |

- Almost all the time is the model generating, not the skill. Each `finalize` (validation, nine artifact checks, real-browser layout gate) took 4 to 7 seconds; `scaffold` about a second.
- Most of the generated tokens are reasoning before the first candidate is written: the agent placed every component and checked the geometry in its head, up to the reasoning limit of about 64,000 tokens at the machine's `xhigh` effort setting. In 9b this happened between reading the schema (80 s) and writing the first candidate (1,501 s). The two later repair rounds after `finalize` reported its findings took 163 s and 80 s.
- The skill's own guidance asked for that up-front work: `references/authoring-defaults.md` told the agent to trace every relationship and budget label space in pixels "before writing positions".

**Change made for 1.0.0.** The guidance now tells the agent to keep that pass short: place by rows and columns, write the candidate, and let `finalize` measure the layout and name each repair; for about 15 components or more, write the main journey first, finalize it, then add the rest (`references/authoring-defaults.md`, "Layout and routing"; `references/operational-model.md`). Whether that shortens real runs is checked by one rerun of prompt 9 on the final archive, recorded below as run 9c.

Token counts per run are in each run's record (`usage`). Each record also holds the agent's final reply, with this machine's paths replaced by `<temp>` and `<home>` and each run's folder name replaced by `project`.
