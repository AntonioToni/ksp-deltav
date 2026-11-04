import { describe, expect, it } from 'vitest'
import type { BodyKind, CelestialBody, ManeuverEdge, PlannerGraph, RouteNode } from '../types/planner'
import { rssPack } from '../data/rss'
import { stockPack } from '../data/stock'
import { planetPacks } from '../data/planetPacks'
import { buildGraph } from './buildGraph'
import { findLowestCostPath, findOrderedPath } from './findRoute'
import { findMissionRoute, type MissionMode } from './mission'

const body = (id: string, kind: BodyKind = 'planet', parentId: string | null = 'star'): CelestialBody => ({
  id, name: id, kind, parentId, hasSurface: kind === 'planet' || kind === 'moon', hasAtmosphere: false, color: '#abc',
})
const node = (bodyId: string, kind: RouteNode['kind'] = 'orbit'): RouteNode => ({
  id: `${bodyId}:${kind}`, bodyId, kind, label: `${bodyId} ${kind}`,
})
const edge = (from: string, to: string, deltaV: number, kind: ManeuverEdge['kind'] = 'transfer'): ManeuverEdge => ({
  id: `${from}->${to}`, from, to, deltaV, kind, label: 'Paid fixture transfer', sourceId: 'fixture', assumptions: [],
})
const hierarchy = [body('star', 'star', null), ...['a', 'b', 'c', 'd'].map(id => body(id))]
function graph(nodes: RouteNode[], edges: ManeuverEdge[], bodies: CelestialBody[] = hierarchy): PlannerGraph {
  return {
    nodes: new Map(nodes.map(candidate => [candidate.id, candidate])),
    adjacency: new Map(nodes.map(candidate => [candidate.id, edges.filter(maneuver => maneuver.from === candidate.id)])),
    bodies: new Map(bodies.map(candidate => [candidate.id, candidate])),
  }
}
const modes: MissionMode[] = ['one-way', 'return-only', 'round-trip']
const rssGraph = buildGraph(rssPack)

describe.each(planetPacks)('$name complete-pair itinerary invariants', pack => {
  it('never replaces an available complete pair with unrelated parking visits', () => {
    const graph = buildGraph(pack)
    const bound = new Set(['orbit', 'elliptical', 'reference'])
    const pairs = pack.maneuvers.filter(edge => edge.kind === 'transfer'
      && edge.from !== edge.to && bound.has(graph.nodes.get(edge.from)!.kind)
      && bound.has(graph.nodes.get(edge.to)!.kind))
    expect(pairs.length).toBeGreaterThan(0)
    for (const edge of pairs) {
      const intended = new Set<string>()
      for (const endpoint of [edge.from, edge.to]) {
        let bodyId: string | null = graph.nodes.get(endpoint)!.bodyId
        while (bodyId && !intended.has(bodyId)) {
          intended.add(bodyId)
          bodyId = graph.bodies!.get(bodyId)!.parentId
        }
      }
      const route = findLowestCostPath(graph, edge.from, edge.to)
      expect(route.status, edge.id).toBe('success')
      if (route.status !== 'success') throw new Error(route.message)
      expect(route.totalDeltaV, edge.id).toBeLessThanOrEqual(edge.deltaV)
      const unrelated = route.nodeIds.filter(id => {
        const body = graph.bodies!.get(graph.nodes.get(id)!.bodyId)!
        return (body.kind === 'planet' || body.kind === 'moon') && !intended.has(body.id)
      })
      expect(unrelated, edge.id).toEqual([])
    }
  })
})

