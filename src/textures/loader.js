// Lazy loader for real surface imagery (NASA / USGS global maps in public/textures/).
//
// The procedural bakes stay as the instant first frame and as the fallback when a
// map fails to load or the "artistic" mode is chosen. A body's maps are fetched the
// first time it is focused or grows large on screen. Each image is run through a
// small GPU "compose" pass into a mipmapped render target with the same layout as
// the procedural bakes: RGB = sRGB albedo, A = height / ocean mask, u = 0.5 at
// longitude 0, east increasing u, north up (see dirFromLatLon in src/textures.js).

import * as THREE from 'three';

/**
 * Per-body maps. `file` may be [desktop, mobile]. `mode` picks how the alpha channel
 * (height / ocean mask) is built:
 *   flat    no height data (relief is already in the imagery) → bump off
 *   height  image alpha is elevation
 *   mask    image alpha marks pixels with data; elsewhere the procedural map shows
 *   earth   ocean = dark blue in the image *and* ocean in the procedural (Natural Earth) map
 *   night   city lights (RGB only)
 *   clouds  grey cloud cover → alpha
 */
export const IMAGERY = {
  mercury: { map: { file: 'mercury.webp', mode: 'flat' } },
  earth: {
    map: { file: ['earth_day.webp', 'earth_day_2k.webp'], mode: 'earth' },
    nightMap: { file: ['earth_night.webp', 'earth_night_2k.webp'], mode: 'night' },
    clouds: { file: 'earth_clouds.webp', mode: 'clouds' },
  },
  moon: { map: { file: 'moon.webp', mode: 'height' } },
  mars: { map: { file: 'mars.webp', mode: 'flat' } },
  jupiter: { map: { file: 'jupiter.webp', mode: 'flat' } },
  pluto: { map: { file: 'pluto.webp', mode: 'mask' } },
};

const MODES = { flat: 0, height: 1, mask: 2, earth: 3, night: 4, clouds: 5 };

const COMPOSE_FS = /* glsl */ `
uniform sampler2D image;
uniform sampler2D procedural;
uniform int mode;
varying vec2 vUv;
void main(){
  // Images are uploaded top row first (no flipY), so v runs from north at 0.
  vec4 c = texture2D(image, vec2(vUv.x, 1.0 - vUv.y));
  vec4 p = texture2D(procedural, vUv);
  vec4 o = vec4(c.rgb, 0.5);
  if (mode == 1) o.a = c.a;
  else if (mode == 2) o = vec4(mix(p.rgb, c.rgb, c.a), mix(p.a, 0.5, c.a));
  else if (mode == 3) {
    float lum = dot(c.rgb, vec3(0.3, 0.59, 0.11));
    float blueDark = smoothstep(0.015, 0.05, c.b - c.r) * (1.0 - smoothstep(0.16, 0.26, lum));
    float procOcean = 1.0 - smoothstep(0.0, 0.04, p.a);
    float ocean = blueDark * procOcean;
    o.a = mix(0.05, 0.0, ocean); // land just above the shader's ocean threshold (0.04)
  }
  else if (mode == 4) o.a = 1.0;
  else if (mode == 5) {
    float g = dot(c.rgb, vec3(0.333));
    o = vec4(1.0, 1.0, 1.0, pow(smoothstep(0.1, 1.0, g), 1.6) * 0.85);
  }
  gl_FragColor = o;
}`;

let composeMat = null;
const quadScene = new THREE.Scene();
const quadCam = new THREE.Camera();

function compose(renderer, image, procedural, mode) {
  const w = image.width, h = image.height;
  const rt = new THREE.WebGLRenderTarget(w, h, {
    type: THREE.UnsignedByteType,
    format: THREE.RGBAFormat,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.RepeatWrapping,
    depthBuffer: false,
  });
  rt.texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const src = new THREE.Texture(image);
  src.flipY = false;
  src.premultiplyAlpha = false;
  src.generateMipmaps = false;
  src.minFilter = THREE.LinearFilter;
  src.wrapS = THREE.RepeatWrapping;
  src.needsUpdate = true;

  if (!composeMat) {
    composeMat = new THREE.ShaderMaterial({
      uniforms: { image: { value: null }, procedural: { value: null }, mode: { value: 0 } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: COMPOSE_FS,
      depthTest: false,
      depthWrite: false,
    });
    quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), composeMat));
  }
  composeMat.uniforms.image.value = src;
  composeMat.uniforms.procedural.value = procedural;
  composeMat.uniforms.mode.value = MODES[mode];

  const prevTarget = renderer.getRenderTarget();
  const prevAutoClear = renderer.autoClear;
  renderer.autoClear = true;
  renderer.setRenderTarget(rt);
  renderer.render(quadScene, quadCam);
  renderer.setRenderTarget(prevTarget);
  renderer.autoClear = prevAutoClear;

  composeMat.uniforms.image.value = null;
  composeMat.uniforms.procedural.value = null;
  src.dispose();
  image.close?.();
  return rt.texture;
}

