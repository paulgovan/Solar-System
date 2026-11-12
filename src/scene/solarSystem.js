// Builds every body (meshes, atmospheres, rings, labels, orbits) and updates
// their positions and orientations from the ephemeris each frame.

import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { BODIES } from '../bodies.js';
import {
  computePositions, orientation, orbitPath, elementsAt, solveKepler, centuriesTT,
  equatorialToEcliptic, moonGeocentric, PLANET_IDS, J2000,
} from '../ephemeris.js';
import { mapPosition, mapRadius, mapMoonOffset, eclToScene } from '../scale.js';
import { bakeTexture, makeSaturnRingTexture, makeGlowTexture } from '../textures.js';
import {
  createPlanetMaterial, createCloudMaterial, createAtmosphereMaterial, createRingMaterial,
  createSunMaterial, createOrbitMaterial,
} from '../shaders/materials.js';

const SPHERE = new THREE.SphereGeometry(1, 128, 64);
const TEX_SIZE = { earth: 2048, jupiter: 2048, saturn: 2048, mars: 2048, moon: 2048 };
const BUMP = { mercury: 0.012, moon: 0.014, mars: 0.008, earth: 0.006, pluto: 0.006 };
const SOFT = { venus: 0.25, jupiter: 0.12, saturn: 0.12, uranus: 0.12, neptune: 0.12 };

function frameFor(id, jd, target = new THREE.Quaternion()) {
  const { alpha, delta, W } = orientation(id, jd);
  // Body-fixed axes in equatorial J2000: pole P, node Q, then prime meridian X
  const P = [Math.cos(delta) * Math.cos(alpha), Math.cos(delta) * Math.sin(alpha), Math.sin(delta)];
  const Q = [-Math.sin(alpha), Math.cos(alpha), 0];
  const PxQ = [P[1] * Q[2] - P[2] * Q[1], P[2] * Q[0] - P[0] * Q[2], P[0] * Q[1] - P[1] * Q[0]];
  const X = [0, 1, 2].map((k) => Math.cos(W) * Q[k] + Math.sin(W) * PxQ[k]);
  const Y = [P[1] * X[2] - P[2] * X[1], P[2] * X[0] - P[0] * X[2], P[0] * X[1] - P[1] * X[0]];
  const toScene = (v) => eclToScene(equatorialToEcliptic(v[0], v[1], v[2]), new THREE.Vector3());
  // mesh +X = prime meridian, +Y = north pole, +Z = −(90°E)
  const m = new THREE.Matrix4().makeBasis(toScene(X), toScene(P), toScene(Y).negate());
  return target.setFromRotationMatrix(m);
}

function makeLabel(body, onClick) {
  const el = document.createElement('div');
  el.className = 'label' + (body.dwarf ? ' dwarf' : '') + (body.id === 'moon' ? ' moon' : '');
  el.style.setProperty('--c', body.color);
  el.innerHTML = `<span class="label-inner"><span class="dot"></span><span class="name">${body.name}</span></span>`;
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  el.addEventListener('click', (e) => { e.stopPropagation(); onClick(body.id); });
  const obj = new CSS2DObject(el);
  obj.center.set(0, 0.5);
  return obj;
}

