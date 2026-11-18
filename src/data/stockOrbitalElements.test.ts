import { describe, expect, it } from 'vitest'
import { stockOrbitalElements, stockOrbitalElementsSource } from './stockOrbitalElements'
import { opmOrbitalElements, opmOrbitalElementsSource } from './opmOrbitalElements'
import { stockPhysicalReferences } from './stockPhysics'
import { opmReferences } from './opmReference'
import { gameDateToUT } from '../utils/gameTime'
import { orbitalPositionAtTrueAnomaly, orbitalPositionAtUT, validateOrbitalElements, vectorDistance } from '../utils/orbitalGeometry'

const stock = (id: string) => stockOrbitalElements.find(reference => reference.bodyId === `stock:${id}`)!
const opm = (id: string) => opmOrbitalElements.find(reference => reference.bodyId === id)!

describe('pinned Stock and OPM orbital-element catalogs', () => {
  it('provides full immutable Stock elements without changing the existing physical data', () => {
    expect(stockOrbitalElements.map(reference => reference.bodyId)).toEqual(stockPhysicalReferences.map(reference => reference.bodyId))
    expect(stockOrbitalElements).toHaveLength(16)
    expect(Object.isFrozen(stockOrbitalElements)).toBe(true)
    for (const reference of stockOrbitalElements) {
      const physics = stockPhysicalReferences.find(candidate => candidate.bodyId === reference.bodyId)!
      expect(reference.parentBodyId).toBe(physics.parentBodyId)
      expect(reference.elements).toMatchObject({
        semiMajorAxisM: physics.semiMajorAxisM,
        eccentricity: physics.eccentricity,
        inclinationDeg: physics.inclinationDeg,
        longitudeAscendingNodeDeg: physics.longitudeOfAscendingNodeDeg,
        epochS: 0,
      })
      expect(validateOrbitalElements(reference.elements)).toEqual([])
      expect(Object.isFrozen(reference)).toBe(true)
      expect(Object.isFrozen(reference.elements)).toBe(true)
    }
  })

  it('converts KSPTOT mean anomaly from degrees once, preserving nonzero periapsis angles', () => {
    // The game-exported degree values retain the stock float precision; do not
    // silently replace them with rounded conceptual values such as 3.14 rad.
    expect(stock('kerbin').elements.meanAnomalyAtEpochRad).toBeCloseTo(3.140000104910371, 14)
    expect(stock('jool').elements.meanAnomalyAtEpochRad).toBeCloseTo(.10000000149560348, 14)
    expect(stock('mun').elements.meanAnomalyAtEpochRad).toBeCloseTo(1.7000000476782073, 14)
    expect(stock('minmus').elements.meanAnomalyAtEpochRad).toBeCloseTo(.8999999761627453, 14)
    expect(stock('dres').elements.argumentOfPeriapsisDeg).toBe(90)
    expect(stock('minmus').elements.argumentOfPeriapsisDeg).toBe(38)
    expect(stock('eeloo').elements.argumentOfPeriapsisDeg).toBe(260)
    expect(stock('kerbin').elements.periodS).toBeCloseTo(9_203_544.617501413, 6)
    expect(stock('dres').elements.periodS).toBeCloseTo(47_893_063.138593175, 5)
  })

  it('places eccentric Dres at its source periapsis and apoapsis distances in its inclined plane', () => {
    const orbit = stock('dres').elements
    const periapsis = orbitalPositionAtTrueAnomaly(orbit, 0)
    const apoapsis = orbitalPositionAtTrueAnomaly(orbit, 180)
    expect(Math.hypot(periapsis.x, periapsis.y, periapsis.z)).toBeCloseTo(34_917_642_713.565, 3)
    expect(Math.hypot(apoapsis.x, apoapsis.y, apoapsis.z)).toBeCloseTo(46_761_053_692.435, 3)
    expect(periapsis.z).toBeGreaterThan(0)
    expect(apoapsis.z).toBeLessThan(0)
  })

  it.each([
    { minute: 58, hour: 1, utS: 69_019_080, distanceM: 23_001_502_114.423176 },
    { minute: 1, hour: 2, utS: 69_019_260, distanceM: 23_002_038_412.735855 },
  ])('naturally reproduces the Year 8 Day 214 $hour:$minute Dres comparison', ({ minute, hour, utS, distanceM }) => {
    const time = gameDateToUT({ year: 8, day: 214, hour, minute, second: 0 }, 'kerbin')
    expect(time).toEqual({ status: 'success', utS })
    // Independently evaluated Cartesian rotation + Kepler solution from the
    // pinned bodies.ini, not a special case for the in-game screenshot.
    const kerbin = orbitalPositionAtUT(stock('kerbin').elements, utS)
    const dres = orbitalPositionAtUT(stock('dres').elements, utS)
    expect(vectorDistance(kerbin, dres)).toBeCloseTo(distanceM, 1)
  })

  it('provides full OPM elements with the original planet and moon hierarchy', () => {
    expect(opmOrbitalElements).toHaveLength(16)
    expect(opmOrbitalElements.map(reference => reference.bodyId)).toEqual(opmReferences.map(reference => reference.bodyId))
    expect(Object.isFrozen(opmOrbitalElements)).toBe(true)
    for (const reference of opmOrbitalElements) {
      const physics = opmReferences.find(candidate => candidate.bodyId === reference.bodyId)!
      expect(reference.parentBodyId).toBe(physics.parentBodyId)
      expect(reference.elements.semiMajorAxisM).toBe(physics.semiMajorAxisM)
      expect(validateOrbitalElements(reference.elements)).toEqual([])
      expect(Object.isFrozen(reference.elements)).toBe(true)
    }
    expect(opm('opm:tal').parentBodyId).toBe('opm:wal')
    expect(opm('opm:thatmo').elements.inclinationDeg).toBe(161.1)
    expect(opm('opm:nissee').elements.eccentricity).toBe(.72)
  })

  it('inherits Eeloo’s unwritten stock elements when OPM reparents its orbit', () => {
    const eeloo = opm('stock:eeloo')
    expect(eeloo.parentBodyId).toBe('opm:sarnus')
    expect(eeloo.elements).toMatchObject({ semiMajorAxisM: 19_105_978, eccentricity: .0034, inclinationDeg: 2.3, longitudeAscendingNodeDeg: 55 })
    expect(eeloo.elements.argumentOfPeriapsisDeg).toBe(stock('eeloo').elements.argumentOfPeriapsisDeg)
    expect(eeloo.elements.meanAnomalyAtEpochRad).toBe(stock('eeloo').elements.meanAnomalyAtEpochRad)
    expect(eeloo.elements.epochS).toBe(stock('eeloo').elements.epochS)
    expect(eeloo.elements.periodS).toBeCloseTo(57_914.78373306068, 7)
  })

  it('keeps OPM radians and nonzero UT epochs as supplied by each config', () => {
    expect(opm('opm:sarnus').elements).toMatchObject({ meanAnomalyAtEpochRad: 2.88114666938782, epochS: 359.279999999964 })
    expect(opm('opm:urlum').elements).toMatchObject({ meanAnomalyAtEpochRad: 5.59607362747192, epochS: 422.539999999906 })
    expect(opm('opm:polta').elements).toMatchObject({ argumentOfPeriapsisDeg: 60, meanAnomalyAtEpochRad: 1.5209, epochS: 878.1399 })
    expect(opm('opm:hale').elements.periodS).toBeCloseTo(23_555.313837923208, 7)
    expect(opm('opm:ovok').elements.periodS).toBeCloseTo(29_440.147007603573, 7)
  })

  it('pins both data sources to reviewed commits', () => {
    expect(stockOrbitalElementsSource.url).toBe('https://github.com/Arrowstar/ksptot/blob/9972b57398742263af12374652799db210395499/bodies.ini')
    expect(opmOrbitalElementsSource.url).toContain('ffedf02e23d2d620e1018d1467f5e485f7950fa0')
    expect(stockOrbitalElements.every(reference => reference.sourceId === stockOrbitalElementsSource.id)).toBe(true)
    expect(opmOrbitalElements.every(reference => reference.sourceId === opmOrbitalElementsSource.id)).toBe(true)
  })
})
