// The sky seen from the ground, as its own render pass: a scene around the observer using
// TRUE directions (local horizontal frame: x = East, y = Up, z = South; the camera looks along
// −z, i.e. North, at yaw 0). It never touches the orrery's heliocentric scene or camera.
//
//   backdrop   sky gradient from the Sun's altitude, twilight glow, Milky Way, moon-glow
//   stars      the Bright Star Catalogue, rotated by the local sidereal time; refraction near
//              the horizon; fainter stars fade out as the sky brightens
//   lines      constellation figures
//   grid       optional altitude / azimuth grid
//   bodies     Sun, Moon (phase and bright-limb orientation from true geometry) and planets,
//              as sprites with true angular size (never smaller than a visible minimum)
//   ground     opaque below the horizon, lit by the sky
//
// Colours are written display-referred (ACES-like curve + gamma) because this pass draws
// straight to the canvas instead of through the orrery's HDR composer.

import * as THREE from 'three';
import { NOISE } from '../shaders/noise.js';
import { STAR_GLSL } from './sky.js';
import { constellationSegments } from './constellations.js';
import {
  DEG, J2000, skyPosition, apparentMagnitude, moonPhase, apparentGeocentric,
  equatorialToHorizontalMatrix, horizontalToVector, refractionFromTrue,
} from '../ephemeris/index.js';

export const SKY_BODIES = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
const BODY_COLOR = {
  sun: [1.0, 0.96, 0.86], moon: [0.98, 0.95, 0.88], mercury: [0.85, 0.82, 0.78], venus: [1.0, 0.97, 0.86],
  mars: [1.0, 0.62, 0.42], jupiter: [1.0, 0.93, 0.8], saturn: [1.0, 0.9, 0.66], uranus: [0.7, 0.95, 0.95], neptune: [0.55, 0.7, 1.0],
};

// ---------------------------------------------------------------------------
// Sky model (JS side): what the sky looks like for a given Sun altitude
// ---------------------------------------------------------------------------
// [sun altitude°, zenith rgb, horizon rgb, twilight-glow rgb, glow strength] — display-referred
const STOPS = [
  [-25, [0.002, 0.003, 0.010], [0.012, 0.016, 0.032], [0.2, 0.2, 0.3], 0.0],
  [-18, [0.004, 0.007, 0.020], [0.022, 0.030, 0.060], [0.3, 0.25, 0.4], 0.0],
  [-13, [0.012, 0.024, 0.075], [0.100, 0.115, 0.230], [0.35, 0.25, 0.45], 0.10],
  [-9, [0.035, 0.065, 0.180], [0.290, 0.250, 0.440], [0.65, 0.32, 0.45], 0.30],
  [-5, [0.090, 0.155, 0.350], [0.760, 0.430, 0.390], [0.95, 0.42, 0.30], 0.60],
  [-1, [0.200, 0.330, 0.620], [0.950, 0.640, 0.400], [1.0, 0.56, 0.26], 0.85],
  [2, [0.260, 0.450, 0.760], [0.880, 0.800, 0.740], [1.0, 0.74, 0.42], 0.55],
  [15, [0.200, 0.440, 0.850], [0.640, 0.790, 0.950], [1.0, 0.92, 0.75], 0.12],
];

const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

/** Sky colours for a Sun altitude in degrees. */
export function skyColors(sunAlt) {
  let i = 0;
  while (i < STOPS.length - 2 && sunAlt > STOPS[i + 1][0]) i++;
  const [a0, z0, h0, g0, s0] = STOPS[i], [a1, z1, h1, g1, s1] = STOPS[i + 1];
  const t = Math.min(1, Math.max(0, (sunAlt - a0) / (a1 - a0)));
  return {
    zenith: lerp3(z0, z1, t), horizon: lerp3(h0, h1, t), glow: lerp3(g0, g1, t), glowAmt: s0 + (s1 - s0) * t,
    day: smooth(-8, 4, sunAlt), night: smooth(-11, -19, sunAlt),
  };
}

/** Faintest visible magnitude for a Sun altitude (naked eye; bright planets stay visible into twilight). */
export function limitingMagnitude(sunAlt) {
  const pts = [[-18, 6.5], [-12, 3.8], [-6, 1.0], [-1, -2.5], [3, -4.2]];
  if (sunAlt <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (sunAlt <= pts[i][0]) { const [a, m] = pts[i - 1], [b, n] = pts[i]; return m + (n - m) * (sunAlt - a) / (b - a); }
  }
  return pts[pts.length - 1][1];
}

