import { readFile } from 'node:fs/promises'
import { expect, test, type Locator, type Page } from '@playwright/test'
import type { PlanetPack } from '../src/types/planner'
import { stockKcalbelohPack } from '../src/data/kcalbeloh'
import { missionModeButton } from './helpers/missionMode'

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const state = (page: Page, id: string) => page.locator('[data-node-id="' + id + '"]')
const total = (page: Page) => page.getByTestId('route-total')
const manager = (page: Page) => page.getByRole('dialog', { name: 'Planet packs', exact: true })
const editor = (page: Page) => page.getByRole('dialog', { name: 'Link allowances', exact: true })
const map = (page: Page) => page.locator('[data-map-region]')
const wormhole = 'Jool low orbit ↔ Sera low orbit via wormhole'
const opmWormhole = 'Sarnus low orbit ↔ Sera low orbit via wormhole'
const blackHoleLink = 'Kcalbeloh reference ↔ Rouqea low orbit'
const sunorcLink = 'Sunorc reference ↔ Suluco low orbit'
const maelgLink = 'Maelg reference ↔ Mehtna low orbit'
const allowance = (page: Page, label: string, direction: 'Outbound' | 'Return' = 'Outbound') =>
  editor(page).getByRole('spinbutton', { name: direction + ' allowance for ' + label, exact: true })
let browserErrors: string[]

test.beforeEach(async ({ page }) => {
  browserErrors = []
  page.on('pageerror', error => browserErrors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()) })
  await page.goto('./')
  await expect(button(page, 'Custom planet packs')).toBeVisible()
})

test.afterEach(() => {
  expect(browserErrors, 'Kcalbeloh planning should not produce browser errors').toEqual([])
})

async function openManager(page: Page) {
  await button(page, 'Custom planet packs').click()
  await expect(manager(page)).toBeVisible()
}

async function useConfiguration(page: Page, name = 'Stock + Kcalbeloh') {
  await openManager(page)
  await manager(page).getByRole('tab', { name: 'Add-ons', exact: true }).click()
  await manager(page).getByRole('button', { name: 'Use ' + name, exact: true }).click()
  await expect(manager(page)).not.toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Map view', exact: true })).toBeVisible()
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

async function openAllowances(page: Page) {
  const shortcut = button(page, 'Link allowances')
  if (await shortcut.isVisible()) await shortcut.click()
  else {
    await openManager(page)
    await manager(page).getByRole('tab', { name: 'Add-ons', exact: true }).click()
    await manager(page).getByRole('button', { name: 'Link allowances', exact: true }).click()
  }
  await expect(editor(page)).toBeVisible()
}

async function apply(page: Page) {
  await editor(page).getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(editor(page)).not.toBeVisible()
}

async function enterLinks(page: Page, values: { label: string; forward: string; reverse?: string }[]) {
  await openAllowances(page)
  for (const row of values) {
    await allowance(page, row.label).fill(row.forward)
    if (row.reverse !== undefined) await allowance(page, row.label, 'Return').fill(row.reverse)
  }
  await apply(page)
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
  expect(await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, x: scrollX, y: scrollY })))
    .toEqual({ ...page.viewportSize()!, x: 0, y: 0 })
}

test('selects both compositions without crowding base selectors or changing a shared mission', async ({ page }) => {
  await plan(page, 'stock:kerbin:surface', 'stock:mun:surface')
  await expect(total(page)).toHaveText('5,120 m/s')
  await useConfiguration(page)
  await expect(total(page)).toHaveText('5,120 m/s')
  await expect(map(page)).toHaveAttribute('data-map-region', 'kerbol')
  await expect(button(page, 'Stock')).toHaveAttribute('aria-pressed', 'true')
  await button(page, 'OPM').click()
  await expect(button(page, 'OPM')).toHaveAttribute('aria-pressed', 'true')
  await expect(total(page)).toHaveText('5,120 m/s')
  await expect(state(page, 'opm:sarnus:orbit')).toBeVisible()
  await view(page, 'All systems')
  await expect(page.locator('[data-node-id]')).toHaveCount(143)
  await button(page, 'Stock').click()
  await expect(page.getByRole('combobox', { name: 'Map view', exact: true })).toBeVisible()
  await button(page, 'RSS').click()
  await expect(page.getByRole('combobox', { name: 'Map view', exact: true })).toHaveCount(0)
  await expect(button(page, 'RSS')).toHaveAttribute('aria-pressed', 'true')
})

