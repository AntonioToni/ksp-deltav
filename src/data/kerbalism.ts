import type { PlanetPack } from '../types/planner'
import { getInterplanetaryPresets } from './interplanetary'
import type { RadioProfileId } from './radioProfiles'

/** Reviewed home-system reference only; custom packs need an explicit exponent. */
export function getKerbalismHomeOrbitRadiusM(pack: PlanetPack): number | null {
  return getInterplanetaryPresets(pack).orbits
    .find(orbit => orbit.id === pack.transferHubBodyId)?.semiMajorAxisM ?? null
}

/** Retain the selected Stock/RSS/CBK power baseline when restoring Kerbalism. */
export function getKerbalismRadioProfileId(id: RadioProfileId): RadioProfileId {
  if (id === 'rss' || id === 'rss-kerbalism') return 'rss-kerbalism'
  if (id === 'rss-cbk' || id === 'rss-cbk-kerbalism') return 'rss-cbk-kerbalism'
  return 'kerbalism'
}
