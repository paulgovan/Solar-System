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
