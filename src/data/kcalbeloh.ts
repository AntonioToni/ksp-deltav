import type { ManeuverEdge, PlanetPack, RouteNode, UnpricedConnection } from '../types/planner'
import { stockPack } from './stock'
import { opmPack } from './opm'
import {
  kcalbelohBodies, kcalbelohRegions, kcalbelohBodyFacts,
  kcalbelohConfigSource, kcalbelohMapSource,
} from './kcalbelohReference'

const mapSourceId = 'kcalbeloh-map-1.1.8'
const configSourceId = 'kcalbeloh-config-1.1.8'
const mapEstimate = 'Published Kcalbeloh 1.1.8 map estimate; transfers are rough reference budgets in a complex multi-star system, not solved dated trajectories.'
const reversePolicy = 'The explicitly declared reverse edge reuses this nominal map budget. Flight dates, arrival geometry, inclination optimization, and vehicle losses are not simulated.'

// Numerical facts only, transcribed from the official map. No source artwork or
// layout is included. Null means the source has no surface budget, not zero.
const parkingRows: readonly (readonly [name: string, altitudeKm: number, surfaceDeltaV: number | null])[] = [
  ['Onrefni', 40, 1300], ['Rouqea', 110, 6000], ['Iomena', 100, 1610], ['Uleg', 60, 2430],
  ['Mehtna', 90, 1960], ['Meiuqer', 8, 193],
  ['Sedah', 500, null], ['Suluco', 80, 2920], ['Sera', 90, 3630],
  ['Tot', 4, 23], ['Dipuc', 20, 631],
  ['Noira', 8, 376], ['Norihc', 55, 1460], ['Noyreg', 110, 3230],
  ['Anneheg', 50, 2270], ['Arorua', 110, 4700], ['Ahtpan', 80, 1740], ['Anehta', 450, null],
  ['Efil', 85, 2540], ['Enots', 18, 121], ['Eulb', 20, 1020], ['Elad', 50, 2250],
]

// Each pair is one complete transfer between its specified circular references.
// The two printed burns cannot be reused as universal per-body encounter costs.
const transferRows: readonly (readonly [from: string, to: string, departure: number, arrival: number])[] = [
  ['Onrefni', 'Rouqea', 21100, 11700], ['Onrefni', 'Iomena', 30300, 30900], ['Onrefni', 'Uleg', 63500, 43200],
  ['Rouqea', 'Iomena', 15100, 11100], ['Rouqea', 'Uleg', 35800, 47900], ['Iomena', 'Uleg', 23400, 49400],
  ['Mehtna', 'Meiuqer', 3670, 2670],
  ['Sedah', 'Suluco', 1870, 2040], ['Sedah', 'Sera', 3250, 2460], ['Sedah', 'SimeSystem', 4200, 2340],
  ['Suluco', 'Sera', 1280, 1400], ['Suluco', 'SimeSystem', 2220, 1520], ['Sera', 'SimeSystem', 1300, 1100],
  ['Suluco', 'Tot', 676, 312], ['Sera', 'Dipuc', 946, 298],
  ['Noira', 'Norihc', 3310, 1240], ['Noira', 'Noyreg', 3420, 1170], ['Norihc', 'Noyreg', 439, 606],
  ['Anneheg', 'Ahtpan', 6080, 3110], ['Anneheg', 'Anehta', 7080, 4240], ['Ahtpan', 'Anehta', 634, 3740],
  ['Efil', 'Enots', 760, 1310], ['Efil', 'Eulb', 582, 365], ['Efil', 'Elad', 743, 840],
  ['Enots', 'Eulb', 1960, 818], ['Enots', 'Elad', 2340, 1000], ['Eulb', 'Elad', 366, 760],
  ['Kcalbeloh', 'Maelg', 58700, 19600], ['Kcalbeloh', 'Sunorc', 60700, 14000], ['Kcalbeloh', 'AralcSystem', 64000, 11000],
  ['Maelg', 'Sunorc', 6600, 5580], ['Maelg', 'AralcSystem', 8580, 4450], ['Sunorc', 'AralcSystem', 5180, 1920],
]

