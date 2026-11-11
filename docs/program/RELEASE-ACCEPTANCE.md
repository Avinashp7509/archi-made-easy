# Release acceptance report: Archi-Made-Easy 1.0.0

What was tested before the first public release, how, with what result, and what was not tested. Every figure here was produced by a run on this machine (Windows 11, Node 24.18.0, Chrome, 2026-11-10 and 2026-11-11) and is recorded in the file named beside it. Nothing is described as passed unless it ran and passed.

Sections marked **(final tree)** are filled from the last regression cycle on the exact release commit; see "Revision" at the end.

## 1. Summary

| | |
|---|---|
| Version | 1.0.0, stable channel |
| Repository | `https://github.com/Avinashp7509/archi-made-easy` (not yet created or pushed) |
| Fully tested | the skill's command line and pages on Windows 11 with Chrome; the workbench interface across six viewports and two themes; a clean install from the archive; Claude Code as the agent |
| Partially tested | Linux and macOS (continuous-integration workflows exist and ran upstream, but they have not run on this repository: no push yet); six other agents (installation placement only) |
| Not tested | use by Codex, Copilot, Cursor, OpenCode, Windsurf or Gemini CLI; the website build; the draw.io and Structurizr exports opened in their own tools; discovery through skills.sh |
| Release blockers remaining | none in the product. Publication waits for the owner's approval; CI on the real repository and Skills CLI discovery can only be verified after the first push |

## 2. Regression suites (final tree)

| Suite | Result | Note |
|---|---|---|
| Full unit and integration suite (`npm run test:full`), run in a checkout of the same tree outside OneDrive | _filled after the final cycle_ | The 43 Windows-only baseline failures (symlink permission, path separators, `git init --template=`, 8.3 names) are listed in `docs/program/BASELINE.md`; the pass condition is "no failure outside that set" |
| Serial browser suite (`npm run test:browser -- --concurrency=1`) | _filled after the final cycle_ | |
| Automated visual QA, full matrix (`node scripts/visual-qa.mjs --shots`) | _filled after the final cycle_ | 12 documents, six viewports, two themes |
| Release identity (`node scripts/check-release-identity.mjs`) | pass for 1.0.0 | |
| Golden examples (`node test/golden.mjs`) | pass | every committed example page equals a fresh render |

## 3. Visual QA

Specification: [PHASE5-UX-ADDENDUM.md](PHASE5-UX-ADDENDUM.md). Record: [docs/visual-qa/FINAL-VISUAL-ACCEPTANCE.md](../visual-qa/FINAL-VISUAL-ACCEPTANCE.md). Design system, test matrix, defect register and screenshots are kept under `docs/visual-qa/` for future development; the Playwright scripts are in `docs/visual-qa/tools/`.

Last full matrix before this report (tree `c7342b1`, Phase 6): 744 states, 0 critical, 0 high, 12 medium. Playwright walkthrough of the three flagship examples with real input: 156 states, 0 problems. The final-tree run is in section 2.

**The 12 medium findings** are one inherited behaviour, D-016: on a phone (390 × 844) and a tablet (768 × 1024), the smallest diagram labels render between 4.4 and 6.0px until the reader zooms, because the inherited viewer keeps a 720px minimum diagram width and scrolls it sideways. It affects the ten-component demonstration document (5.5 to 5.9px), the fintech flagship (5.1 to 5.2px), the inherited web-app example, and the workflow and sequence examples. Zoom and pan work; upstream behaves the same. It is accepted for 1.0.0 and recorded as open in the [defect register](../visual-qa/DEFECT-REGISTER.md).

## 4. Clean install from the archive (acceptance tests 1 to 3)

`node scripts/acceptance-clean-install.mjs`, evidence: [acceptance/clean-install-2026-11-10-phase7.json](acceptance/clean-install-2026-11-10-phase7.json). 23 steps, all pass: unpack; install for Claude Code and Codex into an empty home; `doctor` from each copy; `finalize` on the inherited example; for each of the seven showcase documents (three flagships, four provider starting points) `scaffold` (provider examples equal the bundled files), `finalize` at showcase quality, `review`, every preset scenario, every export; then each page opened in Chrome with the network switched off, its workbench started, and its figures equal to `simulate --json` for the same inputs. That run used the Phase 7 candidate archive; the final archive differs from it only in identity strings (section 8).

## 5. Real-agent acceptance (acceptance test 4)

