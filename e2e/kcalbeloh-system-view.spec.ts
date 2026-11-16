import { expect, test, type Page } from '@playwright/test'
import { stockKcalbelohNoWormholesPack, stockKcalbelohPack } from '../src/data/kcalbeloh'
import { createMapLayout, kcalbelohSystemViewId, packForMapRegion } from '../src/components/mapLayout'
import { missionModeButton } from './helpers/missionMode'

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const state = (page: Page, id: string) => page.locator(`[data-node-id="${id}"]`)
const systemMap = (page: Page) => page.getByRole('group', { name: 'Kcalbeloh system Delta-V state map', exact: true })
const total = (page: Page) => page.getByTestId('route-total')
const localViews = ['Kcalbeloh', 'Maelg', 'Sunorc', 'Aralc']
const edgeEndpoints = [
  ...stockKcalbelohPack.maneuvers,
  ...(stockKcalbelohPack.unpricedConnections ?? []).flatMap(edge => [
    edge,
    { id: `allowance:${edge.id}:forward`, from: edge.from, to: edge.to },
    { id: `allowance:${edge.id}:reverse`, from: edge.to, to: edge.from },
  ]),
].map(({ id, from, to }) => ({ id, from, to }))
const configurations = [
  { name: 'Stock + Kcalbeloh', nodes: 97 },
  { name: 'OPM + Kcalbeloh', nodes: 143 },
]
const activeViewRoutes = [
  { view: 'Kcalbeloh system', region: kcalbelohSystemViewId, from: 'suluco', to: 'tot' },
  { view: 'Kcalbeloh', region: 'kcalbeloh', from: 'onrefni', to: 'rouqea' },
  { view: 'Maelg', region: 'maelg', from: 'mehtna', to: 'meiuqer' },
  { view: 'Sunorc', region: 'sunorc', from: 'suluco', to: 'tot' },
  { view: 'Aralc', region: 'aralc', from: 'efil', to: 'elad' },
]
let errors: string[]

test.beforeEach(async ({ page }) => {
  errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.goto('./')
})

test.afterEach(() => expect(errors, 'Map views must not produce browser errors').toEqual([]))

async function configuration(page: Page, name: string) {
  await button(page, 'Custom planet packs').click()
  const manager = page.getByRole('dialog', { name: 'Planet packs', exact: true })
  await manager.getByRole('tab', { name: 'Add-ons', exact: true }).click()
  await manager.getByRole('button', { name: `Use ${name}`, exact: true }).click()
  await expect(manager).toBeHidden()
}

async function view(page: Page, name: string) {
  await page.getByRole('combobox', { name: 'Map view', exact: true }).click()
  const menu = page.getByRole('listbox', { name: 'Map view', exact: true })
  await expect(menu).toBeVisible()
  await expect(menu.locator('..')).toHaveCSS('opacity', '1')
  await page.getByRole('option', { name, exact: true }).click()
}

