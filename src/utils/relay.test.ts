import { describe, expect, it } from 'vitest'
import { calculateRelayPlan, type RelayNetworkInput, type SuccessfulRelayPlan } from './relay'

function example(changes: Partial<RelayNetworkInput> = {}): RelayNetworkInput {
  return {
    body: { radiusM: 600_000, gravitationalParameter: 3.5316e12, atmosphereHeightM: 70_000, sphereOfInfluenceM: 84_159_286.5 },
    hasSurface: true, satelliteCount: 3, altitudeM: 800_000,
    relayPower: 5e6, clientPower: 5e5, dsnPower: 250e9, rangeMultiplier: 1,
    occlusionFactor: 1, phaseDeg: 0, stationLongitudeDeg: 0, safetyMarginM: 10_000,
    deploymentMode: 'lower', ...changes,
  }
}

function success(input = example()): SuccessfulRelayPlan {
  const result = calculateRelayPlan(input)
  if (result.status !== 'success') throw new Error(result.errors.join('\n'))
  return result
}

describe('circular relay network', () => {
  it('matches independently calculated Kerbin geometry, single-antenna ranges and orbit timing', () => {
    const result = success()
    expect(result.orbitRadiusM).toBe(1_400_000)
    expect(result.neighborDistanceM).toBeCloseTo(2_424_871.130596428, 6)
    expect(result.neighborClearanceM).toBeCloseTo(100_000, 6)
    expect(result.orbitalPeriodS).toBeCloseTo(5538.423582207606, 5)
    expect(result.neighborRangeM).toBe(5_000_000)
    expect(result.surfaceRangeM).toBeCloseTo(1_581_138.8300841898, 6)
    expect(result.dsnRangeM).toBeCloseTo(1_118_033_988.749895, 5)
    expect(result.ringLinkStatus).toBe('available')
    expect(result.equatorialCoverageFraction).toBe(1)
    expect(result.coverageStatus).toBe('full')
  })

  it('places every relay at the same orbital radius and connects each unique neighbor pair once', () => {
    for (const count of [2, 3, 5, 12]) {
      const result = success(example({ satelliteCount: count }))
      expect(result.satellites).toHaveLength(count)
      expect(result.neighborLinks).toHaveLength(count === 2 ? 1 : count)
      expect(new Set(result.neighborLinks.map(link => [link.fromIndex, link.toIndex].sort((a, b) => a - b).join(':'))).size)
        .toBe(count === 2 ? 1 : count)
      for (const satellite of result.satellites) expect(Math.hypot(satellite.x, satellite.y)).toBeCloseTo(result.orbitRadiusM, 6)
    }
  })

  it('keeps two opposite relays blocked even with arbitrarily strong antennas', () => {
    const result = success(example({ satelliteCount: 2, relayPower: 1e18, occlusionFactor: .75 }))
    expect(result.ringLinkStatus).toBe('blocked')
    expect(result.neighborLinks[0]?.status).toBe('blocked')
    expect(result.neighborClearanceM).toBe(-450_000)
  })

  it('marks an exactly tangent ring and its exact equatorial coverage boundary as marginal', () => {
    const result = success(example({ altitudeM: 600_000 }))
    expect(result.neighborClearanceM).toBeCloseTo(0, 6)
    expect(result.ringLinkStatus).toBe('marginal')
    expect(result.equatorialCoverageFraction).toBeCloseTo(1, 12)
    expect(result.coverageStatus).toBe('marginal')
    expect(success(example({ altitudeM: 599_000 })).ringLinkStatus).toBe('blocked')
    expect(success(example({ altitudeM: 601_000 })).ringLinkStatus).toBe('available')
  })

  it('distinguishes zero-signal antenna limits from robust and out-of-range links', () => {
    const separation = success().neighborDistanceM
    expect(success(example({ relayPower: separation })).ringLinkStatus).toBe('marginal')
    expect(success(example({ relayPower: separation * .999 })).ringLinkStatus).toBe('out-of-range')
    expect(success(example({ relayPower: separation * 1.001 })).ringLinkStatus).toBe('available')
  })

  it('scales each endpoint-pair range once with the difficulty multiplier', () => {
    const normal = success()
    const doubled = success(example({ rangeMultiplier: 2 }))
    expect(doubled.neighborRangeM).toBe(normal.neighborRangeM * 2)
    expect(doubled.surfaceRangeM).toBe(normal.surfaceRangeM * 2)
    expect(doubled.dsnRangeM).toBe(normal.dsnRangeM * 2)
    expect(doubled.orbitalPeriodS).toBe(normal.orbitalPeriodS)
  })

  it('does not claim a surface station or coverage for gas giants', () => {
    const result = success(example({ hasSurface: false }))
    expect(result.surfaceHalfAngleRad).toBeNull()
    expect(result.equatorialCoverageFraction).toBeNull()
    expect(result.coverageStatus).toBeNull()
    expect(result.stationLinks).toEqual([])
    expect(result.neighborLinks).toHaveLength(3)
    expect(result.deployment.status).toBe('clear')
  })

  it('reports no equatorial coverage when the client antenna cannot reach even the orbit directly overhead', () => {
    const result = success(example({ clientPower: 1 }))
    expect(result.surfaceHalfAngleRad).toBe(0)
    expect(result.equatorialCoverageFraction).toBe(0)
    expect(result.coverageStatus).toBe('none')
    expect(result.stationLinks[0]?.status).toBe('out-of-range')
  })

  it('treats a valid outward ground link as available even though its surface endpoint has zero limb clearance', () => {
    const result = success()
    expect(result.stationLinks[0]?.clearanceM).toBeCloseTo(0, 6)
    expect(result.stationLinks[0]?.distanceM).toBe(800_000)
    expect(result.stationLinks[0]?.status).toBe('available')
    expect(result.stationLinks[1]?.status).toBe('blocked')
  })

  it('uses the actual ground endpoint when deciding a full-radius horizon boundary', () => {
    const horizonDegrees = Math.acos(600_000 / 1_400_000) * 180 / Math.PI
    const atHorizon = success(example({ stationLongitudeDeg: horizonDegrees }))
    expect(atHorizon.stationLinks[0]?.status).toBe('marginal')
    expect(success(example({ stationLongitudeDeg: horizonDegrees - .001 })).stationLinks[0]?.status).toBe('available')
    expect(success(example({ stationLongitudeDeg: horizonDegrees + .001 })).stationLinks[0]?.status).toBe('blocked')
  })

  it('uses both endpoint angles for game occlusion instead of replacing the body radius everywhere', () => {
    const normal = success(example({ altitudeM: 500_000, occlusionFactor: .75, stationLongitudeDeg: 90 }))
    const strict = success(example({ altitudeM: 500_000, stationLongitudeDeg: 90 }))
    expect(normal.surfaceHalfAngleRad).toBeCloseTo(Math.acos(450_000 / 1_100_000) + Math.acos(.75), 12)
    expect(normal.ringLinkStatus).toBe('available')
    expect(normal.coverageStatus).toBe('full')
    expect(normal.stationLinks[0]?.status).toBe('available')
    expect(strict.ringLinkStatus).toBe('blocked')
    expect(strict.coverageStatus).toBe('partial')
    expect(strict.stationLinks[0]?.status).toBe('blocked')
  })

  it('preserves geometry under a full rotation and under equal shifts of relays and station', () => {
    const original = success(example({ phaseDeg: 17, stationLongitudeDeg: 41 }))
    const fullRotation = success(example({ phaseDeg: 377, stationLongitudeDeg: 401 }))
    const shifted = success(example({ phaseDeg: 63, stationLongitudeDeg: 87 }))
    expect(fullRotation).toEqual(original)
    for (const [index, link] of original.stationLinks.entries()) {
      expect(shifted.stationLinks[index]?.distanceM).toBeCloseTo(link.distanceM, 6)
      expect(shifted.stationLinks[index]?.status).toBe(link.status)
    }
    expect(shifted.equatorialCoverageFraction).toBe(original.equatorialCoverageFraction)
  })

  it('changes station contact in partial coverage gaps while leaving aggregate equatorial coverage invariant', () => {
    const overhead = success(example({ altitudeM: 100_000 }))
    const gap = success(example({ altitudeM: 100_000, phaseDeg: 60 }))
    expect(overhead.coverageStatus).toBe('partial')
    expect(overhead.stationLinks.some(link => link.status === 'available')).toBe(true)
    expect(gap.stationLinks.some(link => link.status === 'available')).toBe(false)
    expect(gap.equatorialCoverageFraction).toBe(overhead.equatorialCoverageFraction)
  })
})

