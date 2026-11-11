# Archi-Made-Easy: Microsoft 365 Copilot Edition

The Copilot Edition is the Archi-Made-Easy skill repackaged for [skills in Microsoft 365 Copilot Agent Builder](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/agent-builder-skills). It is one ZIP, `archi-made-easy-copilot.zip`. It runs the same engine as the Full Edition, unchanged, and needs no Node.js, npm or Git on the user's computer.

- **Full Edition.** For coding agents such as Claude Code, Codex and Cursor. Unchanged by this edition: same files, same `archi-made-easy.zip`, same v1.0.0 release.
- **Copilot Edition.** For Agent Builder and other locked-down environments where users cannot install tools.

> **Agent Builder status.**
> - **copilot-v1.0.0 failed its first real Agent Builder run (2026-11-11).** It uploaded and ran, but delivered no page (see [Agent Builder test log](#agent-builder-test-log)).
> - **1.0.1 contains the fix.** It has passed local restricted-filesystem tests. It has **not yet been run in Agent Builder**, so the fix is unverified there and 1.0.1 is not released.
> - Everything in the [validation report](#validation-report) was produced on a local computer, from the unpacked ZIP, with network access blocked.

Contents: [Agent Builder test log](#agent-builder-test-log) · [Install in Agent Builder](#install-in-agent-builder) · [Example prompts](#example-prompts) · [Full and Copilot Editions compared](#full-and-copilot-editions-compared) · [Compatibility with Agent Builder's rules](#compatibility-with-agent-builders-rules) · [Validation report](#validation-report) · [Limitations](#limitations) · [How the ZIP is built](#how-the-zip-is-built)

## Agent Builder test log

### Run 1: copilot-v1.0.0, 2026-11-11. Failed: no page delivered

- **Prompt:** "Design a multi-region GCP architecture supporting 1 million users and generate an interactive architecture workbench."
- **Observed:**
  - The skill uploaded and its scripts ran under Node.js.
  - `check` returned its own JSON receipt: `ok: false`, `command: check`, artifact `/mnt/data/gcp-million-users.html`.
  - The diagnostic was `input/artifact-unreadable`: "The artifact is not a stable regular file (delivery-artifact-inspection-failed)."
  - No HTML file was offered for download.

**Root cause.** It was reproduced locally (`test/copilot-delivery.test.mjs`). It is not certain until the 1.0.1 probe runs in Agent Builder.

1. **`check` was looking at a file that did not exist.** The reason code `delivery-artifact-inspection-failed` comes from the very first `lstat` of the path, before any stability check. A missing file produces exactly this message. A directory or a symbolic link produces a different code.
2. **The page was never written to `/mnt/data`.** The engine publishes each page through a no-clobber hard link and verifies its inode number and link count. This is a safety design that never leaves a half-written or swapped page. In a folder that refuses hard links, or reports no inode numbers, `render` and `export html` stop with `output/target-indeterminate` and write nothing. Mounted volumes such as a sandbox's `/mnt/data` commonly behave this way. Locally, rendering into such a folder reproduces the full chain, ending in the identical `check` message.
3. **The 1.0.0 instructions allowed the failure to cascade.** They told the agent to write the page straight into the output folder, and did not forbid running `check` after a failed render.

**What is still unknown.** Which property of `/mnt/data` refused the writer: hard links, inode numbers, rename or directory sync. The 1.0.1 probe (`copilot-deliver.mjs probe /mnt/data --json`) answers this in the next run.

**Fix in 1.0.1.** The fix is in the Copilot Edition only; the Full Edition is unchanged.
- **`bin/copilot-deliver.mjs`:**
  1. Probes for a folder where the engine's unchanged writer works.
  2. Runs `validate`, `render` and `check` there.
  3. Copies the checked bytes to the output folder. It uses an exclusive, no-follow create and a rename, or a direct exclusive create where rename is refused.
  4. Reads the delivered file back and proves it is byte-identical to the checked page by SHA-256.
  - It never writes through a symbolic link, and never replaces a file without `--force`.
  - If no folder can host the writer, it delivers nothing and returns a Mermaid fallback labelled as not interactive.
- **`SKILL.md`:**
  - every user file goes through the adapter;
  - a non-zero exit means no file was produced;
  - `check` is never run on a file that a failed command should have produced.

### Run 2: 1.0.1. Pending

See [Retest procedure](#retest-procedure-for-101).

### Retest procedure for 1.0.1

1. Remove the old `archi-made-easy` skill from the agent, then upload the 1.0.1 `archi-made-easy-copilot.zip`. Check its SHA-256 first.
2. In the agent's test pane, send: *"Using the archi-made-easy skill, run `node SKILL_DIR/bin/copilot-deliver.mjs probe /mnt/data --json` and show me the complete JSON output."* Keep the output. It records which folders support the engine's writer, and the exact error from each step in `/mnt/data`.
3. Send the original prompt: *"Design a multi-region GCP architecture supporting 1 million users and generate an interactive architecture workbench."*
4. **Pass** requires all three of these:
   - the agent shows a `copilot-deliver html` receipt with `"ok": true`;
   - it offers the `.html` file for download;
   - the downloaded page opens in a browser, and its Simulate panel runs a failure scenario.
5. Report the probe output, the delivery receipt, and whether the file downloaded and opened.
   - If the receipt says `copilot/html-unsupported` or `destination-not-writable`, the run has failed. The fallback Mermaid diagram it returns is not the interactive workbench.

## Install in Agent Builder

Before you start:

- You need a Microsoft 365 Copilot licence, or pay-as-you-go billing turned on for your organisation.
- Your administrator must allow skills in Agent Builder.
- Tenants that use Microsoft Purview Information Barriers cannot add skills.

1. Download `archi-made-easy-copilot.zip` from the newest `copilot-v*` release on the [releases page](https://github.com/Avinashp7509/archi-made-easy/releases). Check its SHA-256 against the `.sha256` file published beside it. The released [copilot-v1.0.0](https://github.com/Avinashp7509/archi-made-easy/releases/tag/copilot-v1.0.0) has a known Agent Builder failure: it delivers no page (see the [test log](#agent-builder-test-log)).
2. In Microsoft 365 Copilot, open **Agents**, choose **New agent**, then **Configure**.
3. Under **Skills**, choose **Add skill** and upload the ZIP. Do not unpack it. `SKILL.md` is at the ZIP's root, which is where Agent Builder looks for it.
4. Give the agent a name, for example *Architecture Workbench*. Add an instruction such as: "Use the archi-made-easy skill for every architecture, diagram, review, failure, load or cost question."
5. Turn on code execution if your tenant shows that option. The skill runs its scripts there.
6. Test in the preview pane with one of the [example prompts](#example-prompts), then publish the agent for the people who need it.

An agent can hold up to eight skills, and all of its skills together may contain at most 350 files. Edition 1.0.1 uses 214, which leaves room for other skills.

These steps follow Microsoft's documentation as of 2026-11-06. Microsoft's own labels may differ.

## Example prompts

- "Design a highly available e-commerce platform on Azure for 5,000 orders an hour."
- "Here is our requirements document. Turn it into an architecture and list your assumptions." (Attach the document.)
- "Review this design for single points of failure and security risks."
- "What happens if the primary database fails? And if the whole region goes down?"
- "We expect twenty times the normal traffic on Black Friday. What breaks first?"
- "Export this architecture as Mermaid for our Azure DevOps wiki, and as a draw.io file."
- "Draw the sequence of calls when a customer checks out."

## Full and Copilot Editions compared

| | Full Edition | Copilot Edition |
|---|---|---|
| Where it runs | Coding agents (Claude Code, Codex, Cursor and others) on the user's computer | Microsoft 365 Copilot Agent Builder's script sandbox (1.0.0 failed there; the 1.0.1 fix is not yet verified there), or any agent that accepts a skill ZIP |
| What the user installs | Node.js 18 or newer, then the skill | Nothing |
| Architecture engine (validation, layout, review, simulation, capacity, cost) | Yes | Yes, the same files. Pages are byte-identical to the Full Edition's (tested). |
| Interactive HTML page with the workbench | Yes | Yes, if the platform returns files to the user |
| The nine artifact checks (`validate`, `check`) | Yes | Yes |
| Real-browser layout check (`finalize`, `browser-check`, `visual-check`) | Yes, with Chrome or Edge | No. The sandbox has no browser. |
| Mermaid, draw.io, Structurizr and RFC exports | Yes | Yes |
| SVG and PNG images | From the page's Export menu | From the page's Export menu, once the user opens it |
| All ten diagram types | Yes | Yes |
| One-page explainers | Yes | No. Their renderer breaks Agent Builder's file-type and folder-depth rules. |
| Brand logos fetched from a website | Yes, with network | No. Built-in marks work. |
| Update notices | Checks once a day | Off. There is no network. |
| Without Node.js | Not supported | [Fallback mode](#what-happens-without-nodejs), clearly labelled |
| Installer, rendered example pages | Included | Left out |

### What happens without Node.js

The edition's `SKILL.md` first runs `node --version`.

- **Node.js 18 or newer:** the agent runs the engine. All results are computed by the engine and labelled as modelled.
- **No Node.js, or the sandbox refuses to run scripts:** the agent says so, then gives:
  - a Mermaid diagram;
  - the architecture document as JSON, marked as not validated;
  - a review against the documented rules, with no score;
  - a failure analysis in words.

  It says plainly that these answers are its own reasoning, "not computed by the engine". It gives no availability, latency, load or cost figures. Fallback output is never presented as equal to the engine's.

## Compatibility with Agent Builder's rules

The rules are from Microsoft Learn, *Add skills to agents in Agent Builder* (updated 2026-11-06). The measurements are from the 1.0.1 `archi-made-easy-copilot.zip` (SHA-256 `23a81c9d45520830ceeced0e72225ed330eaf10916d779a01ce2789d6723f3c1`) and are checked by `scripts/build-copilot-skill.mjs --verify` and `test/copilot-edition.test.mjs`. The released 1.0.0 had 213 files, 1,731,067 bytes and an 11,496-character `SKILL.md`.

| Rule | Limit | Copilot Edition 1.0.1 | Full Edition ZIP (for comparison) |
|---|---|---|---|
| `SKILL.md` at the root of the ZIP | Required | Yes | No: inside an `archi-made-easy/` folder |
| `name` and `description` in the front matter | Required | Yes: `archi-made-easy`, 731-character description | Yes (974-character description) |
| `SKILL.md` length | Under 20,000 characters | 13,400 | 20,470 |
| ZIP size | 50 MB | 1,739,686 bytes (1.7 MB) | 6,951,339 bytes |
| Size of any one file | 25 MB | Largest is 1,119,339 bytes | Within the limit |
| Files across all of an agent's skills | 350 | 214 | 257 |
| Folder depth | 3 | 2 | 4 inside its `archi-made-easy/` folder (20 files deeper than 3) |
| Accepted file types only | The listed types | Yes: `.md .json .mjs .js .html .txt` | No: four files without an extension (`LICENSE`, `LICENSE-MIT`, `NOTICE`, a vendored `LICENSE`) and one `.css` file |
| Duplicate paths or contents | None | None | None |
| Network or package installs at run time | Not available in the sandbox | None needed; an offline run is tested with the network blocked | Update checks and brand capture expect a network |

Unpacked, edition 1.0.1 is 5,992,598 bytes: 103 `.mjs`, 76 `.json`, 29 `.md`, 4 `.txt`, 1 `.js` and 1 `.html` file.

## Validation report

Run on 2026-11-11 and 2026-11-12, on Windows 11 with Node.js 24.18.0 (tests) and Node.js 22.23.4 (the build). The ZIP was unpacked into a temporary folder. Every command ran with a preloaded module that throws on any network call: `fetch`, `http`, `https`, `net` and `dns`.

### Restricted-folder delivery (1.0.1, `test/copilot-delivery.test.mjs`)

Restricted folders are emulated by a preloaded module, `test/helpers/copilot-restricted-fs.mjs`. It makes chosen folders refuse hard links, report inode number 0, refuse renames, or refuse writes. This is an emulation on Windows, not a real mounted volume or Microsoft's sandbox.

| Case | Result |
|---|---|
| Rendering straight into a folder without hard links or inode numbers | Fails with `output/target-indeterminate` and writes nothing. `check` then reports the exact Agent Builder message. This reproduces run 1. |
| `copilot-deliver html` into that folder | Pass. The page is checked and delivered, byte-identical to an unrestricted render, with no partial files left behind. |
| The temporary folder is restricted too | Pass. Another working folder is found. |
| No folder can host the page writer | No page. `copilot/html-unsupported`, with the probe evidence and a Mermaid fallback labelled as not interactive. |
| Read-only output folder | No page. `copilot/destination-not-writable`; the folder is left untouched; Mermaid fallback returned. |
| Rename refused in the output folder | Pass, by exclusive create. The bytes are verified. |
| An existing file without `--force`; with `--force` | Refused and left unchanged; replaced |
| Wrong extension, a directory, a missing folder, a parent that is a file | Rejected with a specific code; nothing written |
| A symbolic link at the output path | Rejected, and the link target is untouched. Runs on Linux CI; skipped on Windows, where creating links needs extra rights. |
| An invalid document | The validation diagnostics are returned and not retried elsewhere |
| A sequence diagram; a Mermaid export into a restricted folder | Pass |
| `probe` | Reports per-folder capabilities with the failing system call, for example `hardLink: false` with `EPERM` |

### Engine and package (1.0.0 and 1.0.1)

| Check | Result | Evidence |
|---|---|---|
| The ZIP is exactly the build of the tracked sources | Pass | `verifyCopilotZip`: no missing, extra or changed file |
| The build is byte-stable | Pass: two builds gave the same SHA-256 | Node 22 with zlib 1.3.1-e00f703, as for the Full Edition |
| Agent Builder's package rules | Pass | Table above |
| Every link in `SKILL.md` resolves inside the ZIP | Pass | Test |
| Dependencies are complete | Pass. The only unresolved imports are the explainer page renderer's, which is left out on purpose and documented. | Import closure of all 103 scripts in the ZIP |
| Licence and notices included, with the same text | Pass | `NOTICE.txt`, `LICENSE.txt`, `LICENSE-MIT.txt`, `THIRD_PARTY_NOTICES.md` |
| Offline architecture flow: `scaffold`, `validate --quality showcase`, then `copilot-deliver html` (1.0.0: `export html`), then `check` | Pass, exit 0 | Test |
| Offline review and simulation: `review`, `simulate --scenario all`, `--multiplier 20`, `--fmea`, `--cost` | Pass, exit 0 | Test |
| Offline exports: Mermaid, draw.io, Structurizr, RFC | Pass, all non-empty | Test |
| The nine other diagram types validate, render and pass `check`; `compare` works | Pass | Test |
| Pages byte-identical to the Full Edition's | Pass for three examples (two architectures, one sequence) | Test |
| Hostile text is escaped in the page | Pass: `</script><img …>` in the title and `<img …>` in a label appear only as text | Test |
| The generated page in a real browser | Pass. The page opened in Chromium at 1440×900 and 390×844, with no page errors. With the database marked down, it showed the same failure set as `simulate --fault db=down` from the CLI (five components; availability 0% modelled). | Manual Playwright session |
| `doctor` | Reports "Explainer runtime and reader assets" missing and exits 1. This is expected, and `SKILL.md` tells the agent so. | Manual run |
| Inside Microsoft's sandbox | 1.0.0: **failed** (upload and script execution worked; no page delivered). 1.0.1: **not yet run** | [Agent Builder test log](#agent-builder-test-log) |

### Not tested

- 1.0.1 inside Agent Builder: whether the delivery adapter finds a working folder there, and whether the page reaches the user.
- Which property of `/mnt/data` refused the engine's writer. The 1.0.1 probe reports it.
- The Node.js version in the sandbox. Run 1 showed that Node.js runs, but not which version.
- How generated files reach the user. Run 1 suggests `/mnt/data`; that is not confirmed.
- A real restricted mount, such as a network or FUSE volume. The local tests emulate one.
- Fallback mode as carried out by Copilot's model. It is written into `SKILL.md`, but no Copilot run exercised it.
- Performance under the sandbox's time and memory limits. Locally, the slowest step, `validate --quality showcase` on a scaffold, takes a few seconds.

## Limitations

- **Modelled, not measured.** Availability, latency, load and cost figures come from a deterministic model of the declared design. Inputs the user did not state are assumed, and the page and reports label them so. The figures do not predict production behaviour, and this edition does not change that.
- **No browser check.** Pages pass the schema, layout and nine artifact checks, but not the real-browser layout gate.
- **No explainers, no remote brand logos, no update notices** (see the comparison).
- **No security certification.** The edition makes no network calls and installs nothing. Its pages are standalone HTML that escapes user text. This is not a security audit or certification.
- **Agent Builder availability** depends on your tenant's licences and policies.

## How the ZIP is built

`scripts/build-copilot-skill.mjs` stages the tracked Full Edition files, using the same staging as `scripts/build-zip.sh`. It then applies four transforms, each checked so that the build fails if the source changes underneath it:

1. **Instructions and delivery.** `SKILL.md` is replaced by [`editions/copilot/SKILL.md`](SKILL.md), which has browser-free commands, the environment check and the fallback mode. [`editions/copilot/bin/copilot-deliver.mjs`](bin/copilot-deliver.mjs) is added as `bin/copilot-deliver.mjs`, the delivery adapter.
2. **Licence file names.** `NOTICE`, `LICENSE` and `LICENSE-MIT` become `.txt` files, because Agent Builder accepts listed file types only. The one module that embeds these notices in every page reads the new names. The notice text in pages is unchanged, which the byte-identical page test proves.
3. **Left out:**
   - the explainer page renderer's assets: `explainer/vendor/**`, which is four folders deep, and `explainer/reader.css`, which is not an accepted type;
   - the 19 rendered example pages (17 MB; their source documents stay);
   - the agent installer;
   - the explainer authoring guide.
4. **No update manifest.** `skill-release.json` has no update URL.

The files under `archi-made-easy/` are not modified.

```bash
# Build (needs official Node.js 22 with zlib 1.3.1-e00f703, like the Full Edition's ZIP)
node scripts/build-copilot-skill.mjs
# Check a ZIP against the sources and Agent Builder's rules (any Node.js 18+)
node scripts/build-copilot-skill.mjs --verify archi-made-easy-copilot.zip
node --test test/copilot-edition.test.mjs test/copilot-delivery.test.mjs
```

Releases use their own tags, `copilot-v<version>`, and their own workflow, [`.github/workflows/copilot-release.yml`](../../.github/workflows/copilot-release.yml). The workflow rebuilds the ZIP, byte-compares it with the committed one and attaches it with its checksum. It never marks the release as latest, and the Full Edition's `v*` releases are unaffected.

The edition has its own version (`version` in `SKILL.md`, now 1.0.1). It also records the Full Edition version it repackages (`engine-version`, 1.0.0). The workflow requires the tag to match the first, and `archi-made-easy/package.json` to match the second.

Licence: Apache-2.0, as for the Full Edition. See `NOTICE.txt` and `THIRD_PARTY_NOTICES.md` in the ZIP.
