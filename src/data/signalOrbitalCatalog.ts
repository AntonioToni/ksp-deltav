import type { OrbitalBody, OrbitalElements } from '../types/orbital'
import type { BodyKind, DataSource, PlanetPack } from '../types/planner'
import { stockCentralMu, stockPhysicalReferences, stockPhysicsSource } from './stockPhysics'
import { opmConfigSource, opmReferences } from './opmReference'
import { rssCentralMu, rssPhysicalReferences, rssPhysicsSource } from './rssPhysics'
import { kcalbelohBodies, kcalbelohBodyFacts, kcalbelohConfigSource } from './kcalbelohReference'
import { kcalbelohGravitySource, kcalbelohPhysicalReferences } from './kcalbelohPhysics'
import { stockOrbitalElements, stockOrbitalElementsSource } from './stockOrbitalElements'
import { opmOrbitalElements, opmOrbitalElementsSource } from './opmOrbitalElements'
import { rssOrbitalElements, rssOrbitalSources } from './rssOrbitalElements'
import {
  kcalbelohOrbitalElements, kcalbelohOrbitalSources,
  kcalbelohOrbitalGravitationalParameters, kcalbelohOrbitalRadiusOverrides,
  kcalbelohOrbitalLimitations,
} from './kcalbelohOrbitalElements'

export interface SignalOrbitalBody extends OrbitalBody {
  name: string
  color: string
  kind: BodyKind
  sourceId?: string
  /** A compatibility patch can change parent gravity without changing a/e. */
  periodSourceId?: string
  limitations?: readonly string[]
}

export interface SignalOrbitalCatalog {
  bodies: SignalOrbitalBody[]
  selectableBodyIds: string[]
  sources: DataSource[]
  calendar: 'kerbin' | 'earth'
  /** RSS's Gregorian calendar starts at 1951-01-01 when UT is zero. */
  calendarEpochYear: number
  notes: string[]
}

interface PhysicalReference {
  bodyId: string
  parentBodyId: string | null
  kind: BodyKind
  radiusM: number
  gravitationalParameter?: number
  orbit?: Partial<OrbitalElements>
  sourceId: string
}

interface OrbitReference {
  bodyId: string
  parentBodyId: string
  elements: Partial<OrbitalElements>
  sourceId: string
}

const supportedPackIds = new Set([
  'stock', 'opm', 'rss', 'stock-kcalbeloh', 'opm-kcalbeloh',
  'stock-kcalbeloh-no-wormholes', 'opm-kcalbeloh-no-wormholes',
])

const referenceKey = (bodyId: string, parentBodyId: string | null) => `${bodyId}|${parentBodyId ?? ''}`
const physicalOrbit = (reference: {
  semiMajorAxisM: number; eccentricity: number; inclinationDeg: number;
  longitudeOfAscendingNodeDeg: number
}): Partial<OrbitalElements> => ({
  semiMajorAxisM: reference.semiMajorAxisM,
  eccentricity: reference.eccentricity,
  inclinationDeg: reference.inclinationDeg,
  longitudeAscendingNodeDeg: reference.longitudeOfAscendingNodeDeg,
})

/** Reviewed default configurations only. No name-based inference or parameters
 * borrowed from a similarly named imported pack are used for dated positions.
 */
