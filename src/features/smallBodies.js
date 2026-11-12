// Dwarf planets (Ceres, Eris, Haumea, Makemake), Vesta and Halley's Comet.
//
// Orbits: the `elements` provider propagates JPL osculating elements as two-body orbits
// and blends between neighbouring epochs (src/ephemeris/smallBody.js). Inside the span
// of the element table positions agree with JPL Horizons to ≲0.05° (see tests); outside
// it they are extrapolated from the first/last epoch and the info panel says so.
//
// Toggle: a new "Small bodies" toggle (D) rather than the Pluto toggle, because Vesta
// and Halley are not dwarf planets and Pluto keeps its own long-standing switch.

import { registerBodies } from '../bodies.js';
import { registerOrbitProvider, registerRotationModel, AU_KM, jdToDate } from '../ephemeris/index.js';
import {
  createElementSeries, seriesPosition, seriesVelocity, nearestElements, smallBodyPhase, smallBodyPath, jdTDB,
} from '../ephemeris/smallBody.js';
import { registerBakeFunction } from '../textures.js';
import { registerToggle, state } from '../state.js';
import { registerInfoRows, fmtNum } from '../ui/infoPanel.js';
import { createComet } from '../scene/comet.js';
import { SMALL_BODIES, ROTATION_MODELS } from '../data/smallBodies.js';

// ---------------------------------------------------------------------------
// Orbit provider
// ---------------------------------------------------------------------------
const seriesCache = new WeakMap();
/** The element series for a body using the `elements` provider ({ orbit: { rows } }). */
export function seriesFor(body) {
  let s = seriesCache.get(body);
  if (!s) { s = createElementSeries(body.orbit.rows); seriesCache.set(body, s); }
  return s;
}

registerOrbitProvider('elements', {
  relative: false,
  position: (body, jd) => seriesPosition(seriesFor(body), jdTDB(jd)),
  path: (body, jd, segments) => {
    const series = seriesFor(body);
    const el = nearestElements(series, jdTDB(jd));
    const gap = series.sets.length > 1 ? (series.end - series.start) / (series.sets.length - 1) : 3650;
    // resample when the nearest epoch changes (or every ~10 years outside the table)
    return { points: smallBodyPath(el, segments), startJD: jd, refreshDays: Math.max(30, gap / 2), el };
  },
  phase: (body, jd, path) => smallBodyPhase(path.el, jdTDB(jd)),
});

registerToggle({ key: 'smallBodies', label: 'Small bodies', shortcut: 'd', order: 45, title: 'Dwarf planets, Vesta and Halley’s Comet (D)' });

for (const [id, fn] of Object.entries(ROTATION_MODELS)) registerRotationModel(id, fn);

// ---------------------------------------------------------------------------
// Procedural surfaces (artistic, guided by Dawn / ground-based observations)
// ---------------------------------------------------------------------------
registerBakeFunction('ceres', /* glsl */ `
vec4 ceres(vec3 dir, float lat, float lon){
  float n = fbm(dir * 3.0 + seed, 6);
  vec2 c = craters(dir * 6.0, 0.65) + craters(dir * 15.0, 0.75) * 0.6 + craters(dir * 38.0, 0.8) * 0.3;
  vec3 col = mix(vec3(0.30, 0.29, 0.28), vec3(0.42, 0.41, 0.39), n * 0.5 + 0.5);
  col *= 1.0 + c.y * 0.8;
  // Occator crater's bright faculae (19.8°N, 239.3°E) and Ahuna Mons (10.5°S, 316.2°E)
  float occ = spot(lat, lon, radians(19.8), radians(239.3), 0.08, 0.08);
  float fac = spot(lat, lon, radians(19.8), radians(239.3), 0.018, 0.018) + spot(lat, lon, radians(20.4), radians(241.0), 0.012, 0.01) * 0.7;
  col = mix(col, vec3(0.24, 0.23, 0.22), occ * 0.5);
  col = mix(col, vec3(0.95, 0.95, 0.93), clamp(fac, 0.0, 1.0));
  float ahuna = spot(lat, lon, radians(-10.5), radians(316.2), 0.03, 0.03);
  col = mix(col, vec3(0.55, 0.54, 0.52), ahuna * 0.6);
  return vec4(col, clamp(0.5 + c.x * 0.6 + n * 0.12 - occ * 0.15 + ahuna * 0.25, 0.0, 1.0));
}`);

