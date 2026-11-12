# CommNet relay and signal planning

Open **Relays** in the planner's header (the satellite icon on phones) to design
a circular, equally spaced relay constellation around a body in the active
planet pack, or choose **Signals** for a single interplanetary link. The local
relay body selector includes physical planets and moons; stellar
primaries, barycenters, and wormholes are excluded. This workspace is separate
from the Delta-V route: opening it, editing a constellation, or closing it does
not change your mission endpoints,
stops, atmospheric choices, or budget.

Local relay and signal inputs remain available when switching sections or
closing and reopening the workspace in the same session. Changing planet packs
resets the workspace; reloading the page resets its inputs.

## Using the workspace

1. Choose a **Relay body**. A recognized reference preset supplies the physical
   inputs, which remain editable under **Body data**. For an unfamiliar custom
   body, enter its radius, gravitational parameter, and atmosphere height before
   planning an orbit. Supply its sphere of influence when known.
2. Under **Network**, choose the **Orbit altitude** above the body's physical
   radius and a **Relay count** from 2 to 12. Choose your **Radio setup**, a relay
   antenna or array, a surface-client antenna or array, and a DSN level.
3. Inspect the equatorial coverage, neighboring links, orbital period, and maximum
   DSN range. **Rotate relays** changes the constellation's phase so you can
   inspect the sample surface station's links.
4. Under **Body data**, choose **Full radius** occlusion for conservative
   spherical geometry, or the selected radio setup's normal effective occlusion
   factors. The range multiplier applies to the antenna range calculation and
   defaults to 1.
5. Under **Deployment**, compare a lower or higher resonant carrier orbit and
   inspect its apsides, release interval, circularization burn, and clearance
   checks. **Clearance margin** is an additional user-selected distance above the
   surface or atmosphere.

The automatic starting altitude is the larger of `4R/3` and the atmosphere
height plus the clearance margin plus 1 km. If that target orbit reaches the
SOI boundary, the planner uses the midpoint of the remaining valid altitude interval. Changes
to body data or clearance update an automatic target; entering an altitude
manually keeps that choice. An impossible interval remains invalid rather than
reducing your clearance margin.

Only relay-capable stock antennas are offered for the forwarding satellites:
**HG-5**, **RA-2**, **RA-15**, and **RA-100**. Direct antennas can be used for the
surface client. Its array editor also accepts relay-capable antennas, which can
serve as ordinary receiving endpoints.

Each antenna or DSN list also offers **Custom power**. Enter the single
endpoint's **effective** CommNet power in meters, not watts. For a craft with
multiple antennas, this value is already the combined craft power; the planner
does not apply another count or assume a combinability exponent for custom
parts. This uses the same stock range formula with your value; it does not
switch to a different radio model. Custom powers are final values: changing
**Radio setup** preserves them and never applies a power multiplier to them.

## Antenna arrays

Choose **Antenna array…** in the **Relay antenna** or **Surface antenna** list to
open the matching array editor. Add stock antenna models, set their counts, and
inspect their powers under the selected radio setup before choosing **Apply**.
**Cancel** or Escape
discards the draft. Reopen the same array option to edit it, or choose a single
antenna preset or **Custom power** to use that mode instead.

An array contains **1–100 antennas per craft**, with one count per selected
model. Relay arrays can use the four relay-capable models; surface-client arrays
can mix all ten stock vessel models. The same relay loadout is fitted to **each
satellite** in the ring. Antennas on separate satellites never combine. The DSN
remains a single station power, with no array count.

Applied arrays remain in the relay workspace during the same session, including
when the tool is closed and reopened. Changing planet packs or reloading the
page resets the workspace. Changing radio setup keeps the selected parts and
counts, recalculating their powers from that setup's catalog. The resulting
powers recalculate neighbor and
surface ranges, coverage, and maximum DSN range. Orbital geometry and deployment
burn estimates still depend on the orbit and physical body inputs.

Only antennas marked **combinable** contribute to the combined group. If each
selected model has power `Pi`, count `ni`, and combinability exponent `ei`, use:

