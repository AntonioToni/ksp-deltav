import { describe, expect, it } from 'vitest'
import { clientAntennas, dsnLevels, relayAntennas, vesselAntennas } from './commnet'
import { getKerbalismRadioProfileId } from './kerbalism'
import {
  defaultRadioProfileId, getEffectiveDsnLevels, getRadioProfile,
  MAX_DSN_MODIFIER, radioProfileOptions,
} from './radioProfiles'
import { calculateAntennaArray } from '../utils/antennaArray'
import { resolveSignalEndpointPower } from '../utils/signalEndpoint'
import { calibrateKerbalismDamping } from '../utils/signalStrength'
import { calculateRelayPlan, type RelayNetworkInput } from '../utils/relay'
import { calculateInterplanetarySignal } from '../utils/interplanetary'
import {
  calculateKerbalismBitrate, DEFAULT_KERBALISM_ANTENNA_SPEED,
  DEFAULT_KERBALISM_MINIMUM_BITS_PER_SECOND, resolveKerbalismBaseRate,
} from '../utils/kerbalismBitrate'
import { formatScienceRateBitsPerSecond } from '../utils/formatScienceRate'

const pbcIds = ['pbc', 'pbc-kerbalism'] as const
// Numerical facts from PBC 3.3.2 core ModuleManager patches. Stable planner
// identities map HG-5 to HighGainAntenna5_v2, not the deprecated legacy part.
const powers = [
  ['internal', 5_000], ['communotron-16-s', 250_000], ['communotron-16', 1_000_000],
  ['hg-5', 20_000_000], ['dts-m1', 5_000_000_000], ['ra-2', 2_000_000_000],
  ['hg-55', 25_000_000_000], ['ra-15', 20_000_000_000],
  ['communotron-88-88', 100_000_000_000], ['ra-100', 100_000_000_000],
] as const

