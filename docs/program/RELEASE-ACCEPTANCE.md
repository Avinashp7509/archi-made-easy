# Release acceptance report: Archi-Made-Easy 1.0.0

What was tested before the first public release, how, with what result, and what was not tested. Every figure here was produced by a run on this machine (Windows 11, Node 24.18.0, Chrome, 2026-11-10 and 2026-11-11) and is recorded in the file named beside it; the full-suite and browser-suite logs are kept on this machine, outside git, and are named where they are cited. Nothing is described as passed unless it ran and passed.

Sections marked **(final tree)** are filled from the last regression cycle on the exact release commit; see "Revision" at the end.

## 1. Summary

| | |
|---|---|
| Version | 1.0.0, stable channel |
| Repository | `https://github.com/Avinashp7509/archi-made-easy` (not yet created or pushed) |
| Fully tested | the skill's command line and pages on Windows 11 with Chrome, on the release tree; the workbench interface across six viewports and two themes; a clean install from the release archive; Claude Code as the agent |
| Partially tested | Linux and macOS (continuous-integration workflows exist and ran upstream, but they have not run on this repository: no push yet); six other agents (installation placement only) |
| Not tested | use by Codex, Copilot, Cursor, OpenCode, Windsurf or Gemini CLI; the website build; the draw.io and Structurizr exports opened in their own tools; discovery through skills.sh |
| Release blockers remaining | none in the product. Publication waits for the owner's approval; CI on the real repository and Skills CLI discovery can only be verified after the first push |

## 2. Regression suites (final tree)

| Suite | Result | Note |
|---|---|---|
| Full unit and integration suite (`npm run test:full`, which includes the generated-file checks and the golden examples), run in a checkout of the same tree outside OneDrive | **pass**: 3,580 tests, 3,338 pass, 43 fail, 198 skipped; the 43 failures are exactly the Phase 0 baseline set (none new, none gone); log: `.baseline/release-1.0.0/unit-outside-onedrive.txt` and `unit-failing.txt` (kept on this machine, outside git) | The 43 Windows-only baseline failures (symlink permission, path separators, `git init --template=`, 8.3 names) are listed in `docs/program/BASELINE.md`; the pass condition is "no failure outside that set" |
| Serial browser suite (`npm run test:browser -- --concurrency=1`) | **pass**: 316 tests, 309 pass, 0 fail, 7 skipped | Chrome on Windows 11; log: `.baseline/release-1.0.0/browser-serial.txt` (kept on this machine, outside git) |
| Automated visual QA, full matrix (`node scripts/visual-qa.mjs --shots`) | **pass**: 744 states, 0 critical, 0 high, 12 medium (D-016, section 3); 182 screenshots | 12 documents, six viewports, two themes; report: `docs/visual-qa/automated-report.json` |
| Release identity (`node scripts/check-release-identity.mjs`) | pass for 1.0.0 | |
| Golden examples (`node test/golden.mjs`) | pass | every committed example page equals a fresh render; the cycle regenerated every derived page and none changed |
| Release archive rebuilt from the tested tree with Node 22 | byte-identical to the committed `archi-made-easy.zip` | section 8 |

## 3. Visual QA

Specification: [PHASE5-UX-ADDENDUM.md](PHASE5-UX-ADDENDUM.md). Record: [docs/visual-qa/FINAL-VISUAL-ACCEPTANCE.md](../visual-qa/FINAL-VISUAL-ACCEPTANCE.md). Design system, test matrix, defect register and screenshots are kept under `docs/visual-qa/` for future development; the Playwright scripts are in `docs/visual-qa/tools/`.

Final tree (section 2): 744 states, 0 critical, 0 high, 12 medium, the same result as the Phase 6 tree (`c7342b1`). Playwright walkthrough of the three flagship examples with real input, on the Phase 6 tree: 156 states, 0 problems; after it, the page changed only in its exporter engine (the Handoff downloads: the escaping of S-01 to S-03 and S-12), its version string and the repository link in the guide's credit (the owner placeholder replaced by `Avinashp7509`); the browser suite and the matrix above cover the final page.

**The 12 medium findings** are one inherited behaviour, D-016: on a phone (390 × 844) and a tablet (768 × 1024), the smallest diagram labels render between 4.4 and 6.0px until the reader zooms, because the inherited viewer keeps a 720px minimum diagram width and scrolls it sideways. It affects the ten-component demonstration document (5.5 to 5.9px), the fintech flagship (5.1 to 5.2px), the inherited web-app example, the workflow and sequence examples, and the long-labels test document (6.0px at 768 × 1024). Zoom and pan work; upstream behaves the same. It is accepted for 1.0.0 and recorded as open in the [defect register](../visual-qa/DEFECT-REGISTER.md).

## 4. Clean install from the archive (acceptance tests 1 to 3)

`node scripts/acceptance-clean-install.mjs --zip archi-made-easy.zip`, on the committed 1.0.0 archive (section 8), evidence: [acceptance/clean-install-2026-11-11-release.json](acceptance/clean-install-2026-11-11-release.json). 23 steps, all pass: unpack; install for Claude Code and Codex into an empty home; `doctor` from each copy; `finalize` on the inherited example; `scaffold` of the four provider patterns (each equals the bundled example); for each of the seven showcase documents (three flagships, four provider starting points) `finalize` at showcase quality, `review`, every preset scenario, every export; then each page opened in Chrome with the network switched off, its workbench started, and its figures equal to `simulate --json` for the same inputs. An earlier run on the Phase 7 candidate archive gave the same result ([acceptance/clean-install-2026-11-10-phase7.json](acceptance/clean-install-2026-11-10-phase7.json)).

