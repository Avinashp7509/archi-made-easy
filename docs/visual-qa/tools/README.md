# Visual QA tools

## capture-baseline.playwright.js

Photographs the upstream viewer and the pre-redesign Archi-Made-Easy viewer at the same viewports and in the same states. It produced `../upstream-baseline/` and `../archi-made-easy-before/`. It is kept so the baseline can be reproduced; it is not part of the test suite.

It runs through the Playwright MCP tool (`browser_run_code`, with this file as `filename`). The pages it opens are served from a scratch folder on `127.0.0.1:8766`:

| File | Rendered from | With |
|---|---|---|
| `up-web-ha.html`, `up-web-app.html`, `up-workflow.html`, `up-sequence.html` | the `web-ha` document with its operational fields removed (upstream's schema rejects them), and upstream's own examples | the upstream renderer, from a checkout of tt-a1i/archify at `11b0d60` |
| `before-web-ha.html`, `before-web-app.html`, `before-workflow.html`, `before-sequence.html` | the same documents | this repository's renderer at git ref `refs/backup/phase5-functional` |

Rules followed for the upstream capture:

- the upstream checkout is separate from this repository and was not modified (`git status` clean before and after);
- rendered pages are written outside that checkout;
- screenshots are taken from the running page; none is edited.

## The repeatable QA

The automated matrix is `scripts/visual-qa.mjs`; see [PLAYWRIGHT-TEST-MATRIX.md](../PLAYWRIGHT-TEST-MATRIX.md). It does not need Playwright.
