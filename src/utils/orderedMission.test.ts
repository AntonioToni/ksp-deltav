import { describe, expect, it } from 'vitest'
import type { ManeuverEdge, PlannerGraph, RouteNode } from '../types/planner'
import { stockPack } from '../data/stock'
import { opmPack } from '../data/opm'
import { rssPack } from '../data/rss'
import { buildGraph } from './buildGraph'
import { calculateBudget } from './budget'
import { findLowestCostPath, findOrderedPath } from './findRoute'
import { findMissionRoute, type MissionMode } from './mission'

function node(id: string, bodyId = 'fixture', kind: RouteNode['kind'] = 'orbit'): RouteNode {
  return { id, bodyId, kind, label: id }
}

function edge(from: string, to: string, deltaV: number, kind: ManeuverEdge['kind'] = 'transfer'): ManeuverEdge {
  return { id: `${from}->${to}`, from, to, deltaV, kind, label: `${from} to ${to}`, sourceId: 'fixture', assumptions: ['Directed test maneuver.'] }
}

function graphFrom(nodes: RouteNode[], edges: ManeuverEdge[]): PlannerGraph {
  return {
    nodes: new Map(nodes.map(candidate => [candidate.id, candidate])),
    adjacency: new Map(nodes.map(candidate => [candidate.id, edges.filter(maneuver => maneuver.from === candidate.id)])),
  }
}

function directedLine(): PlannerGraph {
  return graphFrom(['a', 'b', 'c', 'd'].map(id => node(id)), [
    edge('a', 'b', 1), edge('b', 'c', 2), edge('c', 'd', 3),
    edge('d', 'c', 4), edge('c', 'b', 5), edge('b', 'a', 6),
  ])
}

function arrivalGraph(): PlannerGraph {
  return graphFrom([
    node('a', 'a', 'encounter'), node('b', 'b', 'encounter'),
    node('high', 'b', 'elliptical'), node('low', 'b', 'orbit'),
  ], [
    edge('a', 'b', 10), edge('b', 'a', 20),
    edge('b', 'high', 2, 'capture'), edge('high', 'b', 3, 'escape'),
    edge('high', 'low', 5, 'capture'), edge('low', 'high', 7, 'escape'),
  ])
}

