import type { LinkStatus } from './relay'

/** SI inputs for a circular, coplanar, common-center signal reference. */
export interface InterplanetarySignalInput {
  orbitRadiusAM: number
  orbitRadiusBM: number
  centralRadiusM: number
  /** Final effective CommNet powers, including any antenna combination. */
  powerA: number
  powerB: number
  rangeMultiplier: number
  occlusionFactor: number
  /** Relative orbital angle, not a dated ephemeris or launch-window phase. */
  phaseDeg: number
}

export interface SuccessfulInterplanetarySignal {
  status: 'success'
  phaseDeg: number
  distanceM: number
  maximumRangeM: number
  /** Antenna strength before testing the central body's line of sight. */
  rangeStrength: number
  /** Zero when the central body blocks the segment. */
  signalStrength: number
  linkStatus: LinkStatus
  centralClearanceM: number
  minimumDistanceM: number
  maximumDistanceM: number
  /** Distance-envelope strengths exclude occlusion; both are fractions 0–1. */
  bestRangeStrength: number
  worstRangeStrength: number
  pointA: { x: number; y: number }
  pointB: { x: number; y: number }
  occluded: boolean
}

export type InterplanetarySignalResult = SuccessfulInterplanetarySignal
  | { status: 'invalid'; errors: string[] }
