#!/usr/bin/env node
// Build the real-sky data files from their published sources:
//
//   node scripts/build-stars.mjs <bsc5.dat> <constellations.lines.json> <constellations.json>
//
// Inputs (not committed; download them yourself):
//   bsc5.dat                   Yale Bright Star Catalogue, 5th rev. (Hoffleit & Warren 1991),
//                              public domain — http://tdc-www.harvard.edu/catalogs/bsc5.dat.gz (gunzip first)
//   constellations.lines.json  d3-celestial, © 2015 Olaf Frohn, BSD-3-Clause —
//   constellations.json        https://github.com/ofrohn/d3-celestial/tree/master/data
//
// Outputs:
//   src/data/stars.bin            every BSC5 star with a position, brightest first (format below)
//   src/data/constellations.json  [{id, name, label: [ra, dec], lines: [[starIndex, …], …]}]
//                                 line vertices are indices into stars.bin, so lines follow the
//                                 stars' proper motion exactly.
//
// stars.bin, little-endian:
//   header  16 bytes: 'BSC5', uint32 version (1), uint32 count, uint32 record size (16)
//   record  16 bytes: uint32 RA  (J2000, units of 1e-7 degree)
//                     int32  Dec (J2000, units of 1e-7 degree)
//                     int16  V magnitude × 100
//                     int16  B−V × 1000 (estimated from the spectral class where the catalogue has none)
//                     int16  proper motion in RA·cos(Dec), mas/yr
//                     int16  proper motion in Dec, mas/yr

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const [bscPath, linesPath, namesPath] = process.argv.slice(2);
if (!bscPath || !linesPath || !namesPath) {
  console.error('usage: node scripts/build-stars.mjs <bsc5.dat> <constellations.lines.json> <constellations.json>');
  process.exit(1);
}
const outDir = resolve(dirname(fileURLToPath(import.meta.url)), '../src/data');
mkdirSync(outDir, { recursive: true });

// ---------------------------------------------------------------------------
// Bright Star Catalogue (fixed-width; byte ranges from the catalogue ReadMe, 1-based)
// ---------------------------------------------------------------------------
const col = (line, a, b) => line.slice(a - 1, b).trim();
const num = (s) => (s === '' ? NaN : Number(s));

// Mean B−V by spectral class, for the few stars without photometry.
const BV_BY_CLASS = { O: -0.31, B: -0.16, A: 0.1, F: 0.42, G: 0.7, K: 1.15, M: 1.6, N: 2.5, C: 2.5, R: 1.7, S: 1.7 };

const stars = [];
let estimated = 0;
for (const line of readFileSync(bscPath, 'latin1').split(/\r?\n/)) {
  if (line.length < 114) continue;
  const raH = col(line, 76, 77);
  if (raH === '') continue; // the 14 entries removed from the catalogue (novae, non-stellar objects)
  const hr = num(col(line, 1, 4));
  const ra = (num(raH) + num(col(line, 78, 79)) / 60 + num(col(line, 80, 83)) / 3600) * 15;
  const decAbs = num(col(line, 85, 86)) + num(col(line, 87, 88)) / 60 + num(col(line, 89, 90)) / 3600;
  const dec = col(line, 84, 84) === '-' ? -decAbs : decAbs;
  const vmag = num(col(line, 103, 107));
  let bv = num(col(line, 110, 114));
  if (!Number.isFinite(bv)) {
    const cls = col(line, 128, 147).replace(/^[a-z]+/, '')[0];
    bv = BV_BY_CLASS[cls] ?? 0.6;
    estimated++;
  }
  const pmra = num(col(line, 149, 154)) || 0;
  const pmdec = num(col(line, 155, 160)) || 0;
  if (![ra, dec, vmag].every(Number.isFinite)) throw new Error(`Bad record HR ${hr}`);
  stars.push({ hr, ra, dec, vmag, bv, pmra, pmdec });
}
stars.sort((a, b) => a.vmag - b.vmag || a.hr - b.hr);

