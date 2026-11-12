# Solar System — Live 3D Orrery

An interactive, browser-based 3D model of the solar system. Every planet is drawn where it really is for the date shown, computed live from JPL orbital elements.

Built with [Three.js](https://threejs.org) and [Vite](https://vitejs.dev). There are no image assets: planet surfaces, rings, the starfield and the Milky Way are all generated procedurally on the GPU.

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
npm run dev      # http://localhost:5173
npm test         # ephemeris accuracy tests vs JPL Horizons
npm run build    # production build in dist/
```

### Project layout

```
src/ephemeris.js        orbital elements, Kepler solver, Moon, IAU rotation models
src/scale.js            true ↔ compressed scale mapping
src/textures.js         GPU-baked procedural planet maps, Saturn ring profile
src/shaders/            noise + custom materials (planets, rings, atmosphere, Sun, orbits)
src/scene/              solar system bodies, sky / Milky Way, asteroid belt
src/camera.js           orbit controls with fly-to and follow
src/main.js             app bootstrap, UI, time controls, URL state
tests/                  accuracy tests and Horizons reference data
```

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
- Physical data: NASA Planetary Fact Sheets

## License

MIT
