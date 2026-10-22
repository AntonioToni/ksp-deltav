import type { ManeuverEdge, PlanetPack, PlannerGraph } from '../types/planner'
import { validatePlanetPack } from './validatePlanetPack'

/** Compile only explicit directed maneuvers; never infer reverse costs. */
export function buildGraph(pack: PlanetPack): PlannerGraph {
  const errors = validatePlanetPack(pack)
  if (errors.length > 0) throw new Error(`Invalid planet pack:\n${errors.join('\n')}`)
  const graph = new Map<string, ManeuverEdge[]>(pack.nodes.map(node => [node.id, []]))
  for (const edge of pack.maneuvers) graph.get(edge.from)?.push(edge)
  return { nodes: new Map(pack.nodes.map(node => [node.id, node])), adjacency: graph }
}
