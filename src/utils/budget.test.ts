import { describe, expect, it } from 'vitest'
import { stockPack } from '../data/stock'
import { buildGraph } from './buildGraph'
import { calculateBudget } from './budget'
import { findLowestCostPath } from './findRoute'

describe('mission redundancy budget', () => {
  it.each([
    [5120, 0, 5120, 0],
    [5120, 20, 6144, 1024],
    [5120, 100, 10240, 5120],
    [0, 100, 0, 0],
    [100, 10, 110, 10],
    [101, 5, 107, 6],
    [10, 2.5, 11, 1],
    [1.25, 20, 2, 0.75],
    [1.25, 0, 2, 0.75],
    [1.0000000000000002, 0, 2, 0.9999999999999998],
  ])('adds %s m/s + %s%% and rounds the total upward', (baseDeltaV, redundancyPercent, totalDeltaV, extraDeltaV) => {
    expect(calculateBudget(baseDeltaV, redundancyPercent)).toEqual({ baseDeltaV, redundancyPercent, totalDeltaV, extraDeltaV })
  })

  it.each([-1, NaN, Infinity, -Infinity])('rejects invalid base Delta-V %s', base => {
    expect(() => calculateBudget(base, 20)).toThrow(RangeError)
  })

  it.each([-1, 100.1, NaN, Infinity, -Infinity])('rejects invalid redundancy %s', percent => {
    expect(() => calculateBudget(5120, percent)).toThrow(RangeError)
  })

  it('handles large finite inputs and rejects numeric overflow', () => {
    expect(calculateBudget(1e308, 20).totalDeltaV).toBe(1.2e308)
    expect(() => calculateBudget(Number.MAX_VALUE, 100)).toThrow(RangeError)
  })

  it('keeps the calculated route and source maneuver costs unchanged', () => {
    const route = findLowestCostPath(buildGraph(stockPack), 'stock:kerbin:surface', 'stock:mun:surface')
    if (route.status !== 'success') throw new Error('Expected a Kerbin–Mun route')
    const routeBefore = structuredClone(route)
    const maneuversBefore = structuredClone(stockPack.maneuvers)
    expect(calculateBudget(route.totalDeltaV, 20).totalDeltaV).toBe(6144)
    expect(route).toEqual(routeBefore)
    expect(stockPack.maneuvers).toEqual(maneuversBefore)
  })
})
