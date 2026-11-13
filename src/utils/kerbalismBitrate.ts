import type { CommNetAntenna } from '../data/commnet'
import {
  KERBALISM_BITS_PER_MEGABYTE, MAX_KERBALISM_ANTENNA_SPEED,
  MAX_KERBALISM_RATE_BITS_PER_SECOND, kerbalismAntennaRates,
} from '../data/kerbalismRates'
import { calculateAntennaArray, type AntennaArrayEntry } from './antennaArray'
import type { SignalEndpointLoadout } from './signalEndpoint'
import { MAX_DAMPING_EXPONENT, kerbalismDampedStrength } from './signalStrength'

export {
  DEFAULT_KERBALISM_ANTENNA_SPEED, DEFAULT_KERBALISM_MINIMUM_BITS_PER_SECOND,
  MAX_KERBALISM_ANTENNA_SPEED, MAX_KERBALISM_RATE_BITS_PER_SECOND,
} from '../data/kerbalismRates'

export type KerbalismBaseRate = {
  status: 'success'
  baseRateBitsPerSecond: number
  /** Counts every active external transmitter, independently of power combining. */
  externalCount: number
} | { status: 'needs-rate' | 'unavailable' | 'invalid' | 'dsn' }

/** Resolve the sender's full-strength rate, before Antenna Speed or damping.
 * Selected parts are assumed active, deployed, powered, and operational.
 */
export function resolveKerbalismBaseRate(
  loadout: SignalEndpointLoadout,
  antennas: readonly CommNetAntenna[],
  customRateBitsPerSecond?: number,
): KerbalismBaseRate {
  if (loadout.selection === 'custom') {
    if (customRateBitsPerSecond === undefined || Number.isNaN(customRateBitsPerSecond)) return { status: 'needs-rate' }
    if (!Number.isFinite(customRateBitsPerSecond) || customRateBitsPerSecond < 0
      || customRateBitsPerSecond > MAX_KERBALISM_RATE_BITS_PER_SECOND) return { status: 'invalid' }
    // Custom hardware is an explicit external science-transmitter assumption,
    // even when its entered rate is zero; it is not an internal-only loadout.
    return { status: 'success', baseRateBitsPerSecond: customRateBitsPerSecond, externalCount: 1 }
  }
  // DSN power describes a receiver, not a vessel science transmitter rate.
  if (loadout.selection.startsWith('dsn:')) return { status: 'dsn' }
  if (!Array.isArray(antennas) || antennas.length === 0
    || antennas.some(antenna => typeof antenna !== 'object' || antenna === null || Array.isArray(antenna)
      || typeof antenna.id !== 'string')) return { status: 'invalid' }

  const entries: readonly AntennaArrayEntry[] = loadout.selection === 'array'
    ? loadout.array ?? [] : [{ antennaId: loadout.selection, count: 1 }]
  if (!Array.isArray(entries)) return { status: 'invalid' }
  if (entries.some(entry => typeof entry?.antennaId === 'string'
    && !antennas.some(antenna => antenna.id === entry.antennaId))) return { status: 'unavailable' }
  if (calculateAntennaArray(entries, 'client', antennas).status !== 'success') return { status: 'invalid' }

  const external: { antennaId: string; rate: number; count: number }[] = []
  let externalCount = 0
  for (const { antennaId, count } of entries) {
    const reference = Object.hasOwn(kerbalismAntennaRates, antennaId) ? kerbalismAntennaRates[antennaId] : undefined
    if (!reference) return { status: 'needs-rate' }
    if (!reference.external) continue
    external.push({ antennaId, rate: reference.baseRateBitsPerSecond, count })
    externalCount += count
  }
  if (externalCount === 0) return { status: 'success', baseRateBitsPerSecond: 0, externalCount: 0 }
  if (external.length === 1) return { status: 'success', baseRateBitsPerSecond: external[0]!.rate, externalCount }

  // A count-weighted log mean avoids a product overflow/underflow for large
  // arrays. Sorting keeps the result independent of the editor's row order.
  const logarithmicMean = external.toSorted((a, b) => a.antennaId.localeCompare(b.antennaId))
    .reduce((sum, entry) => sum + entry.count / externalCount * Math.log(entry.rate), 0)
  const baseRateBitsPerSecond = Math.exp(logarithmicMean)
  return { status: 'success', baseRateBitsPerSecond, externalCount }
}

export interface KerbalismBitrateInput {
  baseRateBitsPerSecond: number
  rawStrength: number
  dampingExponent: number
  antennaSpeed: number
  minimumBitsPerSecond: number
  linkAvailable: boolean
}

export type KerbalismBitrateResult = {
  status: 'success'
  rateBitsPerSecond: number
  unflooredBitsPerSecond: number
  floorApplied: boolean
  fullStrengthBitsPerSecond: number
} | { status: 'invalid'; errors: string[] }

/** One hop before downstream relay bottlenecks; not a complete home connection. */
export function calculateKerbalismBitrate(input: KerbalismBitrateInput): KerbalismBitrateResult {
  const errors: string[] = []
  const rate = (value: number, name: string) => {
    if (!Number.isFinite(value) || value < 0 || value > MAX_KERBALISM_RATE_BITS_PER_SECOND) {
      errors.push(`${name}: enter a number from 0 to 1e18 bit/s.`)
    }
  }
  rate(input.baseRateBitsPerSecond, 'Full-strength science rate')
  rate(input.minimumBitsPerSecond, 'Minimum science rate')
  if (!Number.isFinite(input.rawStrength) || input.rawStrength < 0 || input.rawStrength > 1) {
    errors.push('Raw CommNet strength must be a number from 0 to 1 (0% to 100%).')
  }
  if (!Number.isFinite(input.dampingExponent) || input.dampingExponent <= 0 || input.dampingExponent > MAX_DAMPING_EXPONENT) {
    errors.push('Damping exponent: enter a number greater than 0 and no more than 1,000,000.')
  }
  if (!Number.isFinite(input.antennaSpeed) || input.antennaSpeed < 0 || input.antennaSpeed > MAX_KERBALISM_ANTENNA_SPEED) {
    errors.push('Antenna Speed: enter a number from 0 to 1,000.')
  }
  if (typeof input.linkAvailable !== 'boolean') errors.push('Link availability must be specified.')
  if (errors.length) return { status: 'invalid', errors }

  const fullStrengthMegabytesPerSecond = input.baseRateBitsPerSecond / KERBALISM_BITS_PER_MEGABYTE * input.antennaSpeed
  // Match the source's MB/s arithmetic and strict-positive floor test. In
  // particular, a disconnected link or floating-point underflow stays zero.
  const megabytesPerSecond = input.linkAvailable
    ? fullStrengthMegabytesPerSecond * kerbalismDampedStrength(input.rawStrength, input.dampingExponent) : 0
  const unflooredBitsPerSecond = megabytesPerSecond * KERBALISM_BITS_PER_MEGABYTE
  const floorApplied = megabytesPerSecond > 0 && unflooredBitsPerSecond < input.minimumBitsPerSecond
  return {
    status: 'success',
    rateBitsPerSecond: floorApplied ? input.minimumBitsPerSecond : unflooredBitsPerSecond,
    unflooredBitsPerSecond, floorApplied,
    fullStrengthBitsPerSecond: fullStrengthMegabytesPerSecond * KERBALISM_BITS_PER_MEGABYTE,
  }
}
