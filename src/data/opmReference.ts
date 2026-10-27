import type { DataSource } from '../types/planner'

/** Official OPM 2.2.12 release, checked against the latest release on 2026-10-27. */
export const opmConfigCommit = 'ffedf02e23d2d620e1018d1467f5e485f7950fa0'
export const opmConfigBase = `https://github.com/Poodmund/Outer-Planets-Mod/blob/${opmConfigCommit}/GameData/OPM/KopernicusConfigs`
export const opmConfigSource: DataSource = {
  id: 'opm-official-configs',
  title: 'Official OPM 2.2.12 physical and orbital constants · pinned revision',
  url: `https://github.com/Poodmund/Outer-Planets-Mod/tree/${opmConfigCommit}/GameData/OPM/KopernicusConfigs`,
}

/** Stock KSP constants in SI units, corroborated by the pinned KSPTOT reference. */
export const opmCentralMu = 1172332794832490500
export const opmHomeReference = {
  radiusM: 600000,
  gravitationalParameter: 3531600000000,
  parkingAltitudeM: 80000,
  semiMajorAxisM: 13599840256,
} as const

export interface OpmReference {
  bodyId: string
  parentBodyId: string
  radiusM: number
  gravitationalParameter: number
  atmosphereHeightM: number
  semiMajorAxisM: number
  /** Actual source eccentricity, retained even when a nominal calculation circularizes it. */
  eccentricity: number
  /** Actual source inclination, in degrees; Thatmo is retrograde. */
  inclinationDeg: number
  sphereOfInfluenceM: number
  /** Planner-selected reference altitude, not an altitude supplied by the mod. */
  parkingAltitudeM: number
  /** Path relative to the pinned KopernicusConfigs directory. */
  configPath: string
}

const standardGravity = 9.80665
const muFromGravity = (radiusM: number, geeASL: number) => standardGravity * geeASL * radiusM ** 2

type ReferenceRow = Omit<OpmReference, 'sphereOfInfluenceM'> & { sphereOfInfluenceM?: number }

