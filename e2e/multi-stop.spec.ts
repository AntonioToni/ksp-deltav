import { expect, test, type Locator, type Page } from '@playwright/test'
import { missionModeButton } from './helpers/missionMode'

const state = (page: Page, id: string) => page.locator(`[data-node-id="${id}"]`)
const pack = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const editStops = (page: Page) => page.getByRole('button', { name: 'Edit mission stops', exact: true })
const editor = (page: Page) => page.getByRole('dialog', { name: /^Mission stops\b/ })
const stopRows = (page: Page) => editor(page).getByRole('list', { name: 'Mission stops', exact: true }).getByRole('listitem')
const details = (page: Page) => page.getByLabel('Show breakdown', { exact: true })
const breakdown = (page: Page) => page.getByRole('region', { name: 'Maneuver breakdown panel', exact: true })
const maneuvers = (page: Page) => page.getByRole('list', { name: 'Maneuver breakdown', exact: true }).getByRole('listitem')
const nextStage = (page: Page) => page.getByRole('button', { name: 'Next stage', exact: true })
const previousStage = (page: Page) => page.getByRole('button', { name: 'Previous stage', exact: true })

let browserErrors: string[]

test.beforeEach(async ({ page }) => {
  browserErrors = []
  page.on('pageerror', error => browserErrors.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  await page.goto('./')
  await expect(editStops(page)).toBeVisible()
})

test.afterEach(() => {
  expect(browserErrors, 'Ordered missions should not produce browser errors').toEqual([])
})

async function plan(page: Page, start: string, end: string) {
  await state(page, start).click()
  await state(page, end).click()
}

async function openEditor(page: Page) {
  await editStops(page).click()
  await expect(editor(page)).toBeVisible()
}

async function addStop(page: Page, label: string) {
  await editor(page).getByRole('combobox', { name: 'Choose a stop', exact: true }).fill(label)
  await page.getByRole('option', { name: label, exact: true }).click()
  await editor(page).getByRole('button', { name: 'Add stop', exact: true }).click()
}

async function finishEditing(page: Page) {
  await editor(page).getByRole('button', { name: 'Done', exact: true }).click()
  await expect(editor(page)).not.toBeVisible()
}

async function reserve(page: Page, percentage: 20 | 100) {
  const slider = page.getByRole('slider', { name: 'Redundancy', exact: true })
  await slider.focus()
  await slider.press(percentage === 100 ? 'End' : 'Home')
  if (percentage === 20) for (let index = 0; index < 4; index++) await slider.press('ArrowRight')
  await expect(slider).toHaveAttribute('aria-valuenow', String(percentage))
}

async function expectStage(page: Page, position: string, start: string, end: string, cost?: string) {
  await expect(page.getByTestId('stage-position')).toHaveText(position)
  await expect(breakdown(page).getByText(`Start · ${start}`, { exact: true })).toBeVisible()
  await expect(breakdown(page).getByText(`End · ${end}`, { exact: true })).toBeVisible()
  if (cost !== undefined) await expect(page.getByTestId('stage-total')).toHaveText(`${cost} m/s`)
}

async function expectOnScreen(locator: Locator, page: Page) {
  const bounds = await locator.boundingBox()
  const viewport = page.viewportSize()
  expect(bounds).not.toBeNull()
  expect(viewport).not.toBeNull()
  if (bounds && viewport) {
    expect(bounds.x).toBeGreaterThanOrEqual(-1)
    expect(bounds.y).toBeGreaterThanOrEqual(-1)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width + 1)
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height + 1)
  }
}

async function expectPageFits(page: Page) {
  const geometry = await page.evaluate(() => ({
    viewport: { width: innerWidth, height: innerHeight },
    document: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
    scroll: { x: scrollX, y: scrollY },
  }))
  expect(geometry.document.width).toBeLessThanOrEqual(geometry.viewport.width)
  expect(geometry.document.height).toBeLessThanOrEqual(geometry.viewport.height)
  expect(geometry.scroll).toEqual({ x: 0, y: 0 })
}

async function expectDetailsAboveControls(page: Page) {
  await expectOnScreen(breakdown(page), page)
  const bounds = await breakdown(page).boundingBox()
  const footer = await page.getByRole('contentinfo').boundingBox()
  expect(footer).not.toBeNull()
  if (bounds && footer) expect(bounds.y + bounds.height).toBeLessThanOrEqual(footer.y + 1)
}

