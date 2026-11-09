# Agent instructions

## Using the Archi-Made-Easy skill

This repository is the source of the Archi-Made-Easy Agent Skill. For any architecture or diagram request, whether you are working here or in a project where the skill is installed, follow [archi-made-easy/SKILL.md](archi-made-easy/SKILL.md):
- users speak plain language;
- you author the candidate and run `finalize`;
- you return the standalone HTML link with your assumptions.

Installation for other agents and projects: [archi-made-easy/references/installation.md](archi-made-easy/references/installation.md).

## Changing this repository

Follow [CONTRIBUTING.md](CONTRIBUTING.md) for repository changes and [REVIEWING.md](REVIEWING.md) for reviews.

## PR preparation

Before requesting final review, follow the scoped [PR improvement check](CONTRIBUTING.md#pr-improvement-check) using the project Skills when applicable.

## Test selection

Before running tests, read [Choose evidence by impact](CONTRIBUTING.md#choose-evidence-by-impact) to select coverage for the changed behavior. Use the [focused test workflow](CONTRIBUTING.md#local-setup-and-verification) for local iteration. Before integration, follow [Final integration and follow-up](CONTRIBUTING.md#final-integration-and-follow-up) to verify CI and reused evidence against the final revision.

## Live Archi-Made-Easy installations

Install, update, reinstall, or remove a live Archi-Made-Easy installation only when the user explicitly requests that action. Repository editing, testing, reviewing, publishing, or syncing does not authorize installation. This applies to the bundled installer (`archi-made-easy/install.mjs`), the Skills CLI and manual ZIP copies. Reuse authorization already given for the same action and scope; ask only for unresolved decisions.

- Keep the source, Skill/package, target agents, and global/project scope within the request. Avoid bulk operations or force flags that expand that scope. An update notification is informational.
- Before a Skills CLI install, discover the selected source with `npx -y skills add <source> --list --full-depth` (default source: `OWNER/archi-made-easy`) and verify exactly one Skill named `archi-made-easy`. For an explicitly requested durable local source, inspect that checkout. Stop on failed or ambiguous discovery.
- Use the canonical remote source by default. Use a local source only when requested, from a durable checkout; live symlinks must not point into temporary directories or disposable worktrees.
- Preserve unrelated files and existing unmanaged destinations. Report a destination conflict before replacing it unless that exact replacement is already explicitly authorized; use the installer's documented conflict handling within the approved scope.
- Report the action, source, targets, and result, including skipped or failed destinations. A partial installation is not a complete success.
