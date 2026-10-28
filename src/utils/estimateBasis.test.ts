import { describe, expect, it } from 'vitest'
import { opmKcalbelohPack } from '../data/kcalbeloh'
import { opmPack } from '../data/opm'
import { rssPack } from '../data/rss'
import { stockPack } from '../data/stock'
import type { ManeuverEdge, PlanetPack, RouteLeg } from '../types/planner'
import { applyAtmosphericAssistance, type AtmosphericPlan } from './atmosphericAssistance'
import { buildGraph } from './buildGraph'
import { applyConnectionAllowances } from './connectionAllowances'
import { describeManeuverBasis, summarizeBudgetBasis } from './estimateBasis'

function edge(pack: PlanetPack, from: string, to: string): ManeuverEdge {
  const found = pack.maneuvers.find(edge => edge.from === from && edge.to === to)
  if (!found) throw new Error(`Missing fixture edge: ${from} → ${to}`)
  return found
}

const stockAscent = edge(stockPack, 'stock:kerbin:surface', 'stock:kerbin:orbit')
const dunaLanding = edge(stockPack, 'stock:duna:orbit', 'stock:duna:surface')
const dunaCapture = edge(stockPack, 'stock:duna:encounter', 'stock:duna:elliptical')
const haleAscent = edge(opmPack, 'opm:hale:surface', 'opm:hale:orbit')
const kcalAscent = edge(opmKcalbelohPack, 'kcalbeloh:suluco:surface', 'kcalbeloh:suluco:orbit')
const asLegs = (edges: ManeuverEdge[]): RouteLeg[] => {
  let cumulativeDeltaV = 0
  return edges.map(edge => ({ edge, cumulativeDeltaV: cumulativeDeltaV += edge.deltaV }))
}

