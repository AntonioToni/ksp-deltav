import { readFile } from 'node:fs/promises'
import { expect, test, type Locator, type Page } from '@playwright/test'
import type { ManeuverKind, NodeKind, PlanetPack } from '../src/types/planner'
import { missionModeButton } from './helpers/missionMode'

const storageKey = 'ksp-deltav:custom-packs:v1'
const manager = (page: Page) => page.getByRole('dialog', { name: 'Planet packs', exact: true })
const managerButton = (page: Page) => page.getByRole('button', { name: 'Custom planet packs', exact: true })
const node = (page: Page, id: string) => page.locator(`[data-node-id="${id}"]`)
const installed = (page: Page) => manager(page).getByRole('list', { name: 'Custom planet packs', exact: true }).getByRole('listitem')
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })

/** Deliberately asymmetric teaching values, independent of the bundled maps. */
function customPack(id = 'test-system', name = 'Test planetary system'): PlanetPack {
  const pack: PlanetPack = {
    id, name, shortName: 'Test system', version: '1.0',
    description: 'Synthetic browser-test system. These figures are not flight estimates.',
    transferHubBodyId: 'test:home',
    sources: [{ id: 'test-source', title: 'Synthetic fixture', url: 'https://github.com/AntonioToni/ksp-deltav' }],
    assumptions: ['All figures are explicit directed test values.'],
    bodies: [
      { id: 'test:star', name: 'Test star', parentId: null, kind: 'star', hasSurface: false, hasAtmosphere: false, color: '#e7bd7b' },
      { id: 'test:home', name: 'Test home', parentId: 'test:star', kind: 'planet', hasSurface: true, hasAtmosphere: true, color: '#73c8fa' },
      { id: 'test:moon', name: 'Test moon', parentId: 'test:home', kind: 'moon', hasSurface: true, hasAtmosphere: false, color: '#92d5c6' },
    ],
    nodes: [], maneuvers: [],
  }
  for (const body of ['home', 'moon']) for (const kind of ['surface', 'orbit', 'encounter'] as const) {
    pack.nodes.push({ id: `test:${body}:${kind}`, bodyId: `test:${body}`, kind, label: `Test ${body} ${kind === 'orbit' ? 'low orbit' : kind}` })
  }
  function edge(from: string, to: string, deltaV: number, kind: ManeuverKind) {
    pack.maneuvers.push({ id: `${from}->${to}`, from, to, deltaV, kind, label: `${from} to ${to}`, sourceId: 'test-source', assumptions: [] })
  }
  function local(body: string, from: NodeKind, to: NodeKind, outward: number, inward: number, kind: ManeuverKind, reverseKind: ManeuverKind) {
    edge(`test:${body}:${from}`, `test:${body}:${to}`, outward, kind)
    edge(`test:${body}:${to}`, `test:${body}:${from}`, inward, reverseKind)
  }
  local('home', 'surface', 'orbit', 1000, 900, 'ascent', 'descent')
  local('home', 'orbit', 'encounter', 200, 150, 'escape', 'capture')
  local('moon', 'surface', 'orbit', 100, 80, 'ascent', 'descent')
  local('moon', 'orbit', 'encounter', 40, 30, 'escape', 'capture')
  edge('test:home:orbit', 'test:moon:encounter', 300, 'transfer')
  edge('test:moon:encounter', 'test:home:orbit', 250, 'transfer')
  return pack
}

