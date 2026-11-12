import { expect, test, type Locator, type Page } from '@playwright/test'
import { missionModeButton } from './helpers/missionMode'

const kerbalism = 'Kerbalism + CommNet'
const kerbalismRss = 'Kerbalism + RSS'
const kerbalismCbk = 'Kerbalism + RSS + CBK'
const profiles = [
  { id: 'kerbalism', name: kerbalism },
  { id: 'rss-kerbalism', name: kerbalismRss },
  { id: 'rss-cbk-kerbalism', name: kerbalismCbk },
] as const
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const planner = (page: Page) => page.getByRole('dialog', { name: 'CommNet relay planner', exact: true })
const panel = (page: Page) => planner(page).getByRole('tabpanel')
const combo = (page: Page, name: string) => planner(page).getByRole('combobox', { name, exact: true })
const field = (page: Page, name: string) => planner(page).getByRole('spinbutton', { name, exact: true })
const metric = (page: Page, id: string) => planner(page).getByTestId(id)
const arrayEditor = (page: Page, name: string) => page.getByRole('dialog', { name, exact: true })
let browserErrors: string[]

test.beforeEach(async ({ page }) => {
  browserErrors = []
  page.on('pageerror', error => browserErrors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()) })
  await page.goto('./')
  await expect(button(page, 'CommNet relay planner')).toBeVisible()
})

test.afterEach(() => {
  expect(browserErrors, 'Kerbalism radio changes should not produce browser errors').toEqual([])
})

async function openPlanner(page: Page) {
  await button(page, 'CommNet relay planner').click()
  await expect(planner(page)).toBeVisible()
}

async function section(page: Page, name: 'Network' | 'Deployment' | 'Body data' | 'Signals') {
  await planner(page).getByRole('tab', { name, exact: true }).click()
}

async function choose(page: Page, label: string, option: string) {
  await combo(page, label).click()
  await page.getByRole('option', { name: option, exact: true }).click()
}

async function openArray(page: Page, label: string, name: string) {
  await choose(page, label, 'Antenna array…')
  const dialog = arrayEditor(page, name)
  await expect(dialog).toBeVisible()
  return dialog
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

async function cancel(dialog: Locator) {
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(dialog).not.toBeVisible()
}

async function onScreen(locator: Locator, page: Page) {
  const bounds = await locator.boundingBox()
  expect(bounds).not.toBeNull()
  if (!bounds) return
  const viewport = page.viewportSize()!
  expect(bounds.x).toBeGreaterThanOrEqual(-1)
  expect(bounds.y).toBeGreaterThanOrEqual(-1)
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width + 1)
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height + 1)
}

async function pageFits(page: Page) {
  expect(await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, x: scrollX, y: scrollY })))
    .toEqual({ ...page.viewportSize()!, x: 0, y: 0 })
}

