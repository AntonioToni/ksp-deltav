import { expect, test, type Page } from '@playwright/test'

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const state = (page: Page, id: string) => page.locator(`[data-node-id="${id}"]`)
const overview = (page: Page) => page.getByRole('group', { name: 'All systems Delta-V state map', exact: true })
const configurations = [
  { name: 'Stock + Kcalbeloh', id: 'stock', nodes: 97 },
  { name: 'OPM + Kcalbeloh', id: 'opm', nodes: 143 },
] as const
let browserErrors: string[]

test.beforeEach(async ({ page }) => {
  browserErrors = []
  page.on('pageerror', error => browserErrors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()) })
  await page.goto('./')
  await expect(button(page, 'Custom planet packs')).toBeVisible()
})

test.afterEach(() => {
  expect(browserErrors, 'The system overview should not produce browser errors').toEqual([])
})

async function configuration(page: Page, name: string) {
  await button(page, 'Custom planet packs').click()
  const manager = page.getByRole('dialog', { name: 'Planet packs', exact: true })
  await manager.getByRole('tab', { name: 'Add-ons', exact: true }).click()
  await manager.getByRole('button', { name: `Use ${name}`, exact: true }).click()
  await expect(manager).not.toBeVisible()
}

async function view(page: Page, name: string) {
  await page.getByRole('combobox', { name: 'Map view', exact: true }).click()
  await page.getByRole('option', { name, exact: true }).click()
}

async function pageFits(page: Page) {
  expect(await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, x: scrollX, y: scrollY })))
    .toEqual({ ...page.viewportSize()!, x: 0, y: 0 })
}

async function statesFit(page: Page) {
  const viewport = page.viewportSize()!
  const bounds = await page.locator('[data-node-id]').evaluateAll(nodes => nodes.map(node => {
    const { x, y, width, height } = node.getBoundingClientRect()
    return { id: node.getAttribute('data-node-id'), x, y, width, height }
  }))
  expect(bounds.length).toBeGreaterThan(0)
  for (const node of bounds) {
    expect(node.x, node.id ?? '').toBeGreaterThanOrEqual(-1)
    expect(node.y, node.id ?? '').toBeGreaterThanOrEqual(-1)
    expect(node.x + node.width, node.id ?? '').toBeLessThanOrEqual(viewport.width + 1)
    expect(node.y + node.height, node.id ?? '').toBeLessThanOrEqual(viewport.height + 1)
  }
}

async function gatewayAvoidsText(page: Page) {
  const result = await overview(page).evaluate(svg => {
    const path = svg.querySelector<SVGPathElement>('[data-unpriced-id="kcalbeloh:wormhole"]')!
    const transform = path.getScreenCTM()!
    const values = (path.getAttribute('d')!.match(/[-+]?(?:\d*\.?\d+)(?:e[-+]?\d+)?/gi) ?? []).map(Number)
    const points = Array.from({ length: values.length / 2 }, (_, index) =>
      new DOMPoint(values[index * 2], values[index * 2 + 1]).matrixTransform(transform))
    const halfStroke = Number(path.getAttribute('stroke-width')) * Math.hypot(transform.a, transform.b) / 2
    const labels = [...svg.querySelectorAll<SVGTextElement>('[data-body-label], [data-map-panel] > text')]
    const intersections: string[] = []
    const diagonalSegments: number[] = []
    for (let index = 1; index < points.length; index++) {
      const start = points[index - 1]!
      const end = points[index]!
      const vertical = Math.abs(start.x - end.x) < .001
      const horizontal = Math.abs(start.y - end.y) < .001
      if (!vertical && !horizontal) diagonalSegments.push(index)
      for (const label of labels) {
        const bounds = label.getBoundingClientRect()
        const left = bounds.left - halfStroke
        const right = bounds.right + halfStroke
        const top = bounds.top - halfStroke
        const bottom = bounds.bottom + halfStroke
        const hits = vertical
          ? start.x > left && start.x < right && Math.max(start.y, end.y) > top && Math.min(start.y, end.y) < bottom
          : horizontal && start.y > top && start.y < bottom && Math.max(start.x, end.x) > left && Math.min(start.x, end.x) < right
        if (hits) intersections.push(`${label.textContent}: segment ${index}`)
      }
    }
    return { labels: labels.length, headings: svg.querySelectorAll('[data-map-panel] > text').length, diagonalSegments, intersections }
  })
  expect(result.labels).toBeGreaterThan(5)
  expect(result.headings).toBe(5)
  expect(result.diagonalSegments, 'Cross-system gateway paths should follow orthogonal gutters').toEqual([])
  expect(result.intersections, 'The wormhole path must stay clear of rendered body names and system headings').toEqual([])
}

