import { expect, test, type Page } from '@playwright/test'
import { missionModeButton } from './helpers/missionMode'

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const node = (page: Page, id: string) => page.locator(`[data-node-id="${id}"]`)
const direct = (page: Page) => page.locator('[data-route-edge="true"][data-direct-transfer="true"]')
const selected = (page: Page) => page.locator('[data-route-edge="true"]')
const flow = (page: Page) => page.locator('[data-route-animation="true"]')
const total = (page: Page) => page.getByTestId('route-total')
const info = (page: Page) => page.getByRole('dialog', { name: 'About these estimates', exact: true })
const rows = (page: Page) => page.getByRole('list', { name: 'Maneuver breakdown', exact: true }).getByRole('listitem')
let browserErrors: string[]

test.beforeEach(async ({ page }) => {
  browserErrors = []
  page.on('pageerror', error => browserErrors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()) })
  await page.goto('./')
  await button(page, 'RSS').click()
  await expect(button(page, 'RSS')).toHaveAttribute('aria-pressed', 'true')
})

test.afterEach(() => {
  expect(browserErrors, 'RSS direct transfers should not produce browser errors').toEqual([])
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

async function geometry(page: Page, ids: string[]) {
  return page.evaluate(nodeIds => {
    const points = Object.fromEntries(nodeIds.map(id => {
      const matrix = document.querySelector<SVGGElement>(`[data-node-id="${id}"]`)?.transform.baseVal.consolidate()?.matrix
      if (!matrix) throw new Error(`Missing endpoint ${id}`)
      return [id, { x: matrix.e, y: matrix.f }]
    }))
    const paths = Array.from(document.querySelectorAll<SVGPathElement>('[data-flow-run] path.route-flow-trail:last-child')).map(path => {
      const values = (path.getAttribute('d')?.match(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi) ?? []).map(Number)
      const start = path.getPointAtLength(0)
      const end = path.getPointAtLength(path.getTotalLength())
      return {
        start: { x: start.x, y: start.y }, end: { x: end.x, y: end.y },
        vertices: Array.from({ length: values.length / 2 }, (_, index) => ({ x: values[index * 2], y: values[index * 2 + 1] })),
      }
    })
    return { points, paths }
  }, ids)
}

function samePoint(actual: { x: number; y: number }, expected: { x: number; y: number }) {
  expect(actual.x).toBeCloseTo(expected.x, 3)
  expect(actual.y).toBeCloseTo(expected.y, 3)
}

async function direction(page: Page, from: string, to: string, via: string[] = []) {
  await expect(flow(page)).toBeVisible()
  const { points, paths } = await geometry(page, [from, to, ...via])
  expect(paths).toHaveLength(1)
  samePoint(paths[0].start, points[from])
  samePoint(paths[0].end, points[to])
  for (const id of via) expect(paths[0].vertices.some(point => Math.hypot(point.x - points[id].x, point.y - points[id].y) < .01), `Flow should pass through ${id}`).toBe(true)
}

async function noEarthVisit(page: Page) {
  await expect(page.locator('[data-route-edge="true"][data-edge-id*="rss:earth:"]')).toHaveCount(0)
  await expect(page.getByTestId('route-status')).not.toContainText('Earth parking-orbit layover')
}

async function pageFits(page: Page) {
  expect(await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, x: scrollX, y: scrollY })))
    .toEqual({ ...page.viewportSize()!, x: 0, y: 0 })
}