async function decode(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const blob = await res.blob();
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    } catch { /* fall back to <img> */ }
  }
  const img = new Image();
  img.src = URL.createObjectURL(blob);
  await img.decode();
  URL.revokeObjectURL(img.src);
  return img;
}

/**
 * @param app       shared app handle (renderer, bodies, camera, isMobile)
 * @param baseUrl   where the .webp files are served
 */
export function createImageryLoader(app, { table = IMAGERY, baseUrl = `${import.meta.env.BASE_URL}textures/` } = {}) {
  const entries = {}; // id → { status, real: {map, nightMap, clouds}, artistic: {...}, failedAt }
  let real = true;
  let queue = Promise.resolve();

  function slotsOf(body) {
    return {
      map: body.material?.uniforms.map,
      nightMap: body.material?.uniforms.nightMap,
      clouds: body.clouds?.material.uniforms.map,
    };
  }

  function entryFor(id) {
    const body = app.bodies[id];
    if (!table[id] || !body?.material) return null;
    if (!entries[id]) {
      const s = slotsOf(body);
      entries[id] = {
        status: 'idle', real: {},
        artistic: { map: s.map?.value, nightMap: s.nightMap?.value, clouds: s.clouds?.value },
      };
    }
    return entries[id];
  }

  function apply(id) {
    const e = entries[id];
    const body = app.bodies[id];
    if (!e || !body) return;
    const s = slotsOf(body);
    for (const k of ['map', 'nightMap', 'clouds']) {
      if (!s[k]) continue;
      s[k].value = (real && e.real[k]) || e.artistic[k];
    }
    const img = s.map.value.image;
    body.material.uniforms.texel.value.set(1 / img.width, 1 / img.height);
  }

  async function load(id) {
    const e = entries[id];
    const spec = table[id];
    e.status = 'loading';
    let failed = 0;
    for (const [slot, { file, mode }] of Object.entries(spec)) {
      if (e.real[slot]) continue;
      const name = Array.isArray(file) ? file[app.isMobile ? file.length - 1 : 0] : file;
      try {
        const image = await decode(baseUrl + name);
        e.real[slot] = compose(app.renderer, image, e.artistic.map, mode);
        apply(id);
      } catch (err) {
        failed++;
        console.warn(`Imagery: could not load ${name}; keeping the artistic map.`, err?.message || err);
      }
    }
    e.status = failed ? 'failed' : 'loaded';
    e.failedAt = failed ? performance.now() : 0;
  }

  /** Queue a body's maps (no-op if loaded, loading, recently failed, or artistic mode). */
  function request(id) {
    const e = entryFor(id);
    if (!e || !real || e.status === 'loaded' || e.status === 'loading' || e.status === 'queued') return;
    if (e.status === 'failed' && performance.now() - e.failedAt < 30_000) return;
    e.status = 'queued';
    queue = queue.then(() => load(id));
  }

  function setReal(on) {
    real = on;
    for (const id of Object.keys(entries)) apply(id);
  }

  const v = new THREE.Vector3();
  /** Request bodies that appear large on screen (call a few times per second). */
  function checkProximity(minPixels = 48) {
    if (!real) return;
    const cam = app.camera;
    const k = window.innerHeight / 2 / Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
    for (const id of Object.keys(table)) {
      const b = app.bodies[id];
      if (!b?.group.visible || entries[id]?.status === 'loaded') continue;
      const d = v.copy(b.position).sub(cam.position).length();
      if (d > 0 && (b.radius / d) * k > minPixels) request(id);
    }
  }

  return { request, setReal, checkProximity, entries, get real() { return real; } };
}
