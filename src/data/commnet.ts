import type { CelestialBody, DataSource } from '../types/planner'

export interface RelayBodyPreset {
  bodyId: string
  /** Parent context distinguishes stock Eeloo from its OPM orbit. */
  parentBodyId?: string | null
  radiusM: number
  gravitationalParameter: number
  atmosphereHeightM: number
  sphereOfInfluenceM?: number
  sourceId: string
}

export interface CommNetPowerPreset {
  id: string
  name: string
  /** Stock CommNet power in meters. */
  power: number
}

export interface CommNetAntenna extends CommNetPowerPreset {
  combinable: boolean
  combinabilityExponent: number
  relay: boolean
}

export const commNetSources: readonly DataSource[] = [
  { id: 'commnet-stock-bodies', title: 'KSP Trajectory Optimization Tool stock body constants · pinned revision', url: 'https://github.com/Arrowstar/ksptot/blob/9972b57398742263af12374652799db210395499/bodies.ini' },
  { id: 'commnet-opm-bodies', title: 'Official OPM body constants · pinned revision', url: 'https://github.com/Poodmund/Outer-Planets-Mod/tree/ffedf02e23d2d620e1018d1467f5e485f7950fa0/GameData/OPM/KopernicusConfigs' },
  { id: 'commnet-rss-bodies', title: 'Official RSS body constants and equatorial-radius patches · pinned revision', url: 'https://github.com/KSP-RO/RealSolarSystem/tree/75139b961567f4dab61af83fe162a7e52026558b/GameData/RealSolarSystem/RSSKopernicus' },
  { id: 'commnet-stock-antennas', title: 'Stock CommNet antenna and DSN powers · pinned community catalog', url: 'https://github.com/IgaguriMK/ksp-commnet-calculator-core/blob/2ee8d9af84f2c0bb9d4287b9d80123dfba2efd80/resources/antennas.yaml' },
  { id: 'commnet-normal-settings', title: 'Stock Normal CommNet settings · LunaMultiplayer reference', url: 'https://github.com/LunaMultiplayer/LunaMultiplayer/blob/b3b9efce0cb6d18d5ae3723eb3aeb0b3f90eccbc/Server/Settings/Definition/GameplaySettingsDefinition.cs' },
  { id: 'commnet-antenna-combination', title: 'Stock CommNet antenna combination semantics · Kerbalism adapter', url: 'https://github.com/Kerbalism/Kerbalism4/blob/bc3d7ccbbe5f4b20455b3de7d25b6e9812f8672f/src/Kerbalism/Comms/CommHandlerEditorCommNet.cs' },
]

// Numbers are reorganized reference facts, not copied config code or artwork.
// Every length is meters and every gravitational parameter is m³/s².
// For OPM, μ = g₀ × geeASL × R², with standard gravity g₀ = 9.80665 m/s².
const surfaceGravityMu = (geeASL: number, radiusM: number) => 9.80665 * geeASL * radiusM ** 2

type PhysicalRow = readonly [bodyId: string, parentBodyId: string, radiusM: number,
  gravitationalParameter: number, atmosphereHeightM: number, semiMajorAxisM: number,
  sphereOfInfluenceOverrideM?: number]

const stockRows: readonly PhysicalRow[] = [
  ['stock:moho', 'stock:kerbol', 250000, 168609378655, 0, 5263138304],
  ['stock:eve', 'stock:kerbol', 700000, 8171730229211, 90000, 9832684544],
  ['stock:gilly', 'stock:eve', 13000, 8289450, 0, 31500000],
  ['stock:kerbin', 'stock:kerbol', 600000, 3531600000000, 70000, 13599840256],
  ['stock:mun', 'stock:kerbin', 200000, 65138397521, 0, 12000000],
  ['stock:minmus', 'stock:kerbin', 60000, 1765800026, 0, 47000000],
  ['stock:duna', 'stock:kerbol', 320000, 301363211975, 50000, 20726155264],
  ['stock:ike', 'stock:duna', 130000, 18568368573, 0, 3200000],
  ['stock:dres', 'stock:kerbol', 138000, 21484488600, 0, 40839348203],
  ['stock:jool', 'stock:kerbol', 6000000, 282528004209995, 200000, 68773560320],
  ['stock:laythe', 'stock:jool', 500000, 1962000029236, 50000, 27184000],
  ['stock:vall', 'stock:jool', 300000, 207481499474, 0, 43152000],
  ['stock:tylo', 'stock:jool', 600000, 2825280042100, 0, 68500000],
  ['stock:bop', 'stock:jool', 65000, 2486834944, 0, 128500000],
  ['stock:pol', 'stock:jool', 44000, 721702080, 0, 179890000],
  ['stock:eeloo', 'stock:kerbol', 210000, 74410814527, 0, 90118820000],
]

