import { expect, test, type Page } from '@playwright/test'
import { missionMode, missionModeButton } from './helpers/missionMode'
import { rssPack } from '../src/data/rss'

const node = (page: Page, id: string) => page.locator(`[data-node-id="${id}"]`)
const packButton = (page: Page, name: 'Stock' | 'OPM' | 'RSS') => page.getByRole('button', { name, exact: true })
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
  expect(browserErrors, 'RSS planning should not produce browser exceptions or console errors').toEqual([])
})

async function addTwentyPercentReserve(page: Page) {
  const slider = page.getByRole('slider', { name: 'Redundancy', exact: true })
  await slider.focus()
  await slider.press('Home')
  for (let step = 0; step < 4; step++) await slider.press('ArrowRight')
  await expect(slider).toHaveAttribute('aria-valuenow', '20')
}

async function assertSettingsVisible(page: Page) {
  for (const name of ['Stock', 'OPM', 'RSS'] as const) {
    await expect(packButton(page, name)).toBeInViewport({ ratio: 1 })
  }
  await expect(missionMode(page)).toBeInViewport({ ratio: 1 })
  // MUI clips the accessible range input; the visible slider track must fit.
  await expect(page.locator('.MuiSlider-root')).toBeInViewport({ ratio: 1 })
  await expect(page.getByRole('button', { name: 'Reset mission', exact: true })).toBeInViewport({ ratio: 1 })
  const bounds = await Promise.all([
    ...(['Stock', 'OPM', 'RSS'] as const).map(name => packButton(page, name).boundingBox()),
    missionMode(page).boundingBox(),
  ])
  for (let first = 0; first < bounds.length; first++) {
    for (let second = first + 1; second < bounds.length; second++) {
      const a = bounds[first]
      const b = bounds[second]
      expect(a).not.toBeNull()
      expect(b).not.toBeNull()
      if (a && b) {
        const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
        const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
        expect(overlapX <= 1 || overlapY <= 1, 'Pack buttons and mission-mode selector must not overlap').toBe(true)
      }
    }
  }
}

