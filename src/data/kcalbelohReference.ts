import type { CelestialBody, DataSource } from '../types/planner'

export const kcalbelohConfigCommit = '1c61f4d3a9d72c76054855c4ee9330d3a3ee85a9'
export const kcalbelohConfigBase = `https://github.com/jcyuan06/Kcalbeloh-System/blob/${kcalbelohConfigCommit}/GameData/KcalbelohSystem`
export const kcalbelohConfigSource: DataSource = {
  id: 'kcalbeloh-config-1.1.8',
  title: 'Official Kcalbeloh System 1.1.8 configs and default compatibility settings',
  url: `https://github.com/jcyuan06/Kcalbeloh-System/tree/${kcalbelohConfigCommit}/GameData/KcalbelohSystem`,
}
export const kcalbelohMapSource: DataSource = {
  id: 'kcalbeloh-map-1.1.8',
  budgetType: 'reference',
  title: 'Official Kcalbeloh System Delta-V and transfer-window reference map',
  url: `https://github.com/jcyuan06/Kcalbeloh-System/blob/${kcalbelohConfigCommit}/Kcalbeloh%20dv%20and%20Transfer%20Windows%20Map.png`,
}

// Reorganized numerical/hierarchy facts from Jason Kerman's pinned release.
// No source config code, map artwork, or layout is bundled with the planner.
// The 30 physical bodies are accompanied by a virtual SimeSystem barycenter
// and two wormholes. The enum describes hierarchy: small stellar orbiters such
// as the asteroid Noi and Meiuqer use the same planet kind as other dwarf bodies.
export const kcalbelohBodies: readonly CelestialBody[] = [
  { id: 'kcalbeloh:kcalbeloh', name: 'Kcalbeloh', parentId: 'stock:kerbol', kind: 'black-hole', hasSurface: false, hasAtmosphere: false, supportsAtmosphericBraking: false, color: '#ada9d2' },
  { id: 'kcalbeloh:onrefni', name: 'Onrefni', parentId: 'kcalbeloh:kcalbeloh', kind: 'planet', hasSurface: true, hasAtmosphere: false, color: '#db7774' },
  { id: 'kcalbeloh:rouqea', name: 'Rouqea', parentId: 'kcalbeloh:kcalbeloh', kind: 'planet', hasSurface: true, hasAtmosphere: true, color: '#6cc9d1' },
  { id: 'kcalbeloh:iomena', name: 'Iomena', parentId: 'kcalbeloh:kcalbeloh', kind: 'planet', hasSurface: true, hasAtmosphere: true, color: '#80bfda' },
  { id: 'kcalbeloh:uleg', name: 'Uleg', parentId: 'kcalbeloh:kcalbeloh', kind: 'planet', hasSurface: true, hasAtmosphere: true, color: '#d7ccb1' },
  { id: 'kcalbeloh:maelg', name: 'Maelg', parentId: 'kcalbeloh:kcalbeloh', kind: 'star', hasSurface: false, hasAtmosphere: false, supportsAtmosphericBraking: false, color: '#f3ba71' },
  { id: 'kcalbeloh:mehtna', name: 'Mehtna', parentId: 'kcalbeloh:maelg', kind: 'planet', hasSurface: true, hasAtmosphere: true, color: '#dfb18a' },
  { id: 'kcalbeloh:meiuqer', name: 'Meiuqer', parentId: 'kcalbeloh:maelg', kind: 'planet', hasSurface: true, hasAtmosphere: false, color: '#bdab8f' },
  { id: 'kcalbeloh:sunorc', name: 'Sunorc', parentId: 'kcalbeloh:kcalbeloh', kind: 'star', hasSurface: false, hasAtmosphere: false, supportsAtmosphericBraking: false, color: '#efc779' },
  { id: 'kcalbeloh:sedah', name: 'Sedah', parentId: 'kcalbeloh:sunorc', kind: 'planet', hasSurface: false, hasAtmosphere: true, color: '#e0c68f' },
  { id: 'kcalbeloh:suluco', name: 'Suluco', parentId: 'kcalbeloh:sunorc', kind: 'planet', hasSurface: true, hasAtmosphere: true, color: '#83cfc8' },
  { id: 'kcalbeloh:tot', name: 'Tot', parentId: 'kcalbeloh:suluco', kind: 'moon', hasSurface: true, hasAtmosphere: false, color: '#dbdbcb' },
  { id: 'kcalbeloh:sera', name: 'Sera', parentId: 'kcalbeloh:sunorc', kind: 'planet', hasSurface: true, hasAtmosphere: true, color: '#ddac69' },
  { id: 'kcalbeloh:dipuc', name: 'Dipuc', parentId: 'kcalbeloh:sera', kind: 'moon', hasSurface: true, hasAtmosphere: false, color: '#c8b78c' },
  { id: 'kcalbeloh:noi', name: 'Noi', parentId: 'kcalbeloh:sunorc', kind: 'planet', hasSurface: true, hasAtmosphere: false, color: '#a6a4ad' },
  { id: 'kcalbeloh:simesystem', name: 'Simetra–Simeht system', parentId: 'kcalbeloh:sunorc', kind: 'barycenter', hasSurface: false, hasAtmosphere: false, supportsAtmosphericBraking: false, color: '#a6cad2' },
  { id: 'kcalbeloh:simetra', name: 'Simetra', parentId: 'kcalbeloh:simesystem', kind: 'planet', hasSurface: false, hasAtmosphere: true, color: '#a5d4dc' },
  { id: 'kcalbeloh:simeht', name: 'Simeht', parentId: 'kcalbeloh:simesystem', kind: 'planet', hasSurface: false, hasAtmosphere: true, color: '#86b8c9' },
  { id: 'kcalbeloh:noira', name: 'Noira', parentId: 'kcalbeloh:simesystem', kind: 'moon', hasSurface: true, hasAtmosphere: false, color: '#d19f7d' },
  { id: 'kcalbeloh:norihc', name: 'Norihc', parentId: 'kcalbeloh:simesystem', kind: 'moon', hasSurface: true, hasAtmosphere: true, color: '#a8d2bd' },
  { id: 'kcalbeloh:noyreg', name: 'Noyreg', parentId: 'kcalbeloh:simesystem', kind: 'moon', hasSurface: true, hasAtmosphere: true, color: '#7ec0b1' },
  { id: 'kcalbeloh:aralca', name: 'Aralc-A', parentId: 'kcalbeloh:kcalbeloh', kind: 'star', hasSurface: false, hasAtmosphere: false, supportsAtmosphericBraking: false, color: '#a9c8f4' },
  { id: 'kcalbeloh:aralcb', name: 'Aralc-B', parentId: 'kcalbeloh:aralca', kind: 'star', hasSurface: false, hasAtmosphere: false, supportsAtmosphericBraking: false, color: '#eeac83' },
  { id: 'kcalbeloh:anneheg', name: 'Anneheg', parentId: 'kcalbeloh:aralca', kind: 'planet', hasSurface: true, hasAtmosphere: false, color: '#d97972' },
  { id: 'kcalbeloh:arorua', name: 'Arorua', parentId: 'kcalbeloh:aralcb', kind: 'planet', hasSurface: true, hasAtmosphere: true, color: '#87b6c5' },
  { id: 'kcalbeloh:ahtpan', name: 'Ahtpan', parentId: 'kcalbeloh:aralca', kind: 'planet', hasSurface: true, hasAtmosphere: true, color: '#c5a281' },
  { id: 'kcalbeloh:anehta', name: 'Anehta', parentId: 'kcalbeloh:aralca', kind: 'planet', hasSurface: false, hasAtmosphere: true, color: '#b9c6ce' },
  { id: 'kcalbeloh:efil', name: 'Efil', parentId: 'kcalbeloh:anehta', kind: 'moon', hasSurface: true, hasAtmosphere: true, color: '#8ecdb4' },
  { id: 'kcalbeloh:elad', name: 'Elad', parentId: 'kcalbeloh:anehta', kind: 'moon', hasSurface: true, hasAtmosphere: false, color: '#c8bf9f' },
  { id: 'kcalbeloh:eulb', name: 'Eulb', parentId: 'kcalbeloh:anehta', kind: 'moon', hasSurface: true, hasAtmosphere: false, color: '#95b8d9' },
  { id: 'kcalbeloh:enots', name: 'Enots', parentId: 'kcalbeloh:anehta', kind: 'moon', hasSurface: true, hasAtmosphere: false, color: '#b5b0ab' },
  { id: 'kcalbeloh:wh3141a', name: 'WH-3141 A', parentId: 'stock:jool', kind: 'wormhole', hasSurface: false, hasAtmosphere: false, supportsAtmosphericBraking: false, color: '#a3d9ef' },
  { id: 'kcalbeloh:wh3141b', name: 'WH-3141 B', parentId: 'kcalbeloh:sera', kind: 'wormhole', hasSurface: false, hasAtmosphere: false, supportsAtmosphericBraking: false, color: '#b7b0ef' },
]

