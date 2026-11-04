import { expect, test, type Page } from '@playwright/test'
import { missionModeButton } from './helpers/missionMode'

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const node = (page: Page, id: string) => page.locator(`[data-node-id="${id}"]`)
const selected = (page: Page) => page.locator('[data-route-edge="true"]')
const direct = (page: Page) => selected(page).and(page.locator('[data-direct-transfer="true"]'))
const total = (page: Page) => page.getByTestId('route-total')
const rows = (page: Page) => page.getByRole('list', { name: 'Maneuver breakdown', exact: true }).getByRole('listitem')
let browserErrors: string[]

test.beforeEach(async ({ page }) => {
  browserErrors = []
  page.on('pageerror', error => browserErrors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()) })
  await page.goto('./')
  await button(page, 'RSS').click()
})

test.afterEach(() => {
  expect(browserErrors, 'Itinerary preference should not produce browser errors').toEqual([])
})

async function plan(page: Page, from: string, to: string) {
  for (const id of [from, to]) {
    await node(page, id).focus()
    await node(page, id).press('Enter')
  }
}

async function addStop(page: Page, label: string) {
  await button(page, 'Edit mission stops').click()
  const dialog = page.getByRole('dialog', { name: /^Mission stops\b/ })
  await dialog.getByRole('combobox', { name: 'Choose a stop', exact: true }).fill(label)
  await page.getByRole('option', { name: label, exact: true }).click()
  await dialog.getByRole('button', { name: 'Add stop', exact: true }).click()
  await dialog.getByRole('button', { name: 'Done', exact: true }).click()
}

async function direction(page: Page, from: string, to: string, via?: string) {
  const flow = page.locator('[data-route-animation="true"]')
  await expect(flow).toBeVisible()
  const geometry = await page.evaluate(ids => {
    const points = Object.fromEntries(ids.map(id => {
      const matrix = document.querySelector<SVGGElement>(`[data-node-id="${id}"]`)?.transform.baseVal.consolidate()?.matrix
      if (!matrix) throw new Error(`Missing animation endpoint ${id}`)
      return [id, { x: matrix.e, y: matrix.f }]
    }))
    const paths = Array.from(document.querySelectorAll<SVGPathElement>('[data-flow-run] path.route-flow-trail:last-child')).map(path => {
      const numbers = (path.getAttribute('d')?.match(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi) ?? []).map(Number)
      const start = path.getPointAtLength(0), end = path.getPointAtLength(path.getTotalLength())
      return { start: { x: start.x, y: start.y }, end: { x: end.x, y: end.y },
        vertices: Array.from({ length: numbers.length / 2 }, (_, index) => ({ x: numbers[index * 2], y: numbers[index * 2 + 1] })) }
    })
    return { points, paths }
  }, [from, to, ...(via ? [via] : [])])
  expect(geometry.paths).toHaveLength(1)
  for (const [actual, expected] of [[geometry.paths[0].start, geometry.points[from]], [geometry.paths[0].end, geometry.points[to]]]) {
    expect(actual.x).toBeCloseTo(expected.x, 3)
    expect(actual.y).toBeCloseTo(expected.y, 3)
  }
  if (via) expect(geometry.paths[0].vertices.some(point => Math.hypot(point.x - geometry.points[via].x, point.y - geometry.points[via].y) < .01)).toBe(true)
}

async function pageFits(page: Page) {
  expect(await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, x: scrollX, y: scrollY })))
    .toEqual({ ...page.viewportSize()!, x: 0, y: 0 })
}

const examples = [
  { body: 'mars', name: 'Mars', pair: 4930, surface: 3600, total: 8800, stop: 'vesta', stopName: 'Vesta', detour: 8794, firstStage: 1272, lastStage: 7522 },
  { body: 'mercury', name: 'Mercury', pair: 21834, surface: 3060, total: 25164, stop: 'jupiter', stopName: 'Jupiter', detour: 21280, firstStage: 2612, lastStage: 18668 },
  { body: 'venus', name: 'Venus', pair: 12475, surface: 27000, total: 39745, stop: 'jupiter', stopName: 'Jupiter', detour: 38115, firstStage: 2612, lastStage: 35503 },
] as const
const formatted = (value: number) => `${value.toLocaleString('en-US')} m/s`

