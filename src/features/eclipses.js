// Feature: solar and lunar eclipses.
//
// Each frame the true (unscaled) Earth–Moon–Sun geometry drives the eclipse uniforms
// of Earth's surface and clouds and of the Moon (see the eclipse hook in
// src/shaders/materials.js). Vectors are expressed in the receiving body's radii, so
// the shadows are physically right in either scale mode, even though the compressed
// scene draws the Moon much closer to Earth than it really is.
// Also adds live info rows and the eclipse finder panel (src/ui/eclipses.js).

import {
  AU_KM, SUN_RADIUS_KM, EARTH_RADIUS_KM, MOON_RADIUS_KM, SHADOW_ENLARGEMENT,
  eclipseCircumstances, geographic,
} from '../ephemeris/index.js';
import { state } from '../state.js';
import { registerInfoRows, fmtNum } from '../ui/infoPanel.js';
import { initEclipsePanel } from '../ui/eclipses.js';

// Linear-light colour of sunlight refracted through Earth's atmosphere into the umbra
// (relative to full sunlight; exaggerated so a totally eclipsed Moon stays visible).
const UMBRA_TINT = [0.34, 0.095, 0.03];

/** Write eclipse uniforms for body `self` shadowed by `occ` (heliocentric AU). */
function setEclipse(u, self, occ, selfKm, occKm) {
  const k = AU_KM / selfKm;
  const ox = (occ.x - self.x) * k, oy = (occ.y - self.y) * k, oz = (occ.z - self.z) * k;
  u.eclOcc.value.set(ox, oz, -oy, occKm / selfKm); // ecliptic → scene axes (x, z, −y)
  const rSun = Math.hypot(self.x, self.y, self.z);
  u.eclSun.value.set(-self.x * k, -self.z * k, self.y * k, Math.asin(SUN_RADIUS_KM / (rSun * AU_KM)));
}

const pct = (x) => `${fmtNum(x * 100, x > 0.995 && x < 1 ? 1 : 0)}%`;
const KIND = { total: 'Total', annular: 'Annular', partial: 'Partial' };

export default {
  id: 'eclipses',

  setup(app) {
    const { earth, moon } = app.bodies;
    this.targets = [earth.material, earth.clouds?.material].filter((m) => m?.uniforms?.eclOcc);
    this.moonMat = moon.material?.uniforms?.eclOcc ? moon.material : null;
    this.moonMat?.uniforms.eclTint.value.setRGB(...UMBRA_TINT);
    this.circ = null;

    registerInfoRows((body) => {
      const c = this.circ;
      if (!c) return [];
      if (body.id === 'earth' && c.solar.cover > 0) {
        const e = app.bodies.earth.au, p = c.solar.point;
        const g = geographic({ x: p.x - e.x, y: p.y - e.y, z: p.z - e.z }, state.jd);
        return [
          ['Solar eclipse', `${KIND[c.solar.kind]} · ${pct(c.solar.cover)} of Sun hidden`],
          ['Deepest shadow', `${fmtNum(Math.abs(g.lat), 1)}°${g.lat >= 0 ? 'N' : 'S'}, ${fmtNum(Math.abs(g.lon), 1)}°${g.lon >= 0 ? 'E' : 'W'}`],
        ];
      }
      if (body.id === 'moon' && c.lunar.cover > 0) {
        return [
          ['Lunar eclipse', c.lunar.kind === 'total' ? 'Centre in Earth’s umbra' : 'Centre in Earth’s penumbra'],
          ['Sun visible from Moon', pct(1 - c.lunar.cover)],
        ];
      }
      return [];
    });

    initEclipsePanel(app);
  },

  update(app) {
    const { earth, moon } = app.bodies;
    const E = earth.au, M = moon.au;
    this.circ = eclipseCircumstances(E, M);
    for (const m of this.targets) setEclipse(m.uniforms, E, M, EARTH_RADIUS_KM, MOON_RADIUS_KM);
    if (this.moonMat) setEclipse(this.moonMat.uniforms, M, E, MOON_RADIUS_KM, EARTH_RADIUS_KM * SHADOW_ENLARGEMENT);
  },
};
