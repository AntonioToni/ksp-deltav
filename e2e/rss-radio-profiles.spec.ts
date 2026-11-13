import { expect, test, type Locator, type Page } from '@playwright/test'

const rssRadio = 'RSS CommNet (without CBK)'
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const planner = (page: Page) => page.getByRole('dialog', { name: 'CommNet relay planner', exact: true })
const combo = (page: Page, name: string) => planner(page).getByRole('combobox', { name, exact: true })
const field = (page: Page, name: string) => planner(page).getByRole('spinbutton', { name, exact: true })
const metric = (page: Page, id: string) => planner(page).getByTestId(id)
const editor = (page: Page, role: 'relay' | 'surface' = 'relay') => page.getByRole('dialog', { name: role === 'relay' ? 'Relay antenna array' : 'Surface antenna array', exact: true })
let browserErrors: string[]

test.beforeEach(async ({ page }) => {
  browserErrors = []
  page.on('pageerror', error => browserErrors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()) })
  await page.goto('./')
  await expect(button(page, 'CommNet relay planner')).toBeVisible()
})

test.afterEach(() => {
  expect(browserErrors, 'Radio profile changes should not produce browser errors').toEqual([])
})

async function openPlanner(page: Page, rss = true) {
  if (rss) await button(page, 'RSS').click()
  await button(page, 'CommNet relay planner').click()
  await expect(planner(page)).toBeVisible()
}

async function choose(page: Page, label: string, option: string) {
  await combo(page, label).click()
  await page.getByRole('option', { name: option, exact: true }).click()
}

async function openArray(page: Page, role: 'relay' | 'surface' = 'relay') {
  await choose(page, role === 'relay' ? 'Relay antenna' : 'Surface antenna', 'Antenna array…')
  await expect(editor(page, role)).toBeVisible()
  return editor(page, role)
}

async function exactPower(dialog: Locator) {
  const title = await dialog.getByTestId('antenna-array-power').getAttribute('title')
  expect(title).toMatch(/ m$/)
  return Number(title!.replace(/[, m]/g, ''))
}

