import type { ManeuverEdge, PlanetPack, RouteNode, UnpricedConnection } from '../types/planner'
import { stockPack } from './stock'
import { opmPack } from './opm'
import {
  kcalbelohBodies, kcalbelohRegions, kcalbelohBodyFacts,
  kcalbelohConfigSource, kcalbelohMapSource,
} from './kcalbelohReference'

const mapSourceId = 'kcalbeloh-map-1.1.8'
const configSourceId = 'kcalbeloh-config-1.1.8'
const mapEstimate = 'Estimate from the published Kcalbeloh 1.1.8 map. Transfer figures are rough budgets for this multi-star system, not flights calculated for specific dates.'
const reversePolicy = 'The return direction reuses this map budget. Flight dates, arrival alignment, optimized orbital-plane changes, and craft losses are not simulated.'

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

function createKcalbelohPack(base: PlanetPack, opm: boolean, wormholes = true): PlanetPack {
  const homeParentId = opm ? 'opm:sarnus' : 'stock:jool'
  const homeParentName = opm ? 'Sarnus' : 'Jool'
  const bodies = [
    ...base.bodies.map(body => ({ ...body })),
    ...kcalbelohBodies.filter(body => wormholes || body.kind !== 'wormhole').map(body => ({ ...body, ...(body.id === 'kcalbeloh:wh3141a' ? { parentId: homeParentId } : {}) })),
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
    const parkingNote = `Source map parking height: ${altitudeKm} km. The budget comes from the published map, not a new orbit calculation.`
    addPair(`${id}:surface`, `${id}:orbit`, surfaceDeltaV, 'ascent', 'descent', `${name} ascent`, [
      mapEstimate,
      parkingNote,
      'The source gives a typical launch allowance. Craft thrust-to-weight ratio, flight path, and aerodynamics change the actual cost.',
      atmospheric
        ? 'Landing temporarily uses the source launch allowance. It is not a verified landing estimate or a guaranteed maximum. You can replace it with your own landing allowance in Atmosphere.'
        : 'Airless powered landing reuses the source launch estimate. Craft losses, body rotation, and terrain are not calculated.',
      reversePolicy,
    ], `${name} powered descent`)
  }
  for (const [fromName, toName, departure, arrival] of transferRows) {
    const displayName = (name: string) => name === 'AralcSystem' ? 'Aralc system' : name === 'SimeSystem' ? 'Simetra–Simeht reference' : name
    const from = transferNodeId(fromName)
    const to = transferNodeId(toName)
    addPair(from, to, departure + arrival, 'transfer', 'transfer', `${displayName(fromName)} → ${displayName(toName)} transfer`, [
      mapEstimate,
      `Complete transfer between these map orbits or reference points: ${departure} m/s at ${fromName} plus ${arrival} m/s at ${toName}. Their total is added once.`,
      'Uses the two orbits or reference points named on the map. The planner does not add a chain of free encounters. This combined figure does not separate out a saving from atmospheric capture.',
      reversePolicy,
    ], `${displayName(toName)} → ${displayName(fromName)} transfer`)
  }

  const unpricedConnections: UnpricedConnection[] = (base.unpricedConnections ?? []).map(connection => ({ ...connection, assumptions: [...connection.assumptions] }))
  function gap(id: string, label: string, from: string, to: string, note: string, sourceId = mapSourceId, kind: 'transfer' | 'wormhole' = 'transfer') {
    unpricedConnections.push({
      id: `kcalbeloh:${id}`, label, from, to, forwardKind: kind, reverseKind: kind, sourceId,
      assumptions: [
        note,
        'No default cost is supplied. Enter the full one-way Delta-V budget for each direction. Blank leaves that direction unavailable; zero explicitly assumes a free maneuver, rather than confirming one.',
        'Your budget must include departure, arrival, and any extra alignment or path corrections for the whole link. Known source burns are not automatically added to your entry.',
      ],
    })
  }
  gap('connect-black-hole', 'Kcalbeloh reference ↔ Rouqea low orbit', referenceId('Kcalbeloh'), parkingId('Rouqea'), 'The official map gives no cost between its black-hole reference orbit and the planet parking orbits. The displayed distances do not establish a free transfer between them.')
  gap('connect-maelg', 'Maelg reference ↔ Mehtna low orbit', referenceId('Maelg'), parkingId('Mehtna'), 'The official map gives no cost between its 513 Mm Maelg reference and Mehtna parking orbit. Mehtna and Meiuqer both orbit Maelg; neither is treated as a moon of the other.')
  gap('connect-sunorc', 'Sunorc reference ↔ Suluco low orbit', referenceId('Sunorc'), parkingId('Suluco'), 'The official map gives no cost between its 5.22 Gm Sunorc reference and Suluco parking orbit. Similar orbital distances do not make arrival into orbit free.')
  gap('connect-aralc', 'Aralc reference ↔ Anehta low orbit', referenceId('AralcSystem'), parkingId('Anehta'), 'The official map gives no cost between its 69.52 Gm Aralc reference and Anehta parking orbit. Arrival through the binary-star system is not simulated.')
  gap('connect-sime', 'Simetra–Simeht reference ↔ Noira low orbit', referenceId('SimeSystem'), parkingId('Noira'), 'The official map shows a 60 Mm reference orbit around both Simetra and Simeht, plus separate moon orbits, without a cost joining them. That reference is not a low orbit at either body.')
  gap('connect-anehta-moons', 'Anehta low orbit ↔ Efil low orbit', parkingId('Anehta'), parkingId('Efil'), 'The official map gives Anehta moon-to-moon transfer costs, but no cost from Anehta parking orbit to those moons. Enter the full planet-to-moon transfer budget.')
  gap('arorua-anneheg', 'Anneheg low orbit ↔ Arorua low orbit', parkingId('Anneheg'), parkingId('Arorua'), 'The source prints 4080 m/s on the Anneheg side and N.A. on the Arorua side because KSP binary dynamics prevent a reliable estimate. Enter the whole pair budget, including the known side, rather than only the missing component.')
  gap('arorua-ahtpan', 'Arorua low orbit ↔ Ahtpan low orbit', parkingId('Arorua'), parkingId('Ahtpan'), 'The source prints N.A. on the Arorua side and 1550 m/s on the Ahtpan side because KSP binary dynamics prevent a reliable estimate. Enter the whole pair budget, including the known side.')
  gap('arorua-anehta', 'Arorua low orbit ↔ Anehta low orbit', parkingId('Arorua'), parkingId('Anehta'), 'The source prints N.A. on the Arorua side and 4070 m/s on the Anehta side because KSP binary dynamics prevent a reliable estimate. Enter the whole pair budget, including the known side.')
  if (wormholes) gap('wormhole', `${homeParentName} low orbit ↔ Sera low orbit via wormhole`, `${homeParentId}:orbit`, parkingId('Sera'), `Full wormhole trip: approach WH-3141-A around ${homeParentName}, cross to WH-3141-B around Sera, then enter the destination parking orbit. Official configs place entry between 10 m and 30 km altitude, but neither the map nor these configs gives the full Delta-V cost. Enter one budget for approach, crossing, any course and speed adjustments after the exit, and entering parking orbit. The planner does not add those adjustments for you.`, configSourceId, 'wormhole')

  const existingBodyIds = new Set(bodies.map(body => body.id))
  const baseId = opm ? 'opm-kcalbeloh' : 'stock-kcalbeloh'
  const baseName = opm ? 'OPM + Kcalbeloh' : 'Stock + Kcalbeloh'

  return {
    id: wormholes ? baseId : `${baseId}-no-wormholes`,
    name: wormholes ? baseName : `${baseName} (wormholes off)`,
    shortName: opm ? 'OPM + Kcal' : 'Stock + Kcal',
    dataNotice: wormholes ? 'Map + your budgets' : 'Wormholes off',
    version: '1.1.8-map.4',
    description: `${opm ? 'Outer Planets Mod' : 'Stock Kerbol system'} plus Kcalbeloh 1.1.8 at its default size. ${wormholes ? 'Uses published map transfer figures. Enter your own budgets for wormholes and other links without a published cost.' : 'Wormholes are off. Local map routes remain available, with your own budgets for unpriced links. No route connects Kerbol to Kcalbeloh.'}`,
    transferHubBodyId: base.transferHubBodyId,
    sources: [...base.sources.map(source => ({ ...source })), { ...kcalbelohMapSource }, { ...kcalbelohConfigSource }],
    assumptions: [
      ...base.assumptions.map(note => `${base.shortName ?? base.name} base: ${note}`),
      `Kcalbeloh configuration: v1.1.8, stock-sized 1× scale, HomeSwitch disabled (no replacement homeworld), Wormholes ${wormholes ? 'enabled' : 'disabled'}. RSS/KSRSS rescaling, Principia, and other homeworld configurations are not included.`,
      mapEstimate,
      'Each published transfer connects the two orbits or reference points named on the map and includes both printed burns once. Returning reuses that figure. Routes avoid extra planet or moon parking stops before choosing the lowest Delta-V budget; add mission stops to request other layovers. Necessary reference points remain usable along the way.',
      'Reference orbits around stars and the Simetra–Simeht pair are separate from local low orbits. Their labels show the source distances. They are not surfaces or low atmospheric orbits, and no free transfer to a nearby planet is assumed.',
      `Links without a published cost need your full budget for each direction before they can be used. ${wormholes ? 'Wormholes, links from reference orbits to planets, and missing binary-system links' : 'Links from reference orbits to planets and missing binary-system links'} have no invented default cost. Forward and return budgets are independent.`,
      wormholes
        ? `WH-3141-A orbits ${homeParentName} in this configuration, and WH-3141-B orbits Sera. Your wormhole budget must include approach, crossing, matching the exit path, and entering parking orbit. Timing, heating, and whether the maneuver is achievable are not simulated.`
        : 'Wormholes=False removes WH-3141-A, WH-3141-B, and their crossing link. No direct star-to-star transfer is supplied, so entering every local link budget still leaves Kerbol and Kcalbeloh disconnected.',
      'Arorua transfers marked N.A. on the map need your own budgets; N.A. does not mean zero. Its published surface budget is still usable locally.',
      'Noi, individual Simetra/Simeht low orbits, and Aralc-B parking orbits have no published costs. They are recorded in the pack without selectable mission states. The combined Simetra–Simeht reference and its mapped routes remain selectable.',
      'Atmospheric landing temporarily uses the launch budget until you enter a replacement landing allowance. Atmosphere options do not automatically reduce complete transfer figures that combine several burns.',
      'Numerical reference facts are reorganized with attribution; source map artwork, source layout, textures, and mod config code are not bundled.',
    ],
    bodies,
    nodes,
    maneuvers,
    unpricedConnections,
    mapRegions: [
      { id: 'kerbol', label: 'Kerbol system', bodyIds: [...base.bodies.map(body => body.id), ...(wormholes ? ['kcalbeloh:wh3141a'] : [])] },
      ...kcalbelohRegions.map(region => ({ ...region, bodyIds: region.bodyIds.filter(id => existingBodyIds.has(id)) })),
    ],
  }
}

export const stockKcalbelohPack = createKcalbelohPack(stockPack, false)
export const opmKcalbelohPack = createKcalbelohPack(opmPack, true)
export const stockKcalbelohNoWormholesPack = createKcalbelohPack(stockPack, false, false)
export const opmKcalbelohNoWormholesPack = createKcalbelohPack(opmPack, true, false)
export const kcalbelohPacks: readonly PlanetPack[] = [stockKcalbelohPack, opmKcalbelohPack]
