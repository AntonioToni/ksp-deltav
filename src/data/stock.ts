import type {
  CelestialBody,
  ManeuverEdge,
  ManeuverKind,
  NodeKind,
  PlanetPack,
  RouteNode,
} from '../types/planner'

const sourceId = 'kowgan-1.7.3'
const id = (body: string, kind: NodeKind) => `stock:${body}:${kind}`

// Numeric reference data transcribed from the linked stock map, not its artwork.
// Preserve separate directed maneuvers even where the map's estimate is equal.
const bodyRows: {
  id: string
  name: string
  parent: string | null
  kind: CelestialBody['kind']
  atmosphere: boolean
  color: string
}[] = [
  { id: 'kerbol', name: 'Kerbol', parent: null, kind: 'star', atmosphere: false, color: '#ffd36e' },
  { id: 'moho', name: 'Moho', parent: 'kerbol', kind: 'planet', atmosphere: false, color: '#c49a7a' },
  { id: 'eve', name: 'Eve', parent: 'kerbol', kind: 'planet', atmosphere: true, color: '#bd9afa' },
  { id: 'gilly', name: 'Gilly', parent: 'eve', kind: 'moon', atmosphere: false, color: '#d6b9a0' },
  { id: 'kerbin', name: 'Kerbin', parent: 'kerbol', kind: 'planet', atmosphere: true, color: '#70c8ed' },
  { id: 'mun', name: 'Mun', parent: 'kerbin', kind: 'moon', atmosphere: false, color: '#b8c4d2' },
  { id: 'minmus', name: 'Minmus', parent: 'kerbin', kind: 'moon', atmosphere: false, color: '#8bdfc1' },
  { id: 'duna', name: 'Duna', parent: 'kerbol', kind: 'planet', atmosphere: true, color: '#ee987d' },
  { id: 'ike', name: 'Ike', parent: 'duna', kind: 'moon', atmosphere: false, color: '#abb4ca' },
  { id: 'dres', name: 'Dres', parent: 'kerbol', kind: 'planet', atmosphere: false, color: '#c3b9ac' },
  { id: 'jool', name: 'Jool', parent: 'kerbol', kind: 'planet', atmosphere: true, color: '#b7d971' },
  { id: 'laythe', name: 'Laythe', parent: 'jool', kind: 'moon', atmosphere: true, color: '#8ebfe6' },
  { id: 'vall', name: 'Vall', parent: 'jool', kind: 'moon', atmosphere: false, color: '#a3d2ed' },
  { id: 'tylo', name: 'Tylo', parent: 'jool', kind: 'moon', atmosphere: false, color: '#d4c8a8' },
  { id: 'bop', name: 'Bop', parent: 'jool', kind: 'moon', atmosphere: false, color: '#bda895' },
  { id: 'pol', name: 'Pol', parent: 'jool', kind: 'moon', atmosphere: false, color: '#d2cf8f' },
  { id: 'eeloo', name: 'Eeloo', parent: 'kerbol', kind: 'planet', atmosphere: false, color: '#dde5ee' },
]

const bodies: CelestialBody[] = bodyRows.map((body) => ({
  id: `stock:${body.id}`,
  name: body.name,
  parentId: body.parent ? `stock:${body.parent}` : null,
  kind: body.kind,
  hasSurface: body.kind !== 'star' && body.id !== 'jool',
  hasAtmosphere: body.atmosphere,
  color: body.color,
}))

// The original map separates these high elliptical orbits from both low orbit
// and encounter. Moon branches must attach here rather than at low orbit.
const ellipticalBodies = new Set(['eve', 'duna', 'jool'])
const lowOrbitKm: Record<string, number> = {
  moho: 20, eve: 100, gilly: 10, kerbin: 80, mun: 14, minmus: 10,
  duna: 60, ike: 10, dres: 12, jool: 210, laythe: 60, vall: 15,
  tylo: 10, bop: 30, pol: 10, eeloo: 10,
}

const nodes: RouteNode[] = bodies.flatMap((body) => {
  if (body.kind === 'star') return []
  const shortId = body.id.slice('stock:'.length)
  const kinds: NodeKind[] = [
    ...(body.hasSurface ? ['surface' as const] : []),
    'orbit',
    ...(ellipticalBodies.has(shortId) ? ['elliptical' as const] : []),
    'encounter',
  ]
  const labels: Record<NodeKind, string> = {
    surface: 'surface', orbit: 'low orbit', elliptical: 'elliptical orbit', encounter: 'encounter', reference: 'reference orbit',
  }
  return kinds.map((kind) => ({
    id: id(shortId, kind),
    bodyId: body.id,
    kind,
    label: `${body.name} ${labels[kind]}`,
    ...(kind === 'orbit' ? { altitudeKm: lowOrbitKm[shortId] } : {}),
  }))
})

