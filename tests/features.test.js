import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { circleOverlap, sunVisibility } from '../src/features/lensFlare.js';
import { makeRingTexture, RING_PROFILES } from '../src/textures.js';
import { BODY_MAP } from '../src/bodies.js';
import { IMAGERY } from '../src/textures/loader.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

describe('lens flare occlusion', () => {
  it('circleOverlap handles disjoint, contained and partial cases', () => {
    expect(circleOverlap(1, 1, 3)).toBe(0);
    expect(circleOverlap(1, 0.5, 0.2)).toBeCloseTo(Math.PI * 0.25, 10);
    // two unit circles one radius apart: 2π/3 − √3/2
    expect(circleOverlap(1, 1, 1)).toBeCloseTo((2 * Math.PI) / 3 - Math.sqrt(3) / 2, 10);
  });

  it('a body covering the Sun hides it; one beside it does not', () => {
    const cam = V(0, 0, 100), sun = V(0, 0, 0);
    expect(sunVisibility(cam, sun, 1, [])).toBe(1);
    expect(sunVisibility(cam, sun, 1, [{ position: V(0, 0, 50), radius: 2 }])).toBe(0);
    expect(sunVisibility(cam, sun, 1, [{ position: V(30, 0, 50), radius: 2 }])).toBe(1);
    const half = sunVisibility(cam, sun, 1, [{ position: V(0.5, 0, 50), radius: 0.5 }]); // edge on the Sun's centre
    expect(half).toBeGreaterThan(0.3);
    expect(half).toBeLessThan(0.7);
  });

  it('ignores bodies behind the Sun or behind the camera', () => {
    const cam = V(0, 0, 100), sun = V(0, 0, 0);
    expect(sunVisibility(cam, sun, 1, [{ position: V(0, 0, -50), radius: 10 }])).toBe(1);
    expect(sunVisibility(cam, sun, 1, [{ position: V(0, 0, 150), radius: 10 }])).toBe(1);
  });
});

describe('faint rings', () => {
  it('Jupiter, Uranus and Neptune have ring profiles matching their ring radii', () => {
    for (const id of ['jupiter', 'uranus', 'neptune']) {
      const r = BODY_MAP[id].rings;
      const p = RING_PROFILES[r.profile];
      expect(p.innerKm).toBe(r.innerKm);
      expect(p.outerKm).toBe(r.outerKm);
      expect(r.innerKm).toBeGreaterThan(BODY_MAP[id].radiusKm);
    }
  });

  it('makeRingTexture puts density where the bands are', () => {
    const p = RING_PROFILES.uranus;
    const tex = makeRingTexture(p, 2048);
    const a = (km) => tex.image.data[Math.floor(((km - p.innerKm) / (p.outerKm - p.innerKm)) * 2047) * 4 + 3];
    expect(a(51149)).toBeGreaterThan(100); // ε ring
    expect(a(43500)).toBe(0); // gap between rings 4 and α
    expect(a(39000)).toBeGreaterThan(0); // faint ζ
    expect(a(39000)).toBeLessThan(30);
  });
});

describe('imagery table', () => {
  it('covers the bodies with real maps and leaves the others procedural', () => {
    expect(Object.keys(IMAGERY).sort()).toEqual(['earth', 'jupiter', 'mars', 'mercury', 'moon', 'pluto']);
    for (const spec of Object.values(IMAGERY)) for (const s of Object.values(spec)) expect(s.file).toBeTruthy();
  });
});
