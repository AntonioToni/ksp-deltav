import type { CelestialBody, NodeKind, PlanetPack, RouteNode } from '../types/planner'

export interface Point { x: number; y: number }
export type MapMode = 'wide' | 'portrait' | 'short'
export interface BodyLabel extends Point {
  body: CelestialBody
  anchor: 'start' | 'middle' | 'end'
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

export function createMapLayout(pack: PlanetPack, mode: MapMode = 'wide'): MapLayout {
  const nodePositions = new Map<string, Point>()
  const labels: BodyLabel[] = []
  const hubId = pack.nodes.find(node => shortId(node.bodyId) === 'kerbin' && node.kind === 'encounter')?.id
  for (const [bodyIndex, body] of pack.bodies.filter(body => body.kind !== 'star').entries()) {
    const id = shortId(body.id)
    const nodes = pack.nodes.filter(node => node.bodyId === body.id)
    if (mode === 'portrait') {
      let column = portraitColumns.findIndex(ids => ids.includes(id))
      if (column < 0) column = bodyIndex % 2
      const row = portraitColumns[column]?.indexOf(id) ?? -1
      const y = 80 + (row < 0 ? Math.floor(bodyIndex / 2) : row) * 90
      const xByKind: Record<NodeKind, number> = column === 0
        ? { surface: 56, orbit: 124, elliptical: 192, encounter: 260 }
        : { surface: 624, orbit: 556, elliptical: 488, encounter: 420 }
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
  }
}

export function connectionPoints(from: RouteNode, to: RouteNode, layout: MapLayout, pack: PlanetPack): Point[] {
  const a = layout.nodePositions.get(from.id)
  const b = layout.nodePositions.get(to.id)
  if (!a || !b) return []
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
