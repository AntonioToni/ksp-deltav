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
  'Analytic RSS outer-system reference estimate from pinned official physical and orbital constants. Each local maneuver is rounded upward to a whole m/s.',
  'Modern parking altitudes are explicit planner choices above the configured atmosphere, not altitudes or budgets from the historical community map. Rings, terrain, non-spherical gravity, third-body and binary motion, launch windows, eccentric trajectories, finite-thrust losses, and vehicle performance are not modeled.',
  'Each outer high ellipse has periapsis at the selected low-orbit radius and apoapsis radius 0.5 × the nominal sphere of influence. The original map high-orbit increments are not reused to infer these states.',
  'Moon transfers use a nominal prograde zero-inclination parent-centered RSS orbital reference plane, not the parent equator. The configured moon inclination determines relative arrival speed at an assumed orbital node, including retrograde Triton. Moon orbits are circularized at their configured semi-major axes.',
  'Parking-plane orientation, the alignment between successive legs, and encounter dates are unconstrained. These chained reference budgets are not a propagated trajectory or a gravity-assist solution. Reverse edges reuse the same nominal costs.',
]

/** Replace incompatible historical outer-system orbital references coherently. */
export function withRssOuterReferences(pack: PlanetPack): PlanetPack {
  const result = applyRssOrbitReferences({
    ...pack,
    assumptions: pack.assumptions.filter(note => !note.startsWith('Current RSS atmospheres differ from the diagram.')),
  }, rssOuterOrbitReferences, rssOuterSource, assumptions)

  // Atmospheric launch/landing cannot be recalculated from two-body constants.
  // Retain these explicitly uncalibrated allowances, with their map provenance.
  const surfaceNote = 'Historical atmospheric surface allowance retained at the new 150 km planner parking reference; it is not recalibrated for this altitude or a vehicle, is not a verified launch/landing budget, and is not an upper bound.'
  for (const edge of result.maneuvers) {
    if (['rss:pluto:surface', 'rss:triton:surface'].includes(edge.from)
      || ['rss:pluto:surface', 'rss:triton:surface'].includes(edge.to)) {
      if (!edge.assumptions.includes(surfaceNote)) edge.assumptions.push(surfaceNote)
    }
  }
  const note = 'RSS outer-system orbital branches use explicit modern parking references: Saturn 2500 km, Uranus 2000 km, Neptune 1500 km, Pluto 150 km, and Triton 150 km. Their affected Earth-transfer, capture, high-orbit, and moon-transfer budgets are recalculated from pinned physical constants, replacing the historical orbital costs. Other map figures retain their source provenance; Pluto and Triton surface allowances remain uncalibrated historical placeholders.'
  if (!result.assumptions.includes(note)) result.assumptions.push(note)
  return result
}
