import { describe, expect, it } from 'vitest'
import type { CelestialBody, ManeuverEdge, PlanetPack, PlannerGraph, RouteNode } from '../types/planner'
import { applyAtmosphericAssistance } from './atmosphericAssistance'
import { buildGraph } from './buildGraph'
import { applyConnectionAllowances } from './connectionAllowances'
import { hasPotentialConnectionRoute } from './connectionAvailability'
import { findLowestCostPath } from './findRoute'
import { findMissionRoute } from './mission'

function fixture(): PlanetPack {
  const body = (id: string, kind: CelestialBody['kind'], parentId: string | null, hasAtmosphere = false): CelestialBody => ({
    id, name: id, kind, parentId, hasSurface: kind === 'planet' || kind === 'moon', hasAtmosphere, color: '#abc',
  })
  const node = (bodyId: string, kind: RouteNode['kind']): RouteNode => ({ id: `${bodyId}:${kind}`, bodyId, kind, label: `${bodyId} ${kind}` })
  const maneuver = (from: string, to: string, deltaV: number, kind: ManeuverEdge['kind'], directTransfer = false): ManeuverEdge => ({
    id: `${from}->${to}`, from, to, deltaV, kind, label: `${from} to ${to}`, sourceId: 'fixture', assumptions: ['Synthetic directed budget.'],
    ...(directTransfer ? { directTransfer: true } : {}),
  })
  return {
    id: 'sibling-fixture', name: 'Sibling context fixture', version: '1', description: 'Synthetic context, not physical reference budgets.', assumptions: [],
    sources: [{ id: 'fixture', title: 'Synthetic fixture', url: 'https://example.org' }],
    bodies: [body('sun', 'star', null), body('a', 'planet', 'sun'), body('b', 'planet', 'sun'), body('c', 'planet', 'sun'), body('m', 'moon', 'b'), body('n', 'moon', 'b', true)],
    nodes: [
      node('a', 'orbit'), node('a', 'encounter'), node('b', 'encounter'), node('b', 'elliptical'), node('b', 'orbit'), node('c', 'orbit'),
      node('m', 'encounter'), node('m', 'orbit'), node('n', 'encounter'), node('n', 'orbit'),
    ],
    maneuvers: [
      maneuver('a:orbit', 'a:encounter', 1, 'escape'), maneuver('a:encounter', 'a:orbit', 1, 'capture'),
      maneuver('a:encounter', 'b:encounter', 10, 'transfer'), maneuver('b:encounter', 'a:encounter', 20, 'transfer'),
      maneuver('b:encounter', 'b:elliptical', 2, 'capture'), maneuver('b:elliptical', 'b:encounter', 2, 'escape'),
      maneuver('b:elliptical', 'b:orbit', 7, 'capture'), maneuver('b:orbit', 'b:elliptical', 8, 'escape'),
      maneuver('b:elliptical', 'm:encounter', 3, 'transfer'), maneuver('m:encounter', 'b:elliptical', 3, 'transfer'),
      maneuver('m:encounter', 'm:orbit', 4, 'capture'), maneuver('m:orbit', 'm:encounter', 4, 'escape'),
      maneuver('b:elliptical', 'n:encounter', 3, 'transfer'), maneuver('n:encounter', 'b:elliptical', 3, 'transfer'),
      maneuver('n:encounter', 'n:orbit', 4, 'capture'), maneuver('n:orbit', 'n:encounter', 4, 'escape'),
      maneuver('m:orbit', 'n:orbit', 5, 'transfer', true), maneuver('n:orbit', 'm:orbit', 6, 'transfer', true),
    ],
    unpricedConnections: [{
      id: 'extra', label: 'Unrelated allowance', from: 'a:orbit', to: 'c:orbit', forwardKind: 'transfer', reverseKind: 'transfer', sourceId: 'fixture', assumptions: ['Synthetic unknown cost.'],
    }],
  }
}

