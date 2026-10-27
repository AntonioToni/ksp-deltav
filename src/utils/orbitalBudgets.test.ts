import { describe, expect, it } from 'vitest'
import { hohmannArrivalSpeed, hohmannTransfer, parkingOrbitBurn, splitCapture, surfaceOrbitBudget } from './orbitalBudgets'

describe('ideal two-body orbital budgets', () => {
  it('matches the independently documented Plock–Karen example without rounding', () => {
    const plockMu = 51_844_895_008.2
    const karenMu = 4_681_804_201.24725
    const transfer = hohmannTransfer(plockMu, 199_000, 2_457_800)
    expect(transfer.departureDeltaV).toBeCloseTo(183.86246403770073, 10)
    expect(transfer.arrivalDeltaV).toBeCloseTo(89.02416635731079, 10)
    expect(parkingOrbitBurn(karenMu, 95_050, transfer.arrivalDeltaV)).toBeCloseTo(104.31055711516453, 10)
    expect(surfaceOrbitBudget(karenMu, 85_050, 95_050)).toBeCloseTo(247.29756931342564, 10)
  })

  it('returns positive impulses for inward transfers and swaps them under time reversal', () => {
    const outward = hohmannTransfer(1, 1, 4)
    expect(outward.departureDeltaV).toBeCloseTo(Math.sqrt(8 / 5) - 1, 14)
    expect(outward.arrivalDeltaV).toBeCloseTo(.5 - Math.sqrt(1 / 10), 14)
    const inward = hohmannTransfer(1, 4, 1)
    expect(inward.departureDeltaV).toBe(outward.arrivalDeltaV)
    expect(inward.arrivalDeltaV).toBe(outward.departureDeltaV)
  })

  it('requires no transfer impulses between identical circular reference orbits', () => {
    expect(hohmannTransfer(3.5316e12, 680_000, 680_000)).toEqual({ departureDeltaV: 0, arrivalDeltaV: 0 })
  })

  it.each([[1, 4], [4, 1], [4, 4]])('matches the coplanar arrival difference for radii %s → %s', (departure, arrival) => {
    expect(hohmannArrivalSpeed(1e12, departure, arrival, 0)).toBe(hohmannTransfer(1e12, departure, arrival).arrivalDeltaV)
  })

  it('adds opposing orbital speeds for a fully retrograde nominal encounter', () => {
    // Unit-gravity transfer from radius 1 to 4: receiving speed .5 and
    // transfer speed sqrt(.1), with velocity vectors in opposite directions.
    expect(hohmannArrivalSpeed(1, 1, 4, 180)).toBeCloseTo(.5 + Math.sqrt(.1), 14)
    expect(hohmannArrivalSpeed(1, 1, 4, 180)).toBeGreaterThan(hohmannArrivalSpeed(1, 1, 4, 0))
  })

  it('uses the vector angle for an intermediate inclination at the orbital node', () => {
    const angle = 29.56 * Math.PI / 180
    const transferSpeed = Math.sqrt(.1)
    const x = .5 - transferSpeed * Math.cos(angle)
    const y = transferSpeed * Math.sin(angle)
    expect(hohmannArrivalSpeed(1, 1, 4, 29.56)).toBeCloseTo(Math.hypot(x, y), 14)
  })

  it('retains Thatmo’s retrograde encounter energy instead of treating its velocity as prograde', () => {
    const neidonMu = 14_167_881_530_302.5
    const parkingRadius = 2_415_000
    const moonRadius = 32_300_895
    const prograde = hohmannTransfer(neidonMu, parkingRadius, moonRadius).arrivalDeltaV
    const retrograde = hohmannArrivalSpeed(neidonMu, parkingRadius, moonRadius, 161.1)
    expect(prograde).toBeCloseTo(415.252631861814, 10)
    expect(retrograde).toBeCloseTo(899.5654437902338, 10)
    expect(retrograde).toBeGreaterThan(2 * prograde)
  })

  it('accounts for crossing velocity even when two reference orbits have the same radius', () => {
    expect(hohmannArrivalSpeed(1, 1, 1, 60)).toBeCloseTo(1, 14)
    expect(hohmannArrivalSpeed(1, 1, 1, 180)).toBeCloseTo(2, 14)
    expect(hohmannArrivalSpeed(1, 1, 1, 1e-10)).toBeGreaterThan(0)
  })

  it('matches a parabolic parking burn at zero excess speed and grows with encounter energy', () => {
    const mu = 3.5316e12
    const radius = 680_000
    const circular = Math.sqrt(mu / radius)
    expect(parkingOrbitBurn(mu, radius, 0)).toBeCloseTo((Math.SQRT2 - 1) * circular, 10)
    expect(parkingOrbitBurn(mu, radius, 3_000)).toBeGreaterThan(parkingOrbitBurn(mu, radius, 1_000))
  })

  it('satisfies the hyperbolic energy equation at the parking periapsis', () => {
    const mu = 51_844_895_008.2
    const radius = 199_000
    const vInfinity = 625
    const periapsisSpeed = parkingOrbitBurn(mu, radius, vInfinity) + Math.sqrt(mu / radius)
    expect(periapsisSpeed ** 2 / 2 - mu / radius).toBeCloseTo(vInfinity ** 2 / 2, 8)
  })

  it('splits capture without charging the circularization impulse twice', () => {
    const mu = 3.5316e12
    const parking = 680_000
    const apoapsis = 84_159_286.5
    const excess = 2_000
    const split = splitCapture(mu, parking, apoapsis, excess)
    expect(split.captureToEllipse).toBeGreaterThan(0)
    expect(split.circularization).toBeGreaterThan(0)
    expect(split.captureToEllipse + split.circularization).toBeCloseTo(parkingOrbitBurn(mu, parking, excess), 10)
    const ellipsePeriapsisSpeed = Math.sqrt(mu / parking) + split.circularization
    const semiMajorAxis = (parking + apoapsis) / 2
    expect(ellipsePeriapsisSpeed ** 2 / 2 - mu / parking).toBeCloseTo(-mu / (2 * semiMajorAxis), 8)
  })

  it('reduces a zero-height capture ellipse to the circular parking burn', () => {
    const split = splitCapture(1e12, 100_000, 100_000, 500)
    expect(split.circularization).toBe(0)
    expect(split.captureToEllipse).toBe(parkingOrbitBurn(1e12, 100_000, 500))
  })

  it('approaches a parabolic periapsis as the capture ellipse grows', () => {
    const mu = 1e12
    const parking = 1e5
    const compact = splitCapture(mu, parking, 2e5, 0)
    const large = splitCapture(mu, parking, 1e14, 0)
    expect(large.captureToEllipse).toBeLessThan(compact.captureToEllipse)
    expect(large.circularization).toBeGreaterThan(compact.circularization)
    expect(large.captureToEllipse).toBeCloseTo(0, 5)
  })

  it('starts the vacuum ascent at rest instead of treating the surface as an existing orbit', () => {
    const mu = 1e12
    const bodyRadius = 1e5
    const parkingRadius = 2e5
    const transfer = hohmannTransfer(mu, bodyRadius, parkingRadius)
    expect(surfaceOrbitBudget(mu, bodyRadius, parkingRadius)).toBeCloseTo(
      Math.sqrt(mu / bodyRadius) + transfer.departureDeltaV + transfer.arrivalDeltaV, 10,
    )
    expect(surfaceOrbitBudget(mu, bodyRadius, bodyRadius)).toBeCloseTo(Math.sqrt(mu / bodyRadius), 10)
  })

  it('scales all budgets with the square root of gravitational parameter', () => {
    const transfer = hohmannTransfer(1e12, 1e5, 2e6)
    const heavier = hohmannTransfer(4e12, 1e5, 2e6)
    expect(heavier.departureDeltaV).toBeCloseTo(2 * transfer.departureDeltaV, 10)
    expect(heavier.arrivalDeltaV).toBeCloseTo(2 * transfer.arrivalDeltaV, 10)
    expect(surfaceOrbitBudget(4e12, 1e5, 2e5)).toBeCloseTo(2 * surfaceOrbitBudget(1e12, 1e5, 2e5), 10)
  })
})

