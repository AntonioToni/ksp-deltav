# CommNet relay and signal planning

Open **Relays** in the planner's header (the satellite icon on phones) to plan
equally spaced satellites in a circular orbit above a planet's or moon's equator.
Choose **Signals** to check one link between craft near two planets. Neither tool
checks a complete route through relays back to mission control.

The local **Relay body** list includes planets and moons, rather than stars,
shared centers of mass, or wormholes. This workspace is separate from the
Delta-V route: opening it, editing the relay setup, or closing it keeps your
mission endpoints, stops, atmospheric choices, and budget.

Local relay and signal inputs remain available when switching sections or
closing and reopening the workspace in the same session. Changing planet packs
resets these inputs; reloading the page resets them too.

## Basic and Advanced views

On first use, the workspace opens in **Basic** mode. Choose **Advanced** for
body edits, antenna arrays, custom powers, local DSN settings, manual signal
geometry, and radio calibration controls. The mode applies across Network,
Deployment, Body data, and Signals. Your browser remembers this view preference when storage is
available; it does not save the calculation inputs across a reload.

Both views use the same inputs and calculations. Switching views keeps your
configuration, including settings hidden in Basic. An active custom setup shows
a notice with **View settings** to reveal its Advanced controls. Invalid hidden
settings also provide a way to open Advanced and correct them.

Basic shows **Body data** as a read-only reference. Choose
**Edit in Advanced mode** to change its values or supply missing custom-body
data. The sections below identify controls that need Advanced; changing the
view never restores defaults or changes a calculation by itself.

## Using the workspace

1. Choose a **Relay body**. A recognized reference preset supplies the physical
   inputs shown under **Body data**. For an unfamiliar custom body, choose
   **Edit in Advanced mode** and enter its radius, gravitational parameter (GM,
   for calculating orbits), and atmosphere height. Supply its sphere of
   influence—the radius of KSP's gravity region around that body—when known.
   **Body field guide** explains these fields and their units.
2. Under **Network**, choose the **Orbit altitude** above the surface and
   a **Relay count** from 2 to 12. Choose your **Radio setup**, a relay antenna,
   and a surface-client antenna. Advanced adds antenna arrays, custom powers,
   and the DSN level.
