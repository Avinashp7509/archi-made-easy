// Static import closure of a skill tree: every relative import and literal dynamic import()
// reachable from the given entry files, and every one that does not resolve to a file in the
// tree. Used to prove the Microsoft Copilot Edition is dependency-complete for the commands it
// supports. Reads with regular expressions over ES module syntax (the skill has no bundler).
import fs from 'node:fs';
import path from 'node:path';

const IMPORT_RE = /(?:^|[^\w$.])(?:import|export)\s*(?:[\w${}\s*,]+\s*from\s*)?['"](\.{1,2}\/[^'"]+)['"]|(?:^|[^\w$.])import\(\s*['"`](\.{1,2}\/[^'"`$]+)['"`]\s*\)/gm;
// Files read at run time by URL relative to a module (new URL('...', import.meta.url)).
const URL_RE = /new URL\(\s*['"`](\.{1,2}\/[^'"`$]+)['"`]\s*,\s*import\.meta\.url\s*\)/g;

/**
 * @param {string} root skill directory
 * @param {string[]} entries files relative to root
 * @returns {{ files: string[], missing: { from: string, to: string }[] }}
 */
export function importClosure(root, entries) {
  const seen = new Set(); const missing = [];
  const queue = [...entries];
  while (queue.length) {
    const rel = queue.shift();
    if (seen.has(rel)) continue;
    seen.add(rel);
    const file = path.join(root, rel);
    if (!/\.(mjs|js|cjs)$/.test(rel)) continue;
    const source = fs.readFileSync(file, 'utf8');
    const targets = [];
    for (const match of source.matchAll(IMPORT_RE)) targets.push(match[1] || match[2]);
    for (const match of source.matchAll(URL_RE)) targets.push(match[1]);
    for (const target of targets) {
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(rel), target.split(/[?#]/)[0]));
      // path-contract-allow: portable-logical-path -- import specifiers are POSIX paths relative to the skill root, not native paths.
      if (resolved.startsWith('..')) continue; // outside the skill: not part of the package
      if (!fs.existsSync(path.join(root, resolved))) { missing.push({ from: rel, to: resolved }); continue; }
      if (fs.statSync(path.join(root, resolved)).isDirectory()) continue;
      queue.push(resolved);
    }
  }
  return { files: [...seen].sort(), missing };
}
