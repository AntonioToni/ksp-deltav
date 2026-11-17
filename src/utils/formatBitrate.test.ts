import { describe, expect, it } from 'vitest'
import { formatBitrate } from './formatBitrate'

describe('minimum science-rate configuration display', () => {
  it.each([
    [0, '0 bit/s'], [1, '1 bit/s'], [1000, '1,000 bit/s'],
    [.125, '0.125 bit/s'], [.00001, '1.00e-5 bit/s'], [1e18, '1.00e+18 bit/s'],
  ] as const)('keeps %s in the configuration file’s bit/s units', (value, expected) => {
    expect(formatBitrate(value)).toBe(expected)
  })

  it.each([-1, NaN, Infinity])('does not format invalid settings (%s)', value => {
    expect(formatBitrate(value)).toBe('—')
  })
})