async function assertRssFitsScreen(page: Page) {
  await expect(page.locator('[data-node-id]')).toHaveCount(rssPack.nodes.length)
  const geometry = await page.getByRole('group', { name: /system Delta-V state map$/ }).evaluate(svg => {
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
  expect(geometry.nodes.map(element => element.id).sort()).toEqual(rssPack.nodes.map(element => element.id).sort())
  expect(geometry.pageWidth).toBeLessThanOrEqual(geometry.width + 1)
  expect(geometry.pageHeight).toBeLessThanOrEqual(geometry.height + 1)
  expect(geometry.overflow, 'The RSS map should fit without its own scroll viewport').toEqual([])
  for (const element of geometry.nodes) {
    expect(element.width, `${element.id} must render`).toBeGreaterThan(0)
    expect(element.height, `${element.id} must render`).toBeGreaterThan(0)
    expect(element.x, `${element.id} must fit left`).toBeGreaterThanOrEqual(Math.max(0, geometry.map.x) - 1)
    expect(element.y, `${element.id} must fit above`).toBeGreaterThanOrEqual(Math.max(0, geometry.map.y) - 1)
    expect(element.right, `${element.id} must fit right`).toBeLessThanOrEqual(Math.min(geometry.width, geometry.map.right) + 1)
    expect(element.bottom, `${element.id} must fit below`).toBeLessThanOrEqual(Math.min(geometry.height, geometry.map.bottom) + 1)
  }
  await assertSettingsVisible(page)
}

async function assertDetailsAboveDock(page: Page) {
  const panel = await page.getByRole('region', { name: 'Maneuver breakdown panel', exact: true }).boundingBox()
  const footer = await page.getByRole('contentinfo').boundingBox()
  const viewport = page.viewportSize()
  expect(panel).not.toBeNull()
  expect(footer).not.toBeNull()
  expect(viewport).not.toBeNull()
  if (panel && footer && viewport) {
    expect(panel.x).toBeGreaterThanOrEqual(0)
    expect(panel.y).toBeGreaterThanOrEqual(0)
    expect(panel.x + panel.width).toBeLessThanOrEqual(viewport.width + 1)
    expect(panel.y + panel.height, 'RSS details should leave the mission dock uncovered').toBeLessThanOrEqual(footer.y + 1)
  }
}

test('budgets the sourced Earth–Moon mission and its directed return before adding reserve', async ({ page }) => {
  await packButton(page, 'RSS').click()
  await expect(missionModeButton(page, 'one-way')).toHaveAttribute('aria-pressed', 'true')
  await node(page, 'rss:earth:surface').click()
  await node(page, 'rss:moon:surface').click()
  await expect(page.getByTestId('route-total')).toHaveText('14,660 m/s')
  await expect(page.locator('[data-route-edge="true"]')).toHaveCount(4)
  await missionModeButton(page, 'round-trip').click()
  await expect(page.getByTestId('route-total')).toHaveText('29,320 m/s')
  await expect(page.locator('[data-route-edge="true"]')).toHaveCount(8)
  await addTwentyPercentReserve(page)
  await expect(page.getByTestId('route-base')).toContainText('29,320')
  await expect(page.getByTestId('route-margin')).toContainText('5,864')
  await expect(page.getByTestId('route-total')).toHaveText('35,184 m/s')

  await detailsToggle(page).check()
  await expect(page.getByRole('tab', { name: 'Outbound', exact: true })).toHaveAttribute('aria-selected', 'true')
  const legs = maneuverList(page).getByRole('listitem')
  await expect(legs).toHaveCount(4)
  for (const [index, cost] of ['9,000', '3,120', '820', '1,720'].entries()) {
    await expect(legs.nth(index)).toContainText(`${cost} m/s`)
  }
  await expect(legs.last()).toContainText('Moon surface')
  await page.getByRole('tab', { name: 'Return', exact: true }).click()
  await expect(legs).toHaveCount(4)
  await expect(legs.last()).toContainText('Earth surface')
  await expect(page.getByTestId('leg-total')).toHaveText('14,660 m/s')
  await expect(page.getByTestId('route-total')).toHaveText('35,184 m/s')
})

test('clears incompatible endpoints across RSS and Kerbol packs while retaining mission options', async ({ page }) => {
  await node(page, 'stock:kerbin:surface').click()
  await node(page, 'stock:mun:surface').click()
  await missionModeButton(page, 'round-trip').click()
  await addTwentyPercentReserve(page)
  await detailsToggle(page).check()
  for (const nextPack of ['RSS', 'Stock', 'RSS', 'OPM', 'RSS'] as const) {
    await packButton(page, nextPack).click()
    await expect(packButton(page, nextPack)).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: 'Choose origin', exact: true })).toContainText('Select origin')
    await expect(page.getByRole('button', { name: 'Choose origin', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: 'Choose destination', exact: true })).toContainText('Select destination')
    await expect(page.getByTestId('route-total')).toHaveCount(0)
    await expect(missionModeButton(page, 'round-trip')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('slider', { name: 'Redundancy', exact: true })).toHaveAttribute('aria-valuenow', '20')
    await expect(detailsToggle(page)).not.toBeChecked()
    if (nextPack === 'RSS') {
      await node(page, 'rss:earth:surface').click()
      await node(page, 'rss:moon:surface').click()
    } else {
      await node(page, 'stock:kerbin:surface').click()
      await node(page, 'stock:mun:surface').click()
    }
    await expect(page.getByTestId('route-total')).toBeVisible()
    await detailsToggle(page).check()
  }
  await page.getByRole('button', { name: 'Reset mission', exact: true }).click()
  await expect(packButton(page, 'RSS')).toHaveAttribute('aria-pressed', 'true')
  await expect(missionModeButton(page, 'one-way')).toHaveAttribute('aria-pressed', 'true')
  await expect(detailsToggle(page)).not.toBeChecked()
  await expect(page.getByRole('slider', { name: 'Redundancy', exact: true })).toHaveAttribute('aria-valuenow', '0')
  await expect(page.getByTestId('route-total')).toHaveCount(0)
})

