import { expect, test, type Locator, type Page } from '@playwright/test'
import { preferAdvancedRelayMode } from './helpers/relayMode'
import { selectCircularSignalReference } from './helpers/signalGeometry'

const pbc = 'Probes Before Crew + CommNet'
const pbcKerbalism = 'Probes Before Crew + Kerbalism'
const revision = '85eafa7e7b26723cc48d86e53d5d178a3e3d3d99'
const planner = (page: Page) => page.getByRole('dialog', { name: 'CommNet relay planner', exact: true })
const combo = (page: Page, name: string) => /^Antenna [AB]$/.test(name)
  ? planner(page).locator(`[data-signal-endpoint-config="${name.at(-1)!.toLowerCase()}"]`).getByRole('combobox')
  : planner(page).getByRole('combobox', { name, exact: true })
const field = (page: Page, name: string) => planner(page).getByRole('spinbutton', { name, exact: true })
const metric = (page: Page, id: string) => planner(page).getByTestId(id)
let browserErrors: string[]

test.beforeEach(async ({ page }) => {
  browserErrors = []
  page.on('pageerror', error => browserErrors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()) })
  await preferAdvancedRelayMode(page)
  await page.goto('./')
  await expect(page.getByRole('button', { name: 'CommNet relay planner', exact: true })).toBeVisible()
})

test.afterEach(() => {
  expect(browserErrors, 'PBC radio planning should not produce browser errors').toEqual([])
})

async function openPlanner(page: Page) {
  await page.getByRole('button', { name: 'CommNet relay planner', exact: true }).click()
  await expect(planner(page)).toBeVisible()
}

async function closePlanner(page: Page) {
  await planner(page).getByRole('button', { name: 'Close', exact: true }).click()
  await expect(planner(page)).not.toBeVisible()
}

async function choose(page: Page, label: string, option: string) {
  await combo(page, label).click()
  await page.getByRole('option', { name: option, exact: true }).click()
}

async function section(page: Page, name: 'Network' | 'Deployment' | 'Body data' | 'Signals') {
  await planner(page).getByRole('tab', { name, exact: true }).click()
  if (name === 'Signals') await selectCircularSignalReference(page)
}

async function setMode(page: Page, mode: 'Basic' | 'Advanced') {
  await planner(page).getByRole('group', { name: 'Relay planner mode', exact: true })
    .getByRole('button', { name: mode, exact: true }).click()
}

async function openDetails(page: Page, name: string) {
  const summary = planner(page).locator('summary:visible').filter({ hasText: name })
  if (!await summary.evaluate(element => element.parentElement!.hasAttribute('open'))) await summary.click()
}

async function openArray(page: Page, label = 'Relay antenna', name = 'Relay antenna array') {
  await choose(page, label, 'Antenna array…')
  const dialog = page.getByRole('dialog', { name, exact: true })
  await expect(dialog).toBeVisible()
  return dialog
}

async function exactPower(dialog: Locator) {
  const title = await dialog.getByTestId('antenna-array-power').getAttribute('title')
  expect(title).toMatch(/ m$/)
  return Number(title!.replace(/[, m]/g, ''))
}

async function finishArray(dialog: Locator, action: 'Apply' | 'Cancel') {
  await dialog.getByRole('button', { name: action, exact: true }).click()
  await expect(dialog).not.toBeVisible()
}