const maneuvers: ManeuverEdge[] = []
const bodyName = (body: string) => bodyRows.find((entry) => entry.id === body)?.name ?? body

function edge(
  from: string,
  to: string,
  deltaV: number,
  kind: ManeuverKind,
  label: string,
  assumptions: string[],
) {
  maneuvers.push({ id: `${from}->${to}`, from, to, deltaV, kind, label, sourceId, assumptions })
}

function surfaceBudget(body: string, deltaV: number) {
  const name = bodyName(body)
  const atmospheric = bodyRows.find((entry) => entry.id === body)?.atmosphere ?? false
  edge(id(body, 'surface'), id(body, 'orbit'), deltaV, 'ascent', `${name} ascent`, [
    atmospheric
      ? 'Typical atmospheric ascent budget from the source map; vehicle design and flight profile change the actual cost.'
      : 'Idealized vacuum ascent to the source map reference low orbit; add a mission margin.',
  ])
  edge(id(body, 'orbit'), id(body, 'surface'), deltaV, 'descent', `${name} powered descent`, [
    atmospheric
      ? 'Conservative placeholder budget: reuses the map ascent figure for powered descent. This is not a verified landing calculation; no parachute, aerobraking, or aerocapture savings are credited.'
      : 'Reverses the source map vacuum ascent estimate for a powered landing; actual descent losses depend on the vehicle and trajectory.',
  ])
}

function localOrbitBudget(body: string, fromKind: 'orbit' | 'elliptical', toKind: 'elliptical' | 'encounter', deltaV: number) {
  const name = bodyName(body)
  const fromLabel = fromKind === 'orbit' ? 'low orbit' : 'elliptical orbit'
  const toLabel = toKind === 'elliptical' ? 'elliptical orbit' : 'encounter'
  const assumptions = [
    'Idealized map segment for the documented reference orbit and transfer conditions; encounter energy is not simulated.',
    'Powered maneuver; no atmospheric assistance or gravity assists.',
  ]
  edge(id(body, fromKind), id(body, toKind), deltaV, 'escape', `${name}: ${fromLabel} → ${toLabel}`, assumptions)
  edge(id(body, toKind), id(body, fromKind), deltaV, 'capture', `${name}: ${toLabel} → ${fromLabel}`, assumptions)
}

function moonTransfer(parent: string, parentKind: 'orbit' | 'elliptical', moon: string, deltaV: number) {
  const assumptions = [
    `Map segment between ${bodyName(parent)} ${parentKind === 'orbit' ? 'low' : 'high elliptical'} orbit and ${bodyName(moon)} encounter.`,
    'Optimal transfer geometry; inclination corrections and timing constraints are excluded.',
  ]
  edge(id(parent, parentKind), id(moon, 'encounter'), deltaV, 'transfer', `${bodyName(parent)} → ${bodyName(moon)} transfer`, assumptions)
  edge(id(moon, 'encounter'), id(parent, parentKind), deltaV, 'transfer', `${bodyName(moon)} → ${bodyName(parent)} transfer`, assumptions)
}

function interplanetaryTransfer(body: string, deltaV: number) {
  const assumptions = [
    'Incremental interplanetary map budget beyond the separate Kerbin escape segment; this value alone is not a launch-to-destination total.',
    'Favorable transfer window; the source map maximum plane-change allowance is excluded.',
    'Reverse direction reuses the schematic segment estimate; departure and arrival energy are not calculated from orbital elements.',
  ]
  edge(id('kerbin', 'encounter'), id(body, 'encounter'), deltaV, 'transfer', `Kerbin → ${bodyName(body)} transfer`, assumptions)
  edge(id(body, 'encounter'), id('kerbin', 'encounter'), deltaV, 'transfer', `${bodyName(body)} → Kerbin transfer`, assumptions)
}

