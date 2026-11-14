import { expect, test, type Page } from '@playwright/test'
import { stockPack } from '../src/data/stock'
import { missionModeButton } from './helpers/missionMode'

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const node = (page: Page, id: string) => page.locator(`[data-node-id="${id}"]`)
const total = (page: Page) => page.getByTestId('route-total')
const atmosphere = (page: Page) => page.getByRole('dialog', { name: 'Atmospheric assistance', exact: true })
const landing = (page: Page) => atmosphere(page).getByRole('checkbox', { name: 'Atmospheric landing at Kerbin', exact: true })
const capture = (page: Page) => atmosphere(page).getByRole('checkbox', { name: 'Ideal capture at Kerbin', exact: true })
const allowance = (page: Page) => atmosphere(page).getByRole('spinbutton', { name: 'Landing allowance at Kerbin', exact: true })
const information = (page: Page) => page.getByRole('dialog', { name: 'About these estimates', exact: true })
const summary = (page: Page, kind: string) => information(page).locator(`[data-budget-summary-kind="${kind}"]`)
const manager = (page: Page) => page.getByRole('dialog', { name: 'Planet packs', exact: true })
const rows = (page: Page) => page.getByRole('list', { name: 'Maneuver breakdown', exact: true }).getByRole('listitem')
let browserErrors: string[]

test.beforeEach(async ({ page }) => {
  browserErrors = []
  page.on('pageerror', error => browserErrors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()) })
  await page.goto('./')
  await expect(button(page, 'Atmospheric assistance')).toBeVisible()
})

test.afterEach(() => {
  expect(browserErrors, 'Kerbin re-entry planning should not produce browser errors').toEqual([])
})

async function plan(page: Page, from: string, to: string) {
  await node(page, from).click()
  await node(page, to).click()
}

async function editAtmosphere(page: Page) {
  await button(page, 'Atmospheric assistance').click()
  await expect(atmosphere(page)).toBeVisible()
}

async function apply(page: Page) {
  await atmosphere(page).getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(atmosphere(page)).toBeHidden()
}

async function openInformation(page: Page) {
  await button(page, 'Budget assumptions').click()
  await expect(information(page)).toBeVisible()
}

test('defaults only Kerbin landing to atmospheric re-entry and keeps launch and orbital capture costs', async ({ page }) => {
  await expect(button(page, 'Atmospheric assistance')).toHaveAttribute('aria-pressed', 'true')
  await editAtmosphere(page)
  await expect(landing(page)).toBeChecked()
  await expect(allowance(page)).toHaveValue('0')
  await expect(capture(page)).not.toBeChecked()
  await expect(atmosphere(page).getByRole('checkbox', { name: 'Atmospheric landing at Duna', exact: true })).not.toBeChecked()
  await atmosphere(page).getByRole('button', { name: 'Cancel', exact: true }).click()

  await plan(page, 'stock:kerbin:surface', 'stock:mun:surface')
  await expect(total(page)).toHaveText('5,120 m/s')
  await missionModeButton(page, 'return-only').click()
  await expect(total(page)).toHaveText('1,720 m/s')
  await page.getByLabel('Show breakdown', { exact: true }).check()
  await expect(rows(page).first()).toContainText('580 m/s')
  await expect(rows(page).filter({ hasText: 'Kerbin low orbit' })).toContainText('860 m/s')
  await expect(rows(page).last()).toContainText('0 m/s')
  await expect(rows(page).last()).toHaveAttribute('data-budget-basis', 'ideal')
  await missionModeButton(page, 'round-trip').click()
  await expect(total(page)).toHaveText('6,840 m/s')

  await button(page, 'Reset mission').click()
  await plan(page, 'stock:kerbin:encounter', 'stock:kerbin:surface')
  await expect(total(page)).toHaveText('950 m/s')
  await openInformation(page)
  await expect(summary(page, 'ideal')).toContainText('Atmospheric reentry')
  await expect(summary(page, 'ideal')).toContainText('0 m/s')
  await expect(summary(page, 'reference')).toContainText('950 m/s')
  await expect(summary(page, 'user')).toHaveCount(0)
})

