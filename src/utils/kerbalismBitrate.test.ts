import { describe, expect, it } from 'vitest'
import { vesselAntennas, type CommNetAntenna } from '../data/commnet'
import {
  DEFAULT_KERBALISM_ANTENNA_SPEED, DEFAULT_KERBALISM_MINIMUM_BITS_PER_SECOND,
  KERBALISM_BITS_PER_MEGABYTE, kerbalismAntennaRates, kerbalismRateSources,
} from '../data/kerbalismRates'
import { getRadioProfile } from '../data/radioProfiles'
import { calculateAntennaArray, type AntennaArrayEntry } from './antennaArray'
import {
  calculateKerbalismBitrate, resolveKerbalismBaseRate, type KerbalismBitrateInput,
} from './kerbalismBitrate'
import type { SignalEndpointLoadout } from './signalEndpoint'

const loadout = (selection: string, array: readonly AntennaArrayEntry[] | null = null): SignalEndpointLoadout => ({ selection, array, customPower: '' })
const kerbalismCatalog = getRadioProfile('kerbalism').vesselAntennas
const base = (entries: readonly AntennaArrayEntry[], catalog = kerbalismCatalog) => {
  const result = resolveKerbalismBaseRate(loadout('array', entries), catalog)
  if (result.status !== 'success') throw new Error(`Expected a known antenna rate, got ${result.status}`)
  return result
}
const bitrateInput: KerbalismBitrateInput = {
  baseRateBitsPerSecond: 36_000, rawStrength: .5, dampingExponent: 6,
  antennaSpeed: 1, minimumBitsPerSecond: 1, linkAvailable: true,
}
const bitrate = (overrides: Partial<KerbalismBitrateInput> = {}) => {
  const result = calculateKerbalismBitrate({ ...bitrateInput, ...overrides })
  if (result.status !== 'success') throw new Error(result.errors.join('\n'))
  return result
}

describe('Kerbalism 3.44 reference science rates', () => {
  const expectedRates = [
    ['internal', 0, 0], ['communotron-8', 12_000, 1],
    ['communotron-16', 17_600, 1], ['communotron-16-s', 17_600, 1],
    ['hg-5', 36_000, 1], ['dts-m1', 200_000, 1], ['ra-2', 144_000, 1],
    ['ra-15', 1_320_000, 1], ['hg-55', 1_600_000, 1],
    ['communotron-88-88', 4_160_000, 1], ['ra-100', 3_840_000, 1],
  ] as const

  for (const profileId of ['kerbalism', 'rss-kerbalism', 'rss-cbk-kerbalism'] as const) {
    it.each(expectedRates)(`${profileId}: resolves %s at %d bit/s without RSS rate scaling`, (id, expected, externalCount) => {
      expect(resolveKerbalismBaseRate(loadout(id), getRadioProfile(profileId).vesselAntennas)).toEqual({
        status: 'success', baseRateBitsPerSecond: expected, externalCount,
      })
    })
  }

  it('uses decimal MB conversion and explicit Normal difficulty reference defaults', () => {
    expect(KERBALISM_BITS_PER_MEGABYTE).toBe(8_000_000)
    expect(DEFAULT_KERBALISM_ANTENNA_SPEED).toBe(1.5)
    expect(DEFAULT_KERBALISM_MINIMUM_BITS_PER_SECOND).toBe(1)
    expect(Object.keys(kerbalismAntennaRates).sort()).toEqual(kerbalismCatalog.map(antenna => antenna.id).sort())
    expect(kerbalismRateSources.every(source => source.url.includes('39f9f43afe8b4f77aff0086c3866044287694475'))).toBe(true)
    expect(new Set(kerbalismRateSources.map(source => source.id)).size).toBe(kerbalismRateSources.length)
  })
})

