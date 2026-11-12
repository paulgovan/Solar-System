// Lunar phases and eclipses.
//
// J. Meeus, Astronomical Algorithms (2nd ed.):
//   chapter 49 — times of new and full Moon (accuracy a few seconds over centuries),
//   chapter 54 — eclipse conditions at each syzygy: γ (least distance of the shadow
//                axis from Earth's centre, in Earth radii), u (umbral radius on the
//                fundamental plane), type, magnitude and time of maximum eclipse.
// Times returned as `jdTD` are Terrestrial (Dynamical) Time; `jd` is UTC via ΔT.

import { DEG, AU_KM, OBLIQUITY_J2000 } from './constants.js';
import { deltaT } from './time.js';
import { orientation } from './rotation.js';

export const SYNODIC_MONTH = 29.530588861;
const K_EPOCH = 2451550.09766; // JDE of the mean new Moon with k = 0 (2000 Jan 6)

/** Lunation number k (fractional) for a Julian Date. Integer k are new Moons, k + 0.5 full Moons. */
export function lunationAt(jd) {
  return (jd - K_EPOCH) / SYNODIC_MONTH;
}

function args(k) {
  const T = k / 1236.85;
  const T2 = T * T, T3 = T2 * T, T4 = T3 * T;
  return {
    T,
    jde: K_EPOCH + SYNODIC_MONTH * k + 0.00015437 * T2 - 0.00000015 * T3 + 0.00000000073 * T4,
    E: 1 - 0.002516 * T - 0.0000074 * T2,
    M: (2.5534 + 29.1053567 * k - 0.0000014 * T2 - 0.00000011 * T3) * DEG,
    Mp: (201.5643 + 385.81693528 * k + 0.0107582 * T2 + 0.00001238 * T3 - 0.000000058 * T4) * DEG,
    F: (160.7108 + 390.67050284 * k - 0.0016118 * T2 - 0.00000227 * T3 + 0.000000011 * T4) * DEG,
    Om: (124.7746 - 1.56375588 * k + 0.0020672 * T2 + 0.00000215 * T3) * DEG,
  };
}

// Chapter 49 periodic terms for new Moon / full Moon: [coefficient, power of E, multiples of M, M′, F, Ω]
// prettier-ignore
const NEW_TERMS = [
  [-0.4072, 0, 0, 1, 0, 0], [0.17241, 1, 1, 0, 0, 0], [0.01608, 0, 0, 2, 0, 0], [0.01039, 0, 0, 0, 2, 0],
  [0.00739, 1, -1, 1, 0, 0], [-0.00514, 1, 1, 1, 0, 0], [0.00208, 2, 2, 0, 0, 0], [-0.00111, 0, 0, 1, -2, 0],
  [-0.00057, 0, 0, 1, 2, 0], [0.00056, 1, 1, 2, 0, 0], [-0.00042, 0, 0, 3, 0, 0], [0.00042, 1, 1, 0, 2, 0],
  [0.00038, 1, 1, 0, -2, 0], [-0.00024, 1, -1, 2, 0, 0], [-0.00017, 0, 0, 0, 0, 1], [-0.00007, 0, 2, 1, 0, 0],
  [0.00004, 0, 0, 2, -2, 0], [0.00004, 0, 3, 0, 0, 0], [0.00003, 0, 1, 1, -2, 0], [0.00003, 0, 0, 2, 2, 0],
  [-0.00003, 0, 1, 1, 2, 0], [0.00003, 0, -1, 1, 2, 0], [-0.00002, 0, -1, 1, -2, 0], [-0.00002, 0, 1, 3, 0, 0],
  [0.00002, 0, 0, 4, 0, 0],
];
// prettier-ignore
const FULL_TERMS = [
  [-0.40614, 0, 0, 1, 0, 0], [0.17302, 1, 1, 0, 0, 0], [0.01614, 0, 0, 2, 0, 0], [0.01043, 0, 0, 0, 2, 0],
  [0.00734, 1, -1, 1, 0, 0], [-0.00515, 1, 1, 1, 0, 0], [0.00209, 2, 2, 0, 0, 0], [-0.00111, 0, 0, 1, -2, 0],
  [-0.00057, 0, 0, 1, 2, 0], [0.00056, 1, 1, 2, 0, 0], [-0.00042, 0, 0, 3, 0, 0], [0.00042, 1, 1, 0, 2, 0],
  [0.00038, 1, 1, 0, -2, 0], [-0.00024, 1, -1, 2, 0, 0], [-0.00017, 0, 0, 0, 0, 1], [-0.00007, 0, 2, 1, 0, 0],
  [0.00004, 0, 0, 2, -2, 0], [0.00004, 0, 3, 0, 0, 0], [0.00003, 0, 1, 1, -2, 0], [0.00003, 0, 0, 2, 2, 0],
  [-0.00003, 0, 1, 1, 2, 0], [0.00003, 0, -1, 1, 2, 0], [-0.00002, 0, -1, 1, -2, 0], [-0.00002, 0, 1, 3, 0, 0],
  [0.00002, 0, 0, 4, 0, 0],
];
// Additional planetary corrections (all phases): [A0, rate per k, coefficient]
// prettier-ignore
const PLANETARY = [
  [299.77, 0.107408, 0.000325], [251.88, 0.016321, 0.000165], [251.83, 26.651886, 0.000164],
  [349.42, 36.412478, 0.000126], [84.66, 18.206239, 0.00011], [141.74, 53.303771, 0.000062],
  [207.14, 2.453732, 0.00006], [154.84, 7.30686, 0.000056], [34.52, 27.261239, 0.000047],
  [207.19, 0.121824, 0.000042], [291.34, 1.844379, 0.00004], [161.72, 24.198154, 0.000037],
  [239.56, 25.513099, 0.000035], [331.55, 3.592518, 0.000023],
];

