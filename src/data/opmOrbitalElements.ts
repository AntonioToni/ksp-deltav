import type { DataSource } from '../types/planner'
import { opmCentralMu, opmConfigSource, opmReferences } from './opmReference'
import { stockOrbitalElements, type VerifiedOrbitalReference } from './stockOrbitalElements'

export const opmOrbitalElementsSource: Readonly<DataSource> = Object.freeze({
  id: 'opm-orbital-elements',
  title: 'Official OPM 2.2.12 orbital elements and UT epochs · pinned revision',
  url: opmConfigSource.url,
})

// Remaining elements from the exact configPath pinned in opmReferences. Unlike
// KSPTOT's exported mean, Kopernicus meanAnomalyAtEpoch is already in radians.
// These bodies do not enable finalizeOrbit; its documented false default keeps
// the parent-GM period rule used by stock KSP. Kopernicus global Epoch is 0.
const angularRows: readonly (readonly [bodyId: string, argumentOfPeriapsisDeg: number,
  meanAnomalyAtEpochRad: number, epochS: number])[] = [
  ['opm:sarnus', 0, 2.88114666938782, 359.279999999964],
  ['opm:hale', 0, 0, 0],
  ['opm:ovok', 0, 1.72, 751.7],
  ['opm:slate', 0, 1.1, 1343.91],
  ['opm:tekto', 0, 2.1, 1275.12],
  ['opm:urlum', 0, 5.59607362747192, 422.539999999906],
  ['opm:polta', 60, 1.5209, 878.1399],
  ['opm:priax', 0, 1.5209, 878.1399],
  ['opm:wal', 0, 2.9615, 1078.179],
  ['opm:tal', 0, 0, 1179.579],
  ['opm:neidon', 0, 2.27167344093323, 99.6799999999973],
  ['opm:thatmo', 0, 2.04731106758118, 1953406.32967385],
  ['opm:nissee', 0, 2.04731106758118, 1953406.32967385],
  ['opm:plock', 50, 0, 213],
  ['opm:karen', 50, 0, 213],
]
const angularById = new Map(angularRows.map(([bodyId, argument, mean, epoch]) => [bodyId, { argument, mean, epoch }]))
const stockEeloo = stockOrbitalElements.find(reference => reference.bodyId === 'stock:eeloo')!.elements
const parentMu = new Map([
  ['stock:kerbol', opmCentralMu],
  ...opmReferences.map(reference => [reference.bodyId, reference.gravitationalParameter] as const),
])

export const opmOrbitalElements: readonly VerifiedOrbitalReference[] = Object.freeze(opmReferences.map(reference => {
  // Eeloo.cfg patches the existing stock body. It changes its parent/SMA/e/i/LAN
  // but never writes argument of periapsis, mean anomaly, or epoch. Those three
  // values are inherited, not unspecified zero defaults for a newly made body.
  const angular = reference.bodyId === 'stock:eeloo'
    ? { argument: stockEeloo.argumentOfPeriapsisDeg, mean: stockEeloo.meanAnomalyAtEpochRad, epoch: stockEeloo.epochS }
    : angularById.get(reference.bodyId)!
  return Object.freeze({
    bodyId: reference.bodyId,
    parentBodyId: reference.parentBodyId,
    sourceId: opmOrbitalElementsSource.id,
    elements: Object.freeze({
      semiMajorAxisM: reference.semiMajorAxisM,
      eccentricity: reference.eccentricity,
      inclinationDeg: reference.inclinationDeg,
      longitudeAscendingNodeDeg: reference.longitudeOfAscendingNodeDeg,
      argumentOfPeriapsisDeg: angular.argument,
      meanAnomalyAtEpochRad: angular.mean,
      epochS: angular.epoch,
      periodS: 2 * Math.PI * Math.sqrt(reference.semiMajorAxisM ** 3 / parentMu.get(reference.parentBodyId)!),
    }),
  })
}))
