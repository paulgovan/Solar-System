// Planetary ephemeris based on JPL's "Keplerian Elements for Approximate
// Positions of the Major Planets" (E. M. Standish, JPL/Caltech).
// https://ssd.jpl.nasa.gov/planets/approx_pos.html
//
// All positions are heliocentric, in the J2000 ecliptic frame, in AU.

export const DEG = Math.PI / 180;
export const AU_KM = 149597870.7;
export const J2000 = 2451545.0;
const OBLIQUITY_J2000 = 23.4392911 * DEG;

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

/** Julian Date (UTC) from a JS Date. */
export function dateToJD(date) {
  return date.getTime() / 86400000 + 2440587.5;
}

export function jdToDate(jd) {
  return new Date((jd - 2440587.5) * 86400000);
}

/**
 * Approximate TT − UTC in seconds (ΔT). Coarse (tens of seconds), which is far
 * below what is visible: the fastest body, the Moon, moves ~0.5″ per second.
 */
export function deltaT(jd) {
  const y = 2000 + (jd - J2000) / 365.25;
  if (y >= 1950 && y <= 2100) {
    const t = y - 2000;
    return t < 0 ? 63.86 + 0.3345 * t + 0.0006 * t * t : 63.86 + 0.25 * t;
  }
  // Morrison & Stephenson long-term parabola
  const u = (y - 1820) / 100;
  return -20 + 32 * u * u;
}

/** Julian centuries of TT since J2000 for a UTC Julian Date. */
export function centuriesTT(jdUTC) {
  return (jdUTC + deltaT(jdUTC) / 86400 - J2000) / 36525;
}

// ---------------------------------------------------------------------------
// Orbital elements
// [a (au), e, I (deg), L (deg), varpi (deg), Omega (deg)] and rates per century
// ---------------------------------------------------------------------------

// Table 1: valid 1800 AD – 2050 AD (higher accuracy in this interval)
const TABLE1 = {
  mercury: [[0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593],
            [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081]],
  venus:   [[0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255],
            [0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418]],
  earth:   [[1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0],
            [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0]],
  mars:    [[1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891],
            [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343]],
  jupiter: [[5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909],
            [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106]],
  saturn:  [[9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448],
            [-0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794]],
  uranus:  [[19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.9542763, 74.01692503],
            [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589]],
  neptune: [[30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574],
            [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664]],
  pluto:   [[39.48211675, 0.2488273, 17.14001206, 238.92903833, 224.06891629, 110.30393684],
            [-0.00031596, 0.0000517, 0.00004818, 145.20780515, -0.04062942, -0.01183482]],
};

// Table 2a: valid 3000 BC – 3000 AD
const TABLE2 = {
  mercury: [[0.38709843, 0.20563661, 7.00559432, 252.25166724, 77.45771895, 48.33961819],
            [0.0, 0.00002123, -0.00590158, 149472.67486623, 0.15940013, -0.12214182]],
  venus:   [[0.72332102, 0.00676399, 3.39777545, 181.9797085, 131.76755713, 76.67261496],
            [-0.00000026, -0.00005107, 0.00043494, 58517.8156026, 0.05679648, -0.27274174]],
  earth:   [[1.00000018, 0.01673163, -0.00054346, 100.46691572, 102.93005885, -5.11260389],
            [-0.00000003, -0.00003661, -0.01337178, 35999.37306329, 0.3179526, -0.24123856]],
  mars:    [[1.52371243, 0.09336511, 1.85181869, -4.56813164, -23.91744784, 49.71320984],
            [0.00000097, 0.00009149, -0.00724757, 19140.29934243, 0.45223625, -0.26852431]],
  jupiter: [[5.20248019, 0.0485359, 1.29861416, 34.33479152, 14.27495244, 100.29282654],
            [-0.00002864, 0.00018026, -0.00322699, 3034.90371757, 0.18199196, 0.13024619]],
  saturn:  [[9.54149883, 0.05550825, 2.49424102, 50.07571329, 92.86136063, 113.63998702],
            [-0.00003065, -0.00032044, 0.00451969, 1222.11494724, 0.54179478, -0.25015002]],
  uranus:  [[19.18797948, 0.0468574, 0.77298127, 314.20276625, 172.43404441, 73.96250215],
            [-0.00020455, -0.0000155, -0.00180155, 428.49512595, 0.09266985, 0.05739699]],
  neptune: [[30.06952752, 0.00895439, 1.7700552, 304.22289287, 46.68158724, 131.78635853],
            [0.00006447, 0.00000818, 0.000224, 218.46515314, 0.01009938, -0.00606302]],
  pluto:   [[39.48686035, 0.24885238, 17.1410426, 238.96535011, 224.09702598, 110.30167986],
            [0.00449751, 0.00006016, 0.00000501, 145.18042903, -0.00968827, -0.00809981]],
};

