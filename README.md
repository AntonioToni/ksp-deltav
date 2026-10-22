# KSP DeltaV Planner

An open-source mission planner for **Kerbal Space Program**, built with React,
TypeScript, Vite, and Material UI. Select states directly on a schematic map of
the stock Kerbol system to calculate a route and inspect its maneuver budget.

## Implemented

- Interactive SVG map with all 17 stock bodies and 50 selectable states:
  surface, low orbit, encounter, and high elliptical orbit where needed.
  Kerbol has no mission states; Jool has no landable surface.
- Explicit origin/destination selection, endpoint editing, swap, and reset.
- Lowest estimated Delta-V within the supported maneuver graph, with directed
  connections, highlighted routes, and individual/cumulative maneuver costs.
- Keyboard selection with Enter/Space, focus indicators, zoom controls,
  route-only filtering, and a scrollable map on smaller screens.
- A validated, sourced stock dataset and distinct invalid/unreachable results.

## Development

Use **Node.js 24 LTS** and npm (validated with Node 24.19.0 / npm 11.9.0).

```sh
npm ci
npm run dev
```

The app is entirely client-side. It needs no backend, credentials, or environment
variables. Production output is generated in `dist`:

```sh
npm run build
npm run preview
```

Production builds and previews use the `/ksp-deltav/` project path required by
GitHub Pages. The development server continues to use `/`.

## Validation

```sh
npm test             # Vitest: routing, validation, and stock-data regressions
npm run lint
npm run build        # Strict TypeScript checking and production bundle
npm run test:e2e     # Playwright: desktop and mobile browser workflows
npm run test:pages   # Build and run those workflows under /ksp-deltav/
```

Browser tests start their own Vite server on port 4173. The cloud environment's
`/usr/bin/chromium` is used when available. On another machine, install a browser
with `npx playwright install chromium`; an optional
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` can select a different Chromium executable.
Use `npm run test:watch` for interactive unit-test development.

## GitHub Pages deployment

In the repository's **Settings → Pages → Build and deployment**, select
**GitHub Actions** as the source. The `Deploy to GitHub Pages` workflow then
validates, builds, and deploys each push to `main`. It can also be started
manually from the Actions tab.

The workflow runs lint, routing/data tests, and desktop browser checks against
the production build at its project path before uploading `dist`. Deployment
uses GitHub's Pages actions and the workflow's temporary `GITHUB_TOKEN`; no
additional deployment secret is needed.

The default project URL is <https://antoniotoni.github.io/ksp-deltav/> once the
first deployment succeeds.

## How estimates work

The planner uses the individually sourced segments of the community KSP 1.7.3
Delta-V map. Numbers are in **m/s** and represent favorable, idealized transfers;
they are estimates rather than simulated trajectories. The Kerbin surface → Mun
surface reference route is **5,120 m/s** in this source revision.

Only Kerbin-centered interplanetary transfers are currently supplied. A route
between two other planetary systems includes capture into Kerbin low orbit and
escape for the next transfer. The search tracks arrival context to prevent a
free shortcut through incompatible planetary encounters. High elliptical orbit
or a moon orbit does not reset that context.

Plane-change allowances, dates, travel time, gravity assists, and vehicle
performance are excluded. No atmospheric savings are credited. Atmospheric
powered descent uses an explicitly labeled, ascent-sized planning allowance,
not a calculated landing burn. Add an appropriate mission margin.

See [data provenance, assumptions, and reference totals](docs/DATA.md) for the
pinned source and its attribution.

## Architecture

- `src/types/planner.ts`: body hierarchy, route states, directed maneuvers,
  planet packs, and route results.
- `src/data/stock.ts`: the single stock dataset, including reference orbits,
  source metadata, and maneuver assumptions.
- `src/utils/validatePlanetPack.ts`: runtime validation of data and supported
  maneuver topology.
- `src/utils/buildGraph.ts` and `findRoute.ts`: graph construction and contextual
  Dijkstra search, independent of React.
- `src/components/mapLayout.ts` and `DeltaVMap.tsx`: schematic coordinates and
  interactive SVG presentation, separate from the physical/reference data.
- `src/App.tsx`: mission selection, route presentation, and assumptions.

## Next steps

- Ordered multi-stop missions and return legs.
- Reviewed direct transfers between additional planetary systems.
- Vehicle-aware landing estimates and optional atmospheric assistance.
- Versioned planet-pack loading for OPM, RSS, Kcalbeloh, and other mods.
- Later: CommNet deployment/coverage and signal-strength planning.

The project remains in early development. Contributions, bug reports, and
suggestions are welcome. Kerbal Space Program is the property of its respective
owners; this is a community project.