```text
sumCombining = sum(ni × Pi) over combinable models
weightedExponent = sum(ni × Pi × ei) / sumCombining
combinedPower = strongestCombinable ×
                (sumCombining / strongestCombinable)^weightedExponent
effectivePower = max(strongestSingleAntenna, combinedPower)
```

`strongestCombinable` is the largest individual power rating among combinable
parts. If there are no combinable antennas, `combinedPower` is zero. The strongest
single antenna is considered across all selected models, including antennas
that do not combine. Noncombinable antennas do not enter either weighted sum.

**Communotron 16** has exponent **1.0**, so identical copies add linearly. Other
stock combinable models use **0.75**. The **internal antenna** and
**Communotron 16-S** do not combine: extra copies do not increase their power.

For example, under **Stock CommNet**, four HG-5 antennas on **each relay**, with
one Communotron 16 on the surface client, give these estimates at range
multiplier 1:

| Result | Estimate |
| --- | ---: |
| Effective power of each relay array | 14.142136 Mm |
| Identical relay-array neighbor range | 14.142136 Mm |
| Relay array ↔ single Communotron 16 range | 2.659148 Mm |
| Relay array ↔ DSN level 3 range | 1.880302 Gm |

Four Communotron 16 antennas instead have effective power **2 Mm**, while four
Communotron 16-S antennas remain at **0.5 Mm**. These are stock CommNet power
ratings and derived ranges, not signal-strength percentages.

## Interplanetary signals

Open **Relays → Signals** to compare one antenna link between vessels near two
planets. The radio model uses stock CommNet range, strength, and antenna-combining
rules with the selected Stock/RSS power profile. It does not simulate a complete
network path or place a ground station on the visible side of a planet.

1. Under **Signal geometry**, choose **Reference planets** and select **Planet A**
   and **Planet B**. The second list contains other supported planets around
   the same center. The reference geometry uses their
   pinned semi-major axes as circular radii in one plane.
2. Choose **Antenna A** and **Antenna B**, mixed arrays, or final custom effective
   powers in **Power A** and **Power B**.
   A DSN preset may represent the known homeworld endpoint in reference mode.
   It is a station-power choice, not proof of an unobstructed DSN connection.
3. Move **Relative phase**, or choose **Closest** or **Opposite**, to change the
   modeled angle. The orbit diagram and strength chart update together. These
   angles are not dates, transfer-window angles, or the planets' current positions.
4. Compare the current distance, maximum antenna range, **Signal now**, and
   circular-reference nearest/farthest range-only strengths. The
   phase chart distinguishes range attenuation from central-body blockage.
5. Choose **Signal geometry → Manual orbits** for an unknown custom pack or a
   different reference configuration. Enter **Orbit radius A** and **Orbit radius B**
   in **Gm**, and **Central radius** in **km**. Manual values are user assumptions;
   no physical orbit data is inferred from Delta-V map costs or imported body names.

**Radio setup** and the **Range multiplier** are shared with local relay
planning. Changing the radio setup preserves part identities and array counts,
then recalculates their powers from that setup's catalog. Custom powers remain
already-effective values and are never scaled again. Both direct and relay
antennas can be single-link endpoints; testing relay forwarding is a separate
problem. Arrays combine antennas on one craft, never across the two endpoints.

### Circular-reference distance and strength

Let `a` and `b` be the two circular reference radii, `theta` their relative
angle, and `PA` and `PB` the effective endpoint powers:

```text
distance² = a² + b² − 2ab cos(theta)
circular nearest distance  = abs(a − b)
circular farthest distance = a + b
maximum range R = sqrt(PA × PB) × rangeMultiplier
x = clamp(1 − distance/R, 0, 1)
range-only strength = 3x² − 2x³
```

Strength is a fraction from 0 to 1, displayed as a percentage. At the exact
antenna range it is zero; a link at that limit is marked marginal rather than
as a robust connection. The model does not use an inverse-square strength
percentage. A distance of one quarter, one half, or three quarters of maximum
range gives **84.375%**, **50%**, or **15.625%** respectively before occlusion.

