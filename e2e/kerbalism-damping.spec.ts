import { readFile } from 'node:fs/promises'
import { expect, test, type Locator, type Page } from '@playwright/test'

const kerbalism = 'Kerbalism + CommNet'
const kerbalismRss = 'Kerbalism + RSS'
const kerbalismCbk = 'Kerbalism + RSS + CBK'
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const planner = (page: Page) => page.getByRole('dialog', { name: 'CommNet relay planner', exact: true })
const combo = (page: Page, name: string) => planner(page).getByRole('combobox', { name, exact: true })
const field = (page: Page, name: string) => planner(page).getByRole('spinbutton', { name, exact: true })
const metric = (page: Page, id: string) => planner(page).getByTestId(id)
const dampingSummary = (page: Page) => planner(page).locator('summary:visible').filter({ hasText: 'Kerbalism damping' })
let browserErrors: string[]

test.beforeEach(async ({ page }) => {
  browserErrors = []
  page.on('pageerror', error => browserErrors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()) })
  await page.goto('./')
  await expect(button(page, 'CommNet relay planner')).toBeVisible()
})

test.afterEach(() => {
  expect(browserErrors, 'Damping and antenna recovery should not produce browser errors').toEqual([])
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

async function openDamping(page: Page) {
  const summary = dampingSummary(page)
  if (!await summary.evaluate(element => element.parentElement?.hasAttribute('open'))) await summary.click()
}

async function customExponent(page: Page, value: string) {
  await openDamping(page)
  await choose(page, 'Damping mode', 'Custom exponent')
  await field(page, 'Damping exponent').fill(value)
}

async function manualHalfRange(page: Page) {
  if (await combo(page, 'Signal geometry').textContent() !== 'Manual orbits') await choose(page, 'Signal geometry', 'Manual orbits')
  await field(page, 'Orbit radius A').fill('10')
  await field(page, 'Orbit radius B').fill('15')
  await field(page, 'Central radius').fill('100000')
  for (const endpoint of ['A', 'B']) {
    await choose(page, `Antenna ${endpoint}`, 'Custom power')
    await field(page, `Power ${endpoint}`).fill('10000000000')
  }
  await planner(page).getByRole('button', { name: 'Closest', exact: true }).click()
  await expect(metric(page, 'signal-distance')).toHaveText('5 Gm')
  await expect(metric(page, 'signal-range')).toHaveText('10 Gm')
}

async function pageFits(page: Page) {
  expect(await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, x: scrollX, y: scrollY })))
    .toEqual({ ...page.viewportSize()!, x: 0, y: 0 })
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

test('shows calibrated Kerbalism damping separately from raw strength, range, and central occlusion', async ({ page }) => {
  await openPlanner(page)
  await choose(page, 'Radio setup', kerbalism)
  await section(page, 'Signals')
  // Independent scalar reference: AU=13,599,840,256 m, maximum DSN=250 Gm.
  // Calibration gives k=6.009182065257001. The RA-100 pair has a 100 Gm range.
  await expect(dampingSummary(page)).toContainText('k = 6.00918')
  await expect(metric(page, 'signal-range')).toHaveText('100 Gm')
  await expect(metric(page, 'signal-raw-strength')).toHaveText('84.61%')
  await expect(metric(page, 'signal-strength')).toHaveText('36.63%')
  await expect(metric(page, 'signal-best')).toHaveText('91.59%')
  await expect(metric(page, 'signal-worst')).toHaveText('14.77%')
  const chart = metric(page, 'signals-strength-chart')
  await expect(chart.locator('[data-signal-curve]')).toHaveCount(3)
  await expect(chart.locator('[data-signal-curve="raw-commnet"]')).toHaveCount(1)
  expect(await chart.locator('[data-signal-curve="raw-commnet"]').getAttribute('d'))
    .not.toBe(await chart.locator('[data-signal-curve="with-occlusion"]').getAttribute('d'))
  await customExponent(page, '6')
  await expect(metric(page, 'signal-strength')).toHaveText('36.69%')
  await expect(metric(page, 'signal-raw-strength')).toHaveText('84.61%')
  await planner(page).getByRole('button', { name: 'Opposite', exact: true }).click()
  await expect(metric(page, 'signal-strength')).toHaveText('0%')
  await expect(metric(page, 'signal-raw-strength')).toHaveText('0%')
  await expect(metric(page, 'signal-link-status')).toHaveText('Blocked by Kerbol')
  await expect(metric(page, 'signal-worst')).toHaveText('14.81%')
  await choose(page, 'Radio setup', 'Stock CommNet')
  await expect(metric(page, 'signal-worst')).toHaveText('72.74%')
  await expect(metric(page, 'signal-raw-strength')).toHaveCount(0)
  await expect(chart.locator('[data-signal-curve]')).toHaveCount(2)
})

