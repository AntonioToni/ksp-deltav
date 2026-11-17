import { describe, expect, it } from 'vitest'
import { kerbalismAntennaRates } from '../data/kerbalismRates'
import { calculateKerbalismBitrate } from './kerbalismBitrate'
import { formatRateBytesPerSecond, formatScienceRateBitsPerSecond } from './formatScienceRate'

describe('science rate byte display', () => {
  it.each([
    [0, '0 B/s'], [-0, '0 B/s'], [.125, '0.125 B/s'], [.0015, '0.0015 B/s'],
    [1, '1 B/s'], [70.3125, '70.313 B/s'], [999, '999 B/s'],
    [1000, '1 kB/s'], [4500, '4.5 kB/s'], [1e6, '1 MB/s'], [1e9, '1 GB/s'],
    [1e12, '1,000 GB/s'],
  ])('formats %s bytes per second as %s without converting bytes again', (value, expected) => {
    expect(formatRateBytesPerSecond(value)).toBe(expected)
  })

  it.each([
    [999.9994, '999.999 B/s'], [999.9995, '1 kB/s'],
    [999_999.4, '999.999 kB/s'], [999_999.5, '1 MB/s'],
    [999_999_400, '999.999 MB/s'], [999_999_500, '1 GB/s'],
    [999_999_999_500, '1,000 GB/s'],
  ])('promotes %s bytes per second when display rounding reaches the next SI unit', (value, expected) => {
    expect(formatRateBytesPerSecond(value)).toBe(expected)
  })

  it.each([
    [.000125, '1.25e-4 B/s'], [1e-12, '1.00e-12 B/s'],
    [Number.MIN_VALUE, '4.94e-324 B/s'],
  ])('keeps a tiny positive byte rate visible: %s', (value, expected) => {
    expect(formatRateBytesPerSecond(value)).toBe(expected)
  })

  it.each([NaN, Infinity, -Infinity, -1, -Number.MIN_VALUE])('rejects invalid rates: %s', value => {
    expect(formatRateBytesPerSecond(value)).toBe('—')
    expect(formatScienceRateBitsPerSecond(value)).toBe('—')
  })
})

describe('planner bit/s conversion at the display boundary', () => {
  it.each([
    [0, '0 B/s'], [1, '0.125 B/s'], [8, '1 B/s'],
    [8000, '1 kB/s'], [8_000_000, '1 MB/s'], [8_000_000_000, '1 GB/s'],
    [.012, '0.0015 B/s'], [.001, '1.25e-4 B/s'], [.007999, '1.00e-3 B/s'],
    [Number.MIN_VALUE, '6.18e-325 B/s'],
    [Number.MIN_VALUE * 2, '1.24e-324 B/s'],
    [Number.MIN_VALUE * 8, '4.94e-324 B/s'],
  ])('converts %s bit/s to %s exactly once', (value, expected) => {
    expect(formatScienceRateBitsPerSecond(value)).toBe(expected)
  })

  it('preserves catalog rates, calculation results, and the configured bit/s minimum', () => {
    const baseRateBitsPerSecond = kerbalismAntennaRates['hg-5']!.baseRateBitsPerSecond
    const input = Object.freeze({
      baseRateBitsPerSecond, rawStrength: .5, dampingExponent: 6,
      antennaSpeed: 1, minimumBitsPerSecond: 1, linkAvailable: true,
    })
    const result = calculateKerbalismBitrate(input)
    if (result.status !== 'success') throw new Error(result.errors.join('\n'))
    Object.freeze(result)

    expect(formatScienceRateBitsPerSecond(baseRateBitsPerSecond)).toBe('4.5 kB/s')
    expect(formatScienceRateBitsPerSecond(result.rateBitsPerSecond)).toBe('70.313 B/s')
    expect(formatScienceRateBitsPerSecond(input.minimumBitsPerSecond)).toBe('0.125 B/s')
    expect(baseRateBitsPerSecond).toBe(36_000)
    expect(kerbalismAntennaRates['hg-5']!.baseRateBitsPerSecond).toBe(36_000)
    expect(input.minimumBitsPerSecond).toBe(1)
    expect(result.rateBitsPerSecond).toBe(562.5)
    expect(result.fullStrengthBitsPerSecond).toBe(36_000)
  })
})
