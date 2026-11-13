import type { CelestialBody, DataSource, ManeuverEdge, PlanetPack, RouteNode } from '../types/planner'
import { hohmannArrivalSpeed, hohmannTransfer, parkingOrbitBurn } from '../utils/orbitalBudgets'

export interface SiblingTransferReference {
  bodyId: string
  parentBodyId: string
  radiusM: number
  gravitationalParameter: number
  atmosphereHeightM: number
  semiMajorAxisM: number
  sphereOfInfluenceM?: number
  inclinationDeg?: number
  longitudeOfAscendingNodeDeg?: number
  eccentricity?: number
}

export const siblingTransferSource: DataSource = {
  id: 'sibling-moon-transfer-model',
  budgetType: 'model',
  title: 'Direct sibling-moon transfers · circularized orbital-node reference model',
  url: 'https://github.com/AntonioToni/ksp-deltav/blob/main/docs/DATA.md#direct-sibling-moon-transfers',
}

interface Endpoint {
  body: CelestialBody
  parent: CelestialBody
  node: RouteNode
  reference: SiblingTransferReference
  parentMu: number
  parkingRadiusM: number
}

const modelAssumptions = [
  'Calculated transfer between low circular orbits at two moons that orbit the same body. Includes departure and arrival engine burns, without a parking stop at that shared body.',
  'Uses circular moon orbits at the source orbital distances. The transfer follows the inner moon\'s orbital plane and meets the outer moon where the two orbital planes are assumed to cross.',
  'The angle between the orbital planes comes from the source tilts and crossing directions. The planner does not choose a launch window, track the moons\' timing along their orbits, follow eccentric paths, or optimize plane-change and encounter aiming burns.',
  'Parking-orbit orientation, exact entry and exit through each sphere of influence, gravity from additional bodies, gravity assists, and craft losses are not calculated. Add a reserve; this is a planning estimate rather than a verified flight cost.',
  'Departure and arrival burns are each rounded up to a whole m/s and added once. The return direction exchanges those burns; it is not calculated for a particular return date.',
  'Atmosphere options do not reduce this combined transfer figure. Backward moon orbits, moons sharing one orbit, moons around a binary center, and unknown orbital planes use their existing reference routes instead.',
]

const positive = (value: number) => Number.isFinite(value) && value > 0

