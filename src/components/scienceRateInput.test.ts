import { describe, expect, it } from 'vitest'
import { MAX_KERBALISM_RATE_BITS_PER_SECOND } from '../utils/kerbalismBitrate'
import { scienceRateBitsToBytesInput, scienceRateBytesToBitsInput } from './scienceRateInput'

describe('science rate input unit boundary', () => {
  it('loads legacy bit/s drafts as B/s and stores edited bytes as bits', () => {
    expect(scienceRateBitsToBytesInput('36000')).toBe('4500')
    expect(scienceRateBytesToBitsInput('4500')).toBe('36000')
    expect(scienceRateBitsToBytesInput('1')).toBe('0.125')
    expect(scienceRateBytesToBitsInput('0.125')).toBe('1')
  })

  it('preserves the difference between an unknown rate and an explicit zero', () => {
    for (const value of ['', '   ']) {
      expect(scienceRateBitsToBytesInput(value)).toBe('')
      expect(scienceRateBytesToBitsInput(value)).toBe('')
    }
    expect(scienceRateBitsToBytesInput('0')).toBe('0')
    expect(scienceRateBytesToBitsInput('0')).toBe('0')
  })

  it('round-trips fractions and the existing maximum without changing the model limit', () => {
    expect(scienceRateBytesToBitsInput('1.2300')).toBe('9.84')
    const bytesAtMaximum = scienceRateBitsToBytesInput(String(MAX_KERBALISM_RATE_BITS_PER_SECOND))
    expect(bytesAtMaximum).toBe('125000000000000000')
    expect(scienceRateBytesToBitsInput(bytesAtMaximum)).toBe(String(MAX_KERBALISM_RATE_BITS_PER_SECOND))
    expect(Number(scienceRateBytesToBitsInput('125000000000000100'))).toBeGreaterThan(MAX_KERBALISM_RATE_BITS_PER_SECOND)
  })

  it('keeps negative and non-finite rates invalid instead of making them zero or unknown', () => {
    expect(scienceRateBitsToBytesInput('-8')).toBe('-1')
    expect(scienceRateBytesToBitsInput('-1')).toBe('-8')
    for (const value of ['Infinity', '-Infinity', 'NaN', 'invalid']) {
      expect(Number.isFinite(Number(scienceRateBitsToBytesInput(value)))).toBe(false)
      expect(Number.isFinite(Number(scienceRateBytesToBitsInput(value)))).toBe(false)
      expect(scienceRateBitsToBytesInput(value)).not.toBe('')
      expect(scienceRateBytesToBitsInput(value)).not.toBe('')
    }
  })
})
