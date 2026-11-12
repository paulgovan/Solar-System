#!/usr/bin/env node
// Downloads the source imagery for the real-surface maps into imagery-src/ (gitignored).
// Small files are fetched whole. The big USGS mosaics are uncompressed strip TIFFs of
// several GB, so only every Nth row is fetched with HTTP range requests and saved as a
// PNG (full width, reduced height); scripts/build-imagery.mjs resamples it from there.
//
//   node scripts/fetch-imagery.mjs [id ...]      (default: everything missing)
//
// All sources are NASA / USGS public-domain products; see SOURCES in imagery.config.mjs.

import { mkdir, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { SOURCES, SRC_DIR } from './imagery.config.mjs';

const exists = (p) => stat(p).then(() => true, () => false);

async function get(url, range) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: range ? { Range: `bytes=${range[0]}-${range[1]}` } : {}, redirect: 'follow' });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
      if (range && res.status !== 206) throw new Error(`server ignored Range for ${url}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (e) {
      if (attempt >= 5) throw e;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
}

// Minimal TIFF/BigTIFF reader: first IFD, the tags needed for uncompressed strips.
async function readTiffLayout(url) {
  const head = await get(url, [0, 65535]);
  const le = head.toString('latin1', 0, 2) === 'II';
  const u16 = (b, o) => (le ? b.readUInt16LE(o) : b.readUInt16BE(o));
  const u32 = (b, o) => (le ? b.readUInt32LE(o) : b.readUInt32BE(o));
  const u64 = (b, o) => Number(le ? b.readBigUInt64LE(o) : b.readBigUInt64BE(o));
  const big = u16(head, 2) === 43;
  const ifdOff = big ? u64(head, 8) : u32(head, 4);
  const ifd = await get(url, [ifdOff, ifdOff + 8191]);
  const count = big ? u64(ifd, 0) : u16(ifd, 0);
  const tags = {};
  for (let i = 0; i < count; i++) {
    const e = (big ? 8 : 2) + i * (big ? 20 : 12);
    const tag = u16(ifd, e), type = u16(ifd, e + 2);
    const n = big ? u64(ifd, e + 4) : u32(ifd, e + 4);
    const vo = e + (big ? 12 : 8);
    const size = { 3: 2, 4: 4, 16: 8 }[type];
    if (!size) continue;
    const read = (b, o) => (size === 2 ? u16(b, o) : size === 4 ? u32(b, o) : u64(b, o));
    if (n * size <= (big ? 8 : 4)) {
      tags[tag] = Array.from({ length: n }, (_, k) => read(ifd, vo + k * size));
    } else {
      const ptr = big ? u64(ifd, vo) : u32(ifd, vo);
      tags[tag] = { ptr, n, size, read };
    }
  }
  const val = (t) => (Array.isArray(tags[t]) ? tags[t][0] : undefined);
  const width = val(256), height = val(257), spp = val(277) ?? 1, compression = val(259) ?? 1;
  const planar = val(284) ?? 1, rowsPerStrip = val(278) ?? height;
  const bits = Array.isArray(tags[258]) ? tags[258][0] : 8;
  if (compression !== 1 || bits !== 8 || rowsPerStrip !== 1) {
    throw new Error(`${url}: expected uncompressed 8-bit, 1 row per strip (got compr ${compression}, bits ${bits}, rps ${rowsPerStrip})`);
  }
  const so = tags[273];
  const offsets = Array.isArray(so) ? so : await (async () => {
    const buf = await get(url, [so.ptr, so.ptr + so.n * so.size - 1]);
    return Array.from({ length: so.n }, (_, k) => so.read(buf, k * so.size));
  })();
  return { width, height, spp, planar, offsets };
}

async function fetchRowSampled(src, out) {
  const t = await readTiffLayout(src.url);
  const rows = src.rows;
  const bands = t.spp;
  const rowBytes = t.planar === 2 ? t.width : t.width * bands;
  console.log(`  ${t.width}×${t.height}, ${bands} band(s), planar ${t.planar}: fetching ${rows} of ${t.height} rows`);
  const outBuf = Buffer.alloc(t.width * rows * bands);
  const jobs = [];
  for (let j = 0; j < rows; j++) {
    const r = Math.min(t.height - 1, Math.floor(((j + 0.5) * t.height) / rows));
    if (t.planar === 2) for (let b = 0; b < bands; b++) jobs.push({ j, b, off: t.offsets[b * t.height + r] });
    else jobs.push({ j, b: -1, off: t.offsets[r] });
  }
  let done = 0;
  const worker = async () => {
    while (jobs.length) {
      const job = jobs.shift();
      const data = await get(src.url, [job.off, job.off + rowBytes - 1]);
      if (job.b < 0) data.copy(outBuf, job.j * t.width * bands);
      else for (let x = 0; x < t.width; x++) outBuf[(job.j * t.width + x) * bands + job.b] = data[x];
      if (++done % 200 === 0) process.stdout.write(`  ${done} rows\r`);
    }
  };
  await Promise.all(Array.from({ length: 12 }, worker));
  await sharp(outBuf, { raw: { width: t.width, height: rows, channels: bands } }).png({ compressionLevel: 3 }).toFile(out);
}

const want = process.argv.slice(2);
await mkdir(SRC_DIR, { recursive: true });
for (const src of SOURCES) {
  if (want.length && !want.includes(src.id)) continue;
  const out = join(SRC_DIR, src.file);
  if (await exists(out)) { console.log(`✓ ${src.file} (cached)`); continue; }
  console.log(`↓ ${src.file}  ←  ${src.url}`);
  if (src.rows) await fetchRowSampled(src, out);
  else await writeFile(out, await get(src.url));
}
console.log('done');
