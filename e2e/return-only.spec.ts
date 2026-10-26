import { expect, test, type Page } from '@playwright/test'
import { missionMode, missionModeButton } from './helpers/missionMode'

const node = (page: Page, id: string) => page.locator(`[data-node-id="${id}"]`)
const origin = (page: Page) => page.getByRole('button', { name: 'Choose origin', exact: true })
const destination = (page: Page) => page.getByRole('button', { name: 'Choose destination', exact: true })
const detailsToggle = (page: Page) => page.getByLabel('Show breakdown', { exact: true })
const panel = (page: Page) => page.getByRole('region', { name: 'Maneuver breakdown panel', exact: true })
const maneuvers = (page: Page) => page.getByRole('list', { name: 'Maneuver breakdown', exact: true }).getByRole('listitem')
const highlightedEdges = (page: Page) => page.locator('[data-route-edge="true"]')
const packButton = (page: Page, name: string) => page.getByRole('button', { name, exact: true })

const missions = [
  { pack: 'Stock', home: 'stock:kerbin:surface', target: 'stock:mun:surface', homeName: 'Kerbin surface', targetName: 'Mun surface', base: '5,120', reserve: '1,024', total: '6,144' },
  { pack: 'OPM', home: 'stock:kerbin:surface', target: 'opm:tekto:surface', homeName: 'Kerbin surface', targetName: 'Tekto surface', base: '13,470', reserve: '2,694', total: '16,164' },
  { pack: 'RSS', home: 'rss:earth:surface', target: 'rss:moon:surface', homeName: 'Earth surface', targetName: 'Moon surface', base: '14,660', reserve: '2,932', total: '17,592' },
] as const

let browserErrors: string[]

