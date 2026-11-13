import { describe, it, expect } from 'vitest';
import fixture from './fixtures/horizons-sky.json';
import { skyPosition, riseTransitSet, apparentMagnitude } from '../src/ephemeris/index.js';

// Reference values: NASA JPL Horizons observer tables (airless apparent topocentric Az/El and
// magnitude; rise/transit/set from Horizons' own search, to the minute). See
// scripts/fetch-horizons-sky.mjs. Tolerances: Sun, Mars, Jupiter 0.1° (the brief), Moon 0.2°;
// measured errors are printed below and are far smaller.
const sites = Object.fromEntries(fixture.sites.map((s) => [s.id, s]));
const wrap = (d) => ((d + 540) % 360) - 180;
const TOL = { sun: 0.1, moon: 0.2, venus: 0.1, mars: 0.1, jupiter: 0.1, saturn: 0.1 };
const worst = { alt: {}, az: {}, rts: {}, mag: {} };
const upd = (k, body, v) => { worst[k][body] = Math.max(worst[k][body] || 0, v); };

describe('against JPL Horizons observer tables', () => {
  for (const row of fixture.rows) {
    const obs = sites[row.site];
    const name = `${row.site} ${row.day} ${row.body}`;

    it(`${name}: altitude / azimuth`, () => {
      for (const s of row.samples) {
        const p = skyPosition(row.body, s.jd, obs);
        const dAlt = Math.abs(p.alt - s.alt);
        // azimuth error on the sky: scale by cos(alt); ignore it very near the zenith
        const dAz = Math.abs(wrap(p.az - s.az)) * Math.cos(s.alt * Math.PI / 180);
        upd('alt', row.body, dAlt); upd('az', row.body, dAz);
        expect(dAlt, `alt at JD ${s.jd}`).toBeLessThan(TOL[row.body]);
        if (s.alt > -85 && s.alt < 85) expect(dAz, `az at JD ${s.jd}`).toBeLessThan(TOL[row.body]);
      }
    });

    it(`${name}: rise / transit / set within 2 minutes`, () => {
      const jd0 = Math.floor(row.samples[0].jd + 0.5) - 0.5;
      const r = riseTransitSet(row.body, obs, jd0, jd0 + 1);
      const mine = { r: r.rise, t: r.transit, s: r.set };
      const refs = { r: null, t: null, s: null };
      for (const e of row.events) refs[e.kind] = e.jd;
      for (const k of ['r', 't', 's']) {
        if (refs[k] === null) { expect(mine[k], `no ${k} expected`).toBeNull(); continue; }
        expect(mine[k], `${k} missing`).not.toBeNull();
        const dMin = Math.abs(mine[k] - refs[k]) * 1440;
        upd('rts', row.body, dMin);
        expect(dMin, `${k} off by ${dMin.toFixed(2)} min`).toBeLessThan(2);
      }
    });

    it(`${name}: apparent magnitude`, () => {
      for (const s of row.samples) {
        const dm = Math.abs(apparentMagnitude(row.body, s.jd) - s.mag);
        upd('mag', row.body, dm);
        expect(dm).toBeLessThan(row.body === 'moon' ? 0.35 : row.body === 'saturn' ? 0.2 : 0.1);
      }
    });
  }

  it('prints the achieved accuracy', () => {
    console.log('worst errors vs Horizons — alt°', worst.alt, 'az° (on sky)', worst.az, 'rise/set min', worst.rts, 'mag', worst.mag);
    expect(true).toBe(true);
  });
});