describe('orbital budget input validation', () => {
  const invalidPositive = [0, -1, NaN, Infinity, -Infinity, '1' as unknown as number]

  it.each(invalidPositive)('rejects an invalid gravitational parameter: %s', invalid => {
    expect(() => hohmannTransfer(invalid, 1, 2)).toThrow(RangeError)
    expect(() => hohmannArrivalSpeed(invalid, 1, 2, 0)).toThrow(RangeError)
    expect(() => parkingOrbitBurn(invalid, 1, 0)).toThrow(RangeError)
    expect(() => splitCapture(invalid, 1, 2, 0)).toThrow(RangeError)
    expect(() => surfaceOrbitBudget(invalid, 1, 2)).toThrow(RangeError)
  })

  it.each(invalidPositive)('rejects invalid radii in every position: %s', invalid => {
    expect(() => hohmannTransfer(1, invalid, 2)).toThrow(RangeError)
    expect(() => hohmannTransfer(1, 1, invalid)).toThrow(RangeError)
    expect(() => hohmannArrivalSpeed(1, invalid, 2, 0)).toThrow(RangeError)
    expect(() => hohmannArrivalSpeed(1, 1, invalid, 0)).toThrow(RangeError)
    expect(() => parkingOrbitBurn(1, invalid, 0)).toThrow(RangeError)
    expect(() => splitCapture(1, invalid, 2, 0)).toThrow(RangeError)
    expect(() => splitCapture(1, 1, invalid, 0)).toThrow(RangeError)
    expect(() => surfaceOrbitBudget(1, invalid, 2)).toThrow(RangeError)
    expect(() => surfaceOrbitBudget(1, 1, invalid)).toThrow(RangeError)
  })

  it.each([-1, NaN, Infinity, -Infinity, '0' as unknown as number])('rejects invalid hyperbolic excess speed: %s', invalid => {
    expect(() => parkingOrbitBurn(1, 1, invalid)).toThrow(RangeError)
    expect(() => splitCapture(1, 1, 2, invalid)).toThrow(RangeError)
  })

  it.each([-1, 180.1, NaN, Infinity, -Infinity, '0' as unknown as number])('rejects an invalid arrival inclination: %s', invalid => {
    expect(() => hohmannArrivalSpeed(1, 1, 2, invalid)).toThrow(RangeError)
  })

  it('rejects a parking orbit below the surface or an ellipse apoapsis below its periapsis', () => {
    expect(() => surfaceOrbitBudget(1, 2, 1)).toThrow(RangeError)
    expect(() => splitCapture(1, 2, 1, 0)).toThrow(RangeError)
  })

  it('rejects numerical overflow rather than returning an infinite or NaN budget', () => {
    expect(() => hohmannTransfer(Number.MAX_VALUE, Number.MIN_VALUE, 1)).toThrow(RangeError)
    expect(() => hohmannArrivalSpeed(Number.MAX_VALUE, 1, Number.MIN_VALUE, 0)).toThrow(RangeError)
    expect(() => parkingOrbitBurn(Number.MAX_VALUE, Number.MIN_VALUE, 0)).toThrow(RangeError)
    expect(() => splitCapture(Number.MAX_VALUE, Number.MIN_VALUE, 1, 0)).toThrow(RangeError)
    expect(() => surfaceOrbitBudget(Number.MAX_VALUE, Number.MIN_VALUE, 1)).toThrow(RangeError)
  })
})
