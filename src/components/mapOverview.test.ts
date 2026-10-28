import { describe, expect, it } from 'vitest'
import { opmKcalbelohPack, stockKcalbelohPack } from '../data/kcalbeloh'
import { rssPack } from '../data/rss'
import type { PlanetPack } from '../types/planner'
import { connectionPoints, createMapLayout, packForMapRegion, type Point } from './mapLayout'

function distanceToSegment(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSquared = dx * dx + dy * dy
  const fraction = lengthSquared ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared)) : 0
  return Math.hypot(point.x - a.x - fraction * dx, point.y - a.y - fraction * dy)
}

function intersectsInterior(a: Point, b: Point, rectangle: { x: number; y: number; width: number; height: number }): boolean {
  // Open bounds allow paths along the frame or through the reserved gutters.
  const epsilon = 1e-6
  const minX = rectangle.x + epsilon
  const maxX = rectangle.x + rectangle.width - epsilon
  const minY = rectangle.y + epsilon
  const maxY = rectangle.y + rectangle.height - epsilon
  let low = 0
  let high = 1
  for (const [start, delta, minimum, maximum] of [
    [a.x, b.x - a.x, minX, maxX],
    [a.y, b.y - a.y, minY, maxY],
  ]) {
    if (delta === 0) {
      if (start! < minimum! || start! > maximum!) return false
      continue
    }
    const first = (minimum! - start!) / delta!
    const second = (maximum! - start!) / delta!
    low = Math.max(low, Math.min(first, second))
    high = Math.min(high, Math.max(first, second))
    if (high < low) return false
  }
  return high >= low
}