test('visits the Mun before Minmus and budgets each stage and the complete round trip once', async ({ page }) => {
  await plan(page, 'stock:kerbin:surface', 'stock:minmus:surface')
  await expect(page.getByTestId('route-total')).toHaveText('4,660 m/s')
  await openEditor(page)
  await addStop(page, 'Mun surface')
  await finishEditing(page)
  await expect(page.getByTestId('route-total')).toHaveText('8,100 m/s')
  await expect(state(page, 'stock:mun:surface')).toHaveAttribute('data-waypoint-indexes', '1')
  await expect(details(page)).not.toBeChecked()
  await details(page).check()
  await expectStage(page, '1 / 2', 'Kerbin surface', 'Mun surface', '5,120')
  await expect(previousStage(page)).toBeDisabled()
  await nextStage(page).click()
  await expectStage(page, '2 / 2', 'Mun surface', 'Minmus surface', '2,980')
  await expect(nextStage(page)).toBeDisabled()

  await missionModeButton(page, 'round-trip').click()
  await expect(page.getByTestId('route-total')).toHaveText('16,200 m/s')
  await expectStage(page, '1 / 2', 'Kerbin surface', 'Mun surface', '5,120')
  await page.getByRole('tab', { name: 'Return', exact: true }).click()
  await expectStage(page, '1 / 2', 'Minmus surface', 'Mun surface', '2,980')
  await nextStage(page).click()
  await expectStage(page, '2 / 2', 'Mun surface', 'Kerbin surface', '5,120')
  await reserve(page, 20)
  await expect(page.getByTestId('route-base')).toHaveText('16,200 m/s')
  await expect(page.getByTestId('route-margin')).toHaveText('+3,240 m/s')
  await expect(page.getByTestId('route-total')).toHaveText('19,440 m/s')
  await expect(page.getByTestId('stage-total')).toHaveText('5,120 m/s')
})

for (const mission of [
  { pack: 'OPM', start: 'stock:kerbin:surface', end: 'opm:tekto:surface', home: 'Kerbin surface', stop: 'Kerbin low orbit', target: 'Tekto surface', base: '11,927', first: '3,400', second: '8,527', reserved: '14,313' },
  { pack: 'RSS', start: 'rss:earth:surface', end: 'rss:moon:surface', home: 'Earth surface', stop: 'Earth low orbit', target: 'Moon surface', base: '14,660', first: '9,000', second: '5,660', reserved: '17,592' },
]) {
  test(`splits the sourced ${mission.pack} budget at a stop and reverses its stage order`, async ({ page }) => {
    await pack(page, mission.pack).click()
    await plan(page, mission.start, mission.end)
    await openEditor(page)
    await addStop(page, mission.stop)
    await finishEditing(page)
    await expect(page.getByTestId('route-total')).toHaveText(`${mission.base} m/s`)
    await details(page).check()
    await expectStage(page, '1 / 2', mission.home, mission.stop, mission.first)
    await nextStage(page).click()
    await expectStage(page, '2 / 2', mission.stop, mission.target, mission.second)
    await missionModeButton(page, 'return-only').click()
    await expectStage(page, '1 / 2', mission.target, mission.stop, mission.second)
    await nextStage(page).click()
    await expectStage(page, '2 / 2', mission.stop, mission.home, mission.first)
    await reserve(page, 20)
    await expect(page.getByTestId('route-total')).toHaveText(`${mission.reserved} m/s`)
  })
}

test('preserves duplicate zero-length stages and limits the itinerary to four stops', async ({ page }) => {
  await plan(page, 'stock:kerbin:surface', 'stock:duna:surface')
  await openEditor(page)
  for (const label of ['Mun surface', 'Mun surface', 'Minmus surface', 'Kerbin low orbit']) await addStop(page, label)
  await expect(stopRows(page)).toHaveCount(4)
  await expect(editor(page).getByRole('button', { name: 'Add stop', exact: true })).toBeDisabled()
  await expect(editor(page).getByRole('button', { name: 'Select stop on map', exact: true })).toBeDisabled()
  await expect(editor(page).getByRole('button', { name: 'Move stop 1 up', exact: true })).toBeDisabled()
  await expect(editor(page).getByRole('button', { name: 'Move stop 4 down', exact: true })).toBeDisabled()
  await finishEditing(page)
  await expect(state(page, 'stock:mun:surface')).toHaveAttribute('data-waypoint-indexes', '1,2')
  await details(page).check()
  await nextStage(page).click()
  await expectStage(page, '2 / 5', 'Mun surface', 'Mun surface', '0')
  await expect(maneuvers(page)).toHaveCount(0)
  await expect(breakdown(page).getByText('No maneuvers required.', { exact: true })).toBeVisible()
})

