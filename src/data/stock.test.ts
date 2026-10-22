import { describe, expect, it } from 'vitest'
import { buildGraph } from '../utils/buildGraph'
import { findLowestCostPath } from '../utils/findRoute'
import { validatePlanetPack } from '../utils/validatePlanetPack'
import { stockPack } from './stock'

describe('the reviewed stock reference pack', () => {
  it('covers all 17 stock bodies without a Kerbol or Jool landing state', () => {
    expect(stockPack.bodies).toHaveLength(17)
    expect(stockPack.bodies.filter((body) => body.kind === 'planet')).toHaveLength(7)
    expect(stockPack.bodies.filter((body) => body.kind === 'moon')).toHaveLength(9)
    expect(stockPack.nodes).toHaveLength(50)
    expect(stockPack.nodes.some((node) => node.bodyId === 'stock:kerbol')).toBe(false)
    expect(stockPack.nodes.some((node) => node.id === 'stock:jool:surface')).toBe(false)
    expect(stockPack.bodies.filter((body) => body.hasAtmosphere).map((body) => body.name))
      .toEqual(['Eve', 'Kerbin', 'Duna', 'Jool', 'Laythe'])
  })

  it('has valid references and directed, sourced maneuvers', () => {
    expect(validatePlanetPack(stockPack)).toEqual([])
    expect(stockPack.maneuvers).toHaveLength(98)
    for (const maneuver of stockPack.maneuvers) {
      expect(maneuver.assumptions.length).toBeGreaterThan(0)
      expect(stockPack.sources.some((source) => source.id === maneuver.sourceId)).toBe(true)
    }
  })

  it('uses the map high-orbit branches rather than incorrect low-orbit moon shortcuts', () => {
    for (const parent of ['eve', 'duna', 'jool']) {
      const moonIds = stockPack.bodies.filter((body) => body.parentId === `stock:${parent}`).map((body) => body.id)
      const transfers = stockPack.maneuvers.filter((edge) => (
        edge.kind === 'transfer' && edge.from.startsWith(`stock:${parent}:`) &&
        stockPack.nodes.some((node) => node.id === edge.to && moonIds.includes(node.bodyId))
      ))
      expect(transfers.length).toBeGreaterThan(0)
      expect(transfers.every((edge) => edge.from === `stock:${parent}:elliptical`)).toBe(true)
    }
  })

  it.each([
    ['mun', 5120],
    ['minmus', 4660],
    ['moho', 8380],
    ['eve', 13820],
    ['gilly', 5020],
    ['duna', 6540],
    ['ike', 5300],
    ['dres', 6690],
    ['laythe', 10210],
    ['vall', 7820],
    ['tylo', 9210],
    ['bop', 6830],
    ['pol', 6590],
    ['eeloo', 7480],
  ])('sums source map segments from Kerbin surface to %s surface as %i m/s', (body, expected) => {
    const route = findLowestCostPath(buildGraph(stockPack), 'stock:kerbin:surface', `stock:${body}:surface`)
    expect(route.status).toBe('success')
    if (route.status !== 'success') throw new Error(route.message)
    expect(route.totalDeltaV).toBe(expected)
    expect(route.legs.reduce((total, leg) => total + leg.edge.deltaV, 0)).toBe(expected)
    expect(route.legs.at(-1)?.cumulativeDeltaV).toBe(expected)
  })

  it('exposes the atmospheric descent budget placeholder rather than asserting a modeled landing', () => {
    const landing = stockPack.maneuvers.find((edge) => edge.from === 'stock:eve:orbit' && edge.to === 'stock:eve:surface')
    expect(landing?.kind).toBe('descent')
    expect(landing?.assumptions.join(' ')).toContain('placeholder')
    expect(stockPack.assumptions.join(' ')).toContain('Plane-change')
  })

  it('includes a Kerbin parking-orbit layover between two non-Kerbin planetary systems', () => {
    const route = findLowestCostPath(buildGraph(stockPack), 'stock:moho:surface', 'stock:eve:surface')
    expect(route.status).toBe('success')
    if (route.status !== 'success') throw new Error(route.message)
    expect(route.nodeIds).toEqual([
      'stock:moho:surface', 'stock:moho:orbit', 'stock:moho:encounter',
      'stock:kerbin:encounter', 'stock:kerbin:orbit', 'stock:kerbin:encounter',
      'stock:eve:encounter', 'stock:eve:elliptical', 'stock:eve:orbit', 'stock:eve:surface',
    ])
    expect(route.totalDeltaV).toBe(15400)
  })

  it('finds a finite route to every supported state from Kerbin surface', () => {
    const graph = buildGraph(stockPack)
    for (const node of stockPack.nodes) {
      const route = findLowestCostPath(graph, 'stock:kerbin:surface', node.id)
      expect(route.status, node.id).toBe('success')
      if (route.status === 'success') expect(Number.isFinite(route.totalDeltaV)).toBe(true)
    }
  })
})
