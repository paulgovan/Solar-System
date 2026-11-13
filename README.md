# Solar System — Live 3D Orrery

An interactive, browser-based 3D model of the solar system. Every planet is drawn where it really is for the date shown, computed live from JPL orbital elements.

Built with [Three.js](https://threejs.org) and [Vite](https://vitejs.dev). There are no image assets. Earth's continents come from Natural Earth coastline data; the other planet surfaces, the rings, the starfield and the Milky Way are generated procedurally on the GPU.

## Features

- **Accurate positions.** Heliocentric positions come from JPL's *Keplerian Elements for Approximate Positions of the Major Planets* (E. M. Standish), with Kepler's equation solved for each planet. The test suite checks them against NASA JPL Horizons: errors are a few arcminutes or less from 1800 to 2050, and stay small from 3000 BC to 3000 AD.
- **Real orientation.** Spin axes and rotation angles follow the IAU WGCCRE models, so day and night sides, Earth's tilt and Saturn's ring angle are correct for the date. The Moon follows Meeus' truncated ELP-2000/82 lunar theory (within a few arcseconds of JPL Horizons), and the Milky Way sits in its true place on the sky.
- **Eclipses.** The Moon's shadow on Earth (umbra and soft penumbra) and the coppery, Earth-shadowed Moon are computed from true geometry, so they are right in either scale. An eclipse finder (`E`) lists past and upcoming solar and lunar eclipses with their type and time of greatest eclipse, and jumps to any of them.
- **Sky from Earth.** Pick a city (about 320 are built in), use your location (never sent anywhere) or type coordinates, and the *Tonight* panel (`T`) lists Sun and Moon rise and set, twilight, and where the Moon and each planet is — altitude, azimuth, rise, transit, set, magnitude and constellation — in the city's own time zone. *View the sky from here* (`G`) puts you on the ground: a horizon, a twilight sky that follows the Sun, the real stars and constellations turning with the local sidereal time, planets at their true places and the Moon with its true phase. Drag to look around, scroll to zoom, and use the time controls to watch the sky move.
- **Two scales.** *Compressed* (the default) keeps every direction exact but square-roots the distances and enlarges the planets so you can see them. *True scale* uses real distances and sizes. Switching animates smoothly between the two.
- **Time travel.** Play, pause, reverse, speeds from real time up to 1 year per second, a date picker, and a **Now** button.
- **Explore.** Click any planet or label to fly to it and follow it. The info panel shows live distance from the Sun and from Earth, light time, orbital speed and ecliptic coordinates.
- **Details.** Earth has clouds, ocean glint and city lights on the night side. Saturn's rings cast shadows on the planet and the planet shadows the rings. The scene also includes atmospheric halos, a GPU-propagated asteroid belt with Kirkwood gaps and Jupiter trojans, and bloom on the Sun.
- **Shareable views.** The URL hash keeps the date, the focused body and the scale, e.g. `#t=1969-07-20T20:17Z&body=moon`.
- **Events.** The calendar button (`V`) opens a drawer of one-click jumps: famous moments (Apollo 8, 11 and 17, the Pioneer and Voyager flybys, the Pale Blue Dot, New Horizons at Pluto, the 2020 Great Conjunction, Halley's 1986 perihelion…) and computed events around the current date: planetary oppositions, conjunctions with the Sun and with each other, greatest elongations of Mercury and Venus, and solar and lunar eclipses. Oppositions and conjunctions are found within a few hours of JPL Horizons (see `tests/events.test.js`).
- **Measure.** The ruler button (`X`) joins any two bodies with a line and shows their real distance in AU, km and light time, updating as time runs. Click two bodies (or their labels), or choose them from the lists; `Esc` clears.
- **Scale bar.** In true scale a bar shows a round real length (1 AU, 100,000 km, 1 light-hour…) for the current zoom; in compressed scale a note says that distances and sizes are not to scale.
- **Screenshots.** The camera button (`K`) saves the current view as a PNG, named by date and body, with the labels, date and a credit line, and copies a link to the same view to the clipboard.

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
| `E` | Eclipse finder |
| `V` | Events drawer (moments, oppositions, conjunctions, elongations, eclipses) |
| `X` | Measure the distance between two bodies (`Esc` clears) |
| `K` | Save a screenshot and copy the share link |
| `T` | Sky from Earth: observer and Tonight panel |
| `G` | Ground view (drag to look, scroll to zoom, arrows pan, `+` `-` zoom) |

## Development

Requires Node.js 20.19+.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests, incl. ephemeris accuracy vs JPL Horizons
npm run test:e2e   # Playwright smoke tests on the production build (uses local Chrome; E2E_PORT=… to change port)
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
src/textures/bakeQueue.js  progressive baking: 256 px previews first, full resolution in idle time
scripts/                measure-load.mjs (load timing), make-assets.mjs (icons, og.png)
src/earthMask.js        Natural Earth coastlines rasterized into Earth's land mask
src/observer.js         the observer (place, local time zone, localStorage) and src/data/cities.js
src/ui/                 toolbar, time bar, body list, info panel, labels, picking, keyboard, eclipse and observer panels
src/features/           optional feature modules (see below)
tests/                  unit tests (Vitest) and e2e smoke tests (Playwright)
src/ephemeris/conjunctions.js  oppositions, conjunctions, greatest elongations (geocentric)
src/data/events.js      curated moments for the events drawer
src/ui/events.js, measure.js, scaleBar.js, screenshot.js, toolCluster.js   exploration tools (events drawer, measure, scale bar, PNG capture, icon cluster)
scripts/fetch-events.mjs   regenerates tests/fixtures/events.json from JPL Horizons
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

The Vite `base` is set to `./`, so the build works under any repository name. The site is an installable, offline-capable PWA (`vite-plugin-pwa`); Open Graph image links use `SITE_URL`, or the Pages URL derived from `GITHUB_REPOSITORY` in CI.

## Credits

- Orbital elements: E. M. Standish, JPL Solar System Dynamics — <https://ssd.jpl.nasa.gov/planets/approx_pos.html>
- Reference ephemerides for tests: NASA JPL Horizons (including the opposition, conjunction and elongation times in `tests/fixtures/events.json`)
- Rotation models: IAU Working Group on Cartographic Coordinates and Rotational Elements (2015)
- Lunar theory, lunar phases and eclipses: J. Meeus, *Astronomical Algorithms* (2nd ed.), chapters 47, 49 and 54
- Sky from Earth (`src/ephemeris/topocentric.js`): J. Meeus, *Astronomical Algorithms* (2nd ed.) ch. 12 sidereal time, 13 horizontal coordinates, 15 rise/set, 16 refraction, 21 precession, 22 nutation, 40 parallax, 48 phases; planetary magnitudes after Mallama & Hilton (2018). Checked against JPL Horizons observer tables (`tests/horizons-sky.test.js`: Sun, Moon, Venus, Mars within 0.01° of Horizons in altitude and azimuth, Jupiter 0.03°, Saturn 0.08°, rise and set within a minute). City coordinates: hand-entered public geographic facts rounded to 0.01°; time zones are IANA names resolved by the browser's `Intl`
- Galilean moons: J. Meeus, *Astronomical Algorithms* ch. 44 (after Lieske's E5). Other major moons: JPL Planetary Satellite Mean Elements (<https://ssd.jpl.nasa.gov/sats/elem/>), refined against Horizons by `scripts/fit-satellites.mjs`; parent-relative errors are ≤ 0.33° for every moon over 1950–2050 (Galileans ≈ 0.01° median)
- Simplex noise: Ian McEwan, Stefan Gustavson (Ashima Arts), MIT License
- Coastlines: [Natural Earth](https://www.naturalearthdata.com) 1:50m land (public domain), via the `world-atlas` package
- Physical data: NASA Planetary Fact Sheets
- Stars: Yale Bright Star Catalogue, 5th revised ed. (Hoffleit & Warren 1991), public domain; converted by `scripts/build-stars.mjs`
- Constellation lines and names: [d3-celestial](https://github.com/ofrohn/d3-celestial) © 2015 Olaf Frohn, BSD-3-Clause
- Surface imagery (public domain; fetched and resized by `scripts/fetch-imagery.mjs` and `scripts/build-imagery.mjs` into `public/textures/`): NASA Earth Observatory Blue Marble Next Generation (July 2004), Black Marble 2016 and Blue Marble clouds; NASA SVS CGI Moon Kit (LRO WAC colour, LOLA elevation); USGS Astrogeology MESSENGER MDIS BDR, Viking colourised MDIM and New Horizons Pluto mosaics; Cassini PIA07782 Jupiter map (NASA/JPL/University of Arizona)
- Ring radii: NASA Planetary Ring Fact Sheets

## License

MIT
