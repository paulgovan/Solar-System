// The sky as seen from a place on Earth: sidereal time, precession and nutation, topocentric
// parallax, altitude / azimuth, atmospheric refraction, rise / transit / set, apparent
// magnitudes and the Moon's phase. Formulas are from J. Meeus, *Astronomical Algorithms*
// (2nd ed.), chapters 12 (sidereal time), 13 (horizontal coordinates), 15 (rising and
// setting), 16 (refraction, Bennett / Saemundsson), 17 (separation), 21 (precession),
// 22 (nutation), 40 (parallax) and 48 (illuminated fraction); planetary magnitudes are those
// of Mallama & Hilton (2018, Astronomy and Computing 25, 10).
//
// Conventions
//  - All angles are DEGREES (inputs and outputs) unless a name ends in `Rad`.
//  - Longitude is positive EAST of Greenwich; azimuth is measured from NORTH through EAST.
//  - `jd` is a UTC Julian Date, as everywhere else in the app.
//  - Positions of bodies come from computePositions(); the apparent place includes light-time
//    and annual aberration, precession and nutation (true equator and equinox of date), then
//    topocentric parallax — what JPL Horizons calls "apparent, airless" RA/Dec and Az/El.
//
// Accuracy (tests/topocentric.test.js, tests/horizons-sky.test.js): sidereal time, nutation,
// precession and horizontal coordinates reproduce Meeus' worked examples to the digits printed.
// Against JPL Horizons observer tables (two cities, two dates, six bodies, airless apparent
// Az/El): Sun, Moon, Venus and Mars agree within 0.01° in altitude and azimuth, Jupiter within
// 0.03° and Saturn within 0.08° (their limit is the Keplerian elements, not this module); rise,
// transit and set agree within one minute (Horizons rounds to the minute); magnitudes within
// 0.11 (Moon) and 0.08 (Mars), better than 0.04 for the others. Nutation uses the 21 largest
// IAU-1980 terms (error < 0.1″). Refraction is for 1010 mbar and 10 °C; it is applied only to
// displayed (“apparent”) altitudes and in the rise/set threshold, never to the geometric altitude.

import { DEG, AU_KM, J2000, OBLIQUITY_J2000 } from './constants.js';
import { centuriesTT } from './time.js';
import { computePositions } from './positions.js';
import { orientation } from './rotation.js';

const RAD = DEG;
const mod360 = (x) => ((x % 360) + 360) % 360;
const wrap180 = (x) => { const y = mod360(x); return y > 180 ? y - 360 : y; };
const ARCSEC = DEG / 3600;
const C_AU_DAY = 173.1446326847; // speed of light, AU per day
const EARTH_EQ_RADIUS_KM = 6378.14;
const SOLAR_PARALLAX_ARCSEC = 8.794;
const SUN_RADIUS_KM = 695700;
const MOON_RADIUS_KM = 1737.4;

/** Standard altitude of the centre of a star or planet at rise / set (Meeus ch. 15), degrees. */
export const H0_STAR = -0.5667;

// ---------------------------------------------------------------------------
// Time: sidereal time, obliquity, nutation
// ---------------------------------------------------------------------------

/** Julian centuries of UT since J2000. */
export const centuriesUT = (jd) => (jd - J2000) / 36525;

/** Greenwich mean sidereal time, degrees (Meeus 12.4). */
export function meanSiderealTime(jd) {
  const T = centuriesUT(jd);
  return mod360(280.46061837 + 360.98564736629 * (jd - J2000) + 0.000387933 * T * T - (T * T * T) / 38710000);
}

/** Mean obliquity of the ecliptic of date, degrees (Laskar; Meeus 22.3). T: centuries TT from J2000. */
export function meanObliquity(T) {
  const U = T / 100;
  const s = 84381.448 + U * (-4680.93 + U * (-1.55 + U * (1999.25 + U * (-51.38 + U * (-249.67
    + U * (-39.05 + U * (7.12 + U * (27.87 + U * (5.79 + U * 2.45)))))))));
  return s / 3600;
}

