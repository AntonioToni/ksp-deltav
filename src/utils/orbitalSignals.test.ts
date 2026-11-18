import { describe, expect, it } from 'vitest'
import type { OrbitalBody, OrbitalElements, OrbitalSignalInput, OrbitalSignalSuccess } from '../types/orbital'
import { calculateOrbitalSignal, sampleOrbitalSignals } from './orbitalSignals'
import { calculateInterplanetarySignal } from './interplanetary'
import { getEffectiveDsnLevels, getRadioProfile } from '../data/radioProfiles'
import { calculateAntennaArray } from './antennaArray'
import { calculateKerbalismBitrate, resolveKerbalismBaseRate } from './kerbalismBitrate'
import { calibrateKerbalismDamping } from './signalStrength'
import { deriveOrbitalPeriod } from './orbitalGeometry'
import { getSignalOrbitalCatalog } from '../data/signalOrbitalCatalog'
import { stockPack } from '../data/stock'

const orbit = (semiMajorAxisM: number, changes: Partial<OrbitalElements> = {}): OrbitalElements => ({
  semiMajorAxisM, eccentricity: 0, inclinationDeg: 0, longitudeAscendingNodeDeg: 0,
  argumentOfPeriapsisDeg: 0, meanAnomalyAtEpochRad: 0, epochS: 0, periodS: 100,
  ...changes,
})
const bodies: OrbitalBody[] = [
  { id: 'star', parentBodyId: null, radiusM: 1000, gravitationalParameter: 1e18 },
  { id: 'a', parentBodyId: 'star', radiusM: 10, orbit: orbit(1e9) },
  { id: 'b', parentBodyId: 'star', radiusM: 10, orbit: orbit(2e9, { periodS: 200 }) },
]
const base: OrbitalSignalInput = { bodies, bodyAId: 'a', bodyBId: 'b', geometry: 'actual', positionMode: 'phase',
  phaseDeg: 90, powerA: 1e10, powerB: 1e10, rangeMultiplier: 1, occlusionFactor: 1, dampingExponent: 6 }
function success(input: OrbitalSignalInput): OrbitalSignalSuccess {
  const result = calculateOrbitalSignal(input)
  if (result.status !== 'success') throw new Error(result.errors.join('\n'))
  return result
}