/**
 * True new Moon (integer k) or full Moon (k + 0.5), JDE (TT) — Meeus chapter 49.
 */
export function lunarPhaseJDE(k) {
  const frac = ((k % 1) + 1) % 1;
  if (Math.abs(frac) > 1e-9 && Math.abs(frac - 0.5) > 1e-9) throw new Error('k must be an integer (new) or half-integer (full)');
  const a = args(k);
  const terms = frac < 0.25 ? NEW_TERMS : FULL_TERMS;
  let jde = a.jde;
  const Ep = [1, a.E, a.E * a.E];
  for (const [c, e, m, mp, f, om] of terms) jde += c * Ep[e] * Math.sin(m * a.M + mp * a.Mp + f * a.F + om * a.Om);
  const T2 = a.T * a.T;
  for (let i = 0; i < PLANETARY.length; i++) {
    const [A0, rate, c] = PLANETARY[i];
    const A = A0 + rate * k + (i === 0 ? -0.009173 * T2 : 0);
    jde += c * Math.sin(A * DEG);
  }
  return jde;
}

/**
 * Eclipse at lunation k (integer: solar, half-integer: lunar), or null — Meeus chapter 54.
 * Returns {
 *   kind: 'solar' | 'lunar',
 *   type: 'total' | 'annular' | 'hybrid' | 'partial' | 'penumbral',
 *   central (solar only), jdTD, jd (UTC), k, gamma, u, magnitude,
 *   penumbralMagnitude / umbralMagnitude and semi-durations in minutes (lunar only)
 * }
 */