// IAU 1980 nutation, largest terms. Columns: multipliers of D, M, M', F, Ω; Δψ (0.0001″, per
// century), Δε (0.0001″, per century).
const NUT = [
  [0, 0, 0, 0, 1, -171996, -174.2, 92025, 8.9],
  [-2, 0, 0, 2, 2, -13187, -1.6, 5736, -3.1],
  [0, 0, 0, 2, 2, -2274, -0.2, 977, -0.5],
  [0, 0, 0, 0, 2, 2062, 0.2, -895, 0.5],
  [0, 1, 0, 0, 0, 1426, -3.4, 54, -0.1],
  [0, 0, 1, 0, 0, 712, 0.1, -7, 0],
  [-2, 1, 0, 2, 2, -517, 1.2, 224, -0.6],
  [0, 0, 0, 2, 1, -386, -0.4, 200, 0],
  [0, 0, 1, 2, 2, -301, 0, 129, -0.1],
  [-2, -1, 0, 2, 2, 217, -0.5, -95, 0.3],
  [-2, 0, 1, 0, 0, -158, 0, 0, 0],
  [-2, 0, 0, 2, 1, 129, 0.1, -70, 0],
  [0, 0, -1, 2, 2, 123, 0, -53, 0],
  [2, 0, 0, 0, 0, 63, 0, 0, 0],
  [0, 0, 1, 0, 1, 63, 0.1, -33, 0],
  [2, 0, -1, 2, 2, -59, 0, 26, 0],
  [0, 0, -1, 0, 1, -58, -0.1, 32, 0],
  [0, 0, 1, 2, 1, -51, 0, 27, 0],
  [-2, 0, 2, 0, 0, 48, 0, 0, 0],
  [0, 0, -2, 2, 1, 46, 0, -24, 0],
  [2, 0, 0, 2, 2, -38, 0, 16, 0],
];

/** Nutation in longitude and obliquity, degrees (Meeus ch. 22). T: centuries TT from J2000. */
export function nutation(T) {
  const D = (297.85036 + 445267.11148 * T - 0.0019142 * T * T + (T * T * T) / 189474) * RAD;
  const M = (357.52772 + 35999.05034 * T - 0.0001603 * T * T - (T * T * T) / 300000) * RAD;
  const Mp = (134.96298 + 477198.867398 * T + 0.0086972 * T * T + (T * T * T) / 56250) * RAD;
  const F = (93.27191 + 483202.017538 * T - 0.0036825 * T * T + (T * T * T) / 327270) * RAD;
  const Om = (125.04452 - 1934.136261 * T + 0.0020708 * T * T + (T * T * T) / 450000) * RAD;
  let dpsi = 0, deps = 0;
  for (const [a, b, c, d, e, s0, s1, c0, c1] of NUT) {
    const arg = a * D + b * M + c * Mp + d * F + e * Om;
    dpsi += (s0 + s1 * T) * Math.sin(arg);
    deps += (c0 + c1 * T) * Math.cos(arg);
  }
  return { dpsi: dpsi * 1e-4 / 3600, deps: deps * 1e-4 / 3600 };
}

/** Greenwich apparent sidereal time, degrees: mean + equation of the equinoxes. */
export function apparentSiderealTime(jd) {
  const T = centuriesTT(jd);
  const { dpsi } = nutation(T);
  const eps = meanObliquity(T) + nutation(T).deps;
  return mod360(meanSiderealTime(jd) + dpsi * Math.cos(eps * RAD));
}

// ---------------------------------------------------------------------------
// Coordinate frames (vectors are {x, y, z}; equatorial = x to the equinox, z to the pole)
// ---------------------------------------------------------------------------

/** Geocentric ecliptic J2000 vector → equatorial J2000 (rotation by the J2000 obliquity). */
export function eclipticToEquatorial(v) {
  const c = Math.cos(OBLIQUITY_J2000), s = Math.sin(OBLIQUITY_J2000);
  return { x: v.x, y: c * v.y - s * v.z, z: s * v.y + c * v.z };
}

/** Precession angles ζ, z, θ (radians) from J2000 to the mean equinox of date (Meeus 21.2). */
function precessionAngles(T) {
  return {
    zeta: (2306.2181 * T + 0.30188 * T * T + 0.017998 * T * T * T) * ARCSEC,
    z: (2306.2181 * T + 1.09468 * T * T + 0.018203 * T * T * T) * ARCSEC,
    theta: (2004.3109 * T - 0.42665 * T * T - 0.041833 * T * T * T) * ARCSEC,
  };
}

