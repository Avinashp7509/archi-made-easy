# Archi-Made-Easy for Hermes Agent

Community [Hermes Agent](https://hermes-agent.nousresearch.com/) integration for [Archi-Made-Easy](https://github.com/OWNER/archi-made-easy). This is **not** an official Nous Research product and does not imply Nous endorsement.

This is a **Skill-only** plugin. It does not register native Python render tools, telemetry, MCP servers, credentials handling, or background services. Hermes still needs **Node.js 18+**. The compiler remains `node bin/archi-made-easy.mjs`.

There is no Python port of the renderers. A Python assistant uses Archi-Made-Easy the same way Cursor does: author typed JSON, then run the Node CLI. Hermes is not an agent-switcher target.

## Install (shows up in available skills)

This command installs the published Skill from [`OWNER/archi-made-easy`](https://github.com/OWNER/archi-made-easy) (`archi-made-easy/SKILL.md` plus the Node renderer). Hermes already indexes that package as `skills-sh/OWNER/archi-made-easy/archi-made-easy`. After this repository's Hermes docs land on `main`, keep using the same identifier; `skills.sh` may lag a few hours behind GitHub.

```bash
hermes skills install skills-sh/OWNER/archi-made-easy/archi-made-easy -y
```

Requires Node.js 18+ on the machine (or in the Hermes Docker image). Restart Hermes, then ask:

```text
Use the archi-made-easy skill to map this repository's runtime architecture.
Show 8–12 core components, one primary path, external dependencies, and trust boundaries.
Put supporting detail in cards instead of adding more edges.
After delivery, return the exact workspace paths of the specification JSON and the HTML artifact.
```

Run `node bin/archi-made-easy.mjs` from the installed Skill directory (`~/.hermes/skills/archi-made-easy` or `%USERPROFILE%\.hermes\skills\archi-made-easy`), or pass absolute paths.

If `hermes skills inspect skills-sh/OWNER/archi-made-easy/archi-made-easy` cannot resolve the identifier, wait for the skills.sh index or use the checkout symlink below. Do not invent a different owner/repo path: forks are different packages.

### Local checkout (this branch)

Replace the source path with your checkout. If the destination already exists, inspect it before replacing it; these commands intentionally leave an existing installation in place. Windows symlink creation requires the relevant system permission.

Linux / macOS:

```bash
mkdir -p ~/.hermes/skills
[ ! -e ~/.hermes/skills/archi-made-easy ] && [ ! -L ~/.hermes/skills/archi-made-easy ] && \
  ln -s /absolute/path/to/archi-made-easy/archi-made-easy ~/.hermes/skills/archi-made-easy
```

Windows PowerShell:

```powershell
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.hermes\skills" | Out-Null
New-Item -ItemType SymbolicLink -Path "$env:USERPROFILE\.hermes\skills\archi-made-easy" -Target "C:\absolute\path\to\archi-made-easy\archi-made-easy"
```

### Docker

Hermes Docker mounts `~/.hermes` at `/opt/data`. Run the install on the **host** so files land in that volume, or bind-mount `/absolute/path/to/archi-made-easy/archi-made-easy` to `/opt/data/skills/archi-made-easy`. A host symlink whose target is outside the volume is invisible in the container.

## Optional namespaced plugin

Plugin skills are opt-in (`skill_view("archi-made-easy:archi-made-easy")`) and are not listed in the system prompt index. Install the Skill first so `register()` can resolve `SKILL.md` from `~/.hermes/skills/archi-made-easy`. A checkout of this repository also works: `integrations/hermes-agent` falls back to `archi-made-easy/SKILL.md`.

Linux / macOS:

```bash
mkdir -p ~/.hermes/plugins
[ ! -e ~/.hermes/plugins/archi-made-easy ] && [ ! -L ~/.hermes/plugins/archi-made-easy ] && \
  ln -s /absolute/path/to/archi-made-easy/integrations/hermes-agent ~/.hermes/plugins/archi-made-easy
hermes plugins enable archi-made-easy
```

Windows PowerShell:

```powershell
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.hermes\plugins" | Out-Null
New-Item -ItemType SymbolicLink -Path "$env:USERPROFILE\.hermes\plugins\archi-made-easy" -Target "C:\absolute\path\to\archi-made-easy\integrations\hermes-agent"
hermes plugins enable archi-made-easy
```

`register()` looks for `SKILL.md` in this order: an optional packed `skills/archi-made-easy` copy, the in-repo `archi-made-easy/` package, `ARCHI_MADE_EASY_SKILL_ROOT`, then `HERMES_HOME/skills/archi-made-easy` (default `~/.hermes/skills/archi-made-easy`).

## Uninstall

```bash
hermes skills uninstall archi-made-easy
```

Linux / macOS leftover cleanup:

```bash
rm ~/.hermes/skills/archi-made-easy
hermes plugins disable archi-made-easy
rm ~/.hermes/plugins/archi-made-easy
```

Windows PowerShell:

```powershell
Remove-Item "$env:USERPROFILE\.hermes\skills\archi-made-easy"
hermes plugins disable archi-made-easy
Remove-Item "$env:USERPROFILE\.hermes\plugins\archi-made-easy"
```

## Scope

- Compatible with Hermes directory plugins (`plugin.yaml` + `register(ctx)`).
- Does not add Archi-Made-Easy to the Cursor / Codex / Claude Code / OpenCode / GitHub Copilot agent switcher.
- Does not claim merge safety, blast radius, or live-infrastructure verification.
