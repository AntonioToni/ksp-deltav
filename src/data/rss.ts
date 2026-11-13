import type { CelestialBody, ManeuverEdge, ManeuverKind, NodeKind, PlanetPack, RouteNode } from '../types/planner'
import { withSiblingTransfers } from './siblingTransfers'
import { withDirectTransfers } from './directTransfers'
import { rssCentralMu, rssPhysicalReferences, rssPhysicsSource } from './rssPhysics'
import { rssOuterOrbitReferences, withRssOuterReferences } from './rssOuterReferences'
import { rssInnerOrbitReferences, withRssInnerReferences } from './rssInnerReferences'

const mapSourceId = 'rss-community-solar-system-map'
const mapCommit = 'dc472f56101b260baee8814a94de985f44a6c9b2'
const configCommit = '75139b961567f4dab61af83fe162a7e52026558b'
const referenceEstimate = 'Community Solar System map estimate using ideal Hohmann transfers and burns near the lowest point of an orbit. The planner does not choose a launch window or simulate your craft.'
const noAssists = 'Extra orbital-plane changes, gravity assists, atmospheric savings, losses during real engine burns, and launch timing are not included. Add a reserve.'

type BodyRow = {
  id: string
  name: string
  parent: string | null
  kind: CelestialBody['kind']
  atmosphere: boolean
  surface: boolean
  color: string
  orbitKm?: number
  elliptical?: boolean
  supportsAtmosphericBraking?: boolean
}