async function keyboardView(page: Page, name: string, keys: string[]) {
  const control = page.getByRole('combobox', { name: 'Map view', exact: true })
  await control.focus()
  await control.press('Enter')
  const menu = page.getByRole('listbox', { name: 'Map view', exact: true })
  await expect(menu).toBeVisible()
  await expect(menu.getByText('Overview', { exact: true })).toBeVisible()
  await expect(menu.getByText('Close-ups', { exact: true })).toBeVisible()
  for (const key of keys) await page.keyboard.press(key)
  await expect(page.getByRole('option', { name, exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(menu).toBeHidden()
  await expect(control).toBeFocused()
}

async function addStop(page: Page, label: string) {
  await button(page, 'Edit mission stops').click()
  const editor = page.getByRole('dialog', { name: 'Mission stops', exact: true })
  await editor.getByRole('combobox', { name: 'Choose a stop', exact: true }).fill(label)
  await page.getByRole('option', { name: label, exact: true }).click()
  await editor.getByRole('button', { name: 'Add stop', exact: true }).click()
  await editor.getByRole('button', { name: 'Done', exact: true }).click()
}

async function selectRoute(page: Page, from: string, to: string) {
  await button(page, 'Choose origin').click()
  await state(page, from).click()
  await state(page, to).click()
}

async function expectMapFits(page: Page) {
  const viewport = page.viewportSize()!
  await page.evaluate(() => document.fonts.ready)
  expect(await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, x: scrollX, y: scrollY })))
    .toEqual({ ...viewport, x: 0, y: 0 })
  const map = page.locator('svg[data-map-presentation]')
  const geometry = await map.evaluate((svg, endpoints) => {
    const bounds = svg.getBoundingClientRect()
    const labels = [...svg.querySelectorAll<SVGTextElement>('[data-body-label]')].map(label => ({
      id: label.getAttribute('data-body-label'), bounds: label.getBoundingClientRect(),
    }))
    const circles = [...svg.querySelectorAll<SVGCircleElement>('[data-node-id] .state-circle')].map(circle => ({
      id: circle.parentElement!.getAttribute('data-node-id'), bounds: circle.getBoundingClientRect(),
    }))
    const labelCollisions: string[] = []
    for (const label of labels) for (const circle of circles) {
      const x = circle.bounds.x + circle.bounds.width / 2
      const y = circle.bounds.y + circle.bounds.height / 2
      const dx = Math.max(label.bounds.left - x, x - label.bounds.right, 0)
      const dy = Math.max(label.bounds.top - y, y - label.bounds.bottom, 0)
      if (Math.hypot(dx, dy) < circle.bounds.width / 2 - .5) labelCollisions.push(`${label.id}: ${circle.id}`)
    }
    const intersectsLabel = (start: DOMPoint, end: DOMPoint, bounds: DOMRect) => {
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
    const nodeConnectionCollisions: string[] = []
    const activeEdgeGeometry: { id: string | null; points: number; finite: boolean; length: number; endpointGap: number }[] = []
    for (const path of svg.querySelectorAll<SVGPathElement>('[data-connection-id], [data-unpriced-id], [data-route-edge="true"]')) {
      const id = path.getAttribute('data-connection-id') ?? path.getAttribute('data-unpriced-id') ?? path.getAttribute('data-edge-id')
      const edge = endpoints.find(edge => edge.id === id)
      const matrix = path.getScreenCTM()!
      const values = (path.getAttribute('d')!.match(/[-+]?(?:\d*\.?\d+)(?:e[-+]?\d+)?/gi) ?? []).map(Number)
      const points = Array.from({ length: values.length / 2 }, (_, index) =>
        new DOMPoint(values[index * 2], values[index * 2 + 1]).matrixTransform(matrix))
      if (path.hasAttribute('data-route-edge')) {
        const endpointGap = Math.max(...[edge?.from, edge?.to].map((id, index) => {
          const bounds = circles.find(circle => circle.id === id)?.bounds
          const point = index === 0 ? points.at(0) : points.at(-1)
          return point && bounds ? Math.hypot(point.x - bounds.x - bounds.width / 2, point.y - bounds.y - bounds.height / 2) : Infinity
        }))
        activeEdgeGeometry.push({ id, points: points.length, endpointGap,
          finite: points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y)),
          length: path.getTotalLength(),
        })
      }
      for (let index = 1; index < points.length; index++) {
        const start = points[index - 1]!
        const end = points[index]!
        for (const label of labels) {
          if (intersectsLabel(start, end, label.bounds)) connectionCollisions.push(`${id}: ${label.id}`)
        }
        for (const circle of circles) {
          if (circle.id === edge?.from || circle.id === edge?.to) continue
          const x = circle.bounds.x + circle.bounds.width / 2
          const y = circle.bounds.y + circle.bounds.height / 2
          const dx = end.x - start.x
          const dy = end.y - start.y
          const squared = dx * dx + dy * dy
          const fraction = squared ? Math.max(0, Math.min(1, ((x - start.x) * dx + (y - start.y) * dy) / squared)) : 0
          if (Math.hypot(x - start.x - fraction * dx, y - start.y - fraction * dy) < circle.bounds.width / 2 - .5) {
            nodeConnectionCollisions.push(`${id}: ${circle.id}`)
          }
        }
      }
    }
    return {
      bounds: { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom },
      labelCollisions, connectionCollisions, nodeConnectionCollisions, activeEdgeGeometry,
      labels: labels.map(({ id, bounds: r }) => ({ id, left: r.left, top: r.top, right: r.right, bottom: r.bottom })),
      states: [...svg.querySelectorAll('[data-node-id]')].map(node => {
        const rectangle = node.getBoundingClientRect()
        return { id: node.getAttribute('data-node-id'), left: rectangle.left, top: rectangle.top, right: rectangle.right, bottom: rectangle.bottom }
      }),
    }
  }, edgeEndpoints)
  expect(geometry.states.length).toBeGreaterThan(0)
  expect(geometry.labelCollisions, 'Body names must stay outside visible state markers').toEqual([])
  expect(geometry.connectionCollisions, 'Connection lines must stay outside rendered body names').toEqual([])
  expect(geometry.nodeConnectionCollisions, 'Connections must avoid unrelated state markers').toEqual([])
  for (const edge of geometry.activeEdgeGeometry) {
    expect(edge.finite, edge.id ?? '').toBe(true)
    expect(edge.points, edge.id ?? '').toBeGreaterThanOrEqual(2)
    expect(edge.length, edge.id ?? '').toBeGreaterThan(0)
    expect(edge.endpointGap, `${edge.id} must connect its actual selected states`).toBeLessThan(.1)
  }
  for (const label of geometry.labels) {
    expect(label.left, label.id ?? '').toBeGreaterThanOrEqual(geometry.bounds.left - 1)
    expect(label.top, label.id ?? '').toBeGreaterThanOrEqual(geometry.bounds.top - 1)
    expect(label.right, label.id ?? '').toBeLessThanOrEqual(geometry.bounds.right + 1)
    expect(label.bottom, label.id ?? '').toBeLessThanOrEqual(geometry.bounds.bottom + 1)
  }
  for (const node of geometry.states) {
    expect(node.left, node.id ?? '').toBeGreaterThanOrEqual(geometry.bounds.left - 1)
    expect(node.top, node.id ?? '').toBeGreaterThanOrEqual(geometry.bounds.top - 1)
    expect(node.right, node.id ?? '').toBeLessThanOrEqual(geometry.bounds.right + 1)
    expect(node.bottom, node.id ?? '').toBeLessThanOrEqual(geometry.bounds.bottom + 1)
  }
  await expect(button(page, 'Choose origin')).toBeInViewport()
  await expect(button(page, 'Choose destination')).toBeInViewport()
}