/** Equatorial J2000 → mean equator and equinox of date. T: centuries TT from J2000. */
export function precessJ2000(v, T) {
  const { zeta, z, theta } = precessionAngles(T);
  const cz = Math.cos(zeta), sz = Math.sin(zeta);
  const x1 = v.x * cz - v.y * sz, y1 = v.x * sz + v.y * cz;
  const ct = Math.cos(theta), st = Math.sin(theta);
  const x2 = ct * x1 - st * v.z, z2 = st * x1 + ct * v.z;
  const cZ = Math.cos(z), sZ = Math.sin(z);
  return { x: x2 * cZ - y1 * sZ, y: x2 * sZ + y1 * cZ, z: z2 };
}

/** Mean equator of date → true equator of date (nutation). */
export function nutateEquatorial(v, T) {
  const eps = meanObliquity(T) * RAD;
  const { dpsi, deps } = nutation(T);
  const dp = dpsi * RAD, e2 = eps + deps * RAD;
  // to the ecliptic of date, rotate by Δψ about the pole, back with ε + Δε
  const ce = Math.cos(eps), se = Math.sin(eps);
  const ex = v.x, ey = ce * v.y + se * v.z, ez = -se * v.y + ce * v.z;
  const cp = Math.cos(dp), sp = Math.sin(dp);
  const lx = ex * cp - ey * sp, ly = ex * sp + ey * cp;
  const c2 = Math.cos(e2), s2 = Math.sin(e2);
  return { x: lx, y: c2 * ly - s2 * ez, z: s2 * ly + c2 * ez };
}

/** Equatorial J2000 vector → true equator and equinox of date for a UTC Julian Date. */
export function equatorialOfDate(v, jd) {
  const T = centuriesTT(jd);
  return nutateEquatorial(precessJ2000(v, T), T);
}

/** Right ascension / declination (degrees) and length of a vector. */
export function toRaDec(v) {
  const r = Math.hypot(v.x, v.y, v.z);
  return { ra: mod360(Math.atan2(v.y, v.x) / DEG), dec: Math.asin(v.z / r) / DEG, r };
}

/** Angular separation of two points (degrees; Meeus 17.1, in the numerically stable form). */
export function angularSeparation(ra1, dec1, ra2, dec2) {
  const a1 = ra1 * RAD, d1 = dec1 * RAD, a2 = ra2 * RAD, d2 = dec2 * RAD;
  const sdr = Math.sin((a1 - a2) / 2), sdd = Math.sin((d1 - d2) / 2);
  const h = sdd * sdd + Math.cos(d1) * Math.cos(d2) * sdr * sdr;
  return 2 * Math.asin(Math.min(1, Math.sqrt(h))) / DEG;
}

// ---------------------------------------------------------------------------
// Horizontal coordinates, refraction, parallax
// ---------------------------------------------------------------------------

/**
 * Altitude and azimuth (degrees) from local hour angle H, declination and latitude (Meeus ch. 13).
 * Azimuth is measured from North through East (Meeus' own azimuth is from the South: add 180°).
 */
export function equatorialToHorizontal(H, dec, lat) {
  const h = H * RAD, d = dec * RAD, p = lat * RAD;
  const sinAlt = Math.sin(p) * Math.sin(d) + Math.cos(p) * Math.cos(d) * Math.cos(h);
  const az = Math.atan2(Math.sin(h), Math.cos(h) * Math.sin(p) - Math.tan(d) * Math.cos(p)) / DEG + 180;
  return { alt: Math.asin(Math.max(-1, Math.min(1, sinAlt))) / DEG, az: mod360(az) };
}

/**
 * Atmospheric refraction in degrees for a TRUE (airless) altitude h (degrees), 1010 mbar /
 * 10 °C (Saemundsson, Meeus 16.4). Fades to zero below −1° where the formula is meaningless.
 */
export function refractionFromTrue(h) {
  if (h < -1.9) return 0;
  const hh = Math.max(h, -1);
  const R = (1.02 / Math.tan((hh + 10.3 / (hh + 5.11)) * RAD) + 0.0019279) / 60;
  return h >= -1 ? R : R * (h + 1.9) / 0.9;
}

