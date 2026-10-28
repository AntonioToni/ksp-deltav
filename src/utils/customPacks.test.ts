import { describe, expect, it } from 'vitest'
import { stockPack } from '../data/stock'
import { opmPack } from '../data/opm'
import { rssPack } from '../data/rss'
import examplePackJson from '../../docs/examples/custom-pack.json?raw'
import type { PlanetPack } from '../types/planner'
import { buildGraph } from './buildGraph'
import { findMissionRoute } from './mission'
import { validatePlanetPack } from './validatePlanetPack'
import {
  CUSTOM_PACK_STORAGE_KEY, MAX_CUSTOM_PACKS, MAX_PACK_BYTES,
  parsePlanetPackJson, readCustomPacks, saveCustomPacks, validateCustomPackAddition,
} from './customPacks'

function pack(id = 'community-test'): PlanetPack {
  return structuredClone({ ...stockPack, id, name: 'Community system', shortName: 'Community' })
}

const parse = (value: unknown) => parsePlanetPackJson(JSON.stringify(value))
const errors = (value: unknown): string[] => {
  const result = parse(value)
  expect(result.status).toBe('error')
  return result.status === 'error' ? result.errors : []
}
function storage(initial: string | null = null) {
  let saved = initial
  return {
    getItem: (key: string) => key === CUSTOM_PACK_STORAGE_KEY ? saved : null,
    setItem: (key: string, value: string) => { if (key === CUSTOM_PACK_STORAGE_KEY) saved = value },
  }
}