test('exposes distinct Kerbalism presets and sources while preserving the stock range and strength curve', async ({ page }) => {
  await openPlanner(page)
  await combo(page, 'Radio setup').click()
  for (const profile of profiles) {
    await expect(page.getByRole('option', { name: profile.name, exact: true })).toHaveAttribute('data-value', profile.id)
  }
  await page.getByRole('option', { name: kerbalism, exact: true }).click()
  await expect(panel(page).getByText(/Includes Communotron 8\. Kerbalism science rates are not calculated\./)).toBeVisible()
  await section(page, 'Signals')
  await expect(combo(page, 'Radio setup')).toHaveText(kerbalism)
  await expect(combo(page, 'Antenna A')).toHaveText('RA-100')
  await expect(combo(page, 'Antenna B')).toHaveText('RA-100')
  await expect(metric(page, 'signal-range')).toHaveText('100 Gm')
  // Pinned Kerbin/Duna SMA facts at 90 degrees; stock strength is smoothstep(1-d/r).
  const separation = Math.hypot(13_599_840_256, 20_726_155_264)
  const normalized = 1 - separation / 100_000_000_000
  const expectedStrength = 100 * normalized ** 2 * (3 - 2 * normalized)
  expect(expectedStrength).toBeCloseTo(84.61, 2)
  await expect(metric(page, 'signal-distance')).toHaveText('24.79 Gm')
  await expect(metric(page, 'signal-strength')).toHaveText(`${expectedStrength.toFixed(2)}%`)
  await choose(page, 'Radio setup', 'Stock CommNet')
  await expect(metric(page, 'signal-range')).toHaveText('100 Gm')
  await expect(metric(page, 'signal-strength')).toHaveText('84.61%')
  await choose(page, 'Radio setup', kerbalism)
  await combo(page, 'Antenna A').click()
  await expect(page.getByRole('option', { name: 'RA-100', exact: true })).toHaveAttribute('data-value', 'ra-100')
  await expect(page.getByRole('option', { name: 'Communotron 8', exact: true })).toHaveAttribute('data-value', 'communotron-8')
  await page.keyboard.press('Escape')
  await panel(page).getByText('Signal assumptions and sources', { exact: true }).click()
  await expect(planner(page).getByRole('link', { name: 'Official Kerbalism 3.44 Communotron 8 antenna · pinned revision', exact: true }))
    .toHaveAttribute('href', 'https://github.com/Kerbalism/Kerbalism/blob/39f9f43afe8b4f77aff0086c3866044287694475/GameData/KerbalismConfig/Parts/ShortAntenna/kerbalism-antenna.cfg')
  await expect(planner(page).getByRole('link', { name: /Official Kerbalism 3\.44 stock signal curve/ }))
    .toHaveAttribute('href', /39f9f43afe8b4f77aff0086c3866044287694475\/src\/Kerbalism\/Sim\.cs$/)
})

test('shares radio selection between tabs and applies RSS and conditional DSN powers once', async ({ page }) => {
  await openPlanner(page)
  await choose(page, 'Radio setup', kerbalismRss)
  await expect(combo(page, 'Relay body')).toHaveText('Kerbin')
  await expect(metric(page, 'relay-relay-power')).toHaveText('100 Mm')
  await expect(metric(page, 'relay-dsn-power')).toHaveText('250 Gm')
  await expect(metric(page, 'relay-dsn-range')).toHaveText('5 Gm')
  await section(page, 'Signals')
  await expect(combo(page, 'Radio setup')).toHaveText(kerbalismRss)
  await expect(metric(page, 'signal-power-a')).toHaveText('Effective power 2 Tm')
  await expect(metric(page, 'signal-range')).toHaveText('2 Tm')
  await choose(page, 'Radio setup', kerbalismCbk)
  await expect(metric(page, 'signal-range')).toHaveText('2 Tm')
  await choose(page, 'Antenna A', 'DSN level 3')
  // sqrt(50 Tm DSN × 2 Tm vessel), without another ×20 multiplier.
  await expect(metric(page, 'signal-range')).toHaveText('10 Tm')
  await choose(page, 'Radio setup', kerbalismRss)
  await expect(metric(page, 'signal-range')).toHaveText('707.107 Gm')
  await choose(page, 'Radio setup', kerbalism)
  await expect(metric(page, 'signal-range')).toHaveText('158.114 Gm')
  await section(page, 'Network')
  await expect(combo(page, 'Radio setup')).toHaveText(kerbalism)
  await expect(metric(page, 'relay-relay-power')).toHaveText('5 Mm')
  await choose(page, 'Radio setup', kerbalismCbk)
  await expect(metric(page, 'relay-dsn-power')).toHaveText('50,000 Gm')
  await expect(metric(page, 'relay-dsn-range')).toHaveText('70.7 Gm')
  await section(page, 'Signals')
  await expect(combo(page, 'Radio setup')).toHaveText(kerbalismCbk)
  await expect(combo(page, 'Antenna A')).toHaveText('DSN level 3')
  await expect(metric(page, 'signal-range')).toHaveText('10 Tm')
})

