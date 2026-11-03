import { describe, expect, it } from 'vitest'
import { dsnLevels, relayAntennas, vesselAntennas, type CommNetAntenna } from '../data/commnet'
import { getRadioProfile } from '../data/radioProfiles'
import { calculateRelayPlan, type RelayNetworkInput } from './relay'
import { calculateAntennaArray, type AntennaArrayEntry, type AntennaArrayRole } from './antennaArray'

function success(entries: readonly AntennaArrayEntry[], role: AntennaArrayRole = 'client', catalog?: readonly CommNetAntenna[]) {
  const result = calculateAntennaArray(entries, role, catalog)
  if (result.status !== 'success') throw new Error(result.errors.join('\n'))
  return result
}

describe('stock antenna arrays on one craft', () => {
  it.each(vesselAntennas)('retains the published single-antenna power for $name', antenna => {
    const result = success([{ antennaId: antenna.id, count: 1 }])
    expect(result.effectivePower).toBe(antenna.power)
    expect(result.totalCount).toBe(1)
    expect(result.combinableCount).toBe(antenna.combinable ? 1 : 0)
    expect(result.weightedExponent).toBe(antenna.combinable ? antenna.combinabilityExponent : null)
  })

  it('combines four HG-5s sublinearly using the stock 0.75 exponent', () => {
    const result = success([{ antennaId: 'hg-5', count: 4 }], 'relay')
    expect(result.effectivePower).toBeCloseTo(14_142_135.623730952, 6)
    expect(result.combinedPower).toBe(result.effectivePower)
    expect(result.strongestSinglePower).toBe(5_000_000)
    expect(result.weightedExponent).toBe(.75)
    expect(result.totalCount).toBe(4)
    expect(result.combinableCount).toBe(4)
    expect(result.notes).toEqual([])
  })

  it('uses the strongest combinable model as the base for a mixed relay array', () => {
    const result = success([{ antennaId: 'ra-2', count: 1 }, { antennaId: 'hg-5', count: 1 }], 'relay')
    expect(result.effectivePower).toBeCloseTo(2_003_748_829.3439894, 4)
    expect(result.strongestSinglePower).toBe(2_000_000_000)
    expect(result.weightedExponent).toBe(.75)
    expect(result.totalCount).toBe(2)
  })

  it('uses power-weighted exponents for mixed Communotron 16 and relay parts', () => {
    const entries = [{ antennaId: 'hg-5', count: 1 }, { antennaId: 'communotron-16', count: 3 }]
    const result = success(entries)
    expect(result.effectivePower).toBeCloseTo(6_180_180.700825106, 6)
    expect(result.weightedExponent).toBeCloseTo(.8076923076923077, 14)
    expect(result.totalCount).toBe(4)
    expect(success(entries.toReversed())).toEqual(result)
  })

  it('combines Communotron 16s linearly instead of using the usual 0.75 exponent', () => {
    const result = success([{ antennaId: 'communotron-16', count: 4 }])
    expect(result.effectivePower).toBe(2_000_000)
    expect(result.weightedExponent).toBe(1)
  })

  it.each([
    { antennaId: 'communotron-16-s', count: 100, power: 500_000 },
    { antennaId: 'internal', count: 100, power: 5_000 },
  ])('does not boost repeated non-combinable $antennaId parts', ({ antennaId, count, power }) => {
    const result = success([{ antennaId, count }])
    expect(result.effectivePower).toBe(power)
    expect(result.combinedPower).toBe(0)
    expect(result.strongestSinglePower).toBe(power)
    expect(result.weightedExponent).toBeNull()
    expect(result.combinableCount).toBe(0)
    expect(result.totalCount).toBe(count)
    expect(result.notes).toHaveLength(1)
  })

  it('excludes non-combinable parts from both the power sum and weighted exponent', () => {
    const result = success([
      { antennaId: 'hg-5', count: 1 }, { antennaId: 'communotron-16', count: 1 },
      { antennaId: 'communotron-16-s', count: 50 }, { antennaId: 'internal', count: 48 },
    ])
    expect(result.effectivePower).toBeCloseTo(5_382_143.353808081, 6)
    expect(result.weightedExponent).toBeCloseTo(.7727272727272727, 14)
    expect(result.combinableCount).toBe(2)
    expect(result.totalCount).toBe(100)
    expect(result.notes).toHaveLength(1)
  })

  it('uses the strongest individual when no antennas can combine', () => {
    const result = success([{ antennaId: 'internal', count: 1 }, { antennaId: 'communotron-16-s', count: 1 }])
    expect(result.effectivePower).toBe(500_000)
    expect(result.combinedPower).toBe(0)
    expect(result.weightedExponent).toBeNull()
  })

  it.each(relayAntennas)('allows $name for forwarding and for a surface endpoint', antenna => {
    const entries = [{ antennaId: antenna.id, count: 2 }]
    expect(success(entries, 'relay')).toEqual(success(entries, 'client'))
  })

  it('accepts the maximum supported loadout without non-finite power', () => {
    const result = success([{ antennaId: 'ra-100', count: 100 }], 'relay')
    expect(result.effectivePower).toBeCloseTo(3_162_277_660_168.3794, 2)
    expect(result.effectivePower).toBeLessThan(1e18)
    expect(result.totalCount).toBe(100)
  })

  it('does not mutate frozen inputs or the reference catalog', () => {
    const entries = Object.freeze([
      Object.freeze({ antennaId: 'hg-5', count: 4 }),
      Object.freeze({ antennaId: 'ra-2', count: 1 }),
    ])
    const before = structuredClone({ entries, catalog: vesselAntennas, dsnLevels })
    success(entries, 'relay')
    expect({ entries, catalog: vesselAntennas, dsnLevels }).toEqual(before)
  })

  it('updates endpoint ranges once without changing orbital deployment geometry', () => {
    const input: RelayNetworkInput = {
      body: { radiusM: 600_000, gravitationalParameter: 3.5316e12, atmosphereHeightM: 70_000, sphereOfInfluenceM: 84_159_286.5 },
      hasSurface: true, satelliteCount: 3, altitudeM: 800_000,
      relayPower: 5e6, clientPower: 5e5, dsnPower: 250e9, rangeMultiplier: 1,
      occlusionFactor: 1, phaseDeg: 0, stationLongitudeDeg: 0, safetyMarginM: 10_000,
      deploymentMode: 'lower',
    }
    const single = calculateRelayPlan(input)
    const array = calculateRelayPlan({ ...input, relayPower: success([{ antennaId: 'hg-5', count: 4 }], 'relay').effectivePower })
    if (single.status !== 'success' || array.status !== 'success') throw new Error('Valid example must calculate')
    expect(array.neighborRangeM).toBeCloseTo(14_142_135.623730952, 6)
    expect(array.surfaceRangeM).toBeCloseTo(2_659_147.9484724943, 6)
    expect(array.dsnRangeM).toBeCloseTo(1_880_301_546.543197, 4)
    expect(array.deployment).toEqual(single.deployment)
    expect(array.neighborDistanceM).toBe(single.neighborDistanceM)
    expect(array.orbitalPeriodS).toBe(single.orbitalPeriodS)
    expect(input.relayPower).toBe(5e6)
  })
})

