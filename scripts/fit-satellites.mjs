// Refines the satellite mean elements in src/ephemeris/satellites.js.
//
// Starts from JPL's published mean elements (https://ssd.jpl.nasa.gov/sats/elem/,
// rounded to 0.1° on the page), fetches geometric parent-relative vectors from
// the JPL Horizons API, and least-squares fits the same precessing-ellipse model
// (plus long-period libration terms where a resonance needs them). Prints the
// fitted constants as a JS object literal and the accuracy on an independent
// set of dates.
//
//   node scripts/fit-satellites.mjs [--cache dir] [ids...]
//
// Fitting dates: a geometric ladder around J2000 (so mean motions can be
// unwrapped without aliasing) plus 60 dates over 1950–2050. Evaluation dates:
// 80 other dates over 1950–2050.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { defineSatellite, satellitePosition } from '../src/ephemeris/satellites.js';

const D = Math.PI / 180, AU = 149597870.7, J2000 = 2451545, Y = 365.25;

// JPL table: [parent, Horizons id, a km, e, ω, M, i, node, P d, Papsis yr, Pnode yr, pole RA, pole Dec]
// Uranus: JPL's "equatorial" frame uses the pole along the moons' orbital angular
// momentum, i.e. opposite the IAU north pole (257.311°, −15.175°).
const URANUS_POLE = [77.311, 15.175];
const TABLE = {
  phobos: ['mars', 401, 9375, 0.015, 216.3, 189.7, 1.1, 169.2, 0.3187, 1.1, 2.3, 317.7, 52.9],
  deimos: ['mars', 402, 23457, 0.000, 0.0, 205.0, 1.8, 54.3, 1.2625, 0, 56.2, 316.6, 53.5],
  mimas: ['saturn', 601, 186000, 0.020, 160.4, 275.3, 1.6, 66.2, 0.942422, 0.493, 0.986, 40.6, 83.5],
  enceladus: ['saturn', 602, 238400, 0.005, 119.5, 57.0, 0.0, 0.0, 1.370218, 2.916, 0, 40.6, 83.5],
  tethys: ['saturn', 603, 295000, 0.001, 335.3, 0.0, 1.1, 273.0, 1.887802, 0.005, 4.982, 40.6, 83.5],
  dione: ['saturn', 604, 377700, 0.002, 116.0, 212.0, 0.0, 0.0, 2.736916, 11.698, 0, 40.6, 83.5],
  rhea: ['saturn', 605, 527200, 0.001, 44.3, 31.5, 0.3, 133.7, 4.517503, 33.939, 35.775, 40.6, 83.5],
  titan: ['saturn', 606, 1221900, 0.029, 78.3, 11.7, 0.3, 78.6, 15.945448, 346.680, 687.370, 36.4, 84.0],
  iapetus: ['saturn', 608, 3561700, 0.028, 254.5, 74.8, 7.6, 86.5, 79.331002, 1662.900, 3130.302, 288.7, 78.9],
  ariel: ['uranus', 701, 190929, 0.001, 9.6, 193.5, 0.0, 0.0, 2.520379, 28.901, 0, ...URANUS_POLE],
  umbriel: ['uranus', 702, 265986, 0.004, 183.4, 253.0, 0.1, 174.8, 4.144177, 64.126, 129.945, ...URANUS_POLE],
  titania: ['uranus', 703, 436298, 0.002, 184.0, 68.1, 0.1, 29.5, 8.705869, 579.928, 1644.649, ...URANUS_POLE],
  oberon: ['uranus', 704, 583511, 0.002, 132.2, 143.6, 0.1, 76.8, 13.463237, 158.604, 192.798, ...URANUS_POLE],
  miranda: ['uranus', 705, 129846, 0.001, 154.8, 73.0, 4.4, 100.9, 1.413479, 8.939, 17.787, ...URANUS_POLE],
  triton: ['neptune', 801, 354800, 0.000, 0.0, 63.0, 157.3, 177.7, 5.8792, 675.2, 299.4, 299.36, 43.46], // Neptune IAU pole
  charon: ['pluto', 901, 19600, 0.000, 0.0, 304.1, 0.0, 0.0, 6.387222, 0, 0, 132.993, -6.163], // Pluto IAU pole
};
const CENTER = { mars: 499, saturn: 699, uranus: 799, neptune: 899, pluto: 999 };

// Extra terms: long-period librations in mean longitude [amplitude °, period yr, phase °] (seeds),
// and a quadratic term in mean longitude (Phobos' tidal acceleration).
const EXTRA = {
  phobos: { n2: true },
  deimos: { lib: [[0.15, 58, 0]] },
  mimas: { lib: [[43.5, 70.507, 140.46], [0.5, 23.5023, 61.4]] }, // Mimas–Tethys 4:2 resonance (+3rd harmonic)
  tethys: { lib: [[-2, 70.8, 0]] },
  enceladus: { lib: [[0.22, 11.1, 0]] }, // Enceladus–Dione 2:1
  miranda: { lib: [[1.5, 12.3, 0]] },
};