/** Refraction in degrees for an APPARENT (observed) altitude h (degrees); Bennett's formula. */
export function refractionFromApparent(h) {
  if (h < -1.9) return 0;
  const hh = Math.max(h, -1);
  return (1 / Math.tan((hh + 7.31 / (hh + 4.4)) * RAD) - 0.06 * Math.sin((14.7 * hh / 60 + 13) * RAD)) / 60;
}

/** Apparent (observed) altitude for a true altitude, degrees. */
export const apparentAltitude = (h) => h + refractionFromTrue(h);

/** ρ sin φ′ and ρ cos φ′ for an observer at geodetic latitude φ (deg) and elevation (m) — Meeus ch. 11. */
export function observerGeocentric(lat, elevation = 0) {
  const p = lat * RAD;
  const u = Math.atan(0.99664719 * Math.tan(p));
  const hh = elevation / 6378140;
  return {
    rhoSin: 0.99664719 * Math.sin(u) + hh * Math.sin(p),
    rhoCos: Math.cos(u) + hh * Math.cos(p),
  };
}

/**
 * Topocentric hour angle and declination (degrees) from geocentric ones (Meeus ch. 40).
 * `distAU`: distance of the body from the geocentre; `H`: geocentric local hour angle.
 */
export function topocentricEquatorial(H, dec, distAU, lat, elevation = 0) {
  const { rhoSin, rhoCos } = observerGeocentric(lat, elevation);
  const sinPi = Math.sin(SOLAR_PARALLAX_ARCSEC * ARCSEC) / distAU;
  const h = H * RAD, d = dec * RAD;
  const den = Math.cos(d) - rhoCos * sinPi * Math.cos(h);
  const dAlpha = Math.atan2(-rhoCos * sinPi * Math.sin(h), den);
  const dec2 = Math.atan2((Math.sin(d) - rhoSin * sinPi) * Math.cos(dAlpha), den);
  return { H: H - dAlpha / DEG, dec: dec2 / DEG, dRa: dAlpha / DEG };
}

// ---------------------------------------------------------------------------
// Apparent places of the Sun, Moon and planets
// ---------------------------------------------------------------------------

export const SKY_BODY_IDS = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];

const posCache = new Map();
function positionsAt(jd) {
  let p = posCache.get(jd);
  if (!p) {
    if (posCache.size > 96) posCache.delete(posCache.keys().next().value);
    p = computePositions(jd);
    posCache.set(jd, p);
  }
  return p;
}

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const len = (v) => Math.hypot(v.x, v.y, v.z);

/** Heliocentric ecliptic position of a body (the Moon: of its centre; the Sun: the origin). */
function helio(id, jd) {
  const p = positionsAt(jd);
  return id === 'sun' ? { x: 0, y: 0, z: 0 } : p[id];
}

/**
 * Apparent geocentric place of a body, referred to the true equator and equinox of date:
 * { ra, dec (deg), dist (AU, geometric at light-time), vec: unit J2000 equatorial direction
 * (astrometric incl. aberration), helioDist (AU), earthSun (AU) }.
 */
export function apparentGeocentric(id, jd) {
  const now = positionsAt(jd);
  const earth = now.earth;
  // light-time iteration for the target
  let tau = 0, g;
  for (let i = 0; i < 3; i++) {
    const tgt = id === 'moon' ? now.moon : helio(id, jd - tau);
    g = sub(tgt, earth);
    if (id === 'moon') break; // 1.3 s: negligible
    tau = len(g) / C_AU_DAY;
  }
  const dist = len(g);
  // annual aberration from Earth's velocity (central difference, AU/day)
  const h = 0.01;
  const e1 = positionsAt(jd + h).earth, e0 = positionsAt(jd - h).earth;
  const vel = { x: (e1.x - e0.x) / (2 * h), y: (e1.y - e0.y) / (2 * h), z: (e1.z - e0.z) / (2 * h) };
  const u = { x: g.x / dist + vel.x / C_AU_DAY, y: g.y / dist + vel.y / C_AU_DAY, z: g.z / dist + vel.z / C_AU_DAY };
  const un = len(u);
  const unit = eclipticToEquatorial({ x: u.x / un, y: u.y / un, z: u.z / un });
  const of = equatorialOfDate(unit, jd);
  const { ra, dec } = toRaDec(of);
  const sunHelio = id === 'sun' ? 0 : len(helio(id, jd - tau));
  return { ra, dec, dist, vec: unit, helioDist: sunHelio, earthSun: len(earth) };
}

