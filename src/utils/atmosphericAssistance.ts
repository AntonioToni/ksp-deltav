import type { CelestialBody, ManeuverEdge, PlanetPack, PlannerGraph } from '../types/planner'
import { getAerobrakingEdges } from './aerobraking'

export interface AtmosphericBodyPlan {
  bodyId: string
  capture: boolean
  landing: boolean
  /** User-supplied powered landing allowance, in m/s; never inferred from ascent. */
  landingDeltaV: number
}

export type AtmosphericPlan = readonly AtmosphericBodyPlan[]

export interface AtmosphericAdjustment {
  kind: 'capture' | 'landing'
  originalDeltaV: number
  deltaV: number
}

interface EligibleManeuver {
  bodyId: string
  kind: AtmosphericAdjustment['kind']
}

function eligibleManeuvers(pack: PlanetPack): Map<string, EligibleManeuver> {
  const nodes = new Map(pack.nodes.map(node => [node.id, node]))
  const eligible = new Map<string, EligibleManeuver>()
  for (const edge of getAerobrakingEdges(pack)) {
    const from = nodes.get(edge.from)
    const to = nodes.get(edge.to)
    // A marked moon-return transfer bundles departure and arrival. Its full
    // cost cannot be replaced with an atmospheric arrival estimate.
    if (!from || !to || from.bodyId !== to.bodyId) continue
    if (edge.kind === 'capture') eligible.set(edge.id, { bodyId: to.bodyId, kind: 'capture' })
    else if (edge.kind === 'descent') eligible.set(edge.id, { bodyId: to.bodyId, kind: 'landing' })
  }
  return eligible
}

/** Expose only assistance represented by standalone, reference-marked maneuvers. */
export function getAtmosphericCapabilities(pack: PlanetPack): { body: CelestialBody; capture: boolean; landing: boolean }[] {
  const kinds = new Map<string, Set<AtmosphericAdjustment['kind']>>()
  for (const { bodyId, kind } of eligibleManeuvers(pack).values()) {
    const available = kinds.get(bodyId) ?? new Set<AtmosphericAdjustment['kind']>()
    available.add(kind)
    kinds.set(bodyId, available)
  }
  return pack.bodies.flatMap(body => {
    const available = kinds.get(body.id)
    return available ? [{ body, capture: available.has('capture'), landing: available.has('landing') }] : []
  })
}

/**
 * Compile explicitly chosen ideal assistance before ordered route optimization.
 * The supplied graph must be the unmodified buildGraph(pack) reference graph.
 * Original pack data, edge identity, and arrival-context transitions are kept.
 */
export function applyAtmosphericAssistance(graph: PlannerGraph, pack: PlanetPack, plan: AtmosphericPlan): {
  graph: PlannerGraph
  adjustments: ReadonlyMap<string, AtmosphericAdjustment>
} {
  if (!Array.isArray(plan)) throw new TypeError('Atmospheric options must be an array.')
  const adjustments = new Map<string, AtmosphericAdjustment>()
  if (plan.length === 0) return { graph, adjustments }

  const bodies = new Set(pack.bodies.map(body => body.id))
  const capabilities = new Map(getAtmosphericCapabilities(pack).map(capability => [capability.body.id, capability]))
  const plans = new Map<string, AtmosphericBodyPlan>()
  for (const row of plan) {
    if (typeof row !== 'object' || row === null || Array.isArray(row)
      || typeof row.bodyId !== 'string' || typeof row.capture !== 'boolean' || typeof row.landing !== 'boolean') {
      throw new TypeError('Each atmospheric option must declare a body ID and boolean capture and landing choices.')
    }
    if (!bodies.has(row.bodyId)) throw new RangeError('Atmospheric options reference an unknown body.')
    if (plans.has(row.bodyId)) throw new RangeError('Atmospheric options must use each body only once.')
    if (typeof row.landingDeltaV !== 'number' || !Number.isFinite(row.landingDeltaV) || row.landingDeltaV < 0 || row.landingDeltaV > 1_000_000) {
      throw new RangeError('Powered landing allowance must be between 0 and 1,000,000 m/s.')
    }
    const capability = capabilities.get(row.bodyId)
    if (row.capture && !capability?.capture) throw new RangeError('This body has no supported standalone atmospheric capture maneuver.')
    if (row.landing && !capability?.landing) throw new RangeError('This body has no supported atmospheric landing maneuver.')
    plans.set(row.bodyId, row)
  }

  const eligible = eligibleManeuvers(pack)
  const adjacency = new Map(graph.adjacency)
  for (const [nodeId, edges] of graph.adjacency) {
    let changed = false
    const updated = edges.map((edge): ManeuverEdge => {
      const maneuver = eligible.get(edge.id)
      if (!maneuver) return edge
      const settings = plans.get(maneuver.bodyId)
      if (!settings || !(maneuver.kind === 'capture' ? settings.capture : settings.landing)) return edge
      const deltaV = maneuver.kind === 'capture' ? 0 : settings.landingDeltaV
      if (deltaV === edge.deltaV) return edge
      changed = true
      adjustments.set(edge.id, { kind: maneuver.kind, originalDeltaV: edge.deltaV, deltaV })
      const assumption = maneuver.kind === 'capture'
        ? 'Ideal atmospheric assistance replaces this standalone capture with a 0 m/s powered-burn estimate; entry feasibility and cleanup burns are not modeled.'
        : `Atmospheric landing uses a user-supplied powered allowance of ${deltaV} m/s, replacing the source descent estimate of ${edge.deltaV} m/s.`
      return { ...edge, deltaV, assumptions: [...edge.assumptions, assumption] }
    })
    if (changed) adjacency.set(nodeId, updated)
  }
  return { graph: adjustments.size ? { nodes: graph.nodes, adjacency } : graph, adjustments }
}
