#!/usr/bin/env node
// Regenerates the small-body elements and spacecraft trajectories from NASA JPL.
//
//   node scripts/fetch-horizons.mjs            # everything
//   node scripts/fetch-horizons.mjs elements   # SBDB elements + small-body test fixture
//   node scripts/fetch-horizons.mjs spacecraft # spacecraft tracks + test fixture
//
// Writes:
//   src/data/smallBodyElements.json     osculating elements at many epochs (JPL Horizons)
//   src/data/spacecraft/<id>.json       heliocentric tracks + planet-relative flyby tracks
//   tests/fixtures/smallBodies.json     Horizons vectors for the small-body tests
//   tests/fixtures/spacecraft.json      Horizons vectors at times NOT used as knots
//
// All vectors: geometric, J2000 ecliptic, AU, TDB Julian Dates.
// Spacecraft tracks are fetched daily (heliocentric) and every 1 h / 10 min around
// flybys (planet-centred), then thinned to the knots a Catmull-Rom spline needs to
// reproduce every fetched point within tolerance (see src/ephemeris/samples.js).

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chooseKnots, createTrack, trackPosition } from '../src/ephemeris/samples.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AU_KM = 149597870.7;
const HORIZONS = 'https://ssd.jpl.nasa.gov/api/horizons.api';
const SBDB = 'https://ssd-api.jpl.nasa.gov/sbdb.api';

// ---------------------------------------------------------------------------
// Bodies
// ---------------------------------------------------------------------------
const SMALL_BODIES = [
  { id: 'ceres', sbdb: '1', horizons: '1;' },
  { id: 'vesta', sbdb: '4', horizons: '4;' },
  { id: 'eris', sbdb: '136199', horizons: '136199;' },
  { id: 'haumea', sbdb: '136108', horizons: '136108;' },
  { id: 'makemake', sbdb: '136472', horizons: '136472;' },
  { id: 'halley', sbdb: '1P', horizons: 'DES=1P;CAP;NOFRAG' },
];

// Planet-centred flyby tracks replace the heliocentric one near each planet, so the
// spacecraft passes the planet (and its moons) at the true distance and side even
// though the app's planet positions come from approximate elements. `days` is the
// half-width of the window; the app fades in/out over its outer part.
const PLANET_CENTER = { earth: '399', jupiter: '599', saturn: '699', uranus: '799', neptune: '899', pluto: '999' };
const SPACECRAFT = [
  {
    id: 'voyager1', command: '-31', start: '1977-09-05 14:00',
    encounters: [
      { body: 'earth', departure: true, days: 40 },
      { body: 'jupiter', at: '1979-03-05 12:05', days: 200 },
      { body: 'saturn', at: '1980-11-12 23:46', days: 220 },
    ],
  },
  {
    id: 'voyager2', command: '-32', start: '1977-08-20 16:00',
    encounters: [
      { body: 'earth', departure: true, days: 40 },
      { body: 'jupiter', at: '1979-07-09 22:29', days: 200 },
      { body: 'saturn', at: '1981-08-26 03:24', days: 220 },
      { body: 'uranus', at: '1986-01-24 17:59', days: 200 },
      { body: 'neptune', at: '1989-08-25 03:56', days: 240 },
    ],
  },
  {
    id: 'pioneer10', command: '-23', start: '1972-03-03 03:00',
    encounters: [
      { body: 'earth', departure: true, days: 40 },
      { body: 'jupiter', at: '1973-12-04 02:26', days: 200 },
    ],
  },
  {
    id: 'pioneer11', command: '-24', start: '1973-04-06 03:00',
    encounters: [
      { body: 'earth', departure: true, days: 40 },
      { body: 'jupiter', at: '1974-12-03 05:21', days: 200 },
      { body: 'saturn', at: '1979-09-01 16:31', days: 220 },
    ],
  },
  {
    id: 'newhorizons', command: '-98', start: '2006-01-19 20:00',
    encounters: [
      { body: 'earth', departure: true, days: 40 },
      { body: 'jupiter', at: '2007-02-28 05:43', days: 200 },
      { body: 'pluto', at: '2015-07-14 11:49', days: 100 },
    ],
  },
];
const END = '2030-12-31 00:00';

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, tries = 4) {
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return await res.text();
    } catch (e) {
      if (i >= tries - 1) throw e;
      await sleep(1500 * (i + 1));
    }
  }
}

