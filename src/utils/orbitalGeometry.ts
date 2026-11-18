import type { OrbitalBody, OrbitalElements, Vector3 } from '../types/orbital'

const tau = Math.PI * 2
const radians = Math.PI / 180
export const normalizeDegrees = (value: number) => ((value % 360) + 360) % 360
export const addVectors = (a: Vector3, b: Vector3): Vector3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z })
export const subtractVectors = (a: Vector3, b: Vector3): Vector3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
export const vectorDistance = (a: Vector3, b: Vector3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)

/** KSP patched-conic body periods use the parent gravitational parameter. */
export function deriveOrbitalPeriod(semiMajorAxisM: number, parentGravitationalParameter: number): number {
  if (!(semiMajorAxisM > 0) || !Number.isFinite(semiMajorAxisM)
    || !(parentGravitationalParameter > 0) || !Number.isFinite(parentGravitationalParameter)) return NaN
  return tau * Math.sqrt(semiMajorAxisM / parentGravitationalParameter) * semiMajorAxisM
}

export function validateOrbitalElements(orbit: Partial<OrbitalElements>): string[] {
  const errors: string[] = []
  if (!Number.isFinite(orbit.semiMajorAxisM) || !(orbit.semiMajorAxisM! > 0)) errors.push('semi-major axis')
  if (!Number.isFinite(orbit.eccentricity) || orbit.eccentricity! < 0 || orbit.eccentricity! >= 1) errors.push('eccentricity (0 to less than 1)')
  for (const key of ['inclinationDeg', 'longitudeAscendingNodeDeg', 'argumentOfPeriapsisDeg', 'meanAnomalyAtEpochRad', 'epochS'] as const) {
    if (!Number.isFinite(orbit[key])) errors.push(({ inclinationDeg: 'inclination', longitudeAscendingNodeDeg: 'ascending node', argumentOfPeriapsisDeg: 'argument of periapsis', meanAnomalyAtEpochRad: 'mean anomaly at epoch', epochS: 'reference epoch' })[key])
  }
  if (!Number.isFinite(orbit.periodS) || !(orbit.periodS! > 0)) errors.push('orbital period or parent gravitational parameter')
  return errors
}

/** Bracketed Newton solve: robust for elliptic orbits arbitrarily close to e=1. */
export function solveKeplerEquation(meanAnomalyRad: number, eccentricity: number): number {
  if (!Number.isFinite(meanAnomalyRad) || !Number.isFinite(eccentricity) || eccentricity < 0 || eccentricity >= 1) throw new RangeError('Kepler inputs require a finite anomaly and 0 ≤ eccentricity < 1.')
  const mean = ((meanAnomalyRad + Math.PI) % tau + tau) % tau - Math.PI
  if (mean === 0 || eccentricity === 0) return mean
  let low = -Math.PI
  let high = Math.PI
  let eccentric = eccentricity < .8 ? mean : Math.sign(mean) * Math.PI
  for (let iteration = 0; iteration < 100; iteration++) {
    const residual = eccentric - eccentricity * Math.sin(eccentric) - mean
    if (residual === 0) return eccentric
    if (residual > 0) high = eccentric
    else low = eccentric
    const next = eccentric - residual / (1 - eccentricity * Math.cos(eccentric))
    const candidate = next > low && next < high ? next : (low + high) / 2
    if (Math.abs(candidate - eccentric) <= 2e-15) return candidate
    eccentric = candidate
  }
  return eccentric
}

/** Rotate the perifocal plane by argument of periapsis, inclination, then LAN. */
function rotatePerifocal(orbit: Pick<OrbitalElements, 'inclinationDeg' | 'longitudeAscendingNodeDeg' | 'argumentOfPeriapsisDeg'>, x: number, y: number): Vector3 {
  const trig = (degrees: number) => {
    const angle = normalizeDegrees(degrees)
    return {
      cosine: angle === 0 ? 1 : angle === 90 || angle === 270 ? 0 : angle === 180 ? -1 : Math.cos(angle * radians),
      sine: angle === 0 || angle === 180 ? 0 : angle === 90 ? 1 : angle === 270 ? -1 : Math.sin(angle * radians),
    }
  }
  const argument = trig(orbit.argumentOfPeriapsisDeg)
  const inclination = trig(orbit.inclinationDeg)
  const node = trig(orbit.longitudeAscendingNodeDeg)
  const xp = x * argument.cosine - y * argument.sine
  const yp = x * argument.sine + y * argument.cosine
  return {
    x: xp * node.cosine - yp * inclination.cosine * node.sine,
    y: xp * node.sine + yp * inclination.cosine * node.cosine,
    z: yp * inclination.sine,
  }
}

