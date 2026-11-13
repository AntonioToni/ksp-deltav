import { readFile } from 'node:fs/promises'
import { expect, test, type Locator, type Page } from '@playwright/test'
import type { PlanetPack } from '../src/types/planner'
import { stockKcalbelohPack } from '../src/data/kcalbeloh'
import { missionModeButton } from './helpers/missionMode'

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const manager = (page: Page) => page.getByRole('dialog', { name: 'Planet packs', exact: true })
const wormholes = (page: Page) => manager(page).getByRole('switch', { name: 'Wormholes', exact: true })
const choices = (page: Page) => manager(page).getByRole('list', { name: 'Built-in planet configurations', exact: true }).getByRole('listitem')
const state = (page: Page, id: string) => page.locator(`[data-node-id="${id}"]`)
const total = (page: Page) => page.getByTestId('route-total')
const status = (page: Page) => page.getByTestId('route-status')
const allowances = (page: Page) => page.getByRole('dialog', { name: 'Link allowances', exact: true })
const wormholeLink = 'Jool low orbit ↔ Sera low orbit via wormhole'
const localLink = 'Kcalbeloh reference ↔ Rouqea low orbit'
const field = (page: Page, label: string, direction: 'Forward' | 'Reverse' = 'Forward') =>
  allowances(page).getByRole('spinbutton', { name: `${direction} allowance for ${label}`, exact: true })
let browserErrors: string[]

test.beforeEach(async ({ page }) => {
  browserErrors = []
  page.on('pageerror', error => browserErrors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()) })
  await page.goto('./')
  await expect(button(page, 'Custom planet packs')).toBeVisible()
})

test.afterEach(() => {
  expect(browserErrors, 'Installation settings should not produce browser errors').toEqual([])
})

async function openAddons(page: Page) {
  await button(page, 'Custom planet packs').click()
  await manager(page).getByRole('tab', { name: 'Add-ons', exact: true }).click()
}

async function useConfiguration(page: Page, enabled = false, base: 'Stock' | 'OPM' = 'Stock') {
  await openAddons(page)
  await wormholes(page).setChecked(enabled)
  const name = `${base} + Kcalbeloh${enabled ? '' : ' (wormholes off)'}`
  await manager(page).getByRole('button', { name: `Use ${name}`, exact: true }).click()
  await expect(manager(page)).not.toBeVisible()
}

async function view(page: Page, name: string) {
  await page.getByRole('combobox', { name: 'Map view', exact: true }).click()
  await page.getByRole('option', { name, exact: true }).click()
}

async function select(page: Page, id: string) {
  if (await state(page, id).count() === 0) {
    const bodyId = id.slice(0, id.lastIndexOf(':'))
    const region = stockKcalbelohPack.mapRegions!.find(region => region.bodyIds.includes(bodyId))
    await view(page, region?.label ?? 'Kerbol system')
  }
  await state(page, id).click()
}

async function plan(page: Page, from: string, to: string) {
  await select(page, from)
  await select(page, to)
}

async function addStop(page: Page, label: string) {
  await button(page, 'Edit mission stops').click()
  const editor = page.getByRole('dialog', { name: /^Mission stops\b/ })
  await editor.getByRole('combobox', { name: 'Choose a stop', exact: true }).fill(label)
  await page.getByRole('option', { name: label, exact: true }).click()
  await editor.getByRole('button', { name: 'Add stop', exact: true }).click()
  await editor.getByRole('button', { name: 'Done', exact: true }).click()
}

async function openAllowances(page: Page) {
  if (await button(page, 'Link allowances').isVisible()) await button(page, 'Link allowances').click()
  else {
    await openAddons(page)
    await manager(page).getByRole('button', { name: 'Link allowances', exact: true }).click()
  }
  await expect(allowances(page)).toBeVisible()
}

async function applyAllowances(page: Page) {
  await allowances(page).getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(allowances(page)).not.toBeVisible()
}

async function onScreen(locator: Locator, page: Page) {
  await expect(locator).toBeVisible()
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
  expect(await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, x: scrollX, y: scrollY })))
    .toEqual({ ...page.viewportSize()!, x: 0, y: 0 })
}