// These central references are not low orbits above a solid surface. Their
// printed distances are retained in labels without asserting altitudeKm.
const referenceRows = [
  { key: 'Kcalbeloh', bodyId: 'kcalbeloh:kcalbeloh', label: 'Kcalbeloh 28.46 Gm reference orbit' },
  { key: 'Maelg', bodyId: 'kcalbeloh:maelg', label: 'Maelg 513 Mm reference orbit' },
  { key: 'Sunorc', bodyId: 'kcalbeloh:sunorc', label: 'Sunorc 5.22 Gm reference orbit' },
  { key: 'AralcSystem', bodyId: 'kcalbeloh:aralca', label: 'Aralc system 69.52 Gm reference orbit' },
  { key: 'SimeSystem', bodyId: 'kcalbeloh:simesystem', label: 'Simetra–Simeht 60 Mm reference orbit' },
] as const

const referenceByName = new Map<string, typeof referenceRows[number]>(referenceRows.map(row => [row.key, row]))
const factsById = new Map(kcalbelohBodyFacts.map(fact => [fact.bodyId, fact]))
const bodyId = (name: string) => `kcalbeloh:${name.toLowerCase()}`
const parkingId = (name: string) => `${bodyId(name)}:orbit`
const referenceId = (name: string) => `${referenceByName.get(name)!.bodyId}:reference`
const transferNodeId = (name: string) => referenceByName.has(name) ? referenceId(name) : parkingId(name)

