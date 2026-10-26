import { describe, expect, it } from 'vitest'
import { opmPack } from '../data/opm'
import { rssPack } from '../data/rss'
import { stockPack } from '../data/stock'
import type { CelestialBody, ManeuverEdge, PlanetPack, PlannerGraph, RouteNode } from '../types/planner'
import { buildGraph } from './buildGraph'
import { calculateBudget } from './budget'
import { findMissionRoute } from './mission'
import { applyAtmosphericAssistance, getAtmosphericCapabilities, type AtmosphericPlan } from './atmosphericAssistance'

const start = 'stock:kerbin:surface'
const end = 'stock:duna:surface'
const duna = (capture = true, landing = true, landingDeltaV = 100) => ({ bodyId: 'stock:duna', capture, landing, landingDeltaV })
const kerbin = { bodyId: 'stock:kerbin', capture: true, landing: true, landingDeltaV: 50 }
const edgeId = (body: string, from: string, to: string) => `stock:${body}:${from}->stock:${body}:${to}`
const edge = (graph: PlannerGraph, id: string) => [...graph.adjacency.values()].flat().find(candidate => candidate.id === id)

function fixture(): PlanetPack {
  const star: CelestialBody = { id: 'star', name: 'Star', parentId: null, kind: 'star', hasSurface: false, hasAtmosphere: false, color: '#fff' }
  const body: CelestialBody = { id: 'planet', name: 'Planet', parentId: 'star', kind: 'planet', hasSurface: true, hasAtmosphere: true, color: '#08f' }
  return {
    id: 'fixture', name: 'Atmospheric fixture', version: '1', description: 'Synthetic maneuver costs.', assumptions: [],
    sources: [{ id: 'fixture-source', title: 'Synthetic fixture', url: 'https://example.org' }],
    bodies: [star, body], nodes: [], maneuvers: [],
  }
}

const node = (id: string, bodyId: string, kind: RouteNode['kind']): RouteNode => ({ id, bodyId, kind, label: id })
const maneuver = (id: string, from: string, to: string, deltaV: number, kind: ManeuverEdge['kind']): ManeuverEdge => ({
  id, from, to, deltaV, kind, label: id, sourceId: 'fixture-source', assumptions: ['Synthetic source cost.'],
})

describe('atmospheric capabilities', () => {
  it('includes only bodies with marked standalone captures or descents', () => {
    expect(getAtmosphericCapabilities(stockPack).map(({ body, capture, landing }) => [body.name, capture, landing])).toEqual([
      ['Eve', true, true], ['Kerbin', true, true], ['Duna', true, true], ['Jool', true, false], ['Laythe', true, true],
    ])
  })

  it.each([opmPack, rssPack])('uses $shortName pack metadata rather than stock names', pack => {
    const capabilities = getAtmosphericCapabilities(pack)
    expect(capabilities.length).toBeGreaterThan(0)
    expect(capabilities.every(({ body }) => body.hasAtmosphere && body.supportsAtmosphericBraking !== false)).toBe(true)
    if (pack.id === 'rss') {
      expect(capabilities.some(({ body }) => body.name === 'Earth')).toBe(true)
      expect(capabilities.some(({ body }) => body.id === 'rss:pluto' || body.id === 'rss:triton')).toBe(false)
    }
  })

  it('does not offer atmospheric savings for a marked transfer without a standalone capture', () => {
    const pack = structuredClone(stockPack)
    pack.maneuvers = pack.maneuvers.filter(candidate => !candidate.id.startsWith('stock:kerbin:') || candidate.kind === 'escape' || candidate.kind === 'ascent')
    expect(getAtmosphericCapabilities(pack).some(({ body }) => body.id === 'stock:kerbin')).toBe(false)
  })
})

