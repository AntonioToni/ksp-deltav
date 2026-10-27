import type { ManeuverEdge, PlanetPack, PlannerGraph } from '../types/planner'
import { validatePlanetPack } from './validatePlanetPack'

export interface ConnectionAllowance {
  connectionId: string
  /** Whole directional journey allowance, in m/s; null leaves it unpriced. */
  forward: number | null
  reverse: number | null
}

export type ConnectionPlan = readonly ConnectionAllowance[]

/** Add only explicitly entered directional costs to an otherwise immutable graph. */
export function applyConnectionAllowances(graph: PlannerGraph, pack: PlanetPack, plan: ConnectionPlan): {
  graph: PlannerGraph
  edges: readonly ManeuverEdge[]
} {
  if (!Array.isArray(plan)) throw new TypeError('Connection allowances must be an array.')
  const errors = validatePlanetPack(pack)
  if (errors.length) throw new RangeError(`Invalid connection pack: ${errors[0]}`)
  const connections = new Map((pack.unpricedConnections ?? []).map(connection => [connection.id, connection]))
  const seen = new Set<string>()
  const edges: ManeuverEdge[] = []
  const usedEdgeIds = new Set([...graph.adjacency.values()].flatMap(existing => existing.map(edge => edge.id)))

  for (const row of plan) {
    if (typeof row !== 'object' || row === null || Array.isArray(row)
      || typeof row.connectionId !== 'string') {
      throw new TypeError('Each connection allowance must declare a connection ID and both directional values.')
    }
    const connection = connections.get(row.connectionId)
    if (!connection) throw new RangeError('Connection allowances reference an unknown connection.')
    if (seen.has(row.connectionId)) throw new RangeError('Use each connection allowance once.')
    seen.add(row.connectionId)
    for (const direction of ['forward', 'reverse'] as const) {
      const value = row[direction]
      if (value === null) continue
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1_000_000) {
        throw new RangeError('Connection allowances must be null or a finite value from 0 to 1,000,000 m/s.')
      }
      const from = direction === 'forward' ? connection.from : connection.to
      const to = direction === 'forward' ? connection.to : connection.from
      if (!graph.nodes.has(from) || !graph.nodes.has(to) || !graph.adjacency.has(from)) {
        throw new RangeError('The graph is missing a connection endpoint.')
      }
      const id = `allowance:${connection.id}:${direction}`
      if (usedEdgeIds.has(id)) throw new RangeError('The graph already contains a connection allowance edge.')
      usedEdgeIds.add(id)
      edges.push({
        id, from, to, deltaV: value,
        kind: direction === 'forward' ? connection.forwardKind : connection.reverseKind,
        label: `${connection.label} · ${direction} allowance`,
        sourceId: connection.sourceId,
        assumptions: [...connection.assumptions,
          `Explicit user-supplied ${direction} allowance: ${value} m/s for this whole connection. This is a planning input, not a source-verified maneuver cost.`,
        ],
      })
    }
  }
  if (edges.length === 0) return { graph, edges }
  const adjacency = new Map(graph.adjacency)
  for (const edge of edges) adjacency.set(edge.from, [...adjacency.get(edge.from)!, edge])
  return { graph: { nodes: graph.nodes, adjacency }, edges }
}
