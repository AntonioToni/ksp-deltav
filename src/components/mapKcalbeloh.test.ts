import { describe, expect, it } from 'vitest'
import {
  opmKcalbelohNoWormholesPack, opmKcalbelohPack,
  stockKcalbelohNoWormholesPack, stockKcalbelohPack,
} from '../data/kcalbeloh'
import { stockPack } from '../data/stock'
import type { PlanetPack } from '../types/planner'
import { buildGraph } from '../utils/buildGraph'
import { findMissionRoute } from '../utils/mission'
import {
  connectionPoints, createMapLayout, hasKcalbelohSystemView, kcalbelohSystemViewId,
  packForMapRegion, type MapLayout, type MapMode, type Point,
} from './mapLayout'

const regionIds = ['kcalbeloh', 'maelg', 'sunorc', 'aralc']
const modes: MapMode[] = ['wide', 'portrait', 'short']

function distanceToSegment(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const squared = dx * dx + dy * dy
  const fraction = squared ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / squared)) : 0
  return Math.hypot(point.x - a.x - fraction * dx, point.y - a.y - fraction * dy)
}

function labelBounds(layout: MapLayout) {
  return layout.labels.map(label => {
    const name = 'displayName' in label && typeof label.displayName === 'string' ? label.displayName : label.body.name
    const fontSize = label.fontSize ?? layout.labelFontSize
    const width = Math.min(label.maxWidth ?? Infinity, name.length * fontSize * .6)
    const left = label.anchor === 'middle' ? label.x - width / 2 : label.anchor === 'end' ? label.x - width : label.x
    return { id: label.body.id, left, right: left + width,
      top: label.y - fontSize * .85, bottom: label.y + fontSize * .25 }
  })
}