test('plans published local pairs in every mission mode and applies the reserve once', async ({ page }) => {
  await useConfiguration(page)
  await plan(page, 'kcalbeloh:suluco:surface', 'kcalbeloh:tot:surface')
  await expect(total(page)).toHaveText('3,931 m/s')
  await expect(map(page)).toHaveAttribute('data-map-region', 'sunorc')
  await page.getByLabel('Show breakdown', { exact: true }).check()
  const rows = page.getByRole('list', { name: 'Maneuver breakdown', exact: true }).getByRole('listitem')
  await expect(rows).toHaveCount(3)
  await expect(rows.nth(1)).toContainText('988 m/s')
  await button(page, 'Close breakdown').click()
  await missionModeButton(page, 'return-only').click()
  await expect(total(page)).toHaveText('3,931 m/s')
  await missionModeButton(page, 'round-trip').click()
  await expect(total(page)).toHaveText('7,862 m/s')
  const reserve = page.getByRole('slider', { name: 'Redundancy', exact: true })
  await reserve.focus()
  for (let index = 0; index < 4; index++) await reserve.press('ArrowRight')
  await expect(total(page)).toHaveText('9,435 m/s')
})

test('leaves missing source links unavailable until each directional wormhole allowance is entered', async ({ page }) => {
  await useConfiguration(page)
  await plan(page, 'stock:kerbin:surface', 'kcalbeloh:sera:surface')
  await expect(total(page)).toHaveCount(0)
  await expect(button(page, 'Link allowances')).toBeVisible()
  await enterLinks(page, [{ label: wormhole, forward: '1000' }])
  // Kerbin surface→Jool parking8270 + complete gateway allowance1000 + Sera surface3630.
  await expect(total(page)).toHaveText('12,900 m/s')
  await view(page, 'All systems')
  await expect(page.locator('[data-route-edge="true"][data-edge-id="allowance:kcalbeloh:wormhole:forward"]')).toHaveCount(1)
  await missionModeButton(page, 'return-only').click()
  await expect(total(page)).toHaveCount(0)
  await openAllowances(page)
  await allowance(page, wormhole, 'Return').fill('2000')
  await apply(page)
  await expect(total(page)).toHaveText('13,900 m/s')
  await missionModeButton(page, 'round-trip').click()
  await expect(total(page)).toHaveText('26,800 m/s')
})

test('stages invalid, blank and explicit zero allowances without inventing a free connection', async ({ page }) => {
  await useConfiguration(page)
  await plan(page, 'kcalbeloh:kcalbeloh:reference', 'kcalbeloh:rouqea:orbit')
  await expect(total(page)).toHaveCount(0)
  await openAllowances(page)
  const field = allowance(page, blackHoleLink)
  for (const value of ['-1', '1000001']) {
    await field.fill(value)
    await expect(editor(page).getByRole('button', { name: 'Apply', exact: true })).toBeDisabled()
  }
  await field.fill('500')
  await editor(page).getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(total(page)).toHaveCount(0)
  await openAllowances(page)
  await expect(field).toHaveValue('')
  await field.fill('100')
  await page.keyboard.press('Escape')
  await expect(editor(page)).not.toBeVisible()
  await expect(total(page)).toHaveCount(0)
  await openAllowances(page)
  await field.fill('0')
  await apply(page)
  await expect(total(page)).toHaveText('0 m/s')
  await openAllowances(page)
  await expect(field).toHaveValue('0')
  await editor(page).getByRole('button', { name: 'Clear allowances', exact: true }).click()
  await expect(editor(page).getByTestId('link-allowance-count')).toHaveText('0')
  await editor(page).getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(total(page)).toHaveText('0 m/s')
  await openAllowances(page)
  await editor(page).getByRole('button', { name: 'Clear allowances', exact: true }).click()
  await apply(page)
  await expect(total(page)).toHaveCount(0)
})

test('keeps compatible allowances across compositions while resetting the relocated gateway budget', async ({ page }) => {
  await useConfiguration(page)
  await enterLinks(page, [
    { label: blackHoleLink, forward: '400', reverse: '500' },
    { label: wormhole, forward: '1000', reverse: '2000' },
  ])
  await button(page, 'OPM').click()
  await openAllowances(page)
  await expect(allowance(page, blackHoleLink)).toHaveValue('400')
  await expect(allowance(page, blackHoleLink, 'Return')).toHaveValue('500')
  await expect(allowance(page, opmWormhole)).toHaveValue('')
  await expect(allowance(page, opmWormhole, 'Return')).toHaveValue('')
  await expect(allowance(page, wormhole)).toHaveCount(0)
  await editor(page).getByRole('button', { name: 'Cancel', exact: true }).click()
  await openManager(page)
  await manager(page).getByRole('button', { name: 'Disable Kcalbeloh', exact: true }).click()
  await expect(button(page, 'OPM')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('combobox', { name: 'Map view', exact: true })).toHaveCount(0)
  await expect(page.locator('[data-node-id]')).toHaveCount(96)
})

