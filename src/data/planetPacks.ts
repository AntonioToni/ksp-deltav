import type { PlanetPack } from '../types/planner'
import { opmPack } from './opm'
import { stockPack } from './stock'
import { rssPack } from './rss'
import { stockKcalbelohPack, opmKcalbelohPack } from './kcalbeloh'

/** Compact base-system buttons; add-on configurations are selected in the manager. */
export const primaryPlanetPacks: readonly PlanetPack[] = [stockPack, opmPack, rssPack]

export interface BuiltInConfiguration {
  pack: PlanetPack
  basePackId: string
  addons: readonly string[]
}

export const builtInConfigurations: readonly BuiltInConfiguration[] = [
  { pack: stockKcalbelohPack, basePackId: 'stock', addons: ['Kcalbeloh'] },
  { pack: opmKcalbelohPack, basePackId: 'opm', addons: ['Kcalbeloh'] },
]

/** Reviewed complete packs, including compositions. Shared objects are cloned by composers. */
export const planetPacks: readonly PlanetPack[] = [...primaryPlanetPacks, ...builtInConfigurations.map(configuration => configuration.pack)]

export function getBasePackId(packId: string): string {
  return builtInConfigurations.find(configuration => configuration.pack.id === packId)?.basePackId ?? packId
}

/** Retain the selected add-ons when the next base offers that configuration. */
export function changeBaseConfiguration(currentId: string, nextBaseId: string): string {
  const current = builtInConfigurations.find(configuration => configuration.pack.id === currentId)
  if (!current) return nextBaseId
  const next = builtInConfigurations.find(configuration => configuration.basePackId === nextBaseId
    && configuration.addons.length === current.addons.length
    && configuration.addons.every(addon => current.addons.includes(addon)))
  return next?.pack.id ?? nextBaseId
}
