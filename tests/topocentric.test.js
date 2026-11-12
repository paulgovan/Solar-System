import { describe, it, expect } from 'vitest';
import {
  meanSiderealTime, apparentSiderealTime, nutation, meanObliquity, equatorialToHorizontal,
  refractionFromTrue, refractionFromApparent, topocentricEquatorial, findCrossings, angularSeparation,
  precessJ2000, equatorialOfDate, toRaDec, moonPhase, skyPosition, apparentGeocentric, riseTransitSet, compassPoint,
  horizontalToVector, equatorialToHorizontalMatrix, dateToJD, DEG, J2000,
} from '../src/ephemeris/index.js';

const hms = (h, m, s) => (h + m / 60 + s / 3600) * 15; // hours → degrees

describe('sidereal time — Meeus chapter 12', () => {
  it('Example 12.a: 1987 Apr 10, 0h UT', () => {
    expect(meanSiderealTime(2446895.5)).toBeCloseTo(hms(13, 10, 46.3668), 6);
    expect(apparentSiderealTime(2446895.5)).toBeCloseTo(hms(13, 10, 46.1351), 4); // 21-term nutation: ±0.003 s
  });
  it('Example 12.b: 1987 Apr 10, 19h21m UT', () => {
    expect(meanSiderealTime(2446896.30625)).toBeCloseTo(hms(8, 34, 57.0896), 6);
  });
  it('Example 22.a: nutation and obliquity, 1987 Apr 10, 0h TD', () => {
    const T = (2446895.5 - J2000) / 36525;
    const { dpsi, deps } = nutation(T);
    expect(dpsi * 3600).toBeCloseTo(-3.788, 1);
    expect(deps * 3600).toBeCloseTo(9.443, 1);
    expect(meanObliquity(T)).toBeCloseTo(23 + 26 / 60 + 27.407 / 3600, 6);
  });
});

describe('horizontal coordinates — Meeus chapter 13', () => {
  it('Example 13.b: Venus at the US Naval Observatory, 1987 Apr 10 19h21m00s UT', () => {
    const lat = 38 + 55 / 60 + 17 / 3600;
    const L = 77 + 3 / 60 + 56 / 3600; // west
    const ra = 347.3193, dec = -(6 + 43 / 60 + 11.61 / 3600);
    const H = 128.7369 - L - ra; // θ0 apparent sidereal time at Greenwich, deg (Meeus: 8h34m56.853s)
    const { alt, az } = equatorialToHorizontal(H, dec, lat);
    expect(alt).toBeCloseTo(15.1249, 3);
    expect(az).toBeCloseTo(68.0337 + 180, 3); // Meeus measures from the South; we from the North
  });

  it('the same example from the apparent sidereal time of the date', () => {
    const jd = 2446896.30625;
    const theta = apparentSiderealTime(jd); // Meeus: 8h34m56.853s
    expect(theta).toBeCloseTo(hms(8, 34, 56.853), 4);
  });

  it('cardinal sanity: the celestial pole stands at the latitude, due North', () => {
    const { alt, az } = equatorialToHorizontal(0, 90, 40);
    expect(alt).toBeCloseTo(40, 9);
    expect(Math.min(az, 360 - az)).toBeLessThan(1e-6);
    // star on the meridian south of the zenith
    const s = equatorialToHorizontal(0, 10, 40);
    expect(s.alt).toBeCloseTo(60, 9);
    expect(s.az).toBeCloseTo(180, 9);
    // rising star (H = −90°) at the equator is due East
    expect(equatorialToHorizontal(-90, 0, 0).az).toBeCloseTo(90, 9);
  });

  it('horizontal ↔ vector axes are East, Up, South', () => {
    const e = horizontalToVector(0, 90), n = horizontalToVector(0, 0), z = horizontalToVector(90, 0);
    const r = (v) => [v.x, v.y, v.z].map((c) => Math.round(c) + 0);
    expect(r(e)).toEqual([1, 0, 0]);
    expect(r(n)).toEqual([0, 0, -1]);
    expect(r(z)).toEqual([0, 1, 0]);
    expect(compassPoint(0)).toBe('N');
    expect(compassPoint(247)).toBe('WSW');
  });

  it('the sidereal matrix agrees with equatorialToHorizontal for a J2000 star', () => {
    const jd = dateToJD(new Date('2026-12-15T21:30:00Z'));
    const lat = 40.7, lon = -74;
    const ra = 88.79, dec = 7.407; // Betelgeuse
    const a = ra * DEG, d = dec * DEG;
    const m = equatorialToHorizontalMatrix(jd, lat, lon);
    const v = { x: Math.cos(d) * Math.cos(a), y: Math.cos(d) * Math.sin(a), z: Math.sin(d) };
    const h = [0, 1, 2].map((i) => m[3 * i] * v.x + m[3 * i + 1] * v.y + m[3 * i + 2] * v.z);
    const alt = Math.asin(h[1]) / DEG, az = (Math.atan2(h[0], -h[2]) / DEG + 360) % 360;
    // same star through the long route: precess + nutate, then hour angle
    const of = toRaDec(equatorialOfDate(v, jd));
    const H = apparentSiderealTime(jd) + lon - of.ra;
    const ref = equatorialToHorizontal(H, of.dec, lat);
    expect(Math.abs(alt - ref.alt)).toBeLessThan(0.0005);
    expect(Math.abs(az - ref.az)).toBeLessThan(0.0005);
  });
});

