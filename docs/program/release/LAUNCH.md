# Launch preparation for 1.0.0

Everything here is prepared locally. Nothing has been pushed, published or made public; each step below runs only with the owner's explicit approval. The record of what was tested is [RELEASE-ACCEPTANCE.md](../RELEASE-ACCEPTANCE.md).

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

- **History.** An earlier commit recorded this machine's workspace path in three files (a design note and two capture scripts). Before publication the `main` history was rewritten to replace that path (2026-11-11, `git filter-branch` over those three files only; authors, dates and messages unchanged; the newest tree unchanged). The previous history is kept locally in `refs/backup/pre-scrub-main`, with `refs/backup/phase5-functional` and `refs/backup/phase6-flagship1`; none of them is pushed by the commands below. Push `main` and the tag only, never `--all` or `--mirror`, or delete those refs first.
- **Author identity.** Every commit is authored as `Avinash Roy` with the e-mail address configured in git on this machine; pushing makes it public in the commit metadata. To use GitHub's no-reply address instead, rewrite the author before the first push (for example `git filter-branch --env-filter`), or accept it.
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
#    if a job fails on a platform this machine could not test.

# 3. Tag the verified commit (annotated: the release workflow requires it) and push the tag.
git tag -a v1.0.0 <final commit sha> -m "Archi-Made-Easy 1.0.0"
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

# 5. Verify discovery from a clean machine, without touching an existing installation:
npx skills add Avinashp7509/archi-made-easy --list --full-depth   # exactly one skill: archi-made-easy
npx skills add Avinashp7509/archi-made-easy
#    Then look the repository up on skills.sh. Do not describe it as listed or ranked
#    there until it is seen.
```

## Release checklist (CONTRIBUTING.md), with status

| # | Item | Status |
|---|---|---|
| 1 | Scope and revision | Version 1.0.0, stable channel. Final source SHA: see RELEASE-ACCEPTANCE.md. Comparison base: the imported upstream commit `11b0d60`. Release notes and known issues: this folder. |
| 2 | Identity and build | `node scripts/check-release-identity.mjs` passes for 1.0.0; `archi-made-easy.zip` built from a clean checkout of the same tree with Node 22 and committed; SHA-256 in RELEASE-ACCEPTANCE.md. |
| 3 | Final-head validation | Local: the full suite outside OneDrive, the serial browser suite, the visual matrix, the clean install, the agent runs (RELEASE-ACCEPTANCE.md). CI run URLs: **pending the first push.** Linux and macOS package smoke: **pending the first push.** |
| 4 | Authorized publication | **Waiting for the owner's approval.** Nothing pushed. |
| 5 | Manifest, website and integrations | After the Release: publish `stable.json`. The website and its Pages deployment are **deferred** (not part of 1.0.0: placeholder domain in `website/src`, open toolchain advisories S-07); the `deploy-pages` job is switched off by the `ARCHI_MADE_EASY_PAGES_DEPLOY` variable until then, and update notices stay silent. |
| 6 | Public acceptance and closure | After publication: Skills CLI discovery from a clean machine, Pages version, download digest. |
