import type { CelestialBody, ManeuverEdge, ManeuverKind, NodeKind, PlanetPack, RouteNode } from '../types/planner'
import { stockPack } from './stock'

const mapSourceId = 'kowgan-opm-1.8.1'
const karenSourceId = 'opm-analytic-karen'
const configCommit = 'ffedf02e23d2d620e1018d1467f5e485f7950fa0'
const configBase = `https://github.com/Poodmund/Outer-Planets-Mod/blob/${configCommit}/GameData/OPM/KopernicusConfigs`

const historicalBudget = 'Historical OPM 1.8.1 map estimate; current OPM atmospheres and orbital parameters differ. This is a schematic planning budget, not a calibrated modern trajectory.'
const noPlaneChange = 'Favorable transfer geometry; plane changes, timing constraints, gravity assists, and atmospheric savings are excluded.'

const bodyRows: {
  id: string
  name: string
  parentId: string
  kind: CelestialBody['kind']
  atmosphere: boolean
  surface: boolean
  color: string
  orbitKm?: number
  elliptical?: boolean
}[] = [
  { id: 'sarnus', name: 'Sarnus', parentId: 'stock:kerbol', kind: 'planet', atmosphere: true, surface: false, color: '#e6bc8b', elliptical: true },
  { id: 'hale', name: 'Hale', parentId: 'opm:sarnus', kind: 'moon', atmosphere: false, surface: true, color: '#cfc6b6', orbitKm: 8 },
  { id: 'ovok', name: 'Ovok', parentId: 'opm:sarnus', kind: 'moon', atmosphere: false, surface: true, color: '#ddd5cd', orbitKm: 10 },
  { id: 'slate', name: 'Slate', parentId: 'opm:sarnus', kind: 'moon', atmosphere: false, surface: true, color: '#b6a18b', orbitKm: 25 },
  { id: 'tekto', name: 'Tekto', parentId: 'opm:sarnus', kind: 'moon', atmosphere: true, surface: true, color: '#a5c19a', orbitKm: 120 },
  { id: 'urlum', name: 'Urlum', parentId: 'stock:kerbol', kind: 'planet', atmosphere: true, surface: false, color: '#8edbd6', elliptical: true },
  { id: 'polta', name: 'Polta', parentId: 'opm:urlum', kind: 'moon', atmosphere: false, surface: true, color: '#b6c4b4', orbitKm: 15 },
  { id: 'priax', name: 'Priax', parentId: 'opm:urlum', kind: 'moon', atmosphere: false, surface: true, color: '#a89f94', orbitKm: 45 },
  { id: 'wal', name: 'Wal', parentId: 'opm:urlum', kind: 'moon', atmosphere: false, surface: true, color: '#cab28b', orbitKm: 35 },
  { id: 'tal', name: 'Tal', parentId: 'opm:wal', kind: 'moon', atmosphere: false, surface: true, color: '#b5aaa4', orbitKm: 20 },
  { id: 'neidon', name: 'Neidon', parentId: 'stock:kerbol', kind: 'planet', atmosphere: true, surface: false, color: '#a99bf1', elliptical: true },
  { id: 'thatmo', name: 'Thatmo', parentId: 'opm:neidon', kind: 'moon', atmosphere: true, surface: true, color: '#cad7e2' },
  { id: 'nissee', name: 'Nissee', parentId: 'opm:neidon', kind: 'moon', atmosphere: false, surface: true, color: '#cabeba', orbitKm: 10 },
  { id: 'plock', name: 'Plock', parentId: 'stock:kerbol', kind: 'planet', atmosphere: false, surface: true, color: '#d7bcb0', orbitKm: 10, elliptical: true },
  // Karen is absent from the historical map. Its three budgets are derived
  // from the pinned official configs below, not copied from an unrelated moon.
  { id: 'karen', name: 'Karen', parentId: 'opm:plock', kind: 'moon', atmosphere: false, surface: true, color: '#b99a99', orbitKm: 10 },
]

const newBodies: CelestialBody[] = bodyRows.map(body => ({
  id: `opm:${body.id}`,
  name: body.name,
  parentId: body.parentId,
  kind: body.kind,
  hasSurface: body.surface,
  hasAtmosphere: body.atmosphere,
  color: body.color,
}))

const newNodes: RouteNode[] = bodyRows.flatMap(body => {
  const kinds: NodeKind[] = [
    ...(body.surface ? ['surface' as const] : []),
    'orbit',
    ...(body.elliptical ? ['elliptical' as const] : []),
    'encounter',
  ]
  const labels: Record<NodeKind, string> = {
    surface: 'surface', orbit: 'low orbit', elliptical: 'elliptical orbit', encounter: 'encounter',
  }
  return kinds.map(kind => ({
    id: `opm:${body.id}:${kind}`,
    bodyId: `opm:${body.id}`,
    kind,
    label: `${body.name} ${labels[kind]}`,
    ...(kind === 'orbit' && body.orbitKm !== undefined ? { altitudeKm: body.orbitKm } : {}),
  }))
})

