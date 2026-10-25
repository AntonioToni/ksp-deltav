import { describe, expect, it } from 'vitest'
import type { ManeuverEdge, PlanetPack, PlannerGraph } from '../types/planner'
import { buildGraph } from './buildGraph'
import { findLowestCostPath } from './findRoute'
import { validatePlanetPack } from './validatePlanetPack'

function makePack(): PlanetPack {
  const maneuver = (id: string, from: string, to: string, deltaV: number, kind: ManeuverEdge['kind']): ManeuverEdge => ({
    id, from, to, deltaV, kind, label: id, sourceId: 'reference', assumptions: ['Reference low orbit; powered maneuvers.'],
  })
  return {
    id: 'fixture', name: 'Routing fixture', version: '1', description: 'Test-only maneuver graph.', assumptions: ['Fixed costs.'],
    sources: [{ id: 'reference', title: 'Reference', url: 'https://example.org/map' }],
    bodies: [
      { id: 'sun', name: 'Sun', parentId: null, kind: 'star', hasSurface: false, hasAtmosphere: false, color: '#fff' },
      { id: 'kerbin', name: 'Kerbin', parentId: 'sun', kind: 'planet', hasSurface: true, hasAtmosphere: true, color: '#08f' },
      { id: 'mun', name: 'Mun', parentId: 'kerbin', kind: 'moon', hasSurface: true, hasAtmosphere: false, color: '#aaa' },
      { id: 'duna', name: 'Duna', parentId: 'sun', kind: 'planet', hasSurface: true, hasAtmosphere: true, color: '#f80' },
    ],
    nodes: [
      ...['kerbin', 'mun'].flatMap(bodyId => [
        { id: `${bodyId}:surface`, bodyId, kind: 'surface' as const, label: `${bodyId} surface` },
        { id: `${bodyId}:orbit`, bodyId, kind: 'orbit' as const, label: `${bodyId} orbit`, altitudeKm: 100 },
        { id: `${bodyId}:encounter`, bodyId, kind: 'encounter' as const, label: `${bodyId} encounter` },
      ]),
      { id: 'duna:encounter', bodyId: 'duna', kind: 'encounter', label: 'Duna encounter' },
    ],
    maneuvers: [
      maneuver('kerbin:ascent', 'kerbin:surface', 'kerbin:orbit', 3400, 'ascent'),
      maneuver('kerbin:descent', 'kerbin:orbit', 'kerbin:surface', 2900, 'descent'),
      maneuver('kerbin:escape', 'kerbin:orbit', 'kerbin:encounter', 950, 'escape'),
      maneuver('kerbin:capture', 'kerbin:encounter', 'kerbin:orbit', 950, 'capture'),
      maneuver('to-mun', 'kerbin:orbit', 'mun:encounter', 860, 'transfer'),
      maneuver('from-mun', 'mun:encounter', 'kerbin:orbit', 860, 'transfer'),
      maneuver('mun:capture', 'mun:encounter', 'mun:orbit', 310, 'capture'),
      maneuver('mun:escape', 'mun:orbit', 'mun:encounter', 310, 'escape'),
      maneuver('mun:descent', 'mun:orbit', 'mun:surface', 580, 'descent'),
      maneuver('mun:ascent', 'mun:surface', 'mun:orbit', 580, 'ascent'),
      maneuver('to-duna', 'kerbin:encounter', 'duna:encounter', 130, 'transfer'),
    ],
  }
}

const extraEdge = (changes: Partial<ManeuverEdge> = {}): ManeuverEdge => ({
  id: 'extra', from: 'kerbin:orbit', to: 'mun:encounter', deltaV: 860, kind: 'transfer', label: 'Extra transfer',
  sourceId: 'reference', assumptions: ['Test edge.'], ...changes,
})

function manualGraph(adjacency: Map<string, ManeuverEdge[]>): PlannerGraph {
  return {
    nodes: new Map([...adjacency.keys()].map(id => [id, { id, bodyId: 'fixture', kind: 'orbit', label: id }])),
    adjacency,
  }
}

function interplanetaryPack(): PlanetPack {
  const pack = makePack()
  pack.bodies.push({ id: 'eve', name: 'Eve', parentId: 'sun', kind: 'planet', hasSurface: true, hasAtmosphere: true, color: '#808' })
  pack.nodes.push({ id: 'eve:encounter', bodyId: 'eve', kind: 'encounter', label: 'Eve encounter' })
  pack.maneuvers.push(
    extraEdge({ id: 'duna-return', from: 'duna:encounter', to: 'kerbin:encounter', deltaV: 130 }),
    extraEdge({ id: 'eve-transfer', from: 'kerbin:encounter', to: 'eve:encounter', deltaV: 100 }),
  )
  return pack
}

