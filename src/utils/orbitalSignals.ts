import type {
  OrbitalBody, OrbitalElements, OrbitalSignalInput, OrbitalSignalResult,
  OrbitalSignalSample, OrbitalSignalSuccess, OrbitalSweepInterval,
  OrbitalSignalSweepResult, OrbitalTrack, Vector3,
} from '../types/orbital'
import { commNetSignalStrength, kerbalismDampedStrength, MAX_DAMPING_EXPONENT } from './signalStrength'
import {
  addVectors, deriveOrbitalPeriod, findCommonAncestor, normalizeDegrees,
  orbitalPositionAtTrueAnomaly, orbitalPositionAtUT, pointToSegmentDistance,
  subtractVectors, trueAnomalyAtUT, vectorDistance,
} from './orbitalGeometry'

const degreesPerRadian = 180 / Math.PI
const zero: Vector3 = { x: 0, y: 0, z: 0 }
const finitePositive = (value: number | undefined): value is number => value !== undefined && Number.isFinite(value) && value > 0
const tolerance = (...values: number[]) => Math.max(1e-6, ...values.map(value => Math.abs(value) * 1e-9))
const nameOf = (body: OrbitalBody) => body.name ?? body.id
const MAX_ORBIT_AXIS_M = 1e16
// A real Stock synodic interval can include hundreds of moon transits. Keep
// enough headroom to certify them while bounding pathological custom orbits.
const MAX_OCCULTATION_REFINEMENTS = 100_000
class OrbitalSamplingError extends Error {}

interface Evaluator {
  evaluate: (parameter: number, detailed?: boolean, includePositions?: boolean, occluderId?: string) => OrbitalSignalResult
  interval: OrbitalSweepInterval
  relativeSpeedBound?: (bodyId: string, referenceId: string) => number
}

function validateRadio(input: OrbitalSignalInput): string[] {
  const errors: string[] = []
  for (const [value, label, maximum] of [[input.powerA, 'Endpoint A power', 1e18], [input.powerB, 'Endpoint B power', 1e18],
    [input.rangeMultiplier, 'Range multiplier', 100], [input.dampingExponent ?? 1, 'Damping exponent', MAX_DAMPING_EXPONENT]] as const) {
    if (!Number.isFinite(value) || value <= 0 || value > maximum) errors.push(`${label}: enter a number greater than 0 and no more than ${maximum.toLocaleString('en-US')}.`)
  }
  return errors
}

function radioResult(input: OrbitalSignalInput, distanceM: number,
  blockingBodyIds: string[], onLimb = false): Pick<OrbitalSignalSuccess, 'distanceM' | 'maximumRangeM' | 'rangeStrength' | 'signalStrength' | 'dampedStrength' | 'dampedRangeStrength' | 'linkStatus' | 'occluded'> {
  const product = input.powerA * input.powerB
  const pairRange = product > 0 ? Math.sqrt(product) : Math.sqrt(input.powerA) * Math.sqrt(input.powerB)
  const maximumRangeM = pairRange * input.rangeMultiplier
  const rangeStrength = commNetSignalStrength(distanceM, maximumRangeM)
  const occluded = blockingBodyIds.length > 0
  const signalStrength = occluded ? 0 : rangeStrength
  const rangeTolerance = tolerance(distanceM, maximumRangeM)
  return {
    distanceM, maximumRangeM, rangeStrength, signalStrength, occluded,
    dampedStrength: kerbalismDampedStrength(signalStrength, input.dampingExponent ?? 1),
    dampedRangeStrength: kerbalismDampedStrength(rangeStrength, input.dampingExponent ?? 1),
    linkStatus: occluded ? 'blocked' : distanceM > maximumRangeM + rangeTolerance ? 'out-of-range'
      : distanceM >= maximumRangeM - rangeTolerance || onLimb ? 'marginal' : 'available',
  }
}