describe('installation-specific antenna arrays', () => {
  const rssCatalog = getRadioProfile('rss').vesselAntennas

  it.each([
    [{ antennaId: 'hg-5', count: 4 }],
    [{ antennaId: 'communotron-16', count: 4 }],
    [{ antennaId: 'ra-2', count: 1 }, { antennaId: 'hg-5', count: 1 }],
    [{ antennaId: 'hg-5', count: 1 }, { antennaId: 'communotron-16', count: 3 }],
    [{ antennaId: 'hg-5', count: 1 }, { antennaId: 'communotron-16-s', count: 50 }, { antennaId: 'internal', count: 48 }],
    [{ antennaId: 'communotron-16-s', count: 100 }],
    [{ antennaId: 'internal', count: 100 }],
  ])('scales an existing loadout once with RSS powers: %j', (...entries) => {
    const stock = success(entries)
    const rss = success(entries, 'client', rssCatalog)
    expect(rss.effectivePower / stock.effectivePower).toBeCloseTo(20, 12)
    expect(rss.strongestSinglePower / stock.strongestSinglePower).toBe(20)
    expect(rss.combinableCount).toBe(stock.combinableCount)
    expect(rss.totalCount).toBe(stock.totalCount)
    if (rss.weightedExponent !== null && stock.weightedExponent !== null) {
      expect(rss.weightedExponent).toBeCloseTo(stock.weightedExponent, 14)
    } else expect(rss.weightedExponent).toBeNull()
    expect(rss.notes).toEqual(stock.notes)
    expect(success(entries)).toEqual(stock)
  })

  it('uses the same antenna powers for RSS with and without CustomBarnKit', () => {
    const entries = [{ antennaId: 'ra-100', count: 2 }, { antennaId: 'hg-5', count: 1 }]
    expect(success(entries, 'relay', getRadioProfile('rss-cbk').vesselAntennas)).toEqual(success(entries, 'relay', rssCatalog))
  })

  it('retains relay restrictions for RSS and accepts stock relay parts at the RSS power', () => {
    expect(success([{ antennaId: 'hg-5', count: 1 }], 'relay', rssCatalog).effectivePower).toBe(100_000_000)
    expect(calculateAntennaArray([{ antennaId: 'communotron-16', count: 1 }], 'relay', rssCatalog).status).toBe('invalid')
  })

  it('reads the supplied catalog instead of falling back to stock powers or model names', () => {
    const catalog = Object.freeze([
      Object.freeze({ id: 'test-relay', name: 'Test relay', power: 100, combinable: true, combinabilityExponent: .75, relay: true }),
      Object.freeze({ id: 'test-direct', name: 'Test direct', power: 1_000, combinable: false, combinabilityExponent: 0, relay: false }),
    ])
    const before = structuredClone(catalog)
    expect(success([{ antennaId: 'test-relay', count: 4 }], 'relay', catalog).effectivePower).toBeCloseTo(282.842712474619, 12)
    expect(success([{ antennaId: 'test-relay', count: 4 }, { antennaId: 'test-direct', count: 2 }], 'client', catalog).effectivePower).toBe(1_000)
    expect(calculateAntennaArray([{ antennaId: 'test-direct', count: 1 }], 'relay', catalog).status).toBe('invalid')
    expect(calculateAntennaArray([{ antennaId: 'hg-5', count: 1 }], 'client', catalog).status).toBe('invalid')
    expect(catalog).toEqual(before)
  })

  it('derives the maximum number of distinct rows from the supplied catalog', () => {
    const catalog = Array.from({ length: 11 }, (_, index) => ({
      id: `test-${index}`, name: `Test ${index}`, power: 100,
      combinable: true, combinabilityExponent: 1, relay: true,
    }))
    const entries = catalog.map(antenna => ({ antennaId: antenna.id, count: 1 }))
    expect(success(entries, 'relay', catalog).effectivePower).toBe(1_100)
    const result = calculateAntennaArray(entries, 'relay', catalog.slice(0, 2))
    expect(result.status).toBe('invalid')
    if (result.status === 'invalid') expect(result.errors).toEqual(['Choose between 1 and 2 distinct antenna models.'])
  })

  it.each([
    null, {}, [], [null],
    [{ ...relayAntennas[0], power: 0 }],
    [{ ...relayAntennas[0], power: Infinity }],
    [{ ...relayAntennas[0], power: '100' }],
    [{ ...relayAntennas[0], combinabilityExponent: NaN }],
    [{ ...relayAntennas[0], combinabilityExponent: 1.1 }],
    [{ ...relayAntennas[0], relay: 'true' }],
    [{ ...relayAntennas[0], id: '' }],
    [relayAntennas[0], relayAntennas[0]],
  ].map(raw => [raw]))('rejects an unusable runtime catalog without calculating or throwing: %j', raw => {
    const result = calculateAntennaArray([{ antennaId: 'hg-5', count: 1 }], 'relay', raw as unknown as CommNetAntenna[])
    expect(result.status).toBe('invalid')
  })
})

