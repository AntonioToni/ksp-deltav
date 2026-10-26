import { readFile } from 'node:fs/promises'
import { expect, test, type Locator, type Page } from '@playwright/test'
import type { PlanetPack } from '../src/types/planner'
import { missionModeButton } from './helpers/missionMode'

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const atmosphereButton = (page: Page) => button(page, 'Atmospheric assistance')
const editor = (page: Page) => page.getByRole('dialog', { name: 'Atmospheric assistance', exact: true })
const state = (page: Page, id: string) => page.locator(`[data-node-id="${id}"]`)
const capture = (page: Page, body: string) => editor(page).getByRole('checkbox', { name: `Ideal capture at ${body}`, exact: true })
const landing = (page: Page, body: string) => editor(page).getByRole('checkbox', { name: `Atmospheric landing at ${body}`, exact: true })
const allowance = (page: Page, body: string) => editor(page).getByRole('spinbutton', { name: `Landing allowance at ${body}`, exact: true })
const apply = (page: Page) => editor(page).getByRole('button', { name: 'Apply', exact: true })
const panel = (page: Page) => page.getByRole('region', { name: 'Maneuver breakdown panel', exact: true })
const total = (page: Page) => page.getByTestId('route-total')

let browserErrors: string[]

test.beforeEach(async ({ page }) => {
  browserErrors = []
  page.on('pageerror', error => browserErrors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()) })
  await page.goto('./')
  await expect(atmosphereButton(page)).toBeVisible()
})

test.afterEach(() => {
  expect(browserErrors, 'Atmospheric options should not produce browser exceptions or console errors').toEqual([])
})

async function planDuna(page: Page) {
  await state(page, 'stock:kerbin:surface').click()
  await state(page, 'stock:duna:surface').click()
  await expect(total(page)).toHaveText('6,540 m/s')
}

async function openEditor(page: Page) {
  await atmosphereButton(page).click()
  await expect(editor(page)).toBeVisible()
}

async function dunaAssistance(page: Page) {
  await openEditor(page)
  await capture(page, 'Duna').check()
  await landing(page, 'Duna').check()
  await allowance(page, 'Duna').fill('100')
  await apply(page).click()
  await expect(editor(page)).not.toBeVisible()
}

async function reserve(page: Page, percent: 0 | 20 | 100) {
  const slider = page.getByRole('slider', { name: 'Redundancy', exact: true })
  await slider.focus()
  await slider.press(percent === 100 ? 'End' : 'Home')
  if (percent === 20) for (let index = 0; index < 4; index++) await slider.press('ArrowRight')
}

async function onScreen(locator: Locator, page: Page) {
  const bounds = await locator.boundingBox()
  const viewport = page.viewportSize()
  expect(bounds).not.toBeNull()
  expect(viewport).not.toBeNull()
  if (!bounds || !viewport) return
  expect(bounds.x).toBeGreaterThanOrEqual(-1)
  expect(bounds.y).toBeGreaterThanOrEqual(-1)
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width + 1)
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height + 1)
}

async function pageFits(page: Page) {
  expect(await page.evaluate(() => ({
    width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight,
    viewportWidth: innerWidth, viewportHeight: innerHeight, x: scrollX, y: scrollY,
  }))).toEqual({
    width: page.viewportSize()!.width, height: page.viewportSize()!.height,
    viewportWidth: page.viewportSize()!.width, viewportHeight: page.viewportSize()!.height, x: 0, y: 0,
  })
}