/** Every interplanetary hop requires a paid capture/parking/escape sequence. */
function longStagePack(): PlanetPack {
  const pack: PlanetPack = {
    id: 'long-line', name: 'Long planetary line', version: '1',
    description: 'Synthetic data to exercise an unusually long stage.',
    sources: [{ id: 'fixture', title: 'Synthetic fixture', url: 'https://example.com' }],
    assumptions: [],
    bodies: [{ id: 'line:star', name: 'Line star', parentId: null, kind: 'star', hasSurface: false, hasAtmosphere: false, color: '#e7bd7b' }],
    nodes: [], maneuvers: [],
  }
  function edge(from: string, to: string, kind: ManeuverKind) {
    pack.maneuvers.push({ id: `${from}->${to}`, from, to, kind, deltaV: 1, label: 'Synthetic transfer', sourceId: 'fixture', assumptions: [] })
  }
  for (let index = 0; index < 35; index++) {
    const body = `line:planet-${index}`
    pack.bodies.push({ id: body, name: `Planet ${index}`, parentId: 'line:star', kind: 'planet', hasSurface: false, hasAtmosphere: false, color: '#73c8fa' })
    for (const kind of ['orbit', 'encounter'] as const) pack.nodes.push({ id: `${body}:${kind}`, bodyId: body, kind, label: `Planet ${index} ${kind}` })
    edge(`${body}:orbit`, `${body}:encounter`, 'escape')
    edge(`${body}:encounter`, `${body}:orbit`, 'capture')
    if (index > 0) {
      edge(`line:planet-${index - 1}:encounter`, `${body}:encounter`, 'transfer')
      edge(`${body}:encounter`, `line:planet-${index - 1}:encounter`, 'transfer')
    }
  }
  return pack
}

let browserErrors: string[]

test.beforeEach(async ({ page }) => {
  browserErrors = []
  page.on('pageerror', error => browserErrors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()) })
  await page.goto('./')
  await expect(managerButton(page)).toBeVisible()
})

test.afterEach(() => {
  expect(browserErrors, 'Custom packs should not produce browser exceptions or console errors').toEqual([])
})

async function openManager(page: Page) {
  await managerButton(page).click()
  await expect(manager(page)).toBeVisible()
}

async function importJson(page: Page, value: unknown, filename = 'custom.json') {
  await manager(page).getByLabel('Import planet pack', { exact: true }).setInputFiles({
    name: filename, mimeType: 'application/json', buffer: Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)),
  })
}

async function importAndUse(page: Page, pack = customPack()) {
  await openManager(page)
  await importJson(page, pack)
  await manager(page).getByRole('button', { name: `Use ${pack.name}`, exact: true }).click()
  await expect(manager(page)).not.toBeVisible()
}

async function addReserve(page: Page) {
  const slider = page.getByRole('slider', { name: 'Redundancy', exact: true })
  await slider.focus()
  await slider.press('Home')
  for (let step = 0; step < 4; step++) await slider.press('ArrowRight')
}

async function assertOnScreen(locator: Locator, page: Page) {
  const bounds = await locator.boundingBox()
  const viewport = page.viewportSize()
  expect(bounds).not.toBeNull()
  expect(viewport).not.toBeNull()
  if (!bounds || !viewport) return
  expect(bounds.x).toBeGreaterThanOrEqual(-1)
  expect(bounds.y).toBeGreaterThanOrEqual(-1)
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width + 1)
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height + 1)
}

test('uses imported directed costs for all mission modes, ordered stops, and one complete reserve', async ({ page }) => {
  await importAndUse(page)
  await expect(managerButton(page)).toHaveAttribute('aria-pressed', 'true')
  await node(page, 'test:home:surface').click()
  await node(page, 'test:moon:surface').click()
  await expect(page.getByTestId('route-total')).toHaveText('1,410 m/s')
  await expect(page.getByLabel('Show breakdown', { exact: true })).not.toBeChecked()
  await missionModeButton(page, 'return-only').click()
  await expect(page.getByTestId('route-total')).toHaveText('1,290 m/s')
  await missionModeButton(page, 'round-trip').click()
  await expect(page.getByTestId('route-total')).toHaveText('2,700 m/s')
  await addReserve(page)
  await expect(page.getByTestId('route-total')).toHaveText('3,240 m/s')
  await expect(page.getByTestId('route-margin')).toHaveText('+540 m/s')
  await button(page, 'Edit mission stops').click()
  const stops = page.getByRole('dialog', { name: /^Mission stops\b/ })
  await stops.getByRole('combobox', { name: 'Choose a stop', exact: true }).fill('Test moon low orbit')
  await page.getByRole('option', { name: 'Test moon low orbit', exact: true }).click()
  await stops.getByRole('button', { name: 'Add stop', exact: true }).click()
  await stops.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.getByTestId('route-total')).toHaveText('3,240 m/s')
  await expect(node(page, 'test:moon:orbit')).toHaveAttribute('data-waypoint-indexes', '1')
  await page.getByLabel('Show breakdown', { exact: true }).check()
  await expect(page.getByTestId('stage-position')).toHaveText('1 / 2')
  await expect(page.getByTestId('stage-total')).toHaveText('1,330 m/s')
  await page.getByRole('tab', { name: 'Return', exact: true }).click()
  await expect(page.getByTestId('stage-total')).toHaveText('100 m/s')
  await button(page, 'Next stage').click()
  await expect(page.getByTestId('stage-total')).toHaveText('1,190 m/s')
})

