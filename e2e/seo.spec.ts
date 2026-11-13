import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { expect, test, type Browser, type Page } from '@playwright/test'

const site = 'https://antoniotoni.github.io/ksp-deltav/'
const repository = 'https://github.com/AntonioToni/ksp-deltav'
const socialImage = `${site}social-preview.png`

function home(baseURL: string | undefined): string {
  if (!baseURL) throw new Error('SEO checks require the configured site base URL.')
  return new URL('./', baseURL).href
}

async function withoutScripts(browser: Browser, baseURL: string | undefined, width = 1280, height = 800) {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width, height } })
  const page = await context.newPage()
  await page.goto(home(baseURL))
  return { context, page }
}

const namedMeta = (page: Page, name: string) => page.locator(`head meta[name="${name}"]`)
const propertyMeta = (page: Page, property: string) => page.locator(`head meta[property="${property}"]`)

test('serves search and sharing metadata in the initial HTML without JavaScript', async ({ browser, request, baseURL }) => {
  const response = await request.get('./')
  await expect(response).toBeOK()
  const html = await response.text()
  expect(html).toMatch(/<meta\s[^>]*property=["']og:title["']/)
  expect(html).toMatch(/<script\s[^>]*type=["']application\/ld\+json["']/)

  const { context, page } = await withoutScripts(browser, baseURL)
  try {
    const title = await page.title()
    expect(title).toMatch(/KSP/i)
    expect(title).toMatch(/Delta[- ]?V/i)
    expect(title).toMatch(/map|calculator/i)
    expect(title).toMatch(/CommNet/i)
    expect(title.length).toBeLessThanOrEqual(65)

    await expect(namedMeta(page, 'description')).toHaveCount(1)
    const description = await namedMeta(page, 'description').getAttribute('content') ?? ''
    expect(description.length).toBeGreaterThanOrEqual(120)
    expect(description.length).toBeLessThanOrEqual(160)
    for (const keyword of ['KSP', 'CommNet', 'Stock', 'OPM', 'RSS', 'Kcalbeloh']) expect(description).toContain(keyword)

    const canonical = page.locator('head link[rel="canonical"]')
    await expect(canonical).toHaveCount(1)
    await expect(canonical).toHaveAttribute('href', site)
    await expect(propertyMeta(page, 'og:url')).toHaveAttribute('content', site)
    await expect(propertyMeta(page, 'og:type')).toHaveAttribute('content', 'website')
    await expect(propertyMeta(page, 'og:title')).toHaveAttribute('content', title)
    await expect(propertyMeta(page, 'og:description')).toHaveAttribute('content', description)
    await expect(propertyMeta(page, 'og:image')).toHaveAttribute('content', socialImage)
    await expect(propertyMeta(page, 'og:image:type')).toHaveAttribute('content', 'image/png')
    await expect(propertyMeta(page, 'og:image:width')).toHaveAttribute('content', '1280')
    await expect(propertyMeta(page, 'og:image:height')).toHaveAttribute('content', '640')
    const imageAlt = await propertyMeta(page, 'og:image:alt').getAttribute('content') ?? ''
    expect(imageAlt).toMatch(/KSP/i)
    expect(imageAlt.length).toBeGreaterThan(20)
    await expect(namedMeta(page, 'twitter:card')).toHaveAttribute('content', 'summary_large_image')
    await expect(namedMeta(page, 'twitter:title')).toHaveAttribute('content', title)
    await expect(namedMeta(page, 'twitter:description')).toHaveAttribute('content', description)
    await expect(namedMeta(page, 'twitter:image')).toHaveAttribute('content', socialImage)
    await expect(namedMeta(page, 'twitter:image:alt')).toHaveAttribute('content', imageAlt)
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  } finally { await context.close() }
})

test('publishes valid WebApplication data without fabricated search or review claims', async ({ page }) => {
  await page.goto('./')
  const json = page.locator('head script[type="application/ld+json"]')
  await expect(json).toHaveCount(1)
  const schema = JSON.parse(await json.textContent() ?? '') as Record<string, unknown>
  expect(schema['@context']).toBe('https://schema.org')
  expect(schema['@type']).toBe('WebApplication')
  expect(schema.name).toBe('KSP Delta-V Planner')
  expect(schema.url).toBe(site)
  expect(schema.image).toBe(socialImage)
  expect(schema.description).toBe(await namedMeta(page, 'description').getAttribute('content'))
  expect(schema.applicationCategory).toBe('UtilitiesApplication')
  expect(schema.operatingSystem).toBe('Any')
  expect(schema.inLanguage).toBe('en')
  expect(schema.isAccessibleForFree).toBe(true)
  expect(schema.browserRequirements).toMatch(/JavaScript/i)
  expect(schema.license).toMatch(/\/(LICENSE|mit\/?)$/i)
  expect([schema.sameAs].flat()).toContain(repository)
  expect(Array.isArray(schema.featureList)).toBe(true)
  const features = (schema.featureList as string[]).join(' ')
  expect(features).toMatch(/Delta[- ]?V/i)
  expect(features).toMatch(/CommNet|relay/i)
  expect(schema.aggregateRating).toBeUndefined()
  expect(schema.review).toBeUndefined()
  expect(JSON.stringify(schema)).not.toContain('SearchAction')
})

test('serves the current 1280 by 640 social banner from the actual deployment base', async ({ request }) => {
  const response = await request.get('social-preview.png')
  await expect(response).toBeOK()
  expect(response.headers()['content-type']).toContain('image/png')
  const bytes = await response.body()
  expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
  expect(bytes.readUInt32BE(16)).toBe(1280)
  expect(bytes.readUInt32BE(20)).toBe(640)
  expect(bytes.length).toBeLessThan(1_000_000)
  const source = await readFile('docs/assets/planner-preview.png')
  const hash = (data: Buffer) => createHash('sha256').update(data).digest('hex')
  expect(hash(bytes), 'The published image should follow the single README banner source').toBe(hash(source))
  const head = await request.head('social-preview.png')
  await expect(head).toBeOK()
  expect(head.headers()['content-type']).toContain('image/png')
})

test('lists only the canonical app URL in a crawlable sitemap', async ({ request }) => {
  const response = await request.get('sitemap.xml')
  await expect(response).toBeOK()
  expect(response.headers()['content-type']).toMatch(/xml/)
  const xml = await response.text()
  expect(xml).toContain('http://www.sitemaps.org/schemas/sitemap/0.9')
  const locations = [...xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/g)].map(match => match[1]!.trim())
  expect(locations).toEqual([site])
})

test('keeps a readable, linked fallback when page scripts cannot run', async ({ browser, baseURL }) => {
  const { context, page } = await withoutScripts(browser, baseURL, 320, 568)
  try {
    const fallback = page.locator('#root > main')
    await expect(fallback).toBeVisible()
    await expect(page.locator('h1')).toHaveCount(1)
    await expect(fallback.getByRole('heading', { level: 1 })).toHaveText('KSP DeltaV Planner')
    const text = await fallback.innerText()
    for (const keyword of ['Kerbal Space Program', 'Stock', 'OPM', 'RSS', 'Kcalbeloh', 'JavaScript']) expect(text).toContain(keyword)
    expect(text).toMatch(/relay/i)
    expect(text).toMatch(/signal/i)
    expect(text).toMatch(/estimat/i)
    const links = await fallback.getByRole('link').evaluateAll(elements => elements.map(element => (element as HTMLAnchorElement).href))
    for (const path of ['docs/DATA.md', 'docs/RELAYS.md', 'docs/VALIDATION.md']) {
      expect(links).toContain(`${repository}/blob/main/${path}`)
    }
    expect(links).toContain(repository)
    const layout = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
      overflowY: getComputedStyle(document.body).overflowY,
    }))
    expect(layout.width).toBeLessThanOrEqual(layout.viewport + 1)
    expect(layout.overflowY).not.toBe('hidden')
  } finally { await context.close() }
})

