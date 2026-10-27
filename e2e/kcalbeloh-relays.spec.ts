import { readFile } from 'node:fs/promises'
import { expect, test, type Locator, type Page } from '@playwright/test'
import type { PlanetPack } from '../src/types/planner'

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const planner = (page: Page) => page.getByRole('dialog', { name: 'CommNet relay planner', exact: true })
const field = (page: Page, name: string) => planner(page).getByRole('spinbutton', { name, exact: true })
const combo = (page: Page, name: string) => planner(page).getByRole('combobox', { name, exact: true })
const metric = (page: Page, id: string) => planner(page).getByTestId(id)
let browserErrors: string[]

test.beforeEach(async ({ page }) => {
  browserErrors = []
  page.on('pageerror', error => browserErrors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()) })
  await page.goto('./')
  await expect(button(page, 'CommNet relay planner')).toBeVisible()
})

test.afterEach(() => {
  expect(browserErrors, 'Kcalbeloh relay presets should not produce browser errors').toEqual([])
})

async function configuration(page: Page, name = 'Stock + Kcalbeloh') {
  await button(page, 'Custom planet packs').click()
  const manager = page.getByRole('dialog', { name: 'Planet packs', exact: true })
  await manager.getByRole('tab', { name: 'Add-ons', exact: true }).click()
  await manager.getByRole('button', { name: `Use ${name}`, exact: true }).click()
  await expect(manager).not.toBeVisible()
}

async function openPlanner(page: Page) {
  await button(page, 'CommNet relay planner').click()
  await expect(planner(page)).toBeVisible()
}

async function choose(page: Page, label: string, option: string) {
  await combo(page, label).click()
  await page.getByRole('option', { name: option, exact: true }).click()
}

async function section(page: Page, name: 'Network' | 'Deployment' | 'Body data') {
  await planner(page).getByRole('tab', { name, exact: true }).click()
}