export function createSolarSystem(renderer, scene, { onSelect, quality = 1 }) {
  const bodies = {};
  const orbitGroup = new THREE.Group();
  scene.add(orbitGroup);
  const ringTex = makeSaturnRingTexture(74500, 140220);

  for (const data of BODIES) {
    const group = new THREE.Group();
    group.name = data.id;
    scene.add(group);
    const body = { id: data.id, data, group, position: new THREE.Vector3(), radius: 1, au: { x: 0, y: 0, z: 0 } };

    if (data.id === 'sun') {
      const mat = createSunMaterial();
      body.mesh = new THREE.Mesh(SPHERE, mat);
      const glowTex = makeGlowTexture([
        [0, 'rgba(255,240,200,1)'], [0.12, 'rgba(255,200,110,0.65)'], [0.3, 'rgba(255,140,40,0.18)'],
        [0.6, 'rgba(255,100,20,0.04)'], [1, 'rgba(255,80,0,0)'],
      ]);
      body.glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
        color: new THREE.Color(1.6, 1.3, 1.0),
      }));
      group.add(body.glow);
    } else {
      const size = Math.round((TEX_SIZE[data.id] || 1024) * quality);
      const map = bakeTexture(renderer, data.id, size, data.id.length * 1.37);
      let nightMap = null;
      if (data.id === 'earth') nightMap = bakeTexture(renderer, 'earthLights', size, data.id.length * 1.37);
      const rings = data.rings ? {
        map: ringTex, inner: data.rings.innerKm / data.radiusKm, outer: data.rings.outerKm / data.radiusKm,
      } : null;
      body.material = createPlanetMaterial({
        map, nightMap, bumpScale: BUMP[data.id] || 0,
        atmosphere: data.atmosphere, atmosphereStrength: data.atmosphereStrength || 0,
        ocean: data.id === 'earth', rings, softTerminator: SOFT[data.id] || 0,
      });
      body.mesh = new THREE.Mesh(SPHERE, body.material);

      if (data.id === 'earth') {
        const clouds = bakeTexture(renderer, 'earthClouds', size, 4.2);
        body.clouds = new THREE.Mesh(SPHERE, createCloudMaterial(clouds));
        body.clouds.scale.setScalar(1.006);
        body.mesh.add(body.clouds);
      }
      if (data.atmosphere) {
        const shellK = data.id === 'earth' ? 1.045 : data.id === 'venus' ? 1.05 : data.id === 'mars' ? 1.03 : 1.025;
        body.atmosphere = new THREE.Mesh(SPHERE, createAtmosphereMaterial(data.atmosphere, data.atmosphereStrength));
        body.atmosphere.userData.k = shellK;
        group.add(body.atmosphere);
      }
      if (rings) {
        const g = new THREE.RingGeometry(rings.inner, rings.outer, 256, 1);
        body.rings = new THREE.Mesh(g, createRingMaterial(ringTex, rings.inner, rings.outer));
        body.rings.rotation.x = -Math.PI / 2;
        body.rings.renderOrder = 2;
        body.mesh.add(body.rings);
        body.ringInfo = rings;
      }
    }
    body.mesh.userData.bodyId = data.id;
    group.add(body.mesh);

    body.label = makeLabel(data, onSelect);
    group.add(body.label);

    // Orbit line
    if (data.id !== 'sun') {
      const segs = data.id === 'moon' ? 256 : 720;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((segs + 1) * 3), 3));
      const param = new Float32Array(segs + 1);
      for (let i = 0; i <= segs; i++) param[i] = i / segs;
      geo.setAttribute('param', new THREE.BufferAttribute(param, 1));
      body.orbit = new THREE.Line(geo, createOrbitMaterial(data.color));
      body.orbit.frustumCulled = false;
      body.orbitAU = null;
      body.orbitSegs = segs;
      (data.id === 'moon' ? scene : orbitGroup).add(body.orbit);
    }
    bodies[data.id] = body;
  }

  // ---- orbit path management ----
  let orbitJD = null;
  let orbitBlend = null;

  function refreshOrbitSamples(jd) {
    const T = centuriesTT(jd);
    for (const id of PLANET_IDS) {
      bodies[id].orbitAU = orbitPath(id, T, bodies[id].orbitSegs);
      bodies[id].orbitEl = elementsAt(id, T);
    }
    // Moon: sample one sidereal month around the current date (geocentric)
    const moon = bodies.moon;
    const pts = [];
    for (let i = 0; i <= moon.orbitSegs; i++) {
      pts.push(moonGeocentric(centuriesTT(jd + (i / moon.orbitSegs) * 27.321661)));
    }
    moon.orbitAU = pts;
    moon.orbitStartJD = jd;
    orbitJD = jd;
  }

  const tmp = new THREE.Vector3();
  function remapOrbits(blend) {
    for (const id of [...PLANET_IDS, 'moon']) {
      const b = bodies[id];
      const arr = b.orbit.geometry.attributes.position.array;
      b.orbitAU.forEach((p, i) => {
        if (id === 'moon') mapMoonOffset(p, bodies.earth.data.radiusKm, tmp, blend);
        else mapPosition(p, tmp, blend);
        arr[i * 3] = tmp.x; arr[i * 3 + 1] = tmp.y; arr[i * 3 + 2] = tmp.z;
      });
      b.orbit.geometry.attributes.position.needsUpdate = true;
    }
    orbitBlend = blend;
  }

  const sunDir = new THREE.Vector3();
  const quat = new THREE.Quaternion();

  function update(jd, blend, camera, elapsed) {
    // Refresh sampled orbits every ~5 years of simulated time (elements drift slowly),
    // and the Moon's every ~2 days.
    if (orbitJD === null || Math.abs(jd - orbitJD) > 1826) refreshOrbitSamples(jd);
    else if (Math.abs(jd - bodies.moon.orbitStartJD) > 2) {
      const moon = bodies.moon;
      moon.orbitAU = [];
      for (let i = 0; i <= moon.orbitSegs; i++) moon.orbitAU.push(moonGeocentric(centuriesTT(jd + (i / moon.orbitSegs) * 27.321661)));
      moon.orbitStartJD = jd;
      orbitBlend = null;
    }
    if (orbitBlend !== blend) remapOrbits(blend);

    const pos = computePositions(jd);
    const T = centuriesTT(jd);
    for (const id in bodies) {
      const b = bodies[id];
      b.au = pos[id];
      b.radius = mapRadius(b.data.radiusKm, blend);
      if (id === 'moon') {
        mapMoonOffset(pos.moonGeo, bodies.earth.data.radiusKm, tmp, blend);
        b.position.copy(bodies.earth.position).add(tmp);
        b.orbit.position.copy(bodies.earth.position);
        // trail param: fraction of the sampled month elapsed since sampling start
        b.orbit.material.uniforms.current.value = ((jd - b.orbitStartJD) / 27.321661) % 1;
      } else {
        mapPosition(pos[id], b.position, blend);
      }
      b.group.position.copy(b.position);
      b.mesh.scale.setScalar(b.radius);
      b.mesh.quaternion.copy(frameFor(id, jd, quat));

      if (b.orbit && id !== 'moon') {
        const el = b.orbitEl;
        const E = solveKepler(elementsAt(id, T).M, el.e);
        b.orbit.material.uniforms.current.value = ((E / (2 * Math.PI)) % 1 + 1) % 1;
      }
      if (b.clouds) b.clouds.rotation.y = ((jd - J2000) * 0.02) % (2 * Math.PI);
      if (b.atmosphere) {
        const k = b.atmosphere.userData.k;
        b.atmosphere.scale.setScalar(b.radius * k);
        const u = b.atmosphere.material.uniforms;
        u.center.value.copy(b.position);
        u.radius.value = b.radius;
        u.shellRadius.value = b.radius * k;
      }
      if (b.ringInfo) {
        sunDir.set(0, 1, 0).applyQuaternion(b.mesh.quaternion).normalize();
        for (const u of [b.material.uniforms, b.rings.material.uniforms]) {
          u.ringNormal.value.copy(sunDir);
          u.planetCenter.value.copy(b.position);
          u.planetRadius.value = b.radius;
        }
      }
      if (id === 'sun') {
        b.mesh.material.uniforms.time.value = elapsed;
        const camDist = camera.position.length();
        b.glow.scale.setScalar(Math.max(b.radius * 9, camDist * 0.06));
      }
    }
  }

  return { bodies, orbitGroup, update };
}