/** Semi-diameter of a body in degrees (Sun, Moon; planets use IAU equatorial radii). */
const RADII_KM = { sun: SUN_RADIUS_KM, moon: MOON_RADIUS_KM, mercury: 2439.7, venus: 6051.8, mars: 3396.2, jupiter: 71492, saturn: 60268, uranus: 25559, neptune: 24764, pluto: 1188.3 };
export function semiDiameter(id, distAU) {
  return Math.asin(RADII_KM[id] / (distAU * AU_KM)) / DEG;
}

/**
 * Position of a body in the sky of an observer.
 * @param {string} id        'sun' | 'moon' | 'mercury' … 'pluto'
 * @param {number} jd        UTC Julian Date
 * @param {{lat:number, lon:number, elevation?:number}} obs   degrees (lon east +), metres
 * @returns {{ra, dec, H, alt, az, altApparent, distAU, semiDiameter, h0, parallax}}
 *   ra/dec geocentric apparent; H geocentric hour angle; alt/az geometric topocentric (airless);
 *   altApparent includes refraction; h0 is the altitude of the centre at rise/set for this body.
 */
export function skyPosition(id, jd, obs) {
  const g = apparentGeocentric(id, jd);
  const lst = apparentSiderealTime(jd) + obs.lon;
  const H = wrap180(lst - g.ra);
  const topo = topocentricEquatorial(H, g.dec, g.dist, obs.lat, obs.elevation || 0);
  const { alt, az } = equatorialToHorizontal(topo.H, topo.dec, obs.lat);
  const sd = id === 'sun' || id === 'moon' ? semiDiameter(id, g.dist) : 0;
  return {
    ra: g.ra, dec: g.dec, H, alt, az, altApparent: apparentAltitude(alt),
    distAU: g.dist, semiDiameter: sd, h0: H0_STAR - sd,
    parallax: Math.asin(EARTH_EQ_RADIUS_KM / (g.dist * AU_KM)) / DEG,
  };
}

// ---------------------------------------------------------------------------
// Rise, transit, set
// ---------------------------------------------------------------------------

/**
 * Times (UTC JD) at which `f(jd)` crosses zero in [jd0, jd1], by sampling every `step` days
 * and bisecting to ~1 s. Returns [{jd, rising}] in time order (`rising`: f goes − → +).
 */
export function findCrossings(f, jd0, jd1, step = 1 / 72) {
  const out = [];
  let a = jd0, fa = f(a);
  for (let t = jd0; t < jd1;) {
    const b = Math.min(t + step, jd1), fb = f(b);
    if ((fa < 0) !== (fb < 0) && fa !== fb) {
      let lo = a, hi = b, flo = fa;
      for (let i = 0; i < 40 && hi - lo > 0.5 / 86400; i++) {
        const mid = (lo + hi) / 2, fm = f(mid);
        if ((fm < 0) === (flo < 0)) { lo = mid; flo = fm; } else hi = mid;
      }
      out.push({ jd: (lo + hi) / 2, rising: fb > fa });
    }
    a = b; fa = fb; t = b;
  }
  return out;
}

/**
 * Rise, upper transit and set of a body between jd0 and jd1.
 * h0 defaults to the standard altitude for the body (centre at −0.5667° for stars and planets;
 * Sun and Moon: upper limb on the refracted horizon, i.e. −0.5667° − semi-diameter).
 * @returns {{rise: number|null, set: number|null, transit: number|null, transitAlt: number|null,
 *            status: 'normal'|'circumpolar'|'never'}}
 */
