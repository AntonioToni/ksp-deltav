import type { DataSource } from '../types/planner'
import { kerbalismRateSources } from './kerbalismRates'
import {
  clientAntennas, commNetSources, dsnLevels, relayAntennas,
  type CommNetAntenna, type CommNetPowerPreset,
} from './commnet'

type KerbalismRadioProfileId = 'kerbalism' | 'rss-kerbalism' | 'rss-cbk-kerbalism'
export type RadioProfileId = 'stock' | 'rss' | 'rss-cbk' | KerbalismRadioProfileId

export interface CommNetRadioProfile {
  readonly id: RadioProfileId
  readonly name: string
  readonly description: string
  readonly relayAntennas: readonly CommNetAntenna[]
  readonly clientAntennas: readonly CommNetAntenna[]
  readonly vesselAntennas: readonly CommNetAntenna[]
  readonly dsnLevels: readonly CommNetPowerPreset[]
  readonly normalOcclusion: Readonly<{ atmospheric: number; vacuum: number }>
  readonly normalOcclusionLabel: string
  readonly kerbalism?: boolean
  readonly sources: readonly DataSource[]
}

const rssRevision = '75139b961567f4dab61af83fe162a7e52026558b'
const rssRangesSource: DataSource = Object.freeze({
  id: 'commnet-rss-ranges',
  title: 'Official RSS antenna-power and conditional CustomBarnKit DSN patch · pinned revision',
  url: `https://github.com/KSP-RO/RealSolarSystem/blob/${rssRevision}/GameData/RealSolarSystem/DSN_Ranges.cfg`,
})
const rssOcclusionSource: DataSource = Object.freeze({
  id: 'commnet-rss-occlusion',
  title: 'Official RSS Normal CommNet occlusion defaults · pinned revision',
  url: `https://github.com/KSP-RO/RealSolarSystem/blob/${rssRevision}/Source/CommNetFixer.cs`,
})

const stockRadioSources = Object.freeze(commNetSources
  .filter(source => ['commnet-stock-antennas', 'commnet-normal-settings', 'commnet-antenna-combination'].includes(source.id))
  .map(source => Object.freeze({ ...source })))
const rssRadioSources = Object.freeze([
  ...stockRadioSources.filter(source => source.id !== 'commnet-normal-settings'),
  rssRangesSource, rssOcclusionSource,
])

const kerbalismRevision = '39f9f43afe8b4f77aff0086c3866044287694475'
const kerbalismSourceBase = `https://github.com/Kerbalism/Kerbalism/blob/${kerbalismRevision}`
const kerbalismRadioSources: readonly DataSource[] = Object.freeze([
  Object.freeze({
    id: 'commnet-kerbalism-antenna',
    title: 'Official Kerbalism 3.44 Communotron 8 antenna · pinned revision',
    url: `${kerbalismSourceBase}/GameData/KerbalismConfig/Parts/ShortAntenna/kerbalism-antenna.cfg`,
  }),
  Object.freeze({
    id: 'commnet-kerbalism-commnet',
    title: 'Official Kerbalism 3.44 CommNet link and science-rate adapter · pinned revision',
    url: `${kerbalismSourceBase}/src/Kerbalism/Comms/CommHandlerCommNetBase.cs`,
  }),
  Object.freeze({
    id: 'commnet-kerbalism-signal',
    title: 'Official Kerbalism 3.44 stock signal curve and science-rate damping · pinned revision',
    url: `${kerbalismSourceBase}/src/Kerbalism/Sim.cs`,
  }),
])

const kerbalismShortAntenna: Readonly<CommNetAntenna> = Object.freeze({
  id: 'communotron-8', name: 'Communotron 8', power: 250_000,
  combinable: true, combinabilityExponent: 1, relay: false,
})

function antennaCatalog(antennas: readonly CommNetAntenna[], powerScale: number): readonly CommNetAntenna[] {
  // Keep part identities and combination rules while storing final effective powers.
  return Object.freeze(antennas.map(antenna => Object.freeze({ ...antenna, power: antenna.power * powerScale })))
}

function powerCatalog(presets: readonly CommNetPowerPreset[]): readonly CommNetPowerPreset[] {
  return Object.freeze(presets.map(preset => Object.freeze({ ...preset })))
}

const stockRelayAntennas = antennaCatalog(relayAntennas, 1)
const stockClientAntennas = antennaCatalog(clientAntennas, 1)
const stockDsnLevels = powerCatalog(dsnLevels)
const rssRelayAntennas = antennaCatalog(relayAntennas, 20)
const rssClientAntennas = antennaCatalog(clientAntennas, 20)
const rssVesselAntennas = Object.freeze([...rssClientAntennas, ...rssRelayAntennas])
const rssNormalOcclusion = Object.freeze({ atmospheric: 1, vacuum: 1 })

