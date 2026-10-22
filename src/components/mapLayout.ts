import type { CelestialBody, NodeKind, PlanetPack } from '../types/planner'

export interface Point { x: number; y: number }

export interface BodyPosition {
  body: CelestialBody
  x: number
  y: number
}

export interface SystemPosition {
  id: string
  name: string
  y: number
  height: number
  bodies: BodyPosition[]
}

const CARD_WIDTH = 218
const CARD_GAP = 16
const BAND_HEIGHT = 174
const ROW_HEIGHT = 142
const COLUMNS = 3
const STATE_X: Record<NodeKind, number> = { surface: 31, orbit: 83, elliptical: 135, encounter: 187 }

/** Schematic coordinates are deliberately independent of orbital/physical data. */
export function createMapLayout(pack: PlanetPack) {
  const planets = pack.bodies.filter(body => body.kind === 'planet')
  let nextY = 112
  const systems: SystemPosition[] = planets.map(planet => {
    const bodies = [planet, ...pack.bodies.filter(body => body.parentId === planet.id)]
    const y = nextY
    const height = BAND_HEIGHT + (Math.ceil(bodies.length / COLUMNS) - 1) * ROW_HEIGHT
    nextY += height
    return {
      id: planet.id,
      name: `${planet.name} system`,
      y,
      height,
      bodies: bodies.map((body, bodyIndex) => ({
        body,
        x: 48 + (bodyIndex % COLUMNS) * (CARD_WIDTH + CARD_GAP),
        y: y + 33 + Math.floor(bodyIndex / COLUMNS) * ROW_HEIGHT,
      })),
    }
  })
  const nodePositions = new Map<string, Point>()
  const systemByBody = new Map<string, string>()
  for (const system of systems) {
    for (const position of system.bodies) {
      systemByBody.set(position.body.id, system.id)
      for (const node of pack.nodes.filter(node => node.bodyId === position.body.id)) {
        nodePositions.set(node.id, { x: position.x + STATE_X[node.kind], y: position.y + 66 })
      }
    }
  }
  return {
    systems,
    nodePositions,
    systemByBody,
    cardWidth: CARD_WIDTH,
    width: 800,
    height: nextY + 14,
  }
}

/** Different curves distinguish local, moon, and interplanetary connections. */
export function connectionPath(from: Point, to: Point, sameBody: boolean, lane: number, sameSystem = false) {
  const direction = from.x < to.x || (from.x === to.x && from.y < to.y) ? 1 : -1
  if (sameBody) {
    const y = from.y + direction * 5
    return `M ${from.x + direction * 13} ${y} L ${to.x - direction * 13} ${y}`
  }
  if (from.y === to.y) {
    const arch = 84 + (lane % 3) * 10
    return `M ${from.x} ${from.y - 13} C ${from.x} ${from.y - arch}, ${to.x} ${to.y - arch}, ${to.x} ${to.y - 13}`
  }
  if (sameSystem) {
    const verticalDirection = to.y > from.y ? 1 : -1
    const middle = (from.y + to.y) / 2
    return `M ${from.x} ${from.y + verticalDirection * 13} C ${from.x} ${middle}, ${to.x} ${middle}, ${to.x} ${to.y - verticalDirection * 13}`
  }
  const leftLane = 16 + (lane % 3) * 7
  const verticalDirection = to.y > from.y ? 1 : -1
  const departure = from.y + (verticalDirection > 0 ? 64 : -78)
  const arrival = to.y + (verticalDirection > 0 ? -78 : 64)
  return `M ${from.x} ${from.y + verticalDirection * 13} C ${from.x} ${departure}, ${leftLane} ${departure}, ${leftLane} ${departure} L ${leftLane} ${arrival} C ${leftLane} ${arrival}, ${to.x} ${arrival}, ${to.x} ${to.y - verticalDirection * 13}`
}
