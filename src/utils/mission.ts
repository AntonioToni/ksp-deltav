import type { PlannerGraph, RouteResult } from '../types/planner'
import { findLowestCostPath } from './findRoute'

export type SuccessfulRoute = Extract<RouteResult, { status: 'success' }>
type FailedRoute = Exclude<RouteResult, SuccessfulRoute>

export type MissionRouteResult =
  | (SuccessfulRoute & {
    outbound: SuccessfulRoute
    returnRoute: SuccessfulRoute | null
    roundTrip: boolean
    /** Zero-based index of the first return maneuver; null for a one-way mission. */
    returnLegIndex: number | null
  })
  | (FailedRoute & {
    failedLeg: 'outbound' | 'return'
    outbound: SuccessfulRoute | null
    returnRoute: null
    roundTrip: boolean
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

/** Calculate directed outbound/return legs; mission reserve is applied separately by the UI. */
export function findMissionRoute(graph: PlannerGraph, start: string, goal: string, roundTrip: boolean): MissionRouteResult {
  const outbound = findLowestCostPath(graph, start, goal)
  if (outbound.status !== 'success') {
    return { ...outbound, failedLeg: 'outbound', outbound: null, returnRoute: null, roundTrip, returnLegIndex: null }
  }
  if (!roundTrip) return { ...outbound, outbound, returnRoute: null, roundTrip, returnLegIndex: null }

  const returnRoute = findLowestCostPath(graph, goal, start, { pendingParkingBodyId: terminalArrivalBody(graph, outbound) })
  if (returnRoute.status !== 'success') {
    return {
      ...returnRoute,
      message: `Return leg: ${returnRoute.message}`,
      failedLeg: 'return', outbound, returnRoute: null, roundTrip, returnLegIndex: null,
    }
  }
  const totalDeltaV = outbound.totalDeltaV + returnRoute.totalDeltaV
  if (!Number.isFinite(totalDeltaV)) {
    return {
      status: 'invalid', message: 'The round-trip mission cost exceeds the supported numeric range.',
      failedLeg: 'return', outbound, returnRoute: null, roundTrip, returnLegIndex: null,
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
    legs, totalDeltaV, outbound, returnRoute, roundTrip,
    returnLegIndex: outbound.legs.length,
  }
}
