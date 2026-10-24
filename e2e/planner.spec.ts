import { expect, test, type Locator, type Page } from '@playwright/test'

const state = (page: Page, body: string, kind: string) =>
  page.locator(`[data-node-id="stock:${body}:${kind}"]`)
const breakdown = (page: Page) => page.getByRole('list', { name: 'Maneuver breakdown' })
const breakdownToggle = (page: Page) => page.getByLabel('Show breakdown', { exact: true })

let pageErrors: string[]

test.beforeEach(async ({ page }) => {
  pageErrors = []
  page.on('pageerror', error => pageErrors.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error') pageErrors.push(message.text())
  })
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'KSP DeltaV Planner', exact: true })).toBeVisible()
})

test.afterEach(() => {
  expect(pageErrors, 'The planner should run without browser exceptions or console errors').toEqual([])
})

async function planMunLanding(page: Page) {
  await state(page, 'kerbin', 'surface').click()
  await state(page, 'mun', 'surface').click()
  await expect(page.getByTestId('route-total')).toHaveText('5,120 m/s')
}

async function assertFitsScreen(page: Page) {
  const geometry = await page.evaluate(() => {
    const svg = document.querySelector('svg[aria-label="Kerbol system Delta-V state map"]')
    if (!svg) throw new Error('The planetary map is missing')
    const map = svg.getBoundingClientRect()
    const describe = (element: Element) => {
      const rect = element.getBoundingClientRect()
      return { id: element.getAttribute('data-node-id'), x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height }
    }
    const overflow = [svg, ...Array.from(svg.parentElement ? [svg.parentElement] : [])]
      .filter(element => element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1)
      .map(element => element.tagName)
    return {
      pageWidth: document.documentElement.scrollWidth,
      pageHeight: document.documentElement.scrollHeight,
      width: window.innerWidth,
      height: window.innerHeight,
      map: { x: map.x, y: map.y, right: map.right, bottom: map.bottom },
      nodes: Array.from(svg.querySelectorAll('[data-node-id]')).map(describe),
      overflow,
    }
  })
  expect(geometry.pageWidth, 'The page must fit horizontally').toBeLessThanOrEqual(geometry.width + 1)
  expect(geometry.pageHeight, 'The page must fit vertically').toBeLessThanOrEqual(geometry.height + 1)
  expect(geometry.overflow, 'The map must fit without a scroll viewport').toEqual([])
  expect(geometry.nodes, 'Every stock routing state should be on the map').toHaveLength(50)
  for (const node of geometry.nodes) {
    expect(node.width, `${node.id} must be rendered`).toBeGreaterThan(0)
    expect(node.height, `${node.id} must be rendered`).toBeGreaterThan(0)
    expect(node.x, `${node.id} must fit inside the map left edge`).toBeGreaterThanOrEqual(Math.max(0, geometry.map.x) - 1)
    expect(node.y, `${node.id} must fit inside the map top edge`).toBeGreaterThanOrEqual(Math.max(0, geometry.map.y) - 1)
    expect(node.right, `${node.id} must fit inside the map right edge`).toBeLessThanOrEqual(Math.min(geometry.width, geometry.map.right) + 1)
    expect(node.bottom, `${node.id} must fit inside the map bottom edge`).toBeLessThanOrEqual(Math.min(geometry.height, geometry.map.bottom) + 1)
  }
}

async function assertOnScreen(locator: Locator, page: Page) {
  const bounds = await locator.boundingBox()
  expect(bounds).not.toBeNull()
  if (!bounds) return
  const viewport = page.viewportSize()
  expect(viewport).not.toBeNull()
  if (!viewport) return
  expect(bounds.x).toBeGreaterThanOrEqual(0)
  expect(bounds.y).toBeGreaterThanOrEqual(0)
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width + 1)
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height + 1)
}

