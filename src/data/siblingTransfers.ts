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
  'Complete analytic transfer between low circular orbits of moons sharing one physical parent. Both moon departure and powered capture are included; no parent parking-orbit visit is charged.',
  'Moon paths are circularized at their pinned semi-major axes. The Hohmann transfer plane is the inner moon\'s orbital plane; the outer encounter occurs at an assumed mutual orbital node, using the planes\' relative inclination.',
  'Pinned inclinations and ascending-node longitudes determine the mutual plane angle. This is an assumed nodal geometry, not a launch-window, phasing, eccentric-trajectory, plane-change optimization, or B-plane solution.',
  'Parking-orbit orientation, finite sphere-of-influence matching, third-body effects, gravity assists, and vehicle losses are not solved. Add a mission reserve; this reference estimate is not a verified flight cost.',
  'Each endpoint burn is rounded upward separately to whole m/s and summed once. Reversing the same nominal inner-plane reference swaps the endpoint burns; it is not a dated return trajectory.',
  'Atmospheric assistance does not discount this bundled pair. Retrograde moon orbits, co-orbital phasing, binary parents, and unknown orbital planes are outside this model.',
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
            `Common parent: ${inner.parent.name}; gravitational parameter ${inner.parentMu} m³/s². Circularized moon orbital radii: ${innerA} m at ${inner.body.name} and ${outerA} m at ${outer.body.name}.`,
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
    const note = 'Supported sibling moons have complete analytic low-orbit transfers around their common parent, with an assumed mutual-node encounter and circularized moon orbits. These do not require a parent parking-orbit visit. Co-orbital phasing, retrograde pairs, binary parents, and unknown orbital planes retain their supplied reference routes.'
    if (!result.assumptions.includes(note)) result.assumptions.push(note)
  }
  return result
}