function createEvaluator(input: OrbitalSignalInput): Evaluator | { status: 'invalid'; errors: string[] } {
  if (typeof input !== 'object' || input === null || !['actual', 'circular', 'manual-distance'].includes(input.geometry)
    || !['phase', 'date'].includes(input.positionMode)) return { status: 'invalid', errors: ['Choose a supported geometry and planetary-position mode.'] }
  const errors = validateRadio(input)
  if (errors.length) return { status: 'invalid', errors }
  const product = input.powerA * input.powerB
  const maximumRange = (product > 0 ? Math.sqrt(product) : Math.sqrt(input.powerA) * Math.sqrt(input.powerB)) * input.rangeMultiplier
  if (!finitePositive(maximumRange)) return { status: 'invalid', errors: ['These antenna powers and range multiplier are too small or too large for a finite signal range.'] }
  if (input.geometry === 'manual-distance') {
    if (!Number.isFinite(input.distanceM) || input.distanceM! < 0 || input.distanceM! > 1e16) return { status: 'invalid', errors: ['Enter a link distance from 0 to 10,000,000 Gm.'] }
    return {
      interval: { start: 0, end: 0, kind: 'phase', label: 'Manual link distance; positions and blocking are unknown.' },
      evaluate: () => ({ status: 'success', geometryUsed: 'manual-distance', positionMode: input.positionMode,
        phaseDeg: input.phaseDeg, utS: input.utS ?? 0, ...radioResult(input, input.distanceM!, []),
        pointA: null, pointB: null, centerId: null, bodyPositions: {}, orbitPaths: [], minimumClearanceM: null,
        blockingBodyIds: [], fallbackReasons: [], uncheckedBodyIds: [] }),
    }
  }
  if (!Number.isFinite(input.phaseDeg) || !Number.isFinite(input.referenceTrueAnomalyDeg ?? 0)
    || !Number.isFinite(input.utS ?? 0)) return { status: 'invalid', errors: ['Enter finite orbital positions and universal time.'] }
  if (!Number.isFinite(input.occlusionFactor) || input.occlusionFactor <= 0 || input.occlusionFactor > 1) return { status: 'invalid', errors: ['Occlusion factor must be greater than 0 and no more than 1.'] }
  if (!Array.isArray(input.bodies) || input.bodies.some(body => typeof body !== 'object' || body === null || typeof body.id !== 'string'
    || (body.parentBodyId !== null && typeof body.parentBodyId !== 'string'))) return { status: 'invalid', errors: ['Choose bodies with valid parent identities.'] }
  const byId = new Map(input.bodies.map(body => [body.id, body]))
  if (byId.size !== input.bodies.length || !byId.has(input.bodyAId) || !byId.has(input.bodyBId)) return { status: 'invalid', errors: ['Choose two bodies with known orbital identities.'] }
  if (input.bodyAId === input.bodyBId) return { status: 'invalid', errors: ['Choose two different bodies, or enter a manual link distance for craft near the same body.'] }
  const lineage = (id: string) => {
    const result: string[] = []
    while (byId.has(id)) {
      if (result.includes(id)) throw new Error('The selected planetary hierarchy contains a cycle.')
      result.push(id)
      const parent = byId.get(id)!.parentBodyId
      if (parent === null) break
      id = parent
    }
    return result
  }
  let aLine: string[]
  let bLine: string[]
  try { aLine = lineage(input.bodyAId); bLine = lineage(input.bodyBId) }
  catch (error) { return { status: 'invalid', errors: [(error as Error).message] } }
  const centerId = findCommonAncestor(input.bodies, input.bodyAId, input.bodyBId)
  if (centerId === null) return { status: 'invalid', errors: ['These bodies have no verified shared orbital reference frame. Use Manual link distance for this link.'] }
  if (input.positionMode === 'phase' && input.bodyBId === centerId) return { status: 'invalid', errors: ['Body B is the shared parent and cannot sweep an orbit in this frame. Swap the endpoints or use In-game date.'] }
  const required = new Set([...aLine.slice(0, aLine.indexOf(centerId)), ...bLine.slice(0, bLine.indexOf(centerId))])
  const spatialMissing = (body: OrbitalBody) => {
    const orbit = body.orbit ?? {}
    const missing: string[] = []
    if (!finitePositive(orbit.semiMajorAxisM) || orbit.semiMajorAxisM > MAX_ORBIT_AXIS_M) missing.push('semi-major axis (up to 10,000,000 Gm)')
    if (!Number.isFinite(orbit.eccentricity) || orbit.eccentricity! < 0 || orbit.eccentricity! >= 1) missing.push('eccentricity')
    if (!Number.isFinite(orbit.inclinationDeg)) missing.push('inclination')
    if (!Number.isFinite(orbit.longitudeAscendingNodeDeg)) missing.push('ascending node')
    if (!Number.isFinite(orbit.argumentOfPeriapsisDeg)) missing.push('argument of periapsis')
    return missing
  }
  const periodFor = (body: OrbitalBody) => finitePositive(body.orbit?.periodS) ? body.orbit.periodS
    : deriveOrbitalPeriod(body.orbit?.semiMajorAxisM ?? NaN, byId.get(body.parentBodyId ?? '')?.gravitationalParameter ?? NaN)
  const timingMissing = (body: OrbitalBody) => [
    ...(!Number.isFinite(body.orbit?.meanAnomalyAtEpochRad) ? ['mean anomaly at epoch'] : []),
    ...(!Number.isFinite(body.orbit?.epochS) ? ['reference epoch'] : []),
    ...(!finitePositive(periodFor(body)) ? ['orbital period or parent gravity'] : []),
  ]
  const fallbackReasons: string[] = []
  for (const id of required) {
    const body = byId.get(id)!
    if (!finitePositive(body.orbit?.semiMajorAxisM) || body.orbit.semiMajorAxisM > MAX_ORBIT_AXIS_M) errors.push(`${nameOf(body)} needs a semi-major axis greater than 0 and no more than 10,000,000 Gm. Enter orbital data or use Manual link distance.`)
    const needsTimedPosition = input.positionMode === 'date' || id !== input.bodyAId && id !== input.bodyBId
    const timing = needsTimedPosition ? timingMissing(body) : []
    if (input.positionMode === 'date' && timing.length) errors.push(`${nameOf(body)} is missing ${timing.join(', ')}. Enter the missing data in Advanced mode or use Relative phase.`)
    if (input.geometry === 'actual') {
      const missing = [...spatialMissing(body), ...timing]
      if (missing.length) fallbackReasons.push(`${nameOf(body)}: missing ${[...new Set(missing)].join(', ')}; using circular reference geometry.`)
    }
  }
  if (errors.length) return { status: 'invalid', errors }
  const actual = input.geometry === 'actual' && fallbackReasons.length === 0
  const resolved = new Map<string, OrbitalElements | null>()
  const orbitFor = (body: OrbitalBody): OrbitalElements | null => {
    if (resolved.has(body.id)) return resolved.get(body.id)!
    const orbit = body.orbit ?? {}
    const timed = input.positionMode === 'date' || body.id !== input.bodyAId && body.id !== input.bodyBId
    if (!finitePositive(orbit.semiMajorAxisM) || orbit.semiMajorAxisM > MAX_ORBIT_AXIS_M || actual && spatialMissing(body).length
      || timed && input.positionMode === 'date' && timingMissing(body).length
      || actual && timed && timingMissing(body).length) { resolved.set(body.id, null); return null }
    const value: OrbitalElements = {
      semiMajorAxisM: orbit.semiMajorAxisM,
      eccentricity: actual ? orbit.eccentricity! : 0,
      inclinationDeg: actual ? orbit.inclinationDeg! : 0,
      longitudeAscendingNodeDeg: actual ? orbit.longitudeAscendingNodeDeg! : 0,
      argumentOfPeriapsisDeg: actual ? orbit.argumentOfPeriapsisDeg! : 0,
      meanAnomalyAtEpochRad: orbit.meanAnomalyAtEpochRad ?? 0,
      epochS: orbit.epochS ?? 0,
      periodS: periodFor(body),
    }
    resolved.set(body.id, value)
    return value
  }
  const children = new Map<string, OrbitalBody[]>()
  for (const body of input.bodies) if (body.parentBodyId !== null) children.set(body.parentBodyId, [...(children.get(body.parentBodyId) ?? []), body])
  const reference = normalizeDegrees(input.referenceTrueAnomalyDeg ?? 0)
  const utS = input.utS ?? 0
  const localPosition = (body: OrbitalBody, parameter: number) => {
    const orbit = orbitFor(body)
    if (!orbit) return null
    if (input.positionMode === 'phase' && (body.id === input.bodyAId || body.id === input.bodyBId)) {
      return orbitalPositionAtTrueAnomaly(orbit, reference + (body.id === input.bodyBId ? parameter : 0))
    }
    if (!finitePositive(orbit.periodS)) return orbitalPositionAtTrueAnomaly(orbit, orbit.meanAnomalyAtEpochRad * degreesPerRadian)
    return orbitalPositionAtUT(orbit, input.positionMode === 'date' ? parameter : utS)
  }
  const interval = displayInterval(input, centerId, byId, required, periodFor)
  const relativeSpeedBound = (bodyId: string, referenceId: string): number => {
    let first: string[]
    let second: string[]
    try { first = lineage(bodyId); second = lineage(referenceId) }
    catch { return Infinity }
    const common = first.find(id => second.includes(id))
    if (!common) return Infinity
    const edges = [...first.slice(0, first.indexOf(common)), ...second.slice(0, second.indexOf(common))]
    return edges.reduce((sum, id) => {
      const body = byId.get(id)!
      const orbit = orbitFor(body)
      if (!orbit) return Infinity
      if (input.positionMode === 'phase') {
        // Only B's local true anomaly changes during a relative-phase sweep.
        return sum + (id === input.bodyBId ? orbit.semiMajorAxisM * (1 + orbit.eccentricity) / (1 - orbit.eccentricity) * Math.PI / 180 : 0)
      }
      if (!finitePositive(orbit.periodS)) return Infinity
      return sum + 2 * Math.PI / orbit.periodS * orbit.semiMajorAxisM * Math.sqrt((1 + orbit.eccentricity) / (1 - orbit.eccentricity))
    }, 0)
  }
  const occluderPaths = new Map<string, Set<string>>()
  const pathForOccluder = (id: string) => {
    let path = occluderPaths.get(id)
    if (!path) {
      path = new Set([...aLine, ...bLine, ...lineage(id)])
      occluderPaths.set(id, path)
    }
    return path
  }
  return {
    interval, relativeSpeedBound,
    evaluate: (parameter, detailed = false, includePositions = false, occluderId) => {
      // Adaptive proofs inspect one body at a time. Resolve only its frame and
      // the endpoints, rather than propagating every unrelated planetary system
      // for each tiny limb bracket. Public results still inspect every body.
      const requiredPath = occluderId ? pathForOccluder(occluderId) : undefined
      const positions: Record<string, Vector3> = { [centerId]: zero }
      const queue = [centerId]
      for (let index = 0; index < queue.length; index++) {
        const id = queue[index]!
        const body = byId.get(id)!
        const position = positions[id]!
        if (body.parentBodyId !== null && byId.has(body.parentBodyId) && !positions[body.parentBodyId]
          && (!requiredPath || requiredPath.has(body.parentBodyId))) {
          const local = localPosition(body, parameter)
          if (local) { positions[body.parentBodyId] = subtractVectors(position, local); queue.push(body.parentBodyId) }
        }
        for (const child of children.get(id) ?? []) if (!positions[child.id] && (!requiredPath || requiredPath.has(child.id))) {
          const local = localPosition(child, parameter)
          if (local) { positions[child.id] = addVectors(position, local); queue.push(child.id) }
        }
      }
      const pointA = positions[input.bodyAId]
      const pointB = positions[input.bodyBId]
      if (!pointA || !pointB || !Object.values(pointA).every(Number.isFinite) || !Object.values(pointB).every(Number.isFinite)) return { status: 'invalid', errors: ['The selected orbit data cannot produce finite positions in a shared reference frame.'] }
      let minimumClearanceM: number | null = null
      const blockingBodyIds: string[] = []
      let onLimb = false
      const occluderClearancesM: Record<string, number> = {}
      const uncheckedBodyIds: string[] = []
      for (const body of occluderId ? [byId.get(occluderId)!] : input.bodies) {
        if (body.id === input.bodyAId || body.id === input.bodyBId) continue
        // Circular reference intentionally preserves the original common-center
        // approximation; flattened unrelated orbits are not dated occultors.
        if (!actual && body.id !== centerId) { uncheckedBodyIds.push(body.id); continue }
        if (!finitePositive(body.radiusM)) { uncheckedBodyIds.push(body.id); continue }
        const position = positions[body.id]
        if (!position) { uncheckedBodyIds.push(body.id); continue }
        const radius = body.radiusM * input.occlusionFactor
        if (!finitePositive(radius)) return { status: 'invalid', errors: ['These body radii and occlusion settings are too small or too large for the blocking calculation.'] }
        const clearance = pointToSegmentDistance(position, pointA, pointB) - radius
        occluderClearancesM[body.id] = clearance
        if (minimumClearanceM === null || clearance < minimumClearanceM) minimumClearanceM = clearance
        const epsilon = Math.min(tolerance(radius), radius * 1e-6)
        if (Math.abs(clearance) <= epsilon) onLimb = true
        if (clearance < -epsilon) blockingBodyIds.push(body.id)
      }
      const orbitPaths: OrbitalTrack[] = []
      if (detailed) for (const id of required) {
        const body = byId.get(id)!
        const orbit = orbitFor(body)
        const center = body.parentBodyId === null ? undefined : positions[body.parentBodyId]
        if (orbit && center && body.parentBodyId !== null) orbitPaths.push({ bodyId: id, parentBodyId: body.parentBodyId, center,
          points: Array.from({ length: 129 }, (_, step) => addVectors(center, orbitalPositionAtTrueAnomaly(orbit, step / 128 * 360))) })
      }
      const anomalyAtDate = (id: string) => {
        const orbit = orbitFor(byId.get(id)!)
        return orbit && finitePositive(orbit.periodS) ? trueAnomalyAtUT(orbit, parameter) : 0
      }
      const distanceM = vectorDistance(pointA, pointB)
      if (!Number.isFinite(distanceM)) return { status: 'invalid', errors: ['The orbit coordinates exceed the supported finite-distance range.'] }
      return {
        status: 'success', geometryUsed: actual ? 'actual' : 'circular', positionMode: input.positionMode,
        phaseDeg: normalizeDegrees(input.positionMode === 'date' ? anomalyAtDate(input.bodyBId) - anomalyAtDate(input.bodyAId) : parameter), utS: input.positionMode === 'date' ? parameter : utS,
        ...radioResult(input, distanceM, blockingBodyIds, onLimb),
        pointA, pointB, centerId, bodyPositions: detailed || includePositions ? positions : {}, orbitPaths, minimumClearanceM,
        blockingBodyIds, occluderClearancesM, fallbackReasons, uncheckedBodyIds,
      }
    },
  }
}

