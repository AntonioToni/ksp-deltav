import { describe, expect, it } from 'vitest'
import {
  builtInConfigurations, changeBaseConfiguration, getBasePackId,
  planetPacks, primaryPlanetPacks,
} from './planetPacks'
import { stockPack } from './stock'
import { opmPack } from './opm'
import { rssPack } from './rss'
import { opmKcalbelohPack, stockKcalbelohPack, stockKcalbelohNoWormholesPack, opmKcalbelohNoWormholesPack } from './kcalbeloh'
import { parsePlanetPackJson } from '../utils/customPacks'
import { validatePlanetPack } from '../utils/validatePlanetPack'

describe('reviewed pack registry and compatible add-on selection', () => {
  it('keeps three compact base buttons while registering the four Kcalbeloh configurations', () => {
    expect(primaryPlanetPacks).toEqual([stockPack, opmPack, rssPack])
    expect(planetPacks.map(pack => pack.id)).toEqual(['stock', 'opm', 'rss', 'stock-kcalbeloh', 'opm-kcalbeloh', 'stock-kcalbeloh-no-wormholes', 'opm-kcalbeloh-no-wormholes'])
    expect(new Set(planetPacks.map(pack => pack.id)).size).toBe(planetPacks.length)
    expect(planetPacks.slice(0, 3)).toEqual(primaryPlanetPacks)
    expect(planetPacks.find(pack => pack.id === 'stock-kcalbeloh')).toBe(stockKcalbelohPack)
    expect(planetPacks.find(pack => pack.id === 'opm-kcalbeloh')).toBe(opmKcalbelohPack)
    expect(builtInConfigurations).toEqual([
      { pack: stockKcalbelohPack, basePackId: 'stock', addons: ['Kcalbeloh'], settings: { wormholes: true } },
      { pack: opmKcalbelohPack, basePackId: 'opm', addons: ['Kcalbeloh'], settings: { wormholes: true } },
      { pack: stockKcalbelohNoWormholesPack, basePackId: 'stock', addons: ['Kcalbeloh'], settings: { wormholes: false } },
      { pack: opmKcalbelohNoWormholesPack, basePackId: 'opm', addons: ['Kcalbeloh'], settings: { wormholes: false } },
    ])
    for (const configuration of builtInConfigurations) {
      expect(primaryPlanetPacks.some(base => base.id === configuration.basePackId)).toBe(true)
      expect(validatePlanetPack(configuration.pack)).toEqual([])
    }
  })

  it.each([
    ['stock-kcalbeloh', 'stock'], ['opm-kcalbeloh', 'opm'],
    ['stock-kcalbeloh-no-wormholes', 'stock'], ['opm-kcalbeloh-no-wormholes', 'opm'],
    ['stock', 'stock'], ['opm', 'opm'], ['rss', 'rss'],
    ['custom:test-system', 'custom:test-system'], ['unregistered', 'unregistered'],
  ])('shows base %s as %s without treating custom IDs as known add-ons', (pack, base) => {
    expect(getBasePackId(pack)).toBe(base)
  })

  it.each([
    ['stock-kcalbeloh', 'opm', 'opm-kcalbeloh'],
    ['opm-kcalbeloh', 'stock', 'stock-kcalbeloh'],
    ['stock-kcalbeloh', 'stock', 'stock-kcalbeloh'],
    ['opm-kcalbeloh', 'opm', 'opm-kcalbeloh'],
    ['stock-kcalbeloh', 'rss', 'rss'],
    ['opm-kcalbeloh', 'rss', 'rss'],
    ['stock-kcalbeloh-no-wormholes', 'opm', 'opm-kcalbeloh-no-wormholes'],
    ['opm-kcalbeloh-no-wormholes', 'stock', 'stock-kcalbeloh-no-wormholes'],
    ['stock-kcalbeloh-no-wormholes', 'stock', 'stock-kcalbeloh-no-wormholes'],
    ['opm-kcalbeloh-no-wormholes', 'opm', 'opm-kcalbeloh-no-wormholes'],
    ['stock-kcalbeloh-no-wormholes', 'rss', 'rss'],
    ['opm-kcalbeloh-no-wormholes', 'rss', 'rss'],
    ['stock', 'opm', 'opm'], ['opm', 'stock', 'stock'],
    ['rss', 'stock', 'stock'], ['custom:test-system', 'opm', 'opm'],
  ])('switching from %s to base %s selects %s', (current, next, expected) => {
    expect(changeBaseConfiguration(current, next)).toBe(expected)
  })
})

describe('exported built-in configuration templates', () => {
  it.each(planetPacks)('requires a new custom ID when importing the built-in $id template', pack => {
    const imported = parsePlanetPackJson(JSON.stringify(pack))
    expect(imported.status).toBe('error')
    if (imported.status === 'error') expect(imported.errors.join(' ')).toContain('reserved')
  })

  it.each([stockKcalbelohPack, opmKcalbelohPack, stockKcalbelohNoWormholesPack, opmKcalbelohNoWormholesPack])('round-trips the complete $id topology after a custom rename', pack => {
    const template = { ...pack, id: `custom:${pack.id}`, name: `My ${pack.name}` }
    const imported = parsePlanetPackJson(JSON.stringify(template))
    expect(imported.status).toBe('success')
    if (imported.status !== 'success') throw new Error(imported.errors.join('\n'))
    expect(imported.pack).toEqual(template)
    expect(imported.pack.nodes.filter(node => node.kind === 'reference')).toHaveLength(5)
    expect(imported.pack.mapRegions).toHaveLength(5)
    expect(imported.pack.unpricedConnections).toHaveLength(pack.id.endsWith('-no-wormholes') ? 9 : 10)
    expect(imported.pack.bodies.length).toBeGreaterThan(40)
    expect(imported.pack.nodes.length).toBe(pack.nodes.length)
    expect(imported.pack.nodes).not.toBe(pack.nodes)
    expect(imported.pack.unpricedConnections).not.toBe(pack.unpricedConnections)
    expect(imported.pack.mapRegions![0]!.bodyIds).not.toBe(pack.mapRegions![0]!.bodyIds)
    // A template carries missing-source descriptors, with no assumed manual
    // prices and no fabricated crossing edge in its source maneuver list.
    expect(imported.pack.maneuvers.some(edge => edge.kind === 'wormhole')).toBe(false)
    expect(imported.pack.unpricedConnections!.every(connection => !('deltaV' in connection))).toBe(true)
  })
})
