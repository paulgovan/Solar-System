// Background sky: a procedural Milky Way band and a faint procedural star layer, both
// laid out in real galactic coordinates (the band sits where it does in the real sky).
// The real naked-eye stars (Yale Bright Star Catalogue) are added on top by
// createCatalogStars(), from the 'stars' feature module.

import * as THREE from 'three';
import { NOISE } from '../shaders/noise.js';
import { DEG, equatorialToEcliptic } from '../ephemeris/index.js';
import { eclToScene } from '../scale.js';

export const SKY_RADIUS = 1e6;
export const STAR_RADIUS = SKY_RADIUS * 0.9;
const MAS = DEG / 3.6e6; // milliarcsecond in radians
const FAINT_BRIGHTNESS = 0.32; // procedural layer, relative to its original look

/** Equatorial J2000 vector → scene vector (linear; no normalisation). */
export function eqToScene(x, y, z, out = new THREE.Vector3()) {
  return eclToScene(equatorialToEcliptic(x, y, z), out);
}

/** Unit scene direction of a J2000 right ascension / declination (degrees). */
export function eqDir(raDeg, decDeg) {
  const a = raDeg * DEG, d = decDeg * DEG;
  return eqToScene(Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)).normalize();
}

/** Orthonormal galactic basis (x → galactic centre, z → north galactic pole) in scene coordinates. */
function galacticBasis() {
  const ngp = eqDir(192.85948, 27.12825);
  const gc = eqDir(266.4051, -28.93617);
  gc.sub(ngp.clone().multiplyScalar(gc.dot(ngp))).normalize();
  const y = new THREE.Vector3().crossVectors(ngp, gc);
  return { x: gc, y, z: ngp };
}

