import type { DataSource } from '../types/planner'

export interface StockPhysicalReference {
  bodyId: string
  parentBodyId: string
  radiusM: number
  gravitationalParameter: number
  atmosphereHeightM: number
  semiMajorAxisM: number
  /** Source orbital elements; individual transfer models state how they use them. */
  eccentricity: number
  inclinationDeg: number
  longitudeOfAscendingNodeDeg: number
}

export const stockCentralMu = 1172332794832490500
export const stockPhysicsSource: DataSource = {
  id: 'stock-physical-reference',
  title: 'KSPTOT Stock physical and orbital constants · pinned revision',
  url: 'https://github.com/Arrowstar/ksptot/blob/9972b57398742263af12374652799db210395499/bodies.ini',
}

// Reorganized numerical facts from the pinned source, converted to SI units.
// This shared catalog serves both relay physics and direct-transfer estimates.
const rows: readonly (readonly [bodyId: string, parentBodyId: string, radiusM: number,
  gravitationalParameter: number, atmosphereHeightM: number, semiMajorAxisM: number,
  eccentricity: number, inclinationDeg: number, longitudeOfAscendingNodeDeg: number])[] = [
  ['stock:moho', 'stock:kerbol', 250000, 168609378655, 0, 5263138304, 0.200000003, 7, 70],
  ['stock:eve', 'stock:kerbol', 700000, 8171730229211, 90000, 9832684544, 0.01, 2.099999905, 15],
  ['stock:gilly', 'stock:eve', 13000, 8289450, 0, 31500000, 0.55, 12, 80],
  ['stock:kerbin', 'stock:kerbol', 600000, 3531600000000, 70000, 13599840256, 0, 0, 0],
  ['stock:mun', 'stock:kerbin', 200000, 65138397521, 0, 12000000, 0, 0, 0],
  ['stock:minmus', 'stock:kerbin', 60000, 1765800026, 0, 47000000, 0, 6, 78],
  ['stock:duna', 'stock:kerbol', 320000, 301363211975, 50000, 20726155264, 0.051, 0.06, 135.5],
  ['stock:ike', 'stock:duna', 130000, 18568368573, 0, 3200000, 0.03, 0.2, 0],
  ['stock:dres', 'stock:kerbol', 138000, 21484488600, 0, 40839348203, 0.145, 5, 280],
  ['stock:jool', 'stock:kerbol', 6000000, 282528004209995, 200000, 68773560320, 0.05, 1.304, 52],
  ['stock:laythe', 'stock:jool', 500000, 1962000029236, 50000, 27184000, 0, 0, 0],
  ['stock:vall', 'stock:jool', 300000, 207481499474, 0, 43152000, 0, 0, 0],
  ['stock:tylo', 'stock:jool', 600000, 2825280042100, 0, 68500000, 0, 0.025, 0],
  ['stock:bop', 'stock:jool', 65000, 2486834944, 0, 128500000, 0.235, 15, 10],
  ['stock:pol', 'stock:jool', 44000, 721702080, 0, 179890000, 0.17085, 4.25, 2],
  ['stock:eeloo', 'stock:kerbol', 210000, 74410814527, 0, 90118820000, 0.26, 6.15, 50],
]

export const stockPhysicalReferences: readonly StockPhysicalReference[] = rows.map(([
  bodyId, parentBodyId, radiusM, gravitationalParameter, atmosphereHeightM, semiMajorAxisM,
  eccentricity, inclinationDeg, longitudeOfAscendingNodeDeg,
]) => ({
  bodyId, parentBodyId, radiusM, gravitationalParameter, atmosphereHeightM, semiMajorAxisM,
  eccentricity, inclinationDeg, longitudeOfAscendingNodeDeg,
}))
