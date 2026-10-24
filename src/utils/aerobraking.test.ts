import { describe, expect, it } from 'vitest'
import { stockPack } from '../data/stock'
import { getAerobrakingEdges } from './aerobraking'

const edgeId = (body: string, from: string, to: string) => `stock:${body}:${from}->stock:${body}:${to}`

describe('potential atmospheric braking markers', () => {
  it('marks only inward atmospheric captures, descents and low-orbit moon returns', () => {
    const expected = [
      ...['kerbin', 'laythe'].map(body => edgeId(body, 'encounter', 'orbit')),
      ...['eve', 'duna', 'jool'].flatMap(body => [
        edgeId(body, 'encounter', 'elliptical'), edgeId(body, 'elliptical', 'orbit'),
      ]),
      ...['kerbin', 'eve', 'duna', 'laythe'].map(body => edgeId(body, 'orbit', 'surface')),
      ...['mun', 'minmus'].map(moon => `stock:${moon}:encounter->stock:kerbin:orbit`),
    ]
    expect(getAerobrakingEdges(stockPack).map(edge => edge.id).sort()).toEqual(expected.sort())
  })

  it('never marks the reverse departure or an interplanetary encounter increment', () => {
    const marked = new Set(getAerobrakingEdges(stockPack).map(edge => edge.id))
    for (const edge of getAerobrakingEdges(stockPack)) {
      expect(marked.has(`${edge.to}->${edge.from}`)).toBe(false)
    }
    for (const edge of stockPack.maneuvers.filter(edge => edge.kind === 'transfer')) {
      if (edge.to.endsWith(':encounter') || edge.to.endsWith(':elliptical')) {
        expect(marked.has(edge.id), edge.id).toBe(false)
      }
    }
  })

  it('uses the destination atmosphere, rather than body names or the departure atmosphere', () => {
    const pack = {
      ...stockPack,
      bodies: stockPack.bodies.map(body => body.id === 'stock:kerbin' ? { ...body, hasAtmosphere: false } : body),
    }
    const marked = getAerobrakingEdges(pack)
    expect(marked).toHaveLength(10)
    expect(marked.some(edge => edge.to.startsWith('stock:kerbin:'))).toBe(false)
    expect(marked.some(edge => edge.id === edgeId('laythe', 'encounter', 'orbit'))).toBe(true)
  })
})
