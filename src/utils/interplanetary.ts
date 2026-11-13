import type { InterplanetarySignalInput, InterplanetarySignalResult } from '../types/interplanetary'
import type { LinkStatus } from '../types/relay'
import { commNetSignalStrength, kerbalismDampedStrength, MAX_DAMPING_EXPONENT } from './signalStrength'

export type { InterplanetarySignalInput, InterplanetarySignalResult, SuccessfulInterplanetarySignal } from '../types/interplanetary'
export { commNetSignalStrength } from './signalStrength'

const tolerance = (...values: number[]) => Math.max(1e-6, ...values.map(value => Math.abs(value) * 1e-9))

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validate(input: InterplanetarySignalInput): string[] {
  const raw: unknown = input
  if (!isRecord(raw)) return ['Interplanetary signal inputs must be an object.']
  const errors: string[] = []
  const positive = (value: unknown, label: string, maximum: number) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > maximum) {
      errors.push(`${label} must be finite, greater than zero, and at most ${maximum}.`)
    }
  }
  positive(raw.orbitRadiusAM, 'Orbit A radius', 1e16)
  positive(raw.orbitRadiusBM, 'Orbit B radius', 1e16)
  positive(raw.centralRadiusM, 'Central body radius', 1e12)
  positive(raw.powerA, 'Endpoint A power', 1e18)
  positive(raw.powerB, 'Endpoint B power', 1e18)
  positive(raw.rangeMultiplier, 'Range multiplier', 100)
  positive(raw.occlusionFactor, 'Occlusion factor', 1)
  if (raw.dampingExponent !== undefined) positive(raw.dampingExponent, 'Damping exponent', MAX_DAMPING_EXPONENT)
  if (typeof raw.phaseDeg !== 'number' || !Number.isFinite(raw.phaseDeg)) errors.push('Relative phase must be finite.')
  if (errors.length) return errors
  if (input.orbitRadiusAM <= input.centralRadiusM || input.orbitRadiusBM <= input.centralRadiusM) {
    errors.push('Both circular reference orbits must lie outside the central body’s physical radius.')
  }
  return errors
}

function normalizePhase(degrees: number): number {
  const remainder = degrees % 360
  const normalized = remainder < 0 ? remainder + 360 : remainder
  return normalized === 0 || normalized === 360 ? 0 : normalized
}

function orbitalPoint(radiusM: number, phaseDeg: number): { x: number; y: number } {
  // Preserve exact opposition and conjunction, without a sin(pi) artifact
  // that can falsely clear a small occluder between very distant endpoints.
  if (phaseDeg === 0) return { x: radiusM, y: 0 }
  if (phaseDeg === 90) return { x: 0, y: radiusM }
  if (phaseDeg === 180) return { x: -radiusM, y: 0 }
  if (phaseDeg === 270) return { x: 0, y: -radiusM }
  const angle = phaseDeg * Math.PI / 180
  return { x: radiusM * Math.cos(angle), y: radiusM * Math.sin(angle) }
}

function closestSegmentRadius(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax
  const dy = by - ay
  const length = Math.hypot(dx, dy)
  if (length === 0) return Math.hypot(ax, ay)
  const ux = dx / length
  const uy = dy / length
  const projection = -(ax * ux + ay * uy)
  if (projection <= 0) return Math.hypot(ax, ay)
  if (projection >= length) return Math.hypot(bx, by)
  // Normalized cross product avoids subtracting nearly equal coordinates at
  // the closest point for long interplanetary segments near conjunction.
  return Math.abs(ax * uy - ay * ux)
}

/** Circular common-center model; no dates, local occultations or DSN path. */
export function calculateInterplanetarySignal(input: InterplanetarySignalInput): InterplanetarySignalResult {
  const errors = validate(input)
  if (errors.length) return { status: 'invalid', errors }

  const phaseDeg = normalizePhase(input.phaseDeg)
  const pointA = { x: input.orbitRadiusAM, y: 0 }
  const pointB = orbitalPoint(input.orbitRadiusBM, phaseDeg)
  const distanceM = Math.hypot(pointB.x - pointA.x, pointB.y - pointA.y)
  const powerProduct = input.powerA * input.powerB
  const pairRange = powerProduct > 0 ? Math.sqrt(powerProduct) : Math.sqrt(input.powerA) * Math.sqrt(input.powerB)
  const maximumRangeM = pairRange * input.rangeMultiplier
  const occlusionRadiusM = input.centralRadiusM * input.occlusionFactor
  if (!(maximumRangeM > 0) || !Number.isFinite(maximumRangeM) || !(occlusionRadiusM > 0)) {
    return { status: 'invalid', errors: ['These inputs exceed the supported numerical range for signal calculations.'] }
  }
  const centralClearanceM = closestSegmentRadius(pointA.x, pointA.y, pointB.x, pointB.y) - occlusionRadiusM
  // A very small but positive effective occluder must still block a ray
  // through its center; never let an absolute tolerance swallow its radius.
  const clearanceTolerance = Math.min(tolerance(occlusionRadiusM), occlusionRadiusM * 1e-6)
  const rangeTolerance = tolerance(distanceM, maximumRangeM)
  const occluded = centralClearanceM < -clearanceTolerance
  const linkStatus: LinkStatus = occluded ? 'blocked'
    : distanceM > maximumRangeM + rangeTolerance ? 'out-of-range'
      : Math.abs(centralClearanceM) <= clearanceTolerance || distanceM >= maximumRangeM - rangeTolerance ? 'marginal' : 'available'
  const minimumDistanceM = Math.abs(input.orbitRadiusAM - input.orbitRadiusBM)
  const maximumDistanceM = input.orbitRadiusAM + input.orbitRadiusBM
  const rangeStrength = commNetSignalStrength(distanceM, maximumRangeM)
  const signalStrength = occluded ? 0 : rangeStrength
  const bestRangeStrength = commNetSignalStrength(minimumDistanceM, maximumRangeM)
  const worstRangeStrength = commNetSignalStrength(maximumDistanceM, maximumRangeM)
  const dampingExponent = input.dampingExponent ?? 1

  return {
    status: 'success', phaseDeg, distanceM, maximumRangeM, rangeStrength,
    signalStrength,
    dampedStrength: kerbalismDampedStrength(signalStrength, dampingExponent),
    dampedRangeStrength: kerbalismDampedStrength(rangeStrength, dampingExponent),
    linkStatus, centralClearanceM, minimumDistanceM, maximumDistanceM,
    bestRangeStrength, worstRangeStrength,
    bestDampedStrength: kerbalismDampedStrength(bestRangeStrength, dampingExponent),
    worstDampedStrength: kerbalismDampedStrength(worstRangeStrength, dampingExponent),
    pointA, pointB, occluded,
  }
}