export function riseTransitSet(id, obs, jd0, jd1, { h0 } = {}) {
  const alt = (jd) => { const s = skyPosition(id, jd, obs); return s.alt - (h0 ?? s.h0); };
  const cross = findCrossings(alt, jd0, jd1, id === 'moon' ? 1 / 96 : 1 / 72);
  const rise = cross.find((c) => c.rising)?.jd ?? null;
  const set = cross.find((c) => !c.rising)?.jd ?? null;
  // transit: geocentric hour angle passing through 0 from negative to positive
  const Hf = (jd) => skyPosition(id, jd, obs).H;
  let transit = null;
  {
    const step = 1 / 48;
    let a = jd0, Ha = Hf(a);
    for (let t = jd0; t < jd1 && transit === null;) {
      const b = Math.min(t + step, jd1), Hb = Hf(b);
      if (Ha < 0 && Hb >= 0 && Hb - Ha < 180) {
        let lo = a, hi = b;
        for (let i = 0; i < 40 && hi - lo > 0.5 / 86400; i++) {
          const mid = (lo + hi) / 2;
          if (Hf(mid) < 0) lo = mid; else hi = mid;
        }
        transit = (lo + hi) / 2;
      }
      a = b; Ha = Hb; t = b;
    }
  }
  const transitAlt = transit === null ? null : skyPosition(id, transit, obs).alt;
  let status = 'normal';
  if (rise === null && set === null) status = alt(jd0) > 0 ? 'circumpolar' : 'never';
  return { rise, set, transit, transitAlt, status };
}

/**
 * Sun altitude crossings for twilight: for each limit (degrees, e.g. −6) the moment the
 * Sun's centre goes down through it (`dusk`) and up through it (`dawn`) between jd0 and jd1.
 */
export function twilightTimes(obs, jd0, jd1, limits = [-0.8333, -6, -12, -18]) {
  return limits.map((limit) => {
    const c = findCrossings((jd) => skyPosition('sun', jd, obs).alt - limit, jd0, jd1, 1 / 72);
    return { limit, dawn: c.find((x) => x.rising)?.jd ?? null, dusk: c.find((x) => !x.rising)?.jd ?? null };
  });
}

// ---------------------------------------------------------------------------
// Magnitudes and phases
// ---------------------------------------------------------------------------

const poly = (a, x) => a.reduceRight((s, c) => s * x + c, 0);

/** Phase angle (degrees) Sun–body–Earth from the three distances. */
export function phaseAngle(r, delta, R) {
  const c = (r * r + delta * delta - R * R) / (2 * r * delta);
  return Math.acos(Math.max(-1, Math.min(1, c))) / DEG;
}

/**
 * Apparent visual magnitude (Mallama & Hilton 2018 for the planets; Allen for the Moon; the Sun
 * from its absolute magnitude). Saturn includes the ring-tilt term. Pluto: H = −1.0 (rough).
 */
export function apparentMagnitude(id, jd) {
  const g = apparentGeocentric(id, jd);
  const R = g.earthSun, d = g.dist, r = g.helioDist;
  if (id === 'sun') return -26.74 + 5 * Math.log10(R);
  if (id === 'moon') {
    const a = moonPhase(jd).phaseAngle;
    return -12.73 + 0.026 * a + 4e-9 * a ** 4 + 5 * Math.log10(d * AU_KM / 384400);
  }
  const a = phaseAngle(r, d, R);
  const dist = 5 * Math.log10(r * d);
  switch (id) {
    case 'mercury': return -0.613 + poly([0, 6.3280e-2, -1.6336e-3, 3.3644e-5, -3.4265e-7, 1.6893e-9, -3.0334e-12], a) + dist;
    case 'venus':
      return (a < 163.7 ? -4.384 + poly([0, -1.044e-3, 3.687e-4, -2.814e-6, 8.938e-9], a)
        : 236.05828 - 2.81914 * a + 8.39034e-3 * a * a) + dist;
    case 'mars': return (a <= 50 ? -1.601 + 0.02267 * a - 0.0001302 * a * a : -0.367 - 0.02573 * a + 0.0003445 * a * a) + dist;
    case 'jupiter': {
      if (a <= 12) return -9.395 - 3.7e-4 * a + 6.16e-4 * a * a + dist;
      const p = a / 180;
      return -9.428 - 2.5 * Math.log10(1 - 1.507 * p - 0.363 * p * p - 0.062 * p ** 3 + 2.809 * p ** 4 - 1.876 * p ** 5) + dist;
    }
    case 'saturn': {
      // sub-Earth latitude on Saturn: angle of the Earth direction above the ring plane
      const pole = orientation('saturn', jd).pole;
      const e = positionsAt(jd).earth, s = positionsAt(jd).saturn;
      const v = sub(e, s), n = len(v);
      const sinB = Math.abs((v.x * pole.x + v.y * pole.y + v.z * pole.z) / n);
      return -8.914 - 1.825 * sinB + 0.026 * a - 0.378 * sinB * Math.exp(-2.25 * a) + dist;
    }
    case 'uranus': return -7.110 + 6.587e-3 * a + 1.045e-4 * a * a + dist;
    case 'neptune': return -7.00 + 7.944e-3 * a + 9.617e-5 * a * a + dist;
    case 'pluto': return -1.0 + dist;
    default: return NaN;
  }
}

