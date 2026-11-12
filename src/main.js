import * as THREE from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import './styles.css';

import { BODIES, BODY_MAP } from './bodies.js';
import { dateToJD, jdToDate, J2000, AU_KM, orbitalSpeed, centuriesTT } from './ephemeris.js';
import { scale, mapDistance } from './scale.js';
import { createSky } from './scene/sky.js';
import { createAsteroidBelt } from './scene/asteroids.js';
import { createSolarSystem } from './scene/solarSystem.js';
import { createCameraRig } from './camera.js';

// ---------------------------------------------------------------------------
// Renderer & scene
// ---------------------------------------------------------------------------
const canvas = document.getElementById('scene');
const isMobile = matchMedia('(max-width: 820px)').matches || /Mobi|Android/i.test(navigator.userAgent);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.75 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const labelRenderer = new CSS2DRenderer({ element: document.getElementById('labels') });
labelRenderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.01, 1e8);
camera.position.set(-260, 420, 760);

const pr = renderer.getPixelRatio();
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(window.innerWidth * pr, window.innerHeight * pr, {
  type: THREE.HalfFloatType,
  samples: pr > 1.5 ? 2 : 4, // MSAA keeps thin orbit lines smooth through post-processing
}));
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.85, 0.55, 0.9);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const sky = createSky();
scene.add(sky.group);
const belt = createAsteroidBelt(isMobile ? 5000 : 9000);
scene.add(belt.object);

const system = createSolarSystem(renderer, scene, { onSelect: (id) => select(id), quality: isMobile ? 0.5 : 1 });
const { bodies } = system;

const rig = createCameraRig(camera, canvas);
rig.controls.target.set(0, 0, 0);

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const SPEEDS = [
  { label: 'Real time', days: 1 / 86400 },
  { label: '1 min / s', days: 1 / 1440 },
  { label: '1 hour / s', days: 1 / 24 },
  { label: '6 hours / s', days: 0.25 },
  { label: '1 day / s', days: 1 },
  { label: '1 week / s', days: 7 },
  { label: '1 month / s', days: 30.436875 },
  { label: '1 year / s', days: 365.25 },
];
const MIN_JD = 625673.5; // 3000 BC
const MAX_JD = 2816787.5; // 3000 AD

const state = {
  jd: dateToJD(new Date()),
  playing: true,
  speedIndex: 4,
  direction: 1,
  selected: null,
  show: { orbits: true, labels: true, belt: true, pluto: true },
};

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------
const $ = (s) => document.querySelector(s);
const timebar = $('.timebar');
const speedInput = $('#t-speed');
const speedLabel = $('#t-speed-label');
const dateInput = $('#t-date');
const infoEl = $('#info');

// Body list
const list = $('#body-list');
BODIES.forEach((b, i) => {
  const btn = document.createElement('button');
  btn.dataset.id = b.id;
  btn.style.setProperty('--c', b.color);
  const keyIdx = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'].indexOf(b.id);
  btn.innerHTML = `<span class="dot"></span>${b.name}<span class="key">${b.id === 'sun' ? '0' : keyIdx >= 0 ? keyIdx + 1 : ''}</span>`;
  btn.addEventListener('click', () => select(b.id));
  list.appendChild(btn);
});

function setPlaying(p) {
  state.playing = p;
  timebar.classList.toggle('paused', !p);
  writeHash();
}
function setSpeed(i) {
  state.speedIndex = THREE.MathUtils.clamp(i, 0, SPEEDS.length - 1);
  speedInput.value = state.speedIndex;
  speedLabel.textContent = (state.direction < 0 ? '−' : '') + SPEEDS[state.speedIndex].label;
}
function setDirection(d) {
  state.direction = d;
  $('#t-reverse').classList.toggle('on', d < 0);
  setSpeed(state.speedIndex);
}
function setScale(target) {
  scale.target = target;
  document.querySelectorAll('[data-scale]').forEach((b) => {
    const on = Number(b.dataset.scale) === target;
    b.classList.toggle('active', on);
    b.setAttribute('aria-checked', on);
  });
  writeHash();
}
function setToggle(key, on) {
  state.show[key] = on;
  const btn = document.querySelector(`[data-toggle="${key}"]`);
  btn.classList.toggle('active', on);
  btn.setAttribute('aria-pressed', on);
  system.orbitGroup.visible = state.show.orbits;
  bodies.moon.orbit.visible = state.show.orbits;
  document.getElementById('labels').classList.toggle('labels-off', !state.show.labels);
  belt.object.visible = state.show.belt;
  bodies.pluto.group.visible = state.show.pluto;
  bodies.pluto.orbit.visible = state.show.pluto;
  list.querySelector('[data-id="pluto"]').classList.toggle('hidden-body', !state.show.pluto);
  if (!state.show.pluto && state.selected === 'pluto') select('sun');
}
function jumpTo(jd) {
  state.jd = THREE.MathUtils.clamp(jd, MIN_JD, MAX_JD);
  writeHash();
}

