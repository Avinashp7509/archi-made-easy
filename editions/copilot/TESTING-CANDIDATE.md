> [!WARNING]
> **Testing candidate. Not validated in Microsoft's sandbox.** Copilot Edition 1.0.1 has passed local restricted-folder tests and CI, but it has not yet been run inside Microsoft 365 Copilot Agent Builder. It is a pre-release, published only so that it can be tested there. The stable Copilot release remains [copilot-v1.0.0](https://github.com/Avinashp7509/archi-made-easy/releases/tag/copilot-v1.0.0), which has a known artifact-delivery failure in Agent Builder. 1.0.1 becomes stable only after a successful Agent Builder test.

**Background**

In its first real Agent Builder run (2026-11-11), Copilot Edition v1.0.0 ran but did not deliver an HTML workbench. `check` reported "The artifact is not a stable regular file (delivery-artifact-inspection-failed)" for `/mnt/data/gcp-million-users.html`. That message only shows that the page file did not exist when `check` ran. In a later Agent Builder run (2026-11-12), the same v1.0.0 did generate and deliver the HTML workbench.

**The cause of the first failure has not been established.** There are two hypotheses, and both reproduce the message locally:

- **The more likely one:** an error in the architecture document the agent generated. `export html` refuses to write a page for an invalid document, and the agent then ran `check` anyway. The agent writes a different document on every run, which fits one failed run followed by one successful run.
- **A hypothesis that has not been established:** an output folder that refuses the engine's hard-link page writer. This was reproduced only with an emulated folder. It has never been observed in Agent Builder, and the later successful run makes it less likely.

**What this candidate contains**

`bin/copilot-deliver.mjs`, a delivery adapter. It renders and checks the page in a folder where the engine's writer works, then copies the checked bytes to the output folder and proves them by SHA-256. If no folder works, it delivers nothing and returns a Mermaid fallback labelled as not interactive. This candidate's instructions send every page through the adapter. Whether the adapter is needed at all has not been established.

**Not in this candidate:** the step-by-step result checks now being prepared for the next release are not included. With those checks, `check` runs only after `validate` and `export html` succeed, and the actual error is reported and corrected. They are on `main` and not published.

Details are in the [edition guide's test log](https://github.com/Avinashp7509/archi-made-easy/blob/main/editions/copilot/README.md#agent-builder-test-log).

**File**

- `archi-made-easy-copilot.zip`: 1,739,686 bytes, 214 files, `SKILL.md` at the root.
- SHA-256: `23a81c9d45520830ceeced0e72225ed330eaf10916d779a01ce2789d6723f3c1` (also in the attached `.sha256` file).
- It is byte-identical to `archi-made-easy-copilot.zip` on `main` at the tagged commit. The release workflow rebuilt it and compared the bytes before publishing.

**Acceptance tests in Microsoft 365 Copilot Agent Builder**

1. Upload the new ZIP into Microsoft 365 Copilot Agent Builder, replacing the old skill.
2. Run `node SKILL_DIR/bin/copilot-deliver.mjs probe /mnt/data --json`, replacing `SKILL_DIR` with the actual skill installation path.
3. Request a multi-region GCP architecture for 1 million users and a downloadable interactive HTML workbench.
4. Verify the delivery receipt reports `ok: true`.
5. Verify Copilot returns a downloadable `.html` file.
6. Open the HTML in a browser and confirm the Simulate panel works.
7. Preserve the full diagnostic output if any step fails.

**Prompt to paste into the agent's test pane**

```text
Use the archi-made-easy skill. First run: node SKILL_DIR/bin/copilot-deliver.mjs probe /mnt/data --json (replace SKILL_DIR with the skill's actual installation folder) and show me the complete JSON output. Then design a multi-region GCP architecture for 1 million users, deliver it with copilot-deliver.mjs as a downloadable interactive HTML workbench, show me the complete delivery receipt, and give me the .html file.
```

**Pass and fail**

- **Pass** needs every step above:
  - a receipt with `"ok": true` from `copilot-deliver html`;
  - a downloadable `.html` file;
  - the page opens in a browser, and its Simulate panel runs a failure scenario.
- **Fail:** any other outcome, including `copilot/html-unsupported` or `copilot/destination-not-writable`. The Mermaid diagram returned in a failure is a fallback, not the interactive workbench.
- **Either way,** keep the full probe output and the receipt. They show which folders support the page writer and the exact system error from each step.

All figures the engine produces are modelled from the declared design, not measured.
