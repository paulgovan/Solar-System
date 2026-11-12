// Right-hand info panel for the selected body. Features can add live rows with
// registerInfoRows((body, app) => [[label, value], …]).

import { AU_KM, orbitalSpeed, centuriesTT } from '../ephemeris/index.js';
import { state, on, select } from '../state.js';

const $ = (s) => document.querySelector(s);
const extraRows = [];

export function registerInfoRows(fn) {
  extraRows.push(fn);
}

export function fmtNum(n, digits = 0) {
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
export function fmtLight(sec) {
  if (sec < 60) return `${fmtNum(sec, 2)} s`;
  if (sec < 3600) return `${Math.floor(sec / 60)} min ${Math.round(sec % 60)} s`;
  return `${Math.floor(sec / 3600)} h ${Math.round((sec % 3600) / 60)} min`;
}

export function initInfoPanel(app) {
  const el = $('#info');
  $('#info-close').addEventListener('click', () => select('sun'));

  function render(body) {
    const d = body.data;
    el.style.setProperty('--c', d.color);
    el.querySelector('.swatch').style.setProperty('--c', d.color);
    $('#info-name').textContent = d.name;
    $('#info-type').textContent = d.type || '';
    $('#info-desc').textContent = d.description || '';
    const rows = [
      d.radiusKm && ['Radius', `${fmtNum(d.radiusKm)} km`],
      d.periodDays && [d.parent ? 'Orbit (sidereal)' : 'Year length', fmtPeriod(d.periodDays)],
      d.dayHours && ['Rotation', fmtDuration(d.dayHours)],
      d.tiltDeg !== undefined && ['Axial tilt', `${d.tiltDeg}°`],
      d.gravity && ['Surface gravity', `${d.gravity} m/s²`],
      d.meanTempC !== undefined && ['Mean temperature', `${fmtNum(d.meanTempC)} °C`],
      d.moons !== null && d.moons !== undefined && ['Known moons', String(d.moons)],
    ].filter(Boolean);
    $('#info-static').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
    updateLive();
  }

  function updateLive() {
    const body = app.bodies[state.selected];
    if (!body || !el.classList.contains('open')) return;
    const p = body.au;
    const e = app.bodies.earth.au;
    const r = Math.hypot(p.x, p.y, p.z);
    const rows = [];
    if (!body.data.star) {
      rows.push(['Distance from Sun', `${fmtNum(r, 3)} AU`]);
      rows.push(['', `${fmtNum((r * AU_KM) / 1e6, 1)} million km`]);
    }
    if (body.id !== 'earth') {
      const de = Math.hypot(p.x - e.x, p.y - e.y, p.z - e.z);
      rows.push(['Distance from Earth', de < 0.05 ? `${fmtNum(de * AU_KM)} km` : `${fmtNum(de, 3)} AU`]);
      rows.push(['Light time from Earth', fmtLight(de * 499.004784)]);
    }
    if (body.parent && body.parent !== 'earth' && body.rel) { // Earth's distance is already listed above
      const parent = app.bodies[body.parent];
      rows.push([`Distance from ${parent.data.name}`, `${fmtNum(Math.hypot(body.rel.x, body.rel.y, body.rel.z) * AU_KM)} km`]);
    }
    if (body.data.orbit?.kind === 'planet') {
      rows.push(['Orbital speed', `${fmtNum(orbitalSpeed(body.id, centuriesTT(state.jd)), 2)} km/s`]);
      const lon = ((Math.atan2(p.y, p.x) * 180) / Math.PI + 360) % 360;
      const lat = (Math.asin(p.z / r) * 180) / Math.PI;
      rows.push(['Ecliptic lon / lat', `${fmtNum(lon, 2)}° / ${fmtNum(lat, 2)}°`]);
    }
    for (const fn of extraRows) rows.push(...(fn(body, app) || []));
    $('#info-live').innerHTML = rows.map(([k, v]) => `<dt${k ? '' : ' class="cont"'}>${k}</dt><dd>${v}</dd>`).join('');
  }

  on('select', (id) => {
    const body = app.bodies[id];
    if (!body) return;
    if (body.data.star) el.classList.remove('open');
    else { el.classList.add('open'); render(body); }
  });

  return { updateLive, isOpen: () => el.classList.contains('open') };
}