function q(params) {
  return Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
}

/** Horizons vectors → [{jd, x, y, z}] (TDB, AU, J2000 ecliptic). */
async function vectors(command, center, timeSpec) {
  const params = {
    format: 'json', MAKE_EPHEM: 'YES', EPHEM_TYPE: 'VECTORS', OBJ_DATA: 'NO',
    COMMAND: `'${command}'`, CENTER: `'500@${center}'`,
    REF_PLANE: 'ECLIPTIC', REF_SYSTEM: 'ICRF', VEC_TABLE: '1', VEC_CORR: 'NONE',
    OUT_UNITS: 'AU-D', CSV_FORMAT: 'YES', VEC_LABELS: 'NO',
  };
  if (timeSpec.tlist) {
    params.TLIST = timeSpec.tlist.map((jd) => `'${jd}'`).join(',');
    params.TLIST_TYPE = 'JD';
  } else {
    params.START_TIME = `'${timeSpec.start}'`;
    params.STOP_TIME = `'${timeSpec.stop}'`;
    params.STEP_SIZE = `'${timeSpec.step}'`;
  }
  const body = JSON.parse(await get(`${HORIZONS}?${q(params)}`));
  const text = body.result || '';
  const a = text.indexOf('$$SOE'), b = text.indexOf('$$EOE');
  if (a < 0 || b < 0) throw new Error(`Horizons: no ephemeris for ${command} @${center}\n${text.slice(0, 2000)}`);
  const rows = text.slice(a + 5, b).trim().split('\n').map((l) => l.split(',').map((s) => s.trim()));
  await sleep(300);
  return rows.map((r) => ({ jd: Number(r[0]), x: Number(r[2]), y: Number(r[3]), z: Number(r[4]) }));
}

// ---------------------------------------------------------------------------
// Small bodies
// ---------------------------------------------------------------------------
// Osculating elements at many epochs (Horizons integrates the SBDB orbit solution with
// planetary perturbations and, for Halley, non-gravitational forces). The app propagates
// each set as a two-body orbit and blends between neighbouring epochs, so the error stays
// near the inter-epoch two-body drift (≲0.05°) instead of growing for decades.
const ELEMENT_PLAN = {
  ceres: { from: '1800-01-01', to: '2200-01-01', step: '730 d' },
  vesta: { from: '1800-01-01', to: '2200-01-01', step: '730 d' },
  eris: { from: '1600-01-01', to: '2500-01-01', step: '3652 d' },
  haumea: { from: '1600-01-01', to: '2500-01-01', step: '3652 d' },
  makemake: { from: '1600-01-01', to: '2500-01-01', step: '3652 d' },
  // fetched every 180 d, then kept every ~4 years unless within 10 AU of the Sun
  halley: { from: '1700-01-01', to: '2300-01-01', step: '180 d', thin: { rMax: 10, gapDays: 1461 } },
};