for (const config of configurations) {
  test(`combines all four distant regions for ${config.name} and preserves mission selections across views`, async ({ page }) => {
    await configuration(page, config.name)
    await keyboardView(page, 'Kcalbeloh system', ['Home', 'ArrowDown'])
    await expect(systemMap(page)).toBeVisible()
    await expect(systemMap(page)).toHaveAttribute('data-map-presentation', 'system')
    await expect(page.locator('[data-map-region]')).toHaveAttribute('data-map-region', 'kcalbeloh-system')
    await expect(page.locator('[data-node-id]')).toHaveCount(47)
    await expect(state(page, 'stock:kerbin:surface')).toHaveCount(0)
    await expect(systemMap(page).locator('[data-map-panel]')).toHaveCount(0)
    await state(page, 'kcalbeloh:suluco:surface').click()
    await state(page, 'kcalbeloh:tot:surface').focus()
    await state(page, 'kcalbeloh:tot:surface').press('Enter')
    await expect(total(page)).toHaveText('3,931 m/s')
    await expect(systemMap(page)).toBeVisible()
    await expect(page.locator('[data-route-edge="true"]')).toHaveCount(3)
    await expectMapFits(page)
    await missionModeButton(page, 'round-trip').click()
    await expect(total(page)).toHaveText('7,862 m/s')
    for (const local of localViews) {
      // Moving down past All systems must skip the Close-ups section heading.
      if (local === 'Kcalbeloh') await keyboardView(page, local, ['ArrowDown', 'ArrowDown'])
      else await view(page, local)
      await expect(total(page)).toHaveText('7,862 m/s')
      await expectMapFits(page)
    }
    await view(page, 'All systems')
    await expect(page.locator('[data-node-id]')).toHaveCount(config.nodes)
    await expect(total(page)).toHaveText('7,862 m/s')
    await view(page, 'Kcalbeloh system')
    await expect(systemMap(page)).toBeVisible()
    await expect(state(page, 'kcalbeloh:suluco:surface')).toHaveAttribute('aria-pressed', 'true')
    await expect(state(page, 'kcalbeloh:tot:surface')).toHaveAttribute('aria-pressed', 'true')
    await expect(total(page)).toHaveText('7,862 m/s')
    await addStop(page, 'Suluco low orbit')
    await expect(systemMap(page)).toBeVisible()
    await expect(state(page, 'kcalbeloh:suluco:orbit')).toHaveAttribute('data-waypoint-indexes', '1')
    await expect(total(page)).toHaveText('7,862 m/s')
    await addStop(page, 'Kerbin low orbit')
    await expect(page.locator('[data-map-region]')).toHaveAttribute('data-map-region', 'kerbol')
    await expect(state(page, 'stock:kerbin:orbit')).toBeVisible()
    // Revisit the same searched point after choosing the overview manually.
    // A previous focus must not prevent that point being revealed again.
    await view(page, 'Kcalbeloh system')
    await addStop(page, 'Sera low orbit')
    await expect(systemMap(page)).toBeVisible()
    await expect(state(page, 'kcalbeloh:sera:orbit')).toHaveAttribute('data-waypoint-indexes', '3')
    await addStop(page, 'Kerbin low orbit')
    await expect(page.locator('[data-map-region]')).toHaveAttribute('data-map-region', 'kerbol')
    await expect(state(page, 'stock:kerbin:orbit')).toHaveAttribute('data-waypoint-indexes', '2,4')
  })
}