describe('Probes Before Crew 3.3.2 radio catalogs', () => {
  it.each(pbcIds)('uses each final per-part power once in %s', id => {
    const profile = getRadioProfile(id)
    for (const [partId, power] of powers) {
      expect(profile.vesselAntennas.find(antenna => antenna.id === partId)?.power).toBe(power)
    }
    expect(profile.pbc).toBe(true)
    expect(profile.normalOcclusion).toEqual(getRadioProfile('stock').normalOcclusion)
    expect(profile.dsnLevels).toEqual(dsnLevels)
    // PBC's 0.35 recommendation must never be silently applied by selecting it.
    expect(getEffectiveDsnLevels(profile).map(level => level.power)).toEqual([2e9, 5e10, 2.5e11])
    expect(getKerbalismRadioProfileId(id)).toBe('pbc-kerbalism')
  })

  it.each(pbcIds)('inherits stock roles and combining rules under %s', id => {
    const profile = getRadioProfile(id)
    expect(profile.relayAntennas.map(antenna => antenna.id)).toEqual(relayAntennas.map(antenna => antenna.id))
    expect(profile.clientAntennas.filter(antenna => antenna.id !== 'communotron-8').map(antenna => antenna.id))
      .toEqual(clientAntennas.map(antenna => antenna.id))
    for (const stock of vesselAntennas) {
      expect(profile.vesselAntennas.find(antenna => antenna.id === stock.id)).toMatchObject({
        id: stock.id, name: stock.name, relay: stock.relay,
        combinable: stock.combinable, combinabilityExponent: stock.combinabilityExponent,
      })
    }
  })

  it('adds only the unchanged direct Communotron 8 for Kerbalism', () => {
    const pbc = getRadioProfile('pbc')
    const kerbalism = getRadioProfile('pbc-kerbalism')
    expect(pbc.kerbalism).toBeUndefined()
    expect(kerbalism.kerbalism).toBe(true)
    expect(kerbalism.vesselAntennas.filter(antenna => antenna.id !== 'communotron-8')).toEqual(pbc.vesselAntennas)
    expect(kerbalism.vesselAntennas.find(antenna => antenna.id === 'communotron-8')).toEqual({
      id: 'communotron-8', name: 'Communotron 8', power: 250_000,
      combinable: true, combinabilityExponent: 1, relay: false,
    })
  })

  it('keeps PBC an explicit installation choice independent of planet packs', () => {
    expect(radioProfileOptions.slice(-2).map(profile => [profile.id, profile.name])).toEqual([
      ['pbc', 'Probes Before Crew + CommNet'], ['pbc-kerbalism', 'Probes Before Crew + Kerbalism'],
    ])
    for (const packId of ['stock', 'opm', 'stock-kcalbeloh', 'opm-kcalbeloh', 'custom']) {
      expect(defaultRadioProfileId(packId)).toBe('stock')
    }
    expect(defaultRadioProfileId('rss')).toBe('rss')
    expect(radioProfileOptions.some(profile => profile.id.includes('pbc') && profile.id.includes('rss'))).toBe(false)
  })

  it.each(pbcIds)('pins the core, Kerbalism, and actual DSN recommendation files in %s', id => {
    const base = 'https://github.com/Moonlington/ProbesBeforeCrew/blob/85eafa7e7b26723cc48d86e53d5d178a3e3d3d99/GameData/ProbesBeforeCrew'
    expect(getRadioProfile(id).sources.filter(source => source.id.startsWith('commnet-pbc-')).map(source => source.url)).toEqual([
      `${base}/_Core/Zs_ProbesBeforeCrew.cfg`,
      `${base}/Mod%20Support/ZsKerbalismPatch.cfg`,
      `${base}/Readme.txt`,
    ])
    expect(getRadioProfile(id).sources.filter(source => source.id.startsWith('commnet-pbc-'))
      .every(source => source.title.includes('3.3.2'))).toBe(true)
  })

  it.each(pbcIds)('combines PBC part powers and preserves receiving roles in %s', id => {
    const profile = getRadioProfile(id)
    const relayArray = calculateAntennaArray([{ antennaId: 'hg-5', count: 4 }], 'relay', profile.vesselAntennas)
    expect(relayArray).toMatchObject({ status: 'success', weightedExponent: .75, totalCount: 4 })
    if (relayArray.status !== 'success') throw new Error(relayArray.errors.join('\n'))
    // 20,000,000 × 4^0.75, independently evaluated from the pinned power.
    expect(relayArray.effectivePower).toBeCloseTo(Number('56568542.494923801952'), 6)
    const entries = [{ antennaId: 'communotron-16', count: 4 }]
    expect(calculateAntennaArray(entries, 'client', profile.vesselAntennas))
      .toMatchObject({ status: 'success', effectivePower: 4_000_000, weightedExponent: 1 })
    expect(calculateAntennaArray(entries, 'relay', profile.vesselAntennas).status).toBe('invalid')
    expect(calculateAntennaArray([{ antennaId: 'communotron-16-s', count: 10 }], 'client', profile.vesselAntennas))
      .toMatchObject({ status: 'success', effectivePower: 250_000, combinableCount: 0 })
    const loadout = { selection: 'array', customPower: '', array: [
      { antennaId: 'hg-5', count: 1 }, { antennaId: 'hg-55', count: 3 },
    ] }
    expect(resolveSignalEndpointPower(loadout, 'receiver', profile.vesselAntennas, profile.dsnLevels))
      .toMatchObject({ status: 'success', power: 20_000_000, ignoredDirectCount: 3 })
  })
})

