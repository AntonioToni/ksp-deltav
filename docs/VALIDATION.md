# Validation record

Initial review: **28 October 2026**, with dated extensions below. This record
distinguishes source transcription, calculation correctness, and physical
feasibility. It does not certify flight-ready trajectories or compatibility
with arbitrary mod patches.

## Reference data checked

| Dataset | Pinned source | Comparison |
| --- | --- | --- |
| Stock maneuver map | [Kowgan / WAC KSP 1.7.3 map](https://github.com/Kowgan/ksp_cheat_sheets/blob/ca2d4910dd98e5fd14277b04ec686e61cd6967ce/delta_v_map_vanilla/DvMap_A4.svg) | All 49 source segment pairs, their supported reference altitudes, and high-ellipse moon branches. Printed grand totals are not substituted for segment sums. |
| Stock body physics | [KSPTOT constants](https://github.com/Arrowstar/ksptot/blob/9972b57398742263af12374652799db210395499/bodies.ini) | 48 radius, gravity, and atmosphere fields across 16 physical presets, with km → m and km³/s² → m³/s² conversions. |
| OPM | [Official 2.2.12 configs](https://github.com/Poodmund/Outer-Planets-Mod/tree/ffedf02e23d2d620e1018d1467f5e485f7950fa0/GameData/OPM/KopernicusConfigs) | All 16 contextual body records, including inherited Eeloo physics and nested Tal/Karen parents. Only Tekto/Thatmo surface allowances retain the [historical map](https://github.com/Kowgan/ksp_cheat_sheets/blob/ca2d4910dd98e5fd14277b04ec686e61cd6967ce/delta_v_map_outer_planets/DvMap_OP_2_A4.svg). |
| Kcalbeloh | [Official 1.1.8 configs](https://github.com/jcyuan06/Kcalbeloh-System/tree/1c61f4d3a9d72c76054855c4ee9330d3a3ee85a9/GameData/KcalbelohSystem) and [reference map](https://github.com/jcyuan06/Kcalbeloh-System/blob/1c61f4d3a9d72c76054855c4ee9330d3a3ee85a9/Kcalbeloh%20dv%20and%20Transfer%20Windows%20Map.png) | All 33 config contexts, 22 parking rows, and 33 complete transfer pairs. Two parking rows have no surface budget. All N.A. binary links remain unpriced. Both Stock and OPM compositions retain the same add-on data. |
| RSS | [Official configs](https://github.com/KSP-RO/RealSolarSystem/tree/75139b961567f4dab61af83fe162a7e52026558b/GameData/RealSolarSystem/RSSKopernicus) and [community map](https://github.com/davidson16807/mission-planner/blob/dc472f56101b260baee8814a94de985f44a6c9b2/rss-dvmap.webp) | All 32 physical presets and all implemented maneuver-map figures. Giant equatorial-radius patches and Titan's final gravity assignment were included. The initial review omitted five incompatible historical orbit-altitude labels; the separately modeled replacements are recorded below. |

The OPM/Kcalbeloh config comparison covered **49 files and 330 fields**:
radius, gravity, atmosphere, orbit, hierarchy, and explicit SOI overrides where
supplied. Independent SOI derivation also matched all 41 physical OPM/Kcalbeloh
rows. Kcalbeloh uses its default 1× configuration, HomeSwitch off, Wormholes on,
and the default stellar-size patch; Principia and rescaling are outside scope.
RSS review included its settings and plugin sources when checking SOI behavior.
The [data guide](DATA.md) and [relay guide](RELAYS.md) retain full attribution,
configuration assumptions, and model equations.

### Wormholes-disabled configuration extension

The additional Stock/OPM **Wormholes off** configurations were checked against
the same pinned Kcalbeloh 1.1.8
[settings file](https://github.com/jcyuan06/Kcalbeloh-System/blob/1c61f4d3a9d72c76054855c4ee9330d3a3ee85a9/GameData/KcalbelohSystem/Kcalbeloh%20System%20Settings.cfg)
and conditional [WH-3141-A](https://github.com/jcyuan06/Kcalbeloh-System/blob/1c61f4d3a9d72c76054855c4ee9330d3a3ee85a9/GameData/KcalbelohSystem/OtherFeatures/Wormholes/WH-3141-A.cfg)
/ [WH-3141-B](https://github.com/jcyuan06/Kcalbeloh-System/blob/1c61f4d3a9d72c76054855c4ee9330d3a3ee85a9/GameData/KcalbelohSystem/OtherFeatures/Wormholes/WH-3141-B.cfg)
creation rules. `Wormholes = False` removes the two portals. The planner omits
their catalog records, region memberships, and sole unpriced wormhole connector;
priced maneuver records, selectable states, and physical relay presets retain
their previously reviewed values.

Configuration regressions cover both bases, immutable source packs, matching
Stock/OPM setting changes, imports/exports, and retained local route totals.
With every remaining local allowance supplied, Kerbol and Kcalbeloh still have
no connecting route in the wormholes-off graph. This extension does not add
rescaling, HomeSwitch, Principia, or a new audit of their altered physics.

### Direct-transfer extension — 2 November 2026

The initial extension added complete low-parking-orbit transfers between
non-home planets: 30 directed edges in Stock and 72 in OPM. Kcalbeloh compositions
inherited their selected base's additions. No route states or original
map-segment costs were replaced. The shared Stock physical table retained the
pinned facts already used by relay presets; OPM used its existing pinned
configuration constants.

The circular, coplanar model was checked against explicit Hohmann/vis-viva
fixtures, separate departure and capture burns, component-wise ceiling, and
reversed pairs. Example complete totals are Duna → Dres **1,532 m/s**, Eve → Duna
**2,728 m/s**, and Sarnus → Urlum **2,494 m/s** at the documented parking orbits.
At that low-only revision, all 876 homeworld comparisons across Stock/OPM states,
Kerbin surface/orbit origins, and mission modes retained their **atmosphere-off**
budgets.

At that revision, atmospheric choices could reoptimize a mission through an
unrequested intermediate planet's low parking orbit; they were not covered by
that unchanged-default claim. The later selected-itinerary correction below
changes that preference. Complete direct pairs retain both modeled burns. Ordered stops and
arrival rules remain active, so added links do not create free encounter
chaining. Presentation checks cover selected-only connections, shared static
and animated geometry, reverse direction, and the optional JSON metadata.

This extension does not solve eccentric or inclined transfer geometry, dates,
travel times, parking-plane orientation, or vehicle losses. RSS retained its
historical graph at this revision; its later compatible-orbit extension is
recorded below. This is a calculation and
integration extension, not a new certification of physical flight feasibility.

### High-orbit moon-route correction

The low-only model exposed an unnecessary detour for moon journeys. Duna low
orbit → Gilly low orbit chose a **3,280 m/s** Kerbin layover, because the
alternative complete transfer captured into Eve's low orbit and then paid to
raise back to the moon branch's high orbit (**4,498 m/s**). The shortest-path
search was following its supplied costs; the missing reference-state connections
caused the detour.

At that revision, the correction extended complete pairs to existing high
elliptical states, giving **66 directed Stock pairs** and **226 in OPM**, with the
same selectable states and original reference segments. Stock high-orbit energy is inferred
from the rounded map circularization increments. Independent vis-viva checks
place the implied apoapses inside their SOIs: **75.23 Mm at Eve**, **26.68 Mm at
Duna**, and **2,127.74 Mm at Jool**. OPM high states use their explicit half-SOI
apoapses and unrounded endpoint calculations before component-wise ceiling.

The resulting Duna low orbit → Eve high orbit estimate is **1,428 m/s**, followed
by the unchanged **60 + 410 m/s** Gilly transfer/capture segments, totaling
**1,898 m/s**. Both direct endpoint burns remain priced, including powered high
capture. This extends parent-reference routes for moons; it does not solve
moon-to-moon flybys, dated geometry, or gravity assists. Low-to-low direct-pair
figures retain their previous calculations.

The guarded high-orbit extension was compared with the published low-only
revision across the same **876 atmosphere-off homeworld missions**. **332**
estimates decreased and none increased. All OPM outbound comparisons retained
their prior totals; the four changed Stock outbound comparisons end at Eeloo's
low orbit or surface. At that revision, Kerbin surface → Eeloo surface was **7,421 m/s** through
paid Duna low and Jool high reference states, compared with the original
**7,480 m/s** branch. Return-only and round-trip totals also improved under that
former Delta-V-only preference. That comparison expanded the search over the
stated models; it did not establish lower flight costs for arbitrary launch
dates. The later selected-itinerary correction below changes how unrequested
parking visits are treated.

Independent vis-viva calculations matched all **292** directed Stock/OPM
records and their reverse costs. All **102** directed low-to-low records from
the initial extension retained their costs. Another **876** comparisons with all
supported ideal captures and 100 m/s landing allowances showed **328** decreases
and no increases. Legacy encounter arrivals still require their actual low-orbit
reset before a new interplanetary departure; stopping at a high state or moon
does not erase that context. A complete modeled high-orbit arrival already pays
for its stated bound capture and can continue without a second circularization.

### Sibling-moon routes and provenance correction — 3 November 2026

The high-orbit correction still lacked direct transfers between moons sharing a
parent. Mun low orbit → Minmus low orbit consequently used a **2,220 m/s**
reference itinerary through Kerbin low orbit. Similar detours occurred in the
Jool, Sarnus, Urlum, Mars, Jupiter, Saturn, and Uranus systems. These were the
least expensive supplied graph routes, not requirements of orbital mechanics.

The sibling model prices escape and capture at the moons using a parent-centered
Hohmann reference. Its plane is the inner moon's orbital plane; the outer
encounter includes the mutual inclination derived from both inclinations and
ascending nodes. A local transfer preserves any pending parent arrival context,
including through stops and a round-trip turnaround. It does not permit a free
interplanetary departure after a moon visit.

The extension adds **22 directed Stock**, **46 OPM**, and **76 RSS** sibling
records. Independent endpoint calculations matched all **144** generated
records. A separate comparison checked **512 physical and orbital fields** across
the 16 Stock, 16 OPM, and 32 RSS contexts against the pinned source files. All
pre-existing reference-maneuver records remain unchanged: 98 in Stock, 190 in
OPM, and 202 in RSS.

Independent source-based endpoint calculations give **242 + 88 = 330 m/s** for
Mun low orbit → Minmus low orbit, and **798 + 378 = 1,176 m/s** for Laythe → Vall.
They also give **281 m/s** for Bop → Pol, **181 m/s** for Hale → Ovok,
**738 m/s** for Phobos → Deimos, and **2,547 m/s** for Io → Europa, at the
documented parking states. These are nominal model comparisons, not flight tests.

Compared with the previous revision across **1,488 atmosphere-off homeworld
missions**, the new search found **24 lower RSS estimates**, no increases, and
unchanged Stock/OPM totals. Another 1,488 comparisons with all supported ideal
captures and 100 m/s landing allowances found **64 lower RSS estimates**, no
increases, and unchanged Stock/OPM totals. These checks compare graph budgets;
they do not validate actual transfer windows or spacecraft performance.

The audit retains separate checks for published map segments, modeled endpoint
burns, route optimization, and physical interpretation. **1,898 m/s** for
Duna → Gilly remains **1,428 modeled + 60 map + 410 map**. A matching sum or a
passing shortest-path test establishes neither a continuous dated trajectory
nor an in-game flight result. The calculation sources and remaining reference
route limitations are documented in the [data guide](DATA.md#direct-sibling-moon-transfers).

Co-orbital Polta–Priax and retrograde/high-eccentricity Thatmo–Nissee are excluded
from ordinary sibling generation. Native Kcalbeloh's nine complete sibling
pairs retain their official map budgets, including its binary group. Cross-parent
and multilevel escapes may still use parking visits from the supplied graph;
the correction does not certify all possible moon trajectories.

### RSS direct planetary transfers — 3 November 2026

That revision extended the circular, coplanar complete-pair model to compatible
RSS states using the same official physical/configuration revision
`75139b961567f4dab61af83fe162a7e52026558b`. It added **52 directed planetary edges**
across six non-home planets and eight endpoints: low orbit at Mercury, Venus,
Mars, Vesta, Ceres, and Jupiter, plus high orbit at Vesta and Jupiter. The pack
retained all **102 states**, **202 original map edges**, and **76 sibling edges**,
for **330 priced maneuvers**. No local reference-map cost or altitude was changed
by that extension.

Eligibility was deliberately limited. Mercury/Venus/Mars/Ceres map low-to-high
increments imply unbound states with the pinned modern gravity, so these high
endpoints were excluded. Saturn/Uranus/Neptune/Pluto had incompatible or omitted
low-altitude references, so their direct pairs were not generated. Earth kept
its original homeworld branches. Existing map paths remained available for
unsupported pairs. The later outer-system extension below adds reviewed
reference orbits and recalculates affected orbital segments.

Independent component-wise Hohmann/vis-viva calculations give these complete
low-to-low edge totals: **Mars → Venus 7,850 m/s**, **Mercury → Mars 16,894 m/s**,
**Mars → Jupiter 21,608 m/s**, and **Vesta → Ceres 1,102 m/s**. Departure and
capture are each rounded upward before summing. These describe the individual
direct edges. The later selected-itinerary preference below avoids adding
unrequested low/high parking visits merely to lower a complete mission's sum.

The same provenance and arrival-context rules apply as for Stock/OPM. Bundled
direct pairs retain both powered burns under atmospheric assistance; separate
eligible reference segments can still affect the budget within the selected
itinerary. Ordered
stops and return journeys do not create free encounters or gravity assists.
This extension checks the stated reference model, not dated flight feasibility,
planetary inclination/eccentricity, or vehicle losses.

### Selected-itinerary preference

RSS Ceres surface → Mars surface exposed an unwanted automatic Vesta high-orbit
stop; Mercury and Venus journeys could similarly detour through Jupiter high
orbit. Every component burn was charged, but minimizing only their sum presented
an unrequested combination of reference transfers as the default. The model does
not validate timing or parking-plane compatibility between those transfers.
This did not show that the detours were physically impossible, or verify them
as lower-cost flights.

Route search now prefers the fewest unrequested planet/moon parking arrivals,
then minimizes Delta-V. Each ordered stage treats its endpoints and their
ancestor bodies as intended. Necessary parent-system passages and unavoidable
homeworld, map, or Kcalbeloh gateway paths remain available. Explicit mission
stops still request deliberate detours. That search-preference correction left
individual maneuver costs, endpoint burn formulas, reference states, and original
map figures unchanged.

Targeted RSS regressions are:

| Journey from Ceres surface | Default itinerary (m/s) | Explicit detour (m/s) |
| --- | ---: | ---: |
| Mars surface | 8,800 | 8,794 via Vesta high orbit |
| Mercury surface | 25,164 | 21,280 via Jupiter high orbit |
| Venus surface | 39,745 | 38,115 via Jupiter high orbit |

These totals retain the existing surface allowances, including Mars and Venus
powered-descent placeholders.

The Stock atmospheric example also changes: with ideal capture at Duna,
Kerbin surface → Dres low orbit stays **6,260 m/s** by default, while an explicit
Duna low-orbit stop gives **6,012 m/s**. Kerbin surface → Eeloo surface returns
to the **7,480 m/s** source branch unless the detour is deliberately requested.
Earlier change counts in this record describe the former Delta-V-only search;
they are historical comparisons, not assertions about the current preference.

The graph audit checked **81,108 distinct ordered state pairs** across all seven
built-in packs, with synthetic directional allowances for unknown Kcalbeloh
connections: **67,384 reachable** and **13,724 intentionally disconnected**
with wormholes disabled. Reachability matched the previous search in every case.
No invalid route, cumulative-budget mismatch, or legacy arrival-context violation
was found. Among ordinary low-orbit routes, unrelated modeled parking detours
fell from **46 to 0 in Stock**, **470 to 0 in OPM**, and **154 to 0 in RSS**.

A separate label-correcting solver checked **8,324 Kcalbeloh orbital pairs** and
matched both the fewest-extra-visits objective and Delta-V totals. Those checks
used synthetic **123,456 m/s directional allowances** to price otherwise unknown
connections; that value is a connectivity fixture, not a fuel reference. The
remaining gateway visits were necessary under those entered connections.
These checks validate route selection and graph consistency under the stated
model, not all-pair physical trajectory feasibility.

### RSS outer-system references and direct routes — 10 November 2026

Ceres surface → Miranda low orbit exposed a remaining coverage gap: the supplied
graph returned through Earth low orbit, giving a **22,730 m/s** map itinerary.
Uranus and the other three outer planets had no compatible advertised parking
altitudes for direct-transfer generation. That fallback was not a physical
requirement to revisit Earth. Simply removing the Earth capture/reset would
have combined incompatible encounter energies and underpriced the transfer.

The correction defines explicit planner parking altitudes of **2,500 km at
Saturn**, **2,000 km at Uranus**, **1,500 km at Neptune**, and **150 km at Pluto
and Triton**, above their pinned atmospheres. Outer high ellipses use the
selected parking periapsis and apoapsis **0.5 × SOI**. These are modeled
reference choices, not altitude claims from the historical map.

The separate `rss-outer-orbit-model` source identifies **80 recalculated
directed orbital segments**: affected Earth departure rails, local high capture
and circularization, parent-high-to-moon transfers, and moon captures. The
original **202 map edges** remain in the separate `rssReferencePack` comparison
fixture. That revision retained **122 map edges**, added **80 outer-model
edges**, **76 sibling edges**, and **228 complete planetary edges**, for
**506 maneuvers over the same 102 states**. Stock, OPM, and relay physical
constants are unchanged.

Moon encounter calculations use configured inclination at an assumed node of
the parent-centered RSS/Kopernicus reference plane. This includes Triton's
retrograde **156.834°** orbit. The parent high-to-transfer periapsis speed
difference and the moon's own powered capture are both charged. The Earth
departure increment subtracts only the separately charged **3,210 m/s** escape
component from the rounded complete Earth injection burn.

For the reported example, **Ceres surface → Miranda low orbit** became
**14,758 m/s**: **270 map ascent + 5,720 complete modeled Ceres-to-Uranus-high
transfer + 1,854 modeled moon transfer + 6,914 modeled Miranda capture**. The
route includes neither Earth nor Uranus low orbit.

Independent vis-viva and relative-velocity checks matched all **80 local
outer-model segments** and **228 directed planetary records**. Route regressions
exercised **888 origin/target/mode combinations**: eight reported origins ×
37 outer-system targets × three mission modes. A further **2,442 one-way
journeys** covered 66 bound origins outside the Earth system × the same
37 targets. These routes avoided unrequested Earth low-orbit visits. The full
unit suite passed **959 tests across 38 files**; full ESLint and the production
build also passed.

Production browser checks passed **66 cases across desktop and mobile** in the
RSS direct-transfer, RSS, and requested-itinerary suites. Manual screenshot
checks at **320 × 568**, **667 × 375**, and **2560 × 1440** showed no page
overflow, script errors, or console errors.

Pluto/Triton surface allowances remain separately identified historical
atmospheric estimates, uncalibrated for the new parking altitude. These checks
validate the stated reference model and graph accounting; they do not establish
dated nodal alignment, parking-plane compatibility between legs, ring or
atmospheric-entry clearance, or vehicle-specific flight performance. Full
reference choices and equations are in the
[data guide](DATA.md#rss-outer-system-reference-model).

### RSS inner-system high references — 10 November 2026

Mercury, Venus, Mars, and Ceres previously lacked modeled direct high endpoints:
their historical low-to-high increments imply unbound orbits under the pinned
modern gravity constants. This extension replaces those reference states with
explicit ellipses whose periapsis is the retained low-orbit radius and whose
apoapsis is **0.5 × nominal SOI**. Circular parking altitudes remain **100 km at
Mercury**, **400 km at Venus**, **200 km at Mars**, and **20 km at Ceres**.

The separate **`rss-inner-orbit-model`** source identifies **32 recalculated
directed orbital records**: four Earth-rail pairs, eight local high-capture and
circularization pairs, two Mars-high-to-moon transfer pairs, and two moon-capture
pairs. Phobos and Deimos encounter speeds use their configured inclinations at
the same nominal parent-centered `i = 0` reference plane used by the outer model.
Departure, capture, and every requested stop remain paid; no invalid high-state
speed is clamped and no free encounter flyby is introduced.

The shared `rssOrbitReferences.ts` calculation preserves the existing outer
reference geometry and orbital budgets. The original **202 map records** remain
separate for transcription checks. The active pack has **90 retained map**,
**32 inner-model**, **80 outer-model**, **76 sibling**, and **360 direct
planetary records**: **638 maneuvers over the same 102 states**. All ten
non-home planets now supply both low and high planetary endpoints.

Independent vis-viva calculations give high-to-low circularization budgets of
**1,129 / 2,837 / 1,404 / 145 m/s** at Mercury/Venus/Mars/Ceres. Complete direct
high-pair landmarks are **Mercury → Venus 5,523 m/s** and **Ceres → Uranus
5,575 m/s**. Earth low orbit → Mars high orbit is **4,304 m/s**, with the
separate **1,404 m/s** circularization producing **5,708 m/s** to Mars low orbit.
Mars high orbit → Phobos low orbit is **700 + 1,264 = 1,964 m/s**; the Deimos
counterpart is **306 + 910 = 1,216 m/s**. The explicitly requested Ceres surface
→ Earth low-orbit stage is recalculated to **9,699 m/s**, including its retained
**270 m/s** surface allowance.

The atmospheric regression keeps the default **Mars low orbit → Venus low
orbit** estimate at **7,850 m/s**. With ideal Venus capture, the selected route
uses the unchanged complete **5,014 m/s** Mars-low-to-Venus-high pair, followed
by a separate ideal **0 m/s** powered circularization. The complete pair's
departure and high capture remain charged. This checks the supported idealized
route choice, not an atmospheric entry or cleanup trajectory.

Independent component-wise calculations matched all **32 new inner-model
records** and all **360 complete planetary pairs**. Fourteen new inner-reference
tests include **216 high-reference origin/route/mode combinations**. The existing
**80 outer-model** checks and **3,330 outer-route/mode** cases continue to pass;
the **14,758 m/s Ceres surface → Miranda low-orbit** example is unchanged.
The full unit suite passed **973 tests across 39 files**, together with ESLint,
TypeScript, the production build, and diff checks.

Production browser checks validated **74 cases across desktop and mobile** in
the RSS direct-transfer, RSS, and requested-itinerary suites. SVG checks cover
painted route strokes, animated dash movement, and the static selected route
under reduced motion. Screenshots at **320 × 568**, **667 × 375**, and
**2560 × 1440** showed the new high-orbit routes and controls without page
scrolling or clipping; no browser console errors were reported.

Common planetary-model conditions are deduplicated at pack level in exported
JSON. Each maneuver still retains its component figures, endpoint definitions,
and source metadata. The formatted RSS export, including its final newline and
a renamed custom-pack ID, imports under the unchanged **1 MiB** size limit.

Surface allowances retain their source figures and low-orbit altitudes. As with
the outer extension, these are reference-model budgets, not verified dated
trajectories, optimized plane changes, parking-plane alignment, atmospheric
entry, or vehicle-specific flight estimates. Reference choices and assumptions
are in the [data guide](DATA.md#rss-inner-system-reference-model).

### RSS SOI correction

RSS relay presets used the raw Laplace SOI for two small moons. Default
Kopernicus uses `max(Laplace, 2R, R + 40,000 m)` unless a body supplies an explicit
override. The active `2R` floors give:

| Body | Previous raw SOI radius (m) | Effective SOI radius (m) |
| --- | ---: | ---: |
| Enceladus | 488,586.743 | 504,200 |
| Miranda | 459,755.119 | 471,400 |

Only these two preset SOIs changed. Explicit overrides remain intact. That SOI
correction did not recalculate RSS maneuver costs from modern physical
constants; the later orbital-reference extensions are recorded above.

### RSS CommNet configuration

The RSS radio profiles were checked against official revision
`75139b961567f4dab61af83fe162a7e52026558b`:

- [`DSN_Ranges.cfg`](https://github.com/KSP-RO/RealSolarSystem/blob/75139b961567f4dab61af83fe162a7e52026558b/GameData/RealSolarSystem/DSN_Ranges.cfg)
  multiplies configured transmitter powers by 20, including configured upgrades.
  It preserves relay flags and combining metadata. DSN powers of 5e9/5e11/5e13 m
  are applied only to an existing CustomBarnKit node; RSS itself does not require
  CustomBarnKit. The profiles therefore distinguish bare RSS from RSS + CBK.
- [`CommNetFixer.cs`](https://github.com/KSP-RO/RealSolarSystem/blob/75139b961567f4dab61af83fe162a7e52026558b/Source/CommNetFixer.cs)
  sets normal atmospheric and vacuum occlusion to 1.0 when the shipped
  `overrideCommNetParams` setting is enabled.

Independent arithmetic fixtures cover a single RSS HG-5's **100 Mm** power,
its **31.6227766 Mm** link to a Communotron 16, and its DSN level 3 ranges:
**5 Gm** with stock DSN or **70.7106781 Gm** with CBK. Four RSS HG-5 antennas
combine to **282.8427125 Mm**, preserving the stock exponent and applying the
20× catalog scaling once. Custom inputs are already-effective powers and bypass
profile scaling. Existing Stock presets and default array calls retain their
original values.

These checks validate the stated CommNet patch configuration, not other radio
overhauls or an arbitrary RSS/RO/RP-1 installation. RealAntennas and RemoteTech
remain unsupported. See the [RSS radio note](RELAYS.md#rss-radio-configuration)
for profile selection and installation assumptions.

## Calculation checks

- Ordered mission routing was compared with an independent Bellman–Ford search
  over the complete contextual state graph. Cases cover all mission modes,
  ordered/repeated stops, zero costs, unreachable routes, parking-orbit arrival
  requirements, continuous paths, and stage/mission sum agreement.
- Reserve and ceiling arithmetic was compared with exact rational calculations,
  including fractional imported costs. Published landmarks and atmospheric/user
  allowance examples were checked separately from the route-search oracle.
- OPM orbital estimates are checked against explicit vis-viva/Hohmann fixtures,
  retrograde arrival geometry, atmosphere-clearing parking orbits, separate
  capture segments, and upward whole-m/s rounding.
- Relay coverage was independently compared with densely sampled ray–circle
  visibility. Station links, vis-viva carrier energy, and resonant release phases
  agreed with the analytic model. Stock antenna powers, combining rules, and
  DSN powers were checked against the pinned references in the relay guide.
- Browser checks cover selections, keyboard/touch controls, displayed budget
  bases, and page bounds across desktop and small-screen layouts. Layout changes
  retain every state and source cost.

The repeatable routing/reserve oracle is in
[`missionAudit.test.ts`](../src/utils/missionAudit.test.ts). Pack, orbital,
relay, antenna-array, and estimate-basis tests supply complementary regression
coverage. The dense relay sampling and upstream source comparisons were part of
this audit; they are not network fetches performed by CI.

## Repeating the checks

From a Node.js 24 checkout:

```sh
npm ci
npm test
npm run lint
npm run build
npx playwright install chromium
npm run test:pages
```

To repeat a source comparison, use the pinned links above and each record's
`configPath`. Read active assignments, ignoring commented alternatives; apply
the documented radius patches and final repeated gravity assignments. Convert
lengths and gravity to SI before deriving anything. Kopernicus uses
`g0 = 9.80665` and `G = 6.67408e-11`. Keep explicit SOI overrides ahead of default
minimums. Compare map components in their printed units and sum each complete
pair once before checking routes. The test suite uses local fixtures and does
not replace an upstream comparison or launch KSP.

## Interpretation limits

Passing checks establishes the stated data transcription and mathematical
behavior within the supplied models. Map budgets can be historical or rough;
analytic reference orbits circularize eccentric systems and omit dated encounter
geometry. Neither validates vehicle losses, terrain clearance, atmospheric entry
heating/guidance, capture cleanup burns, binary dynamics, or a complete path to
the home DSN. A reserve does not calculate omitted physics. Imported figures and
personal allowances remain their authors' planning assumptions.
