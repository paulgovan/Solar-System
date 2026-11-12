// Galilean moons of Jupiter: J. Meeus, Astronomical Algorithms (2nd ed.), ch. 44,
// "higher accuracy" method (after Lieske's E5 theory). Geometric jovicentric
// positions, no light-time: the satellites' longitudes, latitudes and radius
// vectors in Jupiter's equatorial frame are rotated into the ecliptic of date
// via Jupiter's orbit (Meeus' steps with the fictitious fifth satellite), then
// precessed to the J2000 ecliptic.

import { DEG, J2000, AU_KM } from './constants.js';

export const GALILEAN = ['io', 'europa', 'ganymede', 'callisto'];
// Unit of Meeus' radius vectors. Nominally Jupiter's equatorial radius (71,398 km);
// calibrated +0.028% against JPL Horizons (JUP365), which removes a uniform distance bias.
const JUPITER_EQ_RADIUS_KM = 71418;

const sin = (deg) => Math.sin(deg * DEG);
const cos = (deg) => Math.cos(deg * DEG);

/**
 * Jupiter-equatorial longitude, latitude (deg) and radius (Jupiter radii) of the four
 * satellites, longitudes referred to the mean equinox of date. `jde` is a TT/TDB Julian Date.
 */
export function galileanLBR(jde) {
  const t = jde - 2443000.5;
  const l1 = 106.07719 + 203.48895579 * t;
  const l2 = 175.73161 + 101.374724735 * t;
  const l3 = 120.55883 + 50.317609207 * t;
  const l4 = 84.44459 + 21.571071177 * t;
  const p1 = 97.0881 + 0.16138586 * t;
  const p2 = 154.8663 + 0.04726307 * t;
  const p3 = 188.184 + 0.00712734 * t;
  const p4 = 335.2868 + 0.00184 * t;
  const w1 = 312.3346 - 0.13279386 * t;
  const w2 = 100.4411 - 0.03263064 * t;
  const w3 = 119.1942 - 0.00717703 * t;
  const w4 = 322.6186 - 0.00175934 * t;
  const Gam = 0.33033 * sin(163.679 + 0.0010512 * t) + 0.03439 * sin(34.486 - 0.0161731 * t);
  const Phi = 199.6766 + 0.1737919 * t;
  let psi = 316.5182 - 0.00000208 * t;
  const G = 30.23756 + 0.0830925701 * t + Gam;
  const G_ = 31.97853 + 0.0334597339 * t;
  const Pi = 13.469942;

  const S1 = 0.47259 * sin(2 * (l1 - l2)) - 0.03478 * sin(p3 - p4) + 0.01081 * sin(l2 - 2 * l3 + p3)
    + 0.00738 * sin(Phi) + 0.00713 * sin(l2 - 2 * l3 + p2) - 0.00674 * sin(p1 + p3 - 2 * Pi - 2 * G)
    + 0.00666 * sin(l2 - 2 * l3 + p4) + 0.00445 * sin(l1 - p3) - 0.00354 * sin(l1 - l2)
    - 0.00317 * sin(2 * psi - 2 * Pi) + 0.00265 * sin(l1 - p4) - 0.00186 * sin(G)
    + 0.00162 * sin(p2 - p3) + 0.00158 * sin(4 * (l1 - l2)) - 0.00155 * sin(l1 - l3)
    - 0.00138 * sin(psi + w3 - 2 * Pi - 2 * G) - 0.00115 * sin(2 * (l1 - 2 * l2 + w2))
    + 0.00089 * sin(p2 - p4) + 0.00085 * sin(l1 + p3 - 2 * Pi - 2 * G) + 0.00083 * sin(w2 - w3)
    + 0.00053 * sin(psi - w2);
  const S2 = 1.06476 * sin(2 * (l2 - l3)) + 0.04256 * sin(l1 - 2 * l2 + p3) + 0.03581 * sin(l2 - p3)
    + 0.02395 * sin(l1 - 2 * l2 + p4) + 0.01984 * sin(l2 - p4) - 0.01778 * sin(Phi)
    + 0.01654 * sin(l2 - p2) + 0.01334 * sin(l2 - 2 * l3 + p2) + 0.01294 * sin(p3 - p4)
    - 0.01142 * sin(l2 - l3) - 0.01057 * sin(G) - 0.00775 * sin(2 * (psi - Pi))
    + 0.00524 * sin(2 * (l1 - l2)) - 0.0046 * sin(l1 - l3) + 0.00316 * sin(psi - 2 * G + w3 - 2 * Pi)
    - 0.00203 * sin(p1 + p3 - 2 * Pi - 2 * G) + 0.00146 * sin(psi - w3) - 0.00145 * sin(2 * G)
    + 0.00125 * sin(psi - w4) - 0.00115 * sin(l1 - 2 * l3 + p3) - 0.00094 * sin(2 * (l2 - w2))
    + 0.00086 * sin(2 * (l1 - 2 * l2 + w2)) - 0.00086 * sin(5 * G_ - 2 * G + 52.225)
    - 0.00078 * sin(l2 - l4) - 0.00064 * sin(3 * l3 - 7 * l4 + 4 * p4) + 0.00064 * sin(p1 - p4)
    - 0.00063 * sin(l1 - 2 * l3 + p4) + 0.00058 * sin(w3 - w4) + 0.00056 * sin(2 * (psi - Pi - G))
    + 0.00056 * sin(2 * (l2 - l4)) + 0.00055 * sin(2 * (l1 - l3)) + 0.00052 * sin(3 * l3 - 7 * l4 + p3 + 3 * p4)
    - 0.00043 * sin(l1 - p3) + 0.00041 * sin(5 * (l2 - l3)) + 0.00041 * sin(p4 - Pi)
    + 0.00032 * sin(w2 - w3) + 0.00032 * sin(2 * (l3 - G - Pi));
  const S3 = 0.1649 * sin(l3 - p3) + 0.09081 * sin(l3 - p4) - 0.06907 * sin(l2 - l3)
    + 0.03784 * sin(p3 - p4) + 0.01846 * sin(2 * (l3 - l4)) - 0.0134 * sin(G)
    - 0.01014 * sin(2 * (psi - Pi)) + 0.00704 * sin(l2 - 2 * l3 + p3) - 0.0062 * sin(l2 - 2 * l3 + p2)
    - 0.00541 * sin(l3 - l4) + 0.00381 * sin(l2 - 2 * l3 + p4) + 0.00235 * sin(psi - w3)
    + 0.00198 * sin(psi - w4) + 0.00176 * sin(Phi) + 0.0013 * sin(3 * (l3 - l4))
    + 0.00125 * sin(l1 - l3) - 0.00119 * sin(5 * G_ - 2 * G + 52.225) + 0.00109 * sin(l1 - l2)
    - 0.001 * sin(3 * l3 - 7 * l4 + 4 * p4) + 0.00091 * sin(w3 - w4)
    + 0.0008 * sin(3 * l3 - 7 * l4 + p3 + 3 * p4) - 0.00075 * sin(2 * l2 - 3 * l3 + p3)
    + 0.00072 * sin(p1 + p3 - 2 * Pi - 2 * G) + 0.00069 * sin(p4 - Pi) - 0.00058 * sin(2 * l3 - 3 * l4 + p4)
    - 0.00057 * sin(l3 - 2 * l4 + p4) + 0.00056 * sin(l3 + p3 - 2 * Pi - 2 * G)
    - 0.00052 * sin(l2 - 2 * l3 + p1) - 0.0005 * sin(p2 - p3) + 0.00048 * sin(l3 - 2 * l4 + p3)
    - 0.00045 * sin(2 * l2 - 3 * l3 + p4) - 0.00041 * sin(p2 - p4) - 0.00038 * sin(2 * G)
    - 0.00037 * sin(p3 - p4 + w3 - w4) - 0.00032 * sin(3 * l3 - 7 * l4 + 2 * p3 + 2 * p4)
    + 0.0003 * sin(4 * (l3 - l4)) + 0.00029 * sin(l3 + p4 - 2 * Pi - 2 * G)
    - 0.00028 * sin(w3 + psi - 2 * Pi - 2 * G) + 0.00026 * sin(l3 - Pi - G)
    + 0.00024 * sin(l2 - 3 * l3 + 2 * l4) + 0.00021 * sin(2 * (l3 - Pi - G)) - 0.00021 * sin(l3 - p2)
    + 0.00017 * sin(2 * (l3 - p3));
  const S4 = 0.84287 * sin(l4 - p4) + 0.03431 * sin(p4 - p3) - 0.03305 * sin(2 * (psi - Pi))
    - 0.03211 * sin(G) - 0.01862 * sin(l4 - p3) + 0.01186 * sin(psi - w4)
    + 0.00623 * sin(l4 + p4 - 2 * G - 2 * Pi) + 0.00387 * sin(2 * (l4 - p4))
    - 0.00284 * sin(5 * G_ - 2 * G + 52.225) - 0.00234 * sin(2 * (psi - p4)) - 0.00223 * sin(l3 - l4)
    - 0.00208 * sin(l4 - Pi) + 0.00178 * sin(psi + w4 - 2 * p4) + 0.00134 * sin(p4 - Pi)
    + 0.00125 * sin(2 * (l4 - G - Pi)) - 0.00117 * sin(2 * G) - 0.00112 * sin(2 * (l3 - l4))
    + 0.00107 * sin(3 * l3 - 7 * l4 + 4 * p4) + 0.00102 * sin(l4 - G - Pi) + 0.00096 * sin(2 * l4 - psi - w4)
    + 0.00087 * sin(2 * (psi - w4)) - 0.00085 * sin(3 * l3 - 7 * l4 + p3 + 3 * p4)
    + 0.00085 * sin(l3 - 2 * l4 + p4) - 0.00081 * sin(2 * (l4 - psi)) + 0.00071 * sin(l4 + p4 - 2 * Pi - 3 * G)
    + 0.00061 * sin(l1 - l4) - 0.00056 * sin(psi - w3) - 0.00054 * sin(l3 - 2 * l4 + p3)
    + 0.00051 * sin(l2 - l4) + 0.00042 * sin(2 * (psi - G - Pi)) + 0.00039 * sin(2 * (p4 - w4))
    + 0.00036 * sin(psi + Pi - p4 - w4) + 0.00035 * sin(2 * G_ - G + 188.37)
    - 0.00035 * sin(l4 - p4 + 2 * Pi - 2 * psi) - 0.00032 * sin(l4 + p4 - 2 * Pi - G)
    + 0.0003 * sin(2 * G_ - 2 * G + 149.15) + 0.00029 * sin(3 * l3 - 7 * l4 + 2 * p3 + 2 * p4)
    + 0.00028 * sin(l4 - p4 + 2 * psi - 2 * Pi) - 0.00028 * sin(2 * (l4 - w4))
    - 0.00027 * sin(p3 - p4 + w3 - w4) - 0.00026 * sin(5 * G_ - 3 * G + 188.37)
    + 0.00025 * sin(w4 - w3) - 0.00025 * sin(l2 - 3 * l3 + 2 * l4) - 0.00023 * sin(3 * (l3 - l4))
    + 0.00021 * sin(2 * l4 - 2 * Pi - 3 * G) - 0.00021 * sin(2 * l3 - 3 * l4 + p4)
    + 0.00019 * sin(l4 - p4 - G) - 0.00019 * sin(2 * l4 - p3 - p4) - 0.00018 * sin(l4 - p4 + G)
    - 0.00016 * sin(l4 + p3 - 2 * Pi - 2 * G);

  const L1 = l1 + S1, L2 = l2 + S2, L3 = l3 + S3, L4 = l4 + S4;

  const B1 = Math.atan(0.0006393 * sin(L1 - w1) + 0.0001825 * sin(L1 - w2) + 0.0000329 * sin(L1 - w3)
    - 0.0000311 * sin(L1 - psi) + 0.0000093 * sin(L1 - w4) + 0.0000075 * sin(3 * L1 - 4 * l2 - 1.9927 * S1 + w2)
    + 0.0000046 * sin(L1 + psi - 2 * Pi - 2 * G));
  const B2 = Math.atan(0.0081004 * sin(L2 - w2) + 0.0004512 * sin(L2 - w3) - 0.0003284 * sin(L2 - psi)
    + 0.000116 * sin(L2 - w4) + 0.0000272 * sin(l1 - 2 * l3 + 1.0146 * S2 + w2) - 0.0000144 * sin(L2 - w1)
    + 0.0000143 * sin(L2 + psi - 2 * Pi - 2 * G) + 0.0000035 * sin(L2 - psi + G)
    - 0.0000028 * sin(l1 - 2 * l3 + 1.0146 * S2 + w3));
  const B3 = Math.atan(0.0032402 * sin(L3 - w3) - 0.0016911 * sin(L3 - psi) + 0.0006847 * sin(L3 - w4)
    - 0.0002797 * sin(L3 - w2) + 0.0000321 * sin(L3 + psi - 2 * Pi - 2 * G) + 0.0000051 * sin(L3 - psi + G)
    - 0.0000045 * sin(L3 - psi - G) - 0.0000045 * sin(L3 + psi - 2 * Pi) + 0.0000037 * sin(L3 + psi - 2 * Pi - 3 * G)
    + 0.000003 * sin(2 * l2 - 3 * L3 + 4.03 * S3 + w2) - 0.0000021 * sin(2 * l2 - 3 * L3 + 4.03 * S3 + w3));
  const B4 = Math.atan(-0.0076579 * sin(L4 - psi) + 0.0044134 * sin(L4 - w4) - 0.0005112 * sin(L4 - w3)
    + 0.0000773 * sin(L4 + psi - 2 * Pi - 2 * G) + 0.0000104 * sin(L4 - psi + G) - 0.0000102 * sin(L4 - psi - G)
    + 0.0000088 * sin(L4 + psi - 2 * Pi - 3 * G) - 0.0000038 * sin(L4 + psi - 2 * Pi - G));

  const R1 = 5.90569 * (1 - 0.0041339 * cos(2 * (l1 - l2)) - 0.0000387 * cos(l1 - p3) - 0.0000214 * cos(l1 - p4)
    + 0.000017 * cos(l1 - l2) - 0.0000131 * cos(4 * (l1 - l2)) + 0.0000106 * cos(l1 - l3)
    - 0.0000066 * cos(l1 + p3 - 2 * Pi - 2 * G));
  const R2 = 9.39657 * (1 + 0.0093848 * cos(l1 - l2) - 0.0003116 * cos(l2 - p3) - 0.0001744 * cos(l2 - p4)
    - 0.0001442 * cos(l2 - p2) + 0.0000553 * cos(l2 - l3) + 0.0000523 * cos(l1 - l3)
    - 0.000029 * cos(2 * (l1 - l2)) + 0.0000164 * cos(2 * (l2 - w2)) + 0.0000107 * cos(l1 - 2 * l3 + p3)
    - 0.0000102 * cos(l2 - p1) - 0.0000091 * cos(2 * (l1 - l3)));
  const R3 = 14.98832 * (1 - 0.0014388 * cos(l3 - p3) - 0.0007917 * cos(l3 - p4) + 0.0006342 * cos(l2 - l3)
    - 0.0001761 * cos(2 * (l3 - l4)) + 0.0000294 * cos(l3 - l4) - 0.0000156 * cos(3 * (l3 - l4))
    + 0.0000156 * cos(l1 - l3) - 0.0000153 * cos(l1 - l2) + 0.000007 * cos(2 * l2 - 3 * l3 + p3)
    - 0.0000051 * cos(l3 + p3 - 2 * Pi - 2 * G));
  const R4 = 26.36273 * (1 - 0.0073546 * cos(l4 - p4) + 0.0001621 * cos(l4 - p3) + 0.0000974 * cos(l3 - l4)
    - 0.0000543 * cos(l4 + p4 - 2 * Pi - 2 * G) - 0.0000271 * cos(2 * (l4 - p4)) + 0.0000182 * cos(l4 - Pi)
    + 0.0000177 * cos(2 * (l3 - l4)) - 0.0000167 * cos(2 * l4 - psi - w4) + 0.0000167 * cos(psi - w4)
    - 0.0000155 * cos(2 * (l4 - Pi - G)) + 0.0000142 * cos(2 * (l4 - psi)) + 0.0000105 * cos(l4 - l1)
    + 0.0000092 * cos(l2 - l4) - 0.0000089 * cos(l4 - Pi - G) - 0.0000062 * cos(l4 + p4 - 2 * Pi - 3 * G)
    + 0.0000048 * cos(2 * (l4 - w4)));

  // Longitudes above are referred to the B1950 equinox: precess in longitude to the equinox of date.
  const T0 = (jde - 2433282.423) / 36525;
  const P = 1.3966626 * T0 + 0.0003088 * T0 * T0;
  psi += P;
  return {
    psi,
    sats: [[L1 + P, B1, R1], [L2 + P, B2, R2], [L3 + P, B3, R3], [L4 + P, B4, R4]],
  };
}