describe('the requested body itinerary takes priority over arbitrary parking detours', () => {
  it.each([
    { target: 'mars', total: 8800 },
    { target: 'mercury', total: 25164 },
    { target: 'venus', total: 39745 },
  ])('uses the direct Ceres surface → $target surface itinerary in every mission mode', ({ target, total }) => {
    const outward = ['rss:ceres:surface', 'rss:ceres:orbit', `rss:${target}:orbit`, `rss:${target}:surface`]
    for (const mode of modes) {
      const route = findMissionRoute(rssGraph, outward[0]!, outward[3]!, mode)
      expect(route).toMatchObject({ status: 'success', totalDeltaV: total * (mode === 'round-trip' ? 2 : 1) })
      if (route.status !== 'success') throw new Error(route.message)
      expect(route.nodeIds).toEqual(mode === 'one-way' ? outward : mode === 'return-only' ? [...outward].reverse()
        : [...outward, ...outward.slice(0, -1).reverse()])
      expect(route.legs.filter(({ edge }) => edge.directTransfer)).toHaveLength(mode === 'round-trip' ? 2 : 1)
    }
  })

  it.each([
    { target: 'mars', stop: 'rss:vesta:elliptical', total: 8794 },
    { target: 'mercury', stop: 'rss:jupiter:elliptical', total: 21280 },
    { target: 'venus', stop: 'rss:jupiter:elliptical', total: 38115 },
  ])('retains the cheaper $target detour only when its parking stop is explicitly requested', ({ target, stop, total }) => {
    for (const mode of modes) {
      const route = findMissionRoute(rssGraph, 'rss:ceres:surface', `rss:${target}:surface`, mode, [stop])
      expect(route).toMatchObject({ status: 'success', totalDeltaV: total * (mode === 'round-trip' ? 2 : 1) })
      if (route.status !== 'success') throw new Error(route.message)
      expect(route.nodeIds).toContain(stop)
      const stages = [...route.outboundStages, ...route.returnStages]
      expect(stages).toHaveLength(mode === 'round-trip' ? 4 : 2)
      expect(stages.reduce((sum, stage) => sum + stage.totalDeltaV, 0)).toBe(route.totalDeltaV)
    }
  })

  it.each([
    { target: 'rhea', parent: 'saturn', unrelatedMoon: 'titan' },
    { target: 'umbriel', parent: 'uranus', unrelatedMoon: 'titania' },
  ])('does not turn a Mercury → $target mission into a visit to $unrelatedMoon', ({ target, parent, unrelatedMoon }) => {
    const route = findLowestCostPath(rssGraph, 'rss:mercury:orbit', `rss:${target}:orbit`)
    expect(route.status).toBe('success')
    if (route.status !== 'success') throw new Error(route.message)
    expect(route.nodeIds).toContain(`rss:${parent}:elliptical`)
    expect(route.nodeIds.some(id => id.startsWith(`rss:${unrelatedMoon}:`))).toBe(false)
  })

  it('keeps direct sibling transfers and necessary parent-system branches available', () => {
    expect(findLowestCostPath(buildGraph(stockPack), 'stock:mun:orbit', 'stock:minmus:orbit'))
      .toMatchObject({ status: 'success', totalDeltaV: 330, nodeIds: ['stock:mun:orbit', 'stock:minmus:orbit'] })
    expect(findLowestCostPath(rssGraph, 'rss:mars:orbit', 'rss:europa:orbit'))
      .toMatchObject({ status: 'success', totalDeltaV: 13878,
        nodeIds: ['rss:mars:orbit', 'rss:jupiter:elliptical', 'rss:europa:encounter', 'rss:europa:orbit'] })
  })
})

