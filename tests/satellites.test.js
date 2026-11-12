// Major moons vs JPL Horizons (geometric, parent-centred, ecliptic J2000; fixture JDs are TDB ≈ TT).
// Achieved accuracy 1950–2050 (80 independent dates, see scripts/fit-satellites.mjs):
//   Galileans (Meeus ch. 44): median ≈ 0.01°, max ≈ 0.075°
//   Mean-element moons: max 0.03° (Triton) … 0.33° (Ariel); Charon 0.004°, Titan 0.04°.
import { describe, it, expect } from 'vitest';
import fixture from './fixtures/moons-horizons.json';
import { galileanPositions, GALILEAN } from '../src/ephemeris/galilean.js';
import { satellitePosition } from '../src/ephemeris/satellites.js';

const ang = (a, b) => (Math.acos(Math.min(1, (a.x * b.x + a.y * b.y + a.z * b.z) / Math.hypot(a.x, a.y, a.z) / Math.hypot(b.x, b.y, b.z))) * 180) / Math.PI;
const pos = (id, jd) => (GALILEAN.includes(id) ? galileanPositions(jd)[id] : satellitePosition(id, jd));
const REQUIRED = ['io', 'europa', 'titan', 'triton', 'charon'];

describe('moon positions vs JPL Horizons', () => {
  for (const [id, samples] of Object.entries(fixture)) {
    it(`${id} within ${REQUIRED.includes(id) ? '0.2' : '0.5'}° and 0.5% distance`, () => {
      for (const r of samples) {
        const p = pos(id, r.jd);
        expect(ang(p, r)).toBeLessThan(REQUIRED.includes(id) ? 0.2 : 0.5);
        expect(Math.abs(Math.hypot(p.x, p.y, p.z) / Math.hypot(r.x, r.y, r.z) - 1)).toBeLessThan(0.005);
      }
    });
  }
});