function seedElements(id) {
  const [parent, , a, e, w, M, i, node, P, Pa, Pn, ra, dec] = TABLE[id];
  const retro = i > 90;
  const dnode = Pn ? (retro ? 1 : -1) * 360 / (Pn * Y) : 0; // nodes regress (advance for retrograde orbits)
  const dperi = dnode + (Pa ? 360 / (Pa * Y) : 0);
  const el = { parent, a, e, i, node, peri: node + w, lambda: node + w + M, dnode, dperi, n: 360 / P, n2: 0 };
  if (ra !== undefined) el.pole = [ra, dec];
  const x = EXTRA[id];
  if (x?.lib) el.lib = x.lib.map(([A, Pyr, ph]) => [A, 360 / (Pyr * Y), ph]);
  return el;
}

// ---------------------------------------------------------------------------
// Horizons
// ---------------------------------------------------------------------------
async function horizons(cmd, center, jds) {
  const out = [];
  for (let k = 0; k < jds.length; k += 50) {
    const p = new URLSearchParams({
      format: 'json', COMMAND: `'${cmd}'`, EPHEM_TYPE: 'VECTORS', CENTER: `'500@${center}'`,
      REF_PLANE: 'ECLIPTIC', REF_SYSTEM: 'ICRF', OUT_UNITS: 'AU-D', VEC_TABLE: '1', VEC_CORR: 'NONE',
      CSV_FORMAT: 'YES', OBJ_DATA: 'NO', TLIST: jds.slice(k, k + 50).map((j) => `'${j}'`).join(' '),
    });
    const r = await (await fetch('https://ssd.jpl.nasa.gov/api/horizons.api?' + p)).json();
    const body = r.result.split('$$SOE')[1].split('$$EOE')[0].trim();
    for (const l of body.split('\n')) {
      const f = l.split(',').map((s) => s.trim());
      out.push({ jd: +f[0], x: +f[2], y: +f[3], z: +f[4] });
    }
  }
  return out;
}

const FIT_JDS = (() => {
  const o = [0];
  for (let t = 0.02; t < 19000; t *= 1.6) o.push(t, -t);
  const a = o.map((t) => +(J2000 + t).toFixed(5));
  for (let i = 0; i < 60; i++) a.push(+(2433500 + i * 610.7 + i * i * 0.37).toFixed(4));
  return a.sort((x, y) => x - y);
})();
const EVAL_JDS = Array.from({ length: 80 }, (_, i) => +(2433282.5 + i * 457.3 + ((i * 7919) % 97) / 97).toFixed(4));

async function cached(cache, name, fn) {
  const f = cache && join(cache, name + '.json');
  if (f && existsSync(f)) return JSON.parse(readFileSync(f));
  const v = await fn();
  if (f) writeFileSync(f, JSON.stringify(v));
  return v;
}

// ---------------------------------------------------------------------------
// Levenberg–Marquardt on non-singular element combinations
// ---------------------------------------------------------------------------
const KEYS = ['lambda', 'n', 'k', 'h', 'p', 'q', 'a', 'dnode', 'dperi', 'n2', 'A1', 'F1', 'P1', 'A2', 'F2', 'P2'];
const F = (...names) => names.map((n) => KEYS.indexOf(n));

function toEl(base, x) {
  const v = Object.fromEntries(KEYS.map((k, j) => [k, x[j]]));
  const t = Math.hypot(v.p, v.q);
  const el = {
    ...base, a: v.a, e: Math.hypot(v.k, v.h), peri: Math.atan2(v.h, v.k) / D,
    i: base.i > 90 ? 180 - 2 * Math.atan(t) / D : 2 * Math.atan(t) / D, node: Math.atan2(v.q, v.p) / D,
    lambda: v.lambda, n: v.n, n2: v.n2, dnode: v.dnode, dperi: v.dperi,
  };
  if (base.lib) el.lib = base.lib.map((_, m) => [v['A' + (m + 1)], v['F' + (m + 1)], v['P' + (m + 1)]]);
  return el;
}
function fromEl(el) {
  const t = Math.tan(((el.i > 90 ? 180 - el.i : el.i) * D) / 2);
  const lib = [...(el.lib?.[0] ?? [0, 0, 0]), ...(el.lib?.[1] ?? [0, 0, 0])];
  return [el.lambda, el.n, el.e * Math.cos(el.peri * D), el.e * Math.sin(el.peri * D), t * Math.cos(el.node * D), t * Math.sin(el.node * D),
    el.a, el.dnode, el.dperi, el.n2 || 0, ...lib];
}
function resid(id, base, x, samples) {
  defineSatellite(id, toEl(base, x));
  const s = base.a / AU, out = [];
  for (const r of samples) {
    const p = satellitePosition(id, r.jd);
    out.push((p.x - r.x) / s, (p.y - r.y) / s, (p.z - r.z) / s);
  }
  return out;
}
function solve(A, b) {
  const n = b.length;
  A = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let m = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[m][c])) m = r;
    [A[c], A[m]] = [A[m], A[c]];
    for (let r = 0; r < n; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k]; }
  }
  return A.map((r, i) => r[n] / r[i]);
}
const sq = (r) => r.reduce((s, v) => s + v * v, 0);
function lm(id, base, x, free, samples, iters) {
  let lam = 1e-3, r = resid(id, base, x, samples), cost = sq(r);
  for (let it = 0; it < iters; it++) {
    const J = free.map((j) => {
      const h = Math.max(1e-7, Math.abs(x[j]) * 1e-7) * (KEYS[j] === 'n2' ? 1e-6 : 1);
      const xp = [...x]; xp[j] += h;
      return resid(id, base, xp, samples).map((v, m) => (v - r[m]) / h);
    });
    const JTJ = J.map((a) => J.map((b) => a.reduce((s, v, m) => s + v * b[m], 0)));
    const g = J.map((a) => -a.reduce((s, v, m) => s + v * r[m], 0));
    let improved = false;
    for (let tries = 0; tries < 10 && !improved; tries++) {
      const dx = solve(JTJ.map((row, i) => row.map((v, j) => v + (i === j ? lam * (JTJ[i][i] + 1e-12) : 0))), g);
      const xn = [...x];
      free.forEach((j, m) => (xn[j] += dx[m]));
      const rn = resid(id, base, xn, samples), cn = sq(rn);
      if (cn < cost) { improved = (cost - cn) / cost > 1e-10; x = xn; r = rn; cost = cn; lam *= 0.3; } else lam *= 10;
    }
    if (!improved) break;
  }
  return x;
}