describe('local sibling transfers retain planetary arrival context', () => {
  it('compiles body hierarchy without changing exported nodes or source objects', () => {
    const pack = fixture()
    const before = structuredClone(pack)
    const graph = buildGraph(pack)
    expect(graph.bodies).toEqual(new Map(pack.bodies.map(body => [body.id, body])))
    expect(graph.nodes.get('m:orbit')).toBe(pack.nodes.find(node => node.id === 'm:orbit'))
    expect(pack).toEqual(before)
  })

  it('continues from one captured moon to its sibling without visiting parent low orbit', () => {
    const result = findMissionRoute(buildGraph(fixture()), 'a:orbit', 'n:orbit', 'one-way', ['m:orbit'])
    expect(result).toMatchObject({
      status: 'success', totalDeltaV: 25,
      nodeIds: ['a:orbit', 'a:encounter', 'b:encounter', 'b:elliptical', 'm:encounter', 'm:orbit', 'n:orbit'],
    })
    if (result.status !== 'success') throw new Error(result.message)
    expect(result.outboundStages.map(stage => stage.totalDeltaV)).toEqual([20, 5])
  })

  it('still requires the parent low-orbit reset before a later planetary departure', () => {
    const graph = buildGraph(fixture())
    const result = findLowestCostPath(graph, 'm:orbit', 'a:orbit', { pendingParkingBodyId: 'b' })
    expect(result).toMatchObject({ status: 'success', totalDeltaV: 45 })
    if (result.status !== 'success') throw new Error('Expected a reset route')
    expect(result.nodeIds).toContain('b:orbit')
    const adjacency = new Map([...graph.adjacency].map(([id, edges]) => [id, edges.filter(edge => edge.id !== 'b:elliptical->b:orbit')]))
    expect(findLowestCostPath({ ...graph, adjacency }, 'm:orbit', 'a:orbit', { pendingParkingBodyId: 'b' }).status).toBe('unreachable')
    const local = findLowestCostPath({ ...graph, adjacency }, 'm:orbit', 'n:orbit', { pendingParkingBodyId: 'b' })
    expect(local).toMatchObject({ status: 'success', totalDeltaV: 5, nodeIds: ['m:orbit', 'n:orbit'] })
  })

  it.each([
    { mode: 'one-way', total: 25, outward: [20, 5], returning: [] },
    { mode: 'round-trip', total: 76, outward: [20, 5], returning: [6, 45] },
    { mode: 'return-only', total: 36, outward: [], returning: [6, 30] },
  ] as const)('retains directed costs and context across ordered $mode stops', ({ mode, total, outward, returning }) => {
    const result = findMissionRoute(buildGraph(fixture()), 'a:orbit', 'n:orbit', mode, ['m:orbit'])
    expect(result).toMatchObject({ status: 'success', totalDeltaV: total })
    if (result.status !== 'success') throw new Error(result.message)
    expect(result.outboundStages.map(stage => stage.totalDeltaV)).toEqual(outward)
    expect(result.returnStages.map(stage => stage.totalDeltaV)).toEqual(returning)
    expect(result.legs.reduce((sum, { edge }) => sum + edge.deltaV, 0)).toBe(total)
  })

  it('keeps raw graphs conservative when hierarchy metadata is absent', () => {
    const { nodes, adjacency } = buildGraph(fixture())
    const raw: PlannerGraph = { nodes, adjacency }
    const result = findMissionRoute(raw, 'a:orbit', 'n:orbit', 'one-way', ['m:orbit'])
    expect(result).toMatchObject({ status: 'success', totalDeltaV: 34 })
    if (result.status !== 'success') throw new Error(result.message)
    expect(result.legs.some(({ edge }) => edge.directTransfer)).toBe(false)
  })

  it.each(['missing-parent', 'barycenter', 'foreign-parent', 'mismatched-id'] as const)('does not infer local capture semantics from %s hierarchy', change => {
    const graph = buildGraph(fixture())
    const bodies = new Map(graph.bodies)
    if (change === 'missing-parent') bodies.delete('b')
    if (change === 'barycenter') bodies.set('b', { ...bodies.get('b')!, kind: 'barycenter' })
    if (change === 'foreign-parent') bodies.set('n', { ...bodies.get('n')!, parentId: 'a' })
    if (change === 'mismatched-id') bodies.set('n', { ...bodies.get('n')!, id: 'forged' })
    const result = findLowestCostPath({ ...graph, bodies }, 'm:orbit', 'n:orbit', { pendingParkingBodyId: 'b' })
    expect(result).toMatchObject({ status: 'success', totalDeltaV: 14 })
    if (result.status !== 'success') throw new Error('Expected the original local map path')
    expect(result.legs.some(({ edge }) => edge.directTransfer)).toBe(false)
  })

  it('does not let a sibling pair bypass another planet’s pending arrival', () => {
    const graph = buildGraph(fixture())
    const local = findLowestCostPath(graph, 'm:orbit', 'n:orbit', { pendingParkingBodyId: 'a' })
    expect(local).toMatchObject({ status: 'success', totalDeltaV: 14 })
    if (local.status !== 'success') throw new Error('Expected the ordinary local map path')
    expect(local.legs.some(({ edge }) => edge.directTransfer)).toBe(false)
    expect(findLowestCostPath(graph, 'm:orbit', 'a:orbit', { pendingParkingBodyId: 'a' }).status).toBe('unreachable')
  })

  it('preserves hierarchy when atmospheric costs and link allowances change', () => {
    const pack = fixture()
    const graph = buildGraph(pack)
    const assisted = applyAtmosphericAssistance(graph, pack, [{ bodyId: 'n', capture: true, landing: false, landingDeltaV: 0 }]).graph
    const supplied = applyConnectionAllowances(assisted, pack, [{ connectionId: 'extra', forward: 7, reverse: null }]).graph
    expect(assisted).not.toBe(graph)
    expect(supplied).not.toBe(assisted)
    expect(assisted.bodies).toBe(graph.bodies)
    expect(supplied.bodies).toBe(graph.bodies)
    expect(findMissionRoute(supplied, 'a:orbit', 'n:orbit', 'one-way', ['m:orbit']))
      .toMatchObject({ status: 'success', totalDeltaV: 25 })
  })

  it('preserves hierarchy while probing potentially available link allowances', () => {
    const pack = fixture()
    pack.maneuvers = pack.maneuvers.filter(edge => !['b:elliptical->b:orbit', 'b:elliptical->n:encounter'].includes(edge.id))
    const graph = buildGraph(pack)
    expect(hasPotentialConnectionRoute(graph, pack, 'a:orbit', 'n:orbit', 'one-way', ['m:orbit'])).toBe(true)
    expect(hasPotentialConnectionRoute({ nodes: graph.nodes, adjacency: graph.adjacency }, pack, 'a:orbit', 'n:orbit', 'one-way', ['m:orbit'])).toBe(false)
  })
})