test('uses Earth as the RSS hub and displays RSS-specific sources and assumptions', async ({ page }) => {
  await packButton(page, 'RSS').click()
  await expect(node(page, 'rss:earth:encounter')).toHaveAttribute('aria-label', 'Earth encounter')
  await expect(page.locator('[data-node-id^="stock:"]')).toHaveCount(0)
  await expect(page.locator('[data-node-id^="opm:"]')).toHaveCount(0)
  for (const body of ['pluto', 'triton']) {
    await expect(page.locator(`[data-aerobraking-edge][data-to^="rss:${body}:"]`)).toHaveCount(0)
  }
  for (const [body, arrival] of [
    ['earth', 'orbit'],
    ['jupiter', 'elliptical'],
    ['saturn', 'elliptical'],
    ['uranus', 'elliptical'],
    ['neptune', 'elliptical'],
  ]) {
    await expect(page.locator(`[data-aerobraking-edge="rss:${body}:encounter->rss:${body}:${arrival}"]`)).toHaveCount(1)
  }
  await node(page, 'rss:mars:orbit').click()
  await node(page, 'rss:venus:orbit').click()
  await expect(page.getByTestId('route-total')).toBeVisible()
  await expect(page.getByText(/Earth parking-orbit layover/)).toBeVisible()
  const edges = await page.locator('[data-route-edge="true"]').evaluateAll(elements => elements.map(element => element.getAttribute('data-edge-id')))
  expect(edges).toContain('rss:earth:encounter->rss:earth:orbit')
  expect(edges).toContain('rss:earth:orbit->rss:earth:encounter')

  await page.getByRole('button', { name: 'Model assumptions and data sources', exact: true }).click()
  const info = page.getByRole('dialog')
  await expect(info).toContainText(rssPack.description)
  await expect(info).toContainText('Earth')
  await expect(info).not.toContainText('Kerbin')
  for (const source of rssPack.sources) {
    await expect(info.getByRole('link', { name: source.title, exact: true })).toHaveAttribute('href', source.url)
  }
  await info.getByRole('button', { name: 'Close', exact: true }).click()
})

test('makes every RSS state selectable while omitting gas-giant and solar landing states', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  await packButton(page, 'RSS').click()
  await expect(page.locator('[data-node-id]')).toHaveCount(rssPack.nodes.length)
  for (const name of ['Jupiter', 'Saturn', 'Uranus', 'Neptune']) {
    await expect(page.getByRole('button', { name: `${name} surface`, exact: true })).toHaveCount(0)
  }
  for (const star of rssPack.bodies.filter(body => body.kind === 'star')) {
    await expect(page.locator(`[data-node-id^="${star.id}:"]`)).toHaveCount(0)
  }
  await node(page, 'rss:earth:orbit').click()
  for (const state of rssPack.nodes) {
    if (testInfo.project.use.hasTouch) await node(page, state.id).tap()
    else await node(page, state.id).click()
    await expect(page.getByRole('button', { name: 'Choose destination', exact: true })).toContainText(state.label)
    await expect(page.getByTestId('route-total')).toBeVisible()
  }
})

test('keeps the largest RSS mission budget and reserve text visible at 320 pixels', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await packButton(page, 'RSS').click()
  await node(page, 'rss:venus:surface').click()
  await node(page, 'rss:io:surface').click()
  await missionModeButton(page, 'round-trip').click()
  await expect(page.getByTestId('route-total')).toHaveText('140,820 m/s')
  const slider = page.getByRole('slider', { name: 'Redundancy', exact: true })
  await slider.focus()
  await slider.press('End')
  await expect(page.getByTestId('route-total')).toHaveText('281,640 m/s')
  await expect(page.getByTestId('route-base')).toContainText('140,820')
  await expect(page.getByTestId('route-margin')).toContainText('140,820')

  for (const id of ['route-total', 'route-base', 'route-margin']) {
    const textBounds = await page.getByTestId(id).evaluate(element => {
      const range = document.createRange()
      range.selectNodeContents(element)
      const bounds = range.getBoundingClientRect()
      return { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom }
    })
    expect(textBounds.left, `${id} should fit left`).toBeGreaterThanOrEqual(0)
    expect(textBounds.top, `${id} should fit above`).toBeGreaterThanOrEqual(0)
    expect(textBounds.right, `${id} text should fit right`).toBeLessThanOrEqual(320)
    expect(textBounds.bottom, `${id} text should fit below`).toBeLessThanOrEqual(568)
  }
  await assertSettingsVisible(page)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
})