describe('PBC configurable DSN presets', () => {
  it.each(pbcIds)('applies the optional recommendation once to presets in %s', id => {
    const profile = getRadioProfile(id)
    const levels = getEffectiveDsnLevels(profile, .35)
    expect(levels.map(level => level.power)).toEqual([700_000_000, 17_500_000_000, 87_500_000_000])
    expect(levels.map(({ id, name }) => ({ id, name }))).toEqual(dsnLevels.map(({ id, name }) => ({ id, name })))
    expect(profile.dsnLevels.map(level => level.power)).toEqual([2e9, 5e10, 2.5e11])
    expect(Object.isFrozen(levels)).toBe(true)
    expect(levels.every(Object.isFrozen)).toBe(true)
    expect(resolveSignalEndpointPower({ selection: 'custom', customPower: '123456', array: null }, 'receiver', profile.vesselAntennas, levels))
      .toMatchObject({ status: 'success', power: 123_456 })
  })

  it('does not alter existing profiles even when a prior PBC modifier remains in session state', () => {
    for (const id of ['stock', 'rss', 'rss-cbk', 'kerbalism', 'rss-kerbalism', 'rss-cbk-kerbalism'] as const) {
      const profile = getRadioProfile(id)
      expect(getEffectiveDsnLevels(profile, .35)).toBe(profile.dsnLevels)
      expect(getEffectiveDsnLevels(profile, NaN)).toBe(profile.dsnLevels)
    }
  })

  it.each([NaN, Infinity, -1, 0, MAX_DSN_MODIFIER + 1])('keeps invalid PBC modifier %s visible to validation', modifier => {
    expect(getEffectiveDsnLevels(getRadioProfile('pbc'), modifier).every(level => Number.isNaN(level.power))).toBe(true)
  })

  it('supports the DSN modifier boundary without changing level identities', () => {
    expect(getEffectiveDsnLevels(getRadioProfile('pbc'), MAX_DSN_MODIFIER).map(level => level.power))
      .toEqual([2e11, 5e12, 2.5e13])
  })

  it('calibrates Kerbalism against the effective maximum DSN, not its selected level or link antennas', () => {
    const profile = getRadioProfile('pbc-kerbalism')
    const defaultCalibration = calibrateKerbalismDamping(13_599_840_256, getEffectiveDsnLevels(profile)[2]!.power)
    expect(defaultCalibration.exponent).toBeCloseTo(Number('6.0091820652570001287'), 11)
    const recommendedCalibration = calibrateKerbalismDamping(13_599_840_256, getEffectiveDsnLevels(profile, .35)[2]!.power)
    expect(recommendedCalibration.source).toBe('automatic')
    expect(recommendedCalibration.calibrationDistanceM).toBe(27_199_680_512)
    // Decimal reference: log(.3925/.48) / log(1 - 3(d/87.5G)^2 + 2(d/87.5G)^3).
    expect(recommendedCalibration.calibrationStrength).toBeCloseTo(Number('.77018579973745835269'), 14)
    expect(recommendedCalibration.exponent).toBeCloseTo(Number('.77070646887037466873'), 13)
  })

  it.each([
    { modifier: 1, dsnRangeM: Number('2236067977.499789696409') },
    { modifier: .35, dsnRangeM: Number('1322875655.532295295251') },
  ])('uses PBC powers once while keeping local geometry independent of DSN $modifier', ({ modifier, dsnRangeM }) => {
    const profile = getRadioProfile('pbc')
    const input: RelayNetworkInput = {
      body: { radiusM: 600_000, gravitationalParameter: 3.5316e12, atmosphereHeightM: 70_000 },
      hasSurface: true, satelliteCount: 3, altitudeM: 800_000,
      relayPower: profile.relayAntennas.find(antenna => antenna.id === 'hg-5')!.power,
      clientPower: profile.clientAntennas.find(antenna => antenna.id === 'communotron-16')!.power,
      dsnPower: getEffectiveDsnLevels(profile, modifier)[2]!.power,
      rangeMultiplier: 1, occlusionFactor: 1, phaseDeg: 0, stationLongitudeDeg: 0,
      safetyMarginM: 10_000, deploymentMode: 'lower',
    }
    const result = calculateRelayPlan(input)
    if (result.status !== 'success') throw new Error(result.errors.join('\n'))
    expect(result.neighborRangeM).toBe(20_000_000)
    expect(result.surfaceRangeM).toBeCloseTo(4_472_135.954999579, 6)
    expect(result.dsnRangeM).toBeCloseTo(dsnRangeM, 5)
    expect(result.equatorialCoverageFraction).toBe(1)
    const doubled = calculateRelayPlan({ ...input, rangeMultiplier: 2 })
    if (doubled.status !== 'success') throw new Error(doubled.errors.join('\n'))
    expect(doubled.dsnRangeM).toBeCloseTo(dsnRangeM * 2, 5)
    expect(doubled.neighborRangeM).toBe(40_000_000)
  })
})