test('rejects malformed, reserved, duplicate and unsafe presentation data without changing the installed pack', async ({ page }) => {
  await openManager(page)
  await importJson(page, customPack())
  await expect(installed(page)).toHaveCount(1)
  for (const [value, message] of [
    ['{bad JSON', /not valid JSON/],
    [customPack('stock'), /reserved/],
    [customPack(), /already exists/],
    [{ ...customPack('bad-metadata'), shortName: {} }, /shortName/],
    [{ ...customPack('bad-color'), bodies: customPack().bodies.map(body => ({ ...body, color: 'url(https://example.com/paint.svg)' })) }, /hexadecimal color/],
  ] as const) {
    await importJson(page, value)
    await expect(manager(page).getByRole('alert')).toContainText(message)
    await expect(installed(page)).toHaveCount(1)
  }
  await manager(page).getByRole('button', { name: 'Use Test planetary system', exact: true }).click()
  await node(page, 'test:home:surface').click()
  await node(page, 'test:moon:surface').click()
  await expect(page.getByTestId('route-total')).toHaveText('1,410 m/s')
})

test('supports repeated display labels and assumptions while keeping a long custom data notice bounded', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 })
  const pack = customPack()
  pack.assumptions = ['Repeated author assumption.', 'Repeated author assumption.']
  pack.dataNotice = 'A'.repeat(80)
  pack.nodes = pack.nodes.map(state => state.kind === 'orbit' ? { ...state, label: 'Shared parking orbit' } : state)
  await importAndUse(page, pack)
  await assertOnScreen(page.getByText(pack.dataNotice, { exact: true }), page)
  await button(page, 'Model assumptions and data sources').click()
  await expect(page.getByRole('dialog').getByText('Repeated author assumption.', { exact: true })).toHaveCount(2)
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click()
  await button(page, 'Edit mission stops').click()
  const stops = page.getByRole('dialog', { name: /^Mission stops\b/ })
  await stops.getByRole('combobox', { name: 'Choose a stop', exact: true }).fill('Shared parking orbit')
  const options = page.getByRole('option', { name: 'Shared parking orbit', exact: true })
  await expect(options).toHaveCount(2)
  await options.nth(1).click()
  await stops.getByRole('button', { name: 'Add stop', exact: true }).click()
  await stops.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(node(page, 'test:moon:orbit')).toHaveAttribute('data-waypoint-indexes', '1')
  await expect(node(page, 'test:home:orbit')).not.toHaveAttribute('data-waypoint-indexes')
})

