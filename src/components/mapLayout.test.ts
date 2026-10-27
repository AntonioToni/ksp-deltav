import { describe, expect, it } from 'vitest'
import { opmPack } from '../data/opm'
import { rssPack } from '../data/rss'
import { stockPack } from '../data/stock'
import type { ManeuverEdge, PlanetPack, RouteNode } from '../types/planner'
import { arrowPosition, connectionPoints, createMapLayout, packForMapRegion, type MapMode, type Point } from './mapLayout'

// No familiar names or IDs: includes a selectable star, duplicate orbit kinds,
// a moon of a moon, a long body name and a link between two non-home planets.
function futurePackFixture(): PlanetPack {
  const bodyIds = new Map(stockPack.bodies.map((body, index) => [body.id, `future:body-${index}`]))
  const nodeIds = new Map(stockPack.nodes.map((node, index) => [node.id, `future:state-${index}`]))
  const bodies = stockPack.bodies.map((body, index) => ({
    ...body, id: bodyIds.get(body.id)!, name: `Uncharted ${index}`,
    parentId: body.parentId ? bodyIds.get(body.parentId)! : null,
  }))
  const nodes = stockPack.nodes.map(node => ({
    ...node, id: nodeIds.get(node.id)!, bodyId: bodyIds.get(node.bodyId)!, label: `Future ${node.label}`,
  }))
  const maneuvers = stockPack.maneuvers.map((edge, index) => ({
    ...edge, id: `future:edge-${index}`, from: nodeIds.get(edge.from)!, to: nodeIds.get(edge.to)!,
  }))
  const home = bodyIds.get('stock:kerbin')!
  bodies.push({ ...bodies[5]!, id: 'future:nested', name: 'Companion with an unusually long designation', parentId: bodyIds.get('stock:mun')! })
  const extras: RouteNode[] = [
    { id: 'future:stellar-orbit', bodyId: bodies[0]!.id, kind: 'orbit', label: 'Selectable stellar orbit' },
    { id: 'future:alternate-orbit', bodyId: home, kind: 'orbit', label: 'Second supported parking orbit' },
    ...(['surface', 'orbit', 'encounter'] as const).map(kind => ({
      id: `future:nested-${kind}`, bodyId: 'future:nested', kind, label: `Nested companion ${kind}`,
    })),
  ]
  nodes.push(...extras)
  function pair(from: string, to: string) {
    for (const [a, b] of [[from, to], [to, from]]) {
      const edge: ManeuverEdge = {
        id: `${a}->${b}`, from: a!, to: b!, deltaV: 1, kind: 'transfer', label: 'Geometry fixture link', sourceId: 'fixture', assumptions: [],
      }
      maneuvers.push(edge)
    }
  }
  pair(nodeIds.get('stock:mun:orbit')!, 'future:nested-encounter')
  pair('future:nested-surface', 'future:nested-orbit')
  pair('future:nested-orbit', 'future:nested-encounter')
  pair(nodeIds.get('stock:moho:encounter')!, nodeIds.get('stock:duna:encounter')!)
  pair('future:stellar-orbit', nodeIds.get('stock:moho:encounter')!)
  pair('future:alternate-orbit', nodeIds.get('stock:kerbin:encounter')!)
  return {
    id: 'future-fixture', name: 'Unknown future system', version: 'test', description: 'Geometry fixture',
    sources: [], assumptions: [], bodies, nodes, maneuvers, transferHubBodyId: home,
  }
}

const futurePack = futurePackFixture()

