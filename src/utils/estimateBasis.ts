import type { DataSource, ManeuverEdge, PlanetPack, RouteLeg } from '../types/planner'
import { getAerobrakingEdges } from './aerobraking'
import type { AtmosphericPlan } from './atmosphericAssistance'

export type BudgetBasisKind = 'reference' | 'model' | 'user' | 'ideal' | 'placeholder' | 'imported'

export interface BudgetBasisOptions {
  customPack?: boolean
  allowanceEdgeIds?: ReadonlySet<string>
  atmosphericPlan?: AtmosphericPlan
}

export interface ManeuverBasis {
  kind: BudgetBasisKind
  label: string
  description: string
  /** A contextual source; user allowances are never source-verified fuel costs. */
  source?: DataSource
}

export interface BudgetBasisSummary {
  kind: BudgetBasisKind
  label: string
  deltaV: number
  maneuvers: number
}

/** Explain the effective cost, prioritizing personal assumptions over its source. */
export function describeManeuverBasis(edge: ManeuverEdge, pack: PlanetPack, options: BudgetBasisOptions = {}): ManeuverBasis {
  const source = pack.sources.find(source => source.id === edge.sourceId)
  const basis = (kind: BudgetBasisKind, label: string, description: string): ManeuverBasis => ({
    kind, label, description, ...(source ? { source } : {}),
  })

  if (options.allowanceEdgeIds?.has(edge.id)) {
    return basis('user', 'Your allowance', 'The full Delta-V budget you entered for this connection in this direction. The source describes the connection but does not supply its cost.')
  }

  const from = pack.nodes.find(node => node.id === edge.from)
  const to = pack.nodes.find(node => node.id === edge.to)
  const destination = pack.bodies.find(body => body.id === to?.bodyId)
  const standalone = from && to && from.bodyId === to.bodyId
  const choice = options.atmosphericPlan?.find(choice => choice.bodyId === to?.bodyId)
  const eligible = standalone && choice && getAerobrakingEdges(pack).some(candidate => candidate.id === edge.id)
  if (eligible && edge.kind === 'descent' && choice.landing) {
    return basis('user', 'Your allowance', 'The engine-burn budget you entered for this landing. Safe atmospheric entry and your vehicle’s landing performance are not calculated.')
  }
  if (eligible && edge.kind === 'capture' && choice.capture) {
    return basis('ideal', 'Ideal capture', 'Assumes the atmosphere replaces this capture burn with 0 m/s of engine burns. Safe entry and later correction burns are not calculated.')
  }

  if (options.customPack) {
    return basis('imported', 'Imported budget', 'A Delta-V figure supplied by the imported pack’s author. The planner has not independently checked their figures or sources.')
  }
  if (standalone && edge.kind === 'descent' && destination?.hasAtmosphere) {
    return basis('placeholder', 'Landing placeholder', 'This landing budget reuses the source’s launch-sized figure. Your craft may need more or less; it is not a guaranteed maximum.')
  }
  if (source?.budgetType === 'model') {
    return basis('model', 'Calculated estimate', 'Calculated from the stated model and starting conditions. Flight dates and your craft’s performance are not simulated.')
  }
  if (source?.budgetType === 'reference') {
    return basis('reference', 'Reference map', 'A figure from the linked Delta-V map, using its stated orbits and assumptions. Actual burns depend on your flight and vehicle.')
  }
  return basis('imported', 'Pack budget', 'A Delta-V figure supplied by this pack without identifying it as a map figure or calculated estimate.')
}

/** Group the actual flown legs; repeated visits and explicit zero costs count. */
export function summarizeBudgetBasis(legs: readonly RouteLeg[], pack: PlanetPack, options: BudgetBasisOptions = {}): BudgetBasisSummary[] {
  const rows = new Map<BudgetBasisKind, BudgetBasisSummary>()
  for (const { edge } of legs) {
    const { kind, label } = describeManeuverBasis(edge, pack, options)
    const row = rows.get(kind) ?? { kind, label, deltaV: 0, maneuvers: 0 }
    row.deltaV += edge.deltaV
    row.maneuvers++
    rows.set(kind, row)
  }
  return [...rows.values()]
}
