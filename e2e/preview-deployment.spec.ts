import { expect, test, type Page } from '@playwright/test'
import type { PlanetPack } from '../src/types/planner'

const prNumber = process.env.VITE_PREVIEW_PR_NUMBER?.trim() ?? ''
const preview = /^[1-9]\d*$/.test(prNumber)
const storagePrefix = preview ? `ksp-deltav:preview:pr-${prNumber}:` : ''
const relayKey = 'ksp-deltav:relay-planner-mode'
const packsKey = 'ksp-deltav:custom-packs:v1'
const otherPrefix = `ksp-deltav:preview:pr-${prNumber === '25' ? '26' : '25'}:`
const relayDialog = (page: Page) => page.getByRole('dialog', { name: 'CommNet relay planner', exact: true })
let pageErrors: string[]

test.beforeEach(({ page }, testInfo) => {
  pageErrors = []
  test.skip(testInfo.config.metadata.pagesDeployment !== true, 'Pages deployment checks require a production build, not the Vite development server.')
  page.on('pageerror', error => pageErrors.push(error.message))
})
test.afterEach(() => expect(pageErrors, 'The deployed application should not throw browser errors').toEqual([]))

async function loadPlanner(page: Page) {
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'KSP DeltaV Planner', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'CommNet relay planner', exact: true })).toBeVisible()
}

function storagePack(id: string, name: string): PlanetPack {
  return {
    id, name, shortName: 'Fixture', version: '1', description: 'Synthetic browser storage fixture.',
    transferHubBodyId: 'fixture:home', assumptions: ['Synthetic directed values.'],
    sources: [{ id: 'fixture', title: 'Synthetic fixture', url: 'https://github.com/AntonioToni/ksp-deltav' }],
    bodies: [
      { id: 'fixture:star', name: 'Fixture star', parentId: null, kind: 'star', hasSurface: false, hasAtmosphere: false, color: '#e7bd7b' },
      { id: 'fixture:home', name: 'Fixture home', parentId: 'fixture:star', kind: 'planet', hasSurface: true, hasAtmosphere: false, color: '#73c8fa' },
    ],
    nodes: [
      { id: 'fixture:surface', bodyId: 'fixture:home', kind: 'surface', label: 'Fixture surface' },
      { id: 'fixture:orbit', bodyId: 'fixture:home', kind: 'orbit', label: 'Fixture orbit' },
    ],
    maneuvers: [
      { id: 'fixture:ascent', from: 'fixture:surface', to: 'fixture:orbit', deltaV: 100, kind: 'ascent', label: 'Synthetic ascent', sourceId: 'fixture', assumptions: [] },
      { id: 'fixture:descent', from: 'fixture:orbit', to: 'fixture:surface', deltaV: 50, kind: 'descent', label: 'Synthetic descent', sourceId: 'fixture', assumptions: [] },
    ],
  }
}

test('serves the expected production or preview indexing policy in the initial HTML', async ({ request, page }) => {
  const response = await request.get('./')
  await expect(response).toBeOK()
  const html = await response.text()
  await page.goto('./')
  const robots = page.locator('head meta[name="robots"]')
  await expect(robots).toHaveCount(1)
  if (preview) {
    await expect(robots).toHaveAttribute('content', /noindex/)
    expect(html).toMatch(/<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i)
    await expect(page.getByTestId('preview-build-badge')).toHaveText(`Preview · PR #${prNumber}`)
    const policy = page.locator('head meta[http-equiv="Content-Security-Policy"]')
    await expect(policy).toHaveCount(1)
    await expect(policy).toHaveAttribute('content', /connect-src\s+'none'/)
  } else {
    await expect(robots).toHaveAttribute('content', /^index, follow/)
    await expect(page.getByTestId('preview-build-badge')).toHaveCount(0)
  }
  await expect(page.locator('head link[rel="canonical"]')).toHaveAttribute('href', 'https://antoniotoni.github.io/ksp-deltav/')
  const robotsResponse = await request.get('robots.txt')
  await expect(robotsResponse).toBeOK()
  const rules = await robotsResponse.text()
  expect(rules).toMatch(/User-agent:\s*\*/i)
  expect(rules).toMatch(preview ? /^Disallow:\s*\/\s*$/m : /^Disallow:\s*\/ksp-deltav\/previews\/\s*$/m)
})

