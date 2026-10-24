import { describe, expect, it } from 'vitest'
import { stockPack } from '../data/stock'
import type { ManeuverEdge, PlannerGraph, RouteNode, RouteResult } from '../types/planner'
import { buildGraph } from './buildGraph'
import { calculateBudget } from './budget'
import { findLowestCostPath } from './findRoute'
import { findMissionRoute } from './mission'

function edge(id: string, from: string, to: string, deltaV: number, kind: ManeuverEdge['kind'] = 'transfer'): ManeuverEdge {
  return { id, from, to, deltaV, kind, label: id, sourceId: 'fixture', assumptions: ['Directed test maneuver.'] }
}

function graphFrom(nodes: RouteNode[], edges: ManeuverEdge[]): PlannerGraph {
  return {
    nodes: new Map(nodes.map(node => [node.id, node])),
    adjacency: new Map(nodes.map(node => [node.id, edges.filter(maneuver => maneuver.from === node.id)])),
  }
}

function asymmetricGraph(): PlannerGraph {
  return graphFrom([
    { id: 'surface', bodyId: 'planet', kind: 'surface', label: 'Surface' },
    { id: 'orbit', bodyId: 'planet', kind: 'orbit', label: 'Orbit' },
  ], [edge('ascent', 'surface', 'orbit', 100, 'ascent'), edge('descent', 'orbit', 'surface', 60, 'descent')])
}

function encounterGraph(): PlannerGraph {
  return graphFrom([
    { id: 'a:encounter', bodyId: 'a', kind: 'encounter', label: 'A encounter' },
    { id: 'b:encounter', bodyId: 'b', kind: 'encounter', label: 'B encounter' },
    { id: 'b:elliptical', bodyId: 'b', kind: 'elliptical', label: 'B high ellipse' },
    { id: 'b:orbit', bodyId: 'b', kind: 'orbit', label: 'B low orbit' },
    { id: 'moon:encounter', bodyId: 'moon', kind: 'encounter', label: 'Moon encounter' },
    { id: 'moon:orbit', bodyId: 'moon', kind: 'orbit', label: 'Moon low orbit' },
  ], [
    edge('outbound', 'a:encounter', 'b:encounter', 10),
    edge('inbound', 'b:encounter', 'a:encounter', 20),
    edge('capture-ellipse', 'b:encounter', 'b:elliptical', 2, 'capture'),
    edge('escape-ellipse', 'b:elliptical', 'b:encounter', 3, 'escape'),
    edge('capture-low', 'b:elliptical', 'b:orbit', 5, 'capture'),
    edge('escape-low', 'b:orbit', 'b:elliptical', 7, 'escape'),
    edge('to-moon', 'b:elliptical', 'moon:encounter', 3),
    edge('from-moon', 'moon:encounter', 'b:elliptical', 3),
    edge('moon-capture', 'moon:encounter', 'moon:orbit', 4, 'capture'),
    edge('moon-escape', 'moon:orbit', 'moon:encounter', 4, 'escape'),
  ])
}

