// Feature modules. Each workstream adds one import + one entry here (append-only, so
// parallel branches merge cleanly).
//
// A feature module default-exports:
//   {
//     id: 'stars',
//     setup(app) {},          // optional: after the scene is built
//     update(app, dt) {},     // optional: every frame, after bodies are positioned
//   }
// and may, at module top level (i.e. before the scene is built):
//   - registerBodies([...])               from src/bodies.js
//   - registerOrbitProvider(kind, p)      from src/ephemeris/providers.js
//   - registerRotationModel(id, fn)       from src/ephemeris/rotation.js
//   - registerBakeFunction(name, glsl)    from src/textures.js
//   - registerToggle({...})               from src/state.js
// and inside setup():
//   - registerInfoRows(fn)                from src/ui/infoPanel.js
//   - app.on(event, fn), app.bodies, app.scene, app.camera, app.rig, app.renderer …
//   - body.shadowCasters.push(id)         to let one body shadow another

import stars from './stars.js';
import moons from './moons.js';
import eclipses from './eclipses.js';
import imagery from './imagery.js';
import lensFlare from './lensFlare.js';
import smallBodies from './smallBodies.js';
import spacecraft from './spacecraft.js';
import events from './events.js';
import measure from './measure.js';
import scaleBar from './scaleBar.js';
import screenshot from './screenshot.js';
import skyView from './skyView.js';

export const features = [
  stars,
  moons,
  eclipses,
  imagery,
  lensFlare,
  smallBodies,
  spacecraft,
  events,
  measure,
  scaleBar,
  screenshot,
  skyView,
];
