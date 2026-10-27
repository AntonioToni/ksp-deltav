import { describe, expect, it } from 'vitest'
import { buildGraph } from '../utils/buildGraph'
import { findLowestCostPath } from '../utils/findRoute'
import { validatePlanetPack } from '../utils/validatePlanetPack'
import { opmPack } from './opm'
import { planetPacks } from './planetPacks'
import { rssPack } from './rss'
import { stockPack } from './stock'

describe('the reference-based RSS pack', () => {
  it('registers RSS without changing or sharing stock and OPM data', () => {
    expect(planetPacks.map(pack => pack.id)).toEqual(['stock', 'opm', 'rss', 'stock-kcalbeloh', 'opm-kcalbeloh'])
    expect(planetPacks[0]).toBe(stockPack)
    expect(planetPacks[1]).toBe(opmPack)
    expect(planetPacks[2]).toBe(rssPack)
    expect(rssPack).toMatchObject({ name: 'Real Solar System', shortName: 'RSS', transferHubBodyId: 'rss:earth' })
    expect(rssPack.bodies.every(body => body.id.startsWith('rss:'))).toBe(true)
    expect(rssPack.nodes.every(node => node.id.startsWith('rss:') && node.bodyId.startsWith('rss:'))).toBe(true)
    for (const pack of [stockPack, opmPack]) {
      expect(pack.nodes.some(node => rssPack.nodes.includes(node))).toBe(false)
      expect(pack.maneuvers.some(edge => rssPack.maneuvers.includes(edge))).toBe(false)
    }
    expect(stockPack.bodies.find(body => body.id === 'stock:eeloo'))
      .toMatchObject({ parentId: 'stock:kerbol', kind: 'planet' })
    expect(opmPack.bodies.find(body => body.id === 'stock:eeloo'))
      .toMatchObject({ parentId: 'opm:sarnus', kind: 'moon' })
  })

  it('covers 33 reference-supported bodies, 102 states, and 202 directed maneuvers', () => {
    expect(validatePlanetPack(rssPack)).toEqual([])
    expect(rssPack.bodies).toHaveLength(33)
    expect(rssPack.nodes).toHaveLength(102)
    expect(rssPack.maneuvers).toHaveLength(202)
    expect(rssPack.bodies.filter(body => body.kind === 'moon')).toHaveLength(21)
    expect(rssPack.bodies.filter(body => body.kind === 'planet')).toHaveLength(11)
    expect(rssPack.nodes.filter(node => node.kind === 'elliptical')).toHaveLength(10)
    for (const edge of rssPack.maneuvers) {
      expect(Number.isInteger(edge.deltaV), edge.id).toBe(true)
      expect(edge.deltaV, edge.id).toBeGreaterThan(0)
      expect(edge.sourceId).toBe('rss-community-solar-system-map')
      expect(edge.assumptions.length, edge.id).toBeGreaterThan(0)
    }
  })

  it('keeps official hierarchy and only source-supported braking opportunities', () => {
    const byId = new Map(rssPack.bodies.map(body => [body.id, body]))
    expect(byId.get('rss:moon')?.parentId).toBe('rss:earth')
    expect(byId.get('rss:titan')?.parentId).toBe('rss:saturn')
    expect(byId.get('rss:triton')?.parentId).toBe('rss:neptune')
    expect(byId.get('rss:charon')?.parentId).toBe('rss:pluto')
    for (const body of ['jupiter', 'saturn', 'uranus', 'neptune']) {
      expect(byId.get(`rss:${body}`)).toMatchObject({ hasAtmosphere: true, hasSurface: false })
      expect(rssPack.nodes.some(node => node.id === `rss:${body}:surface`)).toBe(false)
    }
    expect(rssPack.nodes.some(node => node.bodyId === 'rss:sun')).toBe(false)
    for (const body of ['pluto', 'triton']) {
      expect(byId.get(`rss:${body}`)).toMatchObject({ hasAtmosphere: true, supportsAtmosphericBraking: false })
    }
    expect(rssPack.bodies.filter(body => body.hasAtmosphere).map(body => body.id)).toEqual([
      'rss:venus', 'rss:earth', 'rss:mars', 'rss:jupiter', 'rss:saturn',
      'rss:titan', 'rss:uranus', 'rss:neptune', 'rss:triton', 'rss:pluto',
    ])
  })

  it('consolidates transfer rails without incorrectly treating increments as Earth-direct costs', () => {
    const edge = (from: string, to: string) => rssPack.maneuvers.find(item => item.from === from && item.to === to)
    expect(edge('rss:earth:orbit', 'rss:earth:encounter')?.deltaV).toBe(3210)
    expect(edge('rss:earth:orbit', 'rss:moon:encounter')?.deltaV).toBe(3120)
    expect(edge('rss:moon:encounter', 'rss:moon:orbit')?.deltaV).toBe(820)
    expect(edge('rss:earth:encounter', 'rss:mercury:encounter')?.deltaV).toBe(2340)
    expect(edge('rss:earth:encounter', 'rss:jupiter:encounter')?.deltaV).toBe(3090)
    expect(edge('rss:earth:encounter', 'rss:pluto:encounter')?.deltaV).toBe(5150)
    expect(edge('rss:jupiter:elliptical', 'rss:io:encounter')?.deltaV).toBe(4540)
    expect(edge('rss:jupiter:elliptical', 'rss:jupiter:orbit')?.deltaV).toBe(17210)
    expect(edge('rss:saturn:elliptical', 'rss:mimas:encounter')?.deltaV).toBe(4700)
    expect(rssPack.maneuvers.some(item => item.from === 'rss:jupiter:orbit' && item.to === 'rss:io:encounter')).toBe(false)
  })

  it.each([
    ['moon:surface', 14660],
    ['mercury:surface', 25140],
    ['venus:surface', 42790],
    ['mars:surface', 18310],
    ['phobos:surface', 14559],
    ['deimos:surface', 14266],
    ['vesta:surface', 17890],
    ['ceres:surface', 18710],
    ['jupiter:orbit', 32780],
    ['io:surface', 28410],
    ['europa:surface', 26490],
    ['ganymede:surface', 25020],
    ['callisto:surface', 23170],
    ['saturn:orbit', 26930],
    ['mimas:surface', 25570],
    ['enceladus:surface', 25040],
    ['tethys:surface', 24570],
    ['dione:surface', 24010],
    ['rhea:surface', 23250],
    ['titan:surface', 28030],
    ['iapetus:surface', 19740],
    ['uranus:orbit', 23620],
    ['miranda:surface', 22150],
    ['ariel:surface', 21670],
    ['umbriel:surface', 21220],
    ['titania:surface', 20660],
    ['oberon:surface', 20320],
    ['neptune:orbit', 24350],
    ['triton:surface', 21560],
    ['pluto:surface', 21300],
    ['charon:surface', 20700],
  ])('sums the pinned diagram from Earth surface to %s as %i m/s', (destination, expected) => {
    const route = findLowestCostPath(buildGraph(rssPack), 'rss:earth:surface', `rss:${destination}`)
    expect(route.status).toBe('success')
    if (route.status !== 'success') throw new Error(route.message)
    expect(route.totalDeltaV).toBe(expected)
    expect(route.legs.reduce((total, leg) => total + leg.edge.deltaV, 0)).toBe(expected)
    expect(route.legs.at(-1)?.cumulativeDeltaV).toBe(expected)
  })

  it('does not advertise legacy orbits at or inside current RSS atmospheres', () => {
    for (const body of ['saturn', 'uranus', 'neptune', 'pluto', 'triton']) {
      expect(rssPack.nodes.find(node => node.id === `rss:${body}:orbit`)?.altitudeKm).toBeUndefined()
    }
    expect(rssPack.nodes.find(node => node.id === 'rss:earth:orbit')?.altitudeKm).toBe(250)
    expect(rssPack.nodes.find(node => node.id === 'rss:venus:orbit')?.altitudeKm).toBe(400)
    expect(rssPack.nodes.find(node => node.id === 'rss:titan:orbit')?.altitudeKm).toBe(1000)
    expect(rssPack.assumptions.join(' ')).toContain('no visible version/date')
    expect(rssPack.assumptions.join(' ')).toContain('placeholders')
  })

  it('requires an Earth parking-orbit layover between other planetary systems', () => {
    const route = findLowestCostPath(buildGraph(rssPack), 'rss:mars:surface', 'rss:venus:surface')
    expect(route.status).toBe('success')
    if (route.status !== 'success') throw new Error(route.message)
    expect(route.nodeIds).toContain('rss:earth:orbit')
    expect(route.nodeIds).not.toContain('rss:earth:surface')
    expect(route.nodeIds.some(node => node.startsWith('stock:'))).toBe(false)
  })

  it('has finite outbound and return routes to every supported state without altering budgets', () => {
    const snapshot = JSON.stringify(rssPack)
    const graph = buildGraph(rssPack)
    for (const node of rssPack.nodes) {
      for (const [from, to] of [['rss:earth:surface', node.id], [node.id, 'rss:earth:surface']] as const) {
        const route = findLowestCostPath(graph, from, to)
        expect(route.status, `${from} → ${to}`).toBe('success')
        if (route.status === 'success') expect(Number.isFinite(route.totalDeltaV)).toBe(true)
      }
    }
    expect(JSON.stringify(rssPack)).toBe(snapshot)
  })
})
