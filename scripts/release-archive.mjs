// Reading the release archive, shared by the acceptance scripts. The archive is written by
// scripts/write-deterministic-zip.mjs with stored or deflated entries only.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

/** Unpack a release archive into a folder. Entry names are checked lexically: no absolute paths, drive letters, backslashes or dot segments. */
export function extractZip(buffer, destination) {
  const eocd = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error('not a zip archive (no end of central directory)');
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const root = path.resolve(destination);
  const files = [];
  for (let i = 0; i < count; i += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('corrupt central directory');
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);
    offset += 46 + nameLength + extraLength + commentLength;
    // Entry names are portable logical paths: validate them lexically, never by native prefix.
    const segments = name.replace(/\/$/, '').split('/');
    if (/^[\\/]|^[A-Za-z]:|\\/.test(name) || segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
      throw new Error(`unsafe entry path: ${name}`);
    }
    const target = path.join(root, ...segments);
    if (name.endsWith('/')) { fs.mkdirSync(target, { recursive: true }); continue; }
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const data = buffer.subarray(start, start + compressedSize);
    const bytes = method === 0 ? data : method === 8 ? zlib.inflateRawSync(data) : null;
    if (!bytes) throw new Error(`unsupported compression method ${method} for ${name}`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
    files.push(name);
  }
  return files;
}
