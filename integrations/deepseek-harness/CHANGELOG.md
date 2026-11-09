# DSH adapter changelog

For current publication status, see the [repository integration README](https://github.com/OWNER/archi-made-easy/tree/main/integrations/deepseek-harness).

## 1.1.0 — 2026-11-08

- Publishes the independent DSH sync requested in [#1153](https://github.com/OWNER/archi-made-easy/issues/1153): Archi-Made-Easy 3.2.0 pinned to `edf158c4e7a1d18d20cc329840f864289634c090`, including the post-tag Apache-2.0 and third-party notice fixes. Adapter MIT licensing remains distinct from the bundled Skill's licensing.
- Ships the `includeDefaultRoots: true` fix for [#906](https://github.com/OWNER/archi-made-easy/issues/906), preserving personal/project Skills when this is the only live filesystem provider.
- Accepts the exact npm CLI host `@deepseek-ai/dsh@0.2.1-rc.2`. No blanket 0.2.x or Desktop/Electron support claim; historical 1.0.0 evidence does not certify 1.1.0.
- Acceptance covers clean installation and same-profile upgrades from both 0.1.0 and 1.0.0, and checks older same-name personal/project `archi-made-easy` copies against the effective loaded body/path. Plugin upgrade does not override higher-precedence Skill copies.
- Published tarball SHA256 `e65d77e4d7ca34562d33f22480b0b4eae2b1e51ef13cd542c2618b228830b20d` from adapter tag `archi-made-easy-dsh-v1.1.0`. The three-platform tag gate and the public install examples were verified against that tarball.

## 1.0.0

- First stable adapter contract for the exact tested host `@deepseek-ai/dsh@0.1.2-rc.1`; the host remains a developer preview. Other host versions are not covered by this release claim.
- Bundles Archi-Made-Easy 3.0.1 from stable commit `7158026e852f3aa6578c741e673b46d7878c92c1`, including the installation fix after the Archi-Made-Easy v3.0.1 tag. Archi-Made-Easy and adapter versions are independent.
- Preserves the Skill-only activation contract: one `archi-made-easy-plugin` provider, no native tools, dependencies, install hooks, telemetry, or automatic updates.
- The release gate covers clean installation and published plugin 0.1.0 → 1.0.0 upgrade, discovery/loading, workspace rendering, and uninstall on Linux, macOS, and Windows. Full example-rewriting smoke runs outside the pnpm store.
- Archi-Made-Easy 3.x changes the Viewer and authoring/delivery flow; existing schema-v1 input remains supported. See [Archi-Made-Easy 3.0 upgrade notes](https://github.com/OWNER/archi-made-easy/blob/v3.0.1/CHANGELOG.md#upgrading-from-2x). Existing HTML keeps its embedded Viewer.
- The prepared 0.2.0 adapter was never published; 1.0.0 supersedes that candidate.

## 0.1.0 — 2026-08-14

Initial experimental community bundle: Archi-Made-Easy 2.14.0 with `@deepseek-ai/dsh@0.1.0-rc.6`. The published version and its `archi-made-easy-dsh-v0.1.0` tag remain immutable.