describe('orbital signal geometry', () => {
  it.each([0, 13, 90, 179, 180, 215, 270, 360])('matches the legacy circular calculation at %s degrees', phaseDeg => {
    const actual = success({ ...base, phaseDeg })
    const legacy = calculateInterplanetarySignal({ orbitRadiusAM: 1e9, orbitRadiusBM: 2e9, centralRadiusM: 1000,
      powerA: 1e10, powerB: 1e10, rangeMultiplier: 1, occlusionFactor: 1, dampingExponent: 6, phaseDeg })
    if (legacy.status !== 'success') throw new Error(legacy.errors[0])
    expect(actual.distanceM).toBeCloseTo(legacy.distanceM, 5)
    expect(actual.signalStrength).toBeCloseTo(legacy.signalStrength, 14)
    expect(actual.dampedStrength).toBeCloseTo(legacy.dampedStrength, 14)
    expect(actual.linkStatus).toBe(legacy.linkStatus)
  })
  it('uses inclined three-dimensional distance and blocking rather than the projection', () => {
    const inclined = bodies.map(body => body.id === 'b' ? { ...body, orbit: orbit(2e9, { inclinationDeg: 90, argumentOfPeriapsisDeg: 90 }) } : body)
    const result = success({ ...base, bodies: inclined, phaseDeg: 0 })
    expect(result.pointB!.z).toBeCloseTo(2e9, 5)
    expect(result.distanceM).toBeCloseTo(Math.sqrt(5) * 1e9, 5)
    expect(result.occluded).toBe(false)
    const blocker: OrbitalBody = { id: 'blocker', parentBodyId: 'star', radiusM: 1000,
      orbit: orbit(Math.sqrt(1.25) * 1e9, { inclinationDeg: 90, argumentOfPeriapsisDeg: Math.atan2(1, .5) * 180 / Math.PI }) }
    const blocked = success({ ...base, bodies: [...inclined, blocker], phaseDeg: 0 })
    expect(blocked.blockingBodyIds).toContain('blocker')
    expect(blocked.signalStrength).toBe(0)
    expect(blocked.dampedStrength).toBe(0)
  })
  it('composes moons through their parents and cancels missing data above their shared ancestor', () => {
    const local: OrbitalBody[] = [
      { id: 'unknown', parentBodyId: null, radiusM: NaN },
      { id: 'star', parentBodyId: 'unknown', radiusM: 1000 },
      { id: 'planet', parentBodyId: 'star', radiusM: 100, orbit: orbit(1e9) },
      { id: 'moon-a', parentBodyId: 'planet', radiusM: 1, orbit: orbit(1e6) },
      { id: 'moon-b', parentBodyId: 'planet', radiusM: 1, orbit: orbit(2e6) },
    ]
    const result = success({ ...base, bodies: local, bodyAId: 'moon-a', bodyBId: 'moon-b', phaseDeg: 0 })
    expect(result.centerId).toBe('planet')
    expect(result.geometryUsed).toBe('actual')
    expect(result.distanceM).toBe(1e6)
    expect(result.fallbackReasons).toEqual([])
    const cross = success({ ...base, bodies: local, bodyAId: 'planet', bodyBId: 'moon-b', positionMode: 'date', utS: 0 })
    expect(cross.centerId).toBe('planet')
    expect(cross.distanceM).toBe(2e6)
  })
  it('does not overlay unrelated star systems at an invented common origin', () => {
    const disconnected = bodies.map(body => body.id === 'b' ? { ...body, parentBodyId: null } : body)
    expect(calculateOrbitalSignal({ ...base, bodies: disconnected })).toMatchObject({ status: 'invalid', errors: [expect.stringContaining('shared orbital reference')] })
  })
  it('falls back visibly when shape is missing, but never invents a date epoch or phase', () => {
    const incomplete = bodies.map(body => body.id === 'b' ? { ...body, orbit: { semiMajorAxisM: 2e9 } } : body)
    const phase = success({ ...base, bodies: incomplete })
    expect(phase.geometryUsed).toBe('circular')
    expect(phase.fallbackReasons.join(' ')).toContain('b: missing eccentricity')
    expect(calculateOrbitalSignal({ ...base, bodies: incomplete, positionMode: 'date' }))
      .toMatchObject({ status: 'invalid', errors: [expect.stringContaining('mean anomaly at epoch')] })
    const unknownEpoch = bodies.map(body => body.id === 'b' ? { ...body, orbit: { ...body.orbit, meanAnomalyAtEpochRad: undefined, epochS: undefined } } : body)
    expect(success({ ...base, bodies: unknownEpoch }).geometryUsed).toBe('actual')
    expect(calculateOrbitalSignal({ ...base, bodies: unknownEpoch, positionMode: 'date' }).status).toBe('invalid')
  })
  it('rejects cyclic or invalid endpoint data and validates radio settings', () => {
    expect(calculateOrbitalSignal({ ...base, bodies: bodies.map(body => body.id === 'star' ? { ...body, parentBodyId: 'b' } : body) }).status).toBe('invalid')
    expect(calculateOrbitalSignal({ ...base, bodyBId: 'a' }).status).toBe('invalid')
    expect(calculateOrbitalSignal({ ...base, powerA: 0 }).status).toBe('invalid')
    expect(calculateOrbitalSignal({ ...base, occlusionFactor: 0 }).status).toBe('invalid')
    expect(calculateOrbitalSignal({ ...base, geometry: 'manual-distance', distanceM: 1, powerA: Number.MIN_VALUE, powerB: Number.MIN_VALUE, rangeMultiplier: Number.MIN_VALUE }).status).toBe('invalid')
    expect(sampleOrbitalSignals({ ...base, bodies: bodies.map(body => body.id === 'b' ? { ...body, orbit: orbit(1e308) } : body) }).status).toBe('invalid')
  })
  it('reports extreme user-supplied dates as invalid rather than throwing', () => {
    const input = { ...base, positionMode: 'date' as const, utS: Number.MAX_VALUE,
      bodies: bodies.map(body => body.id === 'b' ? { ...body, orbit: orbit(2e9, { epochS: -Number.MAX_VALUE }) } : body) }
    expect(calculateOrbitalSignal(input)).toMatchObject({ status: 'invalid', errors: [expect.stringContaining('finite anomaly')] })
    expect(sampleOrbitalSignals(input).status).toBe('invalid')
  })
  it('keeps circular reference blocking central-only and exact opposition stable for tiny occluders', () => {
    const extra: OrbitalBody = { id: 'unrelated', parentBodyId: 'star', radiusM: 1e6, orbit: orbit(1.5e9) }
    const result = success({ ...base, bodies: [...bodies, extra], geometry: 'circular', phaseDeg: 0 })
    expect(result.occluded).toBe(false)
    expect(result.uncheckedBodyIds).toContain('unrelated')
    const tiny = bodies.map(body => body.id === 'star' ? { ...body, radiusM: 1e-12 } : body.id === 'b' ? { ...body, orbit: orbit(2e9, { argumentOfPeriapsisDeg: 180 }) } : body)
    expect(success({ ...base, bodies: tiny, phaseDeg: 0 }).blockingBodyIds).toContain('star')
    expect(success({ ...base, bodies: tiny, positionMode: 'date', utS: 0 }).blockingBodyIds).toContain('star')
  })
  it('uses each occluding body radius for marginal limb tolerance', () => {
    const phaseDeg = 2 * Math.acos((1e8 - .05) / 1e9) * 180 / Math.PI
    const result = success({ ...base, geometry: 'circular', phaseDeg, bodies: [
      { ...bodies[0]!, radiusM: 1e8 }, { ...bodies[1]!, orbit: orbit(1e9) }, { ...bodies[2]!, orbit: orbit(1e9) },
    ] })
    expect(result.minimumClearanceM).toBeCloseTo(-.05, 5)
    expect(result.occluded).toBe(false)
    expect(result.linkStatus).toBe('marginal')
  })
})