function intersectsRectangle(a: Point, b: Point, rectangle: { left: number; right: number; top: number; bottom: number }): boolean {
  // Check diagonal and orthogonal segments alike. Touching a routing-lane
  // boundary does not count as entering the text rectangle.
  const epsilon = 1e-6
  const left = rectangle.left + epsilon
  const right = rectangle.right - epsilon
  const top = rectangle.top + epsilon
  const bottom = rectangle.bottom - epsilon
  let low = 0
  let high = 1
  for (const [start, delta, minimum, maximum] of [[a.x, b.x - a.x, left, right], [a.y, b.y - a.y, top, bottom]]) {
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

function expectStatesAndLabelsFit(pack: PlanetPack, layout: MapLayout) {
  expect(layout.nodePositions.size).toBe(pack.nodes.length)
  expect(new Set([...layout.nodePositions.values()].map(point => `${point.x},${point.y}`)).size).toBe(pack.nodes.length)
  expect(new Set(layout.labels.map(label => label.body.id))).toEqual(new Set(pack.nodes.map(node => node.bodyId)))
  for (const [id, point] of layout.nodePositions) {
    expect(Number.isFinite(point.x) && Number.isFinite(point.y), id).toBe(true)
    expect(point.x - layout.hitRadius, id).toBeGreaterThanOrEqual(0)
    expect(point.y - layout.hitRadius, id).toBeGreaterThanOrEqual(0)
    expect(point.x + layout.hitRadius, id).toBeLessThanOrEqual(layout.width)
    expect(point.y + layout.hitRadius, id).toBeLessThanOrEqual(layout.height)
  }
  const states = [...layout.nodePositions]
  for (const [index, [id, point]] of states.entries()) for (const [otherId, other] of states.slice(index + 1)) {
    expect(Math.hypot(point.x - other.x, point.y - other.y), `${id} and ${otherId} hover rings`)
      .toBeGreaterThan(layout.radius * 2 + 12)
    expect(Math.abs(point.x - other.x) >= layout.hitRadius * 2 || Math.abs(point.y - other.y) >= layout.hitRadius * 2,
      `${id} and ${otherId} hit targets`).toBe(true)
  }
  for (const label of labelBounds(layout)) {
    expect(label.left, label.id).toBeGreaterThanOrEqual(0)
    expect(label.right, label.id).toBeLessThanOrEqual(layout.width)
    expect(label.top, label.id).toBeGreaterThanOrEqual(0)
    expect(label.bottom, label.id).toBeLessThanOrEqual(layout.height)
    for (const [id, point] of states) {
      const x = Math.max(label.left - point.x, point.x - label.right, 0)
      const y = Math.max(label.top - point.y, point.y - label.bottom, 0)
      expect(Math.hypot(x, y), `${label.id} label touches ${id}`).toBeGreaterThan(layout.radius + 2)
    }
  }
  const bounds = labelBounds(layout)
  for (const [index, label] of bounds.entries()) for (const other of bounds.slice(index + 1)) {
    expect(label.right <= other.left || other.right <= label.left || label.bottom <= other.top || other.bottom <= label.top,
      `${label.id} and ${other.id} labels overlap`).toBe(true)
  }
}

function expectMoonFamiliesStayTogether(pack: PlanetPack, layout: MapLayout) {
  const position = (bodyId: string) => {
    const node = pack.nodes.find(node => node.bodyId === bodyId && (node.kind === 'orbit' || node.kind === 'reference'))!
    return layout.nodePositions.get(node.id)!
  }
  for (const moon of pack.bodies.filter(body => body.kind === 'moon' && pack.nodes.some(node => node.bodyId === body.id))) {
    const parent = pack.bodies.find(body => body.id === moon.parentId)!
    const ancestors = new Set<string>()
    let ancestor = parent
    while (!ancestors.has(ancestor.id)) {
      ancestors.add(ancestor.id)
      const next = pack.bodies.find(body => body.id === ancestor.parentId)
      if (!next) break
      ancestor = next
    }
    const point = position(moon.id)
    const parentPoint = position(parent.id)
    const parentDistance = Math.hypot(point.x - parentPoint.x, point.y - parentPoint.y)
    const unrelatedParents = pack.bodies.filter(body => !ancestors.has(body.id)
      && body.kind !== 'moon' && pack.nodes.some(node => node.bodyId === body.id))
    for (const unrelated of unrelatedParents) {
      const other = position(unrelated.id)
      expect(parentDistance, `${moon.name} should sit with ${parent.name}, away from ${unrelated.name}`)
        .toBeLessThan(Math.hypot(point.x - other.x, point.y - other.y))
    }
  }
}

function expectPrimarySpinesStaySimple(pack: PlanetPack, layout: MapLayout) {
  const pairKey = (from: string, to: string) => JSON.stringify([from, to].sort())
  const allEdges = [...pack.maneuvers, ...(pack.unpricedConnections ?? [])]
  const graphPairs = new Map(allEdges.map(edge => [pairKey(edge.from, edge.to), edge]))
  expect(layout.backgroundPairs).toBeDefined()
  expect(layout.backgroundPairs!.size).toBeGreaterThan(0)
  const connectedNodes = new Set<string>()
  const nodes = new Map(pack.nodes.map(node => [node.id, node]))
  for (const key of layout.backgroundPairs!) {
    const pair = JSON.parse(key) as string[]
    expect(pair).toHaveLength(2)
    expect(pair[0]).not.toBe(pair[1])
    expect(key).toBe(pairKey(pair[0]!, pair[1]!))
    expect(graphPairs.has(key), `Primary spine ${key} must be a real maneuver or unpriced link`).toBe(true)
    pair.forEach(id => connectedNodes.add(id))
    const from = nodes.get(pair[0]!)!
    const to = nodes.get(pair[1]!)!
    expect(from, key).toBeDefined()
    expect(to, key).toBeDefined()
    const points = connectionPoints(from, to, layout, pack)
    expect(points.length, `${key} primary spine bends`).toBeLessThanOrEqual(4)
    const start = points.at(0)!
    const end = points.at(-1)!
    const straight = Math.hypot(end.x - start.x, end.y - start.y)
    const length = points.slice(1).reduce((sum, point, index) => sum + Math.hypot(point.x - points[index]!.x, point.y - points[index]!.y), 0)
    expect(length, `${key} primary spine detour`).toBeLessThanOrEqual(straight * 1.6)
  }
  expect(connectedNodes).toEqual(new Set(pack.nodes.map(node => node.id)))
  for (const edge of pack.maneuvers) {
    const from = nodes.get(edge.from)!
    const to = nodes.get(edge.to)!
    if (from.bodyId === to.bodyId) expect(layout.backgroundPairs!.has(pairKey(from.id, to.id)), `${from.bodyId} state chain`).toBe(true)
  }
  if (graphPairs.size > pack.nodes.length) {
    expect(layout.backgroundPairs!.size, 'The background must leave secondary transfers for route selection').toBeLessThan(graphPairs.size)
  }
}

function expectConnectionsClear(pack: PlanetPack, layout: MapLayout) {
  const nodes = new Map(pack.nodes.map(node => [node.id, node]))
  const labels = labelBounds(layout)
  for (const edge of [...pack.maneuvers, ...(pack.unpricedConnections ?? [])]) {
    const from = nodes.get(edge.from)!
    const to = nodes.get(edge.to)!
    const points = connectionPoints(from, to, layout, pack)
    expect(points.at(0), edge.id).toEqual(layout.nodePositions.get(from.id))
    expect(points.at(-1), edge.id).toEqual(layout.nodePositions.get(to.id))
    expect(connectionPoints(to, from, layout, pack), edge.id).toEqual([...points].reverse())
    if (from.id === 'kcalbeloh:onrefni:orbit' && to.id === 'kcalbeloh:uleg:orbit') {
      // This secondary transfer previously retraced a planet's native landing
      // stub before turning away, making two different maneuvers look shared.
      for (const [node, exit] of [[from, points[1]!], [to, points.at(-2)!]] as const) {
        const orbit = layout.nodePositions.get(node.id)!
        const surface = layout.nodePositions.get(`${node.bodyId}:surface`)!
        const stub = { x: surface.x - orbit.x, y: surface.y - orbit.y }
        const branch = { x: exit.x - orbit.x, y: exit.y - orbit.y }
        const collinear = Math.abs(stub.x * branch.y - stub.y * branch.x) < 1e-6
        expect(collinear && stub.x * branch.x + stub.y * branch.y > 0,
          `${edge.id} retraces ${node.bodyId}'s landing stub`).toBe(false)
      }
    }
    for (const point of points) {
      expect(Number.isFinite(point.x) && Number.isFinite(point.y), edge.id).toBe(true)
      expect(point.x, edge.id).toBeGreaterThanOrEqual(0)
      expect(point.y, edge.id).toBeGreaterThanOrEqual(0)
      expect(point.x, edge.id).toBeLessThanOrEqual(layout.width)
      expect(point.y, edge.id).toBeLessThanOrEqual(layout.height)
    }
    for (const [id, point] of layout.nodePositions) {
      if (id === edge.from || id === edge.to) continue
      const distance = Math.min(...points.slice(1).map((end, index) => distanceToSegment(point, points[index]!, end)))
      expect(distance, `${edge.id} passes through ${id}`).toBeGreaterThan(layout.radius + 6)
    }
    for (const label of labels) {
      expect(points.slice(1).some((point, index) => intersectsRectangle(points[index]!, point, label)),
        `${edge.id} crosses ${label.id} label`).toBe(false)
    }
    if (layout.presentation === 'overview' && layout.nodePanels?.get(from.id) !== layout.nodePanels?.get(to.id)) {
      for (const panel of layout.panels ?? []) {
        if (panel.id === layout.nodePanels?.get(from.id) || panel.id === layout.nodePanels?.get(to.id)) continue
        const rectangle = { left: panel.x, right: panel.x + panel.width, top: panel.y, bottom: panel.y + panel.height }
        expect(points.slice(1).some((point, index) => intersectsRectangle(points[index]!, point, rectangle)),
          `${edge.id} crosses unrelated ${panel.id} panel`).toBe(false)
      }
    }
  }
}

describe.each([stockKcalbelohPack, opmKcalbelohPack, stockKcalbelohNoWormholesPack, opmKcalbelohNoWormholesPack])('$name Kcalbeloh system view', pack => {
  it('combines the four distant regions without changing source states, costs or mission connectivity', () => {
    const before = structuredClone(pack)
    expect(hasKcalbelohSystemView(pack)).toBe(true)
    const visible = packForMapRegion(pack, kcalbelohSystemViewId)
    const expectedBodies = new Set(pack.mapRegions!.filter(region => regionIds.includes(region.id)).flatMap(region => region.bodyIds))
    expect(visible.mapRegions?.map(region => region.id)).toEqual(regionIds)
    expect(visible.nodes).toHaveLength(47)
    expect(visible.nodes).toEqual(pack.nodes.filter(node => expectedBodies.has(node.bodyId)))
    expect(visible.nodes.every(node => node.bodyId.startsWith('kcalbeloh:'))).toBe(true)
    const visibleIds = new Set(visible.nodes.map(node => node.id))
    expect(visible.maneuvers).toEqual(pack.maneuvers.filter(edge => visibleIds.has(edge.from) && visibleIds.has(edge.to)))
    expect(visible.unpricedConnections).toEqual(pack.unpricedConnections!.filter(edge => visibleIds.has(edge.from) && visibleIds.has(edge.to)))
    expect(visible.unpricedConnections!.some(edge => edge.id === 'kcalbeloh:wormhole')).toBe(false)
    expect(visible.unpricedConnections!.some(edge => edge.id === 'kcalbeloh:connect-maelg')).toBe(true)
    expect(findMissionRoute(buildGraph(pack), 'kcalbeloh:suluco:surface', 'kcalbeloh:tot:surface', 'one-way'))
      .toMatchObject({ status: 'success', totalDeltaV: 3931 })
    expect(pack).toEqual(before)
  })

  it.each(modes)('retains every state and clear reversible geometry in the %s combined layout', mode => {
    const before = structuredClone(pack)
    const visible = packForMapRegion(pack, kcalbelohSystemViewId)
    const layout = createMapLayout(visible, mode)
    expectStatesAndLabelsFit(visible, layout)
    expectConnectionsClear(visible, layout)
    expectMoonFamiliesStayTogether(visible, layout)
    expectPrimarySpinesStaySimple(visible, layout)
    expect(layout.hubId).toBeUndefined()
    expect(layout.presentation).toBe('system')
    expect(pack).toEqual(before)
  })

  it.each(modes)('gives every local region distinct state markers and clear labels in %s mode', mode => {
    const before = structuredClone(pack)
    for (const regionId of regionIds) {
      const visible = packForMapRegion(pack, regionId)
      const layout = createMapLayout(visible, mode)
      expect(layout.presentation).toBe('regional')
      expect(layout.hubId).toBeUndefined()
      expectStatesAndLabelsFit(visible, layout)
      expectConnectionsClear(visible, layout)
      expectMoonFamiliesStayTogether(visible, layout)
      expectPrimarySpinesStaySimple(visible, layout)
    }
    expect(pack).toEqual(before)
  })
})

it('recognizes compatible renamed compositions without offering the combined view for unrelated or incomplete packs', () => {
  const renamed = { ...stockKcalbelohPack, id: 'community-kcalbeloh', name: 'Community Kcalbeloh' }
  expect(hasKcalbelohSystemView(renamed)).toBe(true)
  expect(packForMapRegion(renamed, kcalbelohSystemViewId).nodes).toEqual(packForMapRegion(stockKcalbelohPack, kcalbelohSystemViewId).nodes)
  expect(hasKcalbelohSystemView(stockPack)).toBe(false)
  expect(packForMapRegion(stockPack, kcalbelohSystemViewId)).toBe(stockPack)
  const incomplete = { ...renamed, mapRegions: renamed.mapRegions!.filter(region => region.id !== 'aralc') }
  expect(hasKcalbelohSystemView(incomplete)).toBe(false)
})