export interface KcalbelohRegion {
  id: string
  label: string
  bodyIds: string[]
}

// The home-side WH-3141 A belongs to the selected Stock/OPM region, so it is
// intentionally absent here. Its counterpart follows Sera in the Sunorc region.
export const kcalbelohRegions: readonly KcalbelohRegion[] = [
  { id: 'kcalbeloh', label: 'Kcalbeloh', bodyIds: [
    'kcalbeloh:kcalbeloh', 'kcalbeloh:onrefni', 'kcalbeloh:rouqea', 'kcalbeloh:iomena', 'kcalbeloh:uleg',
  ] },
  { id: 'maelg', label: 'Maelg', bodyIds: [
    'kcalbeloh:maelg', 'kcalbeloh:mehtna', 'kcalbeloh:meiuqer',
  ] },
  { id: 'sunorc', label: 'Sunorc', bodyIds: [
    'kcalbeloh:sunorc', 'kcalbeloh:sedah', 'kcalbeloh:suluco', 'kcalbeloh:tot', 'kcalbeloh:sera', 'kcalbeloh:dipuc', 'kcalbeloh:noi', 'kcalbeloh:simesystem', 'kcalbeloh:simetra', 'kcalbeloh:simeht', 'kcalbeloh:noira', 'kcalbeloh:norihc', 'kcalbeloh:noyreg', 'kcalbeloh:wh3141b',
  ] },
  { id: 'aralc', label: 'Aralc', bodyIds: [
    'kcalbeloh:aralca', 'kcalbeloh:aralcb', 'kcalbeloh:anneheg', 'kcalbeloh:arorua', 'kcalbeloh:ahtpan', 'kcalbeloh:anehta', 'kcalbeloh:efil', 'kcalbeloh:elad', 'kcalbeloh:eulb', 'kcalbeloh:enots',
  ] },
]

