// Events drawer: one-click jumps to famous moments (src/data/events.js) and to computed
// sky events around the current date: oppositions, conjunctions, greatest elongations
// (src/ephemeris/conjunctions.js) and solar / lunar eclipses (src/ephemeris/eclipses.js,
// the same list and camera framing as the eclipse panel in src/ui/eclipses.js).
//
// Choosing an entry sets the time, pauses, focuses the right body at a sensible camera
// distance and closes the drawer.

import * as THREE from 'three';
import './events.css';
import { dateToJD, jdToDate, findEclipses } from '../ephemeris/index.js';
import { skyEventsAround } from '../ephemeris/conjunctions.js';
import { MOMENTS, MOMENT_GROUPS } from '../data/events.js';
import { BODIES, BODY_MAP } from '../bodies.js';
import { state, toggles, on, jumpTo, setPlaying, select, setToggle } from '../state.js';
import { eclipseViewDirection } from './eclipses.js';
import { addToolButton } from './toolCluster.js';
import { fmtNum } from './infoPanel.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const TYPE = { total: 'Total', annular: 'Annular', hybrid: 'Hybrid', partial: 'Partial', penumbral: 'Penumbral' };
const name = (id) => BODY_MAP[id].name;
const AHEAD_DAYS = 730, BEHIND_DAYS = 365;