export function orbitalPositionAtTrueAnomaly(orbit: OrbitalElements, trueAnomalyDeg: number): Vector3 {
  const degrees = normalizeDegrees(trueAnomalyDeg)
  const angle = degrees * radians
  const cosine = degrees === 90 || degrees === 270 ? 0 : degrees === 180 ? -1 : degrees === 0 ? 1 : Math.cos(angle)
  const sine = degrees === 0 || degrees === 180 ? 0 : degrees === 90 ? 1 : degrees === 270 ? -1 : Math.sin(angle)
  const radius = orbit.semiMajorAxisM * (1 - orbit.eccentricity) * (1 + orbit.eccentricity) / (1 + orbit.eccentricity * cosine)
  return rotatePerifocal(orbit, radius * cosine, radius * sine)
}

export function orbitalPositionAtUT(orbit: OrbitalElements, utS: number): Vector3 {
  if (!Number.isFinite(utS)) throw new RangeError('Universal time must be finite.')
  const elapsed = (utS - orbit.epochS) % orbit.periodS
  const eccentric = solveKeplerEquation(orbit.meanAnomalyAtEpochRad + tau * elapsed / orbit.periodS, orbit.eccentricity)
  const cosine = eccentric === 0 ? 1 : eccentric === Math.PI || eccentric === -Math.PI ? -1 : eccentric === Math.PI / 2 || eccentric === -Math.PI / 2 ? 0 : Math.cos(eccentric)
  const sine = eccentric === 0 || eccentric === Math.PI || eccentric === -Math.PI ? 0 : eccentric === Math.PI / 2 ? 1 : eccentric === -Math.PI / 2 ? -1 : Math.sin(eccentric)
  return rotatePerifocal(orbit,
    orbit.semiMajorAxisM * (cosine - orbit.eccentricity),
    orbit.semiMajorAxisM * Math.sqrt((1 - orbit.eccentricity) * (1 + orbit.eccentricity)) * sine)
}

export function trueAnomalyAtUT(orbit: OrbitalElements, utS: number): number {
  const eccentric = solveKeplerEquation(orbit.meanAnomalyAtEpochRad + tau * ((utS - orbit.epochS) % orbit.periodS) / orbit.periodS, orbit.eccentricity)
  return normalizeDegrees(Math.atan2(Math.sqrt(1 - orbit.eccentricity ** 2) * Math.sin(eccentric), Math.cos(eccentric) - orbit.eccentricity) / radians)
}

/** Stable 3D point-to-segment distance, including near-central long segments. */
export function pointToSegmentDistance(point: Vector3, a: Vector3, b: Vector3): number {
  const relativeA = subtractVectors(a, point)
  const delta = subtractVectors(b, a)
  const length = Math.hypot(delta.x, delta.y, delta.z)
  if (length === 0) return Math.hypot(relativeA.x, relativeA.y, relativeA.z)
  const unit = { x: delta.x / length, y: delta.y / length, z: delta.z / length }
  const projection = -(relativeA.x * unit.x + relativeA.y * unit.y + relativeA.z * unit.z)
  if (projection <= 0) return Math.hypot(relativeA.x, relativeA.y, relativeA.z)
  if (projection >= length) return vectorDistance(point, b)
  return Math.hypot(relativeA.y * unit.z - relativeA.z * unit.y,
    relativeA.z * unit.x - relativeA.x * unit.z, relativeA.x * unit.y - relativeA.y * unit.x)
}

export function findCommonAncestor(bodies: readonly OrbitalBody[], aId: string, bId: string): string | null {
  const byId = new Map(bodies.map(body => [body.id, body]))
  const ancestors = (id: string) => {
    const result: string[] = []
    while (!result.includes(id)) {
      const body = byId.get(id)
      if (!body) break
      result.push(id)
      if (body.parentBodyId === null) break
      id = body.parentBodyId
    }
    return result
  }
  const bAncestors = new Set(ancestors(bId))
  return ancestors(aId).find(id => bAncestors.has(id)) ?? null
}