test('offers explicit PBC profiles, source references, and the individually patched antenna powers', async ({ page }) => {
  await openPlanner(page)
  await expect(combo(page, 'Radio setup')).toHaveText('Stock CommNet')
  await combo(page, 'Radio setup').click()
  await expect(page.getByRole('option', { name: pbc, exact: true })).toHaveAttribute('data-value', 'pbc')
  await expect(page.getByRole('option', { name: pbcKerbalism, exact: true })).toHaveAttribute('data-value', 'pbc-kerbalism')
  await expect(page.getByRole('option').filter({ hasText: /Probes Before Crew.*RSS|RSS.*Probes Before Crew/ })).toHaveCount(0)
  await page.getByRole('option', { name: pbc, exact: true }).click()
  // Pinned v3.3.2 changes each part separately; these are not a universal scale.
  for (const [name, power] of [['HG-5', '20 Mm'], ['RA-2', '2 Gm'], ['RA-15', '20 Gm'], ['RA-100', '100 Gm']] as const) {
    await choose(page, 'Relay antenna', name)
    await expect(metric(page, 'relay-relay-power')).toHaveText(power)
  }
  for (const [name, power] of [
    ['Internal antenna', '5 km'], ['Communotron 16', '1 Mm'], ['Communotron 16-S', '250 km'],
    ['Communotron DTS-M1', '5 Gm'], ['Communotron HG-55', '25 Gm'], ['Communotron 88-88', '100 Gm'],
  ] as const) {
    await choose(page, 'Surface antenna', name)
    await expect(metric(page, 'relay-client-power')).toHaveText(power)
  }
  await expect(metric(page, 'relay-dsn-power')).toHaveText('250 Gm')
  await expect(field(page, 'DSN modifier')).toHaveValue('1')
  await section(page, 'Body data')
  await planner(page).getByText('Body data and radio sources', { exact: true }).click()
  await expect(planner(page).locator(`a[href*="Moonlington/ProbesBeforeCrew/blob/${revision}/"]`).first()).toBeVisible()
})

test('recomputes saved arrays from final part powers without changing their models or counts', async ({ page }) => {
  await openPlanner(page)
  let dialog = await openArray(page)
  await dialog.getByRole('spinbutton', { name: 'Antenna count 1', exact: true }).fill('4')
  expect(await exactPower(dialog)).toBeCloseTo(5_000_000 * 4 ** .75, 2)
  await finishArray(dialog, 'Apply')
  for (const [profile, partPower, range] of [
    [pbc, 20_000_000, '3.8 Gm'], [pbcKerbalism, 20_000_000, '3.8 Gm'],
    ['Stock CommNet', 5_000_000, '1.9 Gm'], ['Kerbalism + CommNet', 5_000_000, '1.9 Gm'],
  ] as const) {
    await choose(page, 'Radio setup', profile)
    await expect(combo(page, 'Relay antenna')).toHaveText('Array (4)')
    await expect(metric(page, 'relay-dsn-range')).toHaveText(range)
    dialog = await openArray(page)
    await expect(dialog.getByRole('combobox', { name: 'Antenna 1', exact: true })).toHaveText('HG-5')
    await expect(dialog.getByRole('spinbutton', { name: 'Antenna count 1', exact: true })).toHaveValue('4')
    expect(await exactPower(dialog)).toBeCloseTo(partPower * 4 ** .75, 2)
    await finishArray(dialog, 'Cancel')
  }
  await choose(page, 'Radio setup', pbc)
  dialog = await openArray(page, 'Surface antenna', 'Surface antenna array')
  await dialog.getByRole('spinbutton', { name: 'Antenna count 1', exact: true }).fill('4')
  expect(await exactPower(dialog)).toBe(4_000_000)
  await finishArray(dialog, 'Apply')
  await choose(page, 'Radio setup', 'Stock CommNet')
  await expect(combo(page, 'Surface antenna')).toHaveText('Array (4)')
  await expect(metric(page, 'relay-client-power')).toHaveText('2 Mm')
  await choose(page, 'Radio setup', pbc)
  await expect(metric(page, 'relay-client-power')).toHaveText('4 Mm')
})