speedInput.addEventListener('input', () => setSpeed(Number(speedInput.value)));
$('#t-play').addEventListener('click', () => setPlaying(!state.playing));
$('#t-reverse').addEventListener('click', () => setDirection(-state.direction));
$('#t-now').addEventListener('click', () => { jumpTo(dateToJD(new Date())); setDirection(1); });
dateInput.addEventListener('change', () => {
  if (!dateInput.value) return;
  const [y, m, d] = dateInput.value.split('-').map(Number);
  const dt = new Date(Date.UTC(2000, m - 1, d, 12));
  dt.setUTCFullYear(y);
  jumpTo(dateToJD(dt));
});
document.querySelectorAll('[data-scale]').forEach((b) => b.addEventListener('click', () => setScale(Number(b.dataset.scale))));
document.querySelectorAll('[data-toggle]').forEach((b) => b.addEventListener('click', () => setToggle(b.dataset.toggle, !state.show[b.dataset.toggle])));
$('#about-btn').addEventListener('click', () => { $('#about').hidden = false; });
$('#about-close').addEventListener('click', () => { $('#about').hidden = true; });
$('#about').addEventListener('click', (e) => { if (e.target.id === 'about') $('#about').hidden = true; });
$('#info-close').addEventListener('click', () => select('sun'));
$('#more-btn')?.addEventListener('click', () => $('.toolbar').classList.toggle('expanded'));

// Keyboard
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  const order = ['sun', 'mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];
  if (e.key >= '0' && e.key <= '9') select(order[Number(e.key)]);
  else if (e.key === ' ') { e.preventDefault(); setPlaying(!state.playing); }
  else if (e.key === ']') setSpeed(state.speedIndex + 1);
  else if (e.key === '[') setSpeed(state.speedIndex - 1);
  else if (e.key === 'r' || e.key === 'R') setDirection(-state.direction);
  else if (e.key === 'n' || e.key === 'N') jumpTo(dateToJD(new Date()));
  else if (e.key === 's' || e.key === 'S') setScale(scale.target ? 0 : 1);
  else if (e.key === 'o' || e.key === 'O') setToggle('orbits', !state.show.orbits);
  else if (e.key === 'l' || e.key === 'L') setToggle('labels', !state.show.labels);
  else if (e.key === 'b' || e.key === 'B') setToggle('belt', !state.show.belt);
  else if (e.key === 'p' || e.key === 'P') setToggle('pluto', !state.show.pluto);
  else if (e.key === 'm' || e.key === 'M') select('moon');
  else if (e.key === 'Escape') { $('#about').hidden = true; select('sun'); }
});

// ---------------------------------------------------------------------------
// Selection & info panel
// ---------------------------------------------------------------------------
const overviewDistance = () => mapDistance(32, scale.blend) * 1.9 * Math.max(1, 0.85 / camera.aspect);

function select(id, { instant = false } = {}) {
  const body = bodies[id];
  if (!body) return;
  state.selected = id;
  document.querySelectorAll('#body-list button').forEach((b) => b.classList.toggle('active', b.dataset.id === id));
  for (const b of Object.values(bodies)) {
    b.label.element.classList.toggle('selected', b.id === id);
    if (b.orbit) b.orbit.material.uniforms.highlight.value = b.id === id ? 1 : 0;
  }
  rig.flyTo(body, { duration: instant ? 0.001 : 2.2 });
  if (id === 'sun' && !infoForced) {
    infoEl.classList.remove('open');
  } else {
    renderInfo(body);
    infoEl.classList.add('open');
  }
  infoForced = false;
  writeHash();
}
let infoForced = false;

function fmtNum(n, digits = 0) {
  if (Math.abs(n) < 0.5 * 10 ** -digits) n = 0;
  return n.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}
