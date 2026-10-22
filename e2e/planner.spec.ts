import { expect, test, type Page } from '@playwright/test'

const state = (page: Page, body: string, kind: string) =>
  page.locator(`[data-node-id="stock:${body}:${kind}"]`)

let pageErrors: string[]

test.beforeEach(async ({ page }) => {
  pageErrors = []
  page.on('pageerror', error => pageErrors.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error') pageErrors.push(message.text())
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'KSP DeltaV Planner', exact: true })).toBeVisible()
})

test.afterEach(() => {
  expect(pageErrors, 'The planner should run without browser exceptions').toEqual([])
})

async function planMunLanding(page: Page) {
  await state(page, 'kerbin', 'surface').click()
  await state(page, 'mun', 'surface').click()
  await expect(page.getByTestId('route-total')).toHaveText('5,120 m/s')
}

test('plans a stock Mun landing with an itemized cumulative budget and highlighted route', async ({ page }) => {
  await planMunLanding(page)
  const legs = page.getByRole('list', { name: 'Maneuver breakdown' }).getByRole('listitem')
  await expect(legs).toHaveCount(4)
  for (const [index, cumulative] of ['3,400', '4,260', '4,540', '5,120'].entries()) {
    await expect(legs.nth(index)).toContainText(`${cumulative} m/s cumulative`)
  }
  await expect(page.locator('[data-route-edge="true"]')).toHaveCount(4)
  await expect(page.getByRole('button', { name: 'Choose origin', exact: true })).toContainText('Kerbin surface')
  await expect(page.getByRole('button', { name: 'Choose destination', exact: true })).toContainText('Mun surface')
})

test('edits the chosen endpoint and swaps the mission without clearing the other endpoint', async ({ page }) => {
  await planMunLanding(page)
  await page.getByRole('button', { name: 'Choose origin', exact: true }).click()
  await state(page, 'kerbin', 'orbit').click()
  await expect(page.getByTestId('route-total')).toHaveText('1,720 m/s')
  await expect(page.getByRole('button', { name: 'Choose destination', exact: true })).toContainText('Mun surface')
  await page.getByRole('button', { name: 'Swap origin and destination', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Choose origin', exact: true })).toContainText('Mun surface')
  await expect(page.getByRole('button', { name: 'Choose destination', exact: true })).toContainText('Kerbin')
  await expect(page.getByTestId('route-total')).toHaveText('1,720 m/s')
})

test('supports state selection with Enter and Space', async ({ page }) => {
  const origin = state(page, 'kerbin', 'surface')
  await origin.focus()
  await origin.press('Enter')
  await expect(page.getByRole('button', { name: 'Choose origin', exact: true })).toContainText('Kerbin surface')
  const destination = state(page, 'mun', 'surface')
  await destination.focus()
  await destination.press('Space')
  await expect(page.getByTestId('route-total')).toHaveText('5,120 m/s')
})

test('handles an identical origin and destination as a zero-maneuver mission', async ({ page }) => {
  await state(page, 'kerbin', 'surface').click()
  await state(page, 'kerbin', 'surface').click()
  await expect(page.getByTestId('route-total')).toHaveText('0 m/s')
  await expect(page.getByText('No maneuvers required.', { exact: false })).toBeVisible()
  await expect(page.locator('[data-route-edge="true"]')).toHaveCount(0)
})

test('labels atmospheric landing allowances instead of presenting them as calculated burns', async ({ page }) => {
  await state(page, 'kerbin', 'orbit').click()
  await state(page, 'kerbin', 'surface').click()
  await expect(page.getByTestId('route-total')).toHaveText('3,400 m/s')
  await expect(page.getByRole('alert')).toContainText('Atmospheric landing uses an ascent-sized planning allowance, not a calculated descent burn.')
})

test('budgets a parking-orbit capture and departure at the interplanetary transfer hub', async ({ page }) => {
  await state(page, 'moho', 'orbit').click()
  await state(page, 'eve', 'orbit').click()
  await expect(page.getByTestId('route-total')).toHaveText('6,530 m/s')
  const legs = page.getByRole('list', { name: 'Maneuver breakdown' }).getByRole('listitem')
  await expect(legs).toHaveCount(7)
  await expect(legs.nth(2)).toContainText('Kerbin encounter → Kerbin low orbit')
  await expect(legs.nth(3)).toContainText('Kerbin low orbit → Kerbin encounter')
})

test('resets selection and lets users isolate, zoom, and reset the map', async ({ page }) => {
  await planMunLanding(page)
  await page.getByRole('button', { name: 'Route only', exact: true }).click()
  await expect(page.locator('[data-edge-id]')).toHaveCount(4)
  await page.getByRole('button', { name: 'Zoom in map', exact: true }).click()
  await expect(page.getByText('120%', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Reset view', exact: true }).click()
  await expect(page.getByText('100%', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Reset mission', exact: true }).click()
  await expect(page.getByTestId('route-total')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Swap origin and destination', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Choose origin', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'Choose destination', exact: true })).toContainText('Select a destination')
})

test('keeps the wide map inside its own scroll viewport', async ({ page }) => {
  const viewport = page.getByRole('region', { name: 'Scrollable planetary map', exact: true })
  await expect(viewport).toBeVisible()
  const dimensions = await page.evaluate(() => ({
    pageWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }))
  expect(dimensions.pageWidth).toBeLessThanOrEqual(dimensions.viewportWidth)
  // An outer-moon target remains usable beyond the initial horizontal viewport.
  await state(page, 'kerbin', 'surface').click()
  await state(page, 'pol', 'surface').click()
  await expect(page.getByTestId('route-total')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Choose destination', exact: true })).toContainText('Pol surface')
})
