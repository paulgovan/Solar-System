// "Sky from Earth" panel: a toolbar button that opens the observer's location (city list,
// "use my location", manual coordinates) and the Tonight table — Sun and Moon rise / set,
// twilight, and the Moon and planets with altitude, azimuth, rise / transit / set, magnitude
// and constellation. Rows click through to the body (look at it in the ground view, or fly to
// it in the orrery).

import './observer.css';
import { BODIES } from '../bodies.js';
import { state, toggles, on, select } from '../state.js';
import { computeTonight, liveSky, skyState, TONIGHT_BODIES } from '../ephemeris/tonight.js';
import { jdToDate } from '../ephemeris/index.js';
import {
  CITIES, getObserver, setObserver, setCity, onObserver, locate, nearestCity,
  localDayBounds, formatLocalTime, formatLocalDate, zoneLabel, formatLatLon,
} from '../observer.js';
import { loadSkyData, createConstellationLookup } from '../scene/skyData.js';

const ICON = /* svg */ `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 17.5h20" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/><path d="M6.5 17.5a5.5 5.5 0 0 1 11 0" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 4.5v2.2M4.8 8l1.6 1.4M19.2 8l-1.6 1.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/><path d="M5 21h14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity=".5" fill="none"/></svg>`;
const NAMES = { moon: 'Moon', mercury: 'Mercury', venus: 'Venus', mars: 'Mars', jupiter: 'Jupiter', saturn: 'Saturn', uranus: 'Uranus', neptune: 'Neptune' };
const colorOf = (id) => BODIES.find((b) => b.id === id)?.color || '#ccc';

const fmtAlt = (a) => `${a >= 0 ? '+' : '−'}${Math.abs(a).toFixed(0)}°`;
const fmtMag = (m) => (m < 0 ? '−' : '+') + Math.abs(m).toFixed(1);

/** Inline SVG of the Moon's phase: `fraction` lit, `waxing` and the observer's hemisphere decide which side. */
export function moonPhaseSVG(fraction, waxing, lat) {
  const r = 11, rx = Math.abs(2 * fraction - 1) * r;
  const sweep = fraction < 0.5 ? 0 : 1;
  const lit = fraction < 0.015 ? '' : fraction > 0.985
    ? `<circle r="${r}" fill="#e8e4d4"/>`
    : `<path d="M0 ${-r}A${r} ${r} 0 0 1 0 ${r}A${rx.toFixed(2)} ${r} 0 0 ${sweep} 0 ${-r}Z" fill="#e8e4d4"/>`;
  const mirror = waxing === (lat >= 0) ? 1 : -1; // waxing: lit on the right in the north, on the left in the south
  return `<svg viewBox="-13 -13 26 26" aria-hidden="true"><circle r="${r}" fill="#262a38" stroke="rgba(255,255,255,.18)"/><g transform="scale(${mirror} 1)">${lit}</g></svg>`;
}