describe('resonant carrier deployment', () => {
  it('matches the independent lower-carrier Kerbin example and separates carrier and per-relay burns', () => {
    const result = success().deployment
    expect(result.mode).toBe('lower')
    expect(result.carrierPeriodS).toBeCloseTo(3692.282388138404, 5)
    expect(result.periapsisAltitudeM).toBeCloseTo(136_799.91943281563, 5)
    expect(result.apoapsisAltitudeM).toBe(800_000)
    expect(result.injectionDeltaVMps).toBeCloseTo(269.306685329415, 5)
    expect(result.relayCircularizationDeltaVMps).toBe(result.injectionDeltaVMps)
    expect(result.deploymentDurationS).toBe(result.carrierPeriodS * 2)
    expect(result.status).toBe('clear')
  })

  it('matches an independently calculated higher-carrier alternative', () => {
    const result = success(example({ deploymentMode: 'higher' })).deployment
    expect(result.carrierPeriodS).toBeCloseTo(7384.564776276809, 5)
    expect(result.periapsisAltitudeM).toBe(800_000)
    expect(result.apoapsisAltitudeM).toBeCloseTo(1_391_958.4399533274, 5)
    expect(result.injectionDeltaVMps).toBeCloseTo(133.019840051071, 5)
    expect(result.status).toBe('clear')
  })

  it.each(['lower', 'higher'] as const)('releases all relays into equal final spacing with a %s carrier', mode => {
    const result = success(example({ satelliteCount: 5, deploymentMode: mode }))
    const deploymentTime = result.deployment.deploymentDurationS
    const finalAngles = Array.from({ length: 5 }, (_, index) => {
      const releasedAt = index * result.deployment.carrierPeriodS
      return ((deploymentTime - releasedAt) / result.orbitalPeriodS * 360) % 360
    }).sort((a, b) => a - b)
    for (let index = 0; index < 5; index++) expect(finalAngles[index]).toBeCloseTo(index * 72, 8)
  })

  it('rejects a carrier intersecting the atmosphere while keeping valid network geometry available', () => {
    const result = success(example({ altitudeM: 600_000 }))
    expect(result.deployment.periapsisAltitudeM).toBeCloseTo(31_542.788085270557, 5)
    expect(result.deployment.status).toBe('blocked')
    expect(result.deployment.issues.join(' ')).toContain('atmosphere')
    expect(result.orbitalPeriodS).toBeGreaterThan(0)
    expect(success(example({ altitudeM: 600_000, deploymentMode: 'higher' })).deployment.status).toBe('clear')
  })

  it('checks an upper carrier against the SOI independently of a valid target orbit', () => {
    const input = example({ deploymentMode: 'higher' })
    input.body.sphereOfInfluenceM = 1_900_000
    const result = success(input)
    expect(result.deployment.status).toBe('blocked')
    expect(result.deployment.issues.join(' ')).toContain('sphere of influence')
  })

  it('uses the requested clearance rather than calling every vacuum periapsis safe', () => {
    const result = success(example({ safetyMarginM: 70_000 }))
    expect(result.deployment.status).toBe('blocked')
    expect(result.deployment.issues.join(' ')).toContain('safety margin')
  })

  it('marks missing SOI bounds unchecked without hiding a known atmospheric collision', () => {
    const input = example()
    delete input.body.sphereOfInfluenceM
    const unchecked = success(input)
    expect(unchecked.deployment.status).toBe('unchecked')
    expect(unchecked.warnings.join(' ')).toContain('unchecked')
    expect(unchecked.deployment.issues.join(' ')).toContain('No sphere of influence')
    input.altitudeM = 600_000
    expect(success(input).deployment.status).toBe('blocked')
  })
})

