import { expect, test, type Page } from '@playwright/test'
import { missionModeButton } from './helpers/missionMode'

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const node = (page: Page, id: string) => page.locator(`[data-node-id="${id}"]`)
const direct = (page: Page) => page.locator('[data-route-edge="true"][data-direct-transfer="true"]')
const selected = (page: Page) => page.locator('[data-route-edge="true"]')
const flow = (page: Page) => page.locator('[data-route-animation="true"]')
const total = (page: Page) => page.getByTestId('route-total')
const info = (page: Page) => page.getByRole('dialog', { name: 'About these estimates', exact: true })
const rows = (page: Page) => page.getByRole('list', { name: 'Maneuver breakdown', exact: true }).getByRole('listitem')
const formatted = (value: number) => `${value.toLocaleString('en-US')} m/s`
let browserErrors: string[]

test.beforeEach(async ({ page }) => {
  browserErrors = []
  page.on('pageerror', error => browserErrors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()) })
  await page.goto('./')
  await button(page, 'RSS').click()
  await expect(button(page, 'RSS')).toHaveAttribute('aria-pressed', 'true')
})

test.afterEach(() => {
  expect(browserErrors, 'RSS direct transfers should not produce browser errors').toEqual([])
})

async function plan(page: Page, from: string, to: string) {
  for (const id of [from, to]) {
    await node(page, id).focus()
    await node(page, id).press('Enter')
  }
}

async function addStop(page: Page, label: string) {
  await button(page, 'Edit mission stops').click()
  const dialog = page.getByRole('dialog', { name: /^Mission stops\b/ })
  await dialog.getByRole('combobox', { name: 'Choose a stop', exact: true }).fill(label)
  await page.getByRole('option', { name: label, exact: true }).click()
  await dialog.getByRole('button', { name: 'Add stop', exact: true }).click()
  await dialog.getByRole('button', { name: 'Done', exact: true }).click()
}

async function geometry(page: Page, ids: string[]) {
  return page.evaluate(nodeIds => {
    const points = Object.fromEntries(nodeIds.map(id => {
      const matrix = document.querySelector<SVGGElement>(`[data-node-id="${id}"]`)?.transform.baseVal.consolidate()?.matrix
      if (!matrix) throw new Error(`Missing endpoint ${id}`)
      return [id, { x: matrix.e, y: matrix.f }]
    }))
    const paths = Array.from(document.querySelectorAll<SVGPathElement>('[data-flow-run] path.route-flow-trail:last-child')).map(path => {
      const values = (path.getAttribute('d')?.match(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi) ?? []).map(Number)
      const start = path.getPointAtLength(0)
      const end = path.getPointAtLength(path.getTotalLength())
      return {
        start: { x: start.x, y: start.y }, end: { x: end.x, y: end.y },
        length: path.getTotalLength(),
        vertices: Array.from({ length: values.length / 2 }, (_, index) => ({ x: values[index * 2], y: values[index * 2 + 1] })),
      }
    })
    return { points, paths }
  }, ids)
}

function samePoint(actual: { x: number; y: number }, expected: { x: number; y: number }) {
  expect(actual.x).toBeCloseTo(expected.x, 3)
  expect(actual.y).toBeCloseTo(expected.y, 3)
}