describe('PBC raw signals, transmission efficiency, and science rates', () => {
  // Independent 70-digit decimal references using the pinned powers and
  // S = 1 - 3(d/R)^2 + 2(d/R)^3. Efficiencies use exp(k × ln(S)); throughput
  // uses Kerbalism's unchanged fixed MB/s rates, not PBC antenna-power ratios.
  it.each([
    {
      modifier: 1, neighborEfficiency: Number('.77984558242497844147'), surfaceEfficiency: Number('.58810070985393576885'),
      neighborBytes: Number('5263.95768136860447994'), surfaceBytes: Number('1940.73234251798803720'),
      neighborDisplay: '5.264 kB/s', surfaceDisplay: '1.941 kB/s',
    },
    {
      modifier: .35, neighborEfficiency: Number('.96861142253491371666'), surfaceEfficiency: Number('.93418109320530749768'),
      neighborBytes: Number('6538.12710211066758748'), surfaceBytes: Number('3082.79760757751474233'),
      neighborDisplay: '6.538 kB/s', surfaceDisplay: '3.083 kB/s',
    },
  ])('preserves raw local signal while calibrating PBC science efficiency at DSN $modifier', reference => {
    const profile = getRadioProfile('pbc-kerbalism')
    const levels = getEffectiveDsnLevels(profile, reference.modifier)
    const exponent = calibrateKerbalismDamping(13_599_840_256, levels[2]!.power).exponent
    const input: RelayNetworkInput = {
      body: { radiusM: 600_000, gravitationalParameter: 3.5316e12, atmosphereHeightM: 70_000 },
      hasSurface: true, satelliteCount: 3, altitudeM: 800_000,
      relayPower: profile.relayAntennas.find(antenna => antenna.id === 'hg-5')!.power,
      clientPower: profile.clientAntennas.find(antenna => antenna.id === 'communotron-16')!.power,
      dsnPower: levels[2]!.power, dampingExponent: exponent,
      rangeMultiplier: 1, occlusionFactor: 1, phaseDeg: 0, stationLongitudeDeg: 0,
      safetyMarginM: 10_000, deploymentMode: 'lower',
    }
    const result = calculateRelayPlan(input)
    if (result.status !== 'success') throw new Error(result.errors.join('\n'))
    expect(result.neighborSignalStrength).toBeCloseTo(Number('.95946456056197674947'), 14)
    expect(result.bestStationSignalStrength).toBeCloseTo(Number('.91544866804479892325'), 14)
    expect(result.neighborDampedStrength).toBeCloseTo(reference.neighborEfficiency, 13)
    expect(result.bestStationDampedStrength).toBeCloseTo(reference.surfaceEfficiency, 13)

    const rateFor = (antennaId: string, strength: number) => {
      const base = resolveKerbalismBaseRate({ selection: antennaId, customPower: '', array: null }, profile.vesselAntennas)
      if (base.status !== 'success') throw new Error(`Missing reference rate for ${antennaId}`)
      return calculateKerbalismBitrate({
        baseRateBitsPerSecond: base.baseRateBitsPerSecond, rawStrength: strength, dampingExponent: exponent,
        antennaSpeed: DEFAULT_KERBALISM_ANTENNA_SPEED,
        minimumBitsPerSecond: DEFAULT_KERBALISM_MINIMUM_BITS_PER_SECOND, linkAvailable: true,
      })
    }
    const neighborRate = rateFor('hg-5', result.neighborSignalStrength)
    const surfaceRate = rateFor('communotron-16', result.bestStationSignalStrength!)
    if (neighborRate.status !== 'success' || surfaceRate.status !== 'success') throw new Error('Expected valid PBC science rates')
    expect(neighborRate.fullStrengthBitsPerSecond).toBeCloseTo(54_000, 7)
    expect(surfaceRate.fullStrengthBitsPerSecond).toBeCloseTo(26_400, 7)
    expect(neighborRate.rateBitsPerSecond / 8).toBeCloseTo(reference.neighborBytes, 7)
    expect(surfaceRate.rateBitsPerSecond / 8).toBeCloseTo(reference.surfaceBytes, 7)
    expect(neighborRate.floorApplied).toBe(false)
    expect(surfaceRate.floorApplied).toBe(false)
    expect(formatScienceRateBitsPerSecond(neighborRate.rateBitsPerSecond)).toBe(reference.neighborDisplay)
    expect(formatScienceRateBitsPerSecond(surfaceRate.rateBitsPerSecond)).toBe(reference.surfaceDisplay)
    const blocked = calculateRelayPlan({ ...input, altitudeM: 400_000 })
    if (blocked.status !== 'success') throw new Error(blocked.errors.join('\n'))
    expect(blocked.ringLinkStatus).toBe('blocked')
    expect(blocked.neighborSignalStrength).toBe(0)
    expect(blocked.neighborDampedStrength).toBe(0)
  })

  it.each([
    {
      modifier: 1, rangeM: Number('158113883008.418966600'), raw: Number('.93396435845575358258'),
      efficiency: Number('.66329907252530507648'), bytes: Number('477575.332218219655067'), display: '477.575 kB/s',
    },
    {
      modifier: .35, rangeM: Number('93541434669.348534640'), raw: Number('.82652902504686011105'),
      efficiency: Number('.86343627316075093048'), bytes: Number('621674.116675740669947'), display: '621.674 kB/s',
    },
  ])('matches the Kerbin DSN receiver and Duna RA-100 sender reference at DSN $modifier', reference => {
    const profile = getRadioProfile('pbc-kerbalism')
    const levels = getEffectiveDsnLevels(profile, reference.modifier)
    const calibration = calibrateKerbalismDamping(13_599_840_256, levels[2]!.power)
    const receiver = resolveSignalEndpointPower({ selection: 'dsn:dsn3', customPower: '', array: null }, 'receiver', profile.vesselAntennas, levels)
    const loadout = { selection: 'ra-100', customPower: '', array: null }
    const sender = resolveSignalEndpointPower(loadout, 'sender', profile.vesselAntennas, levels)
    if (sender.status !== 'success' || receiver.status !== 'success') throw new Error('Expected reference endpoints')
    const input = {
      orbitRadiusAM: 13_599_840_256, orbitRadiusBM: 20_726_155_264, centralRadiusM: 261_600_000,
      powerA: receiver.power, powerB: sender.power,
      rangeMultiplier: 1, occlusionFactor: 1, phaseDeg: 90, dampingExponent: calibration.exponent,
    }
    const result = calculateInterplanetarySignal(input)
    if (result.status !== 'success') throw new Error(result.errors.join('\n'))
    expect(result.linkStatus).toBe('available')
    expect(result.distanceM).toBeCloseTo(Number('24789698808.500135854'), 4)
    expect(result.maximumRangeM).toBeCloseTo(reference.rangeM, 3)
    expect(result.signalStrength).toBeCloseTo(reference.raw, 14)
    expect(result.dampedStrength).toBeCloseTo(reference.efficiency, 13)
    const base = resolveKerbalismBaseRate(loadout, profile.vesselAntennas)
    if (base.status !== 'success') throw new Error('Expected the pinned RA-100 science rate')
    expect(base.baseRateBitsPerSecond).toBe(3_840_000)
    const rate = calculateKerbalismBitrate({
      baseRateBitsPerSecond: base.baseRateBitsPerSecond, rawStrength: result.signalStrength,
      dampingExponent: calibration.exponent, antennaSpeed: DEFAULT_KERBALISM_ANTENNA_SPEED,
      minimumBitsPerSecond: DEFAULT_KERBALISM_MINIMUM_BITS_PER_SECOND, linkAvailable: true,
    })
    if (rate.status !== 'success') throw new Error(rate.errors.join('\n'))
    expect(rate.fullStrengthBitsPerSecond / 8).toBe(720_000)
    expect(rate.rateBitsPerSecond / 8).toBeCloseTo(reference.bytes, 6)
    expect(formatScienceRateBitsPerSecond(rate.rateBitsPerSecond)).toBe(reference.display)
    const blocked = calculateInterplanetarySignal({ ...input, phaseDeg: 180 })
    if (blocked.status !== 'success') throw new Error(blocked.errors.join('\n'))
    expect(blocked.linkStatus).toBe('blocked')
    expect(blocked.signalStrength).toBe(0)
    expect(blocked.dampedStrength).toBe(0)
    expect(blocked.worstRangeStrength).toBeGreaterThan(0)
    expect(blocked.worstDampedStrength).toBeGreaterThan(0)
  })

  it('retains fixed Kerbalism packet rates, bit-based minimum, and zero-link behavior for PBC', () => {
    const profile = getRadioProfile('pbc-kerbalism')
    // The late Kerbalism science patch resets interval to1 s and assigns the
    // 16-S fixed .0022 MB packet size after PBC's earlier .8 s interval patch.
    expect(resolveKerbalismBaseRate({ selection: 'communotron-16-s', customPower: '', array: null }, profile.vesselAntennas))
      .toMatchObject({ status: 'success', baseRateBitsPerSecond: 17_600 })
    expect(DEFAULT_KERBALISM_MINIMUM_BITS_PER_SECOND).toBe(1)
    const input = {
      baseRateBitsPerSecond: 36_000, rawStrength: .01, dampingExponent: 6,
      antennaSpeed: 1.5, minimumBitsPerSecond: DEFAULT_KERBALISM_MINIMUM_BITS_PER_SECOND, linkAvailable: true,
    }
    const floored = calculateKerbalismBitrate(input)
    expect(floored).toMatchObject({ status: 'success', rateBitsPerSecond: 1, floorApplied: true })
    if (floored.status !== 'success') throw new Error(floored.errors.join('\n'))
    expect(formatScienceRateBitsPerSecond(floored.rateBitsPerSecond)).toBe('0.125 B/s')
    for (const changes of [{ rawStrength: 0 }, { antennaSpeed: 0 }, { linkAvailable: false }]) {
      expect(calculateKerbalismBitrate({ ...input, ...changes }))
        .toMatchObject({ status: 'success', rateBitsPerSecond: 0, floorApplied: false })
    }
  })
})
