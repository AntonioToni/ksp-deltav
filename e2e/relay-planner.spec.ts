import { readFile } from 'node:fs/promises'
import { expect, test, type Locator, type Page } from '@playwright/test'
import type { PlanetPack } from '../src/types/planner'
import { missionModeButton } from './helpers/missionMode'

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const launcher = (page: Page) => button(page, 'CommNet relay planner')
const planner = (page: Page) => page.getByRole('dialog', { name: 'CommNet relay planner', exact: true })
const field = (page: Page, name: string) => planner(page).getByRole('spinbutton', { name, exact: true })
const combo = (page: Page, name: string) => planner(page).getByRole('combobox', { name, exact: true })
const state = (page: Page, id: string) => page.locator(`[data-node-id="${id}"]`)
const metric = (page: Page, id: string) => planner(page).getByTestId(id)

let browserErrors: string[]

test.beforeEach(async ({ page }) => {
  browserErrors = []
  page.on('pageerror', error => browserErrors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()) })
  await page.goto('./')
  await expect(launcher(page)).toBeVisible()
})

test.afterEach(() => {
  expect(browserErrors, 'Relay planning should not produce browser errors').toEqual([])
})

async function openPlanner(page: Page) {
  await launcher(page).click()
  await expect(planner(page)).toBeVisible()
}

async function section(page: Page, name: 'Network' | 'Deployment' | 'Body data') {
  await planner(page).getByRole('tab', { name, exact: true }).click()
}

async function choose(page: Page, label: string, name: string | RegExp) {
  await combo(page, label).click()
  await page.getByRole('option', { name, exact: typeof name === 'string' }).click()
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
  const actual = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, x: scrollX, y: scrollY }))
  expect(actual).toEqual({ width: page.viewportSize()!.width, height: page.viewportSize()!.height, x: 0, y: 0 })
}

test('calculates the independent Kerbin ring example and rotates its equatorial diagram', async ({ page }) => {
  await openPlanner(page)
  await expect(combo(page, 'Relay body')).toHaveText('Kerbin')
  await expect(field(page, 'Orbit altitude')).toHaveValue('800')
  await expect(combo(page, 'Relay count')).toHaveText('3 relays')
  await expect(metric(page, 'relay-coverage')).toHaveText('100%')
  await expect(metric(page, 'relay-neighbor-distance')).toHaveText('2,424.9 km')
  await expect(metric(page, 'relay-period')).toHaveText('1h 32m 18s')
  await expect(metric(page, 'relay-dsn-range')).toHaveText('1.1 Gm')
  await expect(metric(page, 'relay-ring-status')).toContainText('Available')
  await expect(planner(page).getByText(/DSN range is not a home link/)).toBeVisible()
  const diagram = planner(page).getByRole('img', { name: 'Kerbin equatorial relay diagram', exact: true })
  await expect(diagram.locator('[data-relay-satellite]')).toHaveCount(3)
  await expect(diagram.locator('[data-relay-link="neighbor"][data-link-status="available"]')).toHaveCount(3)
  const first = diagram.locator('[data-relay-satellite="0"]')
  const before = await first.getAttribute('transform')
  await planner(page).getByRole('button', { name: 'Rotate relays', exact: true }).click()
  await expect(first).not.toHaveAttribute('transform', before!)
  await expect(metric(page, 'relay-coverage')).toHaveText('100%')
})

test('distinguishes conservative blocking from the explicitly selected normal-game occluder', async ({ page }) => {
  await openPlanner(page)
  await field(page, 'Orbit altitude').fill('400')
  await expect(metric(page, 'relay-ring-status')).toContainText('Body blocks links')
  await section(page, 'Body data')
  await expect(field(page, 'Body radius')).toHaveValue('600')
  await choose(page, 'Occlusion', 'KSP normal')
  await section(page, 'Network')
  await expect(metric(page, 'relay-ring-status')).toContainText('Available')
  await expect(planner(page).locator('[data-relay-occlusion-factor]')).toHaveAttribute('data-relay-occlusion-factor', '0.75')
})

test('marks a tangent ring as marginal and blocks an atmospheric lower carrier', async ({ page }) => {
  await openPlanner(page)
  await field(page, 'Orbit altitude').fill('600')
  await expect(metric(page, 'relay-ring-status')).toContainText('At limit')
  await expect(metric(page, 'relay-coverage-status')).toContainText('Coverage at boundary')
  await section(page, 'Deployment')
  await expect(metric(page, 'relay-deployment-status')).toHaveText('Deployment blocked')
  await expect(metric(page, 'relay-periapsis')).toHaveText('31.5 km')
  await planner(page).getByRole('button', { name: 'Higher carrier', exact: true }).click()
  await expect(metric(page, 'relay-deployment-status')).toHaveText('Clear of modeled limits')
})