describe('effective atmospheric graph', () => {
  it('leaves the reference graph and source data unchanged while changing only explicit eligible costs', () => {
    const pack = structuredClone(stockPack)
    const before = structuredClone(pack)
    const graph = buildGraph(pack)
    const original = edge(graph, edgeId('duna', 'orbit', 'surface'))!
    const result = applyAtmosphericAssistance(graph, pack, [duna()])
    expect(pack).toEqual(before)
    expect(result.graph).not.toBe(graph)
    expect(result.graph.nodes).toBe(graph.nodes)
    expect(result.graph.adjacency.get('stock:mun:orbit')).toBe(graph.adjacency.get('stock:mun:orbit'))
    expect(result.adjustments).toEqual(new Map([
      [edgeId('duna', 'orbit', 'surface'), { kind: 'landing', originalDeltaV: 1450, deltaV: 100 }],
      [edgeId('duna', 'elliptical', 'orbit'), { kind: 'capture', originalDeltaV: 360, deltaV: 0 }],
      [edgeId('duna', 'encounter', 'elliptical'), { kind: 'capture', originalDeltaV: 250, deltaV: 0 }],
    ]))
    const changed = edge(result.graph, original.id)!
    expect(changed).not.toBe(original)
    expect(changed.sourceId).toBe(original.sourceId)
    expect(changed.assumptions.slice(0, -1)).toEqual(original.assumptions)
    expect(changed.assumptions.at(-1)).toContain('user-supplied powered allowance of 100 m/s')
    expect(edge(graph, original.id)?.deltaV).toBe(1450)
    expect(edge(result.graph, edgeId('duna', 'surface', 'orbit'))?.deltaV).toBe(1450)
    expect(edge(result.graph, edgeId('duna', 'orbit', 'elliptical'))?.deltaV).toBe(360)
    expect(edge(result.graph, 'stock:kerbin:encounter->stock:duna:encounter')?.deltaV).toBe(130)
  })

  it('reuses the original graph when no maneuver actually changes', () => {
    const graph = buildGraph(stockPack)
    for (const plan of [[], [duna(false, false)], [duna(false, true, 1450)]]) {
      const result = applyAtmosphericAssistance(graph, stockPack, plan)
      expect(result.graph).toBe(graph)
      expect(result.adjustments.size).toBe(0)
    }
  })

  it('retains every bundled moon-return transfer despite enabling parent capture', () => {
    const graph = buildGraph(stockPack)
    const result = applyAtmosphericAssistance(graph, stockPack, [kerbin])
    for (const [moon, cost] of [['mun', 860], ['minmus', 930]] as const) {
      const id = `stock:${moon}:encounter->stock:kerbin:orbit`
      expect(edge(result.graph, id)?.deltaV).toBe(cost)
      expect(edge(result.graph, id)).toBe(edge(graph, id))
      expect(result.adjustments.has(id)).toBe(false)
    }
  })

  it('uses a supplied larger or fractional allowance exactly rather than capping it at the source cost', () => {
    const graph = buildGraph(stockPack)
    for (const allowance of [0, 100.25, 2000, 1_000_000]) {
      const result = applyAtmosphericAssistance(graph, stockPack, [duna(false, true, allowance)])
      expect(edge(result.graph, edgeId('duna', 'orbit', 'surface'))?.deltaV).toBe(allowance)
    }
  })

  it('respects an imported body explicitly excluding atmospheric assistance', () => {
    const pack = structuredClone(stockPack)
    pack.bodies.find(body => body.id === 'stock:duna')!.supportsAtmosphericBraking = false
    expect(getAtmosphericCapabilities(pack).some(({ body }) => body.id === 'stock:duna')).toBe(false)
    expect(() => applyAtmosphericAssistance(buildGraph(pack), pack, [duna()])).toThrow('no supported standalone atmospheric capture')
  })
})