Record: [acceptance/agent-runs/README.md](acceptance/agent-runs/README.md), with one JSON record per run (tokens, cost, commands, the agent's reply) and the pages produced. These curated records stand in for the transcripts that PLAN.md section 9 asks for: the raw event streams are kept out of the repository because they carry the account's session and request identifiers.

Nine prompts, word for word from the product brief, each given once to Claude Code 2.1.219 with the skill freshly installed from the candidate archive, shell access limited to `node`, no network, no sub-agents. Twelve runs in all: 9 passes, 3 failures, each failure diagnosed and rerun once.

| Prompt | Outcome | Cost |
|---|---|---|
| Build a highly available e-commerce architecture on Azure | page, 14 components, review 96 | $3.48 |
| Create a secure banking application architecture | page; provider-neutral by stated assumption | $2.32 |
| Design a multi-region AWS architecture for 10 million users | page | $1.99 |
| Review this solution architecture and identify risks | answer from `review` and `simulate` | $0.56 |
| What happens if the database fails? | first run failed (skill not used); rerun passed from `simulate` | $0.21 + $0.53 |
| Simulate a 20x increase in traffic | first run failed (API stall); rerun passed from `simulate` | $0.08 + $0.53 |
| Optimize this architecture for lower cost | new page; modelled cost $1,108 → $499/month with trade-offs | $1.80 |
| Convert my application repository into an interactive architecture diagram | page with file-and-line evidence | $3.39 |
| Create an architecture from my uploaded requirements document | first run stopped at 30 min; rerun passed in 32 min, 23 components | $6.25 (+ unreported) |

Total reported: $21.13. Every page passes the nine artifact checks and the real-browser layout gate when re-checked independently. No run asked the user for JSON or commands. The first failure was a product defect (the skill description did not cover analysis questions), fixed before the reruns; the other two were an API stall and a time limit during very long reasoning at the machine's `xhigh` effort setting.

## 6. Security

[SECURITY-REVIEW.md](SECURITY-REVIEW.md): threat model, findings S-01 to S-12, what holds, what was not verified.

- S-01 (release blocker, fixed): draw.io labels are HTML, and authored text was escaped once; an authored tag reached draw.io live. Regression tests in `test/workbench-security.test.mjs` and `test/workbench-export.test.mjs`; the check finds 9 live tags with the pre-fix exporter and none now. S-02 (Markdown) and S-03 (Mermaid) fixed with the same tests.
- The rendered page, the child-diagram view and the exports were attacked with a document whose every text field holds script, image, SVG, iframe and link payloads: no element, handler or request results, in the page, in a child page, in all nine modes in a real browser, or in any export.
- `npm audit`: 0 vulnerabilities in the repository and in `archi-made-easy/`. The website toolchain (`website/`, not part of the release) has 7 open advisories (S-07).
- A release-readiness audit on 2026-11-11 (read-only reviewers for packaging, licences, secrets and personal data, page and command-line security, documentation claims and export escaping, each finding checked by a second reviewer) added S-08 to S-12: carriage returns, trailing backslashes, `${NAME}` substitutions and Mermaid directives could still add lines, directives or blocks to the Structurizr, Mermaid and Markdown exports (S-12, high, fixed and tested); a pinned brand in a document from someone else made the command line contact the host it names, now refusable with `ARCHI_MADE_EASY_BRAND_CAPTURE_DISABLED=1` (fixed, tested); `export --force` wrote through a directory or link (fixed; directory case tested here, link case where links can be created); a level marker could name the page's JSON data (accepted for 1.0.0, no path from authored text); the brand user agent carried an inherited version (fixed, tested).
- Secrets and personal data: no credential, key or token in any tracked file or commit (synthetic test values only). This machine's workspace path appeared in three files of earlier commits; the history of `main` was rewritten to remove it before any push (see [LAUNCH.md](release/LAUNCH.md#before-the-first-push)). The curated agent-run records carry no machine path, session or request identifier.
- No certification is claimed. This is a review by the implementing agent with tests, not an independent audit.

## 7. Branding, licence and attribution

[BRANDING-AUDIT.md](BRANDING-AUDIT.md): the upstream name appears only in the attribution text (NOTICE, LICENSE-MIT, and the notice every page embeds); 25 images re-captured and 3 new ones captured from running pages (28 in the capture manifest); the owner `Avinashp7509` applied everywhere, with the placeholder remaining only in the code that rejects it.

Licence: Apache License 2.0. `NOTICE` reproduces the upstream notice in full and states the derivation and modifications; `LICENSE-MIT` preserves the historical MIT grant; `THIRD_PARTY_NOTICES.md` covers the bundled font, icon data and vendored code. All four ship in the archive.

## 8. Release archive

_Filled after the final build:_ file, SHA-256, size, entry count, and the result of `verify-release-zip`: every entry under `archi-made-easy/`; no `node_modules`, lockfile, tests or receipts; version identifiers 1.0.0; the four legal files present; no placeholder, no development version string, no machine path; the skill code equal to the candidate the agent runs used except for identity strings.

## 9. Platforms and agents

| Platform or agent | Status | Evidence |
|---|---|---|
| Windows 11, Node 24, Chrome | tested | this report |
| Node 18 and 20 | not run here; CI matrix | `.github/workflows/ci.yml` |
| Linux | not run here; CI (compatibility suite on Node 18, 20 and 24, the canonical suite on Node 22, full regression, browser gate, package smoke) | runs after the first push |
| macOS | not run here; CI (package smoke from the archive, with the delivery-lock tests) | runs after the first push |
| Windows in CI | not run there yet; CI (package smoke, delivery-lock tests, Windows path contracts on Node 22 and 24) | runs after the first push |
| Claude Code | exercised, nine prompts | section 5 |
| Codex, GitHub Copilot, Cursor, OpenCode, Windsurf, Gemini CLI | installation placement verified; not exercised | `test/installer.test.mjs`, clean-install evidence |
| Other Agent Skills clients | documented only | |

## 10. Known limitations

- Figures are an analytical model of the declared design, labelled as such; not measurements, load tests or provider commitments.
- Diagram labels under 6px on phones and tablets before zooming (D-016).
- Workbench text is English only; translations of the viewer were not reviewed by native speakers.
- The draw.io and Structurizr exports were verified structurally and by parsing them as their consumers would, not by opening them in diagrams.net or Structurizr. The Mermaid exports were last checked against the real Mermaid parser before the escaping change (S-03).
- Create requests took about 9 to 32 minutes with Claude Code at `xhigh` effort (one run, 9a, was still working when the 30-minute limit stopped it); nearly all of that is the model reasoning, not the skill (agent-runs README, "Why the create runs take so long").
- The website (`website/`) is not built or published for this release.

## 11. Revision

_Filled at the end:_ the tested tree, the release commit, and any documentation-only commit after it.
