import { expect, test, type Locator, type Page } from '@playwright/test'

const kerbalism = 'Kerbalism + CommNet'
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const planner = (page: Page) => page.getByRole('dialog', { name: 'CommNet relay planner', exact: true })
const combo = (page: Page, name: string) => planner(page).getByRole('combobox', { name, exact: true })
const field = (page: Page, name: string) => planner(page).getByRole('spinbutton', { name, exact: true })
const metric = (page: Page, id: string) => planner(page).getByTestId(id)
const rateSummary = (page: Page) => planner(page).locator('summary:visible').filter({ hasText: 'Science rate settings' })
const scienceRate = (page: Page) => metric(page, 'signal-science-rate')
let browserErrors: string[]

test.beforeEach(async ({ page }) => {
  browserErrors = []
  page.on('pageerror', error => browserErrors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()) })
  await page.goto('./')
  await expect(button(page, 'CommNet relay planner')).toBeVisible()
})

test.afterEach(() => {
  expect(browserErrors, 'Science-rate planning should not produce browser errors').toEqual([])
})

async function openPlanner(page: Page) {
  await button(page, 'CommNet relay planner').click()
  await expect(planner(page)).toBeVisible()
}

async function choose(page: Page, label: string, option: string) {
  await combo(page, label).click()
  await page.getByRole('option', { name: option, exact: true }).click()
}

async function section(page: Page, name: 'Network' | 'Signals') {
  await planner(page).getByRole('tab', { name, exact: true }).click()
}

async function openRates(page: Page) {
  const summary = rateSummary(page)
  if (!await summary.evaluate(element => element.parentElement?.hasAttribute('open'))) await summary.click()
}

async function setExponent(page: Page, exponent = '6') {
  const summary = planner(page).locator('summary:visible').filter({ hasText: 'Kerbalism damping' })
  if (!await summary.evaluate(element => element.parentElement?.hasAttribute('open'))) await summary.click()
  await choose(page, 'Damping mode', 'Custom exponent')
  await field(page, 'Damping exponent').fill(exponent)
}

async function openKerbalismSignals(page: Page) {
  await openPlanner(page)
  await choose(page, 'Radio setup', kerbalism)
  await section(page, 'Signals')
}

async function manualHalfRange(page: Page, senderRate = '36000', otherRate = '72000') {
  await setExponent(page)
  await openRates(page)
  await field(page, 'Antenna speed').fill('1')
  await choose(page, 'Signal geometry', 'Manual orbits')
  await field(page, 'Orbit radius A').fill('10')
  await field(page, 'Orbit radius B').fill('15')
  await field(page, 'Central radius').fill('100000')
  for (const endpoint of ['A', 'B']) {
    await choose(page, `Antenna ${endpoint}`, 'Custom power')
    await field(page, `Power ${endpoint}`).fill('10000000000')
  }
  await field(page, 'Full-strength rate A').fill(senderRate)
  await field(page, 'Full-strength rate B').fill(otherRate)
  await planner(page).getByRole('button', { name: 'Closest', exact: true }).click()
  await expect(metric(page, 'signal-range')).toHaveText('10 Gm')
  await expect(metric(page, 'signal-raw-strength')).toHaveText('50%')
}

async function selectMission(page: Page) {
  for (const id of ['stock:kerbin:surface', 'stock:mun:surface']) {
    const node = page.locator(`[data-node-id="${id}"]`)
    await node.focus()
    await node.press('Enter')
  }
  await expect(page.getByTestId('route-total')).toHaveText('5,120 m/s')
}

async function onScreen(locator: Locator, page: Page) {
  await locator.scrollIntoViewIfNeeded()
  const box = await locator.boundingBox()
  expect(box).not.toBeNull()
  if (!box) throw new Error('Expected a visible science-rate control')
  const viewport = page.viewportSize()!
  expect(box.x).toBeGreaterThanOrEqual(-1)
  expect(box.y).toBeGreaterThanOrEqual(-1)
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1)
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1)
}

async function pageFits(page: Page) {
  expect(await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, x: scrollX, y: scrollY })))
    .toEqual({ ...page.viewportSize()!, x: 0, y: 0 })
}

