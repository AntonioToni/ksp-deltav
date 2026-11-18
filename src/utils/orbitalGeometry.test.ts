import { describe, expect, it } from 'vitest'
import type { OrbitalElements } from '../types/orbital'
import { deriveOrbitalPeriod, orbitalPositionAtTrueAnomaly, orbitalPositionAtUT, pointToSegmentDistance, solveKeplerEquation, trueAnomalyAtUT, validateOrbitalElements } from './orbitalGeometry'

const circle: OrbitalElements = { semiMajorAxisM: 10, eccentricity: 0, inclinationDeg: 0,
  longitudeAscendingNodeDeg: 0, argumentOfPeriapsisDeg: 0, meanAnomalyAtEpochRad: 0, epochS: 0, periodS: 100 }

describe('elliptic orbital coordinates', () => {
  it('preserves exact circular cardinal positions', () => {
    expect(orbitalPositionAtTrueAnomaly(circle, 0)).toEqual({ x: 10, y: 0, z: 0 })
    expect(orbitalPositionAtTrueAnomaly(circle, 180)).toEqual({ x: -10, y: 0, z: 0 })
    expect(orbitalPositionAtTrueAnomaly(circle, 450)).toEqual({ x: 0, y: 10, z: 0 })
  })
  it('puts the parent at the ellipse focus at periapsis and apoapsis', () => {
    const ellipse = { ...circle, eccentricity: .4 }
    expect(orbitalPositionAtTrueAnomaly(ellipse, 0).x).toBeCloseTo(6, 14)
    expect(orbitalPositionAtTrueAnomaly(ellipse, 180).x).toBeCloseTo(-14, 14)
    expect(orbitalPositionAtUT(ellipse, 0).x).toBeCloseTo(6, 14)
    expect(orbitalPositionAtUT(ellipse, 50).x).toBeCloseTo(-14, 14)
  })
  it('rotates through inclination, ascending node and periapsis argument', () => {
    const point = orbitalPositionAtTrueAnomaly({ ...circle, inclinationDeg: 90, longitudeAscendingNodeDeg: 90, argumentOfPeriapsisDeg: 90 }, 0)
    expect(point.x).toBeCloseTo(0, 13)
    expect(point.y).toBeCloseTo(0, 13)
    expect(point.z).toBeCloseTo(10, 13)
  })
  it('uses the supplied epoch, phase, and period including negative epochs', () => {
    const orbit = { ...circle, epochS: -25, meanAnomalyAtEpochRad: Math.PI / 2 }
    expect(orbitalPositionAtUT(orbit, -25).y).toBeCloseTo(10, 13)
    expect(orbitalPositionAtUT(orbit, 0).x).toBeCloseTo(-10, 13)
    expect(trueAnomalyAtUT(orbit, 25)).toBeCloseTo(270, 12)
  })
  it.each([0, .1, .9, .999999999])('solves Kepler equation for e=%s including near-parabolic cases', eccentricity => {
    for (const mean of [-3, -.000001, 0, .000001, 1.2, Math.PI]) {
      const eccentric = solveKeplerEquation(mean, eccentricity)
      const residual = eccentric - eccentricity * Math.sin(eccentric)
      const target = mean === Math.PI ? -Math.PI : mean
      expect(residual).toBeCloseTo(target, 12)
    }
  })
  it('derives a stock period from parent GM and reports missing elements', () => {
    expect(deriveOrbitalPeriod(13_599_840_256, 1172332794832490500)).toBeCloseTo(9_203_544.617501, 5)
    expect(deriveOrbitalPeriod(0, 1)).toBeNaN()
    expect(validateOrbitalElements({ semiMajorAxisM: 1 })).toContain('reference epoch')
    expect(validateOrbitalElements(circle)).toEqual([])
  })
})

describe('3D line of sight', () => {
  it('uses all three coordinates and stable long-segment projection', () => {
    expect(pointToSegmentDistance({ x: 0, y: 0, z: 0 }, { x: -1e12, y: 0, z: 2 }, { x: 1e12, y: 0, z: 2 })).toBe(2)
    expect(pointToSegmentDistance({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 }, { x: 1, y: 1, z: 1 })).toBeCloseTo(Math.sqrt(3), 14)
    expect(pointToSegmentDistance({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 2, y: 0, z: 0 })).toBe(1)
  })
})