// Rotation from Jupiter's equatorial frame (x toward the node ψ) to the ecliptic of date,
// through Jupiter's orbit (Meeus' steps with I, Φ = ψ − Ω, J, Ω).
function equatorToEclipticOfDate(jde, psi) {
  const T = (jde - 2415020.5) / 36525;
  const I = 3.120262 + 0.0006 * T; // Jupiter's equator on its orbit
  const Tc = (jde - J2000) / 36525;
  // Jupiter's orbit on the ecliptic of date (Meeus table 31.A)
  const Om = 100.464407 + 1.0209774 * Tc + 0.00040315 * Tc * Tc + 0.000000404 * Tc * Tc * Tc;
  const J = 1.303267 - 0.0054965 * Tc + 0.00000466 * Tc * Tc - 0.000000002 * Tc * Tc * Tc;
  const Phi = psi - Om;
  return (x, y, z) => {
    const B1 = y * cos(I) - z * sin(I), C1 = y * sin(I) + z * cos(I);
    const A2 = x * cos(Phi) - B1 * sin(Phi), B2 = x * sin(Phi) + B1 * cos(Phi);
    const B3 = B2 * cos(J) - C1 * sin(J), C3 = B2 * sin(J) + C1 * cos(J);
    return [A2 * cos(Om) - B3 * sin(Om), A2 * sin(Om) + B3 * cos(Om), C3];
  };
}