test('calculates local neighbor and sample-station strengths and masks blocked links', async ({ page }) => {
  await openPlanner(page)
  await expect(metric(page, 'relay-neighbor-signal')).toHaveText('52.25%')
  await expect(metric(page, 'relay-station-signal')).toHaveText('49.11%')
  await choose(page, 'Radio setup', kerbalism)
  await customExponent(page, '6')
  // HG-5 ring: d=2×1.4Mm×sin(60°), range5Mm. Ground hop: d=.8Mm,
  // range=sqrt(5Mm×.5Mm). These figures use the current sample-station phase.
  await expect(metric(page, 'relay-neighbor-raw-signal')).toHaveText('52.25%')
  await expect(metric(page, 'relay-neighbor-signal')).toHaveText('2.04%')
  await expect(metric(page, 'relay-station-raw-signal')).toHaveText('49.11%')
  await expect(metric(page, 'relay-station-signal')).toHaveText('1.4%')
  await expect(metric(page, 'relay-ring-status')).toContainText('Available')
  await expect(metric(page, 'relay-coverage')).toHaveText('100%')
  await planner(page).getByRole('button', { name: 'Rotate relays', exact: true }).click()
  await expect(metric(page, 'relay-neighbor-signal')).toHaveText('2.04%')
  await expect(metric(page, 'relay-station-signal')).not.toHaveText('1.4%')
  await field(page, 'Orbit altitude').fill('400')
  await expect(metric(page, 'relay-ring-status')).toContainText('Body blocks links')
  await expect(metric(page, 'relay-neighbor-signal')).toHaveText('0%')
  await expect(metric(page, 'relay-neighbor-raw-signal')).toHaveText('0%')
  await choose(page, 'Relay body', 'Jool')
  await expect(metric(page, 'relay-station-signal')).toHaveText(/No surface|N\/A|—/)
})

test('does not confuse a working relay ring with a reachable sample surface craft', async ({ page }) => {
  await openPlanner(page)
  await choose(page, 'Radio setup', kerbalism)
  await customExponent(page, '6')
  await choose(page, 'Surface antenna', 'Custom power')
  await field(page, 'Surface power').fill('1')
  await expect(metric(page, 'relay-ring-status')).toContainText('Available')
  await expect(metric(page, 'relay-neighbor-signal')).toHaveText('2.04%')
  await expect(metric(page, 'relay-coverage')).toHaveText('0%')
  await expect(metric(page, 'relay-station-signal')).toHaveText('0%')
  await expect(metric(page, 'relay-station-raw-signal')).toHaveText('0%')
})

test('keeps home calibration independent of the current pair and selected DSN while sharing overrides across tabs', async ({ page }) => {
  for (const id of ['stock:kerbin:surface', 'stock:mun:surface']) {
    const node = page.locator(`[data-node-id="${id}"]`)
    await node.focus()
    await node.press('Enter')
  }
  const missionTotal = await page.getByTestId('route-total').textContent()
  await openPlanner(page)
  await choose(page, 'Radio setup', kerbalism)
  await section(page, 'Signals')
  await choose(page, 'Antenna A', 'DSN level 1')
  await expect(dampingSummary(page)).toContainText('k = 6.00918')
  await choose(page, 'Planet B', 'Dres')
  await choose(page, 'Planet A', 'Eve')
  await field(page, 'Range multiplier').fill('2')
  await expect(dampingSummary(page)).toContainText('k = 6.00918')
  await customExponent(page, '8')
  await section(page, 'Network')
  await openDamping(page)
  await expect(combo(page, 'Damping mode')).toHaveText('Custom exponent')
  await expect(field(page, 'Damping exponent')).toHaveValue('8')
  await section(page, 'Signals')
  await expect(dampingSummary(page)).toContainText('k = 8')
  await planner(page).getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.getByTestId('route-total')).toHaveText(missionTotal!)
  await openPlanner(page)
  await openDamping(page)
  await expect(field(page, 'Damping exponent')).toHaveValue('8')
  await expect(field(page, 'Range multiplier')).toHaveValue('2')
})