export function eclipseAt(k) {
  const lunar = Math.abs((((k % 1) + 1) % 1) - 0.5) < 1e-9;
  const a = args(k);
  const { E, M, Mp, F, Om, T } = a;
  if (Math.abs(Math.sin(F)) > 0.36) return null;

  const F1 = F - 0.02665 * DEG * Math.sin(Om);
  const A1 = (299.77 + 0.107408 * k - 0.009173 * T * T) * DEG;
  const s = Math.sin, c = Math.cos;

  let jde = a.jde + (lunar ? -0.4065 * s(Mp) + 0.1727 * E * s(M) : -0.4075 * s(Mp) + 0.1721 * E * s(M));
  jde += 0.0161 * s(2 * Mp) - 0.0097 * s(2 * F1) + 0.0073 * E * s(Mp - M) - 0.005 * E * s(Mp + M)
    - 0.0023 * s(Mp - 2 * F1) + 0.0021 * E * s(2 * M) + 0.0012 * s(Mp + 2 * F1) + 0.0006 * E * s(2 * Mp + M)
    - 0.0004 * s(3 * Mp) - 0.0003 * E * s(M + 2 * F1) + 0.0003 * s(A1) - 0.0002 * E * s(M - 2 * F1)
    - 0.0002 * E * s(2 * Mp - M) - 0.0002 * s(Om);

  const P = 0.207 * E * s(M) + 0.0024 * E * s(2 * M) - 0.0392 * s(Mp) + 0.0116 * s(2 * Mp)
    - 0.0073 * E * s(Mp + M) + 0.0067 * E * s(Mp - M) + 0.0118 * s(2 * F1);
  const Q = 5.2207 - 0.0048 * E * c(M) + 0.002 * E * c(2 * M) - 0.3299 * c(Mp)
    - 0.006 * E * c(Mp + M) + 0.0041 * E * c(Mp - M);
  const W = Math.abs(c(F1));
  const gamma = (P * c(F1) + Q * s(F1)) * (1 - 0.0048 * W);
  const u = 0.0059 + 0.0046 * E * c(M) - 0.0182 * c(Mp) + 0.0004 * c(2 * Mp) - 0.0005 * c(M + Mp);
  const g = Math.abs(gamma);
  const base = { k, jdTD: jde, jd: jde - deltaT(jde) / 86400, gamma, u };

  if (lunar) {
    const penumbralMagnitude = (1.5573 + u - g) / 0.545;
    const umbralMagnitude = (1.0128 - u - g) / 0.545;
    if (penumbralMagnitude <= 0) return null;
    const type = umbralMagnitude >= 1 ? 'total' : umbralMagnitude > 0 ? 'partial' : 'penumbral';
    const n = 0.5458 + 0.04 * c(Mp);
    const semi = (r) => (r > g ? (60 / n) * Math.sqrt(r * r - g * g) : 0);
    return {
      ...base, kind: 'lunar', type,
      magnitude: type === 'penumbral' ? penumbralMagnitude : umbralMagnitude,
      penumbralMagnitude, umbralMagnitude,
      semiDuration: { penumbral: semi(1.5573 + u), partial: semi(1.0128 - u), total: semi(0.4678 - u) },
    };
  }

  if (g > 1.5433 + u) return null;
  let type;
  let central = false;
  if (g < 0.9972) {
    central = true;
    if (u < 0) type = 'total';
    else if (u > 0.0047) type = 'annular';
    else type = u < 0.00464 * Math.sqrt(1 - gamma * gamma) ? 'hybrid' : 'annular';
  } else if (g < 0.9972 + Math.abs(u)) {
    type = u < 0 ? 'total' : 'annular'; // non-central: the axis misses Earth but the shadow cone touches it
  } else {
    type = 'partial';
  }
  const magnitude = type === 'partial' ? (1.5433 + u - g) / (0.5461 + 2 * u) : null;
  return { ...base, kind: 'solar', type, central, magnitude };
}

/** All eclipses with time of maximum between two UTC Julian Dates, in time order. */
export function findEclipses(jdStart, jdEnd) {
  const out = [];
  const k0 = Math.floor(lunationAt(jdStart)) - 1;
  const k1 = Math.ceil(lunationAt(jdEnd)) + 1;
  for (let k = k0; k <= k1; k++) {
    for (const kk of [k, k + 0.5]) {
      const e = eclipseAt(kk);
      if (e && e.jd >= jdStart && e.jd <= jdEnd) out.push(e);
    }
  }
  return out;
}

/** The `before` most recent eclipses up to jd and the `after` next ones after it. */
export function eclipsesAround(jd, before = 3, after = 5) {
  const span = 200; // days; eclipse seasons are ~173 days apart, so this always holds ≥ 2 eclipses
  let prev = [];
  for (let w = 1; prev.length < before && w < 40; w++) prev = findEclipses(jd - w * span, jd);
  let next = [];
  for (let w = 1; next.length < after && w < 40; w++) next = findEclipses(jd + 1e-9, jd + w * span);
  return { previous: prev.slice(-before), next: next.slice(0, after) };
}

// ---------------------------------------------------------------------------
// Shadow geometry from true positions (heliocentric AU, Sun at the origin).
// Used to drive the eclipse shader uniforms and the info panel.
// ---------------------------------------------------------------------------
export const SUN_RADIUS_KM = 695700;
export const EARTH_RADIUS_KM = 6371.0;
export const MOON_RADIUS_KM = 1737.4;
/** Earth's shadow is ~2% larger than geometry predicts because of its atmosphere. */
export const SHADOW_ENLARGEMENT = 1.02;

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const len = (a) => Math.hypot(a.x, a.y, a.z);

/** Fraction of a disk of angular radius a hidden by a disk of angular radius b at separation d (radians). */
export function discCover(a, b, d) {
  if (d >= a + b) return 0;
  if (d <= Math.abs(b - a)) return b >= a ? 1 : (b * b) / (a * a);
  const a2 = a * a, b2 = b * b, d2 = d * d;
  const k1 = Math.acos(Math.min(1, Math.max(-1, (d2 + a2 - b2) / (2 * d * a))));
  const k2 = Math.acos(Math.min(1, Math.max(-1, (d2 + b2 - a2) / (2 * d * b))));
  const k3 = Math.sqrt(Math.max(0, (a + b - d) * (d + a - b) * (d - a + b) * (d + a + b)));
  return Math.min(1, Math.max(0, (a2 * k1 + b2 * k2 - 0.5 * k3) / (Math.PI * a2)));
}