test('converts the reference antenna rate to bits and applies speed and damping separately', async ({ page }) => {
  await openKerbalismSignals(page)
  // RA-100: .480 decimal MB/s × 8,000,000 bit/MB × Normal speed 1.5.
  await expect(metric(page, 'signal-full-strength-rate')).toHaveText('5.76 Mbit/s')
  await openRates(page)
  await expect(field(page, 'Antenna speed')).toHaveValue('1.5')
  await expect(field(page, 'Minimum science rate')).toHaveValue('1')
  await manualHalfRange(page)
  // Half range gives raw S=.5. With k=6, 36,000 × .5^6 = 562.5 bit/s.
  await expect(metric(page, 'signal-strength')).toHaveText('1.56%')
  await expect(metric(page, 'signal-full-strength-rate')).toHaveText('36 kbit/s')
  await expect(scienceRate(page)).toHaveText('562.5 bit/s')
  await field(page, 'Antenna speed').fill('2')
  await expect(metric(page, 'signal-full-strength-rate')).toHaveText('72 kbit/s')
  await expect(scienceRate(page)).toHaveText('1.125 kbit/s')
  await expect(metric(page, 'signal-raw-strength')).toHaveText('50%')
  await expect(metric(page, 'signal-range')).toHaveText('10 Gm')
})

test('uses only the sending vessel rate and keeps its rate attached when swapping endpoints', async ({ page }) => {
  await openKerbalismSignals(page)
  await manualHalfRange(page)
  await field(page, 'Full-strength rate B').fill('1')
  await expect(scienceRate(page)).toHaveText('562.5 bit/s')
  await field(page, 'Full-strength rate B').fill('72000')
  await choose(page, 'Receiving endpoint', 'A · Relay / DSN')
  await expect(scienceRate(page)).toHaveText('1.125 kbit/s')
  await expect(metric(page, 'signal-full-strength-rate')).toHaveText('72 kbit/s')
  await planner(page).getByRole('button', { name: 'Swap signal endpoints', exact: true }).click()
  await expect(combo(page, 'Receiving endpoint')).toHaveText('B · Relay / DSN')
  await expect(field(page, 'Full-strength rate A')).toHaveValue('72000')
  await expect(field(page, 'Full-strength rate B')).toHaveValue('36000')
  await expect(scienceRate(page)).toHaveText('1.125 kbit/s')
  await field(page, 'Full-strength rate A').fill('144000')
  await expect(scienceRate(page)).toHaveText('2.25 kbit/s')
  await expect(metric(page, 'signal-raw-strength')).toHaveText('50%')
})

test('floors only positive rates and never creates science on a zero or disconnected link', async ({ page }) => {
  await openKerbalismSignals(page)
  await manualHalfRange(page, '.0064')
  // .0064 / 64 = .0001 bit/s before the configured minimum.
  await expect(scienceRate(page)).toHaveText('1 bit/s')
  await expect(metric(page, 'signal-rate-floor')).toBeVisible()
  await field(page, 'Minimum science rate').fill('0')
  await expect(scienceRate(page)).toHaveText('1.00e-4 bit/s')
  await expect(metric(page, 'signal-rate-floor')).toHaveCount(0)
  await field(page, 'Minimum science rate').fill('100')
  await field(page, 'Full-strength rate A').fill('0')
  await expect(scienceRate(page)).toHaveText('0 bit/s')
  await expect(metric(page, 'signal-rate-floor')).toHaveCount(0)
  await field(page, 'Full-strength rate A').fill('36000')
  await field(page, 'Antenna speed').fill('0')
  await expect(scienceRate(page)).toHaveText('0 bit/s')
  await field(page, 'Antenna speed').fill('1')
  await setExponent(page, '1000000')
  await expect(scienceRate(page)).toHaveText('0 bit/s')
  await expect(metric(page, 'signal-link-status')).toHaveText('Link available')
  await setExponent(page)
  await planner(page).getByRole('button', { name: 'Opposite', exact: true }).click()
  await expect(metric(page, 'signal-link-status')).toHaveText('Blocked by Manual central body')
  await expect(scienceRate(page)).toHaveText('0 bit/s')
  await planner(page).getByRole('button', { name: 'Closest', exact: true }).click()
  await field(page, 'Orbit radius B').fill('25')
  await expect(metric(page, 'signal-link-status')).toHaveText('Out of antenna range')
  await expect(scienceRate(page)).toHaveText('0 bit/s')
})

