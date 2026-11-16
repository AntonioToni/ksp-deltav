import type { CelestialBody, ManeuverEdge, NodeKind, PlanetPack, RouteNode } from '../types/planner'
import { routeBetweenPoints } from './mapRouting'

export interface Point { x: number; y: number }
export type MapMode = 'wide' | 'portrait' | 'short' | 'compact'
export interface BodyLabel extends Point {
  body: CelestialBody
  displayName?: string
  fontSize?: number
  fontWeight?: number
  anchor: 'start' | 'middle' | 'end'
  maxWidth?: number
}
export interface MapPanel extends Point {
  id: string
  label: string
  width: number
  height: number
  color: string
  heading?: Point
}
interface PanelContent {
  pack: PlanetPack
  layout: MapLayout
  offset: Point
  scaleX: number
  scaleY: number
}
export interface MapLayout {
  width: number
  height: number
  mode: MapMode
  nodePositions: Map<string, Point>
  labels: BodyLabel[]
  radius: number
  hitRadius: number
  hubId: string | undefined
  nodeFontSize: number
  labelFontSize: number
  presentation: 'stock' | 'opm' | 'rss' | 'generated' | 'regional' | 'system' | 'overview'
  bodyRails?: Map<string, number>
  backgroundPairs?: ReadonlySet<string>
  panels?: MapPanel[]
  nodePanels?: Map<string, string>
  panelContents?: Map<string, PanelContent>
  overviewSwitchRatio?: number
}

export const kcalbelohSystemViewId = 'kcalbeloh-system'
const kcalbelohRegionRoots = [
  ['kcalbeloh', 'kcalbeloh:kcalbeloh'], ['maelg', 'kcalbeloh:maelg'],
  ['sunorc', 'kcalbeloh:sunorc'], ['aralc', 'kcalbeloh:aralca'],
] as const

/** Recognize the actual four regional references, including renamed packs. */
export function hasKcalbelohSystemView(pack: PlanetPack): boolean {
  if (pack.mapRegions?.some(region => region.id === kcalbelohSystemViewId)) return false
  const regions = kcalbelohRegionRoots.map(([id, root]) => {
    const matches = pack.mapRegions?.filter(region => region.id === id)
    return matches?.length === 1 && matches[0]!.bodyIds.includes(root)
      && pack.nodes.some(node => node.bodyId === root && node.kind === 'reference') ? matches[0] : undefined
  })
  if (regions.some(region => !region)) return false
  const bodyIds = regions.flatMap(region => region!.bodyIds)
  return new Set(bodyIds).size === bodyIds.length
}

/** A map view never changes the source pack or the graph used for missions. */
export function packForMapRegion(pack: PlanetPack, regionId: string): PlanetPack {
  const combined = regionId === kcalbelohSystemViewId && hasKcalbelohSystemView(pack)
  const region = pack.mapRegions?.find(candidate => candidate.id === regionId)
  if ((!region && !combined) || regionId === 'all') return pack
  const regions = combined ? kcalbelohRegionRoots.map(([id]) => pack.mapRegions!.find(candidate => candidate.id === id)!) : [region!]
  const bodyIds = new Set(regions.flatMap(candidate => candidate.bodyIds))
  const nodes = pack.nodes.filter(node => bodyIds.has(node.bodyId))
  const nodeIds = new Set(nodes.map(node => node.id))
  return {
    ...pack,
    bodies: pack.bodies.filter(body => bodyIds.has(body.id)),
    nodes,
    maneuvers: pack.maneuvers.filter(edge => nodeIds.has(edge.from) && nodeIds.has(edge.to)),
    ...(pack.unpricedConnections ? { unpricedConnections: pack.unpricedConnections.filter(edge => nodeIds.has(edge.from) && nodeIds.has(edge.to)) } : {}),
    mapRegions: combined ? regions.map(candidate => ({ ...candidate, bodyIds: [...candidate.bodyIds] })) : undefined,
  }
}

type BodyStates = Partial<Record<NodeKind, Point>>
const p = (x: number, y: number): Point => ({ x, y })

// These are schematic coordinates, independent of reference orbits and costs.
// The central interchange is the real Kerbin encounter state, not a free
// interplanetary-space node that could change the maneuver graph.
const wideStates: Record<string, BodyStates> = {
  ike: { surface: p(140, 70), orbit: p(260, 70), encounter: p(380, 70) },
  duna: { surface: p(140, 190), orbit: p(260, 190), elliptical: p(380, 190), encounter: p(480, 280) },
  gilly: { surface: p(140, 310), orbit: p(260, 310), encounter: p(380, 310) },
  eve: { surface: p(140, 410), orbit: p(260, 410), elliptical: p(380, 410), encounter: p(480, 410) },
  moho: { surface: p(140, 530), orbit: p(260, 530), encounter: p(400, 530) },
  dres: { surface: p(620, 80), orbit: p(620, 190), encounter: p(620, 300) },
  kerbin: { surface: p(620, 680), orbit: p(620, 580), encounter: p(620, 460) },
  mun: { surface: p(140, 655), orbit: p(260, 655), encounter: p(390, 620) },
  minmus: { surface: p(1070, 665), orbit: p(940, 625), encounter: p(810, 580) },
  jool: { orbit: p(1080, 390), elliptical: p(960, 365), encounter: p(850, 365) },
  laythe: { surface: p(850, 70), orbit: p(850, 145), encounter: p(850, 220) },
  vall: { surface: p(970, 70), orbit: p(970, 145), encounter: p(970, 220) },
  tylo: { surface: p(1090, 70), orbit: p(1090, 145), encounter: p(1090, 220) },
  bop: { surface: p(1210, 70), orbit: p(1210, 145), encounter: p(1210, 220) },
  pol: { surface: p(1330, 70), orbit: p(1330, 145), encounter: p(1330, 220) },
  eeloo: { surface: p(1320, 565), orbit: p(1190, 520), encounter: p(1060, 475) },
}

// Short screens need a full node-and-hover gap between the Jool moon rows.
// Keep the parent band and Eeloo below those rows rather than compressing all
// three moon states into nearly touching circles.
const stockShortStates: Record<string, BodyStates> = {
  laythe: { surface: p(850, 64), orbit: p(850, 128), encounter: p(850, 192) },
  vall: { surface: p(970, 64), orbit: p(970, 128), encounter: p(970, 192) },
  tylo: { surface: p(1090, 64), orbit: p(1090, 128), encounter: p(1090, 192) },
  bop: { surface: p(1210, 64), orbit: p(1210, 128), encounter: p(1210, 192) },
  pol: { surface: p(1330, 64), orbit: p(1330, 128), encounter: p(1330, 192) },
  jool: { encounter: p(850, 260), elliptical: p(960, 260), orbit: p(1080, 285) },
  eeloo: { encounter: p(1140, 345), orbit: p(1230, 375), surface: p(1320, 405) },
  kerbin: { surface: p(620, 411), orbit: p(620, 347), encounter: p(620, 282.6) },
  mun: { surface: p(140, 391.8), orbit: p(260, 391.8), encounter: p(390, 385) },
  gilly: { surface: p(140, 194.6), orbit: p(260, 194.6), encounter: p(380, 194.6) },
  eve: { surface: p(140, 258.6), orbit: p(260, 258.6), elliptical: p(380, 258.6), encounter: p(480, 258.6) },
}

const portraitColumns = [
  ['moho', 'eve', 'gilly', 'kerbin', 'mun', 'minmus', 'duna', 'ike'],
  ['dres', 'jool', 'laythe', 'vall', 'tylo', 'bop', 'pol', 'eeloo'],
]
const shortId = (id: string) => id.split(':').at(-1) ?? id