The nearest/farthest cards are **circular-reference, range-only** comparisons.
Eccentricity and inclination can produce other distances in an actual
installation; these cards are not universal best/worst bounds for those
trajectories. The displayed current effective strength additionally checks the
central body's line of sight. At opposite alignment, the central body blocks
the ray, making effective strength **0%** even when the distance-only value is
positive. The charts therefore should not be read as uninterrupted coverage
over a dated orbital period.

For example, using one **RA-100 at each endpoint**, **Stock CommNet**, and range
multiplier 1, a Kerbin–Duna reference has maximum range **100 Gm**:

| Relative phase | Distance (Gm) | Range-only strength | Central-body result |
| --- | ---: | ---: | --- |
| 0° | 7.126315008 | 98.5488501% | Clear |
| 90° | 24.789698809 | 84.6109236% | Clear |
| 180° | 34.325995520 | 72.7408663% | Kerbol blocks the ray; effective strength 0% |

Both endpoint selectors initially use one RA-100 and the phase starts at **90°**.
For the Kerbin–Duna pair, the displayed values therefore round to **24.79 Gm**
and **84.61%**. Open **Signal assumptions and sources** for the selected
reference and radio-source links.

### Occlusion and reference coverage

The line-of-sight check uses the closest point on the finite segment between
the two endpoint positions. It compares that distance from the center with
`centralRadius × occlusionFactor`. Penetration blocks the link; exact limb
tangency is marginal. The default factor is **1**, using the full physical
radius. An entered factor changes the effective occluder, not the physical
orbit radii. The Signals model does not guess a normal game factor from the
planner's stellar atmosphere metadata; technical stellar atmospheres make that
classification unsuitable for this purpose.

Reference pairs cover **7 Stock**, **10 OPM**, and **11 RSS** planetary bodies.
The Stock/Kcalbeloh and OPM/Kcalbeloh configurations offer **20** and **23**
respectively. Kcalbeloh's supported local groups are Kcalbeloh (four planets),
Maelg (two), Sunorc (four), and Aralc-A (three). The catalog requires a common
supported physical center and at least two eligible planets in its group.
Moons, binary-center children, wormholes, cross-star links, and Aralc-B's
singleton group are excluded from automatic reference pairs. Custom and
rescaled configurations can use manually supplied circular geometry.

The model checks the selected central occluder only. It does not check the
endpoint planets' local horizons, spacecraft orbital positions, other planets,
companion stars, rings or accretion structures, relativistic propagation,
deployed antennas, control capability, or a complete path through relays back
to the DSN. RealAntennas and RemoteTech remain separate unsupported radio models.
These are single-link planning estimates using the stated geometry.

## What the results mean

**Equatorial coverage** is the fraction of equatorial surface longitudes from
which a receiver can see at least one relay within its antenna range. It is not
global surface coverage and does not establish coverage at the poles. The
diagram is an equatorial cross-section of a circular constellation.

**Neighbor links** describe the local relay ring. A link needs both an
unobstructed line of sight and enough antenna range. Exact limb tangency or a
distance equal to the maximum antenna range is marginal, not a robust working
link. Two opposite relays cannot see each other through the body, regardless of
how high their circular orbit is.

**DSN range** is the maximum distance allowed by the selected relay loadout and
DSN power. It does not check where the homeworld is, other bodies or the Sun
blocking the path, or whether any relay currently has a usable DSN connection.
A working local ring and a visible surface receiver do not by themselves
establish a path to mission control.

Bodies without a landable surface still support orbital relay and deployment
calculations, but have no surface coverage or surface-station result.

