// Top-right toolbar: scale switch, registered toggles, About dialog.

import { scale } from '../scale.js';
import { state, toggles, setToggle, setScale, on } from '../state.js';

const $ = (s) => document.querySelector(s);

export function initToolbar() {
  const box = $('.toolbar .toggles');
  for (const t of toggles) {
    const btn = document.createElement('button');
    btn.className = 'toggle';
    btn.dataset.toggle = t.key;
    btn.textContent = t.label;
    btn.title = t.title || (t.shortcut ? `${t.label} (${t.shortcut.toUpperCase()})` : t.label);
    btn.addEventListener('click', () => setToggle(t.key, !state.show[t.key]));
    box.appendChild(btn);
  }
  const syncToggle = ({ key, on: isOn }) => {
    const btn = box.querySelector(`[data-toggle="${key}"]`);
    if (!btn) return;
    btn.classList.toggle('active', isOn);
    btn.setAttribute('aria-pressed', isOn);
  };
  on('toggle', syncToggle);
  for (const t of toggles) syncToggle({ key: t.key, on: state.show[t.key] });

  const syncScale = (target) => {
    document.querySelectorAll('[data-scale]').forEach((b) => {
      const isOn = Number(b.dataset.scale) === target;
      b.classList.toggle('active', isOn);
      b.setAttribute('aria-checked', isOn);
    });
  };
  document.querySelectorAll('[data-scale]').forEach((b) => b.addEventListener('click', () => setScale(Number(b.dataset.scale))));
  on('scale', syncScale);
  syncScale(scale.target);

  $('#about-btn').addEventListener('click', () => { $('#about').hidden = false; });
  $('#about-close').addEventListener('click', () => { $('#about').hidden = true; });
  $('#about').addEventListener('click', (e) => { if (e.target.id === 'about') $('#about').hidden = true; });
  $('#more-btn')?.addEventListener('click', () => $('.toolbar').classList.toggle('expanded'));
}