export function getSignalOrbitalCatalog(pack: PlanetPack): SignalOrbitalCatalog {
  const trusted = supportedPackIds.has(pack.id)
  const rss = pack.id === 'rss'
  const opm = pack.id === 'opm' || pack.id.startsWith('opm-kcalbeloh')
  const kcalbeloh = pack.id.includes('kcalbeloh')
  const physical: PhysicalReference[] = []
  const orbits: OrbitReference[] = []
  const sources: DataSource[] = []
  const notes: string[] = []

  if (trusted && !rss) {
    physical.push({
      bodyId: 'stock:kerbol', parentBodyId: null, kind: 'star',
      radiusM: 261_600_000, gravitationalParameter: stockCentralMu,
      sourceId: stockPhysicsSource.id,
    }, ...stockPhysicalReferences.map(reference => ({
      bodyId: reference.bodyId, parentBodyId: reference.parentBodyId,
      kind: reference.parentBodyId === 'stock:kerbol' ? 'planet' as const : 'moon' as const,
      radiusM: reference.radiusM, gravitationalParameter: reference.gravitationalParameter,
      orbit: physicalOrbit(reference), sourceId: stockPhysicsSource.id,
    })))
    orbits.push(...stockOrbitalElements)
    sources.push(stockPhysicsSource, stockOrbitalElementsSource)
  }
  if (trusted && opm) {
    physical.push(...opmReferences.map(reference => ({
      bodyId: reference.bodyId, parentBodyId: reference.parentBodyId,
      kind: reference.parentBodyId === 'stock:kerbol' ? 'planet' as const : 'moon' as const,
      radiusM: reference.radiusM, gravitationalParameter: reference.gravitationalParameter,
      orbit: physicalOrbit(reference), sourceId: opmConfigSource.id,
    })))
    orbits.push(...opmOrbitalElements)
    sources.push(opmConfigSource, opmOrbitalElementsSource)
  }
  if (trusted && rss) {
    physical.push({
      bodyId: 'rss:sun', parentBodyId: null, kind: 'star',
      radiusM: 696_342_000, gravitationalParameter: rssCentralMu,
      sourceId: rssPhysicsSource.id,
    }, ...rssPhysicalReferences.map(reference => ({
      bodyId: reference.bodyId, parentBodyId: reference.parentBodyId,
      kind: reference.parentBodyId === 'rss:sun' ? 'planet' as const : 'moon' as const,
      radiusM: reference.radiusM, gravitationalParameter: reference.gravitationalParameter,
      orbit: physicalOrbit(reference), sourceId: rssPhysicsSource.id,
    })))
    orbits.push(...rssOrbitalElements)
    sources.push(rssPhysicsSource, ...rssOrbitalSources)
  }
  if (trusted && kcalbeloh) {
    const hierarchy = new Map(kcalbelohBodies.map(body => [body.id, body]))
    const bodyPhysics = new Map(kcalbelohPhysicalReferences.map(reference => [reference.bodyId, reference]))
    physical.push(...kcalbelohBodyFacts.flatMap(fact => {
      const body = hierarchy.get(fact.bodyId)
      if (!body || body.kind === 'wormhole') return []
      return [{
        bodyId: fact.bodyId, parentBodyId: body.parentId, kind: body.kind,
        radiusM: fact.radiusM,
        gravitationalParameter: bodyPhysics.get(fact.bodyId)?.gravitationalParameter
          ?? kcalbelohOrbitalGravitationalParameters[fact.bodyId],
        orbit: {
          semiMajorAxisM: fact.semiMajorAxisM,
          eccentricity: fact.eccentricity,
          inclinationDeg: fact.inclinationDeg,
        },
        sourceId: kcalbelohConfigSource.id,
      }]
    }))
    orbits.push(...kcalbelohOrbitalElements)
    sources.push(kcalbelohConfigSource, kcalbelohGravitySource, ...kcalbelohOrbitalSources)
  }

  const physicalByKey = new Map(physical.map(reference => [referenceKey(reference.bodyId, reference.parentBodyId), reference]))
  const orbitByKey = new Map(orbits.map(reference => [referenceKey(reference.bodyId, reference.parentBodyId), reference]))
  if (!trusted) notes.push('This custom or imported configuration has no reviewed orbital elements. Enter orbital data in Advanced mode, or use Manual link distance.')

  const bodies: SignalOrbitalBody[] = pack.bodies.filter(body => body.kind !== 'wormhole').map(body => {
    const key = referenceKey(body.id, body.parentId)
    const candidate = physicalByKey.get(key)
    // A familiar ID under a different parent or kind does not identify the
    // reviewed orbit. In particular, OPM Eeloo must never reuse its solar orbit.
    const reference = candidate?.kind === body.kind ? candidate : undefined
    const orbitalReference = reference ? orbitByKey.get(key) : undefined
    if (trusted && !reference) notes.push(`No reviewed physical or orbital data matches ${body.name} in this hierarchy.`)
    const radiusOverride = trusted && kcalbeloh && reference ? kcalbelohOrbitalRadiusOverrides[body.id] : undefined
    const muOverride = trusted && kcalbeloh && reference ? kcalbelohOrbitalGravitationalParameters[body.id] : undefined
    return {
      id: body.id, name: body.name, color: body.color, kind: body.kind,
      parentBodyId: body.parentId,
      radiusM: radiusOverride ?? reference?.radiusM ?? NaN,
      gravitationalParameter: muOverride ?? reference?.gravitationalParameter,
      ...(body.parentId !== null && reference ? {
        orbit: { ...reference.orbit, ...orbitalReference?.elements },
      } : {}),
      ...(reference ? {
        sourceId: radiusOverride !== undefined || muOverride !== undefined
          ? kcalbelohConfigSource.id : orbitalReference?.sourceId ?? reference.sourceId,
      } : {}),
      ...(trusted && kcalbeloh && reference && kcalbelohOrbitalLimitations[body.id]
        ? { limitations: [kcalbelohOrbitalLimitations[body.id]!] } : {}),
    }
  })

  if (trusted && kcalbeloh) {
    const parentMu = bodies.find(body => body.id === 'stock:kerbol')?.gravitationalParameter
    for (const body of bodies) {
      const semiMajorAxisM = body.orbit?.semiMajorAxisM
      if (!body.id.startsWith('stock:') || body.parentBodyId !== 'stock:kerbol'
        || !Number.isFinite(parentMu) || !(parentMu! > 0)
        || !Number.isFinite(semiMajorAxisM) || !(semiMajorAxisM! > 0)) continue
      // RealisticStarSize changes Kerbol's gravity. Stock periods were derived
      // from parent GM, so derive them from the effective parent GM here too.
      // Explicit Kcalbeloh binary-period patches are deliberately left intact.
      body.orbit = { ...body.orbit, periodS: 2 * Math.PI * Math.sqrt(semiMajorAxisM! ** 3 / parentMu!) }
      body.periodSourceId = kcalbelohConfigSource.id
    }
  }

  return {
    bodies,
    selectableBodyIds: bodies.filter(body => body.kind === 'planet' || body.kind === 'moon').map(body => body.id),
    sources: [...new Map(sources.map(source => [source.id, { ...source }])).values()],
    calendar: rss && trusted ? 'earth' : 'kerbin',
    calendarEpochYear: rss && trusted ? 1951 : 1,
    notes,
  }
}
