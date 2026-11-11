// Emulates restricted mounted folders. ARCHI_FS_RESTRICTED: folders (path.delimiter-separated, or *).
// ARCHI_FS_FAULTS: nolink (hard links refused), inozero (inode numbers 0), readonly (no writes), norename (rename refused).
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const raw = process.env.ARCHI_FS_RESTRICTED || '';
const all = raw === '*';
const roots = all ? [] : raw.split(path.delimiter).filter(Boolean).map((p) => path.resolve(p).toLowerCase());
const faults = new Set((process.env.ARCHI_FS_FAULTS || 'nolink,inozero').split(',').filter(Boolean));
const norm = (p) => { try { return path.resolve(p instanceof URL ? fileURLToPath(p) : Buffer.isBuffer(p) ? p.toString() : String(p)).toLowerCase(); } catch { return ''; } };
const inside = (p) => { if (p === undefined || p === null || typeof p === 'number') return false; if (all) return true; const r = norm(p); return roots.some((root) => r === root || r.startsWith(root + path.sep)); };
const fail = (code, syscall, p) => { throw Object.assign(new Error(`${code}: emulated restricted filesystem, ${syscall} '${p}'`), { code, syscall, path: String(p) }); };
const fds = new Map();
const open = fs.openSync;
fs.openSync = (p, flags = 'r', ...rest) => {
  const writes = typeof flags === 'number' ? (flags & (fs.constants.O_WRONLY | fs.constants.O_RDWR | fs.constants.O_CREAT)) !== 0 : /[wa+]/.test(flags);
  if (faults.has('readonly') && writes && inside(p)) fail('EROFS', 'open', p);
  const fd = open(p, flags, ...rest); if (inside(p)) fds.set(fd, true); return fd;
};
const close = fs.closeSync; fs.closeSync = (fd) => { fds.delete(fd); return close(fd); };
if (faults.has('nolink')) { const link = fs.linkSync; fs.linkSync = (a, b) => (inside(a) || inside(b) ? fail('EPERM', 'link', b) : link(a, b)); }
if (faults.has('norename')) { const rename = fs.renameSync; fs.renameSync = (a, b) => (inside(a) || inside(b) ? fail('EXDEV', 'rename', b) : rename(a, b)); }
if (faults.has('readonly')) {
  for (const name of ['mkdirSync', 'mkdtempSync', 'unlinkSync', 'renameSync', 'writeFileSync', 'rmdirSync']) { const orig = fs[name]; fs[name] = (p, ...rest) => (inside(p) ? fail('EROFS', name.replace('Sync', ''), p) : orig(p, ...rest)); }
}
if (faults.has('inozero')) {
  const zero = (s) => { if (s && 'ino' in s) Object.defineProperty(s, 'ino', { value: typeof s.ino === 'bigint' ? 0n : 0, enumerable: true }); return s; };
  for (const name of ['lstatSync', 'statSync']) { const orig = fs[name]; fs[name] = (p, ...rest) => { const s = orig(p, ...rest); return inside(p) ? zero(s) : s; }; }
  const fstat = fs.fstatSync; fs.fstatSync = (fd, ...rest) => { const s = fstat(fd, ...rest); return fds.has(fd) ? zero(s) : s; };
}
