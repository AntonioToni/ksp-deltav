import type { PlanetPack } from '../types/planner'
import { opmPack } from './opm'
import { stockPack } from './stock'
import { rssPack } from './rss'

/** Add reviewed packs here; selection and visualization consume pack metadata. */
export const planetPacks: readonly PlanetPack[] = [stockPack, opmPack, rssPack]