/**
 * How much of the Sun is hidden, seen from point p, by a sphere of radius occKm at occ.
 * Positions heliocentric in AU. Returns { cover 0…1, kind: null | 'partial' | 'total' | 'annular' }.
 */
export function sunCover(p, occ, occKm) {
  const toO = sub(occ, p), toS = { x: -p.x, y: -p.y, z: -p.z };
  const dO = len(toO), dS = len(toS);
  if (dot(toO, toS) <= 0 || dO >= dS) return { cover: 0, kind: null };
  const cr = { x: toO.y * toS.z - toO.z * toS.y, y: toO.z * toS.x - toO.x * toS.z, z: toO.x * toS.y - toO.y * toS.x };
  const d = Math.atan2(len(cr), dot(toO, toS));
  const a = Math.asin(SUN_RADIUS_KM / (dS * AU_KM));
  const b = Math.asin(Math.min(1, occKm / (dO * AU_KM)));
  const cover = discCover(a, b, d);
  let kind = null;
  if (cover > 0) kind = d <= b - a ? 'total' : d <= a - b ? 'annular' : 'partial';
  return { cover, kind };
}

/**
 * Current eclipse circumstances from heliocentric Earth and Moon positions (AU).
 * solar: deepest point of the Moon's shadow on Earth's surface (cover, kind, point);
 * lunar: Sun as seen from the Moon's centre, hidden by Earth (enlarged by its atmosphere).
 */
export function eclipseCircumstances(earth, moon) {
  const R = EARTH_RADIUS_KM / AU_KM;
  // Shadow axis: from the Sun (origin) through the Moon. Closest point of the axis to Earth's centre:
  const u = { x: moon.x / len(moon), y: moon.y / len(moon), z: moon.z / len(moon) };
  const t = dot(sub(earth, moon), u);
  const onAxis = { x: moon.x + u.x * t, y: moon.y + u.y * t, z: moon.z + u.z * t };
  const off = sub(onAxis, earth);
  const dPerp = len(off);
  let point;
  if (t > 0 && dPerp < R) {
    // the axis pierces Earth: take the entry point facing the Moon
    const back = Math.sqrt(R * R - dPerp * dPerp);
    point = { x: onAxis.x - u.x * back, y: onAxis.y - u.y * back, z: onAxis.z - u.z * back };
  } else {
    const k = R / (dPerp || 1);
    point = { x: earth.x + off.x * k, y: earth.y + off.y * k, z: earth.z + off.z * k };
  }
  const solar = t > 0 ? { ...sunCover(point, moon, MOON_RADIUS_KM), point } : { cover: 0, kind: null, point };
  const lunar = sunCover(moon, earth, EARTH_RADIUS_KM * SHADOW_ENLARGEMENT);
  return { solar, lunar };
}

/**
 * Geographic latitude / east longitude (degrees) of a geocentric ecliptic-J2000 vector,
 * using Earth's IAU orientation for the UTC Julian Date jd. (Spherical Earth.)
 */
export function geographic(v, jd) {
  const { alpha, delta, W } = orientation('earth', jd);
  const c = Math.cos(OBLIQUITY_J2000), s = Math.sin(OBLIQUITY_J2000);
  const e = { x: v.x, y: c * v.y - s * v.z, z: s * v.y + c * v.z }; // ecliptic → equatorial
  const P = { x: Math.cos(delta) * Math.cos(alpha), y: Math.cos(delta) * Math.sin(alpha), z: Math.sin(delta) };
  const Q = { x: -Math.sin(alpha), y: Math.cos(alpha), z: 0 };
  const PxQ = { x: P.y * Q.z - P.z * Q.y, y: P.z * Q.x - P.x * Q.z, z: P.x * Q.y - P.y * Q.x };
  const X = { x: Math.cos(W) * Q.x + Math.sin(W) * PxQ.x, y: Math.cos(W) * Q.y + Math.sin(W) * PxQ.y, z: Math.cos(W) * Q.z + Math.sin(W) * PxQ.z };
  const Y = { x: P.y * X.z - P.z * X.y, y: P.z * X.x - P.x * X.z, z: P.x * X.y - P.y * X.x };
  const r = len(e);
  return { lat: Math.asin(dot(e, P) / r) / DEG, lon: Math.atan2(dot(e, Y), dot(e, X)) / DEG };
}
