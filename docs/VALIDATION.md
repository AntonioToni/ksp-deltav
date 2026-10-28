# Validation record

Reviewed **28 October 2026** against the pinned sources below. This record
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
| RSS | [Official configs](https://github.com/KSP-RO/RealSolarSystem/tree/75139b961567f4dab61af83fe162a7e52026558b/GameData/RealSolarSystem/RSSKopernicus) and [community map](https://github.com/davidson16807/mission-planner/blob/dc472f56101b260baee8814a94de985f44a6c9b2/rss-dvmap.webp) | All 32 physical presets and all implemented maneuver-map figures. Giant equatorial-radius patches and Titan's final gravity assignment were included. Five incompatible historical orbit-altitude labels remain omitted. |

The OPM/Kcalbeloh config comparison covered **49 files and 330 fields**:
radius, gravity, atmosphere, orbit, hierarchy, and explicit SOI overrides where
supplied. Independent SOI derivation also matched all 41 physical OPM/Kcalbeloh
rows. Kcalbeloh uses its default 1× configuration, HomeSwitch off, Wormholes on,
and the default stellar-size patch; Principia and rescaling are outside scope.
RSS review included its settings and plugin sources when checking SOI behavior.
The [data guide](DATA.md) and [relay guide](RELAYS.md) retain full attribution,
configuration assumptions, and model equations.

### Correction found

RSS relay presets used the raw Laplace SOI for two small moons. Default
Kopernicus uses `max(Laplace, 2R, R + 40,000 m)` unless a body supplies an explicit
override. The active `2R` floors give:

| Body | Previous raw SOI radius (m) | Effective SOI radius (m) |
| --- | ---: | ---: |
| Enceladus | 488,586.743 | 504,200 |
| Miranda | 459,755.119 | 471,400 |

Only these two preset SOIs changed. Explicit overrides remain intact. Historical
RSS maneuver costs were not recalculated from modern physical constants. RSS
radio patches also differ from the tool's stock radio presets; the
[RSS radio note](RELAYS.md#rss-radio-configuration) explains the distinction.

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
