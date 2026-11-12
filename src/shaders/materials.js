// Custom materials: lit planets, rings, atmospheres, the Sun, orbits.
// The Sun sits at the world origin, so the light direction is simply −worldPos.

import * as THREE from 'three';
import { NOISE, SRGB } from './noise.js';

const LOGDEPTH_V_PARS = /* glsl */ `#include <common>\n#include <logdepthbuf_pars_vertex>\n`;
const LOGDEPTH_V = /* glsl */ `#include <logdepthbuf_vertex>\n`;
const LOGDEPTH_F_PARS = /* glsl */ `#include <logdepthbuf_pars_fragment>\n`;
const LOGDEPTH_F = /* glsl */ `#include <logdepthbuf_fragment>\n`;
const OUTPUT_F = /* glsl */ `#include <tonemapping_fragment>\n#include <colorspace_fragment>\n`;

// ---------------------------------------------------------------------------
// Planet surface
// ---------------------------------------------------------------------------
export function createPlanetMaterial({
  map, nightMap = null, bumpScale = 0, atmosphere = null, atmosphereStrength = 0,
  ocean = false, rings = null, softTerminator = 0,
}) {
  const defines = {};
  if (nightMap) defines.NIGHT = '';
  if (ocean) defines.OCEAN = '';
  if (rings) defines.RINGS = '';
  if (bumpScale > 0) defines.BUMP = '';

  return new THREE.ShaderMaterial({
    defines,
    uniforms: {
      map: { value: map },
      nightMap: { value: nightMap },
      texel: { value: new THREE.Vector2(1 / map.image.width, 1 / map.image.height) },
      bumpScale: { value: bumpScale },
      atmColor: { value: new THREE.Color(...(atmosphere || [0, 0, 0])) },
      atmStrength: { value: atmosphereStrength },
      softTerminator: { value: softTerminator },
      ringMap: { value: rings ? rings.map : null },
      ringRadii: { value: rings ? new THREE.Vector2(rings.inner, rings.outer) : new THREE.Vector2() },
      ringNormal: { value: new THREE.Vector3(0, 1, 0) },
      planetCenter: { value: new THREE.Vector3() },
      planetRadius: { value: 1 },
    },
    vertexShader: LOGDEPTH_V_PARS + /* glsl */ `
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying vec3 vN;
      varying vec3 vEast;
      varying vec3 vNorth;
      void main(){
        vUv = uv;
        vec3 n = normalize(position);
        vec3 east = normalize(cross(vec3(0.0, 1.0, 0.0), n) + vec3(1e-6, 0.0, 0.0));
        vec3 north = cross(n, east);
        mat3 m = mat3(modelMatrix);
        vN = normalize(m * n);
        vEast = normalize(m * east);
        vNorth = normalize(m * north);
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
        ${LOGDEPTH_V}
      }`,
    fragmentShader: LOGDEPTH_F_PARS + SRGB + /* glsl */ `
      uniform sampler2D map;
      uniform sampler2D nightMap;
      uniform vec2 texel;
      uniform float bumpScale;
      uniform vec3 atmColor;
      uniform float atmStrength;
      uniform float softTerminator;
      uniform sampler2D ringMap;
      uniform vec2 ringRadii;
      uniform vec3 ringNormal;
      uniform vec3 planetCenter;
      uniform float planetRadius;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying vec3 vN;
      varying vec3 vEast;
      varying vec3 vNorth;

      void main(){
        ${LOGDEPTH_F}
        vec4 tex = texture2D(map, vUv);
        vec3 albedo = srgbToLinear(tex.rgb);
        vec3 N = normalize(vN);
        vec3 L = normalize(-vWorldPos);
        vec3 V = normalize(cameraPosition - vWorldPos);

        vec3 Nb = N;
        #ifdef BUMP
          float lat = (vUv.y - 0.5) * 3.14159265;
          float hE = texture2D(map, vUv + vec2(texel.x, 0.0)).a;
          float hW = texture2D(map, vUv - vec2(texel.x, 0.0)).a;
          float hN = texture2D(map, vUv + vec2(0.0, texel.y)).a;
          float hS = texture2D(map, vUv - vec2(0.0, texel.y)).a;
          float dE = (hE - hW) / (2.0 * texel.x * 6.2831853 * max(cos(lat), 0.05));
          float dN = (hN - hS) / (2.0 * texel.y * 3.14159265);
          Nb = normalize(N - bumpScale * (dE * normalize(vEast) + dN * normalize(vNorth)));
        #endif

        float ndlGeo = dot(N, L);
        float ndl = dot(Nb, L);
        float wrap = softTerminator;
        float diffuse = clamp((ndl + wrap) / (1.0 + wrap), 0.0, 1.0);
        diffuse *= smoothstep(-0.12 - wrap, 0.08, ndlGeo);

        #ifdef RINGS
          // Shadow cast by the rings onto the planet
          float denom = dot(L, ringNormal);
          if (abs(denom) > 1e-4) {
            float t = dot(planetCenter - vWorldPos, ringNormal) / denom;
            if (t > 0.0) {
              float r = length(vWorldPos + L * t - planetCenter) / planetRadius;
              if (r > ringRadii.x && r < ringRadii.y) {
                float dens = texture2D(ringMap, vec2((r - ringRadii.x) / (ringRadii.y - ringRadii.x), 0.5)).a;
                diffuse *= 1.0 - dens * 0.85;
              }
            }
          }
        #endif

        vec3 color = albedo * (diffuse * 1.15 + 0.012);

        #ifdef OCEAN
          float ocean = 1.0 - smoothstep(0.0, 0.04, tex.a);
          vec3 H = normalize(L + V);
          float spec = pow(max(dot(N, H), 0.0), 90.0) * 0.9 + pow(max(dot(N, H), 0.0), 12.0) * 0.06;
          color += vec3(1.0, 0.92, 0.8) * spec * ocean * smoothstep(0.0, 0.15, ndlGeo);
        #endif

        #ifdef NIGHT
          vec3 lights = srgbToLinear(texture2D(nightMap, vUv).rgb);
          color += lights * smoothstep(0.08, -0.18, ndlGeo) * 1.6;
        #endif

        // Atmospheric rim lighting
        float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
        float day = smoothstep(-0.3, 0.45, ndlGeo);
        color += atmColor * fres * atmStrength * day * 0.9;
        color = mix(color, atmColor * diffuse, fres * atmStrength * 0.25);

        gl_FragColor = vec4(color, 1.0);
        ${OUTPUT_F}
      }`,
  });
}

