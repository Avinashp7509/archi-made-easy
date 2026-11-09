# Attribution

Archi-Made-Easy is built on an open-source foundation. This file records where that foundation came from, what was carried over, and what was not.

## Origin

| | |
|---|---|
| Original work | Archify, https://github.com/tt-a1i/archify |
| Imported revision | `11b0d6031853bdae89eed57e7979aabbf0034097` (branch `main`, 2026-11-09) |
| Licence | Apache License 2.0. Contributions before commit `25cf370` are also available under MIT; see `LICENSE-MIT`. |
| Original copyright | Copyright (c) 2026 tt-a1i (Archify); Copyright (c) 2025 Cocoon AI |
| Earlier origin | https://github.com/Cocoon-AI/architecture-diagram-generator |

The first commit of this repository is an unmodified import of that revision. Every later commit is a change made for Archi-Made-Easy.

## What was carried over

- The renderers for the ten diagram types and the explainer document type.
- The JSON schemas, the validation and quality gates, the browser checks and the standalone HTML viewer.
- The test suite, build and packaging scripts, and the reference documentation for authoring and delivery.
- All of the above were renamed to the Archi-Made-Easy identity and remain under Apache-2.0. Legal notices are unchanged: `LICENSE`, `LICENSE-MIT`, and the original notice reproduced in `NOTICE`.

## What was not carried over

These records belong to the original project rather than to the software, so they are not part of this repository:
- its development journal, review evidence and research notes;
- its changelog and roadmap;
- translated READMEs;
- articles and screenshots;
- community channels, sponsor material and donation details;
- contributor tooling and its published integration packages.

They remain available in the original repository at the imported revision.

## Third-party components

Third-party components keep their own licences. See `THIRD_PARTY_NOTICES.md` and the licence files beside those components. This covers Simple Icons brand-mark data, the JetBrains Mono font, and the vendored Mermaid-compatible renderer used by explainers.

The maintainer skills in `.agents/skills/simplify-codebase` and `.agents/skills/test-value` come from https://github.com/tt-a1i/simplify-codebase and https://github.com/tt-a1i/test-value and keep their MIT licences.

## No endorsement

Archi-Made-Easy is independent. It is not affiliated with, sponsored by or endorsed by the authors of the original work. Their names appear only to attribute origin.
