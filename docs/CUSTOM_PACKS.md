# Custom planet packs

Custom packs describe a system as bodies, selectable states, and explicit
directed maneuver costs. They use the same map, mission modes, stops, reserves,
and breakdown as the built-in packs.

For long custom routes, the optional breakdown shows up to eight maneuvers at a
time. Use **Previous maneuvers** and **Next maneuvers** to browse the displayed
range within a stage. Stage arrows and Outbound/Return tabs still choose the
part of the mission, while the page and map remain free of scrolling.

## Import, export, and storage

1. Open **Custom planet packs** using the puzzle button beside the Stock, OPM,
   and RSS system buttons.
2. Open the **Custom packs** tab, choose **Import JSON**, and select a pack file.
   Validation errors appear in the manager; an invalid file does not replace
   the current map.
3. Choose **Use** beside an imported pack to open its map.

Use **Export current pack** to download the active pack as JSON. Exporting a
built-in pack is a convenient starting point: change its top-level `id`, `name`,
and `version`, edit the data, and import the resulting file. The IDs `stock`,
`opm`, `rss`, `stock-kcalbeloh`, and `opm-kcalbeloh` are reserved. Imports also
cannot overwrite another custom pack with the same ID. Remove the old custom
entry before importing a replacement.

Packs stay in this browser's local storage for this site. Files are not uploaded,
and imports do not fetch any listed source URL. Other browsers and devices have
their own collections. Clearing site data removes saved packs. If storage is
unavailable or full, the manager shows a message and the current session can
still use the imported packs; export a copy before leaving. **Remove** deletes
an entry immediately. Pack selection and mission selections are not saved
between visits.

Each file can be at most **1 MiB**, with at most **100 bodies**, **400 states**,
and **1,000 maneuvers**. Up to **five custom packs** can be stored. Each pack can
list up to **20 sources**, **100 unpriced connections**, and **20 map regions**.
A region can contain up to 100 body IDs. Text and collection limits are also
checked to keep imported data manageable. Large systems use the automatic
schematic layout, so concise names and regional views help readability.

## Working example

Download the [example JSON](examples/custom-pack.json) using GitHub's **Raw**
button, then import it. It contains one star, a planet called Haven, and a moon
called Pebble. All costs are **invented teaching values**, not KSP or mod data.
Haven surface → Pebble surface costs **570 m/s**; the reverse costs **525 m/s**.
Their round trip is **1,095 m/s**, or **1,314 m/s** with a 20% reserve.

## JSON format

The file contains one JSON object following
[`PlanetPack`](../src/types/planner.ts), without a wrapper or executable code.
IDs contain 1–200 characters, start with a letter or digit, and then use only
letters, digits, `:`, `.`, `_`, `/`, `>`, or `-`. IDs must be unique within their
own collection. References must match an existing ID exactly. Costs use **m/s**
and optional reference altitudes use **km**.

| Field | Meaning |
| --- | --- |
| `id`, `name`, `version`, `description` | Required pack identity and descriptive strings. |
| `shortName` | Optional compact display name, up to 12 characters. |
| `dataNotice` | Optional short note shown beside the route status; opens the assumptions dialog. |
| `transferHubBodyId` | Optional ID of a planet with a low-orbit state, used to describe the pack's reference transfers. |
| `sources` | Objects with unique `id`, `title`, and an HTTPS `url`. |
| `assumptions` | An array of strings describing the pack's modeling choices. |
| `bodies` | The body hierarchy and presentation metadata. |
| `nodes` | Selectable surface, orbit, reference, high-ellipse, and encounter states. |
| `maneuvers` | Directed, sourced connections between states. |
| `unpricedConnections` | Optional documented links that require user-entered directional allowances. |
| `mapRegions` | Optional presentation groups for browsing parts of a large map. |

Keep source attribution and licensing when adapting an exported pack. Validation
checks data consistency; it does not establish that reference figures are
accurate for a particular mod release or vehicle.

### Bodies and states

Each body declares `id`, `name`, `parentId`, `kind`, `hasSurface`,
`hasAtmosphere`, and a hexadecimal `color`, such as `#73c8fa`.

- A `star`, `black-hole`, or `barycenter` is a stellar primary or central
  reference. It can have `parentId: null` or orbit another primary/barycenter.
- A `planet` orbits a star, black hole, or barycenter. This hierarchy kind also
  covers small bodies directly orbiting a primary.
- A `moon` orbits a planet, another moon, or a barycenter.
- A `wormhole` orbits a physical planet. It describes a nonlandable portal, not
  a planet with an invented surface or parking orbit.

Primaries, barycenters, and wormholes cannot have landable surfaces or declare
`supportsAtmosphericBraking: true`. Cyclic parent chains are rejected.

Each state declares `id`, `bodyId`, `kind`, and `label`, with an optional
nonnegative `altitudeKm`. State kinds are `surface`, `orbit`, `reference`,
`elliptical`, and `encounter`. A `reference` state belongs to a star, black hole,
or barycenter and represents an explicitly documented central reference, such
as a circumbinary orbit. It does not imply a surface altitude or reset a
planetary arrival into low orbit. Put an ambiguous reference distance in its
label rather than asserting `altitudeKm`.

A surface state requires `hasSurface: true`; gas giants and primaries must not
be given landable surfaces. Use separate states when a body needs multiple
parking orbits, and give them distinct IDs and clear labels.

Atmospheric-braking arrows depend on the destination body's atmosphere and the
connection type, and apply only to physical planets/moons. Set optional
`supportsAtmosphericBraking: false` when the reference does not support such
markers. That flag also excludes the body from
the optional atmospheric assistance controls.