async function elementsTable(command, from, to, step) {
  const params = {
    format: 'json', EPHEM_TYPE: 'ELEMENTS', OBJ_DATA: 'NO', COMMAND: `'${command}'`, CENTER: "'500@10'",
    REF_PLANE: 'ECLIPTIC', REF_SYSTEM: 'ICRF', OUT_UNITS: 'AU-D', CSV_FORMAT: 'YES',
    START_TIME: `'${from}'`, STOP_TIME: `'${to}'`, STEP_SIZE: `'${step}'`,
  };
  const text = JSON.parse(await get(`${HORIZONS}?${q(params)}`)).result || '';
  const a = text.indexOf('$$SOE'), b = text.indexOf('$$EOE');
  if (a < 0 || b < 0) throw new Error(`Horizons: no elements for ${command}\n${text.slice(0, 2000)}`);
  await sleep(300);
  // JDTDB, cal, EC, QR, IN, OM, W, Tp, N, MA, TA, A, AD, PR
  return text.slice(a + 5, b).trim().split('\n').map((l) => {
    const r = l.split(',').map((s) => s.trim());
    return { epoch: +r[0], e: +r[2], i: +r[4], om: +r[5], w: +r[6], n: +r[8], ma: +r[9], ta: +r[10], a: +r[11] };
  });
}

async function fetchElements() {
  const out = {
    source: 'JPL Horizons API (SBDB orbit solutions integrated by Horizons): heliocentric J2000 ecliptic osculating elements. '
      + 'Rows: [epoch JD TDB, a AU, e, i, node, peri, M (deg)]; mean motion n = k / a^1.5 (Gaussian k)',
    fetched: new Date().toISOString().slice(0, 10),
    bodies: {},
  };
  for (const b of SMALL_BODIES) {
    const sb = JSON.parse(await get(`${SBDB}?${q({ sstr: b.sbdb })}`));
    const plan = ELEMENT_PLAN[b.id];
    let rows = await elementsTable(b.horizons, plan.from, plan.to, plan.step);
    if (plan.thin) {
      const kept = [];
      for (const r of rows) {
        const rad = (r.a * (1 - r.e * r.e)) / (1 + r.e * Math.cos((r.ta * Math.PI) / 180));
        const last = kept[kept.length - 1];
        if (!last || rad < plan.thin.rMax || r.epoch - last.epoch >= plan.thin.gapDays || r === rows[rows.length - 1]) kept.push(r);
      }
      rows = kept;
    }
    out.bodies[b.id] = {
      name: sb.object.fullname,
      solution: `JPL SBDB orbit ${sb.orbit.orbit_id}, data arc ${sb.orbit.first_obs} – ${sb.orbit.last_obs}`,
      elements: rows.map((r) => [r.epoch, fix(r.a, 9), fix(r.e, 9), fix(r.i, 5), fix(r.om, 5), fix(r.w, 5), fix(r.ma, 5)]),
    };
    console.log(`  ${b.id}: ${rows.length} element sets ${plan.from} – ${plan.to}`);
    await sleep(300);
  }
  await writeJSON('src/data/smallBodyElements.json', out, 0);

  // Reference vectors for the tests, at times between element epochs.
  const fixture = { source: 'JPL Horizons API, heliocentric ecliptic J2000, AU, TDB', bodies: {} };
  const jdOfYear = (y) => 2451545.0 + (y - 2000) * 365.25;
  for (const b of SMALL_BODIES) {
    const plan = ELEMENT_PLAN[b.id];
    const y0 = Number(plan.from.slice(0, 4)), y1 = Number(plan.to.slice(0, 4));
    let tlist = [];
    // inside the element range, plus a few years outside it (extrapolation)
    const stepY = b.id === 'ceres' || b.id === 'vesta' ? 9 : 23;
    for (let y = y0 - 30; y <= y1 + 30; y += stepY) tlist.push(jdOfYear(y) + 113.37);
    if (b.id === 'halley') {
      tlist = [];
      for (let y = 1702; y <= 2298; y += 7) tlist.push(jdOfYear(y) + 41.37);
      // around the 1835, 1910, 1986 and 2061 perihelia
      for (const tp of [2391598.5, 2418781.5, 2446469.97, 2474040.5]) for (const d of [-120, -60, -20, 0, 20, 60, 120]) tlist.push(tp + d + 0.37);
      tlist.sort((x, y) => x - y);
    }
    tlist = tlist.filter((jd) => jd > 2305448.5 && jd < 2634166.5); // Horizons small-body span 1600–2500
    const pts = [];
    for (let i = 0; i < tlist.length; i += 60) pts.push(...await vectors(b.horizons, '10', { tlist: tlist.slice(i, i + 60) }));
    fixture.bodies[b.id] = pts.map(round(9));
    console.log(`  ${b.id}: ${pts.length} reference vectors`);
  }
  await writeJSON('tests/fixtures/smallBodies.json', fixture, 0);
}

