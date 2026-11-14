import { expect, test, type Locator, type Page } from '@playwright/test'
import { missionModeButton } from './helpers/missionMode'

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const controls = (page: Page) => page.getByRole('region', { name: 'Mission controls', exact: true })
const total = (page: Page) => page.getByTestId('route-total')
let browserErrors: string[]

test.beforeEach(({ page }) => {
  browserErrors = []
  page.on('pageerror', error => browserErrors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()) })
})

test.afterEach(() => expect(browserErrors, 'Mission controls must not produce browser errors').toEqual([]))

async function bounds(locator: Locator) {
  await expect(locator).toBeVisible()
  const box = await locator.boundingBox()
  if (!box) throw new Error('A visible control has no bounds')
  return box
}

async function pageFits(page: Page) {
  expect(await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
    x: scrollX,
    y: scrollY,
  }))).toEqual({ ...page.viewportSize()!, x: 0, y: 0 })
}

async function centralControlsFit(page: Page) {
  const frame = await bounds(controls(page))
  const viewport = page.viewportSize()!
  expect(frame.width).toBeLessThanOrEqual(1801)
  expect(frame.x + frame.width / 2).toBeCloseTo(viewport.width / 2, 0)
  for (const control of [
    button(page, 'Choose origin'), button(page, 'Choose destination'),
    page.getByRole('slider', { name: 'Redundancy', exact: true }),
    button(page, 'Budget assumptions'), button(page, 'Edit mission stops'),
    button(page, 'Reset mission'), page.getByRole('checkbox', { name: 'Show breakdown', exact: true }),
    page.getByTestId('route-status'),
    page.getByRole('heading', { name: 'KSP DeltaV Planner', exact: true }),
    button(page, 'Atmospheric assistance'), button(page, 'CommNet relay planner'),
    page.getByRole('link', { name: 'GitHub project (opens in a new tab)', exact: true }),
    button(page, 'Model assumptions and data sources'),
  ]) {
    const box = await bounds(control)
    expect(box.x).toBeGreaterThanOrEqual(frame.x - 1)
    expect(box.x + box.width).toBeLessThanOrEqual(frame.x + frame.width + 1)
    expect(box.y).toBeGreaterThanOrEqual(0)
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1)
  }
  await pageFits(page)
  return frame
}

for (const viewport of [
  { width: 2560, height: 1440 }, { width: 3440, height: 1440 },
  { width: 5120, height: 1440 }, { width: 6400, height: 1440 },
]) {
  test(`centers mission controls and their breakdown at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('./')
    const frame = await centralControlsFit(page)
    const footer = await bounds(page.getByRole('contentinfo'))
    expect(footer.width).toBe(viewport.width)
    for (const control of [button(page, 'Choose origin'), button(page, 'Choose destination'), page.getByRole('slider', { name: 'Redundancy', exact: true })]) {
      expect((await bounds(control)).width).toBeLessThan(frame.width / 3)
    }
    const note = await bounds(page.getByRole('contentinfo').getByText(/Estimates in m\/s/))
    expect(note.x + note.width).toBeLessThanOrEqual(frame.x + frame.width + 1)

    for (const id of ['stock:kerbin:surface', 'stock:mun:surface']) {
      await page.locator(`[data-node-id="${id}"]`).click()
    }
    await expect(total(page)).toHaveText('5,120 m/s')
    await missionModeButton(page, 'round-trip').click()
    await expect(total(page)).toHaveText('6,840 m/s')

    const breakdown = page.getByRole('checkbox', { name: 'Show breakdown', exact: true })
    await breakdown.check()
    const panel = await bounds(page.getByRole('region', { name: 'Maneuver breakdown panel', exact: true }))
    const toggle = await bounds(breakdown)
    const activeFooter = await bounds(page.getByRole('contentinfo'))
    expect(panel.y + panel.height).toBeLessThanOrEqual(activeFooter.y)
    expect(panel.x + panel.width).toBeLessThanOrEqual(frame.x + frame.width + 1)
    expect(Math.abs(panel.x + panel.width - toggle.x - toggle.width)).toBeLessThan(96)
    await breakdown.uncheck()

    const reserve = page.getByRole('slider', { name: 'Redundancy', exact: true })
    await reserve.focus()
    await reserve.press('Home')
    for (let step = 0; step < 4; step++) await reserve.press('ArrowRight')
    await expect(total(page)).toHaveText('8,208 m/s')
    await missionModeButton(page, 'return-only').click()
    await expect(total(page)).toHaveText('2,064 m/s')
    await centralControlsFit(page)
    await button(page, 'Reset mission').click()
    await expect(total(page)).toHaveCount(0)
    await expect(missionModeButton(page, 'one-way')).toHaveAttribute('aria-pressed', 'true')
    await centralControlsFit(page)
  })
}

test('keeps the centered controls usable on phone, landscape, and normal desktop screens', async ({ page }) => {
  for (const viewport of [{ width: 320, height: 568 }, { width: 667, height: 375 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(viewport)
    await page.goto('./')
    await centralControlsFit(page)
    for (const id of ['stock:kerbin:surface', 'stock:mun:surface']) {
      const node = page.locator(`[data-node-id="${id}"]`)
      await node.focus()
      await node.press('Enter')
    }
    await expect(total(page)).toHaveText('5,120 m/s')
    await centralControlsFit(page)
  }
})

test('keeps Kcalbeloh map-view controls within the central panel across system views', async ({ page }) => {
  await page.setViewportSize({ width: 6400, height: 1440 })
  await page.goto('./')
  await button(page, 'Custom planet packs').click()
  const manager = page.getByRole('dialog', { name: 'Planet packs', exact: true })
  await manager.getByRole('tab', { name: 'Add-ons', exact: true }).click()
  await manager.getByRole('button', { name: 'Use Stock + Kcalbeloh', exact: true }).click()
  await expect(manager).toBeHidden()

  const selector = page.getByRole('combobox', { name: 'Map view', exact: true })
  const frame = await bounds(controls(page))
  async function selectorFits() {
    const box = await bounds(selector)
    expect(box.x).toBeGreaterThanOrEqual(frame.x - 1)
    expect(box.x + box.width).toBeLessThanOrEqual(frame.x + frame.width + 1)
    await pageFits(page)
  }
  await selectorFits()
  await selector.click()
  await page.getByRole('option', { name: 'All systems', exact: true }).click()
  await expect(selector).toHaveText('All systems')
  await expect(page.locator('svg[data-map-presentation="overview"]')).toBeVisible()
  await selectorFits()
})
