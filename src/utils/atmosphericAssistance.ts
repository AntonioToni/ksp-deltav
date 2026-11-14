import type { CelestialBody, ManeuverEdge, PlanetPack, PlannerGraph } from '../types/planner'
import { getAerobrakingEdges } from './aerobraking'

export interface AtmosphericBodyPlan {
  bodyId: string
  capture: boolean
  landing: boolean
  /** Landing engine-burn budget, in m/s; entered or explicitly preset, never inferred from ascent. */
  landingDeltaV: number
  /** App-selected assumption; omitted for an amount entered by the user. */
  landingPreset?: 'kerbin-reentry'
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

/** Built-in Kerbin maps start with a parachute-assisted landing assumption. */
export function getDefaultAtmosphericPlan(pack: PlanetPack, isBuiltIn: boolean): AtmosphericBodyPlan[] {
  if (!isBuiltIn || !getAtmosphericCapabilities(pack).some(({ body, landing }) => body.id === 'stock:kerbin' && body.hasSurface && landing)) return []
  return [{ bodyId: 'stock:kerbin', capture: false, landing: true, landingDeltaV: 0, landingPreset: 'kerbin-reentry' }]
}

/** Keep compatible choices, including an explicit opt-out, when switching maps. */
export function reconcileAtmosphericPlan(pack: PlanetPack, previous: AtmosphericPlan, isBuiltIn: boolean): AtmosphericBodyPlan[] {
  const capabilities = new Map(getAtmosphericCapabilities(pack).map(capability => [capability.body.id, capability]))
  const next = previous.flatMap(option => {
    const capability = capabilities.get(option.bodyId)
    if (!capability) return []
    const { landingPreset, ...entered } = option
    // A built-in assumption must not silently become an imported pack's default.
    const keepPreset = landingPreset === 'kerbin-reentry' && isBuiltIn
    const capture = option.capture && capability.capture
    if (landingPreset !== undefined && !isBuiltIn && !capture) return []
    return [{
      ...entered,
      capture,
      landing: option.landing && capability.landing && (landingPreset === undefined || keepPreset),
      ...(keepPreset ? { landingPreset } : {}),
    }]
  })
  const chosen = new Set(next.map(option => option.bodyId))
  return [...next, ...getDefaultAtmosphericPlan(pack, isBuiltIn).filter(option => !chosen.has(option.bodyId))]
}

/**
 * Compile selected atmospheric assumptions before ordered route optimization.
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
    if (row.landingPreset !== undefined && (row.landingPreset !== 'kerbin-reentry' || row.bodyId !== 'stock:kerbin' || row.landingDeltaV !== 0)) {
      throw new RangeError('The Kerbin reentry preset requires Kerbin and a 0 m/s landing budget.')
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
        ? 'Assumes the atmosphere replaces this capture burn with 0 m/s of engine burns. Safe entry and later correction burns are not calculated.'
        : settings.landingPreset === 'kerbin-reentry'
          ? 'Default Kerbin reentry assumes atmospheric braking and parachutes replace the landing engine burn (0 m/s). Safe entry, deorbit and correction burns are not calculated.'
          : `Uses your ${deltaV} m/s engine-burn budget for landing instead of the source’s ${edge.deltaV} m/s descent figure.`
      return { ...edge, deltaV, assumptions: [...edge.assumptions, assumption] }
    })
    if (changed) adjacency.set(nodeId, updated)
  }
  return { graph: adjustments.size ? { ...graph, adjacency } : graph, adjustments }
}
