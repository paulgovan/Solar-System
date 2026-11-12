#!/usr/bin/env node
// Regenerates tests/fixtures/events.json: reference times of planetary oppositions,
// conjunctions and greatest elongations, found independently of the app by root-finding
// on hourly JPL Horizons observer tables (geocentric apparent ecliptic longitudes and
// the Sun–observer–target elongation).
//
//   node scripts/fetch-events.mjs
//
// Each entry gives a rough date (`approx`); the script fetches ±4 days at 1 h steps and
// refines the event by linear interpolation (sign change) or a parabola fit (maximum).

import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HORIZONS = 'https://ssd.jpl.nasa.gov/api/horizons.api';
const ID = { sun: '10', mercury: '199', venus: '299', mars: '499', jupiter: '599', saturn: '699', uranus: '799', neptune: '899' };
const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };

const EVENTS = [
  // oppositions (ecliptic longitude 180° from the Sun)
  { type: 'opposition', body: 'mars', approx: '2025-01-16' },
  { type: 'opposition', body: 'saturn', approx: '2025-09-21' },
  { type: 'opposition', body: 'neptune', approx: '2025-09-23' },
  { type: 'opposition', body: 'uranus', approx: '2025-11-21' },
  { type: 'opposition', body: 'jupiter', approx: '2024-12-07' },
  { type: 'opposition', body: 'jupiter', approx: '2026-01-10' },
  { type: 'opposition', body: 'saturn', approx: '2026-10-04' },
  { type: 'opposition', body: 'mars', approx: '2027-02-19' },
  // conjunctions with the Sun
  { type: 'inferior', body: 'venus', approx: '2025-03-23' },
  { type: 'superior', body: 'venus', approx: '2026-01-06' },
  { type: 'inferior', body: 'mercury', approx: '2025-03-24' },
  { type: 'conjunction-sun', body: 'jupiter', approx: '2025-06-24' },
  { type: 'conjunction-sun', body: 'mars', approx: '2026-01-09' },
  // greatest elongations
  { type: 'elongation', body: 'mercury', approx: '2025-04-21' },
  { type: 'elongation', body: 'mercury', approx: '2025-08-19' },
  { type: 'elongation', body: 'venus', approx: '2025-06-01' },
  { type: 'elongation', body: 'venus', approx: '2026-08-15' },
  // planet–planet conjunctions in ecliptic longitude
  { type: 'conjunction', body: 'jupiter', other: 'saturn', approx: '2020-12-21' },
  { type: 'conjunction', body: 'venus', other: 'jupiter', approx: '2025-08-12' },
];

const wrap = (d) => ((((d + 180) % 360) + 360) % 360) - 180;

async function table(id, start, stop) {
  const q = new URLSearchParams({
    format: 'text', COMMAND: `'${id}'`, OBJ_DATA: 'NO', MAKE_EPHEM: 'YES', EPHEM_TYPE: 'OBSERVER',
    CENTER: "'500@399'", START_TIME: `'${start}'`, STOP_TIME: `'${stop}'`, STEP_SIZE: "'1h'",
    QUANTITIES: "'31,23'", ANG_FORMAT: 'DEG', CSV_FORMAT: 'YES', EXTRA_PREC: 'YES',
  });
  const text = await (await fetch(`${HORIZONS}?${q}`)).text();
  const m = text.match(/\$\$SOE([\s\S]*?)\$\$EOE/);
  if (!m) throw new Error(`Horizons: ${text.slice(0, 300)}`);
  return m[1].trim().split('\n').map((line) => {
    const c = line.split(',').map((s) => s.trim());
    const [y, mo, rest] = c[0].split('-');
    const [d, hm] = rest.split(' ');
    const [h, mi] = hm.split(':').map(Number);
    return { ms: Date.UTC(Number(y), MONTHS[mo], Number(d), h, mi), lon: Number(c[3]), lat: Number(c[4]), elong: Number(c[5]) };
  });
}

const day = (s, n) => new Date(Date.parse(s) + n * 864e5).toISOString().slice(0, 10);

function root(rows, f) {
  for (let i = 0; i + 1 < rows.length; i++) {
    const a = f(i), b = f(i + 1);
    if (Math.abs(a) < 20 && Math.abs(b) < 20 && a * b <= 0 && a !== b) {
      return rows[i].ms + ((0 - a) / (b - a)) * (rows[i + 1].ms - rows[i].ms);
    }
  }
  throw new Error('no sign change');
}

const out = [];
for (const ev of EVENTS) {
  const start = day(ev.approx, -4), stop = day(ev.approx, 4);
  const body = await table(ID[ev.body], start, stop);
  let ms, extra = {};
  if (ev.type === 'elongation') {
    let k = 1;
    for (let i = 1; i < body.length - 1; i++) if (body[i].elong > body[k].elong) k = i;
    // parabola through the maximum sample and its neighbours 6 h either side
    const [a, b, c] = [body[k - 6], body[k], body[k + 6]].map((r) => r.elong);
    const dt = (6 * 3600e3 * (a - c)) / (2 * (a - 2 * b + c));
    ms = body[k].ms + dt;
    extra = { elongationDeg: Number((b - ((a - c) ** 2) / (8 * (a - 2 * b + c))).toFixed(2)) };
  } else if (ev.type === 'conjunction') {
    const other = await table(ID[ev.other], start, stop);
    ms = root(body, (i) => wrap(body[i].lon - other[i].lon));
    const i = Math.round((ms - body[0].ms) / 3600e3);
    extra = { separationArcmin: Number((Math.hypot(body[i].lat - other[i].lat) * 60).toFixed(1)) };
  } else {
    const sun = await table(ID.sun, start, stop);
    const off = ev.type === 'opposition' ? 180 : 0;
    ms = root(body, (i) => wrap(body[i].lon - sun[i].lon - off));
  }
  out.push({ ...ev, time: new Date(ms).toISOString().slice(0, 16) + 'Z', ...extra });
  console.log(ev.type, ev.body, ev.other || '', new Date(ms).toISOString(), JSON.stringify(extra));
}

const file = join(ROOT, 'tests/fixtures/events.json');
await writeFile(file, JSON.stringify({
  source: `JPL Horizons API, geocentric (500@399) apparent ecliptic longitude / S-O-T, hourly; fetched ${new Date().toISOString().slice(0, 10)}`,
  events: out,
}, null, 1) + '\n');
console.log('wrote', file);
