**DRAFT, not released: Archi-Made-Easy Copilot Edition 1.0.1.** These notes describe the development version on `main`. Revise them with the established cause and the Agent Builder test result before any 1.0.1 release.

**Background.**
- In its first real Agent Builder run (2026-11-11), copilot-v1.0.0 delivered no page. `check` reported "The artifact is not a stable regular file (delivery-artifact-inspection-failed)" for `/mnt/data/gcp-million-users.html`. That message only shows that the page file did not exist.
- In a later run (2026-11-12), the same v1.0.0 generated and delivered the HTML workbench.

**Cause: not established.** Two hypotheses reproduce the message locally:
- **The more likely one:** an error in the generated architecture document, which makes `export html` refuse to write. The agent then ran `check` anyway.
- **A hypothesis that has not been established:** an output folder that refuses the engine's hard-link page writer. This was never observed in Agent Builder.

**Changes since copilot-v1.0.0.**
- **Step-by-step result checks in `SKILL.md`:**
  - `check` runs only after `validate` and `export html` succeed and the page file exists;
  - the failed step's own validation or rendering error is reported, never a later missing-file message;
  - the agent makes the smallest safe correction: at most three rounds, never removing what the user asked for, never weakening a check.
- **`bin/copilot-deliver.mjs`, a delivery adapter.** It is used only when the engine reports an `output/…` folder error.
  1. It renders and checks where the writer works.
  2. It delivers the checked bytes with an exclusive, no-follow create, and proves them by SHA-256.
  3. It never writes through a symbolic link, and never replaces a file without `--force`.
  4. If no folder works, it returns a Mermaid fallback labelled as not interactive.

**Unchanged:**
- the engine, which is still Full Edition 1.0.0 (pages are byte-identical);
- the Full Edition and its v1.0.0 release;
- copilot-v1.0.0.

**Verification:**
- **Done:** the offline engine tests, the restricted-folder tests (emulated) and the checks on the instructions.
- **Not done:** an Agent Builder run of this version, and browser interaction tests of a page delivered in Agent Builder.

All figures the engine produces are modelled from the declared design, not measured.