test('keeps the reference budget by default and applies only the selected ideal capture burns', async ({ page }) => {
  await planDuna(page)
  await expect(page.getByLabel('Show breakdown', { exact: true })).not.toBeChecked()
  await expect(page.locator('[data-aerobraking-edge][data-assisted="true"]')).toHaveCount(0)
  await openEditor(page)
  await expect(capture(page, 'Duna')).not.toBeChecked()
  await expect(landing(page, 'Duna')).not.toBeChecked()
  await capture(page, 'Duna').check()
  await expect(total(page)).toHaveText('6,540 m/s')
  await apply(page).click()
  await expect(total(page)).toHaveText('5,930 m/s')
  await expect(page.getByTestId('atmospheric-reference')).toContainText('6,540')
  await expect(page.getByTestId('atmospheric-change')).toContainText('610')
  await page.getByLabel('Show breakdown', { exact: true }).check()
  const rows = panel(page).getByRole('listitem')
  await expect(rows.filter({ hasText: 'Duna elliptical orbit' })).toContainText('0 m/s')
  await expect(rows.filter({ hasText: 'Duna low orbit' })).toContainText('0 m/s')
  await expect(rows.filter({ hasText: 'Duna surface' })).toContainText('1,450 m/s')
  await expect(panel(page).locator('[data-assisted="true"]')).toHaveCount(2)
  const highlighted = page.locator('[data-edge-id="stock:duna:encounter->stock:duna:elliptical"][data-route-edge="true"]')
  await expect(highlighted.locator('title')).toContainText('0')
  await expect(highlighted.locator('title')).toContainText('250')
})

test('uses an entered landing allowance and applies the mission reserve once after assistance', async ({ page }) => {
  await planDuna(page)
  await dunaAssistance(page)
  await expect(total(page)).toHaveText('4,580 m/s')
  await expect(page.getByTestId('atmospheric-reference')).toContainText('6,540')
  await expect(page.getByTestId('atmospheric-change')).toContainText('1,960')
  await reserve(page, 20)
  await expect(total(page)).toHaveText('5,496 m/s')
  await expect(page.getByTestId('route-base')).toHaveText('4,580 m/s')
  await expect(page.getByTestId('route-margin')).toHaveText('+916 m/s')
  await page.getByLabel('Show breakdown', { exact: true }).check()
  const descent = panel(page).getByRole('listitem').filter({ hasText: 'Duna surface' })
  await expect(descent).toContainText('100 m/s')
  await expect(descent).toHaveAttribute('data-assisted', 'true')
})

test('preserves the Duna ascent cost for return-only and round-trip missions', async ({ page }) => {
  await planDuna(page)
  await dunaAssistance(page)
  await missionModeButton(page, 'round-trip').click()
  await expect(total(page)).toHaveText('11,120 m/s')
  await page.getByLabel('Show breakdown', { exact: true }).check()
  await page.getByRole('tab', { name: 'Return', exact: true }).click()
  await expect(page.getByTestId('leg-total')).toHaveText('6,540 m/s')
  await expect(panel(page).getByRole('listitem').first()).toContainText('1,450 m/s')
  await missionModeButton(page, 'return-only').click()
  await expect(total(page)).toHaveText('6,540 m/s')
  await button(page, 'Swap origin and destination').click()
  await expect(total(page)).toHaveText('4,580 m/s')
})

test('requires an explicit finite landing allowance and supports both zero and larger user budgets', async ({ page }) => {
  await planDuna(page)
  await openEditor(page)
  await landing(page, 'Duna').check()
  await expect(allowance(page, 'Duna')).toHaveValue('')
  await expect(apply(page)).toBeDisabled()
  for (const value of ['-1', '1000001']) {
    await allowance(page, 'Duna').fill(value)
    await expect(apply(page)).toBeDisabled()
  }
  await allowance(page, 'Duna').fill('2000')
  await apply(page).click()
  await expect(total(page)).toHaveText('7,090 m/s')
  await expect(page.getByTestId('atmospheric-change')).toContainText('550')
  await openEditor(page)
  await allowance(page, 'Duna').fill('0')
  await apply(page).click()
  await expect(total(page)).toHaveText('5,090 m/s')
})

