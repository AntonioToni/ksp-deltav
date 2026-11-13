import { describe, expect, it } from 'vitest'
import { dsnLevels, vesselAntennas } from '../data/commnet'
import { getRadioProfile } from '../data/radioProfiles'
import { resolveSignalEndpointPower, type SignalEndpointLoadout } from './signalEndpoint'

const single = (selection: string): SignalEndpointLoadout => ({ selection, customPower: '', array: null })
const array = (entries: SignalEndpointLoadout['array']): SignalEndpointLoadout => ({ selection: 'array', customPower: '', array: entries })
const resolve = (loadout: SignalEndpointLoadout, role: 'sender' | 'receiver') => resolveSignalEndpointPower(loadout, role, vesselAntennas, dsnLevels)

describe('Directed CommNet endpoint power', () => {
  it('accepts a direct transmitter but requires relay capability at a receiving vessel', () => {
    expect(resolve(single('communotron-88-88'), 'sender')).toMatchObject({ status: 'success', power: 100_000_000_000 })
    expect(resolve(single('communotron-88-88'), 'receiver')).toEqual({ status: 'needs-relay' })
    expect(resolve(single('internal'), 'receiver')).toEqual({ status: 'needs-relay' })
    expect(resolve(single('ra-100'), 'receiver')).toEqual({ status: 'success', power: 100_000_000_000, ignoredDirectCount: 0, assumedReceiver: false })
  })

  it('cannot turn a direct-only array into a relay receiver through quantity', () => {
    const loadout = array([{ antennaId: 'communotron-16', count: 100 }])
    expect(resolve(loadout, 'sender')).toMatchObject({ status: 'success', power: 50_000_000 })
    expect(resolve(loadout, 'receiver')).toEqual({ status: 'needs-relay' })
  })

  it('ignores powerful direct antennas for receiving while preserving their transmitting contribution', () => {
    const loadout = array([{ antennaId: 'communotron-88-88', count: 99 }, { antennaId: 'hg-5', count: 1 }])
    const sender = resolve(loadout, 'sender')
    if (sender.status !== 'success') throw new Error('Expected a transmitting loadout')
    expect(sender.power).toBeGreaterThan(100_000_000_000)
    // The receiving power is the HG-5 alone, regardless of the much larger dishes.
    expect(resolve(loadout, 'receiver')).toEqual({ status: 'success', power: 5_000_000, ignoredDirectCount: 99, assumedReceiver: false })
    expect(loadout.array).toEqual([{ antennaId: 'communotron-88-88', count: 99 }, { antennaId: 'hg-5', count: 1 }])
  })

  it('combines multiple relay models from only the receiving subset', () => {
    const loadout = array([{ antennaId: 'ra-2', count: 4 }, { antennaId: 'communotron-16', count: 20 }])
    const result = resolve(loadout, 'receiver')
    if (result.status !== 'success') throw new Error('Expected a receiving loadout')
    expect(result.power).toBeCloseTo(2_000_000_000 * 4 ** .75, 4)
    expect(result.ignoredDirectCount).toBe(20)
  })

  it.each(['kerbalism', 'rss-kerbalism', 'rss-cbk-kerbalism'] as const)('keeps Communotron 8 direct-only under %s', id => {
    const profile = getRadioProfile(id)
    const loadout = array([{ antennaId: 'communotron-8', count: 4 }, { antennaId: 'hg-5', count: 1 }])
    const expected = id === 'kerbalism' ? 5_000_000 : 100_000_000
    expect(resolveSignalEndpointPower(loadout, 'receiver', profile.vesselAntennas, profile.dsnLevels))
      .toEqual({ status: 'success', power: expected, ignoredDirectCount: 4, assumedReceiver: false })
  })

  it.each(['sender', 'receiver'] as const)('accepts DSN power as a %s endpoint', role => {
    expect(resolve(single('dsn:dsn3'), role)).toEqual({ status: 'success', power: 250_000_000_000, ignoredDirectCount: 0, assumedReceiver: false })
  })

  it('marks custom receiving power as a user assumption without scaling it', () => {
    const loadout = { ...single('custom'), customPower: '123456' }
    expect(resolve(loadout, 'receiver')).toEqual({ status: 'success', power: 123_456, ignoredDirectCount: 0, assumedReceiver: true })
    expect(resolve(loadout, 'sender')).toEqual({ status: 'success', power: 123_456, ignoredDirectCount: 0, assumedReceiver: false })
  })

  it.each(['', '0', '-1', 'Infinity', 'NaN', '1000000000000000001'])('rejects invalid custom power %j', customPower => {
    // Use a clearly representable out-of-bounds value for the large-number case.
    const value = customPower === '1000000000000000001' ? '1e19' : customPower
    expect(resolve({ ...single('custom'), customPower: value }, 'receiver')).toEqual({ status: 'invalid' })
  })

  it('preserves missing hardware errors even when the unavailable part would not contribute receiving power', () => {
    const loadout = array([{ antennaId: 'communotron-8', count: 4 }, { antennaId: 'hg-5', count: 1 }])
    expect(resolve(loadout, 'receiver')).toEqual({ status: 'unavailable' })
    expect(resolve(single('missing-antenna'), 'receiver')).toEqual({ status: 'unavailable' })
  })

  it('validates invalid direct rows before filtering the receiver subset', () => {
    expect(resolve(array([{ antennaId: 'communotron-16', count: 0 }, { antennaId: 'hg-5', count: 1 }]), 'receiver')).toEqual({ status: 'invalid' })
    expect(resolve(array([{ antennaId: 'communotron-16', count: 1 }, { antennaId: 'communotron-16', count: 1 }, { antennaId: 'hg-5', count: 1 }]), 'receiver')).toEqual({ status: 'invalid' })
    expect(resolve(array(null), 'receiver')).toEqual({ status: 'invalid' })
  })
})
