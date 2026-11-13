import { describe, expect, it } from 'vitest'
import type { PlanetPack } from '../types/planner'
import { buildGraph } from '../utils/buildGraph'
import { findMissionRoute } from '../utils/mission'
import { validatePlanetPack } from '../utils/validatePlanetPack'
import { withSiblingTransfers, siblingTransferSource, type SiblingTransferReference } from './siblingTransfers'
import { stockPack } from './stock'
import { stockPhysicalReferences } from './stockPhysics'
import { opmPack } from './opm'
import { opmReferences } from './opmReference'
import { rssPack } from './rss'
import { rssPhysicalReferences } from './rssPhysics'
import { stockKcalbelohPack, opmKcalbelohPack } from './kcalbeloh'

const configurations = [
  { pack: stockPack, references: stockPhysicalReferences, directed: 22 },
  { pack: opmPack, references: [...stockPhysicalReferences, ...opmReferences], directed: 46 },
  { pack: rssPack, references: rssPhysicalReferences, directed: 76 },
] as const
const siblingEdges = (pack: PlanetPack) => pack.maneuvers.filter(edge => edge.sourceId === siblingTransferSource.id)

function fixture() {
  const pack: PlanetPack = {
    id: 'test-sibling', name: 'Sibling reference fixture', version: '1', description: 'Directed orbital fixture.',
    sources: [{ id: 'published', title: 'Fixture reference', url: 'https://example.test/reference' }], assumptions: [],
    bodies: [
      { id: 'sun', name: 'Sun', kind: 'star', parentId: null, hasSurface: false, hasAtmosphere: false, color: '#ffffff' },
      { id: 'parent', name: 'Parent', kind: 'planet', parentId: 'sun', hasSurface: true, hasAtmosphere: false, color: '#ffffff' },
      { id: 'inner', name: 'Inner', kind: 'moon', parentId: 'parent', hasSurface: true, hasAtmosphere: false, color: '#ffffff' },
      { id: 'outer', name: 'Outer', kind: 'moon', parentId: 'parent', hasSurface: true, hasAtmosphere: false, color: '#ffffff' },
    ],
    nodes: [
      { id: 'inner:orbit', bodyId: 'inner', kind: 'orbit', label: 'Inner low orbit', altitudeKm: 14 },
      { id: 'outer:orbit', bodyId: 'outer', kind: 'orbit', label: 'Outer low orbit', altitudeKm: 10 },
    ], maneuvers: [],
  }
  const references: SiblingTransferReference[] = [
    { bodyId: 'parent', parentBodyId: 'sun', radiusM: 600000, gravitationalParameter: 3531600000000, atmosphereHeightM: 0, semiMajorAxisM: 13599840256 },
    { bodyId: 'inner', parentBodyId: 'parent', radiusM: 200000, gravitationalParameter: 65138397521, atmosphereHeightM: 0, semiMajorAxisM: 12000000, inclinationDeg: 0, longitudeOfAscendingNodeDeg: 0, eccentricity: 0 },
    { bodyId: 'outer', parentBodyId: 'parent', radiusM: 60000, gravitationalParameter: 1765800026, atmosphereHeightM: 0, semiMajorAxisM: 47000000, inclinationDeg: 6, longitudeOfAscendingNodeDeg: 78, eccentricity: 0 },
  ]
  return { pack, references }
}

