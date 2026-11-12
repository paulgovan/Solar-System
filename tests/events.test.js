import { describe, it, expect } from 'vitest';
import { dateToJD } from '../src/ephemeris/index.js';
import { findSkyEvents, skyEventsAround } from '../src/ephemeris/conjunctions.js';
import ref from './fixtures/events.json';

// Reference times come from root-finding on hourly JPL Horizons tables (scripts/fetch-events.mjs).
// Tolerances: oppositions and conjunctions with the Sun 6 h (the Keplerian elements are good to a
// few arcminutes, i.e. ~1–2 h of motion at ≈1.2–1.7°/day relative to the Sun); greatest elongation
// 24 h, because the elongation is flat at its maximum, so a 1′ error moves the time by hours;
// planet–planet conjunctions 12 h, because two slow outer planets close up at only ~0.1°/day,
// so even 3′ of position error (the Jupiter–Saturn 2020 case is 2.5′) shifts the time by ~10 h.
const TOL_DAYS = { opposition: 0.25, 'conjunction-sun': 0.25, inferior: 0.25, superior: 0.25, conjunction: 0.5, elongation: 1 };
const jdOf = (iso) => dateToJD(new Date(iso));

describe('planetary events vs JPL Horizons', () => {
  for (const r of ref.events) {
    const label = `${r.type} ${r.body}${r.other ? '–' + r.other : ''} ${r.time}`;
    it(label, () => {
      const jd = jdOf(r.time);
      const found = findSkyEvents(jd - 6, jd + 6, { maxSeparationDeg: 10, minElongationDeg: 0 })
        .filter((e) => e.type === r.type && e.body === r.body && (e.other || null) === (r.other || null));
      expect(found.length, 'event found').toBe(1);
      const dt = Math.abs(found[0].jd - jd);
      expect(dt).toBeLessThan(TOL_DAYS[r.type]);
      if (r.elongationDeg) expect(Math.abs(found[0].elongationDeg - r.elongationDeg)).toBeLessThan(0.1);
      if (r.separationArcmin) expect(Math.abs(found[0].separationDeg * 60 - r.separationArcmin)).toBeLessThan(1);
    });
  }
});

describe('event finder', () => {
  it('lists the standard events for a window, in time order, with no duplicates', () => {
    const jd = jdOf('2026-11-12T00:00Z');
    const { previous, next } = skyEventsAround(jd, 365, 730);
    const all = [...previous, ...next];
    for (let i = 1; i < all.length; i++) expect(all[i].jd).toBeGreaterThanOrEqual(all[i - 1].jd);
    const types = new Set(all.map((e) => e.type));
    for (const t of ['opposition', 'conjunction-sun', 'inferior', 'superior', 'elongation']) expect(types.has(t), t).toBe(true);
    // each outer planet has at most one opposition per synodic period: Mars' next is Feb 2027
    const mars = next.find((e) => e.type === 'opposition' && e.body === 'mars');
    expect(new Date((mars.jd - 2440587.5) * 864e5).toISOString().slice(0, 10)).toBe('2027-02-19');
    for (const e of previous) expect(e.jd).toBeLessThanOrEqual(jd);
    for (const e of next) expect(e.jd).toBeGreaterThan(jd);
  });

  it('inferior conjunctions are nearer than the Sun and superior ones farther', () => {
    const ev = findSkyEvents(jdOf('2025-01-01Z'), jdOf('2027-12-31Z'), { pairs: false });
    const venus = (type) => ev.filter((e) => e.type === type && e.body === 'venus').map((e) => new Date((e.jd - 2440587.5) * 864e5).toISOString().slice(0, 7));
    expect(venus('inferior')).toEqual(['2025-03', '2026-10']);
    expect(venus('superior')).toEqual(['2026-01', '2027-08']);
  });

  it('planet–planet conjunctions respect the separation and elongation filters', () => {
    const ev = findSkyEvents(jdOf('2025-01-01Z'), jdOf('2026-12-31Z'), { maxSeparationDeg: 2, minElongationDeg: 15 });
    const conj = ev.filter((e) => e.type === 'conjunction');
    expect(conj.length).toBeGreaterThan(0);
    for (const c of conj) { expect(c.separationDeg).toBeLessThanOrEqual(2); expect(c.elongationDeg).toBeGreaterThanOrEqual(15); }
  });
});

