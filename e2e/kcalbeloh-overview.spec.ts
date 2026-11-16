import { expect, test, type Page } from '@playwright/test'
import { opmKcalbelohPack, stockKcalbelohPack } from '../src/data/kcalbeloh'
import { kcalbelohSystemViewId } from '../src/components/mapLayout'
import { missionModeButton } from './helpers/missionMode'

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const state = (page: Page, id: string) => page.locator(`[data-node-id="${id}"]`)
const overview = (page: Page) => page.getByRole('group', { name: 'All systems Delta-V state map', exact: true })
const configurations = [
  { name: 'Stock + Kcalbeloh', id: 'stock', nodes: 97, pack: stockKcalbelohPack, gateway: 'Jool', outbound: '12,900 m/s', inbound: '10,500 m/s', roundTrip: '23,400 m/s' },
  { name: 'OPM + Kcalbeloh', id: 'opm', nodes: 143, pack: opmKcalbelohPack, gateway: 'Sarnus', outbound: '12,100 m/s', inbound: '9,700 m/s', roundTrip: '21,800 m/s' },
] as const
const desktopCases = configurations.flatMap(config => [
  { width: 1920, height: 1080 }, { width: 1920, height: 720 }, { width: 1280, height: 720 },
  { width: 2560, height: 1440 }, { width: 3440, height: 1440 },
].map(viewport => ({ config, ...viewport })))
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

async function gatewayAvoidsText(page: Page, selector = '[data-unpriced-id="kcalbeloh:wormhole"]') {
  const result = await overview(page).evaluate((svg, selector) => {
    const path = svg.querySelector<SVGPathElement>(selector)!
    const transform = path.getScreenCTM()!
    const values = (path.getAttribute('d')!.match(/[-+]?(?:\d*\.?\d+)(?:e[-+]?\d+)?/gi) ?? []).map(Number)
    const points = Array.from({ length: values.length / 2 }, (_, index) =>
      new DOMPoint(values[index * 2], values[index * 2 + 1]).matrixTransform(transform))
    const halfStroke = Number(path.getAttribute('stroke-width')) * Math.hypot(transform.a, transform.b) / 2
    const labels = [...svg.querySelectorAll<SVGTextElement>('[data-body-label], [data-map-panel] > text')]
    const intersections: string[] = []
    for (let index = 1; index < points.length; index++) {
      const start = points[index - 1]!
      const end = points[index]!
      for (const label of labels) {
        const bounds = label.getBoundingClientRect()
        const left = bounds.left - halfStroke
        const right = bounds.right + halfStroke
        const top = bounds.top - halfStroke
        const bottom = bounds.bottom + halfStroke
        let low = 0
        let high = 1
        for (const [origin, delta, minimum, maximum] of [
          [start.x, end.x - start.x, left, right], [start.y, end.y - start.y, top, bottom],
        ]) {
          if (delta === 0) {
            if (origin! <= minimum! || origin! >= maximum!) { high = -1; break }
            continue
          }
          const first = (minimum! - origin!) / delta!
          const second = (maximum! - origin!) / delta!
          low = Math.max(low, Math.min(first, second))
          high = Math.min(high, Math.max(first, second))
          if (high < low) break
        }
        if (high >= low) intersections.push(`${label.textContent}: segment ${index}`)
      }
    }
    return { labels: labels.length, headings: svg.querySelectorAll('[data-map-panel] > text, [data-body-label="kcalbeloh:kcalbeloh"]').length, intersections }
  }, selector)
  expect(result.labels).toBeGreaterThan(5)
  expect(result.headings).toBe(2)
  expect(result.intersections, 'The wormhole path must stay clear of rendered body names and system headings').toEqual([])
}