// Coverage is the intersection of the pinned reference diagram and the named
// bodies in the pinned base RSS configs. Optional expansion-pack bodies, source
// diagram-only bodies, solar landings, and gas-giant landings are not invented.
const bodyRows: BodyRow[] = [
  { id: 'sun', name: 'Sun', parent: null, kind: 'star', atmosphere: false, surface: false, color: '#ffd36e' },
  { id: 'mercury', name: 'Mercury', parent: 'sun', kind: 'planet', atmosphere: false, surface: true, color: '#bea18c', orbitKm: 100, elliptical: true },
  { id: 'venus', name: 'Venus', parent: 'sun', kind: 'planet', atmosphere: true, surface: true, color: '#e4c485', orbitKm: 400, elliptical: true },
  { id: 'earth', name: 'Earth', parent: 'sun', kind: 'planet', atmosphere: true, surface: true, color: '#73bde6', orbitKm: 250 },
  { id: 'moon', name: 'Moon', parent: 'earth', kind: 'moon', atmosphere: false, surface: true, color: '#c4c7cf', orbitKm: 100 },
  { id: 'mars', name: 'Mars', parent: 'sun', kind: 'planet', atmosphere: true, surface: true, color: '#e99b7c', orbitKm: 200, elliptical: true },
  { id: 'phobos', name: 'Phobos', parent: 'mars', kind: 'moon', atmosphere: false, surface: true, color: '#b5a396', orbitKm: 1 },
  { id: 'deimos', name: 'Deimos', parent: 'mars', kind: 'moon', atmosphere: false, surface: true, color: '#c3b2a3', orbitKm: 1 },
  { id: 'vesta', name: 'Vesta', parent: 'sun', kind: 'planet', atmosphere: false, surface: true, color: '#c7b8a8', orbitKm: 20, elliptical: true },
  { id: 'ceres', name: 'Ceres', parent: 'sun', kind: 'planet', atmosphere: false, surface: true, color: '#bab7b1', orbitKm: 20, elliptical: true },
  { id: 'jupiter', name: 'Jupiter', parent: 'sun', kind: 'planet', atmosphere: true, surface: false, color: '#e8bd93', orbitKm: 2000, elliptical: true },
  { id: 'io', name: 'Io', parent: 'jupiter', kind: 'moon', atmosphere: false, surface: true, color: '#e1d078', orbitKm: 100 },
  { id: 'europa', name: 'Europa', parent: 'jupiter', kind: 'moon', atmosphere: false, surface: true, color: '#d6c8ab', orbitKm: 100 },
  { id: 'ganymede', name: 'Ganymede', parent: 'jupiter', kind: 'moon', atmosphere: false, surface: true, color: '#b7aaa1', orbitKm: 100 },
  { id: 'callisto', name: 'Callisto', parent: 'jupiter', kind: 'moon', atmosphere: false, surface: true, color: '#b1a397', orbitKm: 100 },
  { id: 'saturn', name: 'Saturn', parent: 'sun', kind: 'planet', atmosphere: true, surface: false, color: '#e8cf96', elliptical: true },
  { id: 'mimas', name: 'Mimas', parent: 'saturn', kind: 'moon', atmosphere: false, surface: true, color: '#c8c9ca', orbitKm: 20 },
  { id: 'enceladus', name: 'Enceladus', parent: 'saturn', kind: 'moon', atmosphere: false, surface: true, color: '#dfeced', orbitKm: 20 },
  { id: 'tethys', name: 'Tethys', parent: 'saturn', kind: 'moon', atmosphere: false, surface: true, color: '#d3d7dd', orbitKm: 50 },
  { id: 'dione', name: 'Dione', parent: 'saturn', kind: 'moon', atmosphere: false, surface: true, color: '#d1cfc8', orbitKm: 50 },
  { id: 'rhea', name: 'Rhea', parent: 'saturn', kind: 'moon', atmosphere: false, surface: true, color: '#cbc8c1', orbitKm: 50 },
  { id: 'titan', name: 'Titan', parent: 'saturn', kind: 'moon', atmosphere: true, surface: true, color: '#dec07e', orbitKm: 1000 },
  { id: 'iapetus', name: 'Iapetus', parent: 'saturn', kind: 'moon', atmosphere: false, surface: true, color: '#c2bca9', orbitKm: 50 },
  { id: 'uranus', name: 'Uranus', parent: 'sun', kind: 'planet', atmosphere: true, surface: false, color: '#9edbdc', elliptical: true },
  { id: 'miranda', name: 'Miranda', parent: 'uranus', kind: 'moon', atmosphere: false, surface: true, color: '#d0cbc4', orbitKm: 20 },
  { id: 'ariel', name: 'Ariel', parent: 'uranus', kind: 'moon', atmosphere: false, surface: true, color: '#c7d1d6', orbitKm: 50 },
  { id: 'umbriel', name: 'Umbriel', parent: 'uranus', kind: 'moon', atmosphere: false, surface: true, color: '#aaa9b5', orbitKm: 50 },
  { id: 'titania', name: 'Titania', parent: 'uranus', kind: 'moon', atmosphere: false, surface: true, color: '#c6b7ad', orbitKm: 50 },
  { id: 'oberon', name: 'Oberon', parent: 'uranus', kind: 'moon', atmosphere: false, surface: true, color: '#b6a69f', orbitKm: 50 },
  { id: 'neptune', name: 'Neptune', parent: 'sun', kind: 'planet', atmosphere: true, surface: false, color: '#8aaef0', elliptical: true },
  { id: 'triton', name: 'Triton', parent: 'neptune', kind: 'moon', atmosphere: true, surface: true, color: '#e0c9c9', supportsAtmosphericBraking: false },
  { id: 'pluto', name: 'Pluto', parent: 'sun', kind: 'planet', atmosphere: true, surface: true, color: '#d7b9ae', elliptical: true, supportsAtmosphericBraking: false },
  { id: 'charon', name: 'Charon', parent: 'pluto', kind: 'moon', atmosphere: false, surface: true, color: '#b9b5bd', orbitKm: 50 },
]

const bodies: CelestialBody[] = bodyRows.map(body => ({
  id: `rss:${body.id}`,
  name: body.name,
  parentId: body.parent === null ? null : `rss:${body.parent}`,
  kind: body.kind,
  hasSurface: body.surface,
  hasAtmosphere: body.atmosphere,
  color: body.color,
  ...(body.supportsAtmosphericBraking !== undefined ? { supportsAtmosphericBraking: body.supportsAtmosphericBraking } : {}),
}))

