import { readFile } from 'node:fs/promises'
import { expect, test, type Locator, type Page } from '@playwright/test'
import type { PlanetPack } from '../src/types/planner'
import { stockKcalbelohPack } from '../src/data/kcalbeloh'
import { missionModeButton } from './helpers/missionMode'

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const state = (page: Page, id: string) => page.locator(`[data-node-id="${id}"]`)
const total = (page: Page) => page.getByTestId('route-total')
const info = (page: Page) => page.getByRole('dialog', { name: 'About these estimates', exact: true })
const manager = (page: Page) => page.getByRole('dialog', { name: 'Planet packs', exact: true })
const atmosphere = (page: Page) => page.getByRole('dialog', { name: 'Atmospheric assistance', exact: true })
const links = (page: Page) => page.getByRole('dialog', { name: 'Link allowances', exact: true })
const relays = (page: Page) => page.getByRole('dialog', { name: 'CommNet relay planner', exact: true })
const relayField = (page: Page, name: string) => relays(page).getByRole('spinbutton', { name, exact: true })
const summary = (page: Page, kind: string) => info(page).locator(`[data-budget-summary-kind="${kind}"]`)
const rows = (page: Page) => page.getByRole('list', { name: 'Maneuver breakdown', exact: true }).getByRole('listitem')
const basisRows = (page: Page, kind: string) => rows(page).and(page.locator(`[data-budget-basis="${kind}"]`))
const wormhole = 'Jool low orbit ↔ Sera low orbit via wormhole'
const centralLink = 'Kcalbeloh reference ↔ Rouqea low orbit'
let browserErrors: string[]

test.beforeEach(async ({ page }) => {
  browserErrors = []
  page.on('pageerror', error => browserErrors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()) })
  await page.goto('./')
  await expect(button(page, 'Custom planet packs')).toBeVisible()
})

test.afterEach(() => {
  expect(browserErrors, 'Budget explanations should not produce browser errors').toEqual([])
})

async function useKcalbeloh(page: Page) {
  await button(page, 'Custom planet packs').click()
  await manager(page).getByRole('tab', { name: 'Add-ons', exact: true }).click()
  await manager(page).getByRole('button', { name: 'Use Stock + Kcalbeloh', exact: true }).click()
  await expect(manager(page)).not.toBeVisible()
}

async function select(page: Page, id: string) {
  if (await state(page, id).count() === 0) {
    const bodyId = id.slice(0, id.lastIndexOf(':'))
    const region = stockKcalbelohPack.mapRegions!.find(region => region.bodyIds.includes(bodyId))
    await page.getByRole('combobox', { name: 'Map view', exact: true }).click()
    await page.getByRole('option', { name: region?.label ?? 'Kerbol system', exact: true }).click()
  }
  await state(page, id).click()
}

async function plan(page: Page, from: string, to: string) {
  await select(page, from)
  await select(page, to)
}

async function openMissionInfo(page: Page) {
  await button(page, 'Budget assumptions').click()
  await expect(info(page).getByRole('tab', { name: 'This mission', exact: true })).toHaveAttribute('aria-selected', 'true')
}

async function expectSummary(page: Page, kind: string, amount: string, maneuvers: number) {
  await expect(summary(page, kind).getByText(`${amount} m/s`, { exact: true })).toBeVisible()
  await expect(summary(page, kind).getByText(`${maneuvers} ${maneuvers === 1 ? 'maneuver' : 'maneuvers'}`, { exact: true })).toBeVisible()
}

async function openLinks(page: Page) {
  if (await button(page, 'Link allowances').isVisible()) await button(page, 'Link allowances').click()
  else {
    await button(page, 'Custom planet packs').click()
    await manager(page).getByRole('tab', { name: 'Add-ons', exact: true }).click()
    await manager(page).getByRole('button', { name: 'Link allowances', exact: true }).click()
  }
  await expect(links(page)).toBeVisible()
}

function linkInput(page: Page, label: string, direction: 'Forward' | 'Reverse' = 'Forward') {
  return links(page).getByRole('spinbutton', { name: `${direction} allowance for ${label}`, exact: true })
}

