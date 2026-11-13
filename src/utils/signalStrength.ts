/** Upper bound shared by user-supplied damping inputs and the pure engines. */
export const MAX_DAMPING_EXPONENT = 1_000_000

/** Stock CommNet attenuation before testing whether another body blocks a link. */
export function commNetSignalStrength(distanceM: number, maximumRangeM: number): number {
  if (!Number.isFinite(distanceM) || distanceM < 0) throw new RangeError('Signal distance must be finite and nonnegative.')
  if (!Number.isFinite(maximumRangeM) || maximumRangeM <= 0) throw new RangeError('Maximum signal range must be finite and positive.')
  const remaining = Math.min(1, Math.max(0, 1 - distanceM / maximumRangeM))
  return remaining * remaining * (3 - 2 * remaining)
}

/** Kerbalism's dimensionless strength factor, before any minimum-rate floor. */
export function kerbalismDampedStrength(strength: number, exponent: number): number {
  if (!Number.isFinite(strength) || strength < 0 || strength > 1) throw new RangeError('Raw signal strength must be between zero and one.')
  if (!Number.isFinite(exponent) || exponent <= 0 || exponent > MAX_DAMPING_EXPONENT) throw new RangeError('Damping exponent must be greater than zero and at most 1,000,000.')
  return strength ** exponent
}

export interface KerbalismDampingCalibration {
  exponent: number
  source: 'automatic' | 'fallback'
  calibrationDistanceM: number | null
  calibrationStrength: number | null
}

/**
 * Kerbalism 3.44's reference calibration: the maximum DSN power is the
 * calibration range, independently of the antenna pair or selected DSN level.
 * Numerical reference: pinned official Sim.cs, revision 39f9f43afe8b4f77aff0086c3866044287694475.
 */
export function calibrateKerbalismDamping(homeOrbitRadiusM: number | null, maximumDsnPowerM: number): KerbalismDampingCalibration {
  const fallback: KerbalismDampingCalibration = {
    exponent: 6, source: 'fallback', calibrationDistanceM: null, calibrationStrength: null,
  }
  if (homeOrbitRadiusM === null || !Number.isFinite(homeOrbitRadiusM) || homeOrbitRadiusM <= 0
    || !Number.isFinite(maximumDsnPowerM) || maximumDsnPowerM <= 0) return fallback

  const referenceRatio = .3925 / .48
  for (const auMultiple of [2, 1.5, 1, .75, .5, .25]) {
    const calibrationDistanceM = homeOrbitRadiusM * auMultiple
    if (!Number.isFinite(calibrationDistanceM) || calibrationDistanceM <= 0 || calibrationDistanceM >= maximumDsnPowerM) continue
    const calibrationStrength = commNetSignalStrength(calibrationDistanceM, maximumDsnPowerM)
    if (calibrationStrength < .001 || calibrationStrength > .999) continue
    const exponent = Math.log(referenceRatio ** (auMultiple / 2)) / Math.log(calibrationStrength)
    if (!Number.isFinite(exponent) || exponent <= 0 || exponent > MAX_DAMPING_EXPONENT) continue
    return { exponent, source: 'automatic', calibrationDistanceM, calibrationStrength }
  }
  return fallback
}
