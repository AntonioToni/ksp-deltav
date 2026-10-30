import { expect, test, type Page } from '@playwright/test'
import { missionModeButton } from './helpers/missionMode'

const node = (page: Page, id: string) => page.locator(`[data-node-id="${id}"]`)
const flow = (page: Page) => page.locator('[data-route-animation="true"]')
const runs = (page: Page) => flow(page).locator('[data-flow-run]')
const trail = (page: Page) => runs(page).first().locator('path.route-flow-trail').last()
const highlighted = (page: Page) => page.locator('[data-route-edge="true"]')
const total = (page: Page) => page.getByTestId('route-total')
const editor = (page: Page) => page.getByRole('dialog', { name: /^Mission stops\b/ })

let browserErrors: string[]

test.beforeEach(async ({ page }) => {
  browserErrors = []
  page.on('pageerror', error => browserErrors.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  await page.goto('./')
  await expect(page.getByRole('button', { name: 'Edit mission stops', exact: true })).toBeVisible()
})

test.afterEach(() => {
  expect(browserErrors, 'Route animation should not produce browser errors').toEqual([])
})

async function plan(page: Page, start = 'stock:kerbin:surface', end = 'stock:duna:surface') {
  await node(page, start).click()
  await node(page, end).click()
}

async function openStops(page: Page) {
  await page.getByRole('button', { name: 'Edit mission stops', exact: true }).click()
  await expect(editor(page)).toBeVisible()
}

async function addStop(page: Page, label: string) {
  await editor(page).getByRole('combobox', { name: 'Choose a stop', exact: true }).fill(label)
  await page.getByRole('option', { name: label, exact: true }).click()
  await editor(page).getByRole('button', { name: 'Add stop', exact: true }).click()
}

async function closeStops(page: Page) {
  await editor(page).getByRole('button', { name: 'Done', exact: true }).click()
  await expect(editor(page)).not.toBeVisible()
}

/** Read browser-rendered SVG geometry, independently of the route-flow helper. */
async function geometry(page: Page, nodeIds: string[]) {
  return page.evaluate(ids => {
    const points = Object.fromEntries(ids.map(id => {
      const element = document.querySelector<SVGGElement>(`[data-node-id="${id}"]`)
      const matrix = element?.transform.baseVal.consolidate()?.matrix
      if (!matrix) throw new Error(`Missing mapped node: ${id}`)
      return [id, { x: matrix.e, y: matrix.f }]
    }))
    const paths = Array.from(document.querySelectorAll<SVGGElement>('[data-flow-run]')).map(run => {
      const path = run.querySelector<SVGPathElement>('path.route-flow-trail')
      if (!path) throw new Error('The moving route highlight is missing')
      const length = path.getTotalLength()
      const start = path.getPointAtLength(0)
      const end = path.getPointAtLength(length)
      // Route geometry is a polyline. Reading its vertices preserves each visit
      // to a stop, which endpoint-only checks would miss on a backtracking trip.
      const numbers = (path.getAttribute('d')?.match(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi) ?? []).map(Number)
      const vertices = Array.from({ length: numbers.length / 2 }, (_, index) => ({ x: numbers[index * 2], y: numbers[index * 2 + 1] }))
      return {
        d: path.getAttribute('d'), length, vertices,
        start: { x: start.x, y: start.y }, end: { x: end.x, y: end.y },
        firstSegment: Number(run.dataset.firstSegment), lastSegment: Number(run.dataset.lastSegment),
      }
    })
    return { points, paths }
  }, nodeIds)
}

function samePoint(actual: { x: number; y: number }, expected: { x: number; y: number }) {
  expect(actual.x).toBeCloseTo(expected.x, 3)
  expect(actual.y).toBeCloseTo(expected.y, 3)
}

async function expectDirection(page: Page, from: string, to: string) {
  await expect(flow(page)).toBeVisible()
  const { paths, points } = await geometry(page, [from, to])
  expect(paths).toHaveLength(1)
  samePoint(paths[0].start, points[from])
  samePoint(paths[0].end, points[to])
  return paths[0]
}

async function expectOrderedVisits(page: Page, ids: string[]) {
  const { paths, points } = await geometry(page, ids)
  expect(paths).toHaveLength(1)
  let previousIndex = -1
  for (const id of ids) {
    const index = paths[0].vertices.findIndex((point, index) => index > previousIndex
      && Math.hypot(point.x - points[id].x, point.y - points[id].y) < 0.01)
    expect(index, `The animated path must visit ${id} after the preceding stop`).toBeGreaterThan(previousIndex)
    previousIndex = index
  }
  return paths[0]
}

test('moves a decorative highlight from Kerbin toward Duna while retaining atmospheric markers', async ({ page }) => {
  const atmosphericMarkers = await page.locator('[data-aerobraking-edge]').count()
  await plan(page)
  await expect(total(page)).toHaveText('6,540 m/s')
  await expectDirection(page, 'stock:kerbin:surface', 'stock:duna:surface')
  await expect(flow(page)).toHaveAttribute('aria-hidden', 'true')
  await expect(flow(page)).toHaveAttribute('pointer-events', 'none')
  await expect(highlighted(page)).toHaveCount(6)
  await expect(page.locator('[data-aerobraking-edge]')).toHaveCount(atmosphericMarkers)
  expect(await trail(page).evaluate(element => getComputedStyle(element).animationName)).not.toBe('none')
  const initialOffset = await trail(page).evaluate(element => Number.parseFloat(getComputedStyle(element).strokeDashoffset))
  await expect.poll(() => trail(page).evaluate(element => Number.parseFloat(getComputedStyle(element).strokeDashoffset))).toBeLessThan(initialOffset - 0.01)
  await expect(total(page)).toHaveText('6,540 m/s')
})

test('reverses travel for return-only and swapped endpoints', async ({ page }) => {
  await plan(page)
  const outward = await expectDirection(page, 'stock:kerbin:surface', 'stock:duna:surface')
  await missionModeButton(page, 'return-only').click()
  const returning = await expectDirection(page, 'stock:duna:surface', 'stock:kerbin:surface')
  expect(returning.length).toBeCloseTo(outward.length, 2)
  await missionModeButton(page, 'one-way').click()
  await page.getByRole('button', { name: 'Swap origin and destination', exact: true }).click()
  await expectDirection(page, 'stock:duna:surface', 'stock:kerbin:surface')
  await expect(total(page)).toHaveText('6,540 m/s')
})

test('follows and reorders multiple stops, retaining outward and inward passes over shared lines', async ({ page }) => {
  await plan(page)
  await openStops(page)
  await addStop(page, 'Mun surface')
  await addStop(page, 'Minmus surface')
  await closeStops(page)
  const first = await expectOrderedVisits(page, ['stock:kerbin:surface', 'stock:mun:surface', 'stock:minmus:surface', 'stock:duna:surface'])
  const kerbinOrbit = (await geometry(page, ['stock:kerbin:orbit'])).points['stock:kerbin:orbit']
  expect(first.vertices.filter(point => Math.hypot(point.x - kerbinOrbit.x, point.y - kerbinOrbit.y) < 0.01)).toHaveLength(3)
  await expect(page.locator('[data-route-edge="true"][data-edge-id="stock:mun:orbit->stock:mun:surface"]')).toHaveCount(1)
  await expect(page.locator('[data-route-edge="true"][data-edge-id="stock:mun:surface->stock:mun:orbit"]')).toHaveCount(1)
  const before = await total(page).textContent()
  await openStops(page)
  await editor(page).getByRole('button', { name: 'Move stop 2 up', exact: true }).click()
  await closeStops(page)
  const reordered = await expectOrderedVisits(page, ['stock:kerbin:surface', 'stock:minmus:surface', 'stock:mun:surface', 'stock:duna:surface'])
  expect(reordered.d).not.toBe(first.d)
  await expect(total(page)).toHaveText(before!)
})

test('keeps zero-length duplicate stages and animates a complete round trip in itinerary order', async ({ page }) => {
  await plan(page)
  await openStops(page)
  await addStop(page, 'Mun surface')
  await closeStops(page)
  const singleStopPath = await trail(page).getAttribute('d')
  const singleStopTotal = await total(page).textContent()
  await openStops(page)
  await addStop(page, 'Mun surface')
  await closeStops(page)
  await expect(trail(page)).toHaveAttribute('d', singleStopPath!)
  await expect(total(page)).toHaveText(singleStopTotal!)
  await missionModeButton(page, 'round-trip').click()
  await expectDirection(page, 'stock:kerbin:surface', 'stock:kerbin:surface')
  await expectOrderedVisits(page, ['stock:kerbin:surface', 'stock:mun:surface', 'stock:duna:surface', 'stock:mun:surface', 'stock:kerbin:surface'])
  // Opening another breakdown stage must not drop the other mission stages
  // from the animation or reverse the full mission's ordered route.
  const roundTripPath = await trail(page).getAttribute('d')
  await page.getByLabel('Show breakdown', { exact: true }).check()
  await page.getByRole('tab', { name: 'Return', exact: true }).click()
  await page.getByRole('button', { name: 'Next stage', exact: true }).click()
  await expect(trail(page)).toHaveAttribute('d', roundTripPath!)
})

test('honors reduced motion while retaining the route, budget, and atmospheric-braking markers', async ({ page }) => {
  await plan(page)
  const path = await trail(page).getAttribute('d')
  const highlightIds = await highlighted(page).evaluateAll(elements => elements.map(element => element.getAttribute('data-edge-id')))
  const markerCount = await page.locator('[data-aerobraking-edge]').count()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(flow(page)).toBeHidden()
  expect(await highlighted(page).evaluateAll(elements => elements.map(element => element.getAttribute('data-edge-id')))).toEqual(highlightIds)
  await expect(page.locator('[data-aerobraking-edge]')).toHaveCount(markerCount)
  await expect(total(page)).toHaveText('6,540 m/s')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect(flow(page)).toBeVisible()
  await expect(trail(page)).toHaveAttribute('d', path!)
})

test('removes moving highlights for an empty or cleared mission and when switching to an incompatible pack', async ({ page }) => {
  await plan(page, 'stock:kerbin:surface', 'stock:kerbin:surface')
  await expect(total(page)).toHaveText('0 m/s')
  await expect(flow(page)).toHaveCount(0)
  await node(page, 'stock:duna:surface').click()
  await expect(flow(page)).toBeVisible()
  await page.getByRole('button', { name: 'Reset mission', exact: true }).click()
  await expect(flow(page)).toHaveCount(0)
  await expect(highlighted(page)).toHaveCount(0)
  await plan(page)
  await page.getByRole('button', { name: 'RSS', exact: true }).click()
  await expect(flow(page)).toHaveCount(0)
  await expect(total(page)).toHaveCount(0)
})

test('keeps regional animation runs separate across an off-screen Kcalbeloh stop', async ({ page }) => {
  await page.getByRole('button', { name: 'Custom planet packs', exact: true }).click()
  const manager = page.getByRole('dialog', { name: 'Planet packs', exact: true })
  await manager.getByRole('tab', { name: 'Add-ons', exact: true }).click()
  await manager.getByRole('button', { name: 'Use Stock + Kcalbeloh', exact: true }).click()
  await plan(page, 'stock:kerbin:surface', 'stock:mun:surface')
  await openStops(page)
  await addStop(page, 'Sera surface')
  await closeStops(page)
  await page.getByRole('button', { name: 'Link allowances', exact: true }).click()
  const allowances = page.getByRole('dialog', { name: 'Link allowances', exact: true })
  const connection = 'Jool low orbit ↔ Sera low orbit via wormhole'
  await allowances.getByRole('spinbutton', { name: `Forward allowance for ${connection}`, exact: true }).fill('1000')
  await allowances.getByRole('spinbutton', { name: `Reverse allowance for ${connection}`, exact: true }).fill('2000')
  await allowances.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('combobox', { name: 'Map view', exact: true }).click()
  await page.getByRole('option', { name: 'Kerbol system', exact: true }).click()
  await expect(runs(page)).toHaveCount(2)
  const { paths, points } = await geometry(page, ['stock:kerbin:surface', 'stock:jool:orbit', 'stock:mun:surface'])
  samePoint(paths[0].start, points['stock:kerbin:surface'])
  samePoint(paths[0].end, points['stock:jool:orbit'])
  samePoint(paths[1].start, points['stock:jool:orbit'])
  samePoint(paths[1].end, points['stock:mun:surface'])
  expect(paths[1].firstSegment).toBeGreaterThan(paths[0].lastSegment + 1)
  expect(Number(await flow(page).getAttribute('data-flow-distance'))).toBeGreaterThan(paths.reduce((sum, path) => sum + path.length, 0))
  await expect(node(page, 'kcalbeloh:sera:surface')).toHaveCount(0)
})