## 5. Real-agent acceptance (acceptance test 4)

Record: [acceptance/agent-runs/README.md](acceptance/agent-runs/README.md), with one JSON record per run (tokens, cost, commands, the agent's reply) and the pages produced. These curated records stand in for the transcripts that PLAN.md section 9 asks for: the raw event streams are kept out of the repository because they carry the account's session and request identifiers.

Nine prompts, word for word from the product brief, each given once to Claude Code 2.1.219 with the skill freshly installed from a candidate archive, shell access limited to `node`, no network, no sub-agents. Twelve runs on the candidates: 9 passes, 3 failures, each failure diagnosed and rerun once. Then one run on the final 1.0.0 archive (9c, prompt 9, the longest request): pass. Thirteen runs in all, 10 passes.

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
| Create an architecture from my uploaded requirements document | first run stopped at 30 min; rerun passed in 32 min, 23 components; on the final archive passed in 51 min, 22 components | $6.25 + $7.87 (+ unreported) |

Total reported: $29.00 ($21.13 on the candidates, $7.87 for run 9c). Every page passes the nine artifact checks and the real-browser layout gate when re-checked independently. No run asked the user for JSON or commands. The first failure was a product defect (the skill description did not cover analysis questions), fixed before the reruns; the other two were an API stall and a time limit during very long reasoning at the machine's `xhigh` effort setting. Run 9c also checked a guidance change meant to shorten that reasoning; it did not (agent-runs README, "Why the create runs take so long").

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

| | |
|---|---|
| File | `archi-made-easy.zip` (committed in the release commit; attached to the GitHub Release by the release workflow, which rebuilds it and compares byte for byte) |
| SHA-256 | `ca480ef81f1c65751538b0ac69fa0fea01c774153a7a22995b577d4bb4b162ef` |
| Size | 6,951,339 bytes, 257 entries |
| Built with | `scripts/build-zip.sh` and official Node 22 (bundled zlib 1.3.1-e00f703), outside OneDrive, from a checkout of a snapshot whose tree equals the release commit's apart from the archive itself, then committed in the release commit; rebuilt from the tested tree with the same bytes (compared with `cmp`; the comparison is not logged separately) |

Checked by unpacking it into an empty folder (a scratch script over `scripts/release-archive.mjs`), all pass: every entry under `archi-made-easy/`; no `node_modules`, lockfile, test, receipt, log or leftover replace folder; `package.json` and `skill-release.json` at 1.0.0, stable channel, repository `https://github.com/Avinashp7509/archi-made-easy` and the fixed manifest URL; `SKILL.md` metadata version 1.0; template generator 1.0.0; `LICENSE`, `LICENSE-MIT`, `NOTICE` (upstream notice and the derivation statement) and `THIRD_PARTY_NOTICES.md` present; no `OWNER` placeholder outside the guard that rejects it; no development version string; the upstream name only inside notice text; no machine path.

Difference from the archives the agent runs used: besides identity strings, the final archive carries the 1.0.0 fixes made after those runs (the export escaping of S-12, the brand switch of S-08, the export output check of S-09, the installer path comparison, the brand user agent) and the guidance changes in `references/` (authoring defaults, operational model, intents, brand marks, installation), with the template and rendered examples regenerated. Candidate A also had the narrower skill description. Run 9c (section 5) is the agent run on this exact archive; the clean install (section 4) ran on it too.

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
- Create requests took about 9 to 51 minutes with Claude Code at `xhigh` effort, the requirements-document request the longest (32 and 51 minutes; once not finished within 30 minutes). Nearly all of that is the model reasoning before its first draft, which can reach the reply's output limit and restart; the skill's commands take seconds (agent-runs README, "Why the create runs take so long"). Lower effort settings were not measured.
- The website (`website/`) is not built or published for this release.

## 11. Revision

| | |
|---|---|
| Release commit | `9802361` "Prepare the 1.0.0 release candidate", tree `105a7c24b4ca74a5c2db88031336a61fc97ab313` |
| Tested tree | the release commit's tree: the final cycle regenerated every derived file from it without a change, ran the full unit suite in a checkout of it outside OneDrive and the serial browser suite and visual matrix in the workspace on the same tree, and rebuilt the same archive; it differed only by the visual-QA screenshots it deletes and captures again |
| Agent run 9c and clean install | on the archive committed in the release commit |
| Documentation commit | the commit that follows the release commit and adds this record: it changes documentation, the README and the visual-QA screenshots and report only; no file under `archi-made-easy/` and not the archive. Tag `v1.0.0` on it (LAUNCH.md) |
| History | rewritten twice before any push: once to remove a local path, once to replace the personal e-mail address in commit metadata with the owner's GitHub no-reply address (trees unchanged); the identifiers above are those after both rewrites. First rewrite: to remove a local path (LAUNCH.md, "Before the first push"); commit identifiers before `9802361` changed then; in three files the path line was replaced in every commit that held it, and every other file is unchanged |