function createKcalbelohPack(base: PlanetPack, opm: boolean): PlanetPack {
  const homeParentId = opm ? 'opm:sarnus' : 'stock:jool'
  const homeParentName = opm ? 'Sarnus' : 'Jool'
  const bodies = [
    ...base.bodies.map(body => ({ ...body })),
    ...kcalbelohBodies.map(body => ({ ...body, ...(body.id === 'kcalbeloh:wh3141a' ? { parentId: homeParentId } : {}) })),
  ]
  const nodes: RouteNode[] = [
    ...base.nodes.map(node => ({ ...node })),
    ...parkingRows.flatMap(([name, altitudeKm, surfaceDeltaV]): RouteNode[] => {
      const id = bodyId(name)
      const atmosphereHeightKm = (factsById.get(id)?.atmosphereHeightM ?? 0) / 1000
      return [
        ...(surfaceDeltaV === null ? [] : [{ id: `${id}:surface`, bodyId: id, kind: 'surface' as const, label: `${name} surface` }]),
        { id: `${id}:orbit`, bodyId: id, kind: 'orbit', label: `${name} low orbit`, ...(altitudeKm > atmosphereHeightKm ? { altitudeKm } : {}) },
      ]
    }),
    ...referenceRows.map(row => ({ id: `${row.bodyId}:reference`, bodyId: row.bodyId, kind: 'reference' as const, label: row.label })),
  ]
  const maneuvers: ManeuverEdge[] = base.maneuvers.map(edge => ({ ...edge, assumptions: [...edge.assumptions] }))
  function addPair(from: string, to: string, deltaV: number, forwardKind: ManeuverEdge['kind'], reverseKind: ManeuverEdge['kind'], label: string, assumptions: string[], reverseLabel = label) {
    maneuvers.push(
      { id: `${from}->${to}`, from, to, deltaV, kind: forwardKind, label, sourceId: mapSourceId, assumptions: [...assumptions] },
      { id: `${to}->${from}`, from: to, to: from, deltaV, kind: reverseKind, label: reverseLabel, sourceId: mapSourceId, assumptions: [...assumptions] },
    )
  }
  for (const [name, altitudeKm, surfaceDeltaV] of parkingRows) {
    if (surfaceDeltaV === null) continue
    const id = bodyId(name)
    const atmospheric = bodies.find(body => body.id === id)?.hasAtmosphere ?? false
    const parkingNote = `Source map parking label: ${altitudeKm} km. These source-bound budgets are not a modern physical recalibration.`
    addPair(`${id}:surface`, `${id}:orbit`, surfaceDeltaV, 'ascent', 'descent', `${name} ascent`, [
      mapEstimate,
      parkingNote,
      'The source gives a typical surface-to-orbit allowance; TWR, flight profile, and aerodynamics change actual costs.',
      atmospheric
        ? 'Powered descent reuses the source ascent-sized allowance as a placeholder, not a verified landing calculation or upper bound. Optional landing choices may replace it with the user-entered allowance.'
        : 'Powered vacuum descent reuses the source ascent estimate; vehicle losses, body rotation, and terrain are not modeled.',
      reversePolicy,
    ], `${name} powered descent`)
  }
  for (const [fromName, toName, departure, arrival] of transferRows) {
    const displayName = (name: string) => name === 'AralcSystem' ? 'Aralc system' : name === 'SimeSystem' ? 'Simetra–Simeht reference' : name
    const from = transferNodeId(fromName)
    const to = transferNodeId(toName)
    addPair(from, to, departure + arrival, 'transfer', 'transfer', `${displayName(fromName)} → ${displayName(toName)} transfer`, [
      mapEstimate,
      `Complete pair-specific parking/reference transfer: ${departure} m/s at ${fromName} plus ${arrival} m/s at ${toName}; the sum is charged once.`,
      'Both ends are explicit parking/reference states. Separate encounter chains are not inferred. Atmospheric capture savings are not isolated in this bundled pair budget.',
      reversePolicy,
    ], `${displayName(toName)} → ${displayName(fromName)} transfer`)
  }

  const unpricedConnections: UnpricedConnection[] = (base.unpricedConnections ?? []).map(connection => ({ ...connection, assumptions: [...connection.assumptions] }))
  function gap(id: string, label: string, from: string, to: string, note: string, sourceId = mapSourceId, kind: 'transfer' | 'wormhole' = 'transfer') {
    unpricedConnections.push({
      id: `kcalbeloh:${id}`, label, from, to, forwardKind: kind, reverseKind: kind, sourceId,
      assumptions: [
        note,
        'No default fuel cost is supplied. Enter the complete one-way allowance separately for each direction; a blank direction remains unavailable. An explicit zero is a user assumption, not a measured free maneuver.',
        'The entered allowance must cover departure, arrival, and any omitted orientation/trajectory corrections for this whole link. The planner does not add a hidden source component.',
      ],
    })
  }
  gap('connect-black-hole', 'Kcalbeloh reference ↔ Rouqea low orbit', referenceId('Kcalbeloh'), parkingId('Rouqea'), 'The official map does not price the link between its central black-hole orbital reference and the local planet parking grid. Their displayed distances are not interchangeable trajectory states.')
  gap('connect-maelg', 'Maelg reference ↔ Mehtna low orbit', referenceId('Maelg'), parkingId('Mehtna'), 'The official map does not price the link between its 513 Mm Maelg reference and Mehtna parking orbit. Mehtna and Meiuqer both orbit Maelg; neither is treated as a moon of the other.')
  gap('connect-sunorc', 'Sunorc reference ↔ Suluco low orbit', referenceId('Sunorc'), parkingId('Suluco'), 'The official map does not price the link between its 5.22 Gm Sunorc reference and the Suluco parking orbit. A matching approximate orbital distance does not establish a free capture.')
  gap('connect-aralc', 'Aralc reference ↔ Anehta low orbit', referenceId('AralcSystem'), parkingId('Anehta'), 'The official map does not price the link between its 69.52 Gm Aralc reference and Anehta parking orbit. Binary-star arrival dynamics are not solved.')
  gap('connect-sime', 'Simetra–Simeht reference ↔ Noira low orbit', referenceId('SimeSystem'), parkingId('Noira'), 'The official map provides a combined 60 Mm circumbinary reference and a separate satellite grid without a connector allowance. The 60 Mm state is not an individual Simetra or Simeht low orbit.')
  gap('connect-anehta-moons', 'Anehta low orbit ↔ Efil low orbit', parkingId('Anehta'), parkingId('Efil'), 'The official map supplies the Anehta satellite-to-satellite pairs but not the link from Anehta parking orbit to that satellite grid. Supply the complete parent-to-moon transfer allowance.')
  gap('arorua-anneheg', 'Anneheg low orbit ↔ Arorua low orbit', parkingId('Anneheg'), parkingId('Arorua'), 'The source prints 4080 m/s on the Anneheg side and N.A. on the Arorua side because KSP binary dynamics prevent a reliable estimate. Enter the whole pair budget, including the known side, rather than only the missing component.')
  gap('arorua-ahtpan', 'Arorua low orbit ↔ Ahtpan low orbit', parkingId('Arorua'), parkingId('Ahtpan'), 'The source prints N.A. on the Arorua side and 1550 m/s on the Ahtpan side because KSP binary dynamics prevent a reliable estimate. Enter the whole pair budget, including the known side.')
  gap('arorua-anehta', 'Arorua low orbit ↔ Anehta low orbit', parkingId('Arorua'), parkingId('Anehta'), 'The source prints N.A. on the Arorua side and 4070 m/s on the Anehta side because KSP binary dynamics prevent a reliable estimate. Enter the whole pair budget, including the known side.')
  gap('wormhole', `${homeParentName} low orbit ↔ Sera low orbit via wormhole`, `${homeParentId}:orbit`, parkingId('Sera'), `Composite wormhole journey: approach WH-3141-A around ${homeParentName}, cross to WH-3141-B around Sera, and establish the endpoint parking orbit. Official configs place entry between 10 m and 30 km altitude; neither the map nor these configs supplies this whole fuel budget. Enter approach, exit matching, and capture costs together. The planner does not assume free exit matching.`, configSourceId, 'wormhole')

  return {
    id: opm ? 'opm-kcalbeloh' : 'stock-kcalbeloh',
    name: opm ? 'OPM + Kcalbeloh' : 'Stock + Kcalbeloh',
    shortName: opm ? 'OPM + Kcal' : 'Stock + Kcal',
    dataNotice: 'Map + user allowances',
    version: '1.1.8-map.1',
    description: `${opm ? 'Outer Planets Mod' : 'Stock Kerbol system'} plus the Kcalbeloh 1.1.8 default-size add-on. Published local and stellar reference-pair budgets are separate from explicitly user-priced wormhole and missing-source connections.`,
    transferHubBodyId: base.transferHubBodyId,
    sources: [...base.sources.map(source => ({ ...source })), { ...kcalbelohMapSource }, { ...kcalbelohConfigSource }],
    assumptions: [
      ...base.assumptions.map(note => `${base.shortName ?? base.name} base: ${note}`),
      'Kcalbeloh source configuration: v1.1.8, stock-sized 1× scale, HomeSwitch disabled, Wormholes enabled. RSS/KSRSS rescaling, Principia, and alternate homeworld configurations are not included.',
      mapEstimate,
      'Published pair costs connect explicit circular parking or central reference states. Each pair charges both printed burns once; reversed edges share the same nominal allowance. Shortest paths are only the lowest estimates in the supplied graph.',
      'Stellar and Simetra–Simeht circumbinary references are separate states, with their source distances in their labels. They are not landable surfaces or asserted low atmospheric orbits. No free links to nearby planet parking orbits are inferred.',
      'Unpriced connections remain unavailable until their complete directional allowance is entered. Wormhole, reference-to-planet, and missing binary links are not assigned fabricated default fuel costs. Forward and return allowances are independent.',
      `WH-3141-A orbits ${homeParentName} in this configuration, and WH-3141-B orbits Sera. The composite wormhole allowance includes approach, crossing, exit matching, and parking capture; timing, heat, and maneuver feasibility are not simulated.`,
      'Arorua transfer components marked N.A. in the official map remain user-priced; their values are not zero. Its published surface budget remains available locally.',
      'Noi, individual Simetra/Simeht low orbits, and Aralc-B stellar parking lack priced source states and remain catalog metadata. The Simetra–Simeht combined reference and its mapped families remain selectable.',
      'Atmospheric descent uses an explicitly labeled ascent-sized placeholder until replaced by the optional landing allowance. No automatic capture discount is applied to bundled complete-transfer pairs.',
      'Numerical reference facts are reorganized with attribution; source map artwork, source layout, textures, and mod config code are not bundled.',
    ],
    bodies,
    nodes,
    maneuvers,
    unpricedConnections,
    mapRegions: [
      { id: 'kerbol', label: 'Kerbol system', bodyIds: [...base.bodies.map(body => body.id), 'kcalbeloh:wh3141a'] },
      ...kcalbelohRegions.map(region => ({ ...region, bodyIds: [...region.bodyIds] })),
    ],
  }
}

export const stockKcalbelohPack = createKcalbelohPack(stockPack, false)
export const opmKcalbelohPack = createKcalbelohPack(opmPack, true)
export const kcalbelohPacks: readonly PlanetPack[] = [stockKcalbelohPack, opmKcalbelohPack]
