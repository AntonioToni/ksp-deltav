import { describe, expect, it } from 'vitest'
import { applyAtmosphericAssistance } from '../utils/atmosphericAssistance'
import { buildGraph } from '../utils/buildGraph'
import { findLowestCostPath } from '../utils/findRoute'
import { findMissionRoute } from '../utils/mission'
import { directTransferSource } from './directTransfers'
import { rssPack, rssReferencePack } from './rss'
import { rssInnerOrbitReferences, rssInnerSource, withRssInnerReferences } from './rssInnerReferences'
import { rssOuterSource, withRssOuterReferences } from './rssOuterReferences'
import { rssCentralMu, rssPhysicalReferences } from './rssPhysics'

const physical = new Map(rssPhysicalReferences.map(reference => [reference.bodyId, reference]))
const nodes = new Map(rssPack.nodes.map(node => [node.id, node]))
const edges = new Map(rssPack.maneuvers.map(edge => [edge.id, edge]))
const planets = ['mercury', 'venus', 'mars', 'ceres'] as const
const altitudesKm = { mercury: 100, venus: 400, mars: 200, ceres: 20 }
const oldIncrements = { mercury: 1220, venus: 2940, mars: 1440, ceres: 150 }
const id = (bodyId: string, kind: string) => `${bodyId}:${kind}`
const radius = (bodyId: string) => physical.get(bodyId)!.radiusM + nodes.get(id(bodyId, 'orbit'))!.altitudeKm! * 1000

// Independent vis-viva and vector arithmetic: do not import the production
// Hohmann, ellipse, or capture helpers into the numerical reference oracle.
const circular = (mu: number, r: number) => Math.sqrt(mu / r)
const speed = (mu: number, r: number, semiMajorAxis: number) => Math.sqrt(mu * (2 / r - 1 / semiMajorAxis))
const capture = (mu: number, r: number, excess: number) => Math.sqrt(excess ** 2 + 2 * mu / r) - circular(mu, r)

function independentInnerBudgets(): Map<string, number> {
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
      const departureSpeed = speed(mu, rp, moonTransferA)
      const arrivalSpeed = speed(mu, moon.semiMajorAxisM, moonTransferA)
      const moonSpeed = circular(mu, moon.semiMajorAxisM)
      const relativeSpeed = Math.sqrt(arrivalSpeed ** 2 + moonSpeed ** 2
        - 2 * arrivalSpeed * moonSpeed * Math.cos(moon.inclinationDeg * Math.PI / 180))
      pair(id(bodyId, 'elliptical'), id(moon.bodyId, 'encounter'), Math.abs(highSpeed - departureSpeed))
      pair(id(moon.bodyId, 'encounter'), id(moon.bodyId, 'orbit'), capture(moon.gravitationalParameter, radius(moon.bodyId), relativeSpeed))
    }
  }
  return expected
}

const expected = independentInnerBudgets()

function independentHighPair(fromBodyId: string, toBodyId: string): number {
  const from = physical.get(fromBodyId)!
  const to = physical.get(toBodyId)!
  const aTransfer = (from.semiMajorAxisM + to.semiMajorAxisM) / 2
  const endpoint = (reference: typeof from) => {
    const mu = reference.gravitationalParameter
    const rp = radius(reference.bodyId)
    const highSpeed = speed(mu, rp, (rp + reference.sphereOfInfluenceM / 2) / 2)
    const excess = Math.abs(speed(rssCentralMu, reference.semiMajorAxisM, aTransfer)
      - circular(rssCentralMu, reference.semiMajorAxisM))
    return Math.ceil(Math.sqrt(excess ** 2 + 2 * mu / rp) - highSpeed)
  }
  return endpoint(from) + endpoint(to)
}

