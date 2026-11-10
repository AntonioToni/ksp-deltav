import { describe, expect, it } from 'vitest'
import type { ManeuverEdge } from '../types/planner'
import { applyAtmosphericAssistance } from '../utils/atmosphericAssistance'
import { buildGraph } from '../utils/buildGraph'
import { findLowestCostPath } from '../utils/findRoute'
import { findMissionRoute } from '../utils/mission'
import { directTransferSource } from './directTransfers'
import { rssPack, rssReferencePack } from './rss'
import { rssOuterOrbitReferences, rssOuterSource, withRssOuterReferences } from './rssOuterReferences'
import { rssCentralMu, rssPhysicalReferences } from './rssPhysics'

const physical = new Map(rssPhysicalReferences.map(reference => [reference.bodyId, reference]))
const nodes = new Map(rssPack.nodes.map(node => [node.id, node]))
const maneuvers = new Map(rssPack.maneuvers.map(edge => [edge.id, edge]))
const planets = ['saturn', 'uranus', 'neptune', 'pluto']
const selectedAltitudesKm = new Map([
  ['rss:saturn', 2500], ['rss:uranus', 2000], ['rss:neptune', 1500],
  ['rss:pluto', 150], ['rss:triton', 150],
])

const id = (bodyId: string, kind: string) => `${bodyId}:${kind}`
const radius = (bodyId: string) => physical.get(bodyId)!.radiusM + nodes.get(id(bodyId, 'orbit'))!.altitudeKm! * 1000
// Independent vis-viva and vector-speed oracle. These tests intentionally do
// not call the production Hohmann, capture, or ellipse-budget helpers.
const speed = (mu: number, r: number, semiMajorAxis: number) => Math.sqrt(mu * (2 / r - 1 / semiMajorAxis))
const circular = (mu: number, r: number) => Math.sqrt(mu / r)
const capture = (mu: number, r: number, excess: number) => Math.sqrt(excess ** 2 + 2 * mu / r) - circular(mu, r)

function independentOuterBudgets(): Map<string, number> {
  const expected = new Map<string, number>()
  const pair = (from: string, to: string, deltaV: number) => {
    expected.set(`${from}->${to}`, Math.ceil(deltaV))
    expected.set(`${to}->${from}`, Math.ceil(deltaV))
  }
  const earth = physical.get('rss:earth')!
  for (const planet of planets) {
    const bodyId = `rss:${planet}`
    const reference = physical.get(bodyId)!
    const mu = reference.gravitationalParameter
    const rp = radius(bodyId)
    const ra = reference.sphereOfInfluenceM / 2
    const highSpeed = speed(mu, rp, (rp + ra) / 2)
    const stellarTransferA = (earth.semiMajorAxisM + reference.semiMajorAxisM) / 2
    const earthExcess = Math.abs(speed(rssCentralMu, earth.semiMajorAxisM, stellarTransferA)
      - circular(rssCentralMu, earth.semiMajorAxisM))
    const planetExcess = Math.abs(speed(rssCentralMu, reference.semiMajorAxisM, stellarTransferA)
      - circular(rssCentralMu, reference.semiMajorAxisM))
    pair('rss:earth:encounter', id(bodyId, 'encounter'), Math.ceil(capture(earth.gravitationalParameter, radius(earth.bodyId), earthExcess)) - 3210)
    pair(id(bodyId, 'orbit'), id(bodyId, 'elliptical'), highSpeed - circular(mu, rp))
    pair(id(bodyId, 'elliptical'), id(bodyId, 'encounter'), Math.sqrt(planetExcess ** 2 + 2 * mu / rp) - highSpeed)
    for (const moon of rssPhysicalReferences.filter(candidate => candidate.parentBodyId === bodyId)) {
      const moonTransferA = (rp + moon.semiMajorAxisM) / 2
      const transferDeparture = speed(mu, rp, moonTransferA)
      const transferArrival = speed(mu, moon.semiMajorAxisM, moonTransferA)
      const moonSpeed = circular(mu, moon.semiMajorAxisM)
      const inclination = moon.inclinationDeg * Math.PI / 180
      const relativeSpeed = Math.sqrt(transferArrival ** 2 + moonSpeed ** 2
        - 2 * transferArrival * moonSpeed * Math.cos(inclination))
      pair(id(bodyId, 'elliptical'), id(moon.bodyId, 'encounter'), Math.abs(highSpeed - transferDeparture))
      pair(id(moon.bodyId, 'encounter'), id(moon.bodyId, 'orbit'), capture(moon.gravitationalParameter, radius(moon.bodyId), relativeSpeed))
    }
  }
  return expected
}

