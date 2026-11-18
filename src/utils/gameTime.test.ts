import { describe, expect, it } from 'vitest'
import { gameDateToUT, utToGameDate } from './gameTime'

describe('game calendar conversion', () => {
  it('starts Kerbin Year 1 Day 1 at UT0 with six-hour days and 426-day years', () => {
    expect(gameDateToUT({ year: 1, day: 1, hour: 0, minute: 0, second: 0 }, 'kerbin')).toEqual({ status: 'success', utS: 0 })
    expect(utToGameDate(426 * 21600, 'kerbin')).toEqual({ year: 2, day: 1, hour: 0, minute: 0, second: 0 })
    expect(gameDateToUT({ year: 8, day: 214, hour: 1, minute: 58, second: 0 }, 'kerbin')).toEqual({ status: 'success', utS: 69_019_080 })
  })
  it('uses the official RSS Gregorian 1951 epoch and leap years', () => {
    expect(utToGameDate(0, 'earth')).toEqual({ year: 1951, day: 1, hour: 0, minute: 0, second: 0 })
    expect(gameDateToUT({ year: 1952, day: 366, hour: 0, minute: 0, second: 0 }, 'earth')).toEqual({ status: 'success', utS: 730 * 86400 })
    expect(utToGameDate(731 * 86400, 'earth')).toEqual({ year: 1953, day: 1, hour: 0, minute: 0, second: 0 })
    expect(gameDateToUT({ year: 1951, day: 366, hour: 0, minute: 0, second: 0 }, 'earth').status).toBe('invalid')
    expect(gameDateToUT({ year: 1900, day: 366, hour: 0, minute: 0, second: 0 }, 'earth').status).toBe('invalid')
    expect(gameDateToUT({ year: 2000, day: 366, hour: 0, minute: 0, second: 0 }, 'earth').status).toBe('success')
  })
  it('round-trips fractional seconds, negative RSS epochs, and the day boundary', () => {
    for (const ut of [-31_542_641.784, 0, 86399.999, 8e8 + .125]) {
      const date = utToGameDate(ut, 'earth')!
      const result = gameDateToUT(date, 'earth')
      expect(result.status).toBe('success')
      if (result.status === 'success') expect(result.utS).toBeCloseTo(ut, 5)
    }
    const date = { year: 8, day: 214, hour: 5, minute: 59, second: 59.125 }
    const result = gameDateToUT(date, 'kerbin')
    if (result.status !== 'success') throw new Error(result.errors[0])
    expect(utToGameDate(result.utS, 'kerbin')).toEqual(date)
  })
  it('rejects invalid dates and leaves partial UT unformatted', () => {
    expect(gameDateToUT({ year: 1, day: 427, hour: 0, minute: 0, second: 0 }, 'kerbin').status).toBe('invalid')
    expect(gameDateToUT({ year: 1, day: 1, hour: 6, minute: 0, second: 0 }, 'kerbin').status).toBe('invalid')
    expect(utToGameDate(NaN, 'kerbin')).toBeNull()
    expect(utToGameDate(-1, 'kerbin')).toBeNull()
  })
})
