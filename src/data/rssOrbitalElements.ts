import type { DataSource } from '../types/planner'
import type { OrbitalElements } from '../types/orbital'
import { rssCentralMu, rssConfigBase, rssConfigCommit, rssPhysicalReferences } from './rssPhysics'

/** RSS UT 0 is 1951-01-01 TAI; its osculating orbital elements use B1950.0. */
export const RSS_ORBITAL_EPOCH_S = -31_542_641.784
export const RSS_GAME_START_YEAR = 1951

export const rssOrbitalSources: readonly DataSource[] = Object.freeze([
  Object.freeze({
    id: 'signal-rss-orbital-elements',
    title: 'Official RSS full orbital elements · pinned configuration',
    url: `https://github.com/KSP-RO/RealSolarSystem/tree/${rssConfigCommit}/GameData/RealSolarSystem/RSSKopernicus`,
  }),
  Object.freeze({
    id: 'signal-rss-orbital-epoch',
    title: 'Official RSS B1950 element epoch and 1951 game start · pinned configuration',
    url: `https://github.com/KSP-RO/RealSolarSystem/blob/${rssConfigCommit}/GameData/RealSolarSystem/RSSKopernicusSettings.cfg#L18`,
  }),
  Object.freeze({
    id: 'signal-rss-calendar',
    title: 'Official RSS Gregorian date formatter and 1951 epoch · pinned revision',
    url: 'https://github.com/KSP-RO/RSSTimeFormatter/blob/50ba770ba8a7b5ccd64110b04898e34d30faaaa8/RSSTimeFormatter/DTReplacer.cs#L89',
  }),
])

export interface RssOrbitalElementReference {
  readonly bodyId: string
  readonly parentBodyId: string
  readonly elements: Readonly<OrbitalElements>
  readonly sourceId: string
  readonly configUrl: string
}

// Additional numerical facts from the same RSS revision as rssPhysicalReferences.
// All source mean anomalies below are explicitly meanAnomalyAtEpochD (degrees).
// The shared a/e/i/LAN values retain the source's Earth-equatorial B1950 frame.
const angularRows: readonly (readonly [bodyId: string, argumentOfPeriapsisDeg: number,
  meanAnomalyAtEpochDeg: number])[] = [
  ['rss:ariel', 169.9966404991910, 46.46367954654207], // Uranus/Ariel.cfg
  ['rss:callisto', 320.7359683492656, 15.81614025483249], // Jupiter/Callisto.cfg
  ['rss:ceres', 129.19102663711, 60.1624710451615], // Ceres/Ceres.cfg
  ['rss:charon', 188.4738646852448, 30.89989240060877], // Pluto/Charon.cfg
  ['rss:deimos', 263.8963868784089, 323.5040336489673], // Mars/Deimos.cfg
  ['rss:dione', 123.6717156049260, 167.9272784830226], // Saturn/Dione.cfg
  ['rss:earth', 102.9720683296131, 357.0607464120944], // Earth/Earth.cfg
  ['rss:enceladus', 115.5615886062458, 346.6301476573209], // Saturn/Enceladus.cfg
  ['rss:europa', 53.13210737539627, 276.2652038284650], // Jupiter/Europa.cfg
  ['rss:ganymede', 139.2992571342065, 232.6753228788302], // Jupiter/Ganymede.cfg
  ['rss:iapetus', 314.3819081366686, 139.5683324894335], // Saturn/Iapetus.cfg
  ['rss:io', 231.2703460977786, 195.3274089855250], // Jupiter/Io.cfg
  ['rss:jupiter', 10.75642751202877, 302.5812396096649], // Jupiter/Jupiter.cfg
  ['rss:mars', 332.1022655295414, 169.3913127942378], // Mars/Mars.cfg
  ['rss:mercury', 66.90371044151551, 318.2162077814089], // Mercury/Mercury.cfg
  ['rss:mimas', 222.2172789396715, 125.5909781664896], // Saturn/Mimas.cfg
  ['rss:miranda', 326.7575256535064, 253.0006290232421], // Uranus/Miranda.cfg
  ['rss:moon', 199.7640930160823, 222.7012350930954], // Earth/Moon.cfg
  ['rss:neptune', 29.81485402991322, 162.0995481888285], // Neptune/Neptune.cfg
  ['rss:oberon', 274.4599570542317, 266.5149396374048], // Uranus/Oberon.cfg
  ['rss:phobos', 357.7759243021914, 7.185120835598890], // Mars/Phobos.cfg
  ['rss:pluto', 184.4945352163909, 300.1297304812811], // Pluto/Pluto.cfg
  ['rss:rhea', 172.7367089889645, 13.48887718956405], // Saturn/Rhea.cfg
  ['rss:saturn', 85.04661202834268, 67.46885226487360], // Saturn/Saturn.cfg
  ['rss:tethys', 215.9196892523803, 349.8231217220438], // Saturn/Tethys.cfg
  ['rss:titan', 182.0886765021483, 75.16117358815676], // Saturn/Titan.cfg
  ['rss:titania', 165.7455424030838, 212.6552821835342], // Uranus/Titania.cfg
  ['rss:triton', 220.4523286895169, 358.6561877626771], // Neptune/Triton.cfg
  ['rss:umbriel', 207.7259222157362, 114.3251464012079], // Uranus/Umbriel.cfg
  ['rss:uranus', 169.6876790522249, 286.8267359944493], // Uranus/Uranus.cfg
  ['rss:venus', 123.7121294282329, 311.2459947553124], // Venus/Venus.cfg
  ['rss:vesta', 236.445369158826, 61.0607001442198], // Vesta/Vesta.cfg
]

const anglesById = new Map(angularRows.map(([id, argument, mean]) => [id, { argument, mean }]))
const parentMu = new Map([
  ['rss:sun', rssCentralMu] as const,
  ...rssPhysicalReferences.map(reference => [reference.bodyId, reference.gravitationalParameter] as const),
])

/** Parent-relative Keplerian elements; no synthetic periods or guessed angles. */
export const rssOrbitalElements: readonly RssOrbitalElementReference[] = Object.freeze(
  rssPhysicalReferences.map(reference => {
    const angles = anglesById.get(reference.bodyId)!
    return Object.freeze({
      bodyId: reference.bodyId,
      parentBodyId: reference.parentBodyId,
      sourceId: 'signal-rss-orbital-elements',
      configUrl: `${rssConfigBase}/${reference.configPath}`,
      elements: Object.freeze({
        semiMajorAxisM: reference.semiMajorAxisM,
        eccentricity: reference.eccentricity,
        inclinationDeg: reference.inclinationDeg,
        longitudeAscendingNodeDeg: reference.longitudeOfAscendingNodeDeg,
        argumentOfPeriapsisDeg: angles.argument,
        meanAnomalyAtEpochRad: angles.mean * Math.PI / 180,
        epochS: RSS_ORBITAL_EPOCH_S,
        // RSS intentionally leaves period unset. KSP's patched-conic orbit uses
        // its reference body's GM (not a barycentric sum with the child mass).
        periodS: 2 * Math.PI * Math.sqrt(reference.semiMajorAxisM ** 3 / parentMu.get(reference.parentBodyId)!),
      }),
    })
  }),
)
