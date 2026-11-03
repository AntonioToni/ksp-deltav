import type { ManeuverEdge, PlanetPack, PlannerGraph } from '../types/planner'
import { findMissionRoute, type MissionMode } from './mission'

/**
 * Check whether the supplied connection descriptors can complete this itinerary.
 * Unit weights are only a connectivity probe; they never become mission budgets.
 * Private edge IDs avoid collisions with valid author-supplied maneuver IDs.
 */
export function hasPotentialConnectionRoute(
  referenceGraph: PlannerGraph,
  pack: PlanetPack,
  start: string,
  end: string,
  mode: MissionMode,
  stops: readonly string[] = [],
): boolean {
  const adjacency = new Map(referenceGraph.adjacency)
  const usedIds = new Set([...adjacency.values()].flatMap(edges => edges.map(edge => edge.id)))
  let nextId = 0
  for (const connection of pack.unpricedConnections ?? []) {
    for (const direction of ['forward', 'reverse'] as const) {
      let id: string
      do { id = `connectivity-probe:${nextId++}` } while (usedIds.has(id))
      usedIds.add(id)
      const from = direction === 'forward' ? connection.from : connection.to
      const to = direction === 'forward' ? connection.to : connection.from
      const edge: ManeuverEdge = {
        id, from, to, deltaV: 1,
        kind: direction === 'forward' ? connection.forwardKind : connection.reverseKind,
        label: connection.label, sourceId: connection.sourceId, assumptions: [],
      }
      adjacency.set(from, [...(adjacency.get(from) ?? []), edge])
    }
  }
  return findMissionRoute({ ...referenceGraph, adjacency }, start, end, mode, stops).status === 'success'
}