export interface KcalbelohBodyFact {
  bodyId: string
  radiusM: number
  /** Modeled atmosphere; stellar technical atmospheres are excluded. */
  atmosphereHeightM: number
  /** Path relative to the pinned KcalbelohSystem directory. */
  configPath: string
  semiMajorAxisM: number
  inclinationDeg: number
  eccentricity: number
}

// Stellar radii include the default RealisticStarSize multiplier of 0.241764
// from OtherFeatures/RealisticStarSize.cfg. No stellar altitude or burn is
// inferred from these facts. The wormhole A orbit below is the Stock default;
// its OPM patch changes the parent to Sarnus while keeping the same semi-major axis.
export const kcalbelohBodyFacts: readonly KcalbelohBodyFact[] = [
  { bodyId: 'kcalbeloh:kcalbeloh', radiusM: 2400000000, atmosphereHeightM: 0, configPath: 'Configs/Kcalbeloh.cfg', semiMajorAxisM: 271800000000000, inclinationDeg: 30, eccentricity: 0.001 },
  { bodyId: 'kcalbeloh:onrefni', radiusM: 320000, atmosphereHeightM: 0, configPath: 'Configs/Onrefni.cfg', semiMajorAxisM: 19560000000, inclinationDeg: 2.6742, eccentricity: 0.0462 },
  { bodyId: 'kcalbeloh:rouqea', radiusM: 1331340, atmosphereHeightM: 80000, configPath: 'Configs/Rouqea.cfg', semiMajorAxisM: 28462853000, inclinationDeg: 1.42, eccentricity: 0.04 },
  { bodyId: 'kcalbeloh:iomena', radiusM: 400000, atmosphereHeightM: 80000, configPath: 'Configs/Iomena.cfg', semiMajorAxisM: 42436000000, inclinationDeg: -0.95, eccentricity: 0.06 },
  { bodyId: 'kcalbeloh:uleg', radiusM: 510000, atmosphereHeightM: 46000, configPath: 'Configs/Uleg.cfg', semiMajorAxisM: 71650000000, inclinationDeg: 40, eccentricity: 0.3 },
  { bodyId: 'kcalbeloh:maelg', radiusM: 25584688 * .241764, atmosphereHeightM: 0, configPath: 'Configs/Maelg.cfg', semiMajorAxisM: 461250000000, inclinationDeg: -2, eccentricity: 0.02 },
  { bodyId: 'kcalbeloh:mehtna', radiusM: 460000, atmosphereHeightM: 73000, configPath: 'Configs/Mehtna.cfg', semiMajorAxisM: 541670000, inclinationDeg: -2.5, eccentricity: 0.06 },
  { bodyId: 'kcalbeloh:meiuqer', radiusM: 50000, atmosphereHeightM: 0, configPath: 'Configs/Meiuqer.cfg', semiMajorAxisM: 654260000, inclinationDeg: -12, eccentricity: 0.7 },
  { bodyId: 'kcalbeloh:sunorc', radiusM: 176841600 * .241764, atmosphereHeightM: 0, configPath: 'Configs/Sunorc.cfg', semiMajorAxisM: 1052000000000, inclinationDeg: 3, eccentricity: 0.05 },
  { bodyId: 'kcalbeloh:sedah', radiusM: 6700000, atmosphereHeightM: 291000, configPath: 'Configs/Sedah.cfg', semiMajorAxisM: 2450000000, inclinationDeg: -3, eccentricity: 0.05 },
  { bodyId: 'kcalbeloh:suluco', radiusM: 520000, atmosphereHeightM: 65000, configPath: 'Configs/Suluco.cfg', semiMajorAxisM: 5224670000, inclinationDeg: -3, eccentricity: 0.05 },
  { bodyId: 'kcalbeloh:tot', radiusM: 3250, atmosphereHeightM: 0, configPath: 'Configs/Tot.cfg', semiMajorAxisM: 5940000, inclinationDeg: 2, eccentricity: 0.15 },
  { bodyId: 'kcalbeloh:sera', radiusM: 690000, atmosphereHeightM: 71000, configPath: 'Configs/Sera.cfg', semiMajorAxisM: 9720000000, inclinationDeg: 3.23, eccentricity: 0.0025452830012913 },
  { bodyId: 'kcalbeloh:dipuc', radiusM: 180000, atmosphereHeightM: 0, configPath: 'Configs/Dipuc.cfg', semiMajorAxisM: 11500000, inclinationDeg: 8, eccentricity: 0.04 },
  { bodyId: 'kcalbeloh:noi', radiusM: 8300, atmosphereHeightM: 0, configPath: 'Configs/Noi.cfg', semiMajorAxisM: 18425000000.001, inclinationDeg: 1.74, eccentricity: 0.05 },
  { bodyId: 'kcalbeloh:simesystem', radiusM: 10000, atmosphereHeightM: 0, configPath: 'Configs/SimeSystem.cfg', semiMajorAxisM: 18425000000, inclinationDeg: 1.74, eccentricity: 0.05 },
  { bodyId: 'kcalbeloh:simetra', radiusM: 4800000, atmosphereHeightM: 190000, configPath: 'Configs/Simetra.cfg', semiMajorAxisM: 10360079.11088615, inclinationDeg: -4, eccentricity: 0.003 },
  { bodyId: 'kcalbeloh:simeht', radiusM: 4000000, atmosphereHeightM: 177000, configPath: 'Configs/Simeht.cfg', semiMajorAxisM: 17062420.88911386, inclinationDeg: -4, eccentricity: 0.003 },
  { bodyId: 'kcalbeloh:noira', radiusM: 74000, atmosphereHeightM: 0, configPath: 'Configs/Noira.cfg', semiMajorAxisM: 57982500, inclinationDeg: 168, eccentricity: 0.03 },
  { bodyId: 'kcalbeloh:norihc', radiusM: 336000, atmosphereHeightM: 42000, configPath: 'Configs/Norihc.cfg', semiMajorAxisM: 124421200, inclinationDeg: 1.5, eccentricity: 0.04 },
  { bodyId: 'kcalbeloh:noyreg', radiusM: 500000, atmosphereHeightM: 96000, configPath: 'Configs/Noyreg.cfg', semiMajorAxisM: 215820000, inclinationDeg: 0.4, eccentricity: 0.04 },
  { bodyId: 'kcalbeloh:aralca', radiusM: 466956000 * .241764, atmosphereHeightM: 0, configPath: 'Configs/Aralc-A.cfg', semiMajorAxisM: 2460000000000, inclinationDeg: -2, eccentricity: 0.02 },
  { bodyId: 'kcalbeloh:aralcb', radiusM: 94437600 * .241764, atmosphereHeightM: 0, configPath: 'Configs/Aralc-B.cfg', semiMajorAxisM: 13166710000, inclinationDeg: 1.2, eccentricity: 0.002 },
  { bodyId: 'kcalbeloh:anneheg', radiusM: 508000, atmosphereHeightM: 0, configPath: 'Configs/Anneheg.cfg', semiMajorAxisM: 4573210000, inclinationDeg: -2, eccentricity: 0.0216 },
  { bodyId: 'kcalbeloh:arorua', radiusM: 720000, atmosphereHeightM: 86000, configPath: 'Configs/Arorua.cfg', semiMajorAxisM: 1834250000, inclinationDeg: 5.000000037252903, eccentricity: 0.0025452830012913 },
  { bodyId: 'kcalbeloh:ahtpan', radiusM: 380000, atmosphereHeightM: 65000, configPath: 'Configs/Ahtpan.cfg', semiMajorAxisM: 41797680000, inclinationDeg: 3, eccentricity: 0.0545 },
  { bodyId: 'kcalbeloh:anehta', radiusM: 8000000, atmosphereHeightM: 225000, configPath: 'Configs/Anehta.cfg', semiMajorAxisM: 69524780000, inclinationDeg: 1.25, eccentricity: 0.04 },
  { bodyId: 'kcalbeloh:efil', radiusM: 450000, atmosphereHeightM: 72000, configPath: 'Configs/Efil.cfg', semiMajorAxisM: 36466000, inclinationDeg: -3, eccentricity: 0.035 },
  { bodyId: 'kcalbeloh:elad', radiusM: 520000, atmosphereHeightM: 0, configPath: 'Configs/Elad.cfg', semiMajorAxisM: 142429000, inclinationDeg: -0.04, eccentricity: 0.02 },
  { bodyId: 'kcalbeloh:eulb', radiusM: 310000, atmosphereHeightM: 0, configPath: 'Configs/Eulb.cfg', semiMajorAxisM: 67845000, inclinationDeg: -3, eccentricity: 0.08 },
  { bodyId: 'kcalbeloh:enots', radiusM: 18000, atmosphereHeightM: 0, configPath: 'Configs/Enots.cfg', semiMajorAxisM: 14510625, inclinationDeg: 3, eccentricity: 0.002 },
  { bodyId: 'kcalbeloh:wh3141a', radiusM: 10000, atmosphereHeightM: 0, configPath: 'OtherFeatures/Wormholes/WH-3141-A.cfg', semiMajorAxisM: 331210000, inclinationDeg: 0, eccentricity: 0 },
  { bodyId: 'kcalbeloh:wh3141b', radiusM: 10000, atmosphereHeightM: 0, configPath: 'OtherFeatures/Wormholes/WH-3141-B.cfg', semiMajorAxisM: 24153600, inclinationDeg: 1, eccentricity: 0.032 },
]
