import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import type { PlanetPack } from '../src/types/planner'
import { missionModeButton } from './helpers/missionMode'

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const state = (page: Page, id: string) => page.locator(`[data-node-id="${id}"]`)
const total = (page: Page) => page.getByTestId('route-total')
const atmosphere = (page: Page) => page.getByRole('dialog', { name: 'Atmospheric assistance', exact: true })
const breakdown = (page: Page) => page.getByRole('list', { name: 'Maneuver breakdown', exact: true }).getByRole('listitem')
let browserErrors: string[]

test.beforeEach(async ({ page }) => {
  browserErrors = []
  page.on('pageerror', error => browserErrors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()) })
  await page.goto('./')
  await button(page, 'OPM').click()
})

test.afterEach(() => {
  expect(browserErrors, 'Modern OPM planning should not produce browser errors').toEqual([])
})

async function plan(page: Page, from: string, to: string) {
  await state(page, from).click()
  await state(page, to).click()
}

async function idealTektoArrival(page: Page) {
  await button(page, 'Atmospheric assistance').click()
  await atmosphere(page).getByRole('checkbox', { name: 'Ideal capture at Sarnus', exact: true }).check()
  await atmosphere(page).getByRole('checkbox', { name: 'Ideal capture at Tekto', exact: true }).check()
  await atmosphere(page).getByRole('checkbox', { name: 'Atmospheric landing at Tekto', exact: true }).check()
  await atmosphere(page).getByRole('spinbutton', { name: 'Landing allowance at Tekto', exact: true }).fill('100')
  await atmosphere(page).getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(atmosphere(page)).not.toBeVisible()
}

test('exposes modern parking altitudes above the affected atmospheres', async ({ page }) => {
  for (const [id, altitude] of [['sarnus', 600], ['urlum', 350], ['neidon', 280], ['thatmo', 50], ['tekto', 120]] as const) {
    await expect(state(page, `opm:${id}:orbit`).locator('title')).toContainText(` · ${altitude} km`)
  }
  await expect(state(page, 'stock:eeloo:orbit').locator('title')).toContainText(' · 10 km')
  await expect(page.locator('[data-node-id]')).toHaveCount(96)
})

test('explains the analytic model and the atmospheric allowances behind the visible notice', async ({ page }) => {
  await button(page, 'Analytic estimates').click()
  const info = page.getByRole('dialog', { name: 'About these estimates', exact: true })
  await expect(info).toBeVisible()
  await expect(info).toContainText('OPM 2.2.12')
  await expect(info).toContainText('retrograde Thatmo')
  await expect(info).toContainText('0.5 × nominal SOI')
  await expect(info).toContainText('Tekto and Thatmo retain historical atmospheric ascent/descent allowances of 2600 and 950 m/s')
  await expect(info).toContainText('are not upper bounds')
  await expect(info.getByRole('link', { name: /Official OPM 2.2.12/ })).toHaveAttribute('href', /ffedf02e23d2d620e1018d1467f5e485f7950fa0/)
})

test('shows the recalculated Kerbin increment and separate high-ellipse capture burns', async ({ page }) => {
  await plan(page, 'stock:kerbin:orbit', 'opm:sarnus:orbit')
  await expect(total(page)).toHaveText('4,070 m/s')
  const edge = (id: string) => page.locator(`[data-route-edge="true"][data-edge-id="${id}"] title`)
  await expect(edge('stock:kerbin:orbit->stock:kerbin:encounter')).toContainText('950 m/s')
  await expect(edge('stock:kerbin:encounter->opm:sarnus:encounter')).toContainText('1,305 m/s')
  await expect(edge('opm:sarnus:encounter->opm:sarnus:elliptical')).toContainText('281 m/s')
  await expect(edge('opm:sarnus:elliptical->opm:sarnus:orbit')).toContainText('1,534 m/s')
  await page.getByLabel('Show breakdown', { exact: true }).check()
  await expect(breakdown(page)).toHaveCount(4)
  await expect(breakdown(page).last()).toContainText('1,534 m/s')
  await missionModeButton(page, 'round-trip').click()
  await expect(total(page)).toHaveText('8,140 m/s')
})

