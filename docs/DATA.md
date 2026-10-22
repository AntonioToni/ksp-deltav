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