test('preserves final custom powers and saved stock array counts across Kerbalism profiles', async ({ page }) => {
  await openPlanner(page)
  for (const label of ['Relay antenna', 'Surface antenna', 'DSN level']) await choose(page, label, 'Custom power')
  await field(page, 'Relay power').fill('100000000')
  await field(page, 'Surface power').fill('10000000')
  await field(page, 'DSN power').fill('250000000000')
  for (const { name } of profiles) {
    await choose(page, 'Radio setup', name)
    await expect(field(page, 'Relay power')).toHaveValue('100000000')
    await expect(field(page, 'Surface power')).toHaveValue('10000000')
    await expect(field(page, 'DSN power')).toHaveValue('250000000000')
    await expect(metric(page, 'relay-dsn-range')).toHaveText('5 Gm')
  }
  await choose(page, 'Relay antenna', 'HG-5')
  let dialog = await openArray(page, 'Relay antenna', 'Relay antenna array')
  await dialog.getByRole('spinbutton', { name: 'Antenna count 1', exact: true }).fill('4')
  expect(await exactPower(dialog)).toBeCloseTo(100_000_000 * 4 ** .75, 2)
  await apply(dialog)
  for (const [name, power] of [[kerbalism, 5_000_000], [kerbalismRss, 100_000_000], ['Stock CommNet', 5_000_000]] as const) {
    await choose(page, 'Radio setup', name)
    await expect(combo(page, 'Relay antenna')).toHaveText('Array (4)')
    dialog = await openArray(page, 'Relay antenna', 'Relay antenna array')
    await expect(dialog.getByRole('combobox', { name: 'Antenna 1', exact: true })).toHaveText('HG-5')
    await expect(dialog.getByRole('spinbutton', { name: 'Antenna count 1', exact: true })).toHaveValue('4')
    expect(await exactPower(dialog)).toBeCloseTo(power * 4 ** .75, 2)
    await cancel(dialog)
  }
  await section(page, 'Signals')
  for (const endpoint of ['A', 'B']) {
    await choose(page, `Antenna ${endpoint}`, 'Custom power')
    await field(page, `Power ${endpoint}`).fill('100000000000')
  }
  for (const { name } of profiles) {
    await choose(page, 'Radio setup', name)
    await expect(field(page, 'Power A')).toHaveValue('100000000000')
    await expect(field(page, 'Power B')).toHaveValue('100000000000')
    await expect(metric(page, 'signal-range')).toHaveText('100 Gm')
    await expect(metric(page, 'signal-strength')).toHaveText('84.61%')
  }
})