async function direction(page: Page, from: string, to: string, via: string[] = []) {
  await expect(flow(page)).toHaveCount(1)
  // A painted horizontal/vertical SVG stroke has a zero-area geometric box,
  // so Playwright's box-based visibility check would reject a valid route.
  // Check the actual paint/animation styles and nonzero path length instead.
  const paint = await flow(page).evaluate(group => {
    let hidden = false
    for (let element: Element | null = group; element; element = element.parentElement) {
      const style = getComputedStyle(element)
      if (style.display === 'none' || style.visibility !== 'visible' || Number.parseFloat(style.opacity) === 0) hidden = true
    }
    const trail = group.querySelector<SVGPathElement>('path.route-flow-trail:last-child')!
    const style = getComputedStyle(trail)
    return { hidden, stroke: style.stroke, width: Number.parseFloat(style.strokeWidth),
      opacity: Number.parseFloat(style.strokeOpacity), animation: style.animationName }
  })
  expect(paint.hidden).toBe(false)
  expect(paint.stroke).not.toBe('none')
  expect(paint.width).toBeGreaterThan(0)
  expect(paint.opacity).toBeGreaterThan(0)
  expect(paint.animation).not.toBe('none')
  const { points, paths } = await geometry(page, [from, to, ...via])
  expect(paths).toHaveLength(1)
  expect(paths[0].length).toBeGreaterThan(0)
  samePoint(paths[0].start, points[from])
  samePoint(paths[0].end, points[to])
  let previousVertex = -1
  for (const id of via) {
    const vertex = paths[0].vertices.findIndex((point, index) => index > previousVertex && Math.hypot(point.x - points[id].x, point.y - points[id].y) < .01)
    expect(vertex, `Flow should pass through ${id} in itinerary order`).toBeGreaterThan(previousVertex)
    previousVertex = vertex
  }
}

async function noEarthVisit(page: Page) {
  await expect(page.locator('[data-route-edge="true"][data-edge-id*="rss:earth:"]')).toHaveCount(0)
  await expect(page.getByTestId('route-status')).not.toContainText('Earth parking-orbit layover')
}

async function pageFits(page: Page) {
  expect(await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, x: scrollX, y: scrollY })))
    .toEqual({ ...page.viewportSize()!, x: 0, y: 0 })
}

