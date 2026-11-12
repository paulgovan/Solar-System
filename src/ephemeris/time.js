// Time scales: Julian Date, ΔT, Julian centuries.

import { J2000 } from './constants.js';

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
