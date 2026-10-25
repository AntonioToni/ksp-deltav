import type { PlannerGraph, RouteResult } from '../types/planner'
import { findOrderedPath } from './findRoute'

export type SuccessfulRoute = Extract<RouteResult, { status: 'success' }>
type FailedRoute = Exclude<RouteResult, SuccessfulRoute>
export type MissionMode = 'one-way' | 'round-trip' | 'return-only'

export type MissionRouteResult =
  | (SuccessfulRoute & {
    outbound: SuccessfulRoute | null
    returnRoute: SuccessfulRoute | null
    /** Ordered point-to-point stages; cumulative costs restart within each stage. */
    outboundStages: SuccessfulRoute[]
    returnStages: SuccessfulRoute[]
    mode: MissionMode
    /** First return maneuver: zero for return-only, null for one-way missions. */
    returnLegIndex: number | null
  })
  | (FailedRoute & {
    failedLeg: 'outbound' | 'return'
    outbound: SuccessfulRoute | null
    returnRoute: null
    mode: MissionMode
    returnLegIndex: null
  })

/** Slice by maneuver boundaries, keeping an independent cumulative breakdown. */
function sliceRoute(route: SuccessfulRoute, startIndex: number, endIndex: number): SuccessfulRoute {
  let totalDeltaV = 0
  const legs = route.legs.slice(startIndex, endIndex).map(({ edge }) => {
    totalDeltaV += edge.deltaV
    return { edge, cumulativeDeltaV: totalDeltaV }
  })
  return { status: 'success', nodeIds: route.nodeIds.slice(startIndex, endIndex + 1), legs, totalDeltaV }
}

/** Optimize the complete ordered mission; reserve is applied separately by the UI. */
export function findMissionRoute(graph: PlannerGraph, start: string, goal: string, mode: MissionMode, waypointIds: readonly string[] = []): MissionRouteResult {
  const invalid = (message: string): MissionRouteResult => ({
    status: 'invalid', message: mode === 'return-only' ? `Return leg: ${message}` : message,
    failedLeg: mode === 'return-only' ? 'return' : 'outbound',
    outbound: null, returnRoute: null, mode, returnLegIndex: null,
  })
  if (mode !== 'one-way' && mode !== 'round-trip' && mode !== 'return-only') {
    return invalid('Choose a supported mission mode.')
  }
  if (!Array.isArray(waypointIds) || waypointIds.length > 4) {
    return invalid('A mission supports up to four intermediate stops.')
  }
  if (!graph.nodes.has(start) || !graph.nodes.has(goal)) {
    return invalid('Choose a start and destination from the active planet pack.')
  }
  for (const [index, id] of waypointIds.entries()) {
    if (typeof id !== 'string' || !graph.nodes.has(id)) return invalid(`Stop ${index + 1} must be a state from the active planet pack.`)
  }

  const forward = [start, ...waypointIds, goal]
  const reversed = [...forward].reverse()
  const itinerary = mode === 'return-only' ? reversed
    : mode === 'round-trip' ? [...forward, ...reversed.slice(1)] : forward
  const directionStageCount = forward.length - 1
  // Searching the complete itinerary preserves arrival conditions at every
  // stop and turnaround, including alternatives a greedy leg search discards.
  const route = findOrderedPath(graph, itinerary)
  if (route.status !== 'success') {
    const failedLeg = mode === 'return-only' || mode === 'round-trip' && route.reachedIndex >= directionStageCount ? 'return' : 'outbound'
    let outbound: SuccessfulRoute | null = null
    const turnaroundIndex = route.stageLegIndices[directionStageCount]
    if (mode === 'round-trip' && turnaroundIndex !== undefined && route.partialRoute) {
      outbound = sliceRoute(route.partialRoute, 0, turnaroundIndex)
    }
    const stageNumber = route.reachedIndex - (mode === 'round-trip' && failedLeg === 'return' ? directionStageCount : 0) + 1
    const nextState = graph.nodes.get(itinerary[route.reachedIndex + 1] ?? '')?.label ?? 'the next state'
    const detail = waypointIds.length > 0 ? `Stage ${stageNumber} to ${nextState}: ${route.message}` : route.message
    return {
      status: route.status, message: failedLeg === 'return' ? `Return leg: ${detail}` : detail,
      failedLeg, outbound, returnRoute: null, mode, returnLegIndex: null,
    }
  }
  const complete: SuccessfulRoute = {
    status: 'success', nodeIds: route.nodeIds, legs: route.legs, totalDeltaV: route.totalDeltaV,
  }
  const stages = route.stageLegIndices.slice(1).map((endIndex, index) => sliceRoute(complete, route.stageLegIndices[index] ?? 0, endIndex))
  const turnaroundIndex = route.stageLegIndices[directionStageCount] ?? 0
  const outbound = mode === 'return-only' ? null : mode === 'round-trip' ? sliceRoute(complete, 0, turnaroundIndex) : complete
  const returnRoute = mode === 'one-way' ? null : mode === 'return-only' ? complete : sliceRoute(complete, turnaroundIndex, complete.legs.length)
  return {
    ...complete, outbound, returnRoute, mode,
    outboundStages: mode === 'return-only' ? [] : stages.slice(0, directionStageCount),
    returnStages: mode === 'one-way' ? [] : mode === 'return-only' ? stages : stages.slice(directionStageCount),
    returnLegIndex: mode === 'one-way' ? null : mode === 'return-only' ? 0 : turnaroundIndex,
  }
}
