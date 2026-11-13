import { describe, expect, it } from 'vitest'
import {
  calibrateKerbalismDamping, commNetSignalStrength, kerbalismDampedStrength,
  MAX_DAMPING_EXPONENT,
} from './signalStrength'

describe('shared CommNet signal strength', () => {
  it.each([
    [0, 1], [.25, .84375], [.5, .5], [.75, .15625], [1, 0], [2, 0],
  ])('matches independent smoothstep values at normalized distance %s', (distance, expected) => {
    expect(commNetSignalStrength(distance * 200, 200)).toBe(expected)
  })
})

describe('Kerbalism dimensionless damping', () => {
  it.each([
    [0, 6, 0], [1, 6, 1], [.8, 6, .262144], [.5, 6, .015625],
    [.25, .5, .5], [.25, 1, .25], [.5, MAX_DAMPING_EXPONENT, 0],
  ])('maps raw strength %s with exponent %s to %s before any rate floor', (strength, exponent, expected) => {
    expect(kerbalismDampedStrength(strength, exponent)).toBeCloseTo(expected, 14)
  })

  it('retains finite bounded monotonic strength for positive exponents, including values below one', () => {
    for (const exponent of [Number('.042762801803353465'), .5, 1, 6.009182065257, MAX_DAMPING_EXPONENT]) {
      let previous = 0
      for (let index = 0; index <= 100; index++) {
        const strength = kerbalismDampedStrength(index / 100, exponent)
        expect(Number.isFinite(strength)).toBe(true)
        expect(strength).toBeGreaterThanOrEqual(previous)
        expect(strength).toBeLessThanOrEqual(1)
        previous = strength
      }
    }
  })

  it.each([
    [-.01, 6], [1.01, 6], [NaN, 6], [Infinity, 6], [.5, 0], [.5, -1],
    [.5, NaN], [.5, Infinity], [.5, MAX_DAMPING_EXPONENT + 1],
  ])('rejects invalid strength/exponent values (%s, %s)', (strength, exponent) => {
    expect(() => kerbalismDampedStrength(strength, exponent)).toThrow(RangeError)
  })
})

describe('Kerbalism 3.44 damping calibration', () => {
  it('matches an independent high-precision Stock reference using maximum DSN power as the calibration range', () => {
    // Decimal arithmetic with S = 1 - 3(d/R)^2 + 2(d/R)^3, not the production helper.
    const result = calibrateKerbalismDamping(13_599_840_256, 250_000_000_000)
    expect(result.source).toBe('automatic')
    expect(result.calibrationDistanceM).toBe(27_199_680_512)
    expect(result.calibrationStrength).toBeCloseTo(Number('.96706425042115150231'), 14)
    expect(result.exponent).toBeCloseTo(Number('6.0091820652570001287'), 11)
  })

  it('matches bare RSS adaptive calibration without forcing its exponent above one', () => {
    const result = calibrateKerbalismDamping(149_598_261_150.4425, 250_000_000_000)
    expect(result.source).toBe('automatic')
    expect(result.calibrationDistanceM).toBe(149_598_261_150.4425 * 1.5)
    expect(result.calibrationStrength).toBeCloseTo(Number('.029315550312949014295'), 14)
    expect(result.exponent).toBeCloseTo(Number('.042762801803353464817'), 14)
    expect(kerbalismDampedStrength(.5, result.exponent)).toBeGreaterThan(.5)
  })

  it.each([
    { maximum: 500, multiple: 2, exponent: Number('.46385341126395444509') },
    { maximum: 175, multiple: 1.5, exponent: Number('.052167981234869224127') },
    { maximum: 120, multiple: 1, exponent: Number('.038661844284581336603') },
    { maximum: 90, multiple: .75, exponent: Number('.028996383213436002453') },
    { maximum: 60, multiple: .5, exponent: Number('.019330922142290668302') },
    { maximum: 30, multiple: .25, exponent: Number('.009665461071145334151') },
  ])('uses the first usable $multiple AU reference with maximum range $maximum', ({ maximum, multiple, exponent }) => {
    const result = calibrateKerbalismDamping(100, maximum)
    expect(result.source).toBe('automatic')
    expect(result.calibrationDistanceM).toBe(100 * multiple)
    expect(result.exponent).toBeCloseTo(exponent, 14)
  })

  it('skips a preferred point with strength too close to zero even when technically inside range', () => {
    const result = calibrateKerbalismDamping(100, 200.01)
    expect(result.source).toBe('automatic')
    expect(result.calibrationDistanceM).toBe(150)
    expect(result.exponent).toBeCloseTo(Number('.08132268092362303515'), 14)
  })

  it('uses the official fallback when all reference strengths are too high or no reference distance is reachable', () => {
    for (const [home, maximum] of [[149_598_261_150.4425, 50_000_000_000_000], [100, 25], [100, 10]]) {
      expect(calibrateKerbalismDamping(home!, maximum!)).toEqual({
        exponent: 6, source: 'fallback', calibrationDistanceM: null, calibrationStrength: null,
      })
    }
  })

  it.each([
    [null, 250e9], [NaN, 250e9], [Infinity, 250e9], [0, 250e9], [-1, 250e9],
    [13e9, 0], [13e9, NaN], [13e9, Infinity], [13e9, -1],
  ])('reports fallback explicitly for missing or invalid calibration inputs (%s, %s)', (home, maximum) => {
    expect(calibrateKerbalismDamping(home, maximum)).toEqual({
      exponent: 6, source: 'fallback', calibrationDistanceM: null, calibrationStrength: null,
    })
  })
})
