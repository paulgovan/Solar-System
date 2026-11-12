// All body positions for a date.

import { centuriesTT } from './time.js';
import { PLANET_IDS, planetPosition } from './planets.js';
import { moonGeocentric, EARTH_MOON_MASS_RATIO } from './moon.js';

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