test('keeps installation changes in a draft until a configuration is chosen', async ({ page }) => {
  await plan(page, 'stock:kerbin:surface', 'stock:mun:surface')
  await openAddons(page)
  await expect(wormholes(page)).toBeChecked()
  await expect(choices(page)).toHaveCount(2)
  await wormholes(page).uncheck()
  await expect(choices(page)).toHaveCount(2)
  await expect(manager(page).getByRole('button', { name: 'Use Stock + Kcalbeloh (wormholes off)', exact: true })).toBeVisible()
  await expect(total(page)).toHaveText('5,120 m/s')
  await manager(page).getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Map view', exact: true })).toHaveCount(0)
  await expect(total(page)).toHaveText('5,120 m/s')
  await openAddons(page)
  await expect(wormholes(page)).toBeChecked()
  await wormholes(page).uncheck()
  await manager(page).getByRole('button', { name: 'Use Stock + Kcalbeloh (wormholes off)', exact: true }).click()
  await expect(total(page)).toHaveText('5,120 m/s')
  await openAddons(page)
  await expect(wormholes(page)).not.toBeChecked()
  await expect(manager(page).getByRole('button', { name: 'Use Stock + Kcalbeloh (wormholes off)', exact: true })).toHaveText('Active')
})

test('retains disabled wormholes across Stock and OPM while RSS returns to its base dataset', async ({ page }) => {
  await useConfiguration(page)
  await plan(page, 'stock:kerbin:surface', 'stock:mun:surface')
  await button(page, 'OPM').click()
  await expect(button(page, 'OPM')).toHaveAttribute('aria-pressed', 'true')
  await expect(total(page)).toHaveText('5,120 m/s')
  await view(page, 'All systems')
  await expect(page.locator('[data-node-id]')).toHaveCount(143)
  await openAddons(page)
  await expect(wormholes(page)).not.toBeChecked()
  await expect(manager(page).getByRole('button', { name: 'Use OPM + Kcalbeloh (wormholes off)', exact: true })).toHaveText('Active')
  await manager(page).getByRole('button', { name: 'Done', exact: true }).click()
  await button(page, 'Stock').click()
  await view(page, 'All systems')
  await expect(page.locator('[data-node-id]')).toHaveCount(97)
  await expect(total(page)).toHaveText('5,120 m/s')
  await openAddons(page)
  await expect(wormholes(page)).not.toBeChecked()
  await manager(page).getByRole('button', { name: 'Done', exact: true }).click()
  await button(page, 'RSS').click()
  await expect(button(page, 'RSS')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('combobox', { name: 'Map view', exact: true })).toHaveCount(0)
})

test('keeps published local missions, ordered stops, and return modes usable with wormholes off', async ({ page }) => {
  await useConfiguration(page)
  await plan(page, 'kcalbeloh:suluco:surface', 'kcalbeloh:tot:surface')
  await expect(total(page)).toHaveText('3,931 m/s')
  await addStop(page, 'Suluco low orbit')
  await expect(state(page, 'kcalbeloh:suluco:orbit')).toHaveAttribute('data-waypoint-indexes', '1')
  await expect(total(page)).toHaveText('3,931 m/s')
  await expect(page.locator('[data-route-animation="true"]')).toBeVisible()
  await missionModeButton(page, 'round-trip').click()
  await expect(total(page)).toHaveText('7,862 m/s')
  await missionModeButton(page, 'return-only').click()
  await expect(total(page)).toHaveText('3,931 m/s')
  await page.getByLabel('Show breakdown', { exact: true }).check()
  await expect(page.getByTestId('stage-position')).toHaveText('1 / 2')
})

test('explains disconnected cross-system routes including an off-system intermediate stop', async ({ page }) => {
  await useConfiguration(page)
  await plan(page, 'stock:kerbin:surface', 'kcalbeloh:sera:surface')
  await expect(total(page)).toHaveCount(0)
  await expect(status(page)).toContainText('Wormholes are disabled')
  await expect(button(page, 'Link allowances')).toHaveCount(0)
  await button(page, 'Reset mission').click()
  await plan(page, 'stock:kerbin:surface', 'stock:mun:surface')
  await expect(total(page)).toHaveText('5,120 m/s')
  await addStop(page, 'Sera surface')
  await expect(total(page)).toHaveCount(0)
  await expect(status(page)).toContainText('Wormholes are disabled')
  await expect(button(page, 'Link allowances')).toHaveCount(0)
  await missionModeButton(page, 'return-only').click()
  await expect(status(page)).toContainText('Wormholes are disabled')
  await expect(total(page)).toHaveCount(0)
})

