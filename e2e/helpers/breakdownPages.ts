import { expect, type Page } from '@playwright/test'
import type { PlanetPack } from '../../src/types/planner'
import { buildGraph } from '../../src/utils/buildGraph'
import { findMissionRoute, type MissionMode, type SuccessfulRoute } from '../../src/utils/mission'

// UI completeness checks use the selected journey from the route engine.
// Its arithmetic and optimization have a separate independent oracle suite.
export function expectedMission(pack: PlanetPack, start: string, end: string, mode: MissionMode, stops: readonly string[] = []) {
  const result = findMissionRoute(buildGraph(pack), start, end, mode, stops)
  if (result.status !== 'success') throw new Error(`Expected reachable test journey: ${result.message}`)
  return result
}

/** Check every row on every page, then navigate back to the first page. */
export async function expectBreakdownPages(page: Page, pack: PlanetPack, journey: SuccessfulRoute, pageSize = 8) {
  const panel = page.getByRole('region', { name: 'Maneuver breakdown panel', exact: true })
  const rows = panel.getByRole('list', { name: 'Maneuver breakdown', exact: true }).getByRole('listitem')
  const previous = page.getByRole('button', { name: 'Previous maneuvers', exact: true })
  const next = page.getByRole('button', { name: 'Next maneuvers', exact: true })
  const position = page.getByTestId('maneuver-position')
  const missionTotal = await page.getByTestId('route-total').innerText()
  const pages = Math.ceil(journey.legs.length / pageSize)
  expect(pages).toBeGreaterThanOrEqual(1)
  const nodes = new Map(pack.nodes.map(node => [node.id, node]))
  const format = new Intl.NumberFormat('en-US')

  async function inspect(index: number) {
    const start = index * pageSize
    const expected = journey.legs.slice(start, start + pageSize)
    if (pages > 1) await expect(position).toHaveText(`${start + 1}–${start + expected.length} of ${journey.legs.length}`)
    else await expect(position).toHaveCount(0)
    await expect(rows).toHaveCount(expected.length)
    await expect(page.getByTestId('route-total')).toHaveText(missionTotal)
    for (const [offset, { edge }] of expected.entries()) {
      const row = rows.nth(offset)
      await expect(row).toBeInViewport({ ratio: .99999 })
      await expect(row).toContainText(nodes.get(edge.to)!.label)
      await expect(row).toContainText(`${format.format(edge.deltaV)} m/s`)
      expect(await row.getAttribute('title')).toContain(`${edge.label}: ${format.format(edge.deltaV)} m/s`)
    }
    const bounds = await panel.boundingBox()
    const dock = await page.getByRole('contentinfo').boundingBox()
    const viewport = page.viewportSize()!
    expect(bounds).not.toBeNull()
    expect(dock).not.toBeNull()
    if (bounds && dock) {
      expect(bounds.x).toBeGreaterThanOrEqual(0)
      expect(bounds.y).toBeGreaterThanOrEqual(0)
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width + 1)
      expect(bounds.y + bounds.height, 'Every page must leave the mission dock usable').toBeLessThanOrEqual(dock.y + 1)
    }
    if (pages > 1) {
      for (const control of [previous, next]) await expect(control).toBeInViewport({ ratio: .99999 })
      if (index === 0) await expect(previous).toBeDisabled()
      else await expect(previous).toBeEnabled()
      if (index === pages - 1) await expect(next).toBeDisabled()
      else await expect(next).toBeEnabled()
    } else {
      await expect(previous).toHaveCount(0)
      await expect(next).toHaveCount(0)
    }
  }

  for (let index = 0; index < pages; index++) {
    if (index) await next.click()
    await inspect(index)
  }
  for (let index = pages - 2; index >= 0; index--) {
    await previous.click()
    await inspect(index)
  }
}
