// Comet coma and tails. The tails are camera-facing ribbons rebuilt on the CPU every
// frame: their centre lines are laid out in AU (ion tail straight anti-sunward, dust
// tail curving back along the orbit) and mapped with the same scale transform as the
// bodies, so they shrink correctly in compressed mode. Length grows ~1/r² and the
// comet is active only inside ~4 AU.

import * as THREE from 'three';
import { mapPosition } from '../scale.js';
import { makeGlowTexture } from '../textures.js';

const SEGMENTS = 48;
const ACTIVE_R = 4.2; // AU: no visible activity beyond this
const FULL_R = 1.6; // AU: full brightness inside this

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Activity 0…1 at heliocentric distance r (AU). */
export function cometActivity(r) {
  return 1 - smooth(FULL_R, ACTIVE_R, r);
}

/** Tail lengths in AU at heliocentric distance r. */
export function tailLengths(r) {
  const k = 1 / Math.max(r * r, 0.05);
  return { ion: Math.min(0.4, 0.1 * k), dust: Math.min(0.28, 0.065 * k) };
}

function tailMaterial(color, sharpness) {
  return new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) }, intensity: { value: 0 }, sharpness: { value: sharpness } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      attribute vec2 tail;
      varying vec2 vTail;
      void main(){
        vTail = tail;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <logdepthbuf_pars_fragment>
      uniform vec3 color; uniform float intensity; uniform float sharpness;
      varying vec2 vTail;
      void main(){
        #include <logdepthbuf_fragment>
        float s = vTail.x, u = vTail.y;
        float across = exp(-u * u * sharpness);
        float along = pow(1.0 - s, 1.6) * smoothstep(0.0, 0.03, s);
        float a = intensity * across * along;
        gl_FragColor = vec4(color, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

function ribbon(material) {
  const n = SEGMENTS + 1;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
  const tail = new Float32Array(n * 2 * 2);
  const index = [];
  for (let i = 0; i < n; i++) {
    const s = i / SEGMENTS;
    tail.set([s, -1, s, 1], i * 4);
    if (i < SEGMENTS) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  geo.setAttribute('tail', new THREE.BufferAttribute(tail, 2));
  geo.setIndex(index);
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  return mesh;
}

/**
 * @returns {{ group: THREE.Group, update(au, velocity, blend, camera, headPos, radius): void, sceneLength(au, blend): number }}
 *   au: heliocentric position (AU), velocity: AU/day, headPos: scene position of the nucleus.
 */
export function createComet() {
  const group = new THREE.Group();
  group.name = 'comet';
  const ion = ribbon(tailMaterial('#7fb2ff', 5.0));
  const dust = ribbon(tailMaterial('#ffe6c2', 2.6));
  const coma = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture([[0, 'rgba(255,255,255,1)'], [0.08, 'rgba(220,240,255,0.55)'], [0.3, 'rgba(150,200,255,0.12)'], [1, 'rgba(120,180,255,0)']]),
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, color: new THREE.Color(0.8, 0.95, 1.0),
  }));
  coma.renderOrder = 4;
  group.add(dust, ion, coma);

  const tangent = new THREE.Vector3();
  const toCam = new THREE.Vector3();
  const side = new THREE.Vector3();
  const centers = Array.from({ length: SEGMENTS + 1 }, () => new THREE.Vector3());
  const au = { x: 0, y: 0, z: 0 };

  // Lay out one tail: centre line in AU (`along` the anti-sun direction, bending back by
  // `lag`·s² against the motion), mapped to scene units, then widened toward the camera.
  function layout(mesh, head, dir, back, length, lag, widthAt, camera, blend) {
    for (let i = 0; i <= SEGMENTS; i++) {
      const s = i / SEGMENTS;
      const along = length * s, bend = length * lag * s * s;
      au.x = head.x + dir.x * along + bend * back.x;
      au.y = head.y + dir.y * along + bend * back.y;
      au.z = head.z + dir.z * along + bend * back.z;
      mapPosition(au, centers[i], blend);
    }
    const sceneLen = centers[0].distanceTo(centers[SEGMENTS]);
    const pos = mesh.geometry.attributes.position.array;
    for (let i = 0; i <= SEGMENTS; i++) {
      const c = centers[i];
      tangent.subVectors(centers[Math.min(SEGMENTS, i + 1)], centers[Math.max(0, i - 1)]).normalize();
      toCam.subVectors(camera.position, c).normalize();
      side.crossVectors(tangent, toCam).normalize().multiplyScalar(sceneLen * widthAt(i / SEGMENTS));
      pos.set([c.x - side.x, c.y - side.y, c.z - side.z, c.x + side.x, c.y + side.y, c.z + side.z], i * 6);
    }
    mesh.geometry.attributes.position.needsUpdate = true;
    return sceneLen;
  }

  function update(head, velocity, blend, camera, headPos, radius) {
    const r = Math.hypot(head.x, head.y, head.z);
    const act = cometActivity(r);
    group.visible = act > 0.001;
    if (!group.visible) return;
    // anti-sunward unit vector, and the direction opposite to the motion, perpendicular to it
    const dir = { x: head.x / r, y: head.y / r, z: head.z / r };
    const vd = velocity.x * dir.x + velocity.y * dir.y + velocity.z * dir.z;
    const back = { x: vd * dir.x - velocity.x, y: vd * dir.y - velocity.y, z: vd * dir.z - velocity.z };
    const bl = Math.hypot(back.x, back.y, back.z) || 1;
    back.x /= bl; back.y /= bl; back.z /= bl;

    const L = tailLengths(r);
    layout(ion, head, dir, back, L.ion, 0.08, (s) => 0.006 + 0.03 * s, camera, blend);
    const dustLen = layout(dust, head, dir, back, L.dust, 0.45, (s) => 0.012 + 0.16 * s, camera, blend);

    ion.material.uniforms.intensity.value = 0.55 * act;
    dust.material.uniforms.intensity.value = 0.75 * act;
    coma.position.copy(headPos);
    coma.scale.setScalar(Math.max(radius * 40, dustLen * 0.09) * (0.3 + 0.7 * act));
    coma.material.opacity = 0.35 + 0.65 * act;
  }

  /** Scene length of the ion tail for a nucleus at `head` (AU); 0 when inactive. */
  function sceneLength(head, blend) {
    const r = Math.hypot(head.x, head.y, head.z);
    if (!r || cometActivity(r) <= 0) return 0;
    const L = tailLengths(r).ion / r;
    au.x = head.x * (1 + L); au.y = head.y * (1 + L); au.z = head.z * (1 + L);
    return mapPosition(head, tangent, blend).distanceTo(mapPosition(au, side, blend));
  }

  return { group, update, sceneLength };
}
