import type { ManeuverEdge, PlannerGraph, RouteResult } from '../types/planner'

interface SearchState {
  nodeId: string
  pendingParkingBodyId: string | null
}

const nodeKinds = new Set(['surface', 'orbit', 'elliptical', 'encounter'])
const stateKey = ({ nodeId, pendingParkingBodyId }: SearchState) => JSON.stringify([nodeId, pendingParkingBodyId])

/**
 * Dijkstra over directed maneuvers and arrival/departure context.
 * A map encounter is not a universal zero-cost gravity assist: after an
 * interplanetary arrival, a low parking orbit at that arrival planet is required before a new transfer.
 */
export function findLowestCostPath(graph: PlannerGraph, start: string, goal: string): RouteResult {
  if (!graph.nodes.has(start) || !graph.nodes.has(goal)) {
    return { status: 'invalid', message: 'Choose a start and destination from the active planet pack.' }
  }
  // Defend callers constructing a graph directly, rather than using buildGraph.
  for (const [nodeId, node] of graph.nodes) {
    if (!node || node.id !== nodeId || !nodeKinds.has(node.kind) || typeof node.bodyId !== 'string' || node.bodyId.trim().length === 0 || !graph.adjacency.has(nodeId)) {
      return { status: 'invalid', message: 'The routing graph contains invalid node metadata.' }
    }
  }
  for (const [nodeId, edges] of graph.adjacency) {
    if (!graph.nodes.has(nodeId) || edges.some(edge => edge.from !== nodeId || !graph.nodes.has(edge.to) || !Number.isFinite(edge.deltaV) || edge.deltaV < 0)) {
      return { status: 'invalid', message: 'The routing graph contains invalid endpoints or maneuver costs.' }
    }
  }
  if (start === goal) return { status: 'success', nodeIds: [start], legs: [], totalDeltaV: 0 }

  const initialState: SearchState = { nodeId: start, pendingParkingBodyId: null }
  const initialKey = stateKey(initialState)
  const states = new Map<string, SearchState>([[initialKey, initialState]])
  const distances = new Map<string, number>([[initialKey, 0]])
  const previous = new Map<string, { edge: ManeuverEdge; fromKey: string }>()
  const visited = new Set<string>()
  let goalKey: string | undefined
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
    if (current.nodeId === goal) {
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
      }
      const nextKey = stateKey(next)
      if (visited.has(nextKey)) continue
      const candidate = lowest + edge.deltaV
      if (!Number.isFinite(candidate)) return { status: 'invalid', message: 'The route cost exceeds the supported numeric range.' }
      if (candidate < (distances.get(nextKey) ?? Infinity)) {
        states.set(nextKey, next)
        distances.set(nextKey, candidate)
        previous.set(nextKey, { edge, fromKey: currentKey })
      }
    }
  }

  const totalDeltaV = goalKey === undefined ? undefined : distances.get(goalKey)
  if (goalKey === undefined || totalDeltaV === undefined) {
    return { status: 'unreachable', message: 'No route is available between these states in the active dataset.' }
  }
  const edges: ManeuverEdge[] = []
  let currentKey = goalKey
  while (currentKey !== initialKey) {
    const step = previous.get(currentKey)
    if (!step) return { status: 'unreachable', message: 'No complete route is available in the active dataset.' }
    edges.push(step.edge)
    currentKey = step.fromKey
  }
  edges.reverse()
  let cumulativeDeltaV = 0
  return {
    status: 'success',
    nodeIds: [start, ...edges.map(edge => edge.to)],
    legs: edges.map(edge => {
      cumulativeDeltaV += edge.deltaV
      return { edge, cumulativeDeltaV }
    }),
    totalDeltaV,
  }
}