const nodeId = (body: string, kind: NodeKind) => `rss:${body}:${kind}`
const nodes: RouteNode[] = bodyRows.flatMap(body => {
  if (body.kind === 'star') return []
  const kinds: NodeKind[] = [
    ...(body.surface ? ['surface' as const] : []),
    'orbit',
    ...(body.elliptical ? ['elliptical' as const] : []),
    'encounter',
  ]
  const labels: Record<NodeKind, string> = {
    surface: 'surface', orbit: 'low orbit', elliptical: 'elliptical capture orbit', encounter: 'encounter', reference: 'reference orbit',
  }
  return kinds.map(kind => ({
    id: nodeId(body.id, kind),
    bodyId: `rss:${body.id}`,
    kind,
    label: `${body.name} ${labels[kind]}`,
    ...(kind === 'orbit' && body.orbitKm !== undefined ? { altitudeKm: body.orbitKm } : {}),
  }))
})

const maneuvers: ManeuverEdge[] = []
const nameOf = (body: string) => bodyRows.find(row => row.id === body)?.name ?? body
function edge(from: string, to: string, deltaV: number, kind: ManeuverKind, label: string, assumptions: string[]) {
  maneuvers.push({ id: `${from}->${to}`, from, to, deltaV, kind, label, assumptions, sourceId: mapSourceId })
}

function surfaceBudget(body: string, deltaV: number) {
  const name = nameOf(body)
  const atmospheric = bodyRows.find(row => row.id === body)?.atmosphere ?? false
  edge(nodeId(body, 'surface'), nodeId(body, 'orbit'), deltaV, 'ascent', `${name} ascent`, [
    referenceEstimate,
    atmospheric ? 'Source launch allowance. Your craft, thrust-to-weight ratio, and flight path affect the actual cost.' : 'Ideal airless launch allowance. Terrain and craft losses are not simulated.',
  ])
  edge(nodeId(body, 'orbit'), nodeId(body, 'surface'), deltaV, 'descent', `${name} powered descent`, [
    referenceEstimate,
    atmospheric
      ? 'Landing placeholder equal to the source launch budget. It is not a verified landing estimate, and includes no savings from parachutes or atmospheric braking.'
      : 'Powered landing uses the source airless launch allowance in reverse. Craft losses and your descent path are not simulated.',
  ])
}

function localBudget(body: string, fromKind: 'orbit' | 'elliptical', toKind: 'elliptical' | 'encounter', segments: number[]) {
  const deltaV = segments.reduce((total, segment) => total + segment, 0)
  const name = nameOf(body)
  const fromLabel = fromKind === 'orbit' ? 'low orbit' : 'elliptical capture orbit'
  const toLabel = toKind === 'elliptical' ? 'elliptical capture orbit' : 'encounter'
  const assumptions = [referenceEstimate, noAssists,
    `Adds these neighboring map segments: ${segments.join(' + ')} = ${deltaV} m/s. Intermediate junctions are combined without adding a landing or parking stop.`,
  ]
  edge(nodeId(body, fromKind), nodeId(body, toKind), deltaV, 'escape', `${name}: ${fromLabel} → ${toLabel}`, [...assumptions])
  edge(nodeId(body, toKind), nodeId(body, fromKind), deltaV, 'capture', `${name}: ${toLabel} → ${fromLabel}`, [...assumptions])
}

function planetaryTransfer(body: string, segments: number[]) {
  const deltaV = segments.reduce((total, segment) => total + segment, 0)
  const assumptions = [referenceEstimate, noAssists,
    `Extra departure cost after Earth escape: the map segments add up to ${segments.join(' + ')} = ${deltaV} m/s. Earth escape (3210 m/s) and destination orbit entry are listed separately. Intermediate junctions describe transfer energy, not visits to those planets.`,
  ]
  edge(nodeId('earth', 'encounter'), nodeId(body, 'encounter'), deltaV, 'transfer', `Earth → ${nameOf(body)} transfer`, [...assumptions])
  edge(nodeId(body, 'encounter'), nodeId('earth', 'encounter'), deltaV, 'transfer', `${nameOf(body)} → Earth transfer`, [...assumptions])
}

