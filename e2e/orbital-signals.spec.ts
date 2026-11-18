import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'

const planner = (page: Page) => page.getByRole('dialog', { name: 'CommNet relay planner', exact: true })
const signals = (page: Page) => planner(page).getByTestId('interplanetary-planner')
const metric = (page: Page, id: string) => planner(page).getByTestId(id)
const field = (page: Page, name: string) => planner(page).getByRole('spinbutton', { name, exact: true })
const combo = (page: Page, name: string) => /^Antenna [AB]$/.test(name)
  ? planner(page).locator(`[data-signal-endpoint-config="${name.at(-1)!.toLowerCase()}"]`).getByRole('combobox')
  : planner(page).getByRole('combobox', { name, exact: true })
const modeGroup = (page: Page) => planner(page).getByRole('group', { name: 'Relay planner mode', exact: true })
const positions = (page: Page) => planner(page).getByRole('group', { name: 'Planet position mode', exact: true })
const phase = (page: Page) => planner(page).getByRole('slider', { name: 'Planet positions', exact: true })
let browserErrors: string[]

test.beforeEach(async ({ page }) => {
  browserErrors = []
  page.on('pageerror', error => browserErrors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()) })
  await page.goto('./')
})

test.afterEach(() => expect(browserErrors, 'Orbital planning should not produce browser errors').toEqual([]))

async function openSignals(page: Page) {
  await page.getByRole('button', { name: 'CommNet relay planner', exact: true }).click()
  await planner(page).getByRole('tab', { name: 'Signals', exact: true }).click()
  await expect(signals(page)).toBeVisible()
}

async function choose(page: Page, label: string, option: string) {
  await combo(page, label).click()
  await page.getByRole('option', { name: option, exact: true }).click()
}

async function complexity(page: Page, mode: 'Basic' | 'Advanced') {
  await modeGroup(page).getByRole('button', { name: mode, exact: true }).click()
}

async function positionMode(page: Page, mode: 'Relative phase' | 'In-game date') {
  await positions(page).getByRole('button', { name: mode, exact: true }).click()
}

async function openDetails(page: Page, text: string) {
  const summary = planner(page).locator('summary:visible').filter({ hasText: text })
  if (!await summary.evaluate(element => element.parentElement!.hasAttribute('open'))) await summary.click()
}

async function configureDresRadio(page: Page) {
  await complexity(page, 'Advanced')
  await choose(page, 'Radio setup', 'Probes Before Crew + Kerbalism')
  await choose(page, 'Planet B', 'Dres')
  await choose(page, 'Signal receiver', 'A · Kerbin')
  await choose(page, 'Antenna A', 'DSN level 3')
  await choose(page, 'Antenna B', 'Antenna array…')
  const array = page.getByRole('dialog', { name: 'Endpoint B antenna array', exact: true })
  await array.getByRole('combobox', { name: 'Antenna 1', exact: true }).click()
  await page.getByRole('option', { name: 'Communotron HG-55', exact: true }).click()
  await array.getByRole('spinbutton', { name: 'Antenna count 1', exact: true }).fill('2')
  await array.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(array).not.toBeVisible()
  await expect(field(page, 'DSN modifier')).toHaveValue('1')
  await expect(field(page, 'Range multiplier')).toHaveValue('1')
  await expect(metric(page, 'signal-power-b')).toHaveText('Effective power 42.045 Gm')
  await expect(metric(page, 'signal-range')).toHaveText('102.524 Gm')
  await expect(metric(page, 'signal-full-strength-rate')).toHaveText('300 kB/s')
}

function distanceInMetres(text: string) {
  const match = /([\d,.]+)\s+(Tm|Gm|Mm|km|m)/.exec(text)
  if (!match) throw new Error(`No displayed distance in ${text}`)
  return Number(match[1]!.replaceAll(',', '')) * ({ Tm: 1e12, Gm: 1e9, Mm: 1e6, km: 1e3, m: 1 }[match[2]!] ?? NaN)
}

