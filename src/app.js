// App bootstrap: renderer, scene, core toggles, UI wiring, feature modules, frame loop.

import * as THREE from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { features } from './features/index.js';
import { J2000 } from './ephemeris/index.js';
import { scale, mapDistance } from './scale.js';
import {
  state, on, emit, registerToggle, setToggle, tick, select, readHash, toggles,
} from './state.js';
import { createSky } from './scene/sky.js';
import { createAsteroidBelt } from './scene/asteroids.js';
import { createSolarSystem } from './scene/solarSystem.js';
import { createCameraRig } from './camera.js';
import { loadEarthMask } from './earthMask.js';
import { startBakeQueue, whenBaked } from './textures/bakeQueue.js';
import { precompileBakes } from './textures.js';
import { initToolbar } from './ui/toolbar.js';
import { initTimeControls } from './ui/timeControls.js';
import { initBodyList } from './ui/bodyList.js';
import { initInfoPanel } from './ui/infoPanel.js';
import { initKeyboard } from './ui/keyboard.js';
import { createLabelUpdater } from './ui/labels.js';
import { initPicking } from './ui/picking.js';

// ---------------------------------------------------------------------------
// Core toggles (features register more; `order` controls toolbar position)
// ---------------------------------------------------------------------------
registerToggle({ key: 'orbits', label: 'Orbits', shortcut: 'o', order: 10 });
registerToggle({ key: 'labels', label: 'Labels', shortcut: 'l', order: 20 });
registerToggle({ key: 'belt', label: 'Asteroids', shortcut: 'b', order: 30, title: 'Asteroid belt (B)' });
registerToggle({ key: 'pluto', label: 'Pluto', shortcut: 'p', order: 40 });

// ---------------------------------------------------------------------------
// Renderer & scene
// ---------------------------------------------------------------------------
// Reduced motion: camera moves are instant and time starts paused (the user can press play)
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
if (reduceMotion) state.playing = false;
const canvas = document.getElementById('scene');
const isMobile = matchMedia('(max-width: 820px)').matches || /Mobi|Android/i.test(navigator.userAgent);
// `?quality=low` renders with small textures and fewer asteroids: for slow devices, and
// for the e2e tests, which run on GPU-less CI runners where software GL is very slow.
const lowQuality = new URLSearchParams(location.search).get('quality') === 'low';
// Coastlines are rasterized in a worker while the scene is set up; Earth's full-resolution
// bake waits for them (see src/textures/bakeQueue.js).
const earthMask = loadEarthMask(lowQuality ? 1024 : isMobile ? 2048 : 4096);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.75 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const labelRenderer = new CSS2DRenderer({ element: document.getElementById('labels') });
labelRenderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.01, 1e8);

const pr = renderer.getPixelRatio();
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(window.innerWidth * pr, window.innerHeight * pr, {
  type: THREE.HalfFloatType,
  samples: pr > 1.5 ? 2 : 4, // MSAA keeps thin orbit lines smooth through post-processing
}));
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.4, 0.4, 0.95);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const sky = createSky();
scene.add(sky.group);
const belt = createAsteroidBelt(lowQuality ? 2000 : isMobile ? 5000 : 9000);
scene.add(belt.object);

// Compile the bake shaders in parallel (KHR_parallel_shader_compile) before the preview
// bakes need them, including the land-mask variants Earth's full bakes will use.
await Promise.all([
  precompileBakes(renderer),
  precompileBakes(renderer, ['earth', 'earthLights'], { landMask: true }),
]);
const system = createSolarSystem(renderer, scene, { onSelect: (id) => select(id), quality: lowQuality ? 0.25 : isMobile ? 0.5 : 1, earthMask });
const { bodies } = system;
const rig = createCameraRig(camera, canvas);

const overviewDistance = () => mapDistance(32, scale.blend) * 1.9 * Math.max(1, 0.85 / camera.aspect);