describe('ordered contextual route search', () => {
  it('keeps the best complete itinerary instead of greedily choosing a cheaper arrival context', () => {
    // A synthetic directed graph exposes two distinct arrival-energy contexts.
    const graph = graphFrom([
      node('a', 'a', 'encounter'), node('b', 'b', 'encounter'),
      node('high', 'b', 'elliptical'), node('low', 'b', 'orbit'), node('c', 'c', 'encounter'),
    ], [
      edge('a', 'b', 1), edge('b', 'high', 1, 'capture'),
      edge('a', 'low', 4), edge('low', 'high', 1, 'escape'),
      edge('high', 'low', 100, 'capture'), edge('high', 'b', 1, 'escape'), edge('b', 'c', 1),
    ])
    expect(findLowestCostPath(graph, 'a', 'high')).toMatchObject({ totalDeltaV: 2 })
    expect(findLowestCostPath(graph, 'high', 'c', { pendingParkingBodyId: 'b' })).toMatchObject({ totalDeltaV: 103 })
    const result = findMissionRoute(graph, 'a', 'c', 'one-way', ['high'])
    expect(result).toMatchObject({
      status: 'success', nodeIds: ['a', 'low', 'high', 'b', 'c'], totalDeltaV: 7,
      outboundStages: [
        { nodeIds: ['a', 'low', 'high'], totalDeltaV: 5, legs: [{ cumulativeDeltaV: 4 }, { cumulativeDeltaV: 5 }] },
        { nodeIds: ['high', 'b', 'c'], totalDeltaV: 2, legs: [{ cumulativeDeltaV: 1 }, { cumulativeDeltaV: 2 }] },
      ],
    })
    if (result.status !== 'success') throw new Error('Expected an ordered mission')
    expect(result.legs.map(leg => leg.cumulativeDeltaV)).toEqual([4, 5, 6, 7])
  })

  it('does not count a future stop passed before its requested turn', () => {
    const graph = graphFrom(['a', 'b', 'c', 'd'].map(id => node(id)), [
      edge('a', 'c', 1), edge('c', 'b', 1), edge('b', 'c', 1), edge('c', 'd', 1),
    ])
    expect(findOrderedPath(graph, ['a', 'b', 'c', 'd'])).toMatchObject({
      status: 'success', nodeIds: ['a', 'c', 'b', 'c', 'd'], totalDeltaV: 4,
      stageLegIndices: [0, 2, 3, 4],
    })
  })

  it('returns a useful failure prefix without claiming the whole itinerary succeeded', () => {
    const graph = graphFrom(['a', 'b', 'c'].map(id => node(id)), [edge('a', 'b', 2)])
    expect(findOrderedPath(graph, ['a', 'b', 'c'])).toMatchObject({
      status: 'unreachable', reachedIndex: 1, stageLegIndices: [0, 1],
      partialRoute: { nodeIds: ['a', 'b'], totalDeltaV: 2 },
    })
  })

  it('handles repeated states and zero-cost cycles without dropping required stages', () => {
    const graph = graphFrom(['a', 'b'].map(id => node(id)), [edge('a', 'b', 0), edge('b', 'a', 0)])
    expect(findOrderedPath(graph, ['a', 'a', 'b', 'b', 'a'])).toMatchObject({
      status: 'success', nodeIds: ['a', 'b', 'a'], legs: [{ cumulativeDeltaV: 0 }, { cumulativeDeltaV: 0 }],
      totalDeltaV: 0, stageLegIndices: [0, 0, 1, 1, 2],
    })
  })

  it('does not discard an available finite mission because an unrelated branch overflows', () => {
    const graph = graphFrom(['a', 'huge', 'dead', 'goal'].map(id => node(id)), [
      edge('a', 'huge', 1e308), edge('a', 'goal', 1e308), edge('huge', 'dead', 1e308),
    ])
    expect(findOrderedPath(graph, ['a', 'goal'])).toMatchObject({ status: 'success', totalDeltaV: 1e308 })
    // The legacy single-route API retains its pre-existing overflow policy.
    expect(findLowestCostPath(graph, 'a', 'goal').status).toBe('invalid')
  })

  it('validates empty, unknown, and malformed ordered searches', () => {
    const graph = directedLine()
    expect(findOrderedPath(graph, []).status).toBe('invalid')
    expect(findOrderedPath(graph, ['a', 'missing', 'd']).status).toBe('invalid')
    expect(findOrderedPath(graph, ['a', 'd'], { pendingParkingBodyId: 'missing' }).status).toBe('invalid')
    expect(findOrderedPath({ ...graph, adjacency: new Map() }, ['a', 'd']).status).toBe('invalid')
  })
})

