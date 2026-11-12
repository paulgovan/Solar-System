// Main asteroid belt (+ Jupiter trojans): thousands of synthetic Keplerian
// orbits, propagated on the GPU so they move correctly with simulated time.

import * as THREE from 'three';
import { AU } from '../scale.js';

export function createAsteroidBelt(count = 9000) {
  const a = new Float32Array(count * 4); // a, e, i, Omega
  const b = new Float32Array(count * 4); // omega, M0, n (rad/day), size
  let s = 98765;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-9)) * Math.cos(2 * Math.PI * rand());
  const TAU = Math.PI * 2;
  // Jupiter's mean longitude at J2000 (deg) — trojans lead/trail by 60°
  const jupL = 34.3964 * Math.PI / 180;
  const jupN = (0.0830853 * Math.PI) / 180; // rad/day

  for (let k = 0; k < count; k++) {
    let sma, ecc, inc, node, peri, M0, n;
    const trojan = k < count * 0.08;
    if (trojan) {
      sma = 5.2 + gauss() * 0.05;
      ecc = Math.abs(gauss()) * 0.05;
      inc = Math.abs(gauss()) * 0.18;
      node = rand() * TAU;
      peri = rand() * TAU;
      const side = rand() < 0.5 ? 1 : -1;
      const L = jupL + side * (Math.PI / 3) + gauss() * 0.25;
      M0 = L - node - peri;
      n = jupN;
    } else {
      // Kirkwood gaps: reject semimajor axes near major resonances with Jupiter
      do { sma = 2.1 + Math.pow(rand(), 0.8) * 1.25; }
      while ([2.5, 2.82, 2.95, 3.27].some((g) => Math.abs(sma - g) < 0.025 * rand() * 2));
      ecc = Math.min(0.3, Math.abs(gauss()) * 0.09);
      inc = Math.abs(gauss()) * 0.13;
      node = rand() * TAU;
      peri = rand() * TAU;
      M0 = rand() * TAU;
      n = (0.98560768 * Math.PI) / 180 / Math.pow(sma, 1.5);
    }
    a.set([sma, ecc, inc, node], k * 4);
    b.set([peri, M0, n, 0.6 + Math.pow(rand(), 4) * 1.6], k * 4);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geo.setAttribute('aEl', new THREE.BufferAttribute(a, 4));
  geo.setAttribute('aEl2', new THREE.BufferAttribute(b, 4));

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      days: { value: 0 },
      blend: { value: 1 },
      AU: { value: AU },
      pixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      opacity: { value: 1 },
    },
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      attribute vec4 aEl; attribute vec4 aEl2;
      uniform float days; uniform float blend; uniform float AU; uniform float pixelRatio;
      varying float vAlpha;
      float mapDist(float r){
        float t = log(r * AU);
        float c = log(sqrt(r) * AU);
        return exp(mix(t, c, blend));
      }
      void main(){
        float sma = aEl.x, e = aEl.y, inc = aEl.z, node = aEl.w;
        float peri = aEl2.x;
        float M = mod(aEl2.y + aEl2.z * days, 6.2831853);
        float E = M;
        for (int k = 0; k < 6; k++) E -= (E - e * sin(E) - M) / (1.0 - e * cos(E));
        float xp = sma * (cos(E) - e);
        float yp = sma * sqrt(1.0 - e * e) * sin(E);
        float cw = cos(peri), sw = sin(peri), cO = cos(node), sO = sin(node), cI = cos(inc), sI = sin(inc);
        vec3 ecl = vec3(
          (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp,
          (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp,
          (sw * sI) * xp + (cw * sI) * yp);
        float r = length(ecl);
        vec3 p = vec3(ecl.x, ecl.z, -ecl.y) * (mapDist(r) / r);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
        gl_PointSize = clamp(aEl2.w * 260.0 / -mv.z, 0.6, 2.6) * pixelRatio;
        vAlpha = clamp(aEl2.w * 0.6, 0.25, 0.9);
      }`,
    fragmentShader: /* glsl */ `
      #include <logdepthbuf_pars_fragment>
      uniform float opacity;
      varying float vAlpha;
      void main(){
        #include <logdepthbuf_fragment>
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        gl_FragColor = vec4(vec3(0.78, 0.72, 0.64), vAlpha * opacity * smoothstep(0.5, 0.2, d));
        #include <colorspace_fragment>
      }`,
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return {
    object: points,
    update(daysSinceJ2000, blend) {
      mat.uniforms.days.value = daysSinceJ2000;
      mat.uniforms.blend.value = blend;
    },
  };
}
