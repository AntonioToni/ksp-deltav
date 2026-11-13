import { describe, expect, it } from 'vitest'
import type { RouteNode } from '../types/planner'
import { applyAtmosphericAssistance } from '../utils/atmosphericAssistance'
import { buildGraph } from '../utils/buildGraph'
import { findLowestCostPath } from '../utils/findRoute'
import { findMissionRoute } from '../utils/mission'
import { validatePlanetPack } from '../utils/validatePlanetPack'
import { directTransferSource, withDirectTransfers } from './directTransfers'
import { rssPack, rssReferencePack } from './rss'
import { rssOuterOrbitReferences } from './rssOuterReferences'
import { rssInnerOrbitReferences, rssInnerSource } from './rssInnerReferences'
import { rssCentralMu, rssPhysicalReferences, rssPhysicsSource } from './rssPhysics'

const directEdges = rssPack.maneuvers.filter(edge => edge.sourceId === directTransferSource.id)
const nodeById = new Map(rssPack.nodes.map(node => [node.id, node]))
const physicsById = new Map(rssPhysicalReferences.map(reference => [reference.bodyId, reference]))
const highIncrements: Readonly<Record<string, number>> = { 'rss:vesta': 100, 'rss:jupiter': 17210 }
const explicitHighPlanets = new Set(['rss:mercury', 'rss:venus', 'rss:mars', 'rss:ceres', 'rss:saturn', 'rss:uranus', 'rss:neptune', 'rss:pluto'])
const transferReferences = rssPhysicalReferences.map(reference =>
  [...rssOuterOrbitReferences, ...rssInnerOrbitReferences].find(candidate => candidate.bodyId === reference.bodyId) ?? reference,
)

function endpoint(node: RouteNode) {
  const physics = physicsById.get(node.bodyId)!
  const low = rssPack.nodes.find(candidate => candidate.bodyId === node.bodyId && candidate.kind === 'orbit')!
  const radius = physics.radiusM + low.altitudeKm! * 1000
  const circularSpeed = Math.sqrt(physics.gravitationalParameter / radius)
  const speed = node.kind !== 'elliptical' ? circularSpeed : explicitHighPlanets.has(node.bodyId)
    ? Math.sqrt(physics.gravitationalParameter * (2 / radius - 2 / (radius + physics.sphereOfInfluenceM / 2)))
    : circularSpeed + highIncrements[node.bodyId]!
  return { physics, radius, speed }
}

