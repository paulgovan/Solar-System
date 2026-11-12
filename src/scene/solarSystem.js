// Builds every registered body (meshes, atmospheres, rings, labels, orbits) and
// updates positions and orientations each frame. Bodies are data-driven: see the
// field list at the top of src/bodies.js and the orbit providers in
// src/ephemeris/providers.js.

import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { bodiesInUpdateOrder } from '../bodies.js';
import { orientation, hasOrientation, equatorialToEcliptic, getOrbitProvider, frameContext, J2000 } from '../ephemeris/index.js';
import { mapPosition, mapRadius, mapSatelliteOffset, eclToScene } from '../scale.js';
import { bakeTexture, makeSaturnRingTexture, makeGlowTexture } from '../textures.js';
import {
  createPlanetMaterial, createCloudMaterial, createAtmosphereMaterial, createRingMaterial,
  createSunMaterial, createOrbitMaterial, MAX_SHADOW_CASTERS,
} from '../shaders/materials.js';

const SPHERE = new THREE.SphereGeometry(1, 128, 64);
const SUN_ANGULAR_RADIUS_1AU = 0.004652; // radians

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

function makeLabel(data, onClick) {
  const el = document.createElement('div');
  el.className = 'label' + ((data.labelPriority ?? 1) >= 2 ? ' minor' : '');
  el.dataset.id = data.id;
  el.style.setProperty('--c', data.color);
  el.innerHTML = `<span class="label-inner"><span class="dot"></span><span class="name">${data.name}</span></span>`;
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  el.addEventListener('click', (e) => { e.stopPropagation(); onClick(data.id); });
  const obj = new CSS2DObject(el);
  obj.center.set(0, 0.5);
  return obj;
}

function createStarVisual(body) {
  body.mesh = new THREE.Mesh(SPHERE, createSunMaterial());
  const glowTex = makeGlowTexture([
    [0, 'rgba(255,240,200,0.9)'], [0.1, 'rgba(255,200,110,0.45)'], [0.25, 'rgba(255,140,40,0.1)'],
    [0.5, 'rgba(255,100,20,0.02)'], [1, 'rgba(255,80,0,0)'],
  ]);
  body.glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
    color: new THREE.Color(0.9, 0.75, 0.6),
  }));
  body.group.add(body.glow);
}

function createPlanetVisual(body, { renderer, quality, earthMask, ringTex }) {
  const data = body.data;
  const kind = data.texture || data.id;
  const size = Math.round((data.textureSize || 1024) * quality);
  const seed = data.id.length * 1.37;
  const opts = data.id === 'earth' ? { landMask: earthMask } : {};
  const map = bakeTexture(renderer, kind, size, seed, opts);
  const nightMap = data.nightLights ? bakeTexture(renderer, 'earthLights', size, seed, opts) : null;
  const rings = data.rings ? {
    map: data.rings.map || ringTex, inner: data.rings.innerKm / data.radiusKm, outer: data.rings.outerKm / data.radiusKm,
  } : null;
  body.material = createPlanetMaterial({
    map, nightMap, bumpScale: data.bump || 0,
    atmosphere: data.atmosphere, atmosphereStrength: data.atmosphereStrength || 0,
    ocean: !!data.ocean, rings, softTerminator: data.softTerminator || 0,
  });
  body.mesh = new THREE.Mesh(SPHERE, body.material);

  if (data.clouds) {
    const clouds = bakeTexture(renderer, 'earthClouds', size, 4.2);
    body.clouds = new THREE.Mesh(SPHERE, createCloudMaterial(clouds));
    body.clouds.scale.setScalar(1.006);
    body.mesh.add(body.clouds);
  }
  if (data.atmosphere) {
    const shellK = data.atmosphereShell || (data.id === 'earth' ? 1.045 : data.id === 'venus' ? 1.05 : data.id === 'mars' ? 1.03 : 1.025);
    body.atmosphere = new THREE.Mesh(SPHERE, createAtmosphereMaterial(data.atmosphere, data.atmosphereStrength));
    body.atmosphere.userData.k = shellK;
    body.group.add(body.atmosphere);
  }
  if (rings) {
    const g = new THREE.RingGeometry(rings.inner, rings.outer, 256, 1);
    body.rings = new THREE.Mesh(g, createRingMaterial(rings.map, rings.inner, rings.outer));
    body.rings.rotation.x = -Math.PI / 2;
    body.rings.renderOrder = 2;
    body.mesh.add(body.rings);
    body.ringInfo = rings;
  }
}

