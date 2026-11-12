// Camera: OrbitControls plus smooth fly-to and follow for the focused body.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

export function createCameraRig(camera, dom) {
  const controls = new OrbitControls(camera, dom);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.rotateSpeed = 0.6;
  controls.zoomSpeed = 1.1;
  controls.maxDistance = 2e5;

  const rig = {
    controls,
    focus: null, // body object
    lastFocusPos: new THREE.Vector3(),
    lastRadius: 1,
    flight: null,
  };

  function viewDistanceFor(body) {
    if (body.id === 'sun') return null;
    const k = body.ringInfo ? 7 : body.id === 'moon' ? 5 : body.id === 'earth' ? 6.5 : 4.5;
    return body.radius * k * Math.max(1, 0.9 / camera.aspect);
  }

  rig.flyTo = (body, { distance, duration = 2.2 } = {}) => {
    const startTarget = controls.target.clone();
    const startOffset = camera.position.clone().sub(startTarget);
    const startDist = startOffset.length();
    const startDir = startOffset.clone().normalize();
    const endDist = distance ?? viewDistanceFor(body);
    // Arrive slightly above the orbital plane, from the sunward side so the body is lit
    const toSun = body.position.clone().negate().normalize();
    let endDir;
    if (body.id === 'sun') {
      endDir = startDir.clone();
      endDir.y = Math.max(endDir.y, 0.45);
      endDir.normalize();
    } else {
      endDir = startDir.clone().lerp(toSun, 0.65).normalize();
      endDir.y += 0.25;
      endDir.normalize();
    }
    rig.flight = { body, t: 0, duration, startTarget, startDist, startDir, endDist, endDir };
    rig.focus = body;
    rig.lastFocusPos.copy(body.position);
    rig.lastRadius = body.radius;
  };

  const tmpDir = new THREE.Vector3();
  rig.update = (dt, overviewDistance) => {
    const f = rig.focus;
    if (rig.flight) {
      const fl = rig.flight;
      fl.t = Math.min(1, fl.t + dt / fl.duration);
      const e = ease(fl.t);
      const et = easeOut(Math.min(1, fl.t * 1.25));
      const endDist = fl.endDist ?? overviewDistance;
      const target = fl.startTarget.clone().lerp(fl.body.position, et);
      const dist = Math.exp(THREE.MathUtils.lerp(Math.log(fl.startDist), Math.log(endDist), e));
      tmpDir.copy(fl.startDir).lerp(fl.endDir, e).normalize();
      controls.target.copy(target);
      camera.position.copy(target).addScaledVector(tmpDir, dist);
      if (fl.t >= 1) rig.flight = null;
    } else if (f) {
      // follow: move the camera with the body, and rescale on scale-mode changes
      const delta = f.position.clone().sub(rig.lastFocusPos);
      controls.target.add(delta);
      camera.position.add(delta);
      const ratio = f.id === 'sun' ? overviewDistance / (rig.lastOverview || overviewDistance) : f.radius / rig.lastRadius;
      if (Math.abs(ratio - 1) > 1e-9) {
        const off = camera.position.clone().sub(controls.target).multiplyScalar(ratio);
        camera.position.copy(controls.target).add(off);
      }
    }
    rig.lastOverview = overviewDistance;
    if (f) {
      rig.lastFocusPos.copy(f.position);
      rig.lastRadius = f.radius;
      controls.minDistance = f.radius * 1.15;
    }
    if (!rig.flight) controls.update();
    // keep near/far sensible for the current zoom level (log depth handles the rest)
    const d = camera.position.distanceTo(controls.target);
    camera.near = Math.max(1e-6, Math.min(d * 0.01, (f ? f.radius : 1) * 0.1));
    camera.far = 1e8;
    camera.updateProjectionMatrix();
  };

  return rig;
}
