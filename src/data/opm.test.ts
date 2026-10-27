import { describe, expect, it } from 'vitest'
import { buildGraph } from '../utils/buildGraph'
import { findLowestCostPath } from '../utils/findRoute'
import { validatePlanetPack } from '../utils/validatePlanetPack'
import { opmPack } from './opm'
import { planetPacks } from './planetPacks'
import { stockPack } from './stock'
import { opmCentralMu, opmHomeReference, opmReferences } from './opmReference'

describe('the reviewed OPM planning pack', () => {
  it('registers packs by metadata without changing shared stock IDs', () => {
    expect(planetPacks.map(pack => pack.id)).toEqual(['stock', 'opm', 'rss'])
    expect(planetPacks.find(pack => pack.id === 'opm')).toBe(opmPack)
    expect(opmPack.nodes.filter(node => node.id.startsWith('stock:')).map(node => node.id))
      .toEqual(stockPack.nodes.map(node => node.id))
  })

  it('covers 32 bodies, 96 states, and 190 sourced directed maneuvers', () => {
    expect(validatePlanetPack(opmPack)).toEqual([])
    expect(opmPack.bodies).toHaveLength(32)
    expect(opmPack.nodes).toHaveLength(96)
    expect(opmPack.maneuvers).toHaveLength(190)
    expect(opmPack.bodies.filter(body => body.kind === 'planet')).toHaveLength(10)
    expect(opmPack.bodies.filter(body => body.kind === 'moon')).toHaveLength(21)
    for (const edge of opmPack.maneuvers) {
      expect(opmPack.sources.some(source => source.id === edge.sourceId), edge.id).toBe(true)
      expect(edge.assumptions.length, edge.id).toBeGreaterThan(0)
    }
  })

  it('matches official hierarchy, nested moon, atmospheres, and gas-giant surface restrictions', () => {
    const byId = new Map(opmPack.bodies.map(body => [body.id, body]))
    expect(byId.get('stock:eeloo')).toMatchObject({ kind: 'moon', parentId: 'opm:sarnus' })
    expect(byId.get('opm:tal')).toMatchObject({ kind: 'moon', parentId: 'opm:wal' })
    expect(byId.get('opm:karen')).toMatchObject({ kind: 'moon', parentId: 'opm:plock' })
    for (const id of ['stock:jool', 'opm:sarnus', 'opm:urlum', 'opm:neidon']) {
      expect(byId.get(id)).toMatchObject({ hasSurface: false, hasAtmosphere: true })
      expect(opmPack.nodes.some(node => node.bodyId === id && node.kind === 'surface')).toBe(false)
    }
    expect(byId.get('opm:tekto')?.hasAtmosphere).toBe(true)
    expect(byId.get('opm:thatmo')?.hasAtmosphere).toBe(true)
    expect(byId.get('opm:slate')?.hasAtmosphere).toBe(false)
    expect(byId.get('opm:nissee')?.hasAtmosphere).toBe(false)
  })

  it('does not mutate or share retained stock data records', () => {
    expect(stockPack.bodies.find(body => body.id === 'stock:eeloo'))
      .toMatchObject({ parentId: 'stock:kerbol', kind: 'planet' })
    expect(stockPack.maneuvers.find(edge => edge.from === 'stock:eeloo:orbit' && edge.to === 'stock:eeloo:surface')?.deltaV).toBe(620)
    const oldEelooTransfer = stockPack.maneuvers.find(edge => edge.from === 'stock:kerbin:encounter' && edge.to === 'stock:eeloo:encounter')
    expect(oldEelooTransfer?.deltaV).toBe(1140)
    expect(opmPack.maneuvers.some(edge => edge.id === oldEelooTransfer?.id)).toBe(false)
    for (const body of stockPack.bodies) expect(opmPack.bodies.find(item => item.id === body.id)).not.toBe(body)
    for (const node of stockPack.nodes) expect(opmPack.nodes.find(item => item.id === node.id)).not.toBe(node)
    for (const edge of stockPack.maneuvers) {
      const retained = opmPack.maneuvers.find(item => item.id === edge.id)
      if (retained) {
        expect(retained).not.toBe(edge)
        expect(retained.assumptions).not.toBe(edge.assumptions)
      }
    }
  })

  it.each([
    ['opm:sarnus:orbit', 7470],
    ['opm:hale:surface', 8395],
    ['opm:ovok:surface', 8580],
    ['stock:eeloo:surface', 9429],
    ['opm:slate:surface', 11510],
    ['opm:tekto:surface', 11927],
    ['opm:urlum:orbit', 7117],
    ['opm:polta:surface', 8742],
    ['opm:priax:surface', 8297],
    ['opm:wal:surface', 9661],
    ['opm:tal:surface', 9103],
    ['opm:neidon:orbit', 7206],
    ['opm:thatmo:surface', 9677],
    ['opm:nissee:surface', 8441],
    ['opm:plock:surface', 7404],
    ['opm:karen:surface', 7403],
  ])('sums audited nominal orbital and declared atmospheric segments to %s as %i m/s', (destination, expected) => {
    const route = findLowestCostPath(buildGraph(opmPack), 'stock:kerbin:surface', destination)
    expect(route.status).toBe('success')
    if (route.status !== 'success') throw new Error(route.message)
    expect(route.totalDeltaV).toBe(expected)
    expect(route.legs.at(-1)?.cumulativeDeltaV).toBe(expected)
  })

  it('keeps OPM moon transfers attached to their low-orbit parent references', () => {
    expect(opmPack.maneuvers.find(edge => edge.to === 'stock:eeloo:encounter' && edge.kind === 'transfer'))
      .toMatchObject({ from: 'opm:sarnus:orbit', deltaV: 881, sourceId: 'opm-analytic-2.2.12' })
    expect(opmPack.maneuvers.find(edge => edge.to === 'opm:tal:encounter' && edge.kind === 'transfer'))
      .toMatchObject({ from: 'opm:wal:orbit', deltaV: 366 })
    expect(opmPack.maneuvers.find(edge => edge.from === 'stock:eeloo:orbit' && edge.to === 'stock:eeloo:surface')?.deltaV).toBe(609)
  })

  it('sources all recalculated OPM maneuvers while retaining only the declared atmospheric allowances', () => {
    const analytic = opmPack.maneuvers.filter(edge => edge.sourceId === 'opm-analytic-2.2.12')
    expect(analytic).toHaveLength(94)
    expect(analytic.every(edge => edge.assumptions.join(' ').includes('Analytic OPM 2.2.12'))).toBe(true)
    const historical = opmPack.maneuvers.filter(edge => edge.sourceId === 'kowgan-opm-1.8.1')
    expect(historical.map(({ from, to, deltaV }) => ({ from, to, deltaV }))).toEqual([
      { from: 'opm:tekto:surface', to: 'opm:tekto:orbit', deltaV: 2600 },
      { from: 'opm:tekto:orbit', to: 'opm:tekto:surface', deltaV: 2600 },
      { from: 'opm:thatmo:surface', to: 'opm:thatmo:orbit', deltaV: 950 },
      { from: 'opm:thatmo:orbit', to: 'opm:thatmo:surface', deltaV: 950 },
    ])
    for (const edge of historical) {
      expect(edge.assumptions.join(' ')).toContain('not calibrated')
      expect(edge.assumptions.join(' ')).toContain('nor an upper bound')
    }
    expect(opmPack.dataNotice).toBe('Analytic estimates')
    expect(opmPack.version).toBe('2.2.12-analytic.1')
    expect(opmPack.description).toContain('historical atmospheric surface allowances')
    expect(opmPack.assumptions.join(' ')).toContain('Parking-orbit orientation is unconstrained')
    expect(opmPack.assumptions.join(' ')).toContain('Eccentricity and changing orbital distances are not propagated')
    expect(opmPack.assumptions.join(' ')).toContain('SigmaBinary')
  })

  it('charges the Kerbin parking-orbit departure once, rather than adding its escape segment twice', () => {
    const escape = stockPack.maneuvers.find(edge => edge.from === 'stock:kerbin:orbit' && edge.to === 'stock:kerbin:encounter')!
    expect(escape.deltaV).toBe(950)
    for (const [bodyId, incrementalBudget] of [['opm:sarnus', 1305], ['opm:urlum', 1535], ['opm:neidon', 1628], ['opm:plock', 1665]] as const) {
      const reference = opmReferences.find(row => row.bodyId === bodyId)!
      // Independent vis-viva calculation, without the orbital-budget utility.
      const r1 = opmHomeReference.semiMajorAxisM
      const r2 = reference.semiMajorAxisM
      const a = (r1 + r2) / 2
      const vInfinity = Math.sqrt(opmCentralMu * (2 / r1 - 1 / a)) - Math.sqrt(opmCentralMu / r1)
      const rParking = opmHomeReference.radiusM + opmHomeReference.parkingAltitudeM
      const muHome = opmHomeReference.gravitationalParameter
      const fullBurn = Math.sqrt(vInfinity ** 2 + 2 * muHome / rParking) - Math.sqrt(muHome / rParking)
      const outward = opmPack.maneuvers.find(edge => edge.from === 'stock:kerbin:encounter' && edge.to === `${bodyId}:encounter`)!
      const inward = opmPack.maneuvers.find(edge => edge.to === 'stock:kerbin:encounter' && edge.from === `${bodyId}:encounter`)!
      expect(outward.deltaV).toBe(incrementalBudget)
      expect(inward.deltaV).toBe(incrementalBudget)
      expect(escape.deltaV + outward.deltaV).toBe(Math.ceil(fullBurn))
    }
  })

  it('uses reproducible bound ellipses whose raw capture and circularization sum to the direct parking burn', () => {
    for (const bodyId of ['opm:sarnus', 'opm:urlum', 'opm:neidon', 'opm:plock']) {
      const reference = opmReferences.find(row => row.bodyId === bodyId)!
      const parkingRadius = reference.radiusM + reference.parkingAltitudeM
      const apoapsisRadius = reference.sphereOfInfluenceM / 2
      expect(apoapsisRadius).toBeGreaterThan(parkingRadius)
      expect(apoapsisRadius).toBeLessThan(reference.sphereOfInfluenceM)
      const solarTransferA = (opmHomeReference.semiMajorAxisM + reference.semiMajorAxisM) / 2
      const vBody = Math.sqrt(opmCentralMu / reference.semiMajorAxisM)
      const vTransfer = Math.sqrt(opmCentralMu * (2 / reference.semiMajorAxisM - 1 / solarTransferA))
      const vInfinity = Math.sqrt(vBody ** 2 + vTransfer ** 2 - 2 * vBody * vTransfer * Math.cos(reference.inclinationDeg * Math.PI / 180))
      const ellipseA = (parkingRadius + apoapsisRadius) / 2
      const circularSpeed = Math.sqrt(reference.gravitationalParameter / parkingRadius)
      const ellipseSpeed = Math.sqrt(reference.gravitationalParameter * (2 / parkingRadius - 1 / ellipseA))
      const hyperbolicSpeed = Math.sqrt(vInfinity ** 2 + 2 * reference.gravitationalParameter / parkingRadius)
      const capture = hyperbolicSpeed - ellipseSpeed
      const circularization = ellipseSpeed - circularSpeed
      expect(capture + circularization).toBeCloseTo(hyperbolicSpeed - circularSpeed, 9)
      const captureEdge = opmPack.maneuvers.find(edge => edge.from === `${bodyId}:encounter` && edge.to === `${bodyId}:elliptical`)!
      const circularizationEdge = opmPack.maneuvers.find(edge => edge.from === `${bodyId}:elliptical` && edge.to === `${bodyId}:orbit`)!
      expect(captureEdge.deltaV).toBe(Math.ceil(capture))
      expect(circularizationEdge.deltaV).toBe(Math.ceil(circularization))
      expect(captureEdge.deltaV + circularizationEdge.deltaV).toBeGreaterThanOrEqual(Math.ceil(hyperbolicSpeed - circularSpeed))
      expect(captureEdge.deltaV + circularizationEdge.deltaV).toBeLessThanOrEqual(Math.ceil(hyperbolicSpeed - circularSpeed) + 1)
      expect(captureEdge.assumptions.join(' ')).toContain('0.5 × nominal SOI')
    }
  })

  it('includes the actual retrograde Thatmo inclination in encounter speed instead of using a prograde surrogate', () => {
    // Independent source constants: Neidon R=2145km, geeASL=.314;
    // Thatmo a=32300.895km, i=161.1°, R=286km, geeASL=.232.
    const parentMu = 9.80665 * .314 * 2_145_000 ** 2
    const departureRadius = 2_145_000 + 280_000
    const arrivalRadius = 32_300_895
    const transferA = (departureRadius + arrivalRadius) / 2
    const vBody = Math.sqrt(parentMu / arrivalRadius)
    const vTransfer = Math.sqrt(parentMu * (2 / arrivalRadius - 1 / transferA))
    const vInfinity = Math.sqrt(vBody ** 2 + vTransfer ** 2 - 2 * vBody * vTransfer * Math.cos(161.1 * Math.PI / 180))
    expect(vInfinity).toBeCloseTo(900.0270197114486, 7)
    const mu = 9.80665 * .232 * 286_000 ** 2
    const parkingRadius = 336_000
    const burn = Math.sqrt(vInfinity ** 2 + 2 * mu / parkingRadius) - Math.sqrt(mu / parkingRadius)
    const progradeBurn = Math.sqrt((vBody - vTransfer) ** 2 + 2 * mu / parkingRadius) - Math.sqrt(mu / parkingRadius)
    expect(burn).toBeCloseTo(640.6176206613915, 7)
    expect(progradeBurn).toBeCloseTo(387.0475711756827, 7)
    const edge = opmPack.maneuvers.find(edge => edge.from === 'opm:thatmo:encounter' && edge.to === 'opm:thatmo:orbit')!
    expect(edge.deltaV).toBe(641)
    expect(edge.deltaV).toBe(Math.ceil(burn))
    expect(edge.assumptions.join(' ')).toContain('source inclination 161.1°')
  })

  it('provides finite outbound and return routes for every supported state', () => {
    const graph = buildGraph(opmPack)
    for (const node of opmPack.nodes) {
      for (const [from, to] of [['stock:kerbin:surface', node.id], [node.id, 'stock:kerbin:surface']] as const) {
        const route = findLowestCostPath(graph, from, to)
        expect(route.status, `${from} → ${to}`).toBe('success')
        if (route.status === 'success') expect(Number.isFinite(route.totalDeltaV)).toBe(true)
      }
    }
  })

  it('retains the homeworld parking reset between distinct planetary encounter references', () => {
    const route = findLowestCostPath(buildGraph(opmPack), 'opm:sarnus:encounter', 'opm:urlum:encounter')
    expect(route.status).toBe('success')
    if (route.status !== 'success') throw new Error(route.message)
    expect(route.nodeIds).toEqual([
      'opm:sarnus:encounter', 'stock:kerbin:encounter', 'stock:kerbin:orbit',
      'stock:kerbin:encounter', 'opm:urlum:encounter',
    ])
    expect(route.totalDeltaV).toBe(1305 + 950 + 950 + 1535)
  })
})
