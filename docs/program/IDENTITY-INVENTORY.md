# Identity migration inventory

Baseline: upstream commit `11b0d60`. The old name appears in 718 tracked files (about 41,000 occurrences) and in 265 tracked paths.

Generated artifacts hold most of the occurrences: the example HTML, the gallery and the case pages. Those are rebuilt by their generators, never text-edited.

Decision key:
- **Rename.** A product capability or product surface, carried forward under the new identity.
- **Replace.** Kept as a mechanism, but its content is rewritten for Archi-Made-Easy.
- **Retire.** A record of the upstream project, not a capability. Removed, with any test or workflow that pins it adjusted, and credited in `ATTRIBUTION.md`.
- **Keep verbatim.** Legal and attribution text.

## Keep verbatim

| Item | Reason |
|---|---|
| `LICENSE` (Apache-2.0), `LICENSE-MIT`, the same files inside the skill folder | Licence text |
| Upstream copyright lines in `NOTICE` and `THIRD_PARTY_NOTICES.md` | Apache-2.0 section 4(c)/(d). A "Modifications" statement and our copyright line are added above them. |
| Upstream URL and commit inside `NOTICE`, `ATTRIBUTION.md` and the import commit | Honest origin |

## Rename (capabilities and product surfaces)

| Item | Notes |
|---|---|
| `archify/` → `archi-made-easy/` | The installable skill: bin, renderers, schemas, references, explainer, delta, recipes, migrations, locales, examples, scripts, assets |
| `bin/archify.mjs` → `bin/archi-made-easy.mjs` | CLI. The package `bin` name becomes `archi-made-easy`. |
| `viewer/` (template sources) | Global `Archify` → `ArchiMadeEasy`; `ARCHIFY:` markers → `ARCHI_MADE_EASY:`; storage keys, message types, CSS custom names and data attributes containing the name |
| About 90 `ARCHIFY_*` environment variables | → `ARCHI_MADE_EASY_*`. No legacy aliases: they are internal and test switches, not a public contract. |
| `scripts/`, `test/`, `package.json` files | Identifiers, paths, messages |
| `examples/` (golden HTML), `docs/gallery/`, `docs/cases/`, `docs/guide.html`, `docs/start.html`, `docs/index.html` | Regenerated from renamed sources and templates |
| Example sources named after the old product (`archify-repository.tree.json`, `archify-dev-activity.timeline.json`, `archify-repo*.architecture.json`) | Renamed to `project-repository`, `project-dev-activity` and `project-repo*`. Their content describes upstream's own repository, so labels are rewritten to describe this repository. |
| `website/` (Astro site source) | Renamed. It is not deployed until an owner and domain exist. |
| `.github/` templates, `ci.yml`, `release.yml`, `CODEOWNERS` | Renamed. `CODEOWNERS` is set to the `OWNER` placeholder. |
| `.agents/skills/archify-review`, `archify-tuning` | Maintainer skills, renamed to `ame-review` and `ame-tuning` |
| `.agents/skills/simplify-codebase`, `test-value` | Kept with their own MIT licences. Only references to the product are updated. |
| `benchmarks/` | Regression benchmark records and harness used by tests; renamed |
| `integrations/hermes-agent`, `integrations/deepseek-harness` | Integrations for other agent harnesses; renamed. Marked unpublished (evidence level "documented only") until you publish them. Their `release.json` versions reset. |
| `community/` registry and schema | The mechanism is kept. Package entries pointing at upstream-published packages are replaced by entries for our integrations, marked unpublished. |
| `docs/specs/`, `docs/authoring-cookbook*.md`, `docs/llms.txt`, `llms.txt` | Product documentation |
| `CONTRIBUTING.md`, `REVIEWING.md`, `SECURITY.md`, `DESIGN.md`, `PRODUCT.md`, `AGENTS.md`, `CLAUDE.md`, `.coderabbit.yaml` | Adapted to the new product. `SECURITY.md` contact becomes the owner placeholder. |
| `archify.zip` → `archi-made-easy.zip` | Rebuilt by `scripts/build-zip.sh` |
| `archify/skill-release.json` | `skillId` becomes `archi-made-easy`. Repository is the `OWNER` placeholder. `updateManifestUrl` is `null` until a release host exists; the update check then reports "not configured" and makes no network request. |

## Replace (mechanism kept, content new)

| Item | New content |
|---|---|
| `README.md` and `README_EN.md` (byte-identical mirror required by a test) | Short product README in Phase 1; full README in Phase 7 |
| `CHANGELOG.md` | Starts at the first Archi-Made-Easy version, with one entry describing derivation from upstream. Upstream's changelog is not carried; it is linked from `ATTRIBUTION.md`. |
| `ROADMAP.md` | Derived from `docs/program/PLAN.md` |
| `docs/skill-updates/archify/stable.json` | → `docs/skill-updates/archi-made-easy/stable.json`, describing our release once one exists |
| Brand marks `docs/assets/archify-mark.svg`, `-lockup-dark.svg`, `-lockup-light.svg` | New Archi-Made-Easy mark and lockups |
| Package version | Reset to `0.1.0-dev.0` (prerelease while unreleased, which the release-identity check requires) |

## Retire (upstream project records)

