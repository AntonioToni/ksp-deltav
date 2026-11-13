# Changelog

## 1.0.0 — 13 November 2026

First stable release of KSP Delta-V Planner.

**[Open the planner](https://antoniotoni.github.io/ksp-deltav/)**

- Interactive maps for Stock, OPM, RSS, Stock + Kcalbeloh, and OPM + Kcalbeloh.
- One-way, round-trip, return-only, and multi-stop mission budgets, with reserves,
  atmospheric options, and optional maneuver breakdowns.
- Custom planet-pack imports and exports, plus Kcalbeloh regional views and
  wormhole configurations.
- Local equatorial relay coverage, antenna arrays, resonant deployment estimates,
  and directed interplanetary signal checks.
- Kerbalism 3.44 signal damping and science bitrate estimates, with editable
  antenna speed, minimum rates, and custom antenna rates.
- Responsive keyboard and touch controls, animated routes, and reduced-motion
  support.

Delta-V figures are planning estimates from documented reference data and models.
Atmospheric options use idealized assumptions or user-supplied landing allowances.
Relay coverage is equatorial. Signals and bitrates cover individual hops;
complete relay paths back to the DSN remain outside the model. Dated trajectories,
ElectricCharge availability, antenna operating state, and storms are not simulated.

The application baseline passed **1,262 unit tests** and **315 production browser
checks**, with live mobile and desktop verification.

This release uses **GNU GPL v3.0 only** (`GPL-3.0-only`). Third-party notices remain
applicable, and previously distributed MIT versions retain their original
permissions.

See the versioned [README](https://github.com/AntonioToni/ksp-deltav/blob/v1.0.0/README.md),
[data guide](https://github.com/AntonioToni/ksp-deltav/blob/v1.0.0/docs/DATA.md),
[relay guide](https://github.com/AntonioToni/ksp-deltav/blob/v1.0.0/docs/RELAYS.md),
and [validation record](https://github.com/AntonioToni/ksp-deltav/blob/v1.0.0/docs/VALIDATION.md)
for supported configurations, sources, and assumptions.
