import { describe, expect, it } from 'vitest'
import { routeBetweenPoints, routeToGutter } from './mapRouting'

describe('orthogonal route appearance', () => {
  it('uses one elbow across open space instead of an equal-distance staircase', () => {
    const lanes = Array.from({ length: 11 }, (_, index) => index)
    const path = routeBetweenPoints({ x: 0, y: 0 }, { x: 10, y: 10 }, lanes, lanes, () => true)
    expect(path).toHaveLength(3)
    expect(path![0]).toEqual({ x: 0, y: 0 })
    expect(path!.at(-1)).toEqual({ x: 10, y: 10 })
    const elbow = path![1]!
    expect(elbow.x === 0 || elbow.y === 0).toBe(true)
    expect(elbow.x === 10 || elbow.y === 10).toBe(true)
  })

  it('uses two clear elbows to go around an obstruction', () => {
    const clear = (points: { x: number; y: number }[]) => points.slice(1).every((b, index) => {
      const a = points[index]!
      return Math.max(a.x, b.x) < 4 || Math.min(a.x, b.x) > 6
        || Math.max(a.y, b.y) < -1 || Math.min(a.y, b.y) > 7
    })
    const path = routeBetweenPoints({ x: 0, y: 0 }, { x: 10, y: 0 }, [0, 3, 7, 10], [0, 8, 10], clear)
    expect(path).toHaveLength(4)
    expect(clear(path!)).toBe(true)
    expect(path!.some(point => point.y === 8)).toBe(true)
  })

  it('retains distance-only routing to a gutter', () => {
    expect(routeToGutter({ x: 1, y: 0 }, 3, [0, 1, 2], [0, 1, 2, 3], () => true))
      .toEqual([{ x: 1, y: 0 }, { x: 1, y: 3 }])
  })
})
