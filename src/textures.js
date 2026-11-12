// Procedural planet textures, baked once on the GPU into equirectangular maps.
// Noise is evaluated on the unit sphere (3D), so maps are seamless with no
// pole pinching. RGB holds sRGB albedo; alpha holds a height / ocean mask.

import * as THREE from 'three';
import { NOISE } from './shaders/noise.js';

const BODY_GLSL = /* glsl */ `
#define PI 3.14159265359
uniform float seed;
varying vec2 vUv;

vec3 dirFromLatLon(float lat, float lon){
  return vec3(cos(lat) * cos(lon), sin(lat), -cos(lat) * sin(lon));
}

// Angular-distance spot (ellipse in lon/lat), returns 0..1 falloff
float spot(float lat, float lon, float lat0, float lon0, float rx, float ry){
  float dl = mod(lon - lon0 + PI, 2.0 * PI) - PI;
  vec2 d = vec2(dl * cos(lat) / rx, (lat - lat0) / ry);
  return 1.0 - smoothstep(0.6, 1.0, length(d));
}

float gauss(float x, float c, float w){ return exp(-pow((x - c) / w, 2.0)); }

// ---------------- Earth ----------------
struct EarthSample { float land; float elev; vec3 color; float ice; };

EarthSample earthSurface(vec3 dir, float lat){
  EarthSample s;
  vec3 q = dir * 1.25 + vec3(seed);
  vec3 w = vec3(fbm(q * 1.1, 4), fbm(q * 1.1 + 5.2, 4), fbm(q * 1.1 + 9.7, 4));
  float h = fbm(q + w * 0.55, 8);
  float mountains = ridged(dir * 5.0 + w, 5);
  float lat01 = abs(lat) / (PI * 0.5);
  float iceEdge = 0.83 + 0.05 * fbm(dir * 6.0, 3);
  s.ice = smoothstep(iceEdge, iceEdge + 0.03, lat01);
  s.land = h - 0.045;
  if (s.land < 0.0) {
    float depth = clamp(-s.land * 5.0, 0.0, 1.0);
    s.color = mix(vec3(0.07, 0.30, 0.42), vec3(0.015, 0.07, 0.19), sqrt(depth));
    s.elev = 0.0;
  } else {
    s.elev = clamp(s.land * 1.5 + mountains * 0.3 * smoothstep(0.0, 0.15, s.land), 0.0, 1.0);
    float moist = fbm(dir * 2.6 + 17.0, 5) * 0.5 + 0.5;
    float dryBelt = gauss(lat01, 0.28, 0.1);
    moist = clamp(moist - dryBelt * 0.45 + gauss(lat01, 0.0, 0.12) * 0.25 - s.land * 0.3, 0.0, 1.0);
    vec3 tropical = vec3(0.06, 0.19, 0.05);
    vec3 temperate = vec3(0.17, 0.25, 0.09);
    vec3 grass = vec3(0.36, 0.37, 0.18);
    vec3 desert = vec3(0.76, 0.6, 0.4);
    vec3 tundra = vec3(0.40, 0.38, 0.32);
    vec3 rock = vec3(0.36, 0.31, 0.26);
    vec3 green = mix(temperate, tropical, 1.0 - smoothstep(0.1, 0.4, lat01));
    green = mix(green, tundra, smoothstep(0.55, 0.75, lat01));
    vec3 col = mix(desert, grass, smoothstep(0.25, 0.45, moist));
    col = mix(col, green, smoothstep(0.45, 0.65, moist));
    col = mix(col, rock, smoothstep(0.45, 0.75, s.elev));
    col = mix(col, vec3(0.92), smoothstep(0.88, 0.98, s.elev + lat01 * 0.2));
    col *= 0.9 + 0.2 * fbm(dir * 30.0, 3);
    // beach / shallow coastal tint
    col = mix(vec3(0.6, 0.55, 0.42), col, smoothstep(0.0, 0.012, s.land));
    s.color = col;
  }
  s.color = mix(s.color, vec3(0.93, 0.96, 0.99), s.ice);
  return s;
}

vec4 earth(vec3 dir, float lat, float lon){
  EarthSample s = earthSurface(dir, lat);
  float a = s.land < 0.0 ? 0.0 : 0.08 + 0.92 * s.elev;
  if (s.ice > 0.5) a = max(a, 0.1);
  return vec4(s.color, a);
}

vec4 earthClouds(vec3 dir, float lat, float lon){
  float lat01 = abs(lat) / (PI * 0.5);
  vec3 q = dir * vec3(2.2, 3.2, 2.2) + seed * 3.0;
  vec3 w = vec3(fbm(q, 4), fbm(q + 3.3, 4), fbm(q + 7.1, 4));
  float c = fbm(q * 1.4 + w * 1.6, 7) * 0.5 + 0.5;
  float swirl = fbm(dir * 9.0 + w * 2.0, 4) * 0.5 + 0.5;
  float belt = 0.55 + 0.25 * gauss(lat01, 0.0, 0.1) + 0.35 * gauss(lat01, 0.62, 0.15) - 0.25 * gauss(lat01, 0.28, 0.1);
  float wisps = fbm(vec3(dir.x * 6.0, dir.y * 14.0, dir.z * 6.0) + w * 3.0, 6) * 0.5 + 0.5;
  float cov = smoothstep(0.66 - belt * 0.16, 0.92, c * 0.7 + swirl * 0.25 + wisps * 0.15);
  cov = cov * (0.55 + 0.45 * smoothstep(0.3, 0.7, wisps));
  return vec4(vec3(1.0), clamp(cov, 0.0, 1.0) * 0.9);
}

vec4 earthLights(vec3 dir, float lat, float lon){
  EarthSample s = earthSurface(dir, lat);
  if (s.land < 0.0 || s.ice > 0.3) return vec4(0.0, 0.0, 0.0, 1.0);
  float lat01 = abs(lat) / (PI * 0.5);
  float pop = smoothstep(0.5, 0.75, fbm(dir * 3.5 + 31.0, 4) * 0.5 + 0.5);
  pop *= 1.0 - smoothstep(0.55, 0.75, lat01);
  pop *= 1.0 - smoothstep(0.35, 0.8, s.elev);
  float coast = 1.0 - smoothstep(0.0, 0.05, s.land);
  float cities = pow(fbm(dir * 60.0, 4) * 0.5 + 0.5, 6.0) * 5.0;
  float towns = pow(fbm(dir * 180.0, 3) * 0.5 + 0.5, 9.0) * 6.0;
  float v = (cities + towns) * (pop + coast * 0.35) * 0.8;
  return vec4(vec3(1.0, 0.72, 0.38) * clamp(v, 0.0, 1.0), 1.0);
}

// ---------------- Rocky ----------------
vec4 mercury(vec3 dir, float lat, float lon){
  float n = fbm(dir * 3.0 + seed, 6);
  vec2 c = craters(dir * 5.0, 0.7) + craters(dir * 13.0, 0.75) * 0.6 + craters(dir * 31.0, 0.8) * 0.35 + craters(dir * 70.0, 0.8) * 0.2;
  vec3 col = mix(vec3(0.42, 0.40, 0.37), vec3(0.62, 0.58, 0.53), n * 0.5 + 0.5);
  col *= 1.0 + c.y;
  return vec4(col, clamp(0.5 + c.x * 0.6 + n * 0.15, 0.0, 1.0));
}

vec4 moon(vec3 dir, float lat, float lon){
  float n = fbm(dir * 2.5 + seed, 6);
  // maria are concentrated on the near side (+X faces Earth)
  float mare = smoothstep(0.0, 0.18, fbm(dir * 1.2 + 4.0, 5) + 0.3 * dir.x - 0.08);
  vec2 c = craters(dir * 6.0, 0.6) + craters(dir * 15.0, 0.7) * 0.6 + craters(dir * 36.0, 0.8) * 0.35 + craters(dir * 80.0, 0.8) * 0.2;
  vec3 high = mix(vec3(0.55, 0.54, 0.51), vec3(0.75, 0.73, 0.69), n * 0.5 + 0.5);
  vec3 mar = mix(vec3(0.24, 0.24, 0.24), vec3(0.34, 0.33, 0.32), n * 0.5 + 0.5);
  vec3 col = mix(high, mar, mare);
  col *= 1.0 + c.y * (1.0 - mare * 0.6);
  return vec4(col, clamp(0.5 + c.x * 0.6 * (1.0 - mare * 0.7) + n * 0.1 - mare * 0.1, 0.0, 1.0));
}

vec4 mars(vec3 dir, float lat, float lon){
  float lat01 = abs(lat) / (PI * 0.5);
  vec3 w = vec3(fbm(dir * 2.0, 3), fbm(dir * 2.0 + 4.0, 3), fbm(dir * 2.0 + 8.0, 3));
  float n = fbm(dir * 2.5 + w * 0.5 + seed, 7);
  float dark = smoothstep(0.02, 0.3, fbm(dir * 1.3 + w * 0.8 + 3.0, 5)) * (1.0 - smoothstep(0.45, 0.8, lat01));
  vec2 c = craters(dir * 7.0, 0.4) * 0.6 + craters(dir * 18.0, 0.5) * 0.4;
  vec3 col = mix(vec3(0.70, 0.36, 0.19), vec3(0.85, 0.52, 0.30), n * 0.5 + 0.5);
  col = mix(col, vec3(0.30, 0.18, 0.12), dark * 0.7);
  col *= 1.0 + c.y * 0.5;
  // Hellas basin (bright, southern) & Valles-like dark streak
  col = mix(col, vec3(0.86, 0.66, 0.48), spot(lat, lon, -0.74, 1.22, 0.32, 0.22) * 0.5);
  float cap = lat > 0.0 ? 0.88 : 0.84;
  float ice = smoothstep(cap, cap + 0.025, lat01 + 0.02 * fbm(dir * 10.0, 3));
  col = mix(col, vec3(0.95, 0.93, 0.90), ice);
  return vec4(col, clamp(0.5 + n * 0.25 + c.x * 0.5, 0.0, 1.0));
}

vec4 venus(vec3 dir, float lat, float lon){
  vec3 q = vec3(dir.x * 1.4, dir.y * 3.5, dir.z * 1.4) + seed;
  vec3 w = vec3(fbm(q, 4), fbm(q + 2.7, 4), fbm(q + 6.1, 4));
  float n = fbm(q + w * 1.8, 7) * 0.5 + 0.5;
  float chevron = sin(lat * 6.0 + abs(lat) * 4.0 + w.x * 3.0) * 0.5 + 0.5;
  vec3 col = mix(vec3(0.80, 0.64, 0.40), vec3(0.98, 0.90, 0.70), n);
  col = mix(col, col * vec3(0.88, 0.84, 0.78), chevron * 0.35);
  return vec4(col, 0.5);
}

// ---------------- Giants ----------------
vec4 jupiter(vec3 dir, float lat, float lon){
  float latd = degrees(lat);
  vec3 sq = vec3(dir.x * 2.2, dir.y * 16.0, dir.z * 2.2) + seed;
  float turb = fbm(sq, 6);
  float warpLat = latd + turb * 2.2 + fbm(dir * 9.0, 4) * 1.2;
  float dark = 0.0;
  dark += 0.95 * gauss(warpLat, 12.0, 4.5) + 1.0 * gauss(warpLat, -13.0, 4.5);
  dark += 0.55 * gauss(warpLat, 27.0, 3.0) + 0.55 * gauss(warpLat, -28.0, 3.0);
  dark += 0.35 * gauss(warpLat, 37.0, 2.5) + 0.35 * gauss(warpLat, -38.0, 2.5);
  dark += 0.25 * gauss(warpLat, 45.0, 2.0) + 0.25 * gauss(warpLat, -46.0, 2.0);
  float polar = smoothstep(48.0, 68.0, abs(warpLat));
  vec3 zone = vec3(0.94, 0.89, 0.80);
  vec3 belt = mix(vec3(0.62, 0.42, 0.28), vec3(0.72, 0.52, 0.36), fbm(dir * 6.0, 3) * 0.5 + 0.5);
  vec3 col = mix(zone, belt, clamp(dark, 0.0, 1.0));
  col = mix(col, vec3(0.86, 0.66, 0.46), 0.35 * gauss(warpLat, 0.0, 4.0) * (fbm(dir * 12.0, 3) * 0.5 + 0.5));
  col = mix(col, vec3(0.55, 0.52, 0.50), polar * 0.7);
  float streak = fbm(vec3(dir.x * 6.0, dir.y * 60.0, dir.z * 6.0), 4);
  col *= 0.94 + streak * 0.12;
  // Great Red Spot
  float grs = spot(lat, lon, radians(-22.5), 1.1, 0.19, 0.095);
  float swirl = fbm(dir * 30.0 + vec3(grs * 3.0), 3);
  vec3 red = mix(vec3(0.72, 0.33, 0.20), vec3(0.85, 0.50, 0.33), swirl * 0.5 + 0.5);
  float halo = spot(lat, lon, radians(-22.5), 1.1, 0.26, 0.13) - grs;
  col = mix(col, vec3(0.95, 0.9, 0.82), halo * 0.6);
  col = mix(col, red, grs);
  // white ovals
  for (int i = 0; i < 6; i++){
    float fi = float(i);
    col = mix(col, vec3(0.97, 0.95, 0.9), spot(lat, lon, radians(-33.5), fi * 1.05 + 0.3, 0.035, 0.025) * 0.9);
  }
  return vec4(col, 0.5);
}

vec4 saturn(vec3 dir, float lat, float lon){
  float latd = degrees(lat);
  float turb = fbm(vec3(dir.x * 2.0, dir.y * 20.0, dir.z * 2.0) + seed, 5);
  float wl = latd + turb * 1.5;
  float b = 0.5 + 0.5 * sin(wl * 0.55) * cos(wl * 0.23 + 1.0);
  float fine = sin(wl * 2.3 + turb * 3.0) * 0.5 + 0.5;
  vec3 col = mix(vec3(0.93, 0.85, 0.66), vec3(0.78, 0.66, 0.46), b * 0.7);
  col = mix(col, col * vec3(0.92, 0.9, 0.86), fine * 0.4);
  col = mix(col, vec3(0.97, 0.92, 0.76), gauss(wl, 0.0, 9.0) * 0.5);
  col = mix(col, vec3(0.62, 0.62, 0.58), smoothstep(60.0, 80.0, abs(wl)) * 0.6);
  // north polar hexagon hint
  float hex = gauss(latd, 76.0, 2.0) * 0.25;
  col *= 1.0 - hex;
  return vec4(col, 0.5);
}

vec4 uranus(vec3 dir, float lat, float lon){
  float n = fbm(vec3(dir.x * 2.0, dir.y * 10.0, dir.z * 2.0) + seed, 4);
  vec3 col = vec3(0.64, 0.86, 0.89);
  col *= 0.97 + 0.04 * sin(degrees(lat) * 0.4 + n * 2.0);
  col = mix(col, vec3(0.75, 0.92, 0.94), smoothstep(40.0, 80.0, abs(degrees(lat))) * 0.4);
  return vec4(col, 0.5);
}

vec4 neptune(vec3 dir, float lat, float lon){
  float latd = degrees(lat);
  float n = fbm(vec3(dir.x * 2.0, dir.y * 12.0, dir.z * 2.0) + seed, 5);
  vec3 col = mix(vec3(0.20, 0.34, 0.80), vec3(0.30, 0.48, 0.92), n * 0.5 + 0.5);
  col *= 1.0 - 0.18 * gauss(abs(latd) + n * 4.0, 45.0, 10.0);
  float streak = smoothstep(0.35, 0.7, fbm(vec3(dir.x * 5.0, dir.y * 50.0, dir.z * 5.0) + 7.0, 4) * 0.5 + 0.5);
  col = mix(col, vec3(0.9, 0.95, 1.0), streak * gauss(latd, -28.0, 8.0) * 0.8 + streak * gauss(latd, 30.0, 6.0) * 0.4);
  float gds = spot(lat, lon, radians(-20.0), 2.2, 0.13, 0.08);
  col = mix(col, vec3(0.08, 0.13, 0.42), gds * 0.9);
  col = mix(col, vec3(0.92, 0.95, 1.0), (spot(lat, lon, radians(-17.0), 2.35, 0.06, 0.02)) * 0.7);
  return vec4(col, 0.5);
}

vec4 pluto(vec3 dir, float lat, float lon){
  float n = fbm(dir * 3.0 + seed, 6);
  vec2 c = craters(dir * 9.0, 0.35) * 0.5;
  vec3 col = mix(vec3(0.62, 0.50, 0.40), vec3(0.85, 0.74, 0.62), n * 0.5 + 0.5);
  float cthulhu = smoothstep(0.0, 0.3, fbm(dir * 2.0 + 9.0, 4) + 0.2) * gauss(degrees(lat), -5.0, 18.0);
  col = mix(col, vec3(0.30, 0.17, 0.12), cthulhu * 0.85);
  // Tombaugh Regio ("the heart")
  float heart = max(spot(lat, lon, radians(22.0), radians(178.0), 0.36, 0.34),
                    spot(lat, lon, radians(5.0), radians(205.0), 0.26, 0.3));
  col = mix(col, vec3(0.96, 0.93, 0.88), heart * 0.95);
  col *= 1.0 + c.y * 0.5;
  return vec4(col, clamp(0.5 + c.x * 0.5 + n * 0.1, 0.0, 1.0));
}

void main(){
  float lon = (vUv.x - 0.5) * 2.0 * PI;
  float lat = (vUv.y - 0.5) * PI;
  vec3 dir = dirFromLatLon(lat, lon);
  gl_FragColor = BODY_FN(dir, lat, lon);
}
`;