// Presentation presets do not add states or change graph connectivity. A pack
// only uses a preset when every actual node has its own known position.
const opmStates: Record<string, BodyStates> = {
  dres: { surface: p(200, 80), orbit: p(390, 80), encounter: p(680, 260) },
  ike: { surface: p(220, 180), orbit: p(350, 180), encounter: p(500, 180) },
  duna: { surface: p(200, 290), orbit: p(350, 290), elliptical: p(500, 290), encounter: p(640, 390) },
  gilly: { surface: p(200, 420), orbit: p(350, 420), encounter: p(500, 420) },
  eve: { surface: p(200, 530), orbit: p(350, 530), elliptical: p(500, 530), encounter: p(640, 530) },
  moho: { surface: p(200, 650), orbit: p(350, 650), encounter: p(520, 650) },
  kerbin: { surface: p(840, 1030), orbit: p(840, 850), encounter: p(840, 650) },
  mun: { surface: p(300, 850), orbit: p(450, 850), encounter: p(600, 850) },
  minmus: { surface: p(1160, 1010), orbit: p(1050, 930), encounter: p(940, 850) },
  jool: { orbit: p(1370, 510), elliptical: p(1210, 510), encounter: p(1010, 510) },
  laythe: { surface: p(1000, 80), orbit: p(1000, 205), encounter: p(1000, 330) },
  vall: { surface: p(1130, 80), orbit: p(1130, 205), encounter: p(1130, 330) },
  tylo: { surface: p(1260, 80), orbit: p(1260, 205), encounter: p(1260, 330) },
  bop: { surface: p(1390, 80), orbit: p(1390, 205), encounter: p(1390, 330) },
  pol: { surface: p(1520, 80), orbit: p(1520, 205), encounter: p(1520, 330) },
  sarnus: { orbit: p(1820, 485), elliptical: p(1680, 485), encounter: p(1540, 485) },
  hale: { surface: p(1660, 80), orbit: p(1660, 205), encounter: p(1660, 330) },
  ovok: { surface: p(1790, 80), orbit: p(1790, 205), encounter: p(1790, 330) },
  eeloo: { surface: p(1920, 80), orbit: p(1920, 205), encounter: p(1920, 330) },
  slate: { surface: p(2050, 80), orbit: p(2050, 205), encounter: p(2050, 330) },
  tekto: { surface: p(2180, 80), orbit: p(2180, 205), encounter: p(2180, 330) },
  urlum: { orbit: p(2060, 640), elliptical: p(1910, 640), encounter: p(1760, 640) },
  polta: { surface: p(2350, 440), orbit: p(2210, 440), encounter: p(2070, 440) },
  priax: { surface: p(2470, 565), orbit: p(2330, 565), encounter: p(2190, 565) },
  wal: { surface: p(2470, 740), orbit: p(2330, 740), encounter: p(2190, 740) },
  tal: { surface: p(2470, 900), orbit: p(2330, 900), encounter: p(2190, 900) },
  neidon: { orbit: p(1710, 785), elliptical: p(1570, 715), encounter: p(1430, 665) },
  thatmo: { surface: p(2090, 1020), orbit: p(1970, 940), encounter: p(1850, 860) },
  nissee: { surface: p(1880, 1085), orbit: p(1750, 985), encounter: p(1620, 885) },
  plock: { surface: p(1450, 1030), orbit: p(1450, 930), elliptical: p(1370, 840), encounter: p(1280, 750) },
  karen: { surface: p(1280, 1100), orbit: p(1280, 1000), encounter: p(1280, 900) },
}

const opmLabels: Record<string, Point & { anchor?: BodyLabel['anchor'] }> = {
  dres: { ...p(140, 88), anchor: 'end' },
  ike: { ...p(160, 188), anchor: 'end' },
  duna: { ...p(140, 298), anchor: 'end' },
  gilly: { ...p(140, 428), anchor: 'end' },
  eve: { ...p(140, 538), anchor: 'end' },
  moho: { ...p(140, 658), anchor: 'end' },
  jool: { ...p(1435, 518), anchor: 'start' },
  sarnus: { ...p(1885, 493), anchor: 'start' },
  urlum: { ...p(2130, 650), anchor: 'start' },
  neidon: { ...p(1780, 785), anchor: 'start' },
  kerbin: p(840, 1080), mun: p(300, 900), minmus: p(1160, 1060),
  plock: p(1450, 1080), karen: p(1280, 1150),
  polta: { ...p(2415, 448), anchor: 'start' },
  priax: { ...p(2530, 573), anchor: 'start' },
  wal: { ...p(2530, 748), anchor: 'start' },
  tal: { ...p(2530, 908), anchor: 'start' },
  thatmo: { ...p(2155, 1028), anchor: 'start' },
  nissee: { ...p(1945, 1093), anchor: 'start' },
}

// A solar-system schematic: terrestrial/dwarf chains on the left, giant-planet
// satellite families above/right, and Earth/Moon below the real Earth hub.
// Moon transfers still use the pack's actual elliptical/parking-orbit edges.
const rssStates: Record<string, BodyStates> = {
  mercury: { surface: p(140, 610), orbit: p(280, 610), elliptical: p(420, 610), encounter: p(560, 610) },
  venus: { surface: p(140, 740), orbit: p(280, 740), elliptical: p(420, 740), encounter: p(560, 740) },
  earth: { surface: p(800, 1100), orbit: p(800, 850), encounter: p(800, 650) },
  moon: { surface: p(260, 1090), orbit: p(440, 1030), encounter: p(620, 970) },
  mars: { surface: p(140, 480), orbit: p(280, 480), elliptical: p(420, 480), encounter: p(560, 480) },
  phobos: { surface: p(140, 80), orbit: p(140, 180), encounter: p(140, 280) },
  deimos: { surface: p(280, 80), orbit: p(280, 180), encounter: p(280, 280) },
  ceres: { surface: p(140, 870), orbit: p(280, 870), elliptical: p(420, 870), encounter: p(560, 870) },
  vesta: { surface: p(140, 1250), orbit: p(280, 1250), elliptical: p(420, 1250), encounter: p(560, 1250) },
  jupiter: { orbit: p(1300, 520), elliptical: p(1160, 520), encounter: p(1020, 520) },
  io: { surface: p(1000, 80), orbit: p(1000, 215), encounter: p(1000, 350) },
  europa: { surface: p(1130, 80), orbit: p(1130, 215), encounter: p(1130, 350) },
  ganymede: { surface: p(1260, 80), orbit: p(1260, 215), encounter: p(1260, 350) },
  callisto: { surface: p(1390, 80), orbit: p(1390, 215), encounter: p(1390, 350) },
  saturn: { orbit: p(2200, 570), elliptical: p(2060, 520), encounter: p(1920, 620) },
  titan: { surface: p(1560, 80), orbit: p(1560, 215), encounter: p(1560, 350) },
  rhea: { surface: p(1690, 80), orbit: p(1690, 215), encounter: p(1690, 350) },
  iapetus: { surface: p(1820, 80), orbit: p(1820, 215), encounter: p(1820, 350) },
  dione: { surface: p(1950, 80), orbit: p(1950, 215), encounter: p(1950, 350) },
  tethys: { surface: p(2080, 80), orbit: p(2080, 215), encounter: p(2080, 350) },
  enceladus: { surface: p(2210, 80), orbit: p(2210, 215), encounter: p(2210, 350) },
  mimas: { surface: p(2340, 80), orbit: p(2340, 215), encounter: p(2340, 350) },
  uranus: { orbit: p(2020, 850), elliptical: p(2020, 710), encounter: p(1880, 710) },
  titania: { surface: p(2660, 570), orbit: p(2530, 570), encounter: p(2400, 570) },
  oberon: { surface: p(2660, 710), orbit: p(2530, 710), encounter: p(2400, 710) },
  umbriel: { surface: p(2660, 850), orbit: p(2530, 850), encounter: p(2400, 850) },
  ariel: { surface: p(2660, 990), orbit: p(2530, 990), encounter: p(2400, 990) },
  miranda: { surface: p(2660, 1130), orbit: p(2530, 1130), encounter: p(2400, 1130) },
  neptune: { orbit: p(1500, 700), elliptical: p(1360, 770), encounter: p(1200, 700) },
  triton: { surface: p(1980, 1050), orbit: p(1840, 980), encounter: p(1700, 910) },
  pluto: { surface: p(1420, 1110), orbit: p(1320, 1000), elliptical: p(1220, 890), encounter: p(1120, 780) },
  charon: { surface: p(1700, 1180), orbit: p(1580, 1080), encounter: p(1460, 980) },
}

const rssLabels: Record<string, Point & { anchor?: BodyLabel['anchor'] }> = {
  mercury: { ...p(100, 618), anchor: 'end' },
  venus: { ...p(100, 748), anchor: 'end' },
  mars: { ...p(100, 488), anchor: 'end' },
  ceres: { ...p(100, 878), anchor: 'end' },
  vesta: { ...p(100, 1258), anchor: 'end' },
  jupiter: { ...p(1370, 528), anchor: 'start' },
  saturn: { ...p(2270, 578), anchor: 'start' },
  uranus: { ...p(2080, 858), anchor: 'start' },
  neptune: { ...p(1560, 708), anchor: 'start' },
  earth: p(800, 1150), moon: p(260, 1140), pluto: p(1420, 1160), charon: p(1700, 1230),
  titania: { ...p(2725, 578), anchor: 'start' },
  oberon: { ...p(2725, 718), anchor: 'start' },
  umbriel: { ...p(2725, 858), anchor: 'start' },
  ariel: { ...p(2725, 998), anchor: 'start' },
  miranda: { ...p(2725, 1138), anchor: 'start' },
  triton: { ...p(2045, 1058), anchor: 'start' },
}