test('loads JavaScript, CSS, fonts, favicon and artwork below the configured Pages path', async ({ page, request, baseURL }) => {
  if (!baseURL) throw new Error('Deployment asset checks require baseURL.')
  const base = new URL(baseURL)
  const loaded: { url: string; type: string; status: number }[] = []
  const failures: string[] = []
  page.on('response', response => loaded.push({ url: response.url(), type: response.request().resourceType(), status: response.status() }))
  page.on('requestfailed', failed => failures.push(failed.url()))
  await loadPlanner(page)
  await page.evaluate(() => document.fonts.ready)
  await page.waitForLoadState('networkidle')
  for (const type of ['script', 'stylesheet', 'font']) {
    const assets = loaded.filter(asset => asset.type === type)
    expect(assets.length, `Expected deployed ${type} requests`).toBeGreaterThan(0)
    for (const asset of assets) {
      const url = new URL(asset.url)
      expect(url.origin).toBe(base.origin)
      expect(url.pathname.startsWith(base.pathname), `${type} asset must stay under ${base.pathname}`).toBe(true)
      expect(asset.status).toBe(200)
    }
  }
  const faviconURL = await page.locator('head link[rel="icon"]').getAttribute('href')
  expect(new URL(faviconURL!, baseURL).pathname).toBe(`${base.pathname}favicon.svg`)
  await expect(await request.get(faviconURL!)).toBeOK()
  const artwork = await request.get('social-preview.png')
  await expect(artwork).toBeOK()
  expect((await artwork.body()).subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
  expect(failures).toEqual([])
})

test('keeps mission planning, header controls, preview identification and relay dialogs usable', async ({ page }) => {
  await loadPlanner(page)
  const header = page.getByRole('banner')
  const badge = header.getByTestId('preview-build-badge')
  if (preview) {
    await expect(badge).toBeVisible()
    await expect(badge).toHaveText(`Preview · PR #${prNumber}`)
  } else await expect(badge).toHaveCount(0)
  for (const id of ['stock:kerbin:surface', 'stock:mun:surface']) {
    const destination = page.locator(`[data-node-id="${id}"]`)
    await destination.focus()
    await destination.press('Enter')
  }
  await expect(page.getByTestId('route-total')).toHaveText('5,120 m/s')
  for (const control of [
    header.getByRole('button', { name: 'Landing & Capture', exact: true }),
    header.getByRole('button', { name: 'CommNet relay planner', exact: true }),
    header.getByRole('link', { name: 'GitHub project (opens in a new tab)', exact: true }),
    ...(preview ? [badge] : []),
  ]) {
    await expect(control).toBeInViewport({ ratio: .99999 })
  }
  await header.getByRole('button', { name: 'CommNet relay planner', exact: true }).click()
  await expect(relayDialog(page)).toBeVisible()
  for (const tab of ['Network', 'Deployment', 'Body data', 'Signals']) {
    await relayDialog(page).getByRole('tab', { name: tab, exact: true }).click()
    await expect(relayDialog(page).getByRole('button', { name: 'Close', exact: true })).toBeInViewport()
  }
  await relayDialog(page).getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.getByTestId('route-total')).toHaveText('5,120 m/s')
  const dimensions = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, x: scrollX, y: scrollY }))
  expect(dimensions).toEqual({ ...page.viewportSize()!, x: 0, y: 0 })
})

