import { expect, test, type Page } from '@playwright/test'
import { missionModeButton } from './helpers/missionMode'
import { opmPack } from '../src/data/opm'

const node = (page: Page, id: string) => page.locator(`[data-node-id="${id}"]`)
const packButton = (page: Page, name: 'Stock' | 'OPM') => page.getByRole('button', { name, exact: true })
const detailsToggle = (page: Page) => page.getByLabel('Show breakdown', { exact: true })
const maneuverList = (page: Page) => page.getByRole('list', { name: 'Maneuver breakdown' })

let browserErrors: string[]

test.beforeEach(async ({ page }) => {
  browserErrors = []
  page.on('pageerror', error => browserErrors.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  await page.goto('./')
  await expect(packButton(page, 'Stock')).toHaveAttribute('aria-pressed', 'true')
})

test.afterEach(() => {
  expect(browserErrors, 'Pack switching and mission planning should not produce browser errors').toEqual([])
})

async function planMunLanding(page: Page) {
  await node(page, 'stock:kerbin:surface').click()
  await node(page, 'stock:mun:surface').click()
  await expect(page.getByTestId('route-total')).toHaveText('5,120 m/s')
}

async function addTwentyPercentReserve(page: Page) {
  const slider = page.getByRole('slider', { name: 'Redundancy', exact: true })
  await slider.focus()
  await slider.press('Home')
  for (let step = 0; step < 4; step++) await slider.press('ArrowRight')
  await expect(slider).toHaveAttribute('aria-valuenow', '20')
}

async function assertOpmFitsScreen(page: Page) {
  await expect(page.locator('[data-node-id]')).toHaveCount(opmPack.nodes.length)
  const geometry = await page.getByRole('group', { name: 'Kerbol system Delta-V state map', exact: true }).evaluate(svg => {
    const rect = svg.getBoundingClientRect()
    return {
      width: window.innerWidth,
      height: window.innerHeight,
      pageWidth: document.documentElement.scrollWidth,
      pageHeight: document.documentElement.scrollHeight,
      map: { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom },
      overflow: [svg, ...(svg.parentElement ? [svg.parentElement] : [])]
        .filter(element => element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1)
        .map(element => element.tagName),
      nodes: Array.from(svg.querySelectorAll('[data-node-id]')).map(element => {
        const bounds = element.getBoundingClientRect()
        return { id: element.getAttribute('data-node-id'), x: bounds.x, y: bounds.y, right: bounds.right, bottom: bounds.bottom, width: bounds.width, height: bounds.height }
      }),
    }
  })
  expect(geometry.nodes.map(element => element.id).sort()).toEqual(opmPack.nodes.map(element => element.id).sort())
  expect(geometry.pageWidth).toBeLessThanOrEqual(geometry.width + 1)
  expect(geometry.pageHeight).toBeLessThanOrEqual(geometry.height + 1)
  expect(geometry.overflow, 'The OPM map should fit without its own scroll viewport').toEqual([])
  for (const element of geometry.nodes) {
    expect(element.width, `${element.id} must render`).toBeGreaterThan(0)
    expect(element.height, `${element.id} must render`).toBeGreaterThan(0)
    expect(element.x, `${element.id} must fit left`).toBeGreaterThanOrEqual(Math.max(0, geometry.map.x) - 1)
    expect(element.y, `${element.id} must fit above`).toBeGreaterThanOrEqual(Math.max(0, geometry.map.y) - 1)
    expect(element.right, `${element.id} must fit right`).toBeLessThanOrEqual(Math.min(geometry.width, geometry.map.right) + 1)
    expect(element.bottom, `${element.id} must fit below`).toBeLessThanOrEqual(Math.min(geometry.height, geometry.map.bottom) + 1)
  }
}

test('budgets both directions of a round trip and shows each leg in compact tabs', async ({ page }) => {
  await expect(missionModeButton(page, 'one-way')).toHaveAttribute('aria-pressed', 'true')
  await planMunLanding(page)
  await missionModeButton(page, 'round-trip').click()
  await expect(page.getByTestId('route-total')).toHaveText('10,240 m/s')
  await expect(page.locator('[data-route-edge="true"]')).toHaveCount(8)
  await expect(page.locator('[data-aerobraking-edge][data-selected="true"]')).toHaveCount(2)
  await addTwentyPercentReserve(page)
  await expect(page.getByTestId('route-total')).toHaveText('12,288 m/s')
  await expect(page.getByTestId('route-base')).toContainText('10,240')
  await expect(page.getByTestId('route-margin')).toContainText('2,048')

  await detailsToggle(page).check()
  const outbound = page.getByRole('tab', { name: 'Outbound', exact: true })
  const inbound = page.getByRole('tab', { name: 'Return', exact: true })
  await expect(outbound).toHaveAttribute('aria-selected', 'true')
  await expect(maneuverList(page).getByRole('listitem')).toHaveCount(4)
  await expect(maneuverList(page).getByRole('listitem').last()).toContainText('Mun surface')
  await inbound.click()
  await expect(inbound).toHaveAttribute('aria-selected', 'true')
  await expect(maneuverList(page).getByRole('listitem')).toHaveCount(4)
  await expect(maneuverList(page).getByRole('listitem').last()).toContainText('Kerbin surface')
  await expect(page.getByTestId('route-total')).toHaveText('12,288 m/s')
  await detailsToggle(page).uncheck()
  await missionModeButton(page, 'one-way').click()
  await expect(page.getByTestId('route-total')).toHaveText('6,144 m/s')
  await expect(page.locator('[data-route-edge="true"]')).toHaveCount(4)
})

test('preserves shared endpoints and mission options across packs while clearing unavailable endpoints', async ({ page }) => {
  await planMunLanding(page)
  await missionModeButton(page, 'round-trip').click()
  await addTwentyPercentReserve(page)
  await detailsToggle(page).check()
  await packButton(page, 'OPM').click()
  await expect(packButton(page, 'OPM')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'Choose origin', exact: true })).toContainText('Kerbin surface')
  await expect(page.getByRole('button', { name: 'Choose destination', exact: true })).toContainText('Mun surface')
  await expect(page.getByTestId('route-total')).toHaveText('12,288 m/s')
  await expect(missionModeButton(page, 'round-trip')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('slider', { name: 'Redundancy', exact: true })).toHaveAttribute('aria-valuenow', '20')
  await expect(detailsToggle(page)).not.toBeChecked()

  await node(page, 'opm:tekto:surface').click()
  await expect(page.getByRole('button', { name: 'Choose destination', exact: true })).toContainText('Tekto surface')
  await detailsToggle(page).check()
  await packButton(page, 'Stock').click()
  await expect(page.getByRole('button', { name: 'Choose origin', exact: true })).toContainText('Kerbin surface')
  await expect(page.getByRole('button', { name: 'Choose destination', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'Choose destination', exact: true })).toContainText('Select destination')
  await expect(page.getByTestId('route-total')).toHaveCount(0)
  await expect(detailsToggle(page)).not.toBeChecked()
  await expect(missionModeButton(page, 'round-trip')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('slider', { name: 'Redundancy', exact: true })).toHaveAttribute('aria-valuenow', '20')

  await packButton(page, 'OPM').click()
  await page.getByRole('button', { name: 'Choose origin', exact: true }).click()
  await node(page, 'opm:tekto:surface').click()
  await node(page, 'stock:mun:surface').click()
  await packButton(page, 'Stock').click()
  await expect(page.getByRole('button', { name: 'Choose origin', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'Choose origin', exact: true })).toContainText('Select origin')
  await expect(page.getByRole('button', { name: 'Choose destination', exact: true })).toContainText('Mun surface')
  await expect(page.getByTestId('route-total')).toHaveCount(0)
})

