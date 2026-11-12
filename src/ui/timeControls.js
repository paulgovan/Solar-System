// Bottom time bar and the date readout.

import { dateToJD, jdToDate } from '../ephemeris/index.js';
import { state, SPEEDS, on, setPlaying, setSpeed, setDirection, jumpTo } from '../state.js';

const $ = (s) => document.querySelector(s);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function initTimeControls() {
  const timebar = $('.timebar');
  const speedInput = $('#t-speed');
  const speedLabel = $('#t-speed-label');
  const dateInput = $('#t-date');

  const syncSpeed = () => {
    speedInput.value = state.speedIndex;
    speedLabel.textContent = (state.direction < 0 ? '−' : '') + SPEEDS[state.speedIndex].label;
    $('#t-reverse').classList.toggle('on', state.direction < 0);
  };
  const syncPlaying = (p) => timebar.classList.toggle('paused', !p);
  on('speed', syncSpeed);
  on('direction', syncSpeed);
  on('playing', syncPlaying);
  syncSpeed();
  syncPlaying(state.playing);

  speedInput.addEventListener('input', () => setSpeed(Number(speedInput.value)));
  $('#t-play').addEventListener('click', () => setPlaying(!state.playing));
  $('#t-reverse').addEventListener('click', () => setDirection(-state.direction));
  $('#t-now').addEventListener('click', () => { jumpTo(dateToJD(new Date())); setDirection(1); });
  dateInput.addEventListener('change', () => {
    if (!dateInput.value) return;
    const [y, m, d] = dateInput.value.split('-').map(Number);
    const dt = new Date(Date.UTC(2000, m - 1, d, 12));
    dt.setUTCFullYear(y);
    jumpTo(dateToJD(dt));
  });

  let last = '';
  return function updateDate() {
    const d = jdToDate(state.jd);
    const y = d.getUTCFullYear();
    const yStr = y > 0 ? String(y) : `${1 - y} BC`;
    const main = `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${yStr}`;
    const sub = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC · JD ${state.jd.toFixed(2)}`;
    if (main + sub === last) return;
    last = main + sub;
    $('#date-main').textContent = main;
    $('#date-sub').textContent = sub;
    if (document.activeElement !== dateInput && y > 0 && y < 10000) {
      dateInput.value = `${String(y).padStart(4, '0')}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    }
  };
}
