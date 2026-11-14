import { expect, test, type Page } from '@playwright/test'

const node = (page: Page, id: string) => page.locator(`[data-node-id="${id}"]`)
const joolMoons = ['laythe', 'vall', 'tylo', 'bop', 'pol'] as const
let browserErrors: string[]

test.beforeEach(({ page }) => {
  browserErrors = []
  page.on('pageerror', error => browserErrors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()) })
})

test.afterEach(() => expect(browserErrors, 'Map interactions must not produce browser errors').toEqual([]))

async function pageFits(page: Page) {
  expect(await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight })))
    .toEqual(page.viewportSize())
}

for (const pack of ['Stock', 'OPM', 'RSS']) {
  test(`keeps ${pack} map nodes at a comfortable size on large and ultrawide monitors`, async ({ page }) => {
    await page.goto('./')
    await page.getByRole('button', { name: pack, exact: true }).click()
    for (const viewport of [
      { width: 2560, height: 1440 }, { width: 3440, height: 1440 },
      { width: 5120, height: 1440 }, { width: 5120, height: 2160 },
    ]) {
      await page.setViewportSize(viewport)
      const svg = page.locator('svg[data-map-presentation]')
      await expect.poll(() => node(page, pack === 'RSS' ? 'rss:mercury:orbit' : 'stock:laythe:orbit').locator('.state-circle').evaluate(circle => circle.getBoundingClientRect().width))
        .toBeLessThanOrEqual(60.1)
      await expect.poll(() => node(page, pack === 'RSS' ? 'rss:mercury:orbit' : 'stock:laythe:orbit').locator('.state-circle').evaluate(circle => circle.getBoundingClientRect().width))
        .toBeGreaterThanOrEqual(30)
      const result = await svg.evaluate(map => {
        const bounds = map.getBoundingClientRect()
        const frame = map.parentElement!.getBoundingClientRect()
        return {
          centerX: bounds.x + bounds.width / 2, frameCenterX: frame.x + frame.width / 2,
          centerY: bounds.y + bounds.height / 2, frameCenterY: frame.y + frame.height / 2,
          nodes: [...map.querySelectorAll('[data-node-id]')].map(point => {
            const rect = point.getBoundingClientRect()
            return { id: point.getAttribute('data-node-id'), x: rect.left, y: rect.top, right: rect.right, bottom: rect.bottom }
          }),
        }
      })
      expect(result.centerX).toBeCloseTo(result.frameCenterX, 0)
      expect(result.centerY).toBeCloseTo(result.frameCenterY, 0)
      for (const point of result.nodes) {
        expect(point.x, point.id!).toBeGreaterThanOrEqual(0)
        expect(point.y, point.id!).toBeGreaterThanOrEqual(0)
        expect(point.right, point.id!).toBeLessThanOrEqual(viewport.width)
        expect(point.bottom, point.id!).toBeLessThanOrEqual(viewport.height)
      }
      for (const name of ['Choose origin', 'Choose destination', 'Reset mission']) {
        await expect(page.getByRole('button', { name, exact: true })).toBeVisible()
      }
      await pageFits(page)
    }
  })
}

for (const viewport of [
  { width: 1280, height: 600 }, { width: 844, height: 390 },
  { width: 667, height: 375 }, { width: 3440, height: 1440 },
]) {
  test(`keeps all Jool moon hover rings and pointer targets apart at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('./')
    for (const moon of joolMoons) {
      const surface = node(page, `stock:${moon}:surface`)
      const orbit = node(page, `stock:${moon}:orbit`)
      const encounter = node(page, `stock:${moon}:encounter`)
      await page.keyboard.press('Tab')
      await surface.focus()
      await orbit.hover()
      await expect(surface.locator('.focus-ring')).toHaveCSS('opacity', '1')
      await expect(orbit.locator('.focus-ring')).toHaveCSS('opacity', '1')
      const geometry = await page.locator(`[data-node-id^="stock:${moon}:"]`).evaluateAll(points => points.map(point => {
        const circle = point.querySelector<SVGCircleElement>('.focus-ring')!
        const bounds = circle.getBoundingClientRect()
        const scale = Math.hypot(circle.getScreenCTM()!.a, circle.getScreenCTM()!.b)
        const hit = point.querySelector('rect')!.getBoundingClientRect()
        return {
          id: point.getAttribute('data-node-id')!,
          x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2,
          radius: bounds.width / 2 + Number(circle.getAttribute('stroke-width')) * scale / 2,
          hit: { left: hit.left, right: hit.right, top: hit.top, bottom: hit.bottom },
        }
      }))
      for (let index = 0; index < geometry.length; index++) {
        const first = geometry[index]!
        for (const second of geometry.slice(index + 1)) {
          expect(Math.hypot(second.x - first.x, second.y - first.y), `${first.id} and ${second.id} hover rings`)
            .toBeGreaterThan(first.radius + second.radius)
          const overlapX = Math.min(first.hit.right, second.hit.right) - Math.max(first.hit.left, second.hit.left)
          const overlapY = Math.min(first.hit.bottom, second.hit.bottom) - Math.max(first.hit.top, second.hit.top)
          expect(overlapX <= .1 || overlapY <= .1, `${first.id} and ${second.id} pointer targets must not overlap`).toBe(true)
        }
      }
      await surface.click()
      await orbit.click()
      const name = moon.charAt(0).toUpperCase() + moon.slice(1)
      await expect(page.getByRole('button', { name: 'Choose origin', exact: true })).toContainText(`${name} surface`)
      await expect(page.getByRole('button', { name: 'Choose destination', exact: true })).toContainText(`${name} low orbit`)
      await encounter.click()
      await expect(page.getByRole('button', { name: 'Choose destination', exact: true })).toContainText(`${name} encounter`)
      await page.getByRole('button', { name: 'Reset mission', exact: true }).click()
    }
    await pageFits(page)
  })
}
