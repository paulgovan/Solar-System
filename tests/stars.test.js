import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { decodeStars, bvToRGB } from '../src/scene/starCatalog.js';
import { catalogAttributes } from '../src/scene/sky.js';
import { constellationSegments } from '../src/scene/constellations.js';

const cat = decodeStars(new Uint8Array(readFileSync(new URL('../src/data/stars.bin', import.meta.url))));
const figures = JSON.parse(readFileSync(new URL('../src/data/constellations.json', import.meta.url), 'utf8'));
const attrs = catalogAttributes(cat, (bv) => bvToRGB(bv));

// Independent J2000 equatorial → ecliptic → scene (x, z, −y) conversion
const EPS = 23.4392911 * Math.PI / 180, D = Math.PI / 180;
function expected(ra, dec) {
  const x = Math.cos(dec * D) * Math.cos(ra * D), y = Math.cos(dec * D) * Math.sin(ra * D), z = Math.sin(dec * D);
  const ye = Math.cos(EPS) * y + Math.sin(EPS) * z, ze = -Math.sin(EPS) * y + Math.cos(EPS) * z;
  return [x, ze, -ye];
}
function nearestIndex(ra, dec) {
  const e = expected(ra, dec);
  let best = -1, bc = -2;
  for (let i = 0; i < cat.count; i++) {
    const c = e[0] * attrs.dir[i * 3] + e[1] * attrs.dir[i * 3 + 1] + e[2] * attrs.dir[i * 3 + 2];
    if (c > bc) { bc = c; best = i; }
  }
  return { index: best, sepDeg: Math.acos(Math.min(1, bc)) / D };
}

describe('star catalogue', () => {
  it('decodes every BSC5 star with a position', () => {
    expect(cat.count).toBe(9096);
    expect(cat.vmag[0]).toBeCloseTo(-1.46, 2); // Sirius first (sorted by brightness)
    for (let i = 1; i < cat.count; i++) expect(cat.vmag[i]).toBeGreaterThanOrEqual(cat.vmag[i - 1]);
  });

  // SIMBAD J2000 positions
  it.each([
    ['Sirius', 101.28716, -16.71612, -1.46],
    ['Betelgeuse', 88.79294, 7.40706, 0.5],
    ['Polaris', 37.95456, 89.26411, 2.02],
  ])('%s lies within 0.1° of its catalogue direction in scene space', (_, ra, dec, mag) => {
    const { index, sepDeg } = nearestIndex(ra, dec);
    expect(sepDeg).toBeLessThan(0.1);
    expect(cat.vmag[index]).toBeCloseTo(mag, 1);
  });

  it('colours hot stars blue and cool stars red', () => {
    const [r1, , b1] = bvToRGB(-0.03); // Sirius-like
    const [r2, , b2] = bvToRGB(1.85); // Betelgeuse
    expect(b1).toBeGreaterThan(r1);
    expect(r2).toBeGreaterThan(b2);
  });

  it('applies proper motion: Arcturus drifts ~2.3″ per year', () => {
    const { index } = nearestIndex(213.9153, 19.1824);
    const v = Math.hypot(attrs.vel[index * 3], attrs.vel[index * 3 + 1], attrs.vel[index * 3 + 2]) / D * 3600;
    expect(v).toBeGreaterThan(2.2);
    expect(v).toBeLessThan(2.4);
  });
});

describe('constellations', () => {
  it('has 88 constellations whose lines reference catalogue stars', () => {
    expect(new Set(figures.map((f) => f.id)).size).toBe(88);
    for (const [a, b] of constellationSegments(figures)) {
      expect(a).toBeLessThan(cat.count);
      expect(b).toBeLessThan(cat.count);
    }
  });

  it('Orion connects Betelgeuse', () => {
    const ori = figures.find((f) => f.id === 'Ori');
    const betel = nearestIndex(88.79294, 7.40706).index;
    expect(ori.lines.flat()).toContain(betel);
  });
});
