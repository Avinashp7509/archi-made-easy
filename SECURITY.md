# Security Policy

Archi-Made-Easy welcomes responsible security reports. Please report suspected
vulnerabilities privately so the maintainer can investigate and coordinate
remediation before public disclosure.

## Supported versions

| Version | Supported |
| --- | --- |
| 1.0.x (latest stable release) | Yes |
| Current `main` | Yes |
| Development builds (`-dev.N` versions) | No; reproduce on the latest stable release or `main` |

Include the exact version or commit so the affected range can be determined.
This policy does not promise maintenance or backports for older releases.

This policy covers Archi-Made-Easy only. If a finding also affects the project
Archi-Made-Easy is derived from (see [ATTRIBUTION.md](ATTRIBUTION.md) and
[NOTICE](NOTICE)), report it to that project through its own channel as well.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting for this repository: open the
**Security** tab and choose **Report a vulnerability**, or go directly to
<https://github.com/Avinashp7509/archi-made-easy/security/advisories/new>.
Reports go to the maintainer, [@Avinashp7509](https://github.com/Avinashp7509).

Include, when available:

- the affected Archi-Made-Easy version or commit;
- the installation method, operating system, Node.js version, browser, and
  relevant host or agent;
- the affected command, component, or entry point (for example `finalize`,
  `export drawio`, the rendered page, a level (child diagram), the installer);
- a minimal reproduction or proof of concept;
- the security impact and conditions required to reproduce it;
- a suggested mitigation or workaround, if known.

Use a minimal, redacted reproduction. Do not publish exploit details,
credentials, access tokens, secrets, private repository content, personal
data, or customer data in public issues, pull requests, logs, screenshots,
generated artifacts, or package tests.

If private vulnerability reporting is unavailable, open a public issue asking
the maintainer for a private security contact. Do not include vulnerability
details in that issue.

Archi-Made-Easy has a single maintainer. Reports are read as soon as practical;
no response or fix time is promised.

## Scope

In scope:

- the skill's command line (`archi-made-easy/bin`, renderers, validators,
  `scaffold`, `review`, `simulate`, `export`) and its handling of output paths;
- rendered HTML pages, including the workbench and levels (child diagrams);
- the exports: Mermaid, draw.io, Structurizr DSL, the Markdown design
  document, and the images and recordings exported from the page;
- the installer (`archi-made-easy/install.mjs`) and the release archive;
- the skill's network requests: the update check and brand capture.

Any architecture document can come from someone else (a repository, an
uploaded requirements document, a colleague's file), so authored text that
becomes markup, script, a directive, a remote request or a hidden link in a
page or an export is in scope.

Known findings and their status (fixed, accepted, open) are recorded in the
[security review](docs/program/SECURITY-REVIEW.md), including what was not
verified. A report that finds a new path to an accepted or open finding is
welcome. That review was made by the implementing agent with tests; it is not
an independent audit, and no certification is claimed.

Not in scope: a change made by someone who can already edit the HTML file
itself, and defects in the tools that open the exports (diagrams.net,
Structurizr, Mermaid renderers), which belong to those projects. The website
sources in `website/` are not part of the release; their toolchain advisories
are already recorded as S-07.

The skill's own network use can be switched off: set
`ARCHI_MADE_EASY_UPDATE_CHECK_DISABLED=1` to stop the update check and
`ARCHI_MADE_EASY_BRAND_CAPTURE_DISABLED=1` to refuse every remote brand
request (see the [installation reference](archi-made-easy/references/installation.md#update-and-uninstall)).

## Coordinated disclosure

Please keep vulnerability details private while the report is being triaged
and, when applicable, while a fix is being prepared.

Coordinate public disclosure with the maintainer through the private reporting
channel so affected users can be given accurate remediation guidance.

## Non-security bugs

Use [the bug report form](.github/ISSUE_TEMPLATE/bug-report.yml) for
functional, rendering, validation, compatibility, packaging, or documentation
defects that do not create a security impact.

If you are unsure whether a finding is security-sensitive, report it privately.

Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md).
