# Security review

Phase 7 review of what Archi-Made-Easy adds to the inherited product, against the scope set in [PLAN.md](PLAN.md) section 7: injection into the data slots, the message bridge, frame sandboxing and path handling, plus the exporters, the installer and network access. Reviewer: the implementing agent, reading the code and attacking it with tests. This is not an independent audit.

Date: 2026-11-10. Tree: the Phase 7 candidate (see [CHECKLIST.md](CHECKLIST.md)).

## Threat model

Who can put text into a page or an export:

- **The author of an architecture document.** Usually the user's own agent, writing from the user's words. But documents also come from elsewhere: a repository the agent was asked to diagram, a requirements document the user uploaded, a colleague's file. Any text in them (titles, labels, sublabels, card items, decision records, trace notes, requirement values, child diagrams) is treated as untrusted.
- **Nobody else.** A rendered page is a static file with no server. It makes no network request of its own. Whoever can edit the HTML file itself can make it do anything; that is out of scope, as for any HTML file.

What must hold:

1. Authored text is shown as text: in the page, in a child diagram (level), and in every export. It never becomes markup, script, a link or an image.
2. A child diagram opened from a page cannot read or change the page that opened it.
3. The command line writes only where it is told to, and never over a file it did not create unless told to.
4. The skill makes no network request the user did not ask for.

## Findings

| ID | Severity | Finding | Status |
|---|---|---|---|
| S-01 | **high** (release blocker) | **draw.io export: authored markup became live HTML in draw.io.** Every label cell is written with `html=1`, so draw.io reads the `value` attribute as HTML. Labels were escaped once, for the XML attribute only. A label `<img src=x onerror=...>` therefore reached draw.io as an image tag with an event handler; `<b>` as bold. Whether a handler runs depends on draw.io's own sanitiser, which this product cannot rely on. Affects `archi-made-easy export drawio` and the Handoff download in the page. | **Fixed.** Authored text in labels (components, sublabels, connections, boundaries) is escaped for HTML and then for the attribute. The exporter's own `<br>` and `<font>` remain the only tags. Regression tests: `test/workbench-export.test.mjs` ("draw.io shows markup in labels as text…"), `test/workbench-security.test.mjs` (every label of a hostile document parsed back as draw.io would; command-line export equal), and the browser test reads the Handoff download from the page. |
| S-02 | medium | **Design document (Markdown) export: authored text was inserted raw.** Markdown renderers (GitHub, wikis, many editors) pass inline HTML through or turn `[x](javascript:…)` and `![](https://…)` into links and remote images. A decision record or card item could add a tracking image or a link to a document a reviewer opens. | **Fixed.** Authored text is escaped for Markdown (backslash before `\` `` ` `` `*` `_` `[` `]` `<` `>` `\|`, line breaks folded). The exporter's own marks (the asterisk for assumed values) are kept. Tests: `test/workbench-security.test.mjs`. |
| S-03 | medium | **Mermaid export: authored text could end a statement or a code fence.** Labels were escaped for `"` only. Outside quotes (titles, sequence messages and notes) a `;` starts a new statement and `%%` a comment; a backtick run can close the Markdown fence around the diagram; `<` reached Mermaid's HTML labels. | **Fixed.** Authored text uses Mermaid entity codes (`#quot;` `#lt;` `#gt;` `#35;` `#96;`, and `#59;` `#37;` outside quotes). Headings use the Markdown escape. Tests: as S-02. The previous check of exports against the real Mermaid parser ([mermaid-parse-2026-11-10.md](acceptance/mermaid-parse-2026-11-10.md)) predates this change; see "Not verified". |
| S-04 | low | **Page script spelled a closing body tag** (D-035 in the visual QA register). Not exploitable on its own, but any tool that inserts into a page before the first closing body tag would have inserted inside a script. | **Fixed**, with a guard test. |
| S-05 | info | **No Content Security Policy in the page.** The page is a single offline file whose scripts and styles are inline, so a policy could only be `'unsafe-inline'`, which adds nothing. The page loads no remote resource. | Accepted; documented. |
| S-06 | low | **Development dependency with advisories: `fast-uri` 3.1.7 and 3.1.8** (four advisories, fixed in 3.1.9). Used only by `ajv` when the schema validators are generated; the generated validators import nothing from it, and it is not in the release archive. | **Fixed.** The existing override is raised to `^3.1.9` in both `package.json` files; both lockfiles resolve 3.1.9; `npm audit` reports 0 vulnerabilities in the repository and in `archi-made-easy/`. |
| S-07 | medium (website only) | **The inherited website build (`website/`, Astro) has 7 advisories in its toolchain**: 5 high (`sharp`, `source-map-js`, `undici`, `vite` through `launch-editor`, `zod`) and 2 moderate. They concern the site's build and local development server. The website is not part of the skill or the release archive. | **Open.** Update the website's dependencies before the site is built and published; this review did not change them, to keep the site's own tests and build unchanged. |