for (const config of configurations) {
  for (const viewport of [{ width: 2560, height: 1440 }, { width: 1920, height: 1080 }]) {
    test(`uses the desktop width for ${config.name} at ${viewport.width}×${viewport.height}`, async ({ page }, testInfo) => {
      await page.setViewportSize(viewport)
      await configuration(page, config.name)
      await view(page, 'All systems')
      await expect(overview(page)).toHaveAttribute('data-map-presentation', 'overview')
      await expect(page.locator('[data-node-id]')).toHaveCount(config.nodes)
      for (const id of ['kerbol', 'kcalbeloh', 'maelg', 'sunorc', 'aralc']) {
        await expect(overview(page).locator(`[data-map-panel="${id}"]`)).toBeVisible()
      }
      await statesFit(page)
      await pageFits(page)
      await page.evaluate(() => document.fonts.ready)
      await gatewayAvoidsText(page)

      const rendered = await overview(page).evaluate(svg => {
        const bounds = svg.getBoundingClientRect()
        const circles = [...svg.querySelectorAll('[data-node-id] .state-circle')].map(circle => circle.getBoundingClientRect())
        return {
          width: bounds.width,
          horizontalSpan: Math.max(...circles.map(circle => circle.right)) - Math.min(...circles.map(circle => circle.left)),
          minimumDiameter: Math.min(...circles.map(circle => circle.width)),
        }
      })
      expect(rendered.horizontalSpan).toBeGreaterThan(rendered.width * .8)
      if (viewport.width === 2560) expect(rendered.minimumDiameter).toBeGreaterThanOrEqual(38)
      if (viewport.width === 2560 && testInfo.project.name === 'desktop') {
        await page.screenshot({ path: `/tmp/kcalbeloh-overview-${config.id}-2560.png`, animations: 'disabled' })
      }

      // A map click followed by keyboard selection must keep the chosen
      // overview open and calculate the same full-graph mission.
      await state(page, 'kcalbeloh:suluco:surface').click()
      await expect(overview(page)).toBeVisible()
      await state(page, 'kcalbeloh:tot:surface').focus()
      await state(page, 'kcalbeloh:tot:surface').press('Enter')
      await expect(page.getByTestId('route-total')).toHaveText('3,931 m/s')
      await expect(overview(page)).toBeVisible()
      await expect(state(page, 'kcalbeloh:tot:surface')).toHaveAttribute('aria-pressed', 'true')
      await expect(page.locator('[data-route-edge="true"]')).toHaveCount(3)
      await expect(page.locator('[data-unpriced-id="kcalbeloh:wormhole"]')).toHaveCount(1)

      if (viewport.width === 2560 && testInfo.project.name === 'desktop') {
        await page.screenshot({ path: `/tmp/kcalbeloh-overview-${config.id}-2560-route.png`, animations: 'disabled' })
      }
      await view(page, 'Sunorc')
      await expect(page.getByTestId('route-total')).toHaveText('3,931 m/s')
      await expect(page.locator('[data-map-region]')).toHaveAttribute('data-map-region', 'sunorc')
      await expect(page.locator('[data-map-panel]')).toHaveCount(0)
    })
  }

  for (const viewport of [{ width: 320, height: 568 }, { width: 667, height: 375 }, { width: 700, height: 900 }]) {
    test(`keeps all states in the compact ${config.name} map at ${viewport.width}×${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await configuration(page, config.name)
      await view(page, 'All systems')
      await expect(overview(page)).toBeVisible()
      await expect(overview(page)).not.toHaveAttribute('data-map-presentation', 'overview')
      await expect(page.locator('[data-node-id]')).toHaveCount(config.nodes)
      await expect(page.locator('[data-map-panel]')).toHaveCount(0)
      await statesFit(page)
      await pageFits(page)
      await view(page, 'Sunorc')
      await expect(state(page, 'kcalbeloh:suluco:surface')).toBeVisible()
      await statesFit(page)
      await pageFits(page)
    })
  }
}