// ---------------------------------------------------------------------------
// Spacecraft
// ---------------------------------------------------------------------------
const flat = (pts) => pts.flatMap((p) => [p.x, p.y, p.z]);
const fix = (x, d) => Number(x.toFixed(d));
const round = (d) => (p) => ({ jd: p.jd, x: fix(p.x, d), y: fix(p.y, d), z: fix(p.z, d) });

/** Thin dense samples to spline knots; returns { t (days from t0), p (flat) }. */
function thin(pts, t0, tolFn, maxStep, digits) {
  const t = pts.map((p) => p.jd - t0);
  const idx = chooseKnots(t, flat(pts), { tol: tolFn, maxStep });
  return {
    t: idx.map((i) => fix(t[i], 5)),
    p: idx.flatMap((i) => [fix(pts[i].x, digits), fix(pts[i].y, digits), fix(pts[i].z, digits)]),
  };
}

function maxError(track, pts, t0) {
  let worst = 0;
  const o = {};
  for (const p of pts) {
    trackPosition(track, p.jd - t0, o);
    worst = Math.max(worst, Math.hypot(o.x - p.x, o.y - p.y, o.z - p.z));
  }
  return worst;
}

async function fetchSpacecraft() {
  const fixture = { source: 'JPL Horizons API, J2000 ecliptic, AU, TDB; times are off the knot grid', spacecraft: {} };
  for (const sc of SPACECRAFT) {
    console.log(`${sc.id}:`);
    const helio = await vectors(sc.command, '10', { start: sc.start, stop: END, step: '1 d' });
    const t0 = Math.round(helio[0].jd * 1e5) / 1e5;
    const tEnd = helio[helio.length - 1].jd;

    // Encounters: planet-centred, hourly over the window, every 10 min within ±2 d of closest approach.
    const encounters = [];
    for (const enc of sc.encounters) {
      const center = PLANET_CENTER[enc.body];
      let a, b, core;
      if (enc.departure) {
        a = sc.start;
        b = jdToCal(helio[0].jd + enc.days);
        core = [a, jdToCal(helio[0].jd + 3)];
      } else {
        const tca = calToJD(enc.at);
        a = jdToCal(tca - enc.days);
        b = jdToCal(tca + enc.days);
        core = [jdToCal(tca - 2), jdToCal(tca + 2)];
      }
      const coarse = await vectors(sc.command, center, { start: a, stop: b, step: '1 h' });
      const fine = await vectors(sc.command, center, { start: core[0], stop: core[1], step: '10 m' });
      const byJD = new Map();
      for (const p of [...coarse, ...fine]) byJD.set(p.jd.toFixed(6), p);
      const pts = [...byJD.values()].sort((x, y) => x.jd - y.jd);
      // tolerance: 0.2% of the planet distance, at least 20 km
      const tol = (i) => Math.max(20 / AU_KM, 2e-3 * Math.hypot(pts[i].x, pts[i].y, pts[i].z));
      const k = thin(pts, t0, tol, 8, 8);
      const ca = pts.reduce((m, p) => (Math.hypot(p.x, p.y, p.z) < Math.hypot(m.x, m.y, m.z) ? p : m));
      const track = createTrack(k.t, k.p);
      const err = maxError(track, pts, t0);
      const fade = enc.departure ? [0, enc.days * 0.6] : [enc.days * 0.4, enc.days * 0.4];
      encounters.push({ body: enc.body, fadeIn: fade[0], fadeOut: fade[1], ...k });
      console.log(`  ${enc.body}: ${pts.length} → ${k.t.length} knots, CA ${(Math.hypot(ca.x, ca.y, ca.z) * AU_KM).toFixed(0)} km @ JD ${ca.jd.toFixed(4)}, max err ${(err * AU_KM).toFixed(1)} km`);

      // check points off the knot grid (hourly / 10-min grids never hit x.x317)
      const span = enc.departure ? [helio[0].jd + 0.2, helio[0].jd + enc.days - 1] : [ca.jd - enc.days + 1, ca.jd + enc.days - 1];
      const offs = enc.departure ? [0.0317, 0.4317, 1.0317, 2.7317, 6.3317, 15.1317, 33.0317]
        : [-150.3317, -60.2317, -12.1317, -2.3317, -0.4317, -0.1317, -0.0317, 0.0517, 0.2317, 1.1317, 7.0317, 40.3317, 130.7317];
      const tl = offs.map((o) => (enc.departure ? helio[0].jd + o : ca.jd + o)).filter((jd) => jd > span[0] && jd < span[1]);
      const chk = await vectors(sc.command, center, { tlist: tl });
      (fixture.spacecraft[sc.id] ||= { helio: [], encounters: {} }).encounters[enc.body] = chk.map(round(12));
    }

    // Heliocentric track: 10–30 day knots in cruise, denser where needed (2000 km tolerance,
    // looser deep inside flyby windows, where the planet-centred track takes over).
    const inCore = (jd) => encounters.some((e) => {
      const s = t0 + e.t[0] + e.fadeIn, f = t0 + e.t[e.t.length - 1] - e.fadeOut;
      return jd > s && jd < f;
    });
    const tol = (i) => (inCore(helio[i].jd) ? 0.01 : 2000 / AU_KM);
    const h = thin(helio, t0, tol, 30, 6);
    const htrack = createTrack(h.t, h.p);
    const herr = maxError(htrack, helio.filter((p) => !inCore(p.jd)), t0);
    console.log(`  helio: ${helio.length} → ${h.t.length} knots, max err outside flybys ${(herr * AU_KM).toFixed(0)} km`);

    // helio check points: ~1 per year, at times off the daily grid
    const tl = [];
    for (let jd = helio[0].jd + 3.37; jd < tEnd - 1; jd += 365.25 * 1.03) tl.push(jd);
    const chk = [];
    for (let i = 0; i < tl.length; i += 60) chk.push(...await vectors(sc.command, '10', { tlist: tl.slice(i, i + 60) }));
    fixture.spacecraft[sc.id].helio = chk.map(round(9));

    await writeJSON(`src/data/spacecraft/${sc.id}.json`, {
      id: sc.id,
      source: `JPL Horizons API (target ${sc.command}), geometric, J2000 ecliptic, AU. t = TDB days after t0. Fetched ${new Date().toISOString().slice(0, 10)}`,
      t0, end: fix(tEnd - t0, 5),
      t: h.t, p: h.p,
      encounters,
    }, 0);
  }
  await writeJSON('tests/fixtures/spacecraft.json', fixture, 0);
}

// ---------------------------------------------------------------------------
function calToJD(s) {
  return Date.parse(s.replace(' ', 'T') + 'Z') / 86400000 + 2440587.5;
}
function jdToCal(jd) {
  return new Date((jd - 2440587.5) * 86400000).toISOString().slice(0, 16).replace('T', ' ');
}
async function writeJSON(rel, data, indent) {
  const path = join(ROOT, rel);
  await mkdir(dirname(path), { recursive: true });
  const text = indent ? JSON.stringify(data, null, indent) : JSON.stringify(data);
  await writeFile(path, text + '\n');
  console.log(`  wrote ${rel} (${(text.length / 1024).toFixed(1)} KB)`);
}

const what = process.argv[2] || 'all';
if (what === 'all' || what === 'elements') await fetchElements();
if (what === 'all' || what === 'spacecraft') await fetchSpacecraft();
