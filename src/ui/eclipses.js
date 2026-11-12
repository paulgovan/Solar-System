// Eclipse finder panel: a toolbar button that lists the previous and next solar and
// lunar eclipses around the current simulated date, with "Jump to" for each.

import * as THREE from 'three';
import './eclipses.css';
import { eclipsesAround, computePositions, eclipseCircumstances, jdToDate } from '../ephemeris/index.js';
import { BODIES } from '../bodies.js';
import { state, toggles, on, jumpTo, setPlaying, select } from '../state.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const TYPE = { total: 'Total', annular: 'Annular', hybrid: 'Hybrid', partial: 'Partial', penumbral: 'Penumbral' };
const ICON = /* svg */ `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.6" opacity="0.55"/><circle cx="14.5" cy="10.5" r="7" fill="currentColor"/></svg>`;

function fmtDate(jd) {
  const d = jdToDate(jd);
  const y = d.getUTCFullYear();
  const yr = y > 0 ? String(y) : `${1 - y} BC`;
  const hh = String(d.getUTCHours()).padStart(2, '0'), mm = String(d.getUTCMinutes()).padStart(2, '0');
  return { date: `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${yr}`, time: `${hh}:${mm} UT` };
}

const v3 = (p) => new THREE.Vector3(p.x, p.z, -p.y); // ecliptic → scene axes

/**
 * Camera direction (scene axes, from the focused body) for a good view of an eclipse:
 * solar — halfway between the Sun and the shadow on Earth (day side in view, shadow near
 *         the middle), kept at least 32° from the Moon so it never hides the shadow;
 * lunar — from the Earthward (sunward) side of the Moon, tilted 35° so Earth is out of the way.
 */
export function eclipseViewDirection(e) {
  const p = computePositions(e.jd);
  const c = eclipseCircumstances(p.earth, p.moon);
  const em = v3({ x: p.moon.x - p.earth.x, y: p.moon.y - p.earth.y, z: p.moon.z - p.earth.z }).normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const awayFrom = (axis, dir, minAngle) => {
    if (dir.angleTo(axis) >= minAngle) return dir;
    let q = dir.clone().addScaledVector(axis, -dir.dot(axis));
    if (q.lengthSq() < 1e-8) q = up.clone().addScaledVector(axis, -up.dot(axis));
    q.normalize();
    return axis.clone().multiplyScalar(Math.cos(minAngle)).addScaledVector(q, Math.sin(minAngle));
  };
  if (e.kind === 'solar') {
    const spot = v3({ x: c.solar.point.x - p.earth.x, y: c.solar.point.y - p.earth.y, z: c.solar.point.z - p.earth.z }).normalize();
    const sun = v3(p.earth).negate().normalize();
    return awayFrom(em, spot.add(sun).normalize(), 32 * Math.PI / 180);
  }
  return awayFrom(em.clone().negate(), em.clone().negate().addScaledVector(up, 0.1).normalize(), 35 * Math.PI / 180);
}

export function initEclipsePanel(app) {
  const btn = document.createElement('button');
  btn.className = 'icon-btn';
  btn.id = 'eclipses-btn';
  btn.title = 'Eclipses (E)';
  btn.setAttribute('aria-label', 'Eclipses');
  btn.setAttribute('aria-expanded', 'false');
  btn.innerHTML = ICON;
  const toolbar = document.querySelector('.toolbar');
  toolbar.insertBefore(btn, document.getElementById('more-btn') || null);

  const panel = document.createElement('section');
  panel.id = 'eclipses';
  panel.className = 'panel';
  panel.hidden = true;
  panel.setAttribute('aria-label', 'Eclipses');
  panel.innerHTML = `
    <button class="close" aria-label="Close">×</button>
    <h2>Eclipses</h2>
    <p class="ecl-sub">Times of greatest eclipse, from Meeus’ lunar theory.</p>
    <div class="ecl-list"></div>
    <div class="ecl-nav">
      <button class="text-btn" data-dir="-1">‹ Earlier</button>
      <button class="text-btn" data-dir="1">Later ›</button>
    </div>`;
  document.getElementById('app').appendChild(panel);
  const list = panel.querySelector('.ecl-list');

  let ref = state.jd;
  let shown = { previous: [], next: [] };

  function row(e, current) {
    const { date, time } = fmtDate(e.jd);
    const mag = e.magnitude != null ? ` · mag ${e.magnitude.toFixed(2)}` : '';
    return `<li class="ecl ${e.kind}${current ? ' current' : ''}" data-jd="${e.jd}">
      <span class="ecl-dot" aria-hidden="true"></span>
      <span class="ecl-text"><span class="ecl-type">${TYPE[e.type]} ${e.kind}</span>
        <span class="ecl-when">${date} · ${time}${mag}</span></span>
      <button class="text-btn ecl-jump" data-jd="${e.jd}">Jump to</button></li>`;
  }

  function render() {
    shown = eclipsesAround(ref, 3, 5);
    const near = (e) => Math.abs(e.jd - state.jd) < 0.25;
    list.innerHTML = `
      <h3>Previous</h3><ul>${shown.previous.map((e) => row(e, near(e))).join('')}</ul>
      <h3>Next</h3><ul>${shown.next.map((e) => row(e, near(e))).join('')}</ul>`;
  }

  function open(isOpen) {
    panel.hidden = !isOpen;
    btn.classList.toggle('on', isOpen);
    btn.setAttribute('aria-expanded', String(isOpen));
    if (isOpen) { ref = state.jd; render(); }
  }

  function jump(jd) {
    const e = [...shown.previous, ...shown.next].find((x) => x.jd === jd);
    if (!e) return;
    setPlaying(false);
    jumpTo(e.jd);
    select(e.kind === 'solar' ? 'earth' : 'moon');
    // select() started a camera flight; point it along a direction that shows the eclipse
    if (app.rig.flight) app.rig.flight.endDir = eclipseViewDirection(e);
    open(false);
  }

  btn.addEventListener('click', () => open(panel.hidden));
  panel.querySelector('.close').addEventListener('click', () => open(false));
  panel.addEventListener('pointerdown', (ev) => ev.stopPropagation());
  panel.addEventListener('click', (ev) => {
    const j = ev.target.closest('.ecl-jump');
    if (j) return jump(Number(j.dataset.jd));
    const nav = ev.target.closest('[data-dir]');
    if (nav) {
      const dir = Number(nav.dataset.dir);
      const all = [...shown.previous, ...shown.next];
      if (all.length) ref = dir < 0 ? all[0].jd - 1e-6 : all[all.length - 1].jd;
      render();
    }
  });

  // E toggles the panel (unless another feature has claimed the key)
  window.addEventListener('keydown', (ev) => {
    if (ev.target.tagName === 'INPUT' || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    const k = ev.key.toLowerCase();
    if (k === 'escape') open(false);
    if (k !== 'e' || BODIES.some((b) => b.key === 'e') || toggles.some((t) => t.shortcut === 'e')) return;
    open(panel.hidden);
  });

  on('time', () => { if (!panel.hidden) { ref = state.jd; render(); } });
}
