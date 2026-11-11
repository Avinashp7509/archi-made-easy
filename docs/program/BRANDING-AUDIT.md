# Branding audit

Phase 7 check that the product presents itself as Archi-Made-Easy everywhere it can be seen, and that the upstream project is named only where attribution requires it. Date: 2026-11-10. Release candidate: the archive built from the Phase 7 tree (SHA-256 `e5ef7ad2…`, 257 entries).

## Results

| Surface | How it was checked | Result |
|---|---|---|
| Tracked text files | `test/identity-guard.test.mjs`: every text file, path by path, outside the attribution files (`NOTICE`, `ATTRIBUTION.md`, licence files, the program and visual QA records) | Pass. The upstream name occurs only inside the embedded notice text of rendered pages. |
| Tracked paths | Same test: no path contains the upstream name | Pass |
| Release archive | Every entry of the unpacked archive searched for the upstream name | 22 of 257 files. `NOTICE` (6) and `LICENSE-MIT` (1) for attribution; the 20 rendered example pages, 7 each, all inside the notice text the page embeds. Nowhere else. |
| Command-line output | `--help`, `doctor`, `guide`, `scaffold --list`, `examples --help`, `brands aws`, run from the installed copy | No mention of the upstream name |
| Rendered pages | Title, header, product mark, toolbar labels, share-card caption, read from the running page ([visual QA](../visual-qa/FINAL-VISUAL-ACCEPTANCE.md)) | Archi-Made-Easy mark and name; share cards read "ARCHI-MADE-EASY · ROUTE · 8 HOPS" |
| Raster images in `docs/assets/` | Each of the 34 pre-rename images opened and looked at | 25 re-captured from running pages (below); 4 unused ones deleted; 4 kept as records; 1 still pending. 3 new images captured the same way (the workbench screenshot, the GitHub social preview and the demonstration animation): 28 in the capture manifest |
| Owner and repository references | `git grep -w OWNER` outside the program records; `scripts/check-release-identity.mjs` | Only the guards that reject the placeholder remain; the identity check passes for 1.0.0 |
| Agent entrypoints and skill metadata | `test/skill-metadata.test.mjs`, `test/skill-installation.test.mjs`, identity guard | Pass |

## Raster images

Pixels cannot be searched, so each image was opened and looked at.

- **Captured (28: 25 re-captured, 3 new).** `scripts/capture-docs-assets.mjs` takes them from pages this repository renders, in a stated state, and records each source page, viewport, density and state in [`docs/assets/capture-manifest.json`](../assets/capture-manifest.json): the light and dark product page, the export menu, one image per diagram type (the architecture image shows the workbench), the workbench during a failure scenario, the three share cards (the viewer's own Share Card export), the four explainer and four everyday case images, and the social card; new: the workbench screenshot, the 1280 × 640 GitHub social preview and the demonstration animation (`scripts/capture-demo-gif.mjs`). The social card is `scripts/social-card-template.html` around the workbench screenshot of the same run; its text claims nothing the product does not do ("modelled, not measured").
- **Deleted (4).** `archi-made-easy-demo-lens.png`, `-demo-reach.png`, `-demo-route.png`, `-readme-hero.png` showed the old interface and are referenced nowhere.
- **Kept as records (4).** The before and after images of the workflow routing study (`docs/assets/workflow-routing-clarity/`, cited by `docs/specs/workflow-routing-clarity-validation.md`). Re-capturing them would change the record of that study. None shows a product name: they show diagram titles, labels and the viewer's Chinese interface text.
- **Pending (1).** `archi-made-easy-live-proof.gif` is built by `scripts/build-readme-showcase.mjs`, which needs ffmpeg; ffmpeg is not installed on this machine. It is referenced by `docs/assets/archi-made-easy-live-proof.json`, an experiment page and `test/readme-showcase.test.mjs`, not by the README or the website.

## The publishing owner

The GitHub owner is `Avinashp7509`; the repository is `https://github.com/Avinashp7509/archi-made-easy`. The placeholder was replaced in every source file, and the schemas, the page template, the validators and every rendered page were regenerated from them. GitHub Pages host names and npm scopes use the lowercase form (`avinashp7509.github.io`), as those systems require. The word `OWNER` remains only in the code that rejects the placeholder if it ever comes back (`update-contract.mjs`, `check-release-identity.mjs`) and in the program records that describe the migration.

## Not checked

- The website (`website/`, Astro) was not built here: its dependencies are not installed. Its text is covered by the identity guard; its images are the re-captured ones above.
- Translations other than English were not reviewed by a native speaker.
