// Spacecraft: Voyager 1 & 2, Pioneer 10 & 11, New Horizons.
//
// Trajectories are JPL Horizons vectors (src/data/spacecraft/) interpolated with a
// non-uniform Catmull-Rom spline by the `samples` orbit provider. Each craft has a small
// marker model (its dish turned toward Earth), a trail of its past path, and is shown
// only while the date is inside its data range (launch … 2030).
//
// Flybys: in compressed scale the planets are drawn hundreds of times larger than life,
// so a heliocentric mapping would put a spacecraft inside Jupiter during its flyby.
// Near a planet the craft is instead placed with the satellite mapping that moons use
// (src/scale.js mapSatelliteOffset), relative to the planet the app draws, merging into
// the heliocentric mapping farther out. The trail uses the same mapping, so it bends
// around the planet with the marker.

import * as THREE from 'three';
import { registerBodies } from '../bodies.js';
import {
  registerOrbitProvider, computePositions, planetPosition, centuriesTT, deltaT, AU_KM, jdToDate,
} from '../ephemeris/index.js';
import {
  createTrajectory, trajectoryDay, trajectoryState, trajectoryVelocity, encounterVelocity,
} from '../ephemeris/spacecraft.js';
import { registerToggle, state, select } from '../state.js';
import { registerInfoRows, fmtNum } from '../ui/infoPanel.js';
import { mapPosition, mapRadius } from '../scale.js';
import { BODY_MAP } from '../bodies.js';
import { SPACECRAFT } from '../data/spacecraft/index.js';

// ---------------------------------------------------------------------------
// Orbit provider
// ---------------------------------------------------------------------------
const trajectories = new WeakMap();
export function trajectoryFor(body) {
  let t = trajectories.get(body);
  if (!t) { t = createTrajectory(body.orbit.data); trajectories.set(body, t); }
  return t;
}
const frameState = new Map(); // body id → last trajectoryState, for the scene mapping below

registerOrbitProvider('samples', {
  relative: false,
  position: (body, jd, ctx) => {
    const traj = trajectoryFor(body);
    const st = trajectoryState(traj, trajectoryDay(traj, jd), (id) => ctx.positions()[id], frameState.get(body.id) || {});
    frameState.set(body.id, st);
    return st.au;
  },
});

registerToggle({ key: 'spacecraft', label: 'Spacecraft', shortcut: 'c', order: 50, title: 'Spacecraft (C)' });

// ---------------------------------------------------------------------------
// Marker model: bus, high-gain dish (+Z) and booms, roughly one unit across
// ---------------------------------------------------------------------------
function litMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) } },
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec3 vN; varying vec3 vW;
      void main(){
        vN = normalize(mat3(modelMatrix) * normal);
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <logdepthbuf_pars_fragment>
      uniform vec3 color; varying vec3 vN; varying vec3 vW;
      void main(){
        #include <logdepthbuf_fragment>
        vec3 L = normalize(-vW);
        float d = abs(dot(normalize(vN), L));
        gl_FragColor = vec4(color * (0.18 + 0.9 * d), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.DoubleSide,
  });
}

const MODEL = (() => {
  const dishPts = [];
  for (let i = 0; i <= 12; i++) { const r = (i / 12) * 0.5; dishPts.push(new THREE.Vector2(r, r * r * 0.6)); }
  const dish = new THREE.LatheGeometry(dishPts, 32).rotateX(-Math.PI / 2).translate(0, 0, 0.12); // opens toward +Z
  const bus = new THREE.CylinderGeometry(0.2, 0.2, 0.14, 10).rotateX(Math.PI / 2);
  const boom = new THREE.CylinderGeometry(0.012, 0.012, 1.1, 6).rotateZ(Math.PI / 2).translate(0.62, 0, -0.02);
  const rtg = new THREE.CylinderGeometry(0.035, 0.035, 0.5, 8).rotateZ(Math.PI / 2).translate(-0.45, -0.04, -0.04);
  return { dish, bus, boom, rtg };
})();

function createSpacecraftVisual(body) {
  const bus = new THREE.Mesh(MODEL.bus, litMaterial('#b8964a'));
  bus.add(new THREE.Mesh(MODEL.dish, litMaterial('#eceae4')));
  bus.add(new THREE.Mesh(MODEL.boom, litMaterial('#9a9a9a')));
  bus.add(new THREE.Mesh(MODEL.rtg, litMaterial('#6f6a62')));
  body.mesh = bus;
}