test('keeps signal geometry usable while custom rates or shared rate settings need correction', async ({ page }) => {
  await openKerbalismSignals(page)
  await manualHalfRange(page)
  await field(page, 'Full-strength rate A').fill('')
  await expect(scienceRate(page)).toHaveText('Enter sender rate')
  for (const invalid of ['-1', '10000000000000000000']) {
    await field(page, 'Full-strength rate A').fill(invalid)
    await expect(field(page, 'Full-strength rate A')).toHaveAttribute('aria-invalid', 'true')
    await expect(scienceRate(page)).toHaveText('Check sender rate')
    await expect(metric(page, 'signal-range')).toHaveText('10 Gm')
    await expect(metric(page, 'signal-raw-strength')).toHaveText('50%')
    await expect(metric(page, 'signal-link-status')).toHaveText('Link available')
  }
  await field(page, 'Full-strength rate A').fill('36000')
  for (const label of ['Antenna speed', 'Minimum science rate']) {
    await field(page, label).fill('-1')
    await expect(field(page, label)).toHaveAttribute('aria-invalid', 'true')
    await expect(scienceRate(page)).toHaveText('Check rate settings')
    await expect(metric(page, 'signal-raw-strength')).toHaveText('50%')
    await field(page, label).fill('1')
  }
  await expect(scienceRate(page)).toHaveText('562.5 bit/s')
})

test('counts repeated and mixed external antenna rates independently of combined power', async ({ page }) => {
  await openKerbalismSignals(page)
  await openRates(page)
  await field(page, 'Antenna speed').fill('1')
  await expect(metric(page, 'signal-full-strength-rate')).toHaveText('3.84 Mbit/s')
  await choose(page, 'Antenna A', 'Antenna array…')
  let editor = page.getByRole('dialog', { name: 'Endpoint A antenna array', exact: true })
  await editor.getByRole('spinbutton', { name: 'Antenna count 1', exact: true }).fill('2')
  await editor.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(metric(page, 'signal-power-a')).not.toHaveText('Effective power 100 Gm')
  await expect(metric(page, 'signal-full-strength-rate')).toHaveText('3.84 Mbit/s')
  await choose(page, 'Antenna A', 'Antenna array…')
  editor = page.getByRole('dialog', { name: 'Endpoint A antenna array', exact: true })
  await editor.getByRole('button', { name: 'Add antenna', exact: true }).click()
  await editor.getByRole('combobox', { name: 'Antenna 2', exact: true }).click()
  await page.getByRole('option', { name: 'RA-2', exact: true }).click()
  await editor.getByRole('button', { name: 'Apply', exact: true }).click()
  // Geometric mean of two 3.84 Mbit/s antennas and one .144 Mbit/s antenna.
  await expect(metric(page, 'signal-full-strength-rate')).toHaveText('1.285 Mbit/s')
  await choose(page, 'Antenna A', 'Antenna array…')
  editor = page.getByRole('dialog', { name: 'Endpoint A antenna array', exact: true })
  await editor.getByRole('button', { name: 'Add antenna', exact: true }).click()
  await editor.getByRole('combobox', { name: 'Antenna 3', exact: true }).click()
  await page.getByRole('option', { name: 'Internal antenna', exact: true }).click()
  await editor.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(metric(page, 'signal-full-strength-rate')).toHaveText('1.285 Mbit/s')
})

test('distinguishes internal control antennas and DSN receivers from science transmitters', async ({ page }) => {
  await openKerbalismSignals(page)
  await manualHalfRange(page)
  await field(page, 'Orbit radius B').fill('10.00001')
  await choose(page, 'Antenna A', 'Internal antenna')
  await expect(metric(page, 'signal-link-status')).toHaveText('Link available')
  await expect(metric(page, 'signal-raw-strength')).toHaveText('100%')
  await expect(scienceRate(page)).toHaveText('0 bit/s')
  await expect(planner(page).getByText(/Internal antennas do not transmit science/)).toBeVisible()
  await choose(page, 'Antenna A', 'DSN level 3')
  await expect(combo(page, 'Receiving endpoint')).toHaveText('A · Relay / DSN')
  await expect(metric(page, 'signal-full-strength-rate')).toHaveText('72 kbit/s')
  await choose(page, 'Receiving endpoint', 'B · Relay / DSN')
  await expect(scienceRate(page)).toHaveText('Not applicable')
  await expect(planner(page).getByText(/A DSN receives science; choose a vessel as the sender/)).toBeVisible()
  await expect(metric(page, 'signal-link-status')).toHaveText('Link available')
})