describe('planet pack validation', () => {
  it('rejects a nonboolean reference-braking policy', () => {
    const pack = makePack()
    Object.assign(pack.bodies[0]!, { supportsAtmosphericBraking: 'false' })
    expect(validatePlanetPack(pack).some(error => error.includes('supportsAtmosphericBraking must be a boolean'))).toBe(true)
  })

  it('accepts a consistent hierarchy and explicit directed maneuvers', () => {
    expect(validatePlanetPack(makePack())).toEqual([])
  })

  it('reports malformed imported shapes instead of throwing', () => {
    expect(validatePlanetPack(null as unknown as PlanetPack)).toEqual(['Planet pack must be an object.'])
    expect(validatePlanetPack({ bodies: [null], nodes: 'bad' } as unknown as PlanetPack).length).toBeGreaterThan(0)
  })

  it.each(['bodies', 'nodes', 'sources', 'maneuvers'] as const)('rejects duplicate IDs in %s', key => {
    const pack = makePack()
    const first = pack[key][0]
    expect(first).toBeDefined()
    const changed = { ...pack, [key]: [...pack[key], first] }
    expect(validatePlanetPack(changed).some(error => error.startsWith('Duplicate'))).toBe(true)
  })

  it('rejects unknown body references and unsupported surface states', () => {
    const pack = makePack()
    pack.nodes.push({ id: 'unknown', bodyId: 'missing', kind: 'orbit', label: 'Unknown orbit' })
    pack.nodes.push({ id: 'sun:surface', bodyId: 'sun', kind: 'surface', label: 'Sun surface' })
    const errors = validatePlanetPack(pack)
    expect(errors.some(error => error.includes('unknown body missing'))).toBe(true)
    expect(errors.some(error => error.includes('no landable surface'))).toBe(true)
  })

  it('rejects cycles and missing parents', () => {
    const pack = makePack()
    pack.bodies = pack.bodies.map(body => body.id === 'kerbin' ? { ...body, parentId: 'mun' } : body.id === 'duna' ? { ...body, parentId: 'missing' } : body)
    const errors = validatePlanetPack(pack)
    expect(errors.some(error => error.includes('cyclic'))).toBe(true)
    expect(errors.some(error => error.includes('unknown parent missing'))).toBe(true)
  })

  it('requires usable source metadata and known source/endpoint references', () => {
    const pack = makePack()
    pack.sources.push({ id: 'unsafe', title: 'Unsafe', url: 'javascript:alert(1)' })
    pack.maneuvers.push(extraEdge({ sourceId: 'missing', to: 'missing' }))
    const errors = validatePlanetPack(pack)
    expect(errors.some(error => error.includes('valid HTTPS URL'))).toBe(true)
    expect(errors.some(error => error.includes('unknown source missing'))).toBe(true)
    expect(errors.some(error => error.includes('unknown routing endpoint'))).toBe(true)
  })

  it.each([-1, Infinity, -Infinity, NaN])('rejects unsupported Delta-V %s', deltaV => {
    const pack = makePack()
    pack.maneuvers.push(extraEdge({ deltaV }))
    expect(validatePlanetPack(pack).some(error => error.includes('finite and nonnegative'))).toBe(true)
    expect(() => buildGraph(pack)).toThrow('Invalid planet pack')
  })

  it('accepts explicit elliptical orbit segments and attaches moons to their reference parent state', () => {
    const pack = makePack()
    pack.nodes.push({ id: 'kerbin:elliptical', bodyId: 'kerbin', kind: 'elliptical', label: 'Kerbin elliptical orbit' })
    pack.maneuvers.push(
      extraEdge({ id: 'raise-orbit', from: 'kerbin:orbit', to: 'kerbin:elliptical', kind: 'escape', deltaV: 800 }),
      extraEdge({ id: 'depart-ellipse', from: 'kerbin:elliptical', to: 'kerbin:encounter', kind: 'escape', deltaV: 150 }),
      extraEdge({ id: 'arrive-ellipse', from: 'kerbin:encounter', to: 'kerbin:elliptical', kind: 'capture', deltaV: 150 }),
      extraEdge({ id: 'lower-orbit', from: 'kerbin:elliptical', to: 'kerbin:orbit', kind: 'capture', deltaV: 800 }),
      extraEdge({ id: 'ellipse-to-moon', from: 'kerbin:elliptical', to: 'mun:encounter' }),
      extraEdge({ id: 'moon-to-ellipse', from: 'mun:encounter', to: 'kerbin:elliptical' }),
    )
    expect(validatePlanetPack(pack)).toEqual([])
  })

  it('rejects the old moon-orbit to parent-encounter shortcut', () => {
    const pack = makePack()
    pack.maneuvers.push(extraEdge({ from: 'mun:orbit', to: 'kerbin:encounter' }))
    expect(validatePlanetPack(pack).some(error => error.includes('unsupported transfer transition'))).toBe(true)
  })

  it.each([
    { from: 'kerbin:surface', to: 'kerbin:encounter', kind: 'escape' as const },
    { from: 'kerbin:orbit', to: 'mun:orbit', kind: 'transfer' as const },
    { from: 'kerbin:surface', to: 'kerbin:orbit', kind: 'descent' as const },
    { from: 'kerbin:encounter', to: 'mun:encounter', kind: 'transfer' as const },
  ])('rejects invalid state pairing $from → $to ($kind)', changes => {
    const pack = makePack()
    pack.maneuvers.push(extraEdge(changes))
    expect(validatePlanetPack(pack).some(error => error.includes('unsupported'))).toBe(true)
  })
})

