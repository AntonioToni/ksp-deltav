import type { PlanetPack } from '../types/planner'
import { opmPack } from './opm'
import { stockPack } from './stock'
import { rssPack } from './rss'
import { stockKcalbelohPack, opmKcalbelohPack, stockKcalbelohNoWormholesPack, opmKcalbelohNoWormholesPack } from './kcalbeloh'

/** Compact base-system buttons; add-on configurations are selected in the manager. */
export const primaryPlanetPacks: readonly PlanetPack[] = [stockPack, opmPack, rssPack]

export interface BuiltInConfiguration {
  pack: PlanetPack
  basePackId: string
  addons: readonly string[]
  settings?: Readonly<{ wormholes: boolean }>
}

export const builtInConfigurations: readonly BuiltInConfiguration[] = [
  { pack: stockKcalbelohPack, basePackId: 'stock', addons: ['Kcalbeloh'], settings: { wormholes: true } },
  { pack: opmKcalbelohPack, basePackId: 'opm', addons: ['Kcalbeloh'], settings: { wormholes: true } },
  { pack: stockKcalbelohNoWormholesPack, basePackId: 'stock', addons: ['Kcalbeloh'], settings: { wormholes: false } },
  { pack: opmKcalbelohNoWormholesPack, basePackId: 'opm', addons: ['Kcalbeloh'], settings: { wormholes: false } },
]

/** Reviewed complete packs, including compositions. Shared objects are cloned by composers. */
export const planetPacks: readonly PlanetPack[] = [...primaryPlanetPacks, ...builtInConfigurations.map(configuration => configuration.pack)]

export function getBasePackId(packId: string): string {
  return builtInConfigurations.find(configuration => configuration.pack.id === packId)?.basePackId ?? packId
}

/** Retain selected add-ons and installation settings when the next base supports them. */
export function changeBaseConfiguration(currentId: string, nextBaseId: string): string {
  const current = builtInConfigurations.find(configuration => configuration.pack.id === currentId)
  if (!current) return nextBaseId
  const next = builtInConfigurations.find(configuration => configuration.basePackId === nextBaseId
    && configuration.addons.length === current.addons.length
    && configuration.addons.every(addon => current.addons.includes(addon))
    && (configuration.settings?.wormholes ?? true) === (current.settings?.wormholes ?? true))
  return next?.pack.id ?? nextBaseId
}
