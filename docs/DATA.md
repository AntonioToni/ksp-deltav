# Stock-system reference data

The stock pack in `src/data/stock.ts` transcribes numerical budgets from the
[Kowgan / WAC community stock Delta-V map for KSP 1.7.3](https://github.com/Kowgan/ksp_cheat_sheets/blob/ca2d4910dd98e5fd14277b04ec686e61cd6967ce/delta_v_map_vanilla/DvMap_A4.svg).
The reference is pinned to commit `ca2d4910dd98e5fd14277b04ec686e61cd6967ce`.
The original map credits the KSP community and is published under
[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/).
No source artwork or layout is bundled. This planner uses a new schematic layout;
reference figures have been reorganized into named, directed maneuver records.

## Coverage and units

The pack describes all 17 stock bodies: Kerbol, seven planets, and nine moons.
There are no Kerbol route states and no Jool surface state. Every other body has
surface, low orbit, and encounter states; Eve, Duna, and Jool additionally have a
high elliptical orbit reaching the sphere-of-influence boundary.

All maneuver budgets use **m/s**. Low-orbit altitudes use **km above the body**,
following the source map labels. An encounter is the source map's intercept
reference, not an arbitrary hyperbolic orbit with any excess velocity. A low
orbit and an elliptical orbit are different states.

## Assumptions and limitations

- Values describe favorable, idealized transfers. Maximum plane-change figures
  printed beside source branches are **not included**. Dates, launch windows,
  flight duration, gravity assists, inclination optimization, vehicle design,
  and dynamic orbital mechanics are not modeled.
- Local orbit/capture segments are separate from interplanetary increments.
  For example, the Kerbin–Duna transfer increment is 130 m/s; it is not a complete
  low-Kerbin-orbit to low-Duna-orbit budget.
- Eve, Duna, and Jool moon branches leave **high elliptical orbit**, not low
  orbit. Retaining that extra state prevents accidental double charging or
  attaching a moon transfer to the wrong reference orbit.
- Costs are stored as directed edges. A reverse edge is explicitly declared,
  with its assumptions. Equal opposite-direction figures retain the source
  map's simplified budgeting convention rather than asserting equal physical
  trajectories.
- Vacuum surface descent reverses the map ascent estimate. Atmospheric powered
  descent deliberately uses a **conservative placeholder budget equal to the
  ascent budget**. This is not a verified landing calculation. No parachute,
  aerobraking, or aerocapture savings are credited. Vehicle-dependent descent
  modeling remains future work.
- Only interplanetary branches to/from Kerbin are supplied by this pack. A
  route between two other planetary systems must capture into a low parking
  orbit at Kerbin before escaping for the next transfer. The routing search
  tracks whether a low-orbit reset at the arrival planet is required after an interplanetary arrival;
  it does not permit chaining incompatible encounter energies as a free flyby.
  High elliptical orbit does not count as a parking-orbit reset. These are
  separate idealized transfer legs, not a direct transfer or a flight-ready
  trajectory. The app exposes this limitation beside the estimate.
- Add a mission margin. A shortest path is the lowest estimate in this dataset,
  not a universal minimum over all possible KSP trajectories.

## Mission modes

These modes apply to Stock, OPM, and RSS. An itinerary contains the selected
origin, up to four intermediate states in outbound order, and the destination.
For example, an itinerary with two stops is A → S1 → S2 → B.

- **One way** follows A → S1 → S2 → B.
- **Return only** follows B → S2 → S1 → A. It assumes the craft is already at B;
  it neither requires an outbound route nor inherits an unmodeled outbound
  arrival.
- **Round trip** follows the outbound itinerary and then retraces the stops in
  reverse order to A. Arrival context carries through every stop and the
  turnaround. The budget is not assumed to be twice the outbound cost.

The route search optimizes the complete sequence for the selected mode. Its
state includes the current node, pending parking-orbit requirement, and next
required visit. A stop cannot erase arrival energy or turn an encounter into a
free parking-orbit reset. A longer route to one stop may therefore give the
lowest total budget once later visits and their arrival conditions are included.
Passing a later stop early does not complete that required visit out of order.
Consecutive repeated states are allowed and can produce zero-maneuver stages.

The breakdown divides the optimized journey into stages between required visits,
with actual start and end states and local stage costs. These are parts of one
mission, rather than independently optimized routes or additional charges.
Outbound and Return tabs distinguish the two directions of a round trip.
Reserves apply once to the complete selected-mode budget.

Numbered teal map badges identify stops in outbound order. Repeated stop states
share a badge showing the first number and `+`; its description lists all visit
positions. Swapping endpoints also reverses stop order. Changing packs retains
supported states and removes unsupported stops, without modifying source data.

A return-only route from an encounter or high ellipse can still differ from the
return leg of a full round trip because its initial arrival conditions differ.
The graph's supplied transfers, parking-orbit restrictions, and other reference
limitations apply to multi-stop missions as well as routes without stops.

## Atmospheric-braking markers

Small arrows point inward on atmospheric capture and descent segments. These
are informational opportunities, covering aerocapture, aerobraking, and entry or
landing assistance; they do not change maneuver costs or calculate a trajectory.
The stock map shows 14 directed markers: eight local captures, four atmospheric
descents, and the Mun/Minmus returns to Kerbin low orbit. Outbound maneuvers and
airless-body captures and landings have no atmospheric-braking arrow.

Moon returns ending at a parent's high elliptical reference orbit remain
unmarked. Interplanetary encounter-to-encounter increments also remain unmarked;
their destination's atmospheric capture is shown on its separate inward
capture segment. Actual atmospheric assistance depends on the trajectory and
vehicle, and no atmospheric savings are applied to the budget.

## Auditing changes

`src/data/stock.test.ts` checks coverage, references, topology, and landmark totals.
Useful source-map landmarks from Kerbin surface, excluding plane changes:

| Destination surface | Budget (m/s) |
| --- | ---: |
| Mun | 5,120 |
| Minmus | 4,660 |
| Duna | 6,540 |
| Ike | 5,300 |
| Moho | 8,380 |
| Eve | 13,820 |
| Gilly | 5,020 |
| Dres | 6,690 |
| Laythe | 10,210 |
| Vall | 7,820 |
| Tylo | 9,210 |
| Bop | 6,830 |
| Pol | 6,590 |
| Eeloo | 7,480 |

Some printed body totals in the source map differ from the sum of their revised
segments. The planner always sums the individually transcribed segment values;
it does not add a second table of competing totals. Historical map revisions
also differ (for example, the old Mun capture figure was 310 m/s; this pinned
source uses 280 m/s).

## Outer Planets Mod pack

`src/data/opm.ts` adds a separately selectable **OPM** pack. It includes 32 bodies,
96 selectable states, and 190 directed maneuvers. Stock IDs are retained for
shared bodies and states. New bodies use `opm:` IDs. Eeloo is cloned as a Sarnus
moon; switching packs never changes the stock dataset. Tal orbits Wal, and Karen
orbits Plock. Jool, Sarnus, Urlum, and Neidon have no surface states.

### References and compatibility

- Numerical OPM map segments: [Kowgan community OPM 1.8.1 map, page 2](https://github.com/Kowgan/ksp_cheat_sheets/blob/ca2d4910dd98e5fd14277b04ec686e61cd6967ce/delta_v_map_outer_planets/DvMap_OP_2_A4.svg),
  pinned to `ca2d4910dd98e5fd14277b04ec686e61cd6967ce`. Its attribution and
  CC BY-NC-SA 4.0 terms are the same as the stock reference above; no artwork is
  bundled. Individual numerical segments are transcribed into the new data model.
- Body hierarchy, atmosphere presence, and Karen physical constants:
  [official OPM Kopernicus configs](https://github.com/Poodmund/Outer-Planets-Mod/tree/ffedf02e23d2d620e1018d1467f5e485f7950fa0/GameData/OPM/KopernicusConfigs),
  pinned to `ffedf02e23d2d620e1018d1467f5e485f7950fa0`.

**The OPM map is historical. Its budgets are not calibrated for current OPM
atmospheres or orbital parameters.** In particular, the old printed low-orbit
altitudes for Sarnus (314 km), Urlum (134 km), Neidon (120 km), and Thatmo (30 km)
lie inside the atmosphere depths in the pinned modern configs (580, 325, 260,
and 35 km respectively). The planner intentionally omits those four altitude
claims; it does not silently substitute a modern altitude while presenting the
old cost as a recalculated physical result. These states and costs represent
the historical map's schematic budget references. Verify contemporary mission
budgets in game or with a trajectory tool.

The pack retains the newer stock reference for unaffected stock bodies rather
than replacing it with the historical OPM map's first page. Eeloo changes both
parent and routing context: its OPM segments are Sarnus low orbit → Eeloo
encounter **1120 m/s**, Eeloo encounter → low orbit **490 m/s**, and surface
budget **540 m/s**. The corresponding stock Eeloo transfer, capture, and surface
segments are removed only from the OPM clone.

All new OPM moon branches leave their parent's **low orbit** in the reference
map, including Tal's branch from Wal. Sarnus, Urlum, Neidon, and Plock retain
separate high elliptical states on their interplanetary arrival branches.
The shared Polta/Priax intercept in the original diagram becomes two separate
encounter nodes with identical **620 m/s** parent-transfer budgets; their local
capture and surface costs remain separate. Plane-change figures printed
beside branches are excluded, consistently with the stock pack.

Plock's original transfer is a **1900–2700 m/s range**. The planner chooses the
upper endpoint, **2700 m/s**, as a conservative map-budget selection. It does
not invent a midpoint or simulate the launch epoch. Atmospheric powered-descent
budgets for Tekto and Thatmo use the same explicitly labeled placeholder policy
as atmospheric stock bodies: ascent budget reused without atmospheric savings.

### Karen analytic estimate

Karen is absent from the historical map. Its six directed maneuvers therefore
use a different source tag, `opm-analytic-karen`, and disclose that the values are
analytic estimates rather than map transcriptions or flight-tested budgets.

Inputs are from the pinned [Plock.cfg](https://github.com/Poodmund/Outer-Planets-Mod/blob/ffedf02e23d2d620e1018d1467f5e485f7950fa0/GameData/OPM/KopernicusConfigs/OuterPlanets/Plock.cfg)
and [Karen.cfg](https://github.com/Poodmund/Outer-Planets-Mod/blob/ffedf02e23d2d620e1018d1467f5e485f7950fa0/GameData/OPM/KopernicusConfigs/PlockMoons/Karen.cfg):

| Input | Plock | Karen |
| --- | ---: | ---: |
| Radius (m) | 189,000 | 85,050 |
| Surface gravity (`geeASL`) | 0.148 | 0.066 |
| Parking altitude chosen for this estimate (m) | 10,000 | 10,000 |
| Karen orbit semi-major axis about Plock (m) | — | 2,457,800 |
| Karen eccentricity | — | 0 |

Use `g₀ = 9.80665 m/s²` and `μ = g₀ × geeASL × R²`. Let `r₁` be Plock's
parking radius, `r₂` Karen's orbital radius, and `rK` Karen's parking radius.
The ideal coplanar Hohmann departure and arrival excess-speed estimates are:

```text
departure = sqrt(μP / r₁) × (sqrt(2r₂ / (r₁ + r₂)) − 1)
v∞        = sqrt(μP / r₂) × (1 − sqrt(2r₁ / (r₁ + r₂)))
capture   = sqrt(v∞² + 2μK / rK) − sqrt(μK / rK)
```

The ideal surface-to-parking estimate starts from a nonrotating surface using
two instantaneous impulses. With `a = (RK + rK) / 2`:

```text
surface = sqrt(μK × (2/RK − 1/a))
        + sqrt(μK / rK) − sqrt(μK × (2/rK − 1/a))
```

Round each derived budget **upward** to a whole m/s:

| Segment | Unrounded (m/s) | Stored budget (m/s) |
| --- | ---: | ---: |
| Plock parking orbit → Karen encounter | 183.862 | 184 |
| Karen encounter → Karen parking orbit | 104.311 | 105 |
| Karen surface → Karen parking orbit | 247.298 | 248 |

Reverse directed edges reuse these idealized estimates. This model omits
finite-thrust and gravity losses, terrain, body rotation, orbital perturbations,
and optional SigmaBinary behavior. Rounding upward does **not** supply a mission
margin or make the idealized estimate a conservative real-flight bound.

### OPM regression totals

Tests verify independent reference sums from Kerbin surface, omitting plane
changes and using the stated Plock range policy:

| Destination | Budget (m/s) |
| --- | ---: |
| Sarnus low orbit | 8,980 |
| Hale surface | 10,010 |
| Ovok surface | 10,100 |
| Eeloo surface | 11,130 |
| Slate surface | 13,480 |
| Tekto surface | 13,470 |
| Urlum low orbit | 8,380 |
| Polta surface | 10,080 |
| Priax surface | 9,720 |
| Wal surface | 11,290 |
| Tal surface | 10,720 |
| Neidon low orbit | 8,430 |
| Thatmo surface | 10,760 |
| Nissee surface | 10,640 |
| Plock surface | 8,640 |
| Karen surface (includes analytic estimate) | 8,697 |

The registry in `src/data/planetPacks.ts` is the single list of selectable packs.
Adding a pack means adding its reviewed dataset and registry entry. The selector,
routing engine, and map consume the pack's metadata and supported states.

## Real Solar System pack

`src/data/rss.ts` adds the **RSS** pack with independent `rss:` IDs and Earth as
its interplanetary transfer hub. It contains **33 bodies, 102 selectable states,
and 202 directed maneuvers**. No stock KSP costs are scaled or copied into RSS.
The Stock and OPM datasets remain separate and unchanged.

### Sources and scope

The numeric reference is the community **Delta-V Map of the Solar System**,
preserved as [rss-dvmap.webp](https://github.com/davidson16807/mission-planner/blob/dc472f56101b260baee8814a94de985f44a6c9b2/rss-dvmap.webp)
at `davidson16807/mission-planner` commit
`dc472f56101b260baee8814a94de985f44a6c9b2`. The diagram has no visible version,
publication date, or author credit. This repository revision identifies the
exact artifact used; it does not establish its authorship or official RSS
calibration. No source artwork is bundled into this application.

Body hierarchy and atmosphere presence were checked against the
[official KSP-RO/RealSolarSystem configs](https://github.com/KSP-RO/RealSolarSystem/tree/75139b961567f4dab61af83fe162a7e52026558b/GameData/RealSolarSystem/RSSKopernicus),
pinned to `75139b961567f4dab61af83fe162a7e52026558b`.

Coverage is the intersection of the diagram and the named bodies in those base
RSS configs:

- Sun, Mercury, Venus, Earth, Moon, Mars, Phobos, Deimos, Vesta, and Ceres.
- Jupiter, Io, Europa, Ganymede, and Callisto.
- Saturn, Mimas, Enceladus, Tethys, Dione, Rhea, Titan, and Iapetus.
- Uranus, Miranda, Ariel, Umbriel, Titania, and Oberon.
- Neptune, Triton, Pluto, and Charon.

The Sun is a context body with no selectable mission states. Gas giants have no
surface states. Ceres, Vesta, and Pluto use the application's generic `planet`
category for bodies orbiting the central star; that field is not an IAU
classification claim. Diagram-only minor moons and trans-Neptunian objects,
optional RSS expansion packs, GEO, Lagrange points, and solar approach/landing
missions are outside this dataset. No unsupported figures are invented to fill
those omissions.

The pack follows the main transfer rails. Inset/direct moon-transfer alternatives
shown elsewhere in the diagram are not supplied. Route minima therefore apply
only to this graph, rather than every trajectory or alternative in the source.

### Numeric interpretation and graph normalization

The diagram prints **km/s**. Every numeric segment is converted into integer
**m/s** before storage. Labels along a shared rail are consecutive increments,
not independent departure totals. The arrays retained beside each record in
`rss.ts` make those sums auditable.

For example, Earth's low-orbit escape budget is
`2440 + 680 + 90 = 3210 m/s`. The Earth-centered increment to Jupiter is
`390 + 920 + 380 + 1400 = 3090 m/s`. The latter is added to Earth escape; it is
not a complete launch, orbit, or capture budget. Venus uses `280 m/s`, while
Mercury uses `280 + 2060 = 2340 m/s`. The energy-reference junctions for Mars,
Vesta, and Ceres do not imply a visit or capture at those bodies.

Similarly, Jovian moon transfers branch from **Jupiter's high elliptical
capture orbit**, with cumulative rail increments. Io's transfer budget is
`190 + 930 + 800 + 1060 + 1560 = 4540 m/s`, and its local capture/orbit cost is
`5790 + 730 = 6520 m/s`. Source intermediate junctions such as Himalia are kept
in the sum even when that body is outside base RSS coverage; they are not free
flybys or actual moon visits. The Jupiter high-to-low-orbit sum is
`190 + 930 + 800 + 1060 + 1560 + 4650 + 8020 = 17210 m/s`, separate from its
`270 m/s` arrival capture.

All supported moons except Earth's Moon attach to their parent's **elliptical
capture orbit**, not its low orbit. Earth's lunar transfer leaves low Earth
orbit at `2440 + 680 = 3120 m/s`. The Moon encounter-to-low-orbit cost is
`140 + 680 = 820 m/s`; it is not the rounded `800 m/s` figure found in some
secondary tables. Surface/orbit cost is `1720 m/s`. The resulting source-based
Earth surface → Moon surface budget is **14,660 m/s**, including the source's
**9,000 m/s** Earth ascent allowance. Reverse edges reuse the same idealized
reference convention, giving **29,320 m/s** for that round trip without
atmospheric savings.

### Assumptions and modern-atmosphere limitations

The diagram assumes idealized Hohmann transfers and low-periapsis burns. This
pack does not simulate launch windows, inclination changes, gravity assists,
finite-thrust losses, vehicle performance, or travel time. The diagram also
suggests a rough low-thrust multiplier; the planner does not apply it because
it does not model a specific propulsion system. Add a mission margin and verify
the vehicle-specific trajectory independently.

Atmospheric powered-descent budgets reuse the corresponding source ascent
allowance as an explicit placeholder. No parachute, aerocapture, or aerobraking
savings change route costs. Braking markers reflect source-supported
opportunities for Earth, Venus, Mars, Titan, and the four gas giants. Pluto and
Triton have atmospheres in the official RSS configs, but the reference does not
mark atmospheric-braking opportunities there; they retain `hasAtmosphere: true`
and explicitly set `supportsAtmosphericBraking: false`.

Some historical parking altitudes are incompatible with modern RSS atmosphere
depths. The planner omits those altitude claims rather than silently claiming
that source budgets were recalculated at a safe modern altitude:

| Body | Diagram parking altitude (km) | Pinned RSS atmosphere depth (km) |
| --- | ---: | ---: |
| Saturn | 2,000 | 2,000 (boundary, no clearance) |
| Uranus | 1,000 | 1,400 |
| Neptune | 1,000 | 1,250 |
| Pluto | 100 | 110 |
| Triton | 100 | 110 |

Other advertised atmospheric parking altitudes clear the pinned atmosphere:
Earth 250/140 km, Venus 400/145 km, Mars 200/125 km, Jupiter 2000/1550 km, and
Titan 1000/600 km (parking altitude / atmosphere depth). The underlying costs
remain community-map estimates, not contemporary flight-tested RSS budgets.

Earth is the supplied interplanetary hub. Travel between other planetary systems
requires capture into a low parking orbit at Earth before the next departure.
Encounter energies cannot be chained as an invented free gravity assist.

### RSS regression landmarks

`src/data/rss.test.ts` checks all 102 supported states in both directions, the
Earth layover policy, safe altitude metadata, pack isolation, and independent
reference sums. Examples from Earth surface, without plane changes or
atmospheric savings:

| Destination | Budget (m/s) |
| --- | ---: |
| Moon surface | 14,660 |
| Mercury surface | 25,140 |
| Venus surface | 42,790 |
| Mars surface | 18,310 |
| Phobos surface | 14,559 |
| Deimos surface | 14,266 |
| Vesta surface | 17,890 |
| Ceres surface | 18,710 |
| Jupiter low orbit | 32,780 |
| Io surface | 28,410 |
| Europa surface | 26,490 |
| Ganymede surface | 25,020 |
| Callisto surface | 23,170 |
| Saturn low orbit | 26,930 |
| Titan surface | 28,030 |
| Uranus low orbit | 23,620 |
| Neptune low orbit | 24,350 |
| Triton surface | 21,560 |
| Pluto surface | 21,300 |
| Charon surface | 20,700 |
