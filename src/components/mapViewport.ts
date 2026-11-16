import type { MapLayout, MapMode } from './mapLayout'

// Keep a sparse map comfortable on large monitors without shrinking a dense
// overview at ordinary desktop widths. The interchange remains larger than
// the ordinary 60px nodes, as it is in the underlying layout.
export function maximumMapSize(layout: MapLayout): { width: number; height: number } {
  const scale = 60 / (layout.radius * 2)
  return { width: layout.width * scale, height: layout.height * scale }
}

export function mapModeForViewport(width: number, height: number, wideLayout: MapLayout): MapMode {
  if (wideLayout.presentation === 'overview') {
    if (width < 900) return width / height > 2.8 ? 'compact' : 'portrait'
    return width / height > (wideLayout.overviewSwitchRatio ?? 3) ? 'short' : 'wide'
  }
  const maximum = maximumMapSize(wideLayout)
  // Use one stable wide-layout reference for mode choice. Using the currently
  // selected layout's limits could alternate between wide and short on resize.
  const usableWidth = Math.min(width, maximum.width)
  const usableHeight = Math.min(height, maximum.height)
  const ratio = usableWidth / usableHeight
  const minimumDiameter = wideLayout.presentation === 'system' ? 28 : wideLayout.presentation === 'regional' ? 36 : 0
  // Reflow the Kcalbeloh schematics before their type gets too small on a
  // laptop. Larger desktops retain the full stellar branches.
  if (minimumDiameter && 2 * wideLayout.radius * Math.min(usableWidth / wideLayout.width, usableHeight / wideLayout.height) < minimumDiameter) {
    return ratio > 1.6 ? 'short' : 'portrait'
  }
  return ratio > 2.8 ? 'short' : width < 600 || ratio < 1.15 ? 'portrait' : 'wide'
}
