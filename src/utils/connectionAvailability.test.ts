import { describe, expect, it } from 'vitest'
import { stockKcalbelohPack, stockKcalbelohNoWormholesPack } from '../data/kcalbeloh'
import { buildGraph } from './buildGraph'
import { hasPotentialConnectionRoute } from './connectionAvailability'
import { findMissionRoute, type MissionMode } from './mission'
import { validatePlanetPack } from './validatePlanetPack'

const start = 'stock:kerbin:surface'
const target = 'kcalbeloh:sera:surface'
const modes: MissionMode[] = ['one-way', 'round-trip', 'return-only']

describe('availability of unpriced mission connections', () => {
  it.each(modes)('recognizes a missing wormhole allowance as repairable in %s', mode => {
    const graph = buildGraph(stockKcalbelohPack)
    const before = structuredClone([...graph.adjacency])
    expect(findMissionRoute(graph, start, target, mode).status).toBe('unreachable')
    expect(hasPotentialConnectionRoute(graph, stockKcalbelohPack, start, target, mode)).toBe(true)
    expect([...graph.adjacency]).toEqual(before)
    // The probe must not silently put its synthetic weights into a real route.
    expect(findMissionRoute(graph, start, target, mode).status).toBe('unreachable')
  })

  it.each(modes)('does not recommend allowances for a missing interstellar connection in %s', mode => {
    const pack = stockKcalbelohNoWormholesPack
    expect(pack.unpricedConnections!.length).toBeGreaterThan(0)
    expect(hasPotentialConnectionRoute(buildGraph(pack), pack, start, target, mode)).toBe(false)
  })

  it('checks every stop even when both endpoints are in the same system', () => {
    const pack = stockKcalbelohNoWormholesPack
    expect(hasPotentialConnectionRoute(buildGraph(pack), pack, start, 'stock:mun:surface', 'one-way', [target])).toBe(false)
  })

  it('still offers local reference-to-planet allowances with wormholes disabled', () => {
    const pack = stockKcalbelohNoWormholesPack
    const graph = buildGraph(pack)
    const from = 'kcalbeloh:kcalbeloh:reference'
    const to = 'kcalbeloh:rouqea:orbit'
    expect(findMissionRoute(graph, from, to, 'one-way').status).toBe('unreachable')
    expect(hasPotentialConnectionRoute(graph, pack, from, to, 'one-way')).toBe(true)
  })

  it('uses topology for imported packs rather than assuming every gap can repair a route', () => {
    const pack = { ...stockKcalbelohNoWormholesPack, id: 'custom:without-portals' }
    expect(hasPotentialConnectionRoute(buildGraph(pack), pack, start, target, 'one-way')).toBe(false)
  })

  it('accepts valid authored IDs that resemble allowance or private probe IDs without collisions', () => {
    const pack = {
      ...stockKcalbelohNoWormholesPack, id: 'custom:authored-edge-ids',
      maneuvers: stockKcalbelohNoWormholesPack.maneuvers.map((edge, index) => index < 2
        ? { ...edge, id: index === 0 ? 'allowance:kcalbeloh:connect-black-hole:forward' : 'connectivity-probe:0' }
        : edge),
    }
    expect(validatePlanetPack(pack)).toEqual([])
    const graph = buildGraph(pack)
    const before = structuredClone([...graph.adjacency])
    expect(hasPotentialConnectionRoute(graph, pack, start, target, 'one-way')).toBe(false)
    expect(hasPotentialConnectionRoute(graph, pack, 'kcalbeloh:kcalbeloh:reference', 'kcalbeloh:rouqea:orbit', 'one-way')).toBe(true)
    expect([...graph.adjacency]).toEqual(before)
  })
})
