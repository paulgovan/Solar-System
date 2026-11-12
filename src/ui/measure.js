// Measure tool: pick two bodies (click them or their labels, or use the lists) and a line
// joins their centres with a live label giving the real distance in AU, km and light time.
//
// The line is drawn between the bodies' positions in the scene, so in compressed scale it
// follows the compressed layout; the numbers always come from the true heliocentric
// positions (body.au) and are updated as time runs. `X` toggles the tool, Esc clears the line.

import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import './measure.css';
import { AU_KM } from '../ephemeris/index.js';
import { BODIES, BODY_MAP } from '../bodies.js';
import { state } from '../state.js';
import { fmtNum, fmtLight } from './infoPanel.js';
import { addToolButton } from './toolCluster.js';

const C_KM_S = 299792.458;

/** Real distance between two heliocentric points (AU) as display strings. */
export function describeDistance(a, b) {
  const au = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  const km = au * AU_KM;
  const auStr = au >= 0.1 ? `${fmtNum(au, 3)} AU` : au >= 0.01 ? `${fmtNum(au, 4)} AU` : `${fmtNum(au, 6)} AU`;
  const kmStr = km >= 1e7 ? `${fmtNum(km / 1e6, 1)} million km` : `${fmtNum(km)} km`;
  return { au, km, auStr, kmStr, lightStr: fmtLight(km / C_KM_S) };
}

