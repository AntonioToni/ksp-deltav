import { describe, expect, it } from 'vitest'
import type { InterplanetarySignalInput } from '../types/interplanetary'
import { getRadioProfile } from '../data/radioProfiles'
import { calculateAntennaArray } from './antennaArray'
import { calculateInterplanetarySignal, commNetSignalStrength } from './interplanetary'

function example(changes: Partial<InterplanetarySignalInput> = {}): InterplanetarySignalInput {
  return {
    orbitRadiusAM: 13_599_840_256,
    orbitRadiusBM: 20_726_155_264,
    centralRadiusM: 261_600_000,
    powerA: 100_000_000_000,
    powerB: 100_000_000_000,
    rangeMultiplier: 1,
    occlusionFactor: 1,
    phaseDeg: 90,
    ...changes,
  }
}

function success(input = example()) {
  const result = calculateInterplanetarySignal(input)
  if (result.status !== 'success') throw new Error(result.errors.join('\n'))
  return result
}

function near(actual: number, expected: number, relativeTolerance = 2e-12, absoluteTolerance = 1e-5) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(Math.max(absoluteTolerance, Math.abs(expected) * relativeTolerance))
}

// Independent law-of-cosines and perpendicular-altitude reference. The foot
// lies inside the segment only when both endpoint projections point inward;
// otherwise the closest endpoint, not the infinite line, limits clearance.
function geometryOracle(input: InterplanetarySignalInput) {
  const angle = input.phaseDeg * Math.PI / 180
  const a = input.orbitRadiusAM
  const b = input.orbitRadiusBM
  const cosine = Math.cos(angle)
  const distance = Math.sqrt(Math.max(0, a * a + b * b - 2 * a * b * cosine))
  const footIsInside = cosine <= Math.min(a / b, b / a)
  const closestRadius = distance === 0 || !footIsInside
    ? Math.min(a, b) : a * b * Math.abs(Math.sin(angle)) / distance
  return { distance, clearance: closestRadius - input.centralRadiusM * input.occlusionFactor }
}

describe('stock CommNet signal curve', () => {
  it.each([
    [0, 1], [.25, .84375], [.5, .5], [.75, .15625], [1, 0], [1.5, 0],
  ])('uses the smoothstep curve at distance/range %s', (ratio, expected) => {
    expect(commNetSignalStrength(ratio * 100_000, 100_000)).toBe(expected)
  })

  it('is continuous and nonincreasing through the exact range boundary', () => {
    let previous = 1
    for (let step = 0; step <= 200; step++) {
      const strength = commNetSignalStrength(step, 100)
      expect(strength).toBeGreaterThanOrEqual(0)
      expect(strength).toBeLessThanOrEqual(previous)
      previous = strength
    }
    expect(commNetSignalStrength(100 - 1e-6, 100)).toBeGreaterThan(0)
    expect(commNetSignalStrength(100, 100)).toBe(0)
  })

  it.each([
    [-1, 10], [NaN, 10], [Infinity, 10], [0, 0], [1, -1], [1, NaN], [1, Infinity],
  ])('rejects invalid standalone strength inputs (%s, %s)', (distance, range) => {
    expect(() => commNetSignalStrength(distance, range)).toThrow(RangeError)
  })
})

