import type { ManeuverEdge, PlanetPack } from '../types/planner'

/**
 * Informational markers for potential atmospheric braking, not a burn discount
 * or a trajectory feasibility calculation. High-ellipse moon returns retain
 * their reference orbit and are not treated as atmospheric entries.
 */
export function getAerobrakingEdges(pack: PlanetPack): ManeuverEdge[] {
  const nodes = new Map(pack.nodes.map(node => [node.id, node]))
  const bodies = new Map(pack.bodies.map(body => [body.id, body]))

  return pack.maneuvers.filter(edge => {
    const from = nodes.get(edge.from)
    const to = nodes.get(edge.to)
    if (!from || !to) return false
    const destination = bodies.get(to.bodyId)
    if (!destination?.hasAtmosphere) return false

    if (from.bodyId === to.bodyId) {
      if (edge.kind === 'descent') return from.kind === 'orbit' && to.kind === 'surface'
      return edge.kind === 'capture' && (
        (from.kind === 'encounter' && (to.kind === 'elliptical' || to.kind === 'orbit'))
        || (from.kind === 'elliptical' && to.kind === 'orbit')
      )
    }

    // A moon return to its parent's low orbit includes the arrival maneuver.
    // Returns to a high elliptical reference orbit are not marked as entry.
    return edge.kind === 'transfer' && from.kind === 'encounter' && to.kind === 'orbit'
      && bodies.get(from.bodyId)?.parentId === destination.id
  })
}
