// Click a body to focus it; double-click empty space to return to the overview.

import * as THREE from 'three';
import { select } from '../state.js';

export function initPicking(app) {
  const canvas = app.renderer.domElement;
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const pick = (e) => {
    ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, app.camera);
    const meshes = Object.values(app.bodies).filter((b) => b.group.visible && b.mesh).map((b) => b.mesh);
    return raycaster.intersectObjects(meshes, false)[0];
  };
  let downAt = null;
  canvas.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
  canvas.addEventListener('pointerup', (e) => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
    const hit = pick(e);
    if (hit) select(hit.object.userData.bodyId);
  });
  canvas.addEventListener('dblclick', (e) => { if (!pick(e)) select('sun'); });
}
