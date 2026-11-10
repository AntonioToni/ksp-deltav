import type { DataSource, PlanetPack } from '../types/planner'
import { hohmannArrivalSpeed, hohmannTransfer, parkingOrbitBurn, splitCapture } from '../utils/orbitalBudgets'
import { rssCentralMu, rssConfigBase, rssPhysicalReferences, rssPhysicsSource, type RssPhysicalReference } from './rssPhysics'

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

interface OuterOrbitReference extends RssPhysicalReference {
  parkingAltitudeM: number
  ellipticalApoapsisRadiusM?: number
}

export const rssOuterOrbitReferences: readonly OuterOrbitReference[] = rssPhysicalReferences
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
  const modernById = new Map(rssOuterOrbitReferences.map(reference => [reference.bodyId, reference]))
  const result: PlanetPack = {
    ...pack,
    sources: pack.sources.map(source => ({ ...source })),
    assumptions: pack.assumptions.filter(note => !note.startsWith('Current RSS atmospheres differ from the diagram.')
      && !note.startsWith('All budgets are in m/s, converted from the community diagram')),
    bodies: pack.bodies.map(body => ({ ...body })),
    nodes: pack.nodes.map(node => ({
      ...node,
      ...(node.kind === 'orbit' && modernById.has(node.bodyId)
        ? { altitudeKm: modernById.get(node.bodyId)!.parkingAltitudeM / 1000 } : {}),
    })),
    maneuvers: pack.maneuvers.map(edge => ({ ...edge, assumptions: [...edge.assumptions] })),
  }
  const referenceById = new Map(rssPhysicalReferences.map(reference => [reference.bodyId, reference]))
  const nodeById = new Map(result.nodes.map(node => [node.id, node]))
  const edgeById = new Map(result.maneuvers.map(edge => [edge.id, edge]))
  const bodyById = new Map(result.bodies.map(body => [body.id, body]))
  const nodeId = (bodyId: string, kind: string) => `${bodyId}:${kind}`
  const nameOf = (bodyId: string) => bodyById.get(bodyId)!.name
  const parkingRadius = (reference: RssPhysicalReference): number => {
    const altitude = nodeById.get(nodeId(reference.bodyId, 'orbit'))?.altitudeKm
    if (altitude === undefined || altitude * 1000 <= reference.atmosphereHeightM
      || reference.radiusM + altitude * 1000 >= reference.sphereOfInfluenceM) {
      throw new Error(`Invalid RSS modeled parking reference: ${reference.bodyId}.`)
    }
    return reference.radiusM + altitude * 1000
  }
  const replacePair = (from: string, to: string, deltaV: number, notes: string[]) => {
    if (!Number.isFinite(deltaV) || deltaV < 0) throw new Error(`Invalid RSS orbital budget: ${from} -> ${to}.`)
    for (const [start, end] of [[from, to], [to, from]]) {
      const edge = edgeById.get(`${start}->${end}`)
      if (!edge) throw new Error(`Missing RSS reference branch: ${start} -> ${end}.`)
      edge.deltaV = Math.ceil(deltaV)
      edge.sourceId = rssOuterSource.id
      edge.assumptions = [...assumptions, ...notes]
    }
  }
  const earth = referenceById.get('rss:earth')!
  const earthParkingRadius = parkingRadius(earth)
  const earthEscape = edgeById.get('rss:earth:orbit->rss:earth:encounter')!.deltaV

  for (const reference of rssOuterOrbitReferences.filter(reference => reference.parentBodyId === 'rss:sun')) {
    const { bodyId, gravitationalParameter: mu, ellipticalApoapsisRadiusM: apoapsis } = reference
    const radius = parkingRadius(reference)
    if (apoapsis === undefined || apoapsis <= radius || apoapsis >= reference.sphereOfInfluenceM) {
      throw new Error(`Invalid RSS modeled high reference: ${bodyId}.`)
    }
    const notes = [
      `${nameOf(bodyId)} reference: circular parking altitude ${reference.parkingAltitudeM / 1000} km; high periapsis radius ${radius} m and apoapsis radius ${apoapsis} m from the center.`,
      `Physical/orbital source: ${rssConfigBase}/${reference.configPath}`,
    ]
    const transfer = hohmannTransfer(rssCentralMu, earth.semiMajorAxisM, reference.semiMajorAxisM)
    const earthBurn = parkingOrbitBurn(earth.gravitationalParameter, earthParkingRadius, transfer.departureDeltaV)
    const increment = Math.ceil(earthBurn) - earthEscape
    if (increment < 0) throw new Error(`RSS Earth reference exceeds modeled departure: ${bodyId}.`)
    replacePair('rss:earth:encounter', nodeId(bodyId, 'encounter'), increment, [
      ...notes,
      `Coplanar circularized Earth-to-${nameOf(bodyId)} stellar Hohmann reference. The ${increment} m/s rail increment plus the separately charged ${earthEscape} m/s Earth escape equals the rounded complete Earth parking-orbit burn ${Math.ceil(earthBurn)} m/s.`,
    ])
    const split = splitCapture(mu, radius, apoapsis, transfer.arrivalDeltaV)
    replacePair(nodeId(bodyId, 'orbit'), nodeId(bodyId, 'elliptical'), split.circularization, notes)
    replacePair(nodeId(bodyId, 'elliptical'), nodeId(bodyId, 'encounter'), split.captureToEllipse, [
      ...notes, `Earth-reference hyperbolic arrival speed: ${transfer.arrivalDeltaV.toFixed(6)} m/s.`,
    ])

    const highPeriapsisSpeed = Math.sqrt(mu / radius) * Math.sqrt(2 / (1 + radius / apoapsis))
    for (const moon of rssPhysicalReferences.filter(candidate => candidate.parentBodyId === bodyId)) {
      if (moon.semiMajorAxisM <= radius || moon.semiMajorAxisM >= reference.sphereOfInfluenceM) {
        throw new Error(`Invalid RSS modeled moon orbital radius: ${moon.bodyId}.`)
      }
      const moonRadius = parkingRadius(moon)
      const moonTransfer = hohmannTransfer(mu, radius, moon.semiMajorAxisM)
      const transferPeriapsisSpeed = Math.sqrt(mu / radius) + moonTransfer.departureDeltaV
      const departure = Math.abs(highPeriapsisSpeed - transferPeriapsisSpeed)
      const arrivalSpeed = hohmannArrivalSpeed(mu, radius, moon.semiMajorAxisM, moon.inclinationDeg!)
      const moonNotes = [
        ...notes,
        `${nameOf(moon.bodyId)} circularized orbital radius ${moon.semiMajorAxisM} m; nominal inclination ${moon.inclinationDeg}° to the parent-centered reference plane. Relative encounter speed: ${arrivalSpeed.toFixed(6)} m/s.`,
        `Moon parking altitude: ${nodeById.get(nodeId(moon.bodyId, 'orbit'))!.altitudeKm} km. Physical/orbital source: ${rssConfigBase}/${moon.configPath}`,
      ]
      replacePair(nodeId(bodyId, 'elliptical'), nodeId(moon.bodyId, 'encounter'), departure, [
        ...moonNotes,
        `Periapsis impulse between the stated high ellipse and the moon-transfer ellipse: |${highPeriapsisSpeed.toFixed(6)} − ${transferPeriapsisSpeed.toFixed(6)}| m/s. Local moon capture is charged separately.`,
      ])
      replacePair(nodeId(moon.bodyId, 'encounter'), nodeId(moon.bodyId, 'orbit'),
        parkingOrbitBurn(moon.gravitationalParameter, moonRadius, arrivalSpeed), moonNotes)
    }
  }

  // Atmospheric launch/landing cannot be recalculated from two-body constants.
  // Retain these explicitly uncalibrated allowances, with their map provenance.
  const surfaceNote = 'Historical atmospheric surface allowance retained at the new 150 km planner parking reference; it is not recalibrated for this altitude or a vehicle, is not a verified launch/landing budget, and is not an upper bound.'
  for (const edge of result.maneuvers) {
    if (['rss:pluto:surface', 'rss:triton:surface'].includes(edge.from)
      || ['rss:pluto:surface', 'rss:triton:surface'].includes(edge.to)) {
      if (!edge.assumptions.includes(surfaceNote)) edge.assumptions.push(surfaceNote)
    }
  }
  for (const source of [rssPhysicsSource, rssOuterSource]) {
    if (!result.sources.some(existing => existing.id === source.id)) result.sources.push({ ...source })
  }
  const units = 'All budgets are in m/s. Retained community-map figures are converted from its km/s labels; modeled orbital budgets are calculated separately and identify their model source. The mirrored diagram has no visible version/date or authorship credit; its repository revision is pinned without claiming official RSS calibration.'
  if (!result.assumptions.includes(units)) result.assumptions.unshift(units)
  const note = 'RSS outer-system orbital branches use explicit modern parking references: Saturn 2500 km, Uranus 2000 km, Neptune 1500 km, Pluto 150 km, and Triton 150 km. Their affected Earth-transfer, capture, high-orbit, and moon-transfer budgets are recalculated from pinned physical constants, replacing the historical orbital costs. Other map figures retain their source provenance; Pluto and Triton surface allowances remain uncalibrated historical placeholders.'
  if (!result.assumptions.includes(note)) result.assumptions.push(note)
  return result
}