test('keeps final custom powers unchanged and bypasses the optional PBC DSN modifier for custom DSN power', async ({ page }) => {
  await openPlanner(page)
  await choose(page, 'Radio setup', pbc)
  await field(page, 'DSN modifier').fill('0.35')
  for (const label of ['Relay antenna', 'Surface antenna', 'DSN level']) await choose(page, label, 'Custom power')
  await field(page, 'Relay power').fill('100000000')
  await field(page, 'Surface power').fill('10000000')
  await field(page, 'DSN power').fill('250000000000')
  for (const profile of [pbc, pbcKerbalism, 'Stock CommNet', 'Kerbalism + CommNet', pbc]) {
    await choose(page, 'Radio setup', profile)
    await expect(field(page, 'Relay power')).toHaveValue('100000000')
    await expect(field(page, 'Surface power')).toHaveValue('10000000')
    await expect(field(page, 'DSN power')).toHaveValue('250000000000')
    await expect(metric(page, 'relay-dsn-range')).toHaveText('5 Gm')
  }
  await expect(field(page, 'DSN modifier')).toHaveValue('0.35')
  await section(page, 'Signals')
  for (const endpoint of ['A', 'B']) {
    await choose(page, `Antenna ${endpoint}`, 'Custom power')
    await field(page, `Power ${endpoint}`).fill('100000000000')
  }
  for (const profile of [pbc, 'Stock CommNet', pbcKerbalism]) {
    await choose(page, 'Radio setup', profile)
    await expect(field(page, 'Power A')).toHaveValue('100000000000')
    await expect(field(page, 'Power B')).toHaveValue('100000000000')
    await expect(metric(page, 'signal-range')).toHaveText('100 Gm')
    await expect(metric(page, 'signal-strength')).toHaveText('84.61%')
  }
})

test('uses PBC local antenna powers while preserving Kerbalism efficiency and byte-rate calculations', async ({ page }) => {
  await openPlanner(page)
  await choose(page, 'Radio setup', pbc)
  await expect(metric(page, 'relay-coverage')).toHaveText('100%')
  await expect(metric(page, 'relay-neighbor-signal')).toHaveText('95.95%')
  await expect(metric(page, 'relay-station-signal')).toHaveText('91.54%')
  await expect(metric(page, 'relay-dsn-range')).toHaveText('2.2 Gm')
  await expect(metric(page, 'relay-neighbor-transmission-efficiency')).toHaveCount(0)
  await choose(page, 'Radio setup', pbcKerbalism)
  await expect(metric(page, 'relay-neighbor-signal')).toHaveText('95.95%')
  await expect(metric(page, 'relay-station-signal')).toHaveText('91.54%')
  // Unchanged Kerbalism 3.44 rates .0045/.0022 MB/s, speed1.5, k6.009182065.
  await expect(metric(page, 'relay-neighbor-transmission-efficiency')).toHaveText('77.98%')
  await expect(metric(page, 'relay-station-transmission-efficiency')).toHaveText('58.81%')
  await expect(metric(page, 'relay-neighbor-rate')).toHaveText('5.264 kB/s')
  await expect(metric(page, 'relay-station-rate')).toHaveText('1.941 kB/s')
  const rate = await metric(page, 'relay-neighbor-rate').textContent()
  await setMode(page, 'Basic')
  await expect(metric(page, 'relay-neighbor-rate')).toHaveText(rate!)
  await expect(planner(page).getByRole('note')).toHaveCount(0)
  await setMode(page, 'Advanced')
  await openDetails(page, 'Science rate settings')
  await expect(field(page, 'Minimum science rate')).toHaveValue('1')
  await expect(planner(page).getByText(/bit\/s.*MinimumScienceRate|MinimumScienceRate.*bit\/s/)).toBeVisible()
})

