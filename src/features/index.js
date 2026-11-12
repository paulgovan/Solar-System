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

import smallBodies from './smallBodies.js';
import spacecraft from './spacecraft.js';

export const features = [
  smallBodies,
  spacecraft,
];
