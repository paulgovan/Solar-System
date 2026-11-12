// Screenshot: render a frame and save it as a PNG, with the HTML labels, the date and a
// small credit composited on (CSS2D labels are DOM elements, not part of the WebGL
// canvas). The share link for the current view (time, body, scale) is copied to the
// clipboard.
//
// The WebGL canvas is created without preserveDrawingBuffer, so its contents are only
// readable in the same task as the render that drew them: render, then immediately copy
// the canvas into a 2D canvas (drawImage), all synchronously.

import './screenshot.css';
import { jdToDate } from '../ephemeris/index.js';
import { scale } from '../scale.js';
import { state } from '../state.js';
import { addToolButton } from './toolCluster.js';

export const CREDIT = 'paulgovan.github.io/Solar-System';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** UTC date of a Julian Date, rounded to the nearest minute (JD round trips lose a few ms, which truncation would turn into a minute). */
const minuteDate = (jd) => new Date(Math.round(jdToDate(jd).getTime() / 60000) * 60000);

/** "solar-system_2026-11-12_2047UTC_earth.png" */
export function screenshotFilename(jd, bodyId) {
  const d = minuteDate(jd);
  const y = d.getUTCFullYear();
  const p2 = (n) => String(n).padStart(2, '0');
  const year = y > 0 ? String(y).padStart(4, '0') : `${1 - y}BC`;
  const body = String(bodyId || 'sun').replace(/[^a-z0-9-]/gi, '');
  return `solar-system_${year}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}_${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}UTC_${body}.png`;
}

/** Link to the current view. Keeps any other hash parameters features have written, but
 *  always sets the exact time (the app's own hash omits it while the clock follows "now"). */
export function shareURL(hash, loc = location) {
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  p.set('t', minuteDate(state.jd).toISOString().slice(0, 16) + 'Z');
  if (state.selected && state.selected !== 'sun') p.set('body', state.selected); else p.delete('body');
  if (scale.target === 0) p.set('scale', 'true'); else p.delete('scale');
  if (!state.playing) p.set('paused', '1'); else p.delete('paused');
  return `${loc.origin}${loc.pathname}#${p}`;
}

let toastEl = null, toastTimer = 0;
export function showToast(message) {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.id = 'toast';
    toastEl.setAttribute('role', 'status');
    toastEl.setAttribute('aria-live', 'polite');
    document.getElementById('app').appendChild(toastEl);
  }
  toastEl.textContent = message;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3200);
}

// ---------------------------------------------------------------------------
// Compositing
// ---------------------------------------------------------------------------
function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

const visible = (el) => el && el.style.display !== 'none' && !el.hidden && el.getClientRects().length > 0;

/** Draw the body labels (and the measure label) where the DOM shows them. k = canvas px per CSS px. */
function drawLabels(g, app, k, family) {
  if (document.getElementById('labels').classList.contains('labels-off')) return;
  const W = window.innerWidth, H = window.innerHeight;
  g.textBaseline = 'middle';
  for (const body of Object.values(app.bodies)) {
    const el = body.label?.element;
    if (!body.group.visible || !visible(el) || el.classList.contains('faded')) continue;
    const name = el.querySelector('.name'), dot = el.querySelector('.dot');
    const r = name.getBoundingClientRect();
    if (r.right < 0 || r.left > W || r.bottom < 0 || r.top > H) continue;
    const color = getComputedStyle(el).getPropertyValue('--c').trim() || '#fff';
    const selected = el.classList.contains('selected');
    if (dot && getComputedStyle(dot).opacity > 0.05 && !el.classList.contains('big')) {
      const d = dot.getBoundingClientRect();
      g.save();
      g.shadowColor = color; g.shadowBlur = 8 * k;
      g.fillStyle = color;
      g.beginPath(); g.arc((d.left + d.width / 2) * k, (d.top + d.height / 2) * k, (d.width / 2) * k, 0, Math.PI * 2); g.fill();
      g.restore();
    }
    if (selected) { g.fillStyle = 'rgba(255,255,255,0.12)'; roundRect(g, r.left * k, r.top * k, r.width * k, r.height * k, 6 * k); g.fill(); }
    const minor = el.classList.contains('minor');
    g.font = `500 ${(minor ? 11 : 12) * k}px ${family}`;
    if ('letterSpacing' in g) g.letterSpacing = `${0.04 * 12 * k}px`;
    g.save();
    g.shadowColor = '#000'; g.shadowBlur = 4 * k; g.shadowOffsetY = k;
    g.fillStyle = selected ? '#fff' : `rgba(235,240,255,${minor ? 0.7 : 0.85})`;
    g.fillText(name.textContent, (r.left + 6) * k, (r.top + r.height / 2) * k);
    g.restore();
    if ('letterSpacing' in g) g.letterSpacing = '0px';
  }
  const m = document.querySelector('.measure-label');
  if (m && m.parentElement && visible(m) && m.style.display !== 'none') {
    const r = m.getBoundingClientRect();
    if (r.width > 0 && r.right > 0 && r.left < W) {
      g.fillStyle = 'rgba(8,10,18,0.85)'; g.strokeStyle = 'rgba(255,181,71,0.6)'; g.lineWidth = k;
      roundRect(g, r.left * k, r.top * k, r.width * k, r.height * k, 8 * k); g.fill(); g.stroke();
      g.textAlign = 'center';
      const lines = [['.ml-names', 11, '#8f97ad'], ['.ml-dist', 14, '#ffb547', 600], ['.ml-sub', 11, '#c6cbda']];
      for (const [sel, size, color, weight = 400] of lines) {
        const t = m.querySelector(sel), tr = t.getBoundingClientRect();
        g.font = `${weight} ${size * k}px ${family}`; g.fillStyle = color;
        g.fillText(t.textContent, (tr.left + tr.width / 2) * k, (tr.top + tr.height / 2) * k);
      }
      g.textAlign = 'left';
    }
  }
}

