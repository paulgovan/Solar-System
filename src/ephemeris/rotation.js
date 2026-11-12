// Body orientation: IAU WGCCRE pole and prime-meridian models.

import { DEG, OBLIQUITY_J2000 } from './constants.js';
import { centuriesTT } from './time.js';

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


export function hasOrientation(id) {
  return id in ROTATION;
}

/**
 * Add an IAU-style rotation model for a body: fn(T centuries, d days) → [α0°, δ0°, W°].
 * Bodies without a model keep a fixed orientation.
 */
export function registerRotationModel(id, fn) {
  ROTATION[id] = fn;
}
