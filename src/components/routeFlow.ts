import { pathFromPoints, type Point } from './mapLayout'

export interface RouteFlowRun {
  path: string
  startDistance: number
  length: number
  firstSegment: number
  lastSegment: number
}

export interface RouteFlow {
  runs: RouteFlowRun[]
  totalDistance: number
  trailLength: number
  period: number
  duration: number
}

const hiddenSegmentDistance = 120
const samePoint = (a: Point, b: Point) => a.x === b.x && a.y === b.y

/**
 * Keep the flown order, including repeated maneuvers, in one shared flow clock.
 * Missing regional geometry consumes time but never creates a visible shortcut.
 */
export function createRouteFlow(segments: readonly (readonly Point[])[]): RouteFlow {
  const runs: RouteFlowRun[] = []
  let totalDistance = 0
  let insideHiddenRun = false
  let current: (Omit<RouteFlowRun, 'path'> & { points: Point[] }) | undefined

  function finishRun() {
    if (!current) return
    const { points, ...run } = current
    runs.push({ ...run, path: pathFromPoints(points) })
    current = undefined
  }

  for (const [index, segment] of segments.entries()) {
    if (segment.length === 0) {
      finishRun()
      if (!insideHiddenRun) totalDistance += hiddenSegmentDistance
      insideHiddenRun = true
      continue
    }
    insideHiddenRun = false

    // Drop stationary points, while preserving an actual reversal or revisit.
    const points: Point[] = []
    for (const point of segment) {
      if (points.length === 0 || !samePoint(points.at(-1)!, point)) points.push({ ...point })
    }
    const start = points[0]!
    if (current && !samePoint(current.points.at(-1)!, start)) finishRun()
    if (points.length < 2) continue

    let length = 0
    for (let pointIndex = 1; pointIndex < points.length; pointIndex++) {
      const from = points[pointIndex - 1]!
      const to = points[pointIndex]!
      length += Math.hypot(to.x - from.x, to.y - from.y)
    }

    if (current) {
      current.points.push(...points.slice(1))
      current.length += length
      current.lastSegment = index
    } else {
      current = { points, startDistance: totalDistance, length, firstSegment: index, lastSegment: index }
    }
    totalDistance += length
  }
  finishRun()

  if (runs.length === 0) return { runs, totalDistance: 0, trailLength: 0, period: 0, duration: 0 }

  const trailLength = Math.min(52, totalDistance / 3)
  const period = totalDistance + 2 * trailLength
  return { runs, totalDistance, trailLength, period, duration: Math.max(2, period / 140) }
}
