import type { CommNetAntenna, CommNetPowerPreset } from '../data/commnet'
import { calculateAntennaArray, type AntennaArrayEntry } from './antennaArray'

export interface SignalEndpointLoadout {
  selection: string
  customPower: string
  array: readonly AntennaArrayEntry[] | null
}

export type SignalEndpointPower = {
  status: 'success'
  power: number
  /** Direct antennas remain on the craft but cannot add receiving power. */
  ignoredDirectCount: number
  /** Custom receiver power is an explicit user assumption about relay hardware. */
  assumedReceiver: boolean
} | { status: 'needs-relay' | 'invalid' | 'unavailable' }

const validPower = (value: number) => Number.isFinite(value) && value > 0 && value <= 1e18

/** Resolve one direction of a CommNet hop: full transmitting power at the
 * sender, but relay-capable power only at a receiving vessel.
 */
export function resolveSignalEndpointPower(
  loadout: SignalEndpointLoadout,
  role: 'sender' | 'receiver',
  antennas: readonly CommNetAntenna[],
  dsnLevels: readonly CommNetPowerPreset[],
): SignalEndpointPower {
  if (role !== 'sender' && role !== 'receiver') return { status: 'invalid' }
  if (loadout.selection === 'custom') {
    const power = loadout.customPower.trim() === '' ? NaN : Number(loadout.customPower)
    return validPower(power) ? { status: 'success', power, ignoredDirectCount: 0, assumedReceiver: role === 'receiver' } : { status: 'invalid' }
  }
  if (loadout.selection.startsWith('dsn:')) {
    const power = dsnLevels.find(level => level.id === loadout.selection.slice(4))?.power ?? NaN
    return validPower(power) ? { status: 'success', power, ignoredDirectCount: 0, assumedReceiver: false } : { status: 'invalid' }
  }
  if (loadout.selection === 'array') {
    const entries = loadout.array ?? []
    if (entries.some(entry => !antennas.some(antenna => antenna.id === entry.antennaId))) return { status: 'unavailable' }
    // Validate the entire saved loadout before filtering. Invalid direct rows
    // must not silently disappear just because they do not receive this hop.
    const full = calculateAntennaArray(entries, 'client', antennas)
    if (full.status !== 'success') return { status: 'invalid' }
    if (role === 'sender') return { status: 'success', power: full.effectivePower, ignoredDirectCount: 0, assumedReceiver: false }
    const relayEntries = entries.filter(entry => antennas.find(antenna => antenna.id === entry.antennaId)!.relay)
    if (!relayEntries.length) return { status: 'needs-relay' }
    const receiving = calculateAntennaArray(relayEntries, 'relay', antennas)
    if (receiving.status !== 'success') return { status: 'invalid' }
    return {
      status: 'success', power: receiving.effectivePower,
      ignoredDirectCount: full.totalCount - receiving.totalCount, assumedReceiver: false,
    }
  }
  const antenna = antennas.find(candidate => candidate.id === loadout.selection)
  if (!antenna) return { status: 'unavailable' }
  if (!validPower(antenna.power)) return { status: 'invalid' }
  if (role === 'receiver' && !antenna.relay) return { status: 'needs-relay' }
  return { status: 'success', power: antenna.power, ignoredDirectCount: 0, assumedReceiver: false }
}
