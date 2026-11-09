process.env.MIGRATE_IDENTITY_NO_MAIN = '1';
const { mapText, mapJavaScript, mapHtml, mapPath } = await import('./migrate-identity.mjs');
import assert from 'node:assert/strict';

const jsCases = [
  ['var Archify = {};', 'var ArchiMadeEasy = {};'],
  ['Archify.focus = f();', 'ArchiMadeEasy.focus = f();'],
  ['console.log("Archify is ready.");', 'console.log("Archi-Made-Easy is ready.");'],
  ['const archifyDiagnostics = [];', 'const archiMadeEasyDiagnostics = [];'],
  ['if (process.env.ARCHIFY_CHROME) x();', 'if (process.env.ARCHI_MADE_EASY_CHROME) x();'],
  ['// Archify: see archify/bin/archify.mjs', '// Archi-Made-Easy: see archi-made-easy/bin/archi-made-easy.mjs'],
  ['page.evaluate("window.Archify.view.state()");', 'page.evaluate("window.ArchiMadeEasy.view.state()");'],
  ['const msg = `Built by Archify ${ver}`;', 'const msg = `Built by Archi-Made-Easy ${ver}`;'],
  ['const re = /\\barchify\\b/;', 'const re = /\\barchi-made-easy\\b/;'],
  ['const marker = "/* ARCHIFY:FOCUS */";', 'const marker = "/* ARCHI_MADE_EASY:FOCUS */";'],
  ['obj.archify_version = 1; const _archify = 2;', 'obj.archi_made_easy_version = 1; const _archi_made_easy = 2;'],
  ['throw new Error("Archify\\nfailed");', 'throw new Error("Archi-Made-Easy\\nfailed");'],
  ['if (typeof Archify === "undefined") {}', 'if (typeof ArchiMadeEasy === "undefined") {}'],
  ['const t = "archify-theme"; const k = "ArchifyShareCard";', 'const t = "archi-made-easy-theme"; const k = "ArchiMadeEasyShareCard";'],
  ['#!/usr/bin/env node\nimport x from "../archify/bin/archify.mjs";', '#!/usr/bin/env node\nimport x from "../archi-made-easy/bin/archi-made-easy.mjs";'],
];
for (const [input, expected] of jsCases) assert.equal(mapJavaScript(input), expected, input);

const textCases = [
  ['Install Archify with npx skills add tt-a1i/archify.', 'Install Archi-Made-Easy with npx skills add OWNER/archi-made-easy.'],
  ["Archify's viewer. Use `Archify.focus.set()`.", "Archi-Made-Easy's viewer. Use `ArchiMadeEasy.focus.set()`."],
  ['ARCHIFY / Plate 04', 'ARCHI-MADE-EASY / Plate 04'],
  ['data-archify-theme="x"', 'data-archi-made-easy-theme="x"'],
  ['https://github.com/tt-a1i/archify/issues', 'https://github.com/OWNER/archi-made-easy/issues'],
  ['archify-dev-activity.timeline.json', 'project-dev-activity.timeline.json'],
  ['[[ARCHIFY_VERSION]]', '[[ARCHI_MADE_EASY_VERSION]]'],
  ['Archifyで生成された', 'Archi-Made-Easyで生成された'],
  ['Ends with Archify.', 'Ends with Archi-Made-Easy.'],
  ['name: archify\n', 'name: archi-made-easy\n'],
  ['Copyright (c) 2026 tt-a1i (Archify)\nArchify is great', 'Copyright (c) 2026 tt-a1i (Archify)\nArchi-Made-Easy is great'],
  ['See https://archify.si/gallery and archify.si', 'See https://OWNER.github.io/archi-made-easy/gallery and OWNER.github.io/archi-made-easy'],
  ['dsh add @tt-a1i/archify-dsh@1.1.0', 'dsh add @OWNER/archi-made-easy-dsh@1.1.0'],
  ['/SECURITY.md @tt-a1i\n', '/SECURITY.md @OWNER\n'],
  ['[tt-a1i/test-value](https://github.com/tt-a1i/test-value)', '[tt-a1i/test-value](https://github.com/tt-a1i/test-value)'],
];
for (const [input, expected] of textCases) assert.equal(mapText(input), expected, input);

assert.equal(
  mapHtml('<p>Archify viewer</p><script>var Archify={}; Archify.x="Archify"; /* ARCHIFY:FOCUS */</script><script type="application/json">{"a":"Archify"}</script><div data-archify="1">Archify</div>'),
  '<p>Archi-Made-Easy viewer</p><script>var ArchiMadeEasy={}; ArchiMadeEasy.x="Archi-Made-Easy"; /* ARCHI_MADE_EASY:FOCUS */</script><script type="application/json">{"a":"Archi-Made-Easy"}</script><div data-archi-made-easy="1">Archi-Made-Easy</div>');

const pathCases = [
  ['archify/bin/archify.mjs', 'archi-made-easy/bin/archi-made-easy.mjs'],
  ['archify.zip', 'archi-made-easy.zip'],
  ['examples/archify-repo-grid.html', 'examples/project-repo-grid.html'],
  ['.agents/skills/archify-tuning/SKILL.md', '.agents/skills/archi-made-easy-tuning/SKILL.md'],
  ['docs/skill-updates/archify/stable.json', 'docs/skill-updates/archi-made-easy/stable.json'],
];
for (const [input, expected] of pathCases) assert.equal(mapPath(input), expected, input);
console.log(`mapping checks passed: ${jsCases.length + textCases.length + 1 + pathCases.length}`);
