import type { CelestialBody, DataSource } from '../types/planner'
import { opmReferences } from './opmReference'
import { kcalbelohConfigSource } from './kcalbelohReference'
import { kcalbelohGravitySource, kcalbelohPhysicalReferences, kcalbelohSoiSource } from './kcalbelohPhysics'
import { stockPhysicalReferences } from './stockPhysics'
import { rssPhysicalReferences, rssPhysicsSource } from './rssPhysics'

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
  /** Effective CommNet power in meters. */
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
  { id: 'commnet-rss-bodies', title: 'Official RSS body constants and equatorial-radius patches · pinned revision', url: rssPhysicsSource.url },
  { id: 'commnet-kcalbeloh-bodies', title: 'Official Kcalbeloh 1.1.8 body constants · default 1× configuration', url: kcalbelohConfigSource.url },
  kcalbelohGravitySource,
  kcalbelohSoiSource,
  { id: 'commnet-stock-antennas', title: 'Stock CommNet antenna and DSN powers · pinned community catalog', url: 'https://github.com/IgaguriMK/ksp-commnet-calculator-core/blob/2ee8d9af84f2c0bb9d4287b9d80123dfba2efd80/resources/antennas.yaml' },
  { id: 'commnet-normal-settings', title: 'Stock Normal CommNet settings · LunaMultiplayer reference', url: 'https://github.com/LunaMultiplayer/LunaMultiplayer/blob/b3b9efce0cb6d18d5ae3723eb3aeb0b3f90eccbc/Server/Settings/Definition/GameplaySettingsDefinition.cs' },
  { id: 'commnet-antenna-combination', title: 'Stock CommNet antenna combination semantics · Kerbalism adapter', url: 'https://github.com/Kerbalism/Kerbalism4/blob/bc3d7ccbbe5f4b20455b3de7d25b6e9812f8672f/src/Kerbalism/Comms/CommHandlerEditorCommNet.cs' },
]

// Numbers are reorganized reference facts, not copied config code or artwork.
// Every length is meters and every gravitational parameter is m³/s².

type PhysicalRow = readonly [bodyId: string, parentBodyId: string, radiusM: number,
  gravitationalParameter: number, atmosphereHeightM: number, semiMajorAxisM: number,
  sphereOfInfluenceOverrideM?: number]

const stockRows: readonly PhysicalRow[] = stockPhysicalReferences.map(reference => [
  reference.bodyId, reference.parentBodyId, reference.radiusM,
  reference.gravitationalParameter, reference.atmosphereHeightM, reference.semiMajorAxisM,
])

// Share the pinned OPM physical constants with the orbital budget model.
const opmRows: readonly PhysicalRow[] = opmReferences.map(reference => [
  reference.bodyId, reference.parentBodyId, reference.radiusM,
  reference.gravitationalParameter, reference.atmosphereHeightM,
  reference.semiMajorAxisM, reference.sphereOfInfluenceM,
])

// RSS references separately apply their equatorial-radius and SOI patches.
// OPM Eeloo inherits the stock radius/gravity but has a different parent and SOI.
const gravitationalParameters = new Map<string, number>([
  ['stock:kerbol', 1172332794832490500],
  ...[...stockRows, ...opmRows].map(row => [row[0], row[3]] as const),
])

function bodyPreset(row: PhysicalRow, sourceId: string): RelayBodyPreset {
  const [bodyId, parentBodyId, radiusM, gravitationalParameter, atmosphereHeightM, semiMajorAxisM, override] = row
  const laplaceSoiM = semiMajorAxisM * (gravitationalParameter / gravitationalParameters.get(parentBodyId)!) ** (2 / 5)
  const sphereOfInfluenceM = override ?? laplaceSoiM
  return { bodyId, parentBodyId, radiusM, gravitationalParameter, atmosphereHeightM, sphereOfInfluenceM, sourceId }
}

export const relayBodyPresets: readonly RelayBodyPreset[] = [
  ...stockRows.map(row => bodyPreset(row, 'commnet-stock-bodies')),
  ...opmRows.map(row => bodyPreset(row, 'commnet-opm-bodies')),
  ...rssPhysicalReferences.map(({ bodyId, parentBodyId, radiusM, gravitationalParameter, atmosphereHeightM, sphereOfInfluenceM }) => ({
    bodyId, parentBodyId, radiusM, gravitationalParameter, atmosphereHeightM, sphereOfInfluenceM,
    sourceId: 'commnet-rss-bodies',
  })),
  ...kcalbelohPhysicalReferences.map(reference => ({
    bodyId: reference.bodyId,
    parentBodyId: reference.parentBodyId,
    radiusM: reference.radiusM,
    gravitationalParameter: reference.gravitationalParameter,
    atmosphereHeightM: reference.atmosphereHeightM,
    sphereOfInfluenceM: reference.sphereOfInfluenceM,
    sourceId: 'commnet-kcalbeloh-bodies',
  })),
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