describe.each([stockKcalbelohPack, opmKcalbelohPack])('$name desktop overview', pack => {
  it('uses a landscape canvas and preserves every real state and body label', () => {
    const before = structuredClone(pack)
    const layout = createMapLayout(pack, 'wide')
    expect(layout.presentation).toBe('overview')
    expect(layout.width / layout.height).toBeGreaterThan(1.8)
    expect(layout.width / layout.height).toBeLessThan(2.5)
    expect(layout.nodePositions.size).toBe(pack.nodes.length)
    expect(new Set([...layout.nodePositions.values()].map(point => `${point.x},${point.y}`)).size).toBe(pack.nodes.length)
    expect(new Set(layout.labels.map(label => label.body.id))).toEqual(new Set(pack.nodes.map(node => node.bodyId)))
    for (const node of pack.nodes) {
      const point = layout.nodePositions.get(node.id)!
      const margin = Math.max(layout.hitRadius, layout.radius + 9)
      expect(Number.isFinite(point.x) && Number.isFinite(point.y), node.id).toBe(true)
      expect(point.x - margin, node.id).toBeGreaterThanOrEqual(0)
      expect(point.x + margin, node.id).toBeLessThanOrEqual(layout.width)
      expect(point.y - margin, node.id).toBeGreaterThanOrEqual(0)
      expect(point.y + margin, node.id).toBeLessThanOrEqual(layout.height)
    }
    expect(pack).toEqual(before)
  })

  it('separates the five system panels and assigns each state to its own region', () => {
    const layout = createMapLayout(pack, 'wide')
    const panels = layout.panels!
    expect(panels.map(panel => panel.id)).toEqual(pack.mapRegions!.map(region => region.id))
    for (const [index, panel] of panels.entries()) {
      expect(panel.x).toBeGreaterThanOrEqual(0)
      expect(panel.y).toBeGreaterThanOrEqual(0)
      expect(panel.x + panel.width).toBeLessThanOrEqual(layout.width)
      expect(panel.y + panel.height).toBeLessThanOrEqual(layout.height)
      for (const other of panels.slice(index + 1)) {
        expect(panel.x + panel.width <= other.x || other.x + other.width <= panel.x
          || panel.y + panel.height <= other.y || other.y + other.height <= panel.y,
        `${panel.id} overlaps ${other.id}`).toBe(true)
      }
      const bodyIds = new Set(pack.mapRegions!.find(region => region.id === panel.id)!.bodyIds)
      for (const node of pack.nodes.filter(node => bodyIds.has(node.bodyId))) {
        const point = layout.nodePositions.get(node.id)!
        expect(layout.nodePanels?.get(node.id), node.id).toBe(panel.id)
        expect(point.x - layout.radius, node.id).toBeGreaterThanOrEqual(panel.x)
        expect(point.x + layout.radius, node.id).toBeLessThanOrEqual(panel.x + panel.width)
        expect(point.y - layout.radius, node.id).toBeGreaterThanOrEqual(panel.y)
        expect(point.y + layout.radius, node.id).toBeLessThanOrEqual(panel.y + panel.height)
      }
      for (const label of layout.labels.filter(label => bodyIds.has(label.body.id))) {
        expect(label.x, label.body.id).toBeGreaterThanOrEqual(panel.x)
        expect(label.x, label.body.id).toBeLessThanOrEqual(panel.x + panel.width)
        expect(label.y - layout.labelFontSize, label.body.id).toBeGreaterThanOrEqual(panel.y)
        expect(label.y + layout.labelFontSize * .3, label.body.id).toBeLessThanOrEqual(panel.y + panel.height)
      }
    }
  })

  it('draws every priced and unpriced link reversibly between its actual state positions', () => {
    const before = structuredClone(pack)
    const layout = createMapLayout(pack, 'wide')
    const nodes = new Map(pack.nodes.map(node => [node.id, node]))
    for (const edge of [...pack.maneuvers, ...(pack.unpricedConnections ?? [])]) {
      const from = nodes.get(edge.from)!
      const to = nodes.get(edge.to)!
      const points = connectionPoints(from, to, layout, pack)
      expect(points.at(0), edge.id).toEqual(layout.nodePositions.get(from.id))
      expect(points.at(-1), edge.id).toEqual(layout.nodePositions.get(to.id))
      expect(connectionPoints(to, from, layout, pack), edge.id).toEqual([...points].reverse())
      for (const point of points) {
        expect(Number.isFinite(point.x) && Number.isFinite(point.y), edge.id).toBe(true)
        expect(point.x, edge.id).toBeGreaterThanOrEqual(0)
        expect(point.x, edge.id).toBeLessThanOrEqual(layout.width)
        expect(point.y, edge.id).toBeGreaterThanOrEqual(0)
        expect(point.y, edge.id).toBeLessThanOrEqual(layout.height)
      }
    }
    expect(pack).toEqual(before)
  })

  it('keeps cross-system paths out of unrelated panels and state circles', () => {
    const layout = createMapLayout(pack, 'wide')
    const nodes = new Map(pack.nodes.map(node => [node.id, node]))
    const regionFor = new Map(pack.nodes.map(node => [node.id, pack.mapRegions!.find(region => region.bodyIds.includes(node.bodyId))!.id]))
    const edges = [...pack.maneuvers, ...(pack.unpricedConnections ?? [])]
      .filter(edge => regionFor.get(edge.from) !== regionFor.get(edge.to))
    expect(edges.length).toBeGreaterThan(0)
    for (const edge of edges) {
      const points = connectionPoints(nodes.get(edge.from)!, nodes.get(edge.to)!, layout, pack)
      for (const panel of layout.panels!) {
        if (panel.id === regionFor.get(edge.from) || panel.id === regionFor.get(edge.to)) continue
        expect(points.slice(1).some((point, index) => intersectsInterior(points[index]!, point, panel)),
          `${edge.id} crosses unrelated ${panel.id} panel`).toBe(false)
      }
      for (const node of pack.nodes) {
        if (node.id === edge.from || node.id === edge.to) continue
        const point = layout.nodePositions.get(node.id)!
        const distance = Math.min(...points.slice(1).map((end, index) => distanceToSegment(point, points[index]!, end)))
        expect(distance, `${edge.id} passes ${node.label}`).toBeGreaterThan(layout.radius + 10)
      }
    }
  })

  it('retains the base system transfer clearance after transforming it into a panel', () => {
    const layout = createMapLayout(pack, 'wide')
    const nodes = new Map(pack.nodes.map(node => [node.id, node]))
    const planets = new Set(pack.bodies.filter(body => body.kind === 'planet').map(body => body.id))
    const transfers = pack.maneuvers.filter(edge => edge.from === layout.hubId
      && nodes.get(edge.to)?.kind === 'encounter' && planets.has(nodes.get(edge.to)!.bodyId))
    expect(transfers.length).toBeGreaterThan(0)
    for (const edge of transfers) {
      const points = connectionPoints(nodes.get(edge.from)!, nodes.get(edge.to)!, layout, pack)
      for (const node of pack.nodes) {
        if (node.id === edge.from || node.id === edge.to) continue
        const point = layout.nodePositions.get(node.id)!
        const distance = Math.min(...points.slice(1).map((end, index) => distanceToSegment(point, points[index]!, end)))
        expect(distance, `${edge.id} passes ${node.label}`).toBeGreaterThan(layout.radius + 10)
      }
    }
  })

  it('keeps regional and small-screen presentations independent of the desktop overview', () => {
    for (const mode of ['portrait', 'short'] as const) {
      const layout = createMapLayout(pack, mode)
      expect(layout.presentation).toBe('generated')
      expect(layout.nodePositions.size).toBe(pack.nodes.length)
    }
    for (const region of pack.mapRegions!) {
      const regionalPack = packForMapRegion(pack, region.id)
      const layout = createMapLayout(regionalPack, 'wide')
      expect(layout.presentation).not.toBe('overview')
      expect(layout.nodePositions.size).toBe(regionalPack.nodes.length)
    }
  })

  it('recognizes renamed composed packs without relying on the pack ID', () => {
    const renamed = { ...pack, id: 'community-composition', name: 'Community composition' }
    expect(createMapLayout(renamed, 'wide').presentation).toBe('overview')
    expect(createMapLayout(renamed, 'wide').nodePositions).toEqual(createMapLayout(pack, 'wide').nodePositions)
  })

  it.each(['uncovered', 'overlapping'] as const)('falls back without losing states for %s region metadata', kind => {
    const changed: PlanetPack = structuredClone(pack)
    const bodyId = changed.nodes[0]!.bodyId
    if (kind === 'uncovered') {
      changed.mapRegions = changed.mapRegions!.map(region => ({ ...region, bodyIds: region.bodyIds.filter(id => id !== bodyId) }))
    } else {
      changed.mapRegions![1]!.bodyIds.push(bodyId)
    }
    const layout = createMapLayout(changed, 'wide')
    expect(layout.presentation).toBe('generated')
    expect(layout.nodePositions.size).toBe(changed.nodes.length)
  })

  it('uses the generic layout when a secondary body gains more states than its compact row supports', () => {
    const extended: PlanetPack = {
      ...pack,
      nodes: [...pack.nodes, { id: 'community:suluco:high-orbit', bodyId: 'kcalbeloh:suluco', kind: 'elliptical', label: 'Suluco community high orbit' }],
    }
    const layout = createMapLayout(extended, 'wide')
    expect(layout.presentation).toBe('generated')
    expect(layout.nodePositions.size).toBe(extended.nodes.length)
    expect(new Set([...layout.nodePositions.values()].map(point => `${point.x},${point.y}`)).size).toBe(extended.nodes.length)
  })
})

it('keeps an unsupported RSS regional extension in the generic layout without cropping its wider primary', () => {
  const distant = packForMapRegion(stockKcalbelohPack, 'maelg')
  const extended: PlanetPack = {
    ...rssPack,
    bodies: [...rssPack.bodies, ...distant.bodies],
    nodes: [...rssPack.nodes, ...distant.nodes],
    maneuvers: [...rssPack.maneuvers, ...distant.maneuvers],
    mapRegions: [
      { id: 'sol', label: 'Solar System', bodyIds: rssPack.bodies.map(body => body.id) },
      { id: 'distant', label: 'Distant system', bodyIds: distant.bodies.map(body => body.id) },
    ],
  }
  const layout = createMapLayout(extended, 'wide')
  expect(layout.presentation).toBe('generated')
  expect(layout.nodePositions.size).toBe(extended.nodes.length)
})
