import { describe, it, expect } from 'vitest';
import fixture from './fixtures/spacecraft.json';
import { SPACECRAFT_DATA } from '../src/data/spacecraft/index.js';
import { createTrack, trackPosition, chooseKnots } from '../src/ephemeris/samples.js';
import { createTrajectory, trajectoryState, encounterAt } from '../src/ephemeris/spacecraft.js';
import { computePositions, AU_KM, deltaT } from '../src/ephemeris/index.js';

// Fixture times are off the knot grid (not used for sampling). Distances in km.
const km = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) * AU_KM;

describe('non-uniform Catmull-Rom track', () => {
  it('passes through its knots and reproduces a quadratic exactly (non-uniform knots, ends included)', () => {
    const t = [0, 1, 3, 4, 7, 11];
    const f = (x) => ({ x: x * x, y: 2 * x + 1, z: -0.5 * x * x + x });
    const track = createTrack(t, t.flatMap((x) => Object.values(f(x))));
    for (const x of t) expect(km(trackPosition(track, x), f(x))).toBeLessThan(1e-6);
    for (const x of [1.5, 2.2, 5.5, 9]) {
      const p = trackPosition(track, x), q = f(x);
      expect(Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z)).toBeLessThan(1e-12);
    }
  });

  it('chooseKnots meets its tolerance on a circular orbit', () => {
    const t = [], p = [];
    for (let d = 0; d <= 3650; d++) { t.push(d); const a = d / 365.25 * 2 * Math.PI; p.push(Math.cos(a), Math.sin(a), 0); }
    const idx = chooseKnots(t, p, { tol: () => 1e-5, maxStep: 60 });
    expect(idx.length).toBeLessThan(t.length / 2);
    const track = createTrack(idx.map((i) => t[i]), idx.flatMap((i) => p.slice(i * 3, i * 3 + 3)));
    for (let i = 0; i < t.length; i += 7) {
      const q = trackPosition(track, t[i]);
      expect(Math.hypot(q.x - p[i * 3], q.y - p[i * 3 + 1])).toBeLessThan(1.01e-5);
    }
  });
});

describe('spacecraft vs JPL Horizons (points not used for sampling)', () => {
  for (const [id, ref] of Object.entries(fixture.spacecraft)) {
    const traj = createTrajectory(SPACECRAFT_DATA[id]);

    // Measured worst cases: 600–3,500 km in cruise (tolerance 5,000 km, i.e. < 0.0004° at 100 AU).
    it(`${id}: heliocentric track within 5,000 km outside flyby windows (${ref.helio.length} points)`, () => {
      let n = 0;
      for (const r of ref.helio) {
        const d = r.jd - traj.t0;
        if (traj.encounters.some((e) => d > e.start && d < e.end)) continue;
        expect(km(trackPosition(traj.helio, d), r), `JD ${r.jd}`).toBeLessThan(5000);
        n++;
      }
      expect(n).toBeGreaterThan(5);
    });

    // Planet-centred tracks: within 0.15% of the distance everywhere (measured ≤ 0.09%),
    // within 0.1% while closer than 3× the closest-approach distance.
    for (const [body, pts] of Object.entries(ref.encounters)) {
      it(`${id}: ${body}-centred track within 0.15% of the distance (${pts.length} points)`, () => {
        const enc = traj.encounters.find((e) => e.body === body);
        const ca = Math.min(...pts.map((r) => Math.hypot(r.x, r.y, r.z)));
        for (const r of pts) {
          const dist = Math.hypot(r.x, r.y, r.z);
          const err = km(trackPosition(enc.track, r.jd - traj.t0), r);
          expect(err / (dist * AU_KM), `JD ${r.jd}`).toBeLessThan(1.5e-3);
          if (dist < ca * 3) expect(err / (dist * AU_KM), `JD ${r.jd}`).toBeLessThan(1e-3);
        }
      });
    }
  }

  it('Voyager 1 passes Jupiter at 349,000 km on 5 Mar 1979 and Saturn at 184,000 km on 12 Nov 1980', () => {
    const traj = createTrajectory(SPACECRAFT_DATA.voyager1);
    const minDist = (body, jd0) => {
      const enc = traj.encounters.find((e) => e.body === body);
      let best = Infinity, at = 0;
      for (let jd = jd0 - 2; jd < jd0 + 2; jd += 1 / 1440) {
        const p = trackPosition(enc.track, jd - traj.t0);
        const r = Math.hypot(p.x, p.y, p.z) * AU_KM;
        if (r < best) { best = r; at = jd; }
      }
      return { best, at };
    };
    const j = minDist('jupiter', 2443938.0);
    expect(j.best).toBeGreaterThan(347000);
    expect(j.best).toBeLessThan(351000);
    expect(Math.abs(j.at - 2443938.0)).toBeLessThan(0.05);
    const s = minDist('saturn', 2444556.49);
    expect(Math.abs(s.best - 184000)).toBeLessThan(2500);
  });
});

describe('spacecraft state with the app’s planet ephemeris', () => {
  it('stays near the true heliocentric position everywhere (app planet error only)', () => {
    // Inside flyby windows the position is app-planet + true offset, so the error is the
    // planet-ephemeris error (≲0.1° heliocentric); elsewhere it is the track error.
    for (const [id, ref] of Object.entries(fixture.spacecraft)) {
      const traj = createTrajectory(SPACECRAFT_DATA[id]);
      for (const r of ref.helio) {
        const jdUTC = r.jd - deltaT(r.jd) / 86400;
        const pos = computePositions(jdUTC);
        const st = trajectoryState(traj, r.jd - traj.t0, (b) => pos[b]);
        const rr = Math.hypot(r.x, r.y, r.z);
        expect(km(st.au, r) / (rr * AU_KM), `${id} JD ${r.jd}`).toBeLessThan(2.5e-3);
      }
    }
  });

  it('uses the planet-relative track at closest approach and fades out at the window edges', () => {
    const traj = createTrajectory(SPACECRAFT_DATA.voyager2);
    const nep = traj.encounters.find((e) => e.body === 'neptune');
    const mid = (nep.start + nep.end) / 2;
    expect(encounterAt(traj, mid).weight).toBe(1);
    expect(encounterAt(traj, nep.start + 0.01).weight).toBeLessThan(0.01);
    expect(encounterAt(traj, nep.end - 0.01).weight).toBeLessThan(0.01);
    expect(encounterAt(traj, nep.end + 1)).toBeNull();
    // Earth departure starts fully planet-relative
    expect(encounterAt(traj, 0.01).enc.body).toBe('earth');
    expect(encounterAt(traj, 0.01).weight).toBe(1);
  });

  it('encounter windows do not overlap and lie inside the data range', () => {
    for (const data of Object.values(SPACECRAFT_DATA)) {
      const traj = createTrajectory(data);
      const w = traj.encounters.map((e) => [e.start, e.end]).sort((a, b) => a[0] - b[0]);
      for (let i = 0; i < w.length; i++) {
        expect(w[i][0]).toBeGreaterThanOrEqual(-1e-6);
        expect(w[i][1]).toBeLessThanOrEqual(traj.end + 1e-6);
        if (i) expect(w[i][0]).toBeGreaterThan(w[i - 1][1]);
      }
    }
  });
});
