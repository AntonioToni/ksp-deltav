import { describe, expect, it } from 'vitest'
import { opmPack } from '../data/opm'
import { rssPack } from '../data/rss'
import { stockPack } from '../data/stock'
import { stockKcalbelohPack, opmKcalbelohPack } from '../data/kcalbeloh'
import { createMapLayout } from './mapLayout'
import { mapModeForViewport, maximumMapSize } from './mapViewport'

describe('comfortable map sizing', () => {
  it.each([stockPack, opmPack, rssPack, stockKcalbelohPack, opmKcalbelohPack])('bounds ordinary nodes in every $id presentation', pack => {
    for (const mode of ['wide', 'short', 'portrait'] as const) {
      const layout = createMapLayout(pack, mode)
      const maximum = maximumMapSize(layout)
      const scale = Math.min(maximum.width / layout.width, maximum.height / layout.height)
      expect(layout.radius * 2 * scale).toBeLessThanOrEqual(60 + 1e-9)
    }
  })

  it.each([stockPack, opmPack, rssPack, stockKcalbelohPack, opmKcalbelohPack])('retains a wide layout on ultrawide and large desktop screens for $id', pack => {
    const wide = createMapLayout(pack)
    for (const [width, height] of [[2560, 1220], [3440, 1220], [5120, 1220], [5120, 1940]]) {
      expect(mapModeForViewport(width!, height!, wide)).toBe('wide')
    }
  })

  it('keeps compact layouts when screen dimensions require them', () => {
    const wide = createMapLayout(stockPack)
    expect(mapModeForViewport(320, 350, wide)).toBe('portrait')
    expect(mapModeForViewport(700, 900, wide)).toBe('portrait')
    expect(mapModeForViewport(844, 170, wide)).toBe('short')
    expect(mapModeForViewport(1440, 450, wide)).toBe('short')
  })

  it.each([stockKcalbelohPack, opmKcalbelohPack])('keeps the desktop system overview wider than a 2560px screen for $id', pack => {
    const maximum = maximumMapSize(createMapLayout(pack))
    expect(maximum.width).toBeGreaterThan(2560)
  })
})
