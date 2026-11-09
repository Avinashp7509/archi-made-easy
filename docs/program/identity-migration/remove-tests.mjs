// Remove named top-level node:test cases from a test file, used only for tests that
// assert documents retired in the identity migration (see IDENTITY-INVENTORY.md).
// Usage: node remove-tests.mjs <file> "<exact test name>" [...]
// Each block runs from its `test('<name>'` line to just before the next top-level
// `test(` (or end of file). Fails if any named test is not found exactly once.
import fs from 'node:fs';

const [file, ...names] = process.argv.slice(2);
let source = fs.readFileSync(file, 'utf8');
for (const name of names) {
  const starts = [...source.matchAll(/^test\((['"`])(.*?)\1/gm)];
  const matches = starts.filter((match) => match[2] === name);
  if (matches.length !== 1) throw new Error(`${file}: expected exactly one test named "${name}", found ${matches.length}`);
  const start = matches[0].index;
  const next = starts.find((match) => match.index > start);
  const end = next ? next.index : source.length;
  source = source.slice(0, start) + source.slice(end);
  console.log(`removed: ${name}`);
}
fs.writeFileSync(file, source);
