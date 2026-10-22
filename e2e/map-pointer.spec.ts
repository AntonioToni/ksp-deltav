import { expect, test } from '@playwright/test'

test('preserves mouse and touch selection while outgoing maneuver costs change', async ({ page, isMobile }) => {
  const browserErrors: string[] = []
  page.on('pageerror', error => browserErrors.push(error.message))
  await page.goto('/')

  const activate = async (kind: 'orbit' | 'surface') => {
    const node = page.locator(`[data-node-id="stock:kerbin:${kind}"]`)
    if (isMobile) await node.tap()
    else await node.click()
  }

  // Orbit has several outgoing maneuvers; surface has one. Changing the
  // inspector must not move the pointer target before its activation completes.
  for (let mission = 0; mission < 2; mission += 1) {
    await activate('orbit')
    await expect(page.getByRole('button', { name: 'Choose origin', exact: true })).toContainText('Kerbin low orbit')
    await expect(page.getByRole('region', { name: 'Outgoing maneuver costs', exact: true })).toContainText('Kerbin low orbit — outgoing maneuvers')

    await activate('surface')
    await expect(page.getByRole('button', { name: 'Choose destination', exact: true })).toContainText('Kerbin surface')
    await expect(page.getByTestId('route-total')).toHaveText('3,400 m/s')
    await expect(page.getByRole('region', { name: 'Outgoing maneuver costs', exact: true })).toContainText('Kerbin surface — outgoing maneuvers')

    if (mission === 0) await page.getByRole('button', { name: 'Reset mission', exact: true }).click()
  }

  expect(browserErrors).toEqual([])
})