describe('custom planet pack JSON', () => {
  it('keeps the documented downloadable example valid with its stated asymmetric budgets', () => {
    const result = parsePlanetPackJson(examplePackJson)
    expect(result.status).toBe('success')
    if (result.status !== 'success') throw new Error(result.errors.join('\n'))
    const graph = buildGraph(result.pack)
    const start = 'example:haven:surface'
    const end = 'example:pebble:surface'
    expect(findMissionRoute(graph, start, end, 'one-way')).toMatchObject({ status: 'success', totalDeltaV: 570 })
    expect(findMissionRoute(graph, start, end, 'return-only')).toMatchObject({ status: 'success', totalDeltaV: 525 })
    expect(findMissionRoute(graph, start, end, 'round-trip')).toMatchObject({ status: 'success', totalDeltaV: 1095 })
  })

  it.each([stockPack, opmPack, rssPack])('round-trips a renamed exported $shortName pack without altering costs or shared IDs', source => {
    const renamed = { ...source, id: `custom-${source.id}` }
    expect(parse(renamed)).toEqual({ status: 'success', pack: renamed })
  })

  it('preserves optional source budget metadata while accepting legacy sources without it', () => {
    const custom = pack()
    custom.sources[0]!.budgetType = 'model'
    expect(parse(custom)).toEqual({ status: 'success', pack: custom })
    const store = storage()
    expect(saveCustomPacks(store, [custom])).toBeNull()
    expect(readCustomPacks(store).packs[0]?.sources[0]?.budgetType).toBe('model')
    const legacy = { ...custom, sources: custom.sources.map(({ id, title, url }) => ({ id, title, url })) }
    expect(parse(legacy)).toEqual({ status: 'success', pack: legacy })
  })

  it.each(['verified', '', null, true, 12, {}])('rejects unsupported source budget metadata %j', budgetType => {
    const custom = pack()
    const malformed = { ...custom, sources: custom.sources.map(source => ({ ...source, budgetType })) }
    expect(errors(malformed).join(' ')).toContain('budgetType must be reference or model')
    expect(validatePlanetPack(malformed).join(' ')).toContain('budgetType must be reference or model')
  })

  it('round-trips stellar hierarchy, published references, unpriced connections, and overlapping map regions without adding prices', () => {
    const custom = pack()
    custom.bodies.push(
      { id: 'custom:hole', name: 'Black hole', parentId: 'stock:kerbol', kind: 'black-hole', hasSurface: false, hasAtmosphere: false, color: '#777' },
      { id: 'custom:star', name: 'Companion star', parentId: 'custom:hole', kind: 'star', hasSurface: false, hasAtmosphere: true, supportsAtmosphericBraking: false, color: '#ffa' },
      { id: 'custom:center', name: 'Binary center', parentId: 'custom:star', kind: 'barycenter', hasSurface: false, hasAtmosphere: false, color: '#aaa' },
      { id: 'custom:portal', name: 'Portal', parentId: 'stock:jool', kind: 'wormhole', hasSurface: false, hasAtmosphere: false, color: '#aaf' },
    )
    custom.nodes.push(
      { id: 'custom:reference', bodyId: 'custom:star', kind: 'reference', label: 'Published stellar reference' },
      { id: 'custom:center-reference', bodyId: 'custom:center', kind: 'reference', label: 'Circumbinary reference' },
    )
    custom.unpricedConnections = [{ id: 'missing', label: 'Unpriced stellar journey', from: 'custom:reference', to: 'custom:center-reference', forwardKind: 'transfer', reverseKind: 'transfer', sourceId: custom.sources[0]!.id, assumptions: ['No source budget.'] }]
    custom.mapRegions = [{ id: 'one', label: 'First region', bodyIds: ['custom:star', 'custom:center'] }, { id: 'two', label: 'Shared reference', bodyIds: ['custom:star'] }]
    const result = parse({ ...custom, unpricedConnections: custom.unpricedConnections.map(row => ({ ...row, deltaV: 0, executable: true })), mapRegions: custom.mapRegions.map(row => ({ ...row, component: 'unsafe' })) })
    expect(result).toEqual({ status: 'success', pack: custom })
    if (result.status !== 'success') throw new Error('Expected canonical extended pack')
    expect(result.pack.unpricedConnections).not.toBe(custom.unpricedConnections)
    expect(result.pack.mapRegions![0]!.bodyIds).not.toBe(custom.mapRegions[0]!.bodyIds)
    expect(buildGraph(result.pack).adjacency.get('custom:reference')).toEqual([])
  })

  it.each([
    { unpricedConnections: Array(101).fill({}) }, { mapRegions: Array(21).fill({}) },
    { unpricedConnections: null }, { mapRegions: 'bad' },
    { mapRegions: [{ id: 'large', label: 'Large', bodyIds: Array(101).fill('stock:kerbin') }] },
  ])('bounds optional connection and region collections before topology validation: %j', changes => {
    expect(errors({ ...pack(), ...changes }).join(' ')).toContain('at most')
  })

  it('reserves the overview region ID so imported views cannot shadow All systems', () => {
    const custom = pack()
    custom.mapRegions = [{ id: 'all', label: 'Conflicting view', bodyIds: ['stock:kerbin'] }]
    expect(errors(custom).join(' ')).toContain('reserved for the complete map overview')
    custom.mapRegions[0]!.id = 'home-system'
    expect(parse(custom)).toEqual({ status: 'success', pack: custom })
  })

  it('accepts a UTF-8 BOM and strips unknown application/configuration fields', () => {
    const custom = pack()
    const raw = JSON.stringify({ ...custom, __proto__: { poisoned: true }, executableScript: 'alert(1)', nodes: custom.nodes.map(node => ({ ...node, url: 'https://example.org' })) })
    const result = parsePlanetPackJson(`\uFEFF${raw}`)
    expect(result).toEqual({ status: 'success', pack: custom })
    if (result.status === 'success') expect(Object.getPrototypeOf(result.pack)).toBe(Object.prototype)
  })

  it.each(['{', '[1,2]', 'null', '"pack"', 'false'])('reports invalid JSON/shape %s without throwing', text => {
    expect(parsePlanetPackJson(text).status).toBe('error')
  })

  it('bounds UTF-8 bytes, rather than only JavaScript character count', () => {
    const text = JSON.stringify({ description: '🌠'.repeat(300_000) })
    expect(text.length).toBeLessThan(MAX_PACK_BYTES)
    expect(parsePlanetPackJson(text)).toMatchObject({ status: 'error', errors: [expect.stringContaining('1 MiB')] })
  })

  it.each(['stock', 'opm', 'rss', 'stock-kcalbeloh', 'opm-kcalbeloh'])('protects built-in pack ID %s', id => {
    expect(errors(pack(id)).join(' ')).toContain('reserved')
  })

  it.each([
    ['bodies', 101], ['nodes', 401], ['maneuvers', 1001], ['sources', 21],
  ] as const)('bounds %s before topology traversal', (key, count) => {
    const custom = pack()
    expect(errors({ ...custom, [key]: Array.from({ length: count }, () => custom[key][0]) }).join(' ')).toContain(`${key} must be an array of at most`)
  })

  it('rejects malformed records, duplicate IDs, unsafe colors, and unsupported transitions', () => {
    const custom = pack()
    custom.nodes.push({ ...custom.nodes[0]! })
    expect(errors(custom).join(' ')).toContain('Duplicate node ID')
    expect(errors({ ...pack(), bodies: [null] }).join(' ')).toContain('must be an object')
    custom.bodies[1]!.color = 'url(https://example.org/tracker)'
    expect(errors(custom).join(' ')).toContain('hexadecimal color')
    const unsupported = pack()
    unsupported.maneuvers[0]!.from = 'stock:mun:surface'
    expect(errors(unsupported).join(' ')).toContain('unsupported')
  })

  it('rejects IDs with delimiters or control characters and overlong names', () => {
    for (const id of ['has|delimiter', 'has space', '\u0000control', 'x'.repeat(201)]) {
      expect(errors(pack(id)).join(' ')).toContain('Pack ID')
    }
    expect(errors({ ...pack(), name: 'x'.repeat(81) }).join(' ')).toContain('Pack name')
  })

  it('rejects shape tricks that shadow object coercion instead of throwing', () => {
    const custom = pack()
    const malicious = { ...custom, bodies: [{ ...custom.bodies[0], id: { toString: 'not a function' } }] }
    expect(() => parse(malicious)).not.toThrow()
    expect(errors(malicious).join(' ')).toContain('ID')
    expect(() => validatePlanetPack(malicious)).not.toThrow()
    expect(validatePlanetPack(malicious).length).toBeGreaterThan(0)
  })

  it.each([
    { shortName: {} }, { shortName: '' }, { dataNotice: false }, { dataNotice: '' },
    { transferHubBodyId: [] }, { transferHubBodyId: 'unknown' }, { transferHubBodyId: 'stock:mun' },
  ])('validates supplied optional metadata $shortName $dataNotice $transferHubBodyId', changes => {
    expect(errors({ ...pack(), ...changes }).length).toBeGreaterThan(0)
  })

  it('requires the declared transfer hub to have a low-orbit state, but does not require hub metadata', () => {
    const custom = pack()
    custom.transferHubBodyId = 'stock:dres'
    custom.nodes = custom.nodes.filter(node => node.id !== 'stock:dres:orbit')
    custom.maneuvers = custom.maneuvers.filter(edge => edge.from !== 'stock:dres:orbit' && edge.to !== 'stock:dres:orbit')
    expect(errors(custom).join(' ')).toContain('low-orbit routing state')
    delete custom.transferHubBodyId
    expect(parse(custom).status).toBe('success')
  })

  it.each(['javascript:alert(1)', 'http://example.org', 'https://user:password@example.org/map'])('rejects unsafe source URL %s', url => {
    const custom = pack()
    custom.sources[0]!.url = url
    expect(errors(custom).join(' ')).toContain('HTTPS URL without embedded credentials')
  })

  it.each([-1, 1_000_001, Infinity])('rejects unsupported maneuver cost %s', deltaV => {
    const custom = pack()
    custom.maneuvers[0]!.deltaV = deltaV
    expect(errors(custom).join(' ')).toContain('between 0 and 1,000,000')
  })

  it('uses the exact imported direction-specific budgets for stops and return journeys', () => {
    const custom = pack()
    custom.maneuvers.find(edge => edge.id === 'stock:kerbin:surface->stock:kerbin:orbit')!.deltaV = 100
    custom.maneuvers.find(edge => edge.id === 'stock:kerbin:orbit->stock:kerbin:surface')!.deltaV = 200
    const result = parse(custom)
    expect(result.status).toBe('success')
    if (result.status !== 'success') throw new Error('Expected valid imported pack')
    const graph = buildGraph(result.pack)
    expect(findMissionRoute(graph, 'stock:kerbin:surface', 'stock:mun:surface', 'one-way', ['stock:kerbin:orbit'])).toMatchObject({ status: 'success', totalDeltaV: 1820 })
    expect(findMissionRoute(graph, 'stock:kerbin:surface', 'stock:mun:surface', 'return-only', ['stock:kerbin:orbit'])).toMatchObject({ status: 'success', totalDeltaV: 1920 })
    expect(findMissionRoute(graph, 'stock:kerbin:surface', 'stock:mun:surface', 'round-trip', ['stock:kerbin:orbit'])).toMatchObject({ status: 'success', totalDeltaV: 3740 })
  })
})