test('discards staged changes on Cancel and Escape and restores keyboard focus', async ({ page }) => {
  await planDuna(page)
  await atmosphereButton(page).focus()
  await atmosphereButton(page).press('Enter')
  await capture(page, 'Duna').check()
  await editor(page).getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(total(page)).toHaveText('6,540 m/s')
  await openEditor(page)
  await expect(capture(page, 'Duna')).not.toBeChecked()
  await capture(page, 'Duna').check()
  await page.keyboard.press('Escape')
  await expect(editor(page)).not.toBeVisible()
  await expect(atmosphereButton(page)).toBeFocused()
  await expect(total(page)).toHaveText('6,540 m/s')
})

test('retains bundled moon-return transfer costs while replacing only the entered Kerbin landing allowance', async ({ page }) => {
  await state(page, 'stock:mun:surface').click()
  await state(page, 'stock:kerbin:surface').click()
  await expect(total(page)).toHaveText('5,120 m/s')
  await openEditor(page)
  await capture(page, 'Kerbin').check()
  await apply(page).click()
  await expect(total(page)).toHaveText('5,120 m/s')
  await openEditor(page)
  await landing(page, 'Kerbin').check()
  await allowance(page, 'Kerbin').fill('100')
  await apply(page).click()
  await expect(total(page)).toHaveText('1,820 m/s')
  await page.getByLabel('Show breakdown', { exact: true }).check()
  const transfer = panel(page).getByRole('listitem').filter({ hasText: 'Kerbin low orbit' })
  await expect(transfer).toContainText('860 m/s')
  await expect(transfer).not.toHaveAttribute('data-assisted', 'true')
  await expect(page.locator('[data-aerobraking-edge="stock:mun:encounter->stock:kerbin:orbit"]')).not.toHaveAttribute('data-assisted', 'true')
})

test('retains shared body choices across Stock and OPM and resets them through Clear and incompatible packs', async ({ page }) => {
  await planDuna(page)
  await dunaAssistance(page)
  await button(page, 'OPM').click()
  await expect(total(page)).toHaveText('4,580 m/s')
  await openEditor(page)
  await expect(capture(page, 'Duna')).toBeChecked()
  await expect(allowance(page, 'Duna')).toHaveValue('100')
  await expect(capture(page, 'Sarnus')).toBeVisible()
  await expect(landing(page, 'Sarnus')).toHaveCount(0)
  await editor(page).getByRole('button', { name: 'Cancel', exact: true }).click()
  await button(page, 'Reset mission').click()
  await openEditor(page)
  await expect(capture(page, 'Duna')).not.toBeChecked()
  await capture(page, 'Duna').check()
  await apply(page).click()
  await button(page, 'RSS').click()
  await button(page, 'Stock').click()
  await openEditor(page)
  await expect(capture(page, 'Duna')).not.toBeChecked()
})

test('exports source costs unchanged after applying atmospheric adjustments', async ({ page }) => {
  await planDuna(page)
  await dunaAssistance(page)
  await button(page, 'Custom planet packs').click()
  const manager = page.getByRole('dialog', { name: 'Planet packs', exact: true })
  const downloading = page.waitForEvent('download')
  await manager.getByRole('button', { name: 'Export current pack', exact: true }).click()
  const download = await downloading
  const file = await download.path()
  expect(file).not.toBeNull()
  if (!file) throw new Error('Exported reference pack is missing')
  const pack = JSON.parse(await readFile(file, 'utf8')) as PlanetPack
  expect(pack.maneuvers.find(edge => edge.id === 'stock:duna:encounter->stock:duna:elliptical')?.deltaV).toBe(250)
  expect(pack.maneuvers.find(edge => edge.id === 'stock:duna:elliptical->stock:duna:orbit')?.deltaV).toBe(360)
  expect(pack.maneuvers.find(edge => edge.id === 'stock:duna:orbit->stock:duna:surface')?.deltaV).toBe(1450)
})