describe('orbital sweeps and extrema', () => {
  it('completes the default real Stock synodic graph while retaining moon transits and compact SVG data', () => {
    const input = { ...base, bodies: getSignalOrbitalCatalog(stockPack).bodies,
      bodyAId: 'stock:kerbin', bodyBId: 'stock:duna', positionMode: 'date' as const, utS: 0 }
    const sweep = sampleOrbitalSignals(input)
    if (sweep.status !== 'success') throw new Error(sweep.errors[0])
    expect(sweep.interval.kind).toBe('synodic')
    expect(sweep.current.utS).toBe(0)
    expect(sweep.current.distanceM).toBe(success(input).distanceM)
    expect(sweep.samples.length).toBeLessThan(4000)
    expect(sweep.samples.every(sample => Number.isFinite(sample.parameter) && Number.isFinite(sample.signalStrength))).toBe(true)
    for (let index = 0; index < sweep.samples.length; index += 50) {
      const plotted = sweep.samples[index]!
      const direct = success({ ...input, utS: plotted.parameter })
      expect(plotted.blockingBodyIds).toEqual(direct.blockingBodyIds)
      expect(plotted.signalStrength).toBe(direct.signalStrength)
    }
    // Ike has hundreds of genuine transits in this interval. Independently
    // evaluate the midpoint of every retained Ike-blocked span, then ensure
    // the graph also brackets it with blocked points instead of drawing clear
    // across a narrow event between the ordinary 512 time samples.
    let ikeTransits = 0
    for (let index = 1; index < sweep.samples.length; index++) {
      const left = sweep.samples[index - 1]!
      const right = sweep.samples[index]!
      if (!left.blockingBodyIds.includes('stock:ike') || !right.blockingBodyIds.includes('stock:ike')) continue
      // Ignore nanosecond-scale limb brackets where coordinate cancellation
      // can change the classification within the existing limb tolerance.
      if (right.parameter - left.parameter < .001) continue
      const middle = success({ ...input, utS: (left.parameter + right.parameter) / 2 })
      expect(middle.blockingBodyIds).toContain('stock:ike')
      expect(middle.signalStrength).toBe(0)
      ikeTransits++
    }
    expect(ikeTransits).toBeGreaterThan(100)
  }, 15_000)
  it('resolves two narrow transits of the same moon near an apparent-direction turning point', () => {
    const first = 60.5
    const radians = Math.PI / 180
    const ax = 2e9 * Math.cos(radians)
    const ay = 2e9 * Math.sin(radians)
    const bx = 1e9 * Math.cos(first * radians)
    const by = 1e9 * Math.sin(first * radians)
    const towardA = Math.atan2(ay - by, ax - bx) / radians
    const second = 180 + 2 * towardA - first
    const input = { ...base, phaseDeg: 0, bodies: [
      bodies[0]!, { ...bodies[1]!, orbit: orbit(2e9, { argumentOfPeriapsisDeg: 1 }) },
      { ...bodies[2]!, orbit: orbit(1e9) },
      { id: 'moon', parentBodyId: 'b', radiusM: 1, orbit: orbit(1e6, { argumentOfPeriapsisDeg: towardA }) },
    ] }
    const sweep = sampleOrbitalSignals(input)
    if (sweep.status !== 'success') throw new Error(sweep.errors[0])
    for (const phaseDeg of [first, second]) {
      expect(success({ ...input, phaseDeg }).blockingBodyIds).toContain('moon')
      const left = [...sweep.samples].reverse().find(sample => sample.parameter <= phaseDeg)!
      const right = sweep.samples.find(sample => sample.parameter >= phaseDeg)!
      expect(left.occluded).toBe(true)
      expect(right.occluded).toBe(true)
    }
  })
  it('retains two distinct narrow occluder events inside the same coarse gap', () => {
    const makeOccluder = (phase: number): OrbitalBody => {
      const angle = phase * Math.PI / 180
      const x = (1e9 + 2e9 * Math.cos(angle)) / 2
      const y = 2e9 * Math.sin(angle) / 2
      return { id: `blocker-${phase}`, parentBodyId: 'star', radiusM: 1000,
        orbit: orbit(Math.hypot(x, y), { argumentOfPeriapsisDeg: Math.atan2(y, x) * 180 / Math.PI }) }
    }
    const input = { ...base, bodies: [...bodies, makeOccluder(.5), makeOccluder(1.5)], phaseDeg: 0 }
    const sweep = sampleOrbitalSignals(input)
    if (sweep.status !== 'success') throw new Error(sweep.errors[0])
    for (const phase of [.5, 1.5]) {
      expect(success({ ...input, phaseDeg: phase }).blockingBodyIds).toContain(`blocker-${phase}`)
      const before = [...sweep.samples].reverse().find(sample => sample.parameter <= phase)!
      const after = sweep.samples.find(sample => sample.parameter >= phase)!
      expect(before.occluded).toBe(true)
      expect(after.occluded).toBe(true)
      expect(sweep.samples.some(sample => sample.blockingBodyIds.includes(`blocker-${phase}`))).toBe(true)
    }
  })
  it('finds extrema away from 0/180 and resolves an occultation narrower than the coarse sampling', () => {
    const shifted = bodies.map(body => body.id === 'b' ? { ...body, orbit: orbit(2e9, { argumentOfPeriapsisDeg: 14.12345 }) } : body)
    const series = sampleOrbitalSignals({ ...base, bodies: shifted })
    if (series.status !== 'success') throw new Error(series.errors[0])
    expect(series.closest.parameter).toBeCloseTo(345.87655, 5)
    expect(series.farthest.parameter).toBeCloseTo(165.87655, 5)
    expect(series.closest.distanceM).toBeCloseTo(1e9, 4)
    expect(series.farthest.distanceM).toBeCloseTo(3e9, 4)
    const blocked = series.samples.filter(sample => sample.occluded)
    expect(blocked.length).toBeGreaterThan(0)
    expect(Math.max(...blocked.map(sample => sample.parameter)) - Math.min(...blocked.map(sample => sample.parameter))).toBeLessThan(.001)
    expect(series.farthest.rangeStrength).toBeGreaterThan(0)
    expect(series.farthest.signalStrength).toBe(0)
    expect(series.samples.some(sample => sample.parameter === 90)).toBe(true)
  })
  it('uses the actual phase reference and preserves source orbits', () => {
    const before = structuredClone(bodies)
    const result = success({ ...base, referenceTrueAnomalyDeg: 90, phaseDeg: 90 })
    expect(result.pointA!.y).toBeCloseTo(1e9, 5)
    expect(result.pointB!.x).toBeCloseTo(-2e9, 5)
    expect(bodies).toEqual(before)
    expect(result.orbitPaths).toHaveLength(2)
  })
  it('uses one synodic interval for compatible periods and an explicitly labeled alternative otherwise', () => {
    const date = sampleOrbitalSignals({ ...base, positionMode: 'date', utS: 100 })
    if (date.status !== 'success') throw new Error(date.errors[0])
    expect(date.interval.kind).toBe('synodic')
    expect(date.interval.end - date.interval.start).toBe(200)
    expect(date.interval.start).toBeLessThanOrEqual(100)
    expect(date.interval.end).toBeGreaterThanOrEqual(100)
    const equal = sampleOrbitalSignals({ ...base, positionMode: 'date', bodies: bodies.map(body => body.id === 'b' ? { ...body, orbit: orbit(2e9) } : body) })
    if (equal.status !== 'success') throw new Error(equal.errors[0])
    expect(equal.interval.kind).toBe('orbital-period')
    expect(equal.scopeLabel).toContain('not absolute')
  })
  it('fails explicitly rather than drawing a misleading graph when a custom date interval exceeds its finite event budget', () => {
    const input = { ...base, positionMode: 'date' as const, utS: 0, bodies: [
      bodies[0]!, { ...bodies[1]!, orbit: orbit(1e9, { periodS: 1000 }) },
      { ...bodies[2]!, orbit: orbit(2e9, { periodS: 2000 }) },
      { id: 'fast-moon', parentBodyId: 'a', radiusM: 100, orbit: orbit(1e6, { periodS: .01 }) },
    ] }
    expect(calculateOrbitalSignal(input).status).toBe('success')
    expect(sampleOrbitalSignals(input)).toMatchObject({ status: 'invalid', errors: [expect.stringContaining('too many short-period')] })
  })
})