describe('precession — Meeus chapter 21', () => {
  it('Example 21.b: θ Persei from J2000.0 to 2028 Nov 13.19 TD (rigorous, no proper motion)', () => {
    const a = 41.054063 * DEG, d = 49.227750 * DEG;
    const T = (2462088.69 - 2451545) / 36525; // 2028-11-13.19 TD
    const p = toRaDec(precessJ2000({ x: Math.cos(d) * Math.cos(a), y: Math.cos(d) * Math.sin(a), z: Math.sin(d) }, T));
    expect(p.ra).toBeCloseTo(41.547214, 4);
    expect(p.dec).toBeCloseTo(49.348483, 4);
  });
});

describe('refraction and parallax', () => {
  it('refraction ≈ 34.5′ at the horizon, ≈ 1′ at 45°, 0 overhead', () => {
    expect(refractionFromApparent(0) * 60).toBeGreaterThan(33.5);
    expect(refractionFromApparent(0) * 60).toBeLessThan(35.5);
    expect(refractionFromApparent(45) * 60).toBeCloseTo(0.98, 1);
    expect(refractionFromApparent(10) * 60).toBeCloseTo(5.3, 0);
    expect(Math.abs(refractionFromApparent(90))).toBeLessThan(0.002);
    expect(refractionFromTrue(0) * 60).toBeCloseTo(28.9, 0); // true altitude 0° → lifted ~29′
  });
  it('the two refraction formulas are inverses to a few arcseconds', () => {
    for (const h of [0.5, 2, 5, 10, 20, 45, 70]) {
      const app = h + refractionFromTrue(h);
      expect(Math.abs(app - refractionFromApparent(app) - h) * 3600).toBeLessThan(15);
    }
  });
  it('the Moon on the horizon is lowered by its horizontal parallax (~57′); no change at the zenith', () => {
    const dist = 384400 / 149597870.7;
    // observer on the equator, Moon on the celestial equator, rising (H = −90°)
    const t = topocentricEquatorial(-90, 0, dist, 0);
    const { alt } = equatorialToHorizontal(t.H, t.dec, 0);
    expect(alt).toBeCloseTo(-0.9507, 2);
    const z = topocentricEquatorial(0, 0, dist, 0);
    expect(Math.abs(z.H) + Math.abs(z.dec)).toBeLessThan(1e-9);
    // a planet at 1 AU barely moves: 8.8″
    const p = topocentricEquatorial(-90, 0, 1, 0);
    expect(Math.abs(equatorialToHorizontal(p.H, p.dec, 0).alt) * 3600).toBeCloseTo(8.794, 0);
  });
});

describe('rising and setting — Meeus Example 15.a', () => {
  // Venus at Boston, 1988 March 20. Tabulated apparent α, δ at 0h TD of March 19, 20 and 21;
  // apparent sidereal time at Greenwich 0h UT of March 20: 11h50m58.10s; ΔT = 56 s.
  const ra = [hms(2, 42, 43.25), hms(2, 46, 55.51), hms(2, 51, 7.69)];
  const dec = [18 + 2 / 60 + 51.4 / 3600, 18 + 26 / 60 + 27.3 / 3600, 18 + 49 / 60 + 38.7 / 3600];
  const interp = (y, n) => { const a = y[1] - y[0], b = y[2] - y[1]; return y[1] + (n / 2) * (a + b + n * (b - a)); };
  const lat = 42.3333, lon = -71.0833;
  const day0 = 2447240.5; // 1988 March 20, 0h UT
  const alt = (jd) => {
    const m = jd - day0, n = m + 56 / 86400;
    const theta = hms(11, 50, 58.1) + 360.985647 * m;
    return equatorialToHorizontal(theta + lon - interp(ra, n), interp(dec, n), lat).alt + 0.5667;
  };
  it('finds the rise, transit-side crossing and set Meeus lists (±1 minute)', () => {
    const c = findCrossings(alt, day0, day0 + 1);
    const rise = c.find((x) => x.rising), set = c.find((x) => !x.rising);
    expect((rise.jd - day0) * 1440).toBeCloseTo(0.51766 * 1440, -0.3); // 12h25m UT, within a minute
    expect(Math.abs(rise.jd - day0 - 0.51766)).toBeLessThan(1.2 / 1440);
    expect(Math.abs(set.jd - day0 - 0.12130)).toBeLessThan(1.2 / 1440);
  });
});