3. Inspect equatorial coverage, neighboring links, their signal strength, the
   strongest link from the sample point on the equator, and orbital period.
   Advanced also shows **Maximum relay-to-DSN range**. DSN means KSP's
   ground-station network; that range does not check an actual connection home.
   **Rotate relays** moves the satellites around their orbit so you can inspect
   links from the sample point.
   Signal strength is raw CommNet strength with every profile. Kerbalism profiles
   separately show **Transmission efficiency** and estimated science rates
   for those individual links. See
   [Kerbalism science rates](#kerbalism-science-rates).
4. In Advanced, **Body data → Occlusion** chooses how much of the body blocks
   signals. **Full radius** uses its full size; the other option uses the radio
   setup's Normal game settings. **Range multiplier** scales maximum antenna
   link distances: 1 keeps them unchanged, and 2 doubles them.
5. Under **Deployment**, compare lower and higher orbits for the carrier—the ship
   releasing the relays. Its dedicated diagram shows the target circle and
   carrier ellipse. Inspect its lowest and highest altitudes, time between
   releases, and the burns to place each relay in the target circular orbit.
   **Target orbit altitude** edits the same circular relay orbit as Network.
   Advanced's **Clearance margin** adds your chosen height above the surface or
   atmosphere.
   **Deployment field guide** explains the terms on the result cards.

The automatic starting altitude is the larger of `4R/3` (where `R` is the body
radius) and the atmosphere height plus the clearance margin plus 1 km. If that
target orbit reaches the sphere-of-influence boundary, the planner uses the
midpoint of the remaining valid altitude interval. Changes to body data or clearance update an automatic target; entering an altitude
manually keeps that choice. An impossible interval remains invalid rather than
reducing your clearance margin.

Only relay-capable stock antennas are offered for the forwarding satellites:
**HG-5**, **RA-2**, **RA-15**, and **RA-100**. Direct antennas can be used for the
surface client. Its array editor also accepts relay-capable antennas, which can
be used as antennas on that surface craft.

In Advanced, each antenna or DSN list also offers **Custom power**. Enter the
single craft's or station's final CommNet power rating in meters, not watts.
This is KSP's range rating, rather than electrical consumption or the actual link
distance. For a craft with multiple antennas, this value is already the combined craft power; the planner
does not apply another count or assume a combinability exponent for custom
parts. This uses the same stock range formula with your value; it does not
switch to a different radio model. Custom powers are final values: changing
**Radio setup** preserves them and never applies a power multiplier to them.
With Kerbalism selected, custom craft power also needs a full-strength science
rate in B/s before antenna speed and damping. Blank means unknown; signal
and coverage calculations remain available.

## Antenna arrays

In Advanced, choose **Antenna array…** in the **Relay antenna** or
**Surface antenna** list to open the matching array editor. Add models from the
selected radio catalog, set their counts, and inspect their powers before
choosing **Apply**.
**Cancel** or Escape
discards the draft. Reopen the same array option to edit it, or choose a single
antenna preset or **Custom power** to use that mode instead.

An array contains **1–100 antennas per craft**, with one count per selected
model. Relay arrays can use the four relay-capable models; surface-client arrays
can mix all ten stock vessel models, plus Communotron 8 with a Kerbalism profile.
The same relay loadout is fitted to **each satellite** in the ring. Antennas on
separate satellites never combine. The DSN remains a single station power, with
no array count.

Applied arrays remain in the relay workspace during the same session, including
when the tool is closed and reopened. Changing planet packs or reloading the
page resets the relay configuration. Changing radio setup keeps the selected parts and
counts, recalculating compatible parts from that setup's catalog. An unavailable
part stays selected and prevents a result until you edit the loadout or restore
its radio setup. The resulting powers recalculate neighbor and surface ranges,
coverage, and maximum DSN range. Orbital geometry and deployment burns still
depend on the orbit and physical body inputs.

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

**Communotron 16** has exponent **1.0**, so identical copies add their power. Other
stock combinable models use **0.75**, so each extra identical copy adds less
power than the previous one. The **internal antenna** and
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

Open **Relays → Signals** to compare one direct communication link between
spacecraft near two selected planets or moons. **Actual orbits** is the default:
where verified elements are available, the planner uses eccentric, inclined
Keplerian orbits and three-dimensional positions. It does not read a save file
or calculate a complete relay path back to mission control.

1. Choose **Planet A**, **Planet B**, and their antennas. The selectors retain
   the bodies' names, such as **Kerbin antenna**. Moons and bodies with different
   parents can be compared when their connecting hierarchy has known orbital
   data. Wormholes do not carry radio signals between systems.
2. Choose **Signal receiver**. B receives by default; the other endpoint sends.
   A receiving spacecraft needs a relay-capable antenna. Only relay antennas
   contribute to a mixed receiver array, while direct and relay antennas can
   contribute to the sending craft's power. A DSN preset can represent the
   homeworld's ground stations and selects that endpoint as receiver.
3. Use **Relative phase** for a quick exploration, or select **In-game date** to
   propagate both bodies to a game time. These controls are available in Basic
   and Advanced. Switching modes keeps the selected hardware and radio settings.
4. Read **Separation at selected positions**, **Signal strength**, maximum range,
   and link status. Signal strength is always raw CommNet strength. With
   Kerbalism, the signal card separately shows **Transmission efficiency**, and
   the science card estimates the selected sender's transmission rate.
5. Use **Closest** and **Farthest** to navigate to the closest and farthest
   positions found in the displayed sweep or time interval. On eccentric or
   inclined orbits, these need not occur at 0° and 180°.
6. In Advanced, inspect **Signal geometry**, adjust the reference position or
   orbital elements, or enter a **Manual link distance** for an exact
   distance-based comparison with an in-game measurement.

Radio setup, damping, antenna speed, minimum science rate, range multiplier,
and the PBC DSN modifier retain their existing shared behavior with Network.
Arrays combine antennas fitted to one craft, never between endpoints. Final
custom powers are used as entered. Unavailable parts remain selected with an
action to restore a compatible radio profile or edit their loadout. Basic keeps
Advanced settings active and offers **View settings** when they affect the
result; switching views does not reset them.

### Relative phase: a selected configuration

An angle alone cannot identify two positions on eccentric orbits. The planner
therefore holds A at a deterministic reference position, initially its
**periapsis** (true anomaly 0°), and sweeps B around its own orbit. The slider is
the difference between their true anomalies, each measured from that body's
own periapsis:

```text
true anomaly A = reference position A
true anomaly B = reference position A + relative phase, wrapped to 0–360°
```

The orbit orientations and inclinations are retained. The slider is not the
angle between the two sky directions, a transfer-window phase angle, or an
in-game date. Advanced lets you adjust A's reference position. When a hierarchy
contains intermediate parents, their positions are held at the reference UT
while the selected endpoint orbits are explored. This is one chosen orbital
configuration, not a prediction that all its positions occur simultaneously.

The graph's horizontal axis spans the selected 0–360° sweep. Its current-position
marker follows the slider. Changing A's reference position changes the sweep
and its closest/farthest estimates.

### In-game date

Choose **In-game date**, then enter **Year**, **Day**, and time. The planner
converts them to universal game time (UT, seconds), advances mean anomaly from
each body's source epoch, solves Kepler's equation, and places both bodies in a
common three-dimensional frame. Parent positions are added through the actual
hierarchy; a moon is not treated as a planet directly orbiting the Sun.

- The Kerbin calendar uses **6-hour days and 426-day years**. Year 1, Day 1,
  00:00:00 is UT 0.
- RSS uses the official formatter's **Gregorian calendar**, **24-hour days**,
  and **1951-01-01** start. Year 1951, Day 1, 00:00:00 is UT 0; leap years have
  366 days. Seconds follow the continuous game clock, without UTC leap-second
  adjustments.
- Advanced exposes UT for precise comparisons. If another time formatter,
  calendar, or epoch is installed, use the actual UT rather than assuming its
  displayed year/day matches these conventions.

The date graph covers approximately one synodic period where it can be defined.
Otherwise it uses an explicitly labelled orbital-period or fixed time window.
The caption states the displayed interval; the selected date is marked on the
curve. The endpoints of this window are not universal limits on all future
planetary alignments.

Very long windows are capped at 16 periods of the shortest relevant endpoint
or ancestor orbit; the graph caption identifies the shorter window. Dense
occultations in some moon-heavy systems can still exceed the finite sampling
budget. In that case the planner explicitly withholds the graph rather than
drawing a falsely clear link. The selected-position result remains available;
Relative phase offers a separate exploratory sweep.

### Geometry choices and missing data

Advanced **Signal geometry** offers:

- **Actual orbits**: source-backed orbital elements and hierarchy, with
  optional parameter/reference-position overrides.
- **Circular reference orbits**: the previous approximation, using semi-major
  axes as constant radii in one plane, checking only the shared central body
  for blocking. Its circular examples below remain useful
  regression references; they are not the default eccentric-orbit results.
- **Manual link distance**: enter an exact separation to calculate raw signal,
  maximum range, Kerbalism efficiency, and science rate. A distance alone cannot
  determine blocking or orbital positions, so this mode does not draw an orbit
  diagram or position graph and does not claim that the path is clear.
- **Manual orbits**: the retained circular-radius setup for custom geometry.
  Enter **Orbit radius A** and **Orbit radius B** in Gm and **Central radius** in
  km, measured from one shared center rather than from the surface.

Unknown orbital facts are not replaced with guessed angles or epochs. A
supported phase configuration can use known orbit shapes without claiming a
date. Where actual shape data are incomplete but reference radii are known,
the planner identifies its circular fallback. Dated positions require complete
mean-anomaly/epoch/period information for the necessary hierarchy; missing
information produces an explanation and an Advanced correction path. Imported
pack names or familiar-looking body IDs do not establish verified ephemerides.
Manual distance remains available when orbital geometry is unknown.

### Signal strength and the retained circular reference

All geometry modes use the same antenna, CommNet, and Kerbalism calculations.
For effective sender/receiver powers `PA` and `PB`:

```text
maximum range R = sqrt(PA × PB) × rangeMultiplier
x = clamp(1 − separation/R, 0, 1)
raw signal before blocking = 3x² − 2x³
Kerbalism transmission efficiency = signalStrength^k
```

The maximum-range boundary has zero signal and is marked marginal, not a robust
connection. A separation of one quarter, one half, or three quarters of range
produces **84.375%**, **50%**, or **15.625%** signal before blocking. Body blocking
sets actual signal and efficiency to zero. Damping changes efficiency and
science throughput, not the raw signal curve or maximum antenna range.

For **Circular reference orbits** or **Manual orbits**, radii `a`, `b` and angle
`theta` retain the original compatibility calculation:

```text
separation² = a² + b² − 2ab cos(theta)
circular nearest distance  = abs(a − b)
circular farthest distance = a + b
```

One RA-100 at each endpoint, Stock CommNet, and range multiplier 1 give a
**100 Gm** maximum range. In the explicit circular Kerbin–Duna reference:

| Relative phase | Distance (Gm) | Signal before blocking | Central-body result |
| --- | ---: | ---: | --- |
| 0° | 7.126315008 | 98.5488501% | Clear |
| 90° | 24.789698809 | 84.6109236% | Clear |
| 180° | 34.325995520 | 72.7408663% | Kerbol blocks the ray; actual signal 0% |

These values describe the circular option. Actual-orbit values differ because
orbital radii and three-dimensional orientation change along each ellipse.
Open **Signal assumptions and sources** for the selected geometry and radio
references.

### Diagram, blocking, and closest/farthest estimates

The diagram projects the calculated three-dimensional geometry into two
dimensions. Ellipses keep their parent at the correct focus and use a common
scale. Small body/craft markers are enlarged for readability. A visual overlap
in the projection is not itself a blocked link: separation and line-of-sight
checks use the underlying 3D coordinates.

In Actual orbits, the link segment is checked against known intervening bodies using their
physical radius times **Occlusion factor**. The default factor is 1; 0.9 uses
90% of the blocking radius without resizing the orbit. Endpoint planets/moons
are excluded as occluders because the endpoints represent their centers, not
surface stations. Their local horizon and spacecraft altitude are not modeled.
Bodies whose positions cannot be established are reported as unchecked rather
than silently guaranteeing visibility. Exact limb/range boundaries remain
marginal.

Circular reference and Manual orbits retain the previous central-body-only
blocking check. They do not invent coplanar occultations by other planets.

The graph keeps only **Signal strength** and, with Kerbalism,
**Transmission efficiency**. Both include the modeled body blocking. Sampling
refines potential narrow blocking intervals; shaded sections identify blocked
positions. Out-of-range positions have zero signal even when the path is clear.

The **Closest position** and **Farthest position** cards summarize the selected
sweep or displayed date interval, not all configurations that those orbits could
ever reach. Each includes distance, raw signal potential before blocking,
Kerbalism efficiency/rate where available, and the actual availability at that
position. A promising distance-based rate can therefore coexist with a blocked
link whose actual rate is zero. Science rates use the selected sender, antenna
speed, and minimum-rate settings; they do not include slower onward relay hops.

### Orbital data and limitations

The built-in catalogs retain actual parent relationships and verified angular
units/epochs:

- **Stock**: [pinned KSPTOT orbital elements](https://github.com/Arrowstar/ksptot/blob/9972b57398742263af12374652799db210395499/bodies.ini),
  including planets and moons, with source means converted from degrees and
  epochs at UT 0.
- **OPM 2.2.12**: [official Kopernicus configurations](https://github.com/Poodmund/Outer-Planets-Mod/tree/ffedf02e23d2d620e1018d1467f5e485f7950fa0/GameData/OPM/KopernicusConfigs),
  including per-body epochs and Eeloo's reparented orbit/inherited elements.
- **RSS**: [official pinned configurations](https://github.com/KSP-RO/RealSolarSystem/tree/75139b961567f4dab61af83fe162a7e52026558b/GameData/RealSolarSystem/RSSKopernicus)
  for all 32 supported planets/moons. Its B1950 element epoch is
  **−31,542,641.784 UT seconds**, separate from the 1951 game-calendar start.
  The reference plane is Earth-equatorial B1950, not an assumed ecliptic plane.
- **Kcalbeloh 1.1.8**: [official configurations](https://github.com/jcyuan06/Kcalbeloh-System/tree/1c61f4d3a9d72c76054855c4ee9330d3a3ee85a9/GameData/KcalbelohSystem),
  including moons, multiple stellar parents, the SimeSystem hierarchy, and the
  explicit Simetra/Simeht period. The supported default is DistanceFactor 1,
  Rescale 1, HomeSwitch false, RealisticStarSize true, with wormholes on or off.

Kcalbeloh has two deliberately partial dated records. Its root bridge omits a
verified epoch; Efil supplies conflicting radian and degree mean-anomaly keys.
A date requiring either missing value needs a user override. Local links can
use their common-ancestor frame without requiring an unknown orbit above it.
The default Kcalbeloh stellar patch sets Kerbol's mass and radius; those
values are applied only to the new Signals orbital catalog. They do not change
the existing Network, Deployment, transfer budgets, or map data.

These are fixed Keplerian game-config orbits, not N-body trajectories or live
save ephemerides. Rescaled/user-patched systems, alternative calendars, and
Principia may differ. Actual craft separation can differ from planet-center
separation because of parking altitude, local orbital phase, ground-station
location, or motion during a long link. Terrain, deployment/power state, rings,
accretion structures, and a complete DSN/control path are not simulated.
RealAntennas and RemoteTech remain unsupported communication models.

## What the results mean

**Equatorial coverage** is the fraction of equatorial surface longitudes from
which a receiver can see at least one relay within its antenna range. It is not
global surface coverage and does not establish coverage at the poles. The
diagram is an equatorial cross-section of a circular constellation.

**Neighbor links** describe the local relay ring. A link needs both a clear
line between the satellites and enough antenna range. A line just touching the
body, or a distance exactly equal to maximum range, is marked at the limit. Two opposite relays cannot see each other through the body, regardless of
how high their circular orbit is.

**Relay-to-relay signal** is
the strength of a neighboring relay hop at the selected altitude, using the
same loadout on every satellite. **Best surface-to-relay signal** is the
strongest currently usable hop from the sample equatorial surface station to
one of the relays. Rotation changes that sample result. It is not the
weakest signal across all covered longitudes, the constellation's worst case,
or an end-to-end DSN connection. A blocked or out-of-range hop contributes zero;
a body without a surface has no station signal. These signal results always use
raw CommNet strength. Kerbalism profiles separately show **Transmission
efficiency**, `S^k`, for the same hops.
With Kerbalism selected, **Relay-to-relay science rate** uses the relay sender's
loadout. **Surface → relay rate** uses the surface client's loadout and its
best currently usable station hop. These are local hop estimates, before any
slower relay links farther along the path to the DSN.

**Maximum relay-to-DSN range**, shown in Advanced, is the maximum distance
allowed by the selected relay loadout and DSN power. It does not check where
the homeworld is, other bodies or the Sun blocking the path, or whether any relay
currently has a usable DSN connection.
A working local ring and a visible surface receiver do not by themselves
establish a path to mission control.

**Target orbit** is the circular orbit the deployed relays will occupy.
**Target orbit altitude** is its height above the body's surface, rather than
its radius from the center.

Bodies without a landable surface still support orbital relay and deployment
calculations, but have no surface coverage or surface-station result.

The radio model follows **stock CommNet** range and combining rules. **Radio
setup** supplies Stock, RSS-adjusted, or PBC part powers, with optional Kerbalism antenna
catalogs, independently of the physical body data; see
[RSS radio configuration](#rss-radio-configuration),
[PBC radio configuration](#probes-before-crew-radio-configuration), and
[Kerbalism radio configuration](#kerbalism-radio-configuration).
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

**Full radius**, the default, uses `f = 1`. With **Stock CommNet**,
**Kerbalism + CommNet**, or either PBC profile, **KSP normal** uses `f = 0.75` for a body with an
atmosphere and `f = 0.90` for an airless body.
All RSS radio setups, including their Kerbalism variants, use normal defaults
of `f = 1` for either body type.
These are effective game occlusion settings, not changes to a planet's physical
radius or atmospheric height. The
diagram distinguishes the effective occluder when it differs from the body.

## Resonant deployment

The carrier is the ship that releases your relays. Deployment starts with that
ship in the target circular orbit; its injection burn moves it to an elliptical
release orbit. Each released relay then burns back into the target circle. A
lower carrier returns to the release point sooner than the circular relays; a
higher carrier returns later.

The dedicated Deployment diagram draws the physical body, target circle, and
selected carrier ellipse at the same distance scale. The body's center sits at
one focus of the ellipse. Markers identify periapsis, apoapsis, and the shared
release point where the carrier meets the target circle. Switching
**Lower carrier** or **Higher carrier** updates the drawing and result cards.
This is a static orbit diagram; it does not animate a deployment or use an
in-game date.
The orbit-limit checks described below still determine whether the selected
carrier fits the entered bounds.

For target period `T`:

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
release at time zero, the interval is one carrier period and **Total deployment time**
to release the last of `N` relays is `(N - 1) × carrier period`.

These are ideal instantaneous, two-body burn estimates. Launch, transfer to the
target body, arrival into the reference orbit, finite-thrust losses, and vehicle
performance are not calculated here. Deployment burns are **not automatically
added to the Delta-V mission budget**.

## Orbital bounds

The target circular orbit must clear the physical surface, atmosphere, and
chosen clearance margin. Where a sphere of influence is supplied, the orbit
must also stay inside it.

Deployment checks use the carrier's lowest point (periapsis) and highest point
(apoapsis), against the body's actual radius and atmosphere. Changing the radio
blocking radius does not change these orbit limits. A lower carrier can enter the atmosphere even when
the relay ring itself has clear communication links. A higher carrier can
leave the body's sphere of influence. An unknown sphere of influence leaves
that bound unchecked; a clear result is not a certification of flight safety.

The model does not calculate terrain heights, oblateness, orbital perturbations,
station latitude, inclination, station-keeping, drift, or additional occluding
bodies. The clearance margin is a planning input, not a terrain model.

## Worked Kerbin example

In Advanced, choose Kerbin, **800 km** altitude, **3 relays**, **HG-5** relay antennas,
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

Under **Body data**, Basic displays read-only radius, atmosphere height, GM,
and sphere-of-influence cards. **Edit in Advanced mode** opens the full-precision
fields. The approximate summaries make long values easier to read; calculations
use the full entered values. Expand **Body data and radio sources**
for the selected body's reference and any additional radio-configuration
sources; an unfamiliar custom body identifies its values as user-supplied.

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
  artwork, textures, or layout is bundled with the application's GPLv3 code.
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
calculated there. The separate Signals section checks a hierarchy-aware
three-dimensional link with the data and visibility limits described above.

Preset values are reference facts for the pinned versions. Relay coverage and
deployment calculations remain separate from the calculated OPM maneuver model
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

In Advanced, choose **Custom power** when you know your installation's final
effective craft or station power. These values are preserved without profile
scaling. Keep the range multiplier matched to your game settings; a multiplier of 20 is not an
equivalent substitute for RSS's separate antenna and DSN changes.

RealAntennas and RemoteTech use different models and remain unsupported. An RSS,
RO, or RP-1 installation using either radio overhaul should not use these
CommNet profiles as a simulation of that overhaul. See the
[validation record](VALIDATION.md) for the source audit and calculation checks.

### Probes Before Crew radio configuration

Select **Probes Before Crew + CommNet** or **Probes Before Crew + Kerbalism**
under **Radio setup**. These profiles target the community-maintained
[PBC 3.3.2 stable release](https://github.com/Moonlington/ProbesBeforeCrew/releases/tag/v3.3.2),
pinned to commit `85eafa7e7b26723cc48d86e53d5d178a3e3d3d99`.
They model PBC installed with **Community Tech Tree**. Its pinned
[dependency metadata](https://github.com/Moonlington/ProbesBeforeCrew/blob/85eafa7e7b26723cc48d86e53d5d178a3e3d3d99/GameData/ProbesBeforeCrew/Versioning/ProbesBeforeCrew.ckan)
lists ModuleManager, Community Tech Tree, and Kopernicus. Choosing a planetary
map does not detect or enable PBC; Stock, OPM, Kcalbeloh, and imported maps keep
their existing radio defaults.

The [core antenna patches](https://github.com/Moonlington/ProbesBeforeCrew/blob/85eafa7e7b26723cc48d86e53d5d178a3e3d3d99/GameData/ProbesBeforeCrew/_Core/Zs_ProbesBeforeCrew.cfg#L396)
set individual powers in `:NEEDS[CommunityTechTree]:FOR[ProbesBeforeCrew]`.
These are final KSP power ratings, not maximum link distances:

| Antenna | Role | Stock power | PBC power | Combines / exponent |
| --- | --- | ---: | ---: | --- |
| Internal antenna | Internal | 5 km | 5 km | No |
| Communotron 16-S | Direct | 500 km | 250 km | No |
| Communotron 16 | Direct | 500 km | 1 Mm | Yes / 1 |
| HG-5 | Relay | 5 Mm | 20 Mm | Yes / 0.75 |
| Communotron DTS-M1 | Direct | 2 Gm | 5 Gm | Yes / 0.75 |
| RA-2 | Relay | 2 Gm | 2 Gm | Yes / 0.75 |
| Communotron HG-55 | Direct | 15 Gm | 25 Gm | Yes / 0.75 |
| RA-15 | Relay | 15 Gm | 20 Gm | Yes / 0.75 |
| Communotron 88-88 | Direct | 100 Gm | 100 Gm | Yes / 0.75 |
| RA-100 | Relay | 100 Gm | 100 Gm | Yes / 0.75 |

PBC leaves antenna roles, combinability, and exponents unchanged. The HG-5 entry
represents the current `HighGainAntenna5_v2` part; the deprecated HG-5 is not a
separate catalog entry. Arrays use these PBC powers once with the existing
combining rules. For example, four HG-5s on one craft give
`20 Mm × 4^0.75 = 56.568542 Mm`. Two Communotron 16s give **2 Mm**; extra
noncombinable 16-S antennas still give **250 km**. Switching profiles keeps
selected parts and counts. Custom effective craft and station powers remain
as entered.

**DSN modifier is a save setting.** PBC does not patch the stock DSN powers of
**2 / 50 / 250 Gm**. Its
[player instructions](https://github.com/Moonlington/ProbesBeforeCrew/blob/85eafa7e7b26723cc48d86e53d5d178a3e3d3d99/GameData/ProbesBeforeCrew/Readme.txt#L22)
recommend **0.35**, but the planner starts at **1×**. In Advanced, set
**DSN modifier** to match your save. At 0.35× the effective presets are
**0.7 / 17.5 / 87.5 Gm**. This setting is shared by Network and Signals,
preserved when changing radio profiles, and active only with a PBC profile.
It scales station preset power once; **Range multiplier** separately scales
the resulting link distance. A custom final DSN power bypasses the modifier.
For one PBC HG-5 and DSN level 3, range is **2.236068 Gm** at 1× or
**1.322876 Gm** at 0.35×, before body blocking. It does not change local relay
coverage or raw relay-to-relay strength.

The Kerbalism variant targets the existing **Kerbalism 3.44 default science
configuration**, pinned to `39f9f43afe8b4f77aff0086c3866044287694475`.
PBC's [Kerbalism patch](https://github.com/Moonlington/ProbesBeforeCrew/blob/85eafa7e7b26723cc48d86e53d5d178a3e3d3d99/GameData/ProbesBeforeCrew/Mod%20Support/ZsKerbalismPatch.cfg#L50)
uses `:AFTER[Kerbalism]:NEEDS[CommunityTechTree]` and changes only Communotron 8's
technology placement. Communotron 8 remains a **250 km**, direct, combinable
antenna with exponent **1**. Kerbalism's later
[science patches](https://github.com/Kerbalism/Kerbalism/blob/39f9f43afe8b4f77aff0086c3866044287694475/GameData/KerbalismConfig/System/ScienceRework/Patches-Antennas.cfg#L47)
run before/in `zzzKerbalismDefault`: the catch-all forces packet interval to 1,
then per-part patches assign the existing fixed science rates. Thus PBC's
16-S packet interval of 0.8 and resource cost of 14 do not redefine its
Kerbalism science rate. The planner retains all existing known-part rates;
PBC antenna power changes do not multiply them. Stock packet timing and
ElectricCharge use are not simulated.

Automatic Kerbalism damping uses the **effective maximum DSN preset**, including
your chosen modifier. Kerbalism calls `GetDSNRange(1f)`; that API includes the
save's DSN modifier, as also shown by the official
[CustomBarnKit implementation](https://github.com/sarbian/CustomBarnKit/blob/9ab647be4406dbb5952934ea5162b657688569d5/CustomGameVariables.cs#L612).
For the stock home orbit, 0.35× changes automatic `k` from **6.009182** to
**0.770706**. Raw local signal remains unchanged; transmission efficiency and
science rate use the newly calibrated exponent. An exponent below 1 can give
an efficiency percentage above the raw signal percentage; this follows the
same Kerbalism calculation and is not clamped. Custom exponents, antenna
speed, the minimum-rate setting, and byte-based science results work as before.

These profiles do not model a combined **PBC + RSS** installation, RemoteTech,
RealAntennas, Near Future Exploration's custom power system, or additional
antennas from optional PBC-supported part packs. Final custom powers can
describe known CommNet hardware values; they do not implement another radio
model. Later ModuleManager/user overrides, deprecated parts, alternative
Kerbalism configurations, and disabled `FeatureScience` may differ from this
pinned configuration. Technology unlocks and science rewards are outside this
planner's scope.

### Kerbalism radio configuration

Select Kerbalism explicitly; the planet pack does not identify installed mods.
The presets target **Kerbalism 3.44 using stock CommNet** with its default
configuration:

| Radio setup | Power and occlusion baseline |
| --- | --- |
| Kerbalism + CommNet | Stock CommNet |
| Kerbalism + RSS | RSS CommNet without CBK |
| Kerbalism + RSS + CBK | RSS + CustomBarnKit |
| Probes Before Crew + Kerbalism | [PBC 3.3.2 part powers and configured DSN modifier](#probes-before-crew-radio-configuration) |

Each keeps the baseline's range formula, combination rules, DSN powers, and
Normal occlusion factors. The added **Communotron 8** has power **250 km**, is
combinable with exponent **1**, and is a **direct antenna**, so it is unavailable
for relay forwarding loadouts. RSS scales its power to **5 Mm**. Its
[official part configuration](https://github.com/Kerbalism/Kerbalism/blob/39f9f43afe8b4f77aff0086c3866044287694475/GameData/KerbalismConfig/Parts/ShortAntenna/kerbalism-antenna.cfg)
is pinned to revision `39f9f43afe8b4f77aff0086c3866044287694475`, alongside the
Kerbalism sources below. No part artwork or source implementation is bundled.
Switching to a profile without Communotron 8 retains that choice as unavailable;
the message offers a matching Kerbalism preset or an available replacement.
For an array, use the edit action to replace or remove unavailable rows, or
restore its Kerbalism profile. Choices and counts stay available until you
change them; the planner does not calculate using a missing antenna's power.

### Kerbalism damping

Kerbalism's
[CommNet adapter](https://github.com/Kerbalism/Kerbalism/blob/39f9f43afe8b4f77aff0086c3866044287694475/src/Kerbalism/Comms/CommHandlerCommNetBase.cs)
retains raw CommNet strength but uses `S^k` for science transmission. The planner
labels this separate factor **Transmission efficiency**:

```text
raw CommNet strength S = 3x² − 2x³
Transmission efficiency = S^k
```

With a custom exponent `k = 6`, raw strength **80%** gives transmission efficiency
of **26.2144%**; raw **50%** gives **1.5625%**. This percentage multiplies the
full-strength science rate before the minimum science rate is applied. It is
not itself a science rate or a threshold for controlling the craft.
It does not shorten the antenna's maximum range or remove a geometrically
available link. A blocked or out-of-range link still has zero effective strength.

Network and Signals keep raw CommNet strength as the main signal result in both
Basic and Advanced. With a Kerbalism profile, transmission efficiency appears as
a separate percentage inside the signal-strength card. The closest/farthest
signal cards in Signals also keep raw CommNet strength before blocking and show
transmission efficiency separately.
The chart shows raw signal strength and, only with Kerbalism, transmission
efficiency. Both curves account for modeled body blocking and fall to zero when
a body blocks the link. In Advanced, open
**Kerbalism damping** to select
**Automatic (3.44)** or
**Custom exponent**. Damping mode and custom value remain shared across both tabs and
closing/reopening the workspace; changing packs resets the session.

Automatic uses the pinned
[system-calibrated damping exponent](https://github.com/Kerbalism/Kerbalism/blob/39f9f43afe8b4f77aff0086c3866044287694475/src/Kerbalism/Sim.cs).
Its reference inputs are the homeworld's orbital radius (`AU`) and the radio
profile's **effective maximum DSN power** (including a configured PBC DSN modifier), rather than the currently selected DSN level,
the two endpoint powers, or their geometric-mean link range. Choosing a
different target planet or local Kcalbeloh center does not change the
installation's homeworld reference. The shared range multiplier changes link
range, not these automatic calibration references.

The calibration tries distances of `2`, `1.5`, `1`, `0.75`, `0.5`, and `0.25 AU`
in that order. It accepts a distance inside the maximum DSN reference with raw
strength between `0.001` and `0.999`, then calculates:

```text
targetRatio = (0.3925 / 0.48)^(AU multiple / 2)
k = ln(targetRatio) / ln(raw strength at calibration distance)
```

If the homeworld reference is unknown, or no calibration point is usable, the
UI identifies the **fallback exponent 6**. An automatically calibrated exponent
can be below 1; it is not clamped to force a reduction. Custom exponent accepts
a finite value greater than zero, up to `1,000,000`.

These automatic values use the planner's default reference configuration.
For another Kerbalism version, rescaled system, changed DSN configuration, or a
`DampingExponentOverride`, enter the value from your installation's settings or
`KSP.log` (`DataRateDampingExponent`). For a custom imported pack without a known home orbit, use the fallback or
enter your installation's exponent.

### Kerbalism science rates

Kerbalism presets estimate the science rate of the selected outgoing hop.
Network shows **Relay-to-relay science rate** and **Surface-to-relay science rate**. Signals
uses the craft opposite the **Signal receiver** as the sender; changing the
receiving direction changes which loadout supplies its base rate. Swapping
endpoints moves the saved custom rates with their hardware. A DSN preset
represents a terminal receiver.

The pinned
[vessel adapter](https://github.com/Kerbalism/Kerbalism/blob/39f9f43afe8b4f77aff0086c3866044287694475/src/Kerbalism/Comms/CommHandlerCommNetVessel.cs#L49-L111)
uses the geometric mean of all active external transmitters' rates. For each
part model with base rate `ri` and count `ni`:

```text
baseRate = exp(sum(ni × ln(ri)) / sum(ni))
fullStrengthRate = baseRate × antennaSpeed
hopRate = fullStrengthRate × S^k
if hopRate > 0: hopRate = max(hopRate, minimumScienceRate)
```

All rates in this formula must use the same unit. The planner stores rates in
bit/s and displays them in decimal **B/s**, **kB/s**, **MB/s**, or **GB/s**:
8 bits = 1 byte, 1,000 B = 1 kB, 1,000 kB = 1 MB, and 1,000 MB = 1 GB.
Internal antennas contribute neither a rate nor
a count; an internal-only craft has zero science rate, even if CommNet can
control it. Direct and relay antennas both count as transmitters. Noncombinable
external antennas, including Communotron 16-S, still enter the mean. This rate
calculation is independent of their power-combination rules. Two identical
antennas retain the same full-strength base rate; the extra power may improve
the signal at a distance.

These base rates come from the default science configuration's
[per-part patches](https://github.com/Kerbalism/Kerbalism/blob/39f9f43afe8b4f77aff0086c3866044287694475/GameData/KerbalismConfig/System/ScienceRework/Patches-Antennas.cfg#L93-L190):

| Antenna | Base rate before antenna speed and damping |
| --- | ---: |
| Internal antenna | 0 B/s |
| Communotron 8 | 1.5 kB/s |
| Communotron 16 / 16-S | 2.2 kB/s |
| HG-5 | 4.5 kB/s |
| Communotron DTS-M1 | 25 kB/s |
| RA-2 | 18 kB/s |
| RA-15 | 165 kB/s |
| Communotron HG-55 | 200 kB/s |
| Communotron 88-88 | 520 kB/s |
| RA-100 | 480 kB/s |

The patch [sets the packet interval to 1 second](https://github.com/Kerbalism/Kerbalism/blob/39f9f43afe8b4f77aff0086c3866044287694475/GameData/KerbalismConfig/System/ScienceRework/Patches-Antennas.cfg#L47-L65).
Although one patch comment says
“Mb/s”, Kerbalism's
[unit definitions](https://github.com/Kerbalism/Kerbalism/blob/39f9f43afe8b4f77aff0086c3866044287694475/src/Kerbalism/Lib.cs#L1416-L1431)
specify decimal **MB/s**. The planner converts these source values to internal
bit/s using **8,000,000 bits per MB**, then divides bit/s by **8** for the displayed
byte rate. These known-part science rates are the same for all three Kerbalism radio profiles;
RSS scales their CommNet powers rather than these hand-picked science rates.
The planner follows Kerbalism's decimal byte convention but keeps fractional B/s
and zero visible; Kerbalism's own
[rate formatter](https://github.com/Kerbalism/Kerbalism/blob/39f9f43afe8b4f77aff0086c3866044287694475/src/Kerbalism/Lib.cs#L1452-L1468)
can use b/s or “none” at very small rates.

In Advanced, open **Science rate settings** to edit **Antenna speed** and
**Minimum science rate**, shared by Network and Signals. Antenna speed starts
at **1.5×**, matching the pinned
[Normal difficulty preset](https://github.com/Kerbalism/Kerbalism/blob/39f9f43afe8b4f77aff0086c3866044287694475/src/Kerbalism/System/Preferences.cs#L105-L133).
Easy uses 2×, Moderate 1.2×, and Hard 1×; match your actual save settings.
The minimum starts at the
[configured default of 1 bit/s](https://github.com/Kerbalism/Kerbalism/blob/39f9f43afe8b4f77aff0086c3866044287694475/GameData/KerbalismConfig/Settings.cfg#L24-L30).
This configuration field stays in bit/s; a science rate raised to its default
minimum appears as **0.125 B/s**. Enter zero to disable the floor. As in the
[CommNet adapter](https://github.com/Kerbalism/Kerbalism/blob/39f9f43afe8b4f77aff0086c3866044287694475/src/Kerbalism/Comms/CommHandlerCommNetBase.cs#L46-L95),
the floor applies only to a positive rate: blocked, out-of-range, zero-strength,
and internal-only cases stay at zero.

For **Custom power**, enter the craft's full-strength rate in B/s **before**
antenna speed and damping. Power alone cannot determine a science rate.
For example, a source rate of **0.0045 MB/s** is entered as **4,500 B/s**.
Leaving the rate blank keeps it unknown while signal results remain usable;
zero explicitly describes a craft with no science transmission capacity.
Missing or unavailable catalog parts must be corrected before their rate can be
calculated. The default catalog does not infer other mods' science patches.

For example, with antenna speed **1×** and exponent **6**, an HG-5 at raw signal
**50%** gives `4,500 × 0.5^6 = 70.3125 B/s`. Communotron 8 at raw **10%** gives
`0.0015 B/s` before the floor, or **0.125 B/s** with the default minimum. One
Communotron 16 plus one RA-100 has a geometric-mean base rate of about
**32.496 kB/s**; adding a slower external antenna can lower that mean.

These estimates assume the selected antennas are powered, active, deployed,
and usable. ElectricCharge availability, breakage, plasma, and storms are not
simulated. The receiving vessel's base rate does not cap an incoming hop: its
own onward hop can be slower. Kerbalism takes the minimum rate along the whole
relay path, which this single-hop tool does not solve. A nonzero rate estimate
therefore does not establish a complete home connection or guarantee delivery.

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