test('exports a complete built-in template and keeps compatible endpoints when using a renamed copy', async ({ page }) => {
  await node(page, 'stock:kerbin:surface').click()
  await node(page, 'stock:mun:surface').click()
  await openManager(page)
  const downloadPromise = page.waitForEvent('download')
  await manager(page).getByRole('button', { name: 'Export current pack', exact: true }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('stock.json')
  const file = await download.path()
  expect(file).not.toBeNull()
  if (!file) throw new Error('The exported JSON file is missing')
  const exported = JSON.parse(await readFile(file, 'utf8')) as PlanetPack
  expect(exported.id).toBe('stock')
  expect(exported.bodies).toHaveLength(17)
  expect(exported.nodes).toHaveLength(50)
  expect(exported.maneuvers.length).toBeGreaterThan(0)
  const renamed = { ...exported, id: 'my-stock', name: 'My Stock copy', shortName: 'My Stock' }
  await importJson(page, renamed)
  await manager(page).getByRole('button', { name: 'Use My Stock copy', exact: true }).click()
  await expect(page.getByTestId('route-total')).toHaveText('5,120 m/s')
  await expect(button(page, 'Choose origin')).toContainText('Kerbin surface')
  await expect(button(page, 'Choose destination')).toContainText('Mun surface')
  await expect(managerButton(page)).toHaveAttribute('aria-pressed', 'true')
  await button(page, 'Stock').click()
  await expect(page.getByTestId('route-total')).toHaveText('5,120 m/s')
})

test('restores saved packs after reload and safely removes the active custom system', async ({ page }) => {
  await importAndUse(page)
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null'), storageKey)
  expect(saved.version).toBe(1)
  expect(saved.packs).toHaveLength(1)
  await page.reload()
  await expect(button(page, 'Stock')).toHaveAttribute('aria-pressed', 'true')
  await openManager(page)
  await expect(installed(page)).toHaveCount(1)
  await manager(page).getByRole('button', { name: 'Use Test planetary system', exact: true }).click()
  await node(page, 'test:home:surface').click()
  await node(page, 'test:moon:surface').click()
  await expect(page.getByTestId('route-total')).toHaveText('1,410 m/s')
  await openManager(page)
  await manager(page).getByRole('button', { name: 'Remove Test planetary system', exact: true }).click()
  await expect(installed(page)).toHaveCount(0)
  await expect(manager(page).getByText('Current pack: Stock Kerbol system', { exact: true })).toBeVisible()
  await manager(page).getByRole('button', { name: 'Done', exact: true }).click()
  await expect(button(page, 'Stock')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('[data-node-id]')).toHaveCount(50)
  await expect(page.getByTestId('route-total')).toHaveCount(0)
  await expect(button(page, 'Choose origin')).toContainText('Select origin')
  await expect(button(page, 'Choose destination')).toContainText('Select destination')
  await page.reload()
  await openManager(page)
  await expect(installed(page)).toHaveCount(0)
})

test('ignores corrupt saved data and remains usable when browser storage is blocked', async ({ page }) => {
  await page.evaluate(key => localStorage.setItem(key, '{corrupt'), storageKey)
  await page.reload()
  await openManager(page)
  await expect(manager(page).getByRole('alert')).toContainText(/could not be restored/)
  await expect(installed(page)).toHaveCount(0)
  await manager(page).getByRole('button', { name: 'Done', exact: true }).click()
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('Storage unavailable', 'SecurityError') } })
  })
  await page.reload()
  await openManager(page)
  await importJson(page, customPack())
  await expect(installed(page)).toHaveCount(1)
  await expect(manager(page).getByRole('alert')).toContainText(/session|browser/i)
  await manager(page).getByRole('button', { name: 'Use Test planetary system', exact: true }).click()
  await node(page, 'test:home:surface').click()
  await node(page, 'test:moon:surface').click()
  await expect(page.getByTestId('route-total')).toHaveText('1,410 m/s')
})

test('caps imported packs at five and rejects an oversized file before reading it', async ({ page }) => {
  await openManager(page)
  await importJson(page, ' '.repeat(1024 * 1024 + 1), 'oversized.json')
  await expect(manager(page).getByRole('alert')).toContainText('1 MiB')
  await expect(installed(page)).toHaveCount(0)
  for (let index = 1; index <= 5; index++) {
    await importJson(page, customPack(`test-${index}`, `Test pack ${index}`))
    await expect(installed(page)).toHaveCount(index)
  }
  await expect(manager(page).getByRole('button', { name: 'Import JSON', exact: true })).toBeDisabled()
  await expect(manager(page).getByText('All 5 pack slots are in use. Remove a pack to import another.', { exact: true })).toBeVisible()
  await manager(page).getByRole('button', { name: 'Remove Test pack 2', exact: true }).click()
  await expect(manager(page).getByRole('button', { name: 'Import JSON', exact: true })).toBeEnabled()
  await importJson(page, customPack('test-6', 'Replacement pack'))
  await expect(installed(page)).toHaveCount(5)
})