test('exports reference data independently of session allowances and reimports a renamed composed pack', async ({ page }) => {
  await useConfiguration(page)
  await enterLinks(page, [{ label: wormhole, forward: '1000' }])
  await openManager(page)
  await manager(page).getByRole('tab', { name: 'Custom packs', exact: true }).click()
  const downloading = page.waitForEvent('download')
  await manager(page).getByRole('button', { name: 'Export current pack', exact: true }).click()
  const path = await (await downloading).path()
  if (!path) throw new Error('Exported reference pack is missing')
  const exported = JSON.parse(await readFile(path, 'utf8')) as PlanetPack
  expect(exported.id).toBe('stock-kcalbeloh')
  expect(exported.bodies).toHaveLength(50)
  expect(exported.nodes).toHaveLength(97)
  expect(exported.mapRegions).toHaveLength(5)
  expect(exported.unpricedConnections).toHaveLength(10)
  expect(exported.maneuvers.some(edge => edge.id.startsWith('allowance:'))).toBe(false)
  expect(exported.bodies.find(body => body.id === 'kcalbeloh:wh3141a')?.parentId).toBe('stock:jool')
  const custom = { ...exported, id: 'community-kcalbeloh', name: 'Community Kcalbeloh', shortName: 'Kcal custom' }
  await manager(page).getByLabel('Import planet pack', { exact: true }).setInputFiles({ name: 'kcalbeloh.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(custom)) })
  await manager(page).getByRole('button', { name: 'Use Community Kcalbeloh', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Map view', exact: true })).toBeVisible()
  await view(page, 'All systems')
  await expect(page.locator('[data-node-id]')).toHaveCount(97)
  await expect(page.locator('[data-node-id="kcalbeloh:noi:surface"]')).toHaveCount(0)
  await expect(page.locator('[data-node-id="kcalbeloh:simetra:surface"]')).toHaveCount(0)
})

test('keeps bundled transfers intact while applying a user landing allowance to an atmospheric surface', async ({ page }) => {
  await useConfiguration(page)
  await plan(page, 'kcalbeloh:tot:surface', 'kcalbeloh:suluco:surface')
  await expect(total(page)).toHaveText('3,931 m/s')
  await button(page, 'Atmospheric assistance').click()
  const dialog = page.getByRole('dialog', { name: 'Atmospheric assistance', exact: true })
  await expect(dialog.getByRole('checkbox', { name: 'Ideal capture at Suluco', exact: true })).toHaveCount(0)
  await dialog.getByRole('checkbox', { name: 'Atmospheric landing at Suluco', exact: true }).check()
  await dialog.getByRole('spinbutton', { name: 'Landing allowance at Suluco', exact: true }).fill('100')
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(total(page)).toHaveText('1,111 m/s')
  await expect(page.getByTestId('atmospheric-reference')).toContainText('3,931')
  await missionModeButton(page, 'round-trip').click()
  await expect(total(page)).toHaveText('5,042 m/s')
})

test('calculates global missions and searched stops while regional views change only presentation', async ({ page }) => {
  await useConfiguration(page)
  await enterLinks(page, [
    { label: wormhole, forward: '1000', reverse: '1000' },
    { label: sunorcLink, forward: '300', reverse: '300' },
    { label: maelgLink, forward: '400', reverse: '400' },
  ])
  await plan(page, 'stock:kerbin:surface', 'kcalbeloh:mehtna:surface')
  await expect(total(page)).toHaveText('26,790 m/s')
  await expect(map(page)).toHaveAttribute('data-map-region', 'maelg')
  await expect(page.getByText('Route: Kerbol system → Sunorc → Maelg', { exact: true })).toBeVisible()
  await button(page, 'Edit mission stops').click()
  const stops = page.getByRole('dialog', { name: 'Mission stops', exact: true })
  await stops.getByRole('combobox', { name: 'Choose a stop', exact: true }).fill('Suluco surface')
  await page.getByRole('option', { name: 'Suluco surface', exact: true }).click()
  await stops.getByRole('button', { name: 'Add stop', exact: true }).click()
  await stops.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(total(page)).toHaveText('32,630 m/s')
  await expect(map(page)).toHaveAttribute('data-map-region', 'sunorc')
  await expect(state(page, 'kcalbeloh:suluco:surface')).toHaveAttribute('data-waypoint-indexes', '1')
  await view(page, 'Kcalbeloh')
  await expect(total(page)).toHaveText('32,630 m/s')
  await expect(page.locator('[data-unpriced-id="kcalbeloh:connect-black-hole"]')).toHaveCount(1)
})

test('paginates a long built-in journey without dropping maneuvers', async ({ page }) => {
  await useConfiguration(page, 'OPM + Kcalbeloh')
  await enterLinks(page, [
    { label: opmWormhole, forward: '1000' },
    { label: sunorcLink, forward: '300', reverse: '300' },
    { label: maelgLink, forward: '400' },
  ])
  await plan(page, 'opm:tal:surface', 'kcalbeloh:mehtna:surface')
  await expect(total(page)).toHaveText('28,293 m/s')
  await page.getByLabel('Show breakdown', { exact: true }).check()
  const rows = page.getByRole('list', { name: 'Maneuver breakdown', exact: true }).getByRole('listitem')
  await expect(rows).toHaveCount(8)
  await expect(page.getByTestId('maneuver-position')).toHaveText('1–8 of 19')
  await button(page, 'Next maneuvers').click()
  await expect(rows).toHaveCount(8)
  await expect(page.getByTestId('maneuver-position')).toHaveText('9–16 of 19')
  await button(page, 'Next maneuvers').click()
  await expect(rows).toHaveCount(3)
  await expect(page.getByTestId('maneuver-position')).toHaveText('17–19 of 19')
  await expect(rows.last()).toContainText('Mehtna surface')
  await expect(button(page, 'Next maneuvers')).toBeDisabled()
})

test('limits relay planning to physical planets and moons and preserves the Delta-V mission', async ({ page }) => {
  await useConfiguration(page)
  await plan(page, 'kcalbeloh:suluco:surface', 'kcalbeloh:tot:surface')
  await button(page, 'CommNet relay planner').click()
  const relays = page.getByRole('dialog', { name: 'CommNet relay planner', exact: true })
  await relays.getByRole('combobox', { name: 'Relay body', exact: true }).click()
  for (const name of ['Kcalbeloh', 'Maelg', 'Sunorc', 'Aralc-A', 'Simetra–Simeht system', 'WH-3141 A', 'WH-3141 B']) {
    await expect(page.getByRole('option', { name, exact: true })).toHaveCount(0)
  }
  await expect(page.getByRole('option', { name: 'Noi', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await relays.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(total(page)).toHaveText('3,931 m/s')
})

for (const viewport of [{ width: 320, height: 568 }, { width: 667, height: 375 }, { width: 700, height: 900 }]) {
  test('keeps composed maps and allowance actions visible at ' + viewport.width + '×' + viewport.height, async ({ page }) => {
    await page.setViewportSize(viewport)
    await useConfiguration(page)
    await plan(page, 'kcalbeloh:suluco:surface', 'kcalbeloh:tot:surface')
    await expect(total(page)).toHaveText('3,931 m/s')
    await pageFits(page)
    for (const control of [page.getByRole('combobox', { name: 'Map view', exact: true }), button(page, 'Stock'), button(page, 'OPM'), button(page, 'RSS'), button(page, 'Choose origin'), button(page, 'Choose destination'), button(page, 'Edit mission stops')]) await onScreen(control, page)
    for (const region of ['Kerbol system', 'Kcalbeloh', 'Maelg', 'Sunorc', 'Aralc']) {
      await view(page, region)
      for (const node of await page.locator('[data-node-id]').all()) await onScreen(node, page)
      await expect(total(page)).toHaveText('3,931 m/s')
    }
    await openAllowances(page)
    for (const control of [editor(page), editor(page).getByRole('button', { name: 'Apply', exact: true }), editor(page).getByRole('button', { name: 'Cancel', exact: true }), editor(page).getByRole('button', { name: 'Clear allowances', exact: true })]) await onScreen(control, page)
    await allowance(page, wormhole).fill('1000')
    await onScreen(editor(page).getByRole('button', { name: 'Apply', exact: true }), page)
    await editor(page).getByRole('button', { name: 'Cancel', exact: true }).click()
    await pageFits(page)
    await expect(total(page)).toHaveText('3,931 m/s')
  })
}
