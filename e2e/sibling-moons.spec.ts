import { expect, test, type Page } from '@playwright/test'
import { missionModeButton } from './helpers/missionMode'

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const node = (page: Page, id: string) => page.locator(`[data-node-id="${id}"]`)
const total = (page: Page) => page.getByTestId('route-total')
const selected = (page: Page) => page.locator('[data-route-edge="true"]')
const sibling = (page: Page) => selected(page).and(page.locator('[data-edge-id^="sibling:"]'))
const flow = (page: Page) => page.locator('[data-route-animation="true"]')
let browserErrors: string[]

test.beforeEach(async ({ page }) => {
  browserErrors = []
  page.on('pageerror', error => browserErrors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()) })
  await page.goto('./')
  await expect(button(page, 'Custom planet packs')).toBeVisible()
})

test.afterEach(() => {
  expect(browserErrors, 'Moon transfers should not produce browser errors').toEqual([])
})

async function plan(page: Page, from: string, to: string) {
  await node(page, from).click()
  await node(page, to).click()
}

async function addStop(page: Page, name: string) {
  await button(page, 'Edit mission stops').click()
  const editor = page.getByRole('dialog', { name: /^Mission stops\b/ })
  await editor.getByRole('combobox', { name: 'Choose a stop', exact: true }).fill(name)
  await page.getByRole('option', { name, exact: true }).click()
  await editor.getByRole('button', { name: 'Add stop', exact: true }).click()
  await editor.getByRole('button', { name: 'Done', exact: true }).click()
}

async function pageFits(page: Page) {
  expect(await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight })))
    .toEqual(page.viewportSize())
}

async function expectFlow(page: Page) {
  // Axis-aligned SVG paths can have zero-area DOM bounds while their strokes
  // are painted. Check paint/animation properties instead of box visibility.
  await expect(flow(page)).toHaveCSS('display', 'inline')
  const trail = flow(page).locator('path.route-flow-trail').last()
  await expect(trail).not.toHaveCSS('animation-name', 'none')
  expect(await trail.evaluate(path => (path as SVGPathElement).getTotalLength())).toBeGreaterThan(0)
}

