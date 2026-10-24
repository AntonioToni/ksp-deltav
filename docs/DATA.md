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
