import { vesselAntennas, type CommNetAntenna } from '../data/commnet'

export interface AntennaArrayEntry {
  antennaId: string
  count: number
}

export type AntennaArrayRole = 'relay' | 'client'

export type AntennaArrayResult = {
  status: 'success'
  effectivePower: number
  totalCount: number
  combinableCount: number
  strongestSinglePower: number
  combinedPower: number
  weightedExponent: number | null
  notes: string[]
} | { status: 'invalid'; errors: string[] }

const antennasById = new Map(vesselAntennas.map(antenna => [antenna.id, antenna]))
const maxAntennas = 100

/** Stock CommNet power for antennas on one craft, before any range multiplier. */
export function calculateAntennaArray(entries: readonly AntennaArrayEntry[], role: AntennaArrayRole): AntennaArrayResult {
  const errors: string[] = []
  if (role !== 'relay' && role !== 'client') return { status: 'invalid', errors: ['Choose a relay or surface-client antenna array.'] }
  if (!Array.isArray(entries) || entries.length === 0 || entries.length > vesselAntennas.length) {
    return { status: 'invalid', errors: [`Choose between 1 and ${vesselAntennas.length} distinct antenna models.`] }
  }

  const seen = new Set<string>()
  const selected: { antenna: CommNetAntenna; count: number }[] = []
  let totalCount = 0
  for (const [index, raw] of entries.entries()) {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      errors.push(`Antenna row ${index + 1} must be an object.`)
      continue
    }
    const { antennaId, count } = raw
    if (typeof antennaId !== 'string' || !antennasById.has(antennaId)) {
      errors.push(`Antenna row ${index + 1} must select a known vessel antenna.`)
    } else {
      if (seen.has(antennaId)) errors.push('Use each antenna model once and enter its quantity in that row.')
      seen.add(antennaId)
    }
    const antenna = typeof antennaId === 'string' ? antennasById.get(antennaId) : undefined
    const validCount = typeof count === 'number' && Number.isInteger(count) && count >= 1 && count <= maxAntennas
    if (!validCount) errors.push(`Antenna row ${index + 1} quantity must be an integer from 1 to ${maxAntennas}.`)
    else totalCount += count
    if (antenna && role === 'relay' && !antenna.relay) errors.push('Relay forwarding arrays can only contain HG-5 or RA relay antennas.')
    if (antenna && validCount) selected.push({ antenna, count })
  }
  if (totalCount > maxAntennas) errors.push(`Use at most ${maxAntennas} antennas on one craft.`)
  if (errors.length) return { status: 'invalid', errors }

  let strongestSinglePower = 0
  let strongestCombinablePower = 0
  let sumCombinablePower = 0
  let weightedExponentSum = 0
  let combinableCount = 0
  for (const { antenna, count } of selected) {
    strongestSinglePower = Math.max(strongestSinglePower, antenna.power)
    if (!antenna.combinable) continue
    const contributedPower = antenna.power * count
    strongestCombinablePower = Math.max(strongestCombinablePower, antenna.power)
    sumCombinablePower += contributedPower
    weightedExponentSum += contributedPower * antenna.combinabilityExponent
    combinableCount += count
  }
  const weightedExponent = sumCombinablePower > 0 ? weightedExponentSum / sumCombinablePower : null
  const combinedPower = weightedExponent === null ? 0
    : strongestCombinablePower * (sumCombinablePower / strongestCombinablePower) ** weightedExponent
  const effectivePower = Math.max(strongestSinglePower, combinedPower)
  if (![effectivePower, strongestSinglePower, combinedPower].every(Number.isFinite)
    || effectivePower <= 0 || effectivePower > 1e18) {
    return { status: 'invalid', errors: ['The selected array exceeds the supported antenna-power range.'] }
  }
  const notes = totalCount > combinableCount
    ? ['Non-combinable antennas remain separate single antennas; extra copies do not increase their power.'] : []
  return { status: 'success', effectivePower, totalCount, combinableCount, strongestSinglePower, combinedPower, weightedExponent, notes }
}