test('adds only the selected RSS direct band and identifies its modeled cost and limitations', async ({ page }) => {
  await expect(page.locator('[data-node-id]')).toHaveCount(102)
  await expect(direct(page)).toHaveCount(0)
  const originalConnections = await page.locator('[data-connection-id]').count()
  await plan(page, 'rss:mars:orbit', 'rss:venus:orbit')
  // Independent complete departure/capture reference, rounded per endpoint.
  await expect(total(page)).toHaveText('7,850 m/s')
  await expect(selected(page)).toHaveCount(1)
  await expect(direct(page)).toHaveAttribute('data-edge-id', 'direct:rss:mars:orbit->rss:venus:orbit')
  await expect(page.locator('[data-connection-id]')).toHaveCount(originalConnections + 1)
  await expect(page.getByTestId('route-status')).toContainText(/analytic direct transfer/)
  await noEarthVisit(page)
  await direction(page, 'rss:mars:orbit', 'rss:venus:orbit')
  const trail = flow(page).locator('[data-flow-run]').first().locator('path.route-flow-trail').last()
  const before = await trail.evaluate(element => Number.parseFloat(getComputedStyle(element).strokeDashoffset))
  await expect.poll(() => trail.evaluate(element => Number.parseFloat(getComputedStyle(element).strokeDashoffset))).toBeLessThan(before - .01)
  await button(page, 'Budget assumptions').click()
  const model = info(page).locator('[data-budget-summary-kind="model"]')
  await expect(model).toContainText('7,850 m/s')
  await expect(model).toContainText('1 maneuver')
  await expect(info(page).locator('[data-budget-summary-kind]')).toHaveCount(1)
  await expect(info(page)).toContainText('Each complete pair includes departure and powered arrival')
  await info(page).getByRole('tab', { name: 'Sources & assumptions', exact: true }).click()
  await expect(info(page).getByRole('link', { name: 'Coplanar direct planetary transfers · analytic reference model', exact: true })).toHaveAttribute('href', /docs\/DATA.md#direct-interplanetary-transfers$/)
  await expect(info(page).locator('a[href$="docs/DATA.md#rss-outer-system-reference-model"]')).toBeVisible()
  await expect(info(page).locator('a[href$="docs/DATA.md#rss-inner-system-reference-model"]')).toBeVisible()
  await info(page).getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByLabel('Show breakdown', { exact: true }).check()
  await expect(rows(page)).toHaveCount(1)
  await expect(rows(page).first()).toHaveAttribute('data-budget-basis', 'model')
  await expect(rows(page).first()).toContainText('Venus low orbit')
  await expect(rows(page).first()).toContainText('7,850 m/s')
  await button(page, 'Reset mission').click()
  await expect(page.locator('[data-connection-id]')).toHaveCount(originalConnections)
})

test('reverses RSS direct flow and applies the reserve once to a complete round trip', async ({ page }) => {
  await plan(page, 'rss:mars:orbit', 'rss:venus:orbit')
  await missionModeButton(page, 'return-only').click()
  await expect(total(page)).toHaveText('7,850 m/s')
  await expect(direct(page)).toHaveAttribute('data-edge-id', 'direct:rss:venus:orbit->rss:mars:orbit')
  await direction(page, 'rss:venus:orbit', 'rss:mars:orbit')
  await missionModeButton(page, 'round-trip').click()
  await expect(total(page)).toHaveText('15,700 m/s')
  await expect(direct(page)).toHaveCount(2)
  await direction(page, 'rss:mars:orbit', 'rss:mars:orbit')
  const reserve = page.getByRole('slider', { name: 'Redundancy', exact: true })
  await reserve.focus()
  await reserve.press('Home')
  for (let step = 0; step < 4; step++) await reserve.press('ArrowRight')
  await expect(reserve).toHaveAttribute('aria-valuenow', '20')
  await expect(page.getByTestId('route-base')).toHaveText('15,700 m/s')
  await expect(page.getByTestId('route-margin')).toHaveText('+3,140 m/s')
  await expect(total(page)).toHaveText('18,840 m/s')
  await noEarthVisit(page)
})

test('keeps an ordered Vesta stop in RSS multi-stop totals, stages, and animations', async ({ page }) => {
  await plan(page, 'rss:mars:orbit', 'rss:ceres:orbit')
  await addStop(page, 'Vesta low orbit')
  await expect(total(page)).toHaveText('5,124 m/s')
  await expect(direct(page)).toHaveCount(2)
  await expect(node(page, 'rss:vesta:orbit')).toHaveAttribute('data-waypoint-indexes', '1')
  await direction(page, 'rss:mars:orbit', 'rss:ceres:orbit', ['rss:vesta:orbit'])
  await noEarthVisit(page)
  await page.getByLabel('Show breakdown', { exact: true }).check()
  await expect(page.getByTestId('stage-total')).toHaveText('4,022 m/s')
  await button(page, 'Next stage').click()
  await expect(page.getByTestId('stage-total')).toHaveText('1,102 m/s')
  await expect(rows(page)).toHaveCount(1)
  await expect(rows(page).first()).toHaveAttribute('data-budget-basis', 'model')
  await missionModeButton(page, 'return-only').click()
  await expect(total(page)).toHaveText('5,124 m/s')
  await direction(page, 'rss:ceres:orbit', 'rss:mars:orbit', ['rss:vesta:orbit'])
  await missionModeButton(page, 'round-trip').click()
  await expect(total(page)).toHaveText('10,248 m/s')
  await direction(page, 'rss:mars:orbit', 'rss:mars:orbit', ['rss:vesta:orbit'])
})

test('continues from a bound Jupiter high arrival onto the existing Europa branch', async ({ page }) => {
  await plan(page, 'rss:mars:orbit', 'rss:europa:orbit')
  // 4,398 modeled transfer + 2,980 published branch + 6,500 capture.
  await expect(total(page)).toHaveText('13,878 m/s')
  await expect(selected(page)).toHaveCount(3)
  await expect(direct(page)).toHaveAttribute('data-edge-id', 'direct:rss:mars:orbit->rss:jupiter:elliptical')
  const edgeIds = await selected(page).evaluateAll(elements => elements.map(element => element.getAttribute('data-edge-id')))
  expect(edgeIds).toContain('rss:jupiter:elliptical->rss:europa:encounter')
  expect(edgeIds).toContain('rss:europa:encounter->rss:europa:orbit')
  expect(edgeIds.some(id => id?.includes('rss:jupiter:orbit'))).toBe(false)
  await noEarthVisit(page)
  await direction(page, 'rss:mars:orbit', 'rss:europa:orbit', ['rss:jupiter:elliptical'])
  await page.getByLabel('Show breakdown', { exact: true }).check()
  await expect(rows(page)).toHaveCount(3)
  await expect(rows(page)).toContainText(['4,398 m/s', '2,980 m/s', '6,500 m/s'])
  await expect(rows(page).first()).toHaveAttribute('data-budget-basis', 'model')
  await expect(rows(page).nth(1)).toHaveAttribute('data-budget-basis', 'reference')
  await missionModeButton(page, 'return-only').click()
  await expect(total(page)).toHaveText('13,878 m/s')
  await direction(page, 'rss:europa:orbit', 'rss:mars:orbit', ['rss:jupiter:elliptical'])
  await missionModeButton(page, 'round-trip').click()
  await expect(total(page)).toHaveText('27,756 m/s')
})

test('keeps bundled prices intact while ideal capture opens the new Venus high route', async ({ page }) => {
  await plan(page, 'rss:mars:orbit', 'rss:venus:orbit')
  await expect(total(page)).toHaveText('7,850 m/s')
  await expect(direct(page)).toHaveAttribute('data-edge-id', 'direct:rss:mars:orbit->rss:venus:orbit')
  await button(page, 'Atmospheric assistance').click()
  const dialog = page.getByRole('dialog', { name: 'Atmospheric assistance', exact: true })
  await dialog.getByRole('checkbox', { name: 'Ideal capture at Venus', exact: true }).check()
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click()
  // 5,014 m/s complete Mars-low → Venus-high departure/capture stays paid.
  // Only the separate high → low circularization uses the ideal zero allowance.
  await expect(total(page)).toHaveText('5,014 m/s')
  await expect(selected(page)).toHaveCount(2)
  await expect(direct(page)).toHaveAttribute('data-edge-id', 'direct:rss:mars:orbit->rss:venus:elliptical')
  await expect(direct(page)).not.toHaveAttribute('data-assisted', 'true')
  const circularization = selected(page).and(page.locator('[data-edge-id="rss:venus:elliptical->rss:venus:orbit"]'))
  await expect(circularization).toHaveAttribute('data-assisted', 'true')
  const marker = page.locator('[data-aerobraking-edge="direct:rss:mars:orbit->rss:venus:elliptical"]')
  await expect(marker).toHaveAttribute('data-selected', 'true')
  await expect(marker.locator('title')).toContainText('Atmospheric options keep this bundled budget unchanged')
  await page.getByLabel('Show breakdown', { exact: true }).check()
  await expect(rows(page)).toHaveCount(2)
  await expect(rows(page).first()).toHaveAttribute('data-budget-basis', 'model')
  await expect(rows(page).first()).toContainText('5,014 m/s')
  await expect(rows(page).nth(1)).toHaveAttribute('data-budget-basis', 'ideal')
  await expect(rows(page).nth(1)).toContainText('0 m/s')
  await button(page, 'Atmospheric assistance').click()
  await dialog.getByRole('checkbox', { name: 'Ideal capture at Venus', exact: true }).uncheck()
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(total(page)).toHaveText('7,850 m/s')
  await expect(direct(page)).toHaveAttribute('data-edge-id', 'direct:rss:mars:orbit->rss:venus:orbit')
  await page.getByLabel('Show breakdown', { exact: true }).check()
  await expect(rows(page)).toHaveCount(1)
})

test('prices direct arrivals at all four modern outer parking references while preserving Earth–Moon budgets', async ({ page }) => {
  // Independently calculated complete departure + capture burns, rounded per endpoint.
  for (const [body, cost, altitude] of [
    ['saturn', 16109, 2500], ['uranus', 13033, 2000],
    ['neptune', 13981, 1500], ['pluto', 9928, 150],
  ] as const) {
    await button(page, 'Reset mission').click()
    await plan(page, 'rss:mars:orbit', `rss:${body}:orbit`)
    await expect(total(page)).toHaveText(formatted(cost))
    await expect(selected(page)).toHaveCount(1)
    await expect(direct(page)).toHaveAttribute('data-edge-id', `direct:rss:mars:orbit->rss:${body}:orbit`)
    await expect(node(page, `rss:${body}:orbit`).locator('title')).toContainText(`${altitude} km`)
    await noEarthVisit(page)
  }
  await button(page, 'Reset mission').click()
  await plan(page, 'rss:earth:surface', 'rss:moon:surface')
  await expect(total(page)).toHaveText('14,660 m/s')
  await expect(direct(page)).toHaveCount(0)
})

test('takes the reported Ceres–Miranda journey through a paid Uranus high capture in every mission mode', async ({ page }) => {
  const from = 'rss:ceres:surface', to = 'rss:miranda:orbit', high = 'rss:uranus:elliptical'
  await plan(page, from, to)
  // 270 map ascent + 5,434/286 direct endpoint burns + 1,854 local transfer
  // + 6,914 powered moon capture at the configured nodal inclination.
  await expect(total(page)).toHaveText('14,758 m/s')
  await expect(selected(page)).toHaveCount(4)
  await expect(direct(page)).toHaveAttribute('data-edge-id', 'direct:rss:ceres:orbit->rss:uranus:elliptical')
  await expect(selected(page).and(page.locator('[data-edge-id*="rss:uranus:orbit"]'))).toHaveCount(0)
  await noEarthVisit(page)
  await direction(page, from, to, [high])
  await page.getByLabel('Show breakdown', { exact: true }).check()
  await expect(rows(page)).toContainText(['Ceres low orbit', 'Uranus elliptical capture orbit', 'Miranda encounter', 'Miranda low orbit'])
  await expect(rows(page)).toContainText(['270 m/s', '5,720 m/s', '1,854 m/s', '6,914 m/s'])
  await expect(rows(page).first()).toHaveAttribute('data-budget-basis', 'reference')
  for (const index of [1, 2, 3]) await expect(rows(page).nth(index)).toHaveAttribute('data-budget-basis', 'model')
  await button(page, 'Budget assumptions').click()
  await expect(info(page).locator('[data-budget-summary-kind="reference"]')).toContainText('270 m/s')
  await expect(info(page).locator('[data-budget-summary-kind="model"]')).toContainText('14,488 m/s')
  await expect(info(page).locator('[data-budget-summary-kind="model"]')).toContainText('3 maneuvers')
  await info(page).getByRole('tab', { name: 'Sources & assumptions', exact: true }).click()
  await expect(info(page).locator('a[href$="docs/DATA.md#rss-outer-system-reference-model"]')).toBeVisible()
  await info(page).getByRole('button', { name: 'Close', exact: true }).click()
  await missionModeButton(page, 'return-only').click()
  await expect(total(page)).toHaveText('14,758 m/s')
  await expect(direct(page)).toHaveAttribute('data-edge-id', 'direct:rss:uranus:elliptical->rss:ceres:orbit')
  await direction(page, to, from, [high])
  await noEarthVisit(page)
  await missionModeButton(page, 'round-trip').click()
  await expect(total(page)).toHaveText('29,516 m/s')
  await direction(page, from, from, [high])
  await noEarthVisit(page)
})

test('keeps ordered Vesta and Uranus high stops in the corrected outer-system flow', async ({ page }) => {
  const from = 'rss:ceres:surface', to = 'rss:miranda:orbit'
  const vesta = 'rss:vesta:orbit', high = 'rss:uranus:elliptical'
  await plan(page, from, to)
  await addStop(page, 'Vesta low orbit')
  await addStop(page, 'Uranus elliptical capture orbit')
  await expect(total(page)).toHaveText('16,707 m/s')
  await expect(direct(page)).toHaveCount(2)
  await expect(node(page, vesta)).toHaveAttribute('data-waypoint-indexes', '1')
  await expect(node(page, high)).toHaveAttribute('data-waypoint-indexes', '2')
  await direction(page, from, to, [vesta, high])
  await noEarthVisit(page)
  await page.getByLabel('Show breakdown', { exact: true }).check()
  for (const [index, cost] of [1372, 6567, 8768].entries()) {
    if (index) await button(page, 'Next stage').click()
    await expect(page.getByTestId('stage-total')).toHaveText(formatted(cost))
  }
  await missionModeButton(page, 'return-only').click()
  await expect(total(page)).toHaveText('16,707 m/s')
  await direction(page, to, from, [high, vesta])
  await expect(page.getByTestId('stage-total')).toHaveText('8,768 m/s')
  await missionModeButton(page, 'round-trip').click()
  await expect(total(page)).toHaveText('33,414 m/s')
  await direction(page, from, from, [vesta, high])
  await noEarthVisit(page)
})

test('retains an Earth parking visit when the user explicitly requests it', async ({ page }) => {
  await plan(page, 'rss:ceres:surface', 'rss:miranda:orbit')
  await expect(total(page)).toHaveText('14,758 m/s')
  await addStop(page, 'Earth low orbit')
  await expect(node(page, 'rss:earth:orbit')).toHaveAttribute('data-waypoint-indexes', '1')
  await expect(selected(page).and(page.locator('[data-edge-id="rss:earth:encounter->rss:earth:orbit"]'))).toHaveCount(1)
  await expect(selected(page).and(page.locator('[data-edge-id="rss:earth:orbit->rss:earth:encounter"]'))).toHaveCount(1)
  await direction(page, 'rss:ceres:surface', 'rss:miranda:orbit', ['rss:earth:orbit', 'rss:uranus:elliptical'])
  await page.getByLabel('Show breakdown', { exact: true }).check()
  // 270 surface + 145 lowering + 4,383 Ceres escape + 1,691 rail + 3,210 Earth capture.
  await expect(page.getByTestId('stage-total')).toHaveText('9,699 m/s')
})

test('connects every explicit inner high reference with complete paid direct pairs', async ({ page }) => {
  // Independent vis-viva endpoint burns, each rounded before summing.
  for (const [from, to, departure, capture] of [
    ['ceres', 'mercury', 8548, 12012],
    ['mercury', 'venus', 3874, 1649],
    ['venus', 'mars', 1641, 1969],
    ['mars', 'ceres', 1023, 2358],
  ] as const) {
    await button(page, 'Reset mission').click()
    const start = `rss:${from}:elliptical`, end = `rss:${to}:elliptical`
    await plan(page, start, end)
    await expect(total(page)).toHaveText(formatted(departure + capture))
    await expect(selected(page)).toHaveCount(1)
    await expect(direct(page)).toHaveAttribute('data-edge-id', `direct:${start}->${end}`)
    await direction(page, start, end)
    await noEarthVisit(page)
    await page.getByLabel('Show breakdown', { exact: true }).check()
    await expect(rows(page)).toHaveCount(1)
    await expect(rows(page).first()).toHaveAttribute('data-budget-basis', 'model')
  }
  await button(page, 'Reset mission').click()
  const start = 'rss:ceres:elliptical', end = 'rss:mercury:elliptical'
  await plan(page, start, end)
  await expect(total(page)).toHaveText('20,560 m/s')
  await missionModeButton(page, 'return-only').click()
  await expect(total(page)).toHaveText('20,560 m/s')
  await expect(direct(page)).toHaveAttribute('data-edge-id', `direct:${end}->${start}`)
  await direction(page, end, start)
  await missionModeButton(page, 'round-trip').click()
  await expect(total(page)).toHaveText('41,120 m/s')
  await expect(direct(page)).toHaveCount(2)
  await direction(page, start, start)
  await noEarthVisit(page)
})

test('continues from the new Mars high arrival to both moons without low circularization', async ({ page }) => {
  const from = 'rss:ceres:elliptical', high = 'rss:mars:elliptical'
  for (const [body, transfer, capture] of [['phobos', 700, 1264], ['deimos', 306, 910]] as const) {
    await button(page, 'Reset mission').click()
    const to = `rss:${body}:orbit`, expected = 3381 + transfer + capture
    await plan(page, from, to)
    await expect(total(page)).toHaveText(formatted(expected))
    await expect(selected(page)).toHaveCount(3)
    await expect(direct(page)).toHaveAttribute('data-edge-id', `direct:${from}->${high}`)
    await expect(selected(page).and(page.locator('[data-edge-id*="rss:mars:orbit"]'))).toHaveCount(0)
    await noEarthVisit(page)
    await direction(page, from, to, [high])
    await page.getByLabel('Show breakdown', { exact: true }).check()
    await expect(rows(page)).toContainText([formatted(3381), formatted(transfer), formatted(capture)])
    for (const row of await rows(page).all()) await expect(row).toHaveAttribute('data-budget-basis', 'model')
    await missionModeButton(page, 'return-only').click()
    await expect(total(page)).toHaveText(formatted(expected))
    await direction(page, to, from, [high])
    await missionModeButton(page, 'round-trip').click()
    await expect(total(page)).toHaveText(formatted(expected * 2))
    await direction(page, from, from, [high])
    await noEarthVisit(page)
  }
})

test('keeps ordered Mercury and Mars high stops with paid arrivals in both directions', async ({ page }) => {
  const from = 'rss:ceres:elliptical', to = 'rss:deimos:orbit'
  const mercury = 'rss:mercury:elliptical', mars = 'rss:mars:elliptical'
  await plan(page, from, to)
  await expect(total(page)).toHaveText('4,597 m/s')
  await addStop(page, 'Mercury elliptical capture orbit')
  await addStop(page, 'Mars elliptical capture orbit')
  await expect(total(page)).toHaveText('36,138 m/s')
  await expect(node(page, mercury)).toHaveAttribute('data-waypoint-indexes', '1')
  await expect(node(page, mars)).toHaveAttribute('data-waypoint-indexes', '2')
  await expect(direct(page)).toHaveCount(2)
  await direction(page, from, to, [mercury, mars])
  await noEarthVisit(page)
  await page.getByLabel('Show breakdown', { exact: true }).check()
  for (const [index, cost] of [20560, 14362, 1216].entries()) {
    if (index) await button(page, 'Next stage').click()
    await expect(page.getByTestId('stage-total')).toHaveText(formatted(cost))
  }
  await missionModeButton(page, 'return-only').click()
  await expect(total(page)).toHaveText('36,138 m/s')
  await expect(page.getByTestId('stage-total')).toHaveText('1,216 m/s')
  await direction(page, to, from, [mars, mercury])
  await missionModeButton(page, 'round-trip').click()
  await expect(total(page)).toHaveText('72,276 m/s')
  await direction(page, from, from, [mercury, mars])
  await noEarthVisit(page)
})

test('fits explicit inner high bands and Mars moon breakdowns across screen sizes', async ({ page }, testInfo) => {
  for (const viewport of [{ width: 320, height: 568 }, { width: 667, height: 375 }, { width: 2560, height: 1440 }]) {
    await page.setViewportSize(viewport)
    await button(page, 'Reset mission').click()
    await plan(page, 'rss:mercury:elliptical', 'rss:venus:elliptical')
    await expect(total(page)).toHaveText('5,523 m/s')
    await direction(page, 'rss:mercury:elliptical', 'rss:venus:elliptical')
    const trail = flow(page).locator('path.route-flow-trail').last()
    const offset = await trail.evaluate(element => Number.parseFloat(getComputedStyle(element).strokeDashoffset))
    await expect.poll(() => trail.evaluate(element => Number.parseFloat(getComputedStyle(element).strokeDashoffset))).toBeLessThan(offset - .01)
    const bounds = await direct(page).boundingBox()
    expect(bounds).not.toBeNull()
    if (bounds) {
      expect(bounds.x).toBeGreaterThanOrEqual(-1)
      expect(bounds.y).toBeGreaterThanOrEqual(-1)
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width + 1)
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height + 1)
    }
    if (testInfo.project.name === 'desktop') await page.screenshot({ path: `/tmp/rss-inner-high-straight-${viewport.width}.png` })
    await button(page, 'Reset mission').click()
    await plan(page, 'rss:ceres:elliptical', 'rss:phobos:orbit')
    await expect(total(page)).toHaveText('5,345 m/s')
    await direction(page, 'rss:ceres:elliptical', 'rss:phobos:orbit', ['rss:mars:elliptical'])
    await noEarthVisit(page)
    await page.getByLabel('Show breakdown', { exact: true }).check()
    await expect(rows(page)).toHaveCount(3)
    const panel = await page.getByRole('region', { name: 'Maneuver breakdown panel', exact: true }).boundingBox()
    const dock = await page.getByRole('contentinfo').boundingBox()
    expect(panel).not.toBeNull()
    expect(dock).not.toBeNull()
    if (panel && dock) {
      expect(panel.x).toBeGreaterThanOrEqual(0)
      expect(panel.y).toBeGreaterThanOrEqual(0)
      expect(panel.x + panel.width).toBeLessThanOrEqual(viewport.width + 1)
      expect(panel.y + panel.height).toBeLessThanOrEqual(dock.y + 1)
    }
    for (const row of await rows(page).all()) await expect(row).toBeInViewport({ ratio: .99999 })
    await pageFits(page)
    if (testInfo.project.name === 'desktop') await page.screenshot({ path: `/tmp/rss-inner-high-${viewport.width}.png`, animations: 'disabled' })
  }
})

