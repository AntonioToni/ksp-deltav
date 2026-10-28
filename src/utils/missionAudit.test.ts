import { describe, expect, it } from 'vitest'
import { opmKcalbelohPack, stockKcalbelohPack } from '../data/kcalbeloh'
import type { ManeuverEdge, PlannerGraph, RouteNode } from '../types/planner'
import { applyAtmosphericAssistance } from './atmosphericAssistance'
import { buildGraph } from './buildGraph'
import { calculateBudget } from './budget'
import { findMissionRoute, type MissionMode } from './mission'

/** Enumerate the complete arrival/visit state space, then relax every arc.
 * This Bellman–Ford oracle shares no search or stage-slicing code with the
 * production Dijkstra solver. The transition rules express the documented
 * parking-orbit requirement, independently of the shortest-path algorithm.
 */
function exhaustiveMinimum(nodes: RouteNode[], edges: ManeuverEdge[], itinerary: string[]): number {
  const contexts: (string | null)[] = [null, ...new Set(nodes.map(node => node.bodyId))]
  const byId = new Map(nodes.map(node => [node.id, node]))
  const key = (id: string, waitingForOrbit: string | null, visit: number) => JSON.stringify([id, waitingForOrbit, visit])
  const consumeVisits = (id: string, visit: number) => {
    while (visit < itinerary.length && itinerary[visit] === id) visit++
    return visit
  }
  const costs = new Map([[key(itinerary[0]!, null, consumeVisits(itinerary[0]!, 1)), 0]])
  const arcs: [string, string, number][] = []
  for (let visit = 1; visit < itinerary.length; visit++) {
    for (const waitingForOrbit of contexts) for (const edge of edges) {
      const from = byId.get(edge.from)!
      const to = byId.get(edge.to)!
      const arrivesAtAnotherEncounter = edge.kind === 'transfer'
        && from.kind === 'encounter' && to.kind === 'encounter' && from.bodyId !== to.bodyId
      if (arrivesAtAnotherEncounter && waitingForOrbit !== null) continue
      const nextContext = arrivesAtAnotherEncounter ? to.bodyId
        : to.kind === 'orbit' && to.bodyId === waitingForOrbit ? null : waitingForOrbit
      arcs.push([key(from.id, waitingForOrbit, visit), key(to.id, nextContext, consumeVisits(to.id, visit)), edge.deltaV])
    }
  }
  const stateCount = nodes.length * contexts.length * (itinerary.length + 1)
  for (let pass = 0; pass < stateCount - 1; pass++) {
    let improved = false
    for (const [from, to, deltaV] of arcs) {
      const candidate = (costs.get(from) ?? Infinity) + deltaV
      if (candidate < (costs.get(to) ?? Infinity)) {
        costs.set(to, candidate)
        improved = true
      }
    }
    if (!improved) break
  }
  return Math.min(...contexts.map(context => costs.get(key(itinerary.at(-1)!, context, itinerary.length)) ?? Infinity))
}

function seededRandom(seed: number) {
  return (limit: number) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed % limit
  }
}

function auditCases() {
  const random = seededRandom(0x654abc)
  return Array.from({ length: 120 }, (_, trial) => {
    const nodes: RouteNode[] = ['a', 'b', 'c'].flatMap(bodyId =>
      (['encounter', 'orbit', 'surface'] as const).map(kind => ({ id: `${bodyId}:${kind}`, bodyId, kind, label: `${bodyId} ${kind}` })))
    const edges: ManeuverEdge[] = []
    for (const from of nodes) for (const to of nodes) if (from !== to && random(5) === 0) {
      edges.push({
        id: `${from.id}->${to.id}`, from: from.id, to: to.id, kind: 'transfer',
        deltaV: random(21), label: 'Independent audit arc', sourceId: 'fixture', assumptions: [],
      })
    }
    const graph: PlannerGraph = {
      nodes: new Map(nodes.map(node => [node.id, node])),
      adjacency: new Map(nodes.map(node => [node.id, edges.filter(edge => edge.from === node.id)])),
    }
    const start = nodes[random(nodes.length)]!.id
    const end = nodes[random(nodes.length)]!.id
    const stops = Array.from({ length: random(4) }, () => nodes[random(nodes.length)]!.id)
    // Deliberately include repeated visits, not just whatever the seed yields.
    if (trial % 10 === 0) stops.push(stops.at(-1) ?? start)
    return { trial, nodes, edges, graph, start, end, stops }
  })
}

const cases = auditCases()

