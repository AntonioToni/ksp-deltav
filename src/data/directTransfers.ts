import type { CelestialBody, DataSource, ManeuverEdge, PlanetPack, RouteNode } from '../types/planner'
import { hohmannTransfer, parkingOrbitBurn } from '../utils/orbitalBudgets'
import type { StockPhysicalReference } from './stockPhysics'

export const directTransferSource: DataSource = {
  id: 'direct-interplanetary-model',
  budgetType: 'model',
  title: 'Coplanar direct planetary transfers · analytic reference model',
  url: 'https://github.com/AntonioToni/ksp-deltav/blob/main/docs/DATA.md#direct-interplanetary-transfers',
}

interface DirectTransferReference extends StockPhysicalReference {
  sphereOfInfluenceM?: number
}

interface Endpoint {
  body: CelestialBody
  node: RouteNode
  reference: DirectTransferReference
  parkingRadiusM: number
}

const modelAssumptions = [
  'Analytic complete parking-orbit-to-parking-orbit transfer. Each endpoint burn is rounded upward to a whole m/s, then the two rounded burns are summed once.',
  'Circularized stellar orbits at the pinned semi-major axes are treated as coplanar. Inclination, eccentricity, changing phase, launch dates, node alignment, parking-plane orientation, gravity assists, and finite-thrust losses are not solved.',
  'The complete pair includes powered departure and circular parking capture. Atmospheric assistance does not discount this bundled pair; atmospheric entry feasibility and cleanup burns are not simulated.',
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
    return [{ body, node, reference, parkingRadiusM }]
  })
  if (candidates.length < 2) return result

  for (const source of [...physicalSources, directTransferSource]) {
    if (!result.sources.some(existing => existing.id === source.id)) result.sources.push({ ...source })
  }
  const existingIds = new Map(result.maneuvers.map(edge => [edge.id, edge]))
  for (let fromIndex = 0; fromIndex < candidates.length; fromIndex++) {
    const from = candidates[fromIndex]!
    for (const to of candidates.slice(fromIndex + 1)) {
      const transfer = hohmannTransfer(centralMu, from.reference.semiMajorAxisM, to.reference.semiMajorAxisM)
      const fromBurn = parkingOrbitBurn(from.reference.gravitationalParameter, from.parkingRadiusM, transfer.departureDeltaV)
      const toBurn = parkingOrbitBurn(to.reference.gravitationalParameter, to.parkingRadiusM, transfer.arrivalDeltaV)
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
          label: `${departure.body.name} → ${arrival.body.name} direct transfer`,
          sourceId: directTransferSource.id,
          assumptions: [
            ...modelAssumptions,
            `${departureBurn} m/s departure at ${departure.body.name} (${departureRaw.toFixed(6)} m/s before rounding) plus ${arrivalBurn} m/s capture at ${arrival.body.name} (${arrivalRaw.toFixed(6)} m/s before rounding): ${deltaV} m/s total.`,
            `Reference circular parking altitudes: ${departure.node.altitudeKm} km at ${departure.body.name}, ${arrival.node.altitudeKm} km at ${arrival.body.name}.`,
            `Stellar reference semi-major axes: ${departure.reference.semiMajorAxisM} m at ${departure.body.name}, ${arrival.reference.semiMajorAxisM} m at ${arrival.body.name}; central gravitational parameter ${centralMu} m³/s².`,
          ],
        }
        result.maneuvers.push(edge)
        existingIds.set(id, edge)
      }
    }
  }
  const note = 'Complete analytic direct transfers connect the explicit parking orbits of non-home planets. Homeworld encounter branches retain their source budgets; the route planner compares the supplied map and model edges without assuming free flybys.'
  if (!result.assumptions.includes(note)) result.assumptions.push(note)
  return result
}
