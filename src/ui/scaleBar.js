// Scale bar: in true-scale mode a bar of round real length (1 AU, 100,000 km, 1 light-hour…)
// chosen from the current zoom; in compressed scale a discreet "not to scale" note instead.
//
// The bar is exact at the focused body's distance from the camera (the plane the camera
// orbits); parts of the scene nearer or farther are foreshortened by perspective.

import './scaleBar.css';
import { AU_KM } from '../ephemeris/index.js';
import { AU } from '../scale.js';

const C_KM_S = 299792.458;
const fmt = (n) => n.toLocaleString('en-US');

/** Round lengths, ascending in km: 1-2-5 km, 1-2-5 AU and light-time units. */
export const LENGTHS = (() => {
  const out = [];
  for (let k = 0; k <= 6; k++) for (const m of [1, 2, 5]) { const km = m * 10 ** k; out.push({ km, label: `${fmt(km)} km` }); }
  for (let k = -1; k <= 3; k++) for (const m of [1, 2, 5]) { const au = m * 10 ** k; out.push({ km: au * AU_KM, label: `${au < 1 ? au : fmt(au)} AU` }); }
  out.push({ km: C_KM_S, label: '1 light-second' }, { km: C_KM_S * 60, label: '1 light-minute' },
    { km: C_KM_S * 3600, label: '1 light-hour' }, { km: C_KM_S * 86400, label: '1 light-day' });
  // "1 million km" reads better than "1,000,000 km"
  for (const l of out) if (/^[125],000,000 km$/.test(l.label)) l.label = `${l.label[0]} million km`;
  return out.sort((a, b) => a.km - b.km);
})();

/** The longest round length that fits in `maxPx` at `kmPerPx`: { km, label, px }, or null if even 1 km is too long. */
export function chooseLength(kmPerPx, maxPx) {
  let best = null;
  for (const l of LENGTHS) if (l.km / kmPerPx <= maxPx) best = l;
  return best && { ...best, px: best.km / kmPerPx };
}

/** Kilometres per screen pixel at distance `dist` (scene units, true scale: 1 AU = 100 units) from the camera. */
export function kmPerPixel(dist, fovDeg, viewportHeight) {
  const unitsPerPx = (2 * dist * Math.tan((fovDeg * Math.PI) / 360)) / viewportHeight;
  return (unitsPerPx / AU) * AU_KM;
}

export function initScaleBar(app) {
  const el = document.createElement('div');
  el.id = 'scalebar';
  el.innerHTML = `
    <div class="sb-note" hidden>Distances and sizes are not to scale</div>
    <div class="sb-bar" hidden><span class="sb-label"></span><span class="sb-line"></span></div>`;
  document.getElementById('app').appendChild(el);
  const note = el.querySelector('.sb-note'), bar = el.querySelector('.sb-bar');
  const label = el.querySelector('.sb-label'), line = el.querySelector('.sb-line');
  let lastLabel = '', lastPx = -1, mode = '';

  return function update() {
    const trueScale = (app.blend ?? 1) < 0.02;
    const next = trueScale ? 'bar' : 'note';
    if (next !== mode) {
      mode = next;
      bar.hidden = !trueScale;
      note.hidden = trueScale;
    }
    if (!trueScale) return;
    const dist = app.camera.position.distanceTo(app.rig.controls.target);
    const pick = chooseLength(kmPerPixel(dist, app.camera.fov, window.innerHeight), window.innerWidth <= 820 ? 110 : 150);
    if (!pick) return;
    const px = Math.round(pick.px);
    if (pick.label !== lastLabel) { lastLabel = pick.label; label.textContent = pick.label; }
    if (px !== lastPx) { lastPx = px; line.style.width = `${px}px`; }
  };
}
