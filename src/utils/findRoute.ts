import type { ManeuverEdge, PlannerGraph, RouteResult } from '../types/planner'

export interface RouteSearchOptions {
  /** Carry arrival energy across a mission waypoint until this planet's low orbit is reached. */
  pendingParkingBodyId?: string | null
}

interface SearchState {
  nodeId: string
  pendingParkingBodyId: string | null
  nextStopIndex: number
}

type SuccessfulPath = Extract<RouteResult, { status: 'success' }>
export type OrderedRouteResult =
  | (SuccessfulPath & { stageLegIndices: number[] })
  | (Exclude<RouteResult, SuccessfulPath> & {
    /** Index of the last required itinerary state reached, counting the origin as zero. */
    reachedIndex: number
    partialRoute: SuccessfulPath | null
    stageLegIndices: number[]
  })

const nodeKinds = new Set(['surface', 'orbit', 'elliptical', 'encounter', 'reference'])
const stateKey = ({ nodeId, pendingParkingBodyId, nextStopIndex }: SearchState) => JSON.stringify([nodeId, pendingParkingBodyId, nextStopIndex])

/**
 * Dijkstra over directed maneuvers and arrival/departure context, preferring
 * the requested body itinerary before minimizing its Delta-V budget.
 * A map encounter is not a universal zero-cost gravity assist: after an
 * interplanetary encounter arrival, a low parking orbit at that planet is
 * required before another interplanetary departure. Complete pairs include
 * their specified low/high bound capture instead of an encounter arrival.
 * A complete transfer between sibling moons remains inside their parent
 * system, so it preserves any pending arrival at that parent planet.
 */
export function findLowestCostPath(graph: PlannerGraph, start: string, goal: string, options: RouteSearchOptions = {}): RouteResult {
  if (!graph.nodes.has(start) || !graph.nodes.has(goal)) {
    return { status: 'invalid', message: 'Choose an origin and destination from the selected planet pack.' }
  }
  const result = searchOrderedPath(graph, [start, goal], options, true)
  // Keep this public API's existing result shape and overflow behavior.
  return result.status === 'success'
    ? { status: 'success', nodeIds: result.nodeIds, legs: result.legs, totalDeltaV: result.totalDeltaV }
    : { status: result.status, message: result.message }
}

/** Find one globally cheapest path visiting every supplied state in order. */
export function findOrderedPath(graph: PlannerGraph, itinerary: readonly string[], options: RouteSearchOptions = {}): OrderedRouteResult {
  return searchOrderedPath(graph, itinerary, options, false)
}

