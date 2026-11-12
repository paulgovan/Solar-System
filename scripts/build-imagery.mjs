#!/usr/bin/env node
// Builds the web textures in public/textures/ from the originals in imagery-src/
// (fetch those first with scripts/fetch-imagery.mjs).
//
//   node scripts/build-imagery.mjs [name ...]
//
// Every output is an equirectangular map with longitude 0 at the centre (u = 0.5),
// east to the right and north up: the convention of the procedural bakes in
// src/textures.js. RGB is sRGB albedo; alpha, where present, is height (Moon) or a
// "has data" mask (Pluto, whose south was in polar night during the flyby).

import { mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { SRC_DIR, OUT_DIR } from './imagery.config.mjs';

sharp.cache(false);
const src = (f) => join(SRC_DIR, f);
const kernel = sharp.kernel.lanczos3;

async function raw(img) {
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  return { data, ...info };
}

/** Roll an RGB(A) raw image horizontally by `shift` pixels (re-centre longitude). */
function roll({ data, width, height, channels }, shift) {
  const out = Buffer.alloc(data.length);
  const row = width * channels;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nx = (x + shift + width) % width;
      data.copy(out, y * row + nx * channels, y * row + x * channels, y * row + (x + 1) * channels);
    }
  }
  return { data: out, width, height, channels };
}

/** Grey → warm-tinted RGB; `tint` is the colour that mid-grey maps to. */
function tintGrey({ data, width, height, channels }, tint, gamma = 1) {
  const out = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    const g = Math.pow(data[i * channels] / 255, gamma);
    for (let c = 0; c < 3; c++) out[i * 3 + c] = Math.min(255, Math.round(255 * g * tint[c]));
  }
  return { data: out, width, height, channels: 3 };
}

function addAlpha(rgb, alpha) {
  const n = rgb.width * rgb.height;
  const out = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) {
    out[i * 4] = rgb.data[i * rgb.channels];
    out[i * 4 + 1] = rgb.data[i * rgb.channels + 1];
    out[i * 4 + 2] = rgb.data[i * rgb.channels + 2];
    out[i * 4 + 3] = alpha.data[i * alpha.channels];
  }
  return { data: out, width: rgb.width, height: rgb.height, channels: 4 };
}

const fromRaw = (r) => sharp(r.data, { raw: { width: r.width, height: r.height, channels: r.channels } });

async function write(name, img, quality = 82, opts = {}) {
  const out = join(OUT_DIR, `${name}.webp`);
  await img.webp({ quality, effort: 6, smartSubsample: true, ...opts }).toFile(out);
  const { size } = await stat(out);
  console.log(`${name}.webp  ${(size / 1024).toFixed(0)} KB`);
  return size;
}

const resize = (file, w) => sharp(src(file), { limitInputPixels: false }).resize(w, w / 2, { fit: 'fill', kernel });

