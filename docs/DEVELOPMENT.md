# Developer guide

## Local setup

Use **Node.js 24 LTS** and npm.

```sh
npm ci
npm run dev
```

Vite prints the local development URL. The app is entirely client-side and
requires no backend, API credentials, or environment variables.

```sh
npm run build
npm run preview
```

Production output is written to `dist`. Production builds and previews use the
`/ksp-deltav/` project path for GitHub Pages; the development server uses `/`.

## Checks

```sh
npm test             # Unit tests for packs, layouts, routing, round trips, and reserves
npm run lint         # ESLint
npm run build        # Strict TypeScript checks and production bundle
```

Use `npm run test:watch` to rerun unit tests as files change.

### Browser tests

Playwright opens the planner in Chromium to check selection, budgets, controls,
and desktop/mobile layouts. Install its browser before running the tests:

```sh
npx playwright install chromium
npm run test:e2e
```

The tests start their own Vite development server on port **4173**. To check the
production build at its GitHub Pages path instead:

```sh
npm run test:pages
```

That command builds the app and starts a preview server on port **4175**. The
browser suite covers desktop and touch-enabled mobile configurations.

Outside CI, the configuration can reuse an existing Chromium executable at
`/usr/bin/chromium`. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to use a different
installation. These are optional development settings; visitors use their
normal browser and do not need to install test tools.

On Linux CI machines that also need browser system dependencies, use
`npx playwright install --with-deps chromium`.

## Project structure

| Area | Location |
| --- | --- |
| Body hierarchy, states, maneuvers, and pack types | `src/types/planner.ts` |
| Stock reference data | `src/data/stock.ts` |
| OPM and RSS packs, and pack registry | `src/data/opm.ts`, `src/data/rss.ts`, `src/data/planetPacks.ts` |
| Pack and topology validation | `src/utils/validatePlanetPack.ts` |
| Graph construction and contextual route search | `src/utils/buildGraph.ts`, `src/utils/findRoute.ts` |
| Outbound/return mission planning | `src/utils/mission.ts` |
| Reserve calculations | `src/utils/budget.ts` |
| Informational atmospheric-braking markers | `src/utils/aerobraking.ts` |
| Schematic layouts and SVG interaction | `src/components/mapLayout.ts`, `src/components/DeltaVMap.tsx` |
| Mission controls and presentation | `src/App.tsx` |
| Theme and decorative background | `src/main.tsx`, `src/components/SpaceBackground.tsx` |
| Browser workflows | `e2e/` |

Maneuvers have explicit directed costs. Route search tracks arrival context to
prevent incompatible encounter chaining, and round trips carry that context
across the turnaround. Reserve calculations and atmospheric markers are separate
from routing costs.

To add a planet pack, define its bodies, states, directed maneuvers, sources,
assumptions, and display metadata, then register it in `planetPacks.ts`. Generic
map layouts cover unfamiliar body names and nested moon systems; optional
presets can refine presentation. Add data, topology, routing, and layout checks
for the new pack. See the [data guide](DATA.md) before changing reference figures.

## GitHub Pages

In **Settings → Pages → Build and deployment**, select **GitHub Actions** as the
source. The [deployment workflow](../.github/workflows/deploy-pages.yml) runs on
pushes to `main` and can also be started manually from the Actions tab.

The workflow installs dependencies, runs lint and unit tests, and checks the
production build with desktop browser tests before deploying `dist`. It uses
GitHub's temporary workflow token; no additional deployment secret is required.

The project URL is <https://antoniotoni.github.io/ksp-deltav/>.