// Shared IDs survive pack switches. Clone every retained object/array so the
// OPM Eeloo reparenting and maneuver replacement never mutate the stock pack.
const bodies: CelestialBody[] = [
  ...stockPack.bodies.map(body => body.id === 'stock:eeloo'
    ? { ...body, parentId: 'opm:sarnus', kind: 'moon' as const }
    : { ...body }),
  ...newBodies,
]
const nodes = [...stockPack.nodes.map(node => ({ ...node })), ...newNodes]
const maneuvers: ManeuverEdge[] = stockPack.maneuvers
  .filter(edge => !edge.from.startsWith('stock:eeloo:') && !edge.to.startsWith('stock:eeloo:'))
  .map(edge => ({ ...edge, assumptions: [...edge.assumptions] }))

const nodeId = (body: string, kind: NodeKind) => `${body}:${kind}`
const nameOf = (bodyId: string) => bodies.find(body => body.id === bodyId)?.name ?? bodyId

function addEdge(from: string, to: string, deltaV: number, kind: ManeuverKind, label: string, assumptions: string[], sourceId = mapSourceId) {
  maneuvers.push({ id: `${from}->${to}`, from, to, deltaV, kind, label, assumptions, sourceId })
}

function surfaceBudget(bodyId: string, deltaV: number, sourceId = mapSourceId, extraAssumptions: string[] = []) {
  const name = nameOf(bodyId)
  const atmospheric = bodies.find(body => body.id === bodyId)?.hasAtmosphere ?? false
  const common = sourceId === mapSourceId ? [historicalBudget] : []
  addEdge(nodeId(bodyId, 'surface'), nodeId(bodyId, 'orbit'), deltaV, 'ascent', `${name} ascent`, [
    ...common,
    atmospheric ? 'Typical atmospheric ascent budget; vehicle design and flight profile change the actual cost.' : 'Vacuum ascent estimate; add a vehicle-specific mission margin.',
    ...extraAssumptions,
  ], sourceId)
  addEdge(nodeId(bodyId, 'orbit'), nodeId(bodyId, 'surface'), deltaV, 'descent', `${name} powered descent`, [
    ...common,
    atmospheric
      ? 'Conservative placeholder powered-descent budget equal to the map ascent estimate, not a verified landing calculation. No parachute or atmospheric savings are credited.'
      : 'Powered descent reuses the idealized vacuum ascent estimate; vehicle losses and landing trajectory are not simulated.',
    ...extraAssumptions,
  ], sourceId)
}

function localBudget(bodyId: string, fromKind: 'orbit' | 'elliptical', toKind: 'elliptical' | 'encounter', deltaV: number, sourceId = mapSourceId, extraAssumptions: string[] = []) {
  const name = nameOf(bodyId)
  const fromLabel = fromKind === 'orbit' ? 'low orbit' : 'elliptical orbit'
  const toLabel = toKind === 'elliptical' ? 'elliptical orbit' : 'encounter'
  const assumptions = [...(sourceId === mapSourceId ? [historicalBudget] : []), noPlaneChange, ...extraAssumptions]
  addEdge(nodeId(bodyId, fromKind), nodeId(bodyId, toKind), deltaV, 'escape', `${name}: ${fromLabel} → ${toLabel}`, [...assumptions], sourceId)
  addEdge(nodeId(bodyId, toKind), nodeId(bodyId, fromKind), deltaV, 'capture', `${name}: ${toLabel} → ${fromLabel}`, [...assumptions], sourceId)
}

function moonTransfer(parentId: string, moonId: string, deltaV: number, sourceId = mapSourceId, extraAssumptions: string[] = []) {
  const assumptions = [
    ...(sourceId === mapSourceId ? [historicalBudget] : []),
    `Segment between ${nameOf(parentId)} low orbit and ${nameOf(moonId)} encounter.`,
    noPlaneChange,
    ...extraAssumptions,
  ]
  addEdge(nodeId(parentId, 'orbit'), nodeId(moonId, 'encounter'), deltaV, 'transfer', `${nameOf(parentId)} → ${nameOf(moonId)} transfer`, [...assumptions], sourceId)
  addEdge(nodeId(moonId, 'encounter'), nodeId(parentId, 'orbit'), deltaV, 'transfer', `${nameOf(moonId)} → ${nameOf(parentId)} transfer`, [...assumptions], sourceId)
}

