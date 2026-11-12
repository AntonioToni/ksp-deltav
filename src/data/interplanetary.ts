import type { DataSource, PlanetPack } from '../types/planner'
import { kcalbelohBodies, kcalbelohBodyFacts, kcalbelohConfigSource } from './kcalbelohReference'
import { opmConfigSource, opmReferences } from './opmReference'
import { rssConfigBase, rssPhysicalReferences, rssPhysicsSource } from './rssPhysics'
import { stockPhysicalReferences, stockPhysicsSource } from './stockPhysics'

export interface SignalOrbitPreset {
  id: string
  name: string
  color: string
  parentBodyId: string
  semiMajorAxisM: number
  eccentricity: number
  sourceId: string
}

export interface SignalCenterPreset {
  id: string
  name: string
  color: string
  radiusM: number
  sourceId: string
}

const stockCenterSource: DataSource = {
  id: 'signal-kerbol-radius',
  title: 'KSPTOT Kerbol physical radius · pinned revision, converted from km',
  url: stockPhysicsSource.url,
}
const rssCenterSource: DataSource = {
  id: 'signal-rss-sun-radius',
  title: 'Official RSS Sun physical radius · pinned revision',
  url: `${rssConfigBase}/Sun.cfg`,
}

export const interplanetarySources: readonly DataSource[] = Object.freeze([
  stockPhysicsSource, opmConfigSource, rssPhysicsSource, kcalbelohConfigSource,
  stockCenterSource, rssCenterSource,
  {
    id: 'commnet-signal-strength',
    title: 'Stock CommNet signal-strength curve · pinned calculator reference',
    url: 'https://github.com/IgaguriMK/ksp-commnet-calculator-core/blob/2ee8d9af84f2c0bb9d4287b9d80123dfba2efd80/src/endpoint.rs',
  },
].map(source => Object.freeze({ ...source })))

interface OrbitReference {
  bodyId: string
  parentBodyId: string
  semiMajorAxisM: number
  eccentricity: number
  sourceId: string
}

const kcalbelohParents = new Map(kcalbelohBodies.map(body => [body.id, body.parentId]))
const orbitReferences: readonly OrbitReference[] = [
  ...stockPhysicalReferences.map(reference => ({ ...reference, sourceId: stockPhysicsSource.id })),
  ...opmReferences.map(reference => ({ ...reference, sourceId: opmConfigSource.id })),
  ...rssPhysicalReferences.map(reference => ({ ...reference, sourceId: rssPhysicsSource.id })),
  ...kcalbelohBodyFacts.flatMap(fact => {
    const parentBodyId = kcalbelohParents.get(fact.bodyId)
    return parentBodyId ? [{ ...fact, parentBodyId, sourceId: kcalbelohConfigSource.id }] : []
  }),
]

// Full physical radii are used by default. Stellar technical atmospheres do
// not identify the appropriate game occlusion factor for this reference model.
const centerReferences = new Map<string, { radiusM: number; sourceId: string }>([
  ['stock:kerbol', { radiusM: 261_600_000, sourceId: stockCenterSource.id }],
  ['rss:sun', { radiusM: 696_342_000, sourceId: rssCenterSource.id }],
  ...kcalbelohBodyFacts.map(fact => [fact.bodyId, {
    // The shared facts already include the default RealisticStarSize patch.
    radiusM: fact.radiusM, sourceId: kcalbelohConfigSource.id,
  }] as const),
])

const supportedPackIds = new Set([
  'stock', 'opm', 'rss', 'stock-kcalbeloh', 'opm-kcalbeloh',
  'stock-kcalbeloh-no-wormholes', 'opm-kcalbeloh-no-wormholes',
])

/** Reviewed default-scale common-center pairs; unfamiliar packs need manual geometry. */
export function getInterplanetaryPresets(pack: PlanetPack): {
  orbits: SignalOrbitPreset[]
  centers: SignalCenterPreset[]
} {
  if (!supportedPackIds.has(pack.id)) return { orbits: [], centers: [] }
  const bodies = new Map(pack.bodies.map(body => [body.id, body]))
  const candidates: SignalOrbitPreset[] = pack.bodies.flatMap(body => {
    if (body.kind !== 'planet' || body.parentId === null) return []
    const parent = bodies.get(body.parentId)
    const center = centerReferences.get(body.parentId)
    const reference = orbitReferences.find(candidate => candidate.bodyId === body.id
      && candidate.parentBodyId === body.parentId)
    if (!parent || !['star', 'black-hole'].includes(parent.kind) || !center || !reference
      || !Number.isFinite(reference.semiMajorAxisM) || reference.semiMajorAxisM <= center.radiusM) return []
    return [{
      id: body.id, name: body.name, color: body.color, parentBodyId: body.parentId,
      semiMajorAxisM: reference.semiMajorAxisM, eccentricity: reference.eccentricity,
      sourceId: reference.sourceId,
    }]
  })
  const eligibleCenters = new Set(candidates.filter(candidate =>
    candidates.filter(other => other.parentBodyId === candidate.parentBodyId).length >= 2,
  ).map(candidate => candidate.parentBodyId))
  const orbits = candidates.filter(candidate => eligibleCenters.has(candidate.parentBodyId))
  const centers = [...eligibleCenters].map(id => {
    const body = bodies.get(id)!
    const reference = centerReferences.get(id)!
    return { id, name: body.name, color: body.color, radiusM: reference.radiusM, sourceId: reference.sourceId }
  })
  return { orbits, centers }
}
