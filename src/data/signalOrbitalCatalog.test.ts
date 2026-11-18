import { describe, expect, it } from 'vitest'
import { getSignalOrbitalCatalog } from './signalOrbitalCatalog'
import { stockPack } from './stock'
import { opmPack } from './opm'
import { rssPack } from './rss'
import {
  stockKcalbelohPack, opmKcalbelohPack,
  stockKcalbelohNoWormholesPack, opmKcalbelohNoWormholesPack,
} from './kcalbeloh'
import { stockCentralMu, stockPhysicalReferences } from './stockPhysics'
import { kcalbelohBodyFacts } from './kcalbelohReference'
import { kcalbelohOrbitalGravitationalParameters } from './kcalbelohOrbitalElements'

const fields = [
  'semiMajorAxisM', 'eccentricity', 'inclinationDeg', 'longitudeAscendingNodeDeg',
  'argumentOfPeriapsisDeg', 'meanAnomalyAtEpochRad', 'epochS', 'periodS',
] as const

describe('reviewed Signals orbital catalogs', () => {
  it.each([
    { pack: stockPack, count: 16 }, { pack: opmPack, count: 31 }, { pack: rssPack, count: 32 },
    { pack: stockKcalbelohPack, count: 41 }, { pack: opmKcalbelohPack, count: 56 },
    { pack: stockKcalbelohNoWormholesPack, count: 41 },
    { pack: opmKcalbelohNoWormholesPack, count: 56 },
  ])('retains every planet/moon and its actual parent in $pack.id', ({ pack, count }) => {
    const original = structuredClone(pack)
    const catalog = getSignalOrbitalCatalog(pack)
    expect(catalog.selectableBodyIds).toHaveLength(count)
    expect(new Set(catalog.selectableBodyIds).size).toBe(count)
    expect(catalog.bodies.some(body => body.kind === 'wormhole')).toBe(false)
    const byId = new Map(catalog.bodies.map(body => [body.id, body]))
    for (const id of catalog.selectableBodyIds) {
      const body = byId.get(id)!
      expect(['planet', 'moon']).toContain(body.kind)
      expect(body.parentBodyId).toBe(pack.bodies.find(candidate => candidate.id === id)!.parentId)
      expect(byId.has(body.parentBodyId!)).toBe(true)
      expect(body.radiusM).toBeGreaterThan(0)
      expect(body.orbit?.semiMajorAxisM).toBeGreaterThan(0)
    }
    const sourceIds = new Set(catalog.sources.map(source => source.id))
    for (const body of catalog.bodies) {
      if (body.sourceId) expect(sourceIds.has(body.sourceId)).toBe(true)
      if (body.periodSourceId) expect(sourceIds.has(body.periodSourceId)).toBe(true)
    }
    expect(catalog.notes).toEqual([])
    expect(pack).toEqual(original)
  })

  it('provides complete Stock elements including Dres eccentricity and the Mun parent orbit', () => {
    const catalog = getSignalOrbitalCatalog(stockPack)
    for (const id of catalog.selectableBodyIds) {
      const orbit = catalog.bodies.find(body => body.id === id)!.orbit!
      for (const field of fields) expect(Number.isFinite(orbit[field])).toBe(true)
    }
    expect(catalog.bodies.find(body => body.id === 'stock:dres')).toMatchObject({
      parentBodyId: 'stock:kerbol',
      orbit: { semiMajorAxisM: 40_839_348_203, eccentricity: .145, inclinationDeg: 5, argumentOfPeriapsisDeg: 90, epochS: 0 },
    })
    expect(catalog.bodies.find(body => body.id === 'stock:mun')).toMatchObject({
      parentBodyId: 'stock:kerbin', orbit: { semiMajorAxisM: 12_000_000 },
    })
    expect(catalog.bodies.find(body => body.id === 'stock:kerbol')).toMatchObject({
      radiusM: 261_600_000, gravitationalParameter: stockCentralMu,
    })
    expect(catalog.calendar).toBe('kerbin')
    expect(catalog.calendarEpochYear).toBe(1)
  })

  it('uses OPM Eeloo around Sarnus and retains retrograde Thatmo', () => {
    const catalog = getSignalOrbitalCatalog(opmPack)
    expect(catalog.bodies.find(body => body.id === 'stock:eeloo')).toMatchObject({
      kind: 'moon', parentBodyId: 'opm:sarnus',
      orbit: { semiMajorAxisM: 19_105_978, eccentricity: .0034 },
    })
    expect(catalog.bodies.find(body => body.id === 'opm:thatmo')?.orbit?.inclinationDeg).toBe(161.1)
    expect(catalog.bodies.find(body => body.id === 'opm:tal')?.parentBodyId).toBe('opm:wal')
    for (const id of catalog.selectableBodyIds) {
      const orbit = catalog.bodies.find(body => body.id === id)!.orbit!
      for (const field of fields) expect(Number.isFinite(orbit[field])).toBe(true)
    }
  })

  it('uses complete RSS epoch data and its Gregorian 1951 game start', () => {
    const catalog = getSignalOrbitalCatalog(rssPack)
    expect(catalog.calendar).toBe('earth')
    expect(catalog.calendarEpochYear).toBe(1951)
    expect(catalog.bodies.find(body => body.id === 'rss:moon')).toMatchObject({
      parentBodyId: 'rss:earth', orbit: { epochS: -31_542_641.784 },
    })
    for (const id of catalog.selectableBodyIds) {
      const orbit = catalog.bodies.find(body => body.id === id)!.orbit!
      for (const field of fields) expect(Number.isFinite(orbit[field])).toBe(true)
    }
    expect(catalog.sources.some(source => source.id === 'signal-rss-calendar')).toBe(true)
  })

  it('applies Kcalbeloh stellar patches only in Signals and preserves binary periods', () => {
    const physicalBefore = structuredClone({ stockPhysicalReferences, kcalbelohBodyFacts })
    const catalog = getSignalOrbitalCatalog(stockKcalbelohPack)
    const kerbol = catalog.bodies.find(body => body.id === 'stock:kerbol')!
    expect(kerbol.radiusM).toBe(63_245_400)
    expect(kerbol.gravitationalParameter).toBe(kcalbelohOrbitalGravitationalParameters['stock:kerbol'])
    const kerbin = catalog.bodies.find(body => body.id === 'stock:kerbin')!
    expect(kerbin.orbit?.periodS).toBe(2 * Math.PI * Math.sqrt(13_599_840_256 ** 3 / kerbol.gravitationalParameter!))
    expect(kerbin.periodSourceId).toBe('kcalbeloh-config-1.1.8')
    for (const id of ['kcalbeloh:simetra', 'kcalbeloh:simeht']) {
      expect(catalog.bodies.find(body => body.id === id)).toMatchObject({
        parentBodyId: 'kcalbeloh:simesystem', orbit: { periodS: 46_140.9776743941 },
      })
    }
    expect(catalog.bodies.find(body => body.id === 'kcalbeloh:arorua')?.parentBodyId).toBe('kcalbeloh:aralcb')
    expect(catalog.bodies.find(body => body.id === 'kcalbeloh:noira')?.parentBodyId).toBe('kcalbeloh:simesystem')
    expect(catalog.bodies.find(body => body.id === 'kcalbeloh:simesystem')?.radiusM).toBe(10_000)
    expect(getSignalOrbitalCatalog(stockPack).bodies.find(body => body.id === 'stock:kerbol')?.radiusM).toBe(261_600_000)
    expect({ stockPhysicalReferences, kcalbelohBodyFacts }).toEqual(physicalBefore)
  })

  it('retains missing/conflicting Kcalbeloh date elements and source explanations', () => {
    const catalog = getSignalOrbitalCatalog(stockKcalbelohPack)
    const distantRoot = catalog.bodies.find(body => body.id === 'kcalbeloh:kcalbeloh')!
    expect(distantRoot.orbit?.epochS).toBeUndefined()
    expect(distantRoot.orbit?.meanAnomalyAtEpochRad).toBe(0)
    expect(distantRoot.limitations?.join(' ')).toMatch(/epoch/)
    const efil = catalog.bodies.find(body => body.id === 'kcalbeloh:efil')!
    expect(efil.orbit?.meanAnomalyAtEpochRad).toBeUndefined()
    expect(efil.orbit?.epochS).toBe(0)
    expect(efil.limitations?.join(' ')).toMatch(/12 radians.*184 degrees/)
  })

  it('does not identify imported data by names or borrowed built-in IDs', () => {
    const catalog = getSignalOrbitalCatalog({ ...stockPack, id: 'my-imported-stock' })
    expect(catalog.selectableBodyIds).toHaveLength(16)
    expect(catalog.bodies.every(body => body.orbit === undefined)).toBe(true)
    expect(catalog.bodies.every(body => Number.isNaN(body.radiusM))).toBe(true)
    expect(catalog.sources).toEqual([])
    expect(catalog.notes.join(' ')).toMatch(/custom or imported.*Advanced.*Manual link distance/)
  })

  it('does not reuse a known orbit when a built-in body parent or kind changes', () => {
    const catalog = getSignalOrbitalCatalog({
      ...stockPack,
      bodies: stockPack.bodies.map(body => body.id === 'stock:duna' ? { ...body, parentId: 'stock:jool' }
        : body.id === 'stock:eve' ? { ...body, kind: 'moon' as const } : body),
    })
    for (const id of ['stock:duna', 'stock:eve']) {
      const body = catalog.bodies.find(candidate => candidate.id === id)!
      expect(body.orbit).toBeUndefined()
      expect(Number.isNaN(body.radiusM)).toBe(true)
    }
    expect(catalog.notes).toHaveLength(2)
  })

  it('keeps radio geometry independent of wormhole availability', () => {
    expect(getSignalOrbitalCatalog(stockKcalbelohNoWormholesPack)).toEqual(getSignalOrbitalCatalog(stockKcalbelohPack))
    expect(getSignalOrbitalCatalog(opmKcalbelohNoWormholesPack)).toEqual(getSignalOrbitalCatalog(opmKcalbelohPack))
  })

  it('returns isolated objects that cannot mutate the trusted references', () => {
    const catalog = getSignalOrbitalCatalog(stockPack)
    catalog.bodies.find(body => body.id === 'stock:dres')!.orbit!.semiMajorAxisM = 1
    catalog.sources[0]!.url = 'changed'
    const next = getSignalOrbitalCatalog(stockPack)
    expect(next.bodies.find(body => body.id === 'stock:dres')!.orbit!.semiMajorAxisM).toBe(40_839_348_203)
    expect(next.sources[0]!.url).not.toBe('changed')
  })
})