function canUsePreset(pack: PlanetPack, positions: Record<string, BodyStates>): boolean {
  const activeBodyIds = new Set(pack.nodes.map(node => node.bodyId))
  const activeBodies = pack.bodies.filter(body => activeBodyIds.has(body.id))
  // Presets describe one nonstellar body per short ID. Custom packs may have
  // selectable stars or reuse a familiar name in another namespace.
  if (activeBodies.some(body => body.kind !== 'planet' && body.kind !== 'moon') || new Set(activeBodies.map(body => shortId(body.id))).size !== activeBodies.length) return false
  const used = new Set<string>()
  return pack.nodes.length > 0 && pack.nodes.every(node => {
    const key = `${shortId(node.bodyId)}:${node.kind}`
    if (!positions[shortId(node.bodyId)]?.[node.kind] || used.has(key)) return false
    used.add(key)
    return true
  })
}

function findHub(pack: PlanetPack): string | undefined {
  const homeStates = pack.nodes.filter(node => node.bodyId === pack.transferHubBodyId)
  const preferred = homeStates.find(node => node.kind === 'encounter')
    ?? homeStates.find(node => node.kind === 'orbit') ?? homeStates[0]
  if (preferred) return preferred.id
  const nodes = new Map(pack.nodes.map(node => [node.id, node]))
  const degree = new Map<string, number>()
  for (const edge of pack.maneuvers) {
    if (nodes.get(edge.from)?.bodyId === nodes.get(edge.to)?.bodyId) continue
    degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1)
    degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1)
  }
  return [...pack.nodes].sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0))[0]?.id
}

export function createMapLayout(pack: PlanetPack, mode: MapMode = 'wide'): MapLayout {
  // Preserve the existing small landscape overview without sending desktop
  // short screens through the generic layout.
  if (mode === 'compact') return createGeneratedLayout(pack, 'short')
  if (pack.mapRegions?.length === 4 && hasKcalbelohSystemView(pack)
    && pack.nodes.every(node => pack.mapRegions!.some(region => region.bodyIds.includes(node.bodyId)))) {
    const overview = createKcalbelohOverview(pack, mode)
    if (overview) return overview
  }
  if (mode !== 'portrait' && pack.mapRegions?.length) {
    const overview = createRegionOverview(pack, mode)
    if (overview) return overview
  }
  if (isKcalbelohRegion(pack)) return createKcalbelohRegion(pack, mode)
  if (pack.id === 'rss' && canUsePreset(pack, rssStates)) {
    return mode === 'portrait' ? createGeneratedLayout(pack, mode) : createRssLayout(pack, mode)
  }
  const hasOuterPlanets = pack.bodies.some(body => shortId(body.id) === 'sarnus')
  if (hasOuterPlanets && canUsePreset(pack, opmStates)) {
    return mode === 'portrait' ? createGeneratedLayout(pack, mode) : createOpmLayout(pack, mode)
  }
  if (canUsePreset(pack, wideStates)) return createStockLayout(pack, mode)
  return createGeneratedLayout(pack, mode)
}

function createRssLayout(pack: PlanetPack, mode: MapMode): MapLayout {
  const nodePositions = new Map<string, Point>()
  const labels: BodyLabel[] = []
  const short = mode === 'short'
  const transform = (point: Point) => short ? p(point.x, 40 + point.y * 0.54) : point
  for (const body of pack.bodies) {
    const nodes = pack.nodes.filter(node => node.bodyId === body.id)
    if (!nodes.length) continue
    const id = shortId(body.id)
    const positions = rssStates[id]!
    for (const node of nodes) nodePositions.set(node.id, transform(positions[node.kind]!))
    const surface = positions.surface
    const label: Point & { anchor?: BodyLabel['anchor'] } = rssLabels[id]
      ?? (surface ? p(surface.x, surface.y - 44) : p(positions.orbit!.x, positions.orbit!.y - 44))
    const point = transform(label)
    if (short && surface && ['earth', 'moon', 'pluto', 'charon'].includes(id)) point.y = transform(surface).y + 42
    if (short && surface && !rssLabels[id]) point.y = transform(surface).y - 36
    labels.push({ body, ...point, anchor: label.anchor ?? 'middle' })
  }
  return {
    width: 2880, height: short ? 800 : 1320, mode, nodePositions, labels,
    radius: short ? 24 : 29, hitRadius: short ? 32 : 36,
    hubId: findHub(pack), nodeFontSize: short ? 18 : 19, labelFontSize: short ? 23 : 25,
    presentation: 'rss',
  }
}

function createOpmLayout(pack: PlanetPack, mode: MapMode): MapLayout {
  const nodePositions = new Map<string, Point>()
  const labels: BodyLabel[] = []
  const short = mode === 'short'
  const transform = (point: Point) => short ? p(point.x, 40 + point.y * 0.54) : point
  for (const body of pack.bodies) {
    const nodes = pack.nodes.filter(node => node.bodyId === body.id)
    if (!nodes.length) continue
    const id = shortId(body.id)
    const positions = opmStates[id]!
    for (const node of nodes) nodePositions.set(node.id, transform(positions[node.kind]!))
    const surface = positions.surface
    const label: Point & { anchor?: BodyLabel['anchor'] } = opmLabels[id]
      ?? (surface ? p(surface.x, surface.y - 44) : p(positions.orbit!.x, positions.orbit!.y - 44))
    const point = transform(label)
    // Vertical compression needs its own label gap to keep type clear of nodes.
    if (short && surface && ['kerbin', 'mun', 'minmus', 'plock', 'karen'].includes(id)) point.y = transform(surface).y + 42
    if (short && surface && ['laythe', 'vall', 'tylo', 'bop', 'pol', 'hale', 'ovok', 'eeloo', 'slate', 'tekto'].includes(id)) point.y = transform(surface).y - 36
    labels.push({ body, ...point, anchor: label.anchor ?? 'middle' })
  }
  return {
    width: 2620, height: short ? 710 : 1190, mode, nodePositions, labels,
    radius: short ? 24 : 29, hitRadius: short ? 32 : 36,
    hubId: findHub(pack), nodeFontSize: short ? 18 : 19, labelFontSize: short ? 23 : 25,
    presentation: 'opm',
  }
}

function createStockLayout(pack: PlanetPack, mode: MapMode): MapLayout {
  const nodePositions = new Map<string, Point>()
  const labels: BodyLabel[] = []
  const hubId = findHub(pack)
  for (const [bodyIndex, body] of pack.bodies.filter(body => body.kind !== 'star' && pack.nodes.some(node => node.bodyId === body.id)).entries()) {
    const id = shortId(body.id)
    const nodes = pack.nodes.filter(node => node.bodyId === body.id)
    if (mode === 'portrait') {
      let column = portraitColumns.findIndex(ids => ids.includes(id))
      if (column < 0) column = bodyIndex % 2
      const row = portraitColumns[column]?.indexOf(id) ?? -1
      const y = 80 + (row < 0 ? Math.floor(bodyIndex / 2) : row) * 90
      const xByKind: Record<NodeKind, number> = column === 0
        ? { surface: 56, orbit: 124, reference: 124, elliptical: 192, encounter: 260 }
        : { surface: 624, orbit: 556, reference: 556, elliptical: 488, encounter: 420 }
      for (const node of nodes) nodePositions.set(node.id, p(xByKind[node.kind], y))
      labels.push({ body, x: column === 0 ? 56 : 624, y: y - 38, anchor: column === 0 ? 'start' : 'end' })
      continue
    }
    const positions = wideStates[id]
    for (const node of nodes) {
      const point = positions?.[node.kind]
      if (point) nodePositions.set(node.id, mode === 'short' ? stockShortStates[id]?.[node.kind] ?? p(point.x, 25 + point.y * 0.56) : point)
    }
    const surface = positions?.surface
    const label = id === 'jool' ? p(1145, 394)
      : id === 'kerbin' ? p(620, 724)
        : id === 'minmus' ? p(1070, 708)
          : id === 'mun' ? p(140, 705)
            : id === 'eeloo' ? p(1320, 610)
              : surface ? p(surface.x, surface.y - 38) : undefined
    if (label) labels.push({
      body, x: label.x,
      y: mode === 'short'
        ? id === 'jool' ? 289 : id === 'eeloo' ? 449 : ['laythe', 'vall', 'tylo', 'bop', 'pol'].includes(id) ? 30
          : surface && ['kerbin', 'minmus', 'mun'].includes(id)
            ? (stockShortStates[id]?.surface?.y ?? 25 + surface.y * 0.56) + 40
            : surface ? (stockShortStates[id]?.surface?.y ?? 25 + surface.y * 0.56) - 26 : 25 + label.y * 0.56
        : label.y,
      anchor: id === 'jool' ? 'start' : 'middle',
    })
  }
  return {
    width: mode === 'portrait' ? 680 : 1440,
    height: mode === 'portrait' ? 760 : mode === 'short' ? 460 : 750,
    mode, nodePositions, labels, radius: mode === 'short' ? 20 : 24,
    hitRadius: mode === 'portrait' ? 32 : 30, hubId,
    nodeFontSize: mode === 'portrait' ? 17 : mode === 'short' ? 15 : 14,
    labelFontSize: mode === 'short' ? 20 : 21, presentation: 'stock',
  }
}