function fmtDuration(hours) {
  const h = Math.abs(hours);
  const sign = hours < 0 ? ' (retrograde)' : '';
  if (h < 48) return `${fmtNum(h, 1)} h${sign}`;
  return `${fmtNum(h / 24, 1)} days${sign}`;
}
function fmtPeriod(days) {
  if (days < 1000) return `${fmtNum(days, 1)} days`;
  return `${fmtNum(days / 365.25, 2)} years`;
}

function renderInfo(body) {
  const d = body.data;
  infoEl.style.setProperty('--c', d.color);
  infoEl.querySelector('.swatch').style.setProperty('--c', d.color);
  $('#info-name').textContent = d.name;
  $('#info-type').textContent = d.type;
  $('#info-desc').textContent = d.description;
  const rows = [
    ['Radius', `${fmtNum(d.radiusKm)} km`],
    d.periodDays && [d.id === 'moon' ? 'Orbit (sidereal)' : 'Year length', fmtPeriod(d.periodDays)],
    ['Rotation', fmtDuration(d.dayHours)],
    ['Axial tilt', `${d.tiltDeg}°`],
    ['Surface gravity', `${d.gravity} m/s²`],
    ['Mean temperature', `${fmtNum(d.meanTempC)} °C`],
    d.moons !== null && d.moons !== undefined && ['Known moons', String(d.moons)],
  ].filter(Boolean);
  $('#info-static').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  updateLive();
}

function updateLive() {
  const body = bodies[state.selected];
  if (!body || !infoEl.classList.contains('open')) return;
  const p = body.au;
  const e = bodies.earth.au;
  const r = Math.hypot(p.x, p.y, p.z);
  const rows = [];
  if (body.id !== 'sun') {
    rows.push(['Distance from Sun', `${fmtNum(r, 3)} AU`]);
    rows.push(['', `${fmtNum((r * AU_KM) / 1e6, 1)} million km`]);
  }
  if (body.id !== 'earth') {
    const de = Math.hypot(p.x - e.x, p.y - e.y, p.z - e.z);
    rows.push(['Distance from Earth', de < 0.05 ? `${fmtNum(de * AU_KM)} km` : `${fmtNum(de, 3)} AU`]);
    rows.push(['Light time from Earth', fmtLight(de * 499.004784)]);
  }
  if (body.id !== 'sun' && body.id !== 'moon') {
    rows.push(['Orbital speed', `${fmtNum(orbitalSpeed(body.id, centuriesTT(state.jd)), 2)} km/s`]);
    const lon = ((Math.atan2(p.y, p.x) * 180) / Math.PI + 360) % 360;
    const lat = (Math.asin(p.z / r) * 180) / Math.PI;
    rows.push(['Ecliptic lon / lat', `${fmtNum(lon, 2)}° / ${fmtNum(lat, 2)}°`]);
  }
  $('#info-live').innerHTML = rows.map(([k, v]) => `<dt${k ? '' : ' class="cont"'}>${k}</dt><dd>${v}</dd>`).join('');
}
function fmtLight(sec) {
  if (sec < 60) return `${fmtNum(sec, 2)} s`;
  if (sec < 3600) return `${Math.floor(sec / 60)} min ${Math.round(sec % 60)} s`;
  return `${Math.floor(sec / 3600)} h ${Math.round((sec % 3600) / 60)} min`;
}

// ---------------------------------------------------------------------------
// Picking (click / double-click on the canvas)
// ---------------------------------------------------------------------------
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let downAt = null;
canvas.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
canvas.addEventListener('pointerup', (e) => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
  ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const meshes = Object.values(bodies).filter((b) => b.group.visible).map((b) => b.mesh);
  const hit = raycaster.intersectObjects(meshes, false)[0];
  if (hit) select(hit.object.userData.bodyId);
});
canvas.addEventListener('dblclick', (e) => {
  ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObjects(Object.values(bodies).map((b) => b.mesh), false)[0];
  if (!hit) select('sun');
});

// ---------------------------------------------------------------------------
// URL hash state:  #t=2026-11-11T12:00Z&body=saturn&scale=true
// ---------------------------------------------------------------------------
let hashTimer = null;
function writeHash() {
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    const p = new URLSearchParams();
    const now = dateToJD(new Date());
    if (!state.playing || Math.abs(state.jd - now) > 1) p.set('t', jdToDate(state.jd).toISOString().slice(0, 16) + 'Z');
    if (state.selected && state.selected !== 'sun') p.set('body', state.selected);
    if (scale.target === 0) p.set('scale', 'true');
    if (!state.playing) p.set('paused', '1');
    const s = p.toString();
    history.replaceState(null, '', s ? `#${s}` : location.pathname + location.search);
  }, 400);
}
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  const t = p.get('t');
  if (t) {
    const d = new Date(t);
    if (!isNaN(d)) state.jd = THREE.MathUtils.clamp(dateToJD(d), MIN_JD, MAX_JD);
  }
  if (p.get('scale') === 'true') { scale.target = 0; scale.blend = 0; }
  if (p.get('paused') === '1') state.playing = false;
  return p.get('body');
}