function fit(id, data) {
  const base = seedElements(id);
  let x = fromEl(base);
  const all = data.map((r) => ({ ...r, t: r.jd - J2000 })).sort((a, b) => Math.abs(a.t) - Math.abs(b.t));
  const P = 360 / base.n;
  // The published epoch angles can be far off: grid-search the mean longitude first.
  const near = all.filter((r) => Math.abs(r.t) < P * 0.6);
  let best = [Infinity, 0];
  for (let L = 0; L < 360; L += 2) { x[0] = L; const c = sq(resid(id, base, x, near)); if (c < best[0]) best = [c, L]; }
  x[0] = best[1];
  const libKeys = base.lib ? F(...['A1', 'F1', 'P1', 'A2', 'F2', 'P2'].slice(0, 3 * base.lib.length)) : [];
  const core = F('lambda', 'n', 'k', 'h', 'p', 'q', 'a');
  const full = [...core, ...F('dnode', 'dperi'), ...libKeys, ...(EXTRA[id]?.n2 ? F('n2') : [])];
  // Widen the time span gradually so the mean motion is unwrapped without aliasing.
  for (let T = P * 0.6; T <= 40000 * 1.6; T *= 1.6) x = lm(id, base, x, T > 3000 ? full.filter((j) => KEYS[j] !== 'n2') : core, all.filter((r) => Math.abs(r.t) <= T), 15);
  x = lm(id, base, x, full, all, 60);
  return toEl(base, x);
}

const ang = (a, b) => Math.acos(Math.min(1, (a.x * b.x + a.y * b.y + a.z * b.z) / Math.hypot(a.x, a.y, a.z) / Math.hypot(b.x, b.y, b.z))) / D;
const sig = (v, n = 10) => +v.toPrecision(n);

const args = process.argv.slice(2);
let cache = null;
if (args[0] === '--cache') { cache = args[1]; args.splice(0, 2); mkdirSync(cache, { recursive: true }); }
const ids = args.length ? args : Object.keys(TABLE);
const lines = [];
for (const id of ids) {
  const [parent, cmd] = TABLE[id];
  const fitData = await cached(cache, `fit-${id}`, () => horizons(cmd, CENTER[parent], FIT_JDS));
  const evalData = await cached(cache, `eval-${id}`, () => horizons(cmd, CENTER[parent], EVAL_JDS));
  const el = fit(id, fitData);
  defineSatellite(id, el);
  const errs = evalData.map((r) => ang(satellitePosition(id, r.jd), r)).sort((a, b) => a - b);
  console.error(`${id.padEnd(10)} 1950–2050 angular error: median ${errs[errs.length >> 1].toFixed(3)}°, max ${errs.at(-1).toFixed(3)}°`);
  const o = {
    parent, a: sig(el.a, 8), e: sig(el.e, 6), i: sig(el.i, 8), node: sig(el.node, 9), peri: sig(el.peri, 8),
    lambda: sig(el.lambda, 10), n: sig(el.n, 13), dnode: sig(el.dnode, 7), dperi: sig(el.dperi, 7),
  };
  if (el.n2) o.n2 = sig(el.n2, 6);
  if (el.pole) o.pole = el.pole;
  if (el.lib) o.lib = el.lib.map((t) => [sig(t[0], 6), sig(t[1], 8), sig(t[2], 6)]);
  lines.push(`  ${id}: ${JSON.stringify(o).replace(/"(\w+)":/g, '$1: ').replace(/,(?=\S)/g, ', ').replace(/"/g, "'")},`);
}
console.log(lines.join('\n'));
