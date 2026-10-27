# Stock-system reference data

The stock pack in `src/data/stock.ts` transcribes numerical budgets from the
[Kowgan / WAC community stock Delta-V map for KSP 1.7.3](https://github.com/Kowgan/ksp_cheat_sheets/blob/ca2d4910dd98e5fd14277b04ec686e61cd6967ce/delta_v_map_vanilla/DvMap_A4.svg).
The reference is pinned to commit `ca2d4910dd98e5fd14277b04ec686e61cd6967ce`.
The original map credits the KSP community and is published under
[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/).
No source artwork or layout is bundled. This planner uses a new schematic layout;
reference figures have been reorganized into named, directed maneuver records.

The separate [CommNet relay guide](RELAYS.md) documents relay body constants,
antenna presets, coverage geometry, and deployment estimates. Relay calculations
remain separate from maneuver budgets. OPM shares its pinned physical constants
with the analytic maneuver model documented below.

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
  ascent budget** in the source dataset and default planner configuration.
  This is not a verified landing calculation. Optional atmospheric choices can
  replace eligible costs as described below; vehicle-dependent descent modeling
  remains future work.
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
landing assistance; the markers alone do not change costs or calculate a trajectory.
The stock map shows 14 directed markers: eight local captures, four atmospheric
descents, and the Mun/Minmus returns to Kerbin low orbit. Outbound maneuvers and
airless-body captures and landings have no atmospheric-braking arrow.

Moon returns ending at a parent's high elliptical reference orbit remain
unmarked. Interplanetary encounter-to-encounter increments also remain unmarked;
their destination's atmospheric capture is shown on its separate inward
capture segment. Actual atmospheric assistance depends on the trajectory and
vehicle. The optional controls below change only the supported standalone
maneuvers, rather than treating every arrow as a free transfer.

## Optional atmospheric assistance

Open **Atmosphere** (**Aero** on phones) in the header to edit **Atmospheric
assistance**. Choices apply by body ID to every eligible visit, including
endpoints, ordered stops, and intermediate layovers. All choices start disabled.
The dialog stages edits:
**Apply** uses them, **Cancel** discards them, and **Disable all** clears the draft.
Swapping endpoints and changing mission mode retain body choices. Changing packs
retains compatible eligible choices, while **Clear** resets them. The choices
are session settings and do not modify or export with source data.

- **Ideal capture** sets separate same-body inward `capture` segments to zero,
  including encounter → high ellipse/low orbit and high ellipse → low orbit.
  This is an optimistic lower bound on powered burns, not a calculated entry
  trajectory. Capture cleanup burns are excluded and must be planned separately.
  A percentage reserve does not calculate them and adds nothing to a zero budget.
- **Atmospheric landing** replaces an eligible same-body low-orbit → surface
  `descent` with the powered allowance entered for that body. An enabled landing
  requires an explicit finite value from **0 to 1,000,000 m/s**; there is no
  invented default landing estimate. Zero explicitly assumes no powered landing
  burn. A higher allowance can increase the original budget.
- Atmospheric assistance requires `hasAtmosphere: true` and a supported inward
  maneuver. `supportsAtmosphericBraking: false` excludes a body, including RSS
  Pluto and Triton. Gas giants can have capture options but no landing option.
- Ascent, escape, airless-body maneuvers, and interplanetary increments retain
  their source costs. A moon encounter → parent orbit `transfer` can combine
  departure and arrival costs. Its entire cost is retained because the dataset
  does not isolate a trustworthy atmospheric discount. For example, Mun and
  Minmus returns to Kerbin low orbit remain **860 and 930 m/s** respectively,
  even though their arrows indicate potential assistance.

The planner applies the selected costs to a copy of the maneuver graph **before
optimizing the whole selected mission**. The cheapest adjusted path can differ
from the cheapest powered path. The reference comparison uses the original
powered mission estimate, and the reserve applies once to the adjusted mission
total. Map details and the breakdown use the effective maneuver costs while
retaining their original figures for comparison. Repeated visits apply the
chosen allowance each time the affected maneuver is flown.

Zero-cost capture does not reset arrival context at an encounter or high ellipse.
The route must still reach the actual low-orbit state before another
interplanetary transfer. Round trips and return-only journeys use the same
directional edges and body choices; a landing setting does not discount ascent.

For example, Stock **Kerbin surface → Duna surface** has the following budgets:

| Selected assumptions | Budget before reserve (m/s) |
| --- | ---: |
| Original powered estimate | 6,540 |
| Ideal Duna capture: remove separate 250 + 360 m/s capture segments | 5,930 |
| Also enter a Duna powered landing allowance of 100 m/s, replacing 1,450 m/s | 4,580 |

The **100 m/s** landing value is a user-selected example, not a default or a
validated Duna descent estimate. A 20% reserve on that adjusted one-way budget
gives **5,496 m/s**. With only these Duna choices enabled, the round trip is
**11,120 m/s** before reserve: 4,580 outward plus the unchanged 6,540 return,
whose Duna ascent still costs 1,450 m/s.

These controls do not simulate atmospheric entry heating, guidance, parachute
performance, lift, or vehicle-specific feasibility. They do not validate the
retained OPM atmospheric allowances or historical RSS references, or prove that
a reference orbit clears terrain in a particular installation.

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

`src/data/opm.ts` provides the selectable **OPM** pack: 32 bodies, 96 selectable
states, and 190 directed maneuvers. Shared Stock IDs are retained, Eeloo becomes
a Sarnus moon, Tal orbits Wal, and Karen orbits Plock. Jool, Sarnus, Urlum, and
Neidon have no surface states. Stock and RSS costs are unchanged.

The pack uses **config-based analytic reference estimates** for the OPM orbital
and vacuum segments. They replace the historical OPM 1.8.1 map's corresponding
figures. **Tekto and Thatmo atmospheric ascent/landing allowances remain
historical**, with their own source and limitations. The visible **Analytic
estimates** notice opens the assumptions and sources.

Pack version `2.2.12-analytic.1` identifies this model revision. Derived OPM
maneuvers use source tag `opm-analytic-2.2.12`; only the four retained atmospheric
surface edges use `kowgan-opm-1.8.1`.

### Sources and physical inputs

- Modern physical and orbital constants: [official OPM 2.2.12 Kopernicus configs](https://github.com/Poodmund/Outer-Planets-Mod/tree/ffedf02e23d2d620e1018d1467f5e485f7950fa0/GameData/OPM/KopernicusConfigs),
  pinned to `ffedf02e23d2d620e1018d1467f5e485f7950fa0`.
  `src/data/opmReference.ts` reorganizes radius, surface gravity, atmosphere
  height, semi-major axis, eccentricity, inclination, and parent identity into
  numerical reference records. No mod config code or artwork is bundled.
- Stock Kerbol/Kerbin constants, including Eeloo's inherited physical constants:
  the pinned [KSPTOT body reference](https://github.com/Arrowstar/ksptot/blob/9972b57398742263af12374652799db210395499/bodies.ini)
  documented in the [relay guide](RELAYS.md). Kerbin's reference orbit is 80 km,
  its orbital semi-major axis is 13,599,840,256 m, and its gravitational parameter
  is 3.5316 × 10¹² m³/s². Kerbol's gravitational parameter is
  1.1723327948324905 × 10¹⁸ m³/s².
- Retained atmospheric surface allowances: [Kowgan community OPM 1.8.1 map,
  page 2](https://github.com/Kowgan/ksp_cheat_sheets/blob/ca2d4910dd98e5fd14277b04ec686e61cd6967ce/delta_v_map_outer_planets/DvMap_OP_2_A4.svg),
  pinned to `ca2d4910dd98e5fd14277b04ec686e61cd6967ce`. The numerical
  reference retains its attribution and [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)
  terms; no artwork or source layout is bundled.

Use `g₀ = 9.80665 m/s²` and `mu = g₀ × geeASL × R²` for OPM configs that specify
surface gravity. Eeloo's OPM patch inherits its Stock radius and gravitational
parameter. SOI radii use `a × (mu_body / mu_parent)^(2/5)`, except the explicit
Hale **41 km** and Ovok **94 km** overrides from their configs.

### Explicit reference orbits

The following circular parking altitudes are **planner choices**, measured above
the physical radius. They are not orbit recommendations supplied by the mod.
Every reference clears the configured atmosphere and lies inside the body's
SOI; terrain, oblateness, and optional compatibility patches remain unmodeled.

| Body | Atmosphere height (km) | Parking altitude (km) |
| --- | ---: | ---: |
| Sarnus | 580 | 600 |
| Hale | 0 | 8 |
| Ovok | 0 | 10 |
| Eeloo under Sarnus | 0 | 10 |
| Slate | 0 | 25 |
| Tekto | 95 | 120 |
| Urlum | 325 | 350 |
| Polta | 0 | 15 |
| Priax | 0 | 45 |
| Wal | 0 | 35 |
| Tal | 0 | 20 |
| Neidon | 260 | 280 |
| Thatmo | 35 | 50 |
| Nissee | 0 | 10 |
| Plock | 0 | 10 |
| Karen | 0 | 10 |

This replaces the old Sarnus 314 km, Urlum 134 km, Neidon 120 km, and Thatmo
30 km references, which would lie inside the current atmospheres. The costs are
recalculated for the new parking radii rather than attaching new labels to the
old figures.

Sarnus, Urlum, Neidon, and Plock retain separate high-ellipse states. Their
**periapsis radius equals the low parking radius**, and **apoapsis radius is
0.5 × the SOI radius**, measured from the body's center. These explicit choices
keep the reference ellipse inside the SOI. They differ from the Stock map's
SOI-boundary ellipse convention.

### Nominal transfers and capture

The orbital functions in `src/utils/orbitalBudgets.ts` use SI units and return
unrounded values. Each stored maneuver is rounded **upward to a whole m/s**.
That rounding is not a mission margin or a conservative bound on real flight
costs.

The model circularizes each target's orbit at its configured semi-major axis.
A prograde Hohmann transfer departs in the parent's reference plane and meets
the target at an orbital node. With parent parameter `muP`, departure radius
`r1`, target radius `r2`, and configured target inclination `i`:

```text
v1       = sqrt(muP / r1)
v2       = sqrt(muP / r2)
v1t      = v1 × sqrt(2r2 / (r1 + r2))
v2t      = v2 × sqrt(2r1 / (r1 + r2))
departure = abs(v1t - v1)
vInfinity = sqrt(v2² + v2t² - 2v2v2t cos(i))
```

The inclination enters the **relative arrival velocity at the assumed node**.
It is not an additional generic plane-change allowance. In particular, Thatmo's
**161.1° retrograde inclination** is included instead of incorrectly subtracting
two prograde speeds. Nissee's 29.56° inclination and Plock's 6.15° inclination
also enter this nominal arrival calculation.

For a target with parameter `muB` and parking radius `rp`, the circular capture
burn, or the corresponding ideal escape estimate, is:

```text
capture = sqrt(vInfinity² + 2muB / rp) - sqrt(muB / rp)
```

Moon branches depart their parent's **low orbit**, including Tal from Wal and
Karen from Plock. Their local capture uses the relative arrival speed calculated
for that same parent-to-moon transfer. Polta and Priax have separate encounters;
their equal semi-major axes give equal parent departure burns, while their
physical properties and inclinations determine their separate captures.

For the four outer planets, `r1` is Kerbin's solar semi-major axis and `r2` the
target's solar semi-major axis. The departure excess speed is converted to a
burn from Kerbin's 80 km parking orbit. The existing Stock graph already charges
**950 m/s** to reach Kerbin encounter, so the interplanetary edge stores only:

```text
requiredKerbinBurn = sqrt(departure² + 2muKerbin / rpKerbin)
                    - sqrt(muKerbin / rpKerbin)
transferIncrement = ceil(requiredKerbinBurn) - 950
```

This avoids charging Kerbin escape twice. The target's local capture uses its
own solar-transfer arrival speed. For high-ellipse states, let `ra` be their
apoapsis radius and `ae = (rp + ra) / 2`:

```text
vHyperbolic = sqrt(vInfinity² + 2muB / rp)
vEllipse    = sqrt(muB × (2/rp - 1/ae))
vCircular   = sqrt(muB / rp)
encounter → ellipse = vHyperbolic - vEllipse
ellipse → low orbit = vEllipse - vCircular
```

These two unrounded costs sum to the full circular capture. Rounding each
segment upward may add one extra m/s compared with rounding the sum once.
Reverse directed edges reuse the corresponding nominal reversed estimates;
actual departure epochs and changing encounter geometry are not simulated.

### Surface estimates and atmospheric allowances

Airless-body surface costs use two ideal instantaneous impulses from a
**nonrotating surface** to the reference parking orbit. With body radius `R`,
parking radius `rp`, and transfer semi-major axis `as = (R + rp) / 2`:

```text
surface = sqrt(muB × (2/R - 1/as))
        + sqrt(muB / rp) - sqrt(muB × (2/rp - 1/as))
```

Powered vacuum descent reuses the ideal reversed estimate. These costs exclude
finite-thrust and gravity losses, terrain clearance, rotation, and vehicle
performance; they are not typical ascent budgets measured in game.

The four atmospheric surface edges retain separate historical allowances:

| Body | Ascent allowance (m/s) | Default powered-descent allowance (m/s) |
| --- | ---: | ---: |
| Tekto | 2,600 | 2,600 |
| Thatmo | 950 | 950 |

**These allowances are not calibrated modern atmospheric flight estimates.**
The descent figure remains an ascent-sized placeholder, without crediting
parachutes or atmospheric braking. Radius and gravity alone cannot determine
vehicle-dependent launch or landing losses. Optional atmospheric choices can
replace eligible descent costs with the user's allowance, or apply ideal
capture, as documented above.

### Worked Karen example

Karen is absent from the historical map. It now uses the same analytic model as
other airless OPM bodies. The pinned Plock/Karen configs provide radii of
189,000 / 85,050 m, `geeASL` 0.148 / 0.066, a Karen semi-major axis of
2,457,800 m, zero eccentricity/inclination, and the planner chooses 10 km parking
altitudes for both bodies.

| Segment | Unrounded (m/s) | Stored budget (m/s) |
| --- | ---: | ---: |
| Plock parking orbit → Karen encounter | 183.862 | 184 |
| Karen encounter → Karen parking orbit | 104.311 | 105 |
| Karen surface → Karen parking orbit | 247.298 | 248 |

### Scope and regression totals

These are reproducible **schematic reference estimates**, not dated trajectories
or flight-tested budgets. Eccentric orbits are circularized, including Plock's
`e = 0.26` and Nissee's `e = 0.72`. The model omits actual node/phase coincidence,
longitude of ascending node, argument of periapsis, B-plane targeting, parking
orbit plane constraints, plane-change optimization, gravity assists, terrain,
and finite-thrust effects. Chained graph states do not track orbital planes.
It does not simulate optional SigmaBinary behavior or other compatibility
patches. A mission reserve cannot supply those missing dynamics.

Interplanetary branches remain centered on Kerbin. Arrivals from another
planetary system still require a low-parking-orbit reset before another supplied
interplanetary departure; an encounter or high ellipse cannot erase arrival
conditions. This calibration does not add direct planet-to-planet transfers.

Tests audit the following Kerbin-surface one-way sums before reserves and with
atmospheric assistance disabled. Tekto and Thatmo totals include their retained
surface allowances:

| Destination | Budget (m/s) |
| --- | ---: |
| Sarnus low orbit | 7,470 |
| Hale surface | 8,395 |
| Ovok surface | 8,580 |
| Eeloo surface | 9,429 |
| Slate surface | 11,510 |
| Tekto surface | 11,927 |
| Urlum low orbit | 7,117 |
| Polta surface | 8,742 |
| Priax surface | 8,297 |
| Wal surface | 9,661 |
| Tal surface | 9,103 |
| Neidon low orbit | 7,206 |
| Thatmo surface | 9,677 |
| Nissee surface | 8,441 |
| Plock surface | 7,404 |
| Karen surface | 7,403 |

The registry in `src/data/planetPacks.ts` is the single list of selectable packs.
Adding a pack means adding its reviewed dataset and registry entry. The selector,
routing engine, and map consume the pack's metadata and supported states.

## Kcalbeloh configurations

The reviewed **Stock + Kcalbeloh** and **OPM + Kcalbeloh** configurations retain
the selected base dataset and add the same Kcalbeloh reference data. Open the
puzzle button beside the system selectors, choose **Add-ons**, and select the
configuration matching your installation. Stock/OPM switches retain the add-on;
RSS and **Disable Kcalbeloh** return to an unextended base pack.

| Configuration | Cataloged bodies/contexts | Selectable states | Priced directed maneuvers |
| --- | ---: | ---: | ---: |
| Stock + Kcalbeloh | 50 | 97 | 204 |
| OPM + Kcalbeloh | 65 | 143 | 296 |

Each adds **33 contexts**: the 30 physical mod bodies, the invisible SimeSystem
barycenter, and two wormholes. It adds **47 states**, **106 priced directed
maneuvers**, and **10 unpriced connection descriptors**. Shared base IDs and
costs are preserved; the composer clones records instead of changing Stock or
OPM. Both configurations use pack version `1.1.8-map.1`.

### Sources, attribution, and supported settings

The reference is Jason Kerman's official **Kcalbeloh System v1.1.8**, pinned to
Git commit `1c61f4d3a9d72c76054855c4ee9330d3a3ee85a9`:

- [Official Delta-V and transfer-window map](https://github.com/jcyuan06/Kcalbeloh-System/blob/1c61f4d3a9d72c76054855c4ee9330d3a3ee85a9/Kcalbeloh%20dv%20and%20Transfer%20Windows%20Map.png),
  source ID `kcalbeloh-map-1.1.8`. The map carries
  [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)
  attribution and licensing. Numerical budgets are reorganized into explicit
  named pairs; source artwork and layout are not bundled.
- [Official body configs and compatibility settings](https://github.com/jcyuan06/Kcalbeloh-System/tree/1c61f4d3a9d72c76054855c4ee9330d3a3ee85a9/GameData/KcalbelohSystem),
  source ID `kcalbeloh-config-1.1.8`. The mod's
  [license](https://github.com/jcyuan06/Kcalbeloh-System/blob/1c61f4d3a9d72c76054855c4ee9330d3a3ee85a9/GameData/KcalbelohSystem/License.md)
  is generally [CC BY-NC-ND 4.0](https://creativecommons.org/licenses/by-nc-nd/4.0/),
  with the exceptions documented there. The planner reorganizes numerical and
  hierarchy facts; no config code, textures, plugin code, or mod assets are
  included.

The supported installation is the default **1× size**, **HomeSwitch disabled**,
and **Wormholes enabled**. RSS/KSRSS rescaling, Principia, alternative homeworlds,
and other compatibility configurations are outside this reference. The pinned
facts include the default stellar-size settings, but no stellar burn is inferred
from a photosphere radius.

Kcalbeloh orbits Kerbol; Maelg, Sunorc, and Aralc-A orbit the black hole, and
Aralc-B orbits Aralc-A. Mehtna and Meiuqer are siblings around Maelg. The
Simetra–Simeht pair and Noira/Norihc/Noyreg use the invisible SimeSystem
barycenter. Stars, the black hole, barycenters, gas giants, and portals have no
landable surface states. Technical stellar atmospheres do not create braking
or landing options.

### Pair-specific budgets and reference states

The published map gives **two burns for each complete transfer pair**. The
planner stores their sum once as a directed parking/reference-to-parking/reference
maneuver, with both printed components in its assumptions. An explicit reverse
edge reuses the same nominal sum. These components are not universal per-body
encounter costs that can be freely chained.

For example, Suluco low orbit → Tot low orbit is **676 + 312 = 988 m/s**.
The source surface allowances are 2,920 m/s at Suluco and 23 m/s at Tot, so the
surface-to-surface estimate is **3,931 m/s** before reserve. A 20% reserve gives
**4,718 m/s**; the reversed nominal source route has the same base cost. A
shortest path may use several complete pairs, but each intermediate parking
state and both burns of every pair are charged.

The map's stellar/circumbinary reference states are distinct from local planet
parking orbits:

| Reference | Printed distance |
| --- | ---: |
| Kcalbeloh | 28.46 Gm |
| Maelg | 513 Mm |
| Sunorc | 5.22 Gm |
| Aralc system | 69.52 Gm |
| Simetra–Simeht combined system | 60 Mm |

They use `reference` nodes, shown as **Ref**, with the source distance in the
label. These distances are not asserted altitudes above a photosphere or solid
surface. The 60 Mm Simetra–Simeht state is a combined circumbinary reference,
not either gas giant's individual low orbit. Similar displayed distances do not
create free reference-to-planet captures.

Noi, individual Simetra/Simeht low orbits, and Aralc-B stellar parking have no
priced source states and remain catalog metadata. Arorua's published surface
allowance is available locally, while its three transfer pairs marked **N.A.**
remain unpriced. Source parking altitude claims are displayed only when they
clear the configured atmosphere; retaining a map budget does not establish a
modern physical calibration or terrain clearance.

### Unpriced links and wormhole allowances

Missing source budgets are descriptors, **not zero-cost graph edges**. The ten
unpriced links cover:

- Four stellar-reference ↔ local-planet connectors: Kcalbeloh/Rouqea,
  Maelg/Mehtna, Sunorc/Suluco, and Aralc/Anehta.
- The Simetra–Simeht reference ↔ Noira and Anehta ↔ Efil family connectors.
- The three source N.A. Arorua transfer pairs, with Anneheg, Ahtpan, and Anehta.
- One complete wormhole connection between the base-system parent parking orbit
  and Sera low orbit.

**WH-3141 A orbits Jool with Stock, or Sarnus with OPM. WH-3141 B orbits Sera.**
The configs describe a crossing altitude between 10 m and 30 km, but neither the
map nor those settings specifies a complete Delta-V budget. The composite
connection allowance must include approach, crossing, exit-velocity matching,
and arrival into the endpoint parking orbit. A plugin jump alone does not prove
fuel-free exit matching or an arbitrary compatible return trajectory.

Open **Link allowances** in the manager's **Add-ons** tab, or through the route
status when a route is unavailable in a pack with unpriced links. Enter independent **Outbound**
and **Return** values following the endpoint arrows under each field. Each value
may be **0–1,000,000 m/s**. Blank leaves that direction unavailable; an explicit
zero records the user's planning assumption. Arorua allowances cover the whole
pair, including any printed known component, rather than only its N.A. side.

**Apply** commits the staged draft; **Cancel** or Escape discards it. Clearing
allowances clears the draft until applied. Entered costs apply before mission
search and reserve calculations. They are session settings, do not modify source
pack export, and reset on page reload or mission Clear. Compatible ID/endpoint/
maneuver-kind matches survive a pack switch. Switching Stock ↔ OPM changes the
wormhole parent, so its old composite allowance is cleared even though common
Kcalbeloh links can retain theirs.

Regional **Map view** choices show Kerbol, Kcalbeloh, Maelg, Sunorc, Aralc, or
**All systems** without changing the graph used for the mission. Dashed links
remain unpriced; supplied directions become priced paths. The route-region
summary helps locate portions outside the visible view. Long built-in stages
page their maneuver breakdown instead of adding page scrolling.

### Atmospheric scope and numerical landmarks

Atmospheric surface descent reuses the map's ascent allowance as a clearly
labeled placeholder. An optional landing choice can replace the standalone
descent cost with the user's powered allowance. Bundled complete-transfer pairs
retain both printed burns: the source does not isolate an atmospheric capture
saving, so an ideal-capture option does not zero the whole pair.

The figures remain rough planning estimates. Flight dates, binary dynamics,
orientation changes, entry heating, and vehicle performance are not solved.
Reserves do not calculate omitted dynamics or price a missing link.

| Priced journey | Budget before reserve (m/s) |
| --- | ---: |
| Suluco surface → Tot surface | 3,931 |
| Sera surface → Dipuc surface | 5,505 |
| Efil surface → Eulb surface | 4,507 |
| Noira surface → Noyreg surface | 8,196 |
| Rouqea low orbit → Iomena low orbit | 26,200 |
| Sunorc reference → Aralc reference | 7,100 |

The tests also verify that unpriced links stay unreachable without explicit
allowances, composed packs leave their bases untouched, regional views retain
all supported states, and source export does not include session-entered costs.

## Real Solar System pack

`src/data/rss.ts` adds the **RSS** pack with independent `rss:` IDs and Earth as
its interplanetary transfer hub. It contains **33 bodies, 102 selectable states,
and 202 directed maneuvers**. No stock KSP costs are scaled or copied into RSS.
The RSS dataset does not change the Stock or OPM packs.

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

Original atmospheric powered-descent budgets reuse the corresponding source
ascent allowance as an explicit placeholder. They remain the default until a
supported atmospheric option is enabled. Braking markers reflect source-supported
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