describe.each([stockPack, opmPack, rssPack, futurePack])('$name', (pack) => {
  describe.each<MapMode>(['wide', 'portrait', 'short'])('%s schematic layout', (mode) => {
    it('places every supported state at a distinct point with room for selection and touch targets', () => {
      const layout = createMapLayout(pack, mode)
      expect(layout.nodePositions.size).toBe(pack.nodes.length)
      expect(new Set([...layout.nodePositions.values()].map(point => `${point.x},${point.y}`)).size).toBe(pack.nodes.length)
      for (const node of pack.nodes) {
        const point = layout.nodePositions.get(node.id)
        expect(point, node.id).toBeDefined()
        if (!point) continue
        const margin = Math.max(layout.hitRadius, layout.radius + 9)
        expect(point.x - margin, node.id).toBeGreaterThanOrEqual(0)
        expect(point.x + margin, node.id).toBeLessThanOrEqual(layout.width)
        expect(point.y - margin, node.id).toBeGreaterThanOrEqual(0)
        expect(point.y + margin, node.id).toBeLessThanOrEqual(layout.height)
      }
      expect(new Set(layout.labels.map(label => label.body.id))).toEqual(new Set(pack.nodes.map(node => node.bodyId)))
      for (const label of layout.labels) {
        expect(label.x).toBeGreaterThanOrEqual(0)
        expect(label.x).toBeLessThanOrEqual(layout.width)
        expect(label.y - layout.labelFontSize).toBeGreaterThanOrEqual(0)
        expect(label.y + layout.labelFontSize * 0.3).toBeLessThanOrEqual(layout.height)
      }
      expect(pack.nodes.some(node => node.id === layout.hubId)).toBe(true)
      expect(pack.nodes.find(node => node.id === layout.hubId)?.bodyId).toBe(pack.transferHubBodyId)
    })

    it('draws opposite maneuvers on one reversible path between their real states', () => {
      const layout = createMapLayout(pack, mode)
      for (const edge of pack.maneuvers) {
        const from = pack.nodes.find(node => node.id === edge.from)!
        const to = pack.nodes.find(node => node.id === edge.to)!
        const points = connectionPoints(from, to, layout, pack)
        expect(points.at(0)).toEqual(layout.nodePositions.get(edge.from))
        expect(points.at(-1)).toEqual(layout.nodePositions.get(edge.to))
        expect(connectionPoints(to, from, layout, pack)).toEqual([...points].reverse())
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
})

it('preserves the Stock/OPM layouts while selecting the solar-system and generic presentations appropriately', () => {
  expect(createMapLayout(stockPack).presentation).toBe('stock')
  expect(createMapLayout(stockPack).nodePositions.get('stock:kerbin:encounter')).toEqual({ x: 620, y: 460 })
  expect(createMapLayout(opmPack).presentation).toBe('opm')
  expect(createMapLayout(opmPack, 'portrait').presentation).toBe('generated')
  expect(createMapLayout(rssPack).presentation).toBe('rss')
  expect(createMapLayout(rssPack, 'portrait').presentation).toBe('generated')
  expect(createMapLayout(rssPack).hubId).toBe('rss:earth:encounter')
  expect(createMapLayout(futurePack).presentation).toBe('generated')
})

it('falls back for an extension of a familiar pack instead of dropping its new states', () => {
  const extended: PlanetPack = {
    ...stockPack,
    nodes: [...stockPack.nodes, { id: 'stock:kerbin:alternate', bodyId: 'stock:kerbin', kind: 'orbit', label: 'Extra parking orbit' }],
  }
  const layout = createMapLayout(extended)
  expect(layout.presentation).toBe('generated')
  expect(layout.nodePositions.size).toBe(extended.nodes.length)
})

it.each<MapMode>(['wide', 'portrait', 'short'])('keeps a custom selectable star named like a preset body visible in %s mode', mode => {
  const pack: PlanetPack = {
    ...stockPack, id: 'custom-star',
    bodies: [{ id: 'custom:moho', name: 'Custom star', kind: 'star', parentId: null, hasSurface: false, hasAtmosphere: false, color: '#ffffff' }],
    nodes: [{ id: 'custom:stellar-orbit', bodyId: 'custom:moho', kind: 'orbit', label: 'Stellar orbit' }],
    maneuvers: [], transferHubBodyId: undefined,
  }
  const layout = createMapLayout(pack, mode)
  expect(layout.presentation).toBe('generated')
  expect(layout.nodePositions.has('custom:stellar-orbit')).toBe(true)
  expect(layout.labels.map(label => label.body.id)).toEqual(['custom:moho'])
})

it.each<MapMode>(['wide', 'portrait', 'short'])('separates familiar body names in different custom namespaces in %s mode', mode => {
  const original = stockPack.bodies.find(body => body.id === 'stock:moho')!
  const pack: PlanetPack = {
    ...stockPack, id: 'custom-names',
    bodies: [stockPack.bodies[0]!, { ...original, id: 'one:moho' }, { ...original, id: 'two:moho' }],
    nodes: [
      { id: 'one:orbit', bodyId: 'one:moho', kind: 'orbit', label: 'One orbit' },
      { id: 'two:encounter', bodyId: 'two:moho', kind: 'encounter', label: 'Two encounter' },
    ],
    maneuvers: [], transferHubBodyId: undefined,
  }
  const layout = createMapLayout(pack, mode)
  expect(layout.presentation).toBe('generated')
  expect(new Set(layout.labels.map(label => `${label.x},${label.y}`)).size).toBe(2)
  expect(layout.nodePositions.size).toBe(2)
})

it.each<MapMode>(['wide', 'portrait', 'short'])('omits labels for custom bodies without routing states in %s mode', mode => {
  const pack: PlanetPack = {
    ...stockPack, id: 'custom-unmapped',
    bodies: [...stockPack.bodies, { ...stockPack.bodies[1]!, id: 'custom:unmapped', name: 'Unmapped body' }],
  }
  const layout = createMapLayout(pack, mode)
  expect(layout.nodePositions.size).toBe(pack.nodes.length)
  expect(layout.labels.some(label => label.body.id === 'custom:unmapped')).toBe(false)
})

it('chooses a supported, connected real hub when a future pack has no home-body metadata', () => {
  const pack = { ...futurePack, transferHubBodyId: undefined }
  const layout = createMapLayout(pack)
  expect(pack.nodes.some(node => node.id === layout.hubId)).toBe(true)
  expect(pack.maneuvers.some(edge => edge.from === layout.hubId || edge.to === layout.hubId)).toBe(true)
})

function distanceToSegment(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const squaredLength = dx * dx + dy * dy
  const fraction = squaredLength ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / squaredLength)) : 0
  return Math.hypot(point.x - start.x - fraction * dx, point.y - start.y - fraction * dy)
}

function regionalFixture(): PlanetPack {
  const body = (id: string, name: string, kind: PlanetPack['bodies'][number]['kind'], parentId: string | null, hasSurface = false) => ({ id, name, kind, parentId, hasSurface, hasAtmosphere: false, color: '#aabbcc' })
  return {
    id: 'regional-fixture', name: 'Multiple stellar systems', version: '1', description: 'Presentation fixture', sources: [{ id: 'fixture', title: 'Fixture reference', url: 'https://example.org' }], assumptions: [], transferHubBodyId: 'fixture:home',
    bodies: [
      body('fixture:sun', 'Home star', 'star', null),
      body('fixture:home', 'Home', 'planet', 'fixture:sun', true),
      body('fixture:blackhole', 'Distant black hole', 'black-hole', 'fixture:sun'),
      body('fixture:star', 'Distant star', 'star', 'fixture:blackhole'),
      body('fixture:world', 'Distant world', 'planet', 'fixture:star', true),
      body('fixture:binary', 'Binary reference', 'barycenter', 'fixture:star'),
      body('fixture:giant', 'Catalog-only giant', 'planet', 'fixture:binary'),
    ],
    nodes: [
      { id: 'fixture:home:surface', bodyId: 'fixture:home', kind: 'surface', label: 'Home surface' },
      { id: 'fixture:home:orbit', bodyId: 'fixture:home', kind: 'orbit', label: 'Home low orbit' },
      { id: 'fixture:home:encounter', bodyId: 'fixture:home', kind: 'encounter', label: 'Home encounter' },
      { id: 'fixture:blackhole:reference', bodyId: 'fixture:blackhole', kind: 'reference', label: 'Black-hole map reference' },
      { id: 'fixture:star:reference', bodyId: 'fixture:star', kind: 'reference', label: 'Stellar map reference' },
      { id: 'fixture:binary:reference', bodyId: 'fixture:binary', kind: 'reference', label: 'Circumbinary map reference' },
      { id: 'fixture:world:surface', bodyId: 'fixture:world', kind: 'surface', label: 'Distant world surface' },
      { id: 'fixture:world:orbit', bodyId: 'fixture:world', kind: 'orbit', label: 'Distant world low orbit' },
    ],
    maneuvers: [
      { id: 'fixture:home:ascent', from: 'fixture:home:surface', to: 'fixture:home:orbit', deltaV: 500, kind: 'ascent', label: 'Home ascent', sourceId: 'fixture', assumptions: [] },
      { id: 'fixture:stellar-transfer', from: 'fixture:blackhole:reference', to: 'fixture:star:reference', deltaV: 10000, kind: 'transfer', label: 'Published stellar transfer', sourceId: 'fixture', assumptions: [] },
      { id: 'fixture:distant-ascent', from: 'fixture:world:surface', to: 'fixture:world:orbit', deltaV: 1000, kind: 'ascent', label: 'Distant ascent', sourceId: 'fixture', assumptions: [] },
    ],
    unpricedConnections: [
      { id: 'fixture:portal', from: 'fixture:home:orbit', to: 'fixture:world:orbit', forwardKind: 'wormhole', reverseKind: 'wormhole', label: 'Missing portal allowance', sourceId: 'fixture', assumptions: [] },
      { id: 'fixture:stellar-link', from: 'fixture:star:reference', to: 'fixture:world:orbit', forwardKind: 'transfer', reverseKind: 'transfer', label: 'Missing local connector', sourceId: 'fixture', assumptions: [] },
    ],
    mapRegions: [
      { id: 'home', label: 'Home system', bodyIds: ['fixture:sun', 'fixture:home'] },
      { id: 'distant', label: 'Distant systems', bodyIds: ['fixture:blackhole', 'fixture:star', 'fixture:world', 'fixture:binary', 'fixture:giant'] },
    ],
  }
}

describe('regional presentation of a global maneuver pack', () => {
  it('filters only the visible bodies, states and complete connections without mutating source data', () => {
    const pack = regionalFixture()
    const before = structuredClone(pack)
    const home = packForMapRegion(pack, 'home')
    const distant = packForMapRegion(pack, 'distant')
    expect(home.nodes.map(node => node.id)).toEqual(['fixture:home:surface', 'fixture:home:orbit', 'fixture:home:encounter'])
    expect(home.maneuvers.map(edge => edge.id)).toEqual(['fixture:home:ascent'])
    expect(home.unpricedConnections).toEqual([])
    expect(distant.unpricedConnections?.map(connection => connection.id)).toEqual(['fixture:stellar-link'])
    expect(distant.maneuvers.map(edge => edge.id)).toEqual(['fixture:stellar-transfer', 'fixture:distant-ascent'])
    expect(new Set([...home.nodes, ...distant.nodes].map(node => node.id))).toEqual(new Set(pack.nodes.map(node => node.id)))
    expect(pack).toEqual(before)
    expect(packForMapRegion(pack, 'all')).toBe(pack)
    expect(packForMapRegion(pack, 'unknown')).toBe(pack)
  })

  it.each<MapMode>(['wide', 'portrait', 'short'])('keeps every regional state and reference inside a finite %s schematic', mode => {
    const pack = regionalFixture()
    for (const regionId of ['all', ...pack.mapRegions!.map(region => region.id)]) {
      const visible = packForMapRegion(pack, regionId)
      const layout = createMapLayout(visible, mode)
      expect(layout.nodePositions.size).toBe(visible.nodes.length)
      for (const node of visible.nodes) {
        const point = layout.nodePositions.get(node.id)!
        expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true)
        expect(point.x - layout.radius).toBeGreaterThanOrEqual(0)
        expect(point.y - layout.radius).toBeGreaterThanOrEqual(0)
        expect(point.x + layout.radius).toBeLessThanOrEqual(layout.width)
        expect(point.y + layout.radius).toBeLessThanOrEqual(layout.height)
      }
      expect(layout.labels.some(label => label.body.id === 'fixture:giant')).toBe(false)
      for (const edge of [...visible.maneuvers, ...(visible.unpricedConnections ?? [])]) {
        const from = visible.nodes.find(node => node.id === edge.from)!
        const to = visible.nodes.find(node => node.id === edge.to)!
        const points = connectionPoints(from, to, layout, visible)
        expect(points.at(0)).toEqual(layout.nodePositions.get(from.id))
        expect(points.at(-1)).toEqual(layout.nodePositions.get(to.id))
        expect(connectionPoints(to, from, layout, visible)).toEqual([...points].reverse())
        expect(points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true)
      }
    }
  })
})

describe.each([opmPack, rssPack])('$shortName branch clearance', (pack) => {
  it.each<MapMode>(['wide', 'short'])('keeps %s interplanetary bands clear of unrelated state circles', (mode) => {
    const layout = createMapLayout(pack, mode)
    const nodes = new Map(pack.nodes.map(node => [node.id, node]))
    const planets = new Set(pack.bodies.filter(body => body.kind === 'planet').map(body => body.id))
    const transfers = pack.maneuvers.filter(edge => edge.from === layout.hubId
      && nodes.get(edge.to)?.kind === 'encounter' && planets.has(nodes.get(edge.to)!.bodyId))
    expect(transfers.length).toBeGreaterThan(0)
    for (const edge of transfers) {
      const points = connectionPoints(nodes.get(edge.from)!, nodes.get(edge.to)!, layout, pack)
      for (const node of pack.nodes) {
        if (node.id === edge.from || node.id === edge.to) continue
        const point = layout.nodePositions.get(node.id)!
        const distance = Math.min(...points.slice(1).map((end, index) => distanceToSegment(point, points[index]!, end)))
        // Selected bands are 19 units wide, in addition to the state radius.
        expect(distance, `${edge.id} passes ${node.label}`).toBeGreaterThan(layout.radius + 10)
      }
    }
  })
})

it.each<MapMode>(['wide', 'short'])('keeps RSS %s satellite transfer bands clear of unrelated states', (mode) => {
  const layout = createMapLayout(rssPack, mode)
  const nodes = new Map(rssPack.nodes.map(node => [node.id, node]))
  const moons = new Set(rssPack.bodies.filter(body => body.kind === 'moon').map(body => body.id))
  const transfers = rssPack.maneuvers.filter(edge => edge.kind === 'transfer' && moons.has(nodes.get(edge.to)!.bodyId))
  for (const edge of transfers) {
    const points = connectionPoints(nodes.get(edge.from)!, nodes.get(edge.to)!, layout, rssPack)
    for (const node of rssPack.nodes) {
      if (node.id === edge.from || node.id === edge.to) continue
      const point = layout.nodePositions.get(node.id)!
      const distance = Math.min(...points.slice(1).map((end, index) => distanceToSegment(point, points[index]!, end)))
      expect(distance, `${edge.id} passes ${node.label}`).toBeGreaterThan(layout.radius + 10)
    }
  }
})