function drawOverlay(g, app, k, width, height) {
  const family = getComputedStyle(document.body).fontFamily;
  const margin = 18 * k;
  drawLabels(g, app, k, family);

  // title + date, top left
  const d = minuteDate(state.jd);
  const y = d.getUTCFullYear();
  const yStr = y > 0 ? String(y) : `${1 - y} BC`;
  const main = `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${yStr}`;
  const sub = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`;
  g.save();
  g.shadowColor = 'rgba(0,0,0,0.9)'; g.shadowBlur = 6 * k;
  g.textBaseline = 'top'; g.textAlign = 'left';
  if ('letterSpacing' in g) g.letterSpacing = `${3 * k}px`;
  g.font = `600 ${13 * k}px ${family}`; g.fillStyle = '#ffb547';
  g.fillText('SOLAR SYSTEM', margin, margin);
  if ('letterSpacing' in g) g.letterSpacing = '0px';
  g.font = `500 ${24 * k}px ${family}`; g.fillStyle = '#e9ecf5';
  g.fillText(main, margin, margin + 22 * k);
  g.font = `400 ${13 * k}px ${family}`; g.fillStyle = 'rgba(233,236,245,0.7)';
  g.fillText(sub, margin, margin + 52 * k);

  // scale bar / note, bottom left
  const bar = document.querySelector('#scalebar .sb-bar');
  g.textBaseline = 'alphabetic';
  if (visible(bar)) {
    const line = bar.querySelector('.sb-line').getBoundingClientRect();
    const px = line.width * k;
    g.fillStyle = 'rgba(233,236,245,0.85)';
    g.font = `400 ${12 * k}px ${family}`;
    g.fillText(bar.querySelector('.sb-label').textContent, margin, height - margin - 12 * k);
    g.strokeStyle = 'rgba(233,236,245,0.85)'; g.lineWidth = 1.5 * k;
    g.beginPath(); g.moveTo(margin, height - margin - 8 * k); g.lineTo(margin, height - margin); g.lineTo(margin + px, height - margin); g.lineTo(margin + px, height - margin - 8 * k); g.stroke();
  } else if (scale.target !== 0) {
    g.font = `400 ${11.5 * k}px ${family}`; g.fillStyle = 'rgba(233,236,245,0.55)';
    g.fillText('Distances and sizes are not to scale', margin, height - margin);
  }

  // credit, bottom right
  g.textAlign = 'right';
  g.font = `400 ${12 * k}px ${family}`; g.fillStyle = 'rgba(233,236,245,0.75)';
  g.fillText(CREDIT, width - margin, height - margin);
  g.restore();
}

/**
 * Render the scene now and return a PNG Blob of it with labels, date and credit.
 * (Synchronous up to the toBlob call: see the note at the top of this file.)
 */
export function captureFrame(app) {
  const canvas = app.renderer.domElement;
  app.composer.render();
  const out = document.createElement('canvas');
  out.width = canvas.width; out.height = canvas.height;
  const g = out.getContext('2d');
  g.drawImage(canvas, 0, 0); // same task as the render
  drawOverlay(g, app, canvas.width / window.innerWidth, out.width, out.height);
  return new Promise((resolve, reject) => out.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'));
}

export function initScreenshot(app) {
  const btn = addToolButton({ id: 'screenshot-btn', title: 'Save screenshot (K)', label: 'Save screenshot', icon: 'camera' });
  let busy = false;

  async function take() {
    if (busy) return;
    busy = true;
    btn.disabled = true;
    try {
      const url = shareURL(location.hash);
      const name = screenshotFilename(state.jd, state.selected);
      const blobPromise = captureFrame(app); // starts synchronously
      let copied = false;
      try {
        // started in the click's task so the browser still counts the user gesture
        await navigator.clipboard.writeText(url);
        copied = true;
      } catch { /* clipboard unavailable or denied: the PNG is still saved */ }
      const blob = await blobPromise;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      showToast(copied ? 'Screenshot saved · Link copied' : 'Screenshot saved');
    } catch (err) {
      console.warn('Screenshot failed', err);
      showToast('Couldn’t save the screenshot');
    } finally {
      busy = false;
      btn.disabled = false;
    }
  }

  btn.addEventListener('click', take);
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key.toLowerCase() === 'k') take();
  });
  return { take };
}
