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
 * Dijkstra over directed maneuvers and arrival/departure context.
 * A map encounter is not a universal zero-cost gravity assist: after an
 * interplanetary arrival, a low parking orbit at that arrival planet is required before a new transfer.
 */
export function findLowestCostPath(graph: PlannerGraph, start: string, goal: string, options: RouteSearchOptions = {}): RouteResult {
  if (!graph.nodes.has(start) || !graph.nodes.has(goal)) {
    return { status: 'invalid', message: 'Choose a start and destination from the active planet pack.' }
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
    return invalid('Choose every mission state from the active planet pack.')
  }
  const start = itinerary[0]!
  // Defend callers constructing a graph directly, rather than using buildGraph.
  for (const [nodeId, node] of graph.nodes) {
    if (!node || node.id !== nodeId || !nodeKinds.has(node.kind) || typeof node.bodyId !== 'string' || node.bodyId.trim().length === 0 || !graph.adjacency.has(nodeId)) {
      return invalid('The routing graph contains invalid node metadata.')
    }
  }
  for (const [nodeId, edges] of graph.adjacency) {
    if (!graph.nodes.has(nodeId) || !Array.isArray(edges) || edges.some(edge => !edge || edge.from !== nodeId || !graph.nodes.has(edge.to) || !Number.isFinite(edge.deltaV) || edge.deltaV < 0)) {
      return invalid('The routing graph contains invalid endpoints or maneuver costs.')
    }
  }
  const pendingParkingBodyId = options.pendingParkingBodyId ?? null
  if (pendingParkingBodyId !== null && (typeof pendingParkingBodyId !== 'string' || ![...graph.nodes.values()].some(node => node.bodyId === pendingParkingBodyId))) {
    return invalid('The arrival context references an unknown body.')
  }
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
    for (const [key, distance] of distances) {
      if (!visited.has(key) && distance < lowest) {
        currentKey = key
        lowest = distance
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
      if (isInterplanetary && current.pendingParkingBodyId) continue
      const next: SearchState = {
        nodeId: edge.to,
        pendingParkingBodyId: isInterplanetary
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
      if (candidate < (distances.get(nextKey) ?? Infinity)) {
        states.set(nextKey, next)
        distances.set(nextKey, candidate)
        previous.set(nextKey, { edge, fromKey: currentKey })
      }
    }
  }

  const totalDeltaV = goalKey === undefined ? undefined : distances.get(goalKey)
  if (goalKey === undefined || totalDeltaV === undefined) {
    return overflow
      ? fail('invalid', 'The route cost exceeds the supported numeric range.')
      : fail('unreachable', 'No route is available between these states in the active dataset.')
  }
  const route = reconstruct(goalKey)
  return route
    ? { ...route, stageLegIndices: boundaries(route) }
    : fail('unreachable', 'No complete route is available in the active dataset.')
}
