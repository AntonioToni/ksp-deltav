import type { DataSource } from '../types/planner'

/** Kerbalism uses decimal megabytes internally, including ModuleDataTransmitter.DataRate. */
export const KERBALISM_BITS_PER_MEGABYTE = 8_000_000
export const DEFAULT_KERBALISM_ANTENNA_SPEED = 1.5
export const DEFAULT_KERBALISM_MINIMUM_BITS_PER_SECOND = 1
export const MAX_KERBALISM_RATE_BITS_PER_SECOND = 1e18
export const MAX_KERBALISM_ANTENNA_SPEED = 1000

export interface KerbalismAntennaRate {
  /** Before Antenna Speed, damping, and the positive-rate floor. */
  readonly baseRateBitsPerSecond: number
  readonly external: boolean
}

const sourceBase = 'https://github.com/Kerbalism/Kerbalism/blob/39f9f43afe8b4f77aff0086c3866044287694475'

export const kerbalismRateSources: readonly DataSource[] = Object.freeze([
  Object.freeze({
    id: 'commnet-kerbalism-rates',
    title: 'Official Kerbalism 3.44 science antenna rates · pinned configuration',
    url: `${sourceBase}/GameData/KerbalismConfig/System/ScienceRework/Patches-Antennas.cfg`,
  }),
  Object.freeze({
    id: 'commnet-kerbalism-rate-combination',
    title: 'Official Kerbalism 3.44 active-antenna geometric mean · pinned revision',
    url: `${sourceBase}/src/Kerbalism/Comms/CommHandlerCommNetVessel.cs`,
  }),
  Object.freeze({
    id: 'commnet-kerbalism-rate-units',
    title: 'Official Kerbalism 3.44 decimal megabyte and bit-rate units · pinned revision',
    url: `${sourceBase}/src/Kerbalism/Lib.cs`,
  }),
  Object.freeze({
    id: 'commnet-kerbalism-antenna-speed',
    title: 'Official Kerbalism 3.44 Antenna Speed difficulty settings · pinned revision',
    url: `${sourceBase}/src/Kerbalism/System/Preferences.cs`,
  }),
  Object.freeze({
    id: 'commnet-kerbalism-minimum-rate',
    title: 'Official Kerbalism 3.44 minimum science-rate setting · pinned configuration',
    url: `${sourceBase}/GameData/KerbalismConfig/Settings.cfg`,
  }),
])

// Numerical facts from the pinned default science configuration. The catch-all
// patch sets packetInterval to 1 s; the per-part packet sizes below are MB.
// RSS changes the reference parts' CommNet power, not these hand-picked rates.
const externalRatesMegabytesPerSecond: readonly (readonly [id: string, megabytesPerSecond: number])[] = [
  ['communotron-8', .0015],
  ['communotron-16', .0022],
  ['communotron-16-s', .0022],
  ['hg-5', .0045],
  ['dts-m1', .025],
  ['ra-2', .018],
  ['ra-15', .165],
  ['hg-55', .200],
  ['communotron-88-88', .520],
  ['ra-100', .480],
]

export const kerbalismAntennaRates: Readonly<Record<string, KerbalismAntennaRate>> = Object.freeze({
  internal: Object.freeze({ baseRateBitsPerSecond: 0, external: false }),
  ...Object.fromEntries(externalRatesMegabytesPerSecond.map(([id, rate]) => [id, Object.freeze({
    baseRateBitsPerSecond: rate * KERBALISM_BITS_PER_MEGABYTE,
    external: true,
  })])),
})