test('isolates preview preferences and imported packs while preserving production and other PR state', async ({ page }) => {
  await loadPlanner(page)
  const productionSaved = JSON.stringify({ version: 1, packs: [storagePack('production-saved', 'Production saved pack')] })
  await page.evaluate(({ relayKey, packsKey, otherPrefix, productionSaved }) => {
    localStorage.setItem(relayKey, 'advanced')
    localStorage.setItem(packsKey, productionSaved)
    localStorage.setItem(`${otherPrefix}${relayKey}`, 'basic')
    localStorage.setItem(`${otherPrefix}${packsKey}`, 'other-preview-sentinel')
  }, { relayKey, packsKey, otherPrefix, productionSaved })
  await page.reload()
  await page.getByRole('button', { name: 'CommNet relay planner', exact: true }).click()
  const modes = relayDialog(page).getByRole('group', { name: 'Relay planner mode', exact: true })
  await expect(modes.getByRole('button', { name: preview ? 'Basic' : 'Advanced', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await modes.getByRole('button', { name: preview ? 'Advanced' : 'Basic', exact: true }).click()
  await relayDialog(page).getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('button', { name: 'Custom planet packs', exact: true }).click()
  const packs = page.getByRole('dialog', { name: 'Planet packs', exact: true })
  await packs.getByRole('tab', { name: 'Custom packs', exact: true }).click()
  await expect(packs.getByRole('button', { name: 'Use Production saved pack', exact: true })).toHaveCount(preview ? 0 : 1)
  const imported = storagePack('deployment-local-fixture', 'Deployment local fixture')
  await packs.getByLabel('Import planet pack', { exact: true }).setInputFiles({ name: 'deployment-fixture.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(imported)) })
  await expect(packs.getByRole('button', { name: 'Use Deployment local fixture', exact: true })).toBeVisible()
  const saved = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)))
  expect(saved[`${storagePrefix}${relayKey}`]).toBe(preview ? 'advanced' : 'basic')
  expect(JSON.parse(saved[`${storagePrefix}${packsKey}`]!).packs.some((pack: { id: string }) => pack.id === imported.id)).toBe(true)
  if (preview) {
    expect(saved[relayKey]).toBe('advanced')
    expect(saved[packsKey]).toBe(productionSaved)
  }
  expect(saved[`${otherPrefix}${relayKey}`]).toBe('basic')
  expect(saved[`${otherPrefix}${packsKey}`]).toBe('other-preview-sentinel')
  await page.reload()
  await page.getByRole('button', { name: 'CommNet relay planner', exact: true }).click()
  await expect(relayDialog(page).getByRole('group', { name: 'Relay planner mode', exact: true }).getByRole('button', { name: preview ? 'Advanced' : 'Basic', exact: true })).toHaveAttribute('aria-pressed', 'true')
})

test('enforces preview analytics restrictions for outbound scripts and both remote and first-party beacons', async ({ page }) => {
  test.skip(!preview, 'Production has no preview-specific CSP restrictions.')
  const escapedRequests: string[] = []
  await page.route('https://preview-analytics.invalid/**', route => {
    escapedRequests.push(route.request().url())
    return route.fulfill({ contentType: 'application/javascript', body: 'window.previewAnalyticsLoaded = true' })
  })
  await page.route(/\/analytics-(probe|beacon)$/, route => {
    escapedRequests.push(route.request().url())
    return route.fulfill({ status: 204, body: '' })
  })
  await loadPlanner(page)
  const result = await page.evaluate(async () => {
    const violations: { directive: string; uri: string }[] = []
    document.addEventListener('securitypolicyviolation', event => violations.push({ directive: event.effectiveDirective, uri: event.blockedURI }))
    const remoteFetchBlocked = await fetch('https://preview-analytics.invalid/collect').then(() => false, () => true)
    const localFetchBlocked = await fetch(new URL('analytics-probe', location.href)).then(() => false, () => true)
    // sendBeacon's boolean describes queue acceptance, not network delivery.
    // Chromium may return true even when CSP subsequently rejects the beacon.
    navigator.sendBeacon(new URL('analytics-beacon', location.href), 'preview-test')
    const scriptBlocked = await new Promise<boolean>(resolve => {
      const script = document.createElement('script')
      script.src = 'https://preview-analytics.invalid/tracker.js'
      script.onload = () => resolve(false)
      script.onerror = () => resolve(true)
      document.head.append(script)
    })
    return { remoteFetchBlocked, localFetchBlocked, scriptBlocked, violations }
  })
  expect(result.remoteFetchBlocked).toBe(true)
  expect(result.localFetchBlocked).toBe(true)
  expect(result.scriptBlocked).toBe(true)
  expect(result.violations.some(event => event.directive === 'connect-src' && event.uri.endsWith('/analytics-beacon'))).toBe(true)
  expect(result.violations.some(event => event.directive.startsWith('script-src'))).toBe(true)
  expect(escapedRequests).toEqual([])
})