test('keeps a cross-region route unavailable until its actual directional allowance is entered', async ({ page }) => {
  await configuration(page, 'Stock + Kcalbeloh')
  await view(page, 'Kcalbeloh system')
  await state(page, 'kcalbeloh:kcalbeloh:reference').click()
  await state(page, 'kcalbeloh:mehtna:orbit').click()
  await expect(total(page)).toHaveCount(0)
  await button(page, 'Link allowances').click()
  const editor = page.getByRole('dialog', { name: 'Link allowances', exact: true })
  await editor.getByRole('spinbutton', { name: 'Forward allowance for Maelg reference ↔ Mehtna low orbit', exact: true }).fill('400')
  await editor.getByRole('button', { name: 'Apply', exact: true }).click()
  // Published Kcalbeloh→Maelg reference transfer 78,300 + complete user link 400.
  await expect(total(page)).toHaveText('78,700 m/s')
  await expect(systemMap(page)).toBeVisible()
  await expect(page.locator('[data-route-edge="true"]')).toHaveCount(2)
  await expectMapFits(page)
  await view(page, 'Maelg')
  await expect(total(page)).toHaveText('78,700 m/s')
  await view(page, 'Kcalbeloh system')
  await expect(page.locator('[data-route-edge="true"]')).toHaveCount(2)
  await missionModeButton(page, 'return-only').click()
  await expect(total(page)).toHaveCount(0)
})

test('supports the same overview for a renamed imported pack with wormholes disabled', async ({ page }) => {
  const custom = { ...stockKcalbelohNoWormholesPack, id: 'community-kcalbeloh-overview', name: 'Community Kcalbeloh overview' }
  await button(page, 'Custom planet packs').click()
  const manager = page.getByRole('dialog', { name: 'Planet packs', exact: true })
  await manager.getByRole('tab', { name: 'Custom packs', exact: true }).click()
  await manager.getByLabel('Import planet pack', { exact: true }).setInputFiles({
    name: 'community-kcalbeloh-overview.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(custom)),
  })
  await manager.getByRole('button', { name: `Use ${custom.name}`, exact: true }).click()
  await view(page, 'Kcalbeloh system')
  await expect(systemMap(page)).toBeVisible()
  await expect(page.locator('[data-node-id]')).toHaveCount(47)
  await expect(page.locator('[data-unpriced-id="kcalbeloh:wormhole"]')).toHaveCount(0)
  await state(page, 'kcalbeloh:suluco:surface').click()
  await state(page, 'kcalbeloh:tot:surface').click()
  await expect(total(page)).toHaveText('3,931 m/s')
  await view(page, 'All systems')
  await expect(page.locator('[data-node-id]')).toHaveCount(97)
  await expect(total(page)).toHaveText('3,931 m/s')
})

test('reveals a secondary transfer in both directions in its close-up and the complete system map', async ({ page }) => {
  const visible = packForMapRegion(stockKcalbelohPack, 'sunorc')
  const local = createMapLayout(visible)
  const combined = createMapLayout(packForMapRegion(stockKcalbelohPack, kcalbelohSystemViewId))
  const secondary = visible.maneuvers.filter(edge => {
    const pair = JSON.stringify([edge.from, edge.to].sort())
    return !local.backgroundPairs!.has(pair) && !combined.backgroundPairs!.has(pair)
  })
  expect(secondary.length, 'The primary spine should leave secondary transfers for route selection').toBeGreaterThan(0)
  const edge = secondary[0]!
  const reverse = secondary.find(candidate => candidate.from === edge.to && candidate.to === edge.from)!
  expect(reverse).toBeDefined()
  await configuration(page, 'Stock + Kcalbeloh')
  for (const mapView of ['Sunorc', 'Kcalbeloh system']) {
    await view(page, mapView)
    for (const edge of secondary) {
      await expect(page.locator(`[data-connection-id="${edge.id}"]`)).toHaveCount(0)
    }
  }
  for (const mapView of ['Sunorc', 'Kcalbeloh system']) {
    await view(page, mapView)
    for (const edge of [secondary[0]!, reverse]) {
      await selectRoute(page, edge.from, edge.to)
      await expect(page.locator(`[data-route-edge="true"][data-edge-id="${edge.id}"]`), edge.id).toHaveCount(1)
      await expect(page.locator('[data-route-animation="true"]'), edge.id).toHaveCount(1)
      await expectMapFits(page)
    }
  }
})

