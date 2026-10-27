import { describe, expect, it } from 'vitest'
import type { PlanetPack } from '../types/planner'
import { applyConnectionAllowances, type ConnectionPlan } from './connectionAllowances'
import { buildGraph } from './buildGraph'
import { findLowestCostPath } from './findRoute'
import { findMissionRoute } from './mission'
import { validatePlanetPack } from './validatePlanetPack'

function fixture(): PlanetPack {
  return {
    id: 'connection-fixture', name: 'Multiple stellar systems', version: '1', description: 'Explicit reference and unpriced connection fixture.', assumptions: ['No inferred costs.'],
    sources: [{ id: 'source', title: 'Configuration reference', url: 'https://example.org/config' }],
    bodies: [
      { id: 'sun', name: 'Sun', kind: 'star', parentId: null, hasSurface: false, hasAtmosphere: false, color: '#fff' },
      { id: 'hole', name: 'Black hole', kind: 'black-hole', parentId: 'sun', hasSurface: false, hasAtmosphere: false, color: '#555' },
      { id: 'distant-star', name: 'Distant star', kind: 'star', parentId: 'hole', hasSurface: false, hasAtmosphere: true, supportsAtmosphericBraking: false, color: '#fea' },
      { id: 'binary', name: 'Binary center', kind: 'barycenter', parentId: 'distant-star', hasSurface: false, hasAtmosphere: false, color: '#aaa' },
      { id: 'home', name: 'Home', kind: 'planet', parentId: 'sun', hasSurface: true, hasAtmosphere: false, color: '#8bf' },
      { id: 'other', name: 'Other', kind: 'planet', parentId: 'distant-star', hasSurface: true, hasAtmosphere: false, color: '#baf' },
      { id: 'binary-planet', name: 'Binary planet', kind: 'planet', parentId: 'binary', hasSurface: false, hasAtmosphere: true, color: '#fab' },
      { id: 'binary-moon', name: 'Binary moon', kind: 'moon', parentId: 'binary', hasSurface: true, hasAtmosphere: false, color: '#aaa' },
      { id: 'portal', name: 'Portal', kind: 'wormhole', parentId: 'home', hasSurface: false, hasAtmosphere: false, color: '#faf' },
    ],
    nodes: [
      { id: 'home:orbit', bodyId: 'home', kind: 'orbit', label: 'Home parking orbit' },
      { id: 'other:orbit', bodyId: 'other', kind: 'orbit', label: 'Other parking orbit' },
      { id: 'star:reference', bodyId: 'distant-star', kind: 'reference', label: 'Published stellar reference' },
      { id: 'binary:reference', bodyId: 'binary', kind: 'reference', label: 'Published circumbinary reference' },
    ],
    maneuvers: [],
    unpricedConnections: [
      { id: 'gateway', label: 'Whole gateway journey', from: 'home:orbit', to: 'other:orbit', forwardKind: 'wormhole', reverseKind: 'wormhole', sourceId: 'source', assumptions: ['Approach, traversal, and exit need a user budget.'] },
      { id: 'stellar', label: 'Published reference transfer', from: 'star:reference', to: 'binary:reference', forwardKind: 'transfer', reverseKind: 'transfer', sourceId: 'source', assumptions: ['No published fuel figure.'] },
    ],
    mapRegions: [
      { id: 'home', label: 'Home system', bodyIds: ['sun', 'home', 'portal'] },
      { id: 'distant', label: 'Distant system', bodyIds: ['hole', 'distant-star', 'binary', 'other', 'binary-planet', 'binary-moon', 'portal'] },
    ],
  }
}

const entry = (forward: number | null = null, reverse: number | null = null): ConnectionPlan => [{ connectionId: 'gateway', forward, reverse }]

