// A subtle lens flare on the Sun: a few soft ghosts along the line from the Sun
// through the screen centre. Occlusion is analytic: the fraction of the Sun's disc
// hidden by each body's disc (both seen as circles from the camera), so the flare
// fades smoothly as a planet slides across the Sun and is gone when it is covered.
//
// three's Lensflare addon is not used: its occlusion test copies framebuffer pixels
// and compares depth, which breaks with the logarithmic depth buffer and the
// multisampled composer target this app renders into.

import * as THREE from 'three';
import { makeGlowTexture } from '../textures.js';

const STRENGTH = 0.32; // overall opacity; the Sun was toned down, so keep this low

// t: position along Sun → centre (0 = Sun, 1 = centre, 2 = mirrored); size: fraction of screen height
const GHOSTS = [
  { t: 0.42, size: 0.035, color: '#ffd9a0', alpha: 0.35, tex: 'disc' },
  { t: 0.7, size: 0.018, color: '#a0ffd8', alpha: 0.35, tex: 'disc' },
  { t: 1.18, size: 0.07, color: '#9fb6ff', alpha: 0.22, tex: 'ring' },
  { t: 1.42, size: 0.028, color: '#d0a0ff', alpha: 0.3, tex: 'disc' },
  { t: 1.75, size: 0.11, color: '#ffc28a', alpha: 0.14, tex: 'disc' },
  { t: 2.05, size: 0.05, color: '#8affc8', alpha: 0.18, tex: 'ring' },
];

/** Area of overlap of two circles of radii a, b with centres d apart (all in radians). */
export function circleOverlap(a, b, d) {
  if (d >= a + b) return 0;
  if (d <= Math.abs(a - b)) return Math.PI * Math.min(a, b) ** 2;
  const a2 = a * a, b2 = b * b;
  const x = Math.acos(Math.min(1, Math.max(-1, (d * d + a2 - b2) / (2 * d * a))));
  const y = Math.acos(Math.min(1, Math.max(-1, (d * d + b2 - a2) / (2 * d * b))));
  return a2 * x + b2 * y - 0.5 * Math.sqrt(Math.max(0, (-d + a + b) * (d + a - b) * (d - a + b) * (d + a + b)));
}

/** Fraction (0..1) of the Sun's disc visible from `cam` past the given spheres. */
export function sunVisibility(cam, sunPos, sunRadius, spheres) {
  const toSun = new THREE.Vector3().subVectors(sunPos, cam);
  const dSun = toSun.length();
  if (dSun <= sunRadius) return 0;
  toSun.divideScalar(dSun);
  const aS = Math.asin(sunRadius / dSun);
  const sunArea = Math.PI * aS * aS;
  let visible = 1;
  const to = new THREE.Vector3();
  for (const { position, radius } of spheres) {
    to.subVectors(position, cam);
    const d = to.length();
    if (d <= radius) return 0; // camera inside a body
    if (d > dSun || to.dot(toSun) <= 0) continue; // behind the Sun or behind the camera
    const aB = Math.asin(radius / d);
    const sep = Math.acos(Math.min(1, Math.max(-1, to.dot(toSun) / d)));
    visible *= 1 - circleOverlap(aS, aB, sep) / sunArea;
  }
  return Math.max(0, visible);
}

let group = null;
let sprites = [];
let fade = 0;
const ndc = new THREE.Vector3();
const dir = new THREE.Vector3();

function ringTexture() {
  return makeGlowTexture([
    [0, 'rgba(255,255,255,0)'], [0.62, 'rgba(255,255,255,0)'], [0.8, 'rgba(255,255,255,0.55)'],
    [0.9, 'rgba(255,255,255,0.15)'], [1, 'rgba(255,255,255,0)'],
  ], 128);
}
function discTexture() {
  return makeGlowTexture([
    [0, 'rgba(255,255,255,0.7)'], [0.55, 'rgba(255,255,255,0.45)'], [0.85, 'rgba(255,255,255,0.12)'], [1, 'rgba(255,255,255,0)'],
  ], 128);
}

export default {
  id: 'lensFlare',
  setup(app) {
    const tex = { ring: ringTexture(), disc: discTexture() };
    group = new THREE.Group();
    group.name = 'lensFlare';
    sprites = GHOSTS.map((g) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex[g.tex], color: new THREE.Color(g.color), transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, toneMapped: false,
      }));
      s.frustumCulled = false;
      s.renderOrder = 1000;
      s.userData = g;
      group.add(s);
      return s;
    });
    app.scene.add(group);
    if (import.meta.env.DEV && window.__app) window.__app.lensFlare = { group, get fade() { return fade; } };
  },
  update(app, dt) {
    const { camera, bodies } = app;
    const sun = bodies.sun;
    let target = 0;
    ndc.copy(sun.position).project(camera);
    const inFront = ndc.z < 1 && ndc.z > -1;
    if (sun.group.visible && inFront) {
      const spheres = [];
      for (const b of Object.values(bodies)) {
        if (b === sun || !b.mesh || !b.group.visible) continue;
        spheres.push({ position: b.position, radius: b.radius });
      }
      const vis = sunVisibility(camera.position, sun.position, sun.radius, spheres);
      const dSun = camera.position.distanceTo(sun.position);
      const aS = Math.asin(Math.min(1, sun.radius / dSun));
      const onScreen = 1 - THREE.MathUtils.smoothstep(Math.max(Math.abs(ndc.x), Math.abs(ndc.y)), 0.85, 1.15);
      const notHuge = 1 - THREE.MathUtils.smoothstep(aS, 0.06, 0.25); // fade when the Sun fills the view
      target = vis * onScreen * notHuge;
    }
    fade += (target - fade) * Math.min(1, dt * 10);
    group.visible = fade > 0.002;
    if (!group.visible) return;

    const D = camera.near * 20;
    const worldPerScreen = 2 * D * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const sx = ndc.x, sy = ndc.y;
    for (const s of sprites) {
      const g = s.userData;
      const x = sx * (1 - g.t), y = sy * (1 - g.t);
      dir.set(x, y, 0.5).unproject(camera).sub(camera.position).normalize();
      s.position.copy(camera.position).addScaledVector(dir, D);
      s.scale.setScalar(g.size * worldPerScreen);
      // ghosts get fainter the further the Sun is from the centre of the view
      s.material.opacity = g.alpha * STRENGTH * fade * (0.6 + 0.4 * (1 - Math.min(1, Math.hypot(sx, sy))));
    }
  },
};