test('retains local allowances but requires a new wormhole budget after disabling and reenabling portals', async ({ page }) => {
  await useConfiguration(page, true)
  await openAllowances(page)
  await field(page, localLink).fill('400')
  await field(page, localLink, 'Reverse').fill('500')
  await field(page, wormholeLink).fill('1000')
  await field(page, wormholeLink, 'Reverse').fill('2000')
  await applyAllowances(page)
  await useConfiguration(page)
  await openAllowances(page)
  await expect(field(page, wormholeLink)).toHaveCount(0)
  await expect(field(page, localLink)).toHaveValue('400')
  await expect(field(page, localLink, 'Reverse')).toHaveValue('500')
  await allowances(page).getByRole('button', { name: 'Cancel', exact: true }).click()
  await useConfiguration(page, true)
  await openAllowances(page)
  await expect(field(page, wormholeLink)).toHaveValue('')
  await expect(field(page, wormholeLink, 'Reverse')).toHaveValue('')
  await expect(field(page, localLink)).toHaveValue('400')
  await allowances(page).getByRole('button', { name: 'Cancel', exact: true }).click()
  await plan(page, 'stock:kerbin:surface', 'kcalbeloh:sera:surface')
  await expect(total(page)).toHaveCount(0)
  await expect(button(page, 'Link allowances')).toBeVisible()
  await openAllowances(page)
  await field(page, wormholeLink).fill('1000')
  await applyAllowances(page)
  await expect(total(page)).toHaveText('12,900 m/s')
})

test('exports the portal-free topology and imports it only after choosing a custom pack ID', async ({ page }) => {
  await useConfiguration(page)
  await openAddons(page)
  await manager(page).getByRole('tab', { name: 'Custom packs', exact: true }).click()
  const downloading = page.waitForEvent('download')
  await manager(page).getByRole('button', { name: 'Export current pack', exact: true }).click()
  const path = await (await downloading).path()
  if (!path) throw new Error('Exported configuration is missing')
  const exported = JSON.parse(await readFile(path, 'utf8')) as PlanetPack
  expect(exported.id).toBe('stock-kcalbeloh-no-wormholes')
  expect(exported.bodies).toHaveLength(48)
  expect(exported.nodes).toHaveLength(97)
  expect(exported.maneuvers).toHaveLength(292)
  expect(exported.maneuvers.filter(edge => edge.directTransfer)).toHaveLength(88)
  expect(exported.maneuvers.find(edge => edge.from === 'stock:duna:orbit' && edge.to === 'stock:eve:elliptical'))
    .toMatchObject({ directTransfer: true, deltaV: 1428 })
  expect(exported.unpricedConnections).toHaveLength(9)
  expect(exported.bodies.some(body => body.kind === 'wormhole')).toBe(false)
  expect(exported.mapRegions!.flatMap(region => region.bodyIds).some(id => id.startsWith('kcalbeloh:wh'))).toBe(false)
  expect(exported.unpricedConnections!.some(connection => connection.forwardKind === 'wormhole' || connection.reverseKind === 'wormhole')).toBe(false)
  const file = (pack: PlanetPack) => ({ name: 'kcalbeloh.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(pack)) })
  const input = manager(page).getByLabel('Import planet pack', { exact: true })
  await input.setInputFiles(file(exported))
  await expect(manager(page).getByRole('alert')).toContainText('reserved')
  const custom = {
    ...exported, id: 'community-kcalbeloh-no-wormholes', name: 'My wormhole-free Kcalbeloh', shortName: 'Kcal no WH',
    maneuvers: exported.maneuvers.map((edge, index) => index < 2
      ? { ...edge, id: index === 0 ? 'allowance:kcalbeloh:connect-black-hole:forward' : 'connectivity-probe:0' }
      : edge),
  }
  await input.setInputFiles(file(custom))
  await manager(page).getByRole('button', { name: 'Use My wormhole-free Kcalbeloh', exact: true }).click()
  await plan(page, 'kcalbeloh:suluco:surface', 'kcalbeloh:tot:surface')
  await expect(total(page)).toHaveText('3,931 m/s')
  await button(page, 'Reset mission').click()
  await plan(page, 'stock:kerbin:surface', 'kcalbeloh:sera:surface')
  await expect(total(page)).toHaveCount(0)
  await expect(status(page)).toContainText('The selected planet pack cannot calculate a route between these map points.')
  await expect(status(page)).not.toContainText('Wormholes are disabled')
  await expect(button(page, 'Link allowances')).toHaveCount(0)
})

for (const viewport of [{ width: 320, height: 568 }, { width: 667, height: 375 }]) {
  test(`keeps the installation setting and configuration actions usable at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await openAddons(page)
    await onScreen(wormholes(page), page)
    await wormholes(page).uncheck()
    await expect(choices(page)).toHaveCount(2)
    const use = manager(page).getByRole('button', { name: 'Use Stock + Kcalbeloh (wormholes off)', exact: true })
    await use.scrollIntoViewIfNeeded()
    await onScreen(use, page)
    await onScreen(manager(page).getByRole('button', { name: 'Done', exact: true }), page)
    await use.click()
    await expect(page.getByRole('combobox', { name: 'Map view', exact: true })).toBeVisible()
    await pageFits(page)
    await openAddons(page)
    await expect(wormholes(page)).not.toBeChecked()
    await manager(page).getByRole('button', { name: 'Done', exact: true }).click()
    await pageFits(page)
  })
}
