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
  'Analytic complete bound-orbit-to-bound-orbit transfer. Each endpoint burn is rounded upward to a whole m/s, then the two rounded burns are summed once.',
  'Circularized stellar orbits at the pinned semi-major axes are treated as coplanar. Inclination, eccentricity, changing phase, launch dates, node alignment, parking-plane orientation, gravity assists, and finite-thrust losses are not solved.',
  'The complete pair includes powered departure and capture into the chosen circular or high elliptical reference orbit. Atmospheric assistance does not discount this bundled pair; atmospheric entry feasibility and cleanup burns are not simulated.',
  'The reverse direction reuses the same nominal summed cost with the endpoint burns exchanged. This is not a solved return transfer at a particular epoch.',
]

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
      referenceNote: `${body.name} low orbit: circular parking altitude ${node.altitudeKm} km.`,
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
      calibration = `Explicit reference apoapsis radius ${apoapsis} m from the center${apoapsis === soiM / 2 ? ' (0.5 × the configured SOI)' : ''}. Reference ellipse speed is calculated before rounding; rounded local segment costs are not subtracted from rounded transfer burns.`
    } else {
      const raising = result.maneuvers.find(edge => edge.from === node.id && edge.to === high.id && edge.kind === 'escape' && !edge.directTransfer)
      const lowering = result.maneuvers.find(edge => edge.from === high.id && edge.to === node.id && edge.kind === 'capture' && !edge.directTransfer)
      if (!raising || !lowering || !Number.isFinite(raising.deltaV) || raising.deltaV <= 0 || raising.deltaV !== lowering.deltaV) return endpoints
      circularizationDeltaV = raising.deltaV
      calibration = `Map-calibrated high-orbit energy: reference periapsis speed is circular speed plus the published ${circularizationDeltaV} m/s low-to-high increment (${raising.sourceId}, ${raising.id}). This infers an equivalent reference ellipse from the map budget; no separately published high-orbit apoapsis is claimed.`
    }
    const ellipseSpeed = circularSpeed + circularizationDeltaV
    if (!Number.isFinite(ellipseSpeed) || ellipseSpeed <= circularSpeed || ellipseSpeed >= Math.SQRT2 * circularSpeed) return endpoints
    const semiMajorAxis = 1 / (2 / parkingRadiusM - ellipseSpeed ** 2 / reference.gravitationalParameter)
    const apoapsisRadiusM = 2 * semiMajorAxis - parkingRadiusM
    if (!Number.isFinite(apoapsisRadiusM) || apoapsisRadiusM <= parkingRadiusM || apoapsisRadiusM >= soiM) return endpoints
    endpoints.push({
      body, node: high, reference, parkingRadiusM, circularizationDeltaV,
      referenceNote: `${body.name} high elliptical orbit: periapsis altitude ${node.altitudeKm} km. ${calibration} Parking-plane orientation and moon encounter timing are unconstrained.`,
    })
    return endpoints
  })
  if (new Set(candidates.map(endpoint => endpoint.body.id)).size < 2) return result

  for (const source of [...physicalSources, directTransferSource]) {
    if (!result.sources.some(existing => existing.id === source.id)) result.sources.push({ ...source })
  }
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
            ...modelAssumptions,
            `${departureBurn} m/s departure at ${departure.body.name} (${departureRaw.toFixed(6)} m/s before rounding) plus ${arrivalBurn} m/s capture at ${arrival.body.name} (${arrivalRaw.toFixed(6)} m/s before rounding): ${deltaV} m/s total.`,
            `Departure reference: ${departure.referenceNote}`,
            `Arrival reference: ${arrival.referenceNote}`,
            `Stellar reference semi-major axes: ${departure.reference.semiMajorAxisM} m at ${departure.body.name}, ${arrival.reference.semiMajorAxisM} m at ${arrival.body.name}; central gravitational parameter ${centralMu} m³/s².`,
          ],
        }
        result.maneuvers.push(edge)
        existingIds.set(id, edge)
      }
    }
  }
  const note = 'Complete analytic direct transfers connect the reviewed circular and high elliptical reference orbits of non-home planets. High-orbit arrivals can continue along existing moon branches without an unnecessary low-orbit capture and re-raise. The planner first avoids unrequested planet/moon parking arrivals, then minimizes Delta-V; add explicit stops to request a detour. Homeworld encounter branches retain their source budgets. Reference transfers do not solve timing or parking-plane orientation and do not imply free flybys.'
  if (!result.assumptions.includes(note)) result.assumptions.push(note)
  return result
}
