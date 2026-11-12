import { describe, it, expect } from 'vitest';
import fixture from './fixtures/horizons-moon.json';
import { moonEclipticOfDate, moonGeocentric, eclipticDateToJ2000, AU_KM, J2000, DEG } from '../src/ephemeris/index.js';

// Fixture JDs are TDB; treat as TT (difference < 2 ms).
const T_of = (jd) => (jd - J2000) / 36525;

function angleDeg(a, b) {
  const cross = Math.hypot(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
  const dot = a.x * b.x + a.y * b.y + a.z * b.z;
  return Math.atan2(cross, dot) / DEG;
}

describe('Moon — Meeus chapter 47 (ELP-2000/82 truncated)', () => {
  it('reproduces Meeus Example 47.a (1992 Apr 12, 0h TD)', () => {
    const m = moonEclipticOfDate(T_of(2448724.5));
    expect(m.lambda).toBeCloseTo(133.162655, 5);
    expect(m.beta).toBeCloseTo(-3.229126, 5);
    expect(Math.abs(m.delta - 368409.7)).toBeLessThan(0.1);
  });

  it('precession to J2000 is the identity at J2000 and ~1.4° per century in longitude', () => {
    const a = eclipticDateToJ2000(1.0, 0.05, 0);
    expect(a.lambda).toBeCloseTo(1.0, 12);
    expect(a.beta).toBeCloseTo(0.05, 12);
    const b = eclipticDateToJ2000(1.0, 0.0, 1); // ecliptic of 2100 → J2000
    expect((1.0 - b.lambda) / DEG).toBeCloseTo(1.397, 2);
  });

  for (const ref of fixture.moon) {
    const year = 2000 + (ref.jd - J2000) / 365.25;
    it(`matches JPL Horizons @ JD ${ref.jd} (~${Math.round(year)}) to better than 0.01°`, () => {
      const p = moonGeocentric(T_of(ref.jd));
      expect(angleDeg(p, ref)).toBeLessThan(0.01);
      const dKm = Math.abs(Math.hypot(p.x, p.y, p.z) - Math.hypot(ref.x, ref.y, ref.z)) * AU_KM;
      expect(dKm).toBeLessThan(30);
    });
  }
});
