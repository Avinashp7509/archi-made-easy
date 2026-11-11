# Launch preparation for 1.0.0

Published on 2026-11-11 with the owner's approval: [https://github.com/Avinashp7509/archi-made-easy](https://github.com/Avinashp7509/archi-made-easy), release [v1.0.0](https://github.com/Avinashp7509/archi-made-easy/releases/tag/v1.0.0). The record of the publication is section 12 of the acceptance report; the steps below are kept as the procedure for later releases. The record of what was tested is [RELEASE-ACCEPTANCE.md](../RELEASE-ACCEPTANCE.md).

## Repository

| | |
|---|---|
| Owner | `Avinashp7509` |
| Repository | `https://github.com/Avinashp7509/archi-made-easy` |
| Default branch | `main` (the `dev` trial-use branch in CONTRIBUTING.md applies from the second release on; the first release is promoted directly) |
| Visibility at creation | private, until the owner approves publication |
| GitHub Pages | off for 1.0.0. The CI workflow's `deploy-pages` job runs only when the repository variable `ARCHI_MADE_EASY_PAGES_DEPLOY` is `true`; the website sources still use a placeholder domain and are not part of this release. Update notices start working once Pages serves `skill-updates/archi-made-easy/stable.json` (a follow-up) |

**Description** (GitHub "About", 350 characters or fewer):

> Agent Skill that turns plain-language requirements into interactive architecture diagrams with review, failure simulation, performance and cost modelling. One offline HTML file. Works with Claude Code; installs for Codex, Copilot, Cursor and others.

**Topics** (each supported by the product: Agent Skills packaging, AI-agent use, solution and enterprise architecture, cloud architecture on Azure, AWS and GCP, architecture diagrams from documents, the review rules, and chaos-style failure scenarios):

`agent-skills`, `ai-agents`, `solution-architecture`, `enterprise-architecture`, `cloud-architecture`, `architecture-diagrams`, `architecture-as-code`, `claude-code`, `aws`, `azure`, `gcp`, `architecture-review`, `chaos-engineering`

**Social preview**: upload [`docs/assets/github-social-preview.png`](../../assets/github-social-preview.png) (1280 × 640, captured from the running workbench page) in Settings → Social preview.

## Launch assets

| Asset | Path | Made by |
|---|---|---|
| Demonstration animation (37 s, 11 frames, 960 × 600) | `docs/assets/archi-made-easy-demo.gif` | `scripts/capture-demo-gif.mjs`, screenshots of the running example pages |
| Workbench screenshot | `docs/assets/archi-made-easy-workbench.png` | `scripts/capture-docs-assets.mjs` |
| Light and dark page, export menu, one image per diagram type | `docs/assets/archi-made-easy-*.png` | same |
| Share cards | `docs/assets/*-share-card.png` | the viewer's own Share Card export |
| Social cards | `docs/assets/archi-made-easy-social-preview.png` (1200 × 630), `docs/assets/github-social-preview.png` (1280 × 640) | `scripts/social-card-template.html` around the workbench screenshot |
| Provenance of every image | `docs/assets/capture-manifest.json` | written by the capture scripts |
| Release notes | [`RELEASE-NOTES-1.0.0.md`](RELEASE-NOTES-1.0.0.md) | the body of the GitHub Release |
| Changelog | [`CHANGELOG.md`](../../../CHANGELOG.md) | |
| Release archive | `archi-made-easy.zip` (committed; rebuilt by the release workflow and compared byte for byte) | `scripts/build-zip.sh` with Node 22 |
| Example pages | `archi-made-easy/examples/*.html`, `examples/*.html` | the renderer |

## Before the first push

- **History.** An earlier commit recorded this machine's workspace path in three files (a design note and two capture scripts). Before publication the `main` history was rewritten to replace that path (2026-11-11, `git filter-branch` over those three files only: the path line in each was replaced in every commit that held it; every other file, and the authors, dates and messages, unchanged). The release commit `9802361` was made on the rewritten history. The previous history is kept locally in `refs/backup/pre-scrub-main`, with `refs/backup/phase5-functional` and `refs/backup/phase6-flagship1`; none of them is pushed by the commands below. Push `main` and the tag only, never `--all` or `--mirror`, or delete those refs first.
- **Author identity.** Every commit is authored and committed as `Avinash Roy` with the owner's GitHub no-reply address. The commits were first made with a personal address; on 2026-11-11, before any push and with the owner's approval, only the author and committer e-mail of the 14 commits was rewritten (`git filter-branch --env-filter`; names, dates, messages, trailers and every tree unchanged). The earlier history is kept locally in `refs/backup/pre-email-main`, which is not pushed. New commits use the no-reply address (repository git configuration).
- **New files in the documentation commit.** Eleven files that the README links to, or that its links rely on, are new and untracked, so `git commit -a` would leave them out and the banner, the five launch screenshots, the install demo, the Code of Conduct and the feature request form would be broken on GitHub. Add them by name: `git add CODE_OF_CONDUCT.md .github/ISSUE_TEMPLATE/feature-request.yml docs/assets/archi-made-easy-banner-dark.svg docs/assets/archi-made-easy-banner-light.svg docs/assets/archi-made-easy-before-after.png docs/assets/archi-made-easy-failure-simulation.png docs/assets/archi-made-easy-flagship-agentic-ai.png docs/assets/archi-made-easy-flagship-c4.png docs/assets/archi-made-easy-flagship-fintech.png docs/assets/archi-made-easy-install-demo.png docs/assets/install-demo/transcript.txt`. Before tagging, check that `git ls-files` lists all eleven and that `git status --short` shows nothing untracked that the README links to.
- **Size.** A clone is about 125 MiB: every rebuilt `archi-made-easy.zip` (6.9 MB each) and the rendered example pages remain in history. The release gates compare the committed archive byte for byte, so it stays tracked.