// Precession of ecliptic coordinates (Meeus 21.5–21.7 with the J2000 starting epoch),
// applied in reverse: ecliptic & equinox of date → J2000.
function dateToJ2000(jde) {
  const t = (jde - J2000) / 36525;
  const as = DEG / 3600;
  const eta = (47.0029 * t - 0.03302 * t * t + 0.00006 * t * t * t) * as;
  const Pi = 174.876384 * DEG - (869.8089 * t - 0.03536 * t * t) * as;
  const p = (5029.0966 * t + 1.11113 * t * t - 0.000006 * t * t * t) * as;
  // J2000 → date is Rz(−(Π + p)) · Rx(−η) · Rz(Π); return its transpose.
  const fwd = (v) => {
    let [x, y, z] = v;
    [x, y] = [x * Math.cos(Pi) + y * Math.sin(Pi), -x * Math.sin(Pi) + y * Math.cos(Pi)];
    [y, z] = [y * Math.cos(eta) + z * Math.sin(eta), -y * Math.sin(eta) + z * Math.cos(eta)];
    const a = Pi + p;
    return [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a), z];
  };
  const c0 = fwd([1, 0, 0]), c1 = fwd([0, 1, 0]), c2 = fwd([0, 0, 1]);
  // fwd matrix has columns c0,c1,c2; inverse = transpose
  return (v) => [
    c0[0] * v[0] + c0[1] * v[1] + c0[2] * v[2],
    c1[0] * v[0] + c1[1] * v[1] + c1[2] * v[2],
    c2[0] * v[0] + c2[1] * v[1] + c2[2] * v[2],
  ];
}