export function initMeasure(app) {
  const btn = addToolButton({ id: 'measure-btn', title: 'Measure distance (X)', label: 'Measure distance', icon: 'ruler', pressed: false });

  const panel = document.createElement('section');
  panel.id = 'measure';
  panel.className = 'panel';
  panel.hidden = true;
  panel.setAttribute('aria-label', 'Measure distance');
  const options = BODIES.map((b) => `<option value="${b.id}">${b.name}</option>`).join('');
  panel.innerHTML = `
    <button class="close" aria-label="Close measure tool">×</button>
    <h2>Measure</h2>
    <div class="ms-pick">
      <label><span class="sr-only">First body</span><select id="measure-a" aria-label="First body"><option value="">First body</option>${options}</select></label>
      <span class="ms-arrow" aria-hidden="true">↔</span>
      <label><span class="sr-only">Second body</span><select id="measure-b" aria-label="Second body"><option value="">Second body</option>${options}</select></label>
    </div>
    <div class="ms-read" aria-live="polite"><span class="ms-main">—</span><span class="ms-sub"></span></div>
    <p class="ms-hint">Click two bodies, or pick them above. <kbd>Esc</kbd> clears.</p>
    <p class="ms-note" hidden>Distances are real; the line follows the compressed layout.</p>`;
  document.getElementById('app').appendChild(panel);
  const selA = panel.querySelector('#measure-a'), selB = panel.querySelector('#measure-b');
  const main = panel.querySelector('.ms-main'), sub = panel.querySelector('.ms-sub'), note = panel.querySelector('.ms-note');

  // -- scene objects --
  const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xffb547, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false }));
  line.frustumCulled = false;
  line.renderOrder = 10;
  line.visible = false;
  line.name = 'measure-line';
  const labelEl = document.createElement('div');
  labelEl.className = 'measure-label';
  labelEl.innerHTML = '<span class="ml-names"></span><span class="ml-dist"></span><span class="ml-sub"></span>';
  const label = new CSS2DObject(labelEl);
  label.visible = false;
  label.center.set(0.5, 1.25); // sit above the line's midpoint
  app.scene.add(line, label);
  const names = labelEl.querySelector('.ml-names'), dist = labelEl.querySelector('.ml-dist'), lsub = labelEl.querySelector('.ml-sub');

  let active = false;
  let a = null, b = null; // body ids
  let lastText = '';

  function syncSelects() { selA.value = a || ''; selB.value = b || ''; }

  function setPair(newA, newB) {
    a = newA; b = newB;
    syncSelects();
    lastText = '';
    update();
  }

  function setActive(on) {
    active = on;
    panel.hidden = !on;
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', String(on));
    document.documentElement.classList.toggle('measuring', on);
    if (!on) setPair(null, null);
  }

  /** Nearest visible body to a screen point (centre within 16 px of the disc edge), or null. */
  function pickAt(x, y) {
    const w = window.innerWidth, h = window.innerHeight;
    const f = h / 2 / Math.tan((app.camera.fov * Math.PI) / 360);
    const v = new THREE.Vector3();
    let best = null, bestD = 16;
    for (const body of Object.values(app.bodies)) {
      if (!body.group.visible) continue;
      v.copy(body.position).project(app.camera);
      if (v.z > 1) continue;
      const sx = (v.x * 0.5 + 0.5) * w, sy = (-v.y * 0.5 + 0.5) * h;
      const px = (body.radius / app.camera.position.distanceTo(body.position)) * f;
      const d = Math.hypot(sx - x, sy - y) - px;
      if (d < bestD) { bestD = d; best = body.id; }
    }
    return best;
  }

  function choose(id) {
    if (!a || (a && b)) setPair(id, null); // start a new measurement
    else if (id !== a) setPair(a, id);
  }

  // Clicks while measuring pick bodies instead of flying to them: intercept before the
  // canvas / label handlers (capture phase on window).
  let downAt = null;
  window.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; }, true);
  window.addEventListener('pointerup', (e) => {
    if (!active || e.target !== app.renderer.domElement || !downAt) return;
    if (Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return; // a drag
    const id = pickAt(e.clientX, e.clientY);
    if (!id) return;
    e.stopImmediatePropagation();
    choose(id);
  }, true);
  window.addEventListener('click', (e) => {
    const el = active && e.target.closest?.('.label');
    if (!el) return;
    const body = Object.values(app.bodies).find((x) => x.label.element === el);
    if (!body) return;
    e.stopImmediatePropagation();
    choose(body.id);
  }, true);

  selA.addEventListener('change', () => setPair(selA.value || null, b === selA.value ? null : b));
  selB.addEventListener('change', () => setPair(a === selB.value ? null : a, selB.value || null));
  btn.addEventListener('click', () => setActive(!active));
  panel.querySelector('.close').addEventListener('click', () => setActive(false));
  panel.addEventListener('pointerdown', (e) => e.stopPropagation());

  // X toggles; Esc clears the line (and, with nothing to clear, leaves the tool).
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'x' && !BODIES.some((x) => x.key === 'x')) { setActive(!active); return; }
    if (k === 'escape' && active) {
      if (a || b) { e.stopImmediatePropagation(); setPair(null, null); } else setActive(false);
    }
  }, true);

  const pa = new THREE.Vector3(), pb = new THREE.Vector3();
  /** Per-frame: move the line and refresh the readout. */
  function update() {
    if (active) {
      // on narrow screens the card sits under the toolbar, clear of the bottom info sheet
      const narrow = window.innerWidth <= 820;
      panel.style.top = narrow ? `${Math.round(document.querySelector('.toolbar').getBoundingClientRect().bottom + 8)}px` : '';
      panel.style.bottom = narrow ? 'auto' : '';
    }
    const ready = active && a && b && app.bodies[a] && app.bodies[b];
    const shown = ready && app.bodies[a].group.visible && app.bodies[b].group.visible;
    line.visible = label.visible = !!shown;
    note.hidden = !(active && (app.blend ?? 1) > 0.5);
    if (!ready) {
      const text = a ? `${BODY_MAP[a].name} ↔ pick a second body` : 'Pick two bodies';
      if (text !== lastText) { lastText = text; main.textContent = text; sub.textContent = ''; }
      return;
    }
    const A = app.bodies[a], B = app.bodies[b];
    if (shown) {
      pa.copy(A.position); pb.copy(B.position);
      const pos = geometry.attributes.position;
      pos.setXYZ(0, pa.x, pa.y, pa.z); pos.setXYZ(1, pb.x, pb.y, pb.z);
      pos.needsUpdate = true;
      label.position.copy(pa).lerp(pb, 0.5);
    }
    const d = describeDistance(A.au, B.au);
    const text = `${d.auStr}|${d.kmStr}|${d.lightStr}|${shown}`;
    if (text === lastText) return;
    lastText = text;
    main.textContent = shown ? d.auStr : `${d.auStr} (hidden)`;
    sub.textContent = `${d.kmStr} · ${d.lightStr} light time`;
    names.textContent = `${A.data.name} ↔ ${B.data.name}`;
    dist.textContent = d.auStr;
    lsub.textContent = `${d.kmStr} · ${d.lightStr}`;
  }

  return { update, setActive, setPair, get pair() { return [a, b]; }, get active() { return active; } };
}
