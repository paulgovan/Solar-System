// Keyboard shortcuts. Body keys come from each body's `key`, toggle keys from
// each registered toggle's `shortcut`.

import { BODIES } from '../bodies.js';
import { dateToJD } from '../ephemeris/index.js';
import { scale } from '../scale.js';
import {
  state, toggles, setToggle, setPlaying, setSpeed, setDirection, jumpTo, setScale, select,
} from '../state.js';

export function initKeyboard() {
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    const body = BODIES.find((b) => b.key === k);
    const toggle = toggles.find((t) => t.shortcut === k);
    if (body) select(body.id);
    else if (toggle) setToggle(toggle.key, !state.show[toggle.key]);
    else if (k === ' ') { e.preventDefault(); setPlaying(!state.playing); }
    else if (k === ']') setSpeed(state.speedIndex + 1);
    else if (k === '[') setSpeed(state.speedIndex - 1);
    else if (k === 'r') setDirection(-state.direction);
    else if (k === 'n') jumpTo(dateToJD(new Date()));
    else if (k === 's') setScale(scale.target ? 0 : 1);
    else if (k === 'escape') { document.querySelector('#about').hidden = true; select('sun'); }
  });
}