describe('atmospheric mission optimization', () => {
  it.each<[{ capture: boolean; landing: boolean; expected: number[] }]>([
    [{ capture: true, landing: false, expected: [5930, 6540, 12470] }],
    [{ capture: false, landing: true, expected: [5190, 6540, 11730] }],
    [{ capture: true, landing: true, expected: [4580, 6540, 11120] }],
  ])('uses selected options in all mission directions: %j', ({ capture, landing, expected }) => {
    const reference = buildGraph(stockPack)
    const { graph } = applyAtmosphericAssistance(reference, stockPack, [duna(capture, landing)])
    for (const [index, mode] of (['one-way', 'return-only', 'round-trip'] as const).entries()) {
      const route = findMissionRoute(graph, start, end, mode)
      expect(route).toMatchObject({ status: 'success', totalDeltaV: expected[index] })
    }
    expect(findMissionRoute(reference, start, end, 'round-trip')).toMatchObject({ status: 'success', totalDeltaV: 13080 })
  })

  it('handles origin options, ordered stops, reverse stages and one complete reserve', () => {
    const { graph } = applyAtmosphericAssistance(buildGraph(stockPack), stockPack, [duna(), kerbin])
    const route = findMissionRoute(graph, start, end, 'round-trip', ['stock:duna:elliptical'])
    expect(route).toMatchObject({ status: 'success', totalDeltaV: 6820 })
    if (route.status !== 'success') throw new Error('Expected a complete atmospheric mission')
    expect(route.outboundStages.map(stage => stage.totalDeltaV)).toEqual([4480, 100])
    expect(route.returnStages.map(stage => stage.totalDeltaV)).toEqual([1810, 430])
    expect(calculateBudget(route.totalDeltaV, 20)).toMatchObject({ totalDeltaV: 8184, extraDeltaV: 1364 })
    expect(findMissionRoute(graph, start, end, 'return-only', ['stock:duna:elliptical'])).toMatchObject({ status: 'success', totalDeltaV: 2240 })
  })

  it('finds a newly cheaper route instead of discounting the previously chosen powered route', () => {
    const pack = fixture()
    pack.nodes = [node('E', 'planet', 'encounter'), node('O1', 'planet', 'orbit'), node('O2', 'planet', 'orbit'), node('S', 'planet', 'surface')]
    pack.maneuvers = [
      maneuver('capture-1', 'E', 'O1', 100, 'capture'), maneuver('land-1', 'O1', 'S', 300, 'descent'),
      maneuver('capture-2', 'E', 'O2', 500, 'capture'), maneuver('land-2', 'O2', 'S', 10, 'descent'),
    ]
    const reference = buildGraph(pack)
    expect(findMissionRoute(reference, 'E', 'S', 'one-way')).toMatchObject({ status: 'success', totalDeltaV: 400, nodeIds: ['E', 'O1', 'S'] })
    const { graph } = applyAtmosphericAssistance(reference, pack, [{ bodyId: 'planet', capture: true, landing: false, landingDeltaV: 0 }])
    expect(findMissionRoute(graph, 'E', 'S', 'one-way')).toMatchObject({ status: 'success', totalDeltaV: 10, nodeIds: ['E', 'O2', 'S'] })
  })

  it('requires actual parking-orbit arrival between interplanetary transfers, even through an encounter stop', () => {
    const pack = fixture()
    const prototype = pack.bodies[1]!
    pack.bodies = [pack.bodies[0]!, ...['A', 'B', 'C'].map(id => ({ ...prototype, id, name: id, hasAtmosphere: id === 'B' }))]
    pack.nodes = [node('AE', 'A', 'encounter'), node('BE', 'B', 'encounter'), node('BO', 'B', 'orbit'), node('CE', 'C', 'encounter')]
    pack.maneuvers = [
      maneuver('A-B', 'AE', 'BE', 1, 'transfer'), maneuver('B-C', 'BE', 'CE', 1, 'transfer'),
      maneuver('B-capture', 'BE', 'BO', 100, 'capture'), maneuver('B-escape', 'BO', 'BE', 20, 'escape'),
      maneuver('A-C', 'AE', 'CE', 100, 'transfer'),
    ]
    const reference = buildGraph(pack)
    expect(findMissionRoute(reference, 'AE', 'CE', 'one-way')).toMatchObject({ status: 'success', totalDeltaV: 100, nodeIds: ['AE', 'CE'] })
    const { graph } = applyAtmosphericAssistance(reference, pack, [{ bodyId: 'B', capture: true, landing: false, landingDeltaV: 0 }])
    for (const stops of [[], ['BE']]) {
      expect(findMissionRoute(graph, 'AE', 'CE', 'one-way', stops)).toMatchObject({ status: 'success', totalDeltaV: 22, nodeIds: ['AE', 'BE', 'BO', 'BE', 'CE'] })
    }
  })

  it('terminates with finite budgets through zero-cost capture cycles and repeated stops', () => {
    const pack = structuredClone(stockPack)
    for (const id of [edgeId('duna', 'orbit', 'elliptical'), edgeId('duna', 'elliptical', 'encounter')]) {
      pack.maneuvers.find(candidate => candidate.id === id)!.deltaV = 0
    }
    const { graph } = applyAtmosphericAssistance(buildGraph(pack), pack, [duna(true, false)])
    const route = findMissionRoute(graph, 'stock:duna:encounter', 'stock:duna:orbit', 'round-trip', ['stock:duna:elliptical', 'stock:duna:elliptical'])
    expect(route).toMatchObject({ status: 'success', totalDeltaV: 0 })
    if (route.status !== 'success') throw new Error('Expected a zero-cost complete route')
    expect(route.legs).toHaveLength(4)
    expect(route.outboundStages.map(stage => stage.totalDeltaV)).toEqual([0, 0, 0])
    expect(route.returnStages.map(stage => stage.totalDeltaV)).toEqual([0, 0, 0])
  })
})

describe('atmospheric option validation', () => {
  const graph = buildGraph(stockPack)

  it.each([
    null, {}, [null], [[]], [{ bodyId: 123, capture: true, landing: false, landingDeltaV: 0 }],
    [{ ...duna(), capture: 'true' }], [{ ...duna(), landing: 0 }],
  ])('rejects malformed options %j', plan => {
    expect(() => applyAtmosphericAssistance(graph, stockPack, plan as unknown as AtmosphericPlan)).toThrow(TypeError)
  })

  it.each([-1, 1_000_001, Infinity, NaN, '100', null])('rejects invalid landing allowance %s', landingDeltaV => {
    expect(() => applyAtmosphericAssistance(graph, stockPack, [{ ...duna(), landingDeltaV }] as unknown as AtmosphericPlan)).toThrow('Powered landing allowance')
  })

  it('rejects unknown, duplicate, airless and unsupported body choices', () => {
    const invalid: AtmosphericPlan[] = [
      [{ ...duna(), bodyId: 'missing' }], [duna(), duna()], [{ ...duna(), bodyId: 'stock:mun' }],
      [{ ...duna(), bodyId: 'stock:jool', capture: false }],
    ]
    for (const plan of invalid) expect(() => applyAtmosphericAssistance(graph, stockPack, plan)).toThrow(RangeError)
    expect(() => applyAtmosphericAssistance(graph, stockPack, [{ bodyId: 'stock:mun', capture: false, landing: false, landingDeltaV: 0 }])).not.toThrow()
  })
})
