# KSP DeltaV Planner

Plan **Kerbal Space Program** missions on an interactive Delta-V map. Explore
the stock Kerbol system, **Outer Planets Mod**, or **Real Solar System**, calculate
one-way and round-trip budgets, and add a reserve for your mission.

**[Open the planner](https://antoniotoni.github.io/ksp-deltav/)** ·
[Data and assumptions](docs/DATA.md) · [Developer guide](docs/DEVELOPMENT.md)

## Features

- **Stock, OPM, and RSS maps** with selectable surface, low-orbit, encounter, and high
  elliptical-orbit states. OPM includes Eeloo under Sarnus and Tal under Wal.
- **One-way and round-trip planning** with highlighted routes, editable
  endpoints, swap, and reset.
- **Mission reserves** from 0–100%, added to the final budget without changing
  the selected route.
- **Optional maneuver breakdowns**, with separate Outbound and Return tabs for
  round trips. Details stay hidden until you enable them.
- **Atmospheric-braking markers** showing where atmospheric assistance may be
  possible in the indicated direction.
- **A responsive map** with keyboard and touch selection, a deep-blue starfield,
  and no page or map scrolling.

## How to use it

1. Choose **Stock**, **OPM**, or **RSS**.
2. Select an origin, then a destination on the map. Use the Origin and
   Destination controls to edit either endpoint.
3. Enable **Round trip** to include the return journey.
4. Adjust **Redundancy** for your reserve and enable **Breakdown** to inspect
   individual maneuvers.

All budgets are shown in **m/s**. For example, the stock Kerbin surface → Mun
surface route is **5,120 m/s**, or **10,240 m/s** for a round trip before reserves.

## About the estimates

These are schematic planning estimates within the supplied maneuver graph,
rather than simulated trajectories. Interplanetary branches are centered on the
active pack's homeworld: Kerbin for Stock/OPM or Earth for RSS. Routes between
other planetary systems include a parking-orbit layover at that homeworld.
Flight dates, plane changes, gravity assists, and vehicle performance are not modeled.

**Aerobraking arrows do not reduce the budget.** Atmospheric savings are not
calculated, and atmospheric landings use an ascent-sized planning allowance.

**OPM uses legacy estimates.** Its historical community-map budgets are not
calibrated for current OPM atmospheres and orbits. Karen's budgets are analytical
estimates from official mod constants. The planner's information dialog and
[data guide](docs/DATA.md) document the sources and limitations.

**RSS uses a community Solar System reference** covering 33 base-mod bodies.
Some reference orbit altitudes differ from modern RSS; incompatible altitude
claims are omitted. See the data guide for coverage and calculation assumptions.

## Run locally

Built with **React, TypeScript, Vite, and Material UI**. Use **Node.js 24 LTS** and
npm:

```sh
npm ci
npm run dev
```

The app runs entirely in the browser and needs no backend or API credentials.
Build and preview the production version with:

```sh
npm run build
npm run preview
```

For testing, browser setup, project structure, and deployment instructions, see
the [developer guide](docs/DEVELOPMENT.md).

## Planned additions

- Modern OPM budget calibration and packs for Kcalbeloh and other mods.
- Atmospheric savings and improved landing estimates.
- Return-only planning and ordered multi-stop missions.
- User-supplied planet packs and additional direct interplanetary transfers.
- Longer term: CommNet coverage and relay planning.

Suggestions, bug reports, and contributions are welcome through
[GitHub issues](https://github.com/AntonioToni/ksp-deltav/issues) and pull requests.

## License

The application is licensed under the [MIT License](LICENSE). Reference-map
attribution and licensing are documented in the [data guide](docs/DATA.md).
Kerbal Space Program is the property of its respective owners; this is a
community project.
