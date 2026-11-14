import type { CelestialBody, PlanetPack, RouteLeg } from '../types/planner'
import { getAerobrakingEdges } from './aerobraking'
import type { AtmosphericAdjustment, AtmosphericPlan } from './atmosphericAssistance'

export interface AtmosphericContext {
  body: CelestialBody
  landingCount: number
  captureCount: number
  landingDeltaV: number
  captureDeltaV: number
  label: string
}

/** Only individual arrival burns that the dialog can actually configure. */
export function configurableAtmosphericIds(pack: PlanetPack): Set<string> {
  const nodes = new Map(pack.nodes.map(node => [node.id, node]))
  return new Set(getAerobrakingEdges(pack).filter(edge =>
    (edge.kind === 'descent' || edge.kind === 'capture')
    && nodes.get(edge.from)?.bodyId === nodes.get(edge.to)?.bodyId,
  ).map(edge => edge.id))
}

/** Summarize only changed flown maneuvers, including repeated visits and zero costs. */
export function atmosphericRouteContexts(pack: PlanetPack, legs: readonly RouteLeg[], plan: AtmosphericPlan, adjustments: ReadonlyMap<string, AtmosphericAdjustment>): AtmosphericContext[] {
  const eligible = configurableAtmosphericIds(pack)
  const nodes = new Map(pack.nodes.map(node => [node.id, node]))
  const bodies = new Map(pack.bodies.map(body => [body.id, body]))
  const originals = new Map(pack.maneuvers.map(edge => [edge.id, edge]))
  const choices = new Map(plan.map(choice => [choice.bodyId, choice]))
  const contexts = new Map<string, AtmosphericContext>()
  for (const { edge } of legs) {
    const adjustment = adjustments.get(edge.id)
    if (!eligible.has(edge.id) || !adjustment || adjustment.deltaV !== edge.deltaV
      || adjustment.originalDeltaV === adjustment.deltaV
      || originals.get(edge.id)?.deltaV !== adjustment.originalDeltaV
      || adjustment.kind !== (edge.kind === 'descent' ? 'landing' : 'capture')) continue
    const body = bodies.get(nodes.get(edge.to)?.bodyId ?? '')
    if (!body) continue
    const choice = choices.get(body.id)
    if (edge.kind === 'descent' ? !choice?.landing || choice.landingDeltaV !== edge.deltaV : !choice?.capture) continue
    const context = contexts.get(body.id) ?? { body, landingCount: 0, captureCount: 0, landingDeltaV: 0, captureDeltaV: 0, label: '' }
    if (edge.kind === 'descent') { context.landingCount++; context.landingDeltaV += edge.deltaV }
    else { context.captureCount++; context.captureDeltaV += edge.deltaV }
    contexts.set(body.id, context)
  }
  const number = new Intl.NumberFormat('en-US')
  return [...contexts.values()].map(context => {
    const choice = choices.get(context.body.id)
    const landing = choice?.landingPreset || choice?.landingMethod === 'atmospheric' ? 'Atmospheric braking + parachutes' : 'Custom powered landing'
    const parts = [
      ...(context.landingCount ? [`landing${context.landingCount > 1 ? ` ×${context.landingCount}` : ''}: ${number.format(context.landingDeltaV)} m/s · ${landing}`] : []),
      ...(context.captureCount ? [`orbital capture: ${number.format(context.captureDeltaV)} m/s · Atmospheric braking`] : []),
    ]
    return { ...context, label: `${context.body.name} ${parts.join(' · ')}` }
  })
}
