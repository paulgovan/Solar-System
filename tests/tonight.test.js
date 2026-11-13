import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { decodeStars } from '../src/scene/starCatalog.js';
import { createConstellationLookup } from '../src/scene/skyData.js';
import { computeTonight, liveSky, skyState } from '../src/ephemeris/tonight.js';
import { dateToJD } from '../src/ephemeris/index.js';
import { CITIES, localDayBounds, formatLocalTime, tzOffsetMinutes, nearestCity } from '../src/observer.js';

const cat = decodeStars(new Uint8Array(readFileSync(new URL('../src/data/stars.bin', import.meta.url))));
const figures = JSON.parse(readFileSync(new URL('../src/data/constellations.json', import.meta.url), 'utf8'));

describe('constellation lookup', () => {
  const find = createConstellationLookup({ cat, figures });
  it.each([
    ['Sirius', 101.287, -16.716, 'Canis Major'],
    ['Betelgeuse', 88.793, 7.407, 'Orion'],
    ['Polaris', 37.95, 89.26, 'Ursa Minor'],
    ['Antares', 247.352, -26.432, 'Scorpius'],
    ['Vega', 279.235, 38.784, 'Lyra'],
  ])('%s is in %s', (_, ra, dec, name) => {
    expect(find(ra, dec).name).toBe(name);
  });
});

describe('cities', () => {
  it('has about 300 entries with valid coordinates and time zones', () => {
    expect(CITIES.length).toBeGreaterThanOrEqual(300);
    for (const c of CITIES) {
      expect(Math.abs(c.lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(c.lon)).toBeLessThanOrEqual(180);
      expect(() => new Intl.DateTimeFormat('en', { timeZone: c.tz })).not.toThrow();
    }
    expect(new Set(CITIES.map((c) => `${c.name}|${c.country}`)).size).toBe(CITIES.length);
  });
  it('nearestCity finds the city itself', () => {
    expect(nearestCity(35.7, 139.7).name).toBe('Tokyo');
    expect(nearestCity(-33.9, 151.2).tz).toBe('Australia/Sydney');
  });
});

describe('local time', () => {
  const london = CITIES.find((c) => c.name === 'London');
  const sydney = CITIES.find((c) => c.name === 'Sydney');
  it('time zone offsets follow daylight saving', () => {
    expect(tzOffsetMinutes(dateToJD(new Date('2026-01-15T12:00:00Z')), london)).toBe(0);
    expect(tzOffsetMinutes(dateToJD(new Date('2026-07-15T12:00:00Z')), london)).toBe(60);
    expect(tzOffsetMinutes(dateToJD(new Date('2026-01-15T12:00:00Z')), sydney)).toBe(660);
  });
  it('local days are 23, 24 or 25 hours long', () => {
    const d = localDayBounds(dateToJD(new Date('2026-03-29T12:00:00Z')), london); // clocks go forward
    expect((d.end - d.start) * 24).toBeCloseTo(23, 6);
    const e = localDayBounds(dateToJD(new Date('2026-10-25T12:00:00Z')), london);
    expect((e.end - e.start) * 24).toBeCloseTo(25, 6);
    expect(formatLocalTime(d.start, london)).toBe('00:00');
  });
});

describe('tonight', () => {
  it('London on 2026-12-15: sunrise ≈ 08:00 (JPL Horizons: 08:00), sunset ≈ 15:52, a night with astronomical darkness', () => {
    const jd = dateToJD(new Date('2026-12-15T12:00:00Z'));
    const london = CITIES.find((c) => c.name === 'London');
    const { start, end } = localDayBounds(jd, london);
    const t = computeTonight(london, start, end);
    expect(formatLocalTime(t.sun.rise, london)).toBe('08:00');
    expect(formatLocalTime(t.sun.set, london)).toBe('15:52');
    expect(t.twilight[2].dusk).not.toBeNull(); // astronomical dusk exists at 51.5°N in December
    expect(Object.keys(t.bodies)).toContain('jupiter');
  });
  it('live sky: Jupiter and the Sun are consistent, and the state names are right', () => {
    const jd = dateToJD(new Date('2026-12-15T22:00:00Z'));
    const s = liveSky({ lat: 51.5, lon: -0.13 }, jd);
    expect(s.rows.sun.above).toBe(false);
    expect(skyState(s.sunAlt)).toBe('Night');
    expect(skyState(-3)).toBe('Civil twilight');
    expect(skyState(10)).toBe('Daytime');
    expect(s.rows.moon.mag).toBeLessThan(0);
  });
});