for (const sc of SPACECRAFT) sc.createVisual = createSpacecraftVisual;
registerBodies(SPACECRAFT);

// ---------------------------------------------------------------------------
// Scene mapping near planets
// ---------------------------------------------------------------------------
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();

const SAT_KNEE = 2.6, SAT_P = 0.25; // as src/scale.js mapSatelliteOffset (moons)
const SAT_CAP = 30; // planet radii: beyond the large moons the satellite distance stops growing
const relPoint = { x: 0, y: 0, z: 0 };

/**
 * Scene position for a spacecraft at heliocentric `au` that is `rel` (AU) from planet
 * `planetId` (heliocentric `planetAU`, scene position `planetScene`), with encounter
 * fade `weight`. The scene distance from the planet is the larger of
 *   - the heliocentric mapping of the true point, and
 *   - the satellite mapping moons use (in compressed planet radii), capped at 30 radii,
 * so the craft passes outside the enlarged planet and between its moons in the right
 * order, and the distance never shrinks while the craft recedes (no loops in the trail).
 */
function encounterScene(au, rel, weight, planetId, planetAU, planetScene, blend, out) {
  mapPosition(au, out, blend);
  if (!rel || weight <= 0) return out;
  const Rkm = BODY_MAP[planetId].radiusKm;
  relPoint.x = planetAU.x + rel.x; relPoint.y = planetAU.y + rel.y; relPoint.z = planetAU.z + rel.z;
  const H = mapPosition(relPoint, tmpA, blend).sub(planetScene); // heliocentric offset
  const hLen = H.length();
  const x = Math.min(SAT_CAP, (Math.hypot(rel.x, rel.y, rel.z) * AU_KM) / Rkm);
  const sat = mapRadius(Rkm, blend) * (x <= SAT_KNEE ? x : SAT_KNEE * Math.pow(x / SAT_KNEE, SAT_P));
  const m = Math.max(hLen, sat);
  // direction: the true one close in, the heliocentric-mapped one once that dominates
  const s = smooth(0.5, 1, hLen / sat);
  tmpB.set(rel.x, rel.z, -rel.y).normalize().multiplyScalar(1 - s);
  if (hLen > 0) tmpB.addScaledVector(H, s / hLen);
  tmpB.normalize().multiplyScalar(m).add(planetScene);
  return out.lerp(tmpB, weight);
}

