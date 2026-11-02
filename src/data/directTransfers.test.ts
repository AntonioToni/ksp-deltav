import { describe, expect, it } from 'vitest'
import type { PlanetPack } from '../types/planner'
import { buildGraph } from '../utils/buildGraph'
import { findMissionRoute } from '../utils/mission'
import { applyAtmosphericAssistance } from '../utils/atmosphericAssistance'
import { validatePlanetPack } from '../utils/validatePlanetPack'
import { directTransferSource, withDirectTransfers } from './directTransfers'
import { stockPack } from './stock'
import { opmPack } from './opm'
import { opmCentralMu, opmReferences } from './opmReference'
import { stockCentralMu, stockPhysicalReferences, stockPhysicsSource } from './stockPhysics'
import { findRelayBodyPreset } from './commnet'

const withoutDirect = (pack: PlanetPack): PlanetPack => ({
  ...pack, maneuvers: pack.maneuvers.filter(edge => !edge.directTransfer),
})

const configurations = [
  { pack: stockPack, references: stockPhysicalReferences, directed: 30, planets: 6 },
  { pack: opmPack, references: [...stockPhysicalReferences, ...opmReferences], directed: 72, planets: 9 },
] as const

describe('complete coplanar direct-transfer estimates', () => {
  it.each(configurations)('adds only complete non-home planet parking pairs in $pack.id', ({ pack, directed, planets }) => {
    expect(validatePlanetPack(pack)).toEqual([])
    const edges = pack.maneuvers.filter(edge => edge.directTransfer)
    expect(edges).toHaveLength(directed)
    expect(new Set(edges.map(edge => edge.from)).size).toBe(planets)
    expect(new Set(pack.maneuvers.map(edge => edge.id)).size).toBe(pack.maneuvers.length)
    for (const edge of edges) {
      const from = pack.nodes.find(node => node.id === edge.from)!
      const to = pack.nodes.find(node => node.id === edge.to)!
      const fromBody = pack.bodies.find(body => body.id === from.bodyId)!
      const toBody = pack.bodies.find(body => body.id === to.bodyId)!
      expect(edge).toMatchObject({ kind: 'transfer', sourceId: directTransferSource.id })
      expect(from.kind).toBe('orbit')
      expect(to.kind).toBe('orbit')
      expect(fromBody.kind).toBe('planet')
      expect(toBody.kind).toBe('planet')
      expect(fromBody.parentId).toBe('stock:kerbol')
      expect(toBody.parentId).toBe('stock:kerbol')
      expect([fromBody.id, toBody.id]).not.toContain('stock:kerbin')
      expect(pack.sources.find(source => source.id === edge.sourceId)?.budgetType).toBe('model')
      expect(edge.assumptions.join(' ')).toContain('Atmospheric assistance does not discount this bundled pair')
    }
    expect(opmPack.maneuvers.filter(edge => edge.directTransfer).some(edge =>
      edge.from.startsWith('stock:eeloo:') || edge.to.startsWith('stock:eeloo:'))).toBe(false)
  })

  it.each(configurations)('matches independent vis-viva endpoint calculations for every $pack.id pair', ({ pack, references }) => {
    const byId = new Map(references.map(reference => [reference.bodyId, reference]))
    for (const edge of pack.maneuvers.filter(edge => edge.directTransfer)) {
      const from = pack.nodes.find(node => node.id === edge.from)!
      const to = pack.nodes.find(node => node.id === edge.to)!
      const departure = byId.get(from.bodyId)!
      const arrival = byId.get(to.bodyId)!
      const transferA = (departure.semiMajorAxisM + arrival.semiMajorAxisM) / 2
      const departureExcess = Math.abs(Math.sqrt(stockCentralMu * (2 / departure.semiMajorAxisM - 1 / transferA))
        - Math.sqrt(stockCentralMu / departure.semiMajorAxisM))
      const arrivalExcess = Math.abs(Math.sqrt(stockCentralMu * (2 / arrival.semiMajorAxisM - 1 / transferA))
        - Math.sqrt(stockCentralMu / arrival.semiMajorAxisM))
      const departureRadius = departure.radiusM + from.altitudeKm! * 1000
      const arrivalRadius = arrival.radiusM + to.altitudeKm! * 1000
      const departureBurn = Math.sqrt(departureExcess ** 2 + 2 * departure.gravitationalParameter / departureRadius)
        - Math.sqrt(departure.gravitationalParameter / departureRadius)
      const arrivalBurn = Math.sqrt(arrivalExcess ** 2 + 2 * arrival.gravitationalParameter / arrivalRadius)
        - Math.sqrt(arrival.gravitationalParameter / arrivalRadius)
      expect(edge.deltaV, edge.id).toBe(Math.ceil(departureBurn) + Math.ceil(arrivalBurn))
      const reversed = pack.maneuvers.find(candidate => candidate.from === edge.to && candidate.to === edge.from && candidate.directTransfer)!
      expect(reversed.deltaV).toBe(edge.deltaV)
      expect(reversed.assumptions).not.toBe(edge.assumptions)
    }
    expect(stockCentralMu).toBe(opmCentralMu)
  })

  it.each([
    { pack: stockPack, from: 'stock:duna:orbit', to: 'stock:dres:orbit', deltaV: 1532 },
    { pack: stockPack, from: 'stock:eve:orbit', to: 'stock:duna:orbit', deltaV: 2728 },
    { pack: opmPack, from: 'opm:sarnus:orbit', to: 'opm:urlum:orbit', deltaV: 2494 },
  ])('reproduces $from → $to as $deltaV m/s', ({ pack, from, to, deltaV }) => {
    const route = findMissionRoute(buildGraph(pack), from, to, 'one-way')
    expect(route).toMatchObject({ status: 'success', totalDeltaV: deltaV })
    if (route.status !== 'success') throw new Error(route.message)
    expect(route.nodeIds).toEqual([from, to])
    expect(route.legs).toHaveLength(1)
    expect(route.legs[0]!.edge.directTransfer).toBe(true)
  })

  it.each(configurations)('preserves every default homeworld budget in $pack.id', ({ pack }) => {
    const graph = buildGraph(pack)
    const baseline = buildGraph(withoutDirect(pack))
    for (const home of ['stock:kerbin:surface', 'stock:kerbin:orbit']) {
      for (const target of pack.nodes) {
        for (const mode of ['one-way', 'return-only', 'round-trip'] as const) {
          const before = findMissionRoute(baseline, home, target.id, mode)
          const after = findMissionRoute(graph, home, target.id, mode)
          expect(after.status, `${home} → ${target.id} · ${mode}`).toBe(before.status)
          if (after.status === 'success' && before.status === 'success') expect(after.totalDeltaV).toBe(before.totalDeltaV)
        }
      }
    }
  })

  it('may optimize a homeworld journey through a user-selected ideal atmospheric arrival', () => {
    const plan = [{ bodyId: 'stock:duna', capture: true, landing: false, landingDeltaV: 0 }]
    const baseline = withoutDirect(stockPack)
    const oldGraph = applyAtmosphericAssistance(buildGraph(baseline), baseline, plan).graph
    const assisted = applyAtmosphericAssistance(buildGraph(stockPack), stockPack, plan).graph
    const from = 'stock:kerbin:surface'
    const to = 'stock:dres:surface'
    expect(findMissionRoute(oldGraph, from, to, 'one-way')).toMatchObject({ status: 'success', totalDeltaV: 6690 })
    const result = findMissionRoute(assisted, from, to, 'one-way')
    expect(result).toMatchObject({ status: 'success', totalDeltaV: 6442 })
    if (result.status !== 'success') throw new Error(result.message)
    expect(result.nodeIds).toContain('stock:duna:orbit')
    expect(result.legs.find(leg => leg.edge.directTransfer)?.edge.deltaV).toBe(1532)
  })

  it('clones the source pack and deduplicates inherited direct pairs on repeated augmentation', () => {
    const source = withoutDirect(stockPack)
    const before = structuredClone(source)
    const result = withDirectTransfers(source, stockPhysicalReferences, stockCentralMu, [stockPhysicsSource])
    expect(source).toEqual(before)
    expect(result.maneuvers).toHaveLength(128)
    for (const edge of source.maneuvers) {
      const retained = result.maneuvers.find(candidate => candidate.id === edge.id)!
      expect(retained).toEqual(edge)
      expect(retained).not.toBe(edge)
      expect(retained.assumptions).not.toBe(edge.assumptions)
    }
    const repeated = withDirectTransfers(result, stockPhysicalReferences, stockCentralMu, [stockPhysicsSource])
    expect(repeated).toEqual(result)
    expect(repeated).not.toBe(result)
  })

  it('retains the shared relay physical data and source context after moving the Stock fact table', () => {
    expect(stockPhysicalReferences).toHaveLength(16)
    for (const reference of stockPhysicalReferences) {
      const body = stockPack.bodies.find(body => body.id === reference.bodyId)!
      expect(findRelayBodyPreset(body)).toMatchObject({
        bodyId: reference.bodyId, parentBodyId: reference.parentBodyId,
        radiusM: reference.radiusM, gravitationalParameter: reference.gravitationalParameter,
        atmosphereHeightM: reference.atmosphereHeightM,
      })
    }
  })

  it('does not invent safe parking references for missing altitudes or atmospheric boundary states', () => {
    const source = withoutDirect(stockPack)
    const uncertain = {
      ...source,
      nodes: source.nodes.map(node => node.id === 'stock:eve:orbit' ? { ...node, altitudeKm: 90 }
        : node.id === 'stock:duna:orbit' ? { ...node, altitudeKm: undefined } : node),
    }
    const result = withDirectTransfers(uncertain, stockPhysicalReferences, stockCentralMu)
    const pairs = result.maneuvers.filter(edge => edge.directTransfer)
    expect(pairs).toHaveLength(12)
    expect(pairs.some(edge => [edge.from, edge.to].some(id => id === 'stock:eve:orbit' || id === 'stock:duna:orbit'))).toBe(false)
    expect(uncertain.nodes.find(node => node.id === 'stock:duna:orbit')?.altitudeKm).toBeUndefined()
  })
})
