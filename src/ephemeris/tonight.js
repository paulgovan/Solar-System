// "Tonight": everything an observer wants to know about the sky on one local day — Sun and Moon
// rise / set, twilight, and where each planet is and when it rises, transits and sets.

import { skyPosition, riseTransitSet, twilightTimes, apparentMagnitude, moonPhase, compassPoint } from './topocentric.js';

export const TONIGHT_BODIES = ['moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];

/**
 * Events between two UTC Julian Dates (normally local midnight to local midnight).
 * @returns {{sun: object, twilight: object[], moon: object, bodies: Record<string, object>}}
 */
export function computeTonight(obs, jd0, jd1) {
  const sun = riseTransitSet('sun', obs, jd0, jd1);
  const bodies = {};
  for (const id of TONIGHT_BODIES) bodies[id] = riseTransitSet(id, obs, jd0, jd1);
  return { sun, twilight: twilightTimes(obs, jd0, jd1, [-6, -12, -18]), bodies, jd0, jd1 };
}

/** Where everything is right now: alt/az, magnitude, rise-set-independent live values. */
export function liveSky(obs, jd) {
  const rows = {};
  for (const id of ['sun', ...TONIGHT_BODIES]) {
    const s = skyPosition(id, jd, obs);
    rows[id] = {
      id, ra: s.ra, dec: s.dec, alt: s.alt, az: s.az, altApparent: s.altApparent, compass: compassPoint(s.az),
      mag: apparentMagnitude(id, jd), above: s.alt > s.h0, distAU: s.distAU, semiDiameter: s.semiDiameter,
    };
  }
  return { rows, moon: moonPhase(jd), sunAlt: rows.sun.alt };
}

/** Human description of the Sun's altitude. */
export function skyState(sunAlt) {
  if (sunAlt > -0.8333) return 'Daytime';
  if (sunAlt > -6) return 'Civil twilight';
  if (sunAlt > -12) return 'Nautical twilight';
  if (sunAlt > -18) return 'Astronomical twilight';
  return 'Night';
}