/** Add reviewed local alternatives without inferring free moon encounters. */
export function withSiblingTransfers(
  pack: PlanetPack,
  references: readonly SiblingTransferReference[],
  physicalSources: readonly DataSource[] = [],
): PlanetPack {
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
  const bodyById = new Map(result.bodies.map(body => [body.id, body]))
  const referenceById = new Map(references.map(reference => [reference.bodyId, reference]))
  const candidates: Endpoint[] = result.bodies.flatMap(body => {
    if (body.kind !== 'moon' || !body.parentId) return []
    const parent = bodyById.get(body.parentId)
    const reference = referenceById.get(body.id)
    const parentReference = referenceById.get(body.parentId)
    const node = result.nodes.find(node => node.bodyId === body.id && node.kind === 'orbit')
    if (!parent || (parent.kind !== 'planet' && parent.kind !== 'moon')
      || !reference || reference.parentBodyId !== parent.id || !parentReference
      || !positive(parentReference.gravitationalParameter) || node?.altitudeKm === undefined) return []
    const { radiusM, gravitationalParameter, atmosphereHeightM, semiMajorAxisM,
      inclinationDeg, longitudeOfAscendingNodeDeg, eccentricity } = reference
    if (!positive(radiusM) || !positive(gravitationalParameter) || !positive(semiMajorAxisM)
      || !Number.isFinite(atmosphereHeightM) || atmosphereHeightM < 0
      || inclinationDeg === undefined || !Number.isFinite(inclinationDeg) || inclinationDeg < 0 || inclinationDeg >= 90
      || longitudeOfAscendingNodeDeg === undefined || !Number.isFinite(longitudeOfAscendingNodeDeg)
      || eccentricity === undefined || !Number.isFinite(eccentricity) || eccentricity < 0 || eccentricity >= 1) return []
    const altitudeM = node.altitudeKm * 1000
    const parkingRadiusM = radiusM + altitudeM
    const soiM = reference.sphereOfInfluenceM
      ?? semiMajorAxisM * (gravitationalParameter / parentReference.gravitationalParameter) ** (2 / 5)
    if (!Number.isFinite(altitudeM) || altitudeM <= atmosphereHeightM
      || !positive(soiM) || parkingRadiusM >= soiM) return []
    return [{ body, parent, node, reference, parentMu: parentReference.gravitationalParameter, parkingRadiusM }]
  })
  const existing = new Map(result.maneuvers.map(edge => [edge.id, edge]))
  let added = false
  for (let fromIndex = 0; fromIndex < candidates.length; fromIndex++) {
    const first = candidates[fromIndex]!
    for (const second of candidates.slice(fromIndex + 1)) {
      if (first.parent.id !== second.parent.id) continue
      const [inner, outer] = first.reference.semiMajorAxisM < second.reference.semiMajorAxisM
        ? [first, second] : [second, first]
      const innerA = inner.reference.semiMajorAxisM
      const outerA = outer.reference.semiMajorAxisM
      // Equal-radius rendezvous needs a phasing model, not a zero-energy
      // Hohmann edge (notably the co-orbital OPM Polta and Priax).
      if (outerA - innerA <= outerA * 1e-12) continue
      const radians = Math.PI / 180
      const innerI = inner.reference.inclinationDeg! * radians
      const outerI = outer.reference.inclinationDeg! * radians
      const nodeDifference = (inner.reference.longitudeOfAscendingNodeDeg! - outer.reference.longitudeOfAscendingNodeDeg!) * radians
      const cosine = Math.max(-1, Math.min(1, Math.cos(innerI) * Math.cos(outerI)
        + Math.sin(innerI) * Math.sin(outerI) * Math.cos(nodeDifference)))
      const mutualInclinationDeg = Math.acos(cosine) / radians
      const transfer = hohmannTransfer(inner.parentMu, innerA, outerA)
      const innerExcess = transfer.departureDeltaV
      const outerExcess = hohmannArrivalSpeed(inner.parentMu, innerA, outerA, mutualInclinationDeg)
      const innerBurn = parkingOrbitBurn(inner.reference.gravitationalParameter, inner.parkingRadiusM, innerExcess)
      const outerBurn = parkingOrbitBurn(outer.reference.gravitationalParameter, outer.parkingRadiusM, outerExcess)
      for (const [departure, arrival, departureRaw, arrivalRaw, departureExcess, arrivalExcess] of [
        [inner, outer, innerBurn, outerBurn, innerExcess, outerExcess],
        [outer, inner, outerBurn, innerBurn, outerExcess, innerExcess],
      ] as const) {
        const id = `sibling:${departure.node.id}->${arrival.node.id}`
        const departureRounded = Math.ceil(departureRaw)
        const arrivalRounded = Math.ceil(arrivalRaw)
        const deltaV = departureRounded + arrivalRounded
        const prior = existing.get(id)
        if (prior) {
          if (prior.sourceId !== siblingTransferSource.id || !prior.directTransfer || prior.deltaV !== deltaV) {
            throw new Error(`Conflicting reviewed sibling transfer: ${id}.`)
          }
          continue
        }
        // Preserve an already supplied complete pair, including an official
        // map pair. Do not silently substitute a new model for its budget.
        if (result.maneuvers.some(edge => edge.kind === 'transfer'
          && edge.from === departure.node.id && edge.to === arrival.node.id)) continue
        const edge: ManeuverEdge = {
          id, from: departure.node.id, to: arrival.node.id,
          kind: 'transfer', directTransfer: true, deltaV,
          label: `${departure.body.name} → ${arrival.body.name} direct moon transfer`,
          sourceId: siblingTransferSource.id,
          assumptions: [
            ...modelAssumptions,
            `Both moons orbit ${inner.parent.name}, whose gravitational parameter is ${inner.parentMu} m³/s². Assumed circular orbit radii: ${innerA} m at ${inner.body.name} and ${outerA} m at ${outer.body.name}.`,
            `Reference plane: ${inner.body.name}'s orbit. Mutual inclination ${mutualInclinationDeg.toFixed(9)}° from the pinned inclinations and ascending nodes; source eccentricities ${inner.reference.eccentricity} at ${inner.body.name}, ${outer.reference.eccentricity} at ${outer.body.name} are not propagated.`,
            `${departureRounded} m/s departure at ${departure.body.name} (${departureRaw.toFixed(6)} m/s before rounding, excess speed ${departureExcess.toFixed(6)} m/s) plus ${arrivalRounded} m/s powered capture at ${arrival.body.name} (${arrivalRaw.toFixed(6)} m/s before rounding, excess speed ${arrivalExcess.toFixed(6)} m/s): ${deltaV} m/s total.`,
            `Reference parking altitudes: ${departure.node.altitudeKm} km at ${departure.body.name}, ${arrival.node.altitudeKm} km at ${arrival.body.name}.`,
          ],
        }
        result.maneuvers.push(edge)
        existing.set(id, edge)
        added = true
      }
    }
  }
  if (added) {
    for (const source of [...physicalSources, siblingTransferSource]) {
      if (!result.sources.some(prior => prior.id === source.id)) result.sources.push({ ...source })
    }
    const note = 'Supported moons orbiting the same body have direct low-orbit transfers, without a parking stop at that shared body. These estimates use circular moon orbits and assume an encounter where their orbital planes cross. Moons sharing one orbit, backward-orbiting pairs, moons around a binary center, and unknown orbital planes keep their supplied reference routes.'
    if (!result.assumptions.includes(note)) result.assumptions.push(note)
  }
  return result
}