// KSP 1.7.3 stock map numbers. Keep these audit-friendly rather than deriving
// every body's costs from physical constants or from an unrelated second table.
surfaceBudget('moho', 870)
surfaceBudget('eve', 8000)
surfaceBudget('gilly', 30)
surfaceBudget('kerbin', 3400)
surfaceBudget('mun', 580)
surfaceBudget('minmus', 180)
surfaceBudget('duna', 1450)
surfaceBudget('ike', 390)
surfaceBudget('dres', 430)
surfaceBudget('laythe', 2900)
surfaceBudget('vall', 860)
surfaceBudget('tylo', 2270)
surfaceBudget('bop', 230)
surfaceBudget('pol', 130)
surfaceBudget('eeloo', 620)

localOrbitBudget('moho', 'orbit', 'encounter', 2400)
localOrbitBudget('eve', 'orbit', 'elliptical', 1300)
localOrbitBudget('eve', 'elliptical', 'encounter', 80)
localOrbitBudget('gilly', 'orbit', 'encounter', 410)
localOrbitBudget('kerbin', 'orbit', 'encounter', 950)
localOrbitBudget('mun', 'orbit', 'encounter', 280)
localOrbitBudget('minmus', 'orbit', 'encounter', 150)
localOrbitBudget('duna', 'orbit', 'elliptical', 360)
localOrbitBudget('duna', 'elliptical', 'encounter', 250)
localOrbitBudget('ike', 'orbit', 'encounter', 150)
localOrbitBudget('dres', 'orbit', 'encounter', 1300)
localOrbitBudget('jool', 'orbit', 'elliptical', 2780)
localOrbitBudget('jool', 'elliptical', 'encounter', 160)
localOrbitBudget('laythe', 'orbit', 'encounter', 890)
localOrbitBudget('vall', 'orbit', 'encounter', 850)
localOrbitBudget('tylo', 'orbit', 'encounter', 1050)
localOrbitBudget('bop', 'orbit', 'encounter', 890)
localOrbitBudget('pol', 'orbit', 'encounter', 810)
localOrbitBudget('eeloo', 'orbit', 'encounter', 1370)

moonTransfer('eve', 'elliptical', 'gilly', 60)
moonTransfer('kerbin', 'orbit', 'mun', 860)
moonTransfer('kerbin', 'orbit', 'minmus', 930)
moonTransfer('duna', 'elliptical', 'ike', 30)
moonTransfer('jool', 'elliptical', 'laythe', 930)
moonTransfer('jool', 'elliptical', 'vall', 620)
moonTransfer('jool', 'elliptical', 'tylo', 400)
moonTransfer('jool', 'elliptical', 'bop', 220)
moonTransfer('jool', 'elliptical', 'pol', 160)

interplanetaryTransfer('moho', 760)
interplanetaryTransfer('eve', 90)
interplanetaryTransfer('duna', 130)
interplanetaryTransfer('dres', 610)
interplanetaryTransfer('jool', 980)
interplanetaryTransfer('eeloo', 1140)

export const stockPack: PlanetPack = {
  id: 'stock',
  name: 'Stock Kerbol system',
  shortName: 'Stock',
  transferHubBodyId: 'stock:kerbin',
  version: '1.7.3-map.1',
  description: 'An idealized stock-system Delta-V budget map with directed maneuvers and explicit reference orbits.',
  sources: [{
    id: sourceId,
    title: 'Kowgan / WAC community stock Delta-V map · KSP 1.7.3',
    url: 'https://github.com/Kowgan/ksp_cheat_sheets/blob/ca2d4910dd98e5fd14277b04ec686e61cd6967ce/delta_v_map_vanilla/DvMap_A4.svg',
  }],
  assumptions: [
    'All budgets are in m/s and use the source map reference orbits. These are schematic estimates, not a trajectory simulation.',
    'Favorable launch windows and idealized transfers. Plane-change allowances, launch dates, travel time, gravity assists, and spacecraft performance are excluded; add a mission margin.',
    'No atmospheric assistance is credited. Atmospheric powered-descent budgets are conservative placeholders equal to the ascent map budget, not verified landing calculations.',
    'Only Kerbin-centered interplanetary transfer segments are provided. Routes between other planetary systems require capture into a low parking orbit before the next interplanetary departure; direct transfers and encounter-to-encounter flyby chaining are not modeled.',
    'Eve, Duna, and Jool moon transfers branch from high elliptical orbit. Low-orbit capture and moon transfer costs must not be conflated.',
    'Kerbol has no selectable mission states; Jool has no surface. Surface states are omitted where landing is unsupported.',
  ],
  bodies,
  nodes,
  maneuvers,
}