test('validates custom damping without changing raw reach or silently accepting an invalid exponent', async ({ page }) => {
  await openPlanner(page)
  await choose(page, 'Radio setup', kerbalism)
  await section(page, 'Signals')
  await customExponent(page, '6')
  await manualHalfRange(page)
  await expect(metric(page, 'signal-raw-strength')).toHaveText('50%')
  await expect(metric(page, 'signal-strength')).toHaveText('1.56%')
  await expect(metric(page, 'signal-link-status')).toHaveText('Link available')
  for (const invalid of ['', '0', '-1', '1000001']) {
    await field(page, 'Damping exponent').fill(invalid)
    await expect(field(page, 'Damping exponent')).toHaveAttribute('aria-invalid', 'true')
    await expect(metric(page, 'signal-strength')).toHaveCount(0)
  }
  await choose(page, 'Radio setup', 'Stock CommNet')
  await expect(metric(page, 'signal-strength')).toHaveText('50%')
  await choose(page, 'Radio setup', kerbalism)
  await expect(metric(page, 'signal-strength')).toHaveCount(0)
  await openDamping(page)
  await field(page, 'Damping exponent').fill('1000000')
  await expect(metric(page, 'signal-strength')).toHaveText('0%')
  await expect(metric(page, 'signal-raw-strength')).toHaveText('50%')
  await expect(metric(page, 'signal-link-status')).toHaveText('Link available')
  await expect(metric(page, 'signal-range')).toHaveText('10 Gm')
})

test('uses the RSS home orbit for automatic exponents below one and labels a CBK calibration fallback', async ({ page }) => {
  await button(page, 'RSS').click()
  await openPlanner(page)
  await choose(page, 'Radio setup', kerbalismRss)
  await section(page, 'Signals')
  // Pinned RSS Earth SMA149598261150.4425m and maxDSN250Gm calibrate at1.5AU.
  await expect(dampingSummary(page)).toContainText('k = 0.0427628')
  await manualHalfRange(page)
  await expect(metric(page, 'signal-raw-strength')).toHaveText('50%')
  await expect(metric(page, 'signal-strength')).toHaveText('97.08%')
  await choose(page, 'Radio setup', kerbalismCbk)
  await expect(dampingSummary(page)).toContainText('k = 6')
  await expect(dampingSummary(page)).toContainText('fallback')
  await expect(metric(page, 'signal-strength')).toHaveText('1.56%')
  await openDamping(page)
  await expect(planner(page).getByText(/Automatic calculation found no suitable reference distance/)).toBeVisible()
})

