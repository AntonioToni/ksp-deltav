# Reference data and calculation assumptions

The stock pack in `src/data/stock.ts` transcribes numerical budgets from the
[Kowgan / WAC community stock Delta-V map for KSP 1.7.3](https://github.com/Kowgan/ksp_cheat_sheets/blob/ca2d4910dd98e5fd14277b04ec686e61cd6967ce/delta_v_map_vanilla/DvMap_A4.svg).
The reference is pinned to commit `ca2d4910dd98e5fd14277b04ec686e61cd6967ce`.
The original map credits the KSP community and is published under
[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/).
No source artwork or layout is bundled. This planner uses a new schematic layout;
reference figures have been reorganized into named, directed maneuver records.

The separate [CommNet relay guide](RELAYS.md) documents relay body constants,
antenna presets, coverage geometry, and deployment estimates. Relay calculations
remain separate from maneuver budgets. Stock, OPM, and RSS share their pinned physical
constants with the analytic direct-transfer model documented below.

## Coverage and units

The pack describes all 17 stock bodies: Kerbol, seven planets, and nine moons.
There are no Kerbol route states and no Jool surface state. Every other body has
surface, low orbit, and encounter states; Eve, Duna, and Jool additionally have a
high elliptical reference orbit. Its
modeled energy uses the map's rounded circularization increment, as described
under [direct transfers](#high-elliptical-endpoints).

The pack retains all **98 source-map maneuvers** and adds **66 modeled planetary
transfers** and **22 sibling-moon transfers**, for **186 directed maneuvers** over
the same 50 selectable states. Pack version `1.7.3-map.4` identifies this extension;
the source map remains the pinned KSP 1.7.3 reference.

All maneuver budgets use **m/s**. Low-orbit altitudes use **km above the body**,
following the source map labels. An encounter is the source map's intercept
reference, not an arbitrary hyperbolic orbit with any excess velocity. A low
orbit and an elliptical orbit are different states.

## Where the figures come from

Published map segments are transcribed reference budgets. The new planetary and
sibling-moon connections are calculated analytic estimates from pinned physical
and orbital constants. Landing/link allowances and the percentage reserve are
user inputs. The route total can contain all three, identified separately in
**Budget assumptions**.

For example, the Duna low orbit → Gilly low orbit figure of **1,898 m/s** is
**1,428 modeled + 60 map + 410 map**. The first component is a complete modeled
Duna departure and Eve high-orbit capture. The other two are the published
Eve-to-Gilly transfer and Gilly capture segments. Checking their arithmetic does
not make that mixed-reference itinerary an independently simulated flight.

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
  descent deliberately uses a **placeholder budget equal to the
  ascent budget** in the source dataset and default planner configuration.
  This is not a verified landing calculation or an upper bound. Optional
  atmospheric choices can replace eligible costs as described below;
  vehicle-dependent descent modeling is outside the supplied model.
- The published interplanetary branches connect to/from Kerbin. Additional
  [direct bound-orbit pairs](#direct-interplanetary-transfers) connect the other
  planets' low and supported high orbits using a separate analytic model. A route
  using the original encounter branches can still include a Kerbin parking-orbit
  layover. The search tracks
  whether a low-orbit reset at the arrival planet is required before another
  interplanetary departure, including an interplanetary direct pair; it does not
  chain incompatible encounter energies into a free flyby.
  A high elliptical state does not grant a free encounter reset. Complete direct
  pairs instead charge the departure and capture needed for their stated orbits.
- Supported [sibling-moon transfers](#direct-sibling-moon-transfers) can remain
  inside a parent system without visiting that parent's low orbit. They retain
  any pending planetary-arrival context rather than erasing it. Other supplied
  reference paths can still contain parking stops because a more direct escape
  or transfer is missing from the graph. Such a stop is not a physical necessity.
- Route selection first minimizes unrequested planet/moon parking arrivals,
  then Delta-V within that itinerary. Required parent-system passages remain
  available, as do unavoidable homeworld/reference-map or Kcalbeloh gateway
  connections. Add explicit stops to request a detour through another body.
- Add a mission margin. A selected route is a reference estimate for this
  itinerary, not a universal minimum over all possible KSP trajectories.

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

The route search optimizes the complete sequence for the selected mode. It
first minimizes parking arrivals at planets or moons outside the active
stage's intended bodies: the stage endpoints and their ancestors. It then
minimizes the summed Delta-V among routes with that preference. This keeps an
unrequested Vesta or Jupiter parking visit from winning merely because a
combination of idealized burns is numerically cheaper. It does not filter out
those bodies or make a route unreachable when the supplied reference graph
needs them. Explicit **Stops** make a deliberate detour part of the itinerary.

The state includes the current node, pending parking-orbit requirement, and next
required visit. A stop cannot erase arrival energy or turn an encounter into a
free parking-orbit reset. With the itinerary preference applied, a more expensive
stage can still give the lowest whole-mission budget once later visits and their
arrival conditions are included.
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
The underlying stock reference map has 14 directed markers: eight local
captures, four atmospheric descents, and the Mun/Minmus returns to Kerbin low
orbit. Outbound maneuvers and airless-body captures and landings have no
atmospheric-braking arrow.

A selected direct transfer to an atmospheric planet can also show an arrival
marker. Its complete departure-plus-capture estimate remains charged; the marker
does not turn either burn into a free maneuver. Unselected direct connections
and their markers stay hidden.

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
  their source costs. Complete direct planet-pair estimates also retain both
  modeled burns. A moon encounter → parent orbit `transfer` can combine
  departure and arrival costs. Its entire cost is retained because the dataset
  does not isolate a trustworthy atmospheric discount. For example, Mun and
  Minmus returns to Kerbin low orbit remain **860 and 930 m/s** respectively,
  even though their arrows indicate potential assistance.

The planner applies the selected costs to a copy of the maneuver graph **before
optimizing the whole selected mission**. It retains the same itinerary preference;
the lowest adjusted budget within that preference can differ from the powered
path. The reference comparison uses the original
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

The [validation record](VALIDATION.md) separates pinned-source comparisons,
independent arithmetic checks, and limits on physical interpretation. Open
**Budget assumptions** in the planner to see which kinds of figures contribute
to the current mission. User-entered allowances and ideal capture assumptions
take precedence over the original source label; the source remains available
as context. Atmospheric descent placeholders are identified separately.

`src/data/stock.test.ts` checks coverage, references, topology, and landmark totals.
Useful default landmarks from Kerbin surface, with atmospheric assistance off
and excluding reserves and plane changes:

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
segments. The planner sums selected directed maneuver costs rather than
substituting printed body totals. Original source-segment values remain intact.
Historical map revisions also differ (for example, the old Mun capture figure
was 310 m/s; this pinned source uses 280 m/s).

The Eeloo figure follows the original source branch at **7,480 m/s**. A previous
Delta-V-only search selected a **7,421 m/s** route through unrequested Duna low
and Jool high states. The current preference keeps that detour out of the default
itinerary; choosing those states explicitly under **Stops** requests the
separate reference estimate. The [validation record](VALIDATION.md#selected-itinerary-preference)
explains the correction.

## Direct interplanetary transfers

Stock, OPM, and supported RSS reference orbits automatically consider complete
transfers between non-home planets' low circular and supported high elliptical
orbits. Stock has **66
directed edges** among Moho, Eve, Duna, Dres, Jool, and Eeloo, including the high
states at Eve, Duna, and Jool. OPM has **226 directed edges**: Eeloo becomes a
Sarnus moon and leaves that list, while Sarnus, Urlum, Neidon, and Plock join it
with their own high states. RSS adds **52 directed edges** over eight existing
reference states: low orbit at Mercury, Venus, Mars, Vesta, Ceres, and Jupiter,
plus high orbit at Vesta and Jupiter. Kerbin and Earth retain their original
homeworld branches. No new route states are added.

Each pair is a `transfer` edge marked `directTransfer: true`. Its price includes
both departure from the first planet's stated bound orbit and powered capture
into the second planet's stated bound orbit. The solver charges
that complete edge once, including when it belongs to a multi-stop or return
journey. An explicit multi-stop route can use several pairs, with each
intermediate arrival and departure charged. Unrequested parking detours take
lower priority than the selected itinerary, even if their summed burns are
smaller. Endpoint kinds are explicit: a high-orbit arrival does not
silently include low-orbit circularization, and an encounter is not a substitute
for either bound state. Moon journeys can follow the existing branch from a
parent's high orbit without an unnecessary low capture and re-raise.

These records use source ID **`direct-interplanetary-model`**, classified as
**Analytic model** in Budget assumptions. They are computed planning estimates,
separate from the published map figures. Only selected direct connections are
drawn, and the route animation uses the same geometry and maneuver order.

### Reference data and calculation

Stock physical and semi-major-axis facts in `src/data/stockPhysics.ts` are shared
with the relay catalog. They use the pinned
[KSPTOT body reference](https://github.com/Arrowstar/ksptot/blob/9972b57398742263af12374652799db210395499/bodies.ini).
OPM uses the pinned [official 2.2.12 constants](https://github.com/Poodmund/Outer-Planets-Mod/tree/ffedf02e23d2d620e1018d1467f5e485f7950fa0/GameData/OPM/KopernicusConfigs)
from `opmReference.ts`. RSS uses the pinned
[official RSS configs](https://github.com/KSP-RO/RealSolarSystem/tree/75139b961567f4dab61af83fe162a7e52026558b/GameData/RealSolarSystem/RSSKopernicus)
through `rssPhysics.ts`. The model uses each selected node's existing parking
altitude: Stock/RSS map references where compatible with the pinned physical
facts, and the explicit OPM choices listed below. Adding these links does not
reprice the original map segments.

The pure functions in `src/utils/orbitalBudgets.ts` calculate a circular,
coplanar Hohmann reference. For planets A and B with stellar semi-major axes
`aA` and `aB`, stellar gravity `muStar`, and parking radii `rpA` and `rpB`:

```text
aTransfer = (aA + aB) / 2
vInfinityA = abs(sqrt(muStar × (2/aA - 1/aTransfer)) - sqrt(muStar / aA))
vInfinityB = abs(sqrt(muStar / aB) - sqrt(muStar × (2/aB - 1/aTransfer)))
departure = sqrt(vInfinityA² + 2muA / rpA) - sqrt(muA / rpA)
capture   = sqrt(vInfinityB² + 2muB / rpB) - sqrt(muB / rpB)
pairBudget = ceil(departure) + ceil(capture)
```

Both component burns round upward separately to whole m/s before they are
added. The nominal reverse pair swaps those components and has the same total;
it does not solve a dated return trajectory. Reserves apply afterward to the
complete mission as usual.

### High elliptical endpoints

The stellar Hohmann calculation still supplies each planet's arrival/departure
excess speed. At a spacecraft orbit's periapsis radius `rp`, the complete endpoint
burn is instead:

```text
vHyperbolic = sqrt(vInfinity² + 2mu / rp)
endpointBurn = vHyperbolic - vReferenceAtPeriapsis
```

For a low circular endpoint, `vReferenceAtPeriapsis = sqrt(mu / rp)`, reproducing
the formula above. For a high elliptical endpoint, its bound periapsis speed is
higher, so establishing that high state avoids the low circularization burn.

Stock and RSS infer the reference speed from the map's same-body low-to-high
increment:
`vReferenceAtPeriapsis = sqrt(mu / rp) + circularizationIncrement`. The Stock
increments are **1,300 m/s at Eve**, **360 at Duna**, and **2,780 at Jool**. This calibrates
the high-state energy to rounded map figures; it does not claim precise orbital
elements from the source map. The implied ellipse must be bound, with apoapsis
above periapsis and inside the nominal SOI. Approximate implied Stock apoapsis radii
are **75.23 Mm**, **26.68 Mm**, and **2,127.74 Mm** respectively.

OPM's Sarnus, Urlum, Neidon, and Plock high states already have explicit geometry:
periapsis at the selected low-orbit radius and apoapsis at **0.5 × SOI**. Their
reference speed follows vis-viva from that geometry. The endpoint burn is
calculated before rounding; subtracting two already-rounded segment costs would
introduce a possible 1 m/s error. Both endpoints still round upward separately.

For **Duna low orbit → Gilly low orbit**, the direct approach is **Duna low orbit
→ Eve high elliptical orbit → Gilly encounter → Gilly low orbit**. The estimate
is **1,428 + 60 + 410 = 1,898 m/s**. The first complete pair includes Duna
departure and Eve high-orbit capture; it does not include Eve low circularization.
The previous low-only extension offered a **3,280 m/s** Kerbin layover or a
**4,498 m/s** journey that captured low at Eve and then raised back to high orbit.

Original encounter-to-encounter arrivals still carry their pending low-orbit
requirement. That context survives a high-orbit visit, moon branch, stop, or
turnaround and prevents another interplanetary departure until the arrival
planet's low orbit is reached. A new direct pair cannot erase it. In contrast,
a complete modeled pair establishes its stated bound destination orbit, so its
high-state arrival can use the local moon branch or another fully priced direct
pair. These are distinct reference assumptions, not a solved trajectory history.

### Worked examples

| Parking-orbit pair | Rounded departure (m/s) | Rounded capture (m/s) | Complete pair (m/s) |
| --- | ---: | ---: | ---: |
| Duna 60 km → Dres 12 km | 810 | 722 | 1,532 |
| Eve 100 km → Duna 60 km | 1,669 | 1,059 | 2,728 |
| Sarnus 600 km → Urlum 350 km | 1,567 | 927 | 2,494 |

Duna low orbit → Dres low orbit previously used a **4,550 m/s** route through
Kerbin. Its new direct estimate is **1,532 m/s**. Adding the unchanged Duna ascent
and Dres powered descent gives **1,450 + 1,532 + 430 = 3,412 m/s** for the
surface-to-surface route before reserve.

### Scope and assumptions

This is a nominal circular, coplanar model of the planets' stellar orbits;
spacecraft reference endpoints can be low circular or high elliptical. It omits
planetary eccentricity, inclination,
orbital-plane orientation, departure dates, transfer-window optimization,
flight duration, gravity assists, finite-thrust losses, and vehicle performance.
The result is not a verified flight cost or a universal physical lower bound.
The original OPM encounter branches use a different nominal inclination
calculation, documented below; their figures are not silently substituted into
the new coplanar pairs.

Atmospheric assistance still adjusts only supported standalone inward captures
and descents. A direct pair retains its full departure and powered-capture
estimate, even if a braking marker indicates an opportunity at arrival.
A separate destination landing allowance can still change an eligible descent.
Atmospheric choices can change the lowest budget within the selected itinerary.
They do not make an unrequested intermediate planet the default merely because
its capture is free in the idealized model.

For example, with **Ideal capture at Duna**, Kerbin surface → Dres low orbit
remains **6,260 m/s** by default. Adding **Duna low orbit** as an explicit stop
gives a separate **6,012 m/s** estimate: **4,480 m/s** to reach that stop, then
the unchanged **1,532 m/s** direct transfer to Dres. Adding Dres powered descent
gives **6,442 m/s** to its surface for that requested detour. The stop is a paid
parking visit, not a free flyby, and its timing/orientation compatibility is
outside the reference model.

Kcalbeloh compositions inherit the selected base system's direct links. Moons
use their parent's existing reference branches; this is not a direct
moon-to-moon flyby solver. The added links do not supply Kerbol–Kcalbeloh
interstellar trajectories, new wormhole budgets, or new Kcalbeloh reference pairs.

RSS retains its Earth-centered source graph and adds complete direct pairs only
at compatible reference states. Low-orbit altitudes are **100 km at Mercury**,
**400 km at Venus**, **200 km at Mars**, **20 km at Vesta and Ceres**, and
**2,000 km at Jupiter**. Vesta and Jupiter also have supported inferred high
states. Mercury, Venus, Mars, and Ceres have low-to-high map increments that
would imply unbound high states under the pinned modern gravity constants;
those high endpoints are excluded rather than adjusting the reference figures.
Saturn, Uranus, Neptune, and Pluto lack a compatible advertised low-orbit
altitude, so their direct pairs remain outside this model. Their source-map
branches and selectable states are still available.

Complete low-to-low RSS edge examples are **Mars → Venus 7,850 m/s**,
**Mercury → Mars 16,894 m/s**, **Mars → Jupiter 21,608 m/s**, and
**Vesta → Ceres 1,102 m/s**. These are individual complete-pair prices, including
both powered endpoint burns. Explicitly selected stops can connect several
low/high reference states, charging every arrival and departure. The default
preference avoids extra parking visits at unrelated bodies; those connections
are not free gravity assists or a solved dated trajectory.

For example, **Ceres surface → Mars surface** is **8,800 m/s** by default,
rather than the **8,794 m/s** estimate through an unrequested Vesta high orbit.
Requesting that Vesta stop explicitly still produces the latter reference
estimate. Ceres surface → Mercury surface is **25,164 m/s**, and → Venus surface
**39,745 m/s**. Explicit Jupiter high-orbit stops instead give **21,280**
and **38,115 m/s** respectively. These are alternative selected itineraries,
not evidence that a Jupiter detour is a verified lower-cost flight.
The surface totals include the existing allowances; Mars and Venus powered
descents remain the documented landing placeholders.

For an RSS moon journey, **Mars low orbit → Io low orbit** can use **Jupiter
high orbit** without an Earth or Jupiter low-orbit stop. The estimate is
**4,398 + 4,540 + 6,520 = 15,458 m/s**: complete Mars-to-Jupiter-high transfer,
unchanged Io encounter increment, then unchanged Io capture/circularization.

## Direct sibling-moon transfers

Supported moons with the same physical parent receive complete low-orbit to
low-orbit transfer alternatives. Each budget combines departure from the first
moon, a transfer between the moons' orbital radii around their parent, and
capture at the second moon. It does not include a parent parking-orbit visit. The
connections use source ID **`sibling-moon-transfer-model`**, classified as
**Analytic model**, and appear on the map only when selected.

Stock adds **22 directed connections** over 11 sibling pairs; OPM has **46** over
23 pairs, including those inherited from Stock. RSS adds **76** over 38 pairs.
The selected Stock or OPM base passes these additions into its Kcalbeloh
configurations without replacing native Kcalbeloh reference pairs.

### Orbital-plane and burn model

For the inner and outer moons' semi-major axes `aInner` and `aOuter`, the
parent-centered transfer has `aTransfer = (aInner + aOuter) / 2`. The model
circularizes each moon's reference orbit at its semi-major axis. Its Hohmann
ellipse lies in the **inner moon's orbital plane**, with a favorable departure
and outer-moon encounter at opposite mutual nodes.

The pinned inclinations `i` and longitudes of ascending node `Omega` give the
relative orbital-plane angle `I`:

```text
cos(I) = cos(iInner)cos(iOuter)
       + sin(iInner)sin(iOuter)cos(OmegaInner - OmegaOuter)

vCircular = sqrt(muParent / a)
vTransfer = sqrt(muParent * (2/a - 1/aTransfer))

vInfinityInner = abs(vTransferInner - vCircularInner)
vInfinityOuter = sqrt(vTransferOuter² + vCircularOuter²
                     - 2vTransferOuter*vCircularOuter*cos(I))
```

Thus an inclined outer moon is not priced as a coplanar encounter. At each moon,
the parking radius `rp` is its physical radius plus the explicitly supplied low
orbit altitude, and the complete local burn is:

```text
moonBurn = sqrt(vInfinity² + 2muMoon/rp) - sqrt(muMoon/rp)
pairBudget = ceil(innerMoonBurn) + ceil(outerMoonBurn)
```

The two burns round upward separately. Reversing the journey uses the same
inner-plane reference and exchanges the endpoint components; it does not solve a
different return date. Surface ascent/descent and any reserve are added through
their own route segments and settings.

### Independently calculated landmarks

The following figures use the documented low parking states and include both
rounded endpoint burns, before reserve:

| Moon pair | Complete estimate (m/s) |
| --- | ---: |
| Mun → Minmus | 330 |
| Laythe → Vall | 1,176 |
| Bop → Pol | 281 |
| Hale → Ovok | 181 |
| Phobos → Deimos | 738 |
| Io → Europa | 2,547 |

For Mun → Minmus, the rounded departure is **242 m/s** and the inclination-aware
capture is **88 m/s**, giving **330 m/s**. The purely coplanar comparison would
be **329 m/s**; the implemented reference uses Minmus's 6° relative plane.
Laythe and Vall share a plane in the pinned Stock reference, giving
**798 + 378 = 1,176 m/s**. These values are calculated from the stated reference
model rather than transcribed moon-to-moon map totals.

### Eligibility and remaining gaps

Generation requires matching parent contexts, verified orbital-plane data,
distinct semi-major axes, prograde moon orbits, and explicit parking states above
the moon's atmosphere and inside its SOI. Unknown planes are not assumed zero.
Ordinary Hohmann generation excludes **Polta–Priax**, whose equal orbital radii
require a co-orbital phasing model, and **Thatmo–Nissee**, whose retrograde and
strongly eccentric geometry is outside this model's scope. Their original
reference connections remain available. A fully priced detour through another
supported body can be requested as an explicit stop; unavoidable reference
connections are not removed by the itinerary preference.

Kcalbeloh's **nine published sibling pairs** remain unchanged: six among
Anehta's moons and three around the Simetra–Simeht barycenter. They are not
replaced by this model, and the ordinary generator does not treat binary gravity
as a single physical parent. Its selected Stock or OPM base inherits that base's
supported modeled connections.

The model assumes favorable nodal phasing and circularized moon orbits. It does
not propagate eccentricity or actual phase, solve departure dates or durations,
optimize B-plane targeting or parking-plane orientation, or model gravity assists
and finite-thrust losses. It supplies a reference estimate, not a verified flight
cost or a universal lower bound.

A local sibling transfer can be used during a planetary arrival without first
visiting the parent parking orbit, but it **preserves** any pending parent
arrival context. Capturing at a second moon does not grant a free escape to
another planetary system. Cross-parent and multilevel escapes are still limited
by the supplied reference graph: Mun → Ike or Mun → Gilly can retain a Kerbin
parking stop, and a Tal journey can retain a Wal parking visit. Those are modeled
itineraries rather than statements that those visits are required in KSP.

## Outer Planets Mod pack

`src/data/opm.ts` provides the selectable **OPM** pack: 32 bodies, 96 selectable
states, and **462 directed maneuvers**, including **226 direct planet-pair** and
**46 sibling-moon estimates**.
Shared Stock IDs are retained, Eeloo becomes
a Sarnus moon, Tal orbits Wal, and Karen orbits Plock. Jool, Sarnus, Urlum, and
Neidon have no surface states. Original Stock map costs and the RSS pack are
retained.

The pack uses **config-based analytic reference estimates** for the OPM orbital
and vacuum segments. They replace the historical OPM 1.8.1 map's corresponding
figures. **Tekto and Thatmo atmospheric ascent/landing allowances remain
historical**, with their own source and limitations. The visible **Analytic
estimates** notice opens the assumptions and sources.

Pack version `2.2.12-analytic.4` identifies this model revision. Derived OPM
maneuvers use source tag `opm-analytic-2.2.12`; only the four retained atmospheric
surface edges use `kowgan-opm-1.8.1`. Complete direct pairs use the separate
`direct-interplanetary-model` source described above; sibling pairs use
`sibling-moon-transfer-model`.

### Sources and physical inputs

- Modern physical and orbital constants: [official OPM 2.2.12 Kopernicus configs](https://github.com/Poodmund/Outer-Planets-Mod/tree/ffedf02e23d2d620e1018d1467f5e485f7950fa0/GameData/OPM/KopernicusConfigs),
  pinned to `ffedf02e23d2d620e1018d1467f5e485f7950fa0`.
  `src/data/opmReference.ts` reorganizes radius, surface gravity, atmosphere
  height, semi-major axis, eccentricity, inclination, ascending-node longitude,
  and parent identity into numerical reference records. No mod config code or
  artwork is bundled.
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

The original encounter branches remain centered on Kerbin. The additional
coplanar direct pairs connect non-home planets at their low and supported high
states, with complete powered departure and capture costs. Original
encounter-to-encounter branches still require a low-parking-orbit reset before
another interplanetary departure, including a direct pair. An encounter or high
ellipse cannot erase those arrival conditions for free.

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
**Wormholes** setting matching your installation, then choose **Use** for the
base configuration. The switch stages a choice; closing the manager without
choosing Use keeps the active configuration. Stock/OPM switches retain the add-on
and wormhole setting; RSS and **Disable Kcalbeloh** return to an unextended base
pack.

| Configuration | Wormholes | Cataloged bodies/contexts | Selectable states | Priced directed maneuvers | Unpriced links |
| --- | --- | ---: | ---: | ---: | ---: |
| Stock + Kcalbeloh | On | 50 | 97 | 292 | 10 |
| OPM + Kcalbeloh | On | 65 | 143 | 568 | 10 |
| Stock + Kcalbeloh (wormholes off) | Off | 48 | 97 | 292 | 9 |
| OPM + Kcalbeloh (wormholes off) | Off | 63 | 143 | 568 | 9 |

With wormholes on, each adds **33 contexts**: the 30 physical mod bodies, the
invisible SimeSystem barycenter, and two wormholes. With wormholes off, only
the two portal bodies and their unpriced connector are omitted. All four
configurations add the same **47 states** and **106 priced directed maneuvers**.
Shared base IDs and costs are preserved; the composer clones records instead of
changing Stock or OPM. The base pack's direct-transfer estimates are inherited
alongside its reference branches. All use pack version `1.1.8-map.4`.

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
with **Wormholes enabled or disabled**. The pinned
[settings file](https://github.com/jcyuan06/Kcalbeloh-System/blob/1c61f4d3a9d72c76054855c4ee9330d3a3ee85a9/GameData/KcalbelohSystem/Kcalbeloh%20System%20Settings.cfg)
defines `Wormholes = True` / `False`; the official
[WH-3141-A](https://github.com/jcyuan06/Kcalbeloh-System/blob/1c61f4d3a9d72c76054855c4ee9330d3a3ee85a9/GameData/KcalbelohSystem/OtherFeatures/Wormholes/WH-3141-A.cfg)
and [WH-3141-B](https://github.com/jcyuan06/Kcalbeloh-System/blob/1c61f4d3a9d72c76054855c4ee9330d3a3ee85a9/GameData/KcalbelohSystem/OtherFeatures/Wormholes/WH-3141-B.cfg)
configs conditionally create the portals. Disabling them leaves the supplied
planetary reference budgets and relay physics unchanged. RSS/KSRSS rescaling,
Principia, alternative homeworlds, and other compatibility configurations remain
outside this reference. In particular, selecting wormholes off does not enable
Principia or HomeSwitch support. The pinned facts include the default stellar-size
settings, but no stellar burn is inferred from a photosphere radius.

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
selected multi-stop path may use several complete pairs, but each intermediate
parking state and both burns of every pair are charged. The default preference
avoids adding unrelated parking visits solely to reduce the numerical sum;
necessary reference states and gateways remain available.

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

Missing source budgets are descriptors, **not zero-cost graph edges**. The nine
local/reference links, plus a tenth link when wormholes are enabled, cover:

- Four stellar-reference ↔ local-planet connectors: Kcalbeloh/Rouqea,
  Maelg/Mehtna, Sunorc/Suluco, and Aralc/Anehta.
- The Simetra–Simeht reference ↔ Noira and Anehta ↔ Efil family connectors.
- The three source N.A. Arorua transfer pairs, with Anneheg, Ahtpan, and Anehta.
- When enabled, one complete wormhole connection between the base-system parent
  parking orbit and Sera low orbit.

**With wormholes disabled, Kerbol and the Kcalbeloh systems have no connecting
edge in the supplied graph.** Local maps, priced maneuvers, and the remaining
allowance controls stay available. Even pricing every remaining link cannot
create a Kerbol–Kcalbeloh route; no direct interstellar trajectory is inferred.

**When enabled, WH-3141 A orbits Jool with Stock, or Sarnus with OPM.
WH-3141 B orbits Sera.**
The configs describe a crossing altitude between 10 m and 30 km, but neither the
map nor those settings specifies a complete Delta-V budget. The composite
connection allowance must include approach, crossing, exit-velocity matching,
and arrival into the endpoint parking orbit. A plugin jump alone does not prove
fuel-free exit matching or an arbitrary compatible return trajectory.

Open **Link allowances** in the manager's **Add-ons** tab, or through the route
status when missing allowances can complete a route. Enter independent
**Forward** and **Reverse** values following the endpoint arrows under each field.
The link's directions stay fixed when mission mode changes; they do not mean the
mission's Outbound and Return legs. Each value may be **0–1,000,000 m/s**. Blank
leaves that direction unavailable; an explicit zero records the user's planning
assumption. Arorua allowances cover the whole pair, including any printed known
component, rather than only its N.A. side.

**Apply** commits the staged draft; **Cancel** or Escape discards it. Clearing
allowances clears the draft until applied. Entered costs apply before mission
search and reserve calculations. They are session settings, do not modify source
pack export, and reset on page reload or mission Clear. Compatible ID/endpoint/
maneuver-kind matches survive a pack switch. Switching Stock ↔ OPM changes the
wormhole parent, so its old composite allowance is cleared even though common
Kcalbeloh links can retain theirs. Disabling wormholes also clears that connector's
allowance. Re-enabling them leaves it blank; other compatible allowances,
endpoints, and stops are preserved.

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
and 330 directed maneuvers**: 202 original map segments, 76 modeled sibling
transfers, and 52 direct planetary transfers. Version
`community-map-dc472f5+rss-75139b9.3` identifies this shared-physics and
direct-transfer extension. No Stock KSP costs are scaled or
copied into RSS. The RSS dataset does not change the Stock or OPM packs.

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

The shared physical and orbital facts in `src/data/rssPhysics.ts` use that same
pinned configuration. Direct planetary pairs use the Sun's gravity and the
supported planets' radii, gravity, stellar semi-major axes, and existing reference
altitudes. The sibling model uses each moon's radius, gravity,
atmosphere, semi-major axis, inclination, ascending node, and stated parking
altitude. Modern physical facts do not reprice the historical map segments.

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

The original map records follow the main transfer rails. Inset/direct
moon-transfer alternatives shown elsewhere in the diagram are not transcribed;
the sibling and planetary alternatives are separately identified analytic
estimates. Route minima apply only to this combined graph, rather than every
trajectory or alternative in the source.

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

Earth remains the supplied source-map interplanetary hub. Complete direct
planetary alternatives connect the compatible states listed under
[direct transfers](#direct-interplanetary-transfers), avoiding an Earth layover
when the graph supports it. Other reference paths can still include Earth or
parent-planet parking visits because more direct trajectories are missing from
this graph; those visits are itinerary assumptions, not physical requirements
for every RSS flight. Encounter energies cannot be chained as invented free
gravity assists. Supported sibling-moon transfers remain local to their common
parent and do not need an Earth stop.

### RSS source-map regression landmarks

`src/data/rss.test.ts` checks all 102 supported states in both directions,
legacy arrival-reset policy, safe altitude metadata, pack isolation, and
independent reference sums. Direct-transfer tests separately check supported
endpoints and complete-pair arithmetic. The following are sums of the unchanged source-map branches from
Earth surface, without plane changes or atmospheric savings. The optimized full
pack can use supported modeled sibling or planetary transfers while preferring
the selected itinerary. These source sums are not a promise of identical
displayed mission totals for every ordered-stop or atmospheric configuration.

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
