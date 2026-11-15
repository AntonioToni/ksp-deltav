# Changelog

## 1.1.0 — 16 November 2026

This update adds Basic and Advanced CommNet views, explains relay deployment
visually, and makes landing assumptions easier to find and change.

**[Open the planner](https://antoniotoni.github.io/ksp-deltav/)**

### CommNet relay planning

- Added a shared **Basic / Advanced** selector across Network, Deployment,
  Body data, and Signals. Basic is the starting view; Advanced retains the
  technical controls. Switching views preserves the active configuration and
  calculated results. Only the view preference is remembered across reloads.
- Basic shows body data as a readable reference, with a shortcut to edit it
  in Advanced. Notices identify active custom Advanced settings and provide
  a way to review them, including hidden clearance margins.
- Added a dedicated **Deployment** diagram showing the target orbit, lower
  or higher carrier orbit, periapsis, apoapsis, and shared release point.
  The diagram reflects the existing deployment calculations and orbit limits.
- Improved signal direction and planet-position labels, relay-to-relay signal
  and science-rate labels, metric readability, and expandable assumptions
  and source references. The surface antenna now displays **Communotron 16**.

### Landing & Capture

- Replaced the Atmosphere / Aero controls with **Landing & Capture**. Select
  a body and choose atmospheric landing at 0 m/s, a custom powered landing
  budget, or the reference map budget. Orbital capture is configured separately.
- Added route-specific landing and capture notices with an **Edit** shortcut.
  Notices describe adjustments applied to the selected route.
- Added distinct **Use map budgets for all** and **Restore recommended
  defaults** actions. Changes remain a draft until Apply; Cancel or Escape
  discards them. Fixed reset tooltips blocking footer buttons on narrow screens.

**Default budget change:** supported built-in Kerbin maps now assume atmospheric
braking and parachutes, with **0 m/s of landing engine burns**. Other atmospheric
bodies keep their reference budgets until configured individually. RSS and
imported custom packs do not receive the Kerbin default.

For the Stock Kerbin surface → Mun surface → Kerbin surface round trip, the
default budget is **6,840 m/s** before reserves. Selecting Kerbin's reference
landing budget restores **10,240 m/s**. Launch, transfer, and unrelated capture
costs remain included. The 0 m/s landing allowance does not guarantee safe entry
or touchdown.

### Layout and usability fixes

- Kept map nodes at a comfortable size on large screens and centered mission
  controls on ultrawide displays.
- Improved spacing between Jool moon points so hover rings and pointer targets
  stay separate in short layouts.
- Improved mobile dialog scrolling, control spacing, text, chart legends,
  and error messages. Fixed antenna-label truncation at 320px.
- Stabilized the antenna-array browser test by waiting for its menu to finish
  opening before selecting an option.
- Added a small scattering of yellow, orange, and red background stars,
  mixing dots and + shapes.

Routing, relay coverage, deployment, CommNet, and Kerbalism calculations retain
their existing models. Signal and bitrate estimates still cover individual
links rather than a complete relay path back to the DSN.

The release baseline passed **1,344 unit tests** and **381 production browser
checks**, with additional mobile and ultrawide layout verification.

**[Full comparison](https://github.com/AntonioToni/ksp-deltav/compare/v1.0.0...v1.1.0)**

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