test('calculates both carrier choices and rejects an apoapsis outside the supplied sphere of influence', async ({ page }) => {
  await openPlanner(page)
  await section(page, 'Deployment')
  await expect(metric(page, 'relay-periapsis')).toHaveText('136.8 km')
  await expect(metric(page, 'relay-apoapsis')).toHaveText('800 km')
  await expect(metric(page, 'relay-release-interval')).toHaveText('1h 1m 32s')
  await expect(metric(page, 'relay-circularization')).toHaveText('269.3 m/s')
  await planner(page).getByRole('button', { name: 'Higher carrier', exact: true }).click()
  await expect(metric(page, 'relay-apoapsis')).toHaveText('1,392 km')
  await expect(metric(page, 'relay-circularization')).toHaveText('133 m/s')
  await section(page, 'Body data')
  await field(page, 'Sphere of influence').fill('1700')
  await section(page, 'Deployment')
  await expect(metric(page, 'relay-deployment-status')).toHaveText('Deployment blocked')
})

test('keeps local surface range, custom power, and DSN range as distinct results', async ({ page }) => {
  await openPlanner(page)
  await choose(page, 'Surface antenna', /Internal/i)
  await expect(metric(page, 'relay-coverage')).toHaveText('0%')
  await expect(metric(page, 'relay-ring-status')).toContainText('Available')
  await choose(page, 'Surface antenna', 'Custom power')
  await expect(metric(page, 'relay-coverage')).toHaveCount(0)
  await field(page, 'Surface power').fill('500000')
  await expect(metric(page, 'relay-coverage')).toHaveText('100%')
  await choose(page, 'DSN level', /1/)
  await expect(metric(page, 'relay-dsn-range')).toHaveText('100 Mm')
  await section(page, 'Body data')
  await field(page, 'Range multiplier').fill('2')
  await section(page, 'Network')
  await expect(metric(page, 'relay-dsn-range')).toHaveText('200 Mm')
})

test('does not depict opposite two-relay satellites as a connected ring', async ({ page }) => {
  await openPlanner(page)
  await choose(page, 'Relay count', '2 relays')
  await expect(metric(page, 'relay-ring-status')).toContainText('Body blocks links')
  await expect(planner(page).locator('[data-relay-satellite]')).toHaveCount(2)
  await expect(planner(page).locator('[data-relay-link="neighbor"]')).toHaveCount(1)
  await expect(planner(page).locator('[data-relay-link="neighbor"]')).toHaveAttribute('data-link-status', 'blocked')
})