describe('generic stage-local parking preference', () => {
  const ordinaryNodes = ['a', 'b', 'c'].map(id => node(id))
  const ordinaryEdges = [
    edge('a:orbit', 'b:orbit', 100), edge('b:orbit', 'a:orbit', 100),
    edge('a:orbit', 'c:orbit', 1), edge('c:orbit', 'b:orbit', 1),
    edge('b:orbit', 'c:orbit', 1), edge('c:orbit', 'a:orbit', 1),
  ]

  it('does not depend on model IDs or the optional directTransfer flag', () => {
    const fixture = graph(ordinaryNodes, ordinaryEdges)
    expect(findLowestCostPath(fixture, 'a:orbit', 'b:orbit'))
      .toMatchObject({ status: 'success', totalDeltaV: 100, nodeIds: ['a:orbit', 'b:orbit'] })
    expect(findMissionRoute(fixture, 'a:orbit', 'b:orbit', 'round-trip', ['c:orbit']))
      .toMatchObject({ status: 'success', totalDeltaV: 4,
        nodeIds: ['a:orbit', 'c:orbit', 'b:orbit', 'c:orbit', 'a:orbit'] })
  })

  it('does not make a future requested stop an early transfer hub', () => {
    expect(findOrderedPath(graph(ordinaryNodes, ordinaryEdges), ['a:orbit', 'b:orbit', 'c:orbit']))
      .toMatchObject({ status: 'success', totalDeltaV: 101,
        nodeIds: ['a:orbit', 'b:orbit', 'c:orbit'], stageLegIndices: [0, 1, 2] })
  })

  it('handles repeated required states without adding or removing parking penalties', () => {
    expect(findOrderedPath(graph(ordinaryNodes, ordinaryEdges), ['a:orbit', 'a:orbit', 'b:orbit', 'b:orbit', 'a:orbit']))
      .toMatchObject({ status: 'success', totalDeltaV: 200,
        nodeIds: ['a:orbit', 'b:orbit', 'a:orbit'], stageLegIndices: [0, 0, 1, 1, 2] })
  })

  it('preserves a necessary unrelated gateway instead of making the journey unreachable', () => {
    const fixture = graph(ordinaryNodes, ordinaryEdges.filter(maneuver => !['a:orbit->b:orbit', 'b:orbit->a:orbit'].includes(maneuver.id)))
    expect(findLowestCostPath(fixture, 'a:orbit', 'b:orbit'))
      .toMatchObject({ status: 'success', totalDeltaV: 2, nodeIds: ['a:orbit', 'c:orbit', 'b:orbit'] })
  })

  it('compares Delta-V after the number of extra parking visits, without double-counting circularization', () => {
    const fixture = graph([
      node('a'), node('b'), node('c', 'encounter'), node('c', 'elliptical'), node('c'), node('d'),
    ], [
      edge('a:orbit', 'c:encounter', 0), edge('c:encounter', 'c:elliptical', 1, 'capture'),
      edge('c:elliptical', 'c:orbit', 1, 'capture'), edge('c:orbit', 'b:orbit', 1),
      edge('c:elliptical', 'c:encounter', 0, 'escape'),
      edge('a:orbit', 'd:orbit', 0), edge('d:orbit', 'c:orbit', 0),
    ])
    expect(findLowestCostPath(fixture, 'a:orbit', 'b:orbit'))
      .toMatchObject({ status: 'success', totalDeltaV: 3,
        nodeIds: ['a:orbit', 'c:encounter', 'c:elliptical', 'c:orbit', 'b:orbit'] })
  })

  it('recognizes a parking reference on an unrelated planet while allowing central references', () => {
    const fixture = graph([node('a'), node('b'), node('c', 'reference')], [
      edge('a:orbit', 'b:orbit', 100), edge('a:orbit', 'c:reference', 1), edge('c:reference', 'b:orbit', 1),
    ])
    expect(findLowestCostPath(fixture, 'a:orbit', 'b:orbit')).toMatchObject({ totalDeltaV: 100 })
    const central = graph([node('a'), node('b'), node('star', 'reference')], [
      edge('a:orbit', 'b:orbit', 100), edge('a:orbit', 'star:reference', 1), edge('star:reference', 'b:orbit', 1),
    ])
    expect(findLowestCostPath(central, 'a:orbit', 'b:orbit'))
      .toMatchObject({ totalDeltaV: 2, nodeIds: ['a:orbit', 'star:reference', 'b:orbit'] })
  })

  it('does not bypass the preference by jumping to an unrelated raw-graph surface', () => {
    const fixture = graph([node('a'), node('b'), node('c', 'surface')], [
      edge('a:orbit', 'b:orbit', 100), edge('a:orbit', 'c:surface', 1), edge('c:surface', 'b:orbit', 1),
    ])
    expect(findLowestCostPath(fixture, 'a:orbit', 'b:orbit')).toMatchObject({ totalDeltaV: 100 })
  })

  it('allows endpoint ancestors but not an unrelated intermediate sibling moon', () => {
    const fixture = graph([node('m1'), node('m2'), node('m3'), node('a', 'elliptical')], [
      edge('m1:orbit', 'm3:orbit', 1), edge('m3:orbit', 'm2:orbit', 1),
      edge('m1:orbit', 'a:elliptical', 10), edge('a:elliptical', 'm2:orbit', 10),
    ], [...hierarchy, ...['m1', 'm2', 'm3'].map(id => body(id, 'moon', 'a'))])
    expect(findLowestCostPath(fixture, 'm1:orbit', 'm2:orbit'))
      .toMatchObject({ totalDeltaV: 20, nodeIds: ['m1:orbit', 'a:elliptical', 'm2:orbit'] })
  })

  it('retains plain minimum-budget behavior for legacy hand-built graphs without body metadata', () => {
    const { nodes, adjacency } = graph(ordinaryNodes, ordinaryEdges)
    expect(findLowestCostPath({ nodes, adjacency }, 'a:orbit', 'b:orbit'))
      .toMatchObject({ status: 'success', totalDeltaV: 2, nodeIds: ['a:orbit', 'c:orbit', 'b:orbit'] })
  })
})
