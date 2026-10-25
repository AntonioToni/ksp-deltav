import type { PlannerGraph, RouteResult } from '../types/planner'
import { findLowestCostPath } from './findRoute'

export type SuccessfulRoute = Extract<RouteResult, { status: 'success' }>
type FailedRoute = Exclude<RouteResult, SuccessfulRoute>
export type MissionMode = 'one-way' | 'round-trip' | 'return-only'

export type MissionRouteResult =
  | (SuccessfulRoute & {
    outbound: SuccessfulRoute | null
    returnRoute: SuccessfulRoute | null
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

/** Match the search's arrival context without treating a waypoint as a free energy reset. */
function terminalArrivalBody(graph: PlannerGraph, route: SuccessfulRoute): string | null {
  let pending: string | null = null
  for (const { edge } of route.legs) {
    const from = graph.nodes.get(edge.from)
    const to = graph.nodes.get(edge.to)
    if (!from || !to) continue
    if (edge.kind === 'transfer' && from.kind === 'encounter' && to.kind === 'encounter' && from.bodyId !== to.bodyId) {
      pending = to.bodyId
    } else if (to.kind === 'orbit' && to.bodyId === pending) pending = null
  }
  return pending
}

/** Calculate directed mission legs; reserve is applied separately by the UI. */
export function findMissionRoute(graph: PlannerGraph, start: string, goal: string, mode: MissionMode): MissionRouteResult {
  // A return-only craft already occupies the selected destination state. It has
  // no outbound arrival energy to carry into this independent reverse search.
  if (mode === 'return-only') {
    const returnRoute = findLowestCostPath(graph, goal, start)
    if (returnRoute.status !== 'success') {
      return {
        ...returnRoute, message: `Return leg: ${returnRoute.message}`,
        failedLeg: 'return', outbound: null, returnRoute: null, mode, returnLegIndex: null,
      }
    }
    return { ...returnRoute, outbound: null, returnRoute, mode, returnLegIndex: 0 }
  }

  const outbound = findLowestCostPath(graph, start, goal)
  if (outbound.status !== 'success') {
    return { ...outbound, failedLeg: 'outbound', outbound: null, returnRoute: null, mode, returnLegIndex: null }
  }
  if (mode === 'one-way') return { ...outbound, outbound, returnRoute: null, mode, returnLegIndex: null }

  const returnRoute = findLowestCostPath(graph, goal, start, { pendingParkingBodyId: terminalArrivalBody(graph, outbound) })
  if (returnRoute.status !== 'success') {
    return {
      ...returnRoute,
      message: `Return leg: ${returnRoute.message}`,
      failedLeg: 'return', outbound, returnRoute: null, mode, returnLegIndex: null,
    }
  }
  const totalDeltaV = outbound.totalDeltaV + returnRoute.totalDeltaV
  if (!Number.isFinite(totalDeltaV)) {
    return {
      status: 'invalid', message: 'The round-trip mission cost exceeds the supported numeric range.',
      failedLeg: 'return', outbound, returnRoute: null, mode, returnLegIndex: null,
    }
  }
  let cumulativeDeltaV = 0
  const legs = [...outbound.legs, ...returnRoute.legs].map(({ edge }) => {
    cumulativeDeltaV += edge.deltaV
    return { edge, cumulativeDeltaV }
  })
  return {
    status: 'success',
    nodeIds: [...outbound.nodeIds, ...returnRoute.nodeIds.slice(1)],
    legs, totalDeltaV, outbound, returnRoute, mode,
    returnLegIndex: outbound.legs.length,
  }
}
