/** SI physical inputs for one spherical body; no orbital ephemeris is inferred. */
export interface RelayBodyData {
  radiusM: number
  gravitationalParameter: number
  atmosphereHeightM: number
  sphereOfInfluenceM?: number
}

export interface RelayNetworkInput {
  body: RelayBodyData
  hasSurface: boolean
  satelliteCount: number
  altitudeM: number
  relayPower: number
  clientPower: number
  dsnPower: number
  rangeMultiplier: number
  occlusionFactor: number
  phaseDeg: number
  stationLongitudeDeg: number
  safetyMarginM: number
  deploymentMode: 'lower' | 'higher'
}

export type LinkStatus = 'available' | 'marginal' | 'blocked' | 'out-of-range'

export interface RelaySatellite {
  x: number
  y: number
  angleRad: number
}

export interface RelayNeighborLink {
  fromIndex: number
  toIndex: number
  distanceM: number
  clearanceM: number
  status: LinkStatus
}

export interface RelayStationLink {
  satelliteIndex: number
  distanceM: number
  /** Segment-to-occluder clearance; ground endpoints can have zero clearance. */
  clearanceM: number
  status: LinkStatus
}

export interface RelayDeployment {
  mode: 'lower' | 'higher'
  carrierPeriodS: number
  semiMajorAxisM: number
  periapsisAltitudeM: number
  apoapsisAltitudeM: number
  injectionDeltaVMps: number
  relayCircularizationDeltaVMps: number
  /** First relay is released at t=0; the last follows N-1 carrier orbits later. */
  deploymentDurationS: number
  status: 'clear' | 'blocked' | 'marginal' | 'unchecked'
  issues: string[]
}

export interface SuccessfulRelayPlan {
  status: 'success'
  orbitRadiusM: number
  orbitalPeriodS: number
  circularSpeedMps: number
  neighborDistanceM: number
  neighborClearanceM: number
  neighborRangeM: number
  ringLinkStatus: LinkStatus
  surfaceRangeM: number
  surfaceHalfAngleRad: number | null
  equatorialCoverageFraction: number | null
  coverageStatus: 'full' | 'partial' | 'marginal' | 'none' | null
  /** Range only: this is not a checked home/DSN communication path. */
  dsnRangeM: number
  satellites: RelaySatellite[]
  neighborLinks: RelayNeighborLink[]
  stationLinks: RelayStationLink[]
  deployment: RelayDeployment
  warnings: string[]
}

export type RelayResult = SuccessfulRelayPlan | { status: 'invalid'; errors: string[] }