async function composedGeometry(page: Page, config: typeof configurations[number]) {
  await page.evaluate(() => document.fonts.ready)
  const endpoints = [...config.pack.maneuvers, ...(config.pack.unpricedConnections ?? []).flatMap(edge => [edge,
    { id: `allowance:${edge.id}:forward`, from: edge.from, to: edge.to },
    { id: `allowance:${edge.id}:reverse`, from: edge.to, to: edge.from },
  ])].map(({ id, from, to }) => ({ id, from, to }))
  const geometry = await overview(page).evaluate((svg, endpoints) => {
    const canvas = svg as SVGSVGElement
    const bounds = svg.getBoundingClientRect()
    const viewport = svg.closest('[data-map-viewport]')!.getBoundingClientRect()
    const matrix = canvas.getScreenCTM()!
    const projectedWidth = canvas.viewBox.baseVal.width * Math.hypot(matrix.a, matrix.b)
    const projectedHeight = canvas.viewBox.baseVal.height * Math.hypot(matrix.c, matrix.d)
    const circles = [...svg.querySelectorAll('[data-node-id] .state-circle')].map(circle => ({
      id: circle.parentElement!.getAttribute('data-node-id')!, bounds: circle.getBoundingClientRect(),
    }))
    const labels = [...svg.querySelectorAll<SVGTextElement>('[data-body-label]')].map(label => {
      const transform = label.getScreenCTM()!
      return { id: label.getAttribute('data-body-label')!, bounds: label.getBoundingClientRect(),
        fontSize: parseFloat(getComputedStyle(label).fontSize) * Math.hypot(transform.a, transform.b) }
    })
    const content = [...circles.map(circle => circle.bounds), ...labels.map(label => label.bounds),
      ...[...svg.querySelectorAll('[data-map-panel] > text')].map(heading => heading.getBoundingClientRect())]
    const labelCollisions: string[] = []
    for (const [index, label] of labels.entries()) {
      for (const other of labels.slice(index + 1)) {
        if (!label.id.startsWith('kcalbeloh:') && !other.id.startsWith('kcalbeloh:')) continue
        if (label.bounds.left < other.bounds.right && other.bounds.left < label.bounds.right
          && label.bounds.top < other.bounds.bottom && other.bounds.top < label.bounds.bottom) labelCollisions.push(`${label.id}: ${other.id}`)
      }
      for (const circle of circles) {
        if (!label.id.startsWith('kcalbeloh:') && !circle.id.startsWith('kcalbeloh:')) continue
        const x = circle.bounds.x + circle.bounds.width / 2
        const y = circle.bounds.y + circle.bounds.height / 2
        const dx = Math.max(label.bounds.left - x, x - label.bounds.right, 0)
        const dy = Math.max(label.bounds.top - y, y - label.bounds.bottom, 0)
        if (Math.hypot(dx, dy) < circle.bounds.width / 2 - .5) labelCollisions.push(`${label.id}: ${circle.id}`)
      }
    }
    const crossesLabel = (start: DOMPoint, end: DOMPoint, bounds: DOMRect) => {
      let low = 0
      let high = 1
      for (const [origin, delta, minimum, maximum] of [
        [start.x, end.x - start.x, bounds.left + .5, bounds.right - .5],
        [start.y, end.y - start.y, bounds.top + .5, bounds.bottom - .5],
      ]) {
        if (delta === 0) {
          if (origin! < minimum! || origin! > maximum!) return false
          continue
        }
        const first = (minimum! - origin!) / delta!
        const second = (maximum! - origin!) / delta!
        low = Math.max(low, Math.min(first, second))
        high = Math.min(high, Math.max(first, second))
        if (high < low) return false
      }
      return high >= low
    }
    const connectionCollisions: string[] = []
    const activeEdges: { id: string; finite: boolean; length: number; endpointGap: number }[] = []
    for (const path of svg.querySelectorAll<SVGPathElement>('[data-connection-id], [data-unpriced-id], [data-route-edge="true"]')) {
      const id = (path.getAttribute('data-connection-id') ?? path.getAttribute('data-unpriced-id') ?? path.getAttribute('data-edge-id'))!
      const edge = endpoints.find(edge => edge.id === id)
      const active = path.hasAttribute('data-route-edge')
      if (!active && !(edge?.from.startsWith('kcalbeloh:') && edge.to.startsWith('kcalbeloh:'))) continue
      const matrix = path.getScreenCTM()!
      const values = (path.getAttribute('d')!.match(/[-+]?(?:\d*\.?\d+)(?:e[-+]?\d+)?/gi) ?? []).map(Number)
      const points = Array.from({ length: values.length / 2 }, (_, index) =>
        new DOMPoint(values[index * 2], values[index * 2 + 1]).matrixTransform(matrix))
      if (active) {
        const endpointGap = Math.max(...[edge?.from, edge?.to].map((id, index) => {
          const circle = circles.find(circle => circle.id === id)?.bounds
          const point = index === 0 ? points.at(0) : points.at(-1)
          return point && circle ? Math.hypot(point.x - circle.x - circle.width / 2, point.y - circle.y - circle.height / 2) : Infinity
        }))
        activeEdges.push({ id, endpointGap, finite: points.length >= 2 && points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y)), length: path.getTotalLength() })
      }
      for (let index = 1; index < points.length; index++) {
        const start = points[index - 1]!
        const end = points[index]!
        for (const label of labels) if (crossesLabel(start, end, label.bounds)) connectionCollisions.push(`${id}: ${label.id}`)
        for (const circle of circles) {
          if (circle.id === edge?.from || circle.id === edge?.to) continue
          const x = circle.bounds.x + circle.bounds.width / 2
          const y = circle.bounds.y + circle.bounds.height / 2
          const dx = end.x - start.x
          const dy = end.y - start.y
          const squared = dx * dx + dy * dy
          const fraction = squared ? Math.max(0, Math.min(1, ((x - start.x) * dx + (y - start.y) * dy) / squared)) : 0
          if (Math.hypot(x - start.x - fraction * dx, y - start.y - fraction * dy) < circle.bounds.width / 2 - .5) connectionCollisions.push(`${id}: ${circle.id}`)
        }
      }
    }
    return {
      projectedWidth, projectedHeight, projectedArea: projectedWidth * projectedHeight, viewportArea: viewport.width * viewport.height,
      occupiedWidth: Math.max(...content.map(rectangle => rectangle.right)) - Math.min(...content.map(rectangle => rectangle.left)),
      occupiedHeight: Math.max(...content.map(rectangle => rectangle.bottom)) - Math.min(...content.map(rectangle => rectangle.top)),
      horizontalSpan: Math.max(...circles.map(circle => circle.bounds.right)) - Math.min(...circles.map(circle => circle.bounds.left)),
      minimumDiameter: Math.min(...circles.map(circle => circle.bounds.width)),
      minimumLabelFontSize: Math.min(...labels.map(label => label.fontSize)),
      labelCollisions, connectionCollisions, activeEdges,
      clippedLabels: labels.filter(label => label.bounds.left < bounds.left - 1 || label.bounds.right > bounds.right + 1
        || label.bounds.top < bounds.top - 1 || label.bounds.bottom > bounds.bottom + 1).map(label => label.id),
    }
  }, endpoints)
  expect(geometry.labelCollisions, 'The unified schematic must keep rendered names clear').toEqual([])
  expect(geometry.connectionCollisions, 'Composed paths must avoid names and unrelated state markers').toEqual([])
  expect(geometry.clippedLabels, 'Every unified body label must fit in the map').toEqual([])
  expect(geometry.occupiedWidth, 'Visible states, names and headings should fill the projected canvas').toBeGreaterThan(geometry.projectedWidth * .9)
  expect(geometry.occupiedHeight).toBeGreaterThan(geometry.projectedHeight * .8)
  expect(geometry.horizontalSpan, 'State markers should retain their native spread within the canvas').toBeGreaterThan(geometry.projectedWidth * .85)
  expect(geometry.projectedArea, 'The projected canvas should occupy at least half the map viewport').toBeGreaterThanOrEqual(geometry.viewportArea * .5)
  for (const edge of geometry.activeEdges) {
    expect(edge.finite, edge.id).toBe(true)
    expect(edge.length, edge.id).toBeGreaterThan(0)
    expect(edge.endpointGap, `${edge.id} connects its actual states`).toBeLessThan(.1)
  }
  return geometry
}