const independentlyPriced = independentOuterBudgets()

describe('RSS modern outer-system references', () => {
  it('gives explicit parking orbits above the modern atmospheres and bound high ellipses inside the SOI', () => {
    expect(rssOuterOrbitReferences).toHaveLength(5)
    expect(rssPack.sources).toContainEqual(rssOuterSource)
    expect(rssOuterSource.budgetType).toBe('model')
    for (const [bodyId, altitudeKm] of selectedAltitudesKm) {
      const reference = physical.get(bodyId)!
      expect(nodes.get(id(bodyId, 'orbit'))?.altitudeKm, bodyId).toBe(altitudeKm)
      expect(altitudeKm * 1000, bodyId).toBeGreaterThan(reference.atmosphereHeightM)
      expect(radius(bodyId), bodyId).toBeLessThan(reference.sphereOfInfluenceM)
      expect(rssReferencePack.nodes.find(node => node.id === id(bodyId, 'orbit'))?.altitudeKm).toBeUndefined()
      if (bodyId === 'rss:triton') continue
      const periapsis = radius(bodyId)
      const apoapsis = reference.sphereOfInfluenceM / 2
      const highSpeed = speed(reference.gravitationalParameter, periapsis, (periapsis + apoapsis) / 2)
      expect(apoapsis).toBeGreaterThan(periapsis)
      expect(apoapsis).toBeLessThan(reference.sphereOfInfluenceM)
      expect(highSpeed ** 2 / 2 - reference.gravitationalParameter / periapsis).toBeLessThan(0)
    }
  })

  it('independently prices every replaced Earth, outer-orbit, and moon maneuver', () => {
    const modeled = rssPack.maneuvers.filter(edge => edge.sourceId === rssOuterSource.id)
    expect(modeled).toHaveLength(80)
    expect(new Set(modeled.map(edge => edge.id))).toEqual(new Set(independentlyPriced.keys()))
    for (const edge of modeled) {
      expect(edge.deltaV, edge.id).toBe(independentlyPriced.get(edge.id))
      expect(edge.directTransfer, edge.id).not.toBe(true)
      expect(maneuvers.get(`${edge.to}->${edge.from}`)?.deltaV, edge.id).toBe(edge.deltaV)
    }
  })

  it('uses the same Earth departure energy for the rail increment and local arrival/capture', () => {
    const earth = physical.get('rss:earth')!
    for (const planet of planets) {
      const bodyId = `rss:${planet}`
      const destination = physical.get(bodyId)!
      const transferA = (earth.semiMajorAxisM + destination.semiMajorAxisM) / 2
      const earthExcess = Math.abs(speed(rssCentralMu, earth.semiMajorAxisM, transferA) - circular(rssCentralMu, earth.semiMajorAxisM))
      const arrivalExcess = Math.abs(speed(rssCentralMu, destination.semiMajorAxisM, transferA) - circular(rssCentralMu, destination.semiMajorAxisM))
      const departure = 3210 + maneuvers.get(`rss:earth:encounter->${bodyId}:encounter`)!.deltaV
      const arrival = maneuvers.get(`${bodyId}:encounter->${bodyId}:elliptical`)!.deltaV
        + maneuvers.get(`${bodyId}:elliptical->${bodyId}:orbit`)!.deltaV
      expect(departure).toBe(Math.ceil(capture(earth.gravitationalParameter, radius(earth.bodyId), earthExcess)))
      const completeArrival = Math.ceil(capture(destination.gravitationalParameter, radius(bodyId), arrivalExcess))
      // Splitting and independently rounding two burns can add at most 1 m/s.
      expect(arrival).toBeGreaterThanOrEqual(completeArrival)
      expect(arrival).toBeLessThanOrEqual(completeArrival + 1)
    }
  })

  it('charges Triton for a retrograde encounter instead of using prograde speed subtraction', () => {
    const triton = physical.get('rss:triton')!
    const neptune = physical.get('rss:neptune')!
    const transferA = (radius(neptune.bodyId) + triton.semiMajorAxisM) / 2
    const progradeExcess = Math.abs(speed(neptune.gravitationalParameter, triton.semiMajorAxisM, transferA)
      - circular(neptune.gravitationalParameter, triton.semiMajorAxisM))
    const modeled = maneuvers.get('rss:triton:encounter->rss:triton:orbit')!
    expect(triton.inclinationDeg).toBeGreaterThan(90)
    expect(modeled.deltaV).toBe(independentlyPriced.get(modeled.id))
    expect(modeled.deltaV).toBeGreaterThan(Math.ceil(capture(triton.gravitationalParameter, radius(triton.bodyId), progradeExcess)))
  })

  it('retains the original map and makes changed-altitude atmospheric surface allowances explicit', () => {
    const before = structuredClone(rssReferencePack)
    const overlay = withRssOuterReferences(rssReferencePack)
    expect(rssReferencePack).toEqual(before)
    expect(overlay.maneuvers.filter(edge => edge.sourceId === rssOuterSource.id)).toHaveLength(80)
    for (const body of ['pluto', 'triton']) {
      for (const [fromKind, toKind] of [['surface', 'orbit'], ['orbit', 'surface']]) {
        const edgeId = `rss:${body}:${fromKind}->rss:${body}:${toKind}`
        const source = rssReferencePack.maneuvers.find(edge => edge.id === edgeId)!
        const retained = overlay.maneuvers.find(edge => edge.id === edgeId)!
        expect(retained).toMatchObject({ deltaV: source.deltaV, sourceId: source.sourceId })
        expect(retained.assumptions.join(' ')).toMatch(/not (?:recalibrated|calibrated)|uncalibrated/)
      }
    }
    for (const source of rssReferencePack.maneuvers) {
      if (independentlyPriced.has(source.id) || /rss:(pluto|triton):(surface|orbit)->rss:(pluto|triton):(surface|orbit)/.test(source.id)) continue
      expect(overlay.maneuvers.find(edge => edge.id === source.id), source.id).toEqual(source)
    }
  })
})

