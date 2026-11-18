import { describe, expect, it } from 'vitest'
import { rssPhysicalReferences } from './rssPhysics'
import { RSS_GAME_START_YEAR, RSS_ORBITAL_EPOCH_S, rssOrbitalElements, rssOrbitalSources } from './rssOrbitalElements'

const byId = new Map(rssOrbitalElements.map(reference => [reference.bodyId, reference]))

describe('RSS pinned osculating orbital elements', () => {
  it('covers every supported RSS planet and moon without changing its reference hierarchy or physical orbit', () => {
    expect(rssOrbitalElements).toHaveLength(32)
    expect(byId.size).toBe(32)
    expect(rssOrbitalElements.map(reference => reference.bodyId)).toEqual(rssPhysicalReferences.map(reference => reference.bodyId))
    for (const physical of rssPhysicalReferences) {
      const reference = byId.get(physical.bodyId)!
      expect(reference.parentBodyId).toBe(physical.parentBodyId)
      expect(reference.elements).toMatchObject({
        semiMajorAxisM: physical.semiMajorAxisM,
        eccentricity: physical.eccentricity,
        inclinationDeg: physical.inclinationDeg,
        longitudeAscendingNodeDeg: physical.longitudeOfAscendingNodeDeg,
      })
      expect(Object.values(reference.elements).every(Number.isFinite)).toBe(true)
      expect(reference.elements.periodS).toBeGreaterThan(0)
    }
  })

  it('uses the B1950 orbital epoch separately from the 1951 game-calendar epoch', () => {
    expect(RSS_ORBITAL_EPOCH_S).toBe(-31_542_641.784)
    expect(RSS_GAME_START_YEAR).toBe(1951)
    expect(rssOrbitalElements.every(reference => reference.elements.epochS === RSS_ORBITAL_EPOCH_S)).toBe(true)
    // Earth.cfg explicitly gives meanAnomalyAtEpochD, not radians. Its other
    // angular elements use RSS's Earth-equatorial B1950 reference frame.
    expect(byId.get('rss:earth')!.elements).toMatchObject({
      inclinationDeg: 23.44603795469773,
      longitudeAscendingNodeDeg: 359.9965004168758,
      argumentOfPeriapsisDeg: 102.9720683296131,
    })
    expect(byId.get('rss:earth')!.elements.meanAnomalyAtEpochRad)
      .toBeCloseTo(357.0607464120944 * Math.PI / 180, 14)
  })

  it.each([
    ['rss:earth', Number('31558319.5658127656757')],
    ['rss:moon', Number('2370996.2314279161987')],
    ['rss:charon', Number('584486.1739413964719')],
  ] as const)('retains the game parent-GM-only period for %s', (id, seconds) => {
    // Independent 60-digit Decimal references: 2π√(a³/GM_parent).
    // In particular, Charon is not silently given a two-body barycentric period.
    expect(byId.get(id)!.elements.periodS).toBeCloseTo(seconds, 7)
  })

  it('retains actual satellite elements and retrograde inclination', () => {
    expect(byId.get('rss:moon')).toMatchObject({
      parentBodyId: 'rss:earth',
      elements: { argumentOfPeriapsisDeg: 199.7640930160823 },
    })
    expect(byId.get('rss:triton')!.elements).toMatchObject({
      inclinationDeg: 156.834,
      longitudeAscendingNodeDeg: 197.1953239788069,
      argumentOfPeriapsisDeg: 220.4523286895169,
    })
  })

  it('pins complete-orbit, global-epoch, and Gregorian-formatter sources and freezes the data', () => {
    expect(rssOrbitalSources.map(source => source.id)).toEqual([
      'signal-rss-orbital-elements', 'signal-rss-orbital-epoch', 'signal-rss-calendar',
    ])
    expect(rssOrbitalSources[1]!.url).toContain('75139b961567f4dab61af83fe162a7e52026558b/GameData/RealSolarSystem/RSSKopernicusSettings.cfg')
    expect(rssOrbitalSources[2]!.url).toContain('50ba770ba8a7b5ccd64110b04898e34d30faaaa8/RSSTimeFormatter/DTReplacer.cs')
    expect(byId.get('rss:earth')!.configUrl).toContain('/Earth/Earth.cfg')
    expect(Object.isFrozen(rssOrbitalElements)).toBe(true)
    expect(rssOrbitalElements.every(reference => Object.isFrozen(reference) && Object.isFrozen(reference.elements))).toBe(true)
    expect(Object.isFrozen(rssOrbitalSources)).toBe(true)
  })
})
