import type { CelestialBody, DataSource, ManeuverEdge, PlanetPack, RouteNode } from '../types/planner'
import { hohmannTransfer, parkingOrbitBurn, splitCapture } from '../utils/orbitalBudgets'
import type { StockPhysicalReference } from './stockPhysics'

export const directTransferSource: DataSource = {
  id: 'direct-interplanetary-model',
  budgetType: 'model',
  title: 'Coplanar direct planetary transfers · analytic reference model',
  url: 'https://github.com/AntonioToni/ksp-deltav/blob/main/docs/DATA.md#direct-interplanetary-transfers',
}

interface DirectTransferReference extends StockPhysicalReference {
  sphereOfInfluenceM?: number
  /** Explicit planner-selected high reference geometry, when separately known. */
  ellipticalApoapsisRadiusM?: number
}

interface Endpoint {
  body: CelestialBody
  node: RouteNode
  reference: DirectTransferReference
  parkingRadiusM: number
  /** Unrounded speed difference between the reference ellipse and circular orbit at periapsis. */
  circularizationDeltaV: number
  referenceNote: string
}

const modelAssumptions = [
  'Calculated orbit-to-orbit transfer. Departure and arrival burns are each rounded up to whole m/s, then added once. High-orbit speeds are calculated before rounding; rounded local burns are not subtracted from rounded transfer burns.',
  'Uses circular orbits around the star at the source distances, in one plane. Orbital tilt, eccentricity, changing positions, flight dates, encounter alignment, parking-orbit orientation, gravity assists, and real-burn losses are excluded.',
  'Includes departure and powered arrival into the selected circular or high elliptical orbit. Atmosphere options do not reduce this total; entry and later corrections are not simulated. Map-derived high ellipses use the low-to-high burn without a separately published farthest point.',
  'Returning swaps the endpoint burns and reuses their total; no particular return date is calculated.',
]
const sharedModelAssumptions = `Direct planetary model: ${modelAssumptions.join(' ')}`

