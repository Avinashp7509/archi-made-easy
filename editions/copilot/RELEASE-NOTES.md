**Archi-Made-Easy Copilot Edition 1.0.1: fixes page delivery in Microsoft 365 Copilot Agent Builder.**

In its first real Agent Builder run, copilot-v1.0.0 delivered no page. `check` reported "The artifact is not a stable regular file (delivery-artifact-inspection-failed)" for `/mnt/data/gcp-million-users.html`.

**Cause.** The engine publishes pages through a no-clobber hard link and verifies inode identity. Sandbox output folders that refuse hard links, or report no inode numbers, make the safe writer stop without writing anything. A later `check` then found no file at that path.

**Fix:** this release adds `bin/copilot-deliver.mjs`.
1. It renders and checks the page in a folder where the engine's unchanged writer works.
2. It delivers the checked bytes to the output folder with an exclusive, no-follow create.
3. It proves the delivered file by SHA-256.
4. It never writes through a symbolic link, and never replaces a file without `--force`.
5. If no folder can host the writer, it delivers nothing and returns a Mermaid fallback labelled as not interactive.

The edition's `SKILL.md` now sends every user file through this adapter, and forbids checking a file that a failed command should have produced.

- **Unchanged:** the engine, which is still Full Edition 1.0.0 (pages are byte-identical), the Full Edition and its v1.0.0 release, and copilot-v1.0.0.
- **Package:**
  - 214 files, at most two folders deep;
  - 1.7 MB;
  - `SKILL.md` at the root, 13,400 characters.
- **Verification:**
  - restricted-folder regression tests (emulated) and the offline engine tests;
  - the result of the Agent Builder retest is recorded in the [edition guide's test log](https://github.com/Avinashp7509/archi-made-easy/blob/main/editions/copilot/README.md#agent-builder-test-log).

All figures the engine produces are modelled from the declared design, not measured.
