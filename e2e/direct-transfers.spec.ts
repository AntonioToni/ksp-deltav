import { expect, test, type Page } from '@playwright/test'
import { missionModeButton } from './helpers/missionMode'

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const node = (page: Page, id: string) => page.locator(`[data-node-id="${id}"]`)
const direct = (page: Page) => page.locator('[data-route-edge="true"][data-direct-transfer="true"]')
const selected = (page: Page) => page.locator('[data-route-edge="true"]')
const flow = (page: Page) => page.locator('[data-route-animation="true"]')
const trail = (page: Page) => flow(page).locator('[data-flow-run]').first().locator('path.route-flow-trail').last()
const total = (page: Page) => page.getByTestId('route-total')
const info = (page: Page) => page.getByRole('dialog', { name: 'About these estimates', exact: true })
const atmosphere = (page: Page) => page.getByRole('dialog', { name: 'Atmospheric assistance', exact: true })
const stops = (page: Page) => page.getByRole('dialog', { name: /^Mission stops\b/ })
const rows = (page: Page) => page.getByRole('list', { name: 'Maneuver breakdown', exact: true }).getByRole('listitem')
let browserErrors: string[]

test.beforeEach(async ({ page }) => {
  browserErrors = []
  page.on('pageerror', error => browserErrors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()) })
  await page.goto('./')
  await expect(button(page, 'Custom planet packs')).toBeVisible()
})

test.afterEach(() => {
  expect(browserErrors, 'Direct transfer planning should not produce browser errors').toEqual([])
})

async function plan(page: Page, from: string, to: string) {
  await node(page, from).click()
  await node(page, to).click()
}

async function reset(page: Page) {
  await button(page, 'Reset mission').click()
}

async function addStop(page: Page, label: string) {
  await button(page, 'Edit mission stops').click()
  await stops(page).getByRole('combobox', { name: 'Choose a stop', exact: true }).fill(label)
  await page.getByRole('option', { name: label, exact: true }).click()
  await stops(page).getByRole('button', { name: 'Add stop', exact: true }).click()
  await stops(page).getByRole('button', { name: 'Done', exact: true }).click()
}

async function view(page: Page, name: string) {
  await page.getByRole('combobox', { name: 'Map view', exact: true }).click()
  await page.getByRole('option', { name, exact: true }).click()
}

/** Inspect the rendered polyline independently of the model and routing helpers. */
async function geometry(page: Page, ids: string[]) {
  return page.evaluate(nodeIds => {
    const points = Object.fromEntries(nodeIds.map(id => {
      const element = document.querySelector<SVGGElement>(`[data-node-id="${id}"]`)
      const transform = element?.transform.baseVal.consolidate()?.matrix
      if (!transform) throw new Error(`Missing route endpoint ${id}`)
      return [id, { x: transform.e, y: transform.f }]
    }))
    const paths = Array.from(document.querySelectorAll<SVGPathElement>('[data-flow-run] path.route-flow-trail:last-child')).map(path => {
      const numbers = (path.getAttribute('d')?.match(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi) ?? []).map(Number)
      const start = path.getPointAtLength(0)
      const end = path.getPointAtLength(path.getTotalLength())
      return {
        d: path.getAttribute('d'),
        start: { x: start.x, y: start.y }, end: { x: end.x, y: end.y },
        vertices: Array.from({ length: numbers.length / 2 }, (_, index) => ({ x: numbers[index * 2], y: numbers[index * 2 + 1] })),
      }
    })
    return { points, paths }
  }, ids)
}

function samePoint(actual: { x: number; y: number }, expected: { x: number; y: number }) {
  expect(actual.x).toBeCloseTo(expected.x, 3)
  expect(actual.y).toBeCloseTo(expected.y, 3)
}

async function expectDirection(page: Page, from: string, to: string) {
  await expect(flow(page)).toBeVisible()
  const result = await geometry(page, [from, to])
  expect(result.paths).toHaveLength(1)
  samePoint(result.paths[0].start, result.points[from])
  samePoint(result.paths[0].end, result.points[to])
  return result.paths[0]
}