describe('complete sibling-moon transfer references', () => {
  it.each(configurations)('adds supported local moon pairs without a parent orbit visit in $pack.id', ({ pack, directed }) => {
    expect(validatePlanetPack(pack)).toEqual([])
    const edges = siblingEdges(pack)
    expect(edges).toHaveLength(directed)
    for (const edge of edges) {
      const from = pack.nodes.find(node => node.id === edge.from)!
      const to = pack.nodes.find(node => node.id === edge.to)!
      const fromBody = pack.bodies.find(body => body.id === from.bodyId)!
      const toBody = pack.bodies.find(body => body.id === to.bodyId)!
      expect(edge).toMatchObject({ directTransfer: true, kind: 'transfer' })
      expect(from.kind).toBe('orbit')
      expect(to.kind).toBe('orbit')
      expect(fromBody.kind).toBe('moon')
      expect(toBody.kind).toBe('moon')
      expect(fromBody.parentId).toBe(toBody.parentId)
      expect(edge.deltaV).toBeGreaterThan(0)
      expect(edge.assumptions.join(' ')).toContain('Atmosphere options do not reduce')
    }
    expect(pack.sources.find(source => source.id === siblingTransferSource.id)?.budgetType).toBe('model')
  })

  it.each(configurations)('matches independent vis-viva and orbital-normal calculations for every $pack.id pair', ({ pack, references }) => {
    const byId = new Map(references.map(reference => [reference.bodyId, reference]))
    for (const edge of siblingEdges(pack)) {
      const from = pack.nodes.find(node => node.id === edge.from)!
      const to = pack.nodes.find(node => node.id === edge.to)!
      const a = byId.get(from.bodyId)!
      const b = byId.get(to.bodyId)!
      const parentMu = byId.get(a.parentBodyId)!.gravitationalParameter
      const transferA = (a.semiMajorAxisM + b.semiMajorAxisM) / 2
      const normal = (reference: typeof a) => {
        const inclination = reference.inclinationDeg! * Math.PI / 180
        const node = reference.longitudeOfAscendingNodeDeg! * Math.PI / 180
        return [Math.sin(inclination) * Math.sin(node), -Math.sin(inclination) * Math.cos(node), Math.cos(inclination)]
      }
      const na = normal(a)
      const nb = normal(b)
      const planeCosine = Math.max(-1, Math.min(1, na.reduce((sum, value, index) => sum + value * nb[index]!, 0)))
      const excess = (reference: typeof a) => {
        const circular = Math.sqrt(parentMu / reference.semiMajorAxisM)
        const transfer = Math.sqrt(parentMu * (2 / reference.semiMajorAxisM - 1 / transferA))
        return reference.semiMajorAxisM < Math.max(a.semiMajorAxisM, b.semiMajorAxisM)
          ? Math.abs(circular - transfer)
          : Math.sqrt(circular ** 2 + transfer ** 2 - 2 * circular * transfer * planeCosine)
      }
      const raw = (reference: typeof a, altitudeKm: number) => {
        const radius = reference.radiusM + altitudeKm * 1000
        return Math.sqrt(excess(reference) ** 2 + 2 * reference.gravitationalParameter / radius)
          - Math.sqrt(reference.gravitationalParameter / radius)
      }
      const departure = raw(a, from.altitudeKm!)
      const capture = raw(b, to.altitudeKm!)
      expect(edge.deltaV, edge.id).toBe(Math.ceil(departure) + Math.ceil(capture))
      const reverse = siblingEdges(pack).find(candidate => candidate.from === edge.to && candidate.to === edge.from)!
      expect(reverse.deltaV).toBe(edge.deltaV)
      expect(reverse.assumptions).not.toBe(edge.assumptions)
    }
  })

  it.each([
    { pack: stockPack, from: 'stock:mun:orbit', to: 'stock:minmus:orbit', expected: 330 },
    { pack: stockPack, from: 'stock:laythe:orbit', to: 'stock:vall:orbit', expected: 1176 },
    { pack: stockPack, from: 'stock:bop:orbit', to: 'stock:pol:orbit', expected: 281 },
    { pack: opmPack, from: 'opm:hale:orbit', to: 'opm:ovok:orbit', expected: 181 },
    { pack: rssPack, from: 'rss:phobos:orbit', to: 'rss:deimos:orbit', expected: 738 },
    { pack: rssPack, from: 'rss:io:orbit', to: 'rss:europa:orbit', expected: 2547 },
  ])('reproduces the independently calculated $from → $to landmark ($expected m/s)', ({ pack, from, to, expected }) => {
    const graph = buildGraph(pack)
    for (const mode of ['one-way', 'return-only', 'round-trip'] as const) {
      const route = findMissionRoute(graph, from, to, mode)
      expect(route).toMatchObject({ status: 'success', totalDeltaV: expected * (mode === 'round-trip' ? 2 : 1) })
      if (route.status !== 'success') throw new Error(route.message)
      expect(route.nodeIds).toEqual(mode === 'one-way' ? [from, to] : mode === 'return-only' ? [to, from] : [from, to, from])
      expect(route.legs.every(({ edge }) => edge.sourceId === siblingTransferSource.id)).toBe(true)
    }
  })

  it('keeps moon surface budgets separate from the complete low-orbit transfer', () => {
    const route = findMissionRoute(buildGraph(stockPack), 'stock:mun:surface', 'stock:minmus:surface', 'one-way')
    expect(route).toMatchObject({ status: 'success', totalDeltaV: 1090 })
    if (route.status !== 'success') throw new Error(route.message)
    expect(route.legs.map(({ edge }) => edge.deltaV)).toEqual([580, 330, 180])
  })

  it('includes a verified outer-orbit plane difference rather than silently assuming coplanar moons', () => {
    const { pack, references } = fixture()
    const inclined = withSiblingTransfers(pack, references)
    expect(siblingEdges(inclined).map(edge => edge.deltaV)).toEqual([330, 330])
    const coplanar = withSiblingTransfers(pack, references.map(reference => ({ ...reference, inclinationDeg: 0 })))
    expect(siblingEdges(coplanar).map(edge => edge.deltaV)).toEqual([329, 329])
    expect(siblingEdges(inclined)[0]!.assumptions.join(' ')).toContain('Mutual inclination 6.000000000°')
  })

  it('clones source data, preserves original records, and deduplicates repeated augmentation', () => {
    const { pack, references } = fixture()
    const before = structuredClone(pack)
    const result = withSiblingTransfers(pack, references)
    expect(pack).toEqual(before)
    expect(result).not.toBe(pack)
    expect(result.nodes[0]).not.toBe(pack.nodes[0])
    expect(withSiblingTransfers(result, references)).toEqual(result)
    expect(result.sources.filter(source => source.id === siblingTransferSource.id)).toHaveLength(1)
  })

  it('preserves supplied complete map pairs instead of repricing them', () => {
    const { pack, references } = fixture()
    pack.maneuvers = [['inner:orbit', 'outer:orbit'], ['outer:orbit', 'inner:orbit']].map(([from, to], index) => ({
      id: `published-${index}`, from: from!, to: to!, deltaV: 123 + index, kind: 'transfer', sourceId: 'published', label: 'Published complete pair', assumptions: ['Published reference.'],
    }))
    const result = withSiblingTransfers(pack, references)
    expect(result).toEqual(pack)
    expect(result.maneuvers[0]).not.toBe(pack.maneuvers[0])
  })

  it('inherits base-system pairs without replacing native Kcalbeloh complete reference pairs', () => {
    for (const [pack, count] of [[stockKcalbelohPack, 22], [opmKcalbelohPack, 46]] as const) {
      expect(siblingEdges(pack)).toHaveLength(count)
      expect(siblingEdges(pack).every(edge => !edge.from.startsWith('kcalbeloh:') && !edge.to.startsWith('kcalbeloh:'))).toBe(true)
      expect(pack.maneuvers.filter(edge => edge.sourceId === 'kcalbeloh-map-1.1.8')).toHaveLength(106)
    }
  })

  it('does not invent a Hohmann solution for equal-radius co-orbitals or retrograde pairs', () => {
    const { pack, references } = fixture()
    const sameRadius = references.map(reference => reference.bodyId === 'outer' ? { ...reference, semiMajorAxisM: 12000000 } : reference)
    expect(siblingEdges(withSiblingTransfers(pack, sameRadius))).toEqual([])
    const retrograde = references.map(reference => reference.bodyId === 'outer' ? { ...reference, inclinationDeg: 161.1 } : reference)
    expect(siblingEdges(withSiblingTransfers(pack, retrograde))).toEqual([])
    expect(siblingEdges(opmPack).some(edge => [edge.from, edge.to].some(id => id.startsWith('opm:thatmo:')))).toBe(false)
    expect(siblingEdges(opmPack).some(edge => [edge.from, edge.to].every(id => id.startsWith('opm:polta:') || id.startsWith('opm:priax:')))).toBe(false)
  })

  it.each([
    { label: 'unknown inclination', patch: { inclinationDeg: undefined } },
    { label: 'unknown ascending node', patch: { longitudeOfAscendingNodeDeg: undefined } },
    { label: 'unknown eccentricity', patch: { eccentricity: undefined } },
    { label: 'unbound orbit', patch: { eccentricity: 1 } },
    { label: 'incompatible parent', patch: { parentBodyId: 'sun' } },
    { label: 'unsafe parking atmosphere', patch: { atmosphereHeightM: 10000 } },
    { label: 'unsafe parking SOI', patch: { sphereOfInfluenceM: 70000 } },
  ])('omits an endpoint with $label', ({ patch }) => {
    const { pack, references } = fixture()
    const uncertain = references.map(reference => reference.bodyId === 'outer' ? { ...reference, ...patch } : reference)
    expect(siblingEdges(withSiblingTransfers(pack, uncertain))).toEqual([])
  })

  it('requires explicit low parking references and a physical parent', () => {
    const { pack, references } = fixture()
    const missing = { ...pack, nodes: pack.nodes.map(node => node.bodyId === 'outer' ? { ...node, altitudeKm: undefined } : node) }
    expect(siblingEdges(withSiblingTransfers(missing, references))).toEqual([])
    const binary = { ...pack, bodies: pack.bodies.map(body => body.id === 'parent' ? { ...body, kind: 'barycenter' as const } : body) }
    expect(siblingEdges(withSiblingTransfers(binary, references))).toEqual([])
  })
})
