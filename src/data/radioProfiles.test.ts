import { describe, expect, it } from 'vitest'
import { clientAntennas, dsnLevels, relayAntennas, vesselAntennas } from './commnet'
import { defaultRadioProfileId, getRadioProfile, radioProfileOptions } from './radioProfiles'
import { calculateRelayPlan, type RelayNetworkInput } from '../utils/relay'
import { calculateAntennaArray } from '../utils/antennaArray'

const kerbalismProfiles = [
  { id: 'kerbalism', baseId: 'stock', name: 'Kerbalism + CommNet', shortAntennaPower: 250_000 },
  { id: 'rss-kerbalism', baseId: 'rss', name: 'Kerbalism + RSS', shortAntennaPower: 5_000_000 },
  { id: 'rss-cbk-kerbalism', baseId: 'rss-cbk', name: 'Kerbalism + RSS + CBK', shortAntennaPower: 5_000_000 },
] as const

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
    expect(radioProfileOptions.map(profile => profile.id)).toEqual([
      'stock', 'rss', 'rss-cbk', 'kerbalism', 'rss-kerbalism', 'rss-cbk-kerbalism',
    ])
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
    expect(getRadioProfile('stock').normalOcclusionLabel).toBe('KSP normal')
    expect(getRadioProfile('rss').normalOcclusionLabel).toBe('RSS default (1.0)')
    expect(getRadioProfile('rss-cbk').normalOcclusionLabel).toBe('RSS default (1.0)')
  })

  it.each(kerbalismProfiles)('adds only the direct Communotron 8 to $id with its final installation power', ({ id, baseId, name, shortAntennaPower }) => {
    const base = getRadioProfile(baseId)
    const profile = getRadioProfile(id)
    const shortAntenna = {
      id: 'communotron-8', name: 'Communotron 8', power: shortAntennaPower,
      combinable: true, combinabilityExponent: 1, relay: false,
    }
    expect(profile.name).toBe(name)
    expect(profile.kerbalism).toBe(true)
    expect(base.kerbalism).toBeUndefined()
    expect(profile.description).toContain('Kerbalism science rates are not calculated')
    expect(profile.clientAntennas).toEqual([...base.clientAntennas, shortAntenna])
    expect(profile.vesselAntennas.filter(antenna => antenna.id !== 'communotron-8')).toEqual(base.vesselAntennas)
    expect(profile.vesselAntennas.filter(antenna => antenna.id === 'communotron-8')).toEqual([shortAntenna])
    expect(profile.relayAntennas).toEqual(base.relayAntennas)
    expect(profile.relayAntennas).toHaveLength(4)
    expect(profile.dsnLevels).toEqual(base.dsnLevels)
    expect(profile.normalOcclusion).toEqual(base.normalOcclusion)
    expect(profile.normalOcclusionLabel).toBe(base.normalOcclusionLabel)
    expect(base.vesselAntennas.some(antenna => antenna.id === 'communotron-8')).toBe(false)
  })

  it.each(kerbalismProfiles)('combines Communotron 8 as a client but rejects it for relay forwarding in $id', ({ id, shortAntennaPower }) => {
    const profile = getRadioProfile(id)
    const entries = [{ antennaId: 'communotron-8', count: 2 }]
    const clientArray = calculateAntennaArray(entries, 'client', profile.vesselAntennas)
    if (clientArray.status !== 'success') throw new Error(clientArray.errors.join('\n'))
    expect(clientArray.effectivePower).toBe(shortAntennaPower * 2)
    expect(clientArray.weightedExponent).toBe(1)
    const relayArray = calculateAntennaArray(entries, 'relay', profile.vesselAntennas)
    expect(relayArray).toEqual({ status: 'invalid', errors: ['Relay forwarding arrays can only contain relay-capable antennas.'] })
  })

  it('pins both RSS patch and occlusion references', () => {
    const urls = getRadioProfile('rss').sources.map(source => source.url)
    expect(urls).toContain('https://github.com/KSP-RO/RealSolarSystem/blob/75139b961567f4dab61af83fe162a7e52026558b/GameData/RealSolarSystem/DSN_Ranges.cfg')
    expect(urls).toContain('https://github.com/KSP-RO/RealSolarSystem/blob/75139b961567f4dab61af83fe162a7e52026558b/Source/CommNetFixer.cs')
    expect(getRadioProfile('rss-cbk').sources).toEqual(getRadioProfile('rss').sources)
  })

  it.each(kerbalismProfiles)('pins the released Kerbalism 3.44 model references in $id', ({ id, baseId }) => {
    const sources = getRadioProfile(id).sources
    const kerbalismSources = sources.filter(source => source.id.startsWith('commnet-kerbalism-'))
    const sourceBase = 'https://github.com/Kerbalism/Kerbalism/blob/39f9f43afe8b4f77aff0086c3866044287694475'
    expect(kerbalismSources.map(source => source.url)).toEqual([
      `${sourceBase}/GameData/KerbalismConfig/Parts/ShortAntenna/kerbalism-antenna.cfg`,
      `${sourceBase}/src/Kerbalism/Comms/CommHandlerCommNetBase.cs`,
      `${sourceBase}/src/Kerbalism/Sim.cs`,
    ])
    expect(kerbalismSources.every(source => source.title.includes('3.44'))).toBe(true)
    expect(sources.some(source => source.url.includes('Kerbalism4'))).toBe(false)
    expect(sources.filter(source => !source.id.startsWith('commnet-kerbalism-'))).toEqual(
      getRadioProfile(baseId).sources.filter(source => source.id !== 'commnet-antenna-combination'),
    )
    expect(new Set(sources.map(source => source.id)).size).toBe(sources.length)
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

  it.each(kerbalismProfiles)('preserves the base CommNet geometry and ranges for existing antennas in $id', ({ id, baseId }) => {
    const planFor = (profileId: typeof id | typeof baseId) => {
      const profile = getRadioProfile(profileId)
      return calculateRelayPlan({
        ...baseInput,
        relayPower: profile.relayAntennas.find(antenna => antenna.id === 'hg-5')!.power,
        clientPower: profile.clientAntennas.find(antenna => antenna.id === 'communotron-16')!.power,
        dsnPower: profile.dsnLevels[2]!.power,
      })
    }
    const plan = planFor(id)
    expect(plan.status).toBe('success')
    expect(plan).toEqual(planFor(baseId))
  })

  it.each([
    { id: 'kerbalism' as const, surfaceRangeM: 1_118_033.988749895 },
    { id: 'rss-kerbalism' as const, surfaceRangeM: 22_360_679.774997897 },
    { id: 'rss-cbk-kerbalism' as const, surfaceRangeM: 22_360_679.774997897 },
  ])('uses the Communotron 8 installation power exactly once in $id', ({ id, surfaceRangeM }) => {
    const profile = getRadioProfile(id)
    const plan = calculateRelayPlan({
      ...baseInput,
      relayPower: profile.relayAntennas.find(antenna => antenna.id === 'hg-5')!.power,
      clientPower: profile.clientAntennas.find(antenna => antenna.id === 'communotron-8')!.power,
      dsnPower: profile.dsnLevels[2]!.power,
    })
    if (plan.status !== 'success') throw new Error(plan.errors.join('\n'))
    expect(plan.surfaceRangeM).toBeCloseTo(surfaceRangeM, 6)
  })
})