describe('RSS explicit inner high-orbit references', () => {
  it('keeps compatible published low altitudes while selecting reproducible bound high geometry', () => {
    expect(rssInnerOrbitReferences).toHaveLength(4)
    expect(rssPack.sources).toContainEqual(rssInnerSource)
    expect(rssInnerSource.budgetType).toBe('model')
    for (const planet of planets) {
      const bodyId = `rss:${planet}`
      const reference = physical.get(bodyId)!
      const rp = radius(bodyId)
      const ra = reference.sphereOfInfluenceM / 2
      const high = speed(reference.gravitationalParameter, rp, (rp + ra) / 2)
      expect(nodes.get(id(bodyId, 'orbit'))?.altitudeKm).toBe(altitudesKm[planet])
      expect(rssReferencePack.nodes.find(node => node.id === id(bodyId, 'orbit'))?.altitudeKm).toBe(altitudesKm[planet])
      expect(rp).toBeGreaterThan(reference.radiusM + reference.atmosphereHeightM)
      expect(ra).toBeGreaterThan(rp)
      expect(ra).toBeLessThan(reference.sphereOfInfluenceM)
      expect(high ** 2 / 2 - reference.gravitationalParameter / rp).toBeLessThan(0)
      expect(rssInnerOrbitReferences.find(candidate => candidate.bodyId === bodyId)?.ellipticalApoapsisRadiusM).toBe(ra)
      const old = rssReferencePack.maneuvers.find(edge => edge.from === id(bodyId, 'orbit') && edge.to === id(bodyId, 'elliptical'))!
      expect(old.deltaV).toBe(oldIncrements[planet])
      expect(old.deltaV).toBeGreaterThan((Math.SQRT2 - 1) * circular(reference.gravitationalParameter, rp))
      expect(edges.get(old.id)?.deltaV).toBe(Math.ceil(high - circular(reference.gravitationalParameter, rp)))
      expect(edges.get(old.id)?.sourceId).toBe(rssInnerSource.id)
    }
  })

  it('independently prices all 32 replaced Earth, inner-orbit, and Mars-moon maneuvers', () => {
    const modeled = rssPack.maneuvers.filter(edge => edge.sourceId === rssInnerSource.id)
    expect(modeled).toHaveLength(32)
    expect(new Set(modeled.map(edge => edge.id))).toEqual(new Set(expected.keys()))
    for (const edge of modeled) {
      expect(edge.deltaV, edge.id).toBe(expected.get(edge.id))
      expect(edge.deltaV).toBeGreaterThan(0)
      expect(edges.get(`${edge.to}->${edge.from}`)?.deltaV).toBe(edge.deltaV)
    }
  })

  it('charges Earth escape exactly once and uses the matching encounter energy for capture', () => {
    const earth = physical.get('rss:earth')!
    for (const planet of planets) {
      const bodyId = `rss:${planet}`
      const destination = physical.get(bodyId)!
      const a = (earth.semiMajorAxisM + destination.semiMajorAxisM) / 2
      const earthExcess = Math.abs(speed(rssCentralMu, earth.semiMajorAxisM, a) - circular(rssCentralMu, earth.semiMajorAxisM))
      const planetExcess = Math.abs(speed(rssCentralMu, destination.semiMajorAxisM, a) - circular(rssCentralMu, destination.semiMajorAxisM))
      const departure = 3210 + edges.get(`rss:earth:encounter->${bodyId}:encounter`)!.deltaV
      const splitArrival = edges.get(`${bodyId}:encounter->${bodyId}:elliptical`)!.deltaV
        + edges.get(`${bodyId}:elliptical->${bodyId}:orbit`)!.deltaV
      const completeArrival = Math.ceil(capture(destination.gravitationalParameter, radius(bodyId), planetExcess))
      expect(departure).toBe(Math.ceil(capture(earth.gravitationalParameter, radius(earth.bodyId), earthExcess)))
      expect(splitArrival).toBeGreaterThanOrEqual(completeArrival)
      expect(splitArrival).toBeLessThanOrEqual(completeArrival + 1)
    }
  })

  it('does not mutate the historical map, outer model, or unchanged surface allowances', () => {
    const outer = withRssOuterReferences(rssReferencePack)
    const snapshot = structuredClone(outer)
    const generated = withRssInnerReferences(outer)
    expect(outer).toEqual(snapshot)
    expect(rssReferencePack.maneuvers).toHaveLength(202)
    expect(generated.maneuvers).toHaveLength(202)
    expect(generated.maneuvers.filter(edge => edge.sourceId === rssOuterSource.id)).toEqual(outer.maneuvers.filter(edge => edge.sourceId === rssOuterSource.id))
    for (const edge of outer.maneuvers) {
      if (!expected.has(edge.id)) expect(generated.maneuvers.find(candidate => candidate.id === edge.id), edge.id).toEqual(edge)
    }
    for (const planet of planets) {
      for (const [from, to] of [['surface', 'orbit'], ['orbit', 'surface']]) {
        const edgeId = `rss:${planet}:${from}->rss:${planet}:${to}`
        expect(generated.maneuvers.find(edge => edge.id === edgeId)).toEqual(rssReferencePack.maneuvers.find(edge => edge.id === edgeId))
      }
    }
    expect(withRssInnerReferences(generated)).toEqual(generated)
  })
})