describe('interplanetary distance and strength references', () => {
  it.each([
    { phaseDeg: 0, distance: 7_126_315_008, strength: .985488501 },
    { phaseDeg: 90, distance: 24_789_698_808.500137, strength: .846109236 },
    { phaseDeg: 180, distance: 34_325_995_520, strength: .727408663 },
  ])('matches the independent Kerbin–Duna reference at $phaseDeg degrees', ({ phaseDeg, distance, strength }) => {
    const result = success(example({ phaseDeg }))
    near(result.distanceM, distance)
    expect(result.maximumRangeM).toBe(100_000_000_000)
    expect(result.rangeStrength).toBeCloseTo(strength, 8)
    expect(result.signalStrength).toBe(phaseDeg === 180 ? 0 : result.rangeStrength)
    expect(result.linkStatus).toBe(phaseDeg === 180 ? 'blocked' : 'available')
  })

  it('reports a range-only envelope separately from actual stellar occlusion', () => {
    const result = success(example({ phaseDeg: 180, powerA: 1e15, powerB: 1e15 }))
    expect(result.minimumDistanceM).toBe(7_126_315_008)
    expect(result.maximumDistanceM).toBe(34_325_995_520)
    expect(result.bestRangeStrength).toBeGreaterThan(result.worstRangeStrength)
    expect(result.worstRangeStrength).toBeGreaterThan(.999999)
    expect(result.rangeStrength).toBe(result.worstRangeStrength)
    expect(result.occluded).toBe(true)
    expect(result.signalStrength).toBe(0)
    expect(result.linkStatus).toBe('blocked')
    near(result.centralClearanceM, -261_600_000)
  })

  it('does not replace a nearest viable RA-15 link with an all-distance coverage claim', () => {
    const closest = success(example({ powerA: 15e9, powerB: 15e9, phaseDeg: 0 }))
    const quadrature = success(example({ powerA: 15e9, powerB: 15e9, phaseDeg: 90 }))
    expect(closest.bestRangeStrength).toBeCloseTo(.5373375768, 9)
    expect(closest.worstRangeStrength).toBe(0)
    expect(closest.linkStatus).toBe('available')
    expect(quadrature.linkStatus).toBe('out-of-range')
    expect(quadrature.occluded).toBe(false)
    expect(quadrature.signalStrength).toBe(0)
  })

  it('matches independent law-of-cosines and limb geometry through a full phase sweep', () => {
    const configurations = [
      example(),
      example({ orbitRadiusAM: 10_000_000, orbitRadiusBM: 20_000_000, centralRadiusM: 5_000_000 }),
      example({ orbitRadiusAM: 700_000_000_000, orbitRadiusBM: 150_000_000_000, centralRadiusM: 696_342_000, occlusionFactor: .75 }),
    ]
    for (const configuration of configurations) {
      for (let phaseDeg = 0; phaseDeg <= 360; phaseDeg += 5) {
        const input = { ...configuration, phaseDeg }
        const result = success(input)
        const expected = geometryOracle(input)
        near(result.distanceM, expected.distance)
        near(result.centralClearanceM, expected.clearance)
        near(Math.hypot(result.pointA.x, result.pointA.y), input.orbitRadiusAM)
        near(Math.hypot(result.pointB.x, result.pointB.y), input.orbitRadiusBM)
        const definitelyBlocked = expected.clearance < -Math.max(1e-3, input.centralRadiusM * 1e-7)
        if (definitelyBlocked) {
          expect(result.occluded).toBe(true)
          expect(result.signalStrength).toBe(0)
          expect(result.linkStatus).toBe('blocked')
        } else if (expected.clearance > Math.max(1e-3, input.centralRadiusM * 1e-7)) {
          expect(result.occluded).toBe(false)
        }
      }
    }
  })

  it('never places the closest segment point farther out than dense ray samples', () => {
    for (const phaseDeg of [0, 45, 90, 135, 150, 175, 180, 225, 315]) {
      const input = example({ orbitRadiusAM: 10e6, orbitRadiusBM: 20e6, centralRadiusM: 5e6, phaseDeg })
      const result = success(input)
      const angle = phaseDeg * Math.PI / 180
      const ax = input.orbitRadiusAM, ay = 0
      const bx = input.orbitRadiusBM * Math.cos(angle), by = input.orbitRadiusBM * Math.sin(angle)
      let sampledRadius = Infinity
      const samples = 1024
      for (let index = 0; index <= samples; index++) {
        const t = index / samples
        sampledRadius = Math.min(sampledRadius, Math.hypot((1 - t) * ax + t * bx, (1 - t) * ay + t * by))
      }
      const analyticRadius = result.centralClearanceM + input.centralRadiusM * input.occlusionFactor
      expect(analyticRadius).toBeLessThanOrEqual(sampledRadius + 1e-6)
      expect(sampledRadius - analyticRadius).toBeLessThanOrEqual(result.distanceM / (2 * samples) + 1e-6)
    }
  })

  it('uses a finite segment rather than falsely blocking same-side endpoints on its infinite line', () => {
    const input = example({ phaseDeg: 0 })
    const result = success(input)
    expect(result.centralClearanceM).toBe(input.orbitRadiusAM - input.centralRadiusM)
    expect(result.linkStatus).toBe('available')
    expect(result.occluded).toBe(false)
  })
})