test('reveals secondary binary-system allowances only after they are explicitly priced and selected', async ({ page }) => {
  const visible = packForMapRegion(stockKcalbelohPack, 'aralc')
  const layout = createMapLayout(visible)
  const combined = createMapLayout(packForMapRegion(stockKcalbelohPack, kcalbelohSystemViewId))
  const secondary = visible.unpricedConnections!.filter(edge => {
    const pair = JSON.stringify([edge.from, edge.to].sort())
    return !layout.backgroundPairs!.has(pair) && !combined.backgroundPairs!.has(pair)
  })
  expect(secondary.length, 'Missing binary transfers should remain available without crowding the primary spine').toBeGreaterThan(0)
  await configuration(page, 'Stock + Kcalbeloh')
  for (const mapView of ['Aralc', 'Kcalbeloh system']) {
    await view(page, mapView)
    for (const edge of secondary) {
      await expect(page.locator(`[data-unpriced-id="${edge.id}"]`)).toHaveCount(0)
    }
  }
  const edge = secondary[0]!
  await selectRoute(page, edge.from, edge.to)
  await expect(total(page)).toHaveCount(0)
  await button(page, 'Link allowances').click()
  const editor = page.getByRole('dialog', { name: 'Link allowances', exact: true })
  await editor.getByRole('spinbutton', { name: `Forward allowance for ${edge.label}`, exact: true }).fill('400')
  await editor.getByRole('spinbutton', { name: `Reverse allowance for ${edge.label}`, exact: true }).fill('500')
  await editor.getByRole('button', { name: 'Apply', exact: true }).click()
  for (const mapView of ['Aralc', 'Kcalbeloh system']) {
    await view(page, mapView)
    for (const direction of ['forward', 'reverse'] as const) {
      await selectRoute(page, direction === 'forward' ? edge.from : edge.to, direction === 'forward' ? edge.to : edge.from)
      await expect(total(page)).toHaveText(`${direction === 'forward' ? 400 : 500} m/s`)
      await expect(page.locator(`[data-route-edge="true"][data-edge-id="allowance:${edge.id}:${direction}"]`)).toHaveCount(1)
      await expectMapFits(page)
    }
  }
})

test('captures an active route in the complete system map and all four close-ups', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Desktop artifacts document the five bespoke schematics')
  await page.setViewportSize({ width: 2560, height: 1440 })
  await configuration(page, 'Stock + Kcalbeloh')
  for (const route of activeViewRoutes) {
    await view(page, route.view)
    await selectRoute(page, `kcalbeloh:${route.from}:surface`, `kcalbeloh:${route.to}:surface`)
    await expect(total(page)).toBeVisible()
    await expect(page.locator('[data-route-edge="true"]')).toHaveCount(3)
    await expectMapFits(page)
    const path = testInfo.outputPath(`kcalbeloh-${route.region}-active.png`)
    await page.screenshot({ path, animations: 'disabled' })
    await testInfo.attach(`Active route: ${route.view}`, { path, contentType: 'image/png' })
  }
})

for (const viewport of [{ width: 375, height: 812 }, { width: 667, height: 375 }, { width: 1280, height: 720 }, { width: 3440, height: 1440 }]) {
  test(`keeps the combined overview and all close-ups within ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    for (const config of configurations) {
      await configuration(page, config.name)
      await view(page, 'Kcalbeloh system')
      await expect(systemMap(page)).toBeVisible()
      await expect(page.locator('[data-node-id]')).toHaveCount(47)
      await expectMapFits(page)
      if (viewport.width >= 1280) {
        await expect.poll(() => systemMap(page).locator('[data-body-label]').evaluateAll(labels =>
          Math.min(...labels.map(label => label.getBoundingClientRect().height))),
        { message: 'Desktop overview names should remain readable after fitting the canvas' }).toBeGreaterThanOrEqual(11)
      }
      for (const local of localViews) {
        await view(page, local)
        await expect(page.locator('svg[data-map-presentation]')).toHaveAttribute('data-map-presentation', 'regional')
        await expectMapFits(page)
      }
    }
  })
}
