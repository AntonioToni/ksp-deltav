import type { Page } from '@playwright/test'

const labels = {
  'one-way': 'One way',
  'round-trip': 'Round trip',
  'return-only': 'Return only',
} as const

export const missionMode = (page: Page) => page.getByRole('group', { name: 'Mission mode', exact: true })
export const missionModeButton = (page: Page, mode: keyof typeof labels) =>
  missionMode(page).getByRole('button', { name: labels[mode], exact: true })