async function apply(dialog: Locator) {
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(dialog).not.toBeVisible()
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

test('defaults base RSS to scaled stock parts while keeping the conditional DSN patch separate', async ({ page }, testInfo) => {
  await openPlanner(page)
  await expect(combo(page, 'Relay body')).toHaveText('Earth')
  await expect(combo(page, 'Radio setup')).toHaveText(rssRadio)
  await expect(metric(page, 'relay-relay-power')).toHaveText('100 Mm')
  await expect(metric(page, 'relay-client-power')).toHaveText('10 Mm')
  await expect(metric(page, 'relay-dsn-power')).toHaveText('250 Gm')
  await expect(planner(page).getByText(/RealAntennas and RemoteTech use different radio systems/)).toBeVisible()
  // sqrt(100,000,000 × 250,000,000,000), with no additional range multiplier.
  await expect(metric(page, 'relay-dsn-range')).toHaveText('5 Gm')
  if (testInfo.project.name === 'desktop') await page.screenshot({ path: '/tmp/rss-radio-desktop.png', animations: 'disabled' })
  const relay = await openArray(page)
  await expect(relay.getByText(rssRadio, { exact: true })).toBeVisible()
  expect(await exactPower(relay)).toBe(100_000_000)
  await expect(relay.getByText(/Power 100 Mm/)).toBeVisible()
  await relay.getByRole('button', { name: 'Cancel', exact: true }).click()
  const surface = await openArray(page, 'surface')
  expect(await exactPower(surface)).toBe(10_000_000)
  await surface.getByRole('button', { name: 'Cancel', exact: true }).click()
  await choose(page, 'Radio setup', 'RSS + CustomBarnKit')
  await expect(metric(page, 'relay-dsn-power')).toHaveText('50,000 Gm')
  // sqrt(100,000,000 × 50,000,000,000,000).
  await expect(metric(page, 'relay-dsn-range')).toHaveText('70.7 Gm')
  await choose(page, 'DSN level', 'DSN level 1')
  await expect(metric(page, 'relay-dsn-range')).toHaveText('707.1 Mm')
  await choose(page, 'Radio setup', rssRadio)
  await expect(combo(page, 'DSN level')).toHaveText('Level 1')
  await expect(metric(page, 'relay-dsn-range')).toHaveText('447.2 Mm')
  await planner(page).getByRole('tab', { name: 'Body data', exact: true }).click()
  await expect(field(page, 'Range multiplier')).toHaveValue('1')
  await choose(page, 'Occlusion', 'RSS default (1.0)')
  await expect(planner(page).getByText(/Signal blocking uses 1\.00 × the body radius \(RSS default\)/)).toBeVisible()
})

test('recalculates a saved array once per profile and preserves it when changing body', async ({ page }) => {
  await openPlanner(page)
  await field(page, 'Orbit altitude').fill('9000')
  await planner(page).getByRole('tab', { name: 'Deployment', exact: true }).click()
  const deployment = await metric(page, 'relay-circularization').textContent()
  await planner(page).getByRole('tab', { name: 'Network', exact: true }).click()
  let dialog = await openArray(page)
  await dialog.getByRole('spinbutton', { name: 'Antenna count 1', exact: true }).fill('4')
  // RSS applies ×20 to each HG-5, preserving the stock exponent of 0.75.
  expect(await exactPower(dialog)).toBeCloseTo(100_000_000 * 4 ** .75, 2)
  await expect(dialog.getByTestId('antenna-array-power')).toHaveText('282.8 Mm')
  await apply(dialog)
  await expect(metric(page, 'relay-dsn-range')).toHaveText('8.4 Gm')
  await choose(page, 'Radio setup', 'Stock CommNet')
  await expect(combo(page, 'Relay antenna')).toHaveText('Array (4)')
  await expect(metric(page, 'relay-dsn-range')).toHaveText('1.9 Gm')
  dialog = await openArray(page)
  await expect(dialog.getByRole('spinbutton', { name: 'Antenna count 1', exact: true })).toHaveValue('4')
  expect(await exactPower(dialog)).toBeCloseTo(5_000_000 * 4 ** .75, 2)
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await choose(page, 'Radio setup', rssRadio)
  await expect(metric(page, 'relay-dsn-range')).toHaveText('8.4 Gm')
  await planner(page).getByRole('tab', { name: 'Deployment', exact: true }).click()
  await expect(metric(page, 'relay-circularization')).toHaveText(deployment!)
  await planner(page).getByRole('tab', { name: 'Network', exact: true }).click()
  await choose(page, 'Relay body', 'Moon')
  await expect(combo(page, 'Radio setup')).toHaveText(rssRadio)
  await expect(combo(page, 'Relay antenna')).toHaveText('Array (4)')
  dialog = await openArray(page)
  await expect(dialog.getByRole('spinbutton', { name: 'Antenna count 1', exact: true })).toHaveValue('4')
  expect(await exactPower(dialog)).toBeCloseTo(100_000_000 * 4 ** .75, 2)
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await choose(page, 'Relay body', 'Earth')
  await expect(field(page, 'Orbit altitude')).toHaveValue('9000')
})

test('treats all custom powers as final effective values across radio profiles', async ({ page }) => {
  await openPlanner(page)
  for (const label of ['Relay antenna', 'Surface antenna', 'DSN level']) await choose(page, label, 'Custom power')
  await field(page, 'Relay power').fill('100000000')
  await field(page, 'Surface power').fill('10000000')
  await field(page, 'DSN power').fill('250000000000')
  await expect(planner(page).getByText(/The radio setup does not multiply custom values again/)).toBeVisible()
  for (const profile of ['Stock CommNet', 'RSS + CustomBarnKit', rssRadio]) {
    await choose(page, 'Radio setup', profile)
    await expect(field(page, 'Relay power')).toHaveValue('100000000')
    await expect(field(page, 'Surface power')).toHaveValue('10000000')
    await expect(field(page, 'DSN power')).toHaveValue('250000000000')
    await expect(metric(page, 'relay-dsn-range')).toHaveText('5 Gm')
    await expect(metric(page, 'relay-coverage')).toHaveText('100%')
  }
})

test('keeps radio setup independent of the planet pack and resets only with a new pack', async ({ page }) => {
  await openPlanner(page, false)
  await expect(combo(page, 'Radio setup')).toHaveText('Stock CommNet')
  await expect(metric(page, 'relay-dsn-range')).toHaveText('1.1 Gm')
  await choose(page, 'Radio setup', rssRadio)
  await expect(combo(page, 'Relay body')).toHaveText('Kerbin')
  await expect(metric(page, 'relay-dsn-range')).toHaveText('5 Gm')
  await choose(page, 'Relay body', 'Mun')
  await expect(combo(page, 'Radio setup')).toHaveText(rssRadio)
  await planner(page).getByRole('button', { name: 'Close', exact: true }).click()
  await openPlanner(page, false)
  await expect(combo(page, 'Radio setup')).toHaveText(rssRadio)
  await expect(combo(page, 'Relay body')).toHaveText('Mun')
  await planner(page).getByRole('button', { name: 'Close', exact: true }).click()
  await button(page, 'OPM').click()
  await openPlanner(page, false)
  await expect(combo(page, 'Radio setup')).toHaveText('Stock CommNet')
  await expect(metric(page, 'relay-dsn-range')).toHaveText('1.1 Gm')
})

for (const viewport of [{ width: 320, height: 568 }, { width: 667, height: 375 }]) {
  test(`keeps RSS radio selection and array actions usable at ${viewport.width}×${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport)
    await openPlanner(page)
    await onScreen(planner(page), page)
    await combo(page, 'Radio setup').scrollIntoViewIfNeeded()
    await onScreen(combo(page, 'Radio setup'), page)
    await expect(combo(page, 'Radio setup')).toHaveText(rssRadio)
    await choose(page, 'Radio setup', 'RSS + CustomBarnKit')
    await expect(metric(page, 'relay-dsn-range')).toHaveText('70.7 Gm')
    if (testInfo.project.name === 'desktop') await page.screenshot({ path: `/tmp/rss-radio-${viewport.width}.png`, animations: 'disabled' })
    await onScreen(planner(page).getByRole('button', { name: 'Close', exact: true }), page)
    const dialog = await openArray(page)
    await dialog.getByRole('spinbutton', { name: 'Antenna count 1', exact: true }).fill('4')
    await expect(dialog.getByTestId('antenna-array-power')).toHaveText('282.8 Mm')
    if (testInfo.project.name === 'desktop') await page.screenshot({ path: `/tmp/rss-array-${viewport.width}.png`, animations: 'disabled' })
    for (const control of [dialog, dialog.getByTestId('antenna-array-power'), dialog.getByRole('button', { name: 'Cancel', exact: true }), dialog.getByRole('button', { name: 'Apply', exact: true })]) await onScreen(control, page)
    await apply(dialog)
    await expect(metric(page, 'relay-dsn-range')).toHaveText('118.9 Gm')
    await planner(page).getByRole('button', { name: 'Close', exact: true }).click()
    expect(await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, x: scrollX, y: scrollY }))).toEqual({ ...viewport, x: 0, y: 0 })
  })
}