The **Atmospheric assistance** dialog works with imported packs using the same
rules as built-in packs. Ideal capture replaces separate same-body inward
capture and circularization costs with a zero-powered-burn lower bound. An
enabled atmospheric landing replaces a same-body orbit → surface descent with
the powered allowance entered by the user, from 0 to 1,000,000 m/s. An allowance
may increase the original budget. Ascent and escape edges, airless-body costs,
and bundled transfer costs stay unchanged. An arrow on a moon-return transfer
does not discount that indivisible edge.

These choices change the effective routing graph for the session; they do not
edit the imported pack or its exported JSON, and require no additional JSON
fields. They start disabled, are not saved with the pack, and reset with Clear.
Entry heating, guidance, parachutes, and capture cleanup burns are not simulated;
choose appropriate powered allowances and mission reserves. See the
[data guide](DATA.md#optional-atmospheric-assistance) for the calculation model.

### Maneuvers

Every maneuver declares `id`, `from`, `to`, `deltaV`, `kind`, `label`,
`sourceId`, and `assumptions`. `deltaV` must be finite and between 0 and
1,000,000 m/s; `sourceId` must reference a listed source. The planner **does not
infer reverse edges or reverse costs**. Add an explicit maneuver for each supported direction.

| Kind | Supported direction |
| --- | --- |
| `ascent` | Surface → low orbit on the same body. |
| `descent` | Low orbit → surface on the same body. |
| `escape` | Low orbit/reference → high ellipse or encounter; high ellipse → encounter, on the same body. |
| `capture` | Encounter → high ellipse or low orbit/reference; high ellipse → low orbit/reference, on the same body. |
| `transfer` | Parent low/reference/high orbit ↔ child encounter; encounter ↔ encounter between planets with the same parent; or a complete orbit/reference ↔ orbit/reference transfer between different bodies. |
| `wormhole` | A complete low-orbit ↔ low-orbit journey between physical planets, including approach and exit matching. |

For a moon of a moon, the parent in a transfer may itself be a moon. A direct
orbit/reference pair must include the complete cost of establishing its
destination state; do not supply only one burn of a two-burn transfer. The
planner adds no hidden capture or circularization cost to such a pair. A
`wormhole` edge is likewise a complete explicitly priced journey, not an
automatically free plugin jump.

Disconnected states are allowed, but routes requiring missing connections are
reported as unreachable. Encounter-to-encounter planetary arrivals retain their
arrival context across stops: before another such departure, a route must reach
the arrival planet's actual low orbit. An encounter, high ellipse, or central
reference does not clear that requirement.

### Unpriced connections and regional views

Use optional `unpricedConnections` when a source identifies a link without a
complete fuel budget. Each descriptor declares `id`, `label`, `from`, `to`,
`forwardKind`, `reverseKind`, `sourceId`, and `assumptions`. Endpoints must be
existing states and both directional kinds must follow the topology rules above.
The descriptor contains **no `deltaV`** and does not add a zero-cost edge.

Open **Link allowances** from the manager's **Add-ons** tab, or from the route
status when a route is unavailable in a pack with unpriced links. Users can enter the whole
cost independently in each direction. Blank leaves that direction unavailable;
zero explicitly assumes a free journey. Inputs must be finite and between
0 and 1,000,000 m/s. For a partially priced source pair, the allowance must cover
both its known component and its unknown component.

**Apply** commits the staged draft, while **Cancel** or Escape discards it.
**Clear allowances** clears the draft until applied. Session allowances feed the
route search before atmospheric choices and reserves; they do not rewrite the
imported pack or its exported JSON. Mission **Clear** and page reload remove
them. Pack switches retain an allowance only when its descriptor ID, endpoints,
and directional maneuver kinds remain compatible.

Optional `mapRegions` entries declare a unique `id` (`all` is reserved for the
complete overview), display `label`, and a
nonempty `bodyIds` array. IDs must name existing bodies, without duplicates
inside a region. Include all bodies that have selectable states if you want
every state available through named views. Regions can overlap; **All systems**
always provides the complete overview. Region switching filters presentation
only: mission routes, ordered stops, and budgets use the entire pack. Links
whose endpoints are in different views are visible in the overview.

For a complete example of these fields, export either reviewed Kcalbeloh
configuration. Rename its top-level pack ID before importing your edited copy.
The export retains the original source costs, regions, and unpriced descriptors,
without any allowances entered for the current session.

### IDs and compatibility

Use a namespace such as `my-pack:haven:orbit` for your own body and state IDs.
Changing packs preserves endpoints and stops whose state IDs exist in the new
pack. This lets a Stock extension keep unchanged Stock states. If your pack
describes a different physical system or a different reference state, give
those bodies and states new IDs so old selections are not treated as
compatible. The top-level pack ID does not rename IDs inside the file.

The importer reads this JSON format. It does not read Kopernicus `.cfg` files or
calculate budgets from orbital elements. Explicit reference states, full-pair
transfers, and user allowances can represent documented plans involving binary
systems or wormholes, but they do not simulate binary dynamics, portal exit
velocities, gravity assists, or interstellar trajectories. Supply credible
reference data and state the remaining assumptions.

## Relay planning for custom bodies

The separate [Relays workspace](RELAYS.md) can use bodies from an imported pack.
Recognized body IDs and parent contexts can use a reference physical preset.
Other bodies need their radius, gravitational parameter, and atmosphere height
entered under **Body data**; add a sphere of influence when known. These are
session inputs, not additional fields in the imported JSON, and editing them does
not rewrite the pack. The radio model remains stock CommNet.