describe('custom planet pack persistence', () => {
  it('persists validated canonical packs in a versioned envelope and restores them', () => {
    const browserStorage = storage()
    expect(readCustomPacks(browserStorage)).toEqual({ packs: [], warning: null })
    expect(saveCustomPacks(browserStorage, [pack('first'), pack('second')])).toBeNull()
    expect(JSON.parse(browserStorage.getItem(CUSTOM_PACK_STORAGE_KEY)!)).toEqual({ version: 1, packs: [pack('first'), pack('second')] })
    expect(readCustomPacks(browserStorage)).toEqual({ packs: [pack('first'), pack('second')], warning: null })
    expect(saveCustomPacks(browserStorage, [])).toBeNull()
    expect(readCustomPacks(browserStorage)).toEqual({ packs: [], warning: null })
  })

  it('restores valid entries while skipping malformed entries, duplicates, and reserved IDs', () => {
    const browserStorage = storage(JSON.stringify({ version: 1, packs: [pack(), null, pack(), stockPack, pack('other')] }))
    expect(readCustomPacks(browserStorage)).toEqual({ packs: [pack(), pack('other')], warning: expect.stringContaining('not restored') })
  })

  it.each(['{', 'null', '{"version":2,"packs":[]}', '{"version":1,"packs":{}}'])('handles invalid saved envelopes %s', saved => {
    expect(readCustomPacks(storage(saved))).toMatchObject({ packs: [], warning: expect.any(String) })
  })

  it('bounds saved envelopes and the restored pack count', () => {
    const oversized = storage(' '.repeat(MAX_CUSTOM_PACKS * MAX_PACK_BYTES + 1025))
    expect(readCustomPacks(oversized)).toEqual({ packs: [], warning: expect.stringContaining('size') })
    const six = Array.from({ length: 6 }, (_, index) => pack(`custom-${index}`))
    expect(readCustomPacks(storage(JSON.stringify({ version: 1, packs: six })))).toMatchObject({ packs: six.slice(0, 5), warning: expect.any(String) })
  })

  it('reports read restrictions and write quotas without throwing or changing in-memory data', () => {
    const browserStorage = {
      getItem: () => { throw new Error('Restricted') },
      setItem: () => { throw new Error('Quota exceeded') },
    }
    const custom = pack()
    const before = structuredClone(custom)
    expect(readCustomPacks(browserStorage)).toMatchObject({ packs: [], warning: expect.stringContaining('session') })
    expect(saveCustomPacks(browserStorage, [custom])).toContain('session')
    expect(custom).toEqual(before)
  })

  it('does not overwrite existing storage on invalid, duplicate, or excessive save requests', () => {
    const browserStorage = storage('untouched')
    expect(saveCustomPacks(browserStorage, [stockPack])).toContain('reserved')
    expect(saveCustomPacks(browserStorage, [pack(), pack()])).toContain('unique')
    expect(saveCustomPacks(browserStorage, Array.from({ length: 6 }, (_, i) => pack(`pack-${i}`)))).toContain('Only 5')
    expect(browserStorage.getItem(CUSTOM_PACK_STORAGE_KEY)).toBe('untouched')
  })

  it('rejects duplicate additions, a full library, and malformed runtime data', () => {
    expect(validateCustomPackAddition(pack(), [])).toBeNull()
    expect(validateCustomPackAddition(pack(), [pack()])).toContain('already exists')
    expect(validateCustomPackAddition(pack('new'), Array.from({ length: 5 }, (_, index) => pack(`saved-${index}`)))).toContain('up to 5')
    expect(validateCustomPackAddition(null as unknown as PlanetPack, [])).toContain('object')
    const circular = pack()
    Object.assign(circular, { circular })
    expect(validateCustomPackAddition(circular, [])).toContain('could not be read')
  })
})