test.beforeEach(async ({ page }) => {
  browserErrors = []
  page.on('pageerror', error => browserErrors.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  await page.goto('./')
  await expect(missionModeButton(page, 'one-way')).toHaveAttribute('aria-pressed', 'true')
})

test.afterEach(() => {
  expect(browserErrors, 'Mission modes should not produce browser exceptions or console errors').toEqual([])
})

async function addTwentyPercentReserve(page: Page) {
  const slider = page.getByRole('slider', { name: 'Redundancy', exact: true })
  await slider.focus()
  await slider.press('Home')
  for (let step = 0; step < 4; step++) await slider.press('ArrowRight')
  await expect(slider).toHaveAttribute('aria-valuenow', '20')
}

async function edgeIds(page: Page) {
  return highlightedEdges(page).evaluateAll(edges => edges.map(edge => edge.getAttribute('data-edge-id')).sort())
}

async function assertScreenBounds(page: Page) {
  const viewport = page.viewportSize()
  expect(viewport).not.toBeNull()
  if (!viewport) return
  const geometry = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
    x: window.scrollX,
    y: window.scrollY,
  }))
  expect(geometry.width).toBeLessThanOrEqual(viewport.width)
  expect(geometry.height).toBeLessThanOrEqual(viewport.height)
  expect(geometry.x).toBe(0)
  expect(geometry.y).toBe(0)
  await expect(missionMode(page)).toBeInViewport({ ratio: 1 })
  const modeBounds = []
  for (const mode of ['one-way', 'round-trip', 'return-only'] as const) {
    const button = missionModeButton(page, mode)
    await expect(button).toBeInViewport({ ratio: 1 })
    const bounds = await button.boundingBox()
    expect(bounds).not.toBeNull()
    if (bounds) {
      expect(bounds.height, 'Trip choices should remain compact and usable').toBeGreaterThanOrEqual(32)
      modeBounds.push(bounds)
    }
    const textFits = await button.evaluate(element => {
      const bounds = element.getBoundingClientRect()
      const range = document.createRange()
      range.selectNodeContents(element)
      const text = range.getBoundingClientRect()
      return text.left >= bounds.left - 1 && text.right <= bounds.right + 1
        && text.top >= bounds.top - 1 && text.bottom <= bounds.bottom + 1
    })
    expect(textFits, 'All three trip labels should fit inside their buttons').toBe(true)
  }
  expect(modeBounds).toHaveLength(3)
  for (let index = 1; index < modeBounds.length; index++) {
    expect(modeBounds[index].x, 'Trip choices must not overlap').toBeGreaterThanOrEqual(modeBounds[index - 1].x + modeBounds[index - 1].width - 1)
  }
  await expect(missionMode(page).getByRole('button', { pressed: true })).toHaveCount(1)
  const packSelector = page.getByRole('group', { name: 'Planet pack', exact: true })
  await expect(packSelector).toBeInViewport({ ratio: 1 })
  const packBounds = []
  for (const name of ['Stock', 'OPM', 'RSS']) {
    const button = packButton(page, name)
    await expect(button).toBeInViewport({ ratio: 1 })
    const bounds = await button.boundingBox()
    expect(bounds).not.toBeNull()
    if (bounds) {
      expect(bounds.height, 'System choices should be as usable as the trip choices').toBeGreaterThanOrEqual(32)
      packBounds.push(bounds)
    }
    const label = await button.evaluate(element => {
      const bounds = element.getBoundingClientRect()
      const range = document.createRange()
      range.selectNodeContents(element)
      const text = range.getBoundingClientRect()
      return {
        fontSize: Number.parseFloat(getComputedStyle(element).fontSize),
        fits: text.left >= bounds.left - 1 && text.right <= bounds.right + 1
          && text.top >= bounds.top - 1 && text.bottom <= bounds.bottom + 1,
      }
    })
    expect(label.fontSize, 'System labels should be easy to read').toBeGreaterThanOrEqual(12)
    expect(label.fits, 'Every system label should fit inside its button').toBe(true)
  }
  expect(packBounds).toHaveLength(3)
  for (let index = 1; index < packBounds.length; index++) {
    expect(packBounds[index].x, 'System choices must not overlap').toBeGreaterThanOrEqual(packBounds[index - 1].x + packBounds[index - 1].width - 1)
  }
  await expect(packSelector.getByRole('button', { pressed: true })).toHaveCount(1)
  for (const control of [origin(page), destination(page), page.locator('.MuiSlider-root'), page.getByRole('button', { name: 'Reset mission', exact: true })]) {
    await expect(control).toBeInViewport({ ratio: 1 })
  }
  const bounds = await missionMode(page).boundingBox()
  const systemBounds = await packSelector.boundingBox()
  expect(bounds).not.toBeNull()
  expect(systemBounds).not.toBeNull()
  if (bounds && systemBounds) {
    expect(bounds.x).toBeGreaterThanOrEqual(0)
    expect(bounds.y).toBeGreaterThanOrEqual(0)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width)
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height)
    expect(Math.abs(bounds.y - systemBounds.y), 'System and trip choices should share one toolbar row').toBeLessThanOrEqual(1)
    expect(systemBounds.x + systemBounds.width, 'System choices belong beside the trip choices without overlap').toBeLessThanOrEqual(bounds.x + 1)
    const originBounds = await origin(page).boundingBox()
    expect(originBounds).not.toBeNull()
    if (originBounds) {
      expect(bounds.y + bounds.height, 'Trip choices belong directly above the selected endpoints').toBeLessThanOrEqual(originBounds.y + 1)
      expect(systemBounds.y + systemBounds.height, 'System choices belong above the selected endpoints').toBeLessThanOrEqual(originBounds.y + 1)
    }
  }
}