test('fits the corrected Uranus moon branch and breakdown on narrow, landscape, and large desktop maps', async ({ page }, testInfo) => {
  for (const viewport of [{ width: 320, height: 568 }, { width: 667, height: 375 }, { width: 2560, height: 1440 }]) {
    await page.setViewportSize(viewport)
    await button(page, 'Reset mission').click()
    await plan(page, 'rss:ceres:surface', 'rss:miranda:orbit')
    await expect(total(page)).toHaveText('14,758 m/s')
    await direction(page, 'rss:ceres:surface', 'rss:miranda:orbit', ['rss:uranus:elliptical'])
    await noEarthVisit(page)
    await page.getByLabel('Show breakdown', { exact: true }).check()
    await expect(rows(page)).toHaveCount(4)
    const panel = await page.getByRole('region', { name: 'Maneuver breakdown panel', exact: true }).boundingBox()
    const dock = await page.getByRole('contentinfo').boundingBox()
    expect(panel).not.toBeNull()
    expect(dock).not.toBeNull()
    if (panel && dock) {
      expect(panel.x).toBeGreaterThanOrEqual(0)
      expect(panel.y).toBeGreaterThanOrEqual(0)
      expect(panel.x + panel.width).toBeLessThanOrEqual(viewport.width + 1)
      expect(panel.y + panel.height).toBeLessThanOrEqual(dock.y + 1)
    }
    for (const row of await rows(page).all()) await expect(row).toBeInViewport({ ratio: .99999 })
    await pageFits(page)
    if (testInfo.project.name === 'desktop') await page.screenshot({ path: `/tmp/rss-uranus-${viewport.width}.png`, animations: 'disabled' })
  }
})

