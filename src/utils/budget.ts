export interface DeltaVBudget {
  baseDeltaV: number
  redundancyPercent: number
  extraDeltaV: number
  totalDeltaV: number
}

/** Apply a mission reserve without changing any maneuver or route costs. */
export function calculateBudget(baseDeltaV: number, redundancyPercent: number): DeltaVBudget {
  if (!Number.isFinite(baseDeltaV) || baseDeltaV < 0) {
    throw new RangeError('Base Delta-V must be finite and nonnegative.')
  }
  if (!Number.isFinite(redundancyPercent) || redundancyPercent < 0 || redundancyPercent > 100) {
    throw new RangeError('Redundancy must be between 0 and 100 percent.')
  }

  // Add the reserve separately to avoid 100 * 1.1 rounding up to 111.
  const unrounded = baseDeltaV + baseDeltaV * (redundancyPercent / 100)
  if (!Number.isFinite(unrounded)) throw new RangeError('The total budget exceeds the supported numeric range.')
  const nearestInteger = Math.round(unrounded)
  const roundingTolerance = Number.EPSILON * Math.max(1, Math.abs(unrounded))
  const stableTotal = Math.abs(unrounded - nearestInteger) <= roundingTolerance ? nearestInteger : unrounded
  // Snap only floating-point noise; never reduce the original base budget.
  const totalDeltaV = Math.max(Math.ceil(baseDeltaV), Math.ceil(stableTotal))

  return {
    baseDeltaV,
    redundancyPercent,
    extraDeltaV: totalDeltaV - baseDeltaV,
    totalDeltaV,
  }
}