describe('signal boundaries and invariants', () => {
  it('distinguishes exact limb tangency from clear and blocked neighbors', () => {
    const input = example({ orbitRadiusAM: 10e6, orbitRadiusBM: 20e6, centralRadiusM: 5e6 })
    const tangentDeg = (Math.acos(input.centralRadiusM / input.orbitRadiusAM)
      + Math.acos(input.centralRadiusM / input.orbitRadiusBM)) * 180 / Math.PI
    const tangent = success({ ...input, phaseDeg: tangentDeg })
    near(tangent.centralClearanceM, 0)
    expect(tangent.linkStatus).toBe('marginal')
    expect(tangent.occluded).toBe(false)
    expect(success({ ...input, phaseDeg: tangentDeg - .001 }).linkStatus).toBe('available')
    expect(success({ ...input, phaseDeg: tangentDeg + .001 }).linkStatus).toBe('blocked')
  })

  it('marks the exact zero-strength antenna limit as marginal without claiming a working link', () => {
    const input = example({ orbitRadiusAM: 10e6, orbitRadiusBM: 20e6, centralRadiusM: 1000, phaseDeg: 0, powerA: 10e6, powerB: 10e6 })
    const exact = success(input)
    expect(exact.maximumRangeM).toBe(exact.distanceM)
    expect(exact.linkStatus).toBe('marginal')
    expect(exact.signalStrength).toBe(0)
    expect(success({ ...input, powerA: input.powerA * .999, powerB: input.powerB * .999 }).linkStatus).toBe('out-of-range')
    expect(success({ ...input, powerA: input.powerA * 1.001, powerB: input.powerB * 1.001 }).linkStatus).toBe('available')
  })

  it('keeps occlusion independent of range failure and antenna power', () => {
    for (const power of [1, 15e9, 1e18]) {
      const result = success(example({ phaseDeg: 180, powerA: power, powerB: power }))
      expect(result.linkStatus).toBe('blocked')
      expect(result.occluded).toBe(true)
      expect(result.signalStrength).toBe(0)
    }
  })

  it('changes only the effective limb when the occlusion factor is reduced', () => {
    const input = example({ orbitRadiusAM: 10e6, orbitRadiusBM: 20e6, centralRadiusM: 5e6, phaseDeg: 150 })
    const full = success(input)
    const reduced = success({ ...input, occlusionFactor: .5 })
    expect(full.linkStatus).toBe('blocked')
    expect(reduced.linkStatus).toBe('available')
    expect(reduced.distanceM).toBe(full.distanceM)
    expect(reduced.maximumRangeM).toBe(full.maximumRangeM)
    expect(reduced.rangeStrength).toBe(full.rangeStrength)
    near(reduced.centralClearanceM - full.centralClearanceM, 2.5e6)
  })

  it.each([1e-12, 1e-20, Number.MIN_VALUE])('still blocks exact opposition for a tiny positive occlusion factor %s', occlusionFactor => {
    const input = example({ orbitRadiusAM: 1e10, orbitRadiusBM: 2e10, centralRadiusM: 1e8,
      powerA: 1e15, powerB: 1e15, phaseDeg: 180, occlusionFactor })
    const effectiveRadius = input.centralRadiusM * occlusionFactor
    expect(effectiveRadius).toBeGreaterThan(0)
    // The segment between opposite radial endpoints passes through the origin
    // exactly, even when its positive occluder is below an absolute tolerance.
    const opposite = success(input)
    expect(opposite.centralClearanceM).toBe(-effectiveRadius)
    expect(opposite.rangeStrength).toBeGreaterThan(.99)
    expect(opposite.linkStatus).toBe('blocked')
    expect(opposite.occluded).toBe(true)
    expect(opposite.signalStrength).toBe(0)
    const nearby = success({ ...input, phaseDeg: 179 })
    expect(nearby.centralClearanceM).toBeGreaterThan(0)
    expect(nearby.linkStatus).toBe('available')
    expect(nearby.occluded).toBe(false)
    expect(nearby.signalStrength).toBe(nearby.rangeStrength)
  })

  it('reports underflow instead of treating an unrepresentable effective occluder as absent', () => {
    const input = example({ centralRadiusM: .1, occlusionFactor: Number.MIN_VALUE, phaseDeg: 180 })
    expect(input.centralRadiusM * input.occlusionFactor).toBe(0)
    const result = calculateInterplanetarySignal(input)
    expect(result.status).toBe('invalid')
    if (result.status === 'invalid') expect(result.errors.length).toBeGreaterThan(0)
  })

  it('supports equal-radius and coincident point references without NaN or invented obstruction', () => {
    const coincident = success(example({ orbitRadiusAM: 10e6, orbitRadiusBM: 10e6, centralRadiusM: 1000, phaseDeg: 0 }))
    expect(coincident.distanceM).toBe(0)
    expect(coincident.minimumDistanceM).toBe(0)
    expect(coincident.signalStrength).toBe(1)
    expect(coincident.linkStatus).toBe('available')
    expect(coincident.centralClearanceM).toBe(9_999_000)
    const opposite = success(example({ orbitRadiusAM: 10e6, orbitRadiusBM: 10e6, centralRadiusM: 1000, phaseDeg: 180 }))
    expect(opposite.distanceM).toBe(20e6)
    expect(opposite.linkStatus).toBe('blocked')
  })

  it('is symmetric under phase reflection and exchanging both endpoints', () => {
    for (const phaseDeg of [0, 17, 90, 135, 179, 180, 213, 359]) {
      const input = example({ phaseDeg, powerA: 15e9, powerB: 100e9 })
      const original = success(input)
      const reflected = success({ ...input, phaseDeg: 360 - phaseDeg })
      const exchanged = success({ ...input, orbitRadiusAM: input.orbitRadiusBM, orbitRadiusBM: input.orbitRadiusAM, powerA: input.powerB, powerB: input.powerA })
      for (const other of [reflected, exchanged]) {
        near(other.distanceM, original.distanceM)
        near(other.centralClearanceM, original.centralClearanceM)
        near(other.maximumRangeM, original.maximumRangeM)
        expect(other.signalStrength).toBeCloseTo(original.signalStrength, 12)
        expect(other.linkStatus).toBe(original.linkStatus)
      }
    }
  })

  it('normalizes full and negative phase turns without changing the scenario', () => {
    const original = success(example({ phaseDeg: 37 }))
    expect(success(example({ phaseDeg: 397 }))).toEqual(original)
    expect(success(example({ phaseDeg: -683 }))).toEqual(original)
    expect(success(example({ phaseDeg: 360 })).phaseDeg).toBe(0)
  })

  it('preserves dimensionless strength and status under common distance/power scaling', () => {
    const input = example({ phaseDeg: 117 })
    const original = success(input)
    for (const scale of [.1, 10, 1000]) {
      const scaled = success({ ...input,
        orbitRadiusAM: input.orbitRadiusAM * scale, orbitRadiusBM: input.orbitRadiusBM * scale,
        centralRadiusM: input.centralRadiusM * scale, powerA: input.powerA * scale, powerB: input.powerB * scale,
      })
      near(scaled.distanceM, original.distanceM * scale)
      near(scaled.maximumRangeM, original.maximumRangeM * scale)
      near(scaled.centralClearanceM, original.centralClearanceM * scale)
      expect(scaled.signalStrength).toBeCloseTo(original.signalStrength, 12)
      expect(scaled.linkStatus).toBe(original.linkStatus)
    }
  })

  it('applies the range multiplier once without altering geometry or power', () => {
    const input = example()
    const before = structuredClone(input)
    const normal = success(input)
    const doubled = success({ ...input, rangeMultiplier: 2 })
    expect(doubled.maximumRangeM).toBe(normal.maximumRangeM * 2)
    expect(doubled.distanceM).toBe(normal.distanceM)
    expect(doubled.centralClearanceM).toBe(normal.centralClearanceM)
    expect(doubled.signalStrength).toBeGreaterThan(normal.signalStrength)
    expect(input).toEqual(before)
    expect(success(input)).toEqual(normal)
  })

  it('returns finite bounded outputs at the supported maximum input magnitudes', () => {
    const result = success(example({ orbitRadiusAM: 1e16, orbitRadiusBM: 1e16, centralRadiusM: 1e12, powerA: 1e18, powerB: 1e18, rangeMultiplier: 100, phaseDeg: 90 }))
    for (const value of [result.distanceM, result.maximumRangeM, result.centralClearanceM,
      result.minimumDistanceM, result.maximumDistanceM, result.pointA.x, result.pointB.y]) expect(Number.isFinite(value)).toBe(true)
    for (const value of [result.rangeStrength, result.signalStrength, result.bestRangeStrength, result.worstRangeStrength]) {
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(1)
    }
  })
})