test('opens the manager with the keyboard and restores focus after Escape', async ({ page }) => {
  await managerButton(page).focus()
  await managerButton(page).press('Enter')
  await expect(manager(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(manager(page)).not.toBeVisible()
  await expect(managerButton(page)).toBeFocused()
  await expect(button(page, 'Stock')).toHaveAttribute('aria-pressed', 'true')
})

test('keeps a 102-maneuver imported stage inside the phone map area', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await importAndUse(page, longStagePack())
  await node(page, 'line:planet-0:orbit').click()
  await node(page, 'line:planet-34:orbit').click()
  await expect(page.getByTestId('route-total')).toHaveText('102 m/s')
  await page.getByLabel('Show breakdown', { exact: true }).check()
  const panel = page.getByRole('region', { name: 'Maneuver breakdown panel', exact: true })
  await assertOnScreen(panel, page)
  await assertOnScreen(button(page, 'Close breakdown'), page)
  await expect(page.getByTestId('maneuver-position')).toHaveText('1–8 of 102')
  await expect(button(page, 'Previous maneuvers')).toBeDisabled()
  await expect(panel.getByRole('listitem')).toHaveCount(8)
  await button(page, 'Next maneuvers').click()
  await expect(page.getByTestId('maneuver-position')).toHaveText('9–16 of 102')
  await button(page, 'Previous maneuvers').click()
  await expect(page.getByTestId('maneuver-position')).toHaveText('1–8 of 102')
  for (let pageIndex = 0; pageIndex < 12; pageIndex++) await button(page, 'Next maneuvers').click()
  await expect(page.getByTestId('maneuver-position')).toHaveText('97–102 of 102')
  await expect(panel.getByRole('listitem')).toHaveCount(6)
  await expect(panel.getByRole('listitem').last()).toContainText('Planet 34 orbit')
  await expect(button(page, 'Next maneuvers')).toBeDisabled()
  await missionModeButton(page, 'round-trip').click()
  await expect(page.getByTestId('route-total')).toHaveText('204 m/s')
  await expect(page.getByTestId('maneuver-position')).toHaveText('1–8 of 102')
  await button(page, 'Next maneuvers').click()
  await page.getByRole('tab', { name: 'Return', exact: true }).click()
  await expect(page.getByTestId('maneuver-position')).toHaveText('1–8 of 102')
  await expect(button(page, 'Previous maneuvers')).toBeDisabled()
  const reserve = page.getByRole('slider', { name: 'Redundancy', exact: true })
  await reserve.focus()
  await reserve.press('End')
  await expect(page.getByTestId('route-total')).toHaveText('408 m/s')
  for (const viewport of [{ width: 320, height: 568 }, { width: 667, height: 375 }]) {
    await page.setViewportSize(viewport)
    await assertOnScreen(panel, page)
    const panelBounds = await panel.boundingBox()
    const footerBounds = await page.getByRole('contentinfo').boundingBox()
    expect(panelBounds).not.toBeNull()
    expect(footerBounds).not.toBeNull()
    if (panelBounds && footerBounds) expect(panelBounds.y + panelBounds.height).toBeLessThanOrEqual(footerBounds.y + 1)
  }
  await button(page, 'Edit mission stops').click()
  const stops = page.getByRole('dialog', { name: /^Mission stops\b/ })
  await stops.getByRole('combobox', { name: 'Choose a stop', exact: true }).fill('Planet 17 orbit')
  await page.getByRole('option', { name: 'Planet 17 orbit', exact: true }).click()
  await stops.getByRole('button', { name: 'Add stop', exact: true }).click()
  await stops.getByRole('button', { name: 'Done', exact: true }).click()
  await page.getByLabel('Show breakdown', { exact: true }).check()
  await expect(page.getByTestId('stage-position')).toHaveText('1 / 2')
  await expect(page.getByTestId('stage-total')).toHaveText('51 m/s')
  await expect(page.getByTestId('maneuver-position')).toHaveText('1–8 of 51')
  await button(page, 'Next maneuvers').click()
  await button(page, 'Next stage').click()
  await expect(page.getByTestId('stage-position')).toHaveText('2 / 2')
  await expect(page.getByTestId('maneuver-position')).toHaveText('1–8 of 51')
  await expect(page.getByTestId('route-total')).toHaveText('408 m/s')
  await button(page, 'Close breakdown').click()
  await expect(panel).not.toBeVisible()
})

test('fits a large imported mission budget at phone and landscape widths', async ({ page }) => {
  const pack = longStagePack()
  pack.maneuvers = pack.maneuvers.map(edge => ({ ...edge, deltaV: 1_000_000 }))
  await importAndUse(page, pack)
  await node(page, 'line:planet-0:orbit').click()
  await node(page, 'line:planet-34:orbit').click()
  await missionModeButton(page, 'round-trip').click()
  const reserve = page.getByRole('slider', { name: 'Redundancy', exact: true })
  await reserve.focus()
  await reserve.press('End')
  await expect(page.getByTestId('route-total')).toHaveText('408,000,000 m/s')
  for (const viewport of [{ width: 320, height: 568 }, { width: 667, height: 375 }]) {
    await page.setViewportSize(viewport)
    const output = page.getByTestId('route-total')
    await assertOnScreen(output, page)
    const text = await output.evaluate(element => {
      const range = document.createRange()
      range.selectNodeContents(element)
      const textBounds = range.getBoundingClientRect()
      const bounds = element.getBoundingClientRect()
      return { left: textBounds.left, right: textBounds.right, containerLeft: bounds.left, containerRight: bounds.right }
    })
    expect(text.left).toBeGreaterThanOrEqual(text.containerLeft - 1)
    expect(text.right).toBeLessThanOrEqual(text.containerRight + 1)
    await assertOnScreen(button(page, 'Reset mission'), page)
    await assertOnScreen(button(page, 'Edit mission stops'), page)
  }
})

for (const viewport of [
  { width: 320, height: 568 }, { width: 390, height: 844 },
  { width: 667, height: 375 }, { width: 700, height: 900 },
]) {
  test(`keeps custom maps, pack controls and the manager within ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await importAndUse(page)
    await expect(page.getByText(viewport.height <= 500 ? 'Test system · KSP 1' : 'System · Test system', { exact: true })).toBeVisible()
    const map = page.getByRole('group', { name: 'Test star system Delta-V state map', exact: true })
    await assertOnScreen(map, page)
    await expect(page.locator('[data-node-id]')).toHaveCount(6)
    for (const state of await page.locator('[data-node-id]').all()) await assertOnScreen(state, page)
    for (const name of ['Stock', 'OPM', 'RSS', 'Custom planet packs', 'One way', 'Round trip', 'Return only', 'Edit mission stops', 'Choose origin', 'Choose destination']) await assertOnScreen(button(page, name), page)
    const systems = await page.getByRole('group', { name: 'Planet pack', exact: true }).boundingBox()
    const trips = await page.getByRole('group', { name: 'Mission mode', exact: true }).boundingBox()
    expect(systems).not.toBeNull()
    expect(trips).not.toBeNull()
    if (systems && trips) {
      expect(Math.abs(systems.y - trips.y)).toBeLessThanOrEqual(1)
      expect(systems.x + systems.width).toBeLessThanOrEqual(trips.x + 1)
    }
    const geometry = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, documentWidth: document.documentElement.scrollWidth, documentHeight: document.documentElement.scrollHeight }))
    expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.width)
    expect(geometry.documentHeight).toBeLessThanOrEqual(geometry.height)
    await openManager(page)
    await assertOnScreen(manager(page), page)
    for (const name of ['Import JSON', 'Export current pack', 'Done', 'Use Test planetary system', 'Remove Test planetary system']) await assertOnScreen(manager(page).getByRole('button', { name, exact: true }), page)
  })
}