test('clears mission options without changing the active planet pack', async ({ page }) => {
  await packButton(page, 'OPM').click()
  await node(page, 'stock:kerbin:surface').click()
  await node(page, 'opm:tekto:surface').click()
  await expect(page.getByTestId('route-total')).toHaveText('13,470 m/s')
  await missionModeButton(page, 'round-trip').click()
  await expect(page.getByTestId('route-total')).toHaveText('26,940 m/s')
  await addTwentyPercentReserve(page)
  await expect(page.getByTestId('route-total')).toHaveText('32,328 m/s')
  await detailsToggle(page).check()
  await page.getByRole('button', { name: 'Reset mission', exact: true }).click()
  await expect(packButton(page, 'OPM')).toHaveAttribute('aria-pressed', 'true')
  await expect(missionModeButton(page, 'one-way')).toHaveAttribute('aria-pressed', 'true')
  await expect(detailsToggle(page)).not.toBeChecked()
  await expect(page.getByRole('slider', { name: 'Redundancy', exact: true })).toHaveAttribute('aria-valuenow', '0')
  await expect(page.getByTestId('route-total')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Choose origin', exact: true })).toContainText('Select origin')
  await expect(page.getByRole('button', { name: 'Choose destination', exact: true })).toContainText('Select destination')
})

test('routes to Eeloo through its OPM parent instead of using the stock interplanetary branch', async ({ page }) => {
  await packButton(page, 'OPM').click()
  await node(page, 'stock:kerbin:orbit').click()
  await node(page, 'stock:eeloo:surface').click()
  await expect(page.getByRole('button', { name: 'Choose destination', exact: true })).toContainText('Eeloo surface')
  await expect(page.getByTestId('route-total')).toBeVisible()
  const edges = await page.locator('[data-route-edge="true"]').evaluateAll(elements => elements.map(element => element.getAttribute('data-edge-id')))
  expect(edges).toContain('opm:sarnus:orbit->stock:eeloo:encounter')
  expect(edges).not.toContain('stock:kerbin:encounter->stock:eeloo:encounter')
})

test('makes every new OPM state selectable and omits surfaces for gas giants', async ({ page }, testInfo) => {
  test.setTimeout(60_000)
  await packButton(page, 'OPM').click()
  await expect(page.locator('[data-node-id]')).toHaveCount(opmPack.nodes.length)
  for (const name of ['Jool', 'Sarnus', 'Urlum', 'Neidon']) {
    await expect(page.getByRole('button', { name: `${name} surface`, exact: true })).toHaveCount(0)
  }
  await node(page, 'stock:kerbin:orbit').click()
  const newStates = opmPack.nodes.filter(state => state.id.startsWith('opm:'))
  expect(new Set(newStates.map(state => state.bodyId)).size).toBe(15)
  for (const state of newStates) {
    if (testInfo.project.use.hasTouch) await node(page, state.id).tap()
    else await node(page, state.id).click()
    await expect(page.getByRole('button', { name: 'Choose destination', exact: true })).toContainText(state.label)
    await expect(page.getByTestId('route-total')).toBeVisible()
  }
})

for (const viewport of [{ width: 320, height: 568 }, { width: 667, height: 375 }]) {
  test(`fits the maximum 17-maneuver OPM return leg above usable controls at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await packButton(page, 'OPM').click()
    await node(page, 'opm:tal:surface').click()
    await node(page, 'stock:gilly:surface').click()
    await missionModeButton(page, 'round-trip').click()
    const slider = page.getByRole('slider', { name: 'Redundancy', exact: true })
    await slider.focus()
    await slider.press('End')
    await expect(slider).toHaveAttribute('aria-valuenow', '100')
    await detailsToggle(page).check()
    await page.getByRole('tab', { name: 'Return', exact: true }).click()

    const legs = maneuverList(page).getByRole('listitem')
    await expect(legs).toHaveCount(17)
    for (let index = 0; index < 17; index++) {
      // Mobile IntersectionObserver can round a fully visible row slightly below 1.
      await expect(legs.nth(index)).toBeInViewport({ ratio: 0.99999 })
      await expect(legs.nth(index)).toContainText('m/s')
    }
    const panel = await page.getByRole('region', { name: 'Maneuver breakdown panel', exact: true }).boundingBox()
    const footer = await page.getByRole('contentinfo').boundingBox()
    expect(panel).not.toBeNull()
    expect(footer).not.toBeNull()
    if (panel && footer) {
      expect(panel.x).toBeGreaterThanOrEqual(0)
      expect(panel.y).toBeGreaterThanOrEqual(0)
      expect(panel.x + panel.width).toBeLessThanOrEqual(viewport.width + 1)
      expect(panel.y + panel.height).toBeLessThanOrEqual(footer.y + 1)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width)

    await page.locator('.MuiSlider-root').click()
    await slider.press('Home')
    await expect(slider).toHaveAttribute('aria-valuenow', '0')
    await detailsToggle(page).uncheck()
    await expect(maneuverList(page)).toHaveCount(0)
    await detailsToggle(page).check()
    await page.getByRole('button', { name: 'Reset mission', exact: true }).click()
    await expect(detailsToggle(page)).not.toBeChecked()
    await expect(missionModeButton(page, 'one-way')).toHaveAttribute('aria-pressed', 'true')
  })
}

for (const viewport of [
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
  { width: 844, height: 390 },
  { width: 667, height: 375 },
]) {
  test(`fits the OPM map and tabbed round-trip details without scrolling at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await packButton(page, 'OPM').click()
    await assertOpmFitsScreen(page)
    await node(page, 'stock:kerbin:surface').click()
    await node(page, 'opm:tekto:surface').click()
    await missionModeButton(page, 'round-trip').click()
    await expect(page.getByTestId('route-total')).toBeVisible()
    await assertOpmFitsScreen(page)
    await detailsToggle(page).check()
    for (const name of ['Outbound', 'Return']) {
      await page.getByRole('tab', { name, exact: true }).click()
      const panel = await page.getByRole('region', { name: 'Maneuver breakdown panel', exact: true }).boundingBox()
      const footer = await page.getByRole('contentinfo').boundingBox()
      expect(panel).not.toBeNull()
      expect(footer).not.toBeNull()
      if (panel && footer) {
        expect(panel.x).toBeGreaterThanOrEqual(0)
        expect(panel.y).toBeGreaterThanOrEqual(0)
        expect(panel.x + panel.width).toBeLessThanOrEqual(viewport.width + 1)
        expect(panel.y + panel.height, 'Details should leave the mission dock uncovered').toBeLessThanOrEqual(footer.y + 1)
      }
    }
    await detailsToggle(page).uncheck()
    await page.getByRole('button', { name: 'Reset mission', exact: true }).click()
    await expect(missionModeButton(page, 'one-way')).toHaveAttribute('aria-pressed', 'true')
    await expect(packButton(page, 'OPM')).toHaveAttribute('aria-pressed', 'true')
    await assertOpmFitsScreen(page)
  })
}