function planetaryTransfer(bodyId: string, deltaV: number, extraAssumptions: string[] = []) {
  const assumptions = [
    historicalBudget,
    'Incremental map budget beyond the separate Kerbin escape segment; this is not a complete launch-to-destination total.',
    noPlaneChange,
    ...extraAssumptions,
  ]
  addEdge('stock:kerbin:encounter', nodeId(bodyId, 'encounter'), deltaV, 'transfer', `Kerbin → ${nameOf(bodyId)} transfer`, [...assumptions])
  addEdge(nodeId(bodyId, 'encounter'), 'stock:kerbin:encounter', deltaV, 'transfer', `${nameOf(bodyId)} → Kerbin transfer`, [...assumptions])
}

// Kowgan OPM 1.8.1, page 2: copy individual printed segments, not stale totals.
// Gas giants have orbit states only; their printed "surface" budgets are omitted.
planetaryTransfer('opm:sarnus', 1390)
localBudget('opm:sarnus', 'elliptical', 'encounter', 1660)
localBudget('opm:sarnus', 'orbit', 'elliptical', 1580)
moonTransfer('opm:sarnus', 'opm:hale', 540)
localBudget('opm:hale', 'orbit', 'encounter', 450)
surfaceBudget('opm:hale', 40)
moonTransfer('opm:sarnus', 'opm:ovok', 650)
localBudget('opm:ovok', 'orbit', 'encounter', 400)
surfaceBudget('opm:ovok', 70)
moonTransfer('opm:sarnus', 'stock:eeloo', 1120)
localBudget('stock:eeloo', 'orbit', 'encounter', 490)
surfaceBudget('stock:eeloo', 540)
moonTransfer('opm:sarnus', 'opm:slate', 1460)
localBudget('opm:slate', 'orbit', 'encounter', 890)
surfaceBudget('opm:slate', 2150)
moonTransfer('opm:sarnus', 'opm:tekto', 1540)
localBudget('opm:tekto', 'orbit', 'encounter', 350)
surfaceBudget('opm:tekto', 2600)

planetaryTransfer('opm:urlum', 1600)
localBudget('opm:urlum', 'elliptical', 'encounter', 1490)
localBudget('opm:urlum', 'orbit', 'elliptical', 940)
// The source's shared Polta/Priax intercept branch is represented as two
// separate encounter nodes, each with the same 620 m/s parent transfer.
moonTransfer('opm:urlum', 'opm:polta', 620)
localBudget('opm:polta', 'orbit', 'encounter', 440)
surfaceBudget('opm:polta', 640)
moonTransfer('opm:urlum', 'opm:priax', 620)
localBudget('opm:priax', 'orbit', 'encounter', 460)
surfaceBudget('opm:priax', 260)
moonTransfer('opm:urlum', 'opm:wal', 900)
localBudget('opm:wal', 'orbit', 'encounter', 810)
surfaceBudget('opm:wal', 1200)
moonTransfer('opm:wal', 'opm:tal', 380)
localBudget('opm:tal', 'orbit', 'encounter', 150)
surfaceBudget('opm:tal', 100)

planetaryTransfer('opm:neidon', 1700)
localBudget('opm:neidon', 'elliptical', 'encounter', 1340)
localBudget('opm:neidon', 'orbit', 'elliptical', 1040)
moonTransfer('opm:neidon', 'opm:thatmo', 930)
localBudget('opm:thatmo', 'orbit', 'encounter', 450)
surfaceBudget('opm:thatmo', 950)
moonTransfer('opm:neidon', 'opm:nissee', 1000)
localBudget('opm:nissee', 'orbit', 'encounter', 360)
surfaceBudget('opm:nissee', 850)

planetaryTransfer('opm:plock', 2700, ['The source map gives a 1900–2700 m/s transfer range. This pack uses the conservative upper endpoint, 2700 m/s; the launch epoch is not simulated.'])
localBudget('opm:plock', 'elliptical', 'encounter', 900)
localBudget('opm:plock', 'orbit', 'elliptical', 210)
surfaceBudget('opm:plock', 480)

// Karen is absent from the historical map. These values are calculated from
// official OPM config constants, with the derivation published in docs/DATA.md.
// μ = g0 * geeASL * radius². Use 10 km parking orbits and round budgets UP to m/s.
const standardGravity = 9.80665
const plockRadius = 189000
const karenRadius = 85050
const plockMu = standardGravity * 0.148 * plockRadius ** 2
const karenMu = standardGravity * 0.066 * karenRadius ** 2
const plockParkingRadius = plockRadius + 10000
const karenParkingRadius = karenRadius + 10000
const karenSemiMajorAxis = 2457800
const transferDeparture = Math.sqrt(plockMu / plockParkingRadius) *
  (Math.sqrt(2 * karenSemiMajorAxis / (plockParkingRadius + karenSemiMajorAxis)) - 1)
