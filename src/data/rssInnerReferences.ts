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
  'Analytic RSS inner-system high-orbit reference estimate from pinned official physical and orbital constants. Each local maneuver is rounded upward to a whole m/s.',
  'The compatible map low-orbit altitudes are retained: Mercury 100 km, Venus 400 km, Mars 200 km, and Ceres 20 km. Each new high ellipse has periapsis at that low radius and apoapsis radius 0.5 × the nominal sphere of influence. Historical low-to-high increments are replaced, not clamped into bound orbits.',
  'Affected Earth-transfer, local capture/circularization, and Mars-moon transfer/capture budgets are recalculated together. Surface allowances retain their map provenance; launch vehicles and atmospheric entry are not simulated.',
  'Mars-moon transfers use a nominal prograde zero-inclination parent-centered RSS orbital reference plane, not the Martian equator. The configured moon inclination determines relative arrival speed at an assumed orbital node; moon orbits are circularized at their configured semi-major axes.',
  'Parking-plane orientation, the alignment between successive legs, and encounter dates are unconstrained. Eccentric trajectories, optimized plane changes, finite sphere-of-influence matching, third-body effects, finite thrust, and vehicle losses are not solved. Reverse edges reuse the same nominal costs.',
]

export function withRssInnerReferences(pack: PlanetPack): PlanetPack {
  const result = applyRssOrbitReferences(pack, rssInnerOrbitReferences, rssInnerSource, assumptions)
  const note = 'Mercury, Venus, Mars, and Ceres use explicit bound high-orbit references with apoapsis radius 0.5 × SOI and periapsis at their retained low-orbit radius. Their Earth-transfer and local orbital budgets are recalculated, including Phobos and Deimos transfer/capture. Direct transfers can now depart from or arrive at every supported non-Earth planet’s low and high orbit. Surface allowances and low-orbit altitudes retain their original provenance.'
  if (!result.assumptions.includes(note)) result.assumptions.push(note)
  return result
}
