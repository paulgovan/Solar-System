import { describe, it, expect } from 'vitest';
import { LENGTHS, chooseLength, kmPerPixel } from '../src/ui/scaleBar.js';
import { AU_KM } from '../src/ephemeris/index.js';

describe('scale bar', () => {
  it('has ascending round lengths including AU and light-time units', () => {
    for (let i = 1; i < LENGTHS.length; i++) expect(LENGTHS[i].km).toBeGreaterThan(LENGTHS[i - 1].km);
    const labels = LENGTHS.map((l) => l.label);
    for (const l of ['1 km', '100,000 km', '1 million km', '1 AU', '10 AU', '0.1 AU', '1 light-second', '1 light-minute', '1 light-hour', '1 light-day']) {
      expect(labels, l).toContain(l);
    }
    // 1 light-hour is 7.2 AU; 1 light-minute 18 million km
    expect(LENGTHS.find((l) => l.label === '1 light-hour').km / AU_KM).toBeCloseTo(7.2, 1);
  });

  it('chooses the longest round length that fits', () => {
    // 1 AU at 1 AU per 100 px
    const kmPerPx = AU_KM / 100;
    expect(chooseLength(kmPerPx, 150).label).toBe('1 AU'); // 100 px; 2 AU would be 200 px
    expect(chooseLength(kmPerPx, 250).label).toBe('2 AU');
    expect(chooseLength(kmPerPx, 120).px).toBeCloseTo(100, 6);
    // zoomed far out: 100 AU in 140 px
    expect(chooseLength(100 * AU_KM / 140, 150).label).toBe('100 AU');
    // zoomed on Earth: ~43 km per px → bar of a few thousand km
    expect(chooseLength(43, 150).label).toBe('5,000 km');
  });

  it('the bar is always within the maximum width and at least ~40% of it', () => {
    for (let e = -1; e < 9; e += 0.137) {
      const kmPerPx = 10 ** e;
      const c = chooseLength(kmPerPx, 150);
      if (!c) continue;
      expect(c.px).toBeLessThanOrEqual(150);
      expect(c.px).toBeGreaterThan(150 * 0.4);
    }
  });

  it('kmPerPixel follows the camera geometry (1 AU = 100 scene units)', () => {
    // at 100 units, 45° fov, 800 px tall: the view is 2·100·tan(22.5°) = 82.84 units = 0.8284 AU tall
    expect(kmPerPixel(100, 45, 800)).toBeCloseTo((0.828427 * AU_KM) / 800, 0);
    expect(kmPerPixel(200, 45, 800)).toBeCloseTo(2 * kmPerPixel(100, 45, 800), 6);
  });
});