describe('extended stellar hierarchy and connection validation', () => {
  it('accepts nested stars, black holes, circumbinary planets/moons, overlapping views, and unpriced descriptors', () => {
    expect(validatePlanetPack(fixture())).toEqual([])
  })

  it.each(['hole', 'distant-star', 'binary', 'portal'])('does not allow a landable or aerobrakeable technical body %s', id => {
    const pack = fixture()
    Object.assign(pack.bodies.find(body => body.id === id)!, { hasSurface: true, supportsAtmosphericBraking: true })
    const errors = validatePlanetPack(pack).join(' ')
    expect(errors).toContain('cannot have a landable surface')
    expect(errors).toContain('cannot support atmospheric braking')
  })

  it('rejects invalid stellar, portal, reference-state, and cyclic parents', () => {
    for (const [id, parentId] of [['distant-star', 'home'], ['portal', 'binary'], ['hole', 'distant-star']] as const) {
      const pack = fixture()
      pack.bodies.find(body => body.id === id)!.parentId = parentId
      expect(validatePlanetPack(pack).length).toBeGreaterThan(0)
    }
    const pack = fixture()
    pack.nodes.find(node => node.kind === 'reference')!.bodyId = 'home'
    expect(validatePlanetPack(pack).join(' ')).toContain('reference state must belong')
  })

  it('validates both directions and endpoint kinds of unpriced descriptors without adding them to graph edges', () => {
    const pack = fixture()
    const graph = buildGraph(pack)
    expect([...graph.adjacency.values()].flat()).toEqual([])
    pack.unpricedConnections![0]!.reverseKind = 'ascent'
    expect(validatePlanetPack(pack).join(' ')).toContain('unsupported ascent transition')
    pack.unpricedConnections![0]!.reverseKind = 'wormhole'
    pack.unpricedConnections![0]!.to = 'star:reference'
    expect(validatePlanetPack(pack).join(' ')).toContain('unsupported wormhole transition')
  })

  it('rejects duplicate/unknown descriptors and invalid region metadata', () => {
    const pack = fixture()
    pack.unpricedConnections!.push({ ...pack.unpricedConnections![0]!, sourceId: 'missing' })
    pack.mapRegions!.push({ id: 'home', label: '', bodyIds: ['missing', 'home', 'home'] })
    const errors = validatePlanetPack(pack).join(' ')
    expect(errors).toContain('Duplicate unpriced connection ID')
    expect(errors).toContain('unknown source missing')
    expect(errors).toContain('Duplicate map region ID')
    expect(errors).toContain('references unknown body missing')
    expect(errors).toContain('more than once')
  })
})

