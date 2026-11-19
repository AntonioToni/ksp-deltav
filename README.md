[![KSP Delta-V Planner — Mission budgets & CommNet planning](docs/assets/planner-preview.png?v=7)](https://antoniotoni.github.io/ksp-deltav/)

# KSP Delta-V Planner

A browser-based Delta-V and CommNet planner for **Kerbal Space Program**.
Plan mission budgets, compare routes, design relay constellations, and estimate
single-link antenna performance.

Supports **Stock**, **Outer Planets Mod (OPM)**, **Real Solar System (RSS)**,
**Stock/OPM + Kcalbeloh**, and custom JSON planet packs.

**[Open the planner](https://antoniotoni.github.io/ksp-deltav/)** ·
[User guide](docs/USER_GUIDE.md) · [Report an issue](https://github.com/AntonioToni/ksp-deltav/issues)

## Highlights

- **Mission planning:** one-way, round-trip, and return-only routes; up to four
  ordered stops; mission reserves; optional maneuver breakdowns.
- **Expanded transfers:** modeled direct routes between supported non-home
  planets and sibling moons, alongside published Delta-V map references.
- **Landing & Capture:** choose reference, atmospheric, or custom landing
  assumptions and supported capture options.
- **Multiple planetary systems:** Stock, OPM, RSS, Kcalbeloh regional views,
  wormhole configurations, and importable custom planet packs.
- **Relay constellations:** estimate equatorial coverage, antenna reach, local
  signal strength, and resonant deployment burns.
- **Interplanetary signals:** compare a single communication link using
  source-backed three-dimensional orbital geometry where available, or
  explore simplified reference and manual configurations.
- **Radio setups:** Stock CommNet, RSS configurations, Probes Before Crew
  (PBC), and optional Kerbalism signal-efficiency and science-rate estimates.
  Configure antenna arrays or custom powers to match your installation.
- **Accessible controls:** responsive map, keyboard and touch selection,
  Basic/Advanced relay views, and reduced-motion support.

For the full feature list, configuration steps, and worked examples,
see the **[user guide](docs/USER_GUIDE.md)**.

## Quick start

1. [Open the planner](https://antoniotoni.github.io/ksp-deltav/) and choose
   Stock, OPM, RSS, or a compatible Kcalbeloh/custom pack.
2. Select an **origin** and **destination** on the map. Choose **One way**,
   **Round trip**, or **Return only**, and add **Stops** if needed.
3. Adjust **Redundancy**, inspect the **Breakdown**, and optionally configure
   **Landing & Capture** assumptions.
4. Open **Relays** to plan a local satellite ring, or switch to **Signals**
   to compare an individual interplanetary link and its antennas.

No installation, account, backend, or API credentials are required.

## What the estimates mean

Delta-V totals combine published map budgets, calculated reference estimates,
and any allowances you enter. They are **planning estimates, not simulated
flights**: real launch windows, plane-change optimization, gravity assists,
vehicle performance, and other mission details may change the required budget.

CommNet coverage and signal calculations use explicit assumptions. In
particular, **Signals models one link at a time**, not a complete route through
relays to mission control. Actual craft altitude, local horizons, some blocking
conditions, and hardware state can affect in-game results. Kerbalism science
rates describe the selected hop, not guaranteed end-to-end throughput.

Match the radio profile and Advanced settings to your installed mods and game
difficulty. See [Data and assumptions](docs/DATA.md),
[Relay and signal planning](docs/RELAYS.md), and
[Validation](docs/VALIDATION.md) for detailed scope and sources.

## Documentation

| Guide | Contents |
| --- | --- |
| [User guide](docs/USER_GUIDE.md) | Full features, step-by-step usage, and estimate explanations |
| [Relay and signal planning](docs/RELAYS.md) | CommNet, antennas, PBC/RSS/Kerbalism, signal and science formulas |
| [Data and assumptions](docs/DATA.md) | Planet-pack sources, Delta-V reference models, and limitations |
| [Custom planet packs](docs/CUSTOM_PACKS.md) | JSON import/export, format, and examples |
| [Validation record](docs/VALIDATION.md) | Numerical checks and known accuracy limits |
| [Developer guide](docs/DEVELOPMENT.md) | Architecture, development, and testing |
| [Deployment guide](docs/DEPLOYMENT.md) | GitHub Pages and pull request previews |
| [Changelog](CHANGELOG.md) | Release history |

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
the [developer guide](docs/DEVELOPMENT.md). The [deployment guide](docs/DEPLOYMENT.md)
explains the shared GitHub Pages production site and trusted pull request previews.

## Roadmap and feedback

For planned work, browse the
[GitHub milestones](https://github.com/AntonioToni/ksp-deltav/milestones)
and [issues](https://github.com/AntonioToni/ksp-deltav/issues).
Longer-term ideas include additional planet packs and non-equatorial relay
constellations with complete multi-hop communication paths.

Suggestions, bug reports, and contributions are welcome through
[GitHub issues](https://github.com/AntonioToni/ksp-deltav/issues) and pull requests.
See the [contributing guidelines](CONTRIBUTING.md) to get started.

## License


Copyright © 2026 Antonio Toni. The application is licensed under the
[GNU General Public License v3.0 only](LICENSE) (`GPL-3.0-only`).
Versions previously distributed under MIT retain their original license.

Third-party notices and reference-data attribution remain under their respective
terms, documented in the [data guide](docs/DATA.md) and
[relay guide](docs/RELAYS.md).
The banner uses a KSP gameplay screenshot by MRDOOGLE (MRBOOGLE on SpaceDock),
from [Spectra Compatibility With Blackrack's Volumetric Clouds](https://spacedock.info/mod/3440/).
Kerbal Space Program is the property of its respective owners; this is a
community project.
