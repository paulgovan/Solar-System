// Planetary oppositions, conjunctions and greatest elongations, from geocentric geometry.
//
// Everything is derived from the app's own positions (computePositions: heliocentric
// J2000 ecliptic, Earth separated from the Earth–Moon barycentre), so the events agree
// with what the scene shows. Ecliptic longitudes are J2000; precession shifts every body
// equally, so differences (which define all the events here) are unaffected.
//
// Definitions:
//   opposition        outer planet 180° from the Sun in ecliptic longitude
//   conjunction-sun   outer planet at the same longitude as the Sun (behind it)
//   inferior/superior Mercury or Venus at the Sun's longitude, nearer / farther than the Sun
//   elongation        Mercury or Venus at its greatest angle from the Sun (east = evening sky)
//   conjunction       two planets at the same ecliptic longitude (the "Great Conjunction" is
//                     one of these); only those within `maxSeparationDeg` of each other and at
//                     least `minElongationDeg` from the Sun are reported
//
// The scan steps one day, brackets sign changes and bisects them to a few seconds.

import { computePositions } from './positions.js';

const DEG = Math.PI / 180;
const TAU = 2 * Math.PI;
const wrapPi = (a) => a - TAU * Math.round(a / TAU);

export const INNER = ['mercury', 'venus'];
export const OUTER = ['mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
export const SKY_PLANETS = [...INNER, ...OUTER];

/** Geocentric ecliptic longitude/latitude (rad) and distance (AU) of the Sun and each planet. */
export function geocentricSky(jd) {
  const p = computePositions(jd);
  const e = p.earth;
  const out = {};
  const put = (id, x, y, z) => {
    out[id] = { lon: Math.atan2(y, x), lat: Math.atan2(z, Math.hypot(x, y)), dist: Math.hypot(x, y, z), x, y, z };
  };
  put('sun', -e.x, -e.y, -e.z);
  for (const id of SKY_PLANETS) put(id, p[id].x - e.x, p[id].y - e.y, p[id].z - e.z);
  return out;
}

/** Angle (rad) between two geocentric directions. */
export function separation(a, b) {
  const d = (a.x * b.x + a.y * b.y + a.z * b.z) / (a.dist * b.dist);
  const c = { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
  return Math.atan2(Math.hypot(c.x, c.y, c.z) / (a.dist * b.dist), d);
}

/** Root of f (sign change between a and b) by bisection, to `tol` days. */
function bisect(f, a, b, fa, tol = 2e-5) {
  let lo = a, hi = b, flo = fa;
  while (hi - lo > tol) {
    const mid = 0.5 * (lo + hi);
    const fm = f(mid);
    if ((fm < 0) === (flo < 0)) { lo = mid; flo = fm; } else hi = mid;
  }
  return 0.5 * (lo + hi);
}

/** Maximum of f on [a, b] (unimodal) by golden-section search. */
function maximize(f, a, b, tol = 1e-3) {
  const g = (Math.sqrt(5) - 1) / 2;
  let x1 = b - g * (b - a), x2 = a + g * (b - a), f1 = f(x1), f2 = f(x2);
  while (b - a > tol) {
    if (f1 < f2) { a = x1; x1 = x2; f1 = f2; x2 = a + g * (b - a); f2 = f(x2); } else { b = x2; x2 = x1; f2 = f1; x1 = b - g * (b - a); f1 = f(x1); }
  }
  return 0.5 * (a + b);
}

const pairDiff = (a, b) => (jd) => { const s = geocentricSky(jd); return wrapPi(s[a].lon - s[b].lon); };
const elongationOf = (id) => (jd) => { const s = geocentricSky(jd); return separation(s[id], s.sun); };

/**
 * All events between two UTC Julian Dates, in time order. Each event:
 *   { jd, type, body, other?, separationDeg?, elongationDeg?, east? }
 * @param {{maxSeparationDeg?: number, minElongationDeg?: number, pairs?: boolean}} [opts]
 */
export function findSkyEvents(jd0, jd1, opts = {}) {
  const { maxSeparationDeg = 3, minElongationDeg = 10, pairs = true } = opts;
  const step = 1;
  const n = Math.ceil((jd1 - jd0) / step) + 1;
  const jds = Array.from({ length: n }, (_, i) => jd0 + i * step);
  const sky = jds.map(geocentricSky);
  const events = [];
  const inRange = (jd) => jd >= jd0 && jd <= jd1;

  // --- relative to the Sun ---
  for (const id of SKY_PLANETS) {
    const inner = INNER.includes(id);
    const dSun = (jd) => { const s = geocentricSky(jd); return wrapPi(s[id].lon - s.sun.lon); };
    const dOpp = (jd) => { const s = geocentricSky(jd); return wrapPi(s[id].lon - s.sun.lon - Math.PI); };
    for (let i = 0; i + 1 < n; i++) {
      const a = wrapPi(sky[i][id].lon - sky[i].sun.lon), b = wrapPi(sky[i + 1][id].lon - sky[i + 1].sun.lon);
      if (Math.abs(a) < 1.5 && Math.abs(b) < 1.5 && a * b <= 0 && a !== b) {
        const jd = bisect(dSun, jds[i], jds[i + 1], a);
        if (!inRange(jd)) continue;
        const s = geocentricSky(jd);
        const type = !inner ? 'conjunction-sun' : s[id].dist < s.sun.dist ? 'inferior' : 'superior';
        events.push({ jd, type, body: id, elongationDeg: separation(s[id], s.sun) / DEG });
      }
      if (!inner) {
        const ao = wrapPi(sky[i][id].lon - sky[i].sun.lon - Math.PI), bo = wrapPi(sky[i + 1][id].lon - sky[i + 1].sun.lon - Math.PI);
        if (Math.abs(ao) < 1.5 && Math.abs(bo) < 1.5 && ao * bo <= 0 && ao !== bo) {
          const jd = bisect(dOpp, jds[i], jds[i + 1], ao);
          if (inRange(jd)) events.push({ jd, type: 'opposition', body: id, distanceAU: geocentricSky(jd)[id].dist });
        }
      }
    }
    if (inner) {
      const el = sky.map((s) => separation(s[id], s.sun));
      const f = elongationOf(id);
      for (let i = 1; i + 1 < n; i++) {
        if (el[i] > el[i - 1] && el[i] >= el[i + 1] && el[i] > 12 * DEG) {
          const jd = maximize(f, jds[i - 1], jds[i + 1]);
          if (!inRange(jd)) continue;
          const s = geocentricSky(jd);
          events.push({ jd, type: 'elongation', body: id, elongationDeg: f(jd) / DEG, east: wrapPi(s[id].lon - s.sun.lon) > 0 });
        }
      }
    }
  }

  // --- planet–planet conjunctions in ecliptic longitude ---
  if (pairs) {
    for (let x = 0; x < SKY_PLANETS.length; x++) {
      for (let y = x + 1; y < SKY_PLANETS.length; y++) {
        const A = SKY_PLANETS[x], B = SKY_PLANETS[y];
        const f = pairDiff(A, B);
        for (let i = 0; i + 1 < n; i++) {
          const a = wrapPi(sky[i][A].lon - sky[i][B].lon), b = wrapPi(sky[i + 1][A].lon - sky[i + 1][B].lon);
          if (!(Math.abs(a) < 1 && Math.abs(b) < 1 && a * b <= 0 && a !== b)) continue;
          const jd = bisect(f, jds[i], jds[i + 1], a);
          if (!inRange(jd)) continue;
          const s = geocentricSky(jd);
          const sep = separation(s[A], s[B]) / DEG;
          const elong = Math.min(separation(s[A], s.sun), separation(s[B], s.sun)) / DEG;
          if (sep > maxSeparationDeg || elong < minElongationDeg) continue;
          events.push({ jd, type: 'conjunction', body: A, other: B, separationDeg: sep, elongationDeg: elong });
        }
      }
    }
  }

  return events.sort((p, q) => p.jd - q.jd);
}

/** Events in the window [jd − before, jd + after] days. */
export function skyEventsAround(jd, beforeDays = 365, afterDays = 730, opts) {
  const all = findSkyEvents(jd - beforeDays, jd + afterDays, opts);
  return { previous: all.filter((e) => e.jd <= jd), next: all.filter((e) => e.jd > jd) };
}