async function pageFits(page: Page) {
  const size = page.viewportSize()!
  expect(await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, x: scrollX, y: scrollY })))
    .toEqual({ ...size, x: 0, y: 0 })
}

test('shows only a chosen direct transfer and identifies its analytic source', async ({ page }) => {
  await expect(direct(page)).toHaveCount(0)
  await expect(page.locator('[data-connection-id]')).toHaveCount(49)
  await expect(page.locator('[data-aerobraking-edge]')).toHaveCount(14)
  await plan(page, 'stock:duna:orbit', 'stock:dres:orbit')
  await expect(total(page)).toHaveText('1,532 m/s')
  await expect(selected(page)).toHaveCount(1)
  await expect(direct(page)).toHaveCount(1)
  await expect(page.locator('[data-connection-id]')).toHaveCount(50)
  await expect(page.getByTestId('route-status')).toContainText(/direct transfer/i)
  await expect(page.getByTestId('route-status')).not.toContainText('Kerbin parking-orbit layover')
  const path = await expectDirection(page, 'stock:duna:orbit', 'stock:dres:orbit')
  await expect(direct(page)).toHaveAttribute('d', path.d!)
  const before = await trail(page).evaluate(element => Number.parseFloat(getComputedStyle(element).strokeDashoffset))
  await expect.poll(() => trail(page).evaluate(element => Number.parseFloat(getComputedStyle(element).strokeDashoffset))).toBeLessThan(before - .01)
  await button(page, 'Budget assumptions').click()
  const model = info(page).locator('[data-budget-summary-kind="model"]')
  await expect(model).toContainText('1,532 m/s')
  await expect(model).toContainText('1 maneuver')
  await expect(info(page).locator('[data-budget-summary-kind]')).toHaveCount(1)
  await info(page).getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByLabel('Show breakdown', { exact: true }).check()
  await expect(rows(page)).toHaveCount(1)
  await expect(rows(page).first()).toHaveAttribute('data-budget-basis', 'model')
  await expect(rows(page).first()).toContainText('1,532 m/s')
})

for (const pack of ['Stock', 'OPM']) {
  test(`routes Duna to Gilly through Eve high orbit without a Kerbin layover in ${pack}`, async ({ page }) => {
    await button(page, pack).click()
    await plan(page, 'stock:duna:orbit', 'stock:gilly:orbit')
    // Complete Duna departure + Eve high capture, then the two published moon segments.
    await expect(total(page)).toHaveText('1,898 m/s')
    await expect(selected(page)).toHaveCount(3)
    await expect(direct(page)).toHaveAttribute('data-edge-id', 'direct:stock:duna:orbit->stock:eve:elliptical')
    await expect(page.locator('[data-route-edge][data-edge-id*="stock:kerbin:"]')).toHaveCount(0)
    await expect(page.getByTestId('route-status')).not.toContainText('Kerbin parking-orbit layover')
    const outward = await expectDirection(page, 'stock:duna:orbit', 'stock:gilly:orbit')
    const { points } = await geometry(page, ['stock:eve:elliptical'])
    expect(outward.vertices.some(point => Math.hypot(point.x - points['stock:eve:elliptical'].x, point.y - points['stock:eve:elliptical'].y) < .01)).toBe(true)
    await page.getByLabel('Show breakdown', { exact: true }).check()
    await expect(rows(page)).toHaveCount(3)
    await expect(rows(page)).toContainText(['Eve elliptical orbit', 'Gilly encounter', 'Gilly low orbit'])
    await expect(rows(page).first()).toContainText('1,428 m/s')
    await expect(rows(page).first()).toHaveAttribute('data-budget-basis', 'model')

    await missionModeButton(page, 'return-only').click()
    await expect(total(page)).toHaveText('1,898 m/s')
    await expectDirection(page, 'stock:gilly:orbit', 'stock:duna:orbit')
    await missionModeButton(page, 'round-trip').click()
    await expect(total(page)).toHaveText('3,796 m/s')
    await expectDirection(page, 'stock:duna:orbit', 'stock:duna:orbit')
    await pageFits(page)
  })
}