test('fits RSS direct paths and their animations on narrow, landscape, and desktop maps', async ({ page }, testInfo) => {
  for (const viewport of [{ width: 320, height: 568 }, { width: 667, height: 375 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport)
    await button(page, 'Reset mission').click()
    await plan(page, 'rss:vesta:orbit', 'rss:ceres:orbit')
    await expect(total(page)).toHaveText('1,102 m/s')
    await expect(direct(page)).toHaveCount(1)
    await direction(page, 'rss:vesta:orbit', 'rss:ceres:orbit')
    const bounds = await direct(page).boundingBox()
    expect(bounds).not.toBeNull()
    if (bounds) {
      expect(bounds.x).toBeGreaterThanOrEqual(-1)
      expect(bounds.y).toBeGreaterThanOrEqual(-1)
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width + 1)
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height + 1)
    }
    await pageFits(page)
    if (testInfo.project.name === 'desktop') await page.screenshot({ path: `/tmp/rss-direct-${viewport.width}.png`, animations: 'disabled' })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(flow(page)).toBeHidden()
    await expect(direct(page)).toBeVisible()
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await button(page, 'Reset mission').click()
    await plan(page, 'rss:mars:orbit', 'rss:europa:orbit')
    await expect(total(page)).toHaveText('13,878 m/s')
    await direction(page, 'rss:mars:orbit', 'rss:europa:orbit', ['rss:jupiter:elliptical'])
    await page.getByLabel('Show breakdown', { exact: true }).check()
    await expect(rows(page)).toHaveCount(3)
    await pageFits(page)
  }
})
