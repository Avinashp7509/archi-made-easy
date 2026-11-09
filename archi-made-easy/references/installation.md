# Installation and compatibility

Read this when the user asks how to install, update, move or remove Archi-Made-Easy, or which agents it works with.

## Contents

- [Requirements](#requirements)
- [Install](#install)
- [Compatibility matrix](#compatibility-matrix)
- [Update and uninstall](#update-and-uninstall)
- [Troubleshooting](#troubleshooting)

## Requirements

| Need | Required? | Used for |
|---|---|---|
| Node.js 18 or newer | Required | Every command. The skill has no npm dependencies at runtime. |
| Chrome, Chromium or Edge | Optional | The real-browser layout gate inside `finalize`, plus image export from the command line. Point to a specific browser with `ARCHI_MADE_EASY_CHROME`. |
| ffmpeg | Optional | WebM motion capture only |

Check a machine with `node <skill>/bin/archi-made-easy.mjs doctor`.

## Install

From an unpacked release (`archi-made-easy.zip`) or a source checkout, run the bundled installer. It copies the skill into the agent's skill folder and then runs `doctor` from the installed copy:

```bash
node archi-made-easy/install.mjs --agent claude-code              # global, one agent
node archi-made-easy/install.mjs --agent cursor --agent codex     # several agents
node archi-made-easy/install.mjs --agent claude-code --project .  # this project only
node archi-made-easy/install.mjs --dest <skills-folder>           # any other Agent Skills client
node archi-made-easy/install.mjs --list                           # agents and their folders
```

- Add `--dry-run` to see the plan without writing anything.
- The installer never modifies a folder it did not create.
- After installing, restart the agent or open a new session so it discovers the skill.

## Compatibility matrix

Evidence levels:

- **Exercised.** The agent loaded the skill and produced a valid artifact in a recorded run.
- **Placement verified.** Automated tests install into the folder below, in a clean temporary home, and `doctor` passes from the installed copy. Whether the agent discovers that folder is taken from the `skills` CLI registry (vercel-labs/skills 1.7.0), not observed directly.
- **Documented only.** Not tested.

| Agent | Installer id | Global folder | Project folder | Evidence |
|---|---|---|---|---|
| Claude Code | `claude-code` | `~/.claude/skills` (or `$CLAUDE_CONFIG_DIR/skills`) | `.claude/skills` | Placement verified |
| OpenAI Codex | `codex` | `~/.codex/skills` (or `$CODEX_HOME/skills`) | `.agents/skills` | Placement verified |
| GitHub Copilot | `github-copilot` | `~/.copilot/skills` | `.agents/skills` | Placement verified |
| Cursor | `cursor` | `~/.cursor/skills` | `.agents/skills` | Placement verified |
| OpenCode | `opencode` | `~/.config/opencode/skills` | `.agents/skills` | Placement verified |
| Windsurf | `windsurf` | `~/.codeium/windsurf/skills` | `.windsurf/skills` | Placement verified |
| Gemini CLI | `gemini-cli` | `~/.gemini/skills` | `.agents/skills` | Placement verified |
| Other Agent Skills clients | `--dest` | the client's skill folder | the client's skill folder | Documented only |

Known limitations:

- **Shell access is required.** The agent must be able to run `node` commands. In a client without a shell, the skill can explain and describe but cannot produce a checked artifact.
- **Browser gate.** `finalize` runs a headless browser check. Without Chrome, Chromium or Edge it reports the gate as unavailable instead of passing.
- **Windows.** If a browser check intermittently reports that a temporary profile could not be removed, rerun `finalize`. The diagram checks themselves have passed.

## Update and uninstall

```bash
node archi-made-easy/install.mjs --agent claude-code --replace     # update an install made by this installer
node archi-made-easy/install.mjs --agent claude-code --uninstall   # remove it
```

Update checks inside the skill are off until releases are published; nothing is fetched automatically.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `refused … not managed by this installer` | A folder with that name already exists and was not created by the installer. Move it away, or install with `--dest` elsewhere. |
| The agent does not use the skill | Restart the agent or open a new session. Check that `--list` shows the folder your agent reads. Mention "architecture diagram" in the request. |
| `doctor` reports a missing file | Reinstall with `--replace` from a complete release. |
| `finalize` fails at `browser-check` with no browser | Install Chrome, Chromium or Edge, or set `ARCHI_MADE_EASY_CHROME` to its executable. |
| `viewer/chrome-startup-timeout` on Windows | Chrome needs the real user profile. Make sure `USERPROFILE` and `HOME` are not redirected to an empty or temporary folder in the agent's environment. |
| Node version error | Install Node.js 18 or newer. |
