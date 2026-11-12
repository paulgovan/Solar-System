// Mapping from physical units (AU, km) to scene units.
//
// TRUE mode:       1 AU = 100 units, radii at the same scale (planets are tiny).
// COMPRESSED mode: radial distance r ↦ 100·√r (direction preserved, so angular
//                  positions stay exact), radii boosted with a gentle power law.
//
// `blend` animates between the two: 0 = true, 1 = compressed. Interpolation is
// done in log space so the transition feels smooth across many orders of magnitude.

import { AU_KM } from './ephemeris/index.js';

export const AU = 100; // scene units per AU in true mode
const RADIUS_K = 0.0757; // compressed radius = K · km^0.4  (Earth ≈ 2.5 units)
const RADIUS_P = 0.4;
const DIST_P = 0.5;
const SAT_KNEE = 2.6; // satellites closer than this (in parent radii) keep their true ratio
const SAT_P = 0.5; // 0.5 spreads multi-moon systems (Galileans 3.9–8.3 R, Mimas–Iapetus 2.9–13 R)

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

/**
 * Satellite offset from its parent: true geometry in TRUE mode; in COMPRESSED mode the
 * distance is expressed in (compressed) parent radii, squeezed with a gentle power law
 * beyond SAT_KNEE radii so that ordering is preserved and inner moons stay outside rings.
 * `compressedRadii` (optional) pins the compressed distance, e.g. for Earth's Moon.
 */
export function mapSatelliteOffset(rel, parentRadiusKm, out, t = scale.blend, compressedRadii = null) {
  const r = Math.hypot(rel.x, rel.y, rel.z);
  if (r === 0) return out.set(0, 0, 0);
  const trueD = r * AU;
  const x = (r * AU_KM) / parentRadiusKm; // distance in parent radii
  const radii = compressedRadii ?? (x <= SAT_KNEE ? x : SAT_KNEE * Math.pow(x / SAT_KNEE, SAT_P));
  const compD = mapRadius(parentRadiusKm, 1) * radii;
  const k = lerpLog(trueD, compD, t) / r;
  return out.set(rel.x * k, rel.z * k, -rel.y * k);
}

/** Ecliptic direction → scene direction (no scaling). */
export function eclToScene(v, out) {
  return out.set(v.x, v.z, -v.y);
}