for (const { config, ...viewport } of desktopCases) {
  test(`uses the desktop width for ${config.name} at ${viewport.width}×${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport)
    await configuration(page, config.name)
    await view(page, 'All systems')
    await expect(overview(page)).toHaveAttribute('data-map-presentation', 'overview')
    await expect(page.locator('[data-node-id]')).toHaveCount(config.nodes)
    await expect(overview(page).locator('[data-map-panel]')).toHaveCount(2)
    for (const id of ['kerbol', kcalbelohSystemViewId]) {
      await expect(overview(page).locator(`[data-map-panel="${id}"]`)).toHaveCount(1)
    }
    await expect(overview(page).locator('[data-map-panel="kerbol"] > text')).toBeVisible()
    // SVG text also contains its native-name tooltip in a child <title>.
    await expect(overview(page).locator('[data-body-label="kcalbeloh:kcalbeloh"]')).toHaveText(/^Kcalbeloh system/)
    await statesFit(page)
    await pageFits(page)
    await page.evaluate(() => document.fonts.ready)
    await gatewayAvoidsText(page)
    await expect(page.locator('[data-route-edge="true"]')).toHaveCount(0)
    const rendered = await composedGeometry(page, config)
    if (viewport.width === 2560) {
      expect(rendered.minimumDiameter).toBeGreaterThanOrEqual(config.id === 'opm' ? 36 : 38)
      expect(rendered.minimumLabelFontSize).toBeGreaterThanOrEqual(14)
    }
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
    await composedGeometry(page, config)
    await statesFit(page)
    await pageFits(page)

    if (viewport.width === 2560 && testInfo.project.name === 'desktop') {
      await page.screenshot({ path: `/tmp/kcalbeloh-overview-${config.id}-2560-route.png`, animations: 'disabled' })
    }
    await view(page, 'Sunorc')
    await expect(page.getByTestId('route-total')).toHaveText('3,931 m/s')
    await expect(page.locator('[data-map-region]')).toHaveAttribute('data-map-region', 'sunorc')
    await expect(page.locator('[data-map-panel]')).toHaveCount(0)
  })
}

for (const config of configurations) {
  test(`keeps ${config.name} cross-system routes unavailable until their directional allowances are entered`, async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await configuration(page, config.name)
    await view(page, 'All systems')
    await button(page, 'Choose origin').click()
    await state(page, 'stock:kerbin:surface').click()
    await state(page, 'kcalbeloh:sera:surface').click()
    await expect(page.getByTestId('route-total')).toHaveCount(0)
    await expect(page.locator('[data-route-edge="true"]')).toHaveCount(0)
    const gatewayPath = await page.locator('[data-unpriced-id="kcalbeloh:wormhole"]').getAttribute('d')
    await gatewayAvoidsText(page)

    const editor = page.getByRole('dialog', { name: 'Link allowances', exact: true })
    const label = `${config.gateway} low orbit ↔ Sera low orbit via wormhole`
    await button(page, 'Link allowances').click()
    await editor.getByRole('spinbutton', { name: `Forward allowance for ${label}`, exact: true }).fill('1000')
    await editor.getByRole('button', { name: 'Apply', exact: true }).click()
    await expect(editor).toBeHidden()
    await expect(page.getByTestId('route-total')).toHaveText(config.outbound)
    await expect(overview(page)).toHaveAttribute('data-map-presentation', 'overview')
    await expect(page.locator('[data-node-id]')).toHaveCount(config.nodes)
    await expect(page.locator('[data-route-edge="true"]')).toHaveCount(7)
    const forward = '[data-route-edge="true"][data-edge-id="allowance:kcalbeloh:wormhole:forward"]'
    await expect(page.locator(forward)).toHaveCount(1)
    await expect(page.locator(forward)).toHaveAttribute('d', gatewayPath!)
    await expect(page.locator('[data-unpriced-id="kcalbeloh:wormhole"]')).toHaveCount(0)
    await gatewayAvoidsText(page, forward)
    await composedGeometry(page, config)

    await missionModeButton(page, 'return-only').click()
    await expect(page.getByTestId('route-total')).toHaveCount(0)
    await expect(page.locator('[data-route-edge="true"]')).toHaveCount(0)
    await button(page, 'Link allowances').click()
    await editor.getByRole('spinbutton', { name: `Reverse allowance for ${label}`, exact: true }).fill('2000')
    await editor.getByRole('button', { name: 'Apply', exact: true }).click()
    await expect(editor).toBeHidden()
    // The default atmosphere plan keeps Kerbin's reentry allowance at zero.
    await expect(page.getByTestId('route-total')).toHaveText(config.inbound)
    await expect(page.locator('[data-route-edge="true"]')).toHaveCount(7)
    const reverse = '[data-route-edge="true"][data-edge-id="allowance:kcalbeloh:wormhole:reverse"]'
    await expect(page.locator(reverse)).toHaveCount(1)
    await gatewayAvoidsText(page, reverse)
    await composedGeometry(page, config)
    await missionModeButton(page, 'round-trip').click()
    await expect(page.getByTestId('route-total')).toHaveText(config.roundTrip)
    await expect(page.locator(forward)).toHaveCount(1)
    await expect(page.locator(reverse)).toHaveCount(1)
    await expect(state(page, 'stock:kerbin:surface')).toHaveAttribute('aria-pressed', 'true')
    await expect(state(page, 'kcalbeloh:sera:surface')).toHaveAttribute('aria-pressed', 'true')
    await composedGeometry(page, config)
    await statesFit(page)
    await pageFits(page)
  })

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