test('uses the retrograde Thatmo capture while retaining its explicitly separate surface allowance', async ({ page }) => {
  await plan(page, 'stock:kerbin:surface', 'opm:thatmo:surface')
  await expect(total(page)).toHaveText('9,677 m/s')
  await expect(page.locator('[data-route-edge="true"][data-edge-id="opm:thatmo:encounter->opm:thatmo:orbit"] title')).toContainText('641 m/s')
  await page.getByLabel('Show breakdown', { exact: true }).check()
  await expect(breakdown(page).filter({ hasText: 'Thatmo low orbit' })).toContainText('641 m/s')
  await expect(breakdown(page).filter({ hasText: 'Thatmo surface' })).toContainText('950 m/s')
  await missionModeButton(page, 'return-only').click()
  await expect(total(page)).toHaveText('9,677 m/s')
})

test('applies optional atmospheric choices to modern captures without discounting the return ascent', async ({ page }) => {
  await plan(page, 'stock:kerbin:surface', 'opm:tekto:surface')
  await expect(total(page)).toHaveText('11,927 m/s')
  await idealTektoArrival(page)
  // Remove Sarnus capture281+1534, Tekto capture464, then replace2600 with100.
  await expect(total(page)).toHaveText('7,148 m/s')
  await expect(page.getByTestId('atmospheric-reference')).toContainText('11,927')
  await expect(page.getByTestId('atmospheric-change')).toContainText('4,779')
  await missionModeButton(page, 'round-trip').click()
  await expect(total(page)).toHaveText('19,075 m/s')
  await missionModeButton(page, 'return-only').click()
  await expect(total(page)).toHaveText('11,927 m/s')
  await page.getByLabel('Show breakdown', { exact: true }).check()
  await expect(breakdown(page).first()).toContainText('2,600 m/s')
})

test('exports modern source costs independently of applied assistance and leaves Stock Eeloo unchanged', async ({ page }) => {
  await plan(page, 'stock:kerbin:surface', 'opm:tekto:surface')
  await idealTektoArrival(page)
  await button(page, 'Custom planet packs').click()
  const manager = page.getByRole('dialog', { name: 'Planet packs', exact: true })
  const downloading = page.waitForEvent('download')
  await manager.getByRole('button', { name: 'Export current pack', exact: true }).click()
  const file = await (await downloading).path()
  if (!file) throw new Error('Exported OPM reference pack is missing')
  const pack = JSON.parse(await readFile(file, 'utf8')) as PlanetPack
  expect(pack.version).toBe('2.2.12-analytic.1')
  expect(pack.nodes.find(node => node.id === 'opm:sarnus:orbit')?.altitudeKm).toBe(600)
  expect(pack.nodes.find(node => node.id === 'opm:thatmo:orbit')?.altitudeKm).toBe(50)
  expect(pack.maneuvers.find(edge => edge.id === 'opm:tekto:encounter->opm:tekto:orbit')?.deltaV).toBe(464)
  expect(pack.maneuvers.find(edge => edge.id === 'opm:tekto:orbit->opm:tekto:surface')?.deltaV).toBe(2600)
  expect(pack.maneuvers.filter(edge => edge.sourceId === 'kowgan-opm-1.8.1')).toHaveLength(4)
  await manager.getByRole('button', { name: 'Done', exact: true }).click()
  await button(page, 'Stock').click()
  await button(page, 'Reset mission').click()
  await plan(page, 'stock:kerbin:surface', 'stock:eeloo:surface')
  await expect(total(page)).toHaveText('7,480 m/s')
  await expect(button(page, 'Analytic estimates')).toHaveCount(0)
})