// ---------------------------------------------------------------------------
// GLSL
// ---------------------------------------------------------------------------
const DISPLAY_GLSL = /* glsl */ `
  vec3 display(vec3 c){
    c *= 1.05;
    vec3 a = (c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14);
    return pow(clamp(a, 0.0, 1.0), vec3(1.0 / 2.2));
  }`;

/** Saemundsson refraction of a direction in the horizontal frame (y = up). */
const REFRACT_GLSL = /* glsl */ `
  vec3 refractDir(vec3 d){
    float alt = asin(clamp(d.y, -1.0, 1.0));
    float a = degrees(alt);
    if (a < -1.9 || a > 70.0) return d;
    float hh = max(a, -1.0);
    float R = (1.02 / tan(radians(hh + 10.3 / (hh + 5.11))) + 0.0019279) / 60.0;
    if (a < -1.0) R *= (a + 1.9) / 0.9;
    float na = alt + radians(R);
    vec2 hz = d.xz / max(cos(alt), 1e-5);
    return vec3(hz.x * cos(na), sin(na), hz.y * cos(na));
  }`;

const RAY_VERT = /* glsl */ `
  varying vec2 vNdc;
  void main(){ vNdc = position.xy; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const BACKDROP_FRAG = NOISE + DISPLAY_GLSL + /* glsl */ `
  uniform mat3 camRot, horToGal;
  uniform vec2 tanHalf;
  uniform vec3 zenithCol, horizonCol, glowCol, sunDir, moonDir;
  uniform float glowAmt, mwAmt, moonGlow, day;
  varying vec2 vNdc;
  void main(){
    vec3 d = normalize(camRot * vec3(vNdc * tanHalf, -1.0));
    float h = d.y;
    vec3 col = mix(horizonCol, zenithCol, pow(clamp(h, 0.0, 1.0), 0.42));
    float ang = acos(clamp(dot(d, sunDir), -1.0, 1.0));
    float low = exp(-max(h, 0.0) * 4.0);
    col += glowCol * glowAmt * 0.8 * exp(-ang * 2.0) * (0.3 + 0.7 * low);
    col += vec3(1.0, 0.95, 0.85) * day * 0.5 * exp(-ang * 7.0);   // daylight scatter around the Sun
    // moonlight
    float am = acos(clamp(dot(d, moonDir), -1.0, 1.0));
    col += vec3(0.30, 0.38, 0.58) * moonGlow * (0.10 * exp(-am * 2.5) + 0.02);
    // Milky Way
    if (mwAmt > 0.003 && h > -0.05) {
      vec3 g = horToGal * d;
      float b = asin(clamp(g.z, -1.0, 1.0));
      float l = atan(g.y, g.x);
      float core = exp(-pow(l / 0.9, 2.0)) * exp(-pow(b / 0.22, 2.0));
      float band = exp(-pow(b / (0.16 + 0.06 * cos(l)), 2.0));
      float clouds = fbm(d * 5.0, 5) * 0.5 + 0.5;
      float fine = fbm(d * 22.0, 3) * 0.5 + 0.5;
      float dust = smoothstep(0.45, 0.75, fbm(d * 7.0 + 11.0, 4) * 0.5 + 0.5) * exp(-pow(b / 0.06, 2.0));
      float m = band * (0.35 + 0.65 * clouds) * (0.7 + 0.5 * fine) + core * 1.4;
      m *= 1.0 - dust * 0.85;
      vec3 warm = vec3(1.0, 0.86, 0.68), cool = vec3(0.55, 0.65, 0.95);
      vec3 mw = mix(cool, warm, clamp(core * 1.5 + 0.2, 0.0, 1.0)) * m * 0.075;
      mw += vec3(0.5, 0.15, 0.25) * pow(clouds, 6.0) * band * 0.04;
      col += pow(mw, vec3(0.85)) * 1.6 * mwAmt * smoothstep(-0.05, 0.12, h);
    }
    gl_FragColor = vec4(col, 1.0);
  }`;

const GROUND_FRAG = DISPLAY_GLSL + /* glsl */ `
  uniform mat3 camRot;
  uniform vec2 tanHalf;
  uniform vec3 horizonCol, groundCol;
  uniform float day;
  varying vec2 vNdc;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p){
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  void main(){
    vec3 d = normalize(camRot * vec3(vNdc * tanHalf, -1.0));
    if (d.y >= 0.0) discard;
    float depth = -d.y;
    vec2 p = d.xz / max(depth, 0.002);
    float tex = 0.5 * vnoise(p * 0.8) + 0.3 * vnoise(p * 3.1) + 0.2 * vnoise(p * 11.0);
    tex = mix(0.5, tex, smoothstep(0.015, 0.25, depth));
    vec3 base = groundCol * (0.7 + 0.6 * tex);
    vec3 haze = horizonCol * 0.5 + groundCol * 0.5;
    vec3 col = mix(haze, base, smoothstep(0.0, 0.10, depth));
    col *= mix(1.0, 0.55, smoothstep(0.1, 1.0, depth));
    gl_FragColor = vec4(col, 1.0);
  }`;

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------
const GAL_NGP = [192.85948, 27.12825], GAL_GC = [266.4051, -28.93617];
const eqUnit = (ra, dec) => new THREE.Vector3(Math.cos(dec * DEG) * Math.cos(ra * DEG), Math.cos(dec * DEG) * Math.sin(ra * DEG), Math.sin(dec * DEG));
function galacticMatrix() { // rows: galactic x (to the centre), y, z (north pole) in J2000 equatorial coordinates
  const z = eqUnit(...GAL_NGP), gc = eqUnit(...GAL_GC);
  const x = gc.sub(z.clone().multiplyScalar(gc.dot(z))).normalize();
  const y = new THREE.Vector3().crossVectors(z, x);
  return new THREE.Matrix3().set(x.x, x.y, x.z, y.x, y.y, y.z, z.x, z.y, z.z);
}

function fullscreenTriangle(material, order) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = order;
  return mesh;
}

/**
 * @param {THREE.WebGLRenderer} renderer
 * @param {{cat: object, figures: object[]}} data  from loadSkyData()
 */
export function createSkyView(renderer, data) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  camera.rotation.order = 'YXZ';

  const U = {
    camRot: { value: new THREE.Matrix3() },
    tanHalf: { value: new THREE.Vector2(1, 1) },
    eqToHor: { value: new THREE.Matrix3() },
    horToGal: { value: new THREE.Matrix3() },
    years: { value: 0 },
    limMag: { value: 6.5 },
    pixelRatio: { value: 1 },
    viewport: { value: new THREE.Vector2(1, 1) },
    pxScale: { value: 1 },
    sunDir: { value: new THREE.Vector3(0, -1, 0) },
    moonDir: { value: new THREE.Vector3(0, -1, 0) },
  };
  const galM = galacticMatrix();

  // --- backdrop and ground
  const backdropMat = new THREE.ShaderMaterial({
    uniforms: {
      camRot: U.camRot, tanHalf: U.tanHalf, horToGal: U.horToGal, sunDir: U.sunDir, moonDir: U.moonDir,
      zenithCol: { value: new THREE.Vector3() }, horizonCol: { value: new THREE.Vector3() }, glowCol: { value: new THREE.Vector3() },
      glowAmt: { value: 0 }, mwAmt: { value: 1 }, moonGlow: { value: 0 }, day: { value: 0 },
    },
    vertexShader: RAY_VERT, fragmentShader: BACKDROP_FRAG, depthTest: false, depthWrite: false,
  });
  scene.add(fullscreenTriangle(backdropMat, 0));

  const groundMat = new THREE.ShaderMaterial({
    uniforms: {
      camRot: U.camRot, tanHalf: U.tanHalf, horizonCol: backdropMat.uniforms.horizonCol, groundCol: { value: new THREE.Vector3() },
      day: backdropMat.uniforms.day,
    },
    vertexShader: RAY_VERT, fragmentShader: GROUND_FRAG, depthTest: false, depthWrite: false, transparent: true, blending: THREE.NoBlending,
  });
  scene.add(fullscreenTriangle(groundMat, 20));

  // --- stars
  const { cat, figures } = data;
  const n = cat.count;
  const dir = new Float32Array(n * 3), vel = new Float32Array(n * 3), mag = new Float32Array(n), color = new Float32Array(n * 3);
  const MAS = DEG / 3.6e6;
  const tint = (bv) => { // pale star colours from B−V (cheap two-segment ramp: blue-white → white → orange)
    const b = Math.min(2, Math.max(-0.4, bv));
    return b < 0.6 ? [0.62 + 0.38 * (b + 0.4), 0.74 + 0.26 * (b + 0.4), 1.0] : [1.0, 1.0 - 0.28 * (b - 0.6), 1.0 - 0.62 * Math.min(1, (b - 0.6) / 1.2)];
  };
  for (let i = 0; i < n; i++) {
    const a = cat.ra[i] * DEG, d = cat.dec[i] * DEG;
    const ca = Math.cos(a), sa = Math.sin(a), cd = Math.cos(d), sd = Math.sin(d);
    dir.set([cd * ca, cd * sa, sd], i * 3);
    const e = cat.pmra[i] * MAS, nn = cat.pmdec[i] * MAS;
    vel.set([-sa * e - sd * ca * nn, ca * e - sd * sa * nn, cd * nn], i * 3);
    mag[i] = cat.vmag[i];
    const c = tint(cat.bv[i]);
    const soft = 0.75; // pale colours
    color.set(c.map((v) => 1 - soft + soft * v), i * 3);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(dir, 3));
  starGeo.setAttribute('vel', new THREE.BufferAttribute(vel, 3));
  starGeo.setAttribute('mag', new THREE.BufferAttribute(mag, 1));
  starGeo.setAttribute('color', new THREE.BufferAttribute(color, 3));
  const starMat = new THREE.ShaderMaterial({
    uniforms: { eqToHor: U.eqToHor, years: U.years, limMag: U.limMag, pixelRatio: U.pixelRatio },
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    vertexShader: STAR_GLSL + REFRACT_GLSL + /* glsl */ `
      attribute vec3 vel; attribute float mag; attribute vec3 color;
      uniform mat3 eqToHor; uniform float years, limMag, pixelRatio;
      varying vec3 vColor;
      void main(){
        vec3 d = refractDir(normalize(eqToHor * properMotion(position, vel, years)));
        gl_Position = projectionMatrix * modelViewMatrix * vec4(d * 10.0, 1.0);
        float size = starSize(mag) * pixelRatio;
        float s = max(size, 2.0 * pixelRatio);
        float vis = clamp(limMag - mag + 0.6, 0.0, 1.0);
        vColor = color * starBrightness(mag) * (size * size) / (s * s) * vis * vis;
        gl_PointSize = s;
      }`,
    fragmentShader: DISPLAY_GLSL + /* glsl */ `
      varying vec3 vColor;
      void main(){
        vec2 c = gl_PointCoord - 0.5;
        float r2 = dot(c, c) * 4.0;
        float a = exp(-r2 * 4.0) - 0.02;
        gl_FragColor = vec4(display(vColor * max(a, 0.0) * 1.6), 1.0);
      }`,
  });
  const stars = new THREE.Points(starGeo, starMat);
  stars.frustumCulled = false;
  stars.renderOrder = 1;
  scene.add(stars);

  // --- constellation figures
  const pairs = constellationSegments(figures);
  const m2 = pairs.length * 2;
  const lp = new Float32Array(m2 * 3), lv = new Float32Array(m2 * 3), lo = new Float32Array(m2 * 3), lov = new Float32Array(m2 * 3), lm = new Float32Array(m2);
  const cp = (dst, di, src, si) => { dst[di * 3] = src[si * 3]; dst[di * 3 + 1] = src[si * 3 + 1]; dst[di * 3 + 2] = src[si * 3 + 2]; };
  pairs.forEach(([a, b], k) => {
    for (const [v, self, far] of [[2 * k, a, b], [2 * k + 1, b, a]]) {
      cp(lp, v, dir, self); cp(lv, v, vel, self); cp(lo, v, dir, far); cp(lov, v, vel, far); lm[v] = mag[self];
    }
  });
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(lp, 3));
  lineGeo.setAttribute('vel', new THREE.BufferAttribute(lv, 3));
  lineGeo.setAttribute('other', new THREE.BufferAttribute(lo, 3));
  lineGeo.setAttribute('otherVel', new THREE.BufferAttribute(lov, 3));
  lineGeo.setAttribute('mag', new THREE.BufferAttribute(lm, 1));
  const lineMat = new THREE.ShaderMaterial({
    uniforms: { eqToHor: U.eqToHor, years: U.years, pixelRatio: U.pixelRatio, viewportHeight: { value: 800 }, opacity: { value: 0 }, color: { value: new THREE.Color(0.2, 0.3, 0.55) } },
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    vertexShader: STAR_GLSL + REFRACT_GLSL + /* glsl */ `
      attribute vec3 vel, other, otherVel; attribute float mag;
      uniform mat3 eqToHor; uniform float years, pixelRatio, viewportHeight;
      void main(){
        vec3 a = properMotion(position, vel, years);
        vec3 b = properMotion(other, otherVel, years);
        float ang = acos(clamp(dot(a, b), -1.0, 1.0));
        float gapPx = (starSize(mag) * 0.5 + 4.0) * pixelRatio;
        float gap = gapPx / (projectionMatrix[1][1] * viewportHeight * 0.5);
        float t = min(gap / max(ang, 1e-6), 0.5);
        vec3 d = refractDir(normalize(eqToHor * normalize(mix(a, b, t))));
        gl_Position = projectionMatrix * modelViewMatrix * vec4(d * 10.0, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 color; uniform float opacity;
      void main(){ gl_FragColor = vec4(color * opacity, 1.0); }`,
  });
  const lines = new THREE.LineSegments(lineGeo, lineMat);
  lines.frustumCulled = false;
  lines.renderOrder = 2;
  lines.visible = false;
  scene.add(lines);

  // --- alt / az grid
  const gridPts = [];
  const R = 10;
  const addArc = (f) => { let prev = null; for (let i = 0; i <= 120; i++) { const p = f(i / 120); if (prev) gridPts.push(...prev, ...p); prev = p; } };
  for (const alt of [15, 30, 45, 60, 75]) addArc((t) => { const v = horizontalToVector(alt, t * 360); return [v.x * R, v.y * R, v.z * R]; });
  for (let az = 0; az < 360; az += 30) addArc((t) => { const v = horizontalToVector(t * 90, az); return [v.x * R, v.y * R, v.z * R]; });
  const gridGeo = new THREE.BufferGeometry();
  gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(gridPts, 3));
  const grid = new THREE.LineSegments(gridGeo, new THREE.LineBasicMaterial({ color: 0x5f8fd0, transparent: true, opacity: 0.3, depthTest: false, toneMapped: false }));
  grid.renderOrder = 3;
  grid.frustumCulled = false;
  grid.visible = false;
  scene.add(grid);
  // the horizon itself, always visible: a thin bright line
  const horizonPts = [];
  for (let i = 0; i < 180; i++) {
    const a = horizontalToVector(0, i * 2), b = horizontalToVector(0, (i + 1) * 2);
    horizonPts.push(a.x * R, a.y * R, a.z * R, b.x * R, b.y * R, b.z * R);
  }
  const horizonGeo = new THREE.BufferGeometry();
  horizonGeo.setAttribute('position', new THREE.Float32BufferAttribute(horizonPts, 3));
  const horizonLine = new THREE.LineSegments(horizonGeo, new THREE.LineBasicMaterial({ color: 0x9fb8e0, transparent: true, opacity: 0.18, depthTest: false, toneMapped: false }));
  horizonLine.renderOrder = 4;
  horizonLine.frustumCulled = false;
  scene.add(horizonLine);

  // --- body sprites
  const spriteGeo = new THREE.PlaneGeometry(2, 2);
  const SPRITE_VERT = /* glsl */ `
    uniform vec3 dir; uniform float radiusRad, pxScale, minPx, padScale, pixelRatio, glowPx; uniform vec2 viewport;
    varying vec2 vP; varying float vR, vHalf;
    void main(){
      float R = max(radiusRad * pxScale, minPx * pixelRatio);
      float half_ = max(R * padScale, glowPx * 4.0);
      vec4 c = projectionMatrix * modelViewMatrix * vec4(dir * 10.0, 1.0);
      vec2 off = position.xy * half_;
      gl_Position = c.w > 0.0 ? vec4(c.xy + off * 2.0 / viewport * c.w, c.z, c.w) : vec4(2.0, 2.0, 2.0, 1.0);
      vP = off; vR = R; vHalf = half_;
    }`;
  const SPRITE_FRAG = NOISE + DISPLAY_GLSL + /* glsl */ `
    uniform vec3 color, sunLight, rt, up, bk, north;
    uniform float kind, glowPx, intensity, pixelRatio, day, fraction, earthshine, darkAlpha;
    varying vec2 vP; varying float vR, vHalf;
    vec3 tone(vec3 c){ return c / (1.0 + c); }      // additive light: linear near zero, so glow tails vanish
    void main(){
      float d = length(vP);
      float r = d / vR;
      float win = 1.0 - smoothstep(0.45, 1.0, d / vHalf);   // fade glow to zero before the quad's edge
      if (kind > 1.5) {            // the Sun
        float edge = smoothstep(1.0, 1.0 - 1.2 / vR, r);
        float mu = sqrt(max(0.0, 1.0 - min(r, 1.0) * min(r, 1.0)));
        vec3 discC = display(color * (0.78 + 0.22 * mu) * 1.6);
        vec3 glow = color * (0.9 * exp(-d / (vR * 2.2)) + 0.22 * exp(-d / (vR * 8.0))) * win;
        gl_FragColor = vec4(discC * edge + tone(glow) * (1.0 - edge), edge);
        return;
      }
      bool sphere = kind > 0.5 || vR > 2.6 * pixelRatio;
      vec3 disc = vec3(0.0);
      float alpha = 0.0;
      vec3 add = vec3(0.0);
      if (sphere) {
        if (r < 1.0) {
          vec2 p = vP / vR;
          float z = sqrt(max(0.0, 1.0 - dot(p, p)));
          vec3 n = normalize(p.x * rt + p.y * up + z * bk);
          float lit = dot(n, sunLight);
          float lam = max(lit, 0.0);
          float shade = clamp(2.0 * lam / (lam + z + 0.001), 0.0, 1.0) * smoothstep(0.0, 0.06, lit);
          vec3 albedo = color;
          if (kind > 0.5) {          // the Moon: maria and craters, fixed to the body in a north-up frame
            vec3 east = cross(bk, north);
            vec3 q = vec3(dot(n, east), dot(n, north), dot(n, bk));
            float mare = smoothstep(0.05, 0.35, fbm(q * 1.6 + 3.0, 4) * 0.5 + 0.5 - 0.30);
            float cr = fbm(q * 9.0, 3) * 0.5 + 0.5;
            albedo = color * (0.93 - 0.30 * mare - 0.14 * cr + 0.1 * smoothstep(0.62, 0.9, cr));
          }
          float edge = smoothstep(1.0, 1.0 - 1.4 / vR, r);
          vec3 lum = albedo * shade * 1.15 + vec3(0.020, 0.028, 0.042) * earthshine * (1.0 - day) * (1.0 - shade);
          alpha = mix(darkAlpha, 1.0, shade) * edge;
          disc = display(lum) * alpha;
        }
        if (kind > 0.5) add += vec3(0.8, 0.85, 1.0) * pow(fraction, 1.5) * 0.5 * exp(-d / glowPx) * win;
      } else {
        add += color * (1.3 * exp(-pow(d / max(vR, 1.2 * pixelRatio), 2.0) * 1.3) + 0.35 * exp(-d / glowPx) * win);
      }
      gl_FragColor = vec4(disc + tone(add * intensity) * (1.0 - alpha), alpha);
    }`;
  const bodies = {};
  for (const id of SKY_BODIES) {
    const kind = id === 'sun' ? 2 : id === 'moon' ? 1 : 0;
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        dir: { value: new THREE.Vector3(0, -1, 0) }, radiusRad: { value: 0 }, pxScale: U.pxScale, minPx: { value: kind === 2 ? 11 : kind === 1 ? 9 : 0 },
        padScale: { value: kind === 2 ? 22 : kind === 1 ? 5 : 3 }, pixelRatio: U.pixelRatio, viewport: U.viewport,
        color: { value: new THREE.Vector3(...BODY_COLOR[id]) }, kind: { value: kind }, glowPx: { value: 8 }, intensity: { value: 1 },
        sunLight: { value: new THREE.Vector3(0, 1, 0) }, rt: { value: new THREE.Vector3(1, 0, 0) }, up: { value: new THREE.Vector3(0, 1, 0) },
        bk: { value: new THREE.Vector3(0, 0, 1) }, north: { value: new THREE.Vector3(0, 1, 0) },
        day: backdropMat.uniforms.day, fraction: { value: 1 }, earthshine: { value: 0 }, darkAlpha: { value: 0.1 },
      },
      vertexShader: SPRITE_VERT, fragmentShader: SPRITE_FRAG, transparent: true, depthTest: false, depthWrite: false,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    const mesh = new THREE.Mesh(spriteGeo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = id === 'sun' ? 5 : id === 'moon' ? 6 : 7;
    scene.add(mesh);
    bodies[id] = mesh;
  }

  // -------------------------------------------------------------------------
  // Per-frame update
  // -------------------------------------------------------------------------
  const sky = { bodies: {}, sunAlt: -90, moon: null, limMag: 6.5, key: '' };
  const camRight = new THREE.Vector3(), camUp = new THREE.Vector3();

  function updateSky(jd, obs, pixelRatio) {
    const key = `${jd}|${obs.lat}|${obs.lon}|${obs.elevation || 0}`;
    if (key === sky.key) return;
    sky.key = key;
    // equatorial J2000 → horizontal
    const m = equatorialToHorizontalMatrix(jd, obs.lat, obs.lon);
    U.eqToHor.value.set(...m);
    const eqToHorT = U.eqToHor.value.clone().transpose();
    U.horToGal.value.multiplyMatrices(galM, eqToHorT);
    U.years.value = (jd - J2000) / 365.25;
    sky.celestialPole = new THREE.Vector3(m[2], m[5], m[8]); // image of the equatorial z axis

    const ph = moonPhase(jd);
    sky.moon = ph;
    for (const id of SKY_BODIES) {
      const s = skyPosition(id, jd, obs);
      const geo = horizontalToVector(s.alt, s.az);
      const app = horizontalToVector(s.altApparent, s.az);
      const mg = apparentMagnitude(id, jd);
      sky.bodies[id] = {
        id, alt: s.alt, altApparent: s.altApparent, az: s.az, mag: mg, semiDiameter: s.semiDiameter,
        dir: new THREE.Vector3(app.x, app.y, app.z), geo: new THREE.Vector3(geo.x, geo.y, geo.z), dist: s.distAU, ra: s.ra, dec: s.dec,
      };
    }
    const sunAlt = sky.bodies.sun.alt;
    sky.sunAlt = sunAlt;
    const col = skyColors(sunAlt);
    const moon = sky.bodies.moon;
    const moonUp = smooth(-3, 12, moon.alt);
    const moonLight = ph.fraction * moonUp * (1 - col.day);
    sky.limMag = limitingMagnitude(sunAlt) - 2.6 * moonLight * smooth(-8, -18, sunAlt);
    U.limMag.value = sky.limMag;
    const bu = backdropMat.uniforms;
    bu.zenithCol.value.set(...col.zenith); bu.horizonCol.value.set(...col.horizon); bu.glowCol.value.set(...col.glow);
    bu.glowAmt.value = col.glowAmt; bu.day.value = col.day;
    bu.mwAmt.value = col.night * (1 - 0.8 * moonLight);
    bu.moonGlow.value = moonLight;
    U.sunDir.value.copy(sky.bodies.sun.dir);
    U.moonDir.value.copy(moon.dir);
    const g = 0.012 + 0.2 * col.day + 0.04 * moonLight;
    groundMat.uniforms.groundCol.value.set(g * 0.9, g, g * 0.85);

    // sprites
    const sunGeo = sky.bodies.sun.geo;
    for (const id of SKY_BODIES) {
      const b = sky.bodies[id], u = bodies[id].material.uniforms;
      u.dir.value.copy(b.dir);
      const radius = id === 'sun' || id === 'moon' ? b.semiDiameter * DEG : planetAngularRadius(id, b.dist);
      u.radiusRad.value = radius;
      u.sunLight.value.copy(sunGeo);
      // glow size and brightness from the magnitude (same scale as the catalogue stars)
      const flux = Math.min(0.11 * Math.pow(10, -0.2 * (b.mag - 6.5)), 2.5);
      u.glowPx.value = pixelRatio * Math.min(36, Math.max(4, 2.5 * (1.2 + (4 - b.mag) * 0.55)));
      u.intensity.value = id === 'sun' ? 1 : id === 'moon' ? Math.max(0.0, 1 - col.day * 0.7) : flux * Math.min(1, Math.max(0, sky.limMag - b.mag + 0.6)) ** 2 * 1.6;
      if (id === 'moon') {
        u.fraction.value = ph.fraction;
        u.earthshine.value = 1 - ph.fraction;
        u.darkAlpha.value = 0.08 + 0.85 * smooth(-4, -16, sunAlt);
        // celestial north projected on the Moon's tangent plane
        const nrt = sky.celestialPole.clone().sub(b.dir.clone().multiplyScalar(sky.celestialPole.dot(b.dir)));
        if (nrt.lengthSq() < 1e-8) nrt.set(0, 1, 0);
        u.north.value.copy(nrt.normalize());
      }
    }
  }

  function planetAngularRadius(id, distAU) {
    const km = { mercury: 2439.7, venus: 6051.8, mars: 3396.2, jupiter: 71492, saturn: 60268, uranus: 25559, neptune: 24764 }[id];
    return Math.asin(km / (distAU * 149597870.7));
  }

  /**
   * @param {{jd:number, observer:object, yaw:number, pitch:number, fov:number, width:number, height:number,
   *          pixelRatio:number, grid:boolean, constellations:number}} p   angles in degrees; width/height in CSS px
   */
  function update(p) {
    camera.aspect = p.width / p.height;
    camera.fov = p.fov;
    camera.rotation.set(p.pitch * DEG, -p.yaw * DEG, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    const th = Math.tan(p.fov * DEG / 2);
    U.tanHalf.value.set(th * camera.aspect, th);
    U.camRot.value.setFromMatrix4(camera.matrixWorld);
    U.pixelRatio.value = p.pixelRatio;
    U.viewport.value.set(p.width * p.pixelRatio, p.height * p.pixelRatio);
    U.pxScale.value = (p.height * p.pixelRatio / 2) / th;
    lineMat.uniforms.viewportHeight.value = p.height * p.pixelRatio;
    updateSky(p.jd, p.observer, p.pixelRatio);

    // per-sprite camera-dependent vectors (for sphere shading)
    camRight.setFromMatrixColumn(camera.matrixWorld, 0);
    camUp.setFromMatrixColumn(camera.matrixWorld, 1);
    for (const id of SKY_BODIES) {
      const u = bodies[id].material.uniforms, d = u.dir.value;
      const rt = u.rt.value.copy(camRight).addScaledVector(d, -camRight.dot(d)).normalize();
      u.bk.value.copy(d).negate();
      u.up.value.crossVectors(u.bk.value, rt);
    }
    lines.visible = p.constellations > 0.01;
    lineMat.uniforms.opacity.value = p.constellations * smooth(-4, -13, sky.sunAlt);
    grid.visible = !!p.grid;
  }

  const vec = new THREE.Vector3();
  /** Project a direction (horizontal frame) to CSS pixels; `visible` is false behind the camera. */
  function project(d, width, height, out = {}) {
    vec.copy(d).transformDirection(camera.matrixWorldInverse);
    out.visible = vec.z < -1e-4;
    if (out.visible) {
      const sx = vec.x / -vec.z / U.tanHalf.value.x, sy = vec.y / -vec.z / U.tanHalf.value.y;
      out.x = (sx * 0.5 + 0.5) * width; out.y = (1 - (sy * 0.5 + 0.5)) * height;
      out.visible = Math.abs(sx) < 1.3 && Math.abs(sy) < 1.3;
    }
    return out;
  }

  return {
    scene, camera, sky, update, project,
    render() { renderer.setRenderTarget(null); renderer.render(scene, camera); },
    /** apparent horizontal direction of a J2000 equatorial point (RA/Dec deg), for labels */
    starDirection(ra, dec, out = new THREE.Vector3()) {
      const e = eqUnit(ra, dec);
      const m = U.eqToHor.value.elements; // column-major
      out.set(m[0] * e.x + m[3] * e.y + m[6] * e.z, m[1] * e.x + m[4] * e.y + m[7] * e.z, m[2] * e.x + m[5] * e.y + m[8] * e.z);
      return out.normalize();
    },
    refractionDeg: refractionFromTrue,
    apparentGeocentric,
    dispose() {
      scene.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
    },
  };
}
