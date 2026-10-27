import { describe, expect, it } from 'vitest'
import { buildGraph } from '../utils/buildGraph'
import { findLowestCostPath } from '../utils/findRoute'
import { validatePlanetPack } from '../utils/validatePlanetPack'
import { stockPack } from './stock'
import { opmPack } from './opm'
import { stockKcalbelohPack, opmKcalbelohPack, kcalbelohPacks } from './kcalbeloh'
import { kcalbelohBodies, kcalbelohRegions } from './kcalbelohReference'
import type { PlanetPack } from '../types/planner'

const mapId = 'kcalbeloh-map-1.1.8'
const local = (name: string, kind = 'orbit') => `kcalbeloh:${name}:${kind}`

function route(pack: PlanetPack, from: string, to: string) {
  const result = findLowestCostPath(buildGraph(pack), from, to)
  if (result.status !== 'success') throw new Error(result.message)
  return result
}

describe('the two Kcalbeloh add-on configurations', () => {
  it('preserves the requested Stock and OPM variants as separate complete packs', () => {
    expect(kcalbelohPacks.map(pack => pack.id)).toEqual(['stock-kcalbeloh', 'opm-kcalbeloh'])
    expect(stockKcalbelohPack.name).toBe('Stock + Kcalbeloh')
    expect(opmKcalbelohPack.name).toBe('OPM + Kcalbeloh')
    expect(stockKcalbelohPack.bodies).toHaveLength(50)
    expect(opmKcalbelohPack.bodies).toHaveLength(65)
    expect(stockKcalbelohPack.nodes).toHaveLength(97)
    expect(opmKcalbelohPack.nodes).toHaveLength(143)
    expect(stockKcalbelohPack.maneuvers).toHaveLength(204)
    expect(opmKcalbelohPack.maneuvers).toHaveLength(296)
    for (const pack of kcalbelohPacks) {
      expect(validatePlanetPack(pack), pack.id).toEqual([])
      expect(pack.version).toBe('1.1.8-map.1')
      expect(pack.shortName!.length).toBeLessThanOrEqual(12)
      expect(pack.unpricedConnections).toHaveLength(10)
    }
  })

  it.each([
    [stockKcalbelohPack, stockPack, 'stock:jool'],
    [opmKcalbelohPack, opmPack, 'opm:sarnus'],
  ] as const)('clones base data and reparents only the home wormhole for %s', (pack, base, parent) => {
    for (const body of base.bodies) {
      const retained = pack.bodies.find(item => item.id === body.id)!
      expect(retained).toEqual(body)
      expect(retained).not.toBe(body)
    }
    for (const node of base.nodes) {
      expect(pack.nodes.find(item => item.id === node.id)).toEqual(node)
      expect(pack.nodes.find(item => item.id === node.id)).not.toBe(node)
    }
    for (const edge of base.maneuvers) {
      const retained = pack.maneuvers.find(item => item.id === edge.id)!
      expect(retained).toEqual(edge)
      expect(retained).not.toBe(edge)
      expect(retained.assumptions).not.toBe(edge.assumptions)
    }
    expect(pack.bodies.find(body => body.id === 'kcalbeloh:wh3141a')?.parentId).toBe(parent)
    expect(pack.bodies.find(body => body.id === 'kcalbeloh:wh3141b')?.parentId).toBe('kcalbeloh:sera')
    const wormhole = pack.unpricedConnections!.find(connection => connection.id === 'kcalbeloh:wormhole')!
    expect(wormhole.from).toBe(`${parent}:orbit`)
    expect(wormhole.to).toBe(local('sera'))
    expect(wormhole.forwardKind).toBe('wormhole')
    expect(wormhole.reverseKind).toBe('wormhole')
    expect(wormhole.assumptions.join(' ')).toContain('approach')
    expect(wormhole.assumptions.join(' ')).toContain('exit matching')
  })

  it('does not mutate or reuse the reference catalog, base Eeloo hierarchy, or other composed pack records', () => {
    expect(stockPack.bodies.find(body => body.id === 'stock:eeloo')?.parentId).toBe('stock:kerbol')
    expect(opmPack.bodies.find(body => body.id === 'stock:eeloo')?.parentId).toBe('opm:sarnus')
    expect(kcalbelohBodies.find(body => body.id === 'kcalbeloh:wh3141a')?.parentId).toBe('stock:jool')
    for (const source of kcalbelohBodies) {
      expect(stockKcalbelohPack.bodies.find(body => body.id === source.id)).not.toBe(source)
      expect(opmKcalbelohPack.bodies.find(body => body.id === source.id)).not.toBe(source)
      expect(stockKcalbelohPack.bodies.find(body => body.id === source.id)).not.toBe(opmKcalbelohPack.bodies.find(body => body.id === source.id))
    }
    for (const region of kcalbelohRegions) {
      expect(stockKcalbelohPack.mapRegions!.find(item => item.id === region.id)?.bodyIds).not.toBe(region.bodyIds)
    }
    expect(route(stockKcalbelohPack, 'stock:kerbin:surface', 'stock:mun:surface').totalDeltaV).toBe(5120)
    expect(route(opmKcalbelohPack, 'stock:kerbin:surface', 'opm:tekto:surface').totalDeltaV).toBe(11927)
  })

  it.each(kcalbelohPacks)('covers every selectable state in exactly one region for $id', pack => {
    expect(pack.mapRegions!.map(region => region.id)).toEqual(['kerbol', 'kcalbeloh', 'maelg', 'sunorc', 'aralc'])
    for (const node of pack.nodes) {
      expect(pack.mapRegions!.filter(region => region.bodyIds.includes(node.bodyId)), node.id).toHaveLength(1)
    }
    expect(new Set(pack.mapRegions!.flatMap(region => region.bodyIds)).size).toBe(pack.bodies.length)
  })
})

