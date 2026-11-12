import { describe, it, expect } from 'vitest';
import { describeDistance } from '../src/ui/measure.js';
import { computePositions, dateToJD } from '../src/ephemeris/index.js';

describe('measure readout', () => {
  it('1 AU is 149.6 million km and 8 min 19 s of light time', () => {
    const d = describeDistance({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
    expect(d.auStr).toBe('1.000 AU');
    expect(d.kmStr).toBe('149.6 million km');
    expect(d.lightStr).toBe('8 min 19 s');
  });

  it('uses km for small distances and more AU digits when close', () => {
    const d = describeDistance({ x: 1, y: 0, z: 0 }, { x: 1 + 384400 / 149597870.7, y: 0, z: 0 });
    expect(d.kmStr).toBe('384,400 km');
    expect(d.auStr).toBe('0.002570 AU');
    expect(d.lightStr).toBe('1.28 s');
  });

  it('Earth–Mars at the 2025-01-16 opposition is 0.64 AU', () => {
    const p = computePositions(dateToJD(new Date('2025-01-16T02:38Z')));
    const d = describeDistance(p.earth, p.mars);
    expect(d.au).toBeGreaterThan(0.64);
    expect(d.au).toBeLessThan(0.65);
  });

  it('is symmetric', () => {
    const a = { x: 1, y: 2, z: 3 }, b = { x: -4, y: 0.5, z: 1 };
    expect(describeDistance(a, b).au).toBe(describeDistance(b, a).au);
  });
});