test('requires real manual body inputs for an unknown custom system and rejects invalid physics', async ({ page }) => {
  const pack = JSON.parse(await readFile('docs/examples/custom-pack.json', 'utf8')) as PlanetPack
  await button(page, 'Custom planet packs').click()
  const manager = page.getByRole('dialog', { name: 'Planet packs', exact: true })
  await manager.getByLabel('Import planet pack', { exact: true }).setInputFiles({ name: 'custom.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(pack)) })
  await manager.getByRole('button', { name: `Use ${pack.name}`, exact: true }).click()
  await openPlanner(page)
  await expect(planner(page).getByRole('tab', { name: 'Body data', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(field(page, 'Body radius')).toHaveValue('')
  await expect(field(page, 'Gravitational parameter')).toHaveValue('')
  await field(page, 'Body radius').fill('0')
  await expect(field(page, 'Body radius')).toHaveAttribute('aria-invalid', 'true')
  await field(page, 'Body radius').fill('600')
  await field(page, 'Gravitational parameter').fill('3531600000000')
  await field(page, 'Atmosphere height').fill('70')
  await field(page, 'Sphere of influence').fill('84159.2865')
  await section(page, 'Network')
  await expect(field(page, 'Orbit altitude')).toHaveValue('800')
  await expect(metric(page, 'relay-coverage')).toHaveText('100%')
  await expect(metric(page, 'relay-period')).toHaveText('1h 32m 18s')
})

test('loads Eeloo sphere-of-influence data for its actual parent in Stock and OPM', async ({ page }) => {
  await state(page, 'stock:kerbin:surface').click()
  await state(page, 'stock:eeloo:surface').click()
  await openPlanner(page)
  await expect(combo(page, 'Relay body')).toHaveText('Eeloo')
  await section(page, 'Body data')
  const stockSoi = Number(await field(page, 'Sphere of influence').inputValue())
  expect(stockSoi).toBeGreaterThan(10_000)
  await planner(page).getByRole('button', { name: 'Close', exact: true }).click()
  await button(page, 'OPM').click()
  await openPlanner(page)
  await expect(combo(page, 'Relay body')).toHaveText('Eeloo')
  await section(page, 'Body data')
  const opmSoi = Number(await field(page, 'Sphere of influence').inputValue())
  expect(opmSoi).toBeGreaterThan(0)
  expect(opmSoi).toBeLessThan(stockSoi / 10)
})

test('uses RSS body physics while keeping the stock radio model and omitting gas-giant surface coverage', async ({ page }) => {
  await button(page, 'RSS').click()
  await openPlanner(page)
  await expect(combo(page, 'Relay body')).toHaveText('Earth')
  await section(page, 'Body data')
  expect(Number(await field(page, 'Body radius').inputValue())).toBeGreaterThan(6000)
  expect(Number(await field(page, 'Gravitational parameter').inputValue())).toBeGreaterThan(1e14)
  await expect(planner(page).getByText(/Radio estimates use stock antennas and DSN powers; RSS radio patches/)).toBeVisible()
  await planner(page).getByRole('button', { name: 'Close', exact: true }).click()
  await button(page, 'Stock').click()
  await openPlanner(page)
  await choose(page, 'Relay body', 'Jool')
  await expect(metric(page, 'relay-coverage')).toHaveText('No surface')
  await expect(metric(page, 'relay-ring-status')).toContainText('Out of range')
  await choose(page, 'Relay antenna', /RA.?2\b/)
  await expect(metric(page, 'relay-ring-status')).toContainText('Available')
  await expect(planner(page).locator('[data-relay-station]')).toHaveCount(0)
})

test('preserves the Delta-V mission and reopens the same relay session', async ({ page }) => {
  await state(page, 'stock:kerbin:surface').click()
  await state(page, 'stock:mun:surface').click()
  await missionModeButton(page, 'round-trip').click()
  const reserve = page.getByRole('slider', { name: 'Redundancy', exact: true })
  await reserve.focus()
  for (let index = 0; index < 4; index++) await reserve.press('ArrowRight')
  await expect(page.getByTestId('route-total')).toHaveText('12,288 m/s')
  await openPlanner(page)
  await expect(combo(page, 'Relay body')).toHaveText('Mun')
  await choose(page, 'Relay body', 'Kerbin')
  await field(page, 'Orbit altitude').fill('900')
  await planner(page).getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.getByTestId('route-total')).toHaveText('12,288 m/s')
  await expect(button(page, 'Choose destination')).toContainText('Mun surface')
  await expect(missionModeButton(page, 'round-trip')).toHaveAttribute('aria-pressed', 'true')
  await openPlanner(page)
  await expect(combo(page, 'Relay body')).toHaveText('Kerbin')
  await expect(field(page, 'Orbit altitude')).toHaveValue('900')
})

test('opens and closes with the keyboard and starts a fresh relay session after reload', async ({ page }) => {
  await launcher(page).focus()
  await launcher(page).press('Enter')
  await expect(planner(page)).toBeVisible()
  await field(page, 'Orbit altitude').fill('900')
  await page.keyboard.press('Escape')
  await expect(planner(page)).not.toBeVisible()
  await expect(launcher(page)).toBeFocused()
  await page.reload()
  await openPlanner(page)
  await expect(field(page, 'Orbit altitude')).toHaveValue('800')
})

for (const viewport of [
  { width: 320, height: 568 }, { width: 390, height: 844 },
  { width: 667, height: 375 }, { width: 700, height: 900 },
]) {
  test(`keeps the relay tool and main planner within ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await onScreen(launcher(page), page)
    await pageFits(page)
    await openPlanner(page)
    for (const control of [planner(page), combo(page, 'Relay body'), planner(page).getByRole('button', { name: 'Close', exact: true }), planner(page).getByRole('button', { name: 'Close relay planner', exact: true })]) await onScreen(control, page)
    for (const name of ['Network', 'Deployment', 'Body data'] as const) await onScreen(planner(page).getByRole('tab', { name, exact: true }), page)
    await expect(metric(page, 'relay-coverage')).toHaveText('100%')
    await section(page, 'Deployment')
    await metric(page, 'relay-circularization').scrollIntoViewIfNeeded()
    await expect(metric(page, 'relay-circularization')).toHaveText('269.3 m/s')
    await onScreen(planner(page).getByRole('button', { name: 'Close', exact: true }), page)
    await planner(page).getByRole('button', { name: 'Close', exact: true }).click()
    await pageFits(page)
    await expect(page.locator('[data-node-id]')).toHaveCount(50)
    await onScreen(button(page, 'Choose origin'), page)
    await onScreen(button(page, 'Choose destination'), page)
  })
}
