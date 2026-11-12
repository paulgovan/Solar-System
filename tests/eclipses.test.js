import { describe, it, expect } from 'vitest';
import { lunarPhaseJDE, eclipseAt, findEclipses, eclipsesAround, dateToJD } from '../src/ephemeris/index.js';

const jdUT = (iso) => dateToJD(new Date(iso));
const MIN = 1 / 1440;

describe('lunar phases (Meeus 49)', () => {
  it('reproduces Example 49.a: new Moon of 1977 Feb 18', () => {
    expect(lunarPhaseJDE(-283)).toBeCloseTo(2443192.65118, 4);
  });
  it('full Moons fall half a lunation after new Moons', () => {
    for (const k of [-500, 0, 300]) {
      const d = lunarPhaseJDE(k + 0.5) - lunarPhaseJDE(k);
      expect(d).toBeGreaterThan(13.9);
      expect(d).toBeLessThan(15.6);
    }
  });
});

describe('eclipse conditions (Meeus 54)', () => {
  it('reproduces Example 54.a: partial solar eclipse of 1993 May 21', () => {
    const e = eclipseAt(-82);
    expect(e.kind).toBe('solar');
    expect(e.type).toBe('partial');
    expect(e.gamma).toBeCloseTo(1.1348, 3);
    expect(e.u).toBeCloseTo(0.0097, 3);
    expect(e.magnitude).toBeCloseTo(0.740, 2);
    expect(e.jdTD).toBeCloseTo(2449129.0979, 3);
  });

  // Greatest eclipse (UT) from NASA's eclipse catalogue (F. Espenak).
  const published = [
    ['2024-04-08T18:17Z', 'solar', 'total'],
    ['2025-03-14T06:59Z', 'lunar', 'total'],
    ['2026-03-03T11:34Z', 'lunar', 'total'],
    ['2026-08-12T17:46Z', 'solar', 'total'],
    ['2023-04-20T04:17Z', 'solar', 'hybrid'],
    ['2024-10-02T18:45Z', 'solar', 'annular'],
    ['2024-03-25T07:13Z', 'lunar', 'penumbral'],
    ['2024-09-18T02:44Z', 'lunar', 'partial'],
    ['2025-03-29T10:47Z', 'solar', 'partial'],
  ];
  for (const [iso, kind, type] of published) {
    it(`finds the ${type} ${kind} eclipse of ${iso.slice(0, 10)} within 15 minutes`, () => {
      const t = jdUT(iso);
      const found = findEclipses(t - 2, t + 2);
      expect(found).toHaveLength(1);
      expect(found[0].kind).toBe(kind);
      expect(found[0].type).toBe(type);
      expect(Math.abs(found[0].jd - t)).toBeLessThan(15 * MIN);
    });
  }

  it('finds exactly the four eclipses of 2024', () => {
    const list = findEclipses(jdUT('2024-01-01T00:00Z'), jdUT('2025-01-01T00:00Z'));
    expect(list.map((e) => `${e.type} ${e.kind}`)).toEqual([
      'penumbral lunar', 'total solar', 'partial lunar', 'annular solar',
    ]);
  });

  it('lists previous and next eclipses around a date', () => {
    const { previous, next } = eclipsesAround(jdUT('2026-01-01T00:00Z'), 3, 4);
    expect(previous).toHaveLength(3);
    expect(next).toHaveLength(4);
    expect(previous.every((e) => e.jd < jdUT('2026-01-01T00:00Z'))).toBe(true);
    expect(next[0].type).toBe('annular'); // 2026 Feb 17
    expect(next[1].type).toBe('total'); // 2026 Mar 3 lunar
  });
});