describe('directed one-way and round-trip missions', () => {
  it('keeps a one-way mission identical to the existing route result', () => {
    const graph = asymmetricGraph()
    const direct = findLowestCostPath(graph, 'surface', 'orbit')
    const mission = findMissionRoute(graph, 'surface', 'orbit', false)
    expect(mission).toMatchObject({ ...direct, outbound: direct, returnRoute: null, roundTrip: false, returnLegIndex: null })
    const mapCompatible: RouteResult = mission
    expect(mapCompatible.status).toBe('success')
  })

  it('calculates the return independently instead of doubling the outbound cost', () => {
    const mission = findMissionRoute(asymmetricGraph(), 'surface', 'orbit', true)
    expect(mission).toMatchObject({
      status: 'success', nodeIds: ['surface', 'orbit', 'surface'], totalDeltaV: 160,
      outbound: { totalDeltaV: 100 }, returnRoute: { totalDeltaV: 60 }, roundTrip: true, returnLegIndex: 1,
      legs: [
        { edge: { id: 'ascent' }, cumulativeDeltaV: 100 },
        { edge: { id: 'descent' }, cumulativeDeltaV: 160 },
      ],
    })
  })

  it('uses the reverse direction costs when swapping the mission origin', () => {
    expect(findMissionRoute(asymmetricGraph(), 'orbit', 'surface', true)).toMatchObject({
      status: 'success', totalDeltaV: 160, outbound: { totalDeltaV: 60 }, returnRoute: { totalDeltaV: 100 },
    })
  })

  it.each([false, true])('supports a zero-maneuver mission (round trip: %s)', roundTrip => {
    expect(findMissionRoute(asymmetricGraph(), 'surface', 'surface', roundTrip)).toMatchObject({
      status: 'success', totalDeltaV: 0, nodeIds: ['surface'], legs: [], roundTrip,
      returnLegIndex: roundTrip ? 0 : null,
    })
  })

  it('preserves invalid and unreachable outbound failures', () => {
    const graph = asymmetricGraph()
    expect(findMissionRoute(graph, 'missing', 'orbit', true)).toMatchObject({ status: 'invalid', failedLeg: 'outbound', outbound: null })
    const disconnected = { ...graph, adjacency: new Map([['surface', []], ['orbit', []]]) }
    expect(findMissionRoute(disconnected, 'surface', 'orbit', true)).toMatchObject({ status: 'unreachable', failedLeg: 'outbound', outbound: null })
  })

  it('reports an unreachable return without presenting a partial mission as successful', () => {
    const graph = asymmetricGraph()
    const oneWay = { ...graph, adjacency: new Map([...graph.adjacency].map(([id, edges]) => [id, id === 'orbit' ? [] : edges])) }
    expect(findMissionRoute(oneWay, 'surface', 'orbit', true)).toMatchObject({
      status: 'unreachable', failedLeg: 'return', returnRoute: null, outbound: { status: 'success', totalDeltaV: 100 },
      message: expect.stringContaining('Return leg:'),
    })
    expect(findMissionRoute(oneWay, 'surface', 'orbit', false).status).toBe('success')
  })

  it('combines stock routes and applies reserve once to the complete mission', () => {
    const mission = findMissionRoute(buildGraph(stockPack), 'stock:kerbin:surface', 'stock:mun:surface', true)
    expect(mission).toMatchObject({
      status: 'success', totalDeltaV: 10240, outbound: { totalDeltaV: 5120 }, returnRoute: { totalDeltaV: 5120 }, returnLegIndex: 4,
    })
    if (mission.status !== 'success') throw new Error('Expected round trip')
    expect(mission.nodeIds.filter(id => id === 'stock:mun:surface')).toHaveLength(1)
    expect(mission.legs.at(-1)?.cumulativeDeltaV).toBe(mission.totalDeltaV)
    expect(calculateBudget(mission.totalDeltaV, 20)).toMatchObject({ extraDeltaV: 2048, totalDeltaV: 12288 })
  })

  it('keeps graph nodes and source maneuvers unchanged', () => {
    const graph = buildGraph(stockPack)
    const before = structuredClone(graph)
    findMissionRoute(graph, 'stock:kerbin:surface', 'stock:duna:surface', true)
    expect(graph).toEqual(before)
  })

  it('reports combined numeric overflow instead of a successful infinite budget', () => {
    const graph = asymmetricGraph()
    const huge = { ...graph, adjacency: new Map([...graph.adjacency].map(([id, edges]) => [id, edges.map(maneuver => ({ ...maneuver, deltaV: 1e308 }))])) }
    expect(findMissionRoute(huge, 'surface', 'orbit', true)).toMatchObject({ status: 'invalid', failedLeg: 'return' })
  })
})

describe('arrival context across the round-trip turnaround', () => {
  it('requires capture and escape before returning from an interplanetary encounter', () => {
    const mission = findMissionRoute(encounterGraph(), 'a:encounter', 'b:encounter', true)
    expect(mission).toMatchObject({
      status: 'success', totalDeltaV: 47, outbound: { totalDeltaV: 10 }, returnRoute: { totalDeltaV: 37 },
      nodeIds: ['a:encounter', 'b:encounter', 'b:elliptical', 'b:orbit', 'b:elliptical', 'b:encounter', 'a:encounter'],
    })
  })

  it('keeps arrival context when the destination is a high ellipse', () => {
    expect(findMissionRoute(encounterGraph(), 'a:encounter', 'b:elliptical', true)).toMatchObject({
      status: 'success', totalDeltaV: 47, outbound: { totalDeltaV: 12 }, returnRoute: { totalDeltaV: 35 },
    })
  })

  it('keeps the arrival planet context through a moon-orbit destination', () => {
    const mission = findMissionRoute(encounterGraph(), 'a:encounter', 'moon:orbit', true)
    expect(mission).toMatchObject({ status: 'success', totalDeltaV: 61, outbound: { totalDeltaV: 19 }, returnRoute: { totalDeltaV: 42 } })
    if (mission.status !== 'success') throw new Error('Expected round trip')
    expect(mission.returnRoute?.nodeIds).toContain('b:orbit')
  })

  it('does not invent a return if the arrival planet has no reachable parking reset', () => {
    const graph = encounterGraph()
    const noCapture = { ...graph, adjacency: new Map([...graph.adjacency].map(([id, edges]) => [id, edges.filter(maneuver => maneuver.id !== 'capture-low')])) }
    expect(findMissionRoute(noCapture, 'a:encounter', 'b:encounter', true)).toMatchObject({
      status: 'unreachable', failedLeg: 'return', outbound: { totalDeltaV: 10 },
    })
  })

  it('validates explicitly seeded arrival context', () => {
    expect(findLowestCostPath(encounterGraph(), 'b:encounter', 'a:encounter', { pendingParkingBodyId: 'missing' }).status).toBe('invalid')
  })

  it('clears a seeded arrival context when already starting in that planet low orbit', () => {
    expect(findLowestCostPath(encounterGraph(), 'b:orbit', 'a:encounter', { pendingParkingBodyId: 'b' })).toMatchObject({ status: 'success', totalDeltaV: 30 })
  })
})