for (const viewport of [{ width: 320, height: 568 }, { width: 667, height: 375 }, { width: 1920, height: 1080 }]) {
  test(`replaces the fallback with the working no-scroll planner at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    const errors: string[] = []
    const socialRequests: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    page.on('request', request => {
      if (new URL(request.url()).pathname.endsWith('/social-preview.png')) socialRequests.push(request.url())
    })
    await page.goto('./')
    await expect(page.getByRole('button', { name: 'CommNet relay planner', exact: true })).toBeVisible()
    await expect(page.locator('#root > main')).toHaveCount(0)
    await expect(page.locator('h1')).toHaveCount(1)
    await expect(page.getByRole('heading', { name: 'KSP DeltaV Planner', exact: true })).toBeVisible()
    for (const id of ['stock:kerbin:surface', 'stock:mun:surface']) {
      const node = page.locator(`[data-node-id="${id}"]`)
      await node.focus()
      await node.press('Enter')
    }
    await expect(page.getByTestId('route-total')).toHaveText('5,120 m/s')
    await expect(page.locator('head link[rel="canonical"]')).toHaveAttribute('href', site)
    await page.waitForLoadState('networkidle')
    expect(socialRequests, 'Social metadata should not eagerly download its banner in the calculator').toEqual([])
    expect(errors).toEqual([])
    expect(await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, x: scrollX, y: scrollY })))
      .toEqual({ ...viewport, x: 0, y: 0 })
  })
}