const kindOrder: Record<NodeKind, number> = { surface: 0, orbit: 1, reference: 1, elliptical: 2, encounter: 3 }

function isKcalbelohRegion(pack: PlanetPack): boolean {
  return !pack.mapRegions?.length && pack.nodes.length > 0
    && kcalbelohRegionRoots.filter(([, root]) => pack.nodes.some(node => node.bodyId === root && node.kind === 'reference')).length === 1
    && pack.nodes.every(node => node.bodyId.startsWith('kcalbeloh:') && ['surface', 'orbit', 'reference'].includes(node.kind))
    && pack.bodies.every(body => pack.nodes.filter(node => node.bodyId === body.id).length <= 2)
    && pack.nodes.every(node => kcalbelohStates[shortId(node.bodyId)]?.[node.kind])
}

// These positions describe a route schematic, not physical orbital distances.
// Stellar references form the main branches; short surface stubs point outward
// and moon families stay near the planet or shared reference they orbit.
const kcalbelohStates: Record<string, BodyStates> = {
  kcalbeloh: { reference: p(1050, 520) },
  rouqea: { orbit: p(680, 360), surface: p(680, 250) },
  onrefni: { orbit: p(390, 180), surface: p(250, 180) },
  iomena: { orbit: p(390, 360), surface: p(250, 360) },
  uleg: { orbit: p(390, 540), surface: p(250, 540) },
  maelg: { reference: p(1470, 270) },
  mehtna: { orbit: p(1750, 270), surface: p(1750, 150) },
  meiuqer: { orbit: p(2020, 270), surface: p(2160, 270) },
  sunorc: { reference: p(730, 840) },
  suluco: { orbit: p(480, 840), surface: p(480, 720) },
  sedah: { orbit: p(220, 680) },
  tot: { orbit: p(480, 1050), surface: p(350, 1050) },
  sera: { orbit: p(220, 900), surface: p(100, 900) },
  dipuc: { orbit: p(220, 1110), surface: p(100, 1110) },
  simesystem: { reference: p(800, 1110) },
  noira: { orbit: p(1000, 1100), surface: p(1000, 1220) },
  norihc: { orbit: p(850, 1290), surface: p(720, 1290) },
  noyreg: { orbit: p(1080, 1310), surface: p(1210, 1360) },
  aralca: { reference: p(1440, 720) },
  anehta: { orbit: p(1750, 820) },
  anneheg: { orbit: p(1430, 1050), surface: p(1300, 1050) },
  ahtpan: { orbit: p(1630, 630), surface: p(1630, 500) },
  arorua: { orbit: p(1280, 900), surface: p(1150, 900) },
  efil: { orbit: p(2010, 920), surface: p(2010, 1040) },
  elad: { orbit: p(1850, 1120), surface: p(1850, 1250) },
  eulb: { orbit: p(2200, 1120), surface: p(2200, 1250) },
  enots: { orbit: p(2220, 810), surface: p(2350, 810) },
}

// A separate shallow constellation for laptops/landscape screens. Labels are
// placed afresh at the final type size, rather than vertically scaling text.
const kcalbelohShortStates: Record<string, BodyStates> = {
  kcalbeloh: { reference: p(945, 320) },
  rouqea: { orbit: p(612, 224), surface: p(612, 136) },
  onrefni: { orbit: p(351, 104), surface: p(225, 104) },
  iomena: { orbit: p(351, 224), surface: p(225, 224) },
  uleg: { orbit: p(351, 344), surface: p(225, 344) },
  maelg: { reference: p(1323, 190) },
  mehtna: { orbit: p(1575, 190), surface: p(1575, 80) },
  meiuqer: { orbit: p(1818, 190), surface: p(1944, 190) },
  sunorc: { reference: p(657, 536) },
  suluco: { orbit: p(432, 536), surface: p(432, 440) },
  sedah: { orbit: p(198, 440) },
  tot: { orbit: p(432, 664), surface: p(315, 664) },
  sera: { orbit: p(198, 576), surface: p(90, 576) },
  dipuc: { orbit: p(198, 720), surface: p(90, 720) },
  simesystem: { reference: p(720, 720) },
  noira: { orbit: p(900, 740), surface: p(900, 850) },
  norihc: { orbit: p(765, 840), surface: p(648, 840) },
  noyreg: { orbit: p(1000, 920), surface: p(1120, 920) },
  aralca: { reference: p(1296, 464) },
  anehta: { orbit: p(1575, 528) },
  anneheg: { orbit: p(1260, 560), surface: p(1140, 440) },
  ahtpan: { orbit: p(1467, 350), surface: p(1590, 350) },
  arorua: { orbit: p(1100, 550), surface: p(980, 550) },
  efil: { orbit: p(1780, 600), surface: p(1780, 730) },
  elad: { orbit: p(1570, 800), surface: p(1440, 800) },
  eulb: { orbit: p(2010, 800), surface: p(2140, 800) },
  enots: { orbit: p(1980, 650), surface: p(2110, 650) },
}

// Local portrait diagrams reflow entire families, keeping land/orbit pairs and
// the existing transfer junctions together instead of placing bodies in rows.
const kcalbelohPortraitStates: Record<string, BodyStates> = {
  kcalbeloh: { reference: p(600, 460) },
  rouqea: { orbit: p(360, 460), surface: p(360, 340) },
  onrefni: { orbit: p(120, 220), surface: p(120, 100) },
  iomena: { orbit: p(120, 460), surface: p(120, 580) },
  uleg: { orbit: p(360, 720), surface: p(480, 720) },
  maelg: { reference: p(220, 100) },
  mehtna: { orbit: p(220, 340), surface: p(80, 340) },
  meiuqer: { orbit: p(220, 540), surface: p(360, 540) },
  sunorc: { reference: p(470, 100) },
  suluco: { orbit: p(360, 310), surface: p(220, 310) },
  sedah: { orbit: p(120, 100) },
  tot: { orbit: p(560, 240), surface: p(700, 240) },
  sera: { orbit: p(120, 550), surface: p(120, 680) },
  dipuc: { orbit: p(340, 680), surface: p(470, 680) },
  simesystem: { reference: p(620, 560) },
  noira: { orbit: p(620, 820), surface: p(750, 820) },
  norihc: { orbit: p(430, 1050), surface: p(300, 1050) },
  noyreg: { orbit: p(800, 1000), surface: p(800, 1130) },
  aralca: { reference: p(120, 200) },
  anehta: { orbit: p(390, 380) },
  anneheg: { orbit: p(80, 320), surface: p(80, 440) },
  ahtpan: { orbit: p(360, 200), surface: p(360, 80) },
  arorua: { orbit: p(600, 200), surface: p(600, 80) },
  efil: { orbit: p(430, 630), surface: p(570, 630) },
  elad: { orbit: p(180, 760), surface: p(80, 760) },
  eulb: { orbit: p(430, 900), surface: p(430, 1030) },
  enots: { orbit: p(690, 760), surface: p(690, 890) },
}