// Numerical facts are reorganized from the official configs, not copied source
// config code. Eeloo's patch inherits its stock radius and gravitational parameter.
// Parking altitudes are explicit planning choices; they clear current atmospheres.
const rows: readonly ReferenceRow[] = [
  { bodyId: 'opm:sarnus', parentBodyId: 'stock:kerbol', radiusM: 5300000, gravitationalParameter: muFromGravity(5300000, .298), atmosphereHeightM: 580000, semiMajorAxisM: 125798522368, eccentricity: .0534, inclinationDeg: 2.02, parkingAltitudeM: 600000, configPath: 'OuterPlanets/Sarnus.cfg' },
  { bodyId: 'opm:hale', parentBodyId: 'opm:sarnus', radiusM: 6000, gravitationalParameter: muFromGravity(6000, .0023), atmosphereHeightM: 0, semiMajorAxisM: 10488231, eccentricity: 0, inclinationDeg: 1, sphereOfInfluenceM: 41000, parkingAltitudeM: 8000, configPath: 'SarnusMoons/Hale.cfg' },
  { bodyId: 'opm:ovok', parentBodyId: 'opm:sarnus', radiusM: 26000, gravitationalParameter: muFromGravity(26000, .002), atmosphereHeightM: 0, semiMajorAxisM: 12169413, eccentricity: .01, inclinationDeg: 1.5, sphereOfInfluenceM: 94000, parkingAltitudeM: 10000, configPath: 'SarnusMoons/Ovok.cfg' },
  { bodyId: 'stock:eeloo', parentBodyId: 'opm:sarnus', radiusM: 210000, gravitationalParameter: 74410814527, atmosphereHeightM: 0, semiMajorAxisM: 19105978, eccentricity: .0034, inclinationDeg: 2.3, parkingAltitudeM: 10000, configPath: 'SarnusMoons/Eeloo.cfg' },
  { bodyId: 'opm:slate', parentBodyId: 'opm:sarnus', radiusM: 540000, gravitationalParameter: muFromGravity(540000, .692), atmosphereHeightM: 0, semiMajorAxisM: 42592946, eccentricity: .04, inclinationDeg: 2.3, parkingAltitudeM: 25000, configPath: 'SarnusMoons/Slate.cfg' },
  { bodyId: 'opm:tekto', parentBodyId: 'opm:sarnus', radiusM: 280000, gravitationalParameter: muFromGravity(280000, .2503), atmosphereHeightM: 95000, semiMajorAxisM: 97355304, eccentricity: .028, inclinationDeg: 9.4, parkingAltitudeM: 120000, configPath: 'SarnusMoons/Tekto.cfg' },
  { bodyId: 'opm:urlum', parentBodyId: 'stock:kerbol', radiusM: 2177000, gravitationalParameter: muFromGravity(2177000, .257), atmosphereHeightM: 325000, semiMajorAxisM: 254317012787, eccentricity: .045214674, inclinationDeg: .64, parkingAltitudeM: 350000, configPath: 'OuterPlanets/Urlum.cfg' },
  { bodyId: 'opm:polta', parentBodyId: 'opm:urlum', radiusM: 220000, gravitationalParameter: muFromGravity(220000, .19), atmosphereHeightM: 0, semiMajorAxisM: 11727895, eccentricity: .0015, inclinationDeg: 2.45, parkingAltitudeM: 15000, configPath: 'UrlumMoons/Polta.cfg' },
  { bodyId: 'opm:priax', parentBodyId: 'opm:urlum', radiusM: 74000, gravitationalParameter: muFromGravity(74000, .063), atmosphereHeightM: 0, semiMajorAxisM: 11727895, eccentricity: .0015, inclinationDeg: 2.5, parkingAltitudeM: 45000, configPath: 'UrlumMoons/Priax.cfg' },
  { bodyId: 'opm:wal', parentBodyId: 'opm:urlum', radiusM: 370000, gravitationalParameter: muFromGravity(370000, .37), atmosphereHeightM: 0, semiMajorAxisM: 67553668, eccentricity: .023, inclinationDeg: 1.9, parkingAltitudeM: 35000, configPath: 'UrlumMoons/Wal.cfg' },
  { bodyId: 'opm:tal', parentBodyId: 'opm:wal', radiusM: 22000, gravitationalParameter: muFromGravity(22000, .045), atmosphereHeightM: 0, semiMajorAxisM: 3109163, eccentricity: 0, inclinationDeg: 1.9, parkingAltitudeM: 20000, configPath: 'UrlumMoons/Tal.cfg' },
  { bodyId: 'opm:neidon', parentBodyId: 'stock:kerbol', radiusM: 2145000, gravitationalParameter: muFromGravity(2145000, .314), atmosphereHeightM: 260000, semiMajorAxisM: 409355191706, eccentricity: .0127567, inclinationDeg: 1.27, parkingAltitudeM: 280000, configPath: 'OuterPlanets/Neidon.cfg' },
  { bodyId: 'opm:thatmo', parentBodyId: 'opm:neidon', radiusM: 286000, gravitationalParameter: muFromGravity(286000, .232), atmosphereHeightM: 35000, semiMajorAxisM: 32300895, eccentricity: .00043, inclinationDeg: 161.1, parkingAltitudeM: 50000, configPath: 'NeidonMoons/Thatmo.cfg' },
  { bodyId: 'opm:nissee', parentBodyId: 'opm:neidon', radiusM: 30000, gravitationalParameter: muFromGravity(30000, .045), atmosphereHeightM: 0, semiMajorAxisM: 487743514, eccentricity: .72, inclinationDeg: 29.56, parkingAltitudeM: 10000, configPath: 'NeidonMoons/Nissee.cfg' },
  { bodyId: 'opm:plock', parentBodyId: 'stock:kerbol', radiusM: 189000, gravitationalParameter: muFromGravity(189000, .148), atmosphereHeightM: 0, semiMajorAxisM: 535833706086, eccentricity: .26, inclinationDeg: 6.15, parkingAltitudeM: 10000, configPath: 'OuterPlanets/Plock.cfg' },
  { bodyId: 'opm:karen', parentBodyId: 'opm:plock', radiusM: 85050, gravitationalParameter: muFromGravity(85050, .066), atmosphereHeightM: 0, semiMajorAxisM: 2457800, eccentricity: 0, inclinationDeg: 0, parkingAltitudeM: 10000, configPath: 'PlockMoons/Karen.cfg' },
]

const parentMu = new Map<string, number>([
  ['stock:kerbol', opmCentralMu],
  ...rows.map(row => [row.bodyId, row.gravitationalParameter] as const),
])

/** Explicit source overrides win; remaining SOIs use KSP's patched-conic relation. */
export const opmReferences: readonly OpmReference[] = rows.map(row => ({
  ...row,
  sphereOfInfluenceM: row.sphereOfInfluenceM ?? row.semiMajorAxisM * (row.gravitationalParameter / parentMu.get(row.parentBodyId)!) ** (2 / 5),
}))