test('labels unknown custom home systems as a fallback and allows a save-specific override', async ({ page }) => {
  const pack = JSON.parse(await readFile('docs/examples/custom-pack.json', 'utf8')) as { name: string }
  await button(page, 'Custom planet packs').click()
  const manager = page.getByRole('dialog', { name: 'Planet packs', exact: true })
  await manager.getByRole('tab', { name: 'Custom packs', exact: true }).click()
  await manager.getByLabel('Import planet pack', { exact: true }).setInputFiles({ name: 'unknown-damping.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(pack)) })
  await manager.getByRole('button', { name: `Use ${pack.name}`, exact: true }).click()
  await openPlanner(page)
  await section(page, 'Signals')
  await choose(page, 'Radio setup', kerbalism)
  await expect(dampingSummary(page)).toContainText('k = 6')
  await expect(dampingSummary(page)).toContainText('fallback')
  await openDamping(page)
  await expect(planner(page).getByText(/The homeworld’s orbit is unknown/)).toBeVisible()
  await manualHalfRange(page)
  await expect(metric(page, 'signal-strength')).toHaveText('1.56%')
  await customExponent(page, '1')
  await expect(metric(page, 'signal-strength')).toHaveText('50%')
  await expect(metric(page, 'signal-raw-strength')).toHaveText('50%')
})

test('replaces numeric missing-antenna errors with profile restore and antenna or array repair actions', async ({ page }) => {
  await openPlanner(page)
  await choose(page, 'Radio setup', kerbalism)
  await choose(page, 'Surface antenna', 'Communotron 8')
  await choose(page, 'Radio setup', 'Stock CommNet')
  await expect(planner(page).getByRole('alert')).toContainText('Communotron 8')
  await expect(planner(page).getByRole('alert')).toContainText('unavailable in this radio setup')
  await expect(planner(page).getByText(/1000000000000000000/)).toHaveCount(0)
  await planner(page).getByRole('button', { name: kerbalism, exact: true }).click()
  await expect(metric(page, 'relay-client-power')).toHaveText('250 km')
  await choose(page, 'Radio setup', 'Stock CommNet')
  await planner(page).getByRole('button', { name: 'Use Communotron 16', exact: true }).click()
  await expect(metric(page, 'relay-client-power')).toHaveText('500 km')
  await expect(metric(page, 'relay-neighbor-signal')).toHaveText('52.25%')
  await section(page, 'Signals')
  await choose(page, 'Radio setup', kerbalism)
  await choose(page, 'Antenna A', 'Communotron 8')
  await choose(page, 'Antenna A', 'Antenna array…')
  const editor = page.getByRole('dialog', { name: 'Endpoint A antenna array', exact: true })
  await editor.getByRole('spinbutton', { name: 'Antenna count 1', exact: true }).fill('4')
  await editor.getByRole('button', { name: 'Apply', exact: true }).click()
  await choose(page, 'Radio setup', 'Stock CommNet')
  await expect(planner(page).getByRole('alert')).toContainText('Communotron 8')
  await expect(metric(page, 'signal-strength')).toHaveCount(0)
  await expect(planner(page).getByText(/1000000000000000000/)).toHaveCount(0)
  await planner(page).getByRole('button', { name: 'Edit antenna array', exact: true }).click()
  await expect(editor.getByRole('spinbutton', { name: 'Antenna count 1', exact: true })).toHaveValue('4')
  await expect(editor.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled()
  await editor.getByRole('combobox', { name: 'Antenna 1', exact: true }).click()
  await page.getByRole('option', { name: 'Communotron 16', exact: true }).click()
  await editor.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(metric(page, 'signal-range')).toHaveText('447.214 Mm')
})

for (const viewport of [{ width: 320, height: 568 }, { width: 667, height: 375 }]) {
  test(`keeps damping controls, strength readouts, and antenna recovery usable at ${viewport.width}×${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport)
    await openPlanner(page)
    await choose(page, 'Radio setup', kerbalism)
    await customExponent(page, '6')
    await metric(page, 'relay-neighbor-signal').scrollIntoViewIfNeeded()
    await onScreen(metric(page, 'relay-neighbor-signal'), page)
    await expect(metric(page, 'relay-neighbor-signal')).toHaveText('2.04%')
    if (testInfo.project.name === 'desktop') await page.screenshot({ path: `/tmp/damping-network-${viewport.width}.png`, animations: 'disabled' })
    await section(page, 'Signals')
    await openDamping(page)
    await field(page, 'Damping exponent').scrollIntoViewIfNeeded()
    await onScreen(field(page, 'Damping exponent'), page)
    await expect(field(page, 'Damping exponent')).toHaveValue('6')
    await metric(page, 'signal-strength').scrollIntoViewIfNeeded()
    await expect(metric(page, 'signal-strength')).toHaveText('36.69%')
    await onScreen(metric(page, 'signal-strength'), page)
    if (testInfo.project.name === 'desktop') await page.screenshot({ path: `/tmp/damping-signals-${viewport.width}.png`, animations: 'disabled' })
    await choose(page, 'Antenna A', 'Communotron 8')
    await choose(page, 'Radio setup', 'Stock CommNet')
    const replace = planner(page).getByRole('button', { name: 'Use RA-100', exact: true })
    await replace.scrollIntoViewIfNeeded()
    await onScreen(replace, page)
    await onScreen(planner(page).getByRole('button', { name: 'Close', exact: true }), page)
    await onScreen(planner(page).getByRole('button', { name: 'Close relay planner', exact: true }), page)
    await pageFits(page)
    if (testInfo.project.name === 'desktop') await page.screenshot({ path: `/tmp/damping-recovery-${viewport.width}.png`, animations: 'disabled' })
    await replace.click()
    await expect(metric(page, 'signal-strength')).toHaveText('84.61%')
    await planner(page).getByRole('button', { name: 'Close', exact: true }).click()
    await pageFits(page)
  })
}