describe('antenna array validation', () => {
  it.each([
    null, undefined, {}, 'hg-5', [], Array(11).fill({ antennaId: 'hg-5', count: 1 }),
    [null], [undefined], [1], ['hg-5'], [[]], [{}],
    [{ antennaId: 'unknown', count: 1 }], [{ antennaId: 1, count: 1 }],
    [{ antennaId: 'hg-5' }], [{ antennaId: 'hg-5', count: '2' }],
    [{ antennaId: 'hg-5', count: 0 }], [{ antennaId: 'hg-5', count: -1 }],
    [{ antennaId: 'hg-5', count: 1.5 }], [{ antennaId: 'hg-5', count: 101 }],
    [{ antennaId: 'hg-5', count: NaN }], [{ antennaId: 'hg-5', count: Infinity }],
  ])('rejects malformed runtime data without coercion or throwing: %j', raw => {
    const result = calculateAntennaArray(raw as unknown as AntennaArrayEntry[], 'client')
    expect(result.status).toBe('invalid')
    if (result.status === 'invalid') expect(result.errors.length).toBeGreaterThan(0)
  })

  it('rejects duplicate model rows rather than silently double-counting', () => {
    const result = calculateAntennaArray([{ antennaId: 'hg-5', count: 1 }, { antennaId: 'hg-5', count: 2 }], 'relay')
    expect(result.status).toBe('invalid')
  })

  it('enforces the 100-antenna limit across distinct models', () => {
    expect(calculateAntennaArray([{ antennaId: 'hg-5', count: 51 }, { antennaId: 'ra-2', count: 50 }], 'relay').status).toBe('invalid')
    expect(success([{ antennaId: 'hg-5', count: 50 }, { antennaId: 'ra-2', count: 50 }], 'relay').totalCount).toBe(100)
  })

  it.each(['internal', 'communotron-16', 'communotron-16-s', 'dts-m1', 'hg-55', 'communotron-88-88'])('rejects direct antenna %s in a forwarding array', antennaId => {
    expect(calculateAntennaArray([{ antennaId, count: 1 }], 'relay').status).toBe('invalid')
    expect(calculateAntennaArray([{ antennaId: 'hg-5', count: 1 }, { antennaId, count: 1 }], 'relay').status).toBe('invalid')
  })

  it.each(dsnLevels)('does not treat $name as a vessel antenna', antenna => {
    expect(calculateAntennaArray([{ antennaId: antenna.id, count: 1 }], 'client').status).toBe('invalid')
    expect(calculateAntennaArray([{ antennaId: antenna.id, count: 1 }], 'relay').status).toBe('invalid')
  })

  it('rejects an unknown runtime array role', () => {
    expect(calculateAntennaArray([{ antennaId: 'hg-5', count: 1 }], 'dsn' as AntennaArrayRole).status).toBe('invalid')
  })
})
