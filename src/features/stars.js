// The real sky: the ~9,100 naked-eye stars of the Yale Bright Star Catalogue (positions,
// brightness, colour and proper motion), and constellation figures behind the
// "Constellations" toggle.

import { registerToggle } from '../state.js';
import { J2000 } from '../ephemeris/index.js';
import { decodeStars, bvToRGB } from '../scene/starCatalog.js';
import { catalogAttributes, createCatalogStars } from '../scene/sky.js';
import { createConstellations } from '../scene/constellations.js';
import starsUrl from '../data/stars.bin?url';
import figuresUrl from '../data/constellations.json?url';

registerToggle({
  key: 'constellations', label: 'Constellations', shortcut: 'c', initial: false, order: 50,
  title: 'Constellation lines and names (C)',
});

const CSS = `
.const-name { pointer-events: none; user-select: none; font-size: 10.5px; font-weight: 500;
  letter-spacing: 0.14em; text-transform: uppercase; white-space: nowrap;
  color: rgba(150, 180, 235, 0.55); text-shadow: 0 0 3px #000, 0 0 6px #000; transition: opacity 0.4s; }
.labels-off .const-name { opacity: 0; }
@media (max-width: 820px) { .const-name { font-size: 9px; letter-spacing: 0.1em; } }
`;

const uniforms = { years: { value: 0 } };
let figures = null;
let fade = 0;

export default {
  id: 'stars',

  setup(app) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    Promise.all([
      fetch(starsUrl).then((r) => { if (!r.ok) throw new Error(`stars.bin: HTTP ${r.status}`); return r.arrayBuffer(); }),
      fetch(figuresUrl).then((r) => { if (!r.ok) throw new Error(`constellations.json: HTTP ${r.status}`); return r.json(); }),
    ]).then(([buf, figs]) => {
      const attrs = catalogAttributes(decodeStars(buf), (bv) => bvToRGB(bv));
      app.sky.group.add(createCatalogStars(attrs, uniforms));
      figures = createConstellations(figs, attrs, uniforms);
      figures.group.visible = false;
      app.sky.group.add(figures.group);
      if (import.meta.env.DEV) window.__app.stars = { attrs, figures, uniforms };
    }).catch((err) => console.warn('Could not load the star catalogue; showing the procedural sky only.', err));
  },

  update(app, dt) {
    uniforms.years.value = (app.state.jd - J2000) / 365.25;
    if (!figures) return;
    const target = app.state.show.constellations ? 1 : 0;
    fade = target > fade ? Math.min(target, fade + dt * 3) : Math.max(target, fade - dt * 3);
    figures.group.visible = fade > 0;
    figures.names.visible = target === 1; // names snap; lines fade
    const u = figures.material.uniforms;
    u.opacity.value = fade * fade * (3 - 2 * fade);
    u.viewportHeight.value = app.renderer.domElement.height;
    u.pixelRatio.value = Math.min(window.devicePixelRatio, 2);
  },
};