describe('RSS inner high-orbit missions', () => {
  const graph = buildGraph(rssPack)
  const successful = (from: string, to: string, mode: 'one-way' | 'return-only' | 'round-trip', stops: string[] = []) => {
    const result = findMissionRoute(graph, from, to, mode, stops)
    if (result.status !== 'success') throw new Error(`${from} → ${to} (${mode}): ${result.message}`)
    return result
  }

  it.each(planets)('supports every %s high-orbit pair without unrelated parking in every mission mode', planet => {
    const start = `rss:${planet}:elliptical`
    const targets = rssPack.nodes.filter(node => ['orbit', 'elliptical'].includes(node.kind)
      && rssPack.bodies.some(body => body.id === node.bodyId && body.kind === 'planet' && body.id !== 'rss:earth')
      && node.bodyId !== `rss:${planet}`)
    expect(targets).toHaveLength(18)
    for (const target of targets) {
      for (const mode of ['one-way', 'return-only', 'round-trip'] as const) {
        const result = successful(start, target.id, mode)
        expect(result.legs).toHaveLength(mode === 'round-trip' ? 2 : 1)
        expect(result.legs.every(({ edge }) => edge.sourceId === directTransferSource.id)).toBe(true)
        expect(result.nodeIds).not.toContain('rss:earth:orbit')
        expect(result.totalDeltaV).toBe(result.legs.reduce((sum, { edge }) => sum + edge.deltaV, 0))
      }
    }
  })

  it.each(['phobos', 'deimos'])('reaches %s through a complete Mars high arrival without low circularization', moon => {
    const outward = ['rss:venus:elliptical', 'rss:mars:elliptical', `rss:${moon}:encounter`, `rss:${moon}:orbit`]
    const oneWay = independentHighPair('rss:venus', 'rss:mars')
      + expected.get(`rss:mars:elliptical->rss:${moon}:encounter`)!
      + expected.get(`rss:${moon}:encounter->rss:${moon}:orbit`)!
    for (const mode of ['one-way', 'return-only', 'round-trip'] as const) {
      const result = successful(outward[0]!, outward[3]!, mode)
      expect(result.nodeIds).toEqual(mode === 'one-way' ? outward
        : mode === 'return-only' ? [...outward].reverse() : [...outward, ...outward.slice(0, -1).reverse()])
      expect(result.totalDeltaV).toBe(mode === 'round-trip' ? oneWay * 2 : oneWay)
      expect(result.nodeIds).not.toContain('rss:mars:orbit')
      expect(result.nodeIds).not.toContain('rss:earth:orbit')
    }
  })

  it('charges every capture and departure through ordered high-orbit stops', () => {
    const outward = ['rss:mercury:elliptical', 'rss:ceres:elliptical', 'rss:venus:elliptical', 'rss:mars:elliptical']
    const oneWay = independentHighPair('rss:mercury', 'rss:ceres')
      + independentHighPair('rss:ceres', 'rss:venus') + independentHighPair('rss:venus', 'rss:mars')
    for (const mode of ['one-way', 'return-only', 'round-trip'] as const) {
      const result = successful(outward[0]!, outward[3]!, mode, outward.slice(1, -1))
      expect(result.nodeIds).toEqual(mode === 'one-way' ? outward
        : mode === 'return-only' ? [...outward].reverse() : [...outward, ...outward.slice(0, -1).reverse()])
      expect(result.totalDeltaV).toBe(mode === 'round-trip' ? oneWay * 2 : oneWay)
      expect(result.legs).toHaveLength(mode === 'round-trip' ? 6 : 3)
      expect([...result.outboundStages, ...result.returnStages].reduce((sum, stage) => sum + stage.totalDeltaV, 0)).toBe(result.totalDeltaV)
    }
  })

  it('retains explicit Earth parking and its paid capture/departure instead of interpreting it as a flyby', () => {
    const result = successful('rss:ceres:surface', 'rss:mars:elliptical', 'one-way', ['rss:earth:orbit'])
    const expectedFirstStage = 270 + expected.get('rss:ceres:orbit->rss:ceres:elliptical')!
      + expected.get('rss:ceres:elliptical->rss:ceres:encounter')!
      + expected.get('rss:ceres:encounter->rss:earth:encounter')! + 3210
    expect(result.outboundStages).toHaveLength(2)
    expect(result.outboundStages[0]!.totalDeltaV).toBe(expectedFirstStage)
    expect(result.nodeIds.filter(nodeId => nodeId === 'rss:earth:orbit')).toHaveLength(1)
    expect(result.legs.filter(({ edge }) => [edge.from, edge.to].includes('rss:earth:orbit')).map(({ edge }) => edge.deltaV)).toEqual([3210, 3210])
  })

  it('does not use a new high pair to erase a pending encounter arrival', () => {
    const result = findLowestCostPath(graph, 'rss:mars:elliptical', 'rss:venus:elliptical', { pendingParkingBodyId: 'rss:mars' })
    expect(result.status).toBe('success')
    if (result.status !== 'success') throw new Error(result.message)
    expect(result.nodeIds).toEqual(['rss:mars:elliptical', 'rss:mars:orbit', 'rss:venus:elliptical'])
    expect(result.legs[0]!.edge.deltaV).toBe(expected.get('rss:mars:elliptical->rss:mars:orbit'))
  })

  it('does not discount bundled Venus high captures when ideal atmospheric capture is selected', () => {
    const from = 'rss:mercury:elliptical'
    const to = 'rss:venus:elliptical'
    const edge = edges.get(`direct:${from}->${to}`)!
    const assisted = applyAtmosphericAssistance(graph, rssPack, [{ bodyId: 'rss:venus', capture: true, landing: false, landingDeltaV: 0 }])
    expect(assisted.graph.adjacency.get(from)!.find(candidate => candidate.id === edge.id)?.deltaV).toBe(independentHighPair('rss:mercury', 'rss:venus'))
    expect(findLowestCostPath(assisted.graph, from, to)).toMatchObject({ status: 'success', totalDeltaV: edge.deltaV })
  })
})
