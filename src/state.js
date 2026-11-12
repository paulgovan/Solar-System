// Application state: simulated time, selection, toggles and scale target, with a
// tiny event bus and URL-hash persistence. UI modules and feature modules read and
// change state only through these functions.

import { dateToJD, jdToDate } from './ephemeris/index.js';
import { scale } from './scale.js';

export const SPEEDS = [
  { label: 'Real time', days: 1 / 86400 },
  { label: '1 min / s', days: 1 / 1440 },
  { label: '1 hour / s', days: 1 / 24 },
  { label: '6 hours / s', days: 0.25 },
  { label: '1 day / s', days: 1 },
  { label: '1 week / s', days: 7 },
  { label: '1 month / s', days: 30.436875 },
  { label: '1 year / s', days: 365.25 },
];
export const MIN_JD = 625673.5; // 3000 BC
export const MAX_JD = 2816787.5; // 3000 AD

export const state = {
  jd: dateToJD(new Date()),
  playing: true,
  speedIndex: 4,
  direction: 1,
  selected: 'sun',
  show: {},
};

// ---------------------------------------------------------------------------
// Events: 'select' (id, opts), 'toggle' ({key, on}), 'time' (jd), 'playing' (bool),
//         'speed' (index), 'direction' (±1), 'scale' (target)
// ---------------------------------------------------------------------------
const listeners = {};
export function on(event, fn) {
  (listeners[event] ||= []).push(fn);
  return () => { listeners[event] = listeners[event].filter((f) => f !== fn); };
}
export function emit(event, payload, extra) {
  for (const fn of listeners[event] || []) fn(payload, extra);
}

// ---------------------------------------------------------------------------
// Toggles (toolbar switches). Features register their own with registerToggle().
// ---------------------------------------------------------------------------
export const toggles = [];
/**
 * @param {{key: string, label: string, title?: string, shortcut?: string, initial?: boolean, order?: number}} t
 */
export function registerToggle(t) {
  if (toggles.some((x) => x.key === t.key)) throw new Error(`Duplicate toggle: ${t.key}`);
  toggles.push({ initial: true, order: 100, ...t });
  toggles.sort((a, b) => a.order - b.order);
  state.show[t.key] = t.initial ?? true;
}
export function setToggle(key, on) {
  state.show[key] = on;
  emit('toggle', { key, on });
}

// ---------------------------------------------------------------------------
// Time & view
// ---------------------------------------------------------------------------
const clampJD = (jd) => Math.min(MAX_JD, Math.max(MIN_JD, jd));

export function setPlaying(p) {
  state.playing = p;
  emit('playing', p);
  writeHash();
}
export function setSpeed(i) {
  state.speedIndex = Math.min(SPEEDS.length - 1, Math.max(0, i));
  emit('speed', state.speedIndex);
}
export function setDirection(d) {
  state.direction = d;
  emit('direction', d);
}
export function jumpTo(jd) {
  state.jd = clampJD(jd);
  emit('time', state.jd);
  writeHash();
}
/** Advance simulated time by dt real seconds; returns false if a bound was hit. */
export function tick(dt) {
  if (!state.playing) return true;
  const next = state.jd + SPEEDS[state.speedIndex].days * state.direction * dt;
  state.jd = clampJD(next);
  if (state.jd !== next) { setPlaying(false); return false; }
  return true;
}
export function setScale(target) {
  scale.target = target;
  emit('scale', target);
  writeHash();
}
export function select(id, opts = {}) {
  state.selected = id;
  emit('select', id, opts);
  writeHash();
}

// ---------------------------------------------------------------------------
// URL hash:  #t=2026-11-11T12:00Z&body=saturn&scale=true&paused=1
// ---------------------------------------------------------------------------
let hashTimer = null;
export function writeHash() {
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

/** Apply the URL hash to state; returns the body id to focus, if any. */
export function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  const t = p.get('t');
  if (t) {
    const d = new Date(t);
    if (!isNaN(d)) state.jd = clampJD(dateToJD(d));
  }
  if (p.get('scale') === 'true') { scale.target = 0; scale.blend = 0; }
  if (p.get('paused') === '1') state.playing = false;
  return p.get('body');
}