describe('independent mission calculation audit', () => {
  it.each<MissionMode>(['one-way', 'round-trip', 'return-only'])('agrees with exhaustive state-space relaxation for seeded %s missions', mode => {
    let reachable = 0
    let unreachable = 0
    for (const { trial, nodes, edges, graph, start, end, stops } of cases) {
      const before = structuredClone(graph)
      const outward = [start, ...stops, end]
      const itinerary = mode === 'one-way' ? outward : mode === 'return-only' ? [...outward].reverse()
        : [...outward, ...[...outward].reverse().slice(1)]
      const expected = exhaustiveMinimum(nodes, edges, itinerary)
      const actual = findMissionRoute(graph, start, end, mode, stops)
      const detail = `Seeded graph ${trial}, ${mode}, itinerary ${itinerary.join(' → ')}`
      if (expected === Infinity) {
        expect(actual.status, detail).toBe('unreachable')
        unreachable++
      } else {
        expect(actual.status, detail).toBe('success')
        if (actual.status !== 'success') throw new Error(detail)
        expect(actual.totalDeltaV, detail).toBe(expected)
        expect(actual.legs.reduce((sum, { edge }) => sum + edge.deltaV, 0), detail).toBe(expected)
        expect(actual.nodeIds, detail).toEqual([itinerary[0], ...actual.legs.map(({ edge }) => edge.to)])
        actual.legs.forEach(({ edge, cumulativeDeltaV }, index) => {
          expect(edge.from, detail).toBe(actual.nodeIds[index])
          expect(cumulativeDeltaV, detail).toBe(actual.legs.slice(0, index + 1).reduce((sum, leg) => sum + leg.edge.deltaV, 0))
        })
        const stages = [...actual.outboundStages, ...actual.returnStages]
        expect(stages, detail).toHaveLength(itinerary.length - 1)
        expect(stages.reduce((sum, stage) => sum + stage.totalDeltaV, 0), detail).toBe(expected)
        expect(stages.flatMap(stage => stage.legs.map(leg => leg.edge.id)), detail).toEqual(actual.legs.map(leg => leg.edge.id))
        stages.forEach((stage, index) => {
          expect(stage.nodeIds[0], detail).toBe(itinerary[index])
          expect(stage.nodeIds.at(-1), detail).toBe(itinerary[index + 1])
        })
        reachable++
      }
      expect(graph, detail).toEqual(before)
    }
    expect(reachable).toBeGreaterThan(0)
    expect(unreachable).toBeGreaterThan(0)
    expect(cases.some(({ edges }) => edges.some(edge => edge.deltaV === 0))).toBe(true)
  })

  it('matches exact-rational ceiling arithmetic for fractional budgets and reserve percentages', () => {
    const random = seededRandom(154655)
    for (let trial = 0; trial < 2000; trial++) {
      const rawBase = random(1_000_000_000)
      const milliBase = trial % 4 === 0 ? Math.floor(rawBase / 1000) * 1000 : rawBase
      const tenthPercent = random(1001)
      // Base is in thousandths of m/s, reserve is in tenths of a percent.
      // BigInt performs exact decimal arithmetic rather than repeating the
      // production floating-point multiplication or tolerance correction.
      const numerator = BigInt(milliBase) * BigInt(1000 + tenthPercent)
      const expected = Number((numerator + 999999n) / 1000000n)
      expect(calculateBudget(milliBase / 1000, tenthPercent / 10).totalDeltaV,
        `Decimal base ${milliBase}/1000, reserve ${tenthPercent}/10%`).toBe(expected)
    }
  })

  it.each([stockKcalbelohPack, opmKcalbelohPack])('preserves the independent local-pair decomposition with a fractional landing allowance in $name', pack => {
    const before = structuredClone(pack)
    const reference = buildGraph(pack)
    const { graph } = applyAtmosphericAssistance(reference, pack, [{
      bodyId: 'kcalbeloh:suluco', capture: false, landing: true, landingDeltaV: 100.25,
    }])
    const route = findMissionRoute(graph, 'kcalbeloh:tot:surface', 'kcalbeloh:suluco:surface', 'round-trip')
    if (route.status !== 'success') throw new Error(route.message)
    // Source map: Tot ascent 23, complete pair 676 + 312, Suluco ascent 2920.
    // Only Suluco's descent is the explicitly supplied 100.25 m/s allowance.
    const outbound = 23 + 676 + 312 + 100.25
    const returning = 2920 + 676 + 312 + 23
    expect(route.outbound?.totalDeltaV).toBe(outbound)
    expect(route.returnRoute?.totalDeltaV).toBe(returning)
    expect(route.totalDeltaV).toBe(outbound + returning)
    expect(calculateBudget(route.totalDeltaV, 12.5).totalDeltaV).toBe(5673)
    expect(pack).toEqual(before)
    expect(findMissionRoute(reference, 'kcalbeloh:tot:surface', 'kcalbeloh:suluco:surface', 'round-trip'))
      .toMatchObject({ status: 'success', totalDeltaV: 7862 })
  })
})
