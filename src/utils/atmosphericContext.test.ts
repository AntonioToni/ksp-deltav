import { describe, expect, it } from 'vitest'
import { stockPack } from '../data/stock'
import { buildGraph } from './buildGraph'
import { findMissionRoute, type MissionMode } from './mission'
import { applyAtmosphericAssistance, getDefaultAtmosphericPlan, type AtmosphericAdjustment, type AtmosphericPlan } from './atmosphericAssistance'
import { describeManeuverBasis } from './estimateBasis'
import { atmosphericRouteContexts } from './atmosphericContext'

describe('mission arrival settings context', () => {
  const base = buildGraph(stockPack)
  const defaults = getDefaultAtmosphericPlan(stockPack, true)
  const run = (plan: AtmosphericPlan, start: string, end: string, mode: MissionMode = 'one-way') => {
    const result = applyAtmosphericAssistance(base, stockPack, plan)
    const route = findMissionRoute(result.graph, start, end, mode)
    if (route.status !== 'success') throw new Error(route.message)
    return { ...result, route }
  }

  it('does not offer landing controls for an ascent-only outbound route', () => {
    const { route, adjustments } = run(defaults, 'stock:kerbin:surface', 'stock:mun:surface')
    expect(adjustments.size).toBe(1)
    expect(atmosphericRouteContexts(stockPack, route.legs, defaults, adjustments)).toEqual([])
    expect(atmosphericRouteContexts(stockPack, [], defaults, adjustments)).toEqual([])
  })

  it('identifies the actual zero-budget return landing without charging capture twice', () => {
    const { route, adjustments } = run(defaults, 'stock:kerbin:surface', 'stock:mun:surface', 'round-trip')
    expect(route.totalDeltaV).toBe(6840)
    const contexts = atmosphericRouteContexts(stockPack, route.legs, defaults, adjustments)
    expect(contexts).toHaveLength(1)
    expect(contexts[0]).toMatchObject({ body: { id: 'stock:kerbin' }, landingCount: 1, landingDeltaV: 0, captureCount: 0 })
    expect(contexts[0]!.label).toBe('Kerbin landing: 0 m/s · Atmospheric braking + parachutes')
  })

  it.each([
    ['stock:kerbin:orbit', 'stock:kerbin:surface'],
    ['stock:duna:encounter', 'stock:duna:orbit'],
  ])('does not turn unchanged reference arrivals into contextual settings notices for %s → %s', (start, end) => {
    const { route, adjustments } = run([], start, end)
    expect(adjustments.size).toBe(0)
    expect(atmosphericRouteContexts(stockPack, route.legs, [], adjustments)).toEqual([])
  })

  it('does not show a notice for an enabled custom landing equal to the source cost', () => {
    const plan: AtmosphericPlan = [{ bodyId: 'stock:kerbin', capture: false, landing: true, landingDeltaV: 3400, landingMethod: 'custom' }]
    const { route, adjustments } = run(plan, 'stock:kerbin:orbit', 'stock:kerbin:surface')
    expect(route.totalDeltaV).toBe(3400)
    expect(adjustments.size).toBe(0)
    expect(atmosphericRouteContexts(stockPack, route.legs, plan, adjustments)).toEqual([])
    expect(describeManeuverBasis(route.legs[0]!.edge, stockPack, { atmosphericPlan: plan }).kind).toBe('user')
  })

  it('ignores enabled choices whose adjusted maneuvers are not flown', () => {
    const plan: AtmosphericPlan = [{ bodyId: 'stock:duna', capture: true, landing: true, landingDeltaV: 150, landingMethod: 'custom' }]
    const { route, adjustments } = run(plan, 'stock:kerbin:surface', 'stock:mun:surface')
    expect(adjustments.size).toBeGreaterThan(0)
    expect(atmosphericRouteContexts(stockPack, route.legs, plan, adjustments)).toEqual([])
  })

  it('shows only the changed landing when the same journey keeps a reference capture burn', () => {
    const { route, adjustments } = run(defaults, 'stock:kerbin:encounter', 'stock:kerbin:surface')
    expect(route.totalDeltaV).toBe(950)
    expect(atmosphericRouteContexts(stockPack, route.legs, defaults, adjustments)).toMatchObject([
      { landingCount: 1, landingDeltaV: 0, captureCount: 0, captureDeltaV: 0 },
    ])
  })

  it('does not advertise configurable capture for a bundled moon-return transfer', () => {
    const plan: AtmosphericPlan = [{ bodyId: 'stock:kerbin', capture: true, landing: false, landingDeltaV: 0 }]
    const { route, adjustments } = run(plan, 'stock:mun:orbit', 'stock:kerbin:orbit')
    expect(adjustments.size).toBeGreaterThan(0)
    expect(route.legs.find(({ edge }) => edge.id === 'stock:mun:encounter->stock:kerbin:orbit')?.edge.deltaV).toBe(860)
    expect(atmosphericRouteContexts(stockPack, route.legs, plan, adjustments)).toEqual([])
  })

  it('does not advertise configurable arrival burns for complete direct transfers', () => {
    const { route, adjustments } = run(defaults, 'stock:duna:orbit', 'stock:eve:orbit')
    expect(route.legs.some(({ edge }) => edge.directTransfer)).toBe(true)
    expect(atmosphericRouteContexts(stockPack, route.legs, defaults, adjustments)).toEqual([])
  })

  it('describes changed orbital capture without adding unchanged reference landing costs', () => {
    const plan: AtmosphericPlan = [{ bodyId: 'stock:duna', capture: true, landing: false, landingDeltaV: 0 }]
    const { route, adjustments } = run(plan, 'stock:duna:encounter', 'stock:duna:surface')
    const contexts = atmosphericRouteContexts(stockPack, route.legs, plan, adjustments)
    expect(contexts).toHaveLength(1)
    expect(contexts[0]).toMatchObject({ landingCount: 0, landingDeltaV: 0, captureCount: 2, captureDeltaV: 0 })
    expect(contexts[0]!.label).toBe('Duna orbital capture: 0 m/s · Atmospheric braking')
  })

  it('distinguishes a custom zero from the default atmospheric landing assumption', () => {
    const manual: AtmosphericPlan = [{ bodyId: 'stock:kerbin', capture: false, landing: true, landingDeltaV: 0, landingMethod: 'custom' }]
    const { route, adjustments } = run(manual, 'stock:kerbin:orbit', 'stock:kerbin:surface')
    expect(atmosphericRouteContexts(stockPack, route.legs, manual, adjustments)[0]!.label)
      .toBe('Kerbin landing: 0 m/s · Custom powered landing')
    const result = run(defaults, 'stock:kerbin:orbit', 'stock:kerbin:surface')
    expect(atmosphericRouteContexts(stockPack, result.route.legs, defaults, result.adjustments)[0]!.label)
      .toBe('Kerbin landing: 0 m/s · Atmospheric braking + parachutes')
  })

  it('counts repeated custom landing steps rather than displaying a single-step cost as the total', () => {
    const plan = [{ bodyId: 'stock:kerbin', capture: false, landing: true, landingDeltaV: 150, landingMethod: 'custom' as const }]
    const { route, adjustments } = run(plan, 'stock:kerbin:orbit', 'stock:kerbin:surface')
    const contexts = atmosphericRouteContexts(stockPack, [...route.legs, ...route.legs], plan, adjustments)
    expect(contexts[0]).toMatchObject({ landingCount: 2, landingDeltaV: 300 })
    expect(contexts[0]!.label).toBe('Kerbin landing ×2: 300 m/s · Custom powered landing')
  })

  it('ignores stale adjustments or mismatched effective costs and maneuver kinds', () => {
    const plan: AtmosphericPlan = [{ bodyId: 'stock:kerbin', capture: false, landing: true, landingDeltaV: 150, landingMethod: 'custom' }]
    const result = run(plan, 'stock:kerbin:orbit', 'stock:kerbin:surface')
    const id = 'stock:kerbin:orbit->stock:kerbin:surface'
    const staleRoute = run([], 'stock:kerbin:orbit', 'stock:kerbin:surface').route
    expect(atmosphericRouteContexts(stockPack, staleRoute.legs, plan, result.adjustments)).toEqual([])
    const invalid: AtmosphericAdjustment[] = [
      { kind: 'landing', originalDeltaV: 150, deltaV: 150 },
      { kind: 'landing', originalDeltaV: 999, deltaV: 150 },
      { kind: 'capture', originalDeltaV: 3400, deltaV: 150 },
    ]
    for (const adjustment of invalid) expect(atmosphericRouteContexts(stockPack, result.route.legs, plan, new Map([[id, adjustment]]))).toEqual([])
  })
})