// Cloud layer (Earth)
export function createCloudMaterial(map) {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: map } },
    transparent: true,
    depthWrite: false,
    vertexShader: LOGDEPTH_V_PARS + /* glsl */ `
      varying vec2 vUv; varying vec3 vWorldPos; varying vec3 vN;
      void main(){
        vUv = uv;
        vN = normalize(mat3(modelMatrix) * normalize(position));
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
        ${LOGDEPTH_V}
      }`,
    fragmentShader: LOGDEPTH_F_PARS + /* glsl */ `
      uniform sampler2D map;
      varying vec2 vUv; varying vec3 vWorldPos; varying vec3 vN;
      void main(){
        ${LOGDEPTH_F}
        float a = texture2D(map, vUv).a;
        vec3 L = normalize(-vWorldPos);
        float ndl = dot(normalize(vN), L);
        float lit = smoothstep(-0.15, 0.25, ndl);
        vec3 col = mix(vec3(0.02, 0.025, 0.04), vec3(1.0, 0.98, 0.95), lit);
        // reddish terminator
        col = mix(col, vec3(1.0, 0.55, 0.35), smoothstep(0.25, 0.0, abs(ndl - 0.02)) * 0.35);
        gl_FragColor = vec4(col, a * (0.25 + 0.75 * lit));
        ${OUTPUT_F}
      }`,
  });
}

// ---------------------------------------------------------------------------
// Atmosphere halo — drawn on a slightly larger back-facing shell
// ---------------------------------------------------------------------------
export function createAtmosphereMaterial(color, strength) {
  return new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(...color) },
      strength: { value: strength },
      center: { value: new THREE.Vector3() },
      radius: { value: 1 },
      shellRadius: { value: 1.05 },
    },
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: LOGDEPTH_V_PARS + /* glsl */ `
      varying vec3 vWorldPos;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
        ${LOGDEPTH_V}
      }`,
    fragmentShader: LOGDEPTH_F_PARS + /* glsl */ `
      uniform vec3 color; uniform float strength; uniform vec3 center;
      uniform float radius; uniform float shellRadius;
      varying vec3 vWorldPos;
      void main(){
        ${LOGDEPTH_F}
        vec3 d = normalize(vWorldPos - cameraPosition);
        vec3 oc = center - cameraPosition;
        float tca = dot(oc, d);
        vec3 closest = cameraPosition + d * tca;
        float b = length(closest - center);
        float h = clamp((b - radius) / (shellRadius - radius), 0.0, 1.0);
        float glow = pow(1.0 - h, 2.5);
        vec3 up = normalize(closest - center);
        float sun = dot(up, normalize(-center));
        float day = smoothstep(-0.4, 0.4, sun);
        gl_FragColor = vec4(color * glow * day * strength * 0.9, 1.0);
        ${OUTPUT_F}
      }`,
  });
}