describe('Dres PBC/Kerbalism reference link', () => {
  const pbc = getRadioProfile('pbc-kerbalism')
  const array = calculateAntennaArray([{ antennaId: 'hg-55', count: 2 }], 'client', pbc.vesselAntennas)
  if (array.status !== 'success') throw new Error(array.errors[0])
  const dampingExponent = calibrateKerbalismDamping(13_599_840_256, getEffectiveDsnLevels(pbc)[2]!.power).exponent
  const rateBase = resolveKerbalismBaseRate({ selection: 'array', customPower: '', array: [{ antennaId: 'hg-55', count: 2 }] }, pbc.vesselAntennas)
  if (rateBase.status !== 'success') throw new Error('Known HG-55 rate required')
  const manual: OrbitalSignalInput = { ...base, bodies: [], bodyAId: '', bodyBId: '', geometry: 'manual-distance', distanceM: 23e9,
    powerA: 250e9, powerB: array.effectivePower, dampingExponent }
  it('calculates the two-antenna direct link without invented positions or blockage', () => {
    const result = success(manual)
    expect(array.effectivePower).toBeCloseTo(42_044_820_762.68573, 4)
    // Independent scalar reference from the pinned powers at exactly 23 Gm.
    expect(result.maximumRangeM).toBeCloseTo(102_524_168_812.38995, 3)
    expect(result.signalStrength).toBeCloseTo(.8715988259433447, 12)
    expect(result.dampedStrength).toBeCloseTo(.43787666620496174, 12)
    expect(result.pointA).toBeNull()
    expect(result.minimumClearanceM).toBeNull()
    const rate = calculateKerbalismBitrate({ baseRateBitsPerSecond: rateBase.baseRateBitsPerSecond,
      rawStrength: result.signalStrength, dampingExponent, antennaSpeed: 1.5, minimumBitsPerSecond: 1, linkAvailable: true })
    expect(rate.status).toBe('success')
    if (rate.status === 'success') expect(rate.rateBitsPerSecond / 8).toBeCloseTo(131362.99986148853, 5)
    const series = sampleOrbitalSignals(manual)
    expect(series).toMatchObject({ status: 'success', samples: [] })
  })
  it('naturally reproduces the 23 Gm date from the pinned Stock Dres elements', () => {
    const mu = 1172332794832490500
    const kerbin = orbit(13_599_840_256, { meanAnomalyAtEpochRad: 179.908753682 * Math.PI / 180, periodS: deriveOrbitalPeriod(13_599_840_256, mu) })
    const dres = orbit(40_839_348_203, { eccentricity: .145, inclinationDeg: 5, longitudeAscendingNodeDeg: 280,
      argumentOfPeriapsisDeg: 90, meanAnomalyAtEpochRad: 179.908753682 * Math.PI / 180, periodS: deriveOrbitalPeriod(40_839_348_203, mu) })
    const result = success({ ...manual, geometry: 'actual', positionMode: 'date', utS: 69_019_080, bodyAId: 'kerbin', bodyBId: 'dres', bodies: [
      { id: 'sun', parentBodyId: null, radiusM: 261_600_000 },
      { id: 'kerbin', parentBodyId: 'sun', radiusM: 600_000, orbit: kerbin },
      { id: 'dres', parentBodyId: 'sun', radiusM: 138_000, orbit: dres },
    ] })
    expect(result.distanceM).toBeCloseTo(23_001_502_114.423176, 2)
    expect(result.pointB!.z).toBeCloseTo(2_715_704_568.8992963, 3)
    expect(result.signalStrength).toBeCloseTo(.8716, 3)
  })
})
