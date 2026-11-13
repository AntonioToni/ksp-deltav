import { expect, test } from '@playwright/test'

for (const viewport of [
  { width: 320, height: 568 },
  { width: 667, height: 375 },
  { width: 1920, height: 1080 },
]) {
  test(`keeps the GitHub link and planner controls usable at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('./')

    const header = page.getByRole('banner')
    const title = header.getByRole('heading', { name: 'KSP DeltaV Planner', exact: true })
    const github = header.getByRole('link', { name: 'GitHub project (opens in a new tab)', exact: true })
    await expect(title).toBeVisible()
    await expect(github).toHaveAttribute('href', 'https://github.com/AntonioToni/ksp-deltav')
    await expect(github).toHaveAttribute('target', '_blank')
    expect(await github.evaluate(element => ({ tag: element.tagName, rel: (element as HTMLAnchorElement).rel.split(/\s+/).sort() }))).toEqual({
      tag: 'A', rel: ['noopener', 'noreferrer'],
    })
    if (viewport.width < 600) await expect(github.getByText('GitHub', { exact: true })).toBeHidden()
    else await expect(github.getByText('GitHub', { exact: true })).toBeVisible()
    await github.focus()
    await expect(github).toBeFocused()

    const controls = [
      github,
      header.getByRole('button', { name: 'Atmospheric assistance', exact: true }),
      header.getByRole('button', { name: 'CommNet relay planner', exact: true }),
      header.getByRole('button', { name: 'Model assumptions and data sources', exact: true }),
    ]
    for (const control of controls) {
      const bounds = await control.boundingBox()
      expect(bounds).not.toBeNull()
      if (!bounds) throw new Error('A header control is missing')
      expect(bounds.x).toBeGreaterThanOrEqual(0)
      expect(bounds.y).toBeGreaterThanOrEqual(0)
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width)
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height)
    }

    for (const body of ['kerbin', 'mun']) {
      const node = page.locator(`[data-node-id="stock:${body}:surface"]`)
      await node.focus()
      await node.press('Enter')
    }
    await expect(page.getByTestId('route-total')).toHaveText('5,120 m/s')

    for (const { button, dialogName, closeName } of [
      { button: 'Atmospheric assistance', dialogName: 'Atmospheric assistance', closeName: 'Cancel' },
      { button: 'CommNet relay planner', dialogName: 'CommNet relay planner', closeName: 'Close relay planner' },
      { button: 'Model assumptions and data sources', dialogName: 'About these estimates', closeName: 'Close' },
    ]) {
      await header.getByRole('button', { name: button, exact: true }).click()
      const dialog = page.getByRole('dialog', { name: dialogName, exact: true })
      await expect(dialog).toBeVisible()
      await dialog.getByRole('button', { name: closeName, exact: true }).click()
      await expect(dialog).toBeHidden()
      await expect(page.getByTestId('route-total')).toHaveText('5,120 m/s')
    }

    const dimensions = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
    }))
    expect(dimensions).toEqual({ width: viewport.width, height: viewport.height, scrollX: 0, scrollY: 0 })
    await expect(github).toBeVisible()
  })
}