describe('published Kcalbeloh numerical facts', () => {
  it('keeps source-pair burn sums distinct from per-body encounter estimates', () => {
    const pair = (from: string, to: string) => stockKcalbelohPack.maneuvers.find(edge => edge.from === local(from) && edge.to === local(to))!
    expect(pair('onrefni', 'rouqea').deltaV).toBe(21100 + 11700)
    expect(pair('onrefni', 'iomena').deltaV).toBe(30300 + 30900)
    expect(pair('sedah', 'suluco').deltaV).toBe(1870 + 2040)
    expect(pair('efil', 'enots').deltaV).toBe(760 + 1310)
    expect(pair('efil', 'eulb').deltaV).toBe(582 + 365)
    expect(pair('sera', 'dipuc').deltaV).toBe(946 + 298)
    expect(pair('suluco', 'tot').deltaV).toBe(676 + 312)
    expect(pair('onrefni', 'rouqea').assumptions.join(' ')).toContain('21100 m/s')
    expect(stockKcalbelohPack.nodes.filter(node => node.id.startsWith('kcalbeloh:') && node.kind === 'encounter')).toHaveLength(0)
    const mapEdges = stockKcalbelohPack.maneuvers.filter(edge => edge.sourceId === mapId)
    expect(mapEdges).toHaveLength(106)
    for (const edge of mapEdges) {
      expect(stockKcalbelohPack.sources.some(source => source.id === edge.sourceId)).toBe(true)
      expect(edge.assumptions.join(' ')).toContain('map estimate')
      const opposite = mapEdges.find(item => item.from === edge.to && item.to === edge.from)!
      expect(opposite.deltaV).toBe(edge.deltaV)
      expect(opposite.assumptions).not.toBe(edge.assumptions)
    }
  })

  it('uses genuine stellar and circumbinary references without fabricated surfaces or altitude claims', () => {
    const references = stockKcalbelohPack.nodes.filter(node => node.id.startsWith('kcalbeloh:') && node.kind === 'reference')
    expect(references).toHaveLength(5)
    expect(references.map(node => node.label)).toEqual([
      'Kcalbeloh 28.46 Gm reference orbit', 'Maelg 513 Mm reference orbit', 'Sunorc 5.22 Gm reference orbit',
      'Aralc system 69.52 Gm reference orbit', 'Simetra–Simeht 60 Mm reference orbit',
    ])
    expect(references.every(node => node.altitudeKm === undefined)).toBe(true)
    for (const body of stockKcalbelohPack.bodies.filter(body => !body.hasSurface)) {
      expect(stockKcalbelohPack.nodes.some(node => node.bodyId === body.id && node.kind === 'surface'), body.id).toBe(false)
    }
    for (const name of ['noi', 'simetra', 'simeht', 'aralcb', 'wh3141a', 'wh3141b']) {
      expect(stockKcalbelohPack.bodies.some(body => body.id === `kcalbeloh:${name}`)).toBe(true)
      expect(stockKcalbelohPack.nodes.some(node => node.bodyId === `kcalbeloh:${name}`)).toBe(false)
    }
    expect(route(stockKcalbelohPack, local('sunorc', 'reference'), local('aralca', 'reference')).totalDeltaV).toBe(5180 + 1920)
  })

  it.each([
    ['kcalbeloh:suluco:surface', 'kcalbeloh:tot:surface', 2920 + 676 + 312 + 23],
    ['kcalbeloh:sera:surface', 'kcalbeloh:dipuc:surface', 3630 + 946 + 298 + 631],
    ['kcalbeloh:efil:surface', 'kcalbeloh:eulb:surface', 2540 + 582 + 365 + 1020],
    ['kcalbeloh:noira:surface', 'kcalbeloh:noyreg:surface', 376 + 3420 + 1170 + 3230],
  ])('sums complete local map journeys from %s to %s', (from, to, expected) => {
    for (const pack of kcalbelohPacks) {
      expect(route(pack, from, to).totalDeltaV).toBe(expected)
      expect(route(pack, to, from).totalDeltaV).toBe(expected)
    }
  })

  it('may choose a cheaper two-pair journey while charging the intermediate parking orbit completely', () => {
    const result = route(stockKcalbelohPack, local('onrefni', 'surface'), local('iomena', 'surface'))
    expect(result.totalDeltaV).toBe(1300 + (21100 + 11700) + (15100 + 11100) + 1610)
    expect(result.nodeIds).toContain(local('rouqea'))
    expect(result.legs.filter(leg => leg.edge.kind === 'transfer')).toHaveLength(2)
  })
})