test('keeps moon-to-moon transfers and their ordered high-orbit stop in every mission mode', async ({ page }) => {
  await plan(page, 'stock:ike:orbit', 'stock:gilly:orbit')
  await expect(total(page)).toHaveText('1,718 m/s')
  await addStop(page, 'Eve elliptical orbit')
  await expect(total(page)).toHaveText('1,718 m/s')
  await expect(node(page, 'stock:eve:elliptical')).toHaveAttribute('data-waypoint-indexes', '1')
  await expect(direct(page)).toHaveAttribute('data-edge-id', 'direct:stock:duna:elliptical->stock:eve:elliptical')
  await expect(page.locator('[data-route-edge][data-edge-id*="stock:kerbin:"]')).toHaveCount(0)
  await expectDirection(page, 'stock:ike:orbit', 'stock:gilly:orbit')
  await page.getByLabel('Show breakdown', { exact: true }).check()
  await expect(page.getByTestId('stage-total')).toHaveText('1,248 m/s')
  await button(page, 'Next stage').click()
  await expect(page.getByTestId('stage-total')).toHaveText('470 m/s')
  await missionModeButton(page, 'round-trip').click()
  await expect(total(page)).toHaveText('3,436 m/s')
  await expectDirection(page, 'stock:ike:orbit', 'stock:ike:orbit')
  await missionModeButton(page, 'return-only').click()
  await expect(total(page)).toHaveText('1,718 m/s')
  await expectDirection(page, 'stock:gilly:orbit', 'stock:ike:orbit')
  await pageFits(page)
})

test('reverses the same band for return-only and budgets a round trip and reserve once', async ({ page }) => {
  await plan(page, 'stock:duna:orbit', 'stock:dres:orbit')
  const outward = await direct(page).evaluate(element => {
    const path = element as SVGPathElement
    return Array.from({ length: 9 }, (_, index) => {
      const point = path.getPointAtLength(path.getTotalLength() * index / 8)
      return { x: point.x, y: point.y }
    })
  })
  await missionModeButton(page, 'return-only').click()
  await expect(total(page)).toHaveText('1,532 m/s')
  await expectDirection(page, 'stock:dres:orbit', 'stock:duna:orbit')
  const returning = await direct(page).evaluate(element => {
    const path = element as SVGPathElement
    return Array.from({ length: 9 }, (_, index) => {
      const point = path.getPointAtLength(path.getTotalLength() * index / 8)
      return { x: point.x, y: point.y }
    })
  })
  returning.forEach((point, index) => samePoint(point, outward[outward.length - 1 - index]))
  await missionModeButton(page, 'round-trip').click()
  await expect(total(page)).toHaveText('3,064 m/s')
  await expect(direct(page)).toHaveCount(2)
  await expectDirection(page, 'stock:duna:orbit', 'stock:duna:orbit')
  await missionModeButton(page, 'one-way').click()
  const reserve = page.getByRole('slider', { name: 'Redundancy', exact: true })
  await reserve.focus()
  await reserve.press('Home')
  for (let index = 0; index < 4; index++) await reserve.press('ArrowRight')
  await expect(reserve).toHaveAttribute('aria-valuenow', '20')
  await expect(total(page)).toHaveText('1,839 m/s')
  await expect(page.getByTestId('route-base')).toHaveText('1,532 m/s')
  await expect(direct(page)).toHaveCount(1)
})

test('charges both transfer burns once between surface maneuvers and preserves homeworld map figures', async ({ page }) => {
  await plan(page, 'stock:duna:surface', 'stock:dres:surface')
  await expect(total(page)).toHaveText('3,412 m/s')
  await expect(direct(page)).toHaveCount(1)
  await page.getByLabel('Show breakdown', { exact: true }).check()
  await expect(rows(page)).toHaveCount(3)
  await expect(rows(page)).toContainText(['1,450 m/s', '1,532 m/s', '430 m/s'])
  await expect(rows(page).and(page.locator('[data-budget-basis="model"]'))).toHaveCount(1)
  await reset(page)
  await plan(page, 'stock:kerbin:surface', 'stock:mun:surface')
  await expect(total(page)).toHaveText('5,120 m/s')
  await expect(direct(page)).toHaveCount(0)
  await reset(page)
  await plan(page, 'stock:kerbin:surface', 'stock:duna:surface')
  await expect(total(page)).toHaveText('6,540 m/s')
  await expect(direct(page)).toHaveCount(0)
})