describe('RSS outer-system mission regressions', () => {
  const graph = buildGraph(rssPack)
  const successful = (from: string, to: string, mode: 'one-way' | 'return-only' | 'round-trip', stops: string[] = []) => {
    const result = findMissionRoute(graph, from, to, mode, stops)
    if (result.status !== 'success') throw new Error(`${from} → ${to} (${mode}): ${result.message}`)
    return result
  }
  const origins = ['ceres:surface', 'mars:orbit', 'mercury:orbit', 'venus:orbit', 'phobos:orbit', 'deimos:orbit', 'vesta:orbit', 'io:orbit']
  const outerBodyIds = new Set(planets.map(planet => `rss:${planet}`))
  for (const body of rssPack.bodies) if (body.parentId && outerBodyIds.has(body.parentId)) outerBodyIds.add(body.id)
  const targets = rssPack.nodes.filter(node => outerBodyIds.has(node.bodyId) && node.kind !== 'encounter')

  it.each(origins)('does not insert Earth into %s journeys to any outer planet or moon in any mission mode', origin => {
    expect(targets).toHaveLength(37)
    for (const target of targets) {
      for (const mode of ['one-way', 'return-only', 'round-trip'] as const) {
        const result = successful(`rss:${origin}`, target.id, mode)
        expect(result.nodeIds.some(nodeId => nodeId.startsWith('rss:earth:')), `${origin} → ${target.id} (${mode})`).toBe(false)
        expect(result.totalDeltaV).toBe(result.legs.reduce((sum, { edge }) => sum + edge.deltaV, 0))
        expect(result.totalDeltaV).toBeGreaterThan(0)
      }
    }
  }, 15000)

  it('avoids Earth for every non-Earth-system bound origin to every outer bound or surface destination', () => {
    const starts = rssPack.nodes.filter(node => !['rss:earth', 'rss:moon'].includes(node.bodyId) && node.kind !== 'encounter')
    expect(starts).toHaveLength(66)
    for (const start of starts) {
      for (const target of targets) {
        const result = successful(start.id, target.id, 'one-way')
        expect(result.nodeIds.some(nodeId => nodeId.startsWith('rss:earth:')), `${start.id} → ${target.id}`).toBe(false)
      }
    }
  }, 15000)

  it('fixes the Ceres-to-Miranda breakdown without Earth or Uranus low circularization', () => {
    const outward = ['rss:ceres:surface', 'rss:ceres:orbit', 'rss:uranus:elliptical', 'rss:miranda:encounter', 'rss:miranda:orbit']
    const completePair = maneuvers.get('direct:rss:ceres:orbit->rss:uranus:elliptical')!
    const expected = 270 + completePair.deltaV
      + independentlyPriced.get('rss:uranus:elliptical->rss:miranda:encounter')!
      + independentlyPriced.get('rss:miranda:encounter->rss:miranda:orbit')!
    for (const mode of ['one-way', 'return-only', 'round-trip'] as const) {
      const result = successful(outward[0]!, outward.at(-1)!, mode)
      expect(result.nodeIds).toEqual(mode === 'one-way' ? outward
        : mode === 'return-only' ? [...outward].reverse() : [...outward, ...outward.slice(0, -1).reverse()])
      expect(result.totalDeltaV).toBe(mode === 'round-trip' ? expected * 2 : expected)
      const firstLeg = mode === 'return-only' ? [...result.legs].reverse() : result.legs
      expect(firstLeg.slice(0, 4).map(({ edge }) => edge.sourceId)).toEqual([
        'rss-community-solar-system-map', directTransferSource.id, rssOuterSource.id, rssOuterSource.id,
      ])
    }
  })

  it('preserves ordered interplanetary stops and charges their arrivals and departures in both directions', () => {
    for (const mode of ['one-way', 'return-only', 'round-trip'] as const) {
      const result = successful('rss:ceres:surface', 'rss:miranda:orbit', mode, ['rss:mars:orbit', 'rss:uranus:elliptical'])
      const stages = [...result.outboundStages, ...result.returnStages]
      expect(stages).toHaveLength(mode === 'round-trip' ? 6 : 3)
      expect(stages.reduce((total, stage) => total + stage.totalDeltaV, 0)).toBe(result.totalDeltaV)
      expect(result.nodeIds).not.toContain('rss:earth:orbit')
      const direct = result.legs.filter(({ edge }) => edge.sourceId === directTransferSource.id)
      expect(direct).toHaveLength(mode === 'round-trip' ? 4 : 2)
      expect(direct.every(({ edge }) => edge.deltaV > 0)).toBe(true)
      const stops = mode === 'one-way' ? ['rss:mars:orbit', 'rss:uranus:elliptical']
        : mode === 'return-only' ? ['rss:uranus:elliptical', 'rss:mars:orbit']
          : ['rss:mars:orbit', 'rss:uranus:elliptical', 'rss:miranda:orbit', 'rss:uranus:elliptical', 'rss:mars:orbit']
      let prior = -1
      for (const stop of stops) {
        const next = result.nodeIds.indexOf(stop, prior + 1)
        expect(next, stop).toBeGreaterThan(prior)
        prior = next
      }
    }
  })

  it('retains an explicitly requested Earth parking stop and pays its capture and departure', () => {
    const result = successful('rss:ceres:surface', 'rss:miranda:orbit', 'one-way', ['rss:earth:orbit'])
    expect(result.nodeIds.filter(nodeId => nodeId === 'rss:earth:orbit')).toHaveLength(1)
    const earthEdges = result.legs.filter(({ edge }) => [edge.from, edge.to].includes('rss:earth:orbit'))
    expect(earthEdges.map(({ edge }) => edge.deltaV)).toEqual([3210, 3210])
    expect(result.outboundStages).toHaveLength(2)
    expect(result.outboundStages[0]!.nodeIds.at(-1)).toBe('rss:earth:orbit')
    expect(result.outboundStages[1]!.nodeIds[0]).toBe('rss:earth:orbit')
  })

  it('cannot erase a pending legacy Uranus encounter arrival with a new complete pair', () => {
    const result = findLowestCostPath(graph, 'rss:uranus:elliptical', 'rss:mars:orbit', { pendingParkingBodyId: 'rss:uranus' })
    expect(result.status).toBe('success')
    if (result.status !== 'success') throw new Error(result.message)
    expect(result.nodeIds).toEqual(['rss:uranus:elliptical', 'rss:uranus:orbit', 'rss:mars:orbit'])
    expect(result.legs[0]!.edge.deltaV).toBe(independentlyPriced.get('rss:uranus:elliptical->rss:uranus:orbit'))
  })

  it('does not turn the new complete direct capture into a free atmospheric arrival', () => {
    const edge = maneuvers.get('direct:rss:ceres:orbit->rss:uranus:elliptical')!
    const assisted = applyAtmosphericAssistance(graph, rssPack, [{ bodyId: 'rss:uranus', capture: true, landing: false, landingDeltaV: 0 }])
    const current = assisted.graph.adjacency.get(edge.from)!.find(candidate => candidate.id === edge.id) as ManeuverEdge
    expect(current.deltaV).toBe(edge.deltaV)
    expect(findLowestCostPath(assisted.graph, edge.from, edge.to)).toMatchObject({ status: 'success', totalDeltaV: edge.deltaV })
  })
})
