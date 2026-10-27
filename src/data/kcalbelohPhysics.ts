import type { DataSource } from '../types/planner'
import { kcalbelohBodies, kcalbelohBodyFacts } from './kcalbelohReference'

/** Kopernicus's stock-KSP conversions, not modern real-world replacements. */
export const kcalbelohGravityConstants = {
  gravitationalConstant: 6.67408e-11,
  standardGravity: 9.80665,
} as const

export const kcalbelohGravitySource: DataSource = {
  id: 'kcalbeloh-gravity-conversion',
  title: 'Kopernicus stock gravity, mass, and gravitational-parameter conversions · pinned revision',
  url: 'https://github.com/Kopernicus/Kopernicus/blob/c19a16e901ead27ff8f82ae2730a61c22980ed2d/src/Kopernicus/Configuration/PropertiesLoader.cs#L559',
}

/** Default Kopernicus SOI floors; explicit body overrides bypass these floors. */
export const kcalbelohSoiConstants = { minimumRadiusMultiplier: 2, minimumAltitudeM: 40000 } as const

export const kcalbelohSoiSource: DataSource = {
  id: 'kcalbeloh-soi-rules',
  title: 'Kopernicus default SOI calculation and configured overrides · pinned revision',
  url: 'https://github.com/Kopernicus/Kopernicus/blob/c19a16e901ead27ff8f82ae2730a61c22980ed2d/src/Kopernicus/Configuration/OrbitLoader.cs#L392',
}

export interface KcalbelohPhysicalReference {
  bodyId: string
  parentBodyId: string
  radiusM: number
  gravitationalParameter: number
  atmosphereHeightM: number
  sphereOfInfluenceM: number
  configPath: string
}

type GravityRow = readonly [bodyId: string, property: 'mass' | 'geeASL' | 'gravParameter', value: number, sphereOfInfluenceM?: number]

// Numerical facts from the same pinned v1.1.8 configs as kcalbelohBodyFacts.
// Each body specifies exactly one active gravity property in its Properties
// block. Commented-out alternatives are excluded. Primary/barycenter masses
// are included only to derive their children's SOIs, not as relay targets.
const gravityRows: readonly GravityRow[] = [
  ['kcalbeloh:kcalbeloh', 'mass', 1.178305e31],
  ['kcalbeloh:onrefni', 'geeASL', .3184, 3427888.40885751],
  ['kcalbeloh:rouqea', 'mass', 3.342165e23, 27251254.2938285],
  ['kcalbeloh:iomena', 'geeASL', .35, 9233328.14499067],
  ['kcalbeloh:uleg', 'geeASL', .72],
  ['kcalbeloh:maelg', 'mass', 1.1877e27],
  ['kcalbeloh:mehtna', 'geeASL', .51],
  ['kcalbeloh:meiuqer', 'geeASL', .04],
  ['kcalbeloh:sunorc', 'mass', 1.21e28],
  ['kcalbeloh:sedah', 'mass', 6.17452e23],
  ['kcalbeloh:suluco', 'geeASL', .85],
  ['kcalbeloh:tot', 'mass', 1.73e16],
  ['kcalbeloh:sera', 'geeASL', 1.08],
  ['kcalbeloh:dipuc', 'geeASL', .15],
  ['kcalbeloh:noi', 'mass', 1.73e17],
  ['kcalbeloh:simesystem', 'mass', 5.7293e24],
  ['kcalbeloh:simetra', 'mass', 3.5648e24, 15000000],
  ['kcalbeloh:simeht', 'mass', 2.1645e24, 12000000],
  ['kcalbeloh:noira', 'geeASL', .1],
  ['kcalbeloh:norihc', 'geeASL', .44],
  ['kcalbeloh:noyreg', 'geeASL', .56],
  ['kcalbeloh:aralca', 'mass', 3.30e28],
  ['kcalbeloh:aralcb', 'mass', 6.50e27],
  ['kcalbeloh:anneheg', 'geeASL', .76],
  ['kcalbeloh:arorua', 'geeASL', 1.384],
  ['kcalbeloh:ahtpan', 'geeASL', .45],
  ['kcalbeloh:anehta', 'mass', 1.02667e25],
  ['kcalbeloh:efil', 'geeASL', .7183],
  ['kcalbeloh:elad', 'geeASL', .73],
  ['kcalbeloh:eulb', 'geeASL', .24],
  ['kcalbeloh:enots', 'mass', 2.15e18],
]

const facts = new Map(kcalbelohBodyFacts.map(fact => [fact.bodyId, fact]))
const gravity = new Map(gravityRows.map(row => [row[0], row]))
const gravitationalParameters = new Map(gravityRows.map(([bodyId, property, value]) => {
  const radius = facts.get(bodyId)!.radiusM
  const mu = property === 'mass' ? value * kcalbelohGravityConstants.gravitationalConstant
    : property === 'geeASL' ? value * kcalbelohGravityConstants.standardGravity * radius ** 2 : value
  return [bodyId, mu] as const
}))

/** Physical planets and moons at default 1× scale, without HomeSwitch or Principia.
 * Explicit configured SOIs override the floored Laplace relation. Otherwise
 * Kopernicus uses max(a × (muBody/muParent)^(2/5), 2R, R + 40 km).
 * The binary orbital-period patches do not alter these bodies' own gravity;
 * local relay calculations remain spherical two-body estimates.
 */
export const kcalbelohPhysicalReferences: readonly KcalbelohPhysicalReference[] = kcalbelohBodies.flatMap(body => {
  if (body.kind !== 'planet' && body.kind !== 'moon') return []
  const fact = facts.get(body.id)!
  const row = gravity.get(body.id)!
  const parentBodyId = body.parentId!
  const gravitationalParameter = gravitationalParameters.get(body.id)!
  const parentMu = gravitationalParameters.get(parentBodyId)!
  return [{
    bodyId: body.id,
    parentBodyId,
    radiusM: fact.radiusM,
    gravitationalParameter,
    atmosphereHeightM: fact.atmosphereHeightM,
    sphereOfInfluenceM: row[3] ?? Math.max(
      fact.semiMajorAxisM * (gravitationalParameter / parentMu) ** (2 / 5),
      fact.radiusM * kcalbelohSoiConstants.minimumRadiusMultiplier,
      fact.radiusM + kcalbelohSoiConstants.minimumAltitudeM,
    ),
    configPath: fact.configPath,
  }]
})
