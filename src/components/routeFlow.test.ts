import { describe, expect, it } from 'vitest'
import type { Point } from './mapLayout'
import { createRouteFlow } from './routeFlow'

const p = (x: number, y = 0): Point => ({ x, y })

describe('ordered route flow geometry', () => {
  it('retains the ordered outward, backward, and repeated traversals through a stop', () => {
    const segments = [
      [p(0), p(100)],
      [p(100), p(200)],
      [p(200), p(100)],
      [p(100), p(200)],
      [p(200), p(200, 100)],
    ]
    const before = structuredClone(segments)
    const flow = createRouteFlow(segments)
    expect(flow.runs).toEqual([{
      path: 'M 0 0 L 100 0 L 200 0 L 100 0 L 200 0 L 200 100',
      startDistance: 0, length: 500, firstSegment: 0, lastSegment: 4,
    }])
    expect(flow.totalDistance).toBe(500)
    expect(segments).toEqual(before)
  })

  it('follows an entire round trip back to the original point on the same geometry', () => {
    const outbound = [p(0), p(60, 80), p(160, 80)]
    const flow = createRouteFlow([outbound, [...outbound].reverse()])
    expect(flow.runs[0]?.path).toBe('M 0 0 L 60 80 L 160 80 L 60 80 L 0 0')
    expect(flow.totalDistance).toBe(400)
    expect(createRouteFlow([[...outbound].reverse()]).runs[0]?.path)
      .toBe('M 160 80 L 60 80 L 0 0')
  })

  it('splits regional runs and reserves timing for hidden maneuvers without drawing a bridge', () => {
    const flow = createRouteFlow([
      [], [p(0), p(100)], [], [], [p(900), p(950)],
    ])
    expect(flow.runs).toEqual([
      { path: 'M 0 0 L 100 0', startDistance: 120, length: 100, firstSegment: 1, lastSegment: 1 },
      { path: 'M 900 0 L 950 0', startDistance: 340, length: 50, firstSegment: 4, lastSegment: 4 },
    ])
    expect(flow.totalDistance).toBe(390)
  })

  it('uses one short pause for a long hidden stretch while retaining actual maneuver indices', () => {
    const flow = createRouteFlow([[p(0), p(100)], ...Array.from({ length: 30 }, () => []), [p(900), p(1000)]])
    const shortGap = createRouteFlow([[p(0), p(100)], [], [p(900), p(1000)]])
    expect(flow.totalDistance).toBe(shortGap.totalDistance)
    expect(flow.runs[1]).toMatchObject({ startDistance: 220, firstSegment: 31, lastSegment: 31 })
  })

  it('never adds an artificial connection between detached visible segments', () => {
    const flow = createRouteFlow([[p(0), p(100)], [p(900), p(950)]])
    expect(flow.runs.map(run => run.path)).toEqual(['M 0 0 L 100 0', 'M 900 0 L 950 0'])
    expect(flow.runs.map(run => run.startDistance)).toEqual([0, 100])
    expect(flow.totalDistance).toBe(150)
  })

  it('ignores stationary geometry without inventing distance or losing a following maneuver', () => {
    const flow = createRouteFlow([
      [p(0), p(0)], [p(0), p(100)], [p(100)], [p(100), p(100), p(100, 100)],
    ])
    expect(flow.runs).toEqual([{
      path: 'M 0 0 L 100 0 L 100 100', startDistance: 0, length: 200, firstSegment: 1, lastSegment: 3,
    }])
    expect(flow.totalDistance).toBe(200)
  })

  it.each([
    { segments: [] }, { segments: [[]] }, { segments: [[], []] },
    { segments: [[p(5)]] }, { segments: [[p(5), p(5)]] },
  ])('has no animation for an empty or stationary visible itinerary %#', ({ segments }) => {
    expect(createRouteFlow(segments)).toEqual({ runs: [], totalDistance: 0, trailLength: 0, period: 0, duration: 0 })
  })

  it('keeps a short route finite and leaves enough blank distance for a single tracer', () => {
    const flow = createRouteFlow([[p(0), p(3, 4)]])
    expect(flow.totalDistance).toBe(5)
    expect(flow.trailLength).toBeCloseTo(5 / 3)
    expect(flow.period).toBeGreaterThan(flow.totalDistance + flow.trailLength)
    expect(flow.duration).toBe(2)
    expect(flow.period - flow.trailLength).toBeGreaterThan(flow.totalDistance)
  })
})