const REC = 16;
const buf = Buffer.alloc(16 + stars.length * REC);
buf.write('BSC5', 0, 'ascii');
buf.writeUInt32LE(1, 4);
buf.writeUInt32LE(stars.length, 8);
buf.writeUInt32LE(REC, 12);
const clamp16 = (x) => Math.max(-32768, Math.min(32767, Math.round(x)));
stars.forEach((s, i) => {
  const o = 16 + i * REC;
  buf.writeUInt32LE(Math.round(s.ra * 1e7) % 3600000000, o);
  buf.writeInt32LE(Math.round(s.dec * 1e7), o + 4);
  buf.writeInt16LE(clamp16(s.vmag * 100), o + 8);
  buf.writeInt16LE(clamp16(s.bv * 1000), o + 10);
  buf.writeInt16LE(clamp16(s.pmra * 1000), o + 12);
  buf.writeInt16LE(clamp16(s.pmdec * 1000), o + 14);
});
writeFileSync(resolve(outDir, 'stars.bin'), buf);

// ---------------------------------------------------------------------------
// Constellation lines: snap every d3-celestial vertex to its catalogue star.
// ---------------------------------------------------------------------------
const DEG = Math.PI / 180;
const unit = (ra, dec) => [Math.cos(dec * DEG) * Math.cos(ra * DEG), Math.cos(dec * DEG) * Math.sin(ra * DEG), Math.sin(dec * DEG)];
const dirs = stars.map((s) => unit(s.ra, s.dec));
// Coarse Dec bands keep the nearest-star search cheap.
const bands = new Map();
stars.forEach((s, i) => {
  const k = Math.floor(s.dec);
  if (!bands.has(k)) bands.set(k, []);
  bands.get(k).push(i);
});
function nearest(ra, dec) {
  const u = unit(ra, dec);
  let best = -1, bestCos = -2;
  for (let k = Math.floor(dec) - 1; k <= Math.floor(dec) + 1; k++) {
    for (const i of bands.get(k) || []) {
      const d = dirs[i];
      const c = u[0] * d[0] + u[1] * d[1] + u[2] * d[2];
      if (c > bestCos) { bestCos = c; best = i; }
    }
  }
  return { index: best, sep: Math.acos(Math.min(1, bestCos)) / DEG };
}

const lineData = JSON.parse(readFileSync(linesPath, 'utf8'));
const nameData = JSON.parse(readFileSync(namesPath, 'utf8'));
// Serpens appears twice under one id (Caput, Cauda) in both files, in the same order.
const names = new Map();
for (const f of nameData.features) names.set(f.id, [...(names.get(f.id) || []), f]);
const MAX_SEP = 0.1; // degrees
let worst = 0, vertices = 0;
const constellations = lineData.features.map((f) => {
  const meta = names.get(f.id)?.shift();
  if (!meta) throw new Error(`No name for constellation ${f.id}`);
  const lines = f.geometry.coordinates.map((path) => path.map(([lon, lat]) => {
    const { index, sep } = nearest((lon + 360) % 360, lat);
    if (sep > MAX_SEP) throw new Error(`${f.id}: no catalogue star within ${MAX_SEP}° of (${lon}, ${lat}); nearest ${sep.toFixed(3)}°`);
    worst = Math.max(worst, sep);
    vertices++;
    return index;
  }));
  const [lon, lat] = meta.geometry.coordinates;
  return { id: f.id, name: meta.properties.name, label: [+((lon + 360) % 360).toFixed(3), +lat.toFixed(3)], lines };
});
const out = constellations.sort((a, b) => a.id.localeCompare(b.id) || a.name.localeCompare(b.name));
writeFileSync(
  resolve(outDir, 'constellations.json'),
  '[\n' + out.map((c) => JSON.stringify(c)).join(',\n') + '\n]\n',
);

console.log(`stars.bin: ${stars.length} stars (${estimated} with B−V estimated from spectral class), ${buf.length} bytes`);
console.log(`constellations.json: ${out.length} figures (Serpens is two), ${vertices} line vertices, worst snap ${(worst * 3600).toFixed(1)}″`);
