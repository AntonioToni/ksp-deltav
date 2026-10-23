import { expect, test } from '@playwright/test'

test('preserves mouse and touch selection while the compact mission budget changes', async ({ page, isMobile }) => {
  const browserErrors: string[] = []
  page.on('pageerror', error => browserErrors.push(error.message))
  await page.goto('./')

  const activate = async (kind: 'orbit' | 'surface') => {
    const node = page.locator(`[data-node-id="stock:kerbin:${kind}"]`)
    if (isMobile) await node.tap()
    else await node.click()
  }

  // Updating the mission budget must not move the pointer target between
  // pointerdown and activation, including after a reset and a second mission.
  for (let mission = 0; mission < 2; mission += 1) {
    await activate('orbit')
    await expect(page.getByRole('button', { name: 'Choose origin', exact: true })).toContainText('Kerbin low orbit')

    await activate('surface')
    await expect(page.getByRole('button', { name: 'Choose destination', exact: true })).toContainText('Kerbin surface')
    await expect(page.getByTestId('route-total')).toHaveText('3,400 m/s')

    if (mission === 0) await page.getByRole('button', { name: 'Reset mission', exact: true }).click()
  }

  expect(browserErrors).toEqual([])
})