export function fmtWhen(jd) {
  const d = jdToDate(jd);
  const y = d.getUTCFullYear();
  const yr = y > 0 ? String(y) : `${1 - y} BC`;
  const hh = String(d.getUTCHours()).padStart(2, '0'), mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${yr} · ${hh}:${mm} UT`;
}

/** Display fields for a computed sky event or eclipse: { cat, title, detail, color, focus }. */
export function describeEvent(e) {
  if (e.kind === 'solar' || e.kind === 'lunar') {
    return {
      cat: 'eclipse', title: `${TYPE[e.type]} ${e.kind} eclipse`,
      detail: e.magnitude != null ? `magnitude ${e.magnitude.toFixed(2)}` : '', color: e.kind === 'solar' ? '#ffcc66' : '#e0805a', focus: e.kind === 'solar' ? 'earth' : 'moon',
    };
  }
  const color = BODY_MAP[e.body].color;
  const n = name(e.body);
  switch (e.type) {
    case 'opposition':
      return { cat: 'opposition', title: `${n} at opposition`, detail: `${fmtNum(e.distanceAU, 2)} AU from Earth · opposite the Sun`, color, focus: e.body };
    case 'conjunction-sun':
      return { cat: 'conjunction', title: `${n} in conjunction with the Sun`, detail: 'behind the Sun, out of sight', color, focus: e.body };
    case 'inferior':
      return { cat: 'conjunction', title: `${n} at inferior conjunction`, detail: 'between Earth and the Sun', color, focus: e.body };
    case 'superior':
      return { cat: 'conjunction', title: `${n} at superior conjunction`, detail: 'behind the Sun', color, focus: e.body };
    case 'elongation':
      return {
        cat: 'elongation', title: `${n} at greatest ${e.east ? 'eastern' : 'western'} elongation`,
        detail: `${fmtNum(e.elongationDeg, 1)}° from the Sun · ${e.east ? 'evening' : 'morning'} sky`, color, focus: e.body,
      };
    case 'conjunction': {
      const sep = e.separationDeg < 1 ? `${fmtNum(e.separationDeg * 60)}′` : `${fmtNum(e.separationDeg, 1)}°`;
      return { cat: 'conjunction', title: `${n} – ${name(e.other)} conjunction`, detail: `${sep} apart`, color, focus: e.body };
    }
    default:
      return { cat: 'conjunction', title: n, detail: '', color, focus: e.body };
  }
}

const v3 = (p) => new THREE.Vector3(p.x, p.z, -p.y); // ecliptic → scene axes

export function initEventsDrawer(app) {
  const btn = addToolButton({ id: 'events-btn', title: 'Events (V)', label: 'Events', icon: 'calendar', pressed: false });
  btn.setAttribute('aria-expanded', 'false');

  const panel = document.createElement('section');
  panel.id = 'events';
  panel.className = 'panel';
  panel.hidden = true;
  panel.setAttribute('aria-label', 'Events');
  panel.innerHTML = `
    <button class="close" aria-label="Close">×</button>
    <h2>Events</h2>
    <div class="ev-tabs" role="tablist">
      <button role="tab" class="ev-tab" data-tab="moments" aria-selected="true">Moments</button>
      <button role="tab" class="ev-tab" data-tab="sky" aria-selected="false">Sky events</button>
    </div>
    <div class="ev-body"></div>`;
  document.getElementById('app').appendChild(panel);
  const body = panel.querySelector('.ev-body');

  let tab = 'moments';
  let filter = 'all';
  const FILTERS = [['all', 'All'], ['opposition', 'Oppositions'], ['conjunction', 'Conjunctions'], ['elongation', 'Elongations'], ['eclipse', 'Eclipses']];

  // -- computed events around the simulated date --
  let computed = null; // { previous: [...], next: [...] } of { e, d: describeEvent(e) }
  function compute() {
    const jd = state.jd;
    const { previous, next } = skyEventsAround(jd, BEHIND_DAYS, AHEAD_DAYS, { maxSeparationDeg: 2, minElongationDeg: 15 });
    const eclipses = findEclipses(jd - BEHIND_DAYS, jd + AHEAD_DAYS);
    const all = [...previous, ...next, ...eclipses].sort((a, b) => a.jd - b.jd);
    const wrap = (e) => ({ e, d: describeEvent(e) });
    computed = { ref: jd, previous: all.filter((e) => e.jd <= jd).map(wrap).reverse(), next: all.filter((e) => e.jd > jd).map(wrap) };
  }

  function momentRow(m) {
    const col = BODY_MAP[m.body].color;
    return `<li class="ev" data-moment="${m.id}" style="--c:${col}">
      <span class="ev-dot" aria-hidden="true"></span>
      <span class="ev-text"><span class="ev-title">${m.title}</span>
        <span class="ev-when">${fmtWhen(dateToJD(new Date(m.when)))}</span></span>
      <button class="text-btn ev-jump" data-moment="${m.id}" aria-label="Jump to ${m.title}">Jump to</button>
      <span class="ev-blurb">${m.blurb}</span></li>`;
  }

  function eventRow(item, idx, list) {
    const { e, d } = item;
    const near = Math.abs(e.jd - state.jd) < 0.25;
    return `<li class="ev ${near ? 'current' : ''}" data-list="${list}" data-idx="${idx}" style="--c:${d.color}">
      <span class="ev-dot" aria-hidden="true"></span>
      <span class="ev-text"><span class="ev-title">${d.title}</span>
        <span class="ev-when">${fmtWhen(e.jd)}${d.detail ? ` · ${d.detail}` : ''}</span></span>
      <button class="text-btn ev-jump" data-list="${list}" data-idx="${idx}" aria-label="Jump to ${d.title}">Jump to</button></li>`;
  }

  function render() {
    panel.querySelectorAll('.ev-tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === tab)));
    if (tab === 'moments') {
      body.innerHTML = MOMENT_GROUPS.map((g) => {
        const items = MOMENTS.filter((m) => m.group === g.id);
        return `<h3>${g.label}</h3><ul>${items.map(momentRow).join('')}</ul>`;
      }).join('');
      return;
    }
    if (!computed) compute();
    const keep = (x) => filter === 'all' || x.d.cat === filter;
    const chips = FILTERS.map(([k, l]) => `<button class="ev-chip${filter === k ? ' on' : ''}" data-filter="${k}" aria-pressed="${filter === k}">${l}</button>`).join('');
    const upcoming = computed.next.map((x, i) => [x, i]).filter(([x]) => keep(x));
    const recent = computed.previous.map((x, i) => [x, i]).filter(([x]) => keep(x));
    body.innerHTML = `
      <p class="ev-sub">Around ${fmtWhen(computed.ref).split(" · ")[0]} (1 year back, 2 years ahead). Conjunctions are in ecliptic longitude.</p>
      <div class="ev-chips">${chips}</div>
      <h3>Upcoming</h3><ul>${upcoming.map(([x, i]) => eventRow(x, i, 'next')).join('') || '<li class="ev-none">None in this range</li>'}</ul>
      <h3>Recent</h3><ul>${recent.map(([x, i]) => eventRow(x, i, 'previous')).join('') || '<li class="ev-none">None in this range</li>'}</ul>`;
  }

  function open(isOpen) {
    if (isOpen && !document.getElementById('eclipses')?.hidden) document.getElementById('eclipses-btn').click();
    panel.hidden = !isOpen;
    btn.classList.toggle('on', isOpen);
    btn.setAttribute('aria-expanded', String(isOpen));
    btn.setAttribute('aria-pressed', String(isOpen));
    if (isOpen) {
      // sit just below the toolbar, which wraps to a second row on narrower screens
      const top = Math.round(document.querySelector('.toolbar').getBoundingClientRect().bottom + 8);
      panel.style.top = `${top}px`;
      panel.style.maxHeight = `calc(100% - ${top + (window.innerWidth <= 820 ? 150 : 110)}px)`; // clear of the time bar / body strip
      computed = null; render(); body.scrollTop = 0;
    }
  }

  // -- jumping --
  const afterFrames = (n, fn) => { const step = () => (n-- <= 0 ? fn() : requestAnimationFrame(step)); requestAnimationFrame(step); };
  const tmp = new THREE.Vector3();

  /**
   * Point the camera for a curated moment's `view` (see src/data/events.js). It needs the
   * bodies' scene positions at the new time, so it runs a couple of frames after the jump,
   * while the camera is still flying in.
   */
  function applyView(focusId, v) {
    const body = app.bodies[focusId];
    const pos = (id) => app.bodies[id].position;
    let dist = null, dir = null;
    if (v.from) { dist = pos(v.from).distanceTo(body.position); dir = tmp.clone().subVectors(pos(v.from), body.position).normalize(); }
    else {
      if (v.frame) dist = 1.6 * pos(v.frame).distanceTo(body.position);
      else if (v.radii) dist = app.bodies[v.of || focusId].radius * v.radii;
      const base = v.toward ? tmp.clone().subVectors(pos(v.toward), body.position) : v.away ? tmp.clone().subVectors(body.position, pos(v.away)) : null;
      if (base) dir = base.normalize().add(new THREE.Vector3(0, v.tilt ?? 0.35, 0)).normalize();
    }
    const fl = app.rig.flight;
    if (fl && fl.body === body) {
      if (dist) fl.endDist = dist;
      if (dir) fl.endDir = dir;
    } else if (dist || dir) { // reduced motion: the flight has already landed
      const { camera, rig } = app;
      const off = camera.position.clone().sub(rig.controls.target);
      camera.position.copy(rig.controls.target).addScaledVector(dir || off.normalize(), dist || off.length());
    }
  }

  /** Fly the camera to `focusId` at `jd`: pause, make sure it is visible, pick the view. */
  function goTo(jd, focusId, { dir, view } = {}) {
    setPlaying(false);
    const t = BODY_MAP[focusId].toggle || (BODY_MAP[focusId].parent && BODY_MAP[BODY_MAP[focusId].parent].toggle);
    if (t && !state.show[t]) setToggle(t, true);
    jumpTo(jd);
    select(focusId);
    if (dir && app.rig.flight) app.rig.flight.endDir = dir;
    if (view) afterFrames(2, () => applyView(focusId, view));
    open(false);
  }

  function jumpMoment(id) {
    const m = MOMENTS.find((x) => x.id === id);
    goTo(dateToJD(new Date(m.when)), m.body, { view: m.view });
  }

  function jumpEvent(list, idx) {
    const { e, d } = computed[list][idx];
    if (e.kind === 'solar' || e.kind === 'lunar') {
      goTo(e.jd, d.focus, { dir: eclipseViewDirection(e) });
    } else {
      goTo(e.jd, d.focus);
    }
  }

  btn.addEventListener('click', () => open(panel.hidden));
  panel.querySelector('.close').addEventListener('click', () => open(false));
  panel.addEventListener('pointerdown', (ev) => ev.stopPropagation());
  panel.addEventListener('click', (ev) => {
    const j = ev.target.closest('.ev-jump');
    if (j) return j.dataset.moment ? jumpMoment(j.dataset.moment) : jumpEvent(j.dataset.list, Number(j.dataset.idx));
    const t = ev.target.closest('.ev-tab');
    if (t) { tab = t.dataset.tab; render(); return; }
    const c = ev.target.closest('.ev-chip');
    if (c) { filter = c.dataset.filter; render(); }
  });
  document.getElementById('eclipses-btn')?.addEventListener('click', () => { if (!panel.hidden) open(false); });

  // V toggles the drawer (unless another feature has claimed the key)
  window.addEventListener('keydown', (ev) => {
    if (ev.target.tagName === 'INPUT' || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    const k = ev.key.toLowerCase();
    if (k === 'escape') open(false);
    if (k !== 'v' || BODIES.some((b) => b.key === 'v') || toggles.some((t) => t.shortcut === 'v')) return;
    open(panel.hidden);
  });

  on('time', () => { if (!panel.hidden && tab === 'sky') { computed = null; render(); } });
  return { open };
}