// Portrait overview keeps the central reference above two branching families;
// these are separately reflowed positions, not a squeezed desktop canvas.
const kcalbelohSystemPortraitStates: Record<string, BodyStates> = {
  kcalbeloh: { reference: p(490, 532) },
  rouqea: { orbit: p(294, 322), surface: p(294, 238) },
  onrefni: { orbit: p(126, 112), surface: p(42, 112) },
  iomena: { orbit: p(126, 322), surface: p(42, 322) },
  uleg: { orbit: p(126, 532), surface: p(42, 532) },
  maelg: { reference: p(700, 252) },
  mehtna: { orbit: p(840, 140), surface: p(840, 56) },
  meiuqer: { orbit: p(840, 378), surface: p(938, 378) },
  sunorc: { reference: p(315, 756) },
  suluco: { orbit: p(196, 924), surface: p(98, 924) },
  sedah: { orbit: p(56, 756) },
  tot: { orbit: p(392, 924), surface: p(490, 924) },
  sera: { orbit: p(140, 1106), surface: p(56, 1106) },
  dipuc: { orbit: p(140, 1267), surface: p(56, 1267) },
  simesystem: { reference: p(420, 1246) },
  noira: { orbit: p(420, 1414), surface: p(511, 1414) },
  norihc: { orbit: p(210, 1519), surface: p(119, 1519) },
  noyreg: { orbit: p(490, 1575), surface: p(581, 1575) },
  aralca: { reference: p(700, 728) },
  anehta: { orbit: p(805, 1000) },
  anneheg: { orbit: p(595, 763), surface: p(504, 763) },
  ahtpan: { orbit: p(805, 630), surface: p(903, 630) },
  arorua: { orbit: p(700, 850), surface: p(609, 850) },
  efil: { orbit: p(1001, 1100), surface: p(1120, 1100) },
  elad: { orbit: p(780, 1280), surface: p(780, 1410) },
  eulb: { orbit: p(1001, 1330), surface: p(1001, 1421) },
  enots: { orbit: p(1001, 900), surface: p(1120, 900) },
}

const kcalbelohPrimaryLinks = [
  ['kcalbeloh:reference', 'maelg:reference'], ['kcalbeloh:reference', 'sunorc:reference'], ['kcalbeloh:reference', 'aralca:reference'],
  ['kcalbeloh:reference', 'rouqea:orbit'], ['rouqea:orbit', 'onrefni:orbit'], ['rouqea:orbit', 'iomena:orbit'], ['rouqea:orbit', 'uleg:orbit'],
  ['maelg:reference', 'mehtna:orbit'], ['mehtna:orbit', 'meiuqer:orbit'],
  ['sunorc:reference', 'suluco:orbit'], ['suluco:orbit', 'sedah:orbit'], ['suluco:orbit', 'sera:orbit'], ['suluco:orbit', 'simesystem:reference'],
  ['suluco:orbit', 'tot:orbit'], ['sera:orbit', 'dipuc:orbit'], ['simesystem:reference', 'noira:orbit'],
  ['noira:orbit', 'norihc:orbit'], ['noira:orbit', 'noyreg:orbit'],
  ['aralca:reference', 'anehta:orbit'], ['anehta:orbit', 'anneheg:orbit'], ['anehta:orbit', 'ahtpan:orbit'],
  ['anehta:orbit', 'arorua:orbit'], ['anehta:orbit', 'efil:orbit'],
  ['efil:orbit', 'elad:orbit'], ['efil:orbit', 'eulb:orbit'], ['efil:orbit', 'enots:orbit'],
] as const

function primaryKcalbelohPairs(pack: PlanetPack): ReadonlySet<string> {
  const byId = new Map(pack.nodes.map(node => [node.id, node]))
  const selected = new Set(kcalbelohPrimaryLinks.map(pair => JSON.stringify(pair.map(id => `kcalbeloh:${id}`).sort())))
  return new Set([...pack.maneuvers, ...(pack.unpricedConnections ?? [])].filter(edge =>
    byId.get(edge.from)?.bodyId === byId.get(edge.to)?.bodyId || selected.has(JSON.stringify([edge.from, edge.to].sort())))
    .map(edge => JSON.stringify([edge.from, edge.to].sort())))
}

function createKcalbelohRegion(pack: PlanetPack, mode: MapMode): MapLayout {
  return createKcalbelohSchematic(pack, mode, false)
}

/** One connected reference constellation, not four translated region cards. */
function createKcalbelohOverview(pack: PlanetPack, mode: MapMode): MapLayout | undefined {
  if (kcalbelohRegionRoots.some(([id]) => !isKcalbelohRegion(packForMapRegion(pack, id)))) return
  return createKcalbelohSchematic(pack, mode, true)
}

function createKcalbelohSchematic(pack: PlanetPack, mode: MapMode, combined: boolean): MapLayout {
  const preset = mode === 'portrait' ? combined ? kcalbelohSystemPortraitStates : kcalbelohPortraitStates : mode === 'wide' ? kcalbelohStates : kcalbelohShortStates
  const nodePositions = new Map<string, Point>()
  const labels: BodyLabel[] = []
  const nodePanels = new Map<string, string>()
  for (const body of pack.bodies) {
    const nodes = pack.nodes.filter(node => node.bodyId === body.id)
    if (!nodes.length) continue
    const id = shortId(body.id)
    const positions = preset[id]!
    for (const node of nodes) nodePositions.set(node.id, { ...positions[node.kind]! })
    const anchorPoint = positions.surface ?? positions.reference ?? positions.orbit!
    const stellar = nodes.some(node => node.kind === 'reference') && id !== 'simesystem'
    let label: BodyLabel = { body, ...p(anchorPoint.x, anchorPoint.y - (id === 'kcalbeloh' ? 70 : stellar ? 52 : 42)), anchor: 'middle',
      fontSize: stellar ? id === 'kcalbeloh' ? 28 : 26 : mode === 'portrait' ? 26 : 24,
      fontWeight: stellar ? 600 : 500 }
    if (positions.surface && positions.orbit && positions.surface.y > positions.orbit.y && Math.abs(positions.surface.x - positions.orbit.x) < Math.abs(positions.surface.y - positions.orbit.y) / 2) label.y = anchorPoint.y + 56
    if (id === 'norihc' && mode === 'short') label.y = anchorPoint.y + 60
    if (id === 'aralca' && mode !== 'portrait') label = { ...label, x: anchorPoint.x + 70, y: anchorPoint.y - 36, anchor: 'start' }
    if (id === 'sunorc' && (combined || mode !== 'portrait')) label.y = anchorPoint.y + 60
    if (id === 'simesystem') {
      label.displayName = 'Simetra–Simeht'
      label.fontSize = 22
      label.y = anchorPoint.y + 60
      if (mode === 'portrait' && !combined) label = { ...label, x: anchorPoint.x + 70, y: anchorPoint.y + 8, anchor: 'start' }
    }
    if (id === 'anehta') label = mode === 'portrait' && !combined
      ? { ...label, x: anchorPoint.x + 70, y: anchorPoint.y + 8, anchor: 'start' }
      : { ...label, y: anchorPoint.y + 58 }
    if (['efil', 'elad', 'eulb'].includes(id) && (combined || mode !== 'portrait')) label.y = anchorPoint.y + 56
    if (id === 'noyreg' && (combined || mode !== 'portrait')) label = { ...label, x: anchorPoint.x + 46, y: anchorPoint.y + 8, anchor: 'start' }
    if (mode === 'portrait' && !combined && ['iomena', 'noyreg', 'eulb', 'enots'].includes(id)) label.y = anchorPoint.y + 58
    if (mode === 'portrait' && combined) {
      if (id === 'noira') label = { ...label, x: anchorPoint.x + 78, y: anchorPoint.y + 8, anchor: 'start' }
      if (['kcalbeloh', 'sunorc', 'aralca'].includes(id)) label = { ...label, x: anchorPoint.x + 78, y: anchorPoint.y + 8, anchor: 'start' }
      if (id === 'simesystem') label = { ...label, x: anchorPoint.x + 70, y: anchorPoint.y + 8, anchor: 'start' }
      if (id === 'sunorc') label = { ...label, x: anchorPoint.x - 78, y: anchorPoint.y + 8, anchor: 'end' }
      if (id === 'arorua') label.y = anchorPoint.y + 56
    }
    labels.push(label)
    if (combined) for (const node of nodes) nodePanels.set(node.id, pack.mapRegions!.find(region => region.bodyIds.includes(body.id))!.id)
  }
  // Close-ups crop to their own constellation while retaining its deliberate
  // branch geometry and an outside routing margin.
  const labelWidth = (label: BodyLabel) => (label.displayName ?? label.body.name).length * (label.fontSize ?? 24) * .6
  const left = Math.min(...[...nodePositions.values()].map(point => point.x - 38), ...labels.map(label => label.x - (label.anchor === 'middle' ? labelWidth(label) / 2 : label.anchor === 'end' ? labelWidth(label) : 0)))
  const right = Math.max(...[...nodePositions.values()].map(point => point.x + 38), ...labels.map(label => label.x + (label.anchor === 'middle' ? labelWidth(label) / 2 : label.anchor === 'start' ? labelWidth(label) : 0)))
  const top = Math.min(...[...nodePositions.values()].map(point => point.y - 38), ...labels.map(label => label.y - (label.fontSize ?? 24) * .85))
  const bottom = Math.max(...[...nodePositions.values()].map(point => point.y + 38), ...labels.map(label => label.y + (label.fontSize ?? 24) * .3))
  const dx = 44 - left, dy = 44 - top
  for (const [id, point] of nodePositions) nodePositions.set(id, p(point.x + dx, point.y + dy))
  for (const label of labels) { label.x += dx; label.y += dy }
  const panels = combined ? pack.mapRegions!.map(region => {
    const points = pack.nodes.filter(node => region.bodyIds.includes(node.bodyId)).map(node => nodePositions.get(node.id)!)
    return { id: region.id, label: region.label, color: pack.bodies.find(body => region.bodyIds.includes(body.id))?.color ?? '#a7bed7',
      x: Math.min(...points.map(point => point.x)) - 40, y: Math.min(...points.map(point => point.y)) - 40,
      width: Math.max(...points.map(point => point.x)) - Math.min(...points.map(point => point.x)) + 80,
      height: Math.max(...points.map(point => point.y)) - Math.min(...points.map(point => point.y)) + 80 }
  }) : undefined
  return { width: right - left + 88, height: bottom - top + 88, mode, nodePositions, labels,
    radius: 28, hitRadius: 35, hubId: undefined, nodeFontSize: mode === 'portrait' ? 23 : 21,
    labelFontSize: 24, presentation: combined ? 'system' : 'regional',
    backgroundPairs: primaryKcalbelohPairs(pack), ...(combined ? { panels, nodePanels } : {}) }
}