const baseProfilesById: Readonly<Record<'stock' | 'rss' | 'rss-cbk', CommNetRadioProfile>> = Object.freeze({
  stock: Object.freeze({
    id: 'stock',
    name: 'Stock CommNet',
    description: 'Stock antenna and ground-station powers, with Normal difficulty settings for body blocking.',
    relayAntennas: stockRelayAntennas,
    clientAntennas: stockClientAntennas,
    vesselAntennas: Object.freeze([...stockClientAntennas, ...stockRelayAntennas]),
    dsnLevels: stockDsnLevels,
    normalOcclusion: Object.freeze({ atmospheric: .75, vacuum: .9 }),
    normalOcclusionLabel: 'KSP normal',
    sources: stockRadioSources,
  }),
  rss: Object.freeze({
    id: 'rss',
    name: 'RSS CommNet (without CBK)',
    description: 'RSS increases stock antenna powers by 20×. Ground-station powers stay stock when CustomBarnKit is absent.',
    relayAntennas: rssRelayAntennas,
    clientAntennas: rssClientAntennas,
    vesselAntennas: rssVesselAntennas,
    dsnLevels: stockDsnLevels,
    normalOcclusion: rssNormalOcclusion,
    normalOcclusionLabel: 'RSS default (1.0)',
    sources: rssRadioSources,
  }),
  'rss-cbk': Object.freeze({
    id: 'rss-cbk',
    name: 'RSS + CustomBarnKit',
    description: 'RSS antenna powers with the stronger ground stations supplied by the RSS CustomBarnKit patch.',
    relayAntennas: rssRelayAntennas,
    clientAntennas: rssClientAntennas,
    vesselAntennas: rssVesselAntennas,
    dsnLevels: powerCatalog([
      { id: 'dsn1', name: 'DSN level 1', power: 5_000_000_000 },
      { id: 'dsn2', name: 'DSN level 2', power: 500_000_000_000 },
      { id: 'dsn3', name: 'DSN level 3', power: 50_000_000_000_000 },
    ]),
    normalOcclusion: rssNormalOcclusion,
    normalOcclusionLabel: 'RSS default (1.0)',
    sources: rssRadioSources,
  }),
})

function withKerbalism(
  base: CommNetRadioProfile,
  id: KerbalismRadioProfileId,
  name: string,
  powerScale: number,
): CommNetRadioProfile {
  // RSS patches every ModuleDataTransmitter, including Kerbalism's added part.
  // Base catalogs already contain final powers; scale only the added antenna.
  const shortAntenna = Object.freeze({ ...kerbalismShortAntenna, power: kerbalismShortAntenna.power * powerScale })
  const clients = Object.freeze([...base.clientAntennas, shortAntenna])
  const powers = base.id === 'stock' ? 'Stock antenna and ground-station powers'
    : base.id === 'rss' ? 'RSS 20× antenna powers; stock ground stations' : 'RSS 20× antenna powers; CustomBarnKit ground stations'
  return Object.freeze({
    ...base, id, name, kerbalism: true,
    description: `${powers}. Adds Communotron 8 and Kerbalism signal damping for science-rate estimates.`,
    clientAntennas: clients,
    vesselAntennas: Object.freeze([...clients, ...base.relayAntennas]),
    sources: Object.freeze([
      ...base.sources.filter(source => source.id !== 'commnet-antenna-combination'),
      ...kerbalismRadioSources,
      ...kerbalismRateSources,
    ]),
  })
}

const profilesById: Readonly<Record<RadioProfileId, CommNetRadioProfile>> = Object.freeze({
  ...baseProfilesById,
  kerbalism: withKerbalism(baseProfilesById.stock, 'kerbalism', 'Kerbalism + CommNet', 1),
  'rss-kerbalism': withKerbalism(baseProfilesById.rss, 'rss-kerbalism', 'Kerbalism + RSS', 20),
  'rss-cbk-kerbalism': withKerbalism(baseProfilesById['rss-cbk'], 'rss-cbk-kerbalism', 'Kerbalism + RSS + CBK', 20),
})

export const radioProfileOptions: readonly CommNetRadioProfile[] = Object.freeze([
  profilesById.stock, profilesById.rss, profilesById['rss-cbk'],
  profilesById.kerbalism, profilesById['rss-kerbalism'], profilesById['rss-cbk-kerbalism'],
])

export function getRadioProfile(id: RadioProfileId): CommNetRadioProfile {
  return profilesById[id]
}

/** A physical pack does not identify other installed radio mods or settings. */
export function defaultRadioProfileId(packId: string): RadioProfileId {
  return packId === 'rss' ? 'rss' : 'stock'
}