test('adds only the selected RSS direct band and identifies its modeled cost and limitations', async ({ page }) => {
  await expect(page.locator('[data-node-id]')).toHaveCount(102)
  await expect(direct(page)).toHaveCount(0)
  const originalConnections = await page.locator('[data-connection-id]').count()
  await plan(page, 'rss:mars:orbit', 'rss:venus:orbit')
  // Independent complete departure/capture reference, rounded per endpoint.
  await expect(total(page)).toHaveText('7,850 m/s')
  await expect(selected(page)).toHaveCount(1)
  await expect(direct(page)).toHaveAttribute('data-edge-id', 'direct:rss:mars:orbit->rss:venus:orbit')
  await expect(page.locator('[data-connection-id]')).toHaveCount(originalConnections + 1)
  await expect(page.getByTestId('route-status')).toContainText(/analytic direct transfer/)
  await noEarthVisit(page)
  await direction(page, 'rss:mars:orbit', 'rss:venus:orbit')
  const trail = flow(page).locator('[data-flow-run]').first().locator('path.route-flow-trail').last()
  const before = await trail.evaluate(element => Number.parseFloat(getComputedStyle(element).strokeDashoffset))
  await expect.poll(() => trail.evaluate(element => Number.parseFloat(getComputedStyle(element).strokeDashoffset))).toBeLessThan(before - .01)
  await button(page, 'Budget assumptions').click()
  const model = info(page).locator('[data-budget-summary-kind="model"]')
  await expect(model).toContainText('7,850 m/s')
  await expect(model).toContainText('1 maneuver')
  await expect(info(page).locator('[data-budget-summary-kind]')).toHaveCount(1)
  await expect(info(page)).toContainText('Each complete pair includes departure and powered arrival')
  await info(page).getByRole('tab', { name: 'Sources & assumptions', exact: true }).click()
  await expect(info(page).getByRole('link', { name: 'Coplanar direct planetary transfers · analytic reference model', exact: true })).toHaveAttribute('href', /docs\/DATA.md#direct-interplanetary-transfers$/)
  await expect(info(page)).toContainText('Saturn, Uranus, Neptune, and Pluto lack compatible low-orbit altitudes')
  await expect(info(page)).toContainText('historical high states at Mercury, Venus, Mars, and Ceres')
  await info(page).getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByLabel('Show breakdown', { exact: true }).check()
  await expect(rows(page)).toHaveCount(1)
  await expect(rows(page).first()).toHaveAttribute('data-budget-basis', 'model')
  await expect(rows(page).first()).toContainText('Venus low orbit')
  await expect(rows(page).first()).toContainText('7,850 m/s')
  await button(page, 'Reset mission').click()
  await expect(page.locator('[data-connection-id]')).toHaveCount(originalConnections)
})

test('reverses RSS direct flow and applies the reserve once to a complete round trip', async ({ page }) => {
  await plan(page, 'rss:mars:orbit', 'rss:venus:orbit')
  await missionModeButton(page, 'return-only').click()
  await expect(total(page)).toHaveText('7,850 m/s')
  await expect(direct(page)).toHaveAttribute('data-edge-id', 'direct:rss:venus:orbit->rss:mars:orbit')
  await direction(page, 'rss:venus:orbit', 'rss:mars:orbit')
  await missionModeButton(page, 'round-trip').click()
  await expect(total(page)).toHaveText('15,700 m/s')
  await expect(direct(page)).toHaveCount(2)
  await direction(page, 'rss:mars:orbit', 'rss:mars:orbit')
  const reserve = page.getByRole('slider', { name: 'Redundancy', exact: true })
  await reserve.focus()
  await reserve.press('Home')
  for (let step = 0; step < 4; step++) await reserve.press('ArrowRight')
  await expect(reserve).toHaveAttribute('aria-valuenow', '20')
  await expect(page.getByTestId('route-base')).toHaveText('15,700 m/s')
  await expect(page.getByTestId('route-margin')).toHaveText('+3,140 m/s')
  await expect(total(page)).toHaveText('18,840 m/s')
  await noEarthVisit(page)
})

test('keeps an ordered Vesta stop in RSS multi-stop totals, stages, and animations', async ({ page }) => {
  await plan(page, 'rss:mars:orbit', 'rss:ceres:orbit')
  await addStop(page, 'Vesta low orbit')
  await expect(total(page)).toHaveText('5,124 m/s')
  await expect(direct(page)).toHaveCount(2)
  await expect(node(page, 'rss:vesta:orbit')).toHaveAttribute('data-waypoint-indexes', '1')
  await direction(page, 'rss:mars:orbit', 'rss:ceres:orbit', ['rss:vesta:orbit'])
  await noEarthVisit(page)
  await page.getByLabel('Show breakdown', { exact: true }).check()
  await expect(page.getByTestId('stage-total')).toHaveText('4,022 m/s')
  await button(page, 'Next stage').click()
  await expect(page.getByTestId('stage-total')).toHaveText('1,102 m/s')
  await expect(rows(page)).toHaveCount(1)
  await expect(rows(page).first()).toHaveAttribute('data-budget-basis', 'model')
  await missionModeButton(page, 'return-only').click()
  await expect(total(page)).toHaveText('5,124 m/s')
  await direction(page, 'rss:ceres:orbit', 'rss:mars:orbit', ['rss:vesta:orbit'])
  await missionModeButton(page, 'round-trip').click()
  await expect(total(page)).toHaveText('10,248 m/s')
  await direction(page, 'rss:mars:orbit', 'rss:mars:orbit', ['rss:vesta:orbit'])
})

test('continues from a bound Jupiter high arrival onto the existing Europa branch', async ({ page }) => {
  await plan(page, 'rss:mars:orbit', 'rss:europa:orbit')
  // 4,398 modeled transfer + 2,980 published branch + 6,500 capture.
  await expect(total(page)).toHaveText('13,878 m/s')
  await expect(selected(page)).toHaveCount(3)
  await expect(direct(page)).toHaveAttribute('data-edge-id', 'direct:rss:mars:orbit->rss:jupiter:elliptical')
  const edgeIds = await selected(page).evaluateAll(elements => elements.map(element => element.getAttribute('data-edge-id')))
  expect(edgeIds).toContain('rss:jupiter:elliptical->rss:europa:encounter')
  expect(edgeIds).toContain('rss:europa:encounter->rss:europa:orbit')
  expect(edgeIds.some(id => id?.includes('rss:jupiter:orbit'))).toBe(false)
  await noEarthVisit(page)
  await direction(page, 'rss:mars:orbit', 'rss:europa:orbit', ['rss:jupiter:elliptical'])
  await page.getByLabel('Show breakdown', { exact: true }).check()
  await expect(rows(page)).toHaveCount(3)
  await expect(rows(page)).toContainText(['4,398 m/s', '2,980 m/s', '6,500 m/s'])
  await expect(rows(page).first()).toHaveAttribute('data-budget-basis', 'model')
  await expect(rows(page).nth(1)).toHaveAttribute('data-budget-basis', 'reference')
  await missionModeButton(page, 'return-only').click()
  await expect(total(page)).toHaveText('13,878 m/s')
  await direction(page, 'rss:europa:orbit', 'rss:mars:orbit', ['rss:jupiter:elliptical'])
  await missionModeButton(page, 'round-trip').click()
  await expect(total(page)).toHaveText('27,756 m/s')
})

test('preserves complete RSS capture budgets when atmospheric assistance is selected', async ({ page }) => {
  await plan(page, 'rss:mars:orbit', 'rss:venus:orbit')
  await button(page, 'Atmospheric assistance').click()
  const dialog = page.getByRole('dialog', { name: 'Atmospheric assistance', exact: true })
  await dialog.getByRole('checkbox', { name: 'Ideal capture at Venus', exact: true }).check()
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(total(page)).toHaveText('7,850 m/s')
  await expect(direct(page)).toHaveAttribute('data-edge-id', 'direct:rss:mars:orbit->rss:venus:orbit')
  await expect(direct(page)).not.toHaveAttribute('data-assisted', 'true')
  const marker = page.locator('[data-aerobraking-edge="direct:rss:mars:orbit->rss:venus:orbit"]')
  await expect(marker).toHaveAttribute('data-selected', 'true')
  await expect(marker.locator('title')).toContainText('Atmospheric options keep this bundled budget unchanged')
  await page.getByLabel('Show breakdown', { exact: true }).check()
  await expect(rows(page).first()).toHaveAttribute('data-budget-basis', 'model')
})

test('retains RSS reference paths for unsupported outer parking states and Earth missions', async ({ page }) => {
  await plan(page, 'rss:mars:orbit', 'rss:saturn:orbit')
  await expect(total(page)).toHaveText('23,640 m/s')
  await expect(direct(page)).toHaveCount(0)
  await expect(page.getByTestId('route-status')).toContainText('Earth parking-orbit layover')
  await button(page, 'Reset mission').click()
  await plan(page, 'rss:earth:surface', 'rss:moon:surface')
  await expect(total(page)).toHaveText('14,660 m/s')
  await expect(direct(page)).toHaveCount(0)
})

test('fits RSS direct paths and their animations on narrow, landscape, and desktop maps', async ({ page }, testInfo) => {
  for (const viewport of [{ width: 320, height: 568 }, { width: 667, height: 375 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport)
    await button(page, 'Reset mission').click()
    await plan(page, 'rss:vesta:orbit', 'rss:ceres:orbit')
    await expect(total(page)).toHaveText('1,102 m/s')
    await expect(direct(page)).toHaveCount(1)
    await direction(page, 'rss:vesta:orbit', 'rss:ceres:orbit')
    const bounds = await direct(page).boundingBox()
    expect(bounds).not.toBeNull()
    if (bounds) {
      expect(bounds.x).toBeGreaterThanOrEqual(-1)
      expect(bounds.y).toBeGreaterThanOrEqual(-1)
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width + 1)
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height + 1)
    }
    await pageFits(page)
    if (testInfo.project.name === 'desktop') await page.screenshot({ path: `/tmp/rss-direct-${viewport.width}.png`, animations: 'disabled' })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(flow(page)).toBeHidden()
    await expect(direct(page)).toBeVisible()
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await button(page, 'Reset mission').click()
    await plan(page, 'rss:mars:orbit', 'rss:europa:orbit')
    await expect(total(page)).toHaveText('13,878 m/s')
    await direction(page, 'rss:mars:orbit', 'rss:europa:orbit', ['rss:jupiter:elliptical'])
    await page.getByLabel('Show breakdown', { exact: true }).check()
    await expect(rows(page)).toHaveCount(3)
    await pageFits(page)
  }
})