for (const viewport of [{ width: 320, height: 568 }, { width: 667, height: 375 }]) {
  test(`fits the maximum 14-maneuver RSS return leg above controls at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await packButton(page, 'RSS').click()
    await node(page, 'rss:phobos:surface').click()
    await node(page, 'rss:io:surface').click()
    await missionModeButton(page, 'round-trip').click()
    const slider = page.getByRole('slider', { name: 'Redundancy', exact: true })
    await slider.focus()
    await slider.press('End')
    await detailsToggle(page).check()
    await page.getByRole('tab', { name: 'Return', exact: true }).click()
    const legs = maneuverList(page).getByRole('listitem')
    await expect(legs).toHaveCount(14)
    await assertDetailsAboveDock(page)
    for (let index = 0; index < 14; index++) {
      // Mobile IntersectionObserver can round a fully visible row slightly below 1.
      await expect(legs.nth(index)).toBeInViewport({ ratio: 0.99999 })
      await expect(legs.nth(index)).toContainText('m/s')
    }
    await assertSettingsVisible(page)
    await page.locator('.MuiSlider-root').click()
    await slider.press('Home')
    await expect(slider).toHaveAttribute('aria-valuenow', '0')
    await detailsToggle(page).uncheck()
    await detailsToggle(page).check()
    await page.getByRole('button', { name: 'Reset mission', exact: true }).click()
    await expect(missionModeButton(page, 'one-way')).toHaveAttribute('aria-pressed', 'true')
  })
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
  { width: 844, height: 390 },
  { width: 667, height: 375 },
]) {
  test(`fits RSS states, trip details, and all three pack selectors without scrolling at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    if (viewport.width === 320) {
      await packButton(page, 'OPM').click()
      await assertSettingsVisible(page)
      const analyticNotice = page.getByRole('button', { name: 'Analytic estimates', exact: true })
      await expect(analyticNotice).toBeInViewport({ ratio: 1 })
      const noticeBounds = await analyticNotice.boundingBox()
      const packBounds = await page.getByRole('group', { name: 'Planet pack', exact: true }).boundingBox()
      expect(noticeBounds).not.toBeNull()
      expect(packBounds).not.toBeNull()
      if (noticeBounds && packBounds) {
        expect(noticeBounds.y >= packBounds.y + packBounds.height || noticeBounds.y + noticeBounds.height <= packBounds.y).toBe(true)
      }
    }
    await packButton(page, 'RSS').click()
    await assertRssFitsScreen(page)
    await node(page, 'rss:earth:surface').click()
    await node(page, 'rss:moon:surface').click()
    await missionModeButton(page, 'round-trip').click()
    await expect(page.getByTestId('route-total')).toBeVisible()
    await assertRssFitsScreen(page)
    await detailsToggle(page).check()
    for (const name of ['Outbound', 'Return']) {
      await page.getByRole('tab', { name, exact: true }).click()
      await expect(maneuverList(page)).toBeVisible()
      await assertDetailsAboveDock(page)
    }
    await detailsToggle(page).uncheck()
    await page.getByRole('button', { name: 'Reset mission', exact: true }).click()
    await expect(missionModeButton(page, 'one-way')).toHaveAttribute('aria-pressed', 'true')
    await expect(packButton(page, 'RSS')).toHaveAttribute('aria-pressed', 'true')
    await assertRssFitsScreen(page)
  })
}
