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
2. Choose **Import JSON** and select a pack file. Validation errors appear in
   the manager; an invalid file does not replace the current map.
3. Choose **Use** beside an imported pack to open its map.

Use **Export current pack** to download the active pack as JSON. Exporting a
built-in pack is a convenient starting point: change its top-level `id`, `name`,
and `version`, edit the data, and import the resulting file. The IDs `stock`,
`opm`, and `rss` are reserved. Imports also cannot overwrite another custom pack
with the same ID. Remove the old custom entry before importing a replacement.

Packs stay in this browser's local storage for this site. Files are not uploaded,
and imports do not fetch any listed source URL. Other browsers and devices have
their own collections. Clearing site data removes saved packs. If storage is
unavailable or full, the manager shows a message and the current session can
still use the imported packs; export a copy before leaving. **Remove** deletes
an entry immediately. Pack selection and mission selections are not saved
between visits.

Each file can be at most **1 MiB**, with at most **40 bodies**, **160 states**,
and **1,000 maneuvers**. Up to **five custom packs** can be stored. Each pack can
list up to **20 sources**. Text and collection limits are also checked to keep
imported data manageable. Large systems use the automatic schematic layout, so
concise names help readability.

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
| `nodes` | Selectable surface, orbit, high-ellipse, and encounter states. |
| `maneuvers` | Directed, sourced connections between states. |

Keep source attribution and licensing when adapting an exported pack. Validation
checks data consistency; it does not establish that reference figures are
accurate for a particular mod release or vehicle.

### Bodies and states

Each body declares `id`, `name`, `parentId`, `kind`, `hasSurface`,
`hasAtmosphere`, and a hexadecimal `color`, such as `#73c8fa`.

- A `star` has `parentId: null` and no landable surface.
- A `planet` orbits a star.
- A `moon` orbits a planet or another moon. Cyclic parent chains are rejected.

Each state declares `id`, `bodyId`, `kind`, and `label`, with an optional
nonnegative `altitudeKm`. State kinds are `surface`, `orbit`, `elliptical`, and
`encounter`. A surface state requires `hasSurface: true`; gas giants and stars
must not be given landable surfaces. Use separate states when a body needs
multiple parking orbits, and give them distinct IDs and clear labels.

Atmospheric-braking arrows depend on the destination body's atmosphere and the
connection type. Set optional `supportsAtmosphericBraking: false` when the
reference does not support such markers. That flag also excludes the body from
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
1,000,000 m/s; `sourceId` must reference a listed source. The planner **does not infer reverse
edges or reverse costs**. Add an explicit maneuver for each supported direction.

| Kind | Supported direction |
| --- | --- |
| `ascent` | Surface → low orbit on the same body. |
| `descent` | Low orbit → surface on the same body. |
| `escape` | Low orbit → high ellipse or encounter; high ellipse → encounter, on the same body. |
| `capture` | Encounter → high ellipse or low orbit; high ellipse → low orbit, on the same body. |
| `transfer` | A parent body's low/high orbit ↔ its moon's encounter, or encounter ↔ encounter between planets orbiting the same star. |

For a moon of a moon, the parent in a transfer may itself be a moon. Disconnected
states are allowed, but routes requiring missing connections are reported as
unreachable. Interplanetary arrivals retain their arrival context across stops:
before making another interplanetary transfer, a route must reach a low orbit
at its arrival planet. Supplying a direct planet-to-planet edge does not bypass
that rule.

### IDs and compatibility

Use a namespace such as `my-pack:haven:orbit` for your own body and state IDs.
Changing packs preserves endpoints and stops whose state IDs exist in the new
pack. This lets a Stock extension keep unchanged Stock states. If your pack
describes a different physical system or a different reference state, give
those bodies and states new IDs so old selections are not treated as
compatible. The top-level pack ID does not rename IDs inside the file.

The importer reads this JSON format. It does not read Kopernicus `.cfg` files,
calculate budgets from orbital elements, or model binary stars, wormholes,
gravity assists, or interstellar transitions. These require additional routing
models and reference data before they can be represented faithfully.