test('budgets Mun–Minmus without a Kerbin parking stop and animates both directions', async ({ page }) => {
  await plan(page, 'stock:mun:orbit', 'stock:minmus:orbit')
  await expect(total(page)).toHaveText('330 m/s')
  await expect(selected(page)).toHaveCount(1)
  await expect(sibling(page)).toHaveAttribute('data-edge-id', 'sibling:stock:mun:orbit->stock:minmus:orbit')
  await expect(selected(page).and(page.locator('[data-edge-id*="stock:kerbin:"]'))).toHaveCount(0)
  await expect(page.getByTestId('route-status')).not.toContainText('parking')
  const trail = flow(page).locator('path.route-flow-trail').last()
  await expect(sibling(page)).toHaveAttribute('d', await trail.getAttribute('d'))
  const offset = await trail.evaluate(element => Number.parseFloat(getComputedStyle(element).strokeDashoffset))
  await expect.poll(async () => Math.abs(await trail.evaluate(element => Number.parseFloat(getComputedStyle(element).strokeDashoffset)) - offset)).toBeGreaterThan(.01)
  await button(page, 'Budget assumptions').click()
  const info = page.getByRole('dialog', { name: 'About these estimates', exact: true })
  await expect(info.locator('[data-budget-summary-kind="model"]')).toContainText('330 m/s')
  await info.getByRole('tab', { name: 'Sources & assumptions', exact: true }).click()
  await expect(info.getByRole('link', { name: /Direct sibling-moon transfers/ })).toHaveAttribute('href', /#direct-sibling-moon-transfers$/)
  await info.getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByLabel('Show breakdown', { exact: true }).check()
  const row = page.getByRole('list', { name: 'Maneuver breakdown', exact: true }).getByRole('listitem')
  await expect(row).toHaveCount(1)
  await expect(row).toContainText('Minmus low orbit')
  await expect(row).toHaveAttribute('data-budget-basis', 'model')
  await missionModeButton(page, 'return-only').click()
  await expect(total(page)).toHaveText('330 m/s')
  await expect(sibling(page)).toHaveAttribute('data-edge-id', 'sibling:stock:minmus:orbit->stock:mun:orbit')
  await missionModeButton(page, 'round-trip').click()
  await expect(total(page)).toHaveText('660 m/s')
  await expect(sibling(page)).toHaveCount(2)
  const reserve = page.getByRole('slider', { name: 'Redundancy', exact: true })
  await reserve.focus()
  await reserve.press('Home')
  for (let index = 0; index < 4; index++) await reserve.press('ArrowRight')
  await expect(total(page)).toHaveText('792 m/s')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(flow(page)).toHaveCSS('display', 'none')
  await expect(sibling(page).first()).toHaveCSS('display', 'inline')
  await expect(sibling(page).first()).toHaveAttribute('stroke-opacity', '0.95')
  await pageFits(page)
})

for (const example of [
  { pack: 'Stock', from: 'stock:laythe:orbit', to: 'stock:vall:orbit', budget: '1,176 m/s' },
  { pack: 'Stock', from: 'stock:bop:orbit', to: 'stock:pol:orbit', budget: '281 m/s' },
  { pack: 'OPM', from: 'opm:hale:orbit', to: 'opm:ovok:orbit', budget: '181 m/s' },
  { pack: 'RSS', from: 'rss:phobos:orbit', to: 'rss:deimos:orbit', budget: '738 m/s' },
  { pack: 'RSS', from: 'rss:io:orbit', to: 'rss:europa:orbit', budget: '2,547 m/s' },
]) {
  test(`uses a complete local transfer for ${example.from} → ${example.to}`, async ({ page }) => {
    await button(page, example.pack).click()
    await plan(page, example.from, example.to)
    await expect(total(page)).toHaveText(example.budget)
    await expect(selected(page)).toHaveCount(1)
    await expect(sibling(page)).toHaveAttribute('data-edge-id', `sibling:${example.from}->${example.to}`)
    await expectFlow(page)
    await expect(sibling(page)).toHaveAttribute('d', await flow(page).locator('path.route-flow-trail').last().getAttribute('d'))
    await pageFits(page)
  })
}

test('continues an arriving planetary mission between moons without an extra parent capture', async ({ page }) => {
  await plan(page, 'stock:kerbin:orbit', 'stock:vall:orbit')
  await addStop(page, 'Laythe low orbit')
  // 3,910 from the source map to Laythe, then the complete 1,176 local pair.
  await expect(total(page)).toHaveText('5,086 m/s')
  await expect(sibling(page)).toHaveAttribute('data-edge-id', 'sibling:stock:laythe:orbit->stock:vall:orbit')
  await expect(selected(page).and(page.locator('[data-edge-id*="stock:jool:orbit"]'))).toHaveCount(0)
  await page.getByLabel('Show breakdown', { exact: true }).check()
  await expect(page.getByTestId('stage-total')).toHaveText('3,910 m/s')
  await button(page, 'Next stage').click()
  await expect(page.getByTestId('stage-total')).toHaveText('1,176 m/s')
  await missionModeButton(page, 'round-trip').click()
  // The complete itinerary can choose a different paid outbound arrival.
  await expect(total(page)).toHaveText('11,186 m/s')
  await missionModeButton(page, 'return-only').click()
  await expect(total(page)).toHaveText('5,086 m/s')
  await expect(sibling(page)).toHaveAttribute('data-edge-id', 'sibling:stock:vall:orbit->stock:laythe:orbit')
  await pageFits(page)
})

test('retains inherited moon transfers in both Kcalbeloh all-systems views', async ({ page }) => {
  await button(page, 'Custom planet packs').click()
  const manager = page.getByRole('dialog', { name: 'Planet packs', exact: true })
  await manager.getByRole('tab', { name: 'Add-ons', exact: true }).click()
  await manager.getByRole('button', { name: 'Use Stock + Kcalbeloh', exact: true }).click()
  await plan(page, 'stock:mun:orbit', 'stock:minmus:orbit')
  for (const base of ['Stock', 'OPM']) {
    if (base === 'OPM') await button(page, 'OPM').click()
    await page.getByRole('combobox', { name: 'Map view', exact: true }).click()
    await page.getByRole('option', { name: 'All systems', exact: true }).click()
    await expect(total(page)).toHaveText('330 m/s')
    await expect(sibling(page)).toHaveCount(1)
    await expectFlow(page)
    await pageFits(page)
  }
})

test('identifies remaining reference parking stops and keeps co-orbital exclusions explicit', async ({ page }) => {
  await plan(page, 'stock:mun:orbit', 'stock:ike:orbit')
  await expect(page.getByTestId('route-status')).toContainText('Reference route via Kerbin low orbit')
  await button(page, 'Budget assumptions').click()
  const info = page.getByRole('dialog', { name: 'About these estimates', exact: true })
  await expect(info).toContainText('not a physical requirement for every possible flight')
  await info.getByRole('button', { name: 'Close', exact: true }).click()
  await button(page, 'Reset mission').click()
  await button(page, 'OPM').click()
  await plan(page, 'opm:polta:orbit', 'opm:priax:orbit')
  // A paid two-transfer route via Wal is valid; no zero-cost co-orbital edge is invented.
  await expect(total(page)).toHaveText('1,474 m/s')
  await expect(sibling(page)).toHaveCount(2)
  await expect(sibling(page).and(page.locator('[data-edge-id="sibling:opm:polta:orbit->opm:priax:orbit"]'))).toHaveCount(0)
  await pageFits(page)
})
