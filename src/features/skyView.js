// Feature: the sky from Earth — the observer panel ("Tonight") and the ground view.
//
// Ground view = a second render pass (src/scene/skyView.js) drawn instead of the orrery while the
// mode is on: the main camera, scene and focus are left alone and restored on exit. While it is
// on, `app.composer.render` and `app.labelRenderer.render` are swapped for the ground renderer
// (and a no-op), pointer events on the canvas drive the view instead of the orbit controls, and
// the time controls keep working.
//
// Public handle: app.skyView = { active, toggle(), enter(), exit(), lookAt(id), view }.

import * as THREE from 'three';
import '../ui/skyview.css';
import { state, on, select, setSpeed } from '../state.js';
import { getObserver, formatLocalTime, zoneLabel } from '../observer.js';
import { loadSkyData } from '../scene/skyData.js';
import { createSkyView, SKY_BODIES } from '../scene/skyView.js';
import { initObserverPanel } from '../ui/observer.js';
import { compassPoint, horizontalToVector, DEG } from '../ephemeris/index.js';

const NAMES = { sun: 'Sun', moon: 'Moon', mercury: 'Mercury', venus: 'Venus', mars: 'Mars', jupiter: 'Jupiter', saturn: 'Saturn', uranus: 'Uranus', neptune: 'Neptune' };
const CARDINALS = [['N', 0, false], ['NE', 45, true], ['E', 90, false], ['SE', 135, true], ['S', 180, false], ['SW', 225, true], ['W', 270, false], ['NW', 315, true]];
const FOV_MIN = 1.5, FOV_MAX = 110;

const wrap180 = (a) => ((a + 540) % 360) - 180;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