test('keeps an ordered direct multi-stop route and its animation through the chosen parking orbit', async ({ page }) => {
  await plan(page, 'stock:duna:orbit', 'stock:jool:orbit')
  await addStop(page, 'Dres low orbit')
  await expect(direct(page)).toHaveCount(2)
  const { points, paths } = await geometry(page, ['stock:duna:orbit', 'stock:dres:orbit', 'stock:jool:orbit'])
  expect(paths).toHaveLength(1)
  samePoint(paths[0].start, points['stock:duna:orbit'])
  samePoint(paths[0].end, points['stock:jool:orbit'])
  expect(paths[0].vertices.some(point => Math.hypot(point.x - points['stock:dres:orbit'].x, point.y - points['stock:dres:orbit'].y) < .01)).toBe(true)
  await expect(node(page, 'stock:dres:orbit')).toHaveAttribute('data-waypoint-indexes', '1')
  await expect(page.getByTestId('route-status')).not.toContainText('Kerbin parking-orbit layover')
  const amount = Number((await total(page).textContent())!.replace(/[^\d]/g, ''))
  await page.getByLabel('Show breakdown', { exact: true }).check()
  await expect(page.getByTestId('stage-total')).toHaveText('1,532 m/s')
  await button(page, 'Next stage').click()
  await expect(rows(page)).toHaveCount(1)
  await expect(rows(page).first()).toContainText('Jool low orbit')
  await missionModeButton(page, 'round-trip').click()
  await expect(total(page)).toHaveText(`${(amount * 2).toLocaleString('en-US')} m/s`)
  await expectDirection(page, 'stock:duna:orbit', 'stock:duna:orbit')
})

test('retains bundled high-orbit capture while applying ideal local circularization', async ({ page }) => {
  await plan(page, 'stock:eve:orbit', 'stock:duna:orbit')
  await expect(total(page)).toHaveText('2,728 m/s')
  const marker = page.locator('[data-aerobraking-edge][data-from="stock:eve:orbit"][data-to="stock:duna:orbit"]')
  await expect(marker).toHaveCount(1)
  await expect(marker).toHaveAttribute('data-selected', 'true')
  await button(page, 'Atmospheric assistance').click()
  await atmosphere(page).getByRole('checkbox', { name: 'Ideal capture at Duna', exact: true }).check()
  await atmosphere(page).getByRole('button', { name: 'Apply', exact: true }).click()
  // The optimizer can choose the cheaper high arrival plus standalone ideal
  // circularization; the complete 2,368 m/s high-arrival pair stays intact.
  await expect(total(page)).toHaveText('2,368 m/s')
  await expect(direct(page)).toHaveCount(1)
  await expect(direct(page)).toHaveAttribute('data-edge-id', 'direct:stock:eve:orbit->stock:duna:elliptical')
  await expect(page.locator('[data-route-edge="true"][data-edge-id="stock:duna:elliptical->stock:duna:orbit"]')).toHaveAttribute('data-assisted', 'true')
  await button(page, 'Choose destination').click()
  await node(page, 'stock:duna:surface').click()
  await expect(total(page)).toHaveText('3,818 m/s')
  await button(page, 'Atmospheric assistance').click()
  await atmosphere(page).getByRole('checkbox', { name: 'Atmospheric landing at Duna', exact: true }).check()
  await atmosphere(page).getByRole('spinbutton', { name: 'Landing allowance at Duna', exact: true }).fill('100')
  await atmosphere(page).getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(total(page)).toHaveText('2,468 m/s')
  await expect(direct(page)).toHaveCount(1)
})

