import { describe, expect, it } from 'vitest'
import { findRelayBodyPreset } from './commnet'
import { opmPack } from './opm'
import { stockPack } from './stock'
import { opmCentralMu, opmConfigBase, opmConfigCommit, opmConfigSource, opmHomeReference, opmReferences } from './opmReference'

describe('pinned modern OPM physical and orbital references', () => {
  it('covers each OPM context once, including Eeloo under Sarnus and nested Tal and Karen', () => {
    expect(opmReferences).toHaveLength(16)
    expect(new Set(opmReferences.map(row => row.bodyId)).size).toBe(16)
    const addedContexts = opmPack.bodies.filter(body => body.id.startsWith('opm:') || body.id === 'stock:eeloo')
    expect(new Set(opmReferences.map(row => row.bodyId))).toEqual(new Set(addedContexts.map(body => body.id)))
    for (const reference of opmReferences) {
      expect(opmPack.bodies.find(body => body.id === reference.bodyId)?.parentId).toBe(reference.parentBodyId)
    }
    expect(opmReferences.find(row => row.bodyId === 'stock:eeloo')?.parentBodyId).toBe('opm:sarnus')
    expect(opmReferences.find(row => row.bodyId === 'opm:tal')?.parentBodyId).toBe('opm:wal')
    expect(opmReferences.find(row => row.bodyId === 'opm:karen')?.parentBodyId).toBe('opm:plock')
  })

  it('retains source eccentricity and inclination instead of silently making retrograde or eccentric bodies circular and prograde in the catalog', () => {
    expect(opmReferences.find(row => row.bodyId === 'opm:thatmo')).toMatchObject({
      semiMajorAxisM: 32_300_895, eccentricity: .00043, inclinationDeg: 161.1,
      radiusM: 286_000, atmosphereHeightM: 35_000,
    })
    expect(opmReferences.find(row => row.bodyId === 'opm:nissee')).toMatchObject({ eccentricity: .72, inclinationDeg: 29.56 })
    expect(opmReferences.find(row => row.bodyId === 'opm:plock')).toMatchObject({ eccentricity: .26, inclinationDeg: 6.15 })
    expect(opmReferences.find(row => row.bodyId === 'opm:tal')).toMatchObject({ eccentricity: 0, inclinationDeg: 1.9 })
  })

  it('uses SI physical constants that agree with the shared relay catalog', () => {
    for (const reference of opmReferences) {
      const body = opmPack.bodies.find(body => body.id === reference.bodyId)!
      const relay = findRelayBodyPreset(body)!
      expect(reference.radiusM, reference.bodyId).toBe(relay.radiusM)
      expect(reference.gravitationalParameter, reference.bodyId).toBe(relay.gravitationalParameter)
      expect(reference.atmosphereHeightM, reference.bodyId).toBe(relay.atmosphereHeightM)
      expect(reference.sphereOfInfluenceM, reference.bodyId).toBeCloseTo(relay.sphereOfInfluenceM!, 5)
      expect(reference.eccentricity, reference.bodyId).toBeGreaterThanOrEqual(0)
      expect(reference.eccentricity, reference.bodyId).toBeLessThan(1)
      expect(reference.inclinationDeg, reference.bodyId).toBeGreaterThanOrEqual(0)
      expect(reference.inclinationDeg, reference.bodyId).toBeLessThanOrEqual(180)
    }
    expect(opmReferences.find(row => row.bodyId === 'opm:sarnus')?.gravitationalParameter).toBe(82_089_701_953_000)
    expect(opmReferences.find(row => row.bodyId === 'stock:eeloo')?.gravitationalParameter).toBe(74_410_814_527)
    expect(opmCentralMu).toBe(1_172_332_794_832_490_500)
    expect(opmHomeReference).toEqual({ radiusM: 600_000, gravitationalParameter: 3_531_600_000_000, parkingAltitudeM: 80_000, semiMajorAxisM: 13_599_840_256 })
  })

  it('places every chosen parking orbit above the modern atmosphere and below the actual body SOI', () => {
    for (const reference of opmReferences) {
      expect(Number.isFinite(reference.parkingAltitudeM), reference.bodyId).toBe(true)
      expect(reference.parkingAltitudeM, reference.bodyId).toBeGreaterThan(reference.atmosphereHeightM)
      expect(reference.radiusM + reference.parkingAltitudeM, reference.bodyId).toBeLessThan(reference.sphereOfInfluenceM)
      const node = opmPack.nodes.find(node => node.bodyId === reference.bodyId && node.kind === 'orbit')!
      expect(node.altitudeKm, reference.bodyId).toBe(reference.parkingAltitudeM / 1000)
    }
    expect(opmReferences.filter(row => row.atmosphereHeightM > 0).map(row => [row.bodyId, row.parkingAltitudeM])).toEqual([
      ['opm:sarnus', 600_000], ['opm:tekto', 120_000], ['opm:urlum', 350_000], ['opm:neidon', 280_000], ['opm:thatmo', 50_000],
    ])
  })

  it('honors small-moon SOI overrides and derives other SOIs in the correct parent context', () => {
    expect(opmReferences.find(row => row.bodyId === 'opm:hale')?.sphereOfInfluenceM).toBe(41_000)
    expect(opmReferences.find(row => row.bodyId === 'opm:ovok')?.sphereOfInfluenceM).toBe(94_000)
    expect(opmReferences.find(row => row.bodyId === 'stock:eeloo')?.sphereOfInfluenceM).toBeCloseTo(1_159_066.1568048117, 5)
    expect(opmReferences.find(row => row.bodyId === 'opm:karen')?.sphereOfInfluenceM).toBeCloseTo(939_354.3242775212, 5)
    expect(findRelayBodyPreset(stockPack.bodies.find(body => body.id === 'stock:eeloo')!)?.sphereOfInfluenceM).toBeCloseTo(119_082_941.64778017, 5)
  })

  it('pins an official source and one auditable config path per contextual body', () => {
    expect(opmConfigCommit).toBe('ffedf02e23d2d620e1018d1467f5e485f7950fa0')
    expect(opmConfigSource.url).toContain(opmConfigCommit)
    expect(opmConfigBase).toContain(`/blob/${opmConfigCommit}/`)
    expect(new Set(opmReferences.map(row => row.configPath)).size).toBe(16)
    for (const reference of opmReferences) {
      expect(reference.configPath).toMatch(/^(OuterPlanets|SarnusMoons|UrlumMoons|NeidonMoons|PlockMoons)\/[A-Za-z]+\.cfg$/)
      expect(reference.configPath).not.toContain('..')
    }
  })
})