test('reorders and removes stops, reverses them when swapping endpoints, and removes the entire list', async ({ page }) => {
  await plan(page, 'stock:kerbin:surface', 'stock:duna:surface')
  await openEditor(page)
  for (const label of ['Mun surface', 'Minmus surface', 'Kerbin low orbit']) await addStop(page, label)
  await editor(page).getByRole('button', { name: 'Move stop 3 up', exact: true }).click()
  await expect(stopRows(page)).toContainText(['Mun surface', 'Kerbin low orbit', 'Minmus surface'])
  await editor(page).getByRole('button', { name: 'Remove stop 2', exact: true }).click()
  await editor(page).getByRole('button', { name: 'Move stop 1 down', exact: true }).click()
  await expect(stopRows(page)).toContainText(['Minmus surface', 'Mun surface'])
  await finishEditing(page)
  await expect(state(page, 'stock:minmus:surface')).toHaveAttribute('data-waypoint-indexes', '1')
  await expect(state(page, 'stock:mun:surface')).toHaveAttribute('data-waypoint-indexes', '2')
  await page.getByRole('button', { name: 'Swap origin and destination', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Choose origin', exact: true })).toContainText('Duna surface')
  await expect(page.getByRole('button', { name: 'Choose destination', exact: true })).toContainText('Kerbin surface')
  await openEditor(page)
  await expect(stopRows(page)).toContainText(['Mun surface', 'Minmus surface'])
  await editor(page).getByRole('button', { name: 'Remove all stops', exact: true }).click()
  await expect(stopRows(page)).toHaveCount(0)
  await finishEditing(page)
  await expect(page.locator('[data-waypoint-indexes]')).toHaveCount(0)
})

test('adds stops from the map and cancels a map pick without changing the selected endpoints', async ({ page }) => {
  await plan(page, 'stock:kerbin:surface', 'stock:minmus:surface')
  await openEditor(page)
  await editor(page).getByRole('button', { name: 'Select stop on map', exact: true }).click()
  await expect(editor(page)).not.toBeVisible()
  await page.getByRole('button', { name: 'Cancel stop selection', exact: true }).click()
  await expect(editor(page)).toBeVisible()
  await expect(stopRows(page)).toHaveCount(0)
  await editor(page).getByRole('button', { name: 'Select stop on map', exact: true }).click()
  await page.keyboard.press('Escape')
  await expect(editor(page)).toBeVisible()
  await expect(stopRows(page)).toHaveCount(0)
  await editor(page).getByRole('button', { name: 'Select stop on map', exact: true }).click()
  await state(page, 'stock:mun:surface').click()
  await expect(editor(page)).toBeVisible()
  await expect(stopRows(page)).toContainText(['Mun surface'])
  await finishEditing(page)
  await expect(page.getByRole('button', { name: 'Choose origin', exact: true })).toContainText('Kerbin surface')
  await expect(page.getByRole('button', { name: 'Choose destination', exact: true })).toContainText('Minmus surface')
  await expect(page.getByTestId('route-total')).toHaveText('8,100 m/s')
})

test('retains supported stops across packs, drops unavailable stops, and clears them with the mission', async ({ page }) => {
  await pack(page, 'OPM').click()
  await plan(page, 'stock:kerbin:surface', 'stock:minmus:surface')
  await openEditor(page)
  await addStop(page, 'Mun surface')
  await addStop(page, 'Tekto surface')
  await finishEditing(page)
  await missionModeButton(page, 'return-only').click()
  await reserve(page, 20)
  await pack(page, 'Stock').click()
  await openEditor(page)
  await expect(stopRows(page)).toHaveCount(1)
  await expect(stopRows(page)).toContainText(['Mun surface'])
  await finishEditing(page)
  await expect(page.getByTestId('route-total')).toHaveText('9,720 m/s')
  await pack(page, 'RSS').click()
  await openEditor(page)
  await expect(stopRows(page)).toHaveCount(0)
  await addStop(page, 'Earth low orbit')
  await finishEditing(page)
  await expect(missionModeButton(page, 'return-only')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('slider', { name: 'Redundancy', exact: true })).toHaveAttribute('aria-valuenow', '20')
  await page.getByRole('button', { name: 'Reset mission', exact: true }).click()
  await expect(missionModeButton(page, 'one-way')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('route-total')).toHaveCount(0)
  await openEditor(page)
  await expect(stopRows(page)).toHaveCount(0)
})

for (const viewport of [{ width: 320, height: 568 }, { width: 667, height: 375 }]) {
  test(`keeps all four stops and editor controls visible at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await openEditor(page)
    for (const label of ['Mun surface', 'Minmus surface', 'Duna surface', 'Ike surface']) await addStop(page, label)
    await expect(stopRows(page)).toHaveCount(4)
    await expectOnScreen(editor(page), page)
    for (const row of await stopRows(page).all()) await expectOnScreen(row, page)
    for (const name of ['Remove all stops', 'Done', 'Select stop on map', 'Add stop']) {
      await expectOnScreen(editor(page).getByRole('button', { name, exact: true }), page)
    }
    await expectOnScreen(editor(page).getByRole('combobox', { name: 'Choose a stop', exact: true }), page)
    await expectPageFits(page)
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
  test(`keeps the ordered route and paged stages usable without scrolling at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await plan(page, 'stock:kerbin:surface', 'stock:minmus:surface')
    await openEditor(page)
    await addStop(page, 'Mun surface')
    await finishEditing(page)
    await expect(page.getByTestId('route-total')).toHaveText('8,100 m/s')
    for (const name of ['Stock', 'OPM', 'RSS']) await expectOnScreen(pack(page, name), page)
    for (const mode of ['one-way', 'round-trip', 'return-only'] as const) await expectOnScreen(missionModeButton(page, mode), page)
    await expectOnScreen(editStops(page), page)
    await expectOnScreen(page.getByRole('button', { name: 'Reset mission', exact: true }), page)
    await expectOnScreen(page.locator('.MuiSlider-root'), page)
    await details(page).check()
    await expectStage(page, '1 / 2', 'Kerbin surface', 'Mun surface', '5,120')
    await expectDetailsAboveControls(page)
    await nextStage(page).click()
    await expectStage(page, '2 / 2', 'Mun surface', 'Minmus surface', '2,980')
    await expectDetailsAboveControls(page)
    await expectOnScreen(previousStage(page), page)
    await expectOnScreen(nextStage(page), page)
    await expectPageFits(page)
  })
}

for (const viewport of [{ width: 320, height: 568 }, { width: 667, height: 375 }]) {
  test(`pages a long OPM journey separately from a zero-length stop at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await pack(page, 'OPM').click()
    await plan(page, 'opm:tal:surface', 'stock:gilly:surface')
    await openEditor(page)
    await addStop(page, 'Tal surface')
    await finishEditing(page)
    await missionModeButton(page, 'round-trip').click()
    await reserve(page, 100)
    // Nominal round trip: 17,246 m/s, doubled by the 100% reserve.
    await expect(page.getByTestId('route-total')).toHaveText('34,492 m/s')
    await details(page).check()
    await page.getByRole('tab', { name: 'Return', exact: true }).click()
    await expectStage(page, '1 / 2', 'Gilly surface', 'Tal surface')
    const count = await maneuvers(page).count()
    expect(count).toBeGreaterThan(0)
    expect(count, 'The details should show one stage instead of the whole mission').toBeLessThanOrEqual(17)
    for (const row of await maneuvers(page).all()) await expectOnScreen(row, page)
    await expectDetailsAboveControls(page)
    await nextStage(page).click()
    await expectStage(page, '2 / 2', 'Tal surface', 'Tal surface', '0')
    await expect(maneuvers(page)).toHaveCount(0)
    await expectDetailsAboveControls(page)
    await expectOnScreen(editStops(page), page)
    await expectPageFits(page)
  })
}
