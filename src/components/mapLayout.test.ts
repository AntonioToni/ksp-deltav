import { describe, expect, it } from 'vitest'
import { stockPack } from '../data/stock'
import { arrowPosition, connectionPoints, createMapLayout, type MapMode } from './mapLayout'

describe.each<MapMode>(['wide', 'portrait', 'short'])('%s schematic layout', (mode) => {
  it('keeps every supported state and its touch target within the canvas', () => {
    const layout = createMapLayout(stockPack, mode)
    expect(layout.nodePositions.size).toBe(stockPack.nodes.length)
    for (const node of stockPack.nodes) {
      const point = layout.nodePositions.get(node.id)
      expect(point, node.id).toBeDefined()
      if (!point) continue
      expect(point.x - layout.hitRadius, node.id).toBeGreaterThanOrEqual(0)
      expect(point.x + layout.hitRadius, node.id).toBeLessThanOrEqual(layout.width)
      expect(point.y - layout.hitRadius, node.id).toBeGreaterThanOrEqual(0)
      expect(point.y + layout.hitRadius, node.id).toBeLessThanOrEqual(layout.height)
    }
  })

  it('draws opposite maneuvers on one reversible path between their real states', () => {
    const layout = createMapLayout(stockPack, mode)
    for (const edge of stockPack.maneuvers) {
      const from = stockPack.nodes.find(node => node.id === edge.from)!
      const to = stockPack.nodes.find(node => node.id === edge.to)!
      const points = connectionPoints(from, to, layout, stockPack)
      expect(points.at(0)).toEqual(layout.nodePositions.get(edge.from))
      expect(points.at(-1)).toEqual(layout.nodePositions.get(edge.to))
      expect(connectionPoints(to, from, layout, stockPack)).toEqual([...points].reverse())
      for (const point of points) {
        expect(point.x).toBeGreaterThanOrEqual(0)
        expect(point.x).toBeLessThanOrEqual(layout.width)
        expect(point.y).toBeGreaterThanOrEqual(0)
        expect(point.y).toBeLessThanOrEqual(layout.height)
      }
      const arrow = arrowPosition(points)
      expect(arrow).toBeDefined()
      expect(Number.isFinite(arrow?.angle)).toBe(true)
    }
  })
})