// ---------------------------------------------------------------------------
// Rings
// ---------------------------------------------------------------------------
export function createRingMaterial(map, inner, outer) {
  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: map },
      inner: { value: inner },
      outer: { value: outer },
      planetCenter: { value: new THREE.Vector3() },
      planetRadius: { value: 1 },
      ringNormal: { value: new THREE.Vector3(0, 1, 0) },
    },
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    vertexShader: LOGDEPTH_V_PARS + /* glsl */ `
      varying vec2 vLocal; varying vec3 vWorldPos;
      void main(){
        vLocal = position.xy;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
        ${LOGDEPTH_V}
      }`,
    fragmentShader: LOGDEPTH_F_PARS + SRGB + /* glsl */ `
      uniform sampler2D map; uniform float inner; uniform float outer;
      uniform vec3 planetCenter; uniform float planetRadius; uniform vec3 ringNormal;
      varying vec2 vLocal; varying vec3 vWorldPos;
      void main(){
        ${LOGDEPTH_F}
        float r = length(vLocal);
        float t = (r - inner) / (outer - inner);
        if (t < 0.0 || t > 1.0) discard;
        vec4 rc = texture2D(map, vec2(t, 0.5));
        vec3 L = normalize(-vWorldPos);
        vec3 V = normalize(cameraPosition - vWorldPos);
        float sunSide = dot(ringNormal, L);
        float camSide = dot(ringNormal, V);
        float illum = sign(sunSide) == sign(camSide)
          ? mix(0.45, 1.0, sqrt(abs(sunSide)))
          : 0.18 * (1.0 - rc.a) + 0.08;
        // Planet's shadow on the rings
        vec3 oc = vWorldPos - planetCenter;
        float bb = dot(oc, L);
        float shadow = 1.0;
        if (bb < 0.0) {
          float dist = length(oc - bb * L);
          shadow = smoothstep(planetRadius * 0.97, planetRadius * 1.02, dist);
        }
        vec3 col = srgbToLinear(rc.rgb) * illum * (0.04 + 0.96 * shadow) * 1.1;
        gl_FragColor = vec4(col, rc.a * 0.95);
        ${OUTPUT_F}
      }`,
  });
}

// ---------------------------------------------------------------------------
// Sun
// ---------------------------------------------------------------------------
export function createSunMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } },
    vertexShader: LOGDEPTH_V_PARS + /* glsl */ `
      varying vec3 vP; varying vec3 vN; varying vec3 vWorldPos;
      void main(){
        vP = normalize(position);
        vN = normalize(mat3(modelMatrix) * vP);
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
        ${LOGDEPTH_V}
      }`,
    fragmentShader: LOGDEPTH_F_PARS + NOISE + /* glsl */ `
      uniform float time;
      varying vec3 vP; varying vec3 vN; varying vec3 vWorldPos;
      void main(){
        ${LOGDEPTH_F}
        vec3 p = vP;
        float t = time;
        float big = fbm(p * 3.0 + vec3(0.0, t * 0.015, 0.0), 4);
        vec3 w = vec3(snoise(p * 8.0 + t * 0.05), snoise(p * 8.0 + 7.0 - t * 0.04), snoise(p * 8.0 + 13.0));
        float gran = snoise(p * 55.0 + w * 0.6 + t * 0.08) * 0.5 + 0.5;
        float gran2 = snoise(p * 140.0 - t * 0.12) * 0.5 + 0.5;
        float spots = smoothstep(0.45, 0.6, fbm(p * 5.0 + 3.0 + t * 0.004, 4)) * smoothstep(0.75, 0.2, abs(p.y));
        float heat = 0.55 + 0.22 * big + 0.18 * gran + 0.08 * gran2 - spots * 0.5;
        vec3 col = mix(vec3(1.0, 0.32, 0.03), vec3(1.0, 0.72, 0.28), smoothstep(0.2, 0.7, heat));
        col = mix(col, vec3(1.0, 0.95, 0.82), smoothstep(0.65, 0.95, heat));
        float mu = max(dot(normalize(vN), normalize(cameraPosition - vWorldPos)), 0.0);
        col *= 0.35 + 0.65 * pow(mu, 0.45);
        col += vec3(1.0, 0.55, 0.2) * pow(1.0 - mu, 2.0) * 0.5;
        gl_FragColor = vec4(col * 2.2, 1.0);
        ${OUTPUT_F}
      }`,
  });
}

// ---------------------------------------------------------------------------
// Orbit line with a fading trail behind the body
// ---------------------------------------------------------------------------
export function createOrbitMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(color) },
      current: { value: 0 },
      opacity: { value: 1 },
      highlight: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    vertexShader: LOGDEPTH_V_PARS + /* glsl */ `
      attribute float param;
      varying float vParam;
      void main(){
        vParam = param;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        ${LOGDEPTH_V}
      }`,
    fragmentShader: LOGDEPTH_F_PARS + /* glsl */ `
      uniform vec3 color; uniform float current; uniform float opacity; uniform float highlight;
      varying float vParam;
      void main(){
        ${LOGDEPTH_F}
        float behind = fract(current - vParam);
        float trail = pow(1.0 - behind, 5.0);
        float a = (0.16 + 0.12 * highlight) + (0.7 + 0.3 * highlight) * trail;
        gl_FragColor = vec4(color * (0.8 + 0.6 * trail), a * opacity);
        ${OUTPUT_F}
      }`,
  });
}