describe('explicit directional connection allowances', () => {
  it('leaves unknown costs unreachable, and does not convert missing or null values into zero-cost edges', () => {
    const pack = fixture()
    const graph = buildGraph(pack)
    for (const plan of [[], entry()]) {
      const result = applyConnectionAllowances(graph, pack, plan)
      expect(result.graph).toBe(graph)
      expect(result.edges).toEqual([])
      expect(findLowestCostPath(result.graph, 'home:orbit', 'other:orbit').status).toBe('unreachable')
    }
  })

  it('accepts explicit zero for one direction, without inventing the return', () => {
    const pack = fixture()
    const result = applyConnectionAllowances(buildGraph(pack), pack, entry(0))
    expect(result.edges).toHaveLength(1)
    expect(result.edges[0]).toMatchObject({ id: 'allowance:gateway:forward', kind: 'wormhole', deltaV: 0 })
    expect(findLowestCostPath(result.graph, 'home:orbit', 'other:orbit')).toMatchObject({ status: 'success', totalDeltaV: 0 })
    expect(findLowestCostPath(result.graph, 'other:orbit', 'home:orbit').status).toBe('unreachable')
  })

  it('uses distinct whole-journey allowances for one-way, round-trip, and return-only missions', () => {
    const pack = fixture()
    const result = applyConnectionAllowances(buildGraph(pack), pack, entry(1234.5, 3000))
    expect(findMissionRoute(result.graph, 'home:orbit', 'other:orbit', 'one-way')).toMatchObject({ status: 'success', totalDeltaV: 1234.5 })
    expect(findMissionRoute(result.graph, 'home:orbit', 'other:orbit', 'return-only')).toMatchObject({ status: 'success', totalDeltaV: 3000 })
    expect(findMissionRoute(result.graph, 'home:orbit', 'other:orbit', 'round-trip')).toMatchObject({ status: 'success', totalDeltaV: 4234.5 })
    expect(result.edges.every(edge => edge.assumptions.at(-1)?.includes('Explicit user-supplied'))).toBe(true)
  })

  it('supports a source-defined reference-to-reference allowance independently of the gateway', () => {
    const pack = fixture()
    const result = applyConnectionAllowances(buildGraph(pack), pack, [{ connectionId: 'stellar', forward: 10_000, reverse: null }])
    expect(findLowestCostPath(result.graph, 'star:reference', 'binary:reference')).toMatchObject({ status: 'success', totalDeltaV: 10_000 })
    expect(findLowestCostPath(result.graph, 'home:orbit', 'other:orbit').status).toBe('unreachable')
  })

  it.each([null, undefined, {}, [null], [[]], [{}], [{ connectionId: 'unknown', forward: 0, reverse: null }], [{ connectionId: 'gateway', forward: 0 }], [{ connectionId: 'gateway', forward: '1', reverse: null }], [{ connectionId: 'gateway', forward: -1, reverse: null }], [{ connectionId: 'gateway', forward: 1_000_001, reverse: null }], [{ connectionId: 'gateway', forward: NaN, reverse: null }], [{ connectionId: 'gateway', forward: Infinity, reverse: null }]])('rejects malformed allowances without coercion: %j', raw => {
    const pack = fixture()
    expect(() => applyConnectionAllowances(buildGraph(pack), pack, raw as ConnectionPlan)).toThrow()
  })

  it('rejects duplicate rows and repeated application instead of double counting', () => {
    const pack = fixture()
    const graph = buildGraph(pack)
    expect(() => applyConnectionAllowances(graph, pack, [...entry(1), ...entry(2)])).toThrow('once')
    const result = applyConnectionAllowances(graph, pack, entry(1))
    expect(() => applyConnectionAllowances(result.graph, pack, entry(1))).toThrow('already contains')
  })

  it('does not mutate frozen source graphs, source data, or user plans, including a partially invalid plan', () => {
    const pack = fixture()
    const graph = buildGraph(pack)
    const beforePack = structuredClone(pack)
    const beforeGraph = structuredClone(graph)
    const plan = Object.freeze([Object.freeze({ connectionId: 'gateway', forward: 1_000_000, reverse: 12 })])
    for (const edges of graph.adjacency.values()) Object.freeze(edges)
    for (const connection of pack.unpricedConnections!) { Object.freeze(connection.assumptions); Object.freeze(connection) }
    applyConnectionAllowances(graph, pack, plan)
    expect(() => applyConnectionAllowances(graph, pack, [...plan, { connectionId: 'stellar', forward: -1, reverse: null }])).toThrow()
    expect(pack).toEqual(beforePack)
    expect(graph).toEqual(beforeGraph)
    expect(plan[0]!.forward).toBe(1_000_000)
  })

  it('cannot replace a required planetary capture with an inaccessible allowance', () => {
    const pack = fixture()
    pack.bodies.push({ id: 'third', name: 'Third', kind: 'planet', parentId: 'distant-star', hasSurface: false, hasAtmosphere: false, color: '#ddd' })
    // Use three siblings so these are the ordinary guarded interplanetary edges.
    pack.bodies.find(body => body.id === 'home')!.parentId = 'distant-star'
    pack.nodes.push(...['home', 'other', 'third'].map(bodyId => ({ id: `${bodyId}:encounter`, bodyId, kind: 'encounter' as const, label: `${bodyId} encounter` })))
    pack.maneuvers.push(...[['home', 'other'], ['other', 'third']].map(([from, to], i) => ({ id: `transfer-${i}`, from: `${from}:encounter`, to: `${to}:encounter`, kind: 'transfer' as const, deltaV: 10, label: 'Interplanetary transfer', sourceId: 'source', assumptions: ['Capture required.'] })))
    const result = applyConnectionAllowances(buildGraph(pack), pack, entry(null, 0))
    expect(findLowestCostPath(result.graph, 'home:encounter', 'third:encounter').status).toBe('unreachable')
  })
})
