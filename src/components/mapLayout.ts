import type { CelestialBody, NodeKind, PlanetPack, RouteNode } from '../types/planner'
import { routeToGutter } from './mapRouting'

export interface Point { x: number; y: number }
export type MapMode = 'wide' | 'portrait' | 'short'
export interface BodyLabel extends Point {
  body: CelestialBody
  anchor: 'start' | 'middle' | 'end'
  maxWidth?: number
}
export interface MapPanel extends Point {
  id: string
  label: string
  width: number
  height: number
  color: string
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
  presentation: 'stock' | 'opm' | 'rss' | 'generated' | 'overview'
  bodyRails?: Map<string, number>
  panels?: MapPanel[]
  nodePanels?: Map<string, string>
  panelContents?: Map<string, PanelContent>
  overviewRailY?: number
}

/** A map view never changes the source pack or the graph used for missions. */
export function packForMapRegion(pack: PlanetPack, regionId: string): PlanetPack {
  const region = pack.mapRegions?.find(candidate => candidate.id === regionId)
  if (!region || regionId === 'all') return pack
  const bodyIds = new Set(region.bodyIds)
  const nodes = pack.nodes.filter(node => bodyIds.has(node.bodyId))
  const nodeIds = new Set(nodes.map(node => node.id))
  return {
    ...pack,
    bodies: pack.bodies.filter(body => bodyIds.has(body.id)),
    nodes,
    maneuvers: pack.maneuvers.filter(edge => nodeIds.has(edge.from) && nodeIds.has(edge.to)),
    ...(pack.unpricedConnections ? { unpricedConnections: pack.unpricedConnections.filter(edge => nodeIds.has(edge.from) && nodeIds.has(edge.to)) } : {}),
    mapRegions: undefined,
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
  if (mode === 'wide' && pack.mapRegions?.length) {
    const overview = createRegionOverview(pack)
    if (overview) return overview
  }
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
      if (point) nodePositions.set(node.id, mode === 'short' ? p(point.x, 25 + point.y * 0.56) : point)
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
        ? surface && ['kerbin', 'minmus', 'mun', 'eeloo'].includes(id)
          ? 25 + surface.y * 0.56 + 40
          : 25 + label.y * 0.56
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

/** A complete regional overview is presentation only: every state keeps its ID. */
function createRegionOverview(pack: PlanetPack): MapLayout | undefined {
  const regions = pack.mapRegions!
  if (regions.length < 2 || regions.length > 5 || new Set(regions.map(region => region.id)).size !== regions.length) return
  if (pack.nodes.some(node => regions.filter(region => region.bodyIds.includes(node.bodyId)).length !== 1)) return
  const primaryPack = packForMapRegion(pack, regions[0]!.id)
  const primary = createMapLayout(primaryPack, 'short')
  if (primary.presentation !== 'stock' && primary.presentation !== 'opm') return

  const width = 2700
  const panels: MapPanel[] = []
  const panelContents = new Map<string, PanelContent>()
  const nodePositions = new Map<string, Point>()
  const nodePanels = new Map<string, string>()
  const labels: BodyLabel[] = []
  const addPanel = (panel: MapPanel, content: PanelContent) => {
    panels.push(panel)
    panelContents.set(panel.id, content)
    const transform = (point: Point) => p(content.offset.x + point.x * content.scaleX, content.offset.y + point.y * content.scaleY)
    for (const [id, point] of content.layout.nodePositions) {
      nodePositions.set(id, transform(point))
      nodePanels.set(id, panel.id)
    }
    labels.push(...content.layout.labels.map(label => ({ ...label, ...transform(label), ...(label.maxWidth ? { maxWidth: label.maxWidth * content.scaleX } : {}) })))
  }
  // Keep the familiar home-system schematic; its short preset makes room for
  // the add-on without squeezing the OPM families into a half-width thumbnail.
  const scale = primary.presentation === 'stock' ? 1.3 : 1
  const contentBottom = Math.max(
    ...[...primary.nodePositions.values()].map(point => point.y * scale + 32),
    ...primary.labels.map(label => label.y * scale + 21 * .3),
  )
  const primaryHeight = 48 + contentBottom + 16
  addPanel({ id: regions[0]!.id, label: regions[0]!.label, x: 24, y: 12, width: width - 48, height: primaryHeight, color: '#83c8f2' }, {
    pack: primaryPack, layout: primary, scaleX: scale, scaleY: scale,
    offset: p((width - primary.width * scale) / 2, 60),
  })

  const secondary = regions.slice(1).map(region => {
    const regionalPack = packForMapRegion(pack, region.id)
    return { region, pack: regionalPack, layout: createOverviewRegion(regionalPack) }
  })
  if (secondary.some(content => !content.pack.nodes.length || content.pack.bodies.some(body => content.pack.nodes.filter(node => node.bodyId === body.id).length > 2))) return
  const gap = 24
  const available = width - 48 - gap * (secondary.length - 1)
  const naturalWidth = secondary.reduce((sum, content) => sum + content.layout.width + 32, 0)
  const horizontalScale = Math.min(1, available / naturalWidth)
  const panelHeight = Math.max(...secondary.map(content => content.layout.height)) + 54
  const top = primaryHeight + 68
  let left = (width - (naturalWidth * horizontalScale + gap * (secondary.length - 1))) / 2
  for (const content of secondary) {
    const panelWidth = (content.layout.width + 32) * horizontalScale
    addPanel({ id: content.region.id, label: content.region.label, x: left, y: top, width: panelWidth, height: panelHeight, color: content.pack.bodies.find(body => content.pack.nodes.some(node => node.bodyId === body.id))?.color ?? '#a7bed7' }, {
      pack: content.pack, layout: content.layout, scaleX: horizontalScale, scaleY: 1,
      offset: p(left + 16 * horizontalScale, top + 44),
    })
    left += panelWidth + gap
  }
  const result: MapLayout = {
    width, height: top + panelHeight + 20, mode: 'wide', nodePositions, labels,
    radius: 24, hitRadius: 32, hubId: findHub(pack), nodeFontSize: 18, labelFontSize: 21,
    presentation: 'overview', panels, nodePanels, panelContents, overviewRailY: primaryHeight + 40,
  }
  const nodes = new Map(pack.nodes.map(node => [node.id, node]))
  for (const edge of [...pack.maneuvers, ...(pack.unpricedConnections ?? [])]) {
    if (nodePanels.get(edge.from) === nodePanels.get(edge.to)) continue
    for (const id of [edge.from, edge.to]) {
      const node = nodes.get(id)
      if (node && !overviewExit(node, result)) return
    }
  }
  return result
}

/** Compact rows put names beside states, leaving clear lanes between rows. */
function createOverviewRegion(pack: PlanetPack): MapLayout {
  const active = new Set(pack.nodes.map(node => node.bodyId))
  const root = pack.bodies.find(body => !pack.bodies.some(parent => parent.id === body.parentId))
  const groups: CelestialBody[][] = []
  const visited = new Set<string>()
  const visit = (body: CelestialBody, group: CelestialBody[]) => {
    if (visited.has(body.id)) return
    visited.add(body.id)
    if (active.has(body.id)) group.push(body)
    for (const child of pack.bodies.filter(candidate => candidate.parentId === body.id)) visit(child, group)
  }
  if (root) {
    visited.add(root.id)
    if (active.has(root.id)) groups.push([root])
    for (const child of pack.bodies.filter(body => body.parentId === root.id)) {
      const group: CelestialBody[] = []
      visit(child, group)
      if (group.length) groups.push(group)
    }
  }
  for (const body of pack.bodies) if (!visited.has(body.id)) {
    const group: CelestialBody[] = []
    visit(body, group)
    if (group.length) groups.push(group)
  }
  const columnCount = active.size > 6 ? 2 : 1
  const columns: CelestialBody[][] = Array.from({ length: columnCount }, () => [])
  const target = Math.ceil(active.size / columnCount)
  let column = 0
  for (const group of groups) {
    if (columns[column]!.length && columns[column]!.length + group.length > target && column < columnCount - 1) column++
    columns[column]!.push(...group)
  }
  const nodePositions = new Map<string, Point>()
  const labels: BodyLabel[] = []
  const bodyRails = new Map<string, number>()
  const cellWidth = 400
  for (const [index, bodies] of columns.entries()) for (const [row, body] of bodies.entries()) {
    const x = index * cellWidth
    const y = 48 + row * 68
    const nodes = pack.nodes.filter(node => node.bodyId === body.id).sort((a, b) => kindOrder[a.kind] - kindOrder[b.kind] || a.id.localeCompare(b.id))
    nodes.forEach((node, state) => nodePositions.set(node.id, p(x + 40 + state * 72, y)))
    labels.push({ body, x: x + 154, y: y + 7, anchor: 'start', maxWidth: cellWidth - 180 })
    bodyRails.set(body.id, x + cellWidth - 8)
  }
  return {
    width: columnCount * cellWidth, height: 48 + (Math.max(...columns.map(bodies => bodies.length)) - 1) * 68 + 64,
    mode: 'wide', nodePositions, labels, bodyRails, radius: 24, hitRadius: 32,
    hubId: undefined, nodeFontSize: 18, labelFontSize: 21, presentation: 'generated',
  }
}

/** Group hierarchy branches without assuming a home planet, namespace or depth. */
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
    const forward = from.id.localeCompare(to.id) <= 0
    const startNode = forward ? from : to
    const endNode = forward ? to : from
    const start = overviewExit(startNode, layout)!
    const end = overviewExit(endNode, layout)!
    const points = [...start, ...[...end].reverse()]
    return forward ? points : points.reverse()
  }
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

/** Reach the shared inter-system gutter without passing through other states.
 * Ports are selected from clear orthogonal lanes in the endpoint's own panel.
 * The same deterministic port is used in both directions and after pricing a link.
 */
const overviewPorts = new WeakMap<MapLayout, Map<string, Point[]>>()
function overviewExit(node: RouteNode, layout: MapLayout): Point[] | undefined {
  let ports = overviewPorts.get(layout)
  if (!ports) {
    ports = new Map()
    overviewPorts.set(layout, ports)
  }
  const cached = ports.get(node.id)
  if (cached) return cached
  const start = layout.nodePositions.get(node.id)!
  const panel = layout.panels!.find(panel => panel.id === layout.nodePanels!.get(node.id))!
  const railY = layout.overviewRailY!
  const margin = layout.radius + 10
  const others = [...layout.nodePositions].filter(([id]) => id !== node.id).map(([, point]) => point)
  const textBounds = [
    ...layout.labels.map(label => {
      const width = Math.min(label.maxWidth ?? Infinity, label.body.name.length * layout.labelFontSize * .6)
      const left = label.anchor === 'middle' ? label.x - width / 2 : label.anchor === 'end' ? label.x - width : label.x
      return { left: left - 5, right: left + width + 5, top: label.y - layout.labelFontSize * .85 - 4, bottom: label.y + layout.labelFontSize * .25 + 4 }
    }),
    ...layout.panels!.map(panel => ({ left: panel.x + 16, right: panel.x + 42 + panel.label.length * 24 * .6, top: panel.y + 10, bottom: panel.y + 43 })),
  ]
  const rails = [panel.x + 12, panel.x + panel.width - 12,
    ...others.flatMap(point => [point.x - margin - 2, point.x + margin + 2])]
    .filter(x => x >= panel.x + 10 && x <= panel.x + panel.width - 10)
  const clear = (points: Point[]) => points.slice(1).every((b, index) => {
    const a = points[index]!
    const statesClear = others.every(point => {
      const dx = b.x - a.x
      const dy = b.y - a.y
      const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1)))
      return Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t)) > margin
    })
    return statesClear && textBounds.every(rectangle => Math.max(a.x, b.x) < rectangle.left || Math.min(a.x, b.x) > rectangle.right
      || Math.max(a.y, b.y) < rectangle.top || Math.min(a.y, b.y) > rectangle.bottom)
  })
  const candidates = rails.flatMap(x => [start.y + 32, start.y - 32].map(y => [start, p(start.x, y), p(x, y), p(x, railY)]))
    .filter(points => points[1]!.y > panel.y + 40 && points[1]!.y < panel.y + panel.height - 4 && clear(points))
  candidates.sort((a, b) => {
    const length = (points: Point[]) => points.slice(1).reduce((sum, point, index) => sum + Math.abs(point.x - points[index]!.x) + Math.abs(point.y - points[index]!.y), 0)
    return length(a) - length(b)
  })
  // Dense OPM families can need several turns to avoid both states and names.
  // Search only obstacle-edge lanes, once per endpoint in this layout.
  const lanes = (values: number[], minimum: number, maximum: number) => [...new Set(values.filter(value => value >= minimum && value <= maximum))].sort((a, b) => a - b)
  const result = candidates[0] ?? routeToGutter(start, railY,
    lanes([start.x, ...rails, ...textBounds.flatMap(rectangle => [rectangle.left - 2, rectangle.right + 2])], panel.x + 10, panel.x + panel.width - 10),
    lanes([start.y, railY, ...others.flatMap(point => [point.y - margin - 2, point.y + margin + 2]),
      ...textBounds.flatMap(rectangle => [rectangle.top - 2, rectangle.bottom + 2])], Math.min(panel.y + 44, railY), Math.max(panel.y + panel.height - 4, railY)), clear)
  if (result) ports.set(node.id, result)
  return result
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
