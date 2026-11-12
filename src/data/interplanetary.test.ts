import { describe, expect, it } from 'vitest'
import { getInterplanetaryPresets, interplanetarySources } from './interplanetary'
import { planetPacks } from './planetPacks'
import { stockPack } from './stock'
import { opmPack } from './opm'
import { rssPack } from './rss'
import {
  stockKcalbelohPack, opmKcalbelohPack,
  stockKcalbelohNoWormholesPack, opmKcalbelohNoWormholesPack,
} from './kcalbeloh'
import { kcalbelohBodyFacts } from './kcalbelohReference'

describe('interplanetary default-scale orbital references', () => {
  it.each([
    { pack: stockPack, count: 7 }, { pack: opmPack, count: 10 }, { pack: rssPack, count: 11 },
    { pack: stockKcalbelohPack, count: 20 }, { pack: opmKcalbelohPack, count: 23 },
    { pack: stockKcalbelohNoWormholesPack, count: 20 }, { pack: opmKcalbelohNoWormholesPack, count: 23 },
  ])('supports $count physical planet references in $pack.id without modifying the pack', ({ pack, count }) => {
    const original = structuredClone(pack)
    const result = getInterplanetaryPresets(pack)
    expect(result.orbits).toHaveLength(count)
    expect(pack).toEqual(original)
    const sourceIds = new Set(interplanetarySources.map(source => source.id))
    const bodyById = new Map(pack.bodies.map(body => [body.id, body]))
    const centerById = new Map(result.centers.map(center => [center.id, center]))
    expect(new Set(result.orbits.map(orbit => orbit.id)).size).toBe(count)
    for (const orbit of result.orbits) {
      expect(bodyById.get(orbit.id)).toMatchObject({ kind: 'planet', parentId: orbit.parentBodyId })
      expect(['star', 'black-hole']).toContain(bodyById.get(orbit.parentBodyId)?.kind)
      expect(result.orbits.filter(other => other.parentBodyId === orbit.parentBodyId).length).toBeGreaterThanOrEqual(2)
      expect(orbit.semiMajorAxisM).toBeGreaterThan(centerById.get(orbit.parentBodyId)!.radiusM)
      expect(orbit.eccentricity).toBeGreaterThanOrEqual(0)
      expect(orbit.eccentricity).toBeLessThan(1)
      expect(sourceIds.has(orbit.sourceId)).toBe(true)
    }
    for (const center of result.centers) expect(sourceIds.has(center.sourceId)).toBe(true)
  })

  it('retains source units for Kerbin and Duna and converts the Kerbol radius from km', () => {
    const result = getInterplanetaryPresets(stockPack)
    expect(result.centers).toEqual([{
      id: 'stock:kerbol', name: 'Kerbol', color: stockPack.bodies.find(body => body.id === 'stock:kerbol')!.color,
      radiusM: 261_600_000, sourceId: 'signal-kerbol-radius',
    }])
    expect(result.orbits.find(orbit => orbit.id === 'stock:kerbin')).toMatchObject({
      semiMajorAxisM: 13_599_840_256, eccentricity: 0,
    })
    expect(result.orbits.find(orbit => orbit.id === 'stock:duna')).toMatchObject({
      semiMajorAxisM: 20_726_155_264, eccentricity: .051,
    })
    expect(interplanetarySources.find(source => source.id === 'signal-kerbol-radius')?.url)
      .toBe('https://github.com/Arrowstar/ksptot/blob/9972b57398742263af12374652799db210395499/bodies.ini')
  })

  it('uses the RSS Sun physical radius and pinned Sun.cfg path, not a fabricated relay body', () => {
    const result = getInterplanetaryPresets(rssPack)
    expect(result.centers).toMatchObject([{ id: 'rss:sun', radiusM: 696_342_000 }])
    expect(interplanetarySources.find(source => source.id === 'signal-rss-sun-radius')?.url)
      .toBe('https://github.com/KSP-RO/RealSolarSystem/blob/75139b961567f4dab61af83fe162a7e52026558b/GameData/RealSolarSystem/RSSKopernicus/Sun.cfg')
    expect(result.orbits.find(orbit => orbit.id === 'rss:earth')?.semiMajorAxisM).toBe(149_598_261_150.4425)
    expect(result.orbits.some(orbit => orbit.id === 'rss:moon')).toBe(false)
  })

  it('respects the OPM hierarchy instead of keeping Stock Eeloo as a solar planet', () => {
    expect(getInterplanetaryPresets(stockPack).orbits.some(orbit => orbit.id === 'stock:eeloo')).toBe(true)
    const result = getInterplanetaryPresets(opmPack)
    expect(result.orbits.some(orbit => orbit.id === 'stock:eeloo')).toBe(false)
    expect(result.orbits.filter(orbit => orbit.id.startsWith('opm:')).map(orbit => orbit.id)).toEqual([
      'opm:sarnus', 'opm:urlum', 'opm:neidon', 'opm:plock',
    ])
    expect(result.orbits.find(orbit => orbit.id === 'opm:urlum')).toMatchObject({
      parentBodyId: 'stock:kerbol', semiMajorAxisM: 254_317_012_787,
    })
  })

  it('provides only local Kcalbeloh groups with at least two supported planetary orbits', () => {
    const result = getInterplanetaryPresets(stockKcalbelohPack)
    expect(Object.fromEntries(result.centers.map(center => [center.id,
      result.orbits.filter(orbit => orbit.parentBodyId === center.id).length]))).toEqual({
      'stock:kerbol': 7, 'kcalbeloh:kcalbeloh': 4, 'kcalbeloh:maelg': 2,
      'kcalbeloh:sunorc': 4, 'kcalbeloh:aralca': 3,
    })
    for (const center of result.centers.filter(center => center.id.startsWith('kcalbeloh:'))) {
      expect(center.radiusM).toBe(kcalbelohBodyFacts.find(fact => fact.bodyId === center.id)!.radiusM)
    }
    expect(result.centers.find(center => center.id === 'kcalbeloh:maelg')?.radiusM).toBe(25_584_688 * .241764)
    expect(result.centers.some(center => center.id === 'kcalbeloh:aralcb')).toBe(false)
    for (const body of ['simetra', 'simeht', 'noira', 'arorua', 'wh3141a', 'wh3141b', 'tot']) {
      expect(result.orbits.some(orbit => orbit.id === `kcalbeloh:${body}`), body).toBe(false)
    }
  })

  it('keeps orbital reference geometry independent of wormhole availability', () => {
    expect(getInterplanetaryPresets(stockKcalbelohNoWormholesPack)).toEqual(getInterplanetaryPresets(stockKcalbelohPack))
    expect(getInterplanetaryPresets(opmKcalbelohNoWormholesPack)).toEqual(getInterplanetaryPresets(opmKcalbelohPack))
  })

  it('requires manual geometry for custom or unsupported installation IDs', () => {
    for (const id of ['custom-stock', 'rss-rescaled', 'stock-kcalbeloh-custom', 'future-pack']) {
      expect(getInterplanetaryPresets({ ...stockPack, id })).toEqual({ orbits: [], centers: [] })
    }
  })

  it('does not match a known name or ID after its physical parent or kind changes', () => {
    const changed = {
      ...stockPack,
      bodies: stockPack.bodies.map(body => body.id === 'stock:duna' ? { ...body, parentId: 'stock:jool' }
        : body.id === 'stock:eve' ? { ...body, kind: 'moon' as const } : body),
    }
    const result = getInterplanetaryPresets(changed)
    expect(result.orbits.some(orbit => ['stock:duna', 'stock:eve'].includes(orbit.id))).toBe(false)
  })

  it('returns isolated values that callers cannot use to mutate the catalogs', () => {
    const first = getInterplanetaryPresets(stockPack)
    first.orbits[0]!.semiMajorAxisM = 1
    first.centers[0]!.radiusM = 1
    expect(getInterplanetaryPresets(stockPack).orbits[0]!.semiMajorAxisM).toBeGreaterThan(1)
    expect(getInterplanetaryPresets(stockPack).centers[0]!.radiusM).toBe(261_600_000)
    expect(planetPacks.every(pack => getInterplanetaryPresets(pack).orbits.length >= 2)).toBe(true)
  })
})