/** Shared handle passed to UI and feature modules. */
const app = {
  THREE, renderer, scene, camera, composer, labelRenderer, rig, system, bodies, sky, belt, state,
  isMobile, reduceMotion, on, emit, overviewDistance,
};
if (import.meta.env.DEV) {
  window.__app = { ...app, earthMask: null };
  earthMask.then((m) => { window.__app.earthMask = m; });
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------
initToolbar();
const updateDate = initTimeControls();
initBodyList();
const info = initInfoPanel(app);
initKeyboard();
initPicking(app);
const updateLabels = createLabelUpdater(app);

// Toggle effects for core toggles and body visibility
function applyToggles() {
  system.orbitGroup.visible = state.show.orbits;
  document.getElementById('labels').classList.toggle('labels-off', !state.show.labels);
  belt.object.visible = state.show.belt;
  for (const b of Object.values(bodies)) {
    const t = b.data.toggle || (b.parent && bodies[b.parent].data.toggle);
    const visible = !t || state.show[t];
    b.group.visible = visible;
    if (b.orbit) b.orbit.visible = visible;
  }
  const sel = bodies[state.selected];
  if (sel && !sel.group.visible) select('sun');
}
on('toggle', applyToggles);

// Selection: fly the camera and highlight
on('select', (id, opts = {}) => {
  const body = bodies[id];
  if (!body) return;
  for (const b of Object.values(bodies)) {
    b.label.element.classList.toggle('selected', b.id === id);
    if (b.orbit) b.orbit.material.uniforms.highlight.value = b.id === id ? 1 : 0;
  }
  rig.flyTo(body, { duration: opts.instant || reduceMotion ? 0.001 : 2.2 });
});

// ---------------------------------------------------------------------------
// Features
// ---------------------------------------------------------------------------
for (const f of features) f.setup?.(app);

// ---------------------------------------------------------------------------
// Frame loop
// ---------------------------------------------------------------------------
let lastTime = performance.now();
let elapsed = 0;
let liveTimer = 0;
let viewShift = 0;

function frame() {
  const now = performance.now();
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  elapsed += dt;

  tick(dt);

  // Animate scale-mode transitions (log-space blend, eased)
  if (scale.blend !== scale.target) {
    const step = reduceMotion ? 1 : dt / 1.6;
    scale.blend = scale.target > scale.blend ? Math.min(scale.target, scale.blend + step) : Math.max(scale.target, scale.blend - step);
  }
  const blendEased = scale.blend * scale.blend * (3 - 2 * scale.blend);
  app.blend = blendEased;

  system.update(state.jd, blendEased, camera, elapsed);
  belt.update(state.jd - J2000, blendEased);
  for (const f of features) f.update?.(app, dt);

  // On narrow screens, slide the view up while the info sheet covers the bottom
  const wantShift = window.innerWidth <= 820 && info.isOpen() ? window.innerHeight * 0.17 : 0;
  viewShift += (wantShift - viewShift) * Math.min(1, dt * 5);
  if (Math.abs(viewShift) > 0.5) camera.setViewOffset(window.innerWidth, window.innerHeight, 0, viewShift, window.innerWidth, window.innerHeight);
  else if (camera.view?.enabled) camera.clearViewOffset();

  rig.update(dt, overviewDistance());
  sky.update(camera);
  updateLabels();
  updateDate();

  liveTimer += dt;
  if (liveTimer > 0.25) { liveTimer = 0; info.updateLive(); }

  composer.render();
  labelRenderer.render(scene, camera);
  requestAnimationFrame(frame);
}

window.addEventListener('resize', () => {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  bloom.setSize(w, h);
  labelRenderer.setSize(w, h);
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
const initialBody = readHash();
for (const t of toggles) setToggle(t.key, state.show[t.key]);
system.update(state.jd, scale.blend, camera, 0);
const ov = overviewDistance();
camera.position.set(-0.33 * ov, 0.5 * ov, 0.8 * ov);
rig.controls.target.set(0, 0, 0);
rig.focus = bodies.sun;
rig.lastFocusPos.set(0, 0, 0);
emit('playing', state.playing);
emit('scale', scale.target);
if (initialBody && bodies[initialBody]) select(initialBody);
else emit('select', 'sun', { instant: true });

// Compile the scene's shaders in parallel (for the composer's render target, where the
// RenderPass draws) so the first frame doesn't compile them one by one.
{
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(composer.readBuffer);
  const ready = renderer.compileAsync(scene, camera);
  renderer.setRenderTarget(prev);
  await ready;
}
frame();
performance.mark('app:first-frame');
requestAnimationFrame(() => document.getElementById('loader').classList.add('hidden'));
// Upgrade the preview textures to full resolution in idle time
startBakeQueue(app);
Promise.all([whenBaked(), earthMask]).then(() => {
  performance.mark('app:loaded');
  document.documentElement.dataset.loaded = '';
});