/** A complete regional overview is presentation only: every state keeps its ID. */
function createRegionOverview(pack: PlanetPack, mode: MapMode): MapLayout | undefined {
  const regions = pack.mapRegions!
  if (regions.length !== 5 || !hasKcalbelohSystemView(pack)) return
  if (pack.nodes.some(node => regions.filter(region => region.bodyIds.includes(node.bodyId)).length !== 1)) return
  const primaryRegion = regions.find(region => !kcalbelohRegionRoots.some(([id]) => id === region.id))
  if (!primaryRegion) return
  const primaryPack = packForMapRegion(pack, primaryRegion.id)
  const primary = createMapLayout(primaryPack, 'short')
  if (primary.presentation !== 'stock' && primary.presentation !== 'opm') return
  const secondaryPack = packForMapRegion(pack, kcalbelohSystemViewId)
  const secondary = createKcalbelohOverview(secondaryPack, 'short')
  if (!secondary) return

  // Reuse both schematics at a common marker size. Only translate and uniformly
  // scale them: their internal routes, moon families and proportions stay intact.
  const radius = 28
  const primaryScale = radius / primary.radius
  const secondaryScale = radius / secondary.radius
  const primaryWidth = primary.width * primaryScale
  const primaryHeight = primary.height * primaryScale
  const secondaryWidth = secondary.width * secondaryScale
  const secondaryHeight = secondary.height * secondaryScale
  const primaryOffset = p(44, 64)
  // Empty corners interlock on regular desktops. Very short/wide screens put
  // the same two schematics alongside each other instead of using generic rows.
  const secondaryOffset = mode === 'short'
    ? p(primaryWidth + 220, 64)
    : p(primaryWidth * .5 + 44 + (primary.presentation === 'opm' ? 130 : 0), primaryHeight * .78 + 64)
  const panels: MapPanel[] = []
  const panelContents = new Map<string, PanelContent>()
  const nodePositions = new Map<string, Point>()
  const nodePanels = new Map<string, string>()
  const labels: BodyLabel[] = []
  const backgroundPairs = new Set<string>()
  const addSystem = (id: string, label: string, childPack: PlanetPack, child: MapLayout, scale: number, offset: Point) => {
    panels.push({ id, label, x: offset.x - 20, y: offset.y - 64,
      width: child.width * scale + 40, height: child.height * scale + 84,
      color: id === primaryRegion.id ? '#83c8f2' : '#b5a8d2',
      ...(id === primaryRegion.id ? { heading: p(offset.x, offset.y - 34) } : {}) })
    panelContents.set(id, { pack: childPack, layout: child, scaleX: scale, scaleY: scale, offset })
    const transform = (point: Point) => p(offset.x + point.x * scale, offset.y + point.y * scale)
    for (const [nodeId, point] of child.nodePositions) {
      nodePositions.set(nodeId, transform(point))
      nodePanels.set(nodeId, id)
    }
    labels.push(...child.labels.map(label => ({ ...label, ...transform(label),
      fontSize: (label.fontSize ?? child.labelFontSize) * scale,
      ...(label.maxWidth ? { maxWidth: label.maxWidth * scale } : {}),
      ...(label.body.id === 'kcalbeloh:kcalbeloh' ? { displayName: 'Kcalbeloh system' } : {}),
    })))
    for (const edge of [...childPack.maneuvers, ...(childPack.unpricedConnections ?? [])]) {
      const pair = JSON.stringify([edge.from, edge.to].sort())
      if (child.backgroundPairs ? child.backgroundPairs.has(pair) : !('directTransfer' in edge && edge.directTransfer)) backgroundPairs.add(pair)
    }
  }
  addSystem(primaryRegion.id, primaryRegion.label, primaryPack, primary, primaryScale, primaryOffset)
  addSystem(kcalbelohSystemViewId, 'Kcalbeloh system', secondaryPack, secondary, secondaryScale, secondaryOffset)
  for (const edge of [...pack.maneuvers, ...(pack.unpricedConnections ?? [])]) {
    if (nodePanels.get(edge.from) !== nodePanels.get(edge.to)) backgroundPairs.add(JSON.stringify([edge.from, edge.to].sort()))
  }
  return {
    width: Math.max(primaryOffset.x + primaryWidth, secondaryOffset.x + secondaryWidth) + 44,
    height: Math.max(primaryOffset.y + primaryHeight, secondaryOffset.y + secondaryHeight) + 44,
    mode, nodePositions, labels, radius, hitRadius: 34, hubId: findHub(pack), nodeFontSize: mode === 'short' ? 23 : 21, labelFontSize: 24,
    presentation: 'overview', panels, nodePanels, panelContents, backgroundPairs,
    overviewSwitchRatio: (primaryWidth + secondaryWidth + 264) / (primaryHeight * .78 + secondaryHeight + 108),
  }
}

function bodyGroups(pack: PlanetPack): CelestialBody[][] {
  const active = new Set(pack.nodes.map(node => node.bodyId))
  const byId = new Map(pack.bodies.map(body => [body.id, body]))
  const visited = new Set<string>()
  const groups: CelestialBody[][] = []
  function visit(body: CelestialBody, group: CelestialBody[]) {
    if (visited.has(body.id)) return
    visited.add(body.id)
    if (active.has(body.id)) group.push(body)
    for (const child of pack.bodies.filter(candidate => candidate.parentId === body.id)) visit(child, group)
  }
  for (const body of pack.bodies) {
    if (body.parentId && byId.has(body.parentId)) continue
    if (!active.has(body.id) && body.kind === 'star') {
      visited.add(body.id)
      for (const child of pack.bodies.filter(candidate => candidate.parentId === body.id)) {
        const group: CelestialBody[] = []
        visit(child, group)
        if (group.length) groups.push(group)
      }
    } else {
      const group: CelestialBody[] = []
      visit(body, group)
      if (group.length) groups.push(group)
    }
  }
  // Also place isolated/cyclic hierarchy entries instead of silently dropping them.
  for (const body of pack.bodies) {
    if (visited.has(body.id)) continue
    const group: CelestialBody[] = []
    visit(body, group)
    if (group.length) groups.push(group)
  }
  return groups
}