async function applyLinks(page: Page) {
  await links(page).getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(links(page)).not.toBeVisible()
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

async function outputFits(locator: Locator) {
  const measured = await locator.evaluate(element => ({ overflow: element.scrollWidth - element.clientWidth, fontSize: Number.parseFloat(getComputedStyle(element).fontSize) }))
  expect(measured.overflow).toBeLessThanOrEqual(1)
  expect(measured.fontSize).toBeGreaterThanOrEqual(18)
}

test('identifies flown Stock map figures and opens sources from the existing information control', async ({ page }) => {
  await plan(page, 'stock:kerbin:surface', 'stock:mun:surface')
  await expect(total(page)).toHaveText('5,120 m/s')
  await openMissionInfo(page)
  await expectSummary(page, 'reference', '5,120', 4)
  await expect(info(page).locator('[data-budget-summary-kind]')).toHaveCount(1)
  await expect(info(page).getByTestId('estimate-reserve')).toHaveText('0 m/s')
  await info(page).getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByLabel('Show breakdown', { exact: true }).check()
  await expect(rows(page)).toHaveCount(4)
  await expect(basisRows(page, 'reference')).toHaveCount(4)
  await button(page, 'Model assumptions and data sources').click()
  await expect(info(page).getByRole('tab', { name: 'Sources & assumptions', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(info(page).getByRole('link')).not.toHaveCount(0)
})

test('distinguishes the retained Stock map escape from OPM modeled transfers and capture', async ({ page }) => {
  await button(page, 'OPM').click()
  await plan(page, 'stock:kerbin:orbit', 'opm:sarnus:orbit')
  await expect(total(page)).toHaveText('4,070 m/s')
  await openMissionInfo(page)
  await expectSummary(page, 'reference', '950', 1)
  await expectSummary(page, 'model', '3,120', 3)
  await expect(info(page).getByText(/Dates, vehicle losses/)).toBeVisible()
  await info(page).getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByLabel('Show breakdown', { exact: true }).check()
  await expect(basisRows(page, 'model')).toHaveCount(3)
  await expect(basisRows(page, 'reference')).toHaveCount(1)
})

test('keeps an equal-valued personal landing distinct from the atmospheric placeholder', async ({ page }) => {
  await plan(page, 'stock:kerbin:surface', 'stock:duna:surface')
  await expect(total(page)).toHaveText('6,540 m/s')
  await openMissionInfo(page)
  await expectSummary(page, 'reference', '5,090', 5)
  await expectSummary(page, 'placeholder', '1,450', 1)
  await expect(info(page).getByText(/not a verified landing cost or upper bound/)).toBeVisible()
  await info(page).getByRole('button', { name: 'Close', exact: true }).click()
  await button(page, 'Atmospheric assistance').click()
  await atmosphere(page).getByRole('checkbox', { name: 'Atmospheric landing at Duna', exact: true }).check()
  await atmosphere(page).getByRole('spinbutton', { name: 'Landing allowance at Duna', exact: true }).fill('1450')
  await atmosphere(page).getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(total(page)).toHaveText('6,540 m/s')
  await openMissionInfo(page)
  await expectSummary(page, 'user', '1,450', 1)
  await expect(summary(page, 'placeholder')).toHaveCount(0)
  await info(page).getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByLabel('Show breakdown', { exact: true }).check()
  await expect(basisRows(page, 'user').filter({ hasText: 'Duna surface' })).toContainText('Yours')
})

test('counts explicit zero ideal capture maneuvers separately from map values', async ({ page }) => {
  await plan(page, 'stock:kerbin:surface', 'stock:duna:surface')
  await button(page, 'Atmospheric assistance').click()
  await atmosphere(page).getByRole('checkbox', { name: 'Ideal capture at Duna', exact: true }).check()
  await atmosphere(page).getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(total(page)).toHaveText('5,930 m/s')
  await openMissionInfo(page)
  await expectSummary(page, 'ideal', '0', 2)
  await expectSummary(page, 'reference', '4,480', 3)
  await expectSummary(page, 'placeholder', '1,450', 1)
  await expect(info(page).getByText(/a percentage reserve adds nothing to a zero-cost burn/)).toBeVisible()
})

test('treats zero and directional Kcalbeloh allowances as personal inputs rather than verified costs', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await useKcalbeloh(page)
  await plan(page, 'kcalbeloh:kcalbeloh:reference', 'kcalbeloh:rouqea:orbit')
  await openLinks(page)
  await linkInput(page, centralLink).fill('0')
  await linkInput(page, centralLink, 'Reverse').fill('25')
  const row = links(page).locator('[data-allowance-id="kcalbeloh:connect-black-hole"]')
  await expect(row).toContainText('Kcalbeloh 28.46 Gm reference orbit')
  await expect(row).toContainText('Rouqea low orbit')
  await onScreen(links(page).getByRole('button', { name: 'Apply', exact: true }), page)
  await applyLinks(page)
  await expect(total(page)).toHaveText('0 m/s')
  await openMissionInfo(page)
  await expectSummary(page, 'user', '0', 1)
  await expect(summary(page, 'reference')).toHaveCount(0)
  await expect(info(page).getByText(/Source links describe their context and do not verify those costs/)).toBeVisible()
  await info(page).getByRole('button', { name: 'Close', exact: true }).click()
  await missionModeButton(page, 'return-only').click()
  await expect(total(page)).toHaveText('25 m/s')
  await openMissionInfo(page)
  await expectSummary(page, 'user', '25', 1)
})

test('labels a mixed personal plan before atmosphere and retains its landing notice', async ({ page }) => {
  await useKcalbeloh(page)
  await plan(page, 'stock:kerbin:surface', 'kcalbeloh:sera:surface')
  await openLinks(page)
  await linkInput(page, wormhole).fill('1000')
  await applyLinks(page)
  await expect(total(page)).toHaveText('12,900 m/s')
  await openMissionInfo(page)
  await expectSummary(page, 'reference', '8,270', 5)
  await expectSummary(page, 'user', '1,000', 1)
  await expectSummary(page, 'placeholder', '3,630', 1)
  await info(page).getByRole('button', { name: 'Close', exact: true }).click()
  await button(page, 'Atmospheric assistance').click()
  await atmosphere(page).getByRole('checkbox', { name: 'Atmospheric landing at Sera', exact: true }).check()
  await atmosphere(page).getByRole('spinbutton', { name: 'Landing allowance at Sera', exact: true }).fill('100')
  await atmosphere(page).getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(total(page)).toHaveText('9,370 m/s')
  await expect(page.getByTestId('atmospheric-reference')).toContainText('12,900')
  await expect(page.getByRole('contentinfo')).toContainText('before atmosphere')
  await expect(page.getByRole('contentinfo')).toContainText(/landing/i)
  await openMissionInfo(page)
  await expectSummary(page, 'user', '1,100', 2)
  await expect(summary(page, 'placeholder')).toHaveCount(0)
})

test('keeps imported source declarations separate from independently checked built-in figures', async ({ page }) => {
  const pack = JSON.parse(await readFile('docs/examples/custom-pack.json', 'utf8')) as PlanetPack
  pack.sources[0]!.budgetType = 'reference'
  pack.maneuvers.find(edge => edge.id === 'example:haven-ascent')!.id = 'allowance:author-supplied:forward'
  await button(page, 'Custom planet packs').click()
  await manager(page).getByRole('tab', { name: 'Custom packs', exact: true }).click()
  await manager(page).getByLabel('Import planet pack', { exact: true }).setInputFiles({ name: 'declared-reference.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(pack)) })
  await manager(page).getByRole('button', { name: `Use ${pack.name}`, exact: true }).click()
  await plan(page, 'example:haven:surface', 'example:haven:orbit')
  await expect(total(page)).toHaveText('400 m/s')
  await expect(page.getByTestId('route-status')).not.toContainText('Includes user link allowances')
  await openMissionInfo(page)
  await expectSummary(page, 'imported', '400', 1)
  await expect(summary(page, 'reference')).toHaveCount(0)
  await expect(info(page).getByText(/not been independently verified/)).toBeVisible()
  await info(page).getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByLabel('Show breakdown', { exact: true }).check()
  await expect(basisRows(page, 'imported')).toContainText('Imported')
})

test('shows whole-number rounding separately from a zero-percent reserve', async ({ page }) => {
  await useKcalbeloh(page)
  await plan(page, 'kcalbeloh:kcalbeloh:reference', 'kcalbeloh:rouqea:orbit')
  await openLinks(page)
  await linkInput(page, centralLink).fill('0.25')
  await applyLinks(page)
  await expect(total(page)).toHaveText('1 m/s')
  await openMissionInfo(page)
  await expectSummary(page, 'user', '0.25', 1)
  await expect(info(page).getByTestId('estimate-reserve')).toHaveText('0 m/s')
  await expect(info(page).getByTestId('estimate-rounding')).toHaveText('0.75 m/s')
})

test('keeps a large built-in Kcalbeloh round-trip total readable at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await useKcalbeloh(page)
  await openLinks(page)
  for (const input of await links(page).getByRole('spinbutton').all()) await input.fill('1000000')
  await applyLinks(page)
  await plan(page, 'stock:kerbin:surface', 'kcalbeloh:rouqea:surface')
  await button(page, 'Edit mission stops').click()
  const stops = page.getByRole('dialog', { name: 'Mission stops', exact: true })
  for (const name of ['Suluco surface', 'Mehtna surface', 'Efil surface', 'Onrefni surface']) {
    await stops.getByRole('combobox', { name: 'Choose a stop', exact: true }).fill(name)
    await page.getByRole('option', { name, exact: true }).click()
    await stops.getByRole('button', { name: 'Add stop', exact: true }).click()
  }
  await stops.getByRole('button', { name: 'Done', exact: true }).click()
  await missionModeButton(page, 'round-trip').click()
  const reserve = page.getByRole('slider', { name: 'Redundancy', exact: true })
  await reserve.focus()
  await reserve.press('End')
  expect(Number((await total(page).innerText()).replace(/[^\d]/g, ''))).toBeGreaterThanOrEqual(10_000_000)
  await outputFits(total(page))
  await onScreen(button(page, 'Budget assumptions'), page)
  await pageFits(page)
})

for (const viewport of [{ width: 320, height: 568 }, { width: 700, height: 900 }]) {
  test(`shows complete relay physics and identifies RSS stock radio at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await useKcalbeloh(page)
    await button(page, 'CommNet relay planner').click()
    await relays(page).getByRole('combobox', { name: 'Relay body', exact: true }).click()
    await page.getByRole('option', { name: 'Suluco', exact: true }).click()
    await relays(page).getByRole('tab', { name: 'Body data', exact: true }).click()
    for (const name of ['Gravitational parameter', 'Sphere of influence']) {
      const input = relayField(page, name)
      await input.scrollIntoViewIfNeeded()
      const size = await input.evaluate(element => {
        const field = element as HTMLInputElement
        const style = getComputedStyle(field)
        const canvas = document.createElement('canvas')
        const context = canvas.getContext('2d')!
        context.font = style.font
        return { text: context.measureText(field.value).width, available: field.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight) }
      })
      expect(size.text, `${name} should fit without horizontal input scrolling`).toBeLessThan(size.available - 2)
    }
    await expect(relayField(page, 'Gravitational parameter')).toHaveValue('2253960436000')
    await relayField(page, 'Body radius').focus()
    await page.keyboard.press('Tab')
    await expect(relayField(page, 'Atmosphere height')).toBeFocused()
    await onScreen(relays(page).getByRole('button', { name: 'Close', exact: true }), page)
    await relays(page).getByRole('button', { name: 'Close', exact: true }).click()
    await button(page, 'RSS').click()
    await button(page, 'CommNet relay planner').click()
    await expect(relays(page).getByText('RSS body data · Stock radio model', { exact: true })).toBeVisible()
    await relays(page).getByRole('tab', { name: 'Body data', exact: true }).click()
    await expect(relays(page).getByText(/RSS radio patches, RealAntennas, and RemoteTech are not modeled/)).toBeVisible()
    await onScreen(relays(page).getByRole('button', { name: 'Close', exact: true }), page)
    await relays(page).getByRole('button', { name: 'Close', exact: true }).click()
    await pageFits(page)
  })
}

for (const viewport of [{ width: 320, height: 568 }, { width: 667, height: 375 }, { width: 700, height: 900 }, { width: 1920, height: 1080 }]) {
  test(`keeps budget explanations and fixed actions usable at ${viewport.width}×${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport)
    await plan(page, 'stock:kerbin:surface', 'stock:mun:surface')
    await outputFits(total(page))
    await openMissionInfo(page)
    await expectSummary(page, 'reference', '5,120', 4)
    for (const control of [info(page), info(page).getByRole('tab', { name: 'This mission', exact: true }), info(page).getByRole('tab', { name: 'Sources & assumptions', exact: true }), info(page).getByRole('button', { name: 'Close', exact: true })]) await onScreen(control, page)
    await info(page).getByRole('tab', { name: 'Sources & assumptions', exact: true }).click()
    await info(page).getByRole('link').last().scrollIntoViewIfNeeded()
    await onScreen(info(page).getByRole('button', { name: 'Close', exact: true }), page)
    await info(page).getByRole('tab', { name: 'This mission', exact: true }).click()
    await info(page).getByTestId('estimate-reserve').scrollIntoViewIfNeeded()
    if (viewport.width === 320 && testInfo.project.name === 'desktop') await page.screenshot({ path: '/tmp/estimate-clarity-budget-320.png', animations: 'disabled' })
    await info(page).getByRole('button', { name: 'Close', exact: true }).click()
    await pageFits(page)
  })
}
