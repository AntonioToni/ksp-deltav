import { describe, expect, it } from 'vitest'
import { calculateRelayPlan } from './relay'
import { suggestRelayAltitudeKm } from './relayDefaults'

describe('automatic relay target altitude', () => {
  it.each([
    { radius: 600, atmosphere: 70, soi: 84159.2864796305, expected: '800' },
    { radius: 320, atmosphere: 50, soi: 47921.949, expected: '426.667' },
    { radius: 520, atmosphere: 65, soi: 31359.322313602865, expected: '693.333' },
    { radius: 18, atmosphere: 0, soi: 58, expected: '24' },
    { radius: 3.25, atmosphere: 0, soi: 43.25, expected: '11' },
  ])('preserves the existing preferred altitude when its radius fits the SOI: $radius km', ({ radius, atmosphere, soi, expected }) => {
    expect(suggestRelayAltitudeKm(radius, atmosphere, 10, soi)).toBe(expected)
  })

  it('selects a strict interior altitude for an edited small-body SOI', () => {
    // An Enots-sized body with a deliberately edited 30.909 km SOI. The
    // default Kopernicus Enots preset itself has a larger 58 km floor.
    const altitude = suggestRelayAltitudeKm(18, 0, 10, 30.909)
    expect(altitude).toBe('11.455')
    const result = calculateRelayPlan({
      body: { radiusM: 18_000, gravitationalParameter: 143_492_720, atmosphereHeightM: 0, sphereOfInfluenceM: 30_909 },
      hasSurface: true, satelliteCount: 3, altitudeM: Number(altitude) * 1000,
      relayPower: 5e6, clientPower: 5e5, dsnPower: 250e9,
      rangeMultiplier: 1, occlusionFactor: 1, phaseDeg: 0, stationLongitudeDeg: 0,
      safetyMarginM: 10_000, deploymentMode: 'lower',
    })
    expect(result.status).toBe('success')
    // A valid target does not assert a feasible resonant deployment carrier.
    if (result.status === 'success') expect(result.deployment.status).toBe('blocked')
  })

  it('falls back to full precision if meter rounding would reach a boundary', () => {
    const altitude = Number(suggestRelayAltitudeKm(1, 0, 10, 11.0004))
    expect(altitude).toBeCloseTo(10.0002, 12)
    expect(altitude).toBeGreaterThan(10)
    expect(altitude).toBeLessThan(10.0004)
  })

  it('checks the rounded preference as well as the unrounded preference', () => {
    const radius = 1.0003
    const soi = 2.3342
    const altitude = Number(suggestRelayAltitudeKm(radius, 0, 0, soi))
    expect(altitude).toBe(.667)
    expect(radius + altitude).toBeLessThan(soi)
  })

  it('keeps requested clearance instead of pretending an impossible interval is valid', () => {
    expect(suggestRelayAltitudeKm(18, 0, 10, 28)).toBe('24')
    expect(suggestRelayAltitudeKm(18, 2, 10, 29)).toBe('24')
    expect(suggestRelayAltitudeKm(1, 70, 10, 50)).toBe('81')
  })

  it.each([undefined, NaN, Infinity])('retains the old default when SOI is not supplied or not finite: %s', soi => {
    expect(suggestRelayAltitudeKm(600, 70, 10, soi)).toBe('800')
  })

  it.each([0, -1, NaN, Infinity])('leaves altitude blank until a valid positive radius exists: %s', radius => {
    expect(suggestRelayAltitudeKm(radius, 0, 10, 100)).toBe('')
  })

  it('retains the existing fallback values while incomplete fields are edited', () => {
    expect(suggestRelayAltitudeKm(3.25, NaN, NaN)).toBe('11')
    expect(suggestRelayAltitudeKm(1, 70, 20, 100)).toBe('91')
  })
})
