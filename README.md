# Solar System — Live 3D Orrery

An interactive, browser-based 3D model of the solar system. Every planet is drawn where it really is for the date shown, computed live from JPL orbital elements.

Built with [Three.js](https://threejs.org) and [Vite](https://vitejs.dev). There are no image assets. Earth's continents come from Natural Earth coastline data; the other planet surfaces, the rings, the starfield and the Milky Way are generated procedurally on the GPU.

## Features

- **Accurate positions.** Heliocentric positions come from JPL's *Keplerian Elements for Approximate Positions of the Major Planets* (E. M. Standish), with Kepler's equation solved for each planet. The test suite checks them against NASA JPL Horizons: errors are a few arcminutes or less from 1800 to 2050, and stay small from 3000 BC to 3000 AD.
- **Real orientation.** Spin axes and rotation angles follow the IAU WGCCRE models, so day and night sides, Earth's tilt and Saturn's ring angle are correct for the date. The Moon uses a low-precision lunar theory, and the Milky Way sits in its true place on the sky.
- **Two scales.** *Compressed* (the default) keeps every direction exact but square-roots the distances and enlarges the planets so you can see them. *True scale* uses real distances and sizes. Switching animates smoothly between the two.
- **Time travel.** Play, pause, reverse, speeds from real time up to 1 year per second, a date picker, and a **Now** button.
- **Explore.** Click any planet or label to fly to it and follow it. The info panel shows live distance from the Sun and from Earth, light time, orbital speed and ecliptic coordinates.
- **Details.** Earth has clouds, ocean glint and city lights on the night side. Saturn's rings cast shadows on the planet and the planet shadows the rings. The scene also includes atmospheric halos, a GPU-propagated asteroid belt with Kirkwood gaps and Jupiter trojans, and bloom on the Sun.
- **Shareable views.** The URL hash keeps the date, the focused body and the scale, e.g. `#t=1969-07-20T20:17Z&body=moon`.

### Controls

| Input | Action |
|---|---|
| Drag / scroll / right-drag | Rotate / zoom / pan |
| Click a planet or label | Fly to it |
| Double-click empty space, `Esc` | Back to overview |
| `Space` | Play / pause |
| `[` `]` | Slower / faster |
| `R` | Reverse time |
| `N` | Jump to now |
| `0`–`9`, `M` | Sun, planets, Pluto, Moon |
| `S` `O` `L` `B` `P` | Scale, orbits, labels, asteroids, Pluto |

## Development

Requires Node.js 20.19+.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests, incl. ephemeris accuracy vs JPL Horizons
npm run test:e2e   # Playwright smoke tests on the production build (uses local Chrome)
npm run build      # production build in dist/
```

### Project layout

```
src/app.js              bootstrap: renderer, scene, UI wiring, feature modules, frame loop
src/state.js            time / selection / toggles / scale state, event bus, URL hash
src/bodies.js           body registry (physical data + engine fields, documented at the top)
src/ephemeris/          time, Kepler, planets, Moon, IAU rotation, orbit providers
src/scale.js            true ↔ compressed mapping (heliocentric and satellite offsets)
src/scene/              solar system bodies, sky / Milky Way, asteroid belt
src/shaders/            noise + custom materials (planets, rings, atmosphere, Sun, orbits)
src/textures.js         GPU-baked procedural maps, ring profile, bake-function registry
src/earthMask.js        Natural Earth coastlines rasterized into Earth's land mask
src/ui/                 toolbar, time bar, body list, info panel, labels, picking, keyboard
src/features/           optional feature modules (see below)
tests/                  unit tests (Vitest) and e2e smoke tests (Playwright)
```

### Adding features

New capabilities live in feature modules registered in `src/features/index.js`. A module can, at import time, add bodies (`registerBodies`), orbit kinds (`registerOrbitProvider`), rotation models (`registerRotationModel`), procedural surfaces (`registerBakeFunction`) and toolbar toggles (`registerToggle`); its `setup(app)` and `update(app, dt)` hooks run after the scene is built and every frame. The comment at the top of `src/features/index.js` lists the full API.

## Deploying to GitHub Pages

The workflow in `.github/workflows/deploy.yml` tests, builds and publishes the site on every push to `main`.

1. Create an empty repository on GitHub (for example `solar-system`).
2. Push this project:
   ```bash
   git remote add origin https://github.com/<you>/solar-system.git
   git push -u origin main
   ```
3. On GitHub, open **Settings → Pages** and set **Source** to **GitHub Actions**.
4. The site will be live at `https://<you>.github.io/solar-system/` once the workflow finishes.

The Vite `base` is set to `./`, so the build works under any repository name.

## Credits

- Orbital elements: E. M. Standish, JPL Solar System Dynamics — <https://ssd.jpl.nasa.gov/planets/approx_pos.html>
- Reference ephemerides for tests: NASA JPL Horizons
- Rotation models: IAU Working Group on Cartographic Coordinates and Rotational Elements (2015)
- Lunar theory after P. Schlyter / J. Meeus
- Simplex noise: Ian McEwan, Stefan Gustavson (Ashima Arts), MIT License
- Coastlines: [Natural Earth](https://www.naturalearthdata.com) 1:50m land (public domain), via the `world-atlas` package
- Physical data: NASA Planetary Fact Sheets
- Stars: Yale Bright Star Catalogue, 5th revised ed. (Hoffleit & Warren 1991), public domain; converted by `scripts/build-stars.mjs`
- Constellation lines and names: [d3-celestial](https://github.com/ofrohn/d3-celestial) © 2015 Olaf Frohn, BSD-3-Clause

## License

MIT