function moonTransfer(parent: string, moon: string, parentKind: 'orbit' | 'elliptical', segments: number[]) {
  const deltaV = segments.reduce((total, segment) => total + segment, 0)
  const assumptions = [referenceEstimate, noAssists,
    `Transfer from ${nameOf(parent)} ${parentKind === 'orbit' ? 'low orbit' : 'elliptical capture orbit'} to ${nameOf(moon)} encounter: map segments add up to ${segments.join(' + ')} = ${deltaV} m/s. Intermediate junctions do not add visits to other moons or burns to enter orbit there.`,
  ]
  edge(nodeId(parent, parentKind), nodeId(moon, 'encounter'), deltaV, 'transfer', `${nameOf(parent)} → ${nameOf(moon)} transfer`, [...assumptions])
  edge(nodeId(moon, 'encounter'), nodeId(parent, parentKind), deltaV, 'transfer', `${nameOf(moon)} → ${nameOf(parent)} transfer`, [...assumptions])
}

// The diagram prints km/s. Every value below is converted to integer m/s.
surfaceBudget('earth', 9000)
localBudget('earth', 'orbit', 'encounter', [2440, 680, 90])
moonTransfer('earth', 'moon', 'orbit', [2440, 680])
localBudget('moon', 'orbit', 'encounter', [140, 680])
surfaceBudget('moon', 1720)

// Consecutive horizontal transfer increments are prefix-summed from Earth.
planetaryTransfer('venus', [280])
planetaryTransfer('mercury', [280, 2060])
planetaryTransfer('mars', [390])
planetaryTransfer('vesta', [390, 920])
planetaryTransfer('ceres', [390, 920, 380])
planetaryTransfer('jupiter', [390, 920, 380, 1400])
planetaryTransfer('saturn', [390, 920, 380, 1400, 990])
planetaryTransfer('uranus', [390, 920, 380, 1400, 990, 690])
planetaryTransfer('neptune', [390, 920, 380, 1400, 990, 690, 270])
planetaryTransfer('pluto', [390, 920, 380, 1400, 990, 690, 270, 110])

localBudget('mercury', 'elliptical', 'encounter', [6310])
localBudget('mercury', 'orbit', 'elliptical', [1220])
surfaceBudget('mercury', 3060)
localBudget('venus', 'elliptical', 'encounter', [360])
localBudget('venus', 'orbit', 'elliptical', [2940])
surfaceBudget('venus', 27000)
localBudget('mars', 'elliptical', 'encounter', [670])
localBudget('mars', 'orbit', 'elliptical', [340, 400, 700])
surfaceBudget('mars', 3600)
moonTransfer('mars', 'deimos', 'elliptical', [340])
localBudget('deimos', 'orbit', 'encounter', [650, 2])
surfaceBudget('deimos', 4)
moonTransfer('mars', 'phobos', 'elliptical', [340, 400])
localBudget('phobos', 'orbit', 'encounter', [540, 3])
surfaceBudget('phobos', 6)
localBudget('vesta', 'elliptical', 'encounter', [4110])
localBudget('vesta', 'orbit', 'elliptical', [100])
surfaceBudget('vesta', 160)
localBudget('ceres', 'elliptical', 'encounter', [4390])
localBudget('ceres', 'orbit', 'elliptical', [150])
surfaceBudget('ceres', 270)

localBudget('jupiter', 'elliptical', 'encounter', [270])
localBudget('jupiter', 'orbit', 'elliptical', [190, 930, 800, 1060, 1560, 4650, 8020])
moonTransfer('jupiter', 'callisto', 'elliptical', [190, 930])
localBudget('callisto', 'orbit', 'encounter', [4030, 700])
surfaceBudget('callisto', 1750)
moonTransfer('jupiter', 'ganymede', 'elliptical', [190, 930, 800])
localBudget('ganymede', 'orbit', 'encounter', [4790, 790])
surfaceBudget('ganymede', 1950)
moonTransfer('jupiter', 'europa', 'elliptical', [190, 930, 800, 1060])
localBudget('europa', 'orbit', 'encounter', [5920, 580])
surfaceBudget('europa', 1440)
moonTransfer('jupiter', 'io', 'elliptical', [190, 930, 800, 1060, 1560])
localBudget('io', 'orbit', 'encounter', [5790, 730])
surfaceBudget('io', 1780)

