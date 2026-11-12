// The observer: where on Earth the sky is seen from. A tiny store (current place, change
// events, localStorage persistence) plus local-time helpers built on Intl. Coordinates never
// leave the browser: geolocation results are used and saved locally only.

import { CITIES } from './data/cities.js';
import { jdToDate } from './ephemeris/index.js';

const KEY = 'solar-system.observer.v1';

/** @typedef {{name:string, country:string, lat:number, lon:number, tz:string, elevation:number, kind:'city'|'geolocated'|'custom'}} Observer */

export { CITIES };

const listeners = new Set();
let current = null;

function browserZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'UTC'; }
}

function validZone(tz) {
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; }
}

/** Great-circle distance in degrees between two places. */
function separation(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180;
  const s = Math.sin(lat1 * r) * Math.sin(lat2 * r) + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.cos((lon1 - lon2) * r);
  return Math.acos(Math.max(-1, Math.min(1, s))) / r;
}

/** The listed city nearest to a latitude / longitude (its time zone is used for custom places). */
export function nearestCity(lat, lon) {
  let best = CITIES[0], bd = Infinity;
  for (const c of CITIES) {
    const d = separation(lat, lon, c.lat, c.lon);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

function sanitize(o) {
  const lat = Number(o?.lat), lon = Number(o?.lon);
  if (!(Math.abs(lat) <= 90) || !(Math.abs(lon) <= 180)) return null;
  const tz = validZone(o.tz) ? o.tz : nearestCity(lat, lon).tz;
  return {
    name: String(o.name || 'Custom location').slice(0, 80), country: String(o.country || '').slice(0, 80),
    lat, lon, tz, elevation: Number(o.elevation) || 0,
    kind: ['city', 'geolocated', 'custom'].includes(o.kind) ? o.kind : 'custom',
  };
}

function defaultObserver() {
  const zone = browserZone();
  const home = zone.split('/').pop().replace(/_/g, ' ');
  const c = CITIES.find((x) => x.tz === zone && x.name === home) || CITIES.find((x) => x.tz === zone)
    || CITIES.find((x) => x.name === 'London');
  return { ...c, elevation: 0, kind: 'city' };
}

/** The current observer (loaded from localStorage on first use; defaults to a city in the browser's time zone). */
export function getObserver() {
  if (current) return current;
  let saved = null;
  try { saved = sanitize(JSON.parse(localStorage.getItem(KEY))); } catch { /* ignore */ }
  current = saved || defaultObserver();
  return current;
}

/** Replace the observer; persists it and notifies subscribers. */
export function setObserver(o) {
  const clean = sanitize(o);
  if (!clean) throw new Error('Invalid observer');
  current = clean;
  try { localStorage.setItem(KEY, JSON.stringify(clean)); } catch { /* private mode etc. */ }
  for (const fn of listeners) fn(current);
  return current;
}

export function setCity(city) {
  return setObserver({ ...city, elevation: 0, kind: 'city' });
}

/** Subscribe to observer changes; returns an unsubscribe function. */
export function onObserver(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Ask the browser for the user's position (shows the permission prompt). Resolves to an Observer. */
export function locate() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Geolocation is not available in this browser.'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({
        name: 'My location', country: '', lat: p.coords.latitude, lon: p.coords.longitude,
        elevation: Number.isFinite(p.coords.altitude) ? p.coords.altitude : 0,
        tz: browserZone(), kind: 'geolocated',
      }),
      (e) => reject(new Error(e.code === 1 ? 'Location permission was denied.' : 'Could not determine your location.')),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 },
    );
  });
}

// ---------------------------------------------------------------------------
// Local time
// ---------------------------------------------------------------------------
const fmts = new Map();
function dtf(tz, key, opts) {
  const k = `${tz}|${key}`;
  let f = fmts.get(k);
  if (!f) { f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, ...opts }); fmts.set(k, f); }
  return f;
}

const MODERN = [Date.UTC(1900, 0, 1), Date.UTC(2100, 0, 1)];

/**
 * Offset of local civil time from UTC, in minutes, at a UTC Julian Date. Outside 1900–2100 (where
 * zone rules are unknown or meaningless) local mean solar time of the observer is used.
 */
export function tzOffsetMinutes(jd, obs) {
  const d = jdToDate(jd), ms = d.getTime();
  if (!(ms >= MODERN[0] && ms < MODERN[1])) return Math.round(obs.lon * 4);
  const parts = dtf(obs.tz, 'parts', { hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }).formatToParts(d);
  const g = (t) => Number(parts.find((p) => p.type === t).value);
  const asUTC = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute'), g('second'));
  return Math.round((asUTC - Math.floor(ms / 1000) * 1000) / 60000);
}

/** UTC Julian Dates of the local midnights that start and end the civil day containing `jd`. */
export function localDayBounds(jd, obs) {
  const midnight = (m) => {
    let s = m - tzOffsetMinutes(m, obs) / 1440;
    s = m - tzOffsetMinutes(s, obs) / 1440;
    return s;
  };
  const L = jd + tzOffsetMinutes(jd, obs) / 1440;
  const m0 = Math.floor(L + 0.5) - 0.5;
  return { start: midnight(m0), end: midnight(m0 + 1) };
}

/** 'HH:MM' local time of a UTC Julian Date (or '—'). */
export function formatLocalTime(jd, obs) {
  if (jd === null || jd === undefined || Number.isNaN(jd)) return '—';
  const m = Math.round((jd + tzOffsetMinutes(jd, obs) / 1440 + 0.5) % 1 * 1440 - 1e-9);
  const mm = ((m % 1440) + 1440) % 1440;
  return `${String(Math.floor(mm / 60)).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}`;
}

/** 'Fri 20 Mar 2026' for the local civil date. */
export function formatLocalDate(jd, obs) {
  const d = jdToDate(jd + tzOffsetMinutes(jd, obs) / 1440);
  const y = d.getUTCFullYear();
  const dtfD = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
  return `${dtfD.format(d)} ${y > 0 ? y : `${1 - y} BC`}`;
}

/** Short zone label like 'GMT', 'EST' or 'GMT+11' (or 'LMT' outside 1900–2100). */
export function zoneLabel(jd, obs) {
  const ms = jdToDate(jd).getTime();
  if (!(ms >= MODERN[0] && ms < MODERN[1])) return 'LMT';
  return dtf(obs.tz, 'zone', { timeZoneName: 'short' }).formatToParts(jdToDate(jd)).find((p) => p.type === 'timeZoneName')?.value || obs.tz;
}

/** '51.51° N, 0.13° W' */
export function formatLatLon(lat, lon) {
  const f = (v, pos, neg) => `${Math.abs(v).toFixed(2)}° ${v >= 0 ? pos : neg}`;
  return `${f(lat, 'N', 'S')}, ${f(lon, 'E', 'W')}`;
}