describe('unknown Kcalbeloh source connections', () => {
  it.each(kcalbelohPacks)('never inserts default edges or zeros for missing budgets in $id', pack => {
    for (const connection of pack.unpricedConnections!) {
      expect(pack.maneuvers.some(edge => (edge.from === connection.from && edge.to === connection.to) || (edge.from === connection.to && edge.to === connection.from)), connection.id).toBe(false)
      expect(pack.sources.some(source => source.id === connection.sourceId), connection.id).toBe(true)
      expect(connection.assumptions.join(' ')).toContain('blank direction remains unavailable')
    }
    for (const target of [local('sera'), local('arorua'), local('rouqea'), local('noira'), local('efil')]) {
      expect(findLowestCostPath(buildGraph(pack), 'stock:kerbin:surface', target).status).toBe('unreachable')
    }
    expect(findLowestCostPath(buildGraph(pack), local('sera'), local('arorua')).status).toBe('unreachable')
    expect(route(pack, local('arorua', 'surface'), local('arorua')).totalDeltaV).toBe(4700)
  })

  it('preserves the three explicit Arorua N.A. cases and requires a complete user pair allowance', () => {
    const unknown = stockKcalbelohPack.unpricedConnections!.filter(connection => connection.id.includes('arorua'))
    expect(unknown).toHaveLength(3)
    for (const connection of unknown) {
      expect(connection.assumptions.join(' ')).toContain('N.A.')
      expect(connection.assumptions.join(' ')).toContain('whole pair budget')
    }
    expect(stockKcalbelohPack.assumptions.join(' ')).toContain('Noi, individual Simetra/Simeht low orbits')
    expect(stockKcalbelohPack.assumptions.join(' ')).toContain('HomeSwitch disabled')
    expect(stockKcalbelohPack.assumptions.join(' ')).toContain('stock-sized 1×')
  })
})