/** Add reviewed direct pairs without changing existing reference records. */
export function withDirectTransfers(
  pack: PlanetPack,
  references: readonly DirectTransferReference[],
  centralMu: number,
  physicalSources: readonly DataSource[] = [],
): PlanetPack {
  if (!Number.isFinite(centralMu) || centralMu <= 0) throw new RangeError('Central gravitational parameter must be finite and positive.')
  const result: PlanetPack = {
    ...pack,
    sources: pack.sources.map(source => ({ ...source })),
    assumptions: [...pack.assumptions],
    bodies: pack.bodies.map(body => ({ ...body })),
    nodes: pack.nodes.map(node => ({ ...node })),
    maneuvers: pack.maneuvers.map(edge => ({ ...edge, assumptions: [...edge.assumptions] })),
    ...(pack.unpricedConnections ? { unpricedConnections: pack.unpricedConnections.map(connection => ({ ...connection, assumptions: [...connection.assumptions] })) } : {}),
    ...(pack.mapRegions ? { mapRegions: pack.mapRegions.map(region => ({ ...region, bodyIds: [...region.bodyIds] })) } : {}),
  }
  const home = result.bodies.find(body => body.id === result.transferHubBodyId)
  const central = result.bodies.find(body => body.id === home?.parentId)
  if (!home || central?.kind !== 'star') return result
  const referenceById = new Map(references.map(reference => [reference.bodyId, reference]))
  const candidates: Endpoint[] = result.bodies.flatMap(body => {
    const reference = referenceById.get(body.id)
    const node = result.nodes.find(node => node.bodyId === body.id && node.kind === 'orbit')
    if (body.kind !== 'planet' || body.id === home.id || body.parentId !== central.id
      || reference?.parentBodyId !== body.parentId || node?.altitudeKm === undefined) return []
    const altitudeM = node.altitudeKm * 1000
    const parkingRadiusM = reference.radiusM + altitudeM
    const soiM = reference.sphereOfInfluenceM
      ?? reference.semiMajorAxisM * (reference.gravitationalParameter / centralMu) ** (2 / 5)
    // A historical or unknown parking label cannot silently become a new
    // modern physical reference. Only explicitly safe bound states are used.
    if (altitudeM <= reference.atmosphereHeightM || parkingRadiusM >= soiM) return []
    const endpoints: Endpoint[] = [{
      body, node, reference, parkingRadiusM, circularizationDeltaV: 0,
      referenceNote: `${body.name} low orbit: a circular parking orbit ${node.altitudeKm} km above the surface.`,
    }]
    const high = result.nodes.find(node => node.bodyId === body.id && node.kind === 'elliptical')
    if (!high) return endpoints

    const circularSpeed = Math.sqrt(reference.gravitationalParameter) / Math.sqrt(parkingRadiusM)
    let circularizationDeltaV: number
    let calibration: string
    if (reference.ellipticalApoapsisRadiusM !== undefined) {
      const apoapsis = reference.ellipticalApoapsisRadiusM
      if (!Number.isFinite(apoapsis) || apoapsis <= parkingRadiusM || apoapsis >= soiM) return endpoints
      circularizationDeltaV = splitCapture(reference.gravitationalParameter, parkingRadiusM, apoapsis, 0).circularization
      calibration = `Assumed farthest point: ${apoapsis} m from the center${apoapsis === soiM / 2 ? ' (half the configured sphere-of-influence radius)' : ''}.`
    } else {
      const raising = result.maneuvers.find(edge => edge.from === node.id && edge.to === high.id && edge.kind === 'escape' && !edge.directTransfer)
      const lowering = result.maneuvers.find(edge => edge.from === high.id && edge.to === node.id && edge.kind === 'capture' && !edge.directTransfer)
      if (!raising || !lowering || !Number.isFinite(raising.deltaV) || raising.deltaV <= 0 || raising.deltaV !== lowering.deltaV) return endpoints
      circularizationDeltaV = raising.deltaV
      calibration = `High-orbit speed at the closest point is circular speed plus the map's ${circularizationDeltaV} m/s low-to-high burn (${raising.sourceId}, ${raising.id}).`
    }
    const ellipseSpeed = circularSpeed + circularizationDeltaV
    if (!Number.isFinite(ellipseSpeed) || ellipseSpeed <= circularSpeed || ellipseSpeed >= Math.SQRT2 * circularSpeed) return endpoints
    const semiMajorAxis = 1 / (2 / parkingRadiusM - ellipseSpeed ** 2 / reference.gravitationalParameter)
    const apoapsisRadiusM = 2 * semiMajorAxis - parkingRadiusM
    if (!Number.isFinite(apoapsisRadiusM) || apoapsisRadiusM <= parkingRadiusM || apoapsisRadiusM >= soiM) return endpoints
    endpoints.push({
      body, node: high, reference, parkingRadiusM, circularizationDeltaV,
      referenceNote: `${body.name} high elliptical orbit: closest point ${node.altitudeKm} km above the surface. ${calibration}`,
    })
    return endpoints
  })
  if (new Set(candidates.map(endpoint => endpoint.body.id)).size < 2) return result

  for (const source of [...physicalSources, directTransferSource]) {
    if (!result.sources.some(existing => existing.id === source.id)) result.sources.push({ ...source })
  }
  // Keep the common model once in exported packs; repeating it for every
  // directed pair would make a complete RSS export exceed its import limit.
  if (!result.assumptions.includes(sharedModelAssumptions)) result.assumptions.push(sharedModelAssumptions)
  const existingIds = new Map(result.maneuvers.map(edge => [edge.id, edge]))
  for (let fromIndex = 0; fromIndex < candidates.length; fromIndex++) {
    const from = candidates[fromIndex]!
    for (const to of candidates.slice(fromIndex + 1)) {
      if (from.body.id === to.body.id) continue
      const transfer = hohmannTransfer(centralMu, from.reference.semiMajorAxisM, to.reference.semiMajorAxisM)
      // Subtract the reference speed increment before rounding. This prices a
      // direct high-orbit capture without circularizing and raising again.
      const fromBurn = parkingOrbitBurn(from.reference.gravitationalParameter, from.parkingRadiusM, transfer.departureDeltaV) - from.circularizationDeltaV
      const toBurn = parkingOrbitBurn(to.reference.gravitationalParameter, to.parkingRadiusM, transfer.arrivalDeltaV) - to.circularizationDeltaV
      const fromRounded = Math.ceil(fromBurn)
      const toRounded = Math.ceil(toBurn)
      for (const [departure, arrival, departureBurn, arrivalBurn, departureRaw, arrivalRaw] of [
        [from, to, fromRounded, toRounded, fromBurn, toBurn],
        [to, from, toRounded, fromRounded, toBurn, fromBurn],
      ] as const) {
        const id = `direct:${departure.node.id}->${arrival.node.id}`
        const deltaV = departureBurn + arrivalBurn
        const existing = existingIds.get(id)
        if (existing) {
          if (!existing.directTransfer || existing.deltaV !== deltaV) throw new Error(`Conflicting reviewed direct transfer: ${id}.`)
          continue
        }
        const edge: ManeuverEdge = {
          id, from: departure.node.id, to: arrival.node.id,
          deltaV, kind: 'transfer', directTransfer: true,
          label: departure.node.kind === 'orbit' && arrival.node.kind === 'orbit'
            ? `${departure.body.name} → ${arrival.body.name} direct transfer`
            : `${departure.node.label} → ${arrival.node.label} direct transfer`,
          sourceId: directTransferSource.id,
          assumptions: [
            'Departure and orbit-entry burns. Atmosphere options do not reduce this total; see pack assumptions.',
            `${departureBurn} m/s departure at ${departure.body.name} (${departureRaw.toFixed(6)} m/s before rounding) plus ${arrivalBurn} m/s capture at ${arrival.body.name} (${arrivalRaw.toFixed(6)} m/s before rounding): ${deltaV} m/s total.`,
            `Departure reference: ${departure.referenceNote}`,
            `Arrival reference: ${arrival.referenceNote}`,
            `Circular orbit radii around the star (source semi-major axes): ${departure.body.name} ${departure.reference.semiMajorAxisM} m; ${arrival.body.name} ${arrival.reference.semiMajorAxisM} m. Central gravitational parameter: ${centralMu} m³/s².`,
          ],
        }
        result.maneuvers.push(edge)
        existingIds.set(id, edge)
      }
    }
  }
  const note = 'Direct transfers connect the stated circular and high elliptical orbits of planets other than the homeworld. Arriving in high orbit can let a moon journey continue without first dropping into low orbit and climbing back out. The planner avoids extra parking stops before choosing the lowest Delta-V route; add mission stops to request a detour. Routes through the homeworld keep their source budgets. These estimates do not choose flight dates or parking-orbit orientation, and do not make flybys free.'
  if (!result.assumptions.includes(note)) result.assumptions.push(note)
  return result
}
