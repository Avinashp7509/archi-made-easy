// Corrective pass for two escaped spellings the first migration run missed:
//   * regex literals asserting code, e.g. /Archify\.focus/ (became /Archi-Made-Easy\.focus/);
//   * regex-escaped upstream URLs, e.g. tt-a1i\/archify (became tt-a1i\/archi-made-easy).
// Both search strings contain a literal backslash, so prose such as "…by Archi-Made-Easy."
// can never match. Run from the repository root: node docs/program/identity-migration/fix-escaped-forms.mjs
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const BACKSLASH = '\\';
const RULES = [
  [`Archi-Made-Easy${BACKSLASH}.`, `ArchiMadeEasy${BACKSLASH}.`],
  [`tt-a1i${BACKSLASH}/archi-made-easy`, `OWNER${BACKSLASH}/archi-made-easy`],
];
const EXCLUDE = [/^docs\/program\//, /^test\/identity-guard\.test\.mjs$/];

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8', maxBuffer: 1 << 28 })
  .split('\0').filter(Boolean).filter((file) => !EXCLUDE.some((pattern) => pattern.test(file)))
  .filter((file) => /\.(?:mjs|js|cjs|ts|astro|py|md|json|html)$/.test(file) && fs.existsSync(file));

const changed = [];
for (const file of files) {
  const before = fs.readFileSync(file, 'utf8');
  if (!RULES.some(([from]) => before.includes(from))) continue;
  let after = before;
  for (const [from, to] of RULES) after = after.split(from).join(to);
  fs.writeFileSync(file, after);
  changed.push(file);
}
console.log(`${changed.length} files corrected`);
for (const file of changed) console.log(`  ${file}`);