const opmRows: readonly PhysicalRow[] = [
  ['stock:eeloo', 'opm:sarnus', 210000, 74410814527, 0, 19105978],
  ['opm:hale', 'opm:sarnus', 6000, surfaceGravityMu(0.0023, 6000), 0, 10488231, 41000],
  ['opm:karen', 'opm:plock', 85050, surfaceGravityMu(0.066, 85050), 0, 2457800],
  ['opm:neidon', 'stock:kerbol', 2145000, surfaceGravityMu(0.314, 2145000), 260000, 409355191706],
  ['opm:nissee', 'opm:neidon', 30000, surfaceGravityMu(0.045, 30000), 0, 487743514],
  ['opm:ovok', 'opm:sarnus', 26000, surfaceGravityMu(0.002, 26000), 0, 12169413, 94000],
  ['opm:plock', 'stock:kerbol', 189000, surfaceGravityMu(0.148, 189000), 0, 535833706086],
  ['opm:polta', 'opm:urlum', 220000, surfaceGravityMu(0.19, 220000), 0, 11727895],
  ['opm:priax', 'opm:urlum', 74000, surfaceGravityMu(0.063, 74000), 0, 11727895],
  ['opm:sarnus', 'stock:kerbol', 5300000, surfaceGravityMu(0.298, 5300000), 580000, 125798522368],
  ['opm:slate', 'opm:sarnus', 540000, surfaceGravityMu(0.692, 540000), 0, 42592946],
  ['opm:tal', 'opm:wal', 22000, surfaceGravityMu(0.045, 22000), 0, 3109163],
  ['opm:tekto', 'opm:sarnus', 280000, surfaceGravityMu(0.2503, 280000), 95000, 97355304],
  ['opm:thatmo', 'opm:neidon', 286000, surfaceGravityMu(0.232, 286000), 35000, 32300895],
  ['opm:urlum', 'stock:kerbol', 2177000, surfaceGravityMu(0.257, 2177000), 325000, 254317012787],
  ['opm:wal', 'opm:urlum', 370000, surfaceGravityMu(0.37, 370000), 0, 67553668],
]

const rssRows: readonly PhysicalRow[] = [
  ['rss:ariel', 'rss:uranus', 578900, 83463444317.70477, 0, 190944364.477622],
  ['rss:callisto', 'rss:jupiter', 2409300, 7179289361397.27, 0, 1883812366.573522],
  ['rss:ceres', 'rss:sun', 473000, 62632500000, 0, 413738762313.173],
  ['rss:charon', 'rss:pluto', 603500, 105879988860.1881, 0, 19596193.83540397],
  ['rss:deimos', 'rss:mars', 5456, 96155.69648120314, 0, 23458112.01759387, 45000],
  ['rss:dione', 'rss:saturn', 561400, 73116366487.32, 0, 377650651.501709],
  ['rss:earth', 'rss:sun', 6371000, 398600435436096, 140000, 149598261150.4425],
  ['rss:enceladus', 'rss:saturn', 252100, 7211454165.826, 0, 238413699.4838728],
  ['rss:europa', 'rss:jupiter', 1550800, 3202738774922.892, 0, 671253637.5417169],
  ['rss:ganymede', 'rss:jupiter', 2624100, 9887834453334.145, 0, 1070823468.894524],
  ['rss:iapetus', 'rss:saturn', 734500, 120512088703.3, 0, 3560162593.02297],
  ['rss:io', 'rss:jupiter', 1811300, 5959916033410.404, 0, 422018294.5236953],
  ['rss:jupiter', 'rss:sun', 69373000 * 1.02261446696514, 126686534921800800, 1550000, 778188938659.7554],
  ['rss:mars', 'rss:sun', 3375800, 42828373620699.09, 125000, 227949699961.9763],
  ['rss:mercury', 'rss:sun', 2439700, 22031780000000.02, 0, 57908973645.88802],
  ['rss:mimas', 'rss:saturn', 198200, 2503524000, 0, 186009285.922049, 396000],
  ['rss:miranda', 'rss:uranus', 235700, 4319516899.2321, 0, 129880047.634175],
  ['rss:moon', 'rss:earth', 1737100, 4902800066163.796, 0, 384308437.7707066],
  ['rss:neptune', 'rss:sun', 24085000 * 1.00576720006498, 6835099502439672, 1250000, 4497455832811.736],
  ['rss:oberon', 'rss:uranus', 761400, 205323430253.5623, 0, 583435328.340603],
  ['rss:phobos', 'rss:mars', 7250, 708754.6066894452, 0, 9378492.209088314, 47000],
  ['rss:pluto', 'rss:sun', 1187000, 869613817760.8748, 110000, 5845670624078.223],
  ['rss:rhea', 'rss:saturn', 763800, 153942464353.5, 0, 527212645.707199],
  ['rss:saturn', 'rss:sun', 57216000 * 1.03496359390026, 37931207498652240, 2000000, 1424838758613.269],
  ['rss:tethys', 'rss:saturn', 531100, 41211077826.41, 0, 294973462.3804425],
  ['rss:titan', 'rss:saturn', 2573300, 8977864800000, 600000, 1221966238.511425],
  ['rss:titania', 'rss:uranus', 788900, 226943700374.1248, 0, 436292682.967703],
  ['rss:triton', 'rss:neptune', 1353400, 1427598140725.034, 110000, 354767243.5406647],
  ['rss:umbriel', 'rss:uranus', 584700, 85093380944.89388, 0, 265992360.127656],
  ['rss:uranus', 'rss:sun', 24702000 * 1.00776752622033, 5793951322279009, 1400000, 2866832853163.975],
  ['rss:venus', 'rss:sun', 6049000, 324858592000000.06, 145000, 108209548790.4671],
  ['rss:vesta', 'rss:sun', 262700, 17288244969.3, 0, 353346223803.158],
]

