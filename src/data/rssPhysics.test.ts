import { describe, expect, it } from 'vitest'
import { rssConfigBase, rssConfigCommit, rssPhysicalReferences, rssPhysicsSource } from './rssPhysics'
import { stockPhysicalReferences } from './stockPhysics'

describe('shared physical and orbital references for moon transfers', () => {
  it('retains the pinned Stock moon plane and eccentricity facts', () => {
    const reference = (id: string) => stockPhysicalReferences.find(body => body.bodyId === `stock:${id}`)
    expect(reference('mun')).toMatchObject({ eccentricity: 0, inclinationDeg: 0, longitudeOfAscendingNodeDeg: 0 })
    expect(reference('minmus')).toMatchObject({ eccentricity: 0, inclinationDeg: 6, longitudeOfAscendingNodeDeg: 78 })
    expect(reference('bop')).toMatchObject({ eccentricity: .235, inclinationDeg: 15, longitudeOfAscendingNodeDeg: 10 })
    expect(reference('pol')).toMatchObject({ eccentricity: .17085, inclinationDeg: 4.25, longitudeOfAscendingNodeDeg: 2 })
  })

  it('pins all 32 contextual RSS rows with explicit source angles and config paths', () => {
    expect(rssPhysicalReferences).toHaveLength(32)
    expect(new Set(rssPhysicalReferences.map(body => body.bodyId)).size).toBe(32)
    expect(rssPhysicsSource.url).toContain(rssConfigCommit)
    expect(rssConfigBase).toContain(`/blob/${rssConfigCommit}/`)
    for (const body of rssPhysicalReferences) {
      expect(body.parentBodyId).toMatch(/^rss:/)
      expect(body.radiusM).toBeGreaterThan(0)
      expect(body.gravitationalParameter).toBeGreaterThan(0)
      expect(body.semiMajorAxisM).toBeGreaterThan(0)
      expect(body.atmosphereHeightM).toBeGreaterThanOrEqual(0)
      expect(body.sphereOfInfluenceM).toBeGreaterThan(body.radiusM + body.atmosphereHeightM)
      expect(body.eccentricity).toBeGreaterThanOrEqual(0)
      expect(body.eccentricity).toBeLessThan(1)
      expect(body.inclinationDeg).toBeGreaterThanOrEqual(0)
      expect(body.inclinationDeg).toBeLessThanOrEqual(180)
      expect(body.longitudeOfAscendingNodeDeg).toBeGreaterThanOrEqual(0)
      expect(body.longitudeOfAscendingNodeDeg).toBeLessThan(360)
      expect(body.configPath).toMatch(/^[A-Za-z]+\/[A-Za-z]+\.cfg$/)
    }
  })

  it('retains the common source frame instead of replacing RSS moon inclinations with zero', () => {
    const io = rssPhysicalReferences.find(body => body.bodyId === 'rss:io')!
    const europa = rssPhysicalReferences.find(body => body.bodyId === 'rss:europa')!
    expect(io).toMatchObject({ inclinationDeg: 25.46409538664874, longitudeOfAscendingNodeDeg: 358.0466431678460 })
    expect(europa).toMatchObject({ inclinationDeg: 25.70364276471991, longitudeOfAscendingNodeDeg: 358.9360081847504 })
    expect(rssPhysicalReferences.find(body => body.bodyId === 'rss:triton')?.inclinationDeg).toBe(156.834)
  })

  it('retains effective RSS SOIs, including explicit overrides ahead of default floors', () => {
    const soi = (id: string) => rssPhysicalReferences.find(body => body.bodyId === `rss:${id}`)?.sphereOfInfluenceM
    expect(soi('phobos')).toBe(47_000)
    expect(soi('deimos')).toBe(45_000)
    expect(soi('mimas')).toBe(396_000)
    expect(soi('enceladus')).toBe(504_200)
    expect(soi('miranda')).toBe(471_400)
  })
})
