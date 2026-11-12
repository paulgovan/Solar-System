// The Moon's geocentric position.

import { DEG, AU_KM } from './constants.js';
import { solveKepler, wrapPi } from './kepler.js';

// ---------------------------------------------------------------------------
// Moon — low-precision geocentric series (after P. Schlyter / Meeus),
// converted to the J2000 ecliptic by removing general precession.
// ---------------------------------------------------------------------------

const EARTH_RADIUS_KM = 6371.0;
export const EARTH_MOON_MASS_RATIO = 81.3005678;

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