function displayInterval(input: OrbitalSignalInput, centerId: string, bodies: Map<string, OrbitalBody>, required: Set<string>, periodFor: (body: OrbitalBody) => number): OrbitalSweepInterval {
  if (input.positionMode === 'phase') return { start: 0, end: 360, kind: 'phase', label: 'Selected orbital sweep: 0°–360° true-anomaly difference; body A stays at its reference position.' }
  const a = bodies.get(input.bodyAId)!
  const b = bodies.get(input.bodyBId)!
  const periods = [...required].map(id => periodFor(bodies.get(id)!)).filter(finitePositive)
  const shortest = periods.length ? Math.min(...periods) : NaN
  const longest = periods.length ? Math.max(...periods) : NaN
  const first = periodFor(a)
  const second = periodFor(b)
  const frequencyDifference = Math.abs(1 / first - 1 / second)
  const synodic = a.parentBodyId === b.parentBodyId && a.id !== centerId && b.id !== centerId
    && finitePositive(first) && finitePositive(second) && frequencyDifference > Math.max(1 / first, 1 / second) * 1e-9 ? 1 / frequencyDifference : NaN
  let duration = finitePositive(synodic) ? synodic : finitePositive(longest) ? longest : 426 * 21_600
  let kind: OrbitalSweepInterval['kind'] = finitePositive(synodic) ? 'synodic' : finitePositive(longest) ? 'orbital-period' : 'fixed-time'
  let label = kind === 'synodic' ? 'One synodic period around the selected date' : kind === 'orbital-period' ? 'One longest relevant orbital period; this pair has no shared-parent synodic period' : 'Fixed 426-day Kerbal-year interval; no orbital period is available'
  // Very long beat periods would alias many complete revolutions on a compact
  // graph. Use an explicitly bounded interval instead of pretending to sample it.
  if (finitePositive(shortest) && duration > shortest * 16) {
    duration = shortest * 16
    kind = 'orbital-period'
    label = '16 shortest relevant orbital periods; the full beat/outer period is too long for this graph'
  }
  const selected = input.utS ?? 0
  const start = selected >= 0 ? Math.max(0, selected - duration / 2) : selected - duration / 2
  return { start, end: start + duration, kind, label }
}