test('uses OPM sibling-planet estimates without treating its Eeloo moon as a heliocentric planet', async ({ page }) => {
  await button(page, 'OPM').click()
  await plan(page, 'opm:sarnus:orbit', 'opm:urlum:orbit')
  await expect(total(page)).toHaveText('2,494 m/s')
  await expect(direct(page)).toHaveCount(1)
  const path = await expectDirection(page, 'opm:sarnus:orbit', 'opm:urlum:orbit')
  await expect(direct(page)).toHaveAttribute('d', path.d!)
  await reset(page)
  await plan(page, 'opm:sarnus:orbit', 'stock:eeloo:orbit')
  await expect(total(page)).toBeVisible()
  await expect(direct(page)).toHaveCount(0)
  await expect(selected(page)).not.toHaveCount(0)
})

test('inherits selected direct links in both Kcalbeloh compositions and the all-systems overview', async ({ page }) => {
  await button(page, 'Custom planet packs').click()
  const manager = page.getByRole('dialog', { name: 'Planet packs', exact: true })
  await manager.getByRole('tab', { name: 'Add-ons', exact: true }).click()
  await manager.getByRole('button', { name: 'Use Stock + Kcalbeloh', exact: true }).click()
  await plan(page, 'stock:duna:orbit', 'stock:dres:orbit')
  await expect(total(page)).toHaveText('1,532 m/s')
  for (const baseName of ['Stock', 'OPM']) {
    if (baseName === 'OPM') await button(page, 'OPM').click()
    await view(page, 'All systems')
    await expect(total(page)).toHaveText('1,532 m/s')
    await expect(direct(page)).toHaveCount(1)
    const path = await expectDirection(page, 'stock:duna:orbit', 'stock:dres:orbit')
    await expect(direct(page)).toHaveAttribute('d', path.d!)
    await pageFits(page)
  }
})

test('inherits moon approaches through high reference orbits in both Kcalbeloh overviews', async ({ page }) => {
  await button(page, 'Custom planet packs').click()
  const manager = page.getByRole('dialog', { name: 'Planet packs', exact: true })
  await manager.getByRole('tab', { name: 'Add-ons', exact: true }).click()
  await manager.getByRole('button', { name: 'Use Stock + Kcalbeloh', exact: true }).click()
  await plan(page, 'stock:duna:orbit', 'stock:gilly:orbit')
  for (const baseName of ['Stock', 'OPM']) {
    if (baseName === 'OPM') await button(page, 'OPM').click()
    await view(page, 'All systems')
    await expect(total(page)).toHaveText('1,898 m/s')
    await expect(direct(page)).toHaveAttribute('data-edge-id', 'direct:stock:duna:orbit->stock:eve:elliptical')
    await expectDirection(page, 'stock:duna:orbit', 'stock:gilly:orbit')
    await pageFits(page)
  }
})

test('keeps direct paths and their moving highlight within narrow and desktop map layouts', async ({ page }) => {
  for (const viewport of [{ width: 320, height: 568 }, { width: 667, height: 375 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport)
    await reset(page)
    await node(page, 'stock:duna:orbit').focus()
    await node(page, 'stock:duna:orbit').press('Enter')
    await node(page, 'stock:dres:orbit').focus()
    await node(page, 'stock:dres:orbit').press('Space')
    await expect(total(page)).toHaveText('1,532 m/s')
    const path = await expectDirection(page, 'stock:duna:orbit', 'stock:dres:orbit')
    await expect(direct(page)).toHaveAttribute('d', path.d!)
    const bounds = await direct(page).boundingBox()
    expect(bounds).not.toBeNull()
    if (bounds) {
      expect(bounds.x).toBeGreaterThanOrEqual(-1)
      expect(bounds.y).toBeGreaterThanOrEqual(-1)
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width + 1)
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height + 1)
    }
    await pageFits(page)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(flow(page)).toBeHidden()
    await expect(direct(page)).toBeVisible()
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await reset(page)
    await plan(page, 'stock:duna:orbit', 'stock:gilly:orbit')
    await expect(total(page)).toHaveText('1,898 m/s')
    await expectDirection(page, 'stock:duna:orbit', 'stock:gilly:orbit')
    await page.getByLabel('Show breakdown', { exact: true }).check()
    await expect(rows(page)).toHaveCount(3)
    await pageFits(page)
  }
})