describe('ordered mission modes and stages', () => {
  it('follows outbound stops with stage-local cumulative costs', () => {
    expect(findMissionRoute(directedLine(), 'a', 'd', 'one-way', ['b', 'c'])).toMatchObject({
      status: 'success', nodeIds: ['a', 'b', 'c', 'd'], totalDeltaV: 6,
      outbound: { totalDeltaV: 6 }, returnRoute: null, returnLegIndex: null, returnStages: [],
      outboundStages: [
        { nodeIds: ['a', 'b'], totalDeltaV: 1, legs: [{ cumulativeDeltaV: 1 }] },
        { nodeIds: ['b', 'c'], totalDeltaV: 2, legs: [{ cumulativeDeltaV: 2 }] },
        { nodeIds: ['c', 'd'], totalDeltaV: 3, legs: [{ cumulativeDeltaV: 3 }] },
      ],
    })
  })

  it('reverses the entire stop itinerary for an independent return-only mission', () => {
    expect(findMissionRoute(directedLine(), 'a', 'd', 'return-only', ['b', 'c'])).toMatchObject({
      status: 'success', nodeIds: ['d', 'c', 'b', 'a'], totalDeltaV: 15,
      outbound: null, outboundStages: [], returnRoute: { totalDeltaV: 15 }, returnLegIndex: 0,
      returnStages: [
        { nodeIds: ['d', 'c'], totalDeltaV: 4 }, { nodeIds: ['c', 'b'], totalDeltaV: 5 }, { nodeIds: ['b', 'a'], totalDeltaV: 6 },
      ],
    })
  })

  it('retraces stops in reverse order on a round trip and applies reserve once', () => {
    const result = findMissionRoute(directedLine(), 'a', 'd', 'round-trip', ['b', 'c'])
    expect(result).toMatchObject({
      status: 'success', nodeIds: ['a', 'b', 'c', 'd', 'c', 'b', 'a'], totalDeltaV: 21,
      outbound: { totalDeltaV: 6 }, returnRoute: { totalDeltaV: 15 }, returnLegIndex: 3,
      outboundStages: [{ totalDeltaV: 1 }, { totalDeltaV: 2 }, { totalDeltaV: 3 }],
      returnStages: [{ totalDeltaV: 4 }, { totalDeltaV: 5 }, { totalDeltaV: 6 }],
    })
    if (result.status !== 'success') throw new Error('Expected a round trip')
    expect(result.legs.map(leg => leg.cumulativeDeltaV)).toEqual([1, 3, 6, 10, 15, 21])
    expect(calculateBudget(result.totalDeltaV, 20)).toMatchObject({ baseDeltaV: 21, extraDeltaV: 5, totalDeltaV: 26 })
  })

  it('does not reset arrival energy at an encounter stop', () => {
    expect(findMissionRoute(arrivalGraph(), 'a', 'a', 'one-way', ['b'])).toMatchObject({
      status: 'success', totalDeltaV: 47,
      nodeIds: ['a', 'b', 'high', 'low', 'high', 'b', 'a'],
      outboundStages: [{ totalDeltaV: 10 }, { totalDeltaV: 37 }],
    })
  })

  it('retains the pending capture across a high-ellipse stop and the turnaround', () => {
    expect(findMissionRoute(arrivalGraph(), 'a', 'b', 'round-trip', ['high'])).toMatchObject({
      status: 'success', totalDeltaV: 52,
      outboundStages: [{ totalDeltaV: 12 }, { totalDeltaV: 3 }],
      returnStages: [{ totalDeltaV: 2 }, { totalDeltaV: 35 }],
    })
    const graph = arrivalGraph()
    const noParking = { ...graph, adjacency: new Map([...graph.adjacency].map(([id, edges]) => [id, edges.filter(maneuver => maneuver.to !== 'low')])) }
    expect(findMissionRoute(noParking, 'a', 'a', 'one-way', ['b']).status).toBe('unreachable')
    // A return-only craft starts independently at the selected encounter.
    expect(findMissionRoute(noParking, 'a', 'b', 'return-only', ['high'])).toMatchObject({ status: 'success', totalDeltaV: 25 })
  })

  it.each<MissionMode>(['one-way', 'round-trip', 'return-only'])('keeps zero-maneuver duplicate stages (%s)', mode => {
    const graph = directedLine()
    const result = findMissionRoute(graph, 'a', 'b', mode, ['a', 'a', 'b', 'b'])
    expect(result.status).toBe('success')
    if (result.status !== 'success') throw new Error('Expected duplicate stops to be valid')
    const stages = mode === 'return-only' ? result.returnStages : result.outboundStages
    expect(stages.map(stage => stage.legs.length)).toEqual([0, 0, 1, 0, 0])
    expect(stages.map(stage => stage.totalDeltaV)).toEqual([0, 0, mode === 'return-only' ? 6 : 1, 0, 0])
    expect(result.nodeIds).toEqual(mode === 'round-trip' ? ['a', 'b', 'a'] : mode === 'return-only' ? ['b', 'a'] : ['a', 'b'])
  })

  it('visits a required stop even when the origin equals the destination', () => {
    expect(findMissionRoute(directedLine(), 'a', 'a', 'one-way', ['b'])).toMatchObject({
      status: 'success', nodeIds: ['a', 'b', 'a'], totalDeltaV: 7,
    })
  })

  it('rejects an unreachable intermediate stop despite a reachable final destination', () => {
    const graph = graphFrom(['a', 'b', 'c'].map(id => node(id)), [edge('a', 'c', 1)])
    const result = findMissionRoute(graph, 'a', 'c', 'one-way', ['b'])
    expect(result).toMatchObject({ status: 'unreachable', failedLeg: 'outbound', outbound: null, message: expect.stringContaining('Stage 1 to b') })
    expect(result).not.toHaveProperty('totalDeltaV')
  })

  it('identifies a failed return stage without presenting the outbound as a complete mission', () => {
    const graph = graphFrom(['a', 'b', 'c'].map(id => node(id)), [edge('a', 'b', 1), edge('b', 'c', 2)])
    const result = findMissionRoute(graph, 'a', 'c', 'round-trip', ['b'])
    expect(result).toMatchObject({
      status: 'unreachable', failedLeg: 'return', outbound: { totalDeltaV: 3 }, returnRoute: null,
      message: expect.stringMatching(/^Return leg: Stage 1 to b:/),
    })
    expect(result).not.toHaveProperty('totalDeltaV')
  })

  it('validates unknown, non-string, and excess stops without mutating the requested order', () => {
    const graph = directedLine()
    for (const stops of [['missing'], [''], [7] as unknown as string[], ['a', 'a', 'a', 'a', 'a']]) {
      expect(findMissionRoute(graph, 'a', 'd', 'one-way', stops).status).toBe('invalid')
    }
    expect(findMissionRoute(graph, 'a', 'd', 'one-way', null as unknown as string[]).status).toBe('invalid')
    expect(findMissionRoute(graph, 'a', 'd', 'unknown' as MissionMode).status).toBe('invalid')
    const stops = Object.freeze(['b', 'c'])
    const before = structuredClone(graph)
    findMissionRoute(graph, 'a', 'd', 'round-trip', stops)
    expect(stops).toEqual(['b', 'c'])
    expect(graph).toEqual(before)
  })

  it('reports overflow on the relevant stop stage instead of returning an infinite budget', () => {
    const graph = graphFrom(['a', 'b', 'c'].map(id => node(id)), [edge('a', 'b', 1e308), edge('b', 'c', 1e308)])
    expect(findMissionRoute(graph, 'a', 'c', 'one-way', ['b'])).toMatchObject({
      status: 'invalid', failedLeg: 'outbound', outbound: null,
      message: expect.stringMatching(/Stage 2 to c: .*numeric range/),
    })
  })

  it.each([
    { pack: stockPack, start: 'stock:kerbin:surface', goal: 'stock:mun:surface', stop: 'stock:kerbin:orbit', base: 5120 },
    { pack: opmPack, start: 'stock:kerbin:surface', goal: 'opm:tekto:surface', stop: 'opm:sarnus:orbit', base: 11927 },
    { pack: rssPack, start: 'rss:earth:surface', goal: 'rss:moon:surface', stop: 'rss:earth:orbit', base: 14660 },
  ])('retains sourced $pack.shortName budgets through required reference-orbit stops', ({ pack, start, goal, stop, base }) => {
    const graph = buildGraph(pack)
    for (const mode of ['one-way', 'return-only', 'round-trip'] as const) {
      const result = findMissionRoute(graph, start, goal, mode, [stop])
      expect(result.status).toBe('success')
      if (result.status !== 'success') throw new Error('Expected a supported pack route')
      const total = base * (mode === 'round-trip' ? 2 : 1)
      expect(result.totalDeltaV).toBe(total)
      expect(result.outboundStages).toHaveLength(mode === 'return-only' ? 0 : 2)
      expect(result.returnStages).toHaveLength(mode === 'one-way' ? 0 : 2)
      expect(calculateBudget(result.totalDeltaV, 20).totalDeltaV).toBe(Math.ceil(total * 1.2))
    }
  })
})
