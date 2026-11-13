import type { CelestialBody, ManeuverEdge, ManeuverKind, NodeKind, PlanetPack, RouteNode } from '../types/planner'
import { stockPack } from './stock'
import { opmCentralMu, opmConfigBase, opmConfigSource, opmHomeReference, opmReferences } from './opmReference'
import { hohmannArrivalSpeed, hohmannTransfer, parkingOrbitBurn, splitCapture, surfaceOrbitBudget } from '../utils/orbitalBudgets'
import { withDirectTransfers } from './directTransfers'
import { withSiblingTransfers } from './siblingTransfers'
import { stockPhysicalReferences } from './stockPhysics'

const mapSourceId = 'kowgan-opm-1.8.1'
const analyticSourceId = 'opm-analytic-2.2.12'
const references = new Map(opmReferences.map(reference => [reference.bodyId, reference]))
const analyticAssumptions = [
  'Calculated from official OPM 2.2.12 body and orbit data at the linked source revision. Each maneuver is rounded up to a whole m/s.',
  'Uses a Hohmann transfer between circular reference orbits at the listed orbital distances. Arrival speed includes orbital tilt at an assumed crossing of the orbital planes, including Thatmo\'s backward orbit.',
  'Does not choose a launch date, track changing distances along eccentric orbits, or solve the alignment and aiming of successive encounters. Parking-orbit orientation, gravity assists, and losses during real engine burns are also excluded. A multi-stop sum is a budget estimate, not a simulated flight.',
  'The return direction reuses the same reference cost. It is not calculated for a particular return date. Add a reserve for your craft and flight.',
]
const atmosphericAllowance = 'Uses the older OPM 1.8.1 atmospheric launch/landing allowance. It has not been recalculated for this orbit height or your craft, and is not a verified cost or a guaranteed maximum.'