## Proposed commands (run only after approval)

```bash
# 1. Create the repository on GitHub (private). Leave the repository variable
#    ARCHI_MADE_EASY_PAGES_DEPLOY unset: the CI deploy-pages job then skips, because the
#    website is not part of 1.0.0. Then, from this checkout:
git remote add origin https://github.com/Avinashp7509/archi-made-easy.git
git push -u origin main

# 2. Watch the CI workflow on main: identity and ZIP gates, unit and browser suites,
#    package smoke on Linux, macOS and Windows, Windows path contracts. Fix and re-push
#    if a job fails on a platform this machine could not test. A commit may be tagged on
#    the existing evidence only if it changes nothing that ships (archi-made-easy/, viewer/,
#    the archive) and CI passes on it, including zip-freshness, which rebuilds the archive
#    and compares it byte for byte. A fix to shipped code needs the archive rebuilt with
#    Node 22, the final cycle and the clean install run again, and RELEASE-ACCEPTANCE.md
#    sections 2, 4, 8 and 11 updated before the tag.

# 3. Tag the verified commit (annotated: the release workflow requires it) and push the tag.
#    main must be the documentation commit that follows 9802361 (or a later
#    documentation-only commit); check with: git log --oneline -3 main
git tag -a v1.0.0 main -m "Archi-Made-Easy 1.0.0"
git push origin v1.0.0
#    The release workflow builds archi-made-easy.zip, compares it with the committed one,
#    and creates the GitHub Release with the archive attached (release notes: paste
#    docs/program/release/RELEASE-NOTES-1.0.0.md).

# 4. After the Release exists: publish the stable update manifest in a follow-up commit
#    (docs/skill-updates/archi-made-easy/stable.json with the Release's tree SHA and archive
#    digest; the CI job "published-update-manifest" checks it against the actual Release),
#    set the description, topics and social preview, and make the repository public.
#    Pages (and with it the update notices) waits for the website follow-up: replace the
#    placeholder domain in website/src, update its toolchain (SECURITY-REVIEW.md S-07),
#    set Settings → Pages → Source to "GitHub Actions" and the variable
#    ARCHI_MADE_EASY_PAGES_DEPLOY to true.
#    The CI website job is off as well, until the variable ARCHI_MADE_EASY_WEBSITE is true.
#    Before turning it on, the website follow-up must also: give the Cloudflare and
#    deployment tests a manifest fixture until stable.json is published, restore the README
#    link they expect to the scenario guide, and handle the empty community catalog
#    (website/test/agent-diagrams, cloudflare-output, deployment-target, community tests).
#    Its typecheck and build pass since the launch fix of website/src/data/community.ts.

# 5. Verify discovery from a clean machine, without touching an existing installation:
npx skills add Avinashp7509/archi-made-easy --list --full-depth   # exactly one skill: archi-made-easy
npx skills add Avinashp7509/archi-made-easy
#    Then look the repository up on skills.sh. Do not describe it as listed or ranked
#    there until it is seen.
```

## Release checklist (CONTRIBUTING.md), with status

| # | Item | Status |
|---|---|---|
| 1 | Scope and revision | Version 1.0.0, stable channel. Release commit `9802361` (tree `105a7c2`); the documentation-only commit after it records the results (RELEASE-ACCEPTANCE.md section 11). Comparison base: `964b571`, the import of upstream tt-a1i/archify `11b0d60`. Release notes and known issues: this folder. Tag the latest commit on `main`. |
| 2 | Identity and build | `node scripts/check-release-identity.mjs` passes for 1.0.0; `archi-made-easy.zip` built with Node 22, outside OneDrive, from a checkout of a snapshot whose tree equals the release commit's apart from the archive, then committed in the release commit; SHA-256 `ca480ef8…62ef` (RELEASE-ACCEPTANCE.md section 8), rebuilt from the tested tree with the same bytes. |
| 3 | Final-head validation | Local, on the release tree (RELEASE-ACCEPTANCE.md sections 2 to 5). CI on the tagged commit: [run 42988390268](https://github.com/Avinashp7509/archi-made-easy/actions/runs/42988390268), success on Linux, macOS and Windows. **Done.** |
| 4 | Authorized publication | Approved by the owner. Tag `v1.0.0` (annotated) on `9ab29de`; [release workflow](https://github.com/Avinashp7509/archi-made-easy/actions/runs/42991933466) success; [Release](https://github.com/Avinashp7509/archi-made-easy/releases/tag/v1.0.0) with `archi-made-easy.zip` (sha256 `ca480ef8…b162ef`). **Done.** |
| 5 | Manifest, website and integrations | After the Release: publish `stable.json`. The website and its Pages deployment are **deferred** (not part of 1.0.0: placeholder domain in `website/src`, open toolchain advisories S-07); the `deploy-pages` job is switched off by the `ARCHI_MADE_EASY_PAGES_DEPLOY` variable until then, and update notices stay silent. |
| 6 | Public acceptance and closure | Public download verified against its checksum; `npx skills add Avinashp7509/archi-made-easy` from a clean project installs the skill and Claude Code lists it; README, images and release page load publicly (RELEASE-ACCEPTANCE.md section 12). Open: the social preview upload (Settings), and the stable manifest with Pages (row 5). |