export default {
  id: 'skyView',

  setup(app) {
    const self = this;
    const root = document.getElementById('app');
    const canvas = app.renderer.domElement;

    // -- DOM: HUD, hint, label layer
    const hud = document.createElement('div');
    hud.id = 'skyview-hud';
    hud.className = 'panel';
    hud.innerHTML = `
      <button class="text-btn" data-act="exit" title="Back to the solar system (G)">← Solar system</button>
      <span class="sv-read" aria-live="off"></span>
      <button class="text-btn" data-act="grid" aria-pressed="false" title="Altitude / azimuth grid">Grid</button>
      <button class="text-btn" data-act="tonight" title="Tonight table (T)">Tonight</button>`;
    root.appendChild(hud);
    const readout = hud.querySelector('.sv-read');
    const hint = document.createElement('div');
    hint.id = 'skyview-hint';
    root.appendChild(hint);
    const layer = document.createElement('div');
    layer.id = 'skyview-labels';
    layer.setAttribute('aria-hidden', 'true');
    root.appendChild(layer);
    hud.addEventListener('pointerdown', (e) => e.stopPropagation());

    let hintTimer = 0;
    const showHint = (text, ms = 4500) => {
      hint.textContent = text;
      hint.classList.add('show');
      clearTimeout(hintTimer);
      hintTimer = setTimeout(() => hint.classList.remove('show'), ms);
    };

    // -- view state
    const cam = { yaw: 180, pitch: 25, fov: 70, grid: false };
    let tween = null;
    let view = null, building = null;
    let active = false;
    let saved = null;
    let conFade = 0;
    const labels = { cardinals: [], bodies: {}, cons: [], built: false };

    function buildLabels() {
      if (labels.built) return;
      labels.built = true;
      const mk = (cls, text) => { const el = document.createElement('div'); el.className = `sv-label ${cls}`; el.textContent = text; layer.appendChild(el); return el; };
      for (const [t, az, minor] of CARDINALS) labels.cardinals.push({ el: mk(minor ? 'card minor' : 'card', t), dir: new THREE.Vector3(...Object.values(horizontalToVector(2, az))) });
      for (const id of SKY_BODIES) labels.bodies[id] = mk('body', NAMES[id]);
      for (const f of view.figures) labels.cons.push({ el: mk('con', f.name), ra: f.label[0], dec: f.label[1], dir: new THREE.Vector3() });
    }

    async function ensureView() {
      if (view) return view;
      building ||= (async () => {
        const data = await loadSkyData();
        const v = createSkyView(app.renderer, data);
        v.figures = data.figures;
        await app.renderer.compileAsync(v.scene, v.camera).catch(() => {});
        view = v;
        buildLabels();
        return v;
      })();
      return building;
    }

    // -- entering / leaving
    async function enter() {
      if (active) return;
      active = true; // set early so repeated calls do nothing while the data loads
      app.skyView.active = true;
      try { await ensureView(); } catch (err) { console.warn('Ground view unavailable', err); active = false; app.skyView.active = false; return; }
      if (!active) return;

      const rig = app.rig, f = rig.focus;
      saved = {
        focus: f, selected: state.selected,
        offset: f ? app.camera.position.clone().sub(f.position) : null,
        target: f ? rig.controls.target.clone().sub(f.position) : null,
        controls: rig.controls.enabled, speed: state.speedIndex, sped: false,
        render: app.composer.render, labelRender: app.labelRenderer.render,
      };
      rig.controls.enabled = false;
      app.composer.render = () => view.render();
      app.labelRenderer.render = () => {};
      root.classList.add('ground-view');
      hud.querySelector('[data-act=grid]').setAttribute('aria-pressed', String(cam.grid));
      canvas.setAttribute('aria-label', 'The sky as seen from the observer’s location. Drag to look around, scroll to zoom.');
      // a day per second is a blur from the ground: slow the clock to a watchable rate
      if (state.speedIndex >= 3) { setSpeed(1); saved.sped = true; }
      aimInitial();
      showHint('Drag to look around · scroll or pinch to zoom · G to leave', 6000);
    }

    function exit() {
      if (!active) return;
      active = false;
      app.skyView.active = false;
      tween = null;
      if (!saved) return;
      const rig = app.rig, s = saved;
      saved = null;
      app.composer.render = s.render;
      app.labelRenderer.render = s.labelRender;
      root.classList.remove('ground-view', 'dragging');
      rig.controls.enabled = s.controls;
      canvas.setAttribute('aria-label', 'Interactive 3D model of the solar system. Use the body list or number keys to focus a planet.');
      if (s.sped && state.speedIndex === 1) setSpeed(s.speed);
      // put the orrery camera back exactly where it was, relative to what it was following
      if (state.selected !== s.selected) select(s.selected, { instant: true });
      rig.flight = null;
      if (s.focus) {
        rig.focus = s.focus;
        app.camera.position.copy(s.focus.position).add(s.offset);
        rig.controls.target.copy(s.focus.position).add(s.target);
        rig.lastFocusPos.copy(s.focus.position);
        rig.controls.update();
      }
      hint.classList.remove('show');
      app.panelHandle?.update?.(1);
    }

    const toggle = () => (active ? exit() : enter());

    /** Look at a Sun / Moon / planet (smooth turn); mentions it if it is below the horizon. */
    function lookAt(id) {
      if (!view || !view.sky.bodies[id]) return;
      const b = view.sky.bodies[id];
      const alt = b.altApparent;
      const target = { yaw: b.az, pitch: clamp(alt, 6, 80) };
      tween = { t: 0, from: { yaw: cam.yaw, pitch: cam.pitch, fov: cam.fov }, to: { ...target, fov: Math.min(cam.fov, 45) } };
      if (alt < -0.5) showHint(`${NAMES[id]} is below the horizon right now`, 3500);
    }

    function aimInitial() {
      const obs = getObserver();
      const sel = state.selected;
      cam.pitch = 28;
      cam.fov = 70;
      cam.yaw = obs.lat >= 0 ? 180 : 0;
      tween = null;
      // if the focused body is up, start by looking at it
      if (view && SKY_BODIES.includes(sel)) {
        view.update({ ...frameParams(), });
        const b = view.sky.bodies[sel];
        if (b && b.altApparent > 0) { cam.yaw = b.az; cam.pitch = clamp(b.altApparent, 6, 80); }
      }
    }

    // -- input
    const pointers = new Map();
    let pinchStart = null;
    const inView = (e) => active && e.target === canvas;
    const degPerPx = () => cam.fov / (canvas.clientHeight || 800);

    root.addEventListener('pointerdown', (e) => {
      if (!inView(e)) return;
      e.stopPropagation();
      canvas.setPointerCapture?.(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      tween = null;
      root.classList.add('dragging');
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchStart = { d: Math.hypot(a.x - b.x, a.y - b.y), fov: cam.fov };
      }
    }, true);
    root.addEventListener('pointermove', (e) => {
      if (!active || !pointers.has(e.pointerId)) return;
      e.stopPropagation();
      const p = pointers.get(e.pointerId);
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (pointers.size === 1) {
        cam.yaw = (cam.yaw - dx * degPerPx() + 360) % 360;
        cam.pitch = clamp(cam.pitch + dy * degPerPx(), -89, 89);
      } else if (pointers.size === 2 && pinchStart) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        cam.fov = clamp(pinchStart.fov * pinchStart.d / Math.max(d, 1), FOV_MIN, FOV_MAX);
      }
    }, true);
    const release = (e) => {
      if (!pointers.has(e.pointerId)) return;
      e.stopPropagation();
      pointers.delete(e.pointerId);
      pinchStart = null;
      if (!pointers.size) root.classList.remove('dragging');
    };
    root.addEventListener('pointerup', release, true);
    root.addEventListener('pointercancel', release, true);
    root.addEventListener('wheel', (e) => {
      if (!inView(e)) return;
      e.preventDefault();
      e.stopPropagation();
      cam.fov = clamp(cam.fov * Math.exp(e.deltaY * 0.0012), FOV_MIN, FOV_MAX);
    }, { capture: true, passive: false });
    // the orrery's picking uses click / dblclick on the canvas: swallow them too
    for (const t of ['click', 'dblclick']) root.addEventListener(t, (e) => { if (inView(e)) e.stopPropagation(); }, true);

    window.addEventListener('keydown', (e) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'g') { toggle(); return; }
      if (!active) return;
      if (k === 'escape') exit();
      else if (k === 'arrowleft') { cam.yaw = (cam.yaw - cam.fov * 0.1 + 360) % 360; tween = null; }
      else if (k === 'arrowright') { cam.yaw = (cam.yaw + cam.fov * 0.1) % 360; tween = null; }
      else if (k === 'arrowup') { cam.pitch = clamp(cam.pitch + cam.fov * 0.1, -89, 89); tween = null; }
      else if (k === 'arrowdown') { cam.pitch = clamp(cam.pitch - cam.fov * 0.1, -89, 89); tween = null; }
      else if (k === '+' || k === '=') cam.fov = clamp(cam.fov / 1.2, FOV_MIN, FOV_MAX);
      else if (k === '-') cam.fov = clamp(cam.fov * 1.2, FOV_MIN, FOV_MAX);
    });

    hud.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      if (b.dataset.act === 'exit') exit();
      else if (b.dataset.act === 'grid') { cam.grid = !cam.grid; b.setAttribute('aria-pressed', String(cam.grid)); }
      else if (b.dataset.act === 'tonight') self.panel?.open(!self.panel.isOpen());
    });

    // pressing a body key (or choosing a body elsewhere) while on the ground turns to it
    on('select', (id) => { if (active && SKY_BODIES.includes(id)) lookAt(id); });

    app.skyView = { active: false, toggle, enter, exit, lookAt, cam, get view() { return view; }, ensureView };
    this.panel = initObserverPanel(app);
    app.panelHandle = this.panel;

    // -- per-frame
    const size = new THREE.Vector2();
    function frameParams() {
      app.renderer.getSize(size);
      return {
        jd: state.jd, observer: getObserver(), yaw: cam.yaw, pitch: cam.pitch, fov: cam.fov,
        width: size.x, height: size.y, pixelRatio: app.renderer.getPixelRatio(), grid: cam.grid, constellations: conFade,
      };
    }

    const tmpP = {};
    this.frame = (dt) => {
      if (tween) {
        tween.t = Math.min(1, tween.t + dt / 0.7);
        const e = tween.t < 0.5 ? 4 * tween.t ** 3 : 1 - Math.pow(-2 * tween.t + 2, 3) / 2;
        cam.yaw = (tween.from.yaw + wrap180(tween.to.yaw - tween.from.yaw) * e + 360) % 360;
        cam.pitch = tween.from.pitch + (tween.to.pitch - tween.from.pitch) * e;
        cam.fov = tween.from.fov + (tween.to.fov - tween.from.fov) * e;
        if (tween.t >= 1) tween = null;
      }
      const target = state.show.constellations ? 1 : 0;
      conFade = target > conFade ? Math.min(target, conFade + dt * 3) : Math.max(target, conFade - dt * 3);
      view.update(frameParams());

      // labels
      const W = size.x, H = size.y;
      const place = (el, p, dx = 0, dy = 0) => {
        if (!p.visible) { el.style.display = 'none'; return; }
        el.style.display = '';
        el.style.transform = `translate(${(p.x + dx).toFixed(1)}px, ${(p.y + dy).toFixed(1)}px)`;
      };
      for (const c of labels.cardinals) {
        const p = view.project(c.dir, W, H, tmpP);
        if (p.visible) { c.el.style.display = ''; c.el.style.transform = `translate(${p.x - c.el.offsetWidth / 2}px, ${p.y - 22}px)`; } else c.el.style.display = 'none';
      }
      const showNames = state.show.labels;
      for (const id of SKY_BODIES) {
        const b = view.sky.bodies[id], el = labels.bodies[id];
        const visible = showNames && b.altApparent > -0.3 && (id === 'sun' || id === 'moon' || b.mag < view.sky.limMag + 0.4);
        if (!visible) { el.style.display = 'none'; continue; }
        const rad = Math.max(b.semiDiameter * DEG * (H / 2) / Math.tan(cam.fov * DEG / 2), id === 'sun' ? 11 : id === 'moon' ? 9 : 4);
        place(el, view.project(b.dir, W, H, tmpP), 8 + rad * 0.6, -8 - rad * 0.6);
      }
      const showCons = conFade > 0.5 && state.show.labels !== false;
      for (const c of labels.cons) {
        if (!showCons) { c.el.style.display = 'none'; continue; }
        view.starDirection(c.ra, c.dec, c.dir);
        if (c.dir.y < 0.03) { c.el.style.display = 'none'; continue; }
        const p = view.project(c.dir, W, H, tmpP);
        if (p.visible) { c.el.style.display = ''; c.el.style.transform = `translate(${p.x - c.el.offsetWidth / 2}px, ${p.y - 6}px)`; } else c.el.style.display = 'none';
      }

      // readout
      const o = getObserver();
      const sky = view.sky;
      const alt = cam.pitch;
      readout.textContent = `${o.name} · ${formatLocalTime(state.jd, o)} ${zoneLabel(state.jd, o)} · facing ${compassPoint(cam.yaw)} ${Math.round(cam.yaw)}°, ${alt >= 0 ? '+' : '−'}${Math.abs(Math.round(alt))}° · ${cam.fov < 10 ? cam.fov.toFixed(1) : Math.round(cam.fov)}° field · Sun ${sky.sunAlt >= 0 ? '+' : '−'}${Math.abs(sky.sunAlt).toFixed(0)}°`;
    };

    // `?` deep link: #sky=1 opens the ground view as soon as the app is ready
    if (new URLSearchParams(location.hash.slice(1)).get('sky') === '1') enter();
    if (import.meta.env.DEV) window.__app.skyViewHandle = app.skyView;
  },

  update(app, dt) {
    this.panel?.update(dt);
    if (app.skyView.active && app.skyView.view) this.frame(dt);
  },
};