export function createSolarSystem(renderer, scene, { onSelect, quality = 1, earthMask = null }) {
  const bodies = {};
  const order = bodiesInUpdateOrder();
  const orbitGroup = new THREE.Group();
  scene.add(orbitGroup);
  const ctx = { renderer, quality, earthMask, ringTex: makeSaturnRingTexture(74500, 140220) };

  for (const data of order) {
    const group = new THREE.Group();
    group.name = data.id;
    scene.add(group);
    const provider = getOrbitProvider(data.orbit?.kind || 'planet');
    const body = {
      id: data.id, data, group, provider,
      parent: data.parent || null,
      position: new THREE.Vector3(), radius: 1, au: { x: 0, y: 0, z: 0 },
      shadowCasters: [], // ids of bodies whose shadows can fall on this one (features fill this)
    };

    if (data.createVisual) data.createVisual(body, ctx);
    else if (data.star) createStarVisual(body);
    else createPlanetVisual(body, ctx);
    if (body.mesh) {
      body.mesh.userData.bodyId = data.id;
      group.add(body.mesh);
    }

    body.label = makeLabel(data, onSelect);
    group.add(body.label);

    if (provider.path) {
      const segs = data.orbitSegments || (provider.relative ? 256 : 720);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((segs + 1) * 3), 3));
      const param = new Float32Array(segs + 1);
      for (let i = 0; i <= segs; i++) param[i] = i / segs;
      geo.setAttribute('param', new THREE.BufferAttribute(param, 1));
      body.orbit = new THREE.Line(geo, createOrbitMaterial(data.color));
      body.orbit.frustumCulled = false;
      body.orbitSegs = segs;
      body.orbitPath = null;
      body.orbitBlend = null;
      orbitGroup.add(body.orbit);
    }
    bodies[data.id] = body;
  }

  const tmp = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const ringNormal = new THREE.Vector3();

  function mapOffset(b, rel, out, blend) {
    const parent = bodies[b.parent];
    return mapSatelliteOffset(rel, parent.data.radiusKm, out, blend, b.data.orbit?.compressedRadii ?? null);
  }

  function updateOrbit(b, jd, blend) {
    const path = b.orbitPath;
    if (!path || Math.abs(jd - path.startJD) > path.refreshDays) {
      b.orbitPath = b.provider.path(b.data, jd, b.orbitSegs);
      b.orbitBlend = null;
    }
    if (b.orbitBlend !== blend) {
      const arr = b.orbit.geometry.attributes.position.array;
      b.orbitPath.points.forEach((p, i) => {
        if (b.provider.relative) mapOffset(b, p, tmp, blend);
        else mapPosition(p, tmp, blend);
        arr[i * 3] = tmp.x; arr[i * 3 + 1] = tmp.y; arr[i * 3 + 2] = tmp.z;
      });
      b.orbit.geometry.attributes.position.needsUpdate = true;
      b.orbitBlend = blend;
    }
    if (b.provider.relative) b.orbit.position.copy(bodies[b.parent].position);
    if (b.provider.phase) b.orbit.material.uniforms.current.value = b.provider.phase(b.data, jd, b.orbitPath);
  }

  function update(jd, blend, camera, elapsed) {
    const fctx = frameContext(jd);
    for (const data of order) {
      const b = bodies[data.id];
      const p = b.provider.position(data, jd, fctx);
      b.radius = mapRadius(data.radiusKm, blend);
      if (b.provider.relative) {
        const parent = bodies[b.parent];
        b.rel = p;
        b.au = { x: parent.au.x + p.x, y: parent.au.y + p.y, z: parent.au.z + p.z };
        b.position.copy(parent.position).add(mapOffset(b, p, tmp, blend));
      } else {
        b.au = p;
        mapPosition(p, b.position, blend);
      }
      b.group.position.copy(b.position);
      if (b.mesh) {
        b.mesh.scale.setScalar(b.radius);
        if (hasOrientation(data.id)) b.mesh.quaternion.copy(frameFor(data.id, jd, quat));
      }
      if (b.orbit) updateOrbit(b, jd, blend);

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
        ringNormal.set(0, 1, 0).applyQuaternion(b.mesh.quaternion).normalize();
        for (const u of [b.material.uniforms, b.rings.material.uniforms]) {
          u.ringNormal.value.copy(ringNormal);
          u.planetCenter.value.copy(b.position);
          u.planetRadius.value = b.radius;
        }
      }
      if (data.star) {
        b.mesh.material.uniforms.time.value = elapsed;
        const camDist = camera.position.length();
        b.glow.scale.setScalar(Math.max(b.radius * 5, camDist * 0.025));
      }
    }
    updateShadows();
  }

  // Shadows cast by other bodies (e.g. moons on their planet). Features push ids into
  // body.shadowCasters. The Sun's angular size comes from true geometry, so penumbrae
  // have realistic widths in either scale mode.
  function updateShadows() {
    for (const b of Object.values(bodies)) {
      const u = b.material?.uniforms;
      if (!u?.casters) continue;
      let n = 0;
      for (const id of b.shadowCasters) {
        const c = bodies[id];
        if (!c || !c.group.visible || n >= MAX_SHADOW_CASTERS) continue;
        u.casters.value[n].set(c.position.x, c.position.y, c.position.z, c.radius);
        n++;
      }
      u.casterCount.value = n;
      const rAU = Math.hypot(b.au.x, b.au.y, b.au.z) || 1;
      u.sunAngle.value = SUN_ANGULAR_RADIUS_1AU / rAU;
    }
  }

  return { bodies, orbitGroup, update };
}
