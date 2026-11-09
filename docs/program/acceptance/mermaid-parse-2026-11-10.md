# Mermaid export checked against the real parser

Date: 2026-11-10. Library: Mermaid 11.4.1 (`mermaid.esm.min.mjs` from jsDelivr), run in Chrome through a local page. `mermaid.parse()` and `mermaid.render()` were called on every block.

## What was checked

29 diagrams:
- all nine reference patterns scaffolded on the Azure pack, each exported as a flowchart, a C4 diagram and a sequence diagram (27 diagrams);
- one flowchart and one C4 diagram with hostile labels: quotes, square brackets, braces and a pipe character.

## Result

| Run | Parsed and rendered | Failed |
|---|---|---|
| First | 27 of 29 | 2 |
| After the fix | 29 of 29 | 0 |

The two failures were the sequence diagrams for `hybrid` and `migration-landing-zone`. Both have a component with the id `link`, which is a keyword in Mermaid sequence diagrams (`Expecting '+', '-', 'ACTOR', got 'link'`).

Fix: `workbench/exporters/shared.mjs` now prefixes ids that are keywords in Mermaid or Structurizr. `test/workbench-export.test.mjs` has a regression test ("ids that are keywords in the target grammars are prefixed").

## Not covered

- This check needs network access to load Mermaid, so it is not part of the automated test suite.
- The draw.io and Structurizr exports have not been opened in diagrams.net or Structurizr. They are checked structurally by tests only.
