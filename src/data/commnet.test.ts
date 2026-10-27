import { describe, expect, it } from 'vitest'
import { stockPack } from './stock'
import { opmPack } from './opm'
import { rssPack } from './rss'
import { stockKcalbelohPack, opmKcalbelohPack } from './kcalbeloh'
import {
  clientAntennas, commNetSources, dsnLevels, findRelayBodyPreset,
  relayAntennas, relayBodyPresets, vesselAntennas,
} from './commnet'

describe('CommNet reference catalog', () => {
  it.each([stockPack, opmPack, rssPack, stockKcalbelohPack, opmKcalbelohPack])('covers every physical $shortName body in its correct parent context', pack => {
    for (const body of pack.bodies) {
      const preset = findRelayBodyPreset(body)
      if (body.kind !== 'planet' && body.kind !== 'moon') expect(preset).toBeUndefined()
      else {
        expect(preset, body.id).toBeDefined()
        expect(preset?.parentBodyId).toBe(body.parentId)
      }
    }
  })

  it('uses finite source-backed SI physics and a distinct body/parent context per row', () => {
    expect(relayBodyPresets).toHaveLength(89)
    const contexts = relayBodyPresets.map(row => JSON.stringify([row.bodyId, row.parentBodyId]))
    expect(new Set(contexts).size).toBe(contexts.length)
    const sources = new Set(commNetSources.map(source => source.id))
    for (const row of relayBodyPresets) {
      expect(Number.isFinite(row.radiusM), row.bodyId).toBe(true)
      expect(row.radiusM).toBeGreaterThan(0)
      expect(Number.isFinite(row.gravitationalParameter), row.bodyId).toBe(true)
      expect(row.gravitationalParameter).toBeGreaterThan(0)
      expect(Number.isFinite(row.atmosphereHeightM), row.bodyId).toBe(true)
      expect(row.atmosphereHeightM).toBeGreaterThanOrEqual(0)
      expect(Number.isFinite(row.sphereOfInfluenceM), row.bodyId).toBe(true)
      expect(row.sphereOfInfluenceM!, row.bodyId).toBeGreaterThan(row.radiusM + row.atmosphereHeightM)
      expect(sources.has(row.sourceId), row.bodyId).toBe(true)
    }
    for (const source of commNetSources) expect(new URL(source.url).protocol).toBe('https:')
  })

  it('converts stock kilometer and km³/s² reference units to SI without using a transfer-map altitude', () => {
    const body = stockPack.bodies.find(candidate => candidate.id === 'stock:kerbin')!
    const kerbin = findRelayBodyPreset(body)!
    expect(kerbin.radiusM).toBe(600_000)
    expect(kerbin.gravitationalParameter).toBe(3.5316e12)
    expect(kerbin.atmosphereHeightM).toBe(70_000)
    expect(kerbin.sphereOfInfluenceM).toBeCloseTo(84_159_286.4796305, 5)
    const period = 2 * Math.PI * Math.sqrt(1_100_000 ** 3 / kerbin.gravitationalParameter)
    expect(period).toBeCloseTo(3857.297555, 4)
  })

  it('keeps shared Eeloo radius and gravity while changing the OPM parent-dependent SOI', () => {
    const original = findRelayBodyPreset(stockPack.bodies.find(body => body.id === 'stock:eeloo')!)!
    const moved = findRelayBodyPreset(opmPack.bodies.find(body => body.id === 'stock:eeloo')!)!
    expect(original.radiusM).toBe(moved.radiusM)
    expect(original.gravitationalParameter).toBe(moved.gravitationalParameter)
    expect(original.sphereOfInfluenceM).toBeCloseTo(119_082_941.64778017, 5)
    expect(moved.sphereOfInfluenceM).toBeCloseTo(1_159_066.1568048117, 5)
  })

  it('uses official OPM gravity and atmospheric ceilings instead of legacy Delta-V map orbit labels', () => {
    const sarnus = findRelayBodyPreset(opmPack.bodies.find(body => body.id === 'opm:sarnus')!)!
    expect(sarnus.radiusM).toBe(5_300_000)
    expect(sarnus.gravitationalParameter).toBe(82_089_701_953_000)
    expect(sarnus.atmosphereHeightM).toBe(580_000)
    const tekto = findRelayBodyPreset(opmPack.bodies.find(body => body.id === 'opm:tekto')!)!
    expect(tekto.atmosphereHeightM).toBe(95_000)
    const thatmo = findRelayBodyPreset(opmPack.bodies.find(body => body.id === 'opm:thatmo')!)!
    expect(thatmo.atmosphereHeightM).toBe(35_000)
  })

  it('honors explicit small-moon SOI overrides from the official configs', () => {
    for (const [pack, id, expected] of [
      [opmPack, 'opm:hale', 41_000], [opmPack, 'opm:ovok', 94_000],
      [rssPack, 'rss:phobos', 47_000], [rssPack, 'rss:deimos', 45_000],
      [rssPack, 'rss:mimas', 396_000],
    ] as const) {
      expect(findRelayBodyPreset(pack.bodies.find(body => body.id === id)!)?.sphereOfInfluenceM).toBe(expected)
    }
  })

  it('uses final RSS config properties, including oblate equatorial radii and the last Titan gravity assignment', () => {
    const earth = findRelayBodyPreset(rssPack.bodies.find(body => body.id === 'rss:earth')!)!
    expect(earth.radiusM).toBe(6_371_000)
    expect(earth.gravitationalParameter).toBe(Number('3.9860043543609598e14'))
    expect(earth.atmosphereHeightM).toBe(140_000)
    const jupiter = findRelayBodyPreset(rssPack.bodies.find(body => body.id === 'rss:jupiter')!)!
    expect(jupiter.radiusM).toBeCloseTo(70_941_833.41677266, 6)
    expect(jupiter.atmosphereHeightM).toBe(1_550_000)
    const titan = findRelayBodyPreset(rssPack.bodies.find(body => body.id === 'rss:titan')!)!
    expect(titan.gravitationalParameter).toBe(8.9778648e12)
    expect(titan.atmosphereHeightM).toBe(600_000)
  })

  it('never substitutes a familiar name or a changed hierarchy for missing custom physical data', () => {
    const kerbin = stockPack.bodies.find(body => body.id === 'stock:kerbin')!
    expect(findRelayBodyPreset({ ...kerbin, id: 'custom:kerbin' })).toBeUndefined()
    expect(findRelayBodyPreset({ ...kerbin, parentId: 'custom:sun' })).toBeUndefined()
    expect(findRelayBodyPreset({ ...kerbin, name: 'Renamed compatible planet' })?.radiusM).toBe(600_000)
    const noira = stockKcalbelohPack.bodies.find(body => body.id === 'kcalbeloh:noira')!
    expect(findRelayBodyPreset({ ...noira, parentId: 'kcalbeloh:simetra' })).toBeUndefined()
    expect(findRelayBodyPreset({ ...noira, id: 'custom:noira' })).toBeUndefined()
  })

  it('adds Kcalbeloh presets without changing retained base catalog values', () => {
    const suluco = stockKcalbelohPack.bodies.find(body => body.id === 'kcalbeloh:suluco')!
    const preset = findRelayBodyPreset(suluco)!
    expect(preset.sourceId).toBe('commnet-kcalbeloh-bodies')
    expect(preset).toMatchObject({ radiusM: 520_000, gravitationalParameter: 2_253_960_436_000, atmosphereHeightM: 65_000 })
    expect(findRelayBodyPreset(opmKcalbelohPack.bodies.find(body => body.id === suluco.id)!)).toBe(preset)
    for (const pack of [stockPack, opmPack]) {
      const composed = pack.id === 'stock' ? stockKcalbelohPack : opmKcalbelohPack
      for (const body of pack.bodies.filter(body => body.kind === 'planet' || body.kind === 'moon')) {
        expect(findRelayBodyPreset(composed.bodies.find(candidate => candidate.id === body.id)!)).toBe(findRelayBodyPreset(body))
      }
    }
  })

  it('keeps single relay, client, and DSN antenna roles separate with the pinned powers', () => {
    expect(relayAntennas.map(({ id, power }) => [id, power])).toEqual([
      ['hg-5', 5_000_000], ['ra-2', 2_000_000_000], ['ra-15', 15_000_000_000], ['ra-100', 100_000_000_000],
    ])
    expect(clientAntennas.map(({ id, power }) => [id, power])).toEqual([
      ['internal', 5_000], ['communotron-16', 500_000], ['communotron-16-s', 500_000],
      ['dts-m1', 2_000_000_000], ['hg-55', 15_000_000_000], ['communotron-88-88', 100_000_000_000],
    ])
    expect(dsnLevels.map(({ id, power }) => [id, power])).toEqual([
      ['dsn1', 2_000_000_000], ['dsn2', 50_000_000_000], ['dsn3', 250_000_000_000],
    ])
    expect(Math.sqrt(relayAntennas[0]!.power * clientAntennas[1]!.power)).toBeCloseTo(1_581_138.83008419, 6)
    expect(Math.sqrt(relayAntennas[0]!.power * dsnLevels[0]!.power)).toBe(100_000_000)
  })

  it('keeps stock combinability exceptions and relay capabilities explicit', () => {
    expect(new Set(vesselAntennas.map(antenna => antenna.id)).size).toBe(10)
    expect(vesselAntennas).toEqual([...clientAntennas, ...relayAntennas])
    expect(vesselAntennas.filter(antenna => !antenna.combinable).map(antenna => antenna.id))
      .toEqual(['internal', 'communotron-16-s'])
    expect(vesselAntennas.find(antenna => antenna.id === 'communotron-16')?.combinabilityExponent).toBe(1)
    for (const antenna of vesselAntennas) {
      expect(antenna.relay).toBe(relayAntennas.some(relay => relay.id === antenna.id))
      if (antenna.combinable && antenna.id !== 'communotron-16') expect(antenna.combinabilityExponent).toBe(.75)
      if (!antenna.combinable) expect(antenna.combinabilityExponent).toBe(0)
    }
    expect(dsnLevels.every(station => !vesselAntennas.some(antenna => antenna.id === station.id))).toBe(true)
    expect(commNetSources.some(source => source.id === 'commnet-antenna-combination')).toBe(true)
  })
})