export function createSky() {
  const group = new THREE.Group();
  group.renderOrder = -10;
  const basis = galacticBasis();
  const galMatrix = new THREE.Matrix3().set(
    basis.x.x, basis.x.y, basis.x.z,
    basis.y.x, basis.y.y, basis.y.z,
    basis.z.x, basis.z.y, basis.z.z,
  );

  // Milky Way dome
  const domeMat = new THREE.ShaderMaterial({
    uniforms: { gal: { value: galMatrix }, intensity: { value: 1 } },
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main(){
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p;
      }`,
    fragmentShader: NOISE + /* glsl */ `
      uniform mat3 gal; uniform float intensity;
      varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        vec3 g = gal * d;              // galactic cartesian
        float b = asin(clamp(g.z, -1.0, 1.0));
        float l = atan(g.y, g.x);
        float core = exp(-pow(l / 0.9, 2.0)) * exp(-pow(b / 0.22, 2.0));
        float band = exp(-pow(b / (0.16 + 0.06 * cos(l)), 2.0));
        float clouds = fbm(d * 5.0, 6) * 0.5 + 0.5;
        float fine = fbm(d * 22.0, 4) * 0.5 + 0.5;
        float dust = smoothstep(0.45, 0.75, fbm(d * 7.0 + 11.0, 5) * 0.5 + 0.5) * exp(-pow(b / 0.06, 2.0));
        float m = band * (0.35 + 0.65 * clouds) * (0.7 + 0.5 * fine) + core * 1.4;
        m *= 1.0 - dust * 0.85;
        vec3 warm = vec3(1.0, 0.86, 0.68);
        vec3 cool = vec3(0.55, 0.65, 0.95);
        vec3 col = mix(cool, warm, clamp(core * 1.5 + 0.2, 0.0, 1.0)) * m * 0.075;
        // faint nebular tints
        col += vec3(0.5, 0.15, 0.25) * pow(clouds, 6.0) * band * 0.04;
        col += vec3(0.008, 0.01, 0.018);
        gl_FragColor = vec4(col * intensity, 1.0);
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(SKY_RADIUS, 64, 32), domeMat);
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  group.add(dome);

  // Faint procedural stars: the unresolved background below the catalogue's mag ~6.5 limit
  const N = 14000;
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const size = new Float32Array(N);
  let s = 12345;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-9)) * Math.cos(2 * Math.PI * rand());
  const v = new THREE.Vector3();
  const palette = [
    [0.62, 0.72, 1.0], [0.8, 0.86, 1.0], [1.0, 1.0, 1.0], [1.0, 0.96, 0.86], [1.0, 0.85, 0.65], [1.0, 0.72, 0.5],
  ];
  for (let i = 0; i < N; i++) {
    let gl, gb;
    if (rand() < 0.45) {
      gl = rand() * Math.PI * 2;
      gb = gauss() * 0.15;
    } else {
      gl = rand() * Math.PI * 2;
      gb = Math.asin(rand() * 2 - 1);
    }
    v.copy(basis.x).multiplyScalar(Math.cos(gb) * Math.cos(gl))
      .addScaledVector(basis.y, Math.cos(gb) * Math.sin(gl))
      .addScaledVector(basis.z, Math.sin(gb))
      .multiplyScalar(SKY_RADIUS * 0.9);
    pos.set([v.x, v.y, v.z], i * 3);
    const mag = Math.pow(rand(), 3); // most stars very faint
    const c = palette[Math.floor(Math.pow(rand(), 0.8) * palette.length)];
    const br = FAINT_BRIGHTNESS * (0.35 + 0.65 * mag);
    col.set([c[0] * br, c[1] * br, c[2] * br], i * 3);
    size[i] = 0.9 + mag * 0.9;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
  const starMat = new THREE.ShaderMaterial({
    uniforms: { pixelRatio: { value: Math.min(window.devicePixelRatio, 2) } },
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute float size; attribute vec3 color;
      uniform float pixelRatio;
      varying vec3 vColor;
      void main(){
        vColor = color;
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p;
        gl_PointSize = size * pixelRatio;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      void main(){
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c);
        float a = smoothstep(0.5, 0.0, d);
        a = a * a;
        gl_FragColor = vec4(vColor * a * 1.4, 1.0);
      }`,
  });
  const stars = new THREE.Points(geo, starMat);
  stars.renderOrder = -9;
  stars.frustumCulled = false;
  group.add(stars);

  return {
    group,
    update(camera) {
      group.position.copy(camera.position);
    },
  };
}

// ---------------------------------------------------------------------------
// Catalogue stars
// ---------------------------------------------------------------------------

/**
 * GLSL: on-screen size (CSS px) and peak brightness of a star of V magnitude `mag`.
 * Shared with the constellation lines so their gaps match the star discs.
 */
export const STAR_GLSL = /* glsl */ `
  float starFlux(float mag){ return pow(10.0, -0.4 * (mag - 6.5)); }       // 1 at the catalogue limit
  float starSize(float mag){ return clamp(2.2 * pow(starFlux(mag), 0.18), 2.2, 10.0); }
  float starBrightness(float mag){ return min(0.11 * pow(starFlux(mag), 0.5), 2.5); }
  vec3 properMotion(vec3 dir, vec3 vel, float years){ return normalize(dir + vel * years); }
`;

/**
 * Per-star vertex data in scene space: unit direction, proper-motion velocity (radians
 * per year, tangent to the sky), V magnitude and linear-sRGB colour.
 */
export function catalogAttributes(cat, colorOf) {
  const n = cat.count;
  const dir = new Float32Array(n * 3), vel = new Float32Array(n * 3);
  const mag = new Float32Array(n), color = new Float32Array(n * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const a = cat.ra[i] * DEG, d = cat.dec[i] * DEG;
    const ca = Math.cos(a), sa = Math.sin(a), cd = Math.cos(d), sd = Math.sin(d);
    eqToScene(cd * ca, cd * sa, sd, v).normalize().toArray(dir, i * 3);
    // east = (−sin α, cos α, 0), north = (−sin δ cos α, −sin δ sin α, cos δ)
    const e = cat.pmra[i] * MAS, nn = cat.pmdec[i] * MAS;
    eqToScene(-sa * e - sd * ca * nn, ca * e - sd * sa * nn, cd * nn, v).toArray(vel, i * 3);
    mag[i] = cat.vmag[i];
    color.set(colorOf(cat.bv[i]), i * 3);
  }
  return { dir, vel, mag, color };
}

/** Points for the decoded catalogue. `uniforms.years` = years since J2000 (proper motion). */
export function createCatalogStars(attrs, uniforms) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(attrs.dir, 3));
  geo.setAttribute('vel', new THREE.BufferAttribute(attrs.vel, 3));
  geo.setAttribute('mag', new THREE.BufferAttribute(attrs.mag, 1));
  geo.setAttribute('color', new THREE.BufferAttribute(attrs.color, 3));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      years: uniforms.years,
      radius: { value: STAR_RADIUS },
      pixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
    },
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    vertexShader: STAR_GLSL + /* glsl */ `
      attribute vec3 vel; attribute float mag; attribute vec3 color;
      uniform float years, radius, pixelRatio;
      varying vec3 vColor;
      void main(){
        vec3 d = properMotion(position, vel, years);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(d * radius, 1.0);
        float size = starSize(mag) * pixelRatio;
        // Sub-2px sprites shimmer: keep a 2px floor and dim instead
        float s = max(size, 2.0);
        vColor = color * starBrightness(mag) * (size * size) / (s * s);
        gl_PointSize = s;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      void main(){
        vec2 c = gl_PointCoord - 0.5;
        float r2 = dot(c, c) * 4.0;              // 0 at centre, 1 at the sprite edge
        float a = exp(-r2 * 3.5) - 0.03;        // Gaussian core, zero at the edge
        gl_FragColor = vec4(vColor * max(a, 0.0) * 1.6, 1.0);
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.renderOrder = -8;
  points.frustumCulled = false;
  return points;
}
