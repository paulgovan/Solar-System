// A compact cluster of icon-only tool buttons in the toolbar (events, measure, screenshot…),
// so extra tools don't widen the row of text toggles. The eclipse button joins it too.

import { icon } from './icons.js';

/** The cluster element, created on first use just before the "more" button. */
export function toolCluster() {
  let el = document.getElementById('tool-cluster');
  if (!el) {
    el = document.createElement('div');
    el.id = 'tool-cluster';
    el.className = 'tool-cluster';
    el.setAttribute('role', 'group');
    el.setAttribute('aria-label', 'Tools');
    const toolbar = document.querySelector('.toolbar');
    toolbar.insertBefore(el, document.getElementById('more-btn') || null);
  }
  const ecl = document.getElementById('eclipses-btn');
  if (ecl && ecl.parentElement !== el) el.prepend(ecl);
  return el;
}

/**
 * Add an icon button to the cluster.
 * @param {{id: string, title: string, label: string, icon: string, pressed?: boolean}} o
 */
export function addToolButton({ id, title, label, icon: name, pressed }) {
  const btn = document.createElement('button');
  btn.className = 'icon-btn';
  btn.id = id;
  btn.title = title;
  btn.setAttribute('aria-label', label);
  if (pressed !== undefined) btn.setAttribute('aria-pressed', String(pressed));
  btn.innerHTML = icon(name);
  toolCluster().appendChild(btn);
  return btn;
}