function searchOrderedPath(graph: PlannerGraph, itinerary: readonly string[], options: RouteSearchOptions, stopOnOverflow: boolean): OrderedRouteResult {
  const invalid = (message: string): OrderedRouteResult => ({
    status: 'invalid', message, reachedIndex: 0, partialRoute: null, stageLegIndices: [],
  })
  if (!Array.isArray(itinerary) || itinerary.length === 0 || itinerary.some(id => !graph.nodes.has(id))) {
    return invalid('Choose every mission point from the selected planet pack.')
  }
  const start = itinerary[0]!
  // Defend callers constructing a graph directly, rather than using buildGraph.
  for (const [nodeId, node] of graph.nodes) {
    if (!node || node.id !== nodeId || !nodeKinds.has(node.kind) || typeof node.bodyId !== 'string' || node.bodyId.trim().length === 0 || !graph.adjacency.has(nodeId)) {
      return invalid('The selected planet pack contains invalid map-point data.')
    }
  }
  for (const [nodeId, edges] of graph.adjacency) {
    if (!graph.nodes.has(nodeId) || !Array.isArray(edges) || edges.some(edge => !edge || edge.from !== nodeId || !graph.nodes.has(edge.to) || !Number.isFinite(edge.deltaV) || edge.deltaV < 0)) {
      return invalid('The selected planet pack contains invalid connections or Delta-V values.')
    }
  }
  const pendingParkingBodyId = options.pendingParkingBodyId ?? null
  if (pendingParkingBodyId !== null && (typeof pendingParkingBodyId !== 'string' || ![...graph.nodes.values()].some(node => node.bodyId === pendingParkingBodyId))) {
    return invalid('The route refers to a body missing from this planet pack.')
  }
  // A cheap scalar orbit budget does not establish the timing/orientation of
  // an extra planetary or moon layover. Prefer the requested stage's bodies
  // and their parent systems, while retaining necessary reference gateways.
  // Raw graphs without hierarchy metadata keep their original cost objective.
  const lineage = (bodyId: string): Set<string> => {
    const ids = new Set<string>()
    let current: string | null = bodyId
    while (current !== null && !ids.has(current)) {
      ids.add(current)
      current = graph.bodies?.get(current)?.parentId ?? null
    }
    return ids
  }
  const stageBodies = itinerary.map((id, index): Set<string> | null => {
    if (index === 0) return null
    const from = graph.nodes.get(itinerary[index - 1]!)!
    const to = graph.nodes.get(id)!
    if (!graph.bodies?.has(from.bodyId) || !graph.bodies.has(to.bodyId)) return null
    return new Set([...lineage(from.bodyId), ...lineage(to.bodyId)])
  })
  const advance = (nodeId: string, nextStopIndex: number) => {
    while (nextStopIndex < itinerary.length && itinerary[nextStopIndex] === nodeId) nextStopIndex++
    return nextStopIndex
  }

  const startNode = graph.nodes.get(start)
  const initialState: SearchState = {
    nodeId: start,
    pendingParkingBodyId: startNode?.kind === 'orbit' && startNode.bodyId === pendingParkingBodyId ? null : pendingParkingBodyId,
    nextStopIndex: advance(start, 1),
  }
  const initialKey = stateKey(initialState)
  const states = new Map<string, SearchState>([[initialKey, initialState]])
  const distances = new Map<string, number>([[initialKey, 0]])
  const extraParkingArrivals = new Map<string, number>([[initialKey, 0]])
  const previous = new Map<string, { edge: ManeuverEdge; fromKey: string }>()
  const visited = new Set<string>()
  let goalKey: string | undefined
  let furthestKey = initialKey
  let overflow = false

  function reconstruct(key: string): SuccessfulPath | null {
    const edges: ManeuverEdge[] = []
    let currentKey = key
    while (currentKey !== initialKey) {
      const step = previous.get(currentKey)
      if (!step) return null
      edges.push(step.edge)
      currentKey = step.fromKey
    }
    edges.reverse()
    let cumulativeDeltaV = 0
    return {
      status: 'success', nodeIds: [start, ...edges.map(edge => edge.to)],
      legs: edges.map(edge => {
        cumulativeDeltaV += edge.deltaV
        return { edge, cumulativeDeltaV }
      }),
      totalDeltaV: distances.get(key) ?? 0,
    }
  }

  function boundaries(route: SuccessfulPath): number[] {
    const indices: number[] = []
    let nextStopIndex = 0
    for (const [nodeIndex, nodeId] of route.nodeIds.entries()) {
      while (nextStopIndex < itinerary.length && itinerary[nextStopIndex] === nodeId) {
        indices.push(nodeIndex)
        nextStopIndex++
      }
    }
    return indices
  }

  function fail(status: 'invalid' | 'unreachable', message: string, key = furthestKey): OrderedRouteResult {
    const partialRoute = reconstruct(key)
    return {
      status, message, reachedIndex: (states.get(key)?.nextStopIndex ?? 1) - 1,
      partialRoute, stageLegIndices: partialRoute ? boundaries(partialRoute) : [],
    }
  }

  while (true) {
    let currentKey: string | undefined
    let lowest = Infinity
    let fewestExtraArrivals = Infinity
    for (const [key, distance] of distances) {
      const extraArrivals = extraParkingArrivals.get(key)!
      if (!visited.has(key) && (extraArrivals < fewestExtraArrivals
        || extraArrivals === fewestExtraArrivals && distance < lowest)) {
        currentKey = key
        lowest = distance
        fewestExtraArrivals = extraArrivals
      }
    }
    if (currentKey === undefined) break
    const current = states.get(currentKey)
    if (!current) break
    if (current.nextStopIndex > (states.get(furthestKey)?.nextStopIndex ?? 0)) furthestKey = currentKey
    if (current.nextStopIndex === itinerary.length) {
      goalKey = currentKey
      break
    }
    visited.add(currentKey)
    const fromNode = graph.nodes.get(current.nodeId)
    for (const edge of graph.adjacency.get(current.nodeId) ?? []) {
      const toNode = graph.nodes.get(edge.to)
      if (!fromNode || !toNode) continue
      const isInterplanetary = edge.kind === 'transfer' && fromNode.kind === 'encounter' && toNode.kind === 'encounter' && fromNode.bodyId !== toNode.bodyId
      // A complete pair pays for departure and bound capture at its destination,
      // establishing the specified low/high reference orbit for the next stage.
      const isCompleteBoundTransfer = edge.directTransfer === true && edge.kind === 'transfer'
        && (fromNode.kind === 'orbit' || fromNode.kind === 'elliptical')
        && (toNode.kind === 'orbit' || toNode.kind === 'elliptical') && fromNode.bodyId !== toNode.bodyId
      const fromBody = graph.bodies?.get(fromNode.bodyId)
      const toBody = graph.bodies?.get(toNode.bodyId)
      const parent = fromBody?.parentId ? graph.bodies?.get(fromBody.parentId) : undefined
      const isSiblingTransfer = isCompleteBoundTransfer
        && fromBody?.id === fromNode.bodyId && toBody?.id === toNode.bodyId
        && fromBody.kind === 'moon' && toBody.kind === 'moon'
        && fromBody.parentId !== null && fromBody.parentId === toBody.parentId
        && parent?.id === fromBody.parentId && (parent.kind === 'planet' || parent.kind === 'moon')
      // A reference high ellipse reached through an old encounter branch is
      // not interchangeable with a separately paid complete-pair arrival.
      // Local sibling pairs can continue within that same parent system, but
      // cannot clear or bypass a different parent's unresolved arrival.
      if (current.pendingParkingBodyId && (
        isSiblingTransfer ? current.pendingParkingBodyId !== parent?.id : isInterplanetary || isCompleteBoundTransfer
      )) continue
      const intendedBodies = stageBodies[current.nextStopIndex]
      const extraArrival = intendedBodies !== null && intendedBodies !== undefined
        && toBody !== undefined && (toBody.kind === 'planet' || toBody.kind === 'moon')
        && !intendedBodies.has(toNode.bodyId) && toNode.kind !== 'encounter'
        && (fromNode.bodyId !== toNode.bodyId || fromNode.kind === 'encounter') ? 1 : 0
      const candidateExtraArrivals = fewestExtraArrivals + extraArrival
      const next: SearchState = {
        nodeId: edge.to,
        pendingParkingBodyId: isSiblingTransfer ? current.pendingParkingBodyId : isCompleteBoundTransfer ? null : isInterplanetary
          ? toNode.bodyId
          : toNode.kind === 'orbit' && toNode.bodyId === current.pendingParkingBodyId ? null : current.pendingParkingBodyId,
        nextStopIndex: advance(edge.to, current.nextStopIndex),
      }
      const nextKey = stateKey(next)
      if (visited.has(nextKey)) continue
      const candidate = lowest + edge.deltaV
      if (!Number.isFinite(candidate)) {
        if (stopOnOverflow) return fail('invalid', 'The route cost exceeds the supported numeric range.', currentKey)
        // An overflowing alternative must not invalidate an available finite mission.
        overflow = true
        continue
      }
      const previousExtraArrivals = extraParkingArrivals.get(nextKey) ?? Infinity
      if (candidateExtraArrivals < previousExtraArrivals
        || candidateExtraArrivals === previousExtraArrivals && candidate < (distances.get(nextKey) ?? Infinity)) {
        states.set(nextKey, next)
        distances.set(nextKey, candidate)
        extraParkingArrivals.set(nextKey, candidateExtraArrivals)
        previous.set(nextKey, { edge, fromKey: currentKey })
      }
    }
  }

  const totalDeltaV = goalKey === undefined ? undefined : distances.get(goalKey)
  if (goalKey === undefined || totalDeltaV === undefined) {
    return overflow
      ? fail('invalid', 'The total Delta-V is too large for the planner to calculate.')
      : fail('unreachable', 'The selected planet pack cannot calculate a route between these map points.')
  }
  const route = reconstruct(goalKey)
  return route
    ? { ...route, stageLegIndices: boundaries(route) }
    : fail('unreachable', 'The selected planet pack cannot calculate a complete route through the selected points.')
}