// ---------------------------------------------------------------------------
// Trails
// ---------------------------------------------------------------------------
function trailMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) }, now: { value: 0 }, highlight: { value: 0 } },
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      attribute float day;
      varying float vDay;
      void main(){
        vDay = day;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <logdepthbuf_pars_fragment>
      uniform vec3 color; uniform float now; uniform float highlight;
      varying float vDay;
      void main(){
        #include <logdepthbuf_fragment>
        if (vDay > now) discard;
        float recent = exp(-(now - vDay) / 500.0);
        float a = 0.2 + 0.12 * highlight + (0.55 + 0.3 * highlight) * recent;
        gl_FragColor = vec4(color * (0.75 + 0.5 * recent), a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

const MAX_TRAIL_STEP = 6; // days between trail points in cruise

/** Trail sample times (days after t0): every knot, plus fill-in points in long gaps. */
function trailDays(traj) {
  const days = new Set();
  const add = (track) => { for (const t of track.t) days.add(t); };
  add(traj.helio);
  for (const e of traj.encounters) add(e.track);
  const sorted = [...days].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < sorted.length; i++) {
    out.push(sorted[i]);
    const gap = (sorted[i + 1] ?? sorted[i]) - sorted[i];
    const n = Math.floor(gap / MAX_TRAIL_STEP);
    for (let k = 1; k <= n; k++) out.push(sorted[i] + (gap * k) / (n + 1));
  }
  return out;
}

/** App planet position at a UTC Julian Date (Earth separated from the barycentre). */
function planetAUAt(id, jd) {
  return id === 'earth' ? computePositions(jd).earth : planetPosition(id, centuriesTT(jd));
}

function createTrail(body, traj) {
  const days = trailDays(traj);
  const n = days.length;
  const pts = days.map((d) => {
    const jd = traj.t0 + d - deltaT(traj.t0 + d) / 86400;
    const cache = {};
    const st = trajectoryState(traj, d, (id) => (cache[id] ||= planetAUAt(id, jd)));
    return { au: st.au, rel: st.rel, weight: st.weight, planet: st.enc?.body, planetAU: st.enc ? cache[st.enc.body] : null };
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute('day', new THREE.BufferAttribute(Float32Array.from(days), 1));
  const line = new THREE.Line(geo, trailMaterial(body.data.color));
  line.frustumCulled = false;
  line.name = `${body.id}-trail`;
  let lastBlend = null;
  const v = new THREE.Vector3();
  const planetScene = new THREE.Vector3();
  line.userData.update = (blend) => {
    if (blend === lastBlend) return;
    lastBlend = blend;
    const arr = geo.attributes.position.array;
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      if (p.planet) mapPosition(p.planetAU, planetScene, blend);
      encounterScene(p.au, p.rel, p.weight, p.planet, p.planetAU, planetScene, blend, v);
      arr[i * 3] = v.x; arr[i * 3 + 1] = v.y; arr[i * 3 + 2] = v.z;
    }
    geo.attributes.position.needsUpdate = true;
  };
  return line;
}

// ---------------------------------------------------------------------------
// Feature
// ---------------------------------------------------------------------------
const fmtYear = (jd) => jdToDate(jd).getUTCFullYear();

export default {
  id: 'spacecraft',

  setup(app) {
    const style = document.createElement('style');
    style.textContent = '.label.spacecraft .dot { border-radius: 1px; transform: rotate(45deg) scale(0.85); }';
    document.head.appendChild(style);

    this.crafts = SPACECRAFT.map((data) => {
      const body = app.bodies[data.id];
      const traj = trajectoryFor(data);
      const trail = createTrail(body, traj);
      app.system.orbitGroup.add(trail);
      body.label.element.classList.add('spacecraft');
      return { body, traj, trail, button: document.querySelector(`#body-list button[data-id="${data.id}"]`) };
    });

    app.on('select', (id) => {
      for (const c of this.crafts) c.trail.material.uniforms.highlight.value = c.body.id === id ? 1 : 0;
    });

    registerInfoRows((body) => {
      const d = body.data;
      if (!d.spacecraft) return [];
      const traj = trajectoryFor(d);
      const day = trajectoryDay(traj, state.jd);
      const st = frameState.get(d.id);
      const v = trajectoryVelocity(traj, day);
      const rows = [['Speed (vs Sun)', `${fmtNum((Math.hypot(v.x, v.y, v.z) * AU_KM) / 86400, 1)} km/s`]];
      if (st?.enc && st.weight > 0.5 && st.enc.body !== 'earth') {
        const r = Math.hypot(st.rel.x, st.rel.y, st.rel.z) * AU_KM;
        const rv = encounterVelocity(st.enc, day);
        const pname = BODY_MAP[st.enc.body].name;
        rows.push([`Distance from ${pname}`, `${fmtNum(r)} km`]);
        rows.push(['', `${fmtNum(r / BODY_MAP[st.enc.body].radiusKm, 1)} ${pname} radii`]);
        rows.push([`Speed vs ${pname}`, `${fmtNum((Math.hypot(rv.x, rv.y, rv.z) * AU_KM) / 86400, 1)} km/s`]);
      }
      rows.push(['Launched', d.launched], ['Flybys', d.flybys], ['Mass', `${fmtNum(d.massKg)} kg`]);
      if (d.lastContact) rows.push(['Last contact', d.lastContact]);
      rows.push(['Trajectory', `JPL Horizons, ${fmtYear(traj.t0)}–${fmtYear(traj.t0 + traj.end)}`]);
      return rows;
    });
  },

  update(app) {
    const blend = app.blend ?? 1;
    const earth = app.bodies.earth.position;
    for (const c of this.crafts) {
      const { body, traj, trail } = c;
      const day = trajectoryDay(traj, state.jd);
      const visible = !!state.show.spacecraft && day >= 0 && day <= traj.end;
      body.group.visible = visible;
      trail.visible = visible;
      c.button?.classList.toggle('hidden-body', !visible);
      if (!visible) {
        if (state.selected === body.id) select('sun');
        continue;
      }
      // re-place near planets (see encounterScene)
      const st = frameState.get(body.id);
      if (st?.enc) {
        const planet = app.bodies[st.enc.body];
        encounterScene(st.au, st.rel, st.weight, st.enc.body, planet.au, planet.position, blend, body.position);
        body.group.position.copy(body.position);
      }
      body.mesh.lookAt(earth);
      trail.userData.update(blend);
      trail.material.uniforms.now.value = day;
    }
  },
};
