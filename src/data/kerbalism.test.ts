import { describe, expect, it } from 'vitest'
import { getKerbalismHomeOrbitRadiusM, getKerbalismRadioProfileId } from './kerbalism'
import { stockPack } from './stock'
import { opmPack } from './opm'
import { rssPack } from './rss'
import {
  stockKcalbelohPack, opmKcalbelohPack,
  stockKcalbelohNoWormholesPack, opmKcalbelohNoWormholesPack,
} from './kcalbeloh'

describe('Kerbalism home-system references', () => {
  it.each([
    stockPack, opmPack, stockKcalbelohPack, opmKcalbelohPack,
    stockKcalbelohNoWormholesPack, opmKcalbelohNoWormholesPack,
  ])('uses Kerbin’s pinned home orbit for $id, independently of the destination system', pack => {
    expect(getKerbalismHomeOrbitRadiusM(pack)).toBe(13_599_840_256)
  })

  it('uses the pinned Earth orbit for RSS rather than scaling the stock orbit', () => {
    expect(getKerbalismHomeOrbitRadiusM(rssPack)).toBe(149_598_261_150.4425)
  })

  it('does not infer custom or rescaled home-system physics from stock-looking body IDs', () => {
    const custom = { ...stockPack, id: 'custom:rescaled-stock' }
    expect(getKerbalismHomeOrbitRadiusM(custom)).toBeNull()
  })

  it('reports an unknown home reference when the hub is missing or has no reviewed planet orbit', () => {
    expect(getKerbalismHomeOrbitRadiusM({ ...stockPack, transferHubBodyId: undefined })).toBeNull()
    expect(getKerbalismHomeOrbitRadiusM({ ...stockPack, transferHubBodyId: 'stock:mun' })).toBeNull()
    const changedParent = {
      ...stockPack,
      bodies: stockPack.bodies.map(body => body.id === 'stock:kerbin' ? { ...body, parentId: 'missing:star' } : body),
    }
    expect(getKerbalismHomeOrbitRadiusM(changedParent)).toBeNull()
  })
})

describe('restoring an antenna’s Kerbalism radio setup', () => {
  it.each([
    ['stock', 'kerbalism'], ['kerbalism', 'kerbalism'],
    ['rss', 'rss-kerbalism'], ['rss-kerbalism', 'rss-kerbalism'],
    ['rss-cbk', 'rss-cbk-kerbalism'], ['rss-cbk-kerbalism', 'rss-cbk-kerbalism'],
  ] as const)('preserves the %s power baseline as %s', (current, expected) => {
    expect(getKerbalismRadioProfileId(current)).toBe(expected)
  })
})
