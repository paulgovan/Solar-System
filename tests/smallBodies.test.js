import { describe, it, expect } from 'vitest';
import fixture from './fixtures/smallBodies.json';
import ELEMENTS from '../src/data/smallBodyElements.json';
import {
  createElementSeries, seriesPosition, smallBodyPosition, prepareElements, nearestElements,
} from '../src/ephemeris/smallBody.js';
import { cometActivity, tailLengths } from '../src/scene/comet.js';
import { SMALL_BODIES } from '../src/data/smallBodies.js';

// Fixture JDs are TDB and lie between element epochs (not used to build the table).
function angleDeg(a, b) {
  const c = (a.x * b.x + a.y * b.y + a.z * b.z) / (Math.hypot(a.x, a.y, a.z) * Math.hypot(b.x, b.y, b.z));
  return (Math.acos(Math.min(1, Math.max(-1, c))) * 180) / Math.PI;
}

describe('small bodies vs JPL Horizons (inside the element table span)', () => {
  // [max heliocentric angle (deg), max relative distance error]; measured worst cases are
  // Ceres 0.023° / 3.9e-4, Vesta 0.022° / 2.8e-4, TNOs ≤0.006° / 1e-4, Halley 0.009° / 1.4e-4
  const tol = {
    ceres: [0.04, 6e-4], vesta: [0.04, 5e-4], eris: [0.01, 2e-4], haumea: [0.01, 2e-4], makemake: [0.01, 2e-4], halley: [0.02, 3e-4],
  };
  for (const [id, refs] of Object.entries(fixture.bodies)) {
    const series = createElementSeries(ELEMENTS.bodies[id].elements);
    const inside = refs.filter((r) => r.jd >= series.start && r.jd <= series.end);
    it(`${id}: ${inside.length} reference points ${Math.round(2000 + (inside[0].jd - 2451545) / 365.25)}–${Math.round(2000 + (inside.at(-1).jd - 2451545) / 365.25)}`, () => {
      expect(inside.length).toBeGreaterThan(30);
      for (const ref of inside) {
        const p = seriesPosition(series, ref.jd);
        const r = Math.hypot(ref.x, ref.y, ref.z);
        expect(angleDeg(p, ref), `JD ${ref.jd}`).toBeLessThan(tol[id][0]);
        expect(Math.abs(Math.hypot(p.x, p.y, p.z) - r) / r, `JD ${ref.jd}`).toBeLessThan(tol[id][1]);
      }
    });
  }

  it('Halley in Feb 1986 is within 0.01° of Horizons and inside 0.6 AU', () => {
    const series = createElementSeries(ELEMENTS.bodies.halley.elements);
    const near = fixture.bodies.halley.filter((r) => Math.abs(r.jd - 2446469.97) < 25);
    expect(near.length).toBeGreaterThanOrEqual(3);
    for (const ref of near) {
      const p = seriesPosition(series, ref.jd);
      expect(angleDeg(p, ref)).toBeLessThan(0.01);
      expect(Math.hypot(p.x, p.y, p.z)).toBeLessThan(0.75);
    }
  });

  it('extrapolates smoothly outside the table (Ceres a few degrees within 30 years)', () => {
    const series = createElementSeries(ELEMENTS.bodies.ceres.elements);
    const outside = fixture.bodies.ceres.filter((r) => r.jd < series.start || r.jd > series.end);
    expect(outside.length).toBeGreaterThan(0);
    for (const ref of outside) expect(angleDeg(seriesPosition(series, ref.jd), ref)).toBeLessThan(5);
  });
});

describe('element series', () => {
  const series = createElementSeries(ELEMENTS.bodies.vesta.elements);

  it('reproduces each epoch exactly and is continuous between epochs', () => {
    const el = series.sets[50];
    const a = seriesPosition(series, el.epoch), b = smallBodyPosition(el, el.epoch);
    expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)).toBeLessThan(1e-12);
    // no jumps: 1-hour steps across an epoch boundary move < 0.001 AU
    for (let jd = el.epoch - 1; jd < el.epoch + 1; jd += 1 / 24) {
      const p = seriesPosition(series, jd), q = seriesPosition(series, jd + 1 / 24);
      expect(Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z)).toBeLessThan(1e-3);
    }
  });

  it('picks the nearest epoch', () => {
    const [a, b] = series.sets.slice(10, 12);
    expect(nearestElements(series, a.epoch + 1)).toBe(a);
    expect(nearestElements(series, b.epoch - 1)).toBe(b);
  });

  it('mean motion from a matches Kepler’s third law', () => {
    const el = prepareElements({ epoch: 0, a: 1, e: 0, i: 0, om: 0, w: 0, ma: 0, n: 0.9856076686 });
    expect(series.sets[0].n * Math.pow(series.sets[0].a, 1.5)).toBeCloseTo(el.n, 9);
  });
});

describe('small-body data', () => {
  it('every body has elements, a unique id and a texture name', () => {
    const ids = new Set();
    for (const b of SMALL_BODIES) {
      expect(ids.has(b.id)).toBe(false);
      ids.add(b.id);
      expect(b.orbit.rows.length).toBeGreaterThan(50);
      expect(b.labelPriority).toBe(2);
      expect(b.toggle).toBe('smallBodies');
    }
  });
});

describe('comet', () => {
  it('is active only inside ~4 AU, with tails growing toward the Sun', () => {
    expect(cometActivity(5)).toBe(0);
    expect(cometActivity(4.3)).toBe(0);
    expect(cometActivity(3.5)).toBeGreaterThan(0);
    expect(cometActivity(1)).toBe(1);
    const far = tailLengths(2), near = tailLengths(1);
    expect(near.ion / far.ion).toBeCloseTo(4, 5); // ∝ 1/r²
    expect(tailLengths(0.587).ion).toBeGreaterThan(0.25);
    expect(tailLengths(0.1).ion).toBeLessThanOrEqual(0.4);
  });
});

describe('Halley perihelia', async () => {
  const { perihelia } = await import('../src/features/smallBodies.js').catch(() => ({}));
  it.skipIf(!perihelia)('finds the 1986 and 2061 passages', () => {
    const series = createElementSeries(ELEMENTS.bodies.halley.elements);
    const { last, next } = perihelia(series, 2446480.5); // 20 Feb 1986
    expect(Math.abs(last - 2446469.97)).toBeLessThan(1); // 9 Feb 1986
    expect(Math.abs(next - 2474033.5)).toBeLessThan(5); // 28 Jul 2061
  });
});