The radio model follows **stock CommNet** range and combining rules. **Radio
setup** supplies Stock or RSS-adjusted powers independently of the physical
body data; see [RSS radio configuration](#rss-radio-configuration).
**RealAntennas** and **RemoteTech** use different models and are not simulated
here. Custom effective powers do not reproduce their behavior.

## Geometry and radio model

Inputs to the calculation use meters, seconds, and gravitational parameter
`mu` in m³/s². The interface shows distances in suitable units; body radius,
atmosphere height, sphere of influence, and orbit altitude are entered in km.

Let `R` be the physical body radius, `h` the altitude, `r = R + h` the circular
orbit radius, `N` the relay count, and `q = fR` the effective occlusion radius.

For neighboring relays:

```text
neighbor distance = 2r sin(pi / N)
limb clearance    = r cos(pi / N) - q
orbital period    = 2pi sqrt(r³ / mu)
```

For two endpoints with effective powers `P1` and `P2`, the range model is:

```text
maximum range = sqrt(P1 P2) × range multiplier
```

The workspace's range multiplier scales the calculated distances directly.

The receiver stays on the physical radius `R`, even when the effective occluder
is smaller. Its line-of-sight half-angle is therefore:

```text
LOS half-angle = acos(q / r) + acos(q / R)
```

For surface-client range `L`, the range half-angle follows the cosine law:

```text
range half-angle = acos((r² + R² - L²) / (2rR))
```

There is no surface contact when the antenna range cannot reach the orbit's
altitude. The calculation bounds the cosine-law argument to its geometric
domain and uses the smaller LOS or range half-angle, `theta`:

```text
equatorial coverage fraction = min(1, N theta / pi)
```

The range and limb boundary checks remain separate from the coverage percentage:
a percentage rounding to 100% is not proof of a robust link at the boundary.

**Full radius**, the default, uses `f = 1`. With **Stock CommNet**, **KSP normal**
uses `f = 0.75` for a body with an atmosphere and `f = 0.90` for an airless body.
Both RSS radio setups use normal defaults of `f = 1` for either body type.
These are effective game occlusion settings, not changes to a planet's physical
radius or atmospheric height. The
diagram distinguishes the effective occluder when it differs from the body.

## Resonant deployment

The target constellation's circular orbit is the reference for the deployment
burns. A lower carrier returns to the release point sooner than the circular
relays; a higher carrier returns later. For target period `T`:

```text
lower carrier period = T (N - 1) / N
higher carrier period = T (N + 1) / N
carrier semi-major axis a = r (carrier period / T)^(2/3)
other apsis radius = 2a - r
```

The release point is the lower carrier's apoapsis or the higher carrier's
periapsis, both at radius `r`. The ideal speed change between the carrier orbit
and the target circular orbit is:

```text
circular speed = sqrt(mu / r)
carrier speed at release = sqrt(mu (2/r - 1/a))
burn magnitude = abs(circular speed - carrier speed at release)
```

The carrier injection and each relay's circularization use this magnitude in
opposite directions. A lower carrier injection is retrograde and relay
circularization is prograde; the higher-carrier directions are reversed.

Release one relay per carrier orbit at the same release point. With the first
release at time zero, the interval is one carrier period and the elapsed time
to release the last of `N` relays is `(N - 1) × carrier period`.

These are ideal instantaneous, two-body burn estimates. Launch, transfer to the
target body, arrival into the reference orbit, finite-thrust losses, and vehicle
performance are not calculated here. Deployment burns are **not automatically
added to the Delta-V mission budget**.

## Orbital bounds

The target circular orbit must clear the physical surface, atmosphere, and
chosen clearance margin. Where a sphere of influence is supplied, the orbit
must also stay inside it.

Deployment checks use the carrier's periapsis and apoapsis, not the effective
CommNet occlusion radius. A lower carrier can enter the atmosphere even when
the relay ring itself has clear communication links. A higher carrier can
leave the body's sphere of influence. An unknown sphere of influence leaves
that bound unchecked; a clear result is not a certification of flight safety.

The model does not calculate terrain heights, oblateness, orbital perturbations,
station latitude, inclination, station-keeping, drift, or additional occluding
bodies. The clearance margin is a planning input, not a terrain model.

## Worked Kerbin example

Choose Kerbin, **800 km** altitude, **3 relays**, **HG-5** relay antennas,
**Communotron 16** for the surface client, **DSN level 3**, range multiplier 1,
and **Full radius** occlusion. The reference inputs are `R = 600,000 m`,
`mu = 3.5316e12 m³/s²`, and a 70 km atmosphere.

| Result | Estimate |
| --- | ---: |
| Neighbor distance | 2,424.871 km |
| Neighbor limb clearance | 100 km |
| Orbital period | 5,538.424 s |
| HG-5 ↔ Communotron 16 maximum range | 1,581.139 km |
| Equatorial coverage | 100% |
| HG-5 ↔ DSN level 3 maximum range | 1.118034 Gm |
| Lower carrier periapsis altitude | 136.800 km |
| Lower carrier period | 3,692.282 s |
| Relay circularization from lower carrier | 269.307 m/s |
| Higher carrier apoapsis altitude | 1,391.958 km |
| Higher carrier period | 7,384.565 s |
| Relay circularization from higher carrier | 133.020 m/s |

At **600 km**, the three-relay ring is exactly limb-tangent in Full radius mode,
and its lower carrier reaches only about **31.5 km** above Kerbin, inside the
atmosphere. Increasing antenna power does not fix either geometric constraint.

## Sources and body presets

Physical presets are separate from Delta-V map costs. Matching uses the body ID
and parent context: Eeloo's sphere of influence differs between Stock and OPM.
Known values remain editable; custom bodies without a matching preset require
their own physical inputs. No radius or gravity is inferred from a maneuver
budget or silently substituted from Kerbin.

The catalog has **89 contextual presets**: 16 nonstellar Stock bodies, 16 OPM
rows including Eeloo's changed parent, 32 nonstellar RSS bodies, and all 25
Kcalbeloh planets and moons. Kcalbeloh presets work in both **Stock + Kcalbeloh**
and **OPM + Kcalbeloh**, with wormholes on or off. They include Noi and individual
Simetra/Simeht body data, even though those bodies lack separate priced Delta-V
map states. Stars, the black hole, the SimeSystem barycenter, and wormholes are
not relay targets.

Kcalbeloh inputs come from the pinned default-size **1.1.8** configs, separately
from the Delta-V map. Radius, gravity, atmosphere, and SOI load automatically;
all remain editable, and **Restore preset** restores the reference. These values
cover the standard 1× installation with HomeSwitch and Principia disabled.
The wormhole setting removes portal bodies and the interstellar map connector;
it does not change these physical planet/moon presets. Rescaling, alternate
homeworlds, or other physics patches may require edits.

- Stock body constants: [KSPTOT `bodies.ini`](https://github.com/Arrowstar/ksptot/blob/9972b57398742263af12374652799db210395499/bodies.ini),
  pinned to `9972b57398742263af12374652799db210395499`. The source lists radius
  and atmospheric height in km and gravitational parameter in km³/s²; these
  are converted to SI units. Where derived, the sphere-of-influence estimate
  uses `a × (mu_body / mu_parent)^(2/5)` from the pinned orbital constants.
  The reference project's [license is CC BY-NC-ND 3.0](https://github.com/Arrowstar/ksptot/blob/9972b57398742263af12374652799db210395499/KSPTOT_License.txt).
  The catalog reorganizes numerical reference facts; no source config code,
  artwork, textures, or layout is bundled with the application's MIT code.
- OPM physical constants: [official Kopernicus configs](https://github.com/Poodmund/Outer-Planets-Mod/tree/ffedf02e23d2d620e1018d1467f5e485f7950fa0/GameData/OPM/KopernicusConfigs).
  Radius, `geeASL`, and atmosphere `altitude` are taken from the pinned version.
  The catalog derives `mu = 9.80665 × geeASL × R²` in SI units. Eeloo retains
  Stock radius and gravity but uses its OPM parent and orbital radius. The
  constants are shared with the OPM maneuver estimates in `opmReference.ts`;
  editing relay inputs does not change those maneuver budgets.
- RSS physical constants: [official RSS configs](https://github.com/KSP-RO/RealSolarSystem/tree/75139b961567f4dab61af83fe162a7e52026558b/GameData/RealSolarSystem/RSSKopernicus).
  Direct atmosphere `maxAltitude` and the last direct `gravParameter`
  assignment are used, including Titan's repeated assignment. Unconditional
  giant-planet `*_Oblate.cfg` radius multipliers are applied. The relay model
  uses a sphere at that equatorial datum; terrain and oblateness are not
  simulated.
- Explicit SOI overrides for OPM Hale/Ovok and RSS Phobos/Deimos/Mimas are
  retained. Other RSS SOIs follow the default Kopernicus relation with minimums:
  `max(a × (mu_body / mu_parent)^(2/5), 2R, R + 40,000 m)`. This gives an effective
  SOI radius of **504.2 km** for Enceladus and **471.4 km** for Miranda. Raw Laplace
  values of about 488.587 and 459.755 km would omit the active `2R` floor.
  The remaining OPM Laplace values already exceed these minimums; explicit
  overrides take priority. Optional SigmaBinary and other compatibility patches
  are not modeled.
- Kcalbeloh physical constants: [official v1.1.8 configs](https://github.com/jcyuan06/Kcalbeloh-System/tree/1c61f4d3a9d72c76054855c4ee9330d3a3ee85a9/GameData/KcalbelohSystem),
  pinned to `1c61f4d3a9d72c76054855c4ee9330d3a3ee85a9`. The physical table shares
  radius, atmosphere height, semi-major axis, and hierarchy facts with the pack;
  it reads each configured gravity property separately. Stellar and barycenter
  masses are used only to derive their children's SOIs.
- Kcalbeloh gravity conversions follow [Kopernicus `PropertiesLoader`](https://github.com/Kopernicus/Kopernicus/blob/c19a16e901ead27ff8f82ae2730a61c22980ed2d/src/Kopernicus/Configuration/PropertiesLoader.cs#L559):
  `mu = 9.80665 × geeASL × R²`, or `mu = 6.67408e-11 × mass` when mass is supplied.
  These are the game's conversion constants. Configured gravitational parameters
  are already in m³/s².
- Kcalbeloh's explicit SOIs for Onrefni, Rouqea, Iomena, Simetra, and Simeht take
  priority. Other values follow the normal [Kopernicus SOI calculation](https://github.com/Kopernicus/Kopernicus/blob/c19a16e901ead27ff8f82ae2730a61c22980ed2d/src/Kopernicus/Configuration/OrbitLoader.cs#L392)
  and [default minimums](https://github.com/Kopernicus/Kopernicus/blob/c19a16e901ead27ff8f82ae2730a61c22980ed2d/src/Kopernicus/Templates.cs#L59):
  `max(a × (mu_body / mu_parent)^(2/5), 2R, R + 40,000 m)`.
  This gives **43.25 km** for Tot and **58 km** for Enots, rather than their smaller
  raw Laplace estimates. SOIs are radii measured from the body center.
- Antenna powers, relay flags, and DSN levels: [Igaguri's CommNet calculator data](https://github.com/IgaguriMK/ksp-commnet-calculator-core/blob/2ee8d9af84f2c0bb9d4287b9d80123dfba2efd80/resources/antennas.yaml),
  pinned to `2ee8d9af84f2c0bb9d4287b9d80123dfba2efd80`. Its
  [`endpoint.rs`](https://github.com/IgaguriMK/ksp-commnet-calculator-core/blob/2ee8d9af84f2c0bb9d4287b9d80123dfba2efd80/src/endpoint.rs)
  corroborates the endpoint range and signal-strength formulas. The antenna
  metadata supplies the combinability flags and Communotron 16 exponent exception.
- Antenna combination semantics: [Kerbalism's stock CommNet adapter](https://github.com/Kerbalism/Kerbalism4/blob/bc3d7ccbbe5f4b20455b3de7d25b6e9812f8672f/src/Kerbalism/Comms/CommHandlerEditorCommNet.cs),
  pinned to `bc3d7ccbbe5f4b20455b3de7d25b6e9812f8672f`. This corroborates
  combining only eligible antennas with a power-weighted exponent, then
  comparing the result with the strongest standalone antenna. The planner
  implements the formula independently; it does not simulate Kerbalism's other
  communication systems.
- Normal game occlusion settings: [LunaMultiplayer gameplay settings](https://github.com/LunaMultiplayer/LunaMultiplayer/blob/b3b9efce0cb6d18d5ae3723eb3aeb0b3f90eccbc/Server/Settings/Definition/GameplaySettingsDefinition.cs#L234).

For example, Suluco's preset is radius **520 km**, `mu = 2.253960436e12 m³/s²`,
atmosphere height **65 km**, and SOI radius approximately **31,359.322 km**.
A **700 km** circular orbit has an ideal period of about **5,639.576 s**
(**1 h 34 min 0 s** when displayed). The local relay model treats binary-system
bodies as individual spheres; other bodies' occlusion and perturbations are not
calculated there. The separate Signals section checks one common-center
interplanetary reference link with the limits described above.

Preset values are reference facts for the pinned versions. Relay coverage and
deployment calculations remain separate from the OPM analytic maneuver model
described in the [data guide](DATA.md). These presets do not guarantee
compatibility with a different mod release or radio overhaul.

### RSS radio configuration

The built-in RSS map defaults to **RSS CommNet (without CBK)**. Other maps,
including custom imports, default to **Stock CommNet**. The **Radio setup**
selector is independent of the body: changing bodies within the active pack
keeps your radio setup, while changing packs resets the relay workspace.

| Radio setup | Vessel antenna powers | DSN levels 1 / 2 / 3 | Normal occlusion |
| --- | --- | --- | --- |
| Stock CommNet | Stock | 2e9 / 5e10 / 2.5e11 m | 0.75 atmospheric / 0.90 vacuum |
| RSS CommNet (without CBK) | 20× stock | Stock | 1.0 for either body type |
| RSS + CustomBarnKit | 20× stock | 5e9 / 5e11 / 5e13 m | 1.0 for either body type |

These profiles follow RSS revision `75139b961567f4dab61af83fe162a7e52026558b`. Its
[`DSN_Ranges.cfg`](https://github.com/KSP-RO/RealSolarSystem/blob/75139b961567f4dab61af83fe162a7e52026558b/GameData/RealSolarSystem/DSN_Ranges.cfg)
multiplies transmitter powers by 20 and, when a CustomBarnKit configuration node
is present, supplies the stronger DSN powers. RSS itself does not require
CustomBarnKit, so the planner exposes that choice explicitly. The patch keeps
stock antenna names, relay flags, and combining rules. Its
[`CommNetFixer`](https://github.com/KSP-RO/RealSolarSystem/blob/75139b961567f4dab61af83fe162a7e52026558b/Source/CommNetFixer.cs)
sets normal occlusion defaults to 1.0 with the shipped `overrideCommNetParams`
setting enabled.

For example, a single RSS HG-5 has power **100 Mm** and a Communotron 16
**10 Mm**. Their maximum surface link range is **31.622777 Mm** at range
multiplier 1. The HG-5's maximum DSN level 3 range is **5 Gm** without CBK or
**70.710678 Gm** with the conditional CBK patch. Four HG-5s on one RSS craft
combine to **282.842712 Mm**, exactly 20 times the stock array power. Catalog
powers are already scaled; the array calculation does not multiply them again.

Choose **Custom power** when you know your installation's final effective craft
or station power. These values are preserved without profile scaling. Keep the
range multiplier matched to your game settings; a multiplier of 20 is not an
equivalent substitute for RSS's separate antenna and DSN changes.

RealAntennas and RemoteTech use different models and remain unsupported. An RSS,
RO, or RP-1 installation using either radio overhaul should not use these
CommNet profiles as a simulation of that overhaul. See the
[validation record](VALIDATION.md) for the source audit and calculation checks.

### Retained MIT notice for the antenna reference

Copyright 2019 Igaguri

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
