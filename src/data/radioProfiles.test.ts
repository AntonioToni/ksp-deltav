import { describe, expect, it } from 'vitest'
import { clientAntennas, dsnLevels, relayAntennas, vesselAntennas } from './commnet'
import { defaultRadioProfileId, getRadioProfile, radioProfileOptions } from './radioProfiles'
import { calculateRelayPlan, type RelayNetworkInput } from '../utils/relay'

describe('CommNet installation profiles', () => {
  it('keeps stock presets unchanged and defaults to bare RSS only for the built-in RSS pack', () => {
    const stock = getRadioProfile('stock')
    expect(stock.relayAntennas).toEqual(relayAntennas)
    expect(stock.clientAntennas).toEqual(clientAntennas)
    expect(stock.vesselAntennas).toEqual(vesselAntennas)
    expect(stock.dsnLevels).toEqual(dsnLevels)
    expect(defaultRadioProfileId('rss')).toBe('rss')
    for (const packId of ['stock', 'opm', 'stock-kcalbeloh', 'opm-kcalbeloh', 'custom', 'RSS', 'rss-custom']) {
      expect(defaultRadioProfileId(packId)).toBe('stock')
    }
    expect(radioProfileOptions.map(profile => profile.id)).toEqual(['stock', 'rss', 'rss-cbk'])
  })

  it.each(['rss', 'rss-cbk'] as const)('applies the RSS patch to every %s transmitter while preserving part identities and combination rules', id => {
    const profile = getRadioProfile(id)
    expect(profile.vesselAntennas).toHaveLength(vesselAntennas.length)
    expect(profile.vesselAntennas).toEqual(vesselAntennas.map(antenna => ({ ...antenna, power: antenna.power * 20 })))
    expect(profile.relayAntennas.map(antenna => antenna.id)).toEqual(relayAntennas.map(antenna => antenna.id))
    expect(profile.clientAntennas.map(antenna => antenna.id)).toEqual(clientAntennas.map(antenna => antenna.id))
    expect(profile.clientAntennas.find(antenna => antenna.id === 'internal')?.power).toBe(100_000)
  })

  it('changes DSN powers only for the RSS installation with CustomBarnKit', () => {
    expect(getRadioProfile('rss').dsnLevels).toEqual(dsnLevels)
    expect(getRadioProfile('rss-cbk').dsnLevels.map(level => level.power)).toEqual([5e9, 5e11, 5e13])
    expect(getRadioProfile('rss-cbk').dsnLevels.map(level => level.id)).toEqual(dsnLevels.map(level => level.id))
  })

  it('uses installation-specific Normal difficulty occlusion defaults', () => {
    expect(getRadioProfile('stock').normalOcclusion).toEqual({ atmospheric: .75, vacuum: .9 })
    expect(getRadioProfile('rss').normalOcclusion).toEqual({ atmospheric: 1, vacuum: 1 })
    expect(getRadioProfile('rss-cbk').normalOcclusion).toEqual({ atmospheric: 1, vacuum: 1 })
  })

  it('pins both RSS patch and occlusion references', () => {
    const urls = getRadioProfile('rss').sources.map(source => source.url)
    expect(urls).toContain('https://github.com/KSP-RO/RealSolarSystem/blob/75139b961567f4dab61af83fe162a7e52026558b/GameData/RealSolarSystem/DSN_Ranges.cfg')
    expect(urls).toContain('https://github.com/KSP-RO/RealSolarSystem/blob/75139b961567f4dab61af83fe162a7e52026558b/Source/CommNetFixer.cs')
    expect(getRadioProfile('rss-cbk').sources).toEqual(getRadioProfile('rss').sources)
  })

  it('freezes profiles and their reference data without mutating the original stock catalog', () => {
    const before = structuredClone({ clientAntennas, relayAntennas, dsnLevels })
    expect(Object.isFrozen(radioProfileOptions)).toBe(true)
    for (const profile of radioProfileOptions) {
      expect(Object.isFrozen(profile)).toBe(true)
      expect(Object.isFrozen(profile.normalOcclusion)).toBe(true)
      for (const catalog of [profile.relayAntennas, profile.clientAntennas, profile.vesselAntennas, profile.dsnLevels, profile.sources]) {
        expect(Object.isFrozen(catalog)).toBe(true)
        expect(catalog.every(Object.isFrozen)).toBe(true)
      }
    }
    expect({ clientAntennas, relayAntennas, dsnLevels }).toEqual(before)
  })
})

describe('RSS reference radio links', () => {
  const baseInput: RelayNetworkInput = {
    body: { radiusM: 6_378_137, gravitationalParameter: 3.986004418e14, atmosphereHeightM: 140_000 },
    hasSurface: true, satelliteCount: 3, altitudeM: 8_000_000,
    relayPower: 0, clientPower: 0, dsnPower: 0, rangeMultiplier: 1,
    occlusionFactor: 1, phaseDeg: 0, stationLongitudeDeg: 0, safetyMarginM: 10_000,
    deploymentMode: 'lower',
  }

  it.each([
    { id: 'rss' as const, dsnRangeM: 5_000_000_000 },
    { id: 'rss-cbk' as const, dsnRangeM: 70_710_678_118.65475 },
  ])('uses final preset powers exactly once for $id', ({ id, dsnRangeM }) => {
    const profile = getRadioProfile(id)
    const relayPower = profile.relayAntennas.find(antenna => antenna.id === 'hg-5')!.power
    const clientPower = profile.clientAntennas.find(antenna => antenna.id === 'communotron-16')!.power
    expect(relayPower).toBe(100_000_000)
    expect(clientPower).toBe(10_000_000)
    const plan = calculateRelayPlan({ ...baseInput, relayPower, clientPower, dsnPower: profile.dsnLevels[2]!.power })
    if (plan.status !== 'success') throw new Error(plan.errors.join('\n'))
    // Independent reference cases: R = sqrt(Pa × Pb), at a 1× range setting.
    expect(plan.neighborRangeM).toBe(100_000_000)
    expect(plan.surfaceRangeM).toBeCloseTo(31_622_776.60168379, 6)
    expect(plan.dsnRangeM).toBeCloseTo(dsnRangeM, 3)
  })
})
