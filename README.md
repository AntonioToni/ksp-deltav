# KSP DeltaV Planner

Plan **Kerbal Space Program** missions on an interactive Delta-V map. Explore
the stock Kerbol system, **Outer Planets Mod**, or **Real Solar System**, calculate
one-way, round-trip, and return-only budgets, and add a reserve for your mission.

**[Open the planner](https://antoniotoni.github.io/ksp-deltav/)** ·
[Data and assumptions](docs/DATA.md) · [Relay guide](docs/RELAYS.md) ·
[Developer guide](docs/DEVELOPMENT.md)

## Features

- **Stock, OPM, and RSS maps** with selectable surface, low-orbit, encounter, and high
  elliptical-orbit states. OPM includes Eeloo under Sarnus and Tal under Wal.
- **Custom planet packs** imported from JSON, stored in your browser, and usable
  with the same route planner. Export any pack as a starting point for your own.
- **One-way, round-trip, and return-only planning** with highlighted routes, editable
  endpoints, swap, and reset.
- **Ordered multi-stop missions** with up to four intermediate states. Search for
  stops or select them on the map, then reorder or remove them in the Stops editor.
- **Mission reserves** from 0–100%, added to the final budget without changing
  the selected route.
- **Optional maneuver breakdowns**, with one stage at a time for multi-stop
  missions and separate Outbound and Return tabs for round trips. Details stay
  hidden until you enable them.
- **Atmospheric-braking markers** showing where atmospheric assistance may be
  possible in the indicated direction.
- **Optional atmospheric assistance**, with per-body ideal capture choices and
  powered landing allowances you enter yourself. Routes recalculate before the
  mission reserve is added.
- **CommNet relay planning** for circular, equally spaced constellations, with
  equatorial coverage, antenna ranges, and resonant deployment estimates.
- **Mixed antenna arrays** with separate relay and surface-client loadouts,
  using stock antenna combining rules.
- **A responsive map** with keyboard and touch selection, a deep-blue starfield,
  and no page or map scrolling.

## How to use it

1. Choose **Stock**, **OPM**, or **RSS**, or open **Custom planet packs** using the
   puzzle button beside them to import and select your own pack.
2. Select an origin, then a destination on the map. Use the Origin and
   Destination controls to edit either endpoint.
3. Choose a mission mode: **One way** for origin → destination, **Round trip**
   for both legs, or **Return only** for destination → origin. Changing modes
   keeps your selected endpoints.
4. Open **Stops** to add up to four intermediate states in outbound order. Use
   **Choose a stop** or **Select stop on map**, then reorder or remove entries.
   Numbered teal badges identify the stops on the map.
5. Open **Atmosphere** (**Aero** on phones) in the header to choose ideal capture
   or enter a powered landing allowance for each atmospheric body, then choose
   **Apply**. These options start disabled.
6. Adjust **Redundancy** for your reserve and enable **Breakdown** to inspect
   individual maneuvers. Use the stage arrows to browse a multi-stop journey.

All budgets are shown in **m/s**. For example, the stock Kerbin surface → Mun
surface route is **5,120 m/s**, or **10,240 m/s** for a round trip before reserves.
With stops, One way follows origin → stops → destination. Return only reverses
that itinerary, and Round trip follows it outward and then in reverse. Return
only starts at the selected destination state without including an outbound
flight or its arrival conditions. The reserve applies once to the full budget.

**Swap** reverses both the endpoints and the stop order. Changing systems keeps
states available in the new pack and removes unsupported stops; **Clear** also
removes all stops and atmospheric choices. Atmospheric choices follow body IDs,
so swapping or changing mission modes keeps them, and changing systems retains
compatible choices.

The **Custom planet packs** manager accepts up to five JSON packs and keeps them
on this browser; files are not uploaded. Use **Export current pack** to save a copy or
start editing a new pack. See the [custom pack guide](docs/CUSTOM_PACKS.md) for
the format and a small working example.

Open **Relays** in the header (the satellite icon on phones) to plan a local
CommNet constellation. Choose a body, orbit altitude, relay count, and antennas,
then inspect **Network**, **Deployment**, and **Body data**. Closing the tool
keeps your current Delta-V mission intact. The [relay guide](docs/RELAYS.md)
explains the calculations and
editable body inputs.

Choose **Antenna array…** under **Relay antenna** or **Surface antenna** to mix
stock parts and counts, then choose **Apply**. A relay loadout is fitted to each
satellite separately; antennas on different satellites do not combine.

## About the estimates

These are schematic planning estimates within the supplied maneuver graph,
rather than simulated trajectories. The supplied interplanetary branches are
centered on each built-in pack's homeworld: Kerbin for Stock/OPM or Earth for RSS.
Routes between other planetary systems in these packs include a parking-orbit
layover at that homeworld. Custom pack estimates depend on their supplied data.
Flight dates, plane changes, gravity assists, and vehicle performance are not modeled.

**Atmospheric choices are estimates, not entry simulations.** Ideal capture
uses a zero-powered-burn lower bound for separate capture and circularization
segments; capture cleanup burns are excluded. Landing uses the powered allowance
you enter, including an explicit zero if appropriate for your plan. Entry
heating, guidance, and parachute performance are not modeled. Bundled transfer
costs remain intact even when their arrow indicates possible atmospheric
assistance. With options disabled, atmospheric landings retain their original
ascent-sized planning allowance. See the [data guide](docs/DATA.md) for a worked
example and the exact scope of the adjustments.

**OPM uses legacy estimates.** Its historical community-map budgets are not
calibrated for current OPM atmospheres and orbits. Karen's budgets are analytical
estimates from official mod constants. The planner's information dialog and
[data guide](docs/DATA.md) document the sources and limitations.

**RSS uses a community Solar System reference** covering 33 base-mod bodies.
Some reference orbit altitudes differ from modern RSS; incompatible altitude
claims are omitted. See the data guide for coverage and calculation assumptions.

**Relay coverage is equatorial.** A visible surface receiver and a working local
ring do not establish a connection back to the DSN. The radio presets use stock
CommNet rules; RealAntennas and RemoteTech are not modeled.

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

- Modern OPM budget calibration.
- Kcalbeloh configurations alongside Stock or OPM, plus other mod packs.
- Atmospheric entry feasibility and vehicle-specific landing estimates.
- Additional direct interplanetary transfers in the supplied packs.
- Interplanetary signal planning: antenna pairs, changing planet-to-planet
  distances, best/worst-case signal strength, and occlusion checks.
- Advanced relay planning: inclined constellations and complete DSN paths.

Suggestions, bug reports, and contributions are welcome through
[GitHub issues](https://github.com/AntonioToni/ksp-deltav/issues) and pull requests.

## License

The application is licensed under the [MIT License](LICENSE). Reference-map
attribution and licensing are documented in the [data guide](docs/DATA.md), and
relay references in the [relay guide](docs/RELAYS.md).
Kerbal Space Program is the property of its respective owners; this is a
community project.