describe('radio presets and final endpoint powers', () => {
  it('uses Stock, bare RSS and RSS+CBK endpoint powers exactly once', () => {
    const ranges: number[] = []
    for (const profileId of ['stock', 'rss', 'rss-cbk'] as const) {
      const profile = getRadioProfile(profileId)
      const antenna = profile.vesselAntennas.find(candidate => candidate.id === 'ra-100')!
      const result = success(example({ powerA: profile.dsnLevels[2]!.power, powerB: antenna.power }))
      ranges.push(result.maximumRangeM)
    }
    near(ranges[0]!, 158_113_883_008.41898)
    near(ranges[1]!, 707_106_781_186.5475)
    near(ranges[2]!, 10_000_000_000_000)
    near(ranges[1]! / ranges[0]!, Math.sqrt(20))
  })

  it('accepts an already-combined vessel array without combining or scaling it again', () => {
    const profile = getRadioProfile('rss')
    const entries = [{ antennaId: 'ra-100', count: 4 }]
    const array = calculateAntennaArray(entries, 'client', profile.vesselAntennas)
    if (array.status !== 'success') throw new Error(array.errors.join('\n'))
    near(array.effectivePower, 2e12 * 4 ** .75)
    const result = success(example({ powerA: array.effectivePower, powerB: 250e9 }))
    near(result.maximumRangeM, Math.sqrt(2e12 * 4 ** .75 * 250e9))
    expect(result.maximumRangeM).toBeGreaterThan(707_106_781_186)
  })

  it('treats custom numbers as final effective powers with no catalog identity', () => {
    const result = success(example({ powerA: 17e9, powerB: 23e9 }))
    near(result.maximumRangeM, Math.sqrt(391) * 1e9)
  })
})