test('respects imported atmosphere support metadata without inventing assistance options', async ({ page }) => {
  const pack = JSON.parse(await readFile('docs/examples/custom-pack.json', 'utf8')) as PlanetPack
  pack.bodies = pack.bodies.map(body => body.id === 'example:haven'
    ? { ...body, hasAtmosphere: true, supportsAtmosphericBraking: false } : body)
  await button(page, 'Custom planet packs').click()
  const manager = page.getByRole('dialog', { name: 'Planet packs', exact: true })
  await manager.getByLabel('Import planet pack', { exact: true }).setInputFiles({
    name: 'unsupported-atmosphere.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(pack)),
  })
  await manager.getByRole('button', { name: `Use ${pack.name}`, exact: true }).click()
  await openEditor(page)
  await expect(editor(page).getByRole('checkbox')).toHaveCount(0)
  await expect(editor(page).getByText('This pack has no supported standalone atmospheric capture or landing maneuvers.', { exact: true })).toBeVisible()
  await expect(apply(page)).toBeEnabled()
})

test('excludes unmodeled RSS atmospheres and applies an Earth landing allowance only on the return', async ({ page }) => {
  await button(page, 'RSS').click()
  await state(page, 'rss:earth:surface').click()
  await state(page, 'rss:moon:surface').click()
  await expect(total(page)).toHaveText('14,660 m/s')
  await openEditor(page)
  await expect(capture(page, 'Pluto')).toHaveCount(0)
  await expect(capture(page, 'Triton')).toHaveCount(0)
  await expect(landing(page, 'Pluto')).toHaveCount(0)
  await landing(page, 'Earth').check()
  await allowance(page, 'Earth').fill('200')
  await apply(page).click()
  await expect(total(page)).toHaveText('14,660 m/s')
  await missionModeButton(page, 'return-only').click()
  await expect(total(page)).toHaveText('5,860 m/s')
})

for (const viewport of [
  { width: 320, height: 568 }, { width: 390, height: 844 },
  { width: 667, height: 375 }, { width: 700, height: 900 },
]) {
  test(`keeps atmospheric options and assisted mission controls within ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await planDuna(page)
    await openEditor(page)
    await onScreen(editor(page), page)
    for (const name of ['Apply', 'Cancel', 'Disable all']) await onScreen(editor(page).getByRole('button', { name, exact: true }), page)
    await capture(page, 'Duna').check()
    await landing(page, 'Duna').check()
    await allowance(page, 'Duna').fill('100')
    await apply(page).click()
    await expect(total(page)).toHaveText('4,580 m/s')
    await missionModeButton(page, 'round-trip').click()
    await reserve(page, 100)
    await page.getByLabel('Show breakdown', { exact: true }).check()
    await onScreen(atmosphereButton(page), page)
    await onScreen(panel(page), page)
    await onScreen(page.getByTestId('atmospheric-reference'), page)
    await onScreen(page.getByTestId('atmospheric-change'), page)
    const panelBounds = await panel(page).boundingBox()
    const footerBounds = await page.getByRole('contentinfo').boundingBox()
    expect(panelBounds).not.toBeNull()
    expect(footerBounds).not.toBeNull()
    if (panelBounds && footerBounds) expect(panelBounds.y + panelBounds.height).toBeLessThanOrEqual(footerBounds.y + 1)
    const geometry = await page.locator('svg[aria-label$="system Delta-V state map"]').evaluate(element => {
      const bounds = element.getBoundingClientRect()
      return [...element.querySelectorAll('[data-node-id]')].map(node => {
        const rect = node.getBoundingClientRect()
        return rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1 && rect.top >= bounds.top - 1 && rect.bottom <= bounds.bottom + 1
      })
    })
    expect(geometry).toHaveLength(50)
    expect(geometry.every(Boolean)).toBe(true)
    await pageFits(page)
    const favicon = page.locator('link[rel="icon"]')
    const path = await favicon.getAttribute('href')
    expect(path).toBeTruthy()
    const response = await page.request.get(new URL(path!, page.url()).href)
    expect(response.status()).toBe(200)
    const svg = await response.text()
    expect(svg).toContain('KSP DeltaV Planner')
    expect(svg).not.toContain('#863bff')
  })
}
