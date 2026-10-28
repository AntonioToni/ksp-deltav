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
    return basis('user', 'Your allowance', 'Your complete directional link allowance. The linked reference describes the connection, not a verified fuel cost.')
  }

  const from = pack.nodes.find(node => node.id === edge.from)
  const to = pack.nodes.find(node => node.id === edge.to)
  const destination = pack.bodies.find(body => body.id === to?.bodyId)
  const standalone = from && to && from.bodyId === to.bodyId
  const choice = options.atmosphericPlan?.find(choice => choice.bodyId === to?.bodyId)
  const eligible = standalone && choice && getAerobrakingEdges(pack).some(candidate => candidate.id === edge.id)
  if (eligible && edge.kind === 'descent' && choice.landing) {
    return basis('user', 'Your allowance', 'Your powered landing allowance for this descent, including an explicit zero or a value equal to the reference. Entry feasibility is not calculated.')
  }
  if (eligible && edge.kind === 'capture' && choice.capture) {
    return basis('ideal', 'Ideal capture', 'An assumed 0 m/s powered capture and circularization lower bound. Entry feasibility and cleanup burns are not calculated.')
  }

  if (options.customPack) {
    return basis('imported', 'Imported budget', 'A cost supplied by the imported pack author. Declared source and model metadata are not independent verification.')
  }
  if (standalone && edge.kind === 'descent' && destination?.hasAtmosphere) {
    return basis('placeholder', 'Landing placeholder', 'The supplied ascent-sized powered-descent allowance. This is not a verified landing calculation or upper bound.')
  }
  if (source?.budgetType === 'model') {
    return basis('model', 'Analytic model', 'A schematic analytical estimate using the declared model and reference conditions. It is not a dated trajectory or vehicle simulation.')
  }
  if (source?.budgetType === 'reference') {
    return basis('reference', 'Reference map', 'A published map planning figure at its stated reference conditions. It is not a verified trajectory for a particular flight.')
  }
  return basis('imported', 'Pack budget', 'A cost supplied by this pack without a declared reference-map or analytical-model basis.')
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