describe('Kerbalism sending-vessel science arrays', () => {
  it('weights the geometric mean by physical part count', () => {
    const pair = base([{ antennaId: 'communotron-16', count: 1 }, { antennaId: 'ra-100', count: 1 }])
    expect(pair.baseRateBitsPerSecond).toBeCloseTo(259_969.22894835073, 6)
    const weighted = base([{ antennaId: 'communotron-16', count: 2 }, { antennaId: 'ra-100', count: 1 }])
    expect(weighted.baseRateBitsPerSecond).toBeCloseTo(105_954.3650719473, 6)
    expect(weighted.externalCount).toBe(3)
    expect(weighted.baseRateBitsPerSecond).toBeLessThan(pair.baseRateBitsPerSecond)
  })

  it('does not add identical rates, although range combining can improve their signal', () => {
    const entries = [{ antennaId: 'ra-100', count: 2 }]
    expect(base(entries)).toEqual({ status: 'success', baseRateBitsPerSecond: 3_840_000, externalCount: 2 })
    const combined = calculateAntennaArray(entries, 'client', kerbalismCatalog)
    if (combined.status !== 'success') throw new Error('Expected a valid range loadout')
    expect(combined.effectivePower).toBeGreaterThan(100_000_000_000)
    expect(base([{ antennaId: 'ra-100', count: 100 }]).baseRateBitsPerSecond).toBe(3_840_000)
  })

  it('includes non-combinable external antennas while excluding internal parts from the numerator and denominator', () => {
    const entries = [
      { antennaId: 'communotron-16-s', count: 2 },
      { antennaId: 'ra-100', count: 1 },
      { antennaId: 'internal', count: 97 },
    ]
    expect(base(entries).baseRateBitsPerSecond).toBeCloseTo(105_954.3650719473, 6)
    expect(base(entries).externalCount).toBe(3)
    expect(base([{ antennaId: 'internal', count: 99 }, { antennaId: 'ra-100', count: 1 }]).baseRateBitsPerSecond).toBe(3_840_000)
    expect(base([{ antennaId: 'internal', count: 100 }])).toEqual({ status: 'success', baseRateBitsPerSecond: 0, externalCount: 0 })
  })

  it('does not filter direct parts out of a relay sender science array', () => {
    expect(base([{ antennaId: 'communotron-16', count: 2 }, { antennaId: 'ra-100', count: 1 }]).baseRateBitsPerSecond)
      .toBeCloseTo(105_954.3650719473, 6)
  })

  it('retains frozen entries and produces the same result in either row order', () => {
    const entries = Object.freeze([
      Object.freeze({ antennaId: 'communotron-16', count: 2 }),
      Object.freeze({ antennaId: 'ra-100', count: 1 }),
      Object.freeze({ antennaId: 'hg-5', count: 4 }),
    ])
    const before = structuredClone(entries)
    expect(base(entries)).toEqual(base(entries.toReversed()))
    expect(entries).toEqual(before)
  })

  it.each([
    [], [{ antennaId: 'hg-5', count: 0 }], [{ antennaId: 'hg-5', count: 1.5 }],
    [{ antennaId: 'hg-5', count: 101 }],
    [{ antennaId: 'hg-5', count: 1 }, { antennaId: 'hg-5', count: 1 }],
    [{ antennaId: 'hg-5', count: 100 }, { antennaId: 'internal', count: 1 }],
  ])('rejects an invalid saved loadout instead of omitting rows: %j', (...entries) => {
    expect(resolveKerbalismBaseRate(loadout('array', entries), kerbalismCatalog)).toEqual({ status: 'invalid' })
  })

  it('preserves an unavailable saved part instead of silently recalculating the remaining array', () => {
    expect(resolveKerbalismBaseRate(loadout('communotron-8'), vesselAntennas)).toEqual({ status: 'unavailable' })
    expect(resolveKerbalismBaseRate(loadout('array', [
      { antennaId: 'hg-5', count: 1 }, { antennaId: 'communotron-8', count: 1 },
    ]), vesselAntennas)).toEqual({ status: 'unavailable' })
  })

  it.each(['unknown-external', 'constructor', 'toString'])('requires a reference rate for unknown catalog model %s', id => {
    const antenna: CommNetAntenna = { id, name: 'Patched antenna', power: 1e6, combinable: false, combinabilityExponent: 0, relay: false }
    expect(resolveKerbalismBaseRate(loadout(id), [antenna])).toEqual({ status: 'needs-rate' })
  })

  it('validates malformed catalogs without throwing', () => {
    expect(resolveKerbalismBaseRate(loadout('hg-5'), [null] as unknown as CommNetAntenna[])).toEqual({ status: 'invalid' })
    expect(resolveKerbalismBaseRate(loadout('hg-5'), [])).toEqual({ status: 'invalid' })
    expect(resolveKerbalismBaseRate(loadout('hg-5'), [
      { ...kerbalismCatalog.find(antenna => antenna.id === 'hg-5')!, power: NaN },
    ]).status).toBe('invalid')
  })

  it('does not invent DSN science transmission rates', () => {
    expect(resolveKerbalismBaseRate(loadout('dsn:dsn3'), kerbalismCatalog)).toEqual({ status: 'dsn' })
  })

  it('requires explicit custom rates and accepts a deliberate zero without calling it an internal antenna', () => {
    expect(resolveKerbalismBaseRate(loadout('custom'), kerbalismCatalog)).toEqual({ status: 'needs-rate' })
    expect(resolveKerbalismBaseRate(loadout('custom'), kerbalismCatalog, NaN)).toEqual({ status: 'needs-rate' })
    expect(resolveKerbalismBaseRate(loadout('custom'), kerbalismCatalog, 1234)).toEqual({ status: 'success', baseRateBitsPerSecond: 1234, externalCount: 1 })
    expect(resolveKerbalismBaseRate(loadout('custom'), kerbalismCatalog, 0)).toEqual({ status: 'success', baseRateBitsPerSecond: 0, externalCount: 1 })
    for (const invalid of [-1, Infinity, -Infinity, 1e18 + 1000]) {
      expect(resolveKerbalismBaseRate(loadout('custom'), kerbalismCatalog, invalid)).toEqual({ status: 'invalid' })
    }
  })
})