for (const example of examples) {
  test(`keeps Ceres → ${example.name} direct in every mission mode instead of adding ${example.stopName}`, async ({ page }) => {
    const from = 'rss:ceres:surface', to = `rss:${example.body}:surface`
    await plan(page, from, to)
    // Independently audited departure + capture, then the two original surface allowances.
    await expect(total(page)).toHaveText(formatted(270 + example.pair + example.surface))
    await expect(selected(page)).toHaveCount(3)
    await expect(direct(page)).toHaveAttribute('data-edge-id', `direct:rss:ceres:orbit->rss:${example.body}:orbit`)
    await expect(selected(page).and(page.locator(`[data-edge-id*="rss:${example.stop}:"]`))).toHaveCount(0)
    await direction(page, from, to)
    await page.getByLabel('Show breakdown', { exact: true }).check()
    await expect(rows(page)).toHaveCount(3)
    await expect(rows(page)).toContainText(['Ceres low orbit', `${example.name} low orbit`, `${example.name} surface`])
    await expect(rows(page).nth(1)).toContainText(formatted(example.pair))
    await expect(rows(page).nth(1)).toHaveAttribute('data-budget-basis', 'model')
    await missionModeButton(page, 'return-only').click()
    await expect(total(page)).toHaveText(formatted(example.total))
    await expect(direct(page)).toHaveAttribute('data-edge-id', `direct:rss:${example.body}:orbit->rss:ceres:orbit`)
    await direction(page, to, from)
    await missionModeButton(page, 'round-trip').click()
    await expect(total(page)).toHaveText(formatted(example.total * 2))
    await direction(page, from, from)
    const reserve = page.getByRole('slider', { name: 'Redundancy', exact: true })
    await reserve.focus()
    await reserve.press('Home')
    for (let index = 0; index < 4; index++) await reserve.press('ArrowRight')
    await expect(page.getByTestId('route-base')).toHaveText(formatted(example.total * 2))
    await expect(total(page)).toHaveText(formatted(Math.ceil(example.total * 2 * 1.2)))
  })

  test(`uses the Ceres → ${example.stopName} → ${example.name} detour when that high-orbit stop is requested`, async ({ page }) => {
    const from = 'rss:ceres:surface', to = `rss:${example.body}:surface`, stop = `rss:${example.stop}:elliptical`
    await plan(page, from, to)
    await expect(total(page)).toHaveText(formatted(example.total))
    await addStop(page, `${example.stopName} elliptical capture orbit`)
    await expect(total(page)).toHaveText(formatted(example.detour))
    await expect(node(page, stop)).toHaveAttribute('data-waypoint-indexes', '1')
    await expect(direct(page)).toHaveCount(2)
    await direction(page, from, to, stop)
    await page.getByLabel('Show breakdown', { exact: true }).check()
    await expect(page.getByTestId('stage-total')).toHaveText(formatted(example.firstStage))
    await button(page, 'Next stage').click()
    await expect(page.getByTestId('stage-total')).toHaveText(formatted(example.lastStage))
    await missionModeButton(page, 'return-only').click()
    await expect(total(page)).toHaveText(formatted(example.detour))
    await direction(page, to, from, stop)
    await missionModeButton(page, 'round-trip').click()
    await expect(total(page)).toHaveText(formatted(example.detour * 2))
    await direction(page, from, from, stop)
  })
}

test('uses the destination moon branch without inserting unrelated Titan or Titania parking', async ({ page }) => {
  for (const example of [{ body: 'rhea', parent: 'saturn', unrelated: 'titan', total: 26880 }, { body: 'umbriel', parent: 'uranus', unrelated: 'titania', total: 24930 }]) {
    await button(page, 'Reset mission').click()
    await plan(page, 'rss:mercury:orbit', `rss:${example.body}:orbit`)
    await expect(total(page)).toHaveText(formatted(example.total))
    await expect(selected(page)).toHaveCount(9)
    await expect(selected(page).and(page.locator(`[data-edge-id*="rss:${example.unrelated}:"]`))).toHaveCount(0)
    await expect(page.locator(`[data-route-edge="true"][data-edge-id="rss:${example.parent}:elliptical->rss:${example.body}:encounter"]`)).toHaveCount(1)
    // The supplied RSS outer-planet graph still needs its documented Earth parking reset.
    await expect(page.getByTestId('route-status')).toContainText('Earth parking-orbit layover')
    await direction(page, 'rss:mercury:orbit', `rss:${example.body}:orbit`)
  }
})

test('does not turn an unrelated atmospheric option into an implicit Duna stop', async ({ page }) => {
  await button(page, 'Stock').click()
  await plan(page, 'stock:kerbin:surface', 'stock:dres:orbit')
  await expect(total(page)).toHaveText('6,260 m/s')
  await button(page, 'Atmospheric assistance').click()
  const dialog = page.getByRole('dialog', { name: 'Atmospheric assistance', exact: true })
  await dialog.getByRole('checkbox', { name: 'Ideal capture at Duna', exact: true }).check()
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(total(page)).toHaveText('6,260 m/s')
  await expect(selected(page).and(page.locator('[data-edge-id*="stock:duna:"]'))).toHaveCount(0)
  await addStop(page, 'Duna low orbit')
  await expect(total(page)).toHaveText('6,012 m/s')
  await expect(direct(page)).toHaveAttribute('data-edge-id', 'direct:stock:duna:orbit->stock:dres:orbit')
  await direction(page, 'stock:kerbin:surface', 'stock:dres:orbit', 'stock:duna:orbit')
})

test('keeps corrected direct routes and their breakdown readable across screen sizes', async ({ page }, testInfo) => {
  for (const viewport of [{ width: 320, height: 568 }, { width: 667, height: 375 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport)
    await button(page, 'Reset mission').click()
    await plan(page, 'rss:ceres:surface', 'rss:mars:surface')
    await expect(total(page)).toHaveText('8,800 m/s')
    await page.getByLabel('Show breakdown', { exact: true }).check()
    await expect(rows(page)).toHaveCount(3)
    await direction(page, 'rss:ceres:surface', 'rss:mars:surface')
    await pageFits(page)
    if (testInfo.project.name === 'desktop') await page.screenshot({ path: `/tmp/itinerary-preference-${viewport.width}.png`, animations: 'disabled' })
  }
})