test('distinguishes the default assumption from manual zero, preserves overrides, and restores the default on Clear', async ({ page }) => {
  await plan(page, 'stock:kerbin:orbit', 'stock:kerbin:surface')
  await expect(total(page)).toHaveText('0 m/s')
  await editAtmosphere(page)
  await allowance(page).fill('120')
  await apply(page)
  await expect(total(page)).toHaveText('120 m/s')
  await openInformation(page)
  await expect(summary(page, 'user')).toContainText('120 m/s')
  await expect(summary(page, 'ideal')).toHaveCount(0)
  await information(page).getByRole('button', { name: 'Close', exact: true }).click()
  await editAtmosphere(page)
  await allowance(page).fill('0')
  await apply(page)
  await openInformation(page)
  await expect(summary(page, 'user')).toContainText('0 m/s')
  await expect(summary(page, 'ideal')).toHaveCount(0)
  await information(page).getByRole('button', { name: 'Close', exact: true }).click()
  await editAtmosphere(page)
  await landing(page).uncheck()
  await apply(page)
  await expect(total(page)).toHaveText('3,400 m/s')
  await button(page, 'OPM').click()
  await expect(total(page)).toHaveText('3,400 m/s')
  await button(page, 'Stock').click()
  await expect(total(page)).toHaveText('3,400 m/s')
  await editAtmosphere(page)
  await expect(landing(page)).not.toBeChecked()
  await atmosphere(page).getByRole('button', { name: 'Cancel', exact: true }).click()
  await button(page, 'Reset mission').click()
  await plan(page, 'stock:kerbin:orbit', 'stock:kerbin:surface')
  await expect(total(page)).toHaveText('0 m/s')
  await openInformation(page)
  await expect(summary(page, 'ideal')).toContainText('Atmospheric reentry')
  await expect(summary(page, 'user')).toHaveCount(0)
})

test('keeps the default in built-in Kerbin configurations without applying it to RSS or imported packs', async ({ page }) => {
  await plan(page, 'stock:kerbin:orbit', 'stock:kerbin:surface')
  await button(page, 'OPM').click()
  await expect(total(page)).toHaveText('0 m/s')
  for (const configuration of ['Stock + Kcalbeloh', 'OPM + Kcalbeloh']) {
    await button(page, 'Custom planet packs').click()
    await manager(page).getByRole('tab', { name: 'Add-ons', exact: true }).click()
    await manager(page).getByRole('button', { name: `Use ${configuration}`, exact: true }).click()
    await expect(total(page)).toHaveText('0 m/s')
  }
  await button(page, 'RSS').click()
  await expect(button(page, 'Atmospheric assistance')).toHaveAttribute('aria-pressed', 'false')
  await plan(page, 'rss:earth:orbit', 'rss:earth:surface')
  await expect(total(page)).toHaveText('9,000 m/s')

  await button(page, 'Stock').click()
  await plan(page, 'stock:kerbin:orbit', 'stock:kerbin:surface')
  await expect(total(page)).toHaveText('0 m/s')
  const custom = { ...stockPack, id: 'custom:kerbin-reference', name: 'Imported Kerbin reference' }
  await button(page, 'Custom planet packs').click()
  await manager(page).getByRole('tab', { name: 'Custom packs', exact: true }).click()
  await manager(page).getByLabel('Import planet pack', { exact: true }).setInputFiles({
    name: 'kerbin-reference.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(custom)),
  })
  await manager(page).getByRole('button', { name: `Use ${custom.name}`, exact: true }).click()
  await expect(total(page)).toHaveText('3,400 m/s')
  await expect(button(page, 'Atmospheric assistance')).toHaveAttribute('aria-pressed', 'false')
  await editAtmosphere(page)
  await expect(landing(page)).not.toBeChecked()
})

test('applies the assumption to each ordered Kerbin landing while retaining every ascent', async ({ page }) => {
  await plan(page, 'stock:kerbin:orbit', 'stock:kerbin:orbit')
  await button(page, 'Edit mission stops').click()
  const stops = page.getByRole('dialog', { name: /^Mission stops\b/ })
  for (const label of ['Kerbin surface', 'Kerbin low orbit', 'Kerbin surface']) {
    await stops.getByRole('combobox', { name: 'Choose a stop', exact: true }).fill(label)
    await page.getByRole('option', { name: label, exact: true }).click()
    await stops.getByRole('button', { name: 'Add stop', exact: true }).click()
  }
  await stops.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(total(page)).toHaveText('6,800 m/s')
  await missionModeButton(page, 'round-trip').click()
  await expect(total(page)).toHaveText('13,600 m/s')
  await openInformation(page)
  await expect(summary(page, 'ideal')).toContainText('4 maneuvers')
  await expect(summary(page, 'ideal')).toContainText('0 m/s')
  await expect(summary(page, 'reference')).toContainText('4 maneuvers')
  await expect(summary(page, 'reference')).toContainText('13,600 m/s')
})

for (const viewport of [{ width: 320, height: 568 }, { width: 3440, height: 1440 }]) {
  test(`keeps the Kerbin landing assumption and its editor visible at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await plan(page, 'stock:kerbin:orbit', 'stock:kerbin:surface')
    await expect(total(page)).toHaveText('0 m/s')
    await expect(page.getByTestId('route-status')).toContainText(/Kerbin.*0 m\/s/i)
    await expect(button(page, 'Atmospheric assistance')).toBeInViewport({ ratio: 1 })
    await editAtmosphere(page)
    await allowance(page).scrollIntoViewIfNeeded()
    await expect(allowance(page)).toHaveValue('0')
    await expect(atmosphere(page).getByRole('button', { name: 'Apply', exact: true })).toBeInViewport({ ratio: 1 })
    expect(await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight })))
      .toEqual(viewport)
  })
}