test('keeps the maneuver breakdown off by default and reveals compact base costs on demand', async ({ page }) => {
  await expect(breakdownToggle(page)).not.toBeChecked()
  await expect(breakdown(page)).toHaveCount(0)
  await planMunLanding(page)
  await expect(breakdownToggle(page)).not.toBeChecked()
  await expect(breakdown(page)).toHaveCount(0)
  await expect(page.locator('[data-route-edge="true"]')).toHaveCount(4)
  await breakdownToggle(page).check()
  const legs = breakdown(page).getByRole('listitem')
  await expect(legs).toHaveCount(4)
  for (const [index, cost] of ['3,400', '860', '280', '580'].entries()) {
    await expect(legs.nth(index)).toContainText(`${cost} m/s`)
  }
  await breakdownToggle(page).uncheck()
  await expect(breakdown(page)).toHaveCount(0)
  await breakdownToggle(page).check()
  const close = page.getByRole('button', { name: 'Close breakdown', exact: true })
  await close.focus()
  await close.press('Escape')
  await expect(breakdownToggle(page)).not.toBeChecked()
  await expect(breakdownToggle(page)).toBeFocused()
  await breakdownToggle(page).check()
  await close.click()
  await expect(breakdownToggle(page)).not.toBeChecked()
  await expect(breakdownToggle(page)).toBeFocused()
})

test('adds redundancy to the budget without changing the route or its maneuver costs', async ({ page }) => {
  await planMunLanding(page)
  const routeEdges = await page.locator('[data-route-edge="true"]').evaluateAll(edges => edges.map(edge => edge.getAttribute('data-edge-id')).sort())
  const slider = page.getByRole('slider', { name: 'Redundancy', exact: true })
  await expect(slider).toHaveAttribute('aria-valuenow', '0')
  await slider.focus()
  await slider.press('Home')
  for (let step = 0; step < 4; step++) await slider.press('ArrowRight')
  await expect(slider).toHaveAttribute('aria-valuenow', '20')
  await expect(page.getByTestId('route-total')).toHaveText('6,144 m/s')
  await expect(page.getByTestId('route-base')).toContainText('5,120')
  await expect(page.getByTestId('route-margin')).toContainText('1,024')
  expect(await page.locator('[data-route-edge="true"]').evaluateAll(edges => edges.map(edge => edge.getAttribute('data-edge-id')).sort())).toEqual(routeEdges)
  await breakdownToggle(page).check()
  await expect(breakdown(page).getByRole('listitem').first()).toContainText('3,400 m/s')
  await page.getByRole('button', { name: 'Reset mission', exact: true }).click()
  await expect(slider).toHaveAttribute('aria-valuenow', '0')
  await expect(page.getByTestId('route-total')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Swap origin and destination', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Choose origin', exact: true })).toHaveAttribute('aria-pressed', 'true')
})

