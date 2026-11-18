import { describe, expect, it } from 'vitest'
import type { OrbitalElements } from '../types/orbital'
import { orbitalPositionAtUT, validateOrbitalElements, vectorDistance } from '../utils/orbitalGeometry'
import { kcalbelohBodies, kcalbelohBodyFacts, kcalbelohConfigCommit } from './kcalbelohReference'
import {
  kcalbelohOrbitalElements, kcalbelohOrbitalGravitationalParameters,
  kcalbelohOrbitalLimitations, kcalbelohOrbitalRadiusOverrides, kcalbelohOrbitalSources,
} from './kcalbelohOrbitalElements'

const reference = (id: string) => kcalbelohOrbitalElements.find(row => row.bodyId === `kcalbeloh:${id}`)!

describe('pinned default Kcalbeloh orbital elements', () => {
  it('covers every physical and technical-center orbit without adding wormhole signal paths', () => {
    const expected = kcalbelohBodies.filter(body => body.kind !== 'wormhole')
    expect(kcalbelohOrbitalElements).toHaveLength(31)
    expect(kcalbelohOrbitalElements.map(row => row.bodyId)).toEqual(expected.map(body => body.id))
    expect(new Set(kcalbelohOrbitalElements.map(row => row.bodyId)).size).toBe(31)
    for (const row of kcalbelohOrbitalElements) {
      expect(row.parentBodyId).toBe(expected.find(body => body.id === row.bodyId)!.parentId)
      const fact = kcalbelohBodyFacts.find(fact => fact.bodyId === row.bodyId)!
      expect(row.elements).toMatchObject({
        semiMajorAxisM: fact.semiMajorAxisM, eccentricity: fact.eccentricity, inclinationDeg: fact.inclinationDeg,
      })
      expect(Number.isFinite(row.elements.periodS)).toBe(true)
      expect(row.elements.periodS).toBeGreaterThan(0)
    }
  })

  it('retains explicitly missing or conflicting dated inputs instead of inventing zeros', () => {
    const complete = kcalbelohOrbitalElements.filter(row => validateOrbitalElements(row.elements).length === 0)
    expect(complete).toHaveLength(29)
    expect(reference('kcalbeloh').elements).not.toHaveProperty('epochS')
    expect(reference('kcalbeloh').elements.meanAnomalyAtEpochRad).toBe(0)
    expect(validateOrbitalElements(reference('kcalbeloh').elements)).toEqual(['reference epoch'])
    expect(reference('efil').elements).not.toHaveProperty('meanAnomalyAtEpochRad')
    expect(reference('efil').elements.epochS).toBe(0)
    expect(validateOrbitalElements(reference('efil').elements)).toEqual(['mean anomaly at epoch'])
    expect(kcalbelohOrbitalLimitations['kcalbeloh:kcalbeloh']).toMatch(/epoch/)
    expect(kcalbelohOrbitalLimitations['kcalbeloh:efil']).toMatch(/12 radians and 184 degrees/)
  })

  it('converts only degree-suffixed mean anomalies and preserves explicitly radian values', () => {
    // Independently converted with a 60-digit decimal pi reference.
    expect(reference('noi').elements.meanAnomalyAtEpochRad).toBeCloseTo(Number('1.347196960334147074'), 14)
    expect(reference('simesystem').elements.meanAnomalyAtEpochRad).toBeCloseTo(Number('.299999409137549328'), 14)
    // The 45 in Sunorc.cfg is a radian key, not 45 degrees.
    expect(reference('sunorc').elements.meanAnomalyAtEpochRad).toBe(45)
    expect(reference('anehta').elements.meanAnomalyAtEpochRad).toBe(.100000001490116)
    expect(reference('noira').elements.inclinationDeg).toBe(168)
    expect(reference('arorua').elements.argumentOfPeriapsisDeg).toBe(-65)
  })

  it('keeps the configured shared binary period rather than deriving separate periods', () => {
    const simetra = reference('simetra').elements as OrbitalElements
    const simeht = reference('simeht').elements as OrbitalElements
    expect(simetra.periodS).toBe(46_140.9776743941)
    expect(simeht.periodS).toBe(simetra.periodS)
    const a = orbitalPositionAtUT(simetra, 0)
    const b = orbitalPositionAtUT(simeht, 0)
    // Opposed apsides around SimeSystem, despite their unequal radii.
    expect(a.x * b.x + a.y * b.y + a.z * b.z).toBeLessThan(0)
    expect(vectorDistance(a, orbitalPositionAtUT(simetra, simetra.periodS))).toBeLessThan(1e-6)
    expect(vectorDistance(b, orbitalPositionAtUT(simeht, simeht.periodS))).toBeLessThan(1e-6)
  })

  it('uses parent-only gravity for ordinary patched-conic periods, including Aralc-B', () => {
    // Pinned a=13,166,710,000 m, parent mass=3.30e28 kg, G=6.67408e-11.
    // No finalizeOrbit=true or active period override is present in Aralc-B.cfg.
    expect(reference('aralcb').elements.periodS).toBeCloseTo(6_396_510.24353853, 7)
    expect(reference('aralcb').elements.periodS).not.toBeCloseTo(5_846_574.954854435, 0)
  })

  it('publishes verified parent gravity and the default Kerbol physical overrides', () => {
    expect(kcalbelohOrbitalGravitationalParameters['kcalbeloh:kcalbeloh']).toBe(1.178305e31 * 6.67408e-11)
    expect(kcalbelohOrbitalGravitationalParameters['kcalbeloh:simesystem']).toBe(5.7293e24 * 6.67408e-11)
    expect(kcalbelohOrbitalGravitationalParameters['stock:kerbol']).toBe(1.75654591319326e28 * 6.67408e-11)
    expect(kcalbelohOrbitalRadiusOverrides).toEqual({ 'stock:kerbol': 63_245_400 })
  })

  it('pins the config, period semantics, and default-size source without mutable records', () => {
    expect(kcalbelohConfigCommit).toBe('1c61f4d3a9d72c76054855c4ee9330d3a3ee85a9')
    expect(kcalbelohOrbitalSources.map(source => source.url).join(' ')).toContain(kcalbelohConfigCommit)
    expect(kcalbelohOrbitalSources.find(source => source.id === 'kcalbeloh-star-size-orbits')?.url).toMatch(/RealisticStarSize\.cfg#L65$/)
    expect(Object.isFrozen(kcalbelohOrbitalElements)).toBe(true)
    for (const row of kcalbelohOrbitalElements) {
      expect(Object.isFrozen(row)).toBe(true)
      expect(Object.isFrozen(row.elements)).toBe(true)
    }
  })
})
