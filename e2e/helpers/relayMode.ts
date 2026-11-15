import type { Page } from '@playwright/test'

/** Existing technical regressions exercise the complete planner surface. */
export async function preferAdvancedRelayMode(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('ksp-deltav:relay-planner-mode', 'advanced')
  })
}