for (const mission of missions) {
  test(`plans only the ${mission.pack} return with unchanged endpoints and one reserve`, async ({ page }) => {
    await packButton(page, mission.pack).click()
    await node(page, mission.home).click()
    await node(page, mission.target).click()
    await expect(page.getByTestId('route-total')).toHaveText(`${mission.base} m/s`)
    const outboundEdges = await edgeIds(page)

    await missionModeButton(page, 'return-only').click()
    await expect(page.getByText('Return-only budget', { exact: true })).toBeVisible()
    await expect(origin(page)).toContainText(mission.homeName)
    await expect(destination(page)).toContainText(mission.targetName)
    await expect(detailsToggle(page)).not.toBeChecked()
    await expect(page.getByTestId('route-total')).toHaveText(`${mission.base} m/s`)
    const returnEdges = await edgeIds(page)
    expect(returnEdges).not.toEqual(outboundEdges)
    expect(returnEdges).toEqual(outboundEdges.map(id => {
      if (id === null) throw new Error('A highlighted maneuver is missing its directed ID')
      const [from, to] = id.split('->')
      return `${to}->${from}`
    }).sort())

    await addTwentyPercentReserve(page)
    await expect(page.getByTestId('route-base')).toHaveText(`${mission.base} m/s`)
    await expect(page.getByTestId('route-margin')).toHaveText(`+${mission.reserve} m/s`)
    await expect(page.getByTestId('route-total')).toHaveText(`${mission.total} m/s`)
    expect(await edgeIds(page)).toEqual(returnEdges)
    await detailsToggle(page).check()
    await expect(panel(page).getByText(`Start · ${mission.targetName}`, { exact: true })).toBeVisible()
    await expect(panel(page).getByText(`End · ${mission.homeName}`, { exact: true })).toBeVisible()
    await expect(maneuvers(page).last()).toContainText(mission.homeName)
    await expect(page.getByRole('tab', { name: 'Outbound', exact: true })).toHaveCount(0)
    await expect(page.getByRole('tab', { name: 'Return', exact: true })).toHaveCount(0)
    if (mission.pack === 'Stock') {
      await expect(highlightedEdges(page)).toHaveCount(4)
      await expect(page.locator('[data-aerobraking-edge][data-selected="true"]')).toHaveCount(2)
      await expect(maneuvers(page).first()).toContainText('580 m/s')
      await expect(maneuvers(page).last()).toContainText('3,400 m/s')
    }
  })
}