// RSS giant radii above include their *_Oblate.cfg multipliers. The planner
// uses a sphere at that equatorial datum; it does not simulate oblateness.
// Titan's later gravParameter assignment is authoritative in the pinned config.
// OPM Eeloo inherits the stock radius/gravity but has a different parent and SOI.
const gravitationalParameters = new Map<string, number>([
  ['stock:kerbol', 1172332794832490500],
  // Parse the source decimal explicitly at JavaScript's double precision.
  ['rss:sun', Number('1.3271244004193938e20')],
  ...[...stockRows, ...opmRows, ...rssRows].map(row => [row[0], row[3]] as const),
])

function bodyPreset(row: PhysicalRow, sourceId: string): RelayBodyPreset {
  const [bodyId, parentBodyId, radiusM, gravitationalParameter, atmosphereHeightM, semiMajorAxisM, override] = row
  // Standard patched-conic SOI: a × (μbody / μparent)^(2/5). Explicit official
  // overrides (Hale, Ovok, Phobos, Deimos, Mimas) take priority.
  const sphereOfInfluenceM = override ?? semiMajorAxisM * (gravitationalParameter / gravitationalParameters.get(parentBodyId)!) ** (2 / 5)
  return { bodyId, parentBodyId, radiusM, gravitationalParameter, atmosphereHeightM, sphereOfInfluenceM, sourceId }
}

export const relayBodyPresets: readonly RelayBodyPreset[] = [
  ...stockRows.map(row => bodyPreset(row, 'commnet-stock-bodies')),
  ...opmRows.map(row => bodyPreset(row, 'commnet-opm-bodies')),
  ...rssRows.map(row => bodyPreset(row, 'commnet-rss-bodies')),
]

/** Match known state identities and parent context; unknown bodies need manual physics. */
export function findRelayBodyPreset(body: CelestialBody): RelayBodyPreset | undefined {
  return relayBodyPresets.find(preset => preset.bodyId === body.id
    && (preset.parentBodyId === undefined || preset.parentBodyId === body.parentId))
}

/*! Stock antenna catalog attribution: Copyright 2019 Igaguri.
 * Licensed under the MIT License; see docs/RELAYS.md for the retained notice.
 * Numerical antenna/DSN facts are reorganized here without source implementation.
 */
export const relayAntennas: readonly CommNetAntenna[] = [
  { id: 'hg-5', name: 'HG-5', power: 5_000_000, combinable: true, combinabilityExponent: .75, relay: true },
  { id: 'ra-2', name: 'RA-2', power: 2_000_000_000, combinable: true, combinabilityExponent: .75, relay: true },
  { id: 'ra-15', name: 'RA-15', power: 15_000_000_000, combinable: true, combinabilityExponent: .75, relay: true },
  { id: 'ra-100', name: 'RA-100', power: 100_000_000_000, combinable: true, combinabilityExponent: .75, relay: true },
]

export const clientAntennas: readonly CommNetAntenna[] = [
  { id: 'internal', name: 'Internal antenna', power: 5_000, combinable: false, combinabilityExponent: 0, relay: false },
  { id: 'communotron-16', name: 'Communotron 16', power: 500_000, combinable: true, combinabilityExponent: 1, relay: false },
  { id: 'communotron-16-s', name: 'Communotron 16-S', power: 500_000, combinable: false, combinabilityExponent: 0, relay: false },
  { id: 'dts-m1', name: 'Communotron DTS-M1', power: 2_000_000_000, combinable: true, combinabilityExponent: .75, relay: false },
  { id: 'hg-55', name: 'Communotron HG-55', power: 15_000_000_000, combinable: true, combinabilityExponent: .75, relay: false },
  { id: 'communotron-88-88', name: 'Communotron 88-88', power: 100_000_000_000, combinable: true, combinabilityExponent: .75, relay: false },
]

/** A receiving vessel may use either direct or relay-capable antennas. */
export const vesselAntennas: readonly CommNetAntenna[] = [...clientAntennas, ...relayAntennas]

export const dsnLevels: readonly CommNetPowerPreset[] = [
  { id: 'dsn1', name: 'DSN level 1', power: 2_000_000_000 },
  { id: 'dsn2', name: 'DSN level 2', power: 50_000_000_000 },
  { id: 'dsn3', name: 'DSN level 3', power: 250_000_000_000 },
]
