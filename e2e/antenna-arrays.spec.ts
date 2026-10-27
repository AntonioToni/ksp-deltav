import { expect, test, type Locator, type Page } from '@playwright/test'
import { missionModeButton } from './helpers/missionMode'

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const planner = (page: Page) => page.getByRole('dialog', { name: 'CommNet relay planner', exact: true })
const editor = (page: Page, role: 'relay' | 'surface' = 'relay') => page.getByRole('dialog', { name: role === 'relay' ? 'Relay antenna array' : 'Surface antenna array', exact: true })
const combo = (page: Page, label: string) => planner(page).getByRole('combobox', { name: label, exact: true })
const metric = (page: Page, id: string) => planner(page).getByTestId(id)
const count = (dialog: Locator, index = 1) => dialog.getByRole('spinbutton', { name: `Antenna count ${index}`, exact: true })
let browserErrors: string[]

test.beforeEach(async ({ page }) => {
  browserErrors = []
  page.on('pageerror', error => browserErrors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()) })
  await page.goto('./')
  await expect(button(page, 'CommNet relay planner')).toBeVisible()
})

test.afterEach(() => {
  expect(browserErrors, 'Antenna arrays should not produce browser errors').toEqual([])
})

async function openPlanner(page: Page) {
  await button(page, 'CommNet relay planner').click()
  await expect(planner(page)).toBeVisible()
}

async function choose(page: Page, label: string, option: string) {
  await combo(page, label).click()
  await page.getByRole('option', { name: option, exact: true }).click()
}

async function openArray(page: Page, role: 'relay' | 'surface' = 'relay') {
  await choose(page, role === 'relay' ? 'Relay antenna' : 'Surface antenna', 'Antenna array…')
  const dialog = editor(page, role)
  await expect(dialog).toBeVisible()
  return dialog
}

async function choosePart(page: Page, dialog: Locator, index: number, name: string) {
  await dialog.getByRole('combobox', { name: `Antenna ${index}`, exact: true }).click()
  await page.getByRole('option', { name, exact: true }).click()
}

async function apply(dialog: Locator) {
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(dialog).not.toBeVisible()
}

async function exactPower(dialog: Locator) {
  const title = await dialog.getByTestId('antenna-array-power').getAttribute('title')
  expect(title).toMatch(/ m$/)
  return Number(title!.replace(/[, m]/g, ''))
}

async function onScreen(locator: Locator, page: Page) {
  const bounds = await locator.boundingBox()
  const viewport = page.viewportSize()!
  expect(bounds).not.toBeNull()
  if (!bounds) return
  expect(bounds.x).toBeGreaterThanOrEqual(-1)
  expect(bounds.y).toBeGreaterThanOrEqual(-1)
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width + 1)
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height + 1)
}

async function pageFits(page: Page) {
  expect(await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, x: scrollX, y: scrollY }))).toEqual({ ...page.viewportSize()!, x: 0, y: 0 })
}

test('applies one array to every relay and recalculates ranges without altering deployment', async ({ page }) => {
  await openPlanner(page)
  await expect(metric(page, 'relay-dsn-range')).toHaveText('1.1 Gm')
  await planner(page).getByRole('spinbutton', { name: 'Orbit altitude', exact: true }).fill('3000')
  await expect(metric(page, 'relay-ring-status')).toContainText('Out of range')
  await planner(page).getByRole('tab', { name: 'Deployment', exact: true }).click()
  const deployment = await metric(page, 'relay-circularization').textContent()
  await planner(page).getByRole('tab', { name: 'Network', exact: true }).click()
  const dialog = await openArray(page)
  await expect(dialog.getByText('This loadout is fitted to each relay. Antennas on separate satellites do not combine.')).toBeVisible()
  await count(dialog).fill('4')
  await expect(dialog.getByTestId('antenna-array-power')).toHaveText('14.14 Mm')
  expect(await exactPower(dialog)).toBeCloseTo(5e6 * 4 ** .75, 2)
  await apply(dialog)
  await expect(combo(page, 'Relay antenna')).toHaveText('Array (4)')
  await expect(metric(page, 'relay-ring-status')).toContainText('Available')
  await expect(metric(page, 'relay-dsn-range')).toHaveText('1.9 Gm')
  await expect(metric(page, 'relay-coverage')).toHaveText('0%')
  const surface = await openArray(page, 'surface')
  await count(surface).fill('4')
  await apply(surface)
  await expect(metric(page, 'relay-coverage')).toHaveText('100%')
  await planner(page).getByRole('tab', { name: 'Deployment', exact: true }).click()
  await expect(metric(page, 'relay-circularization')).toHaveText(deployment!)
})

