// Constellation stick figures (d3-celestial, © Olaf Frohn, BSD-3-Clause) drawn between
// catalogue stars, plus their names. Line vertices are star indices, so the figures
// follow proper motion with the stars, and each segment stops short of its stars' discs.

import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { STAR_GLSL, STAR_RADIUS, eqDir } from './sky.js';

/** Unique star-index pairs for every segment of every figure. */
export function constellationSegments(figures) {
  const seen = new Set();
  const pairs = [];
  for (const f of figures) {
    for (const path of f.lines) {
      for (let k = 1; k < path.length; k++) {
        const a = Math.min(path[k - 1], path[k]), b = Math.max(path[k - 1], path[k]);
        if (a === b || seen.has(a * 65536 + b)) continue;
        seen.add(a * 65536 + b);
        pairs.push([a, b]);
      }
    }
  }
  return pairs;
}

/**
 * @param figures   parsed src/data/constellations.json
 * @param attrs     catalogAttributes() output (dir, vel, mag)
 * @param uniforms  shared { years }
 */
export function createConstellations(figures, attrs, uniforms) {
  const group = new THREE.Group();
  group.renderOrder = -7;

  const pairs = constellationSegments(figures);
  const n = pairs.length * 2;
  const pos = new Float32Array(n * 3), vel = new Float32Array(n * 3);
  const other = new Float32Array(n * 3), otherVel = new Float32Array(n * 3);
  const mag = new Float32Array(n);
  const copy3 = (dst, di, src, si) => { dst[di * 3] = src[si * 3]; dst[di * 3 + 1] = src[si * 3 + 1]; dst[di * 3 + 2] = src[si * 3 + 2]; };
  pairs.forEach(([a, b], k) => {
    for (const [v, self, far] of [[2 * k, a, b], [2 * k + 1, b, a]]) {
      copy3(pos, v, attrs.dir, self);
      copy3(vel, v, attrs.vel, self);
      copy3(other, v, attrs.dir, far);
      copy3(otherVel, v, attrs.vel, far);
      mag[v] = attrs.mag[self];
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('vel', new THREE.BufferAttribute(vel, 3));
  geo.setAttribute('other', new THREE.BufferAttribute(other, 3));
  geo.setAttribute('otherVel', new THREE.BufferAttribute(otherVel, 3));
  geo.setAttribute('mag', new THREE.BufferAttribute(mag, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      years: uniforms.years,
      radius: { value: STAR_RADIUS },
      viewportHeight: { value: 800 }, // drawing-buffer pixels; set every frame
      pixelRatio: { value: 1 },
      opacity: { value: 0 },
      color: { value: new THREE.Color(0.12, 0.19, 0.36) },
    },
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    vertexShader: STAR_GLSL + /* glsl */ `
      attribute vec3 vel, other, otherVel; attribute float mag;
      uniform float years, radius, viewportHeight, pixelRatio;
      void main(){
        vec3 a = properMotion(position, vel, years);
        vec3 b = properMotion(other, otherVel, years);
        float ang = acos(clamp(dot(a, b), -1.0, 1.0));
        // Leave a gap around the star: its radius plus a few pixels, converted to an angle
        float gapPx = (starSize(mag) * 0.5 + 4.0) * pixelRatio;
        float gap = gapPx / (projectionMatrix[1][1] * viewportHeight * 0.5);
        float t = min(gap / max(ang, 1e-6), 0.5);
        vec3 d = normalize(mix(a, b, t));
        gl_Position = projectionMatrix * modelViewMatrix * vec4(d * radius, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 color; uniform float opacity;
      void main(){ gl_FragColor = vec4(color * opacity, 1.0); }`,
  });
  const lines = new THREE.LineSegments(geo, material);
  lines.frustumCulled = false;
  lines.renderOrder = -7;
  group.add(lines);

  // Names
  const names = new THREE.Group();
  for (const f of figures) {
    const el = document.createElement('div');
    el.className = 'const-name';
    el.textContent = f.name;
    const label = new CSS2DObject(el);
    label.position.copy(eqDir(f.label[0], f.label[1])).multiplyScalar(STAR_RADIUS);
    names.add(label);
  }
  group.add(names);

  return { group, lines, names, material, segments: pairs.length };
}