function createGeneratedLayout(pack: PlanetPack, mode: MapMode): MapLayout {
  const groups = bodyGroups(pack)
  const count = groups.reduce((total, group) => total + group.length, 0)
  const columnCount = Math.min(Math.max(count, 1), mode === 'portrait' ? count > 20 ? 3 : 2 : mode === 'short' ? 4 : 3)
  const columns: CelestialBody[][] = Array.from({ length: columnCount }, () => [])
  const targetRows = Math.ceil(count / columnCount)
  for (const group of [...groups].sort((a, b) => b.length - a.length)) {
    // A single large stellar hierarchy must not force the entire pack into one
    // column. Smaller moon/submoon branches stay together where space permits.
    for (let offset = 0; offset < group.length; offset += targetRows || 1) {
      const chunk = group.slice(offset, offset + targetRows)
      const column = columns.reduce((best, candidate) => candidate.length < best.length ? candidate : best)
      column.push(...chunk)
    }
  }
  const radius = mode === 'wide' ? 30 : mode === 'short' ? 25 : 28
  const pitch = radius * 2 + (mode === 'wide' ? 18 : 6)
  const maxStates = Math.max(1, ...pack.bodies.map(body => pack.nodes.filter(node => node.bodyId === body.id).length))
  const cellWidth = Math.max(mode === 'wide' ? 340 : 270, (maxStates - 1) * pitch + radius * 2 + 38)
  const rowPitch = mode === 'wide' ? 108 : 82
  const maxRows = Math.max(1, ...columns.map(column => column.length))
  const nodePositions = new Map<string, Point>()
  const labels: BodyLabel[] = []
  const bodyRails = new Map<string, number>()
  for (const [columnIndex, column] of columns.entries()) {
    const left = 32 + columnIndex * cellWidth
    for (const [row, body] of column.entries()) {
      const y = 70 + row * rowPitch
      const nodes = pack.nodes.filter(node => node.bodyId === body.id)
        .sort((a, b) => kindOrder[a.kind] - kindOrder[b.kind] || a.id.localeCompare(b.id))
      nodes.forEach((node, index) => nodePositions.set(node.id, p(left + radius + index * pitch, y)))
      labels.push({ body, x: left, y: y - radius - 9, anchor: 'start', maxWidth: cellWidth - 26 })
      bodyRails.set(body.id, left + cellWidth - 12)
    }
  }
  return {
    width: 64 + columnCount * cellWidth,
    height: 70 + (maxRows - 1) * rowPitch + 80,
    mode, nodePositions, labels, radius, hitRadius: radius + 5,
    hubId: findHub(pack), nodeFontSize: mode === 'wide' ? 21 : 22,
    labelFontSize: mode === 'wide' ? 25 : 22, presentation: 'generated', bodyRails,
  }
}

interface TransferLabelBounds { left: number; right: number; top: number; bottom: number }
interface TransferRoutingLanes {
  xs: number[]
  ys: number[]
  labels: TransferLabelBounds[]
  states: { id: string; point: Point; radius: number }[]
}
const transferLanes = new WeakMap<MapLayout, TransferRoutingLanes>()
const transferPaths = new WeakMap<MapLayout, Map<string, Point[]>>()

function directRoutingLanes(layout: MapLayout): TransferRoutingLanes {
  const cached = transferLanes.get(layout)
  if (cached) return cached
  const halfBand = layout.mode === 'portrait' ? 6 : 9.5
  const padding = halfBand + 2
  const states = [...layout.nodePositions].map(([id, point]) => ({
    id, point, radius: layout.radius + (id === layout.hubId && layout.mode !== 'portrait' ? 9 : 0) + padding,
  }))
  const labels = layout.labels.map(label => {
    const width = Math.min(label.maxWidth ?? Infinity, (label.displayName ?? label.body.name).length * (label.fontSize ?? layout.labelFontSize) * .6)
    const left = label.anchor === 'middle' ? label.x - width / 2 : label.anchor === 'end' ? label.x - width : label.x
    return { left: left - padding, right: left + width + padding,
      top: label.y - (label.fontSize ?? layout.labelFontSize) * .85 - padding, bottom: label.y + (label.fontSize ?? layout.labelFontSize) * .25 + padding }
  })
  if (layout.presentation === 'overview') for (const panel of layout.panels ?? []) {
    if (panel.heading) labels.push({ left: panel.heading.x - padding, right: panel.heading.x + panel.label.length * 28 * .6 + padding,
      top: panel.heading.y - 28 * .85 - padding, bottom: panel.heading.y + 28 * .25 + padding })
  }
  const lanes = (values: number[], maximum: number) => [...new Set(values.filter(value => value >= padding && value <= maximum - padding))].sort((a, b) => a - b)
  const result = {
    states, labels,
    xs: lanes([padding, layout.width - padding, ...states.flatMap(({ point, radius }) => [point.x, point.x - radius - 1, point.x + radius + 1]),
      ...labels.flatMap(label => [label.left - 1, label.right + 1])], layout.width),
    ys: lanes([padding, layout.height - padding, ...states.flatMap(({ point, radius }) => [point.y, point.y - radius - 1, point.y + radius + 1]),
      ...labels.flatMap(label => [label.top - 1, label.bottom + 1])], layout.height),
  }
  transferLanes.set(layout, result)
  return result
}

/** Full maneuver geometry shared by the selected line and its moving highlight. */
export function maneuverPoints(edge: ManeuverEdge, layout: MapLayout, pack: PlanetPack): Point[] {
  const from = pack.nodes.find(node => node.id === edge.from)
  const to = pack.nodes.find(node => node.id === edge.to)
  if (!from || !to) return []
  if (!edge.directTransfer) return connectionPoints(from, to, layout, pack)
  const a = layout.nodePositions.get(from.id)
  const b = layout.nodePositions.get(to.id)
  if (!a || !b) return []
  if (layout.presentation === 'overview') {
    const fromPanel = layout.nodePanels!.get(from.id)
    const toPanel = layout.nodePanels!.get(to.id)
    if (fromPanel === toPanel && fromPanel !== undefined) {
      const content = layout.panelContents!.get(fromPanel)!
      return maneuverPoints(edge, content.layout, content.pack).map(point => p(content.offset.x + point.x * content.scaleX, content.offset.y + point.y * content.scaleY))
    }
    return connectionPoints(from, to, layout, pack)
  }

  // Opposite traversals share one canonical route, even on a generated map.
  const forward = from.id.localeCompare(to.id) <= 0
  const first = forward ? from : to
  const last = forward ? to : from
  const start = forward ? a : b
  const end = forward ? b : a
  let paths = transferPaths.get(layout)
  if (!paths) {
    paths = new Map()
    transferPaths.set(layout, paths)
  }
  const key = JSON.stringify([first.id, last.id])
  const cached = paths.get(key)
  if (cached) return forward ? cached : [...cached].reverse()
  const grid = directRoutingLanes(layout)
  const obstacles = grid.states.filter(state => state.id !== first.id && state.id !== last.id)
  const clear = (points: Point[]) => points.slice(1).every((to, index) => {
    const from = points[index]!
    const left = Math.min(from.x, to.x)
    const right = Math.max(from.x, to.x)
    const top = Math.min(from.y, to.y)
    const bottom = Math.max(from.y, to.y)
    return obstacles.every(({ point, radius }) => {
      const dx = Math.max(left - point.x, point.x - right, 0)
      const dy = Math.max(top - point.y, point.y - bottom, 0)
      return dx * dx + dy * dy >= radius * radius
    }) && grid.labels.every(label => right < label.left || left > label.right || bottom < label.top || top > label.bottom)
  })
  const points = routeBetweenPoints(start, end, grid.xs, grid.ys, clear) ?? [start, end]
  paths.set(key, points)
  return forward ? points : [...points].reverse()
}

