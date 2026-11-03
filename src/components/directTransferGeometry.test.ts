import { describe, expect, it } from 'vitest'
import { stockPack } from '../data/stock'
import { opmPack } from '../data/opm'
import { rssPack } from '../data/rss'
import { stockKcalbelohPack, opmKcalbelohPack } from '../data/kcalbeloh'
import type { ManeuverEdge, PlanetPack } from '../types/planner'
import { connectionPoints, createMapLayout, maneuverPoints, type MapLayout, type MapMode, type Point } from './mapLayout'

function directEdge(pack: PlanetPack, from: string, to: string): ManeuverEdge {
  return { id: `geometry:${from}->${to}`, from, to, kind: 'transfer', deltaV: 1,
    directTransfer: true, label: 'Geometry-only direct pair', sourceId: pack.sources[0]!.id, assumptions: [] }
}

function distanceToSegment(point: Point, a: Point, b: Point) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const fraction = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(point.x - a.x - fraction * dx, point.y - a.y - fraction * dy)
}

function assertClear(pack: PlanetPack, layout: MapLayout, edge: ManeuverEdge) {
  const points = maneuverPoints(edge, layout, pack)
  expect(points.length, edge.id).toBeGreaterThanOrEqual(2)
  expect(points[0]).toEqual(layout.nodePositions.get(edge.from))
  expect(points.at(-1)).toEqual(layout.nodePositions.get(edge.to))
  expect(maneuverPoints({ ...edge, from: edge.to, to: edge.from }, layout, pack)).toEqual([...points].reverse())
  const halfBand = layout.presentation === 'overview' ? 5.5 : layout.mode === 'portrait' ? 6 : 9.5
  for (const point of points) {
    expect(point.x, edge.id).toBeGreaterThanOrEqual(halfBand)
    expect(point.x, edge.id).toBeLessThanOrEqual(layout.width - halfBand)
    expect(point.y, edge.id).toBeGreaterThanOrEqual(halfBand)
    expect(point.y, edge.id).toBeLessThanOrEqual(layout.height - halfBand)
  }
  for (const [index, b] of points.entries()) {
    if (!index) continue
    const a = points[index - 1]!
    expect(a.x === b.x || a.y === b.y, `Orthogonal segment in ${edge.id}`).toBe(true)
    expect(a).not.toEqual(b)
    for (const [id, point] of layout.nodePositions) {
      if (id === edge.from || id === edge.to) continue
      const radius = layout.radius + (id === layout.hubId && layout.mode !== 'portrait' ? 9 : 0)
      expect(distanceToSegment(point, a, b), `${edge.id} crosses ${id}`)
        .toBeGreaterThanOrEqual(radius + halfBand - .001)
    }
    for (const label of layout.labels) {
      const width = Math.min(label.maxWidth ?? Infinity, label.body.name.length * layout.labelFontSize * .6)
      const left = label.anchor === 'middle' ? label.x - width / 2 : label.anchor === 'end' ? label.x - width : label.x
      const right = left + width
      const top = label.y - layout.labelFontSize * .85
      const bottom = label.y + layout.labelFontSize * .25
      const clear = Math.max(a.x, b.x) + halfBand < left || Math.min(a.x, b.x) - halfBand > right
        || Math.max(a.y, b.y) + halfBand < top || Math.min(a.y, b.y) - halfBand > bottom
      expect(clear, `${edge.id} crosses ${label.body.name}'s label`).toBe(true)
    }
  }
}

describe.each([stockPack, opmPack])('$name selected direct paths', pack => {
  const stars = new Set(pack.bodies.filter(body => body.kind === 'star').map(body => body.id))
  const planets = pack.bodies.filter(body => body.kind === 'planet' && body.id !== pack.transferHubBodyId
    && body.parentId !== null && stars.has(body.parentId))
  const endpoints = planets.flatMap(body => pack.nodes.filter(node => node.bodyId === body.id && (node.kind === 'orbit' || node.kind === 'elliptical')))
  const pairs = endpoints.flatMap((from, index) => endpoints.slice(index + 1).filter(to => to.bodyId !== from.bodyId).map(to =>
    directEdge(pack, from.id, to.id)))

  it.each<MapMode>(['wide', 'portrait', 'short'])('keeps every non-home pair clear of states and labels in %s mode', mode => {
    const layout = createMapLayout(pack, mode)
    for (const edge of pairs) assertClear(pack, layout, edge)
  })

  it('keeps ordinary maneuver geometry unchanged', () => {
    const layout = createMapLayout(pack)
    const edge = pack.maneuvers.find(edge => !edge.directTransfer)!
    const from = pack.nodes.find(node => node.id === edge.from)!
    const to = pack.nodes.find(node => node.id === edge.to)!
    expect(maneuverPoints(edge, layout, pack)).toEqual(connectionPoints(from, to, layout, pack))
  })
})

describe.each([stockPack, opmPack, rssPack])('$name selected sibling-moon paths', pack => {
  it.each<MapMode>(['wide', 'portrait', 'short'])('keeps sibling paths clear of unrelated states and labels in %s mode', mode => {
    const layout = createMapLayout(pack, mode)
    const pairs = pack.maneuvers.filter(edge => edge.sourceId === 'sibling-moon-transfer-model' && edge.from < edge.to)
    expect(pairs.length).toBeGreaterThan(0)
    for (const edge of pairs) assertClear(pack, layout, edge)
  })
})

it.each([stockKcalbelohPack, opmKcalbelohPack])('uses the same safe direct geometry inside the $id overview panel', pack => {
  const layout = createMapLayout(pack)
  expect(layout.presentation).toBe('overview')
  assertClear(pack, layout, directEdge(pack, 'stock:duna:orbit', 'stock:dres:orbit'))
  assertClear(pack, layout, directEdge(pack, 'stock:duna:orbit', 'stock:eve:elliptical'))
  assertClear(pack, layout, directEdge(pack, 'stock:duna:elliptical', 'stock:eve:elliptical'))
  const from = pack.id.startsWith('opm') ? 'opm:sarnus:orbit' : 'stock:eve:orbit'
  const to = pack.id.startsWith('opm') ? 'opm:urlum:orbit' : 'stock:jool:orbit'
  assertClear(pack, layout, directEdge(pack, from, to))
  assertClear(pack, layout, directEdge(pack, 'stock:mun:orbit', 'stock:minmus:orbit'))
  if (pack.id.startsWith('opm')) assertClear(pack, layout, directEdge(pack, 'opm:hale:orbit', 'opm:ovok:orbit'))
})

it('omits direct geometry when a regional view lacks an endpoint', () => {
  const regional = { ...stockPack, nodes: stockPack.nodes.filter(node => node.bodyId !== 'stock:dres') }
  const layout = createMapLayout(regional)
  expect(maneuverPoints(directEdge(stockPack, 'stock:duna:orbit', 'stock:dres:orbit'), layout, regional)).toEqual([])
})
