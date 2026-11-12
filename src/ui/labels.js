// Body labels: keep the text beside the body's disc, hide the dot when the disc is
// visible, and declutter. Labels are placed in priority order (selected first, then
// labelPriority ascending). Minor labels (priority ≥ 2: dwarf planets, moons, spacecraft…)
// are faded when they would overlap a label already placed; Sun and planets always show.
// Satellite labels fade while they sit too close to their parent on screen.

import * as THREE from 'three';
import { state } from '../state.js';

const v = new THREE.Vector3();
const MIN_SAT_GAP_PX = 24;
const MINOR_PRIORITY = 2; // labels at or above this priority give way when they overlap

export function createLabelUpdater(app) {
  const widths = new Map();

  return function updateLabels() {
    const { camera, bodies } = app;
    const w = window.innerWidth, h = window.innerHeight;
    const f = h / 2 / Math.tan((camera.fov * Math.PI) / 360);
    const list = Object.values(bodies).filter((b) => b.group.visible);
    const placed = [];
    const screen = new Map();

    for (const b of list) {
      v.copy(b.position).project(camera);
      const dist = camera.position.distanceTo(b.position);
      screen.set(b.id, { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, behind: v.z > 1, px: (b.radius / dist) * f });
    }

    list.sort((a, b) => (a.id === state.selected ? -1 : b.id === state.selected ? 1 : 0)
      || (a.data.labelPriority ?? 1) - (b.data.labelPriority ?? 1));

    for (const b of list) {
      const el = b.label.element;
      const s = screen.get(b.id);
      el.classList.toggle('big', s.px > 3.5);
      const offset = Math.max(-4, s.px + 2);
      el.firstChild.style.transform = `translate(${offset}px, 0)`;

      let hide = s.behind;
      if (!hide && b.parent && b.id !== state.selected) {
        const p = screen.get(b.parent);
        if (p && Math.hypot(s.x - p.x, s.y - p.y) - p.px < MIN_SAT_GAP_PX) hide = true;
      }
      if (!hide) {
        let width = widths.get(b.id);
        if (!width) { width = el.firstChild.offsetWidth; if (width) widths.set(b.id, width); }
        const rect = { x0: s.x + offset, x1: s.x + offset + (width || 60), y0: s.y - 9, y1: s.y + 9 };
        if (b.id !== state.selected && (b.data.labelPriority ?? 1) >= MINOR_PRIORITY) {
          hide = placed.some((r) => rect.x0 < r.x1 && rect.x1 > r.x0 && rect.y0 < r.y1 && rect.y1 > r.y0);
        }
        if (!hide) placed.push(rect);
      }
      el.classList.toggle('faded', hide);
    }
  };
}
