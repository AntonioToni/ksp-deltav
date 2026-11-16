import { describe, expect, it } from 'vitest'
import { opmPack } from '../data/opm'
import { rssPack } from '../data/rss'
import { stockPack } from '../data/stock'
import { stockKcalbelohPack, opmKcalbelohPack } from '../data/kcalbeloh'
import { createMapLayout, kcalbelohSystemViewId, packForMapRegion } from './mapLayout'
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

  it.each([stockKcalbelohPack, opmKcalbelohPack])('uses readable compact arrangements for the freeform $id system map when needed', pack => {
    const combined = createMapLayout(packForMapRegion(pack, kcalbelohSystemViewId))
    expect(combined.presentation).toBe('system')
    expect(mapModeForViewport(1280, 450, combined)).toBe('short')
    // A laptop needs the compact schematic to keep body labels readable.
    expect(mapModeForViewport(1280, 500, combined)).toBe('short')
    expect(mapModeForViewport(1920, 840, combined)).toBe('wide')
    expect(mapModeForViewport(3440, 1220, combined)).toBe('wide')
    expect(mapModeForViewport(375, 500, combined)).toBe('portrait')
  })

  it.each([stockKcalbelohPack, opmKcalbelohPack])('uses readable compact close-ups for the larger $id moon families', pack => {
    for (const regionId of ['sunorc', 'aralc']) {
      const regional = createMapLayout(packForMapRegion(pack, regionId))
      expect(regional.presentation, regionId).toBe('regional')
      expect(mapModeForViewport(1280, 450, regional), regionId).toBe('short')
      expect(mapModeForViewport(1920, 840, regional), regionId).toBe('wide')
      expect(mapModeForViewport(375, 500, regional), regionId).toBe('portrait')
    }
  })

  it.each([stockKcalbelohPack, opmKcalbelohPack])('keeps the original five-panel $id overview mode selection unchanged', pack => {
    const allSystems = createMapLayout(pack)
    expect(allSystems.panels).toHaveLength(5)
    expect(mapModeForViewport(1280, 500, allSystems)).toBe('wide')
    expect(mapModeForViewport(1920, 840, allSystems)).toBe('wide')
    expect(mapModeForViewport(3440, 1220, allSystems)).toBe('wide')
    expect(mapModeForViewport(375, 500, allSystems)).toBe('portrait')
  })
})
