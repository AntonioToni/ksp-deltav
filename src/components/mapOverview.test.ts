import { describe, expect, it } from 'vitest'
import { opmKcalbelohNoWormholesPack, opmKcalbelohPack, stockKcalbelohNoWormholesPack, stockKcalbelohPack } from '../data/kcalbeloh'
import { rssPack } from '../data/rss'
import type { PlanetPack } from '../types/planner'
import { connectionPoints, createMapLayout, kcalbelohSystemViewId, packForMapRegion, type MapLayout, type Point } from './mapLayout'

const desktopModes = ['wide', 'short'] as const
const pairKey = (from: string, to: string) => JSON.stringify([from, to].sort())

function labelBounds(layout: MapLayout) {
  return layout.labels.map(label => {
    const fontSize = label.fontSize ?? layout.labelFontSize
    const width = Math.min(label.maxWidth ?? Infinity, (label.displayName ?? label.body.name).length * fontSize * .6)
    const left = label.anchor === 'middle' ? label.x - width / 2 : label.anchor === 'end' ? label.x - width : label.x
    return { id: label.body.id, x: left, y: label.y - fontSize * .85, width, height: fontSize * 1.1 }
  })
}

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
  it.each(desktopModes)('uses a landscape %s canvas and preserves every real state and body label', mode => {
    const before = structuredClone(pack)
    const layout = createMapLayout(pack, mode)
    expect(layout.presentation).toBe('overview')
    expect(layout.mode).toBe(mode)
    expect(layout.width).toBeGreaterThan(layout.height)
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

  it.each(desktopModes)('composes the existing Kerbol and unified Kcalbeloh schematics in %s mode', mode => {
    const layout = createMapLayout(pack, mode)
    const panels = layout.panels!
    expect(panels.map(panel => panel.id)).toEqual(['kerbol', kcalbelohSystemViewId])
    expect([...layout.panelContents!.keys()]).toEqual(['kerbol', kcalbelohSystemViewId])
    for (const panel of panels) {
      expect(panel.x).toBeGreaterThanOrEqual(0)
      expect(panel.y).toBeGreaterThanOrEqual(0)
      expect(panel.x + panel.width).toBeLessThanOrEqual(layout.width)
      expect(panel.y + panel.height).toBeLessThanOrEqual(layout.height)
      const content = layout.panelContents!.get(panel.id)!
      const componentPack = packForMapRegion(pack, panel.id)
      expect(content.pack.nodes).toEqual(componentPack.nodes)
      expect(content.layout.presentation).toBe(panel.id === 'kerbol' ? pack.id.startsWith('opm') ? 'opm' : 'stock' : 'system')
      expect(content.layout.mode).toBe('short')
      expect(content.scaleX).toBe(content.scaleY)
      expect(content.scaleX).toBeGreaterThan(0)
      expect(content.layout.nodePositions).toEqual(createMapLayout(componentPack, content.layout.mode).nodePositions)
      const bodyIds = new Set(componentPack.nodes.map(node => node.bodyId))
      for (const node of pack.nodes.filter(node => bodyIds.has(node.bodyId))) {
        const point = layout.nodePositions.get(node.id)!
        const source = content.layout.nodePositions.get(node.id)!
        expect(layout.nodePanels?.get(node.id), node.id).toBe(panel.id)
        expect(point, node.id).toEqual({ x: content.offset.x + source.x * content.scaleX, y: content.offset.y + source.y * content.scaleY })
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
    const states = [...layout.nodePositions]
    for (const [index, [id, point]] of states.entries()) for (const [otherId, other] of states.slice(index + 1)) {
      // Existing Kerbol short presets have a few close focus rings. Preserve
      // those child coordinates while checking the new unified composition.
      if (layout.nodePanels!.get(id) === 'kerbol' && layout.nodePanels!.get(otherId) === 'kerbol') continue
      expect(Math.hypot(point.x - other.x, point.y - other.y), `${id} and ${otherId} hover rings`)
        .toBeGreaterThan(layout.radius * 2 + 12)
      expect(Math.abs(point.x - other.x) >= layout.hitRadius * 2 || Math.abs(point.y - other.y) >= layout.hitRadius * 2,
        `${id} and ${otherId} hit targets`).toBe(true)
    }
  })

  it.each(desktopModes)('retains the unified primary spines and existing Kerbol connections in %s mode', mode => {
    const layout = createMapLayout(pack, mode)
    const distant = layout.panelContents!.get(kcalbelohSystemViewId)!
    expect(distant.layout.backgroundPairs).toBeDefined()
    const expected = new Set(distant.layout.backgroundPairs)
    for (const edge of pack.maneuvers) {
      if (!edge.directTransfer && layout.nodePanels!.get(edge.from) === 'kerbol' && layout.nodePanels!.get(edge.to) === 'kerbol') {
        expected.add(pairKey(edge.from, edge.to))
      }
    }
    for (const edge of [...pack.maneuvers, ...(pack.unpricedConnections ?? [])]) {
      if (layout.nodePanels!.get(edge.from) !== layout.nodePanels!.get(edge.to)) expected.add(pairKey(edge.from, edge.to))
    }
    expect(layout.backgroundPairs).toEqual(expected)
  })

  it.each(desktopModes)('draws every priced and unpriced link reversibly between actual state positions in %s mode', mode => {
    const before = structuredClone(pack)
    const layout = createMapLayout(pack, mode)
    const nodes = new Map(pack.nodes.map(node => [node.id, node]))
    for (const edge of [...pack.maneuvers, ...(pack.unpricedConnections ?? [])]) {
      const from = nodes.get(edge.from)!
      const to = nodes.get(edge.to)!
      const points = connectionPoints(from, to, layout, pack)
      expect(points.at(0), edge.id).toEqual(layout.nodePositions.get(from.id))
      expect(points.at(-1), edge.id).toEqual(layout.nodePositions.get(to.id))
      expect(connectionPoints(to, from, layout, pack), edge.id).toEqual([...points].reverse())
      const panelId = layout.nodePanels!.get(from.id)!
      if (panelId === layout.nodePanels!.get(to.id)) {
        const content = layout.panelContents!.get(panelId)!
        expect(points, `${edge.id} retains its component geometry`).toEqual(connectionPoints(from, to, content.layout, content.pack)
          .map(point => ({ x: content.offset.x + point.x * content.scaleX, y: content.offset.y + point.y * content.scaleY })))
      }
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

  it.each(desktopModes)('keeps cross-system paths out of unrelated panels, labels and state circles in %s mode', mode => {
    const layout = createMapLayout(pack, mode)
    const nodes = new Map(pack.nodes.map(node => [node.id, node]))
    const regionFor = layout.nodePanels!
    const edges = [...pack.maneuvers, ...(pack.unpricedConnections ?? [])]
      .filter(edge => regionFor.get(edge.from) !== regionFor.get(edge.to))
    expect(edges.length).toBeGreaterThan(0)
    for (const edge of edges) {
      const points = connectionPoints(nodes.get(edge.from)!, nodes.get(edge.to)!, layout, pack)
      const text = [...labelBounds(layout), ...layout.panels!.flatMap(panel => panel.heading ? [{
        id: panel.id, x: panel.heading.x, y: panel.heading.y - 28 * .85, width: panel.label.length * 28 * .6, height: 28 * 1.1,
      }] : [])]
      for (const label of text) {
        expect(points.slice(1).some((point, index) => intersectsInterior(points[index]!, point, label)), `${edge.id} crosses ${label.id} text`).toBe(false)
      }
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

  it.each(desktopModes)('keeps unified Kcalbeloh paths and labels clear after composition in %s mode', mode => {
    const layout = createMapLayout(pack, mode)
    const content = layout.panelContents!.get(kcalbelohSystemViewId)!
    const nodes = new Map(pack.nodes.map(node => [node.id, node]))
    const labels = labelBounds(layout)
    const radius = content.layout.radius * content.scaleX
    for (const [index, label] of labels.entries()) {
      for (const other of labels.slice(index + 1)) {
        if (!label.id.startsWith('kcalbeloh:') && !other.id.startsWith('kcalbeloh:')) continue
        expect(label.x + label.width <= other.x || other.x + other.width <= label.x
          || label.y + label.height <= other.y || other.y + other.height <= label.y,
        `${label.id} overlaps ${other.id}`).toBe(true)
      }
      for (const [id, point] of layout.nodePositions) {
        if (!label.id.startsWith('kcalbeloh:') && !id.startsWith('kcalbeloh:')) continue
        const dx = Math.max(label.x - point.x, point.x - label.x - label.width, 0)
        const dy = Math.max(label.y - point.y, point.y - label.y - label.height, 0)
        expect(Math.hypot(dx, dy), `${label.id} touches ${id}`).toBeGreaterThan(radius + 2 * content.scaleX)
      }
    }
    for (const edge of [...content.pack.maneuvers, ...(content.pack.unpricedConnections ?? [])]) {
      const points = connectionPoints(nodes.get(edge.from)!, nodes.get(edge.to)!, layout, pack)
      for (const label of labels) {
        expect(points.slice(1).some((point, index) => intersectsInterior(points[index]!, point, label)), `${edge.id} crosses ${label.id}`).toBe(false)
      }
      for (const [id, point] of layout.nodePositions) {
        if (id === edge.from || id === edge.to) continue
        const distance = Math.min(...points.slice(1).map((end, index) => distanceToSegment(point, points[index]!, end)))
        expect(distance, `${edge.id} passes ${id}`).toBeGreaterThan(radius + 6 * content.scaleX)
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
    for (const mode of ['portrait'] as const) {
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

  it('retains every state when a community body exceeds the supported unified schematic', () => {
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

it.each([stockKcalbelohNoWormholesPack, opmKcalbelohNoWormholesPack])('keeps the unified $id composition without inventing a gateway', pack => {
  const layout = createMapLayout(pack)
  expect(layout.presentation).toBe('overview')
  expect(layout.panels?.map(panel => panel.id)).toEqual(['kerbol', kcalbelohSystemViewId])
  expect(layout.nodePositions.size).toBe(pack.nodes.length)
  const pairs = [...pack.maneuvers, ...(pack.unpricedConnections ?? [])]
    .filter(edge => layout.nodePanels!.get(edge.from) !== layout.nodePanels!.get(edge.to))
  expect(pairs).toEqual([])
  for (const key of layout.backgroundPairs!) {
    const [from, to] = JSON.parse(key) as [string, string]
    expect(layout.nodePanels!.get(from)).toBe(layout.nodePanels!.get(to))
  }
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
