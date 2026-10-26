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
npm test             # Unit tests for packs, imports, layouts, missions, relays, and reserves
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
| Custom JSON imports and browser storage | `src/utils/customPacks.ts` |
| Graph construction and ordered contextual route search | `src/utils/buildGraph.ts`, `src/utils/findRoute.ts` |
| Mission modes, ordered stops, and stage budgets | `src/utils/mission.ts` |
| Reserve calculations | `src/utils/budget.ts` |
| Informational atmospheric-braking markers | `src/utils/aerobraking.ts` |
| Atmospheric capabilities and adjusted routing costs | `src/utils/atmosphericAssistance.ts` |
| Schematic layouts and SVG interaction | `src/components/mapLayout.ts`, `src/components/DeltaVMap.tsx` |
| Mission controls and presentation | `src/App.tsx` |
| Searchable stop editor and reorder controls | `src/components/StopsDialog.tsx` |
| Custom pack import, export, and selection | `src/components/PlanetPacksDialog.tsx` |
| Per-body atmospheric options and landing inputs | `src/components/AtmosphereDialog.tsx` |
| CommNet presets and body reference constants | `src/data/commnet.ts` |
| Relay geometry, antenna ranges, and resonant deployment | `src/utils/relay.ts` |
| Relay workspace and constellation diagram | `src/components/RelayPlannerDialog.tsx`, `src/components/RelayDiagram.tsx` |
| Theme and decorative background | `src/main.tsx`, `src/components/SpaceBackground.tsx` |
| Browser workflows | `e2e/` |

Maneuvers have explicit directed costs. Ordered route search uses Dijkstra states
containing the node, pending parking-orbit requirement, and next required visit.
It searches the complete itinerary for the selected mission mode, preserving
arrival context across stops and the round-trip turnaround. This prevents
incompatible encounter chaining and avoids choosing a cheap stage that makes the
remaining mission more expensive. Return-only mode reverses the itinerary and
starts independently at the destination.

`findLowestCostPath` retains the single-route interface; `findOrderedPath` handles
ordered visit sequences. `findMissionRoute` accepts up to four intermediate
states and exposes aggregate outbound/return routes plus their stage slices.
Stage costs restart their cumulative totals locally; the complete mission retains
its full cumulative budget. Reserve calculations remain separate from routing
costs and apply once after the selected atmospheric adjustments.

Atmospheric choices are session state keyed by body ID. The dialog edits a draft;
Apply commits it, Cancel discards it, and Disable all clears the draft. A checked
landing option requires an explicit finite allowance from 0 to 1,000,000 m/s.
Pack changes retain only compatible eligible choices, while Clear resets them.

`getAtmosphericCapabilities` identifies bodies with standalone inward capture or
descent edges supported by the atmospheric markers. `applyAtmosphericAssistance`
copies changed edges into an effective graph before ordered mission search and
returns adjustments keyed by edge ID for presentation. Ideal capture sets those
capture costs to zero; landing replaces eligible descent costs with the entered
allowance, which may be higher than the source figure. The source pack and base
graph stay unchanged, so export and attribution retain the original data.
Comparison uses the selected mission's original powered budget, and reserves
apply to its adjusted total. Atmospheric arrows themselves remain informational:
bundled moon-return transfer edges are not discounted. Arrival-context and
parking-orbit rules remain part of the same global search.

The Stops editor stores visits in outbound order. Pack changes filter out
unsupported stops, swapping reverses their order, and reset empties the list.
The map shows numbered stop badges, and the optional breakdown pages through
stages to keep long missions compact.
Custom pack stages also page through maneuvers in groups of eight, keeping
arbitrary imported paths within the available map area without page scrolling.

To try a pack without rebuilding the app, open **Custom planet packs** using the
puzzle button beside the system selectors and import its JSON.
The [custom pack guide](CUSTOM_PACKS.md) explains the format and supported
topology, with a complete synthetic example. Imports are validated before use
and stored in a versioned browser-local collection. Storage is revalidated on
load; rejected data or unavailable storage produces a visible message instead
of preventing the planner from opening. Stored packs are separate from the
reviewed, bundled registry. Pack selection itself is not saved between visits.

To bundle a reviewed pack, define its bodies, states, directed maneuvers,
sources, assumptions, and display metadata, then register it in
`planetPacks.ts`. Generic map layouts cover unfamiliar body names and nested
moon systems; optional presets can refine presentation. Add data, topology,
routing, and layout checks for the new pack. See the [data guide](DATA.md) before
changing reference figures.

## Relay planning

The **Relays** workspace is separate from Delta-V mission state. Its inputs stay
available when closed and reopened during the same session; changing the active
planet pack resets the workspace. It does not add deployment burns to the route
graph or persist settings across page reloads.

`calculateRelayPlan` takes explicit SI-unit inputs and returns validated network
geometry and deployment results. Antenna presets represent one stock CommNet
antenna per craft. Equatorial visibility, neighboring relay links, and maximum
DSN range are separate results. A local constellation is not a complete DSN
connection.

Body presets are separate from maneuver budgets and are matched by body ID and
parent context. This matters for Eeloo, whose parent and sphere of influence
change in OPM. The editable Body data tab supports bodies without a recognized
preset; missing physical inputs do not silently fall back to Kerbin. A missing
sphere of influence leaves that orbital bound unchecked.

The diagram displays the same geometry used by the calculations, including the
chosen effective occlusion radius. Rotation changes the sample surface station's
links while retaining the uniformly spaced constellation. Tests cover analytical
landmarks, range and limb boundaries, unsupported inputs, atmospheric clearance,
SOI bounds, and responsive workflows. See [Relay planning](RELAYS.md) for formulas,
sources, and scope.

## GitHub Pages

In **Settings → Pages → Build and deployment**, select **GitHub Actions** as the
source. The [deployment workflow](../.github/workflows/deploy-pages.yml) runs on
pushes to `main` and can also be started manually from the Actions tab.

The workflow installs dependencies, runs lint and unit tests, and checks the
production build with desktop browser tests before deploying `dist`. It uses
GitHub's temporary workflow token; no additional deployment secret is required.

The project URL is <https://antoniotoni.github.io/ksp-deltav/>.
