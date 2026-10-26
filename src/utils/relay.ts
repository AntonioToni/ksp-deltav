import type {
  LinkStatus, RelayDeployment, RelayNetworkInput, RelayResult,
  RelayStationLink, SuccessfulRelayPlan,
} from '../types/relay'

export type {
  LinkStatus, RelayBodyData, RelayDeployment, RelayNeighborLink, RelayNetworkInput,
  RelayResult, RelaySatellite, RelayStationLink, SuccessfulRelayPlan,
} from '../types/relay'

const tau = 2 * Math.PI
const angularTolerance = 1e-9
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))
const radians = (degrees: number) => ((degrees % 360 + 360) % 360) * Math.PI / 180
const tolerance = (...values: number[]) => Math.max(1e-6, ...values.map(value => Math.abs(value) * 1e-9))

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validate(input: RelayNetworkInput): string[] {
  const raw: unknown = input
  if (!isRecord(raw)) return ['Relay inputs must be an object.']
  if (!isRecord(raw.body)) return ['Body data must be an object.']
  const errors: string[] = []
  function number(value: unknown, label: string, min: number, max: number, exclusiveMin = false) {
    if (typeof value !== 'number' || !Number.isFinite(value) || (exclusiveMin ? value <= min : value < min) || value > max) {
      errors.push(`${label} must be finite and ${exclusiveMin ? 'greater than' : 'at least'} ${min}, and at most ${max}.`)
    }
  }
  number(raw.body.radiusM, 'Body radius', 1, 1e11)
  number(raw.body.gravitationalParameter, 'Gravitational parameter', 0, 1e30, true)
  number(raw.body.atmosphereHeightM, 'Atmosphere height', 0, 1e13)
  if (raw.body.sphereOfInfluenceM !== undefined) number(raw.body.sphereOfInfluenceM, 'Sphere of influence', 0, 1e15, true)
  number(raw.altitudeM, 'Orbit altitude', 0, 1e13, true)
  number(raw.satelliteCount, 'Relay count', 2, 12)
  if (typeof raw.satelliteCount === 'number' && !Number.isInteger(raw.satelliteCount)) errors.push('Relay count must be an integer.')
  for (const [key, label] of [['relayPower', 'Relay antenna power'], ['clientPower', 'Surface antenna power'], ['dsnPower', 'DSN power']] as const) {
    number(raw[key], label, 0, 1e18, true)
  }
  number(raw.rangeMultiplier, 'Range multiplier', 0, 100, true)
  number(raw.occlusionFactor, 'Occlusion factor', 0, 1, true)
  number(raw.safetyMarginM, 'Safety margin', 0, 1e13)
  for (const [key, label] of [['phaseDeg', 'Relay phase'], ['stationLongitudeDeg', 'Surface longitude']] as const) {
    if (typeof raw[key] !== 'number' || !Number.isFinite(raw[key])) errors.push(`${label} must be finite.`)
  }
  if (typeof raw.hasSurface !== 'boolean') errors.push('The body must declare whether it has a surface.')
  if (raw.deploymentMode !== 'lower' && raw.deploymentMode !== 'higher') errors.push('Choose a lower or higher carrier orbit.')
  if (errors.length) return errors

  const { body, altitudeM, safetyMarginM } = input
  const radius = body.radiusM + altitudeM
  if (!(radius > body.radiusM + body.atmosphereHeightM + safetyMarginM)) {
    errors.push('The circular orbit must be above the body, atmosphere, and requested safety margin.')
  }
  if (body.sphereOfInfluenceM !== undefined) {
    if (!(body.sphereOfInfluenceM > body.radiusM)) errors.push('The sphere of influence must exceed the body radius.')
    if (radius >= body.sphereOfInfluenceM) errors.push('The circular orbit must remain inside the body’s sphere of influence.')
  }
  return errors
}

/** A link at its exact antenna limit has zero signal; a grazing ray is marginal. */
function linkStatus(clearance: number, clearanceTolerance: number, distance: number, range: number): LinkStatus {
  if (clearance < -clearanceTolerance) return 'blocked'
  const rangeTolerance = tolerance(distance, range)
  if (distance > range + rangeTolerance) return 'out-of-range'
  if (Math.abs(clearance) <= clearanceTolerance || distance >= range - rangeTolerance) return 'marginal'
  return 'available'
}

function closestSegmentRadius(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax
  const dy = by - ay
  const squaredLength = dx * dx + dy * dy
  if (squaredLength === 0) return Math.hypot(ax, ay)
  const position = clamp(-(ax * dx + ay * dy) / squaredLength, 0, 1)
  return Math.hypot(ax + position * dx, ay + position * dy)
}

