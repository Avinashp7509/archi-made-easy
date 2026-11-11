# Phase 0 baseline

Imported revision: upstream `11b0d6031853bdae89eed57e7979aabbf0034097`, unmodified (repository commit `964b571`).

| | |
|---|---|
| Date | 2026-11-10 |
| Machine | Windows 11 Home 10.0.26200; workspace inside OneDrive |
| Node | v24.18.0 (zlib 1.3.1-e00f703) |
| npm | 11.16.0 |
| Git | 2.54.0.windows.1 (repository-local `core.autocrlf=false`) |
| Browsers | Chrome, Edge |
| Not installed | ffmpeg, agent CLIs (`claude`, `codex`, `cursor-agent`), GitHub CLI |

Raw logs are kept outside git in `.baseline/` (`doctor.txt`, `validate.txt`, `test-full.txt`, `test-full.failing.txt`, `test-browser.txt`).

## Results

| Gate | Command | Result |
|---|---|---|
| Doctor | `node archify/bin/archify.mjs doctor` | exit 0; every runtime, renderer, schema and example check `[ok]` |
| Validate | `validate <type> <file> --json` on every example document | 30 of 30 pass (26 in `archify/examples/`, 4 in `examples/`); all 11 types; 9 checks per receipt |
| Generated files | part of `npm run test:full` | `check:viewer`, `check:brand-marks`, `check:validators`, `check:release-identity` (3.2.0) and `golden.mjs` (renders and template freshness) all pass |
| Unit and integration | `npm run test:full` | 3,347 tests: 3,108 pass, 43 fail, 196 skipped; 457 s |
| Browser, parallel (CI default) | `npm run test:browser` | 297 tests: 240 pass, 50 fail, 7 skipped; 655 s |
| Browser, serial | `node scripts/run-browser-tests.mjs --concurrency=1` | 297 tests: 289 pass, 1 fail, 7 skipped; 933 s. The runner ran the full inventory. |
| Core workflow | `finalize architecture archify/examples/web-app.architecture.json … --quality showcase --json`, twice | exit 0; all four gates `pass` (validate, deliver, check, browser-check) |

## The 43 failures are Windows-platform failures

None is caused by a change in this repository; the imported tree is unmodified. Upstream's CI runs these suites on Ubuntu. Grouped by cause:

| Cause | Count | Test files |
|---|---|---|
| Creating symlinks needs Windows Developer Mode or administrator rights (`EPERM: operation not permitted, symlink`) | 21 | `output-path` (11), `update-notifier` (3), `meta-output-contract` (2), `workflow-migration` (2), `explainer-diagrams`, `explainer-sources`, `preview` |
| Tests expect `/` in spawned test-file arguments; the runner passes `\` on Windows | 8 | `repository-test-runner` (6), `browser-gate` (2) |
| Git for Windows rejects `git init --template=` (`unable to access '\\.\nul': Invalid argument`) | 8 | `repository-evidence-replacement` |
| visual-check staging folder (`.archify-visual-check-*`) left behind after earlier symlink-dependent steps fail on Windows | 5 | `visual-check` |
| 8.3 short names are disabled on this volume | 1 | `delivery-sidecar-path` |

The 196 skipped tests are skipped by the tests themselves: unavailable symlinks, `ARCHIFY_CHROME` not set during the non-browser run, or a platform guard.

## Browser suite: parallel failures are Chrome teardown on Windows

- In the parallel run, 40 of the 50 failures are one error: `Chrome did not exit; retained temporary profile`. The rest follow from it (a missing observation, an incomplete cleanup diagnostic, or a gate receipt failing for the same reason).
- Run serially, the same 297 tests give 289 passes. The one remaining failure, `motion-governor-browser`, is intermittent. Run alone twice it passed once and failed once. Its failure was a cleanup error (`EPERM` removing the Chrome profile folder Chrome still held), never an assertion.
- **Conclusion:** no browser assertion fails on this machine when Chrome instances are not competing. Serial mode (`--concurrency=1`) is the reliable local browser gate for later phases.

## Classification of all unresolved failures

| Class | Item | Affects users? | Disposition |
|---|---|---|---|
| Environment | Symlink tests need Windows Developer Mode (21 tests) | No | Documented. Run on a Linux or macOS CI runner, or with Developer Mode enabled. |
| Environment | 8.3 short names disabled on this volume (1 test) | No | Documented |
| Upstream test defect | Runner and browser-gate tests assume `/` in spawned arguments (8 tests) | No | Fix when Windows joins CI (Phase 7) |
| Upstream test defect | `git init --template=` fails on Git for Windows (8 tests) | No | Fix when Windows joins CI (Phase 7) |
| Upstream test defect | visual-check leaves a staging folder after symlink steps fail (5 tests) | No | Follows the symlink limitation |
| **Upstream product defect (Windows robustness)** | Removing the temporary Chrome profile can fail with `EPERM` while Chrome is still releasing files. The browser check then fails even though every visual assertion passed. Intermittent locally; frequent with parallel Chrome. | Yes, intermittently, through `browser-check` and `finalize` on Windows | Fix planned: bounded retry with backoff for profile removal on Windows, and a warning rather than a failure when only cleanup of our own temporary folder fails. Scheduled for Phase 2, where the installed skill must pass `finalize` reliably. |

**Not verified on this machine:**
- ffmpeg-dependent WebM tests (`npm run test:webm`);
- the website build (its Astro dependencies are not installed);
- zip byte-identity against CI's Node 22 build (`zip-freshness`).

**Comparison rule for later phases:** after any change, the set of failing tests on this machine must equal `.baseline/test-full.failing.txt`, with test names mapped through the identity migration. A new failure blocks the phase.

**Follow-up (Phase 7, cross-platform):** the separator assertions and the `--template=` call are real Windows portability defects in the tests and should be fixed when Windows joins the CI matrix. The symlink and 8.3 cases need a Windows runner with Developer Mode, or a documented skip.