export function calculateOrbitalSignal(input: OrbitalSignalInput): OrbitalSignalResult {
  try {
    const evaluator = createEvaluator(input)
    if ('status' in evaluator) return evaluator
    return evaluator.evaluate(input.positionMode === 'date' ? input.utS ?? 0 : input.phaseDeg, true)
  } catch (error) {
    if (error instanceof RangeError) return { status: 'invalid', errors: [error.message] }
    throw error
  }
}

/** Golden-section search only locates geometry extrema; radio math is unchanged. */
function minimumInInterval(fn: (value: number) => number, start: number, end: number, iterations = 40): number {
  const ratio = (Math.sqrt(5) - 1) / 2
  let left = end - ratio * (end - start)
  let right = start + ratio * (end - start)
  let leftValue = fn(left)
  let rightValue = fn(right)
  for (let step = 0; step < iterations; step++) {
    if (leftValue < rightValue) {
      end = right; right = left; rightValue = leftValue
      left = end - ratio * (end - start); leftValue = fn(left)
    } else {
      start = left; left = right; leftValue = rightValue
      right = start + ratio * (end - start); rightValue = fn(right)
    }
  }
  return (start + end) / 2
}

function calculateSweep(input: OrbitalSignalInput): OrbitalSignalSweepResult {
  const evaluator = createEvaluator(input)
  if ('status' in evaluator) return evaluator
  const selected = input.positionMode === 'date' ? input.utS ?? 0 : input.phaseDeg === 360 ? 360 : normalizeDegrees(input.phaseDeg)
  const current = evaluator.evaluate(selected, true)
  if (current.status !== 'success') return current
  const interval = evaluator.interval
  const cache = new Map<number, OrbitalSignalSample>()
  const at = (parameter: number, includePositions = false, occluderId?: string): OrbitalSignalSample => {
    const cached = cache.get(parameter)
    if (cached && (!includePositions || Object.keys(cached.bodyPositions).length)) return cached
    const result = evaluator.evaluate(parameter, false, includePositions, occluderId)
    if (result.status !== 'success') throw new OrbitalSamplingError(result.errors[0])
    const sample = { ...result, parameter }
    if (!occluderId) cache.set(parameter, sample)
    return sample
  }
  if (input.geometry === 'manual-distance') {
    const sample = { ...current, parameter: 0 }
    return { status: 'success', current, samples: [], closest: sample, farthest: sample, interval, scopeLabel: 'Manual distance only; no positional sweep or blockage estimate.' }
  }
  const steps = input.positionMode === 'phase' ? 180 : 512
  const coarse = Array.from({ length: steps + 1 }, (_, index) => at(interval.start + index / steps * (interval.end - interval.start), true))
  const retained = new Set<number>(coarse.map(sample => sample.parameter))
  retained.add(selected)
  let closest = coarse.reduce((best, sample) => sample.distanceM < best.distanceM ? sample : best)
  let farthest = coarse.reduce((best, sample) => sample.distanceM > best.distanceM ? sample : best)
  for (let index = 1; index < coarse.length - 1; index++) {
    const before = coarse[index - 1]!
    const sample = coarse[index]!
    const after = coarse[index + 1]!
    const distanceEpsilon = Math.max(1e-6, sample.distanceM * 1e-12)
    if (sample.distanceM <= before.distanceM && sample.distanceM <= after.distanceM
      && (sample.distanceM < before.distanceM - distanceEpsilon || sample.distanceM < after.distanceM - distanceEpsilon)) {
      const refined = at(minimumInInterval(value => at(value).distanceM, before.parameter, after.parameter))
      retained.add(refined.parameter)
      if (refined.distanceM < closest.distanceM) closest = refined
    }
    if (sample.distanceM >= before.distanceM && sample.distanceM >= after.distanceM
      && (sample.distanceM > before.distanceM + distanceEpsilon || sample.distanceM > after.distanceM + distanceEpsilon)) {
      const refined = at(minimumInInterval(value => -at(value).distanceM, before.parameter, after.parameter))
      retained.add(refined.parameter)
      if (refined.distanceM > farthest.distanceM) farthest = refined
    }
  }
  const linkSpeedBound = evaluator.relativeSpeedBound!(input.bodyBId, input.bodyAId)
  const bodySpeedBounds = new Map(input.bodies.map(body => [body.id, evaluator.relativeSpeedBound!(body.id, input.bodyAId)]))
  const otherBodySpeedBounds = new Map(input.bodies.map(body => [body.id, evaluator.relativeSpeedBound!(body.id, input.bodyBId)]))
  const coarseParameters = new Set(coarse.map(sample => sample.parameter))
  for (let index = 1; index < coarse.length; index++) coarseParameters.add((coarse[index - 1]!.parameter + coarse[index]!.parameter) / 2)
  let refinements = 0
  const parameterPrecision = Number.EPSILON * Math.max(Math.abs(interval.start), Math.abs(interval.end), 1) * 4
  const refineBodyGap = (body: OrbitalBody, left: OrbitalSignalSample, right: OrbitalSignalSample, depth = 0): void => {
    const parameter = (left.parameter + right.parameter) / 2
    const middle = at(parameter, true, body.id)
    const width = right.parameter - left.parameter
    const minimumLinkDistance = Math.min(left.distanceM, middle.distanceM, right.distanceM) - linkSpeedBound * width / 4
    try {
      const clearances = [left, middle, right].map(sample => sample.occluderClearancesM?.[body.id])
      if (clearances.some(value => value === undefined)) return
      // Distance-to-segment is Lipschitz under endpoint motion. For a nearby
      // occluder the tighter ray-direction bound avoids treating the full
      // interplanetary endpoint displacement as local occultation uncertainty.
      const boundFromEndpoint = (endpoint: 'pointA' | 'pointB', relativeSpeed: number) => {
        const maximumBodyDistance = Math.max(...[left, middle, right].map(sample =>
          vectorDistance(sample.bodyPositions[body.id]!, sample[endpoint]!))) + relativeSpeed * width / 4
        return minimumLinkDistance > 0
          ? relativeSpeed + linkSpeedBound * (maximumBodyDistance / minimumLinkDistance + (maximumBodyDistance >= minimumLinkDistance ? 1 : 0))
          : Infinity
      }
      // Either endpoint can anchor the same ray. In particular, a moon carried
      // by B is nearly static relative to B even though both move rapidly in
      // the A frame; use the tighter of the two independently valid bounds.
      const clearanceSpeed = Math.min(boundFromEndpoint('pointA', bodySpeedBounds.get(body.id) ?? Infinity),
        boundFromEndpoint('pointB', otherBodySpeedBounds.get(body.id) ?? Infinity))
      const radius = body.radiusM * input.occlusionFactor
      const epsilon = Math.min(tolerance(radius), radius * 1e-6)
      const uncertainty = clearanceSpeed * width / 4
      if (Math.min(...clearances as number[]) - uncertainty >= -epsilon) return
      if (Math.max(...clearances as number[]) + uncertainty < -epsilon) {
        retained.add(left.parameter); retained.add(right.parameter)
        return
      }
      if (++refinements > MAX_OCCULTATION_REFINEMENTS) throw new OrbitalSamplingError('This interval contains too many short-period or grazing occultations for a reliable compact graph. Use Relative phase for an exploratory sweep; the selected-position link can still be calculated.')
      if (width <= parameterPrecision || depth >= 48 || parameter === left.parameter || parameter === right.parameter) {
        retained.add(left.parameter); retained.add(middle.parameter); retained.add(right.parameter)
        return
      }
      // The bound is not proof of a clear or blocked interval. Subdivide both
      // halves; this resolves multiple wells from one moving body as well as
      // multiple different occluders inside the original sampling gap.
      refineBodyGap(body, left, middle, depth + 1)
      refineBodyGap(body, middle, right, depth + 1)
    } finally {
      // Only coarse poses are reused by other occluders. Discard adaptive
      // diagnostic poses immediately to bound memory during long date scans.
      if (!coarseParameters.has(middle.parameter)) middle.bodyPositions = {}
    }
  }
  for (let index = 1; index < coarse.length; index++) {
    const left = coarse[index - 1]!
    const right = coarse[index]!
    for (const body of input.bodies) {
      if (left.occluderClearancesM?.[body.id] !== undefined && right.occluderClearancesM?.[body.id] !== undefined) refineBodyGap(body, left, right)
    }
  }
  retained.add(closest.parameter); retained.add(farthest.parameter)
  // Proof refinement produces many samples approaching each limb. For plotting,
  // retain the regular curve, the extrema/current point, and both sides of every
  // blocking transition. Interior adaptive points add no extra event information.
  const anchors = new Set([...coarse.map(sample => sample.parameter), selected, closest.parameter, farthest.parameter])
  const candidates = [...retained].sort((a, b) => a - b).map(parameter => at(parameter))
  const samples = candidates.filter((sample, index) => anchors.has(sample.parameter)
    || sample.occluded !== candidates[index - 1]?.occluded
    || sample.occluded !== candidates[index + 1]?.occluded)
  return { status: 'success', current, samples, closest, farthest, interval,
    scopeLabel: input.positionMode === 'phase' ? 'Closest/farthest within this selected orbital sweep; not all possible planetary configurations.' : 'Closest/farthest within the displayed time interval; not absolute long-term extrema.' }
}

/** Invalid user-supplied geometry reports an error instead of crashing React. */
export function sampleOrbitalSignals(input: OrbitalSignalInput): OrbitalSignalSweepResult {
  try { return calculateSweep(input) }
  catch (error) {
    if (error instanceof OrbitalSamplingError || error instanceof RangeError) return { status: 'invalid', errors: [error.message] }
    throw error
  }
}