test('shares the optional DSN modifier between tabs and recalibrates Kerbalism using the effective maximum DSN', async ({ page }) => {
  await openPlanner(page)
  await choose(page, 'Radio setup', pbcKerbalism)
  await section(page, 'Signals')
  await expect(metric(page, 'signal-range')).toHaveText('100 Gm')
  await expect(metric(page, 'signal-strength')).toHaveText('84.61%')
  await expect(metric(page, 'signal-transmission-efficiency')).toHaveText('36.63%')
  await choose(page, 'Antenna A', 'DSN level 3')
  await expect(metric(page, 'signal-range')).toHaveText('158.114 Gm')
  await expect(metric(page, 'signal-strength')).toHaveText('93.4%')
  await expect(metric(page, 'signal-transmission-efficiency')).toHaveText('66.33%')
  await expect(metric(page, 'signal-science-rate')).toHaveText('477.575 kB/s')
  await field(page, 'DSN modifier').fill('0.35')
  // sqrt((250G×.35)×100G); calibration uses87.5G, independently of this pair.
  await expect(metric(page, 'signal-range')).toHaveText('93.541 Gm')
  await expect(metric(page, 'signal-strength')).toHaveText('82.65%')
  await expect(metric(page, 'signal-transmission-efficiency')).toHaveText('86.34%')
  await expect(metric(page, 'signal-science-rate')).toHaveText('621.674 kB/s')
  await expect(planner(page).locator('summary:visible').filter({ hasText: 'Kerbalism damping' })).toContainText('k = 0.770706')
  await setMode(page, 'Basic')
  await expect(field(page, 'DSN modifier')).toHaveCount(0)
  await expect(metric(page, 'signal-range')).toHaveText('93.541 Gm')
  await expect(planner(page).getByRole('note')).toContainText('Custom advanced settings are active.')
  await planner(page).getByRole('button', { name: 'View settings', exact: true }).click()
  await expect(field(page, 'DSN modifier')).toHaveValue('0.35')
  await choose(page, 'Radio setup', 'Kerbalism + CommNet')
  await expect(metric(page, 'signal-range')).toHaveText('158.114 Gm')
  await choose(page, 'Radio setup', pbcKerbalism)
  await expect(field(page, 'DSN modifier')).toHaveValue('0.35')
  await section(page, 'Network')
  await expect(field(page, 'DSN modifier')).toHaveValue('0.35')
  await expect(metric(page, 'relay-dsn-power')).toHaveText('87.5 Gm')
  await expect(metric(page, 'relay-dsn-range')).toHaveText('1.3 Gm')
  await expect(metric(page, 'relay-neighbor-signal')).toHaveText('95.95%')
  await field(page, 'DSN modifier').fill('1')
  await setMode(page, 'Basic')
  await expect(planner(page).getByRole('note')).toHaveCount(0)
})

test('keeps invalid hidden DSN settings actionable and restores default calculations without a stale notice', async ({ page }) => {
  await openPlanner(page)
  await choose(page, 'Radio setup', pbcKerbalism)
  for (const [tab, invalid, resultId] of [['Network', '0', 'relay-coverage'], ['Signals', '', 'signal-strength']] as const) {
    await section(page, tab)
    // This workflow checks the absence of custom settings, so retain the new
    // default geometry rather than the circular scalar fixtures used above.
    if (tab === 'Signals') await choose(page, 'Signal geometry', 'Actual orbits')
    await field(page, 'DSN modifier').fill(invalid)
    const warning = planner(page).getByRole('alert').filter({ hasText: 'Enter a valid DSN modifier' })
    await expect(warning).toBeVisible()
    await expect(metric(page, resultId)).toHaveCount(0)
    await setMode(page, 'Basic')
    await expect(warning).toBeVisible()
    await expect(field(page, 'DSN modifier')).toHaveCount(0)
    await warning.getByRole('button', { name: 'Edit DSN modifier in Advanced mode', exact: true }).click()
    await expect(field(page, 'DSN modifier')).toHaveValue(invalid)
    await field(page, 'DSN modifier').fill('1')
    await expect(warning).toHaveCount(0)
    await expect(metric(page, resultId)).toHaveCount(1)
    await setMode(page, 'Basic')
    await expect(planner(page).getByRole('note')).toHaveCount(0)
    await setMode(page, 'Advanced')
  }
})