describe('directed shortest-path routing', () => {
  it('returns the complete maneuver breakdown and cumulative costs', () => {
    const result = findLowestCostPath(buildGraph(makePack()), 'kerbin:surface', 'mun:surface')
    expect(result.status).toBe('success')
    if (result.status !== 'success') throw new Error('Expected route')
    expect(result.nodeIds).toEqual(['kerbin:surface', 'kerbin:orbit', 'mun:encounter', 'mun:orbit', 'mun:surface'])
    expect(result.legs.map(leg => leg.edge.id)).toEqual(['kerbin:ascent', 'to-mun', 'mun:capture', 'mun:descent'])
    expect(result.legs.map(leg => leg.cumulativeDeltaV)).toEqual([3400, 4260, 4570, 5150])
    expect(result.totalDeltaV).toBe(5150)
  })

  it('respects direction-specific costs without inferring reverse edges', () => {
    const graph = buildGraph(makePack())
    expect(findLowestCostPath(graph, 'kerbin:surface', 'kerbin:orbit')).toMatchObject({ status: 'success', totalDeltaV: 3400 })
    expect(findLowestCostPath(graph, 'kerbin:orbit', 'kerbin:surface')).toMatchObject({ status: 'success', totalDeltaV: 2900 })
    expect(findLowestCostPath(graph, 'duna:encounter', 'kerbin:encounter').status).toBe('unreachable')
  })

  it('routes moon orbit through its encounter and parent orbit', () => {
    const result = findLowestCostPath(buildGraph(makePack()), 'mun:orbit', 'kerbin:encounter')
    expect(result).toMatchObject({
      status: 'success', totalDeltaV: 2120,
      nodeIds: ['mun:orbit', 'mun:encounter', 'kerbin:orbit', 'kerbin:encounter'],
    })
  })

  it.each([
    ['kerbin:surface', 'missing'], ['missing', 'kerbin:surface'], ['missing', 'missing'],
  ])('rejects unknown endpoints %s → %s', (start, goal) => {
    expect(findLowestCostPath(buildGraph(makePack()), start, goal).status).toBe('invalid')
  })

  it('returns a valid zero-burn route for identical known states', () => {
    expect(findLowestCostPath(buildGraph(makePack()), 'kerbin:surface', 'kerbin:surface')).toEqual({
      status: 'success', nodeIds: ['kerbin:surface'], legs: [], totalDeltaV: 0,
    })
  })

  it('distinguishes disconnected known nodes from invalid endpoints', () => {
    const pack = makePack()
    pack.maneuvers = pack.maneuvers.filter(edge => edge.to !== 'duna:encounter')
    expect(findLowestCostPath(buildGraph(pack), 'kerbin:surface', 'duna:encounter').status).toBe('unreachable')
  })

  it('keeps the winning parallel maneuver ID and handles zero-cost cycles', () => {
    const pack = makePack()
    pack.maneuvers.push(extraEdge({ deltaV: 0 }))
    pack.maneuvers.push(extraEdge({ id: 'zero-return', from: 'mun:encounter', to: 'kerbin:orbit', deltaV: 0 }))
    const result = findLowestCostPath(buildGraph(pack), 'kerbin:surface', 'mun:surface')
    expect(result.status).toBe('success')
    if (result.status !== 'success') throw new Error('Expected route')
    expect(result.totalDeltaV).toBe(4290)
    expect(result.legs.map(leg => leg.edge.id)).toContain('extra')
  })

  it('replaces a direct predecessor when a cheaper multi-edge path is found', () => {
    const graph = manualGraph(new Map([
      ['start', [extraEdge({ id: 'direct', from: 'start', to: 'goal', deltaV: 10 }), extraEdge({ id: 'via', from: 'start', to: 'middle', deltaV: 1 })]],
      ['middle', [extraEdge({ id: 'finish', from: 'middle', to: 'goal', deltaV: 2 })]],
      ['goal', []],
    ]))
    expect(findLowestCostPath(graph, 'start', 'goal')).toMatchObject({
      status: 'success', nodeIds: ['start', 'middle', 'goal'], totalDeltaV: 3,
      legs: [{ edge: { id: 'via' }, cumulativeDeltaV: 1 }, { edge: { id: 'finish' }, cumulativeDeltaV: 3 }],
    })
  })

  it('cannot chain two interplanetary transfers through an encounter without capture', () => {
    const pack = interplanetaryPack()
    pack.maneuvers = pack.maneuvers.filter(edge => edge.id !== 'kerbin:capture')
    expect(findLowestCostPath(buildGraph(pack), 'duna:encounter', 'eve:encounter').status).toBe('unreachable')
  })

  it('retains the more expensive departure context after a real parking-orbit reset', () => {
    const result = findLowestCostPath(buildGraph(interplanetaryPack()), 'duna:encounter', 'eve:encounter')
    expect(result).toMatchObject({
      status: 'success', totalDeltaV: 2130,
      nodeIds: ['duna:encounter', 'kerbin:encounter', 'kerbin:orbit', 'kerbin:encounter', 'eve:encounter'],
      legs: [
        { edge: { id: 'duna-return' }, cumulativeDeltaV: 130 },
        { edge: { id: 'kerbin:capture' }, cumulativeDeltaV: 1080 },
        { edge: { id: 'kerbin:escape' }, cumulativeDeltaV: 2030 },
        { edge: { id: 'eve-transfer' }, cumulativeDeltaV: 2130 },
      ],
    })
  })

  it('does not reset an interplanetary arrival by looping through a high ellipse', () => {
    const pack = interplanetaryPack()
    pack.nodes.push({ id: 'kerbin:elliptical', bodyId: 'kerbin', kind: 'elliptical', label: 'High ellipse' })
    pack.maneuvers = pack.maneuvers.filter(edge => edge.id !== 'kerbin:capture')
    pack.maneuvers.push(
      extraEdge({ id: 'ellipse-capture', from: 'kerbin:encounter', to: 'kerbin:elliptical', kind: 'capture', deltaV: 1 }),
      extraEdge({ id: 'ellipse-escape', from: 'kerbin:elliptical', to: 'kerbin:encounter', kind: 'escape', deltaV: 1 }),
    )
    expect(findLowestCostPath(buildGraph(pack), 'duna:encounter', 'eve:encounter').status).toBe('unreachable')
  })

  it('does not substitute a moon parking orbit for the arrival planet parking orbit', () => {
    const pack = interplanetaryPack()
    pack.nodes.push({ id: 'kerbin:elliptical', bodyId: 'kerbin', kind: 'elliptical', label: 'High ellipse' })
    pack.maneuvers = pack.maneuvers.filter(edge => edge.id !== 'kerbin:capture' && edge.id !== 'from-mun')
    pack.maneuvers.push(
      extraEdge({ id: 'ellipse-capture', from: 'kerbin:encounter', to: 'kerbin:elliptical', kind: 'capture', deltaV: 1 }),
      extraEdge({ id: 'ellipse-escape', from: 'kerbin:elliptical', to: 'kerbin:encounter', kind: 'escape', deltaV: 1 }),
      extraEdge({ id: 'moon-transfer', from: 'kerbin:elliptical', to: 'mun:encounter', deltaV: 1 }),
      extraEdge({ id: 'moon-return', from: 'mun:encounter', to: 'kerbin:elliptical', deltaV: 1 }),
    )
    expect(findLowestCostPath(buildGraph(pack), 'duna:encounter', 'eve:encounter').status).toBe('unreachable')
  })

  it('allows an encounter endpoint without charging an unwanted capture maneuver', () => {
    expect(findLowestCostPath(buildGraph(interplanetaryPack()), 'duna:encounter', 'kerbin:encounter')).toMatchObject({
      status: 'success', totalDeltaV: 130, nodeIds: ['duna:encounter', 'kerbin:encounter'],
    })
  })

  it('requires node metadata for contextual routing on manually constructed graphs', () => {
    const graph = manualGraph(new Map([['start', []], ['goal', []]]))
    const missingMetadata: PlannerGraph = { ...graph, nodes: new Map([['start', { id: 'wrong', bodyId: 'fixture', kind: 'orbit', label: 'Wrong ID' }], ['goal', { id: 'goal', bodyId: 'fixture', kind: 'orbit', label: 'Goal' }]]) }
    expect(findLowestCostPath(missingMetadata, 'start', 'goal').status).toBe('invalid')
  })

  it('rejects malformed manually constructed graphs before Dijkstra runs', () => {
    for (const edge of [extraEdge({ deltaV: -1 }), extraEdge({ to: 'missing' }), extraEdge({ from: 'wrong' })]) {
      const graph = manualGraph(new Map([['kerbin:orbit', [edge]], ['mun:encounter', []]]))
      expect(findLowestCostPath(graph, 'kerbin:orbit', 'mun:encounter').status).toBe('invalid')
    }
  })
})