describe('invalid interplanetary inputs', () => {
  it.each([
    { orbitRadiusAM: 0 }, { orbitRadiusAM: -1 }, { orbitRadiusAM: NaN }, { orbitRadiusAM: Infinity }, { orbitRadiusAM: 1e16 + 100 },
    { orbitRadiusBM: 0 }, { orbitRadiusBM: NaN }, { orbitRadiusBM: -Infinity }, { orbitRadiusBM: 1e16 + 100 },
    { centralRadiusM: 0 }, { centralRadiusM: -1 }, { centralRadiusM: NaN }, { centralRadiusM: 1e12 + 1 },
    { powerA: 0 }, { powerA: -1 }, { powerA: NaN }, { powerA: Infinity }, { powerA: 1e18 + 1000 },
    { powerB: 0 }, { powerB: -1 }, { powerB: NaN }, { powerB: 1e18 + 1000 },
    { rangeMultiplier: 0 }, { rangeMultiplier: -1 }, { rangeMultiplier: 101 }, { rangeMultiplier: NaN },
    { occlusionFactor: 0 }, { occlusionFactor: -1 }, { occlusionFactor: 1.1 }, { occlusionFactor: NaN },
    { phaseDeg: NaN }, { phaseDeg: Infinity },
  ])('rejects invalid finite-domain inputs %j', changes => {
    const result = calculateInterplanetarySignal(example(changes))
    expect(result.status).toBe('invalid')
    if (result.status === 'invalid') expect(result.errors.length).toBeGreaterThan(0)
  })

  it('does not put endpoints inside the physical body when its effective occlusion sphere is smaller', () => {
    for (const radius of [5e6, 4e6]) {
      expect(calculateInterplanetarySignal(example({ centralRadiusM: 5e6, orbitRadiusAM: radius, occlusionFactor: .1 })).status).toBe('invalid')
      expect(calculateInterplanetarySignal(example({ centralRadiusM: 5e6, orbitRadiusBM: radius, occlusionFactor: .1 })).status).toBe('invalid')
    }
  })

  it.each([null, undefined, [], '', false, 42, {}, { orbitRadiusAM: 10e6 }])('reports malformed runtime input %j without throwing', raw => {
    const result = calculateInterplanetarySignal(raw as InterplanetarySignalInput)
    expect(result.status).toBe('invalid')
    if (result.status === 'invalid') expect(result.errors.length).toBeGreaterThan(0)
  })
})