const FN = {
  earth: 'earth', earthClouds: 'earthClouds', earthLights: 'earthLights',
  mercury: 'mercury', moon: 'moon', mars: 'mars', venus: 'venus',
  jupiter: 'jupiter', saturn: 'saturn', uranus: 'uranus', neptune: 'neptune', pluto: 'pluto',
};

/**
 * Bake one procedural map. Returns a texture (RGB = sRGB albedo, A = height/mask).
 */
export function bakeTexture(renderer, kind, width, seed = 0) {
  const height = width / 2;
  const rt = new THREE.WebGLRenderTarget(width, height, {
    type: THREE.UnsignedByteType,
    format: THREE.RGBAFormat,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.RepeatWrapping,
    depthBuffer: false,
  });
  rt.texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const material = new THREE.ShaderMaterial({
    uniforms: { seed: { value: seed } },
    defines: { BODY_FN: FN[kind] },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: NOISE + BODY_GLSL,
    depthTest: false,
    depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  const scene = new THREE.Scene();
  scene.add(quad);
  const cam = new THREE.Camera();

  const prevTarget = renderer.getRenderTarget();
  const prevAutoClear = renderer.autoClear;
  renderer.autoClear = true;
  renderer.setRenderTarget(rt);
  renderer.render(scene, cam);
  renderer.setRenderTarget(prevTarget);
  renderer.autoClear = prevAutoClear;

  material.dispose();
  quad.geometry.dispose();
  return rt.texture;
}

/** Saturn ring radial profile: 1D texture, RGB = sRGB color, A = optical density. */
export function makeSaturnRingTexture(innerKm, outerKm, width = 2048) {
  const data = new Uint8Array(width * 4);
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const fine = Array.from({ length: 400 }, rand);
  const fineAt = (t) => {
    const x = t * (fine.length - 1);
    const i = Math.floor(x), f = x - i;
    return fine[i] * (1 - f) + fine[Math.min(i + 1, fine.length - 1)] * f;
  };
  const band = (r, a, b) => r >= a && r < b;
  for (let i = 0; i < width; i++) {
    const t = i / (width - 1);
    const r = innerKm + t * (outerKm - innerKm);
    let d = 0, col = [0.8, 0.74, 0.62];
    if (band(r, 74500, 92000)) { // C ring
      d = 0.12 + 0.12 * ((r - 74500) / 17500); col = [0.52, 0.47, 0.42];
    } else if (band(r, 92000, 117580)) { // B ring
      const u = (r - 92000) / 25580;
      d = 0.7 + 0.25 * Math.sin(u * Math.PI); col = [0.88, 0.80, 0.66];
    } else if (band(r, 117580, 122170)) { // Cassini Division
      d = 0.04 + 0.04 * Math.sin(((r - 117580) / 4590) * Math.PI * 3) ** 2; col = [0.45, 0.42, 0.4];
    } else if (band(r, 122170, 136775)) { // A ring
      d = 0.55 - 0.1 * ((r - 122170) / 14605); col = [0.78, 0.72, 0.62];
      if (band(r, 133420, 133750)) d = 0.02; // Encke Gap
      if (band(r, 136480, 136530)) d = 0.05; // Keeler Gap
    } else if (band(r, 140050, 140300)) { // F ring
      d = 0.45; col = [0.85, 0.8, 0.72];
    }
    const f = fineAt(t);
    d *= 0.78 + 0.44 * f;
    const shade = 0.9 + 0.2 * f;
    data[i * 4 + 0] = Math.min(255, col[0] * shade * 255);
    data[i * 4 + 1] = Math.min(255, col[1] * shade * 255);
    data[i * 4 + 2] = Math.min(255, col[2] * shade * 255);
    data[i * 4 + 3] = Math.min(255, Math.max(0, d) * 255);
  }
  const tex = new THREE.DataTexture(data, width, 1, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/** Soft radial gradient for glows/sprites. */
export function makeGlowTexture(stops, size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) grad.addColorStop(o, col);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