test('switches modes, swaps the return direction, and clears a zero-distance mission', async ({ page }) => {
  await node(page, 'stock:kerbin:surface').click()
  await node(page, 'stock:mun:surface').click()
  const outboundEdges = await edgeIds(page)
  await detailsToggle(page).check()
  const returnOnly = missionModeButton(page, 'return-only')
  await returnOnly.focus()
  await returnOnly.press('Space')
  await expect(returnOnly).toHaveAttribute('aria-pressed', 'true')
  await returnOnly.click()
  await expect(returnOnly, 'Clicking the current mode must keep one choice selected').toHaveAttribute('aria-pressed', 'true')
  await expect(panel(page).getByText('Start · Mun surface', { exact: true })).toBeVisible()
  const roundTrip = missionModeButton(page, 'round-trip')
  await roundTrip.focus()
  await roundTrip.press('Enter')
  await expect(page.getByTestId('route-total')).toHaveText('10,240 m/s')
  await expect(page.getByRole('tab', { name: 'Outbound', exact: true })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('tab', { name: 'Return', exact: true }).click()
  await missionModeButton(page, 'one-way').click()
  await expect(page.getByTestId('route-total')).toHaveText('5,120 m/s')
  await expect(panel(page).getByText('Start · Kerbin surface', { exact: true })).toBeVisible()
  await expect(page.getByRole('tab')).toHaveCount(0)
  expect(await edgeIds(page)).toEqual(outboundEdges)

  await missionModeButton(page, 'return-only').click()
  await page.getByRole('button', { name: 'Swap origin and destination', exact: true }).click()
  await expect(missionModeButton(page, 'return-only')).toHaveAttribute('aria-pressed', 'true')
  await expect(origin(page)).toContainText('Mun surface')
  await expect(destination(page)).toContainText('Kerbin surface')
  await expect(panel(page).getByText('Start · Kerbin surface', { exact: true })).toBeVisible()
  await expect(panel(page).getByText('End · Mun surface', { exact: true })).toBeVisible()
  expect(await edgeIds(page)).toEqual(outboundEdges)

  await destination(page).click()
  await node(page, 'stock:mun:surface').click()
  await expect(page.getByTestId('route-total')).toHaveText('0 m/s')
  await expect(highlightedEdges(page)).toHaveCount(0)
  await expect(maneuvers(page)).toHaveCount(0)
  await expect(panel(page).getByText('No maneuvers required.', { exact: true })).toBeVisible()
  await addTwentyPercentReserve(page)
  await page.getByRole('button', { name: 'Reset mission', exact: true }).click()
  await expect(missionModeButton(page, 'one-way')).toHaveAttribute('aria-pressed', 'true')
  await expect(detailsToggle(page)).not.toBeChecked()
  await expect(page.getByRole('slider', { name: 'Redundancy', exact: true })).toHaveAttribute('aria-valuenow', '0')
  await expect(page.getByTestId('route-total')).toHaveCount(0)
})

test('retains return-only mode and reserve through compatible and incompatible pack changes', async ({ page }) => {
  await node(page, 'stock:kerbin:surface').click()
  await node(page, 'stock:mun:surface').click()
  await missionModeButton(page, 'return-only').click()
  await addTwentyPercentReserve(page)
  await detailsToggle(page).check()
  await packButton(page, 'OPM').click()
  await expect(missionModeButton(page, 'return-only')).toHaveAttribute('aria-pressed', 'true')
  await expect(origin(page)).toContainText('Kerbin surface')
  await expect(destination(page)).toContainText('Mun surface')
  await expect(page.getByTestId('route-total')).toHaveText('6,144 m/s')
  await expect(detailsToggle(page)).not.toBeChecked()
  await packButton(page, 'RSS').click()
  await expect(missionModeButton(page, 'return-only')).toHaveAttribute('aria-pressed', 'true')
  await expect(origin(page)).toContainText('Select origin')
  await expect(destination(page)).toContainText('Select destination')
  await expect(page.getByTestId('route-total')).toHaveCount(0)
  await expect(page.getByRole('slider', { name: 'Redundancy', exact: true })).toHaveAttribute('aria-valuenow', '20')
  await node(page, 'rss:earth:surface').click()
  await node(page, 'rss:moon:surface').click()
  await expect(page.getByTestId('route-total')).toHaveText('17,592 m/s')
  await detailsToggle(page).check()
  await expect(panel(page).getByText('Start · Moon surface', { exact: true })).toBeVisible()
  await expect(panel(page).getByText('End · Earth surface', { exact: true })).toBeVisible()
})

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
  { width: 844, height: 390 },
  { width: 667, height: 375 },
]) {
  for (const mission of missions) {
    test(`keeps all ${mission.pack} mission modes usable without scrolling at ${viewport.width}×${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await packButton(page, mission.pack).click()
      await page.getByRole('button', { name: 'Reset mission', exact: true }).click()
      await node(page, mission.home).click()
      await node(page, mission.target).click()
      for (const mode of ['round-trip', 'return-only', 'one-way', 'return-only'] as const) {
        await missionModeButton(page, mode).click()
        await expect(missionModeButton(page, mode)).toHaveAttribute('aria-pressed', 'true')
        await assertScreenBounds(page)
      }
      await expect(page.getByText('Return-only budget', { exact: true })).toBeInViewport({ ratio: 1 })
      await detailsToggle(page).check()
      await expect(panel(page).getByText(`Start · ${mission.targetName}`, { exact: true })).toBeInViewport({ ratio: 1 })
      await expect(panel(page).getByText(`End · ${mission.homeName}`, { exact: true })).toBeInViewport({ ratio: 1 })
      const bounds = await panel(page).boundingBox()
      const footer = await page.getByRole('contentinfo').boundingBox()
      expect(bounds).not.toBeNull()
      expect(footer).not.toBeNull()
      if (bounds && footer) {
        expect(bounds.x).toBeGreaterThanOrEqual(0)
        expect(bounds.y).toBeGreaterThanOrEqual(0)
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width)
        expect(bounds.y + bounds.height, 'Return-only details must leave mission controls usable').toBeLessThanOrEqual(footer.y + 1)
      }
      await assertScreenBounds(page)
      await detailsToggle(page).uncheck()
    })
  }
}