registerBakeFunction('vesta', /* glsl */ `
vec4 vesta(vec3 dir, float lat, float lon){
  float n = fbm(dir * 2.5 + seed, 6);
  vec2 c = craters(dir * 5.0, 0.7) + craters(dir * 13.0, 0.75) * 0.6 + craters(dir * 32.0, 0.8) * 0.3;
  vec3 col = mix(vec3(0.50, 0.47, 0.42), vec3(0.68, 0.64, 0.58), n * 0.5 + 0.5);
  // dark carbonaceous streaks near the equator, bright southern basin floor
  float dark = smoothstep(0.15, 0.45, fbm(dir * 4.0 + 3.0, 4)) * gauss(degrees(lat), 5.0, 30.0);
  col = mix(col, vec3(0.30, 0.28, 0.26), dark * 0.6);
  // Rheasilvia (75°S) with its central peak, overlapping the older Veneneia basin
  float d = (degrees(lat) + 75.0) / 30.0;
  float basin = 1.0 - smoothstep(0.7, 1.0, abs(d));
  float peak = gauss(degrees(lat), -88.0, 6.0);
  float ven = spot(lat, lon, radians(-52.0), radians(170.0), 0.45, 0.3);
  col = mix(col, vec3(0.72, 0.68, 0.62), basin * 0.25);
  col *= 1.0 + c.y * 0.9;
  float h = 0.5 + c.x * 0.6 + n * 0.15 - basin * 0.25 + peak * 0.35 - ven * 0.12 + ridged(dir * 6.0, 3) * basin * 0.12;
  return vec4(col, clamp(h, 0.0, 1.0));
}`);

registerBakeFunction('eris', /* glsl */ `
vec4 eris(vec3 dir, float lat, float lon){
  float n = fbm(dir * 2.0 + seed, 5);
  float f = fbm(dir * 9.0 + 2.0, 4);
  vec3 col = mix(vec3(0.86, 0.86, 0.85), vec3(0.97, 0.97, 0.96), n * 0.5 + 0.5);
  col = mix(col, vec3(0.80, 0.78, 0.76), smoothstep(0.2, 0.6, f) * 0.35);
  return vec4(col, clamp(0.5 + n * 0.08 + f * 0.05, 0.0, 1.0));
}`);

registerBakeFunction('haumea', /* glsl */ `
vec4 haumea(vec3 dir, float lat, float lon){
  float n = fbm(dir * 3.0 + seed, 5);
  vec2 c = craters(dir * 7.0, 0.7) * 0.4;
  vec3 col = mix(vec3(0.80, 0.82, 0.84), vec3(0.93, 0.95, 0.97), n * 0.5 + 0.5);
  // the dark red spot seen in its light curve
  float red = spot(lat, lon, radians(10.0), radians(60.0), 0.35, 0.28);
  col = mix(col, vec3(0.55, 0.36, 0.30), red * 0.7);
  col *= 1.0 + c.y * 0.4;
  return vec4(col, clamp(0.5 + c.x * 0.5 + n * 0.1, 0.0, 1.0));
}`);

registerBakeFunction('makemake', /* glsl */ `
vec4 makemake(vec3 dir, float lat, float lon){
  float n = fbm(dir * 2.5 + seed, 6);
  float m = smoothstep(-0.1, 0.35, fbm(dir * 1.5 + 7.0, 5));
  vec3 col = mix(vec3(0.66, 0.48, 0.36), vec3(0.86, 0.74, 0.62), n * 0.5 + 0.5);
  col = mix(col, vec3(0.92, 0.88, 0.82), m * 0.45);
  return vec4(col, clamp(0.5 + n * 0.12 + m * 0.05, 0.0, 1.0));
}`);

registerBakeFunction('halley', /* glsl */ `
vec4 halley(vec3 dir, float lat, float lon){
  float n = fbm(dir * 2.0 + seed, 6);
  float r = ridged(dir * 5.0 + 1.0, 4);
  vec2 c = craters(dir * 6.0, 0.6) * 0.5;
  vec3 col = mix(vec3(0.07, 0.065, 0.06), vec3(0.16, 0.15, 0.14), n * 0.5 + 0.5);
  // two active, slightly brighter regions on the sunward side (Giotto images)
  col += vec3(0.08, 0.08, 0.08) * spot(lat, lon, radians(20.0), radians(30.0), 0.25, 0.2);
  col *= 1.0 + c.y * 0.5;
  return vec4(col, clamp(0.5 + n * 0.3 + r * 0.15 + c.x * 0.4, 0.0, 1.0));
}`);