test('keeps Communotron 8 direct-only and restores the matching PBC Kerbalism profile for unavailable arrays', async ({ page }) => {
  await openPlanner(page)
  await choose(page, 'Radio setup', pbcKerbalism)
  await combo(page, 'Relay antenna').click()
  await expect(page.getByRole('option', { name: 'Communotron 8', exact: true })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await choose(page, 'Surface antenna', 'Communotron 8')
  await expect(metric(page, 'relay-client-power')).toHaveText('250 km')
  const dialog = await openArray(page, 'Surface antenna', 'Surface antenna array')
  await dialog.getByRole('spinbutton', { name: 'Antenna count 1', exact: true }).fill('2')
  expect(await exactPower(dialog)).toBe(500_000)
  await finishArray(dialog, 'Apply')
  await choose(page, 'Radio setup', pbc)
  await expect(planner(page).getByRole('alert')).toContainText('Communotron 8')
  await planner(page).getByRole('button', { name: pbcKerbalism, exact: true }).click()
  await expect(combo(page, 'Radio setup')).toHaveText(pbcKerbalism)
  await expect(combo(page, 'Surface antenna')).toHaveText('Array (2)')
  await expect(metric(page, 'relay-client-power')).toHaveText('500 km')
})

test('never enables PBC automatically for OPM or Kcalbeloh physical data', async ({ page }) => {
  await page.getByRole('button', { name: 'OPM', exact: true }).click()
  await openPlanner(page)
  await expect(combo(page, 'Radio setup')).toHaveText('Stock CommNet')
  await choose(page, 'Radio setup', pbc)
  await choose(page, 'Relay body', 'Duna')
  await expect(combo(page, 'Radio setup')).toHaveText(pbc)
  await closePlanner(page)
  await page.getByRole('button', { name: 'Custom planet packs', exact: true }).click()
  const manager = page.getByRole('dialog', { name: 'Planet packs', exact: true })
  await manager.getByRole('tab', { name: 'Add-ons', exact: true }).click()
  await manager.getByRole('button', { name: 'Use Stock + Kcalbeloh', exact: true }).click()
  await expect(manager).not.toBeVisible()
  await openPlanner(page)
  await expect(combo(page, 'Radio setup')).toHaveText('Stock CommNet')
  await choose(page, 'Radio setup', pbc)
  await choose(page, 'Relay body', 'Suluco')
  await expect(combo(page, 'Radio setup')).toHaveText(pbc)
  await expect(metric(page, 'relay-relay-power')).toHaveText('20 Mm')
})

test('keeps PBC controls, saved advanced settings, diagrams, and arrays usable at 375px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await openPlanner(page)
  await choose(page, 'Radio setup', pbcKerbalism)
  await field(page, 'DSN modifier').fill('0.35')
  await section(page, 'Signals')
  await field(page, 'DSN modifier').scrollIntoViewIfNeeded()
  await expect(field(page, 'DSN modifier')).toBeInViewport()
  await setMode(page, 'Basic')
  await expect(metric(page, 'signal-transmission-efficiency')).toHaveText('87.92%')
  await metric(page, 'signals-strength-chart').scrollIntoViewIfNeeded()
  await expect(metric(page, 'signals-strength-chart')).toBeInViewport()
  await expect(metric(page, 'signals-strength-chart').locator('[data-signal-curve]')).toHaveCount(2)
  await expect(planner(page).getByRole('button', { name: 'Close', exact: true })).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375)
  await setMode(page, 'Advanced')
  await section(page, 'Network')
  const dialog = await openArray(page)
  await dialog.getByRole('spinbutton', { name: 'Antenna count 1', exact: true }).fill('4')
  await expect(dialog.getByRole('button', { name: 'Apply', exact: true })).toBeInViewport()
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeInViewport()
  expect(await exactPower(dialog)).toBeCloseTo(20_000_000 * 4 ** .75, 2)
  await finishArray(dialog, 'Apply')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375)
})