function deployment(input: RelayNetworkInput, orbitRadiusM: number, orbitalPeriodS: number, circularSpeedMps: number): RelayDeployment {
  const { body, satelliteCount, deploymentMode, safetyMarginM } = input
  const ratio = (satelliteCount + (deploymentMode === 'lower' ? -1 : 1)) / satelliteCount
  const carrierPeriodS = orbitalPeriodS * ratio
  const semiMajorAxisM = orbitRadiusM * ratio ** (2 / 3)
  const otherApsisM = 2 * semiMajorAxisM - orbitRadiusM
  const periapsisRadiusM = Math.min(orbitRadiusM, otherApsisM)
  const apoapsisRadiusM = Math.max(orbitRadiusM, otherApsisM)
  const carrierSpeedMps = Math.sqrt(body.gravitationalParameter / orbitRadiusM * (2 - orbitRadiusM / semiMajorAxisM))
  const deltaV = Math.abs(circularSpeedMps - carrierSpeedMps)
  const boundary = body.radiusM + body.atmosphereHeightM + safetyMarginM
  const clearance = periapsisRadiusM - boundary
  const clearanceTolerance = tolerance(periapsisRadiusM, boundary)
  const issues: string[] = []
  let status: RelayDeployment['status'] = 'clear'
  if (clearance < -clearanceTolerance) {
    status = 'blocked'
    issues.push(periapsisRadiusM <= body.radiusM
      ? 'The carrier periapsis intersects the body.'
      : periapsisRadiusM <= body.radiusM + body.atmosphereHeightM
        ? 'The carrier periapsis enters the atmosphere.'
        : 'The carrier periapsis does not meet the requested safety margin.')
  } else if (Math.abs(clearance) <= clearanceTolerance) {
    status = 'marginal'
    issues.push('The carrier periapsis is on the requested clearance boundary.')
  }
  if (body.sphereOfInfluenceM === undefined) {
    if (status === 'clear') status = 'unchecked'
    issues.push('No sphere of influence was supplied; the outer orbit limit is unchecked.')
  } else {
    const remaining = body.sphereOfInfluenceM - apoapsisRadiusM
    if (remaining <= 0) {
      status = 'blocked'
      issues.push('The carrier apoapsis reaches or exceeds the sphere of influence.')
    } else if (remaining <= tolerance(body.sphereOfInfluenceM, apoapsisRadiusM)) {
      if (status !== 'blocked') status = 'marginal'
      issues.push('The carrier apoapsis is very close to the sphere of influence.')
    }
  }
  return {
    mode: deploymentMode, carrierPeriodS, semiMajorAxisM,
    periapsisAltitudeM: periapsisRadiusM - body.radiusM,
    apoapsisAltitudeM: apoapsisRadiusM - body.radiusM,
    injectionDeltaVMps: deltaV, relayCircularizationDeltaVMps: deltaV,
    deploymentDurationS: (satelliteCount - 1) * carrierPeriodS,
    status, issues,
  }
}

/**
 * Ideal circular equatorial geometry and stock CommNet single-antenna ranges.
 * Equatorial visibility is not global coverage or a verified home/DSN path.
 */