/** Compass phase names, eight equal bins of the lunar cycle. */
export const MOON_PHASE_NAMES = ['New Moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full Moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'];

/**
 * Phase of the Moon.
 * @returns {{fraction: number, cycle: number, phaseAngle: number, elongation: number,
 *            name: string, waxing: boolean, brightLimbAngle: number}}
 *   fraction: illuminated fraction 0–1 (Meeus 48.1); cycle: 0 new → 0.5 full → 1;
 *   brightLimbAngle: position angle of the bright limb, degrees from celestial north through
 *   east (Meeus 48.5).
 */
export function moonPhase(jd) {
  const p = positionsAt(jd);
  const m = p.moonGeo; // geocentric Moon, ecliptic J2000
  const sun = { x: -p.earth.x, y: -p.earth.y, z: -p.earth.z };
  const Rs = len(sun), D = len(m);
  const cosPsi = (m.x * sun.x + m.y * sun.y + m.z * sun.z) / (Rs * D);
  const psi = Math.acos(Math.max(-1, Math.min(1, cosPsi)));
  const i = Math.atan2(Rs * Math.sin(psi), D - Rs * cosPsi);
  const lm = Math.atan2(m.y, m.x) / DEG, ls = Math.atan2(sun.y, sun.x) / DEG;
  const cycle = mod360(lm - ls) / 360;
  const me = toRaDec(eclipticToEquatorial(m)), se = toRaDec(eclipticToEquatorial(sun));
  const da = (se.ra - me.ra) * RAD, d0 = se.dec * RAD, d1 = me.dec * RAD;
  const chi = mod360(Math.atan2(Math.cos(d0) * Math.sin(da), Math.sin(d0) * Math.cos(d1) - Math.cos(d0) * Math.sin(d1) * Math.cos(da)) / DEG);
  return {
    fraction: (1 + Math.cos(i)) / 2,
    cycle,
    phaseAngle: i / DEG,
    elongation: psi / DEG,
    name: MOON_PHASE_NAMES[Math.floor(((cycle + 1 / 16) % 1) * 8)],
    waxing: cycle < 0.5,
    brightLimbAngle: chi,
  };
}

/**
 * Matrix (row-major, 9 numbers) taking equatorial J2000 vectors to the local horizontal frame
 * with axes (East, Up, South) — a right-handed frame, so a camera looking along −z faces North.
 * Includes precession, nutation and the local apparent sidereal time.
 */
export function equatorialToHorizontalMatrix(jd, lat, lon) {
  const cols = [{ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }].map((b) => {
    const e = equatorialOfDate(b, jd);
    const th = (apparentSiderealTime(jd) + lon) * RAD;
    const X = e.x * Math.cos(th) + e.y * Math.sin(th);
    const Y = e.x * Math.sin(th) - e.y * Math.cos(th); // towards the west
    const Z = e.z;
    const p = lat * RAD;
    return [-Y, X * Math.cos(p) + Z * Math.sin(p), X * Math.sin(p) - Z * Math.cos(p)];
  });
  // cols[j] is the image of basis vector j: rows are East, Up, South
  return [
    cols[0][0], cols[1][0], cols[2][0],
    cols[0][1], cols[1][1], cols[2][1],
    cols[0][2], cols[1][2], cols[2][2],
  ];
}

/** Unit vector (East, Up, South) of an altitude / azimuth (degrees, azimuth from North through East). */
export function horizontalToVector(alt, az) {
  const h = alt * RAD, a = az * RAD;
  return { x: Math.sin(a) * Math.cos(h), y: Math.sin(h), z: -Math.cos(a) * Math.cos(h) };
}

/** Compass point (N, NNE, …) for an azimuth in degrees. */
export function compassPoint(az) {
  const pts = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return pts[Math.round(mod360(az) / 22.5) % 16];
}