test('calculates mixed relay models with a shared diminishing-returns exponent', async ({ page }) => {
  await openPlanner(page)
  const dialog = await openArray(page)
  await dialog.getByRole('button', { name: 'Add antenna', exact: true }).click()
  await expect(dialog.getByRole('combobox', { name: 'Antenna 2', exact: true })).toHaveText('RA-2')
  await expect(dialog.getByTestId('antenna-array-count')).toHaveText('2')
  expect(await exactPower(dialog)).toBeCloseTo(2e9 * (1 + 5e6 / 2e9) ** .75, 2)
  await apply(dialog)
  await expect(combo(page, 'Relay antenna')).toHaveText('Array (2)')
  await expect(metric(page, 'relay-dsn-range')).toHaveText('22.4 Gm')
})

test('distinguishes linear Communotron 16 arrays from non-combining surface antennas', async ({ page }) => {
  await openPlanner(page)
  const dialog = await openArray(page, 'surface')
  await count(dialog).fill('4')
  await expect(dialog.getByTestId('antenna-array-power')).toHaveText('2 Mm')
  await choosePart(page, dialog, 1, 'Communotron 16-S')
  await expect(dialog.getByText(/Does not combine/)).toBeVisible()
  await expect(dialog.getByTestId('antenna-array-power')).toHaveText('500 km')
  await choosePart(page, dialog, 1, 'Internal antenna')
  await count(dialog).fill('100')
  await expect(dialog.getByTestId('antenna-array-power')).toHaveText('5 km')
  await apply(dialog)
  await expect(combo(page, 'Surface antenna')).toHaveText('Array (100)')
  await expect(metric(page, 'relay-coverage')).toHaveText('0%')
  await expect(metric(page, 'relay-dsn-range')).toHaveText('1.1 Gm')
})