export function calculateRelayPlan(input: RelayNetworkInput): RelayResult {
  const errors = validate(input)
  if (errors.length) return { status: 'invalid', errors }
  const { body, satelliteCount, altitudeM, relayPower, clientPower, dsnPower, rangeMultiplier, occlusionFactor, hasSurface } = input
  const orbitRadiusM = body.radiusM + altitudeM
  const occlusionRadiusM = body.radiusM * occlusionFactor
  const circularSpeedMps = Math.sqrt(body.gravitationalParameter / orbitRadiusM)
  const orbitalPeriodS = tau * orbitRadiusM / circularSpeedMps
  const neighborDistanceM = 2 * orbitRadiusM * Math.sin(Math.PI / satelliteCount)
  // Opposite relays always cross the center; avoid cos(π/2) roundoff at N=2.
  const neighborClearanceM = (satelliteCount === 2 ? 0 : orbitRadiusM * Math.cos(Math.PI / satelliteCount)) - occlusionRadiusM
  const neighborRangeM = relayPower * rangeMultiplier
  const surfaceRangeM = Math.sqrt(relayPower) * Math.sqrt(clientPower) * rangeMultiplier
  const dsnRangeM = Math.sqrt(relayPower) * Math.sqrt(dsnPower) * rangeMultiplier
  const ringLinkStatus = satelliteCount === 2 ? 'blocked'
    : linkStatus(neighborClearanceM, tolerance(orbitRadiusM, occlusionRadiusM), neighborDistanceM, neighborRangeM)
  const phase = radians(input.phaseDeg)
  const stationAngle = radians(input.stationLongitudeDeg)
  const satellites = Array.from({ length: satelliteCount }, (_, index) => {
    const angleRad = (phase + tau * index / satelliteCount) % tau
    return { x: orbitRadiusM * Math.cos(angleRad), y: orbitRadiusM * Math.sin(angleRad), angleRad }
  })
  const neighborLinks: SuccessfulRelayPlan['neighborLinks'] = []
  const pairs = new Set<string>()
  for (let index = 0; index < satelliteCount; index++) {
    const toIndex = (index + 1) % satelliteCount
    const key = JSON.stringify([index, toIndex].sort((a, b) => a - b))
    if (pairs.has(key)) continue
    pairs.add(key)
    neighborLinks.push({ fromIndex: index, toIndex, distanceM: neighborDistanceM, clearanceM: neighborClearanceM, status: ringLinkStatus })
  }

  let surfaceHalfAngleRad: number | null = null
  let equatorialCoverageFraction: number | null = null
  let coverageStatus: SuccessfulRelayPlan['coverageStatus'] = null
  const stationLinks: RelayStationLink[] = []
  if (hasSurface) {
    const horizonAngle = Math.acos(clamp(occlusionRadiusM / orbitRadiusM, -1, 1))
      + Math.acos(clamp(occlusionRadiusM / body.radiusM, -1, 1))
    // The equivalent form 1 - (L²-h²)/(2rR) avoids subtracting large r²+R².
    const rangeAngle = surfaceRangeM <= altitudeM ? 0
      : Math.acos(clamp(1 - (surfaceRangeM ** 2 - altitudeM ** 2) / (2 * orbitRadiusM * body.radiusM), -1, 1))
    surfaceHalfAngleRad = Math.min(horizonAngle, rangeAngle)
    equatorialCoverageFraction = clamp(satelliteCount * surfaceHalfAngleRad / Math.PI, 0, 1)
    const overlap = surfaceHalfAngleRad - Math.PI / satelliteCount
    coverageStatus = surfaceHalfAngleRad <= angularTolerance ? 'none'
      : overlap > angularTolerance ? 'full'
        : Math.abs(overlap) <= angularTolerance ? 'marginal' : 'partial'
    const stationX = body.radiusM * Math.cos(stationAngle)
    const stationY = body.radiusM * Math.sin(stationAngle)
    satellites.forEach((satellite, satelliteIndex) => {
      const distanceM = Math.hypot(satellite.x - stationX, satellite.y - stationY)
      const separation = Math.abs(Math.atan2(Math.sin(satellite.angleRad - stationAngle), Math.cos(satellite.angleRad - stationAngle)))
      const clearanceM = closestSegmentRadius(stationX, stationY, satellite.x, satellite.y) - occlusionRadiusM
      // At f=1 the ground endpoint touches the occluder for every outward ray.
      // Horizon angle distinguishes a valid surface-originating ray from grazing.
      const status = linkStatus(horizonAngle - separation, angularTolerance, distanceM, surfaceRangeM)
      stationLinks.push({ satelliteIndex, distanceM, clearanceM, status })
    })
  }
  const deploymentPlan = deployment(input, orbitRadiusM, orbitalPeriodS, circularSpeedMps)
  const numericOutputs = [
    orbitRadiusM, orbitalPeriodS, circularSpeedMps, neighborDistanceM, neighborClearanceM,
    neighborRangeM, surfaceRangeM, dsnRangeM, deploymentPlan.carrierPeriodS,
    deploymentPlan.semiMajorAxisM, deploymentPlan.periapsisAltitudeM,
    deploymentPlan.apoapsisAltitudeM, deploymentPlan.injectionDeltaVMps,
    deploymentPlan.relayCircularizationDeltaVMps, deploymentPlan.deploymentDurationS,
  ]
  if (numericOutputs.some(value => !Number.isFinite(value)) || circularSpeedMps <= 0 || orbitalPeriodS <= 0) {
    return { status: 'invalid', errors: ['These inputs exceed the supported numerical range for orbital calculations.'] }
  }
  const warnings = body.sphereOfInfluenceM === undefined
    ? ['Sphere of influence is not supplied; outer orbit bounds are unchecked.'] : []
  return {
    status: 'success', orbitRadiusM, orbitalPeriodS, circularSpeedMps,
    neighborDistanceM, neighborClearanceM, neighborRangeM, ringLinkStatus,
    surfaceRangeM, surfaceHalfAngleRad, equatorialCoverageFraction, coverageStatus,
    dsnRangeM, satellites, neighborLinks, stationLinks, deployment: deploymentPlan, warnings,
  }
}