export function connectionPoints(from: RouteNode, to: RouteNode, layout: MapLayout, pack: PlanetPack): Point[] {
  const a = layout.nodePositions.get(from.id)
  const b = layout.nodePositions.get(to.id)
  if (!a || !b) return []
  if (layout.presentation === 'overview') {
    const fromPanel = layout.nodePanels!.get(from.id)!
    const toPanel = layout.nodePanels!.get(to.id)!
    if (fromPanel === toPanel) {
      const content = layout.panelContents!.get(fromPanel)!
      return connectionPoints(from, to, content.layout, content.pack).map(point => p(content.offset.x + point.x * content.scaleX, content.offset.y + point.y * content.scaleY))
    }
    return regionalConnectionPoints(from, to, layout, pack)
  }
  if (layout.presentation === 'regional' || layout.presentation === 'system') return regionalConnectionPoints(from, to, layout, pack)
  if (layout.presentation === 'rss' && (from.id === layout.hubId || to.id === layout.hubId)) {
    const forward = from.id === layout.hubId
    const planet = shortId(forward ? to.bodyId : from.bodyId)
    // Keep outer solar branches in the clear corridor between Jupiter's states
    // and the lower Neptune/Pluto families, including compressed landscapes.
    const bends = planet === 'saturn' ? [p(1160, 590), p(1840, 590)]
      : planet === 'uranus' ? [p(1160, 620), p(1800, 620)] : []
    if (bends.length) {
      const points = [forward ? a : b,
        ...bends.map(point => layout.mode === 'short' ? p(point.x, 40 + point.y * 0.54) : point),
        forward ? b : a]
      return forward ? points : points.reverse()
    }
  }
  if (layout.presentation === 'rss' && from.bodyId !== to.bodyId) {
    const fromBody = pack.bodies.find(body => body.id === from.bodyId)
    const toBody = pack.bodies.find(body => body.id === to.bodyId)
    const parentFirst = toBody?.parentId === from.bodyId
    const parent = parentFirst ? fromBody : toBody
    if (parent && shortId(parent.id) === 'saturn') {
      const parentPoint = parentFirst ? a : b
      const childPoint = parentFirst ? b : a
      // The seven satellite fans need a landing corridor below their encounter
      // row, especially when the vertical distances are compressed on phones.
      const bendY = layout.mode === 'short' ? 40 + 445 * 0.54 : 445
      const points = [parentPoint, p(childPoint.x, bendY), childPoint]
      return parentFirst ? points : points.reverse()
    }
  }
  if (layout.presentation === 'opm' && (from.id === layout.hubId || to.id === layout.hubId)) {
    const forward = from.id === layout.hubId
    const planet = shortId(forward ? to.bodyId : from.bodyId)
    // These branches need a clear corridor below Jool. A straight Sarnus band
    // crosses Jool low orbit, while a straight Urlum band clips Neidon encounter.
    // Bends are presentation geometry, not additional route states or costs.
    const bends = planet === 'sarnus' ? [p(1430, 580)]
      : planet === 'urlum' ? [p(1360, 590), p(1660, 590)] : []
    if (bends.length) {
      const points = [forward ? a : b,
        ...bends.map(point => layout.mode === 'short' ? p(point.x, 40 + point.y * 0.54) : point),
        forward ? b : a]
      return forward ? points : points.reverse()
    }
  }
  if (layout.presentation === 'generated' && from.bodyId !== to.bodyId) {
    // Routing is canonical, so a return leg follows precisely the same band.
    // This also handles links between two non-home planets and nested moons.
    const forward = from.id.localeCompare(to.id) <= 0
    const source = forward ? from : to
    const target = forward ? to : from
    const start = forward ? a : b
    const end = forward ? b : a
    const sourceRail = layout.bodyRails?.get(source.bodyId) ?? start.x
    const targetRail = layout.bodyRails?.get(target.bodyId) ?? end.x
    const gap = layout.radius + 8
    const direction = end.y >= start.y ? 1 : -1
    const startY = start.y + gap * direction
    const endY = end.y - gap * direction
    const points = sourceRail === targetRail
      ? [start, p(start.x, startY), p(sourceRail, startY), p(sourceRail, endY), p(end.x, endY), end]
      : [start, p(start.x, startY), p(sourceRail, startY), p(sourceRail, layout.height - 20), p(targetRail, layout.height - 20), p(targetRail, endY), p(end.x, endY), end]
    return forward ? points : points.reverse()
  }
  if (layout.mode !== 'portrait' || from.bodyId === to.bodyId) return [a, b]
  const fromBody = pack.bodies.find(body => body.id === from.bodyId)
  const toBody = pack.bodies.find(body => body.id === to.bodyId)
  const isInterplanetary = from.kind === 'encounter' && to.kind === 'encounter'
    && fromBody?.kind === 'planet' && toBody?.kind === 'planet'
  if (isInterplanetary) {
    const forward = from.id === layout.hubId
    const hub = forward ? a : b
    const planet = forward ? b : a
    const planetId = shortId(forward ? to.bodyId : from.bodyId)
    const lanes: Record<string, number> = { moho: 316, eve: 324, duna: 332, dres: 340, jool: 348, eeloo: 356 }
    const lane = lanes[planetId] ?? 336
    const points = [hub, p(lane, hub.y), p(lane, planet.y), planet]
    return forward ? points : points.reverse()
  }
  const parentFirst = toBody?.parentId === from.bodyId
  const parent = parentFirst ? a : b
  const child = parentFirst ? b : a
  const parentBody = parentFirst ? fromBody : toBody
  const lane = shortId(parentBody?.id ?? '') === 'jool' ? 380 : 300
  const points = [parent, p(parent.x, parent.y + 35), p(lane, parent.y + 35), p(lane, child.y - 35), p(child.x, child.y - 35), child]
  return parentFirst ? points : points.reverse()
}

/** Keep every local band clear of the state markers and the displayed names. */
function regionalConnectionPoints(from: RouteNode, to: RouteNode, layout: MapLayout, pack: PlanetPack): Point[] {
  const forward = from.id.localeCompare(to.id) <= 0
  const first = forward ? from : to
  const last = forward ? to : from
  const start = layout.nodePositions.get(first.id)!
  const end = layout.nodePositions.get(last.id)!
  let paths = transferPaths.get(layout)
  if (!paths) { paths = new Map(); transferPaths.set(layout, paths) }
  const key = JSON.stringify([first.id, last.id])
  let result = paths.get(key)
  if (!result) {
    const grid = directRoutingLanes(layout)
    const obstacles = grid.states.filter(state => state.id !== first.id && state.id !== last.id)
    const intersects = (a: Point, b: Point, rectangle: TransferLabelBounds) => {
      let low = 0, high = 1
      for (const [start, delta, minimum, maximum] of [
        [a.x, b.x - a.x, rectangle.left, rectangle.right], [a.y, b.y - a.y, rectangle.top, rectangle.bottom],
      ]) {
        if (delta === 0) { if (start! < minimum! || start! > maximum!) return false; continue }
        const first = (minimum! - start!) / delta!, last = (maximum! - start!) / delta!
        low = Math.max(low, Math.min(first, last)); high = Math.min(high, Math.max(first, last))
        if (high < low) return false
      }
      return high >= low
    }
    const clear = (points: Point[]) => points.every(point => point.x >= 0 && point.x <= layout.width && point.y >= 0 && point.y <= layout.height)
      && points.slice(1).every((b, index) => {
        const a = points[index]!
        const dx = b.x - a.x, dy = b.y - a.y, lengthSquared = dx * dx + dy * dy
        return obstacles.every(({ point, radius }) => {
          const t = lengthSquared ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared)) : 0
          return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy) >= radius
        }) && grid.labels.every(label => !intersects(a, b, label))
      })
    const candidates = [[start, end]]
    for (const x of grid.xs) candidates.push([start, p(x, start.y), end], [start, p(x, end.y), end], [start, p(x, start.y), p(x, end.y), end])
    for (const y of grid.ys) candidates.push([start, p(start.x, y), end], [start, p(end.x, y), end], [start, p(start.x, y), p(end.x, y), end])
    const length = (points: Point[]) => points.slice(1).reduce((total, point, index) => total + Math.hypot(point.x - points[index]!.x, point.y - points[index]!.y), 0)
    // An inter-body transfer must visibly leave the orbit, rather than doubling
    // back over its landing stub and appearing to branch from the surface.
    const stubPenalty = (points: Point[]) => first.bodyId === last.bodyId ? 0 : [first, last].reduce((total, node, index) => {
      if (node.kind !== 'orbit' || points.length < 3) return total
      const surface = pack.nodes.find(candidate => candidate.bodyId === node.bodyId && candidate.kind === 'surface')
      const surfacePoint = surface && layout.nodePositions.get(surface.id)
      if (!surfacePoint) return total
      const origin = index === 0 ? points[0]! : points.at(-1)!
      const next = index === 0 ? points[1]! : points.at(-2)!
      const ax = next.x - origin.x, ay = next.y - origin.y
      const bx = surfacePoint.x - origin.x, by = surfacePoint.y - origin.y
      const scale = Math.hypot(ax, ay) * Math.hypot(bx, by)
      return total + (scale > 0 && ax * bx + ay * by > 0 && Math.abs(ax * by - ay * bx) < scale * .1 ? 240 : 0)
    }, 0)
    const score = (points: Point[]) => length(points) + (points.length - 2) * 18 + stubPenalty(points)
    result = candidates.filter(clear).sort((a, b) => score(a) - score(b))[0]
      ?? routeBetweenPoints(start, end, grid.xs, grid.ys, clear)
      ?? [start, end]
    // Repeated corners add no geometry and make route highlights harder to read.
    result = result.filter((point, index) => !index || point.x !== result![index - 1]!.x || point.y !== result![index - 1]!.y)
    paths.set(key, result)
  }
  return forward ? result : [...result].reverse()
}

export const pathFromPoints = (points: Point[]) => points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ')

/** Locate a directed arrow away from state markers on the longest segment. */
export function arrowPosition(points: Point[]): (Point & { angle: number }) | undefined {
  let longest = 0
  let result: (Point & { angle: number }) | undefined
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1]
    const b = points[index]
    if (!a || !b) continue
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    if (length > longest) {
      longest = length
      result = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, angle: Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI }
    }
  }
  return result
}