localBudget('saturn', 'elliptical', 'encounter', [420])
localBudget('saturn', 'orbit', 'elliptical', [300, 560, 1040, 670, 620, 640, 870, 5520])
moonTransfer('saturn', 'iapetus', 'elliptical', [300])
localBudget('iapetus', 'orbit', 'encounter', [2160, 160])
surfaceBudget('iapetus', 410)
moonTransfer('saturn', 'titan', 'elliptical', [300, 560])
localBudget('titan', 'orbit', 'encounter', [2200, 660])
surfaceBudget('titan', 7600)
moonTransfer('saturn', 'rhea', 'elliptical', [300, 560, 1040])
localBudget('rhea', 'orbit', 'encounter', [4010, 180])
surfaceBudget('rhea', 450)
moonTransfer('saturn', 'dione', 'elliptical', [300, 560, 1040, 670])
localBudget('dione', 'orbit', 'encounter', [4230, 140])
surfaceBudget('dione', 360)
moonTransfer('saturn', 'tethys', 'elliptical', [300, 560, 1040, 670, 620])
localBudget('tethys', 'orbit', 'encounter', [4290, 110])
surfaceBudget('tethys', 270)
moonTransfer('saturn', 'enceladus', 'elliptical', [300, 560, 1040, 670, 620, 640])
localBudget('enceladus', 'orbit', 'encounter', [4270, 70])
surfaceBudget('enceladus', 160)
moonTransfer('saturn', 'mimas', 'elliptical', [300, 560, 1040, 670, 620, 640, 870])
localBudget('mimas', 'orbit', 'encounter', [4020, 40])
surfaceBudget('mimas', 100)

localBudget('uranus', 'elliptical', 'encounter', [510])
localBudget('uranus', 'orbit', 'elliptical', [460, 150, 360, 350, 550, 4260])
moonTransfer('uranus', 'oberon', 'elliptical', [460])
localBudget('oberon', 'orbit', 'encounter', [1630, 210])
surfaceBudget('oberon', 530)
moonTransfer('uranus', 'titania', 'elliptical', [460, 150])
localBudget('titania', 'orbit', 'encounter', [1780, 220])
surfaceBudget('titania', 560)
moonTransfer('uranus', 'umbriel', 'elliptical', [460, 150, 360])
localBudget('umbriel', 'orbit', 'encounter', [2240, 150])
surfaceBudget('umbriel', 370)
moonTransfer('uranus', 'ariel', 'elliptical', [460, 150, 360, 350])
localBudget('ariel', 'orbit', 'encounter', [2310, 160])
surfaceBudget('ariel', 390)
moonTransfer('uranus', 'miranda', 'elliptical', [460, 150, 360, 350, 550])
localBudget('miranda', 'orbit', 'encounter', [2610, 50])
surfaceBudget('miranda', 130)

localBudget('neptune', 'elliptical', 'encounter', [350])
localBudget('neptune', 'orbit', 'elliptical', [50, 740, 1380, 4580])
moonTransfer('neptune', 'triton', 'elliptical', [50, 740])
localBudget('triton', 'orbit', 'encounter', [1710, 410])
surfaceBudget('triton', 1050)
localBudget('pluto', 'elliptical', 'encounter', [2700])
localBudget('pluto', 'orbit', 'elliptical', [40, 310])
surfaceBudget('pluto', 890)
moonTransfer('pluto', 'charon', 'elliptical', [40])
localBudget('charon', 'orbit', 'encounter', [20, 160])
surfaceBudget('charon', 420)