describe('Kerbalism one-hop science bitrate', () => {
  it('applies antenna speed and damped strength to the reference full-strength rate', () => {
    expect(bitrate()).toEqual({ status: 'success', rateBitsPerSecond: 562.5, unflooredBitsPerSecond: 562.5, floorApplied: false, fullStrengthBitsPerSecond: 36_000 })
    expect(bitrate({ antennaSpeed: 1.5 }).rateBitsPerSecond).toBeCloseTo(843.75, 10)
    expect(bitrate({ baseRateBitsPerSecond: 3_840_000, rawStrength: .8 }).rateBitsPerSecond).toBeCloseTo(1_006_632.96, 6)
    expect(bitrate({ rawStrength: 1, antennaSpeed: 1.5 }).rateBitsPerSecond).toBeCloseTo(54_000, 8)
  })

  it('floors only a positive science rate and reports the un-floored value', () => {
    const result = bitrate({ baseRateBitsPerSecond: 12_000, rawStrength: .1 })
    expect(result.unflooredBitsPerSecond).toBeCloseTo(.012, 12)
    expect(result.rateBitsPerSecond).toBe(1)
    expect(result.floorApplied).toBe(true)
    expect(bitrate({ baseRateBitsPerSecond: 12_000, rawStrength: .1, minimumBitsPerSecond: 0 }).rateBitsPerSecond).toBeCloseTo(.012, 12)
    expect(bitrate({ minimumBitsPerSecond: 100_000 }).rateBitsPerSecond).toBe(100_000)
  })

  it.each([
    { linkAvailable: false }, { rawStrength: 0 }, { baseRateBitsPerSecond: 0 },
    { antennaSpeed: 0 }, { dampingExponent: 1_000_000 },
    // Source arithmetic is in MB/s. This product underflows before conversion
    // to bit/s, even though multiplying a bit/s baseline first could survive.
    { rawStrength: Number.MIN_VALUE, dampingExponent: 1, baseRateBitsPerSecond: 12_000 },
  ])('does not turn a zero, blocked, or underflowed rate into a working link: %j', overrides => {
    expect(bitrate(overrides).rateBitsPerSecond).toBe(0)
    expect(bitrate(overrides).unflooredBitsPerSecond).toBe(0)
    expect(bitrate(overrides).floorApplied).toBe(false)
  })

  it('retains a positive subnormal source rate rather than imposing an arbitrary signal threshold', () => {
    // Base is 1MB/s, so the smallest positive factor survives source units.
    expect(bitrate({ baseRateBitsPerSecond: 8_000_000, rawStrength: Number.MIN_VALUE, dampingExponent: 1 }).rateBitsPerSecond).toBe(1)
    expect(bitrate({ baseRateBitsPerSecond: 8_000_000, rawStrength: Number.MIN_VALUE, dampingExponent: 1 }).floorApplied).toBe(true)
  })

  it.each([
    { baseRateBitsPerSecond: -1 }, { baseRateBitsPerSecond: NaN }, { baseRateBitsPerSecond: Infinity }, { baseRateBitsPerSecond: 1e19 },
    { rawStrength: -.1 }, { rawStrength: 1.1 }, { rawStrength: NaN },
    { dampingExponent: 0 }, { dampingExponent: -1 }, { dampingExponent: 1_000_001 }, { dampingExponent: Infinity },
    { antennaSpeed: -1 }, { antennaSpeed: NaN }, { antennaSpeed: 1001 },
    { minimumBitsPerSecond: -1 }, { minimumBitsPerSecond: NaN }, { minimumBitsPerSecond: 1e19 },
    { linkAvailable: undefined },
  ])('rejects invalid rate inputs independently of geometry: %j', overrides => {
    const result = calculateKerbalismBitrate({ ...bitrateInput, ...overrides } as KerbalismBitrateInput)
    expect(result.status).toBe('invalid')
    if (result.status === 'invalid') expect(result.errors.length).toBeGreaterThan(0)
  })
})
