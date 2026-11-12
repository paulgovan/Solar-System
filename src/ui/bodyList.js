// Left-hand list of bodies. Satellites are indented under their parent.

import { BODIES, BODY_MAP } from '../bodies.js';
import { state, on, select } from '../state.js';

export function initBodyList() {
  const list = document.querySelector('#body-list');
  const listed = BODIES.filter((b) => b.listed !== false);
  // parents first, each followed by its listed satellites
  const ordered = [];
  for (const b of listed.filter((x) => !x.parent)) {
    ordered.push(b);
    ordered.push(...listed.filter((x) => x.parent === b.id));
  }
  for (const b of ordered) {
    const btn = document.createElement('button');
    btn.dataset.id = b.id;
    if (b.parent) btn.classList.add('satellite');
    btn.style.setProperty('--c', b.color);
    btn.innerHTML = `<span class="dot"></span>${b.name}<span class="key">${b.key && b.key.length === 1 && /\d/.test(b.key) ? b.key : ''}</span>`;
    btn.setAttribute('aria-label', `${b.name}${b.type ? `, ${b.type.toLowerCase()}` : ''}${b.key && /\d/.test(b.key) ? `, shortcut ${b.key}` : ''}`);
    btn.addEventListener('click', () => select(b.id));
    list.appendChild(btn);
  }

  const syncSelected = (id) => list.querySelectorAll('button').forEach((x) => {
    const on = x.dataset.id === id;
    x.classList.toggle('active', on);
    x.setAttribute('aria-pressed', on);
  });
  const syncHidden = () => {
    for (const btn of list.querySelectorAll('button')) {
      const data = BODY_MAP[btn.dataset.id];
      const hidden = (data.toggle && !state.show[data.toggle]) || (data.parent && BODY_MAP[data.parent].toggle && !state.show[BODY_MAP[data.parent].toggle]);
      btn.classList.toggle('hidden-body', !!hidden);
      btn.setAttribute('aria-disabled', !!hidden);
    }
  };
  on('select', syncSelected);
  on('toggle', syncHidden);
  syncSelected(state.selected);
  syncHidden();
}