test('offers Communotron 8 only to receiving craft and combines four parts linearly', async ({ page }) => {
  await openPlanner(page)
  await choose(page, 'Radio setup', kerbalism)
  await combo(page, 'Relay antenna').click()
  await expect(page.getByRole('option', { name: 'Communotron 8', exact: true })).toHaveCount(0)
  await page.keyboard.press('Escape')
  let dialog = await openArray(page, 'Relay antenna', 'Relay antenna array')
  await dialog.getByRole('combobox', { name: 'Antenna 1', exact: true }).click()
  await expect(page.getByRole('option', { name: 'Communotron 8', exact: true })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await cancel(dialog)
  await choose(page, 'Surface antenna', 'Communotron 8')
  await expect(metric(page, 'relay-client-power')).toHaveText('250 km')
  dialog = await openArray(page, 'Surface antenna', 'Surface antenna array')
  await expect(dialog.getByText(/Power 250 km · Combines linearly/)).toBeVisible()
  await dialog.getByRole('spinbutton', { name: 'Antenna count 1', exact: true }).fill('4')
  expect(await exactPower(dialog)).toBe(4 * 250_000)
  await apply(dialog)
  await expect(metric(page, 'relay-client-power')).toHaveText('1 Mm')
  await choose(page, 'Radio setup', kerbalismRss)
  await expect(metric(page, 'relay-client-power')).toHaveText('20 Mm')
  dialog = await openArray(page, 'Surface antenna', 'Surface antenna array')
  expect(await exactPower(dialog)).toBe(4 * 5_000_000)
  await expect(dialog.getByText(/Power 5 Mm · Combines linearly/)).toBeVisible()
  await cancel(dialog)
  await section(page, 'Signals')
  for (const endpoint of ['A', 'B']) await choose(page, `Antenna ${endpoint}`, 'Communotron 8')
  await expect(metric(page, 'signal-range')).toHaveText('5 Mm')
  dialog = await openArray(page, 'Antenna A', 'Endpoint A antenna array')
  await dialog.getByRole('spinbutton', { name: 'Antenna count 1', exact: true }).fill('4')
  expect(await exactPower(dialog)).toBe(20_000_000)
  await apply(dialog)
  await expect(metric(page, 'signal-range')).toHaveText('10 Mm')
  await choose(page, 'Radio setup', kerbalism)
  await expect(metric(page, 'signal-power-a')).toHaveText('Effective power 1 Mm')
  await expect(metric(page, 'signal-power-b')).toHaveText('Effective power 250 km')
  await expect(metric(page, 'signal-range')).toHaveText('500 km')
})

test('retains unavailable single Communotron 8 selections without reporting a valid network or signal', async ({ page }) => {
  await openPlanner(page)
  await choose(page, 'Radio setup', kerbalism)
  await choose(page, 'Surface antenna', 'Communotron 8')
  await choose(page, 'Radio setup', 'Stock CommNet')
  await expect(combo(page, 'Surface antenna')).toContainText('(unavailable)')
  await expect(metric(page, 'relay-client-power')).toHaveText('Unavailable in this setup')
  await expect(metric(page, 'relay-dsn-range')).toHaveCount(0)
  await expect(metric(page, 'relay-coverage')).toHaveCount(0)
  await combo(page, 'Surface antenna').click()
  await expect(page.getByRole('option', { name: 'Communotron 8 (unavailable)', exact: true })).toHaveAttribute('aria-disabled', 'true')
  await page.keyboard.press('Escape')
  await choose(page, 'Radio setup', kerbalism)
  await expect(metric(page, 'relay-client-power')).toHaveText('250 km')
  await expect(metric(page, 'relay-dsn-range')).toHaveText('1.1 Gm')
  await choose(page, 'Radio setup', 'Stock CommNet')
  await choose(page, 'Surface antenna', 'Communotron 16')
  await expect(metric(page, 'relay-client-power')).toHaveText('500 km')
  await expect(metric(page, 'relay-dsn-range')).toHaveText('1.1 Gm')
  await section(page, 'Signals')
  await choose(page, 'Radio setup', kerbalism)
  await choose(page, 'Antenna A', 'Communotron 8')
  await choose(page, 'Radio setup', 'Stock CommNet')
  await expect(combo(page, 'Antenna A')).toHaveText('Communotron 8 (unavailable)')
  await expect(metric(page, 'signal-power-a')).toHaveText('Unavailable in this setup')
  await expect(metric(page, 'signal-range')).toHaveCount(0)
  await expect(metric(page, 'signal-strength')).toHaveCount(0)
  await choose(page, 'Radio setup', kerbalism)
  // sqrt(250 km direct × 100 Gm relay).
  await expect(metric(page, 'signal-range')).toHaveText('158.114 Mm')
  await choose(page, 'Radio setup', 'Stock CommNet')
  await choose(page, 'Antenna A', 'RA-100')
  await expect(metric(page, 'signal-range')).toHaveText('100 Gm')
  await expect(metric(page, 'signal-strength')).toHaveText('84.61%')
})

test('preserves unavailable Communotron 8 array rows and supports profile or replacement recovery', async ({ page }) => {
  await openPlanner(page)
  await choose(page, 'Radio setup', kerbalism)
  await choose(page, 'Surface antenna', 'Communotron 8')
  let dialog = await openArray(page, 'Surface antenna', 'Surface antenna array')
  await dialog.getByRole('spinbutton', { name: 'Antenna count 1', exact: true }).fill('4')
  await apply(dialog)
  await choose(page, 'Radio setup', 'Stock CommNet')
  await expect(metric(page, 'relay-client-power')).toHaveText('Edit array or restore its radio setup')
  await expect(metric(page, 'relay-coverage')).toHaveCount(0)
  await expect(metric(page, 'relay-dsn-range')).toHaveCount(0)
  dialog = await openArray(page, 'Surface antenna', 'Surface antenna array')
  await expect(dialog.getByRole('combobox', { name: 'Antenna 1', exact: true })).toHaveText('Unavailable antenna')
  await expect(dialog.getByRole('spinbutton', { name: 'Antenna count 1', exact: true })).toHaveValue('4')
  await expect(dialog.getByTestId('antenna-array-power')).toHaveText('—')
  await expect(dialog.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled()
  await cancel(dialog)
  await choose(page, 'Radio setup', kerbalismRss)
  await expect(combo(page, 'Surface antenna')).toHaveText('Array (4)')
  await expect(metric(page, 'relay-client-power')).toHaveText('20 Mm')
  await section(page, 'Signals')
  await choose(page, 'Antenna B', 'Communotron 8')
  dialog = await openArray(page, 'Antenna B', 'Endpoint B antenna array')
  await dialog.getByRole('spinbutton', { name: 'Antenna count 1', exact: true }).fill('4')
  await apply(dialog)
  await choose(page, 'Radio setup', 'Stock CommNet')
  await expect(metric(page, 'signal-power-b')).toHaveText('Edit array or restore its radio setup')
  await expect(metric(page, 'signal-range')).toHaveCount(0)
  await expect(metric(page, 'signal-strength')).toHaveCount(0)
  dialog = await openArray(page, 'Antenna B', 'Endpoint B antenna array')
  await expect(dialog.getByRole('combobox', { name: 'Antenna 1', exact: true })).toHaveText('Unavailable antenna')
  await expect(dialog.getByRole('spinbutton', { name: 'Antenna count 1', exact: true })).toHaveValue('4')
  await expect(dialog.getByTestId('antenna-array-power')).toHaveText('—')
  await expect(dialog.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled()
  await dialog.getByRole('combobox', { name: 'Antenna 1', exact: true }).click()
  await page.getByRole('option', { name: 'Communotron 16', exact: true }).click()
  expect(await exactPower(dialog)).toBe(2_000_000)
  await apply(dialog)
  await expect(combo(page, 'Antenna B')).toHaveText('Array (4)')
  await expect(metric(page, 'signal-range')).toHaveText('447.214 Mm')
})

test('keeps the selected Kerbalism profile and local drafts through tabs and reopening without changing the mission', async ({ page }) => {
  for (const id of ['stock:kerbin:surface', 'stock:mun:surface']) {
    const node = page.locator(`[data-node-id="${id}"]`)
    await node.focus()
    await node.press('Enter')
  }
  await missionModeButton(page, 'round-trip').click()
  const missionTotal = await page.getByTestId('route-total').textContent()
  expect(missionTotal).toMatch(/[\d,]+ m\/s/)
  await openPlanner(page)
  await choose(page, 'Radio setup', kerbalismRss)
  await field(page, 'Orbit altitude').fill('900')
  await section(page, 'Signals')
  await planner(page).getByRole('button', { name: 'Closest', exact: true }).click()
  await choose(page, 'Antenna A', 'Communotron 8')
  await field(page, 'Range multiplier').fill('2')
  const range = await metric(page, 'signal-range').textContent()
  await section(page, 'Network')
  await expect(combo(page, 'Radio setup')).toHaveText(kerbalismRss)
  await expect(field(page, 'Orbit altitude')).toHaveValue('900')
  await section(page, 'Body data')
  await expect(field(page, 'Range multiplier')).toHaveValue('2')
  await section(page, 'Signals')
  await expect(combo(page, 'Antenna A')).toHaveText('Communotron 8')
  await expect(planner(page).getByRole('slider', { name: 'Relative phase', exact: true })).toHaveAttribute('aria-valuenow', '0')
  await planner(page).getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.getByTestId('route-total')).toHaveText(missionTotal!)
  await expect(missionModeButton(page, 'round-trip')).toHaveAttribute('aria-pressed', 'true')
  await button(page, 'CommNet relay planner').focus()
  await button(page, 'CommNet relay planner').press('Enter')
  await expect(planner(page).getByRole('tab', { name: 'Signals', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(combo(page, 'Radio setup')).toHaveText(kerbalismRss)
  await expect(combo(page, 'Antenna A')).toHaveText('Communotron 8')
  await expect(metric(page, 'signal-range')).toHaveText(range!)
  await page.keyboard.press('Escape')
  await expect(planner(page)).not.toBeVisible()
  await expect(button(page, 'CommNet relay planner')).toBeFocused()
})

test('labels Kerbalism stock and RSS Normal occlusion from the selected radio preset', async ({ page }) => {
  await openPlanner(page)
  await choose(page, 'Radio setup', kerbalism)
  await section(page, 'Body data')
  await choose(page, 'Occlusion', 'KSP normal')
  await expect(panel(page).getByText(/Occlusion uses 0\.75 × the body radius \(KSP normal\)/)).toBeVisible()
  await choose(page, 'Relay body', 'Mun')
  await expect(panel(page).getByText(/Occlusion uses 0\.90 × the body radius \(KSP normal\)/)).toBeVisible()
  for (const name of [kerbalismRss, kerbalismCbk]) {
    await section(page, 'Network')
    await choose(page, 'Radio setup', name)
    await section(page, 'Body data')
    await expect(combo(page, 'Occlusion')).toHaveText('RSS default (1.0)')
    await expect(panel(page).getByText(/Occlusion uses 1\.00 × the body radius \(RSS default\)/)).toBeVisible()
  }
  await section(page, 'Network')
  await choose(page, 'Radio setup', kerbalism)
  await section(page, 'Body data')
  await expect(combo(page, 'Occlusion')).toHaveText('KSP normal')
  await expect(panel(page).getByText(/Occlusion uses 0\.90 × the body radius \(KSP normal\)/)).toBeVisible()
})

for (const viewport of [{ width: 320, height: 568 }, { width: 667, height: 375 }]) {
  test(`keeps Kerbalism radio selection, receiving arrays, and close controls usable at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await openPlanner(page)
    await onScreen(planner(page), page)
    for (const name of ['Network', 'Deployment', 'Body data', 'Signals']) await onScreen(planner(page).getByRole('tab', { name, exact: true }), page)
    await combo(page, 'Radio setup').scrollIntoViewIfNeeded()
    await onScreen(combo(page, 'Radio setup'), page)
    await choose(page, 'Radio setup', kerbalismCbk)
    await choose(page, 'Surface antenna', 'Communotron 8')
    const dialog = await openArray(page, 'Surface antenna', 'Surface antenna array')
    await expect(dialog).toHaveAttribute('aria-describedby', /.+/)
    await expect(dialog.getByText(kerbalismCbk, { exact: true })).toBeVisible()
    await dialog.getByRole('spinbutton', { name: 'Antenna count 1', exact: true }).fill('4')
    await expect(dialog.getByTestId('antenna-array-power')).toHaveText('20 Mm')
    for (const control of [dialog, dialog.getByTestId('antenna-array-power'), dialog.getByRole('button', { name: 'Cancel', exact: true }), dialog.getByRole('button', { name: 'Apply', exact: true })]) await onScreen(control, page)
    await apply(dialog)
    await section(page, 'Signals')
    await expect(combo(page, 'Radio setup')).toHaveText(kerbalismCbk)
    await combo(page, 'Radio setup').scrollIntoViewIfNeeded()
    await onScreen(combo(page, 'Radio setup'), page)
    await choose(page, 'Antenna A', 'Communotron 8')
    await combo(page, 'Antenna A').scrollIntoViewIfNeeded()
    await onScreen(combo(page, 'Antenna A'), page)
    await expect(metric(page, 'signal-power-a')).toHaveText('Effective power 5 Mm')
    await onScreen(planner(page).getByRole('button', { name: 'Close', exact: true }), page)
    await onScreen(planner(page).getByRole('button', { name: 'Close relay planner', exact: true }), page)
    await pageFits(page)
    await planner(page).getByRole('button', { name: 'Close', exact: true }).click()
    await expect(planner(page)).not.toBeVisible()
    await pageFits(page)
  })
}