const JOBS = {
  // Blue Marble NG, July 2004 (cloud-free). Ocean mask comes from Natural Earth at runtime.
  async earth_day() {
    await write('earth_day', resize('world.200407.3x5400x2700.jpg', 4096), 84);
    await write('earth_day_2k', resize('world.200407.3x5400x2700.jpg', 2048), 84);
  },
  // Black Marble 2016: drop the faint moonlit-terrain background so only lights remain.
  async earth_night() {
    for (const [name, w] of [['earth_night', 4096], ['earth_night_2k', 2048]]) {
      const r = await raw(resize('BlackMarble_2016_3km.jpg', w).removeAlpha());
      // keep warm lights, suppress the dark blue-grey ground: v = max(0, (lum - k)) scaled
      for (let i = 0; i < r.width * r.height; i++) {
        const p = i * r.channels;
        const lum = (r.data[p] * 0.3 + r.data[p + 1] * 0.59 + r.data[p + 2] * 0.11) / 255;
        const k = Math.min(1, Math.max(0, (lum - 0.07) / 0.3));
        const warm = Math.min(1, Math.max(0, (r.data[p] - r.data[p + 2] + 4) / 24)); // lights are warm, moonlit ice is blue
        const f = k * k * (3 - 2 * k) * warm;
        for (let c = 0; c < 3; c++) r.data[p + c] = Math.round(r.data[p + c] * f);
      }
      await write(name, fromRaw(r), 80);
    }
  },
  // Blue Marble 2002 cloud composite (grey = cloud cover); loader turns grey into alpha.
  async earth_clouds() {
    await write('earth_clouds', sharp(src('cloud_combined_2048.jpg')).greyscale(), 80);
  },
  // LRO WAC colour (CGI Moon Kit) with LOLA elevation in alpha for the bump shading.
  async moon() {
    for (const [name, w] of [['moon', 4096]]) {
      const rgb = await raw(resize('lroc_color_poles_4k.tif', w).removeAlpha());
      const h = await raw(sharp(src('ldem_3_8bit.jpg')).greyscale().resize(w, w / 2, { fit: 'fill', kernel: sharp.kernel.cubic }));
      await write(name, fromRaw(addAlpha(rgb, h)), 82, { alphaQuality: 70 });
    }
  },
  // MESSENGER MDIS monochrome basemap, lightly tinted to Mercury's grey-brown.
  async mercury() {
    const g = await raw(resize('mercury_mdis_bdr_rows.png', 2048).greyscale());
    await write('mercury', fromRaw(tintGrey(g, [1.0, 0.95, 0.88], 0.9)), 82);
  },
  // Viking MDIM colourised mosaic.
  // The colourisation renders the dark albedo regions navy blue; pull them toward the
  // brown-grey they look like in true colour.
  async mars() {
    const r = await raw(resize('mars_viking_clr_rows.png', 2048).removeAlpha());
    for (let i = 0; i < r.width * r.height; i++) {
      const p = i * r.channels;
      const R = r.data[p], G = r.data[p + 1], B = r.data[p + 2];
      const lum = 0.3 * R + 0.59 * G + 0.11 * B;
      const blue = Math.min(1, Math.max(0, (B - R + 10) / 60));
      const tgt = [lum * 1.25, lum * 0.98, lum * 0.78];
      r.data[p] = Math.min(255, Math.round(R + (tgt[0] - R) * blue));
      r.data[p + 1] = Math.min(255, Math.round(G + (tgt[1] - G) * blue));
      r.data[p + 2] = Math.min(255, Math.round(B + (tgt[2] - B) * blue));
    }
    await write('mars', fromRaw(r), 84);
  },
  // Cassini PIA07782 cylindrical map (Dec 2000).
  async jupiter() {
    await write('jupiter', resize('PIA07782.tif', 2048).removeAlpha(), 86);
  },
  // New Horizons mosaic: source is centred on 180°, so roll by half; tint toward
  // Pluto's tan colour; alpha marks pixels that have data.
  async pluto() {
    const g = await raw(resize('pluto_nh_rows.png', 2048).greyscale());
    const rolled = roll(g, g.width / 2);
    const rgb = tintGrey(rolled, [1.05, 0.9, 0.76], 1.0);
    const mask = { data: Buffer.alloc(rolled.width * rolled.height), width: rolled.width, height: rolled.height, channels: 1 };
    for (let i = 0; i < mask.data.length; i++) mask.data[i] = rolled.data[i * rolled.channels] > 6 ? 255 : 0;
    // soften the mask edge a little
    const soft = await raw(fromRaw(mask).blur(3).linear(1.6, -60));
    await write('pluto', fromRaw(addAlpha(rgb, soft)), 82, { alphaQuality: 60 });
  },
};

await mkdir(OUT_DIR, { recursive: true });
const want = process.argv.slice(2);
for (const [name, job] of Object.entries(JOBS)) {
  if (want.length && !want.includes(name)) continue;
  try { await job(); } catch (e) { console.error(`${name}: ${e.message}`); process.exitCode = 1; }
}
