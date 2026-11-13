import { describe, expect, it } from 'vitest'
import type { PlanetPack } from '../types/planner'
import { buildGraph } from '../utils/buildGraph'
import { applyConnectionAllowances } from '../utils/connectionAllowances'
import { findMissionRoute } from '../utils/mission'
import { validatePlanetPack } from '../utils/validatePlanetPack'
import {
  stockKcalbelohPack, opmKcalbelohPack,
  stockKcalbelohNoWormholesPack, opmKcalbelohNoWormholesPack,
} from './kcalbeloh'
import { kcalbelohBodies, kcalbelohRegions } from './kcalbelohReference'
import { findRelayBodyPreset } from './commnet'

const configurations = [
  { enabled: stockKcalbelohPack, disabled: stockKcalbelohNoWormholesPack, bodies: 48, states: 97, maneuvers: 292 },
  { enabled: opmKcalbelohPack, disabled: opmKcalbelohNoWormholesPack, bodies: 63, states: 143, maneuvers: 568 },
] as const
const wormholeIds = ['kcalbeloh:wh3141a', 'kcalbeloh:wh3141b']

function allLocalAllowances(pack: PlanetPack) {
  return applyConnectionAllowances(buildGraph(pack), pack, pack.unpricedConnections!.map(connection => ({
    connectionId: connection.id, forward: 0, reverse: 0,
  }))).graph
}

describe('Kcalbeloh installations with wormholes disabled', () => {
  it.each(configurations)('omits only the portals and their crossing descriptor from $disabled.id', ({ enabled, disabled, bodies, states, maneuvers }) => {
    expect(validatePlanetPack(disabled)).toEqual([])
    expect(disabled.id).toBe(`${enabled.id}-no-wormholes`)
    expect(disabled.name).toBe(`${enabled.name} (wormholes off)`)
    expect(disabled.dataNotice).toBe('Wormholes off')
    expect(disabled.shortName!.length).toBeLessThanOrEqual(12)
    expect(disabled.bodies).toHaveLength(bodies)
    expect(disabled.nodes).toHaveLength(states)
    expect(disabled.maneuvers).toHaveLength(maneuvers)
    expect(disabled.unpricedConnections).toHaveLength(9)
    expect(disabled.bodies).toEqual(enabled.bodies.filter(body => !wormholeIds.includes(body.id)))
    expect(disabled.nodes).toEqual(enabled.nodes)
    expect(disabled.maneuvers).toEqual(enabled.maneuvers)
    expect(disabled.unpricedConnections).toEqual(enabled.unpricedConnections!.filter(connection => connection.id !== 'kcalbeloh:wormhole'))
    expect(disabled.bodies.some(body => body.kind === 'wormhole')).toBe(false)
    expect(disabled.assumptions.join(' ')).toContain('Wormholes disabled')
    expect(disabled.assumptions.join(' ')).toContain('No direct star-to-star transfer is supplied')
    expect(disabled.assumptions.join(' ')).not.toContain('WH-3141-A orbits')
    expect(disabled.sources).toEqual(enabled.sources)
  })

  it.each(configurations)('keeps valid regions and independent records for $disabled.id', ({ enabled, disabled }) => {
    const bodyIds = new Set(disabled.bodies.map(body => body.id))
    expect(disabled.mapRegions!.map(region => region.id)).toEqual(enabled.mapRegions!.map(region => region.id))
    for (const region of disabled.mapRegions!) {
      expect(region.bodyIds.every(id => bodyIds.has(id))).toBe(true)
      expect(region.bodyIds.some(id => wormholeIds.includes(id))).toBe(false)
      expect(region.bodyIds).not.toBe(enabled.mapRegions!.find(candidate => candidate.id === region.id)!.bodyIds)
    }
    for (const node of disabled.nodes) {
      expect(disabled.mapRegions!.filter(region => region.bodyIds.includes(node.bodyId))).toHaveLength(1)
      expect(node).not.toBe(enabled.nodes.find(candidate => candidate.id === node.id))
    }
    for (const edge of disabled.maneuvers) {
      const original = enabled.maneuvers.find(candidate => candidate.id === edge.id)!
      expect(edge).not.toBe(original)
      expect(edge.assumptions).not.toBe(original.assumptions)
    }
    expect(enabled.bodies.filter(body => body.kind === 'wormhole')).toHaveLength(2)
    expect(enabled.unpricedConnections).toHaveLength(10)
    expect(kcalbelohBodies.filter(body => body.kind === 'wormhole')).toHaveLength(2)
    expect(kcalbelohRegions.find(region => region.id === 'sunorc')!.bodyIds).toContain('kcalbeloh:wh3141b')
  })

  it.each(configurations)('preserves local mission budgets and ordered stops in $disabled.id', ({ disabled }) => {
    const graph = buildGraph(disabled)
    const oneWay = findMissionRoute(graph, 'kcalbeloh:suluco:surface', 'kcalbeloh:tot:surface', 'one-way', ['kcalbeloh:suluco:orbit'])
    expect(oneWay).toMatchObject({ status: 'success', totalDeltaV: 3931 })
    const roundTrip = findMissionRoute(graph, 'kcalbeloh:suluco:surface', 'kcalbeloh:tot:surface', 'round-trip', ['kcalbeloh:suluco:orbit'])
    expect(roundTrip).toMatchObject({ status: 'success', totalDeltaV: 7862 })
    const home = findMissionRoute(graph, 'stock:kerbin:surface', 'stock:mun:surface', 'one-way')
    expect(home).toMatchObject({ status: 'success', totalDeltaV: 5120 })
  })

  it.each(configurations)('retains all 25 physical Kcalbeloh relay presets in $disabled.id', ({ enabled, disabled }) => {
    const targets = disabled.bodies.filter(body => body.id.startsWith('kcalbeloh:')
      && (body.kind === 'planet' || body.kind === 'moon'))
    expect(targets).toHaveLength(25)
    for (const body of targets) {
      const preset = findRelayBodyPreset(body)
      expect(preset, body.id).toBeDefined()
      expect(preset).toEqual(findRelayBodyPreset(enabled.bodies.find(candidate => candidate.id === body.id)!))
    }
  })

  it.each(configurations)('cannot turn local allowances into an interstellar connection in $disabled.id', ({ disabled }) => {
    const graph = allLocalAllowances(disabled)
    for (const mode of ['one-way', 'round-trip', 'return-only'] as const) {
      expect(findMissionRoute(graph, 'stock:kerbin:surface', 'kcalbeloh:sera:surface', mode).status).toBe('unreachable')
      expect(findMissionRoute(graph, 'kcalbeloh:sera:surface', 'stock:kerbin:surface', mode).status).toBe('unreachable')
      expect(findMissionRoute(graph, 'stock:kerbin:surface', 'stock:mun:surface', mode, ['kcalbeloh:sera:surface']).status).toBe('unreachable')
    }
    expect(findMissionRoute(graph, 'kcalbeloh:kcalbeloh:reference', 'kcalbeloh:suluco:orbit', 'one-way').status).toBe('success')
    expect([...graph.adjacency.values()].flat().some(edge => edge.kind === 'wormhole')).toBe(false)
  })
})