How S-01 was confirmed: the label check in `test/workbench-security.test.mjs`, run against the draw.io exporter as committed in Phase 6 (`82ef8a5`), finds 9 live tags in the labels of the hostile document (`<b>`, `<i>`, `<s>`…). Against the fixed exporter it finds none.

## What was checked and holds

**Data slots.** The workbench data, the levels data, the repository evidence and the translations are JSON inside `<script type="application/json">`, written by `serializeScriptJson`, which escapes `<`, `>` and `&`. Authored text cannot close the element. Tested with a document whose every text field holds `</script><script>…`, image, SVG and iframe payloads: the page has exactly as many script, iframe, image, anchor and SVG elements as the same document with harmless text; the artifact check still finds one diagram; the data read back equals the authored strings (`test/workbench-security.test.mjs`).

**The page never builds HTML from text.** `viewer/workbench.js` creates every element with `createElement` and sets text with `textContent`. It has no `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, `new Function`, string timers or `javascript:` URLs; a test fails if one appears. In a real browser, the hostile document is taken through all nine modes, a scenario run, a trace and the level view: no element appears that the harmless document does not have, and nothing runs (`test/workbench-browser.test.mjs`, "hostile authored text stays text…").

**Levels (child diagrams).**
- A child page is rendered by the same renderer from the child document, so its authored text is escaped the same way, and it passes the same artifact checks before the parent is written.
- It is stored in the parent as JSON in the levels data slot. Its shared blocks are replaced by markers; the page restores them only from its own `<style>` and `<script>` elements, matched by length and hash. A marker that matches nothing leaves the level unopened with a message.
- It opens in an `iframe` with `sandbox="allow-scripts allow-downloads allow-modals"`: no `allow-same-origin`, so the child runs in an opaque origin and cannot read the parent's DOM, storage or cookies; no `allow-top-navigation` or `allow-popups`.
- The bridge carries one message, from child to parent, saying the child is ready (title, theme, component count). The parent accepts it only from that frame's window and with the random token it gave the child (`crypto.getRandomValues`, 128 bits). Nothing the child says is shown or acted on beyond marking the level ready.

**Exports from the page.** The Handoff downloads use the same exporter code as the command line (the generated engine copy, held equal by the parity test) and a `Blob` URL that is revoked after use. Image exports strip workbench overlays and `data-wb-*` attributes (`export-cleanup.js`, tested).

**Command line and paths.** The inherited path contract tests (`test/path-boundary-contract.test.mjs`, `test/output-path.test.mjs`, `test/meta-output-contract.test.mjs`) cover output paths, symlinks and aliases; new scripts use the shared `sameEntry` helper, which the contract test enforces. `export` refuses to overwrite an existing file without `--force`. Child diagrams are rendered into an owned temporary directory that is removed afterwards. Nesting is limited to three levels and four children per document.

**Installer.** Inherited behaviour, unchanged: it writes only to the chosen agent folders, refuses to replace a folder it did not create, and supports `--dry-run` (`test/skill-installation.test.mjs`).

**Network.** The skill's code makes three kinds of request, all inherited: brand capture, only for a brand URL the document or the user names (public addresses only, DNS pinned against rebinding, redirects and size limited, timeouts); the update check, which makes no request while the release has no update source (`updateManifestUrl` is `null` in `skill-release.json` until a publishing owner replaces the `OWNER` placeholder) and can be disabled; the local preview server on `127.0.0.1`. The workbench, the levels and the exporters make none. The acceptance runs check that a finished page loads no remote resource with the network switched off.

**Dependencies.** The skill has no runtime dependency: the release archive holds no `node_modules` and no lockfile. `npm audit` on 2026-11-10, after S-06: 0 vulnerabilities for the repository (17 development dependencies) and for `archi-made-easy/` (6). The website: see S-07.

## Not verified

- The exports were not opened in diagrams.net or Structurizr. Escaping is verified by parsing the output as those tools would, not in the tools.
- The Mermaid exports after the S-03 change were not re-parsed with the real Mermaid library (that check needs network access to load it).
- No fuzzing beyond the hostile document and the tests above.
- The inherited viewer modules (focus, route, lens, export, explainer reader) were reviewed for the paths the workbench uses, not line by line.
