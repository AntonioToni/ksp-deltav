import type { OrbitalElements } from '../types/orbital'
import type { DataSource } from '../types/planner'
import { stockCentralMu, stockPhysicalReferences, stockPhysicsSource } from './stockPhysics'

export interface VerifiedOrbitalReference {
  readonly bodyId: string
  readonly parentBodyId: string
  readonly elements: Readonly<OrbitalElements>
  readonly sourceId: string
}

export const stockOrbitalElementsSource: Readonly<DataSource> = Object.freeze({
  id: 'stock-orbital-elements',
  title: 'KSPTOT Stock orbital elements and UT epochs · pinned revision',
  url: stockPhysicsSource.url,
})

// KSPTOT bodies.ini 9972b57398742263af12374652799db210395499 documents
// all angular fields, including mean anomaly, in degrees and epochs in seconds.
// Every stock entry has epoch UT = 0. Values below are source facts; the other
// four orbital elements and parent GM are shared with the existing physics data.
const angularRows: readonly (readonly [bodyId: string, argumentOfPeriapsisDeg: number,
  meanAnomalyAtEpochDeg: number, epochS: number])[] = [
  ['stock:moho', 15, 179.908753682, 0],
  ['stock:eve', 0, 179.908753682, 0],
  ['stock:gilly', 10, 51.566200196, 0],
  ['stock:kerbin', 0, 179.908753682, 0],
  ['stock:mun', 0, 97.402827904, 0],
  ['stock:minmus', 38, 51.566200196, 0],
  ['stock:duna', 0, 179.908753682, 0],
  ['stock:ike', 0, 97.402827904, 0],
  ['stock:dres', 90, 179.908753682, 0],
  ['stock:jool', 0, 5.729578037, 0],
  ['stock:laythe', 0, 179.908753682, 0],
  ['stock:vall', 0, 51.566200196, 0],
  ['stock:tylo', 0, 179.908753682, 0],
  ['stock:bop', 25, 51.566200196, 0],
  ['stock:pol', 15, 51.566200196, 0],
  ['stock:eeloo', 260, 179.908753682, 0],
]

const angularById = new Map(angularRows.map(([bodyId, argument, mean, epoch]) => [bodyId, { argument, mean, epoch }]))
const parentMu = new Map([
  ['stock:kerbol', stockCentralMu],
  ...stockPhysicalReferences.map(reference => [reference.bodyId, reference.gravitationalParameter] as const),
])

/** Stock patched-conic periods use the reference body's GM, not the mass sum. */
export const stockOrbitalElements: readonly VerifiedOrbitalReference[] = Object.freeze(stockPhysicalReferences.map(reference => {
  const angular = angularById.get(reference.bodyId)!
  return Object.freeze({
    bodyId: reference.bodyId,
    parentBodyId: reference.parentBodyId,
    sourceId: stockOrbitalElementsSource.id,
    elements: Object.freeze({
      semiMajorAxisM: reference.semiMajorAxisM,
      eccentricity: reference.eccentricity,
      inclinationDeg: reference.inclinationDeg,
      longitudeAscendingNodeDeg: reference.longitudeOfAscendingNodeDeg,
      argumentOfPeriapsisDeg: angular.argument,
      meanAnomalyAtEpochRad: angular.mean * Math.PI / 180,
      epochS: angular.epoch,
      periodS: 2 * Math.PI * Math.sqrt(reference.semiMajorAxisM ** 3 / parentMu.get(reference.parentBodyId)!),
    }),
  })
}))