describe('relay input validation', () => {
  it.each([null, [], {}, { body: null }])('handles malformed runtime shapes %j without throwing', raw => {
    expect(calculateRelayPlan(raw as unknown as RelayNetworkInput).status).toBe('invalid')
  })

  it.each([
    { satelliteCount: 1 }, { satelliteCount: 13 }, { satelliteCount: 3.5 },
    { altitudeM: 0 }, { relayPower: 0 }, { clientPower: -1 }, { dsnPower: 1e19 },
    { rangeMultiplier: 0 }, { rangeMultiplier: 101 }, { occlusionFactor: 0 },
    { occlusionFactor: 1.1 }, { safetyMarginM: -1 }, { phaseDeg: Infinity },
    { stationLongitudeDeg: NaN }, { hasSurface: 'yes' }, { deploymentMode: 'sideways' },
  ])('rejects invalid network choices %j', changes => {
    expect(calculateRelayPlan(example(changes as Partial<RelayNetworkInput>)).status).toBe('invalid')
  })

  it('rejects circular orbits inside clearance limits or outside the SOI', () => {
    expect(calculateRelayPlan(example({ altitudeM: 80_000 }))).toMatchObject({ status: 'invalid', errors: [expect.stringContaining('safety margin')] })
    const outside = example()
    outside.body.sphereOfInfluenceM = 1_400_000
    expect(calculateRelayPlan(outside)).toMatchObject({ status: 'invalid', errors: [expect.stringContaining('sphere of influence')] })
  })

  it.each([
    { radiusM: 0 }, { gravitationalParameter: 0 }, { atmosphereHeightM: -1 },
    { sphereOfInfluenceM: 500_000 }, { radiusM: NaN }, { gravitationalParameter: Infinity },
  ])('rejects invalid physical body data %j', changes => {
    const input = example()
    Object.assign(input.body, changes)
    expect(calculateRelayPlan(input).status).toBe('invalid')
  })

  it('rejects finite inputs whose derived orbit overflows instead of returning NaN or Infinity', () => {
    const input = example()
    input.body.gravitationalParameter = Number.MIN_VALUE
    expect(calculateRelayPlan(input)).toMatchObject({ status: 'invalid', errors: [expect.stringContaining('numerical range')] })
  })

  it('does not mutate either the supplied body or network input', () => {
    const input = example()
    const before = structuredClone(input)
    Object.freeze(input.body)
    Object.freeze(input)
    success(input)
    expect(input).toEqual(before)
  })
})
