import { describe, it, expect } from 'vitest';
import fixture from './fixtures/horizons.json';
import {
  planetPosition, centuriesTT, solveKepler, moonGeocentric, AU_KM, J2000,
} from '../src/ephemeris.js';

// Fixture JDs are TDB; treat as TT (difference < 2 ms).
const T_of = (jd) => (jd - J2000) / 36525;

function angleDeg(a, b) {
  const dot = a.x * b.x + a.y * b.y + a.z * b.z;
  const c = dot / (Math.hypot(a.x, a.y, a.z) * Math.hypot(b.x, b.y, b.z));
  return (Math.acos(Math.min(1, Math.max(-1, c))) * 180) / Math.PI;
}

describe('Kepler solver', () => {
  it('satisfies E - e sin E = M', () => {
    for (const e of [0, 0.1, 0.5, 0.9]) {
      for (const M of [-3, -1, 0.2, 1.5, 3]) {
        const E = solveKepler(M, e);
        expect(E - e * Math.sin(E)).toBeCloseTo(M, 10);
      }
    }
  });
});

describe('planet positions vs JPL Horizons', () => {
  // [max heliocentric angular error in degrees, max relative distance error]
  const tolerance = {
    mercury: [0.05, 0.002], venus: [0.05, 0.002], earth: [0.05, 0.002], mars: [0.05, 0.002],
    jupiter: [0.15, 0.003], saturn: [0.15, 0.004], uranus: [0.1, 0.005], neptune: [0.1, 0.003],
    pluto: [0.3, 0.01],
  };
  // Year 1 AD is far outside Table 1 range: allow looser tolerances there.
  const ancientFactor = 6;

  for (const [id, samples] of Object.entries(fixture.bodies)) {
    for (const ref of samples) {
      const year = 2000 + (ref.jd - J2000) / 365.25;
      it(`${id} @ JD ${ref.jd} (~${Math.round(year)})`, () => {
        const p = planetPosition(id, T_of(ref.jd));
        const f = year < 1000 ? ancientFactor : 1;
        const ang = angleDeg(p, ref);
        const rRef = Math.hypot(ref.x, ref.y, ref.z);
        const rel = Math.abs(Math.hypot(p.x, p.y, p.z) - rRef) / rRef;
        expect(ang).toBeLessThan(tolerance[id][0] * f);
        expect(rel).toBeLessThan(tolerance[id][1] * f);
      });
    }
  }
});

describe('Moon', () => {
  it('stays within the perigee/apogee range', () => {
    for (let i = 0; i < 400; i++) {
      const m = moonGeocentric(centuriesTT(J2000 + i * 3.1));
      const km = Math.hypot(m.x, m.y, m.z) * AU_KM;
      expect(km).toBeGreaterThan(355000);
      expect(km).toBeLessThan(407500);
    }
  });
});