// ---------------------------------------------------------------------------
// Curated moments (src/data/events.js)
// ---------------------------------------------------------------------------
import { MOMENTS } from '../src/data/events.js';
import { SPACECRAFT_DATA } from '../src/data/spacecraft/index.js';
import { createTrajectory } from '../src/ephemeris/spacecraft.js';
import { trackPosition } from '../src/ephemeris/samples.js';
import { computePositions, deltaT, AU_KM, jdToDate } from '../src/ephemeris/index.js';
import { BODY_MAP } from '../src/bodies.js';
import '../src/features/spacecraft.js'; // registers the spacecraft bodies
import '../src/features/smallBodies.js'; // …and Halley

describe('curated moments', () => {
  it('have unique ids, valid UTC times and known bodies', () => {
    expect(new Set(MOMENTS.map((m) => m.id)).size).toBe(MOMENTS.length);
    for (const m of MOMENTS) {
      expect(m.when).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\dZ$/);
      expect(Number.isNaN(Date.parse(m.when)), m.id).toBe(false);
      expect(BODY_MAP[m.body], `${m.id} body`).toBeTruthy();
      if (m.view?.of) expect(BODY_MAP[m.view.of], `${m.id} view.of`).toBeTruthy();
    }
  });

  // A flyby moment is the time of closest approach in the spacecraft data (±2 h)
  const closest = (id, planet) => {
    const traj = createTrajectory(SPACECRAFT_DATA[id]);
    const enc = traj.encounters.find((e) => e.body === planet);
    let best = [Infinity, 0];
    for (let d = enc.start; d <= enc.end; d += 1 / 1440) {
      const p = trackPosition(enc.track, d, {});
      const r = Math.hypot(p.x, p.y, p.z);
      if (r < best[0]) best = [r, d];
    }
    const jdTdb = traj.t0 + best[1];
    return jdTdb - deltaT(jdTdb) / 86400;
  };
  for (const m of MOMENTS.filter((x) => x.group === 'missions' && x.view?.of)) {
    it(`${m.title}: time of closest approach`, () => {
      const jd = closest(m.body, m.view.of);
      expect(Math.abs(jd - jdOf(m.when)) * 24, `${jdToDate(jd).toISOString()} vs ${m.when}`).toBeLessThan(2);
    });
  }

  it('Mars 2003 closest approach is 0.3727 AU (55.76 million km)', () => {
    const mars = MOMENTS.find((m) => m.id === 'mars-2003');
    const p = computePositions(jdOf(mars.when));
    const d = Math.hypot(p.mars.x - p.earth.x, p.mars.y - p.earth.y, p.mars.z - p.earth.z);
    expect(d).toBeGreaterThan(0.3724);
    expect(d).toBeLessThan(0.3732);
    expect(d * AU_KM / 1e6).toBeCloseTo(55.76, 1);
  });

  it('the Great Conjunction moment is the Horizons conjunction time', () => {
    const gc = MOMENTS.find((m) => m.id === 'great-conjunction-2020');
    const r = ref.events.find((e) => e.type === 'conjunction' && e.body === 'jupiter' && e.other === 'saturn');
    expect(Math.abs(jdOf(gc.when) - jdOf(r.time)) * 1440).toBeLessThan(2);
  });

  it('the opposition moments match the Horizons oppositions (±6 h)', () => {
    for (const [id, body, approx] of [['jupiter-opposition-2024', 'jupiter', '2024-12-07'], ['mars-opposition-2025', 'mars', '2025-01-16'], ['saturn-opposition-2025', 'saturn', '2025-09-21']]) {
      const m = MOMENTS.find((x) => x.id === id);
      const r = ref.events.find((e) => e.type === 'opposition' && e.body === body && e.time.startsWith(approx));
      expect(Math.abs(jdOf(m.when) - jdOf(r.time)) * 24, id).toBeLessThan(0.5);
    }
  });
});
