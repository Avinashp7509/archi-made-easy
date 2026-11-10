#!/usr/bin/env node
// Measure how far the final interface is from the upstream baseline, screenshot against
// screenshot. For every screenshot in upstream-baseline/ that has a counterpart with the
// same document, viewport, theme and state in archi-made-easy-after/, report the share of
// pixels that differ by a visible amount. Both sets were captured from running pages.
//
//   node docs/visual-qa/tools/compare-with-upstream.mjs            print a table
//   node docs/visual-qa/tools/compare-with-upstream.mjs --write    also write upstream-comparison.json
//
// A pixel counts as different when any colour channel differs by more than 24 of 255, the
// threshold the visual regression check uses. No dependency: PNG is decoded here.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const upstreamDirectory = path.join(here, '..', 'upstream-baseline');
const finalDirectory = path.join(here, '..', 'archi-made-easy-after');
const THRESHOLD = 24;

/** Decode an 8-bit, non-interlaced RGB or RGBA PNG to { width, height, channels, data }. */
export function decodePng(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47 || buffer.readUInt32BE(4) !== 0x0d0a1a0a) throw new Error('not a PNG file');
  let offset = 8; let header = null; const parts = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('latin1', offset + 4, offset + 8);
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') header = { width: body.readUInt32BE(0), height: body.readUInt32BE(4), depth: body[8], colour: body[9], interlace: body[12] };
    else if (type === 'IDAT') parts.push(body);
    else if (type === 'IEND') break;
    offset += 12 + length;
  }
  if (!header || header.depth !== 8 || header.interlace !== 0 || ![2, 6].includes(header.colour)) throw new Error('unsupported PNG (need 8-bit RGB or RGBA, not interlaced)');
  const channels = header.colour === 6 ? 4 : 3;
  const stride = header.width * channels;
  const raw = zlib.inflateSync(Buffer.concat(parts));
  const data = Buffer.alloc(stride * header.height);
  for (let y = 0; y < header.height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = y * (stride + 1) + 1;
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? data[y * stride + x - channels] : 0;
      const up = y > 0 ? data[(y - 1) * stride + x] : 0;
      const upLeft = y > 0 && x >= channels ? data[(y - 1) * stride + x - channels] : 0;
      let predicted = 0;
      if (filter === 1) predicted = left;
      else if (filter === 2) predicted = up;
      else if (filter === 3) predicted = (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - upLeft; const a = Math.abs(p - left); const b = Math.abs(p - up); const c = Math.abs(p - upLeft);
        predicted = a <= b && a <= c ? left : b <= c ? up : upLeft;
      }
      data[y * stride + x] = (raw[line + x] + predicted) & 255;
    }
  }
  return { width: header.width, height: header.height, channels, data };
}

/**
 * Share of pixels that differ, over the area both images cover: `changed` by a clearly
 * visible amount (more than 24 of 255 in a channel), `any` by more than 4 of 255, which
 * also counts a background that only moved from one light grey to another.
 */
export function difference(a, b) {
  const width = Math.min(a.width, b.width); const height = Math.min(a.height, b.height);
  let different = 0; let any = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * a.width + x) * a.channels; const j = (y * b.width + x) * b.channels;
      const delta = Math.max(Math.abs(a.data[i] - b.data[j]), Math.abs(a.data[i + 1] - b.data[j + 1]), Math.abs(a.data[i + 2] - b.data[j + 2]));
      if (delta > THRESHOLD) different += 1;
      if (delta > 4) any += 1;
    }
  }
  return { compared: [width, height], sameSize: a.width === b.width && a.height === b.height, changed: different / (width * height), any: any / (width * height) };
}

export function compareWithUpstream() {
  const rows = [];
  for (const name of fs.readdirSync(upstreamDirectory).filter((file) => file.endsWith('.png')).sort()) {
    const counterpart = path.join(finalDirectory, name);
    if (!fs.existsSync(counterpart)) { rows.push({ screenshot: name, counterpart: false }); continue; }
    const result = difference(decodePng(fs.readFileSync(path.join(upstreamDirectory, name))), decodePng(fs.readFileSync(counterpart)));
    rows.push({ screenshot: name, counterpart: true, sameSize: result.sameSize, compared: result.compared, changedPercent: Math.round(result.changed * 1000) / 10, anyChangePercent: Math.round(result.any * 1000) / 10 });
  }
  return rows;
}

/** Colour tokens read from the two running pages: how many of upstream's have the same value here. */
export function compareTokens() {
  const read = (directory) => { const file = path.join(directory, 'observations.json'); return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).tokens : null; };
  const upstream = read(upstreamDirectory); const final = read(finalDirectory);
  if (!upstream || !final) return null;
  const rows = Object.keys(upstream).map((token) => ({ token, upstream: upstream[token], final: final[token] ?? null, same: String(final[token] ?? '').toLowerCase() === String(upstream[token]).toLowerCase() }));
  return { compared: rows.length, same: rows.filter((row) => row.same).length, rows };
}

if (process.argv[1] && path.basename(process.argv[1]) === 'compare-with-upstream.mjs') {
  const rows = compareWithUpstream();
  const paired = rows.filter((row) => row.counterpart);
  console.log('clearly   any    screenshot');
  for (const row of rows) console.log(row.counterpart ? `${String(row.changedPercent).padStart(6)}% ${String(row.anyChangePercent).padStart(6)}%  ${row.screenshot}${row.sameSize ? '' : `  (sizes differ; compared ${row.compared.join('x')})`}` : `     n/a     n/a  ${row.screenshot}  (no screenshot of the same state in the final set)`);
  const summary = (key) => { const values = paired.map((row) => row[key]).sort((a, b) => a - b); return values.length ? { least: values[0], median: values[Math.floor(values.length / 2)], most: values[values.length - 1] } : null; };
  const clearly = summary('changedPercent'); const any = summary('anyChangePercent');
  if (clearly) console.log(`\n${paired.length} pairs. Pixels that differ clearly: least ${clearly.least}%, median ${clearly.median}%, most ${clearly.most}%. Pixels that differ at all: least ${any.least}%, median ${any.median}%, most ${any.most}%.`);
  const tokens = compareTokens();
  if (tokens) console.log(`Colour tokens: ${tokens.same} of ${tokens.compared} have upstream's value.`);
  if (process.argv.includes('--write')) {
    const output = path.join(here, '..', 'upstream-comparison.json');
    fs.writeFileSync(output, `${JSON.stringify({
      note: 'Upstream baseline against the final interface: same document, viewport, theme and state. Both sets are screenshots of running pages. changedPercent counts pixels that differ by more than 24 of 255 in a colour channel; anyChangePercent, by more than 4.',
      thresholds: { clearly: THRESHOLD, any: 4 }, summary: { pairs: paired.length, clearly, any }, tokens, pairs: rows,
    }, null, 2)}\n`);
    console.log(`wrote ${path.relative(process.cwd(), output)}`);
  }
}