async function sulucoMission(page: Page) {
  await page.getByRole('combobox', { name: 'Map view', exact: true }).click()
  await page.getByRole('option', { name: 'Sunorc', exact: true }).click()
  await page.locator('[data-node-id="kcalbeloh:suluco:surface"]').click()
  await page.locator('[data-node-id="kcalbeloh:tot:surface"]').click()
  await expect(page.getByTestId('route-total')).toHaveText('3,931 m/s')
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

for (const pack of ['Stock + Kcalbeloh', 'OPM + Kcalbeloh']) {
  test(`loads sourced relay physics and preserves the mission in ${pack}`, async ({ page }) => {
    await configuration(page, pack)
    await sulucoMission(page)
    await openPlanner(page)
    await expect(combo(page, 'Relay body')).toHaveText('Tot')
    await expect(planner(page).getByRole('tab', { name: 'Network', exact: true })).toHaveAttribute('aria-selected', 'true')
    await combo(page, 'Relay body').click()
    await expect(page.getByRole('option')).toHaveCount(pack === 'Stock + Kcalbeloh' ? 41 : 56)
    await page.getByRole('option', { name: 'Suluco', exact: true }).click()
    await section(page, 'Body data')
    await expect(field(page, 'Body radius')).toHaveValue('520')
    // Independent source facts: R=520 km, geeASL=.85, standard gravity9.80665.
    expect(Number(await field(page, 'Gravitational parameter').inputValue())).toBeCloseTo(2_253_960_436_000, 2)
    await expect(field(page, 'Atmosphere height')).toHaveValue('65')
    expect(Number(await field(page, 'Sphere of influence').inputValue())).toBeCloseTo(31_359.322313602865, 7)
    await expect(planner(page).getByRole('link', { name: /Kcalbeloh/ })).toHaveAttribute('href', /1c61f4d3a9d72c76054855c4ee9330d3a3ee85a9/)
    await section(page, 'Network')
    await field(page, 'Orbit altitude').fill('700')
    // 2pi sqrt((520+700 km)^3/mu)=5639.576s, rounded to5640s.
    await expect(metric(page, 'relay-period')).toHaveText('1h 34m 0s')
    await expect(metric(page, 'relay-coverage')).toHaveText('100%')
    await expect(metric(page, 'relay-ring-status')).toContainText('Available')
    await expect(metric(page, 'relay-dsn-range')).toHaveText('1.1 Gm')
    await planner(page).getByRole('button', { name: 'Close', exact: true }).click()
    await expect(page.getByTestId('route-total')).toHaveText('3,931 m/s')
    await openPlanner(page)
    await expect(combo(page, 'Relay body')).toHaveText('Suluco')
    await expect(field(page, 'Orbit altitude')).toHaveValue('700')
  })
}

test('honors explicit Kcalbeloh sphere-of-influence overrides and mass-based planet data', async ({ page }) => {
  await configuration(page)
  await openPlanner(page)
  await choose(page, 'Relay body', 'Rouqea')
  await section(page, 'Body data')
  await expect(field(page, 'Body radius')).toHaveValue('1331.34')
  await expect(field(page, 'Atmosphere height')).toHaveValue('80')
  expect(Number(await field(page, 'Gravitational parameter').inputValue())).toBeCloseTo(22_305_876_583_200, 0)
  expect(Number(await field(page, 'Sphere of influence').inputValue())).toBeCloseTo(27_251.2542938285, 7)
  await choose(page, 'Relay body', 'Iomena')
  await expect(field(page, 'Body radius')).toHaveValue('400')
  await expect(field(page, 'Atmosphere height')).toHaveValue('80')
  expect(Number(await field(page, 'Sphere of influence').inputValue())).toBeCloseTo(9_233.32814499067, 7)
})

test('provides catalog-only asteroid and binary-giant presets while excluding technical centers', async ({ page }) => {
  await configuration(page)
  await openPlanner(page)
  await combo(page, 'Relay body').click()
  for (const name of ['Kcalbeloh', 'Maelg', 'Sunorc', 'Aralc-A', 'Aralc-B', 'Simetra–Simeht system', 'WH-3141 A', 'WH-3141 B']) {
    await expect(page.getByRole('option', { name, exact: true })).toHaveCount(0)
  }
  await page.getByRole('option', { name: 'Noi', exact: true }).click()
  await section(page, 'Body data')
  await expect(field(page, 'Body radius')).toHaveValue('8.3')
  await expect(field(page, 'Atmosphere height')).toHaveValue('0')
  expect(Number(await field(page, 'Gravitational parameter').inputValue())).toBeCloseTo(11_546_158.4, 4)
  expect(Number(await field(page, 'Sphere of influence').inputValue())).toBeCloseTo(846.2755420720853, 7)
  for (const giant of [
    { name: 'Simetra', radius: '4800', atmosphere: '190', soi: 15_000 },
    { name: 'Simeht', radius: '4000', atmosphere: '177', soi: 12_000 },
  ]) {
    await choose(page, 'Relay body', giant.name)
    await expect(field(page, 'Body radius')).toHaveValue(giant.radius)
    await expect(field(page, 'Atmosphere height')).toHaveValue(giant.atmosphere)
    expect(Number(await field(page, 'Sphere of influence').inputValue())).toBe(giant.soi)
    await section(page, 'Network')
    await expect(metric(page, 'relay-coverage')).toHaveText('No surface')
    await expect(planner(page).locator('[data-relay-station]')).toHaveCount(0)
    await section(page, 'Body data')
  }
})

test('uses the entered atmosphere for occlusion and restores edited Kcalbeloh body data', async ({ page }) => {
  await configuration(page)
  await openPlanner(page)
  await choose(page, 'Relay body', 'Sera')
  await section(page, 'Body data')
  await expect(field(page, 'Body radius')).toHaveValue('690')
  await expect(field(page, 'Atmosphere height')).toHaveValue('71')
  const sourceSoi = await field(page, 'Sphere of influence').inputValue()
  await choose(page, 'Occlusion', 'KSP normal')
  await section(page, 'Network')
  await expect(planner(page).locator('[data-relay-occlusion-factor]')).toHaveAttribute('data-relay-occlusion-factor', '0.75')
  await section(page, 'Body data')
  await field(page, 'Body radius').fill('700')
  await field(page, 'Atmosphere height').fill('0')
  await expect(planner(page).getByText('Edited reference body data', { exact: true })).toBeVisible()
  await section(page, 'Network')
  await expect(planner(page).locator('[data-relay-occlusion-factor]')).toHaveAttribute('data-relay-occlusion-factor', '0.9')
  await section(page, 'Body data')
  await planner(page).getByRole('button', { name: 'Restore preset', exact: true }).click()
  await expect(field(page, 'Body radius')).toHaveValue('690')
  await expect(field(page, 'Atmosphere height')).toHaveValue('71')
  await expect(field(page, 'Sphere of influence')).toHaveValue(sourceSoi)
  await expect(planner(page).getByText('Reference body preset', { exact: true })).toBeVisible()
})

test('uses effective SOI floors and keeps automatic targets inside edited bounds', async ({ page }) => {
  await configuration(page)
  await openPlanner(page)
  for (const moon of [
    { name: 'Tot', radius: '3.25', soi: '43.25', altitude: '11' },
    { name: 'Enots', radius: '18', soi: '58', altitude: '24' },
  ]) {
    await choose(page, 'Relay body', moon.name)
    await section(page, 'Body data')
    await expect(field(page, 'Body radius')).toHaveValue(moon.radius)
    await expect(field(page, 'Sphere of influence')).toHaveValue(moon.soi)
    await section(page, 'Network')
    await expect(field(page, 'Orbit altitude')).toHaveValue(moon.altitude)
    await expect(metric(page, 'relay-period')).not.toHaveText('—')
  }

  // Enots: SOI=38 km leaves altitude between the 10 km margin and 20 km.
  // The usual 24 km target no longer fits, so automatic selection uses 15 km.
  await section(page, 'Body data')
  await field(page, 'Sphere of influence').fill('38')
  await section(page, 'Network')
  await expect(field(page, 'Orbit altitude')).toHaveValue('15')
  await expect(metric(page, 'relay-period')).not.toHaveText('—')
  await field(page, 'Orbit altitude').fill('17')
  await section(page, 'Body data')
  await field(page, 'Sphere of influence').fill('40')
  await section(page, 'Network')
  await expect(field(page, 'Orbit altitude')).toHaveValue('17')
  await choose(page, 'Relay body', 'Tot')
  await section(page, 'Deployment')
  await field(page, 'Clearance margin').fill('12')
  await choose(page, 'Relay body', 'Enots')
  await expect(field(page, 'Orbit altitude')).toHaveValue('17')
  await section(page, 'Body data')
  await planner(page).getByRole('button', { name: 'Restore preset', exact: true }).click()
  await expect(field(page, 'Sphere of influence')).toHaveValue('58')
  await section(page, 'Network')
  await expect(field(page, 'Orbit altitude')).toHaveValue('24')
})

test('still requires manual physics for an unrelated imported body', async ({ page }) => {
  const pack = JSON.parse(await readFile('docs/examples/custom-pack.json', 'utf8')) as PlanetPack
  await button(page, 'Custom planet packs').click()
  const manager = page.getByRole('dialog', { name: 'Planet packs', exact: true })
  await manager.getByRole('tab', { name: 'Custom packs', exact: true }).click()
  await manager.getByLabel('Import planet pack', { exact: true }).setInputFiles({ name: 'custom.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(pack)) })
  await manager.getByRole('button', { name: `Use ${pack.name}`, exact: true }).click()
  await openPlanner(page)
  await expect(planner(page).getByRole('tab', { name: 'Body data', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(field(page, 'Body radius')).toHaveValue('')
  await expect(field(page, 'Gravitational parameter')).toHaveValue('')
  await expect(field(page, 'Sphere of influence')).toHaveValue('')
})

for (const viewport of [{ width: 320, height: 568 }, { width: 667, height: 375 }]) {
  test(`keeps Kcalbeloh relay controls and restored data usable within ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await configuration(page)
    await openPlanner(page)
    await choose(page, 'Relay body', 'Suluco')
    await expect(metric(page, 'relay-period')).not.toHaveText('—')
    await section(page, 'Body data')
    await field(page, 'Sphere of influence').scrollIntoViewIfNeeded()
    await expect(field(page, 'Body radius')).toHaveValue('520')
    for (const control of [planner(page), combo(page, 'Relay body'), field(page, 'Sphere of influence'), planner(page).getByRole('button', { name: 'Restore preset', exact: true }), planner(page).getByRole('button', { name: 'Close', exact: true })]) await onScreen(control, page)
    await section(page, 'Deployment')
    await metric(page, 'relay-circularization').scrollIntoViewIfNeeded()
    await expect(metric(page, 'relay-circularization')).not.toHaveText('—')
    await onScreen(planner(page).getByRole('button', { name: 'Close', exact: true }), page)
    await planner(page).getByRole('button', { name: 'Close', exact: true }).click()
    await pageFits(page)
    await onScreen(button(page, 'Custom planet packs'), page)
    await onScreen(page.getByRole('combobox', { name: 'Map view', exact: true }), page)
  })
}