describe('the Sun, Moon and planets', () => {
  it('Example 25.a: the Sun on 1992 Oct 13, 0h TD — apparent α = 198.378178°, δ = −7.783871°, R = 0.99766 AU', () => {
    const jd = 2448908.5 - 59 / 86400;
    const g = apparentGeocentric('sun', jd);
    expect(Math.abs(g.ra - 198.378178)).toBeLessThan(0.02);
    expect(Math.abs(g.dec + 7.783871)).toBeLessThan(0.02);
    expect(g.dist).toBeCloseTo(0.99766, 3);
  });

  it('Example 47.a: the Moon on 1992 Apr 12, 0h TD is 368,409.7 km away and ~58′ of parallax', () => {
    const jd = 2448724.5 - 59 / 86400;
    const g = apparentGeocentric('moon', jd);
    expect(g.dist * 149597870.7).toBeCloseTo(368409.7, -1);
    const s = skyPosition('moon', jd, { lat: 0, lon: 0 });
    expect(s.parallax).toBeCloseTo(0.9920, 3); // asin(6378.14 / 368409.7)
  });

  it('lunar phase on known dates (Meeus ch. 49 / USNO)', () => {
    const at = (iso) => moonPhase(dateToJD(new Date(iso)));
    expect(at('2000-01-06T18:14:00Z').fraction).toBeLessThan(0.002); // new
    expect(at('2000-01-06T18:14:00Z').name).toBe('New Moon');
    expect(at('2000-01-21T04:40:00Z').fraction).toBeGreaterThan(0.998); // full
    expect(at('2025-03-14T06:55:00Z').name).toBe('Full Moon');
    const fq = at('2000-01-14T13:34:00Z');
    expect(fq.fraction).toBeCloseTo(0.5, 1);
    expect(fq.name).toBe('First quarter');
    expect(fq.waxing).toBe(true);
    expect(fq.brightLimbAngle).toBeGreaterThan(240); // lit limb faces west
    expect(fq.brightLimbAngle).toBeLessThan(300);
    expect(at('2000-01-29T00:00:00Z').waxing).toBe(false);
  });

  it('angular separation', () => {
    expect(angularSeparation(10, 0, 20, 0)).toBeCloseTo(10, 10);
    expect(angularSeparation(0, 90, 123, 90)).toBeCloseTo(0, 10);
    expect(angularSeparation(0, 45, 180, 45)).toBeCloseTo(90, 10);
    // Meeus Example 17.a: Arcturus–Spica 32.7930°
    expect(angularSeparation(hms(14, 15, 39.7), 19 + 10 / 60 + 57 / 3600, hms(13, 25, 11.6), -(11 + 9 / 60 + 41 / 3600))).toBeCloseTo(32.7930, 3);
  });

  it('the Sun is up at noon and down at midnight (equator, equinox)', () => {
    const noon = dateToJD(new Date('2026-03-20T12:00:00Z')), mid = dateToJD(new Date('2026-03-21T00:00:00Z'));
    expect(skyPosition('sun', noon, { lat: 0, lon: 0 }).alt).toBeGreaterThan(85);
    expect(skyPosition('sun', mid, { lat: 0, lon: 0 }).alt).toBeLessThan(-85);
  });

  it('rise / set status: polar day and night', () => {
    const jd0 = dateToJD(new Date('2026-06-21T00:00:00Z'));
    expect(riseTransitSet('sun', { lat: 80, lon: 0 }, jd0, jd0 + 1).status).toBe('circumpolar');
    const w0 = dateToJD(new Date('2026-12-21T00:00:00Z'));
    expect(riseTransitSet('sun', { lat: 80, lon: 0 }, w0, w0 + 1).status).toBe('never');
  });
});
