**Archi-Made-Easy for Microsoft 365 Copilot Agent Builder and other locked-down environments.**

This release adds one file, `archi-made-easy-copilot.zip`, with its SHA-256 checksum. It is the Archi-Made-Easy 1.0.0 engine, unchanged, repackaged to meet Agent Builder's skill package rules:

- `SKILL.md` at the root, 11,496 characters;
- 213 files, two folders deep at most;
- 1.7 MB;
- accepted file types only.

Users install nothing.

- **Install:** upload the ZIP under **Skills** in Agent Builder. Step-by-step instructions are in the [edition guide](https://github.com/Avinashp7509/archi-made-easy/blob/main/editions/copilot/README.md#install-in-agent-builder).
- **What works:**
  - architecture design from plain language;
  - validation and the nine artifact checks;
  - the interactive HTML workbench page;
  - review;
  - failure, load and cost simulation;
  - Mermaid, draw.io, Structurizr and RFC exports;
  - all ten diagram types.
- **Left out:**
  - the real-browser layout check;
  - one-page explainers;
  - brand logos fetched from the web;
  - update notices.
- **Without Node.js** the skill switches to a clearly labelled fallback: a Mermaid diagram, the architecture JSON, a rule-based review and failure reasoning. It says this is not computed by the engine.
- **Sandbox status: UNVERIFIED.** Validation ran locally from the unpacked ZIP with the network blocked. Upload and execution inside Microsoft's sandbox have not been tested. The [validation report](https://github.com/Avinashp7509/archi-made-easy/blob/main/editions/copilot/README.md#validation-report) lists what was and was not tested.

All figures the engine produces are modelled from the declared design, not measured.

The Full Edition's [v1.0.0 release](https://github.com/Avinashp7509/archi-made-easy/releases/tag/v1.0.0) is unchanged and remains the latest release.