test('shares science settings across tabs and profiles while preserving the mission on reopening', async ({ page }) => {
  await selectMission(page)
  await openPlanner(page)
  await choose(page, 'Radio setup', kerbalism)
  await choose(page, 'Relay body', 'Kerbin')
  await setExponent(page)
  await openRates(page)
  await field(page, 'Antenna speed').fill('1')
  // HG-5 base 36,000 bit/s; surface C16 base 17,600 bit/s. Reference
  // orbit r=1.4 Mm, neighbor d=2r sin(60°), surface d=.8 Mm, then S^6.
  await expect(metric(page, 'relay-neighbor-rate')).toHaveText('732.789 bit/s')
  await expect(metric(page, 'relay-station-rate')).toHaveText('246.767 bit/s')
  await field(page, 'Antenna speed').fill('2')
  await expect(metric(page, 'relay-neighbor-rate')).toHaveText('1.466 kbit/s')
  await expect(metric(page, 'relay-station-rate')).toHaveText('493.534 bit/s')
  await field(page, 'Minimum science rate').fill('100')
  await section(page, 'Signals')
  await openRates(page)
  await expect(field(page, 'Antenna speed')).toHaveValue('2')
  await expect(field(page, 'Minimum science rate')).toHaveValue('100')
  for (const radio of ['Kerbalism + RSS', 'Kerbalism + RSS + CBK']) {
    await choose(page, 'Radio setup', radio)
    await expect(metric(page, 'signal-full-strength-rate')).toHaveText('7.68 Mbit/s')
  }
  await choose(page, 'Radio setup', 'Stock CommNet')
  await expect(rateSummary(page)).toHaveCount(0)
  await expect(scienceRate(page)).toHaveCount(0)
  await choose(page, 'Radio setup', kerbalism)
  await openRates(page)
  await expect(field(page, 'Antenna speed')).toHaveValue('2')
  await expect(field(page, 'Minimum science rate')).toHaveValue('100')
  await planner(page).getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.getByTestId('route-total')).toHaveText('5,120 m/s')
  await openPlanner(page)
  await openRates(page)
  await expect(field(page, 'Antenna speed')).toHaveValue('2')
  await expect(field(page, 'Minimum science rate')).toHaveValue('100')
  await section(page, 'Network')
  await openRates(page)
  await expect(field(page, 'Antenna speed')).toHaveValue('2')
  await expect(field(page, 'Minimum science rate')).toHaveValue('100')
})

for (const viewport of [{ width: 320, height: 568 }, { width: 667, height: 375 }, { width: 1920, height: 1080 }]) {
  test(`keeps rate controls and both planning tabs usable at ${viewport.width}×${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport)
    await selectMission(page)
    await openPlanner(page)
    await choose(page, 'Radio setup', kerbalism)
    await setExponent(page)
    await openRates(page)
    await field(page, 'Antenna speed').fill('1')
    await field(page, 'Minimum science rate').fill('0')
    for (const role of ['Relay', 'Surface']) {
      await choose(page, `${role === 'Relay' ? 'Relay' : 'Surface'} antenna`, 'Custom power')
      await field(page, `${role} power`).fill('1000000000')
      await field(page, `${role} full-strength rate`).fill('36000')
      await onScreen(field(page, `${role} full-strength rate`), page)
    }
    for (const id of ['relay-neighbor-rate', 'relay-station-rate']) {
      await expect(metric(page, id)).toHaveText(/bit\/s$/)
      await onScreen(metric(page, id), page)
    }
    await onScreen(planner(page).getByRole('button', { name: 'Close', exact: true }), page)
    await pageFits(page)
    if (testInfo.project.name === 'desktop') await page.screenshot({ path: `/tmp/bitrate-network-${viewport.width}.png`, animations: 'disabled' })
    await section(page, 'Signals')
    await manualHalfRange(page)
    await openRates(page)
    await expect(field(page, 'Minimum science rate')).toHaveValue('0')
    await onScreen(field(page, 'Antenna speed'), page)
    await onScreen(field(page, 'Full-strength rate A'), page)
    await onScreen(field(page, 'Full-strength rate B'), page)
    await expect(scienceRate(page)).toHaveText('562.5 bit/s')
    await onScreen(scienceRate(page), page)
    await onScreen(planner(page).getByRole('button', { name: 'Close', exact: true }), page)
    await onScreen(planner(page).getByRole('button', { name: 'Close relay planner', exact: true }), page)
    await pageFits(page)
    if (testInfo.project.name === 'desktop') await page.screenshot({ path: `/tmp/bitrate-signals-${viewport.width}.png`, animations: 'disabled' })
    await planner(page).getByRole('button', { name: 'Close', exact: true }).click()
    await expect(page.getByTestId('route-total')).toHaveText('5,120 m/s')
    await pageFits(page)
  })
}
