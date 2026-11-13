[![KSP Delta-V Planner — Mission budgets & CommNet planning](docs/assets/planner-preview.png?v=5)](https://antoniotoni.github.io/ksp-deltav/)

# KSP Delta-V Planner

A browser-based Delta-V and CommNet planner for Kerbal Space Program.
Calculate mission budgets, plan local relay coverage, and compare antenna
ranges and signal strength between craft and relays.

Supports Stock, Outer Planets Mod (OPM), Real Solar System (RSS), and Kcalbeloh
with Stock or OPM.

**[Open the planner](https://antoniotoni.github.io/ksp-deltav/)**

[Data and assumptions](docs/DATA.md) · [Relay guide](docs/RELAYS.md) ·
[Validation record](docs/VALIDATION.md) · [Developer guide](docs/DEVELOPMENT.md)

## Features

- **Stock, OPM, and RSS maps** with selectable surface, low-orbit, encounter, and high
  elliptical-orbit states. OPM includes Eeloo under Sarnus and Tal under Wal.
- **Config-based OPM estimates** using official 2.2.12 constants, explicit parking
  orbits, and analytic transfer, capture, and vacuum surface budgets.
- **Direct transfers between supported non-home planets in Stock, OPM, and RSS**, with complete
  departure and capture estimates for low circular and supported high elliptical
  orbits. Moon journeys can join their parent's high-orbit branch without an
  unnecessary low-orbit capture. Extra connections appear when selected.
- **Direct transfers between supported sibling moons**, with departure and
  capture estimates that avoid an unnecessary parent-planet parking visit.
  Orbital-plane differences are included under the documented reference model.
- **Stock + Kcalbeloh and OPM + Kcalbeloh configurations**, with official map
  budgets, regional views, wormholes on/off, and explicit allowances for
  unpriced links.
- **Custom planet packs** imported from JSON, stored in your browser, and usable
  with the same route planner. Export any pack as a starting point for your own.
- **One-way, round-trip, and return-only planning** with animated route highlights,
  editable endpoints, swap, and reset. The moving highlight follows stops and
  return legs in order; reduced-motion settings keep the route static.
- **Ordered multi-stop missions** with up to four intermediate states. Search for
  stops or select them on the map, then reorder or remove them in the Stops editor.
- **Mission reserves** from 0–100%, added to the final budget without changing
  the selected route.
- **Optional maneuver breakdowns**, with one stage at a time for multi-stop
  missions and separate Outbound and Return tabs for round trips. Long stages
  have page controls; details stay hidden until you enable them.
- **Atmospheric-braking markers** showing where atmospheric assistance may be
  possible in the indicated direction.
- **Optional atmospheric assistance**, with per-body ideal capture choices and
  powered landing allowances you enter yourself. Routes recalculate before the
  mission reserve is added.
- **CommNet relay planning** for circular, equally spaced constellations, with
  equatorial coverage, antenna ranges and signal strengths, resonant deployment
  estimates, and body presets for Stock, OPM, RSS, and Kcalbeloh planets and moons.
- **Interplanetary signal planning** with antenna pairs, an interactive relative
  phase view, circular-reference nearest/farthest strengths, and central-body
  occlusion checks. Reference pairs cover Stock, OPM, RSS, and compatible local
  Kcalbeloh systems; manual geometry supports other configurations.
- **Mixed antenna arrays** with separate relay, surface-client, and interplanetary
  endpoint loadouts, using stock antenna combining rules.
- **A responsive map** with keyboard and touch selection, a deep-blue starfield,
  and no page or map scrolling.

## How to use it

1. Choose **Stock**, **OPM**, or **RSS**, or open **Custom planet packs** using the
   puzzle button beside them. Its **Add-ons** tab offers **Stock + Kcalbeloh**
   and **OPM + Kcalbeloh**. Set **Wormholes** to match your installation, then
   choose **Use** to apply the configuration. **Custom packs** imports your own JSON.
2. Select an origin, then a destination on the map. Use the Origin and
   Destination controls to edit either endpoint.
3. Choose a mission mode: **One way** for origin → destination, **Round trip**
   for both legs, or **Return only** for destination → origin. Changing modes
   keeps your selected endpoints.
4. Open **Stops** to add up to four intermediate states in outbound order. Use
   **Choose a stop** or **Select stop on map**, then reorder or remove entries.
   Numbered teal badges identify the stops on the map.
5. Open **Atmosphere** (**Aero** on phones) in the header to choose ideal capture
   or enter a powered landing allowance for supported bodies, then choose
   **Apply**. These options start disabled.
6. Adjust **Redundancy** for your reserve and enable **Breakdown** to inspect
   individual maneuvers. Use the stage arrows to browse a multi-stop journey.

All budgets are shown in **m/s**. For example, the stock Kerbin surface → Mun
surface route is **5,120 m/s**, or **10,240 m/s** for a round trip before reserves.
With stops, One way follows origin → stops → destination. Return only reverses
that itinerary, and Round trip follows it outward and then in reverse. Return
only starts at the selected destination state without including an outbound
flight or its arrival conditions. The reserve applies once to the full budget.

The planner first avoids unrequested planet or moon parking visits, then finds
the lowest Delta-V budget for that itinerary. Necessary parent-system passages
and available reference-map connections remain usable. Add a state under
**Stops** to deliberately compare a detour through another body; a smaller sum
of reference burns does not establish compatible transfer dates or orbit planes.

Stock, OPM, and compatible RSS reference orbits automatically consider direct
transfers between non-home planets' low or supported high elliptical orbits.
For example, **Duna low orbit → Dres
low orbit** is an analytic **1,532 m/s** estimate. **Duna low orbit → Gilly low
orbit** can use Eve's high orbit, avoiding a Kerbin layover. Open **Budget
assumptions** to distinguish modeled transfers from published map figures.
RSS coverage includes low and high reference orbits at every supported non-home
planet. Mercury, Venus, Mars, and Ceres now have explicitly modeled bound high
orbits, alongside the modern outer-system references. Mars's moon connections
use the same stated high orbit and encounter speeds. Direct bound-orbit transfers
and their moon branches avoid an unrequested Earth layover.

Supported moons sharing a parent also have direct low-orbit transfers. These
use the moons' orbital radii and relative orbital planes, together with their
own departure and capture burns. **Mun low orbit → Minmus low orbit** is a
**330 m/s** reference estimate without a low Kerbin orbit stop. Existing native
Kcalbeloh moon pairs retain their published complete-pair budgets.

**Swap** reverses both the endpoints and the stop order. Changing systems keeps
states available in the new pack and removes unsupported stops. **Clear** removes
the endpoints, stops, atmospheric choices, and link allowances, resets the reserve
to 0%, returns to **One way**, and hides the breakdown. Atmospheric choices follow
body IDs, so swapping or changing mission modes keeps them, and changing systems
retains compatible choices.

The **Custom planet packs** manager accepts up to five JSON packs and keeps them
in this browser; files are not uploaded. If browser storage is unavailable, packs
remain usable for the session. Use **Export current pack** to save a copy or start
editing a new pack. See the [custom pack guide](docs/CUSTOM_PACKS.md) for the format
and a small working example.

With Kcalbeloh enabled, **Map view** switches between Kerbol, Kcalbeloh, Maelg,
Sunorc, Aralc, or **All systems**. Routes still use the complete pack. Switching
between Stock and OPM retains Kcalbeloh and the selected wormhole setting;
choosing RSS disables the add-on. Use **Disable Kcalbeloh** in the manager to
return to the base pack.

With **Wormholes** off, local routes remain available in both systems, but the
supplied graph has no Kerbol–Kcalbeloh connection. Local link allowances cannot
create that missing interstellar route. Disabling wormholes clears their entered
allowance; enabling them again starts with that allowance blank. Other compatible
allowances, endpoints, and stops are retained.

When space allows, the desktop **All systems** overview places the Kerbol system
above four labeled groups for Kcalbeloh, Maelg, Sunorc, and Aralc. This overview
uses the screen's width in both combined configurations; regional views remain
available for a closer look.

Some Kcalbeloh connections have no published Delta-V budget. Open
**Link allowances** from the Add-ons tab, or from the route status when a link is
missing. Enter the complete **Forward** and **Reverse** costs following each
field's endpoint arrow.
These link directions stay fixed when you change mission mode. Blank leaves a
direction unavailable, and zero is an explicit user assumption. Choose **Apply**
to use the draft. Source data and exported JSON keep the original unpriced links.

Open **Relays** in the header (the satellite icon on phones) to plan a local
CommNet constellation. Choose a body, orbit altitude, relay count, and antennas,
then inspect **Network**, **Deployment**, and **Body data**. Closing the tool
keeps your current Delta-V mission intact. Kcalbeloh planets and moons load their
body data automatically with either base system and wormhole setting. Inputs
remain editable; **Restore preset** returns to the reference values. The
[relay guide](docs/RELAYS.md) explains the calculations and supported data.

**Radio setup** selects Stock CommNet, either RSS configuration, or the explicit
**Kerbalism + CommNet**, **Kerbalism + RSS**, and **Kerbalism + RSS + CBK** presets
for Kerbalism 3.44. RSS maps start with RSS antenna powers (20× stock) and stock
DSN powers; select a CustomBarnKit option if your installation includes its RSS
DSN patch. Radio setup is shared by Network and Signals and can be changed
independently of the body map. Kerbalism presets retain CommNet range and signal
rules, add **Communotron 8**, and show Kerbalism's **damped signal** alongside
raw CommNet strength in Network and Signals. Open **Kerbalism damping** to use
the automatic 3.44 reference exponent or enter your installation's exponent.
Damping settings are shared by both tabs. Reach and coverage still use raw
CommNet geometry; the damped percentage is not a transmission rate in bits per
second. See [Kerbalism radio configuration](docs/RELAYS.md#kerbalism-radio-configuration).

Choose **Antenna array…** under **Relay antenna** or **Surface antenna** to mix
catalog parts and counts, then choose **Apply**. A relay loadout is fitted to each
satellite separately; antennas on different satellites do not combine. Arrays
use the selected radio setup's powers. Custom powers are final effective values
and are never scaled automatically.

For planet-to-planet links, open **Relays → Signals**. Choose two planets around
the same reference center and an antenna or array at each endpoint. Choose the
**Receiving endpoint** (B by default): a receiving vessel needs a relay antenna,
and only relay-capable parts contribute to its array power. A DSN power can
represent the homeworld receiver. Move **Relative phase**, or use **Closest**
and **Opposite**, to inspect changing distance and central-body obstruction.
The current signal includes that obstruction; the nearest/farthest cards show
the circular-reference range-only envelope. Manual geometry accepts your own
orbit radii and central radius. See the [signal guide](docs/RELAYS.md#interplanetary-signals)
for scope and examples.

## About the estimates

Open **Budget assumptions** beside the total to see the selected mission's
reference-map figures, analytic estimates, personal allowances, ideal capture,
and landing placeholders. The dialog lists reserves and final rounding
separately. **Sources & assumptions** explains the active pack. Imported budgets
remain author-supplied even when their source metadata names a map or model.

The numbers have three distinct origins: published map budgets, calculated
reference estimates, and personal allowances or reserves. For example, the
**1,898 m/s** Duna low orbit → Gilly low orbit estimate combines a **1,428 m/s
modeled** Duna → Eve high-orbit transfer with **60 + 410 m/s from the Stock
map**. It is not an in-game measurement or a simulated flight.

These are schematic planning estimates within the supplied maneuver graph,
rather than simulated trajectories. Stock/OPM retain their Kerbin-centered
reference branches and RSS its Earth-centered branches, with modeled direct
bound-orbit links between supported non-home planets.
The planetary links reach low circular and supported high elliptical orbits used
by moon branches; sibling-moon links provide supported local alternatives.
Other reference routes can still include parent-planet parking stops because
more direct escape or transfer trajectories are absent from the graph. Those
stops describe the supplied itinerary, not physical requirements for spaceflight.
Kcalbeloh adds complete reference-pair transfers; custom pack estimates depend
on their supplied data.
Flight dates, plane-change optimization, gravity assists, and vehicle performance
are not modeled.

**Direct planetary transfers use circular, coplanar planetary orbits.** Spacecraft endpoints
can be low circular or supported high elliptical reference orbits. Stock and RSS
high-orbit energy at the retained map references is inferred from the rounded
circularization increment only when it implies a valid bound orbit. OPM and eight
RSS planets use explicit high-orbit geometry; RSS Vesta and Jupiter retain their
bound map-inferred references. Each pair includes
powered departure and arrival capture, rounded separately. Planetary
eccentricity, inclination, and
dated encounter geometry are omitted. The same nominal pair reverses its two
components for the return. These are analytic estimates, rather than new
published map budgets.

**Sibling-moon estimates use circularized reference orbits.** The transfer lies
in the inner moon's orbital plane and meets the outer moon at an assumed mutual
node, using their relative inclination and longitude of ascending node. Escape
and capture at the moons are both charged. Orbital eccentricity, actual phase,
travel dates, and gravity assists are not solved. Co-orbital rendezvous,
retrograde pairs, and unsupported binary geometry keep their reference routes
instead of receiving an ordinary Hohmann estimate.

**Atmospheric choices are estimates, not entry simulations.** Ideal capture
uses a zero-powered-burn lower bound for separate capture and circularization
segments; capture cleanup burns are excluded. Landing uses the powered allowance
you enter, including an explicit zero if appropriate for your plan. Entry
heating, guidance, and parachute performance are not modeled. Bundled transfer
costs remain intact even when their arrow indicates possible atmospheric
assistance. With options disabled, atmospheric landings retain their original
ascent-sized planning allowance. See the [data guide](docs/DATA.md) for a worked
example and the exact scope of the adjustments.

**OPM uses analytic reference estimates.** Orbital and airless-body budgets use
pinned official 2.2.12 constants and parking orbits above current atmospheres.
The original encounter branches use inclination at a nominal orbital-node
encounter; direct planet-pair links use the coplanar model described above.
Neither simulates a dated trajectory. Tekto and Thatmo retain historical
atmospheric ascent allowances, also used as landing placeholders.
See the [data guide](docs/DATA.md) for the calculations and limitations.

**Kcalbeloh uses its official 1.1.8 reference map.** Missing stellar-connector and
binary-system costs require user allowances, as does the wormhole link when
enabled. With wormholes off, no interstellar transfer is supplied. Noi and
individual Simetra/Simeht low orbits lack priced map states; see the
[data guide](docs/DATA.md#kcalbeloh-configurations) for exact coverage and supported
installation settings.

**RSS combines a community Solar System reference with analytic models** for
33 base-mod bodies. Saturn, Uranus, Neptune, Pluto, and Triton use selected
parking altitudes above their modern atmospheres. Mercury, Venus, Mars, and
Ceres retain their stated low altitudes and use explicit bound high ellipses.
Affected orbital budgets are recalculated and labeled as models; retained map
figures and atmospheric surface allowances remain separate. See the
[inner-system](docs/DATA.md#rss-inner-system-reference-model) and
[outer-system](docs/DATA.md#rss-outer-system-reference-model) reference models
for choices and calculation assumptions.

**Relay coverage is equatorial.** A visible surface receiver and a working local
ring do not establish a connection back to the homeworld's Deep Space Network
(DSN). **Signals checks one link** between vessels near the selected planets,
using circular, coplanar reference orbits and a relative angle rather than dates.
Its nearest/farthest strengths are not universal extrema for eccentric or
inclined trajectories. Local endpoint horizons, other bodies, and complete DSN
paths remain unchecked. The radio presets use stock CommNet rules with explicit
Stock, RSS, and Kerbalism configurations. Communotron 8 cannot forward relay
traffic. Signals checks the receiving endpoint's relay capability for one hop;
it does not establish a complete connection to mission control.
Kerbalism damping is calculated, while absolute science rates, ElectricCharge
availability, antenna deployment, and storms are not modeled. RealAntennas and
RemoteTech use different models and are not simulated; custom powers do not
reproduce those models. The
[validation record](docs/VALIDATION.md) describes the
checked data, independent calculation tests, and remaining limits.

## Run locally

Built with **React, TypeScript, Vite, and Material UI**. Use **Node.js 24 LTS** and
npm:

```sh
npm ci
npm run dev
```

The app runs entirely in the browser and needs no backend or API credentials.
Build and preview the production version with:

```sh
npm run build
npm run preview
```

For testing, browser setup, project structure, and deployment instructions, see
the [developer guide](docs/DEVELOPMENT.md).

## Planned additions

- Kerbalism science transmission-rate estimates in bits per second.
- Additional planet packs, rescaled systems, and alternative starting-homeworld
  configurations.
- Advanced relay planning: inclined and polar constellations for coverage beyond
  the equator, and complete communication paths through relays back to the DSN.

Suggestions, bug reports, and contributions are welcome through
[GitHub issues](https://github.com/AntonioToni/ksp-deltav/issues) and pull requests.

## License

The application is licensed under the [MIT License](LICENSE). Reference-map
attribution and licensing are documented in the [data guide](docs/DATA.md), and
relay references in the [relay guide](docs/RELAYS.md).
Kerbal Space Program is the property of its respective owners; this is a
community project.