describe('RSS direct planetary transfer references', () => {
  it('adds 360 complete directed pairs over all ten non-home planets and their high references without adding states', () => {
    expect(validatePlanetPack(rssPack)).toEqual([])
    expect(rssPack.nodes).toHaveLength(102)
    expect(directEdges).toHaveLength(360)
    expect([...new Set(directEdges.map(edge => edge.from))].sort()).toEqual([
      'rss:ceres:elliptical', 'rss:ceres:orbit', 'rss:jupiter:elliptical', 'rss:jupiter:orbit',
      'rss:mars:elliptical', 'rss:mars:orbit', 'rss:mercury:elliptical', 'rss:mercury:orbit',
      'rss:neptune:elliptical', 'rss:neptune:orbit',
      'rss:pluto:elliptical', 'rss:pluto:orbit', 'rss:saturn:elliptical', 'rss:saturn:orbit',
      'rss:uranus:elliptical', 'rss:uranus:orbit', 'rss:venus:elliptical', 'rss:venus:orbit', 'rss:vesta:elliptical', 'rss:vesta:orbit',
    ])
    expect(rssPack.sources.find(source => source.id === directTransferSource.id)?.budgetType).toBe('model')
    expect(rssPack.sources).toContainEqual(rssPhysicsSource)
    for (const edge of directEdges) {
      const from = nodeById.get(edge.from)!
      const to = nodeById.get(edge.to)!
      expect(edge).toMatchObject({ kind: 'transfer', directTransfer: true })
      expect(from.bodyId).not.toBe(to.bodyId)
      expect([from.bodyId, to.bodyId]).not.toContain('rss:earth')
      expect(edge.assumptions.join(' ')).toContain('Departure and orbit-entry burns')
      for (const node of [from, to]) {
        const reference = endpoint(node)
        expect(reference.radius).toBeGreaterThan(reference.physics.radiusM + reference.physics.atmosphereHeightM)
        expect(reference.radius).toBeLessThan(reference.physics.sphereOfInfluenceM)
        expect(reference.speed).toBeLessThan(Math.sqrt(2 * reference.physics.gravitationalParameter / reference.radius))
      }
    }
  })

  it('matches independent vis-viva departure and capture calculations for every directed pair', () => {
    for (const edge of directEdges) {
      const from = endpoint(nodeById.get(edge.from)!)
      const to = endpoint(nodeById.get(edge.to)!)
      const transferSemiMajorAxis = (from.physics.semiMajorAxisM + to.physics.semiMajorAxisM) / 2
      const excess = (stellarRadius: number) => Math.abs(
        Math.sqrt(rssCentralMu * (2 / stellarRadius - 1 / transferSemiMajorAxis))
          - Math.sqrt(rssCentralMu / stellarRadius),
      )
      const departure = Math.sqrt(excess(from.physics.semiMajorAxisM) ** 2
        + 2 * from.physics.gravitationalParameter / from.radius) - from.speed
      const capture = Math.sqrt(excess(to.physics.semiMajorAxisM) ** 2
        + 2 * to.physics.gravitationalParameter / to.radius) - to.speed
      expect(departure, edge.id).toBeGreaterThan(0)
      expect(capture, edge.id).toBeGreaterThan(0)
      expect(edge.deltaV, edge.id).toBe(Math.ceil(departure) + Math.ceil(capture))
      const reverse = directEdges.find(candidate => candidate.from === edge.to && candidate.to === edge.from)!
      expect(reverse.deltaV).toBe(edge.deltaV)
      expect(reverse.assumptions).not.toBe(edge.assumptions)
    }
  })

  it.each([
    ['mercury', 1220], ['venus', 2940], ['mars', 1440], ['ceres', 150],
  ] as const)('replaces the historical unbound %s high-state increment with explicit geometry instead of clamping it', (body, increment) => {
    const low = nodeById.get(`rss:${body}:orbit`)!
    const { physics, radius, speed } = endpoint(low)
    const escapeIncrement = Math.sqrt(2 * physics.gravitationalParameter / radius) - speed
    expect(increment).toBeGreaterThan(escapeIncrement)
    expect(directEdges.some(edge => edge.from === `rss:${body}:elliptical` || edge.to === `rss:${body}:elliptical`)).toBe(true)
    expect(rssReferencePack.maneuvers.find(edge => edge.from === low.id && edge.to === `rss:${body}:elliptical`)?.deltaV).toBe(increment)
    const replacement = rssPack.maneuvers.find(edge => edge.from === low.id && edge.to === `rss:${body}:elliptical`)!
    expect(replacement.sourceId).toBe(rssInnerSource.id)
    expect(replacement.deltaV).toBeLessThan(escapeIncrement)
  })

  it('uses explicit modeled outer references while preserving the historical map without invented altitude claims', () => {
    for (const body of ['saturn', 'uranus', 'neptune', 'pluto']) {
      expect(rssReferencePack.nodes.find(node => node.id === `rss:${body}:orbit`)?.altitudeKm).toBeUndefined()
      expect(nodeById.get(`rss:${body}:orbit`)?.altitudeKm).toBeGreaterThan(0)
      expect(directEdges.some(edge => nodeById.get(edge.from)?.bodyId === `rss:${body}`
        || nodeById.get(edge.to)?.bodyId === `rss:${body}`)).toBe(true)
    }
  })

  it('retains bound apoapses inside the SOI for every supported high reference', () => {
    for (const body of ['mercury', 'venus', 'mars', 'vesta', 'ceres', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto']) {
      const { physics, radius, speed } = endpoint(nodeById.get(`rss:${body}:elliptical`)!)
      const semiMajorAxis = 1 / (2 / radius - speed ** 2 / physics.gravitationalParameter)
      const apoapsis = 2 * semiMajorAxis - radius
      expect(apoapsis).toBeGreaterThan(radius)
      expect(apoapsis).toBeLessThan(physics.sphereOfInfluenceM)
    }
  })

  it('does not mutate or reprice the orbital overlays, retained map, or sibling records when adding pairs', () => {
    const baseline = { ...rssPack, maneuvers: rssPack.maneuvers.filter(edge => edge.sourceId !== directTransferSource.id) }
    const snapshot = structuredClone(baseline)
    const generated = withDirectTransfers(baseline, transferReferences, rssCentralMu, [rssPhysicsSource])
    expect(baseline).toEqual(snapshot)
    expect(generated.maneuvers.filter(edge => edge.sourceId !== directTransferSource.id)).toEqual(baseline.maneuvers)
    expect(generated.nodes).toEqual(baseline.nodes)
    expect(generated.maneuvers).toEqual(rssPack.maneuvers)
    expect(withDirectTransfers(generated, transferReferences, rssCentralMu, [rssPhysicsSource])).toEqual(generated)
    expect(baseline.maneuvers.filter(edge => edge.sourceId === 'rss-community-solar-system-map')).toHaveLength(90)
    expect(baseline.maneuvers.filter(edge => edge.sourceId === 'sibling-moon-transfer-model')).toHaveLength(76)
  })
})

describe('RSS complete direct-transfer missions', () => {
  const graph = buildGraph(rssPack)

  it.each([
    ['mars', 'venus', 7850], ['mercury', 'mars', 16894],
    ['mars', 'jupiter', 21608], ['vesta', 'ceres', 1102],
  ] as const)('prices %s low orbit to %s low orbit as %i m/s in both directions', (from, to, expected) => {
    for (const mode of ['one-way', 'return-only', 'round-trip'] as const) {
      const result = findMissionRoute(graph, `rss:${from}:orbit`, `rss:${to}:orbit`, mode)
      expect(result).toMatchObject({ status: 'success', totalDeltaV: mode === 'round-trip' ? expected * 2 : expected })
      if (result.status !== 'success') throw new Error(result.message)
      expect(result.legs).toHaveLength(mode === 'round-trip' ? 2 : 1)
      expect(result.legs.every(({ edge }) => edge.sourceId === directTransferSource.id)).toBe(true)
      expect(result.nodeIds).not.toContain('rss:earth:orbit')
    }
  })

  it('charges every direct arrival and departure at ordered low-orbit stops', () => {
    const outward = ['rss:mars:orbit', 'rss:vesta:orbit', 'rss:ceres:orbit']
    for (const mode of ['one-way', 'return-only', 'round-trip'] as const) {
      const result = findMissionRoute(graph, outward[0]!, outward[2]!, mode, [outward[1]!])
      expect(result).toMatchObject({ status: 'success', totalDeltaV: mode === 'round-trip' ? 10248 : 5124 })
      if (result.status !== 'success') throw new Error(result.message)
      expect(result.nodeIds).toEqual(mode === 'one-way' ? outward
        : mode === 'return-only' ? [...outward].reverse() : [...outward, ...outward.slice(0, -1).reverse()])
      expect(result.legs.map(({ edge }) => edge.deltaV)).toEqual(mode === 'one-way' ? [4022, 1102]
        : mode === 'return-only' ? [1102, 4022] : [4022, 1102, 1102, 4022])
    }
  })

  it('reaches Europa through a paid Jupiter high capture without low circularization', () => {
    const outward = ['rss:mars:orbit', 'rss:jupiter:elliptical', 'rss:europa:encounter', 'rss:europa:orbit']
    for (const mode of ['one-way', 'return-only', 'round-trip'] as const) {
      const result = findMissionRoute(graph, outward[0]!, outward[3]!, mode)
      expect(result).toMatchObject({ status: 'success', totalDeltaV: mode === 'round-trip' ? 27756 : 13878 })
      if (result.status !== 'success') throw new Error(result.message)
      expect(result.nodeIds).toEqual(mode === 'one-way' ? outward
        : mode === 'return-only' ? [...outward].reverse() : [...outward, ...outward.slice(0, -1).reverse()])
      expect(result.legs.reduce((total, { edge }) => total + edge.deltaV, 0)).toBe(result.totalDeltaV)
      expect(result.nodeIds).not.toContain('rss:jupiter:orbit')
      expect(result.nodeIds).not.toContain('rss:earth:orbit')
    }
  })

  it('does not use a direct pair to erase a pending legacy Jupiter encounter arrival', () => {
    const result = findLowestCostPath(graph, 'rss:jupiter:elliptical', 'rss:mars:orbit', { pendingParkingBodyId: 'rss:jupiter' })
    expect(result).toMatchObject({ status: 'success', totalDeltaV: 38818 })
    if (result.status !== 'success') throw new Error(result.message)
    expect(result.nodeIds).toEqual(['rss:jupiter:elliptical', 'rss:jupiter:orbit', 'rss:mars:orbit'])
    expect(result.legs.map(({ edge }) => edge.deltaV)).toEqual([17210, 21608])
    const stopped = findMissionRoute(graph, 'rss:earth:orbit', 'rss:venus:orbit', 'one-way', ['rss:mars:encounter'])
    expect(stopped.status).toBe('success')
    if (stopped.status !== 'success') throw new Error(stopped.message)
    expect(stopped.nodeIds).toEqual([
      'rss:earth:orbit', 'rss:earth:encounter', 'rss:mars:encounter',
      'rss:mars:elliptical', 'rss:mars:orbit', 'rss:venus:orbit',
    ])
    const earth = endpoint(nodeById.get('rss:earth:orbit')!)
    const mars = endpoint(nodeById.get('rss:mars:orbit')!)
    const marsHigh = endpoint(nodeById.get('rss:mars:elliptical')!)
    const stellarTransferA = (earth.physics.semiMajorAxisM + mars.physics.semiMajorAxisM) / 2
    const excess = (stellarRadius: number) => Math.abs(Math.sqrt(rssCentralMu * (2 / stellarRadius - 1 / stellarTransferA))
      - Math.sqrt(rssCentralMu / stellarRadius))
    const earthDeparture = Math.ceil(Math.sqrt(excess(earth.physics.semiMajorAxisM) ** 2
      + 2 * earth.physics.gravitationalParameter / earth.radius) - earth.speed)
    const marsCapture = Math.ceil(Math.sqrt(excess(mars.physics.semiMajorAxisM) ** 2
      + 2 * mars.physics.gravitationalParameter / mars.radius) - marsHigh.speed)
    const marsCircularization = Math.ceil(marsHigh.speed - mars.speed)
    expect(stopped.totalDeltaV).toBe(earthDeparture + marsCapture + marsCircularization + 7850)
  })

  it('keeps bundled powered capture priced while allowing a separate ideal high-to-low circularization', () => {
    const assisted = applyAtmosphericAssistance(graph, rssPack, [{ bodyId: 'rss:venus', capture: true, landing: false, landingDeltaV: 0 }])
    const before = directEdges.find(edge => edge.from === 'rss:mars:orbit' && edge.to === 'rss:venus:orbit')!
    const after = assisted.graph.adjacency.get(before.from)!.find(edge => edge.id === before.id)!
    expect(after.deltaV).toBe(7850)
    const result = findMissionRoute(assisted.graph, before.from, before.to, 'one-way')
    expect(result).toMatchObject({ status: 'success', totalDeltaV: 5014,
      nodeIds: ['rss:mars:orbit', 'rss:venus:elliptical', 'rss:venus:orbit'] })
    if (result.status !== 'success') throw new Error(result.message)
    const highPair = directEdges.find(edge => edge.from === before.from && edge.to === 'rss:venus:elliptical')!
    expect(result.legs.map(({ edge }) => edge.deltaV)).toEqual([highPair.deltaV, 0])
    expect(result.legs[0]!.edge).toEqual(highPair)
    expect(assisted.adjustments.has(highPair.id)).toBe(false)
    expect(assisted.adjustments.get('rss:venus:elliptical->rss:venus:orbit')?.kind).toBe('capture')
  })
})
