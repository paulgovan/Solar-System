// Mapping from physical units (AU, km) to scene units.
//
// TRUE mode:       1 AU = 100 units, radii at the same scale (planets are tiny).
// COMPRESSED mode: radial distance r ↦ 100·√r (direction preserved, so angular
//                  positions stay exact), radii boosted with a gentle power law.
//
// `blend` animates between the two: 0 = true, 1 = compressed. Interpolation is
// done in log space so the transition feels smooth across many orders of magnitude.

import { AU_KM } from './ephemeris.js';

export const AU = 100; // scene units per AU in true mode
const RADIUS_K = 0.0757; // compressed radius = K · km^0.4  (Earth ≈ 2.5 units)
const RADIUS_P = 0.4;
const DIST_P = 0.5;
const MOON_COMPRESSED_FACTOR = 4.2; // compressed Moon distance, in (compressed) Earth radii

export const scale = {
  blend: 1,
  target: 1,
};

const lerpLog = (a, b, t) => (a <= 0 || b <= 0 ? a + (b - a) * t : Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * t));

/** Scene distance for a heliocentric distance in AU. */
export function mapDistance(rAU, t = scale.blend) {
  if (rAU <= 0) return 0;
  return lerpLog(rAU * AU, Math.pow(rAU, DIST_P) * AU, t);
}

/** Scene radius for a physical radius in km. */
export function mapRadius(km, t = scale.blend) {
  const trueR = (km / AU_KM) * AU;
  let comp = RADIUS_K * Math.pow(km, RADIUS_P);
  return lerpLog(trueR, comp, t);
}

/** Map a heliocentric AU vector {x,y,z} (ecliptic) to scene coordinates, writing into out (THREE.Vector3). */
export function mapPosition(p, out, t = scale.blend) {
  const r = Math.hypot(p.x, p.y, p.z);
  const k = r > 0 ? mapDistance(r, t) / r : 0;
  // ecliptic (x, y, z) → three.js Y-up (x, z, −y)
  return out.set(p.x * k, p.z * k, -p.y * k);
}

/** Moon offset from Earth: true geometry in TRUE mode, exaggerated in COMPRESSED mode. */
export function mapMoonOffset(geo, earthRadiusKm, out, t = scale.blend) {
  const r = Math.hypot(geo.x, geo.y, geo.z);
  const trueD = r * AU;
  const compD = mapRadius(earthRadiusKm, 1) * MOON_COMPRESSED_FACTOR;
  const d = lerpLog(trueD, compD, t);
  const k = d / r;
  return out.set(geo.x * k, geo.z * k, -geo.y * k);
}

/** Ecliptic direction → scene direction (no scaling). */
export function eclToScene(v, out) {
  return out.set(v.x, v.z, -v.y);
}