test('defaults Basic Signals to actual 3D orbits and keeps the phase configuration exploratory', async ({ page }) => {
  await openSignals(page)
  await expect(modeGroup(page).getByRole('button', { name: 'Basic', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(signals(page)).toHaveAttribute('data-signal-geometry', 'actual')
  await expect(signals(page)).toHaveAttribute('data-signal-position-mode', 'phase')
  await expect(positions(page).getByRole('button', { name: 'Relative phase', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(positions(page).getByRole('button', { name: 'In-game date', exact: true })).toBeEnabled()
  await expect(combo(page, 'Signal geometry')).toHaveCount(0)
  await choose(page, 'Planet B', 'Dres')
  // At the default 90° sweep Dres happens to cross its reference plane
  // (argument of periapsis 90°). Move off that node before inspecting z.
  await phase(page).focus()
  await phase(page).press('ArrowRight')
  await expect(phase(page)).toHaveAttribute('aria-valuenow', '91')
  const orbit = metric(page, 'signals-orbit-diagram')
  await expect(orbit).toHaveAttribute('data-signal-geometry', 'actual')
  await expect(orbit).toHaveAttribute('data-signal-phase', '91')
  const z = Number(await orbit.locator('[data-signal-endpoint="b"]').getAttribute('data-position-z-m'))
  expect(Math.abs(z)).toBeGreaterThan(1_000_000)
  await expect(orbit.locator('[data-signal-orbit-body="stock:dres"]')).toHaveAttribute('data-signal-orbit-parent', 'stock:kerbol')
  await expect(metric(page, 'signals-strength-chart').locator('[data-signal-curve]')).toHaveCount(1)
  await expect(planner(page).getByText(/selected positions, not an in-game date/)).toBeVisible()
  await complexity(page, 'Advanced')
  await expect(field(page, 'Planet A reference angle')).toHaveValue('0')
  const original = await metric(page, 'signal-distance').textContent()
  await field(page, 'Planet A reference angle').fill('35')
  await expect(metric(page, 'signal-distance')).not.toHaveText(original!)
  const adjusted = await metric(page, 'signal-distance').textContent()
  await complexity(page, 'Basic')
  await expect(metric(page, 'signal-distance')).toHaveText(adjusted!)
  await expect(planner(page).getByRole('button', { name: 'View settings', exact: true })).toBeVisible()
  // The hidden reference UT also changes ancestor/occluder positions in phase
  // exploration, even after the reference-angle override is restored.
  await complexity(page, 'Advanced')
  await field(page, 'Planet A reference angle').fill('0')
  await field(page, 'Universal time').fill('123456')
  await complexity(page, 'Basic')
  await expect(planner(page).getByRole('button', { name: 'View settings', exact: true })).toBeVisible()
  await complexity(page, 'Advanced')
  await expect(field(page, 'Universal time')).toHaveValue('123456')
  await field(page, 'Universal time').fill('0')
  await complexity(page, 'Basic')
  await expect(planner(page).getByRole('button', { name: 'View settings', exact: true })).toHaveCount(0)
})

test('reproduces the PBC two-HG-55 Dres comparison from an exact manual link distance', async ({ page }) => {
  await openSignals(page)
  await configureDresRadio(page)
  await choose(page, 'Signal geometry', 'Manual link distance')
  await field(page, 'Link distance').fill('23')
  await expect(signals(page)).toHaveAttribute('data-signal-geometry', 'manual-distance')
  await expect(metric(page, 'signal-distance')).toHaveText('23 Gm')
  await expect(metric(page, 'signal-strength')).toHaveText('87.16%')
  await expect(metric(page, 'signal-transmission-efficiency')).toHaveText('43.79%')
  await expect(metric(page, 'signal-science-rate')).toHaveText('131.363 kB/s')
  await expect(metric(page, 'signals-orbit-diagram')).toHaveCount(0)
  await expect(metric(page, 'signals-strength-chart')).toHaveCount(0)
  await expect(positions(page)).toHaveCount(0)
  await expect(metric(page, 'signal-best')).toHaveCount(0)
  await expect(metric(page, 'signal-worst')).toHaveCount(0)
  await expect(planner(page).getByText(/Distance alone cannot determine body blocking/)).toBeVisible()
  await complexity(page, 'Basic')
  await expect(metric(page, 'signal-science-rate')).toHaveText('131.363 kB/s')
  await expect(metric(page, 'signals-strength-chart')).toHaveCount(0)
  await complexity(page, 'Advanced')
  await expect(field(page, 'Link distance')).toHaveValue('23')
})

test('naturally matches Year 8 Day 214 near Dres periapsis using the pinned orbital elements', async ({ page }) => {
  await openSignals(page)
  await configureDresRadio(page)
  await complexity(page, 'Basic')
  await positionMode(page, 'In-game date')
  await expect(planner(page).getByRole('textbox', { name: 'In-game time', exact: true })).toHaveValue('00:00:00')
  await field(page, 'In-game year').fill('8')
  await field(page, 'In-game day').fill('214')
  await planner(page).getByRole('textbox', { name: 'In-game time', exact: true }).fill('01:58:00')
  await expect(signals(page)).toHaveAttribute('data-signal-position-mode', 'date')
  await expect(metric(page, 'signals-orbit-diagram')).toHaveAttribute('data-signal-ut', '69019080')
  await expect(metric(page, 'signal-distance')).toHaveText('23.002 Gm')
  await expect(metric(page, 'signal-strength')).toHaveText('87.16%')
  await expect(metric(page, 'signal-transmission-efficiency')).toHaveText('43.78%')
  await expect(metric(page, 'signal-science-rate')).toHaveText('131.349 kB/s')
  await expect(metric(page, 'signal-best-rate')).toBeVisible()
  await expect(metric(page, 'signal-worst-rate')).toBeVisible()
  const chart = metric(page, 'signals-strength-chart')
  await expect(chart).toHaveAttribute('aria-label', 'Signal strength by in-game time')
  await expect(chart).toHaveAttribute('data-signal-position-mode', 'date')
  await expect(chart.locator('[data-signal-time-marker]')).toHaveAttribute('data-signal-time-marker', '69019080')
  await expect(chart.locator('[data-signal-curve]')).toHaveCount(2)
  await complexity(page, 'Advanced')
  await expect(field(page, 'Universal time')).toHaveValue('69019080')
  await field(page, 'Universal time').fill('69019260')
  await expect(planner(page).getByRole('textbox', { name: 'In-game time', exact: true })).toHaveValue('02:01:00')
  await expect(metric(page, 'signals-orbit-diagram')).toHaveAttribute('data-signal-ut', '69019260')
})

test('navigates the calculated phase and date extrema without presenting them as global orbital limits', async ({ page }) => {
  await openSignals(page)
  await choose(page, 'Planet B', 'Dres')
  await planner(page).getByRole('button', { name: 'Closest', exact: true }).click()
  const closestAngle = Number(await phase(page).getAttribute('aria-valuenow'))
  expect(Math.abs(closestAngle)).toBeGreaterThan(.1)
  const closest = distanceInMetres(await metric(page, 'signal-distance').textContent() ?? '')
  const best = distanceInMetres(await metric(page, 'signal-best').locator('..').textContent() ?? '')
  expect(closest).toBeCloseTo(best, -5)
  await planner(page).getByRole('button', { name: 'Farthest', exact: true }).click()
  const farthestAngle = Number(await phase(page).getAttribute('aria-valuenow'))
  expect(Math.abs(farthestAngle - 180)).toBeGreaterThan(.1)
  const farthest = distanceInMetres(await metric(page, 'signal-distance').textContent() ?? '')
  expect(farthest).toBeGreaterThan(closest)
  await positionMode(page, 'In-game date')
  const chart = metric(page, 'signals-strength-chart')
  const interval = await chart.evaluate(element => [element.getAttribute('data-signal-interval-start'), element.getAttribute('data-signal-interval-end')])
  expect(Number(interval[1])).toBeGreaterThan(Number(interval[0]))
  await planner(page).getByRole('button', { name: 'Closest', exact: true }).click()
  await expect(chart).toHaveAttribute('data-signal-interval-start', interval[0]!)
  await expect(chart).toHaveAttribute('data-signal-interval-end', interval[1]!)
  await planner(page).getByRole('button', { name: 'Farthest', exact: true }).click()
  await expect(chart).toHaveAttribute('data-signal-interval-start', interval[0]!)
  await expect(chart).toHaveAttribute('data-signal-interval-end', interval[1]!)
  await expect(metric(page, 'signal-extrema-scope')).toBeVisible()
  await expect(metric(page, 'signal-extrema-scope')).toContainText('within the displayed time interval; not absolute long-term extrema')
})

test('resolves moons around different parents into common three-dimensional coordinates', async ({ page }) => {
  await openSignals(page)
  await choose(page, 'Planet A', 'Mun')
  await choose(page, 'Planet B', 'Ike')
  await positionMode(page, 'In-game date')
  const orbit = metric(page, 'signals-orbit-diagram')
  await expect(orbit.locator('[data-signal-orbit-body="stock:mun"]')).toHaveAttribute('data-signal-orbit-parent', 'stock:kerbin')
  await expect(orbit.locator('[data-signal-orbit-body="stock:ike"]')).toHaveAttribute('data-signal-orbit-parent', 'stock:duna')
  const points = await orbit.locator('[data-signal-endpoint]').evaluateAll(elements => elements.map(element => ({
    x: Number(element.getAttribute('data-position-x-m')),
    y: Number(element.getAttribute('data-position-y-m')),
    z: Number(element.getAttribute('data-position-z-m')),
  })))
  expect(points).toHaveLength(2)
  for (const point of points) expect(Math.hypot(point.x, point.y, point.z)).toBeGreaterThan(1e9)
  expect(distanceInMetres(await metric(page, 'signal-distance').textContent() ?? '')).toBeGreaterThan(1e9)
  await positionMode(page, 'Relative phase')
  await expect(combo(page, 'Planet A')).toHaveText('Mun')
  await expect(combo(page, 'Planet B')).toHaveText('Ike')
})

test('preserves the selected three-dimensional configuration when swapping Actual endpoints', async ({ page }) => {
  await openSignals(page)
  await choose(page, 'Planet B', 'Dres')
  await phase(page).focus()
  await phase(page).press('ArrowRight')
  const orbit = metric(page, 'signals-orbit-diagram')
  await expect(orbit).toHaveAttribute('data-signal-phase', '91')
  const coordinates = () => orbit.locator('[data-signal-endpoint]').evaluateAll(elements => elements.map(element => [
    Number(element.getAttribute('data-position-x-m')),
    Number(element.getAttribute('data-position-y-m')),
    Number(element.getAttribute('data-position-z-m')),
  ]))
  const before = await coordinates()
  const distance = await metric(page, 'signal-distance').textContent()
  const signal = await metric(page, 'signal-strength').textContent()
  await planner(page).getByRole('button', { name: 'Swap signal endpoints', exact: true }).click()
  await expect(combo(page, 'Planet A')).toHaveText('Dres')
  await expect(combo(page, 'Planet B')).toHaveText('Kerbin')
  await expect(metric(page, 'signal-distance')).toHaveText(distance!)
  await expect(metric(page, 'signal-strength')).toHaveText(signal!)
  const after = await coordinates()
  expect(after).toHaveLength(2)
  for (const [index, point] of after.entries()) {
    expect(Math.hypot(...point.map((value, axis) => value - before[1 - index]![axis]!))).toBeLessThan(.001)
  }
})

test('preserves Advanced orbital edits in Basic and restores the pinned data without changing radio settings', async ({ page }) => {
  await openSignals(page)
  await choose(page, 'Planet B', 'Dres')
  await complexity(page, 'Advanced')
  await openDetails(page, 'Orbital elements and overrides')
  await choose(page, 'Orbital data body', 'B · Dres')
  await expect(field(page, 'Eccentricity')).toHaveValue('0.145')
  await expect(field(page, 'Argument of periapsis')).toHaveValue('90')
  const original = await metric(page, 'signal-distance').textContent()
  await field(page, 'Eccentricity').fill('0.2')
  await expect(metric(page, 'signal-distance')).not.toHaveText(original!)
  const customized = await metric(page, 'signal-distance').textContent()
  await complexity(page, 'Basic')
  await expect(metric(page, 'signal-distance')).toHaveText(customized!)
  await planner(page).getByRole('button', { name: 'View settings', exact: true }).click()
  await openDetails(page, 'Orbital elements and overrides')
  await expect(field(page, 'Eccentricity')).toHaveValue('0.2')
  await field(page, 'Eccentricity').fill('1')
  await expect(field(page, 'Eccentricity')).toHaveAttribute('aria-invalid', 'true')
  await expect(metric(page, 'signal-strength')).toHaveCount(0)
  await planner(page).getByRole('button', { name: 'Restore this body', exact: true }).click()
  await expect(field(page, 'Eccentricity')).toHaveValue('0.145')
  await expect(metric(page, 'signal-distance')).toHaveText(original!)
  await expect(combo(page, 'Radio setup')).toHaveText('Stock CommNet')
})

test('keeps missing custom-pack data unknown and offers exact distance entry without invented orbits', async ({ page }) => {
  const pack = JSON.parse(await readFile('docs/examples/custom-pack.json', 'utf8')) as { name: string }
  await page.getByRole('button', { name: 'Custom planet packs', exact: true }).click()
  const manager = page.getByRole('dialog', { name: 'Planet packs', exact: true })
  await manager.getByRole('tab', { name: 'Custom packs', exact: true }).click()
  await manager.getByLabel('Import planet pack', { exact: true }).setInputFiles({ name: 'orbital-missing.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(pack)) })
  await manager.getByRole('button', { name: `Use ${pack.name}`, exact: true }).click()
  await openSignals(page)
  await expect(metric(page, 'signal-strength')).toHaveCount(0)
  await expect(metric(page, 'signals-orbit-diagram')).toHaveCount(0)
  await complexity(page, 'Advanced')
  await choose(page, 'Signal geometry', 'Manual link distance')
  await field(page, 'Link distance').fill('25')
  await expect(metric(page, 'signal-strength')).toHaveText('84.38%')
  await expect(metric(page, 'signals-orbit-diagram')).toHaveCount(0)
  await expect(metric(page, 'signals-strength-chart')).toHaveCount(0)
})

test('uses the RSS Earth epoch and leap-day calendar for exact universal-time entry', async ({ page }) => {
  await page.getByRole('button', { name: 'RSS', exact: true }).click()
  await openSignals(page)
  await positionMode(page, 'In-game date')
  await expect(field(page, 'In-game year')).toHaveValue('1951')
  await expect(field(page, 'In-game day')).toHaveValue('1')
  await expect(planner(page).getByRole('textbox', { name: 'In-game time', exact: true })).toHaveValue('00:00:00')
  await field(page, 'In-game year').fill('1952')
  await field(page, 'In-game day').fill('60')
  await planner(page).getByRole('textbox', { name: 'In-game time', exact: true }).fill('12:34:56')
  await complexity(page, 'Advanced')
  await expect(field(page, 'Universal time')).toHaveValue('36678896')
  await field(page, 'Universal time').fill('0')
  await expect(field(page, 'In-game year')).toHaveValue('1951')
  await expect(field(page, 'In-game day')).toHaveValue('1')
  await field(page, 'Universal time').fill('-31536000')
  await expect(field(page, 'In-game year')).toHaveValue('1950')
  await expect(field(page, 'In-game day')).toHaveValue('1')
  const chart = metric(page, 'signals-strength-chart')
  await expect(chart.locator('[data-signal-time-marker]')).toHaveAttribute('data-signal-time-marker', '-31536000')
  const interval = await chart.evaluate(element => [element.getAttribute('data-signal-interval-start'), element.getAttribute('data-signal-interval-end')])
  await chart.focus()
  await chart.press('ArrowRight')
  await expect.poll(async () => Number(await field(page, 'Universal time').inputValue())).toBeGreaterThan(-31536000)
  expect(Number(await field(page, 'Universal time').inputValue())).toBeLessThan(0)
  await expect(field(page, 'In-game year')).toHaveValue('1950')
  await expect(chart).toHaveAttribute('data-signal-interval-start', interval[0]!)
  await expect(chart).toHaveAttribute('data-signal-interval-end', interval[1]!)
})

for (const viewport of [{ width: 375, height: 812 }, { width: 1280, height: 900 }]) {
  test(`keeps actual/date/manual geometry controls and footer usable at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await openSignals(page)
    const content = planner(page).locator('.MuiDialogContent-root')
    for (const position of ['Relative phase', 'In-game date'] as const) {
      await positionMode(page, position)
      await metric(page, 'signals-strength-chart').scrollIntoViewIfNeeded()
      await expect(metric(page, 'signals-strength-chart')).toBeInViewport()
      await expect(planner(page).getByRole('button', { name: 'Close', exact: true })).toBeInViewport()
      expect(await content.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width)
    }
    await complexity(page, 'Advanced')
    await choose(page, 'Signal geometry', 'Manual link distance')
    await field(page, 'Link distance').fill('23')
    await expect(metric(page, 'signal-distance')).toHaveText('23 Gm')
    await expect(metric(page, 'signals-strength-chart')).toHaveCount(0)
    await expect(planner(page).getByRole('button', { name: 'Close', exact: true })).toBeInViewport()
    await planner(page).getByRole('button', { name: 'Close', exact: true }).click()
    await expect(planner(page)).not.toBeVisible()
  })
}