export function initObserverPanel(app) {
  const btn = document.createElement('button');
  btn.className = 'icon-btn';
  btn.id = 'observer-btn';
  btn.title = 'Sky from Earth (T)';
  btn.setAttribute('aria-label', 'Sky from Earth');
  btn.setAttribute('aria-expanded', 'false');
  btn.innerHTML = ICON;
  document.querySelector('.toolbar').insertBefore(btn, document.getElementById('more-btn') || null);

  const panel = document.createElement('section');
  panel.id = 'observer';
  panel.className = 'panel';
  panel.hidden = true;
  panel.setAttribute('aria-label', 'Sky from Earth');
  panel.innerHTML = `
    <button class="close" aria-label="Close">×</button>
    <h2>Sky from Earth</h2>
    <p class="ob-place" id="ob-place"></p>
    <label class="sr-only" for="ob-city">City</label>
    <select class="ob-city" id="ob-city"></select>
    <div class="ob-actions">
      <button class="text-btn" id="ob-locate" type="button">Use my location</button>
      <button class="text-btn" id="ob-coords-btn" type="button" aria-expanded="false" aria-controls="ob-coords">Enter coordinates</button>
    </div>
    <form class="ob-coords" id="ob-coords" hidden>
      <label>Lat <input id="ob-lat" type="number" step="any" min="-90" max="90" placeholder="51.51" required></label>
      <label>Lon <input id="ob-lon" type="number" step="any" min="-180" max="180" placeholder="−0.13" required></label>
      <button class="text-btn" type="submit">Set</button>
    </form>
    <p class="ob-msg" id="ob-msg" role="status"></p>
    <div class="ob-now" id="ob-now"></div>
    <button class="text-btn ob-ground" id="ob-ground" type="button">View the sky from here</button>
    <h3 id="ob-day-h">Sun &amp; Moon</h3>
    <dl class="ob-times" id="ob-times"></dl>
    <div class="ob-moon" id="ob-moon"></div>
    <h3>Moon &amp; planets <small>(click a row to look at it)</small></h3>
    <table class="ob-table" id="ob-table">
      <thead><tr><th>Body</th><th>Alt</th><th>Az</th><th>Rise</th><th>Transit</th><th>Set</th><th>Mag</th></tr></thead>
      <tbody></tbody>
    </table>
    <p class="ob-note">Altitudes are geometric (no refraction); rise and set include refraction and, for the Sun and Moon, the upper limb. Constellation = nearest stick figure.</p>`;
  document.getElementById('app').appendChild(panel);

  const $ = (id) => panel.querySelector(`#${id}`);
  const citySel = $('ob-city');
  const tbody = panel.querySelector('tbody');
  tbody.innerHTML = TONIGHT_BODIES.map((id) => `
    <tr class="row" data-id="${id}" tabindex="0" role="button" aria-label="Look at ${NAMES[id]}">
      <td class="name"><span class="nm"><span class="dot" style="--c:${colorOf(id)}"></span>${NAMES[id]}<span class="up-tag" hidden>up</span></span><span class="con"></span></td>
      <td data-c="alt"></td><td data-c="az"></td><td data-c="rise"></td><td data-c="transit"></td><td data-c="set"></td><td data-c="mag"></td>
    </tr>`).join('');
  const rows = Object.fromEntries([...tbody.querySelectorAll('tr')].map((tr) => [tr.dataset.id, tr]));

  // city options, alphabetical; a leading option shows a custom / located place
  const sorted = [...CITIES].sort((a, b) => a.name.localeCompare(b.name));
  const cityOptions = sorted.map((c, i) => `<option value="${i}">${c.name}, ${c.country}</option>`).join('');
  function syncCitySelect() {
    const o = getObserver();
    const idx = o.kind === 'city' ? sorted.findIndex((c) => c.name === o.name && c.country === o.country) : -1;
    citySel.innerHTML = (idx < 0 ? `<option value="custom" selected>${o.name}${o.kind === 'geolocated' ? ' (from your device)' : ''}</option>` : '') + cityOptions;
    if (idx >= 0) citySel.value = String(idx);
  }

  let lookup = null;
  loadSkyData().then((d) => { lookup = createConstellationLookup(d); lastKey = ''; refresh(true); }).catch(() => {});

  let tonight = null, lastKey = '', acc = 1;

  function dayKey(jd, o) {
    const b = localDayBounds(jd, o);
    return { b, key: `${b.start.toFixed(5)}|${o.lat}|${o.lon}|${o.tz}` };
  }

  /** Recompute (if the local day or place changed) and repaint everything. */
  function refresh(force = false) {
    if (panel.hidden) return;
    const o = getObserver();
    const { b, key } = dayKey(state.jd, o);
    if (force || key !== lastKey) {
      lastKey = key;
      tonight = computeTonight(o, b.start, b.end);
      paintStatic(o, b);
    }
    paintLive(o);
  }

  function paintStatic(o, b) {
    const jd = state.jd;
    $('ob-place').textContent = `${formatLatLon(o.lat, o.lon)} · ${o.tz.replace(/_/g, ' ')}`;
    $('ob-day-h').innerHTML = `Sun &amp; Moon <small>${formatLocalDate(jd, o)} · ${zoneLabel(jd, o)}</small>`;
    const t = (x) => formatLocalTime(x, o);
    const range = (r) => `${t(r.dawn)} – ${t(r.dusk)}`;
    const [civil, nautical, astro] = tonight.twilight;
    const sunNote = tonight.sun.status === 'circumpolar' ? 'Sun up all day' : tonight.sun.status === 'never' ? 'Sun down all day' : null;
    const m = tonight.bodies.moon;
    $('ob-times').innerHTML = `
      <dt>Sunrise</dt><dd id="t-sunrise">${sunNote && !tonight.sun.rise ? '—' : t(tonight.sun.rise)}</dd>
      <dt>Sunset</dt><dd id="t-sunset">${sunNote && !tonight.sun.set ? '—' : t(tonight.sun.set)}</dd>
      <dt class="wide">Civil twilight</dt><dd>${range(civil)}</dd>
      <dt class="wide">Nautical twilight</dt><dd>${range(nautical)}</dd>
      <dt class="wide">Astronomical twilight</dt><dd>${range(astro)}</dd>
      <dt>Moonrise</dt><dd id="t-moonrise">${t(m.rise)}</dd>
      <dt>Moonset</dt><dd id="t-moonset">${t(m.set)}</dd>
      ${sunNote ? `<dt class="wide">${sunNote}</dt><dd></dd>` : ''}`;
    for (const id of TONIGHT_BODIES) {
      const ev = tonight.bodies[id], tr = rows[id];
      const note = ev.status === 'circumpolar' ? 'up all day' : ev.status === 'never' ? 'below' : null;
      tr.querySelector('[data-c=rise]').textContent = ev.rise ? t(ev.rise) : (note ?? '—');
      tr.querySelector('[data-c=transit]').textContent = ev.transit ? t(ev.transit) : '—';
      tr.querySelector('[data-c=set]').textContent = ev.set ? t(ev.set) : (note ? '' : '—');
    }
  }

  function paintLive(o) {
    const jd = state.jd;
    const sky = liveSky(o, jd);
    $('ob-now').innerHTML = `<span><b>${formatLocalTime(jd, o)}</b> ${zoneLabel(jd, o)}</span><span>Sun ${fmtAlt(sky.sunAlt)} · ${skyState(sky.sunAlt)}</span>`;
    const ph = sky.moon;
    $('ob-moon').innerHTML = `${moonPhaseSVG(ph.fraction, ph.waxing, o.lat)}<div><div>${ph.name}</div><span>${Math.round(ph.fraction * 100)}% lit · ${Math.round(ph.elongation)}° from the Sun</span></div>`;
    for (const id of TONIGHT_BODIES) {
      const r = sky.rows[id], tr = rows[id];
      tr.classList.toggle('up', r.above);
      tr.querySelector('.up-tag').hidden = !r.above;
      tr.querySelector('[data-c=alt]').textContent = fmtAlt(r.alt);
      tr.querySelector('[data-c=az]').textContent = `${r.compass} ${r.az.toFixed(0)}°`;
      tr.querySelector('[data-c=mag]').textContent = fmtMag(r.mag);
      const con = lookup && lookup(r.ra, r.dec);
      tr.querySelector('.con').textContent = con ? `in ${con.name}` : '';
    }
  }

  // ----- interaction ---------------------------------------------------------------
  function open(isOpen) {
    panel.hidden = !isOpen;
    btn.classList.toggle('on', isOpen);
    btn.setAttribute('aria-expanded', String(isOpen));
    if (isOpen) { syncCitySelect(); lastKey = ''; refresh(true); }
  }
  btn.addEventListener('click', () => open(panel.hidden));
  panel.querySelector('.close').addEventListener('click', () => open(false));
  panel.addEventListener('pointerdown', (ev) => ev.stopPropagation());
  panel.addEventListener('wheel', (ev) => ev.stopPropagation(), { passive: true });

  const msg = (t) => { $('ob-msg').textContent = t || ''; };

  citySel.addEventListener('change', () => {
    msg('');
    if (citySel.value === 'custom') return;
    setCity(sorted[Number(citySel.value)]);
  });

  $('ob-locate').addEventListener('click', async () => {
    msg('Waiting for your browser…');
    try {
      setObserver(await locate());
      msg('');
    } catch (e) { msg(e.message); }
  });

  $('ob-coords-btn').addEventListener('click', () => {
    const f = $('ob-coords');
    f.hidden = !f.hidden;
    $('ob-coords-btn').setAttribute('aria-expanded', String(!f.hidden));
    if (!f.hidden) {
      const o = getObserver();
      $('ob-lat').value = o.lat; $('ob-lon').value = o.lon;
      $('ob-lat').focus();
    }
  });
  $('ob-coords').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const lat = Number($('ob-lat').value), lon = Number($('ob-lon').value);
    if (!(Math.abs(lat) <= 90) || !(Math.abs(lon) <= 180)) return msg('Latitude must be within ±90° and longitude within ±180°.');
    const near = nearestCity(lat, lon);
    setObserver({ name: 'Custom location', country: '', lat, lon, tz: near.tz, kind: 'custom' });
    msg(`Time zone taken from the nearest listed city (${near.name}).`);
  });

  $('ob-ground').addEventListener('click', () => { app.skyView?.toggle(); syncGroundButton(); });
  function syncGroundButton() {
    $('ob-ground').textContent = app.skyView?.active ? 'Back to the solar system' : 'View the sky from here';
  }

  const lookAt = (id) => {
    if (app.skyView?.active) app.skyView.lookAt(id);
    else select(id);
  };
  tbody.addEventListener('click', (ev) => { const tr = ev.target.closest('tr.row'); if (tr) lookAt(tr.dataset.id); });
  tbody.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    const tr = ev.target.closest('tr.row');
    if (tr) { ev.preventDefault(); lookAt(tr.dataset.id); }
  });

  window.addEventListener('keydown', (ev) => {
    if (ev.target.tagName === 'INPUT' || ev.target.tagName === 'SELECT' || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    const k = ev.key.toLowerCase();
    if (k === 'escape' && !panel.hidden) { open(false); return; }
    if (k !== 't' || BODIES.some((b) => b.key === 't') || toggles.some((x) => x.shortcut === 't')) return;
    open(panel.hidden);
  });

  onObserver(() => { syncCitySelect(); lastKey = ''; refresh(true); });
  on('time', () => refresh());

  return {
    open,
    isOpen: () => !panel.hidden,
    /** per-frame hook: keeps the live columns current while time runs */
    update(dt) {
      acc += dt;
      if (panel.hidden || acc < 0.5) return;
      acc = 0;
      syncGroundButton();
      refresh();
    },
    /** `jd` of the day shown (testing aid) */
    shownDate: () => jdToDate(state.jd),
  };
}