/**
 * Jovicentric positions (AU, ecliptic J2000) of Io, Europa, Ganymede, Callisto for a TT Julian Date.
 * Returns { io, europa, ganymede, callisto }.
 */
export function galileanPositions(jde) {
  const { psi, sats } = galileanLBR(jde);
  const toEcl = equatorToEclipticOfDate(jde, psi);
  const toJ2000 = dateToJ2000(jde);
  const k = JUPITER_EQ_RADIUS_KM / AU_KM;
  const out = {};
  sats.forEach(([L, B, R], i) => {
    const u = (L - psi) * DEG;
    const v = toJ2000(toEcl(R * Math.cos(u) * Math.cos(B), R * Math.sin(u) * Math.cos(B), R * Math.sin(B)));
    out[GALILEAN[i]] = { x: v[0] * k, y: v[1] * k, z: v[2] * k };
  });
  return out;
}

/** Jupiter's equatorial pole implied by the theory (unit vector, ecliptic J2000) — used by tests. */
export function galileanPole(jde) {
  const { psi } = galileanLBR(jde);
  const v = dateToJ2000(jde)(equatorToEclipticOfDate(jde, psi)(0, 0, 1));
  return { x: v[0], y: v[1], z: v[2] };
}

// ---------------------------------------------------------------------------
// Orbit provider 'galilean' (parent-relative). Orbit lines are one period of the
// theory itself, sampled uniformly in time from the current position.
// ---------------------------------------------------------------------------
import { registerOrbitProvider } from './providers.js';
import { centuriesTT } from './time.js';

/** Mean sidereal periods (days) from the theory's mean motions. */
export const GALILEAN_PERIOD = {
  io: 360 / 203.48895579, europa: 360 / 101.374724735, ganymede: 360 / 50.317609207, callisto: 360 / 21.571071177,
};

const toTT = (jd) => J2000 + centuriesTT(jd) * 36525;
let memo = { jd: NaN, pos: null };
/** Memoized galileanPositions for a UTC Julian Date (shared by position, rotation and paths). */
export function galileanAt(jd) {
  if (memo.jd !== jd) memo = { jd, pos: galileanPositions(toTT(jd)) };
  return memo.pos;
}

registerOrbitProvider('galilean', {
  relative: true,
  position: (body, jd) => galileanAt(jd)[body.id],
  path: (body, jd, segments) => {
    const P = GALILEAN_PERIOD[body.id];
    const t0 = toTT(jd);
    const points = [];
    for (let i = 0; i <= segments; i++) points.push(galileanPositions(t0 + (i / segments) * P)[body.id]);
    return { points, startJD: jd, refreshDays: 20 };
  },
  phase: (body, jd, path) => (((jd - path.startJD) / GALILEAN_PERIOD[body.id]) % 1 + 1) % 1,
});