// Table 2b: extra terms for the mean anomaly (b, c, s, f), Jupiter–Pluto
const TABLE2B = {
  jupiter: [-0.00012452, 0.0606406, -0.35635438, 38.35125],
  saturn:  [0.00025899, -0.13434469, 0.87320147, 38.35125],
  uranus:  [0.00058331, -0.97731848, 0.17689245, 7.67025],
  neptune: [-0.00041348, 0.68346318, -0.10162547, 7.67025],
  pluto:   [-0.01262724, 0, 0, 0],
};

export const PLANET_IDS = Object.keys(TABLE1);

/**
 * Osculating-like elements for a planet at T (Julian centuries TT from J2000).
 * Angles returned in radians. M is the mean anomaly.
 */
export function elementsAt(id, T) {
  const useTable1 = T >= -2 && T <= 0.5; // 1800–2050
  const [el, rate] = (useTable1 ? TABLE1 : TABLE2)[id];
  const a = el[0] + rate[0] * T;
  const e = el[1] + rate[1] * T;
  const I = el[2] + rate[2] * T;
  const L = el[3] + rate[3] * T;
  const varpi = el[4] + rate[4] * T;
  const Omega = el[5] + rate[5] * T;
  let M = L - varpi;
  if (!useTable1 && TABLE2B[id]) {
    const [b, c, s, f] = TABLE2B[id];
    M += b * T * T + c * Math.cos(f * T * DEG) + s * Math.sin(f * T * DEG);
  }
  return {
    a, e,
    I: I * DEG,
    Omega: Omega * DEG,
    omega: (varpi - Omega) * DEG, // argument of perihelion
    M: wrapPi(M * DEG),
  };
}

function wrapPi(x) {
  x = (x + Math.PI) % (2 * Math.PI);
  if (x < 0) x += 2 * Math.PI;
  return x - Math.PI;
}

/** Solve Kepler's equation E − e·sin(E) = M (radians) by Newton iteration. */
export function solveKepler(M, e) {
  let E = e < 0.8 ? M : Math.PI * Math.sign(M || 1);
  for (let i = 0; i < 30; i++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-12) break;
  }
  return E;
}

