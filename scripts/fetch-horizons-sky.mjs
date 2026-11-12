#!/usr/bin/env node
// Fetches the observer-table reference values used by tests/horizons-sky.test.js from NASA JPL
// Horizons (https://ssd.jpl.nasa.gov/api/horizons.api; public domain):
//
//   node scripts/fetch-horizons-sky.mjs
//
// Writes tests/fixtures/horizons-sky.json: for two sites and two UT days, for the Sun, Moon,
// Venus, Mars, Jupiter and Saturn,
//   - topocentric apparent azimuth / elevation (airless) and apparent magnitude at six UT times,
//   - rise / transit / set times of that UT day (Horizons' own R_T_S_ONLY=TVH search, which
//     uses the refracted horizon and, for the Sun and Moon, the upper limb), rounded to the minute.

import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../tests/fixtures/horizons-sky.json');
const API = 'https://ssd.jpl.nasa.gov/api/horizons.api';

const SITES = [
  { id: 'london', lat: 51.5074, lon: -0.1278 },
  { id: 'sydney', lat: -33.8688, lon: 151.2093 },
];
const DAYS = ['2026-03-20', '2026-12-15'];
const BODIES = { sun: '10', moon: '301', venus: '299', mars: '499', jupiter: '599', saturn: '699' };
const HOURS = [0, 4, 8, 12, 16, 20];

async function horizons(params) {
  const url = new URL(API);
  const all = { format: 'text', OBJ_DATA: 'NO', MAKE_EPHEM: 'YES', EPHEM_TYPE: 'OBSERVER', CENTER: 'coord@399', COORD_TYPE: 'GEODETIC',
    ANG_FORMAT: 'DEG', CSV_FORMAT: 'YES', QUANTITIES: '4,9', ...params };
  for (const [k, v] of Object.entries(all)) url.searchParams.set(k, k === 'format' ? v : `'${v}'`);
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(url);
    const text = await r.text();
    if (r.ok && text.includes('$$SOE')) return text.split('$$SOE')[1].split('$$EOE')[0].trim().split('\n');
    await new Promise((res) => setTimeout(res, 1500 * (attempt + 1)));
    if (attempt === 3) throw new Error(`Horizons failed for ${url}\n${text.slice(0, 800)}`);
  }
}

const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
function parseJD(s) { // ' 2026-Dec-15 08:00'
  const m = s.trim().match(/(\d{4})-(\w{3})-(\d\d) (\d\d):(\d\d)/);
  return Date.UTC(+m[1], MONTHS[m[2]], +m[3], +m[4], +m[5]) / 86400000 + 2440587.5;
}
const num = (s) => (s.trim() === 'n.a.' ? null : Number(s));

const out = { source: 'NASA JPL Horizons API, observer tables, airless apparent places', sites: SITES, days: DAYS, rows: [] };
for (const site of SITES) {
  for (const day of DAYS) {
    const jd0 = Date.parse(`${day}T00:00:00Z`) / 86400000 + 2440587.5;
    const next = new Date(Date.parse(`${day}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
    for (const [body, code] of Object.entries(BODIES)) {
      const common = { COMMAND: code, SITE_COORD: `${site.lon},${site.lat},0.0` };
      const tl = await horizons({ ...common, TLIST_TYPE: 'JD', TLIST: HOURS.map((h) => (jd0 + h / 24).toFixed(6)).join(' ') });
      // (Horizons prints times truncated to the minute; use the requested JDs)
      const samples = tl.map((line, i) => {
        const f = line.split(',');
        return { jd: jd0 + HOURS[i] / 24, az: num(f[3]), alt: num(f[4]), mag: num(f[5]) };
      });
      const rts = await horizons({ ...common, START_TIME: day, STOP_TIME: next, STEP_SIZE: '1 m', R_T_S_ONLY: 'TVH' });
      const events = rts.map((line) => {
        const f = line.split(',');
        return { jd: parseJD(f[0]), kind: f[2].trim() };
      }).filter((e) => 'rts'.includes(e.kind));
      out.rows.push({ site: site.id, day, body, samples, events });
      console.log(site.id, day, body, samples.length, 'samples', events.map((e) => e.kind).join(''));
      await new Promise((res) => setTimeout(res, 400));
    }
  }
}
await writeFile(OUT, JSON.stringify(out) + '\n');
console.log('wrote', OUT);
