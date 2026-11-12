// Real surface imagery (NASA / USGS maps) with the procedural bakes as the instant
// first view and offline fallback. Toolbar toggle "Imagery" (I): on = real maps,
// off = the artistic procedural surfaces.

import { registerToggle, state } from '../state.js';
import { createImageryLoader } from '../textures/loader.js';

registerToggle({
  key: 'imagery', label: 'Imagery', shortcut: 'i', order: 50,
  title: 'Imagery: real NASA/USGS maps (on) or artistic (off) (I)',
});

let loader = null;
let timer = 0;

export default {
  id: 'imagery',
  setup(app) {
    loader = createImageryLoader(app);
    if (import.meta.env.DEV && window.__app) window.__app.imagery = loader;
    loader.setReal(state.show.imagery);
    app.on('select', (id) => loader.request(id));
    app.on('toggle', ({ key, on }) => {
      if (key !== 'imagery') return;
      loader.setReal(on);
      if (on) loader.request(state.selected);
    });
  },
  update(app, dt) {
    timer += dt;
    if (timer < 0.5) return;
    timer = 0;
    loader.checkProximity();
  },
};