/** Rotate orbital-plane coordinates (x', y') into the J2000 ecliptic frame. */
function orbitalToEcliptic(xp, yp, { I, Omega, omega }) {
  const cw = Math.cos(omega), sw = Math.sin(omega);
  const cO = Math.cos(Omega), sO = Math.sin(Omega);
  const cI = Math.cos(I), sI = Math.sin(I);
  return {
    x: (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp,
    y: (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp,
    z: (sw * sI) * xp + (cw * sI) * yp,
  };
}

/** Position from elements, at eccentric anomaly E. */
export function positionFromElements(elems, E) {
  const { a, e } = elems;
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  return orbitalToEcliptic(xp, yp, elems);
}

/** Heliocentric ecliptic J2000 position {x,y,z} in AU. ("earth" = Earth–Moon barycenter.) */
export function planetPosition(id, T) {
  const el = elementsAt(id, T);
  return positionFromElements(el, solveKepler(el.M, el.e));
}

/** Sample the full orbit ellipse for drawing (array of {x,y,z}, AU). */
export function orbitPath(id, T, segments = 512) {
  const el = elementsAt(id, T);
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    // sample uniformly in eccentric anomaly — denser near perihelion is fine
    pts.push(positionFromElements(el, (i / segments) * 2 * Math.PI));
  }
  return pts;
}

/** Orbital speed (km/s) via vis-viva. */
export function orbitalSpeed(id, T) {
  const el = elementsAt(id, T);
  const p = positionFromElements(el, solveKepler(el.M, el.e));
  const r = Math.hypot(p.x, p.y, p.z);
  const GM_SUN = 1.32712440018e11; // km^3/s^2
  return Math.sqrt(GM_SUN * (2 / (r * AU_KM) - 1 / (el.a * AU_KM)));
}

// ---------------------------------------------------------------------------
// Moon — low-precision geocentric series (after P. Schlyter / Meeus),
// converted to the J2000 ecliptic by removing general precession.
// ---------------------------------------------------------------------------

const EARTH_RADIUS_KM = 6371.0;
const EARTH_MOON_MASS_RATIO = 81.3005678;

/** Geocentric ecliptic J2000 position of the Moon, AU. */
export function moonGeocentric(T) {
  const d = T * 36525 + 1.5; // days since 1999 Dec 31.0 TT
  const N = (125.1228 - 0.0529538083 * d) * DEG;
  const i = 5.1454 * DEG;
  const w = (318.0634 + 0.1643573223 * d) * DEG;
  const a = 60.2666; // Earth radii
  const e = 0.0549;
  const M = (115.3654 + 13.0649929509 * d) * DEG;

  const E = solveKepler(wrapPi(M), e);
  const xv = a * (Math.cos(E) - e);
  const yv = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const v = Math.atan2(yv, xv);
  let r = Math.hypot(xv, yv);

  const xh = r * (Math.cos(N) * Math.cos(v + w) - Math.sin(N) * Math.sin(v + w) * Math.cos(i));
  const yh = r * (Math.sin(N) * Math.cos(v + w) + Math.cos(N) * Math.sin(v + w) * Math.cos(i));
  const zh = r * Math.sin(v + w) * Math.sin(i);
  let lon = Math.atan2(yh, xh);
  let lat = Math.atan2(zh, Math.hypot(xh, yh));

  // Perturbations
  const Ms = (356.047 + 0.9856002585 * d) * DEG;
  const ws = (282.9404 + 4.70935e-5 * d) * DEG;
  const Ls = Ms + ws;
  const Lm = M + w + N;
  const D = Lm - Ls;
  const F = Lm - N;
  const s = Math.sin, c = Math.cos;
  lon += DEG * (
    -1.274 * s(M - 2 * D) + 0.658 * s(2 * D) - 0.186 * s(Ms) - 0.059 * s(2 * M - 2 * D)
    - 0.057 * s(M - 2 * D + Ms) + 0.053 * s(M + 2 * D) + 0.046 * s(2 * D - Ms)
    + 0.041 * s(M - Ms) - 0.035 * s(D) - 0.031 * s(M + Ms) - 0.015 * s(2 * F - 2 * D)
    + 0.011 * s(M - 4 * D));
  lat += DEG * (
    -0.173 * s(F - 2 * D) - 0.055 * s(M - F - 2 * D) - 0.046 * s(M + F - 2 * D)
    + 0.033 * s(F + 2 * D) + 0.017 * s(2 * M + F));
  r += -0.58 * c(M - 2 * D) - 0.46 * c(2 * D);

  // Ecliptic of date → J2000 (remove accumulated general precession in longitude)
  lon -= 1.396971 * T * DEG;

  const rAU = (r * EARTH_RADIUS_KM) / AU_KM;
  return {
    x: rAU * Math.cos(lat) * Math.cos(lon),
    y: rAU * Math.cos(lat) * Math.sin(lon),
    z: rAU * Math.sin(lat),
  };
}

/**
 * All body positions (heliocentric ecliptic J2000, AU) for a UTC Julian Date.
 * Earth is separated from the Earth–Moon barycenter using the Moon's position.
 */
export function computePositions(jd) {
  const T = centuriesTT(jd);
  const out = { sun: { x: 0, y: 0, z: 0 } };
  for (const id of PLANET_IDS) out[id] = planetPosition(id, T);
  const emb = out.earth;
  const moon = moonGeocentric(T);
  const k = 1 / (1 + EARTH_MOON_MASS_RATIO);
  out.earth = { x: emb.x - moon.x * k, y: emb.y - moon.y * k, z: emb.z - moon.z * k };
  out.moon = { x: out.earth.x + moon.x, y: out.earth.y + moon.y, z: out.earth.z + moon.z };
  out.moonGeo = moon;
  return out;
}

// ---------------------------------------------------------------------------
// Rotation / orientation — IAU WGCCRE 2015 pole and prime-meridian models
// α0, δ0 (deg, ICRF/J2000 equatorial) and W (deg), with T in centuries, d in days.
// ---------------------------------------------------------------------------

const ROTATION = {
  sun:     (T, d) => [286.13, 63.87, 84.176 + 14.1844 * d],
  mercury: (T, d) => [281.0103 - 0.0328 * T, 61.4155 - 0.0049 * T, 329.5988 + 6.1385108 * d],
  venus:   (T, d) => [272.76, 67.16, 160.2 - 1.4813688 * d],
  earth:   (T, d) => [0.0 - 0.641 * T, 90.0 - 0.557 * T, 190.147 + 360.9856235 * d],
  moon:    (T, d) => [269.9949 + 0.0031 * T, 66.5392 + 0.013 * T, 38.3213 + 13.17635815 * d],
  mars:    (T, d) => [317.269202 - 0.10927547 * T, 54.432516 - 0.05827105 * T, 176.049863 + 350.891982443297 * d],
  jupiter: (T, d) => [268.056595 - 0.006499 * T, 64.495303 + 0.002413 * T, 284.95 + 870.536 * d],
  saturn:  (T, d) => [40.589 - 0.036 * T, 83.537 - 0.004 * T, 38.9 + 810.7939024 * d],
  uranus:  (T, d) => [257.311, -15.175, 203.81 - 501.1600928 * d],
  neptune: (T, d) => [299.36, 43.46, 249.978 + 541.1397757 * d],
  pluto:   (T, d) => [132.993, -6.163, 302.695 + 56.3625225 * d],
};

/**
 * Body orientation for a UTC Julian Date.
 * Returns { pole: {x,y,z} unit vector in the ecliptic J2000 frame, W: prime-meridian angle (rad),
 *           alpha, delta } — enough to orient a mesh.
 */
export function orientation(id, jd) {
  const T = centuriesTT(jd);
  const d = T * 36525;
  const [a0, d0, W] = ROTATION[id](T, d);
  const alpha = a0 * DEG, delta = d0 * DEG;
  // pole in equatorial frame
  const xe = Math.cos(delta) * Math.cos(alpha);
  const ye = Math.cos(delta) * Math.sin(alpha);
  const ze = Math.sin(delta);
  return { pole: equatorialToEcliptic(xe, ye, ze), alpha, delta, W: ((W % 360) + 360) % 360 * DEG };
}

export function equatorialToEcliptic(x, y, z) {
  const c = Math.cos(OBLIQUITY_J2000), s = Math.sin(OBLIQUITY_J2000);
  return { x, y: c * y + s * z, z: -s * y + c * z };
}

export { OBLIQUITY_J2000 };
