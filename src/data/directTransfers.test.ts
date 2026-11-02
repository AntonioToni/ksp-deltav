import { describe, expect, it } from 'vitest'
import type { PlanetPack, RouteNode } from '../types/planner'
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
  { pack: stockPack, references: stockPhysicalReferences, directed: 66, planets: 6, states: 9 },
  { pack: opmPack, references: [...stockPhysicalReferences, ...opmReferences], directed: 226, planets: 9, states: 16 },
] as const

function referenceRadius(pack: PlanetPack, node: RouteNode) {
  const parking = pack.nodes.find(candidate => candidate.bodyId === node.bodyId && candidate.kind === 'orbit')!
  const physics = [...stockPhysicalReferences, ...opmReferences].findLast(reference => reference.bodyId === node.bodyId)!
  return { physics, radius: physics.radiusM + parking.altitudeKm! * 1000 }
}

// Independent vis-viva calculation. Stock high energy is calibrated by the
// published increment; OPM high geometry uses its explicitly chosen half-SOI.
function referenceSpeed(pack: PlanetPack, node: RouteNode) {
  const { physics, radius } = referenceRadius(pack, node)
  const circular = Math.sqrt(physics.gravitationalParameter / radius)
  if (node.kind === 'orbit') return circular
  if (node.bodyId.startsWith('opm:')) {
    const apoapsis = opmReferences.find(reference => reference.bodyId === node.bodyId)!.sphereOfInfluenceM / 2
    return Math.sqrt(physics.gravitationalParameter * (2 / radius - 2 / (radius + apoapsis)))
  }
  return circular + pack.maneuvers.find(edge => edge.from === `${node.bodyId}:orbit` && edge.to === node.id && edge.kind === 'escape')!.deltaV
}