describe('effective maneuver budget basis', () => {
  it('distinguishes published map figures from OPM analytic estimates', () => {
    expect(describeManeuverBasis(stockAscent, stockPack)).toMatchObject({ kind: 'reference', label: 'Reference map', source: { budgetType: 'reference' } })
    expect(describeManeuverBasis(kcalAscent, opmKcalbelohPack).kind).toBe('reference')
    expect(describeManeuverBasis(haleAscent, opmPack)).toMatchObject({ kind: 'model', label: 'Analytic model', source: { budgetType: 'model' } })
    const earthAscent = edge(rssPack, 'rss:earth:surface', 'rss:earth:orbit')
    expect(describeManeuverBasis(earthAscent, rssPack).kind).toBe('reference')
  })

  it('labels default atmospheric descent as a placeholder rather than a verified upper bound', () => {
    const basis = describeManeuverBasis(dunaLanding, stockPack)
    expect(basis).toMatchObject({ kind: 'placeholder', label: 'Landing placeholder' })
    expect(basis.description).toContain('not a verified landing calculation or upper bound')
    const vacuumLanding = edge(stockPack, 'stock:mun:orbit', 'stock:mun:surface')
    expect(describeManeuverBasis(vacuumLanding, stockPack).kind).toBe('reference')
  })

  it('prioritizes actual allowance identity over its official context source, including explicit zero', () => {
    const pack = opmKcalbelohPack
    const { edges } = applyConnectionAllowances(buildGraph(pack), pack, [{ connectionId: 'kcalbeloh:wormhole', forward: 0, reverse: 900 }])
    const ids = new Set(edges.map(edge => edge.id))
    for (const edge of edges) {
      expect(describeManeuverBasis(edge, pack, { allowanceEdgeIds: ids })).toMatchObject({ kind: 'user', label: 'Your allowance' })
      expect(describeManeuverBasis(edge, pack, { allowanceEdgeIds: ids, customPack: true }).kind).toBe('user')
    }
    const misleadingId = { ...kcalAscent, id: 'allowance:author-provided:forward' }
    expect(describeManeuverBasis(misleadingId, pack).kind).toBe('reference')
  })

  it('retains personal provenance when an explicit landing allowance equals the reference figure', () => {
    const plan: AtmosphericPlan = [{ bodyId: 'stock:duna', capture: false, landing: true, landingDeltaV: dunaLanding.deltaV }]
    const graph = buildGraph(stockPack)
    const result = applyAtmosphericAssistance(graph, stockPack, plan)
    expect(result.adjustments.size).toBe(0)
    expect(result.graph).toBe(graph)
    expect(describeManeuverBasis(dunaLanding, stockPack, { atmosphericPlan: plan })).toMatchObject({ kind: 'user', label: 'Your allowance' })
  })

  it('describes ideal standalone capture separately while retaining a bundled moon-return budget', () => {
    const plan: AtmosphericPlan = [{ bodyId: 'stock:duna', capture: true, landing: false, landingDeltaV: 0 }, { bodyId: 'stock:kerbin', capture: true, landing: false, landingDeltaV: 0 }]
    const adjusted = applyAtmosphericAssistance(buildGraph(stockPack), stockPack, plan)
    const capture = adjusted.graph.adjacency.get(dunaCapture.from)!.find(edge => edge.id === dunaCapture.id)!
    expect(capture.deltaV).toBe(0)
    expect(describeManeuverBasis(capture, stockPack, { atmosphericPlan: plan })).toMatchObject({ kind: 'ideal', label: 'Ideal capture' })
    const bundled = edge(stockPack, 'stock:mun:encounter', 'stock:kerbin:orbit')
    expect(bundled.deltaV).toBe(860)
    expect(describeManeuverBasis(bundled, stockPack, { atmosphericPlan: plan }).kind).toBe('reference')
  })

  it('does not turn imported author metadata into independent verification', () => {
    expect(describeManeuverBasis(stockAscent, stockPack, { customPack: true })).toMatchObject({ kind: 'imported', label: 'Imported budget' })
    expect(describeManeuverBasis(haleAscent, opmPack, { customPack: true }).kind).toBe('imported')
    expect(describeManeuverBasis(dunaLanding, stockPack, { customPack: true }).kind).toBe('imported')
    const missingMetadata = { ...stockPack, sources: stockPack.sources.map(({ id, title, url }) => ({ id, title, url })) }
    expect(describeManeuverBasis(stockAscent, missingMetadata)).toMatchObject({ kind: 'imported', label: 'Pack budget' })
  })

  it('summarizes actual flown costs, including repeated visits and zero-valued assumptions, without mutating data', () => {
    const pack = opmKcalbelohPack
    const { edges } = applyConnectionAllowances(buildGraph(pack), pack, [{ connectionId: 'kcalbeloh:wormhole', forward: 0, reverse: null }])
    const plan: AtmosphericPlan = [{ bodyId: 'stock:duna', capture: true, landing: false, landingDeltaV: 0 }]
    const capture = { ...dunaCapture, deltaV: 0 }
    const legs = asLegs([stockAscent, kcalAscent, haleAscent, edges[0]!, capture, stockAscent, dunaLanding])
    const before = structuredClone({ pack, legs, plan })
    const summaries = summarizeBudgetBasis(legs, pack, { allowanceEdgeIds: new Set(edges.map(edge => edge.id)), atmosphericPlan: plan })
    expect(summaries).toEqual([
      { kind: 'reference', label: 'Reference map', deltaV: stockAscent.deltaV * 2 + kcalAscent.deltaV, maneuvers: 3 },
      { kind: 'model', label: 'Analytic model', deltaV: haleAscent.deltaV, maneuvers: 1 },
      { kind: 'user', label: 'Your allowance', deltaV: 0, maneuvers: 1 },
      { kind: 'ideal', label: 'Ideal capture', deltaV: 0, maneuvers: 1 },
      { kind: 'placeholder', label: 'Landing placeholder', deltaV: dunaLanding.deltaV, maneuvers: 1 },
    ])
    expect(summaries.reduce((sum, row) => sum + row.deltaV, 0)).toBe(legs.at(-1)!.cumulativeDeltaV)
    expect({ pack, legs, plan }).toEqual(before)
    expect(summarizeBudgetBasis([], pack)).toEqual([])
  })
})
