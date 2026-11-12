import { describe, it, expect } from 'vitest';
import { mapSatelliteOffset, mapRadius } from '../src/scale.js';
import { getOrbitProvider, frameContext, J2000, AU_KM } from '../src/ephemeris/index.js';
import { BODIES, bodiesInUpdateOrder } from '../src/bodies.js';

const v = () => ({ x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } });
const kmToAU = (km) => km / AU_KM;

describe('satellite scale mapping', () => {
  it('keeps true distances in true mode', () => {
    const rel = { x: kmToAU(421700), y: 0, z: 0 }; // Io
    const out = mapSatelliteOffset(rel, 69911, v(), 0);
    expect(out.x).toBeCloseTo(rel.x * 100, 9);
  });

  it('preserves satellite ordering and keeps inner moons outside Saturn\'s rings', () => {
    const R = 58232;
    const radii = [185520, 238040, 294670, 377420, 527070, 1221870, 3560840] // Mimas … Iapetus
      .map((km) => Math.hypot(...Object.values(mapSatelliteOffset({ x: kmToAU(km), y: 0, z: 0 }, R, v(), 1)).slice(0, 3)) / mapRadius(R, 1));
    for (let i = 1; i < radii.length; i++) expect(radii[i]).toBeGreaterThan(radii[i - 1]);
    expect(radii[0]).toBeGreaterThan(140220 / R); // outside the A/F rings
  });
});

describe('orbit providers', () => {
  it('every registered body has a provider and parents come first', () => {
    const order = bodiesInUpdateOrder().map((b) => b.id);
    for (const b of BODIES) {
      expect(() => getOrbitProvider(b.orbit?.kind || 'planet')).not.toThrow();
      if (b.parent) expect(order.indexOf(b.parent)).toBeLessThan(order.indexOf(b.id));
    }
  });

  it('moon provider returns a geocentric offset around 384,000 km', () => {
    const moon = BODIES.find((b) => b.id === 'moon');
    const p = getOrbitProvider('moon').position(moon, J2000, frameContext(J2000));
    expect(Math.hypot(p.x, p.y, p.z) * AU_KM).toBeGreaterThan(355000);
    expect(Math.hypot(p.x, p.y, p.z) * AU_KM).toBeLessThan(407500);
  });
});