// ---------------------------------------------------------------------------
// Labels: hide the dot when the body is large on screen, keep text beside it
// ---------------------------------------------------------------------------
const v3 = new THREE.Vector3();
function updateLabels() {
  const h = window.innerHeight;
  const f = h / 2 / Math.tan((camera.fov * Math.PI) / 360);
  const moonGap = (bodies.moon.position.distanceTo(bodies.earth.position) / Math.max(1e-9, camera.position.distanceTo(bodies.earth.position))) * f;
  for (const b of Object.values(bodies)) {
    const dist = v3.copy(b.position).sub(camera.position).length();
    const px = (b.radius / dist) * f * (b.id === 'sun' ? 1.0 : 1);
    const el = b.label.element;
    el.classList.toggle('big', px > 3.5);
    el.firstChild.style.transform = `translate(${Math.max(-4, px + 2)}px, 0)`;
    if (b.id === 'moon') el.classList.toggle('faded', moonGap < 26);
  }
}

// ---------------------------------------------------------------------------
// Date display
// ---------------------------------------------------------------------------
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
let lastDateStr = '';
function updateDate() {
  const d = jdToDate(state.jd);
  const y = d.getUTCFullYear();
  const yStr = y > 0 ? String(y) : `${1 - y} BC`;
  const main = `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${yStr}`;
  const sub = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC · JD ${state.jd.toFixed(2)}`;
  if (main + sub !== lastDateStr) {
    $('#date-main').textContent = main;
    $('#date-sub').textContent = sub;
    lastDateStr = main + sub;
    if (document.activeElement !== dateInput && y > 0 && y < 10000) {
      dateInput.value = `${String(y).padStart(4, '0')}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    }
  }
}

// ---------------------------------------------------------------------------
// Main loop
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

  if (state.playing) {
    state.jd += SPEEDS[state.speedIndex].days * state.direction * dt;
    if (state.jd <= MIN_JD || state.jd >= MAX_JD) {
      state.jd = THREE.MathUtils.clamp(state.jd, MIN_JD, MAX_JD);
      setPlaying(false);
    }
  }

  // Animate scale-mode transitions (log-space blend)
  if (scale.blend !== scale.target) {
    const step = dt / 1.6;
    scale.blend = scale.target > scale.blend ? Math.min(scale.target, scale.blend + step) : Math.max(scale.target, scale.blend - step);
  }
  const blendEased = scale.blend * scale.blend * (3 - 2 * scale.blend);

  system.update(state.jd, blendEased, camera, elapsed);
  belt.update(state.jd - J2000, blendEased);
  // On narrow screens, slide the view up while the info sheet covers the bottom
  const wantShift = window.innerWidth <= 820 && infoEl.classList.contains('open') ? window.innerHeight * 0.17 : 0;
  viewShift += (wantShift - viewShift) * Math.min(1, dt * 5);
  if (Math.abs(viewShift) > 0.5) camera.setViewOffset(window.innerWidth, window.innerHeight, 0, viewShift, window.innerWidth, window.innerHeight);
  else if (camera.view?.enabled) camera.clearViewOffset();
  rig.update(dt, overviewDistance());
  sky.update(camera);
  updateLabels();
  updateDate();

  liveTimer += dt;
  if (liveTimer > 0.25) { liveTimer = 0; updateLive(); }

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
setSpeed(state.speedIndex);
setPlaying(state.playing);
setScale(scale.target);
setToggle('orbits', true);
system.update(state.jd, scale.blend, camera, 0);
const ov = overviewDistance();
camera.position.set(-0.33 * ov, 0.5 * ov, 0.8 * ov);
rig.focus = bodies.sun;
rig.lastFocusPos.set(0, 0, 0);
if (initialBody && bodies[initialBody]) select(initialBody, { instant: false });
else {
  state.selected = 'sun';
  document.querySelector('#body-list [data-id="sun"]').classList.add('active');
}

frame();
setTimeout(() => $('#loader').classList.add('hidden'), 350);
