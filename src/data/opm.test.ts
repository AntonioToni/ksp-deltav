import { describe, expect, it } from 'vitest'
import { buildGraph } from '../utils/buildGraph'
import { findLowestCostPath } from '../utils/findRoute'
import { validatePlanetPack } from '../utils/validatePlanetPack'
import { opmPack } from './opm'
import { planetPacks } from './planetPacks'
import { stockPack } from './stock'

describe('the reviewed OPM planning pack', () => {
  it('registers packs by metadata without changing shared stock IDs', () => {
    expect(planetPacks.map(pack => pack.id)).toEqual(['stock', 'opm'])
    expect(planetPacks.find(pack => pack.id === 'opm')).toBe(opmPack)
    expect(opmPack.nodes.filter(node => node.id.startsWith('stock:')).map(node => node.id))
      .toEqual(stockPack.nodes.map(node => node.id))
  })

  it('covers 32 bodies, 96 states, and 190 sourced directed maneuvers', () => {
    expect(validatePlanetPack(opmPack)).toEqual([])
    expect(opmPack.bodies).toHaveLength(32)
    expect(opmPack.nodes).toHaveLength(96)
    expect(opmPack.maneuvers).toHaveLength(190)
    expect(opmPack.bodies.filter(body => body.kind === 'planet')).toHaveLength(10)
    expect(opmPack.bodies.filter(body => body.kind === 'moon')).toHaveLength(21)
    for (const edge of opmPack.maneuvers) {
      expect(opmPack.sources.some(source => source.id === edge.sourceId), edge.id).toBe(true)
      expect(edge.assumptions.length, edge.id).toBeGreaterThan(0)
    }
  })

  it('matches official hierarchy, nested moon, atmospheres, and gas-giant surface restrictions', () => {
    const byId = new Map(opmPack.bodies.map(body => [body.id, body]))
    expect(byId.get('stock:eeloo')).toMatchObject({ kind: 'moon', parentId: 'opm:sarnus' })
    expect(byId.get('opm:tal')).toMatchObject({ kind: 'moon', parentId: 'opm:wal' })
    expect(byId.get('opm:karen')).toMatchObject({ kind: 'moon', parentId: 'opm:plock' })
    for (const id of ['stock:jool', 'opm:sarnus', 'opm:urlum', 'opm:neidon']) {
      expect(byId.get(id)).toMatchObject({ hasSurface: false, hasAtmosphere: true })
      expect(opmPack.nodes.some(node => node.bodyId === id && node.kind === 'surface')).toBe(false)
    }
    expect(byId.get('opm:tekto')?.hasAtmosphere).toBe(true)
    expect(byId.get('opm:thatmo')?.hasAtmosphere).toBe(true)
    expect(byId.get('opm:slate')?.hasAtmosphere).toBe(false)
    expect(byId.get('opm:nissee')?.hasAtmosphere).toBe(false)
  })

  it('does not mutate or share retained stock data records', () => {
    expect(stockPack.bodies.find(body => body.id === 'stock:eeloo'))
      .toMatchObject({ parentId: 'stock:kerbol', kind: 'planet' })
    expect(stockPack.maneuvers.find(edge => edge.from === 'stock:eeloo:orbit' && edge.to === 'stock:eeloo:surface')?.deltaV).toBe(620)
    const oldEelooTransfer = stockPack.maneuvers.find(edge => edge.from === 'stock:kerbin:encounter' && edge.to === 'stock:eeloo:encounter')
    expect(oldEelooTransfer?.deltaV).toBe(1140)
    expect(opmPack.maneuvers.some(edge => edge.id === oldEelooTransfer?.id)).toBe(false)
    for (const body of stockPack.bodies) expect(opmPack.bodies.find(item => item.id === body.id)).not.toBe(body)
    for (const node of stockPack.nodes) expect(opmPack.nodes.find(item => item.id === node.id)).not.toBe(node)
    for (const edge of stockPack.maneuvers) {
      const retained = opmPack.maneuvers.find(item => item.id === edge.id)
      if (retained) {
        expect(retained).not.toBe(edge)
        expect(retained.assumptions).not.toBe(edge.assumptions)
      }
    }
  })

  it.each([
    ['opm:sarnus:orbit', 8980],
    ['opm:hale:surface', 10010],
    ['opm:ovok:surface', 10100],
    ['stock:eeloo:surface', 11130],
    ['opm:slate:surface', 13480],
    ['opm:tekto:surface', 13470],
    ['opm:urlum:orbit', 8380],
    ['opm:polta:surface', 10080],
    ['opm:priax:surface', 9720],
    ['opm:wal:surface', 11290],
    ['opm:tal:surface', 10720],
    ['opm:neidon:orbit', 8430],
    ['opm:thatmo:surface', 10760],
    ['opm:nissee:surface', 10640],
    ['opm:plock:surface', 8640],
    ['opm:karen:surface', 8697],
  ])('sums audited source and declared derived segments to %s as %i m/s', (destination, expected) => {
    const route = findLowestCostPath(buildGraph(opmPack), 'stock:kerbin:surface', destination)
    expect(route.status).toBe('success')
    if (route.status !== 'success') throw new Error(route.message)
    expect(route.totalDeltaV).toBe(expected)
    expect(route.legs.at(-1)?.cumulativeDeltaV).toBe(expected)
  })

  it('keeps OPM moon transfers attached to their low-orbit parent references', () => {
    expect(opmPack.maneuvers.find(edge => edge.to === 'stock:eeloo:encounter' && edge.kind === 'transfer'))
      .toMatchObject({ from: 'opm:sarnus:orbit', deltaV: 1120, sourceId: 'kowgan-opm-1.8.1' })
    expect(opmPack.maneuvers.find(edge => edge.to === 'opm:tal:encounter' && edge.kind === 'transfer'))
      .toMatchObject({ from: 'opm:wal:orbit', deltaV: 380 })
    expect(opmPack.maneuvers.find(edge => edge.from === 'stock:eeloo:orbit' && edge.to === 'stock:eeloo:surface')?.deltaV).toBe(540)
  })

  it('labels historical and analytic limitations and avoids invalid modern parking-altitude claims', () => {
    for (const body of ['sarnus', 'urlum', 'neidon', 'thatmo']) {
      expect(opmPack.nodes.find(node => node.id === `opm:${body}:orbit`)?.altitudeKm).toBeUndefined()
    }
    const plockTransfer = opmPack.maneuvers.find(edge => edge.from === 'stock:kerbin:encounter' && edge.to === 'opm:plock:encounter')
    expect(plockTransfer?.deltaV).toBe(2700)
    expect(plockTransfer?.assumptions.join(' ')).toContain('1900–2700')
    const analytic = opmPack.maneuvers.filter(edge => edge.sourceId === 'opm-analytic-karen')
    expect(analytic).toHaveLength(6)
    expect(analytic.every(edge => edge.assumptions.join(' ').includes('Analytic estimate'))).toBe(true)
    expect(analytic.map(edge => edge.deltaV)).toEqual([184, 184, 105, 105, 248, 248])
    expect(opmPack.description).toContain('historical')
    expect(opmPack.assumptions.join(' ')).toContain('not calibrated')
  })

  it('provides finite outbound and return routes for every supported state', () => {
    const graph = buildGraph(opmPack)
    for (const node of opmPack.nodes) {
      for (const [from, to] of [['stock:kerbin:surface', node.id], [node.id, 'stock:kerbin:surface']] as const) {
        const route = findLowestCostPath(graph, from, to)
        expect(route.status, `${from} → ${to}`).toBe('success')
        if (route.status === 'success') expect(Number.isFinite(route.totalDeltaV)).toBe(true)
      }
    }
  })
})
