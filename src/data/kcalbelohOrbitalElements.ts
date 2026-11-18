import type { OrbitalElements } from '../types/orbital'
import type { DataSource } from '../types/planner'
import { kcalbelohBodies, kcalbelohBodyFacts, kcalbelohConfigBase, kcalbelohConfigSource } from './kcalbelohReference'
import { kcalbelohGravityConstants, kcalbelohPhysicalReferences } from './kcalbelohPhysics'

const kopernicusRevision = 'c19a16e901ead27ff8f82ae2730a61c22980ed2d'
export const kcalbelohOrbitalSources: readonly DataSource[] = Object.freeze([
  Object.freeze({ ...kcalbelohConfigSource }),
  Object.freeze({
    id: 'kcalbeloh-orbit-periods',
    title: 'Official Kopernicus orbital period overrides and finalization · pinned source',
    url: `https://github.com/Kopernicus/Kopernicus/blob/${kopernicusRevision}/src/Kopernicus/Configuration/OrbitLoader.cs#L267`,
  }),
  Object.freeze({
    id: 'kcalbeloh-orbit-finalization',
    title: 'Official Kopernicus default orbital finalization and period application · pinned source',
    url: `https://github.com/Kopernicus/Kopernicus/blob/${kopernicusRevision}/src/Kopernicus/Injector.cs#L321`,
  }),
  Object.freeze({
    id: 'kcalbeloh-star-size-orbits',
    title: 'Official Kcalbeloh 1.1.8 default stellar radius and Kerbol mass patch',
    url: `${kcalbelohConfigBase}/OtherFeatures/RealisticStarSize.cfg#L65`,
  }),
])

// Numerical mass facts from the pinned 1.1.8 configs. The default
// RealisticStarSize patch also supplies Kerbol's mass and radius; it leaves
// the other stellar masses unchanged. No existing relay-body data is edited.
const stellarMasses: Readonly<Record<string, number>> = Object.freeze({
  'stock:kerbol': 1.75654591319326e28,
  'kcalbeloh:kcalbeloh': 1.178305e31,
  'kcalbeloh:maelg': 1.1877e27,
  'kcalbeloh:sunorc': 1.21e28,
  'kcalbeloh:simesystem': 5.7293e24,
  'kcalbeloh:aralca': 3.30e28,
  'kcalbeloh:aralcb': 6.50e27,
})

export const kcalbelohOrbitalGravitationalParameters: Readonly<Record<string, number>> = Object.freeze({
  ...Object.fromEntries(kcalbelohPhysicalReferences.map(reference => [reference.bodyId, reference.gravitationalParameter])),
  ...Object.fromEntries(Object.entries(stellarMasses).map(([id, mass]) => [id, mass * kcalbelohGravityConstants.gravitationalConstant])),
})

/** Only apply these overrides to the supported default Kcalbeloh combinations. */
export const kcalbelohOrbitalRadiusOverrides: Readonly<Record<string, number>> = Object.freeze({
  'stock:kerbol': 63_245_400,
})

/** Missing/conflicting source facts are retained as partial elements, not zeros. */
export const kcalbelohOrbitalLimitations: Readonly<Record<string, string>> = Object.freeze({
  'kcalbeloh:kcalbeloh': 'The Kcalbeloh-to-Kerbol configuration omits an explicit epoch. Dated cross-system positions require a verified epoch or a user override.',
  'kcalbeloh:efil': 'Efil specifies both 12 radians and 184 degrees for mean anomaly at epoch. No stable parser-priority guarantee is supplied, so dated Efil positions require a user override.',
})

type AngularRow = readonly [bodyId: string, longitudeAscendingNodeDeg: number,
  argumentOfPeriapsisDeg: number, meanAnomalyAtEpochRad: number | null,
  epochS: number | null, explicitPeriodS?: number]