| Item | Test or workflow dependencies to adjust |
|---|---|
| `journal/` (upstream development journal, 62 files) | None in code. "Journal" in the CLI is the delivery journal, an unrelated term. |
| `docs/evidence/`, `docs/reviews/`, `docs/research/`, `docs/reading-evidence/`, `docs/issue-52-visual-evidence/`, `docs/releases/` | None found |
| `docs/article-*` (an article about the upstream project, with images), `docs/cursor-acceptance-2026-07.md`, `docs/deployment-ownership-profile-acceptance-2026-07-23.md`, `docs/artifact-install-v2-measurement.md`, `docs/skill-embedded-optional-update-notifier-design.md` | To be checked by search during migration |
| `docs/assets/community/*` (upstream's WeChat and QQ group QR codes, Discord link), `docs/assets/support/*` (upstream author's donation QR codes), `docs/assets/sponsors/*` (upstream's sponsors) | Must never ship under this product. References in README and site are removed. |
| Screenshots and GIFs showing the old name (`docs/assets/archify-*.png`, `-live-proof.gif`, `-social-preview.png`, `-readme-hero.png`, share cards, `claude-skills-settings.png`) | Regenerated from the renamed viewer in Phase 7 (`archify-live-proof` needs ffmpeg). Until then the README carries no screenshots. |
| `tools/contributor-cards/`, `.github/workflows/contributor-cards.yml`, `contributors.yml`, `star-history.yml` | Upstream community tooling |
| `.github/workflows/dsh.yml` | Publishes upstream's npm package. Replaced by a dry-run job inside `ci.yml` for our integration. |
| `README_ZH.md`, `README_JA.md`, `README_KO.md` | Translations of upstream's README. `check-release-identity` and tests that pin them are narrowed to English and its mirror. Translations of the new README are a Phase 7 item. |
| `experiments/` | Referenced by 4 tests as language-metadata and self-containment inputs. Those test inputs are switched to retained artifacts. |
| `.agents/skills/archify-tuning` trace and replay tooling tied to upstream's agent traces | Reviewed in Phase 1; renamed if generic, retired if upstream-specific |

## Inherited-document compatibility

- Documents authored for the upstream product must validate and render unchanged.
- Phase 1 searches all example documents and fixtures for the old name in data positions (paths, `$schema` or `$id`, `meta.output`, URLs). Any such position becomes an accepted legacy alias with a test.
- Inherited `meta.output` file names are user data and are not renamed.

## Decisions revised during the migration (2026-11-10)

| Item | Planned | Final | Reason |
|---|---|---|---|
| `integrations/deepseek-harness`, `integrations/hermes-agent` | Rename, mark unpublished | **Retired** | Their docs, `release.json` and tests describe packages and versions only the original project published (for example DSH 1.1.0 bundling 3.2.0). Under the new name those statements would be false. Re-introduce after publishing under the real owner (Phase 7). |
| `community/packages/*.json` | Replace entries | **Retired; registry mechanism kept, empty** | Both entries indexed the retired integrations. The schema and validator stay; the registry may be empty until a package is published. The registry key is unified as `archiMadeEasy`. |
| Upstream site domain | `OWNER.github.io/archi-made-easy` | **`archi-made-easy.example`** (RFC 2606 reserved) | The website assumes a root domain (canonical URLs, sitemap origin). A reserved name can never resolve to anyone else's server. GitHub Pages URLs (update manifest, schema `$id`) keep `OWNER.github.io/archi-made-easy`. |
| `docs/skill-embedded-optional-update-notifier-design.md`, `docs/artifact-install-v2-measurement.md` | Retire | **Kept (renamed)** | They document mechanisms the product keeps: the update notifier and the install-funnel plan for the start page. |
| `experiments/` | Retire | **Kept (renamed)** | Used as inputs by four tests. Revisit in Phase 7. |
| `docs/cases/life/job-search.lifecycle.json` | Re-render | **Migrated from lifecycle schema v2 to v3** | It could not render with the current product; upstream left it stale. `mainPath` follows the success route; `accepted` branches below `offer` to keep within the desktop width gate. |
| Contributor wall and star-history scripts and tests | Retire with workflows | **Retired** | They only publish the original project's contributor and star data. |
| `docs/skill-updates/archi-made-easy/stable.json` | Replace | **Removed until the first release** | It described the original 3.2.0 release. Release identity, the Cloudflare check and CI now require that no stable manifest exists before the first published release. |

## Migration defects found by tests and fixed

| Defect | Fix |
|---|---|
| Regex-escaped spellings (`Archify\.focus`, `tt-a1i\/archify`, `archify\.si`) mapped as prose or left as hybrids | Corrective pass `fix-escaped-forms.mjs` (22 files) plus manual `\.si` fixes; rules added to the migration script. A first attempt run through shell quoting rewrote prose. It was reverted exactly from the git index before the scripted pass. |
| Case-variant probe pair (`ArchifyCaseProbe` / `archifycaseprobe`) stopped being case variants | Lower form is now `archimadeeasycaseprobe` (3 files) |
| Data keys split between JSON (`"archi-made-easy"`) and code (`.archiMadeEasy`) | Registry key unified as `archiMadeEasy`. DSH probe used the skill name as a property, which is moot after retirement. |
| Frozen SVG hashes in four dataflow tests | Proven identity-only: mapping the name back reproduces the original hashes. Re-pinned with a comment. |
