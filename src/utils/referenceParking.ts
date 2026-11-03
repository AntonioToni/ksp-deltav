import type { PlanetPack, RouteLeg, RouteNode } from '../types/planner'

/** Identify supplied moon-return branches that introduce an unrequested parent parking stop. */
export function referenceParkingStops(pack: PlanetPack, legs: readonly RouteLeg[], requiredIds: readonly string[]): RouteNode[] {
  const nodes = new Map(pack.nodes.map(node => [node.id, node]))
  const bodies = new Map(pack.bodies.map(body => [body.id, body]))
  const requiredBodies = new Set(requiredIds.map(id => nodes.get(id)?.bodyId))
  const stops = new Map<string, RouteNode>()
  for (const { edge } of legs) {
    if (edge.kind !== 'transfer' || edge.directTransfer) continue
    const from = nodes.get(edge.from)
    const to = nodes.get(edge.to)
    if (!from || !to || from.kind !== 'encounter' || !['orbit', 'elliptical'].includes(to.kind)) continue
    const moon = bodies.get(from.bodyId)
    if (moon?.kind === 'moon' && moon.parentId === to.bodyId && !requiredBodies.has(to.bodyId)) stops.set(to.id, to)
  }
  return [...stops.values()]
}