const bodyRows: {
  id: string
  name: string
  parentId: string
  kind: CelestialBody['kind']
  atmosphere: boolean
  surface: boolean
  color: string
  elliptical?: boolean
}[] = [
  { id: 'sarnus', name: 'Sarnus', parentId: 'stock:kerbol', kind: 'planet', atmosphere: true, surface: false, color: '#e6bc8b', elliptical: true },
  { id: 'hale', name: 'Hale', parentId: 'opm:sarnus', kind: 'moon', atmosphere: false, surface: true, color: '#cfc6b6' },
  { id: 'ovok', name: 'Ovok', parentId: 'opm:sarnus', kind: 'moon', atmosphere: false, surface: true, color: '#ddd5cd' },
  { id: 'slate', name: 'Slate', parentId: 'opm:sarnus', kind: 'moon', atmosphere: false, surface: true, color: '#b6a18b' },
  { id: 'tekto', name: 'Tekto', parentId: 'opm:sarnus', kind: 'moon', atmosphere: true, surface: true, color: '#a5c19a' },
  { id: 'urlum', name: 'Urlum', parentId: 'stock:kerbol', kind: 'planet', atmosphere: true, surface: false, color: '#8edbd6', elliptical: true },
  { id: 'polta', name: 'Polta', parentId: 'opm:urlum', kind: 'moon', atmosphere: false, surface: true, color: '#b6c4b4' },
  { id: 'priax', name: 'Priax', parentId: 'opm:urlum', kind: 'moon', atmosphere: false, surface: true, color: '#a89f94' },
  { id: 'wal', name: 'Wal', parentId: 'opm:urlum', kind: 'moon', atmosphere: false, surface: true, color: '#cab28b' },
  { id: 'tal', name: 'Tal', parentId: 'opm:wal', kind: 'moon', atmosphere: false, surface: true, color: '#b5aaa4' },
  { id: 'neidon', name: 'Neidon', parentId: 'stock:kerbol', kind: 'planet', atmosphere: true, surface: false, color: '#a99bf1', elliptical: true },
  { id: 'thatmo', name: 'Thatmo', parentId: 'opm:neidon', kind: 'moon', atmosphere: true, surface: true, color: '#cad7e2' },
  { id: 'nissee', name: 'Nissee', parentId: 'opm:neidon', kind: 'moon', atmosphere: false, surface: true, color: '#cabeba' },
  { id: 'plock', name: 'Plock', parentId: 'stock:kerbol', kind: 'planet', atmosphere: false, surface: true, color: '#d7bcb0', elliptical: true },
  { id: 'karen', name: 'Karen', parentId: 'opm:plock', kind: 'moon', atmosphere: false, surface: true, color: '#b99a99' },
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
    surface: 'surface', orbit: 'low orbit', elliptical: 'elliptical orbit', encounter: 'encounter', reference: 'reference orbit',
  }
  return kinds.map(kind => ({
    id: `opm:${body.id}:${kind}`,
    bodyId: `opm:${body.id}`,
    kind,
    label: `${body.name} ${labels[kind]}`,
    ...(kind === 'orbit' ? { altitudeKm: references.get(`opm:${body.id}`)!.parkingAltitudeM / 1000 } : {}),
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

function addPair(from: string, to: string, deltaV: number, outwardKind: ManeuverKind, inwardKind: ManeuverKind, outwardLabel: string, inwardLabel: string, assumptions: string[], sourceId = analyticSourceId) {
  const budget = Math.ceil(deltaV)
  maneuvers.push(
    { id: `${from}->${to}`, from, to, deltaV: budget, kind: outwardKind, label: outwardLabel, assumptions: [...assumptions], sourceId },
    { id: `${to}->${from}`, from: to, to: from, deltaV: budget, kind: inwardKind, label: inwardLabel, assumptions: [...assumptions], sourceId },
  )
}

// Keep the four high-ellipse states, now with a reproducible bound ellipse:
// periapsis = selected low-orbit radius; apoapsis = half the body's nominal SOI.
const ellipticalBodies = new Set(bodyRows.filter(body => body.elliptical).map(body => `opm:${body.id}`))
const homeParkingRadius = opmHomeReference.radiusM + opmHomeReference.parkingAltitudeM
const homeEscapeBudget = stockPack.maneuvers.find(edge => edge.from === 'stock:kerbin:orbit' && edge.to === 'stock:kerbin:encounter')!.deltaV

for (const reference of opmReferences) {
  const { bodyId, parentBodyId, gravitationalParameter: mu, radiusM, parkingAltitudeM } = reference
  const name = nameOf(bodyId)
  const parkingRadius = radiusM + parkingAltitudeM
  const orbitNote = `Assumed circular parking orbit: ${parkingAltitudeM / 1000} km above the surface. The planner chose this height above the current atmosphere; the mod does not prescribe it.`
  const assumptions = [...analyticAssumptions, orbitNote, `Physical/orbital source: ${opmConfigBase}/${reference.configPath}`]
  let arrivalExcessSpeed: number

  if (parentBodyId === 'stock:kerbol') {
    const transfer = hohmannTransfer(opmCentralMu, opmHomeReference.semiMajorAxisM, reference.semiMajorAxisM)
    arrivalExcessSpeed = hohmannArrivalSpeed(opmCentralMu, opmHomeReference.semiMajorAxisM, reference.semiMajorAxisM, reference.inclinationDeg)
    const fullHomeBurn = parkingOrbitBurn(opmHomeReference.gravitationalParameter, homeParkingRadius, transfer.departureDeltaV)
    // The shared Kerbin edge already charges 950 m/s in either direction.
    // Rounding the full burn before subtracting preserves its rounded total.
    const increment = Math.max(0, Math.ceil(fullHomeBurn) - homeEscapeBudget)
    addPair('stock:kerbin:encounter', nodeId(bodyId, 'encounter'), increment, 'transfer', 'transfer', `Kerbin → ${name} transfer`, `${name} → Kerbin transfer`, [
      ...assumptions,
      `Extra cost after the separately listed ${homeEscapeBudget} m/s Kerbin escape/capture burn. The two add up to ${Math.ceil(fullHomeBurn)} m/s from the assumed 80 km parking orbit, rounded up.`,
    ])
  } else {
    const parent = references.get(parentBodyId)!
    const parentParkingRadius = parent.radiusM + parent.parkingAltitudeM
    const transfer = hohmannTransfer(parent.gravitationalParameter, parentParkingRadius, reference.semiMajorAxisM)
    arrivalExcessSpeed = hohmannArrivalSpeed(parent.gravitationalParameter, parentParkingRadius, reference.semiMajorAxisM, reference.inclinationDeg)
    addPair(nodeId(parentBodyId, 'orbit'), nodeId(bodyId, 'encounter'), transfer.departureDeltaV, 'transfer', 'transfer', `${nameOf(parentBodyId)} → ${name} transfer`, `${name} → ${nameOf(parentBodyId)} transfer`, [
      ...assumptions,
      `Hohmann transfer from ${nameOf(parentBodyId)} low orbit. The burn to enter orbit around ${name} is listed separately.`,
    ])
  }

  const encounterNote = `Assumed approach speed relative to the body: ${arrivalExcessSpeed.toFixed(3)} m/s, using the source orbital tilt of ${reference.inclinationDeg}°. This does not solve every possible orbital-plane change.`
  if (ellipticalBodies.has(bodyId)) {
    const apoapsisRadius = reference.sphereOfInfluenceM / 2
    const split = splitCapture(mu, parkingRadius, apoapsisRadius, arrivalExcessSpeed)
    const ellipseNote = `Assumed high ellipse: closest point ${parkingAltitudeM / 1000} km above the surface; farthest point ${(apoapsisRadius / 1000).toFixed(3)} km from the center, halfway to the nominal sphere-of-influence boundary.`
    addPair(nodeId(bodyId, 'orbit'), nodeId(bodyId, 'elliptical'), split.circularization, 'escape', 'capture', `${name}: low orbit → elliptical orbit`, `${name}: elliptical orbit → low orbit`, [...assumptions, encounterNote, ellipseNote])
    addPair(nodeId(bodyId, 'elliptical'), nodeId(bodyId, 'encounter'), split.captureToEllipse, 'escape', 'capture', `${name}: elliptical orbit → encounter`, `${name}: encounter → elliptical orbit`, [...assumptions, encounterNote, ellipseNote])
  } else {
    const capture = parkingOrbitBurn(mu, parkingRadius, arrivalExcessSpeed)
    addPair(nodeId(bodyId, 'orbit'), nodeId(bodyId, 'encounter'), capture, 'escape', 'capture', `${name}: low orbit → encounter`, `${name}: encounter → low orbit`, [...assumptions, encounterNote])
  }

  if (bodies.find(body => body.id === bodyId)?.hasSurface) {
    const atmosphericBudget = bodyId === 'opm:tekto' ? 2600 : bodyId === 'opm:thatmo' ? 950 : null
    const surfaceCost = atmosphericBudget ?? surfaceOrbitBudget(mu, radiusM, parkingRadius)
    const surfaceAssumptions = atmosphericBudget !== null ? [
      atmosphericAllowance,
      orbitNote,
      'Powered landing reuses the older launch allowance. Parachutes and atmospheric braking do not reduce it automatically; you can enter your own landing allowance in Atmosphere.',
    ] : [
      ...assumptions,
      'Minimum airless launch estimate using two instantaneous burns from a nonrotating surface. Landing reuses the reverse cost. Terrain, rotation, gravity losses, and craft performance are not included.',
    ]
    addPair(nodeId(bodyId, 'surface'), nodeId(bodyId, 'orbit'), surfaceCost, 'ascent', 'descent', `${name} ascent`, `${name} powered descent`, surfaceAssumptions, atmosphericBudget !== null ? mapSourceId : analyticSourceId)
  }
}

export const opmPack: PlanetPack = withSiblingTransfers(withDirectTransfers({
  id: 'opm',
  name: 'Outer Planets Mod',
  shortName: 'OPM',
  dataNotice: 'Calculated estimates',
  version: '2.2.12-analytic.4',
  description: 'Stock plus Outer Planets Mod 2.2.12. Orbital and airless surface budgets are calculated from mod data, including direct planet and moon transfers. Tekto and Thatmo keep older atmospheric launch/landing allowances.',
  transferHubBodyId: 'stock:kerbin',
  sources: [
    ...stockPack.sources.map(source => ({ ...source })),
    { ...opmConfigSource },
    {
      id: analyticSourceId,
      budgetType: 'model',
      title: 'OPM analytical model: reference orbits, formulas, assumptions, and worked examples',
      url: 'https://github.com/AntonioToni/ksp-deltav/blob/main/docs/DATA.md#outer-planets-mod-pack',
    },
    {
      id: 'opm-stock-constants',
      title: 'KSPTOT stock solar, Kerbin, and Eeloo constants · pinned revision',
      url: 'https://github.com/Arrowstar/ksptot/blob/9972b57398742263af12374652799db210395499/bodies.ini',
    },
    {
      id: mapSourceId,
      budgetType: 'reference',
      title: 'Historical OPM 1.8.1 atmospheric surface allowances · Tekto and Thatmo only',
      url: 'https://github.com/Kowgan/ksp_cheat_sheets/blob/ca2d4910dd98e5fd14277b04ec686e61cd6967ce/delta_v_map_outer_planets/DvMap_OP_2_A4.svg',
    },
  ],
  assumptions: [
    ...stockPack.assumptions.filter(note => !note.startsWith('Kerbol has no selectable') && !note.startsWith('All budgets are in') && !note.startsWith('No atmospheric assistance')),
    ...analyticAssumptions,
    'Default costs include no savings from the atmosphere. Atmosphere options can change the route budget, but do not test whether your craft can survive entry or land.',
    'Unchanged Stock bodies keep their map figures. In OPM, Eeloo orbits Sarnus and has recalculated transfer, orbit-entry, and airless surface costs. Choosing Stock keeps the original Eeloo.',
    'Assumed parking heights include Sarnus 600 km, Urlum 350 km, Neidon 280 km, Thatmo 50 km, and Tekto 120 km. These are reference orbits, not guarantees of terrain clearance.',
    'High ellipses at Sarnus, Urlum, Neidon, and Plock have their closest point at the selected parking height. Their farthest point is at half the nominal sphere-of-influence radius, measured from the body\'s center. Moon transfers start from the parent\'s low orbit, including Tal from Wal and Karen from Plock.',
    'Orbital tilt affects approach speed where the reference orbital planes cross, including Thatmo\'s backward orbit. Changing distances along eccentric orbits are not tracked; Plock (e = 0.26) and Nissee (e = 0.72) can differ substantially from these estimates.',
    'Tekto and Thatmo use older atmospheric launch/landing allowances of 2600 and 950 m/s. They have not been recalculated for the modern reference orbits or your craft, and are not verified landing costs or guaranteed maximums. Craft performance and atmospheric entry are not simulated.',
    'Kerbol has no selectable states. Jool, Sarnus, Urlum, and Neidon have no landable surface states. Gravity from additional bodies and optional SigmaBinary patches are not included.',
  ],
  bodies,
  nodes,
  maneuvers,
}, [...stockPhysicalReferences, ...opmReferences.map(reference => ({
  ...reference, ellipticalApoapsisRadiusM: reference.sphereOfInfluenceM / 2,
}))], opmCentralMu), [...stockPhysicalReferences, ...opmReferences], [opmConfigSource])
