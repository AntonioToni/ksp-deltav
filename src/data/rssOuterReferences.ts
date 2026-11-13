import type { DataSource, PlanetPack } from '../types/planner'
import { rssPhysicalReferences } from './rssPhysics'
import { applyRssOrbitReferences, type RssOrbitReference } from './rssOrbitReferences'

export const rssOuterSource: DataSource = {
  id: 'rss-outer-orbit-model',
  budgetType: 'model',
  title: 'RSS outer-system orbital budgets · analytic reference model',
  url: 'https://github.com/AntonioToni/ksp-deltav/blob/main/docs/DATA.md#rss-outer-system-reference-model',
}

// These are explicit planner choices, not revised labels for the old map's
// unsafe parking orbits. Every affected orbital maneuver is repriced below.
const parkingAltitudesM = new Map([
  ['rss:saturn', 2_500_000], ['rss:uranus', 2_000_000],
  ['rss:neptune', 1_500_000], ['rss:pluto', 150_000], ['rss:triton', 150_000],
])

export const rssOuterOrbitReferences: readonly RssOrbitReference[] = rssPhysicalReferences
  .filter(reference => parkingAltitudesM.has(reference.bodyId))
  .map(reference => ({
    ...reference,
    parkingAltitudeM: parkingAltitudesM.get(reference.bodyId)!,
    ...(reference.parentBodyId === 'rss:sun'
      ? { ellipticalApoapsisRadiusM: reference.sphereOfInfluenceM / 2 } : {}),
  }))

const assumptions = [
  'Calculated outer-system estimates from official RSS body and orbit data at the linked revision. Each local maneuver is rounded up to a whole m/s.',
  'The planner chooses parking heights above the configured atmospheres, rather than reusing the older map heights and costs. Rings, terrain, uneven gravity, gravity and motion from additional or binary bodies, launch windows, eccentric paths, real engine burns, and craft performance are not simulated.',
  'Each high ellipse comes down to the selected low orbit and reaches half the nominal sphere-of-influence radius from the body\'s center. Its shape is chosen directly, instead of inferred from old map burn figures.',
  'Moon transfers use the RSS reference plane around the parent body, not its equator. Approach speed includes each moon\'s configured tilt where the orbital planes are assumed to cross, including Triton\'s backward orbit. Moon paths are treated as circles at their source orbital distances.',
  'The planner does not choose parking-orbit orientation, align successive legs, or choose encounter dates. Adding these reference budgets does not simulate a flight or solve a gravity assist. Return directions reuse the same reference costs.',
]

/** Replace incompatible historical outer-system orbital references coherently. */
export function withRssOuterReferences(pack: PlanetPack): PlanetPack {
  const result = applyRssOrbitReferences({
    ...pack,
    assumptions: pack.assumptions.filter(note => !note.startsWith('Current RSS atmospheres differ from the diagram.')),
  }, rssOuterOrbitReferences, rssOuterSource, assumptions)

  // Atmospheric launch/landing cannot be recalculated from two-body constants.
  // Retain these explicitly uncalibrated allowances, with their map provenance.
  const surfaceNote = 'Uses an older atmospheric launch/landing allowance with the new 150 km parking orbit. It has not been recalculated for that height or your craft, and is not a verified cost or a guaranteed maximum.'
  for (const edge of result.maneuvers) {
    if (['rss:pluto:surface', 'rss:triton:surface'].includes(edge.from)
      || ['rss:pluto:surface', 'rss:triton:surface'].includes(edge.to)) {
      if (!edge.assumptions.includes(surfaceNote)) edge.assumptions.push(surfaceNote)
    }
  }
  const note = 'Outer-system parking heights are Saturn 2500 km, Uranus 2000 km, Neptune 1500 km, Pluto 150 km, and Triton 150 km. Related Earth transfers, orbit-entry burns, high orbits, and moon transfers are recalculated from the linked physical data. Other figures still come from the map; Pluto and Triton surface allowances remain older, unverified placeholders.'
  if (!result.assumptions.includes(note)) result.assumptions.push(note)
  return result
}
