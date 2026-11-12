// Two-body propagation of osculating elements (asteroids, dwarf planets, comets).
//
// Elements are heliocentric, J2000 ecliptic, as published by the JPL Small-Body
// Database: a (AU), e, i/om/w/ma (deg), n (deg/day), epoch (JD TDB). Planetary
// perturbations are ignored, so accuracy degrades away from the epoch; each body
// carries a validity window measured against JPL Horizons (see tests).

import { DEG } from './constants.js';
import { wrapPi, solveKepler, positionFromElements } from './kepler.js';
import { deltaT } from './time.js';

/** Elements in radians, ready for kepler.js. */
export function prepareElements(el) {
  return {
    a: el.a, e: el.e,
    I: el.i * DEG, Omega: el.om * DEG, omega: el.w * DEG,
    M0: el.ma * DEG, n: el.n * DEG, epoch: el.epoch,
  };
}

/** TDB (≈TT) Julian Date for a UTC Julian Date. */
export const jdTDB = (jdUTC) => jdUTC + deltaT(jdUTC) / 86400;

/** Heliocentric ecliptic J2000 position (AU) at a TDB Julian Date. */
export function smallBodyPosition(el, jdTdb) {
  const M = wrapPi(el.M0 + el.n * (jdTdb - el.epoch));
  return positionFromElements(el, solveKepler(M, el.e));
}

/** Eccentric anomaly / 2π at a TDB Julian Date (0…1), matching smallBodyPath's sampling. */
export function smallBodyPhase(el, jdTdb) {
  const E = solveKepler(wrapPi(el.M0 + el.n * (jdTdb - el.epoch)), el.e);
  return ((E / (2 * Math.PI)) % 1 + 1) % 1;
}

/** Orbit ellipse sampled uniformly in eccentric anomaly. */
export function smallBodyPath(el, segments) {
  const pts = [];
  for (let i = 0; i <= segments; i++) pts.push(positionFromElements(el, (i / segments) * 2 * Math.PI));
  return pts;
}

// ---------------------------------------------------------------------------
// Element series: osculating elements at many epochs. Between two epochs the
// position is a smooth blend of both two-body propagations (each exact at its own
// epoch); outside the series it is extrapolated from the first/last set.
// ---------------------------------------------------------------------------
const GAUSS_K_DEG = 0.01720209895 / DEG; // deg/day for a = 1 AU

/** rows: [[epoch, a, e, i, om, w, ma], …] sorted by epoch. */
export function createElementSeries(rows) {
  const sets = rows.map(([epoch, a, e, i, om, w, ma]) => prepareElements({ epoch, a, e, i, om, w, ma, n: GAUSS_K_DEG / Math.pow(a, 1.5) }));
  return { sets, start: sets[0].epoch, end: sets[sets.length - 1].epoch, last: 0 };
}

/** Index k with sets[k].epoch ≤ jd < sets[k+1].epoch (clamped to 0 … n−2). */
function seriesIndex(series, jd) {
  const s = series.sets;
  let k = series.last;
  if (k < s.length - 1 && s[k].epoch <= jd && jd < s[k + 1].epoch) return k;
  let lo = 0, hi = s.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (s[mid].epoch <= jd) lo = mid; else hi = mid;
  }
  series.last = lo;
  return lo;
}

/** Elements nearest in time to jd (TDB). */
export function nearestElements(series, jd) {
  const s = series.sets;
  if (s.length === 1 || jd <= series.start) return s[0];
  if (jd >= series.end) return s[s.length - 1];
  const k = seriesIndex(series, jd);
  return jd - s[k].epoch < s[k + 1].epoch - jd ? s[k] : s[k + 1];
}

/** Heliocentric ecliptic J2000 position (AU) from an element series at a TDB Julian Date. */
export function seriesPosition(series, jdTdb) {
  const s = series.sets;
  if (s.length === 1 || jdTdb <= series.start) return smallBodyPosition(s[0], jdTdb);
  if (jdTdb >= series.end) return smallBodyPosition(s[s.length - 1], jdTdb);
  const k = seriesIndex(series, jdTdb);
  const a = smallBodyPosition(s[k], jdTdb), b = smallBodyPosition(s[k + 1], jdTdb);
  let w = (jdTdb - s[k].epoch) / (s[k + 1].epoch - s[k].epoch);
  w = w * w * (3 - 2 * w);
  return { x: a.x + (b.x - a.x) * w, y: a.y + (b.y - a.y) * w, z: a.z + (b.z - a.z) * w };
}

/** Heliocentric velocity (AU/day) by central difference. */
export function seriesVelocity(series, jdTdb, h = 0.05) {
  const a = seriesPosition(series, jdTdb - h), b = seriesPosition(series, jdTdb + h);
  return { x: (b.x - a.x) / (2 * h), y: (b.y - a.y) / (2 * h), z: (b.z - a.z) / (2 * h) };
}
