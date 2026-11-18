import type { Page } from '@playwright/test'

/** Preserve the established circular numerical fixtures now that Actual is the
 * normal UI default. This is an explicit UI choice, not a hidden test override.
 * Manual configurations and an already-selected circular reference stay intact.
 */
export async function selectCircularSignalReference(page: Page) {
  const dialog = page.getByRole('dialog', { name: 'CommNet relay planner', exact: true })
  const signals = dialog.getByTestId('interplanetary-planner')
  if (await signals.getAttribute('data-signal-geometry') !== 'actual') return
  const modes = dialog.getByRole('group', { name: 'Relay planner mode', exact: true })
  const basic = modes.getByRole('button', { name: 'Basic', exact: true })
  const wasBasic = await basic.getAttribute('aria-pressed') === 'true'
  if (wasBasic) await modes.getByRole('button', { name: 'Advanced', exact: true }).click()
  await dialog.getByRole('combobox', { name: 'Signal geometry', exact: true }).click()
  const circular = page.getByRole('option', { name: 'Circular reference orbits', exact: true })
  if (await circular.isEnabled()) await circular.click()
  else await page.keyboard.press('Escape')
  if (wasBasic) await basic.click()
}
