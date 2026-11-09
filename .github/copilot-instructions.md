# Copilot instructions

This repository is the source of **Archi-Made-Easy**, an Agent Skill that turns plain-language requests into validated, interactive architecture and diagram artifacts (standalone HTML).

## When a user asks for an architecture or a diagram

Follow `archi-made-easy/SKILL.md`. It is the single source of truth for routing, authoring and delivery. In short:

1. Read the request in plain language. For anything beyond "draw X", read `archi-made-easy/references/intents.md`.
2. Author the candidate JSON yourself. Never ask the user for JSON or schema details.
3. Run `node archi-made-easy/bin/archi-made-easy.mjs finalize <type> <candidate.json> <output.html> --quality showcase --json`. A non-zero exit is never success.
4. Reply with a link to the HTML, the key takeaway, and every assumption you made.

Review, simulation and cost analysis are not in this version; say so rather than inventing results.

## When changing this repository

Follow `AGENTS.md` and `CONTRIBUTING.md`. Run `npm test` for quick checks and `npm run test:full` before integration. Never edit generated files by hand (`archi-made-easy/assets/template.html`, `archi-made-easy/renderers/shared/generated-*.mjs`, rendered examples); regenerate them with their scripts.
