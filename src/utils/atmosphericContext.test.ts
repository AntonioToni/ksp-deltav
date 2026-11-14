import { describe, expect, it } from 'vitest'
import { stockPack } from '../data/stock'
import { buildGraph } from './buildGraph'
import { findMissionRoute } from './mission'
import { applyAtmosphericAssistance, getDefaultAtmosphericPlan } from './atmosphericAssistance'
import { atmosphericRouteContexts } from './atmosphericContext'

describe('mission arrival settings context', () => {
  const base = buildGraph(stockPack)
  const defaults = getDefaultAtmosphericPlan(stockPack, true)
  const assisted = applyAtmosphericAssistance(base, stockPack, defaults).graph

  it('does not offer landing controls for an ascent-only outbound route', () => {
    const route = findMissionRoute(assisted, 'stock:kerbin:surface', 'stock:mun:surface', 'one-way')
    if (route.status !== 'success') throw new Error(route.message)
    expect(atmosphericRouteContexts(stockPack, route.legs, defaults)).toEqual([])
  })

  it('identifies the actual zero-budget return landing without charging capture twice', () => {
    const route = findMissionRoute(assisted, 'stock:kerbin:surface', 'stock:mun:surface', 'round-trip')
    if (route.status !== 'success') throw new Error(route.message)
    expect(route.totalDeltaV).toBe(6840)
    const contexts = atmosphericRouteContexts(stockPack, route.legs, defaults)
    expect(contexts).toHaveLength(1)
    expect(contexts[0]).toMatchObject({ body: { id: 'stock:kerbin' }, landingCount: 1, landingDeltaV: 0, captureCount: 0 })
    expect(contexts[0]!.label).toContain('atmosphere + parachutes')
  })

  it('does not advertise configurable capture for a bundled moon-return transfer', () => {
    const route = findMissionRoute(assisted, 'stock:mun:orbit', 'stock:kerbin:orbit', 'one-way')
    if (route.status !== 'success') throw new Error(route.message)
    expect(atmosphericRouteContexts(stockPack, route.legs, defaults)).toEqual([])
  })

  it('does not advertise configurable arrival burns for complete direct transfers', () => {
    const route = findMissionRoute(assisted, 'stock:duna:orbit', 'stock:eve:orbit', 'one-way')
    if (route.status !== 'success') throw new Error(route.message)
    expect(route.legs.some(({ edge }) => edge.directTransfer)).toBe(true)
    expect(atmosphericRouteContexts(stockPack, route.legs, defaults)).toEqual([])
  })

  it('counts repeated custom landing steps rather than displaying a single-step cost as the total', () => {
    const plan = [{ bodyId: 'stock:kerbin', capture: false, landing: true, landingDeltaV: 150, landingMethod: 'custom' as const }]
    const graph = applyAtmosphericAssistance(base, stockPack, plan).graph
    const route = findMissionRoute(graph, 'stock:kerbin:orbit', 'stock:kerbin:surface', 'one-way')
    if (route.status !== 'success') throw new Error(route.message)
    const contexts = atmosphericRouteContexts(stockPack, [...route.legs, ...route.legs], plan)
    expect(contexts[0]).toMatchObject({ landingCount: 2, landingDeltaV: 300 })
    expect(contexts[0]!.label).toContain('custom budget')
  })
})