// ---------------------------------------------------------------------------
// Bodies
// ---------------------------------------------------------------------------
registerBodies(SMALL_BODIES);

const fmtYear = (jd) => jdToDate(jd).getUTCFullYear();
const fmtDate = (jd) => jdToDate(jd).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });

/** Perihelion time nearest `guess` (TDB), refined with the elements nearest to it. */
function perihelionNear(series, guess) {
  let tp = guess;
  for (let i = 0; i < 4; i++) {
    const el = nearestElements(series, tp);
    const M = el.M0 + el.n * (tp - el.epoch);
    const dM = Math.atan2(Math.sin(M), Math.cos(M)); // −π…π from perihelion
    tp -= dM / el.n;
  }
  return tp;
}

/** Last and next perihelion passages around jd (TDB). */
export function perihelia(series, jd) {
  const el = nearestElements(series, jd);
  const period = (2 * Math.PI) / el.n;
  const M = el.M0 + el.n * (jd - el.epoch);
  const since = ((M % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) / el.n;
  const last = perihelionNear(series, jd - since);
  return { last, next: perihelionNear(series, last + period) };
}

export default {
  id: 'smallBodies',

  setup(app) {
    // Halley: coma and tails
    const halley = app.bodies.halley;
    this.comet = createComet();
    app.scene.add(this.comet.group);
    this.halley = halley;

    // Fly to a comet from the side, far enough back to frame its tail
    app.on('select', (id) => {
      if (id !== 'halley' || !halley.group.visible) return;
      const len = this.comet.sceneLength(halley.au, app.blend ?? 1);
      if (len <= halley.radius * 10) return;
      app.rig.flyTo(halley, { distance: len * 1.5 });
      const toSun = halley.position.clone().negate().normalize();
      const up = new app.THREE.Vector3(0, 1, 0);
      const side = new app.THREE.Vector3().crossVectors(toSun, up).normalize();
      app.rig.flight.endDir.copy(side).addScaledVector(up, 0.35).addScaledVector(toSun, 0.3).normalize();
    });

    registerInfoRows((body) => {
      if (body.data.orbit?.kind !== 'elements') return [];
      const series = seriesFor(body.data);
      const jd = jdTDB(state.jd);
      const p = body.au;
      const r = Math.hypot(p.x, p.y, p.z);
      const v = seriesVelocity(series, jd);
      const rows = [
        ['Orbital speed', `${fmtNum((Math.hypot(v.x, v.y, v.z) * AU_KM) / 86400, 2)} km/s`],
        ['Ecliptic lon / lat', `${fmtNum(((Math.atan2(p.y, p.x) * 180) / Math.PI + 360) % 360, 2)}° / ${fmtNum((Math.asin(p.z / r) * 180) / Math.PI, 2)}°`],
      ];
      if (body.data.comet) {
        const { last, next } = perihelia(series, jd);
        rows.push(['Last perihelion', fmtDate(last)], ['Next perihelion', fmtDate(next)]);
      }
      const span = `${fmtYear(series.start)}–${fmtYear(series.end)}`;
      const inside = jd >= series.start && jd <= series.end;
      rows.push(['Orbit data', inside ? `JPL elements, valid ${span}` : `Extrapolated (JPL elements cover ${span})`]);
      return rows;
    });
  },

  update(app) {
    // Triaxial shapes: stretch the unit sphere (mesh +Y is the spin axis)
    for (const data of SMALL_BODIES) {
      const b = app.bodies[data.id];
      if (!b?.mesh || !data.axesKm) continue;
      const [a, bb, c] = data.axesKm;
      const k = b.radius / data.radiusKm;
      b.mesh.scale.set(a * k, c * k, bb * k);
    }
    const h = this.halley;
    if (h) {
      if (!h.group.visible) { this.comet.group.visible = false; return; }
      const series = seriesFor(h.data);
      const v = seriesVelocity(series, jdTDB(state.jd));
      this.comet.update(h.au, v, app.blend ?? 1, app.camera, h.position, h.radius);
    }
  },
};