const encounterExcessSpeed = Math.sqrt(plockMu / karenSemiMajorAxis) *
  (1 - Math.sqrt(2 * plockParkingRadius / (plockParkingRadius + karenSemiMajorAxis)))
const karenCapture = Math.sqrt(encounterExcessSpeed ** 2 + 2 * karenMu / karenParkingRadius) -
  Math.sqrt(karenMu / karenParkingRadius)
const ascentSemiMajorAxis = (karenRadius + karenParkingRadius) / 2
const karenAscent = Math.sqrt(karenMu * (2 / karenRadius - 1 / ascentSemiMajorAxis)) +
  Math.sqrt(karenMu / karenParkingRadius) - Math.sqrt(karenMu * (2 / karenParkingRadius - 1 / ascentSemiMajorAxis))
const karenAssumptions = [
  'Analytic estimate from pinned official OPM Plock/Karen radius, gravity, and orbit constants; Karen is absent from the historical Delta-V map.',
  'Ideal coplanar two-body patched-conic transfer, 10 km parking orbits. Each derived segment is rounded upward to a whole m/s.',
  'No finite-thrust, gravity-loss, terrain, rotation, third-body, or optional SigmaBinary modeling; add a vehicle-specific mission margin. This is not a flight-tested budget.',
]
moonTransfer('opm:plock', 'opm:karen', Math.ceil(transferDeparture), karenSourceId, karenAssumptions)
localBudget('opm:karen', 'orbit', 'encounter', Math.ceil(karenCapture), karenSourceId, karenAssumptions)
surfaceBudget('opm:karen', Math.ceil(karenAscent), karenSourceId, karenAssumptions)

export const opmPack: PlanetPack = {
  id: 'opm',
  name: 'Outer Planets Mod',
  shortName: 'OPM',
  dataNotice: 'Legacy estimates',
  version: '1.8.1-map+config-ffedf02.1',
  description: 'Stock plus the Outer Planets Mod: historical community-map planning budgets with current body hierarchy and explicitly derived Karen estimates. Not calibrated for current OPM atmospheres.',
  transferHubBodyId: 'stock:kerbin',
  sources: [
    ...stockPack.sources.map(source => ({ ...source })),
    {
      id: mapSourceId,
      title: 'Kowgan community Outer Planets Mod Delta-V map · OPM 1.8.1',
      url: 'https://github.com/Kowgan/ksp_cheat_sheets/blob/ca2d4910dd98e5fd14277b04ec686e61cd6967ce/delta_v_map_outer_planets/DvMap_OP_2_A4.svg',
    },
    {
      id: 'opm-official-configs',
      title: 'Official OPM body hierarchy and atmosphere configs · pinned revision',
      url: `https://github.com/Poodmund/Outer-Planets-Mod/tree/${configCommit}/GameData/OPM/KopernicusConfigs`,
    },
    {
      id: karenSourceId,
      title: 'Karen analytic estimates · official radius, gravity, and orbital constants',
      url: `${configBase}/PlockMoons/Karen.cfg`,
    },
    {
      id: 'opm-analytic-plock',
      title: 'Plock constants used for the analytic Karen transfer',
      url: `${configBase}/OuterPlanets/Plock.cfg`,
    },
  ],
  assumptions: [
    ...stockPack.assumptions.filter(note => !note.startsWith('Kerbol has no selectable')),
    'OPM uses historical 1.8.1 map budgets with current official body hierarchy. Modern atmospheres and orbits differ: these estimates are not calibrated for current OPM trajectories. Misleading legacy parking altitudes inside modern atmospheres are intentionally omitted.',
    'Eeloo becomes a Sarnus moon and uses the OPM map budgets (1120 m/s transfer, 490 m/s capture, 540 m/s surface). Other shared stock bodies retain the newer stock-map estimates.',
    'OPM moon transfers branch from parent low orbit, including Tal from Wal. High elliptical and low parking orbit remain separate reference states.',
    'Plock uses 2700 m/s, the upper endpoint of the historical 1900–2700 m/s transfer range. Launch epoch and eccentric-orbit transfer variation are not simulated.',
    'Karen budgets are analytic estimates from pinned official OPM constants with 10 km parking orbits, rounded upward to whole m/s. They omit finite-thrust, gravity-loss, terrain, rotation, and third-body/SigmaBinary effects; add a mission margin.',
    'Kerbol has no selectable states. Jool, Sarnus, Urlum, and Neidon have no landable surface states.',
  ],
  bodies,
  nodes,
  maneuvers,
}
