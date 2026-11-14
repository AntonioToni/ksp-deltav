import type { PlanetPack } from '../types/planner'
import { getAerobrakingEdges } from './aerobraking'
import { getAtmosphericCapabilities, getDefaultAtmosphericPlan, type AtmosphericBodyPlan, type AtmosphericPlan } from './atmosphericAssistance'

export type LandingMethod = 'reference' | 'atmospheric' | 'custom'

export interface AtmosphericChoice {
  bodyId: string
  capture: boolean
  landingMethod: LandingMethod
  /** Kept independently of the selected method while the dialog is being edited. */
  customLandingText: string
}

/** Decode applied settings without mistaking an explicitly entered zero for a preset. */
export function createAtmosphericChoices(pack: PlanetPack, plan: AtmosphericPlan): AtmosphericChoice[] {
  const settings = new Map(plan.map(option => [option.bodyId, option]))
  return getAtmosphericCapabilities(pack).map(({ body, capture, landing }) => {
    const option = settings.get(body.id)
    const landingMethod: LandingMethod = !landing || !option?.landing ? 'reference'
      : option.landingPreset === 'kerbin-reentry' || option.landingMethod === 'atmospheric' ? 'atmospheric' : 'custom'
    return {
      bodyId: body.id,
      capture: capture && option?.capture === true,
      landingMethod,
      customLandingText: landingMethod === 'custom' ? String(option!.landingDeltaV) : '',
    }
  })
}

/** Only the visible custom-budget choice needs a valid number. */
export function atmosphericChoicesValid(choices: readonly AtmosphericChoice[]): boolean {
  return choices.every(choice => ['reference', 'atmospheric', 'custom'].includes(choice.landingMethod)
    && (choice.landingMethod !== 'custom' || choice.customLandingText.trim() !== ''
      && Number.isFinite(Number(choice.customLandingText)) && Number(choice.customLandingText) >= 0 && Number(choice.customLandingText) <= 1_000_000))
}

/** Translate UI methods into the existing boolean/Delta-V calculation contract. */
export function toAtmosphericPlan(pack: PlanetPack, choices: readonly AtmosphericChoice[], isBuiltIn: boolean): AtmosphericBodyPlan[] {
  const capabilities = new Map(getAtmosphericCapabilities(pack).map(capability => [capability.body.id, capability]))
  const supported = choices.flatMap(choice => {
    const capability = capabilities.get(choice.bodyId)
    return capability ? [{
      ...choice,
      capture: choice.capture && capability.capture,
      landingMethod: capability.landing ? choice.landingMethod : 'reference' as const,
    }] : []
  })
  if (!atmosphericChoicesValid(supported)) throw new RangeError('Enter a landing Delta-V from 0 to 1,000,000 m/s.')
  const presetBodies = new Set(getDefaultAtmosphericPlan(pack, isBuiltIn).map(option => option.bodyId))
  return supported.map(choice => ({
    bodyId: choice.bodyId,
    capture: choice.capture,
    landing: choice.landingMethod !== 'reference',
    landingDeltaV: choice.landingMethod === 'custom' ? Number(choice.customLandingText) : 0,
    ...(choice.landingMethod === 'reference' ? {} : { landingMethod: choice.landingMethod }),
    ...(choice.landingMethod === 'atmospheric' && presetBodies.has(choice.bodyId) ? { landingPreset: 'kerbin-reentry' as const } : {}),
  }))
}

/** Show only original descent budgets that the atmospheric controls can override. */
export function referenceLandingBudgets(pack: PlanetPack, bodyId: string): number[] {
  const nodes = new Map(pack.nodes.map(node => [node.id, node]))
  return [...new Set(getAerobrakingEdges(pack).filter(edge => edge.kind === 'descent'
    && nodes.get(edge.from)?.bodyId === bodyId && nodes.get(edge.to)?.bodyId === bodyId).map(edge => edge.deltaV))].sort((a, b) => a - b)
}