describe('complete coplanar direct-transfer estimates', () => {
  it.each(configurations)('adds complete non-home planet bound-reference pairs in $pack.id', ({ pack, directed, planets, states }) => {
    expect(validatePlanetPack(pack)).toEqual([])
    const edges = pack.maneuvers.filter(edge => edge.directTransfer)
    expect(edges).toHaveLength(directed)
    expect(new Set(edges.map(edge => edge.from)).size).toBe(states)
    expect(new Set(edges.map(edge => pack.nodes.find(node => node.id === edge.from)!.bodyId)).size).toBe(planets)
    expect(new Set(pack.maneuvers.map(edge => edge.id)).size).toBe(pack.maneuvers.length)
    for (const edge of edges) {
      const from = pack.nodes.find(node => node.id === edge.from)!
      const to = pack.nodes.find(node => node.id === edge.to)!
      const fromBody = pack.bodies.find(body => body.id === from.bodyId)!
      const toBody = pack.bodies.find(body => body.id === to.bodyId)!
      expect(edge).toMatchObject({ kind: 'transfer', sourceId: directTransferSource.id })
      expect(['orbit', 'elliptical']).toContain(from.kind)
      expect(['orbit', 'elliptical']).toContain(to.kind)
      expect(from.bodyId).not.toBe(to.bodyId)
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
      const departureRadius = referenceRadius(pack, from).radius
      const arrivalRadius = referenceRadius(pack, to).radius
      const departureBurn = Math.sqrt(departureExcess ** 2 + 2 * departure.gravitationalParameter / departureRadius)
        - referenceSpeed(pack, from)
      const arrivalBurn = Math.sqrt(arrivalExcess ** 2 + 2 * arrival.gravitationalParameter / arrivalRadius)
        - referenceSpeed(pack, to)
      expect(departureBurn).toBeGreaterThan(0)
      expect(arrivalBurn).toBeGreaterThan(0)
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

  it.each(configurations)('connects a planetary low orbit to a moon through its parent high state in $pack.id', ({ pack }) => {
    const graph = buildGraph(pack)
    const start = 'stock:duna:orbit'
    const goal = 'stock:gilly:orbit'
    // Independent endpoint figures: 1,059 Duna departure + 369 Eve high
    // capture, then the published 60 transfer + 410 Gilly capture.
    const outward = [start, 'stock:eve:elliptical', 'stock:gilly:encounter', goal]
    for (const mode of ['one-way', 'return-only', 'round-trip'] as const) {
      const result = findMissionRoute(graph, start, goal, mode, ['stock:eve:elliptical'])
      expect(result).toMatchObject({ status: 'success', totalDeltaV: mode === 'round-trip' ? 3796 : 1898 })
      if (result.status !== 'success') throw new Error(result.message)
      expect(result.nodeIds).toEqual(mode === 'one-way' ? outward
        : mode === 'return-only' ? [...outward].reverse() : [...outward, ...outward.slice(0, -1).reverse()])
      expect(result.nodeIds).not.toContain('stock:eve:orbit')
      expect(result.nodeIds).not.toContain('stock:kerbin:orbit')
      expect(result.legs.filter(({ edge }) => edge.directTransfer).map(({ edge }) => edge.deltaV))
        .toEqual(mode === 'round-trip' ? [1428, 1428] : [1428])
      expect(result.legs.reduce((sum, { edge }) => sum + edge.deltaV, 0)).toBe(result.totalDeltaV)
    }
    // An explicit low-orbit stop is respected even though it costs more.
    expect(findMissionRoute(graph, start, goal, 'one-way', ['stock:eve:orbit']))
      .toMatchObject({ status: 'success', totalDeltaV: 4498 })
  })

  it.each(configurations)('uses paid high-to-high transfers for interplanetary moon missions in $pack.id', ({ pack }) => {
    const graph = buildGraph(pack)
    const start = 'stock:ike:orbit'
    const goal = 'stock:gilly:orbit'
    // 150+30 local departure; (1,059−360)+(1,669−1,300)
    // high-to-high transfer; 60+410 local arrival.
    for (const mode of ['one-way', 'return-only', 'round-trip'] as const) {
      const result = findMissionRoute(graph, start, goal, mode, ['stock:duna:elliptical', 'stock:eve:elliptical'])
      expect(result).toMatchObject({ status: 'success', totalDeltaV: mode === 'round-trip' ? 3436 : 1718 })
      if (result.status !== 'success') throw new Error(result.message)
      const transfers = result.legs.filter(({ edge }) => edge.directTransfer)
      expect(transfers).toHaveLength(mode === 'round-trip' ? 2 : 1)
      for (const { edge } of transfers) {
        expect(edge.deltaV).toBe(1068)
        expect(edge.label).toContain('elliptical orbit')
        expect(edge.assumptions.join(' ')).toContain('Map-calibrated high-orbit energy')
      }
      expect(result.nodeIds).not.toContain('stock:kerbin:orbit')
      expect(result.legs.every(({ edge }) => edge.deltaV > 0)).toBe(true)
    }
    expect(findMissionRoute(graph, 'stock:ike:surface', 'stock:gilly:surface', 'one-way'))
      .toMatchObject({ status: 'success', totalDeltaV: 2138 })
  })

  it('retains explicit high-orbit source provenance and rounds each OPM endpoint before summing', () => {
    const high = opmPack.maneuvers.filter(edge => edge.directTransfer &&
      [edge.from, edge.to].some(id => id.startsWith('opm:') && id.endsWith(':elliptical')))
    expect(high.length).toBeGreaterThan(0)
    let distinguishesPrematureRounding = false
    for (const edge of high) {
      expect(edge.assumptions.join(' ')).toContain('Explicit reference apoapsis radius')
      expect(edge.assumptions.join(' ')).toContain('calculated before rounding')
      const lowFrom = edge.from.replace(':elliptical', ':orbit')
      const lowTo = edge.to.replace(':elliptical', ':orbit')
      const low = opmPack.maneuvers.find(candidate => candidate.directTransfer && candidate.from === lowFrom && candidate.to === lowTo)!
      const roundedIncrements = [edge.from, edge.to].reduce((sum, id) => id.endsWith(':elliptical')
        ? sum + opmPack.maneuvers.find(candidate => candidate.from === id.replace(':elliptical', ':orbit') && candidate.to === id)!.deltaV : sum, 0)
      if (edge.deltaV !== low.deltaV - roundedIncrements) distinguishesPrematureRounding = true
    }
    expect(distinguishesPrematureRounding, 'Subtracting already-rounded local increments can understate a complete burn').toBe(true)
  })

  it.each(configurations)('retains every homeworld route while allowing cheaper paid high-orbit transfers in $pack.id', ({ pack }) => {
    const graph = buildGraph(pack)
    const baseline = buildGraph(withoutDirect(pack))
    let improved = 0
    for (const home of ['stock:kerbin:surface', 'stock:kerbin:orbit']) {
      for (const target of pack.nodes) {
        for (const mode of ['one-way', 'return-only', 'round-trip'] as const) {
          const before = findMissionRoute(baseline, home, target.id, mode)
          const after = findMissionRoute(graph, home, target.id, mode)
          expect(after.status, `${home} → ${target.id} · ${mode}`).toBe(before.status)
          if (after.status === 'success' && before.status === 'success') {
            expect(after.totalDeltaV).toBeLessThanOrEqual(before.totalDeltaV)
            if (after.totalDeltaV < before.totalDeltaV) improved++
          }
        }
      }
    }
    expect(improved).toBeGreaterThan(0)
  })

  it('prices an audited return through a paid Eve high-orbit arrival instead of forcing the original homeworld branch', () => {
    const home = 'stock:kerbin:surface'
    const target = 'stock:moho:orbit'
    expect(findMissionRoute(buildGraph(withoutDirect(stockPack)), home, target, 'return-only'))
      .toMatchObject({ status: 'success', totalDeltaV: 7510 })
    const result = findMissionRoute(buildGraph(stockPack), home, target, 'return-only')
    // Complete Moho-to-Eve-high model1,968 + reference80+90+950+3,400.
    expect(result).toMatchObject({ status: 'success', totalDeltaV: 6488 })
    if (result.status !== 'success') throw new Error(result.message)
    expect(result.nodeIds).toEqual([
      target, 'stock:eve:elliptical', 'stock:eve:encounter',
      'stock:kerbin:encounter', 'stock:kerbin:orbit', home,
    ])
    expect(result.legs.map(({ edge }) => edge.deltaV)).toEqual([1968, 80, 90, 950, 3400])
  })

  it('can improve an outbound budget only after paying its legacy arrival parking reset', () => {
    const result = findMissionRoute(buildGraph(stockPack), 'stock:kerbin:surface', 'stock:eeloo:surface', 'one-way')
    // Paid Kerbin→Duna low5,090, then complete1,414+297 pairs and620 descent.
    expect(result).toMatchObject({ status: 'success', totalDeltaV: 7421 })
    if (result.status !== 'success') throw new Error(result.message)
    expect(result.nodeIds).toEqual([
      'stock:kerbin:surface', 'stock:kerbin:orbit', 'stock:kerbin:encounter',
      'stock:duna:encounter', 'stock:duna:elliptical', 'stock:duna:orbit',
      'stock:jool:elliptical', 'stock:eeloo:orbit', 'stock:eeloo:surface',
    ])
    expect(result.legs.filter(({ edge }) => edge.directTransfer).map(({ edge }) => edge.deltaV)).toEqual([1414, 297])
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
    expect(result.maneuvers).toHaveLength(164)
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
    expect(pairs).toHaveLength(18)
    expect(pairs.some(edge => [edge.from, edge.to].some(id => id.startsWith('stock:eve:') || id.startsWith('stock:duna:')))).toBe(false)
    expect(uncertain.nodes.find(node => node.id === 'stock:duna:orbit')?.altitudeKm).toBeUndefined()
  })

  it.each([0, 1320, 2000])('omits a Stock high state whose %s m/s increment cannot define a safe bound ellipse', increment => {
    const source = withoutDirect(stockPack)
    const uncertain = {
      ...source,
      maneuvers: source.maneuvers.map(edge =>
        [edge.from, edge.to].every(id => id.startsWith('stock:eve:')) &&
        [edge.from, edge.to].some(id => id.endsWith(':orbit')) &&
        [edge.from, edge.to].some(id => id.endsWith(':elliptical'))
          ? { ...edge, deltaV: increment } : edge),
    }
    const result = withDirectTransfers(uncertain, stockPhysicalReferences, stockCentralMu)
    const direct = result.maneuvers.filter(edge => edge.directTransfer)
    expect(direct).toHaveLength(52)
    expect(direct.some(edge => [edge.from, edge.to].includes('stock:eve:elliptical'))).toBe(false)
    expect(direct.some(edge => [edge.from, edge.to].includes('stock:eve:orbit'))).toBe(true)
  })

  it('omits mismatched Stock high-state increments without changing the supplied local budgets', () => {
    const source = withoutDirect(stockPack)
    const uncertain = {
      ...source,
      maneuvers: source.maneuvers.map(edge => edge.from === 'stock:eve:elliptical' && edge.to === 'stock:eve:orbit'
        ? { ...edge, deltaV: 1299 } : edge),
    }
    const result = withDirectTransfers(uncertain, stockPhysicalReferences, stockCentralMu)
    expect(result.maneuvers.some(edge => edge.directTransfer && [edge.from, edge.to].includes('stock:eve:elliptical'))).toBe(false)
    expect(result.maneuvers.find(edge => edge.from === 'stock:eve:elliptical' && edge.to === 'stock:eve:orbit')?.deltaV).toBe(1299)
  })

  it('validates explicit OPM high apoapses and deduplicates repeated augmentation', () => {
    const source = withoutDirect(opmPack)
    const references = [...stockPhysicalReferences, ...opmReferences.map(reference => ({
      ...reference, ellipticalApoapsisRadiusM: reference.sphereOfInfluenceM / 2,
    }))]
    const result = withDirectTransfers(source, references, opmCentralMu)
    expect(result.maneuvers.filter(edge => edge.directTransfer)).toHaveLength(226)
    expect(withDirectTransfers(result, references, opmCentralMu)).toEqual(result)
    const invalid = references.map(reference => reference.bodyId === 'opm:sarnus'
      ? { ...reference, ellipticalApoapsisRadiusM: opmReferences.find(row => row.bodyId === reference.bodyId)!.sphereOfInfluenceM } : reference)
    const partial = withDirectTransfers(source, invalid, opmCentralMu)
    expect(partial.maneuvers.filter(edge => edge.directTransfer)).toHaveLength(198)
    expect(partial.maneuvers.some(edge => edge.directTransfer && [edge.from, edge.to].includes('opm:sarnus:elliptical'))).toBe(false)
  })
})