/** Unmodified historical map, retained for source transcription checks. */
export const rssReferencePack: PlanetPack = {
  id: 'rss',
  name: 'Real Solar System',
  shortName: 'RSS',
  transferHubBodyId: 'rss:earth',
  dataNotice: 'Map + calculations',
  version: 'community-map-dc472f5+rss-75139b9.reference',
  description: 'Older community Solar System map figures for the 33 bodies shared by the map and RSS configuration. This source-only copy keeps the original orbital budgets.',
  sources: [
    {
      id: mapSourceId,
      budgetType: 'reference',
      title: 'Delta-V Map of the Solar System · pinned community diagram',
      url: `https://github.com/davidson16807/mission-planner/blob/${mapCommit}/rss-dvmap.webp`,
    },
    {
      id: 'rss-official-configs',
      title: 'Real Solar System · pinned official body and atmosphere configs',
      url: `https://github.com/KSP-RO/RealSolarSystem/tree/${configCommit}/GameData/RealSolarSystem/RSSKopernicus`,
    },
  ],
  assumptions: [
    'All budgets are in m/s, converted from the community diagram’s km/s. The copy has no visible version, date, or author credit. Its exact repository revision is linked so the figures can be checked; they are not claimed to be official RSS calculations.',
    'Covers the 33 base RSS bodies also shown on the map. Optional expansion bodies, map-only minor moons and dwarf planets, geostationary orbits, Lagrange points, and Sun approach or landing missions are not included.',
    'The source-only copy follows the map\'s transfer lines, before the planner adds calculated direct planet and moon transfers.',
    'The source assumes ideal Hohmann transfers, burns near the lowest point of an orbit, and favorable positions. Launch windows, travel time, extra orbital-plane changes, gravity assists, real engine burns, and craft performance are not calculated. Add a reserve.',
    'Small costs along the map\'s transfer line add up from Earth; they are not each a separate Earth departure burn. Intermediate points on that line describe transfer energy, not visits to those bodies. Destination orbit entry and Earth escape (3210 m/s) are listed separately.',
    'Earth-to-Moon transfer is 3120 m/s; the Moon encounter-to-low-orbit budget is 140 + 680 = 820 m/s. Every other supported moon branches from its parent’s high elliptical capture orbit, not its low orbit.',
    'No atmospheric assistance is included in the default figures. Atmospheric landing allowances reuse the map launch figures as placeholders, not verified landing estimates. The reverse direction reuses the source map\'s idealized cost.',
    'Current RSS atmospheres differ from the diagram. The source-only copy omits old parking heights that lie inside today\'s atmospheres at Saturn, Uranus, Neptune, Pluto, and Triton; it does not silently change their costs. Pluto and Triton keep their actual atmosphere data, but have no atmospheric-braking markers because this source does not support them.',
    'Original map transfers use Earth as their starting reference. Arriving from one such transfer requires entering low orbit before starting another. Calculated direct pairs instead include departure and arrival burns at their stated orbits. Neither option assumes a free flyby connection.',
    'Sun has no selectable states. Jupiter, Saturn, Uranus, and Neptune have no landable surface states. The planner groups Ceres, Vesta, and Pluto with planets because they orbit the Sun; this is a navigation category, not an IAU classification.',
  ],
  bodies,
  nodes,
  maneuvers,
}

const modeledReferences = new Map([...rssOuterOrbitReferences, ...rssInnerOrbitReferences].map(reference => [reference.bodyId, reference]))
export const rssPack: PlanetPack = withDirectTransfers(withSiblingTransfers(withRssInnerReferences(withRssOuterReferences({
  ...rssReferencePack,
  version: 'community-map-dc472f5+rss-75139b9.5',
  description: 'Real Solar System planning estimates for 33 bodies. Combines community-map figures with recalculated high-orbit budgets and direct transfers between planets other than Earth and between moons orbiting the same body.',
  assumptions: [
    ...rssReferencePack.assumptions,
    'Calculated direct transfers connect low and high reference orbits at all ten supported bodies other than Earth that orbit the Sun. Vesta and Jupiter keep high orbits derived from compatible map figures. Mercury, Venus, Mars, Ceres, Saturn, Uranus, Neptune, and Pluto use explicitly chosen ellipses that remain around the body.',
    'The old Mercury, Venus, Mars, and Ceres low-to-high figures implied escape rather than a bound orbit with current RSS data. Chosen reference ellipses and recalculated local burns replace them. The original map copy is kept separately for checking.',
  ],
})), rssPhysicalReferences, [rssPhysicsSource]), rssPhysicalReferences.map(reference =>
  modeledReferences.get(reference.bodyId) ?? reference,
), rssCentralMu, [rssPhysicsSource])
