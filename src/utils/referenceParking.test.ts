import { describe, expect, it } from 'vitest'
import { stockPack } from '../data/stock'
import { opmPack } from '../data/opm'
import { buildGraph } from './buildGraph'
import { findMissionRoute } from './mission'
import { referenceParkingStops } from './referenceParking'

function stops(pack: typeof stockPack, from: string, to: string, required: string[] = []) {
  const route = findMissionRoute(buildGraph(pack), from, to, 'one-way', required)
  if (route.status !== 'success') throw new Error(route.message)
  return referenceParkingStops(pack, route.legs, [from, ...required, to]).map(node => node.id)
}

describe('clarity about reference parking stops', () => {
  it('identifies the original Mun–Minmus parent detour as a reference choice', () => {
    const map = { ...stockPack, maneuvers: stockPack.maneuvers.filter(edge => !edge.directTransfer) }
    expect(stops(map, 'stock:mun:orbit', 'stock:minmus:orbit')).toEqual(['stock:kerbin:orbit'])
  })

  it('does not flag the new complete sibling transfer as parent parking', () => {
    expect(stops(stockPack, 'stock:mun:orbit', 'stock:minmus:orbit')).toEqual([])
  })

  it('identifies remaining cross-system moon escape references', () => {
    expect(stops(stockPack, 'stock:mun:orbit', 'stock:ike:orbit')).toContain('stock:kerbin:orbit')
  })

  it('respects explicitly chosen parent destinations, landings, and intermediate stops', () => {
    expect(stops(stockPack, 'stock:mun:orbit', 'stock:kerbin:surface')).toEqual([])
    expect(stops(stockPack, 'stock:mun:orbit', 'stock:kerbin:orbit')).toEqual([])
    expect(stops(stockPack, 'stock:mun:orbit', 'stock:ike:orbit', ['stock:kerbin:orbit'])).toEqual([])
  })

  it('distinguishes a nested moon parent from the outer parent system', () => {
    expect(stops(opmPack, 'opm:tal:orbit', 'opm:polta:orbit')).toContain('opm:wal:orbit')
    expect(stops(opmPack, 'opm:tal:orbit', 'opm:wal:orbit')).toEqual([])
  })
})
