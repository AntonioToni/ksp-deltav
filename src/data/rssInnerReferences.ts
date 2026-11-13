import type { DataSource, PlanetPack } from '../types/planner'
import { rssPhysicalReferences } from './rssPhysics'
import { applyRssOrbitReferences, type RssOrbitReference } from './rssOrbitReferences'

export const rssInnerSource: DataSource = {
  id: 'rss-inner-orbit-model',
  budgetType: 'model',
  title: 'RSS inner-system high orbits · analytic reference model',
  url: 'https://github.com/AntonioToni/ksp-deltav/blob/main/docs/DATA.md#rss-inner-system-reference-model',
}

// Retain the compatible map low orbits. The new high references use explicit
// bound geometry, not the old rounded increments that implied escape energies.
const parkingAltitudesM = new Map([
  ['rss:mercury', 100_000], ['rss:venus', 400_000],
  ['rss:mars', 200_000], ['rss:ceres', 20_000],
])

export const rssInnerOrbitReferences: readonly RssOrbitReference[] = rssPhysicalReferences
  .filter(reference => parkingAltitudesM.has(reference.bodyId))
  .map(reference => ({
    ...reference,
    parkingAltitudeM: parkingAltitudesM.get(reference.bodyId)!,
    ellipticalApoapsisRadiusM: reference.sphereOfInfluenceM / 2,
  }))

const assumptions = [
  'Calculated inner-system high-orbit estimates from official RSS body and orbit data at the linked revision. Each local maneuver is rounded up to a whole m/s.',
  'Keeps compatible map low-orbit heights: Mercury 100 km, Venus 400 km, Mars 200 km, and Ceres 20 km. Each high ellipse comes down to that low orbit and reaches half the nominal sphere-of-influence radius from the body\'s center. These new ellipses replace the old low-to-high figures.',
  'Related Earth transfers, orbit-entry and circularization burns, and Mars-moon transfers are recalculated together. Surface allowances still come from the map; launch performance and atmospheric entry are not simulated.',
  'Mars-moon transfers use the RSS reference plane around Mars, not the Martian equator. Approach speed includes each moon\'s configured tilt where the orbital planes are assumed to cross. The moon paths are treated as circles at their source orbital distances.',
  'The planner does not choose parking-orbit orientation, align successive legs, or choose encounter dates. Eccentric paths, optimized plane changes, exact entry and exit through spheres of influence, gravity from additional bodies, real engine burns, and craft losses are not calculated. Return directions reuse the same reference costs.',
]

export function withRssInnerReferences(pack: PlanetPack): PlanetPack {
  const result = applyRssOrbitReferences(pack, rssInnerOrbitReferences, rssInnerSource, assumptions)
  const note = 'Mercury, Venus, Mars, and Ceres use chosen high ellipses. The closest point is at their existing low-orbit height; the farthest point is at half the sphere-of-influence radius from the body\'s center. Their Earth-transfer and local orbit budgets are recalculated, including Phobos and Deimos transfers and orbit entry. Direct transfers support low and high orbits at every supported planet other than Earth. Surface allowances and low-orbit heights still come from their original sources.'
  if (!result.assumptions.includes(note)) result.assumptions.push(note)
  return result
}
