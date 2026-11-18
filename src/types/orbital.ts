import type { LinkStatus } from './relay'

export interface Vector3 { x: number; y: number; z: number }

/** Fixed osculating elliptic elements. Angles are named with their units. */
export interface OrbitalElements {
  semiMajorAxisM: number
  eccentricity: number
  inclinationDeg: number
  longitudeAscendingNodeDeg: number
  argumentOfPeriapsisDeg: number
  meanAnomalyAtEpochRad: number
  epochS: number
  periodS: number
}

export interface OrbitalBody {
  id: string
  parentBodyId: string | null
  name?: string
  radiusM: number
  gravitationalParameter?: number
  /** Partial records retain known reference radii without inventing elements. */
  orbit?: Partial<OrbitalElements>
}

export type OrbitalGeometryMode = 'actual' | 'circular' | 'manual-distance'
export type OrbitalPositionMode = 'phase' | 'date'

export interface OrbitalSignalInput {
  bodies: readonly OrbitalBody[]
  bodyAId: string
  bodyBId: string
  geometry: OrbitalGeometryMode
  positionMode: OrbitalPositionMode
  phaseDeg: number
  referenceTrueAnomalyDeg?: number
  utS?: number
  distanceM?: number
  powerA: number
  powerB: number
  rangeMultiplier: number
  occlusionFactor: number
  dampingExponent?: number
}

export interface OrbitalTrack {
  bodyId: string
  parentBodyId: string
  center: Vector3
  /** Frozen-parent orbital path; only endpoint positions represent a date. */
  points: Vector3[]
}

export interface OrbitalSignalSuccess {
  status: 'success'
  geometryUsed: OrbitalGeometryMode
  positionMode: OrbitalPositionMode
  phaseDeg: number
  utS: number
  distanceM: number
  maximumRangeM: number
  rangeStrength: number
  signalStrength: number
  dampedStrength: number
  dampedRangeStrength: number
  linkStatus: LinkStatus
  pointA: Vector3 | null
  pointB: Vector3 | null
  centerId: string | null
  bodyPositions: Record<string, Vector3>
  orbitPaths: OrbitalTrack[]
  occluded: boolean
  /** null means blocking is unknown (manual distance) or no occluder is known. */
  minimumClearanceM: number | null
  blockingBodyIds: string[]
  /** Per-body diagnostics also let the sweep refine simultaneous occultations. */
  occluderClearancesM?: Record<string, number>
  fallbackReasons: string[]
  uncheckedBodyIds: string[]
}

export type OrbitalSignalResult = OrbitalSignalSuccess | { status: 'invalid'; errors: string[] }

export interface OrbitalSignalSample extends OrbitalSignalSuccess {
  /** Degrees in phase mode, universal seconds in date mode. */
  parameter: number
}

export interface OrbitalSweepInterval {
  start: number
  end: number
  kind: 'phase' | 'synodic' | 'orbital-period' | 'fixed-time'
  label: string
}

export interface OrbitalSignalSweep {
  status: 'success'
  current: OrbitalSignalSuccess
  samples: OrbitalSignalSample[]
  closest: OrbitalSignalSample
  farthest: OrbitalSignalSample
  interval: OrbitalSweepInterval
  /** Samples represent a selected sweep/window, not all possible alignments. */
  scopeLabel: string
}

export type OrbitalSignalSweepResult = OrbitalSignalSweep | { status: 'invalid'; errors: string[] }