// Reorganized numerical orbit facts only. The shape elements a/e/i reuse the
// existing pinned facts; all angular units here match their explicit cfg keys.
// meanAnomalyAtEpochD is converted from degrees only for Noi and SimeSystem.
// Efil's conflicting keys are deliberately not silently resolved.
const angularRows: readonly AngularRow[] = [
  ['kcalbeloh:kcalbeloh', 135, 90, 0, null],
  ['kcalbeloh:onrefni', -90, 0, 1, 0],
  ['kcalbeloh:rouqea', 34, 65, 2, 0],
  ['kcalbeloh:iomena', 245, 136, 2.5, 0],
  ['kcalbeloh:uleg', 264, 147, 5, 0],
  ['kcalbeloh:maelg', 0, 0, 4, 0],
  ['kcalbeloh:mehtna', 210, 103, 4.5, 0],
  ['kcalbeloh:meiuqer', 26, 89, 2.4, 0],
  ['kcalbeloh:sunorc', 120, 0, 45, 0],
  ['kcalbeloh:sedah', 174, 13, 4.576, 0],
  ['kcalbeloh:suluco', 0, 90, 0, 0],
  ['kcalbeloh:tot', 321, 241, .1, 0],
  ['kcalbeloh:sera', 92, 134, 1.2, 0],
  ['kcalbeloh:dipuc', 176, 305, .6, 0],
  ['kcalbeloh:noi', 236, 255, 77.1887 * Math.PI / 180, 0],
  ['kcalbeloh:simesystem', 236, 255, 17.1887 * Math.PI / 180, 0],
  ['kcalbeloh:simetra', 0, 360, 0, 0, 46_140.9776743941],
  ['kcalbeloh:simeht', 0, 180, 0, 0, 46_140.9776743941],
  ['kcalbeloh:noira', 192, 42, 4, 0],
  ['kcalbeloh:norihc', 12, 24, .8, 0],
  ['kcalbeloh:noyreg', 156, 42, 1.5, 0],
  ['kcalbeloh:aralca', 0, 0, 0, 0],
  ['kcalbeloh:aralcb', 0, 180, 0, 0],
  ['kcalbeloh:anneheg', 40, 165, 0, 0],
  ['kcalbeloh:arorua', 303.40875864028902, -65, 0, 0],
  ['kcalbeloh:ahtpan', 94, 216, 0, 0],
  ['kcalbeloh:anehta', 86, 0, .100000001490116, 0],
  ['kcalbeloh:efil', 75, 36, null, 0],
  ['kcalbeloh:elad', 276, 241, 5, 0],
  ['kcalbeloh:eulb', 0, 0, 5, 0],
  ['kcalbeloh:enots', 16, 75, .6, 0],
]

export interface KcalbelohOrbitalReference {
  readonly bodyId: string
  readonly parentBodyId: string
  readonly elements: Readonly<Partial<OrbitalElements>>
  readonly sourceId: string
}

const bodies = new Map(kcalbelohBodies.map(body => [body.id, body]))
const facts = new Map(kcalbelohBodyFacts.map(fact => [fact.bodyId, fact]))

/** Default 1× scale, DistanceFactor 1, RealisticStarSize on, no HomeSwitch or
 * Principia. Wormhole teleportation is not a radio-link orbit model.
 * Kopernicus finalizeOrbit defaults false, matching stock's parent-only GM.
 * The two explicit binary periods are applied after ordinary orbit creation.
 */
export const kcalbelohOrbitalElements: readonly KcalbelohOrbitalReference[] = Object.freeze(angularRows.map(([bodyId, longitudeAscendingNodeDeg, argumentOfPeriapsisDeg, meanAnomalyAtEpochRad, epochS, explicitPeriodS]) => {
  const fact = facts.get(bodyId)!
  const parentBodyId = bodies.get(bodyId)!.parentId!
  const parentMu = kcalbelohOrbitalGravitationalParameters[parentBodyId]!
  const periodS = explicitPeriodS ?? 2 * Math.PI * Math.sqrt(fact.semiMajorAxisM ** 3 / parentMu)
  return Object.freeze({
    bodyId, parentBodyId, sourceId: kcalbelohConfigSource.id,
    elements: Object.freeze({
      semiMajorAxisM: fact.semiMajorAxisM,
      eccentricity: fact.eccentricity,
      inclinationDeg: fact.inclinationDeg,
      longitudeAscendingNodeDeg,
      argumentOfPeriapsisDeg,
      ...(meanAnomalyAtEpochRad === null ? {} : { meanAnomalyAtEpochRad }),
      ...(epochS === null ? {} : { epochS }),
      periodS,
    }),
  })
}))