test('edits the chosen endpoint and swaps the mission without clearing the other endpoint', async ({ page }) => {
  await planMunLanding(page)
  await page.getByRole('button', { name: 'Choose origin', exact: true }).click()
  await state(page, 'kerbin', 'orbit').click()
  await expect(page.getByTestId('route-total')).toHaveText('1,720 m/s')
  await expect(page.getByRole('button', { name: 'Choose destination', exact: true })).toContainText('Mun surface')
  await page.getByRole('button', { name: 'Swap origin and destination', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Choose origin', exact: true })).toContainText('Mun surface')
  await expect(page.getByRole('button', { name: 'Choose destination', exact: true })).toContainText('Kerbin')
  await expect(page.getByTestId('route-total')).toHaveText('1,720 m/s')
})

test('supports state selection with Enter and Space', async ({ page }) => {
  const origin = state(page, 'kerbin', 'surface')
  await origin.focus()
  await origin.press('Enter')
  await expect(page.getByRole('button', { name: 'Choose origin', exact: true })).toContainText('Kerbin surface')
  const destination = state(page, 'mun', 'surface')
  await destination.focus()
  await destination.press('Space')
  await expect(page.getByTestId('route-total')).toHaveText('5,120 m/s')
})

test('handles an identical origin and destination as a zero-maneuver mission', async ({ page }) => {
  await state(page, 'kerbin', 'surface').click()
  await state(page, 'kerbin', 'surface').click()
  await expect(page.getByTestId('route-total')).toHaveText('0 m/s')
  await expect(page.locator('[data-route-edge="true"]')).toHaveCount(0)
  await breakdownToggle(page).check()
  await expect(breakdown(page).getByRole('listitem')).toHaveCount(0)
})

test('retains the paid parking-orbit layover in compact route details', async ({ page }) => {
  await state(page, 'moho', 'orbit').click()
  await state(page, 'eve', 'orbit').click()
  await expect(page.getByTestId('route-total')).toHaveText('6,530 m/s')
  await breakdownToggle(page).check()
  const legs = breakdown(page).getByRole('listitem')
  await expect(legs).toHaveCount(7)
  await expect(legs.nth(2)).toContainText('Kerbin')
  await expect(legs.nth(2)).toContainText('950 m/s')
  await expect(legs.nth(3)).toContainText('Kerbin')
  await expect(legs.nth(3)).toContainText('950 m/s')
})

test('keeps the atmospheric landing assumption available as a compact note', async ({ page }) => {
  await state(page, 'kerbin', 'orbit').click()
  await state(page, 'kerbin', 'surface').click()
  await expect(page.getByTestId('route-total')).toHaveText('3,400 m/s')
  await expect(page.getByRole('alert')).toContainText('Atmospheric landing uses a planning allowance.')
})

test('shows atmospheric braking opportunities independently of the selected route without changing its budget', async ({ page }) => {
  const markers = page.locator('[data-aerobraking-edge]')
  const selectedMarkers = page.locator('[data-aerobraking-edge][data-selected="true"]')
  const eligiblePairs = [
    ['kerbin:encounter', 'kerbin:orbit'],
    ['eve:encounter', 'eve:elliptical'],
    ['eve:elliptical', 'eve:orbit'],
    ['duna:encounter', 'duna:elliptical'],
    ['duna:elliptical', 'duna:orbit'],
    ['jool:encounter', 'jool:elliptical'],
    ['jool:elliptical', 'jool:orbit'],
    ['laythe:encounter', 'laythe:orbit'],
    ['kerbin:orbit', 'kerbin:surface'],
    ['eve:orbit', 'eve:surface'],
    ['duna:orbit', 'duna:surface'],
    ['laythe:orbit', 'laythe:surface'],
    ['mun:encounter', 'kerbin:orbit'],
    ['minmus:encounter', 'kerbin:orbit'],
  ].map(([from, to]) => ({ from: `stock:${from}`, to: `stock:${to}` }))

  await expect(page.getByRole('note', { name: 'Aerobraking legend', exact: true })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(markers).toHaveCount(14)
  expect(await markers.evaluateAll(elements => elements.map(element => ({
    from: element.getAttribute('data-from'),
    to: element.getAttribute('data-to'),
  })).sort((a, b) => `${a.from}->${a.to}`.localeCompare(`${b.from}->${b.to}`))))
    .toEqual(eligiblePairs.sort((a, b) => `${a.from}->${a.to}`.localeCompare(`${b.from}->${b.to}`)))
  for (const marker of await markers.all()) {
    await expect(marker).toHaveAttribute('role', 'img')
    await expect(marker).toHaveAttribute('aria-label', /^Atmospheric braking possible:/)
    await expect(marker).toHaveAttribute('data-selected', 'false')
    await expect(marker).toBeVisible()
  }

  await planMunLanding(page)
  await expect(markers).toHaveCount(14)
  await expect(selectedMarkers).toHaveCount(0)
  const slider = page.getByRole('slider', { name: 'Redundancy', exact: true })
  await slider.focus()
  for (let step = 0; step < 4; step++) await slider.press('ArrowRight')
  await expect(page.getByTestId('route-total')).toHaveText('6,144 m/s')
  await expect(selectedMarkers).toHaveCount(0)
  await slider.press('Home')

  // The return transfer folds Kerbin capture into its arrival at low orbit.
  await page.getByRole('button', { name: 'Swap origin and destination', exact: true }).click()
  await expect(page.getByTestId('route-total')).toHaveText('5,120 m/s')
  await expect(selectedMarkers).toHaveCount(2)
  expect(await selectedMarkers.evaluateAll(elements => elements.map(element => element.getAttribute('data-aerobraking-edge')).sort()))
    .toEqual(['stock:kerbin:orbit->stock:kerbin:surface', 'stock:mun:encounter->stock:kerbin:orbit'])

  // Starting at the encounter includes both atmospheric capture and descent.
  await page.getByRole('button', { name: 'Choose origin', exact: true }).click()
  await state(page, 'kerbin', 'encounter').click()
  await expect(page.getByTestId('route-total')).toHaveText('4,350 m/s')
  await expect(markers).toHaveCount(14)
  await expect(selectedMarkers).toHaveCount(2)
  expect(await selectedMarkers.evaluateAll(elements => elements.map(element => element.getAttribute('data-aerobraking-edge')).sort()))
    .toEqual(['stock:kerbin:encounter->stock:kerbin:orbit', 'stock:kerbin:orbit->stock:kerbin:surface'])
})

for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }, { width: 667, height: 375 }]) {
  test(`fits the longest supported 12-maneuver breakdown above controls at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await state(page, 'gilly', 'surface').click()
    await state(page, 'ike', 'surface').click()
    const slider = page.getByRole('slider', { name: 'Redundancy', exact: true })
    await slider.focus()
    await slider.press('End')
    await expect(slider).toHaveAttribute('aria-valuenow', '100')
    await breakdownToggle(page).check()

    const list = breakdown(page)
    const panel = list.locator('..')
    const legs = list.getByRole('listitem')
    await expect(legs).toHaveCount(12)
    await assertOnScreen(panel, page)
    for (let index = 0; index < 12; index++) {
      await expect(legs.nth(index)).toBeInViewport({ ratio: 1 })
      await expect(legs.nth(index)).toContainText('m/s')
    }
    const panelBounds = await panel.boundingBox()
    const footerBounds = await page.getByRole('contentinfo').boundingBox()
    expect(panelBounds).not.toBeNull()
    expect(footerBounds).not.toBeNull()
    if (panelBounds && footerBounds) {
      expect(panelBounds.y + panelBounds.height, 'The breakdown must leave the entire mission dock uncovered').toBeLessThanOrEqual(footerBounds.y + 1)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width)

    // Pointer input must still reach the redundancy control while details are open.
    await page.locator('.MuiSlider-root').click()
    await slider.press('Home')
    await expect(slider).toHaveAttribute('aria-valuenow', '0')
    await breakdownToggle(page).uncheck()
    await expect(list).toHaveCount(0)
    await breakdownToggle(page).check()
    await page.getByRole('button', { name: 'Reset mission', exact: true }).click()
    await expect(breakdownToggle(page)).not.toBeChecked()
  })
}

for (const viewport of [
  { width: 1280, height: 720 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
  { width: 844, height: 390 },
  { width: 667, height: 375 },
]) {
  test(`fits all 50 states without scrolling at ${viewport.width}×${viewport.height}, before and after selection`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport)
    await assertFitsScreen(page)
    if (testInfo.project.use.hasTouch) {
      await state(page, 'kerbin', 'surface').tap()
      await state(page, 'mun', 'surface').tap()
    } else {
      await planMunLanding(page)
    }
    await expect(page.getByTestId('route-total')).toHaveText('5,120 m/s')
    await assertFitsScreen(page)
    await breakdownToggle(page).check()
    await expect(breakdown(page)).toBeVisible()
    // Details may overlay part of the map, but must leave mission controls usable.
    await assertOnScreen(page.getByRole('button', { name: 'Choose origin', exact: true }), page)
    await assertOnScreen(page.getByRole('button', { name: 'Choose destination', exact: true }), page)
    await assertOnScreen(page.getByRole('slider', { name: 'Redundancy', exact: true }), page)
    await assertOnScreen(page.getByRole('button', { name: 'Reset mission', exact: true }), page)
    const scroll = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY, width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight }))
    expect(scroll.x).toBe(0)
    expect(scroll.y).toBe(0)
    expect(scroll.width).toBeLessThanOrEqual(viewport.width + 1)
    expect(scroll.height).toBeLessThanOrEqual(viewport.height + 1)
    await page.getByRole('button', { name: 'Reset mission', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Swap origin and destination', exact: true })).toBeDisabled()
  })
}