test('allows mixed direct and relay parts for a surface endpoint while enforcing relay-only forwarding', async ({ page }) => {
  await openPlanner(page)
  const relay = await openArray(page)
  await relay.getByRole('combobox', { name: 'Antenna 1', exact: true }).click()
  await expect(page.getByRole('option')).toHaveCount(4)
  await expect(page.getByRole('option', { name: 'Communotron 16', exact: true })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await relay.getByRole('button', { name: 'Cancel', exact: true }).click()
  const surface = await openArray(page, 'surface')
  await surface.getByRole('button', { name: 'Add antenna', exact: true }).click()
  await choosePart(page, surface, 2, 'HG-5')
  const weightedExponent = (500_000 + 5_000_000 * .75) / 5_500_000
  expect(await exactPower(surface)).toBeCloseTo(5_000_000 * 1.1 ** weightedExponent, 2)
  await apply(surface)
  await expect(combo(page, 'Surface antenna')).toHaveText('Array (2)')
  await combo(page, 'DSN level').click()
  await expect(page.getByRole('option', { name: 'Antenna array…', exact: true })).toHaveCount(0)
  await page.keyboard.press('Escape')
})

test('validates draft quantities, total craft limit, and an empty loadout before applying', async ({ page }) => {
  await openPlanner(page)
  const dialog = await openArray(page)
  const applyButton = dialog.getByRole('button', { name: 'Apply', exact: true })
  for (const value of ['', '0', '-1', '1.5', '101']) {
    await count(dialog).fill(value)
    await expect(applyButton).toBeDisabled()
    await expect(dialog.getByTestId('antenna-array-power')).toHaveText('—')
  }
  await count(dialog).fill('99')
  await dialog.getByRole('button', { name: 'Add antenna', exact: true }).click()
  await count(dialog, 2).fill('2')
  await expect(applyButton).toBeDisabled()
  await expect(dialog.getByText('Use at most 100 antennas on one craft.', { exact: true })).toBeVisible()
  await count(dialog, 2).fill('1')
  await expect(applyButton).toBeEnabled()
  await expect(dialog.getByTestId('antenna-array-count')).toHaveText('100')
  await expect(dialog.getByRole('button', { name: 'Add antenna', exact: true })).toBeDisabled()
  await dialog.getByRole('button', { name: 'Remove antenna 2', exact: true }).click()
  await dialog.getByRole('button', { name: 'Remove antenna 1', exact: true }).click()
  await expect(applyButton).toBeDisabled()
  await expect(dialog.getByRole('list', { name: 'Antenna array parts', exact: true }).getByRole('listitem')).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Add antenna', exact: true }).click()
  await expect(applyButton).toBeEnabled()
})

test('discards changes on Cancel and Escape while retaining the surrounding relay session', async ({ page }) => {
  await openPlanner(page)
  let dialog = await openArray(page)
  await count(dialog).fill('4')
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(combo(page, 'Relay antenna')).toHaveText('HG-5')
  await expect(metric(page, 'relay-dsn-range')).toHaveText('1.1 Gm')
  dialog = await openArray(page)
  await expect(count(dialog)).toHaveValue('1')
  await count(dialog).fill('4')
  await apply(dialog)
  dialog = await openArray(page)
  await count(dialog).fill('10')
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(planner(page)).toBeVisible()
  await expect(combo(page, 'Relay antenna')).toHaveText('Array (4)')
  await expect(metric(page, 'relay-dsn-range')).toHaveText('1.9 Gm')
  dialog = await openArray(page)
  await expect(count(dialog)).toHaveValue('4')
})

test('reopens the selected array and prevents duplicate part rows', async ({ page }) => {
  await openPlanner(page)
  let dialog = await openArray(page)
  await count(dialog).fill('2')
  await dialog.getByRole('button', { name: 'Add antenna', exact: true }).click()
  await count(dialog, 2).fill('3')
  await apply(dialog)
  await expect(combo(page, 'Relay antenna')).toHaveText('Array (5)')
  dialog = await openArray(page)
  await expect(count(dialog)).toHaveValue('2')
  await expect(count(dialog, 2)).toHaveValue('3')
  await dialog.getByRole('combobox', { name: 'Antenna 2', exact: true }).click()
  await expect(page.getByRole('option', { name: 'HG-5', exact: true })).toBeDisabled()
  await page.keyboard.press('Escape')
  await dialog.getByRole('button', { name: 'Remove antenna 1', exact: true }).click()
  await expect(dialog.getByRole('combobox', { name: 'Antenna 1', exact: true })).toHaveText('RA-2')
  await expect(count(dialog)).toHaveValue('3')
  await apply(dialog)
  await expect(combo(page, 'Relay antenna')).toHaveText('Array (3)')
})

test('keeps preset and custom effective craft power separate from a saved array', async ({ page }) => {
  await openPlanner(page)
  let dialog = await openArray(page)
  await count(dialog).fill('4')
  await apply(dialog)
  await choose(page, 'Relay antenna', 'HG-5')
  await expect(metric(page, 'relay-dsn-range')).toHaveText('1.1 Gm')
  await choose(page, 'Relay antenna', 'Custom power')
  await planner(page).getByRole('spinbutton', { name: 'Relay power', exact: true }).fill('4000000')
  await expect(metric(page, 'relay-dsn-range')).toHaveText('1 Gm')
  dialog = await openArray(page)
  await expect(count(dialog)).toHaveValue('4')
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(combo(page, 'Relay antenna')).toHaveText('Custom')
  await expect(metric(page, 'relay-dsn-range')).toHaveText('1 Gm')
  dialog = await openArray(page)
  await apply(dialog)
  await expect(metric(page, 'relay-dsn-range')).toHaveText('1.9 Gm')
  await expect(planner(page).getByRole('spinbutton', { name: 'Relay power', exact: true })).toHaveCount(0)
})

test('preserves the Delta-V mission and loadout session, then resets on pack change and reload', async ({ page }) => {
  await page.locator('[data-node-id="stock:kerbin:surface"]').click()
  await page.locator('[data-node-id="stock:mun:surface"]').click()
  await missionModeButton(page, 'round-trip').click()
  const missionTotal = await page.getByTestId('route-total').textContent()
  await openPlanner(page)
  const dialog = await openArray(page)
  await count(dialog).fill('4')
  await apply(dialog)
  await planner(page).getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.getByTestId('route-total')).toHaveText(missionTotal!)
  await expect(missionModeButton(page, 'round-trip')).toHaveAttribute('aria-pressed', 'true')
  await openPlanner(page)
  await expect(combo(page, 'Relay antenna')).toHaveText('Array (4)')
  await planner(page).getByRole('button', { name: 'Close', exact: true }).click()
  await button(page, 'OPM').click()
  await openPlanner(page)
  await expect(combo(page, 'Relay antenna')).toHaveText('HG-5')
  const next = await openArray(page)
  await count(next).fill('2')
  await apply(next)
  await page.reload()
  await openPlanner(page)
  await expect(combo(page, 'Relay antenna')).toHaveText('HG-5')
})

for (const viewport of [{ width: 320, height: 568 }, { width: 667, height: 375 }, { width: 700, height: 900 }]) {
  test(`keeps array summaries and actions visible within ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await pageFits(page)
    await openPlanner(page)
    const dialog = await openArray(page, 'surface')
    for (let row = 2; row <= 10; row++) await dialog.getByRole('button', { name: 'Add antenna', exact: true }).click()
    await expect(dialog.getByRole('list', { name: 'Antenna array parts', exact: true }).getByRole('listitem')).toHaveCount(10)
    await expect(dialog.getByRole('button', { name: 'Add antenna', exact: true })).toBeDisabled()
    for (const control of [dialog, dialog.getByTestId('antenna-array-power'), dialog.getByTestId('antenna-array-count'), dialog.getByRole('button', { name: 'Apply', exact: true }), dialog.getByRole('button', { name: 'Cancel', exact: true })]) await onScreen(control, page)
    await count(dialog, 10).scrollIntoViewIfNeeded()
    await count(dialog, 10).fill('2')
    await onScreen(dialog.getByRole('button', { name: 'Apply', exact: true }), page)
    await apply(dialog)
    await expect(combo(page, 'Surface antenna')).toHaveText('Array (11)')
    await planner(page).getByRole('button', { name: 'Close', exact: true }).click()
    await pageFits(page)
    await expect(page.locator('[data-node-id]')).toHaveCount(50)
  })
}
