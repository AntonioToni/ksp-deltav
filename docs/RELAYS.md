# CommNet relay planning

Open **Relays** in the planner's header (the satellite icon on phones) to design
a circular, equally spaced
relay constellation around a body in the active planet pack. This workspace is
separate from the Delta-V route: opening it, editing a constellation, or closing
it does not change your mission endpoints, stops, atmospheric choices, or budget.

Inputs remain available when the workspace is closed and reopened in the same
session. Changing planet packs resets the workspace; reloading the page resets
the relay inputs.

## Using the workspace

1. Choose a **Relay body**. A recognized reference preset supplies the physical
   inputs, which remain editable under **Body data**. For an unfamiliar custom
   body, enter its radius, gravitational parameter, and atmosphere height before
   planning an orbit. Supply its sphere of influence when known.
2. Under **Network**, choose the **Orbit altitude** above the body's physical
   radius and a **Relay count** from 2 to 12. Choose one relay antenna per
   satellite, a surface-client antenna, and a DSN level.
3. Inspect the equatorial coverage, neighboring links, orbital period, and maximum
   DSN range. **Rotate relays** changes the constellation's phase so you can
   inspect the sample surface station's links.
4. Under **Body data**, choose **Full radius** occlusion for conservative
   spherical geometry, or **KSP normal** for the game's normal effective
   occlusion factors. The range multiplier applies to the antenna range
   calculation.
5. Under **Deployment**, compare a lower or higher resonant carrier orbit and
   inspect its apsides, release interval, circularization burn, and clearance
   checks. **Clearance margin** is an additional user-selected distance above the
   surface or atmosphere.

Only relay-capable stock antennas are offered for the forwarding satellites:
**HG-5**, **RA-2**, **RA-15**, and **RA-100**. Direct antennas can be used for the
surface client. There is one antenna per craft in this model; mixed antennas and
antenna combinability are not calculated.

Each antenna or DSN list also offers **Custom power**. Enter the single
endpoint's CommNet power in meters, not watts. This uses the same stock range
formula with your value; it does not switch to a different radio model.

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

**DSN range** is the maximum distance allowed by the selected relay antenna and
DSN power. It does not check where the homeworld is, other bodies or the Sun
blocking the path, or whether any relay currently has a usable DSN connection.
A working local ring and a visible surface receiver do not by themselves
establish a path to mission control.

Bodies without a landable surface still support orbital relay and deployment
calculations, but have no surface coverage or surface-station result.

The radio model is **stock CommNet**, including when the selected physical body
is from RSS or another planet pack. **RealAntennas** and **RemoteTech** use
different models and are not simulated here.

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

For two antennas with powers `P1` and `P2`, the range model is:

```text
maximum range = sqrt(P1 P2) × range multiplier
```

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

**Full radius** uses `f = 1`. **KSP normal** uses `f = 0.75` for a body with an
atmosphere and `f = 0.90` for an airless body. These are effective game occlusion
settings, not changes to a planet's physical radius or atmospheric height. The
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

The catalog has **64 contextual presets**: 16 nonstellar Stock bodies, 16 OPM
rows including Eeloo's changed parent, and 32 nonstellar RSS bodies.

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
  Stock radius and gravity but uses its OPM parent and orbital radius.
- RSS physical constants: [official RSS configs](https://github.com/KSP-RO/RealSolarSystem/tree/75139b961567f4dab61af83fe162a7e52026558b/GameData/RealSolarSystem/RSSKopernicus).
  Direct atmosphere `maxAltitude` and the last direct `gravParameter`
  assignment are used, including Titan's repeated assignment. Unconditional
  giant-planet `*_Oblate.cfg` radius multipliers are applied. The relay model
  uses a sphere at that equatorial datum; terrain and oblateness are not
  simulated.
- Explicit SOI overrides for OPM Hale/Ovok and RSS Phobos/Deimos/Mimas are
  retained. Other SOIs use the relation above with the same pinned body and
  parent constants. Optional SigmaBinary and other compatibility patches are
  not modeled.
- Antenna powers, relay flags, and DSN levels: [Igaguri's CommNet calculator data](https://github.com/IgaguriMK/ksp-commnet-calculator-core/blob/2ee8d9af84f2c0bb9d4287b9d80123dfba2efd80/resources/antennas.yaml),
  pinned to `2ee8d9af84f2c0bb9d4287b9d80123dfba2efd80`. Its
  [`endpoint.rs`](https://github.com/IgaguriMK/ksp-commnet-calculator-core/blob/2ee8d9af84f2c0bb9d4287b9d80123dfba2efd80/src/endpoint.rs)
  corroborates the single-antenna range formula.
- Normal game occlusion settings: [LunaMultiplayer gameplay settings](https://github.com/LunaMultiplayer/LunaMultiplayer/blob/b3b9efce0cb6d18d5ae3723eb3aeb0b3f90eccbc/Server/Settings/Definition/GameplaySettingsDefinition.cs#L234).

Preset values are reference facts for the pinned versions. They do not calibrate
historical OPM maneuver budgets or guarantee compatibility with a different mod
release or radio overhaul.

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
