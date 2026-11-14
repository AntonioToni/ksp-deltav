import { expect, type Page } from '@playwright/test'

export const landingMethods = {
  atmospheric: 'Atmospheric landing (0 m/s)',
  custom: 'Custom powered landing',
  reference: 'Use reference map budget',
} as const

export const atmosphereDialog = (page: Page) => page.getByRole('dialog', { name: 'Landing & Capture', exact: true })
export const atmosphereButton = (page: Page) => page.getByRole('button', { name: 'Landing & Capture', exact: true })
export const landingInput = (page: Page, body: string) => atmosphereDialog(page).getByRole('spinbutton', { name: `Landing Delta-V at ${body}`, exact: true })
export const landingMethod = (page: Page, method: keyof typeof landingMethods) => atmosphereDialog(page).getByRole('radio', { name: landingMethods[method], exact: true })

export async function chooseAtmosphericBody(page: Page, body: string) {
  const picker = atmosphereDialog(page).getByRole('combobox', { name: 'Atmospheric body', exact: true })
  await picker.click()
  await page.getByRole('option', { name: body, exact: true }).click()
}

export async function openAtmosphere(page: Page, body?: string) {
  await atmosphereButton(page).click()
  await expect(atmosphereDialog(page)).toBeVisible()
  if (body) await chooseAtmosphericBody(page, body)
}

export async function chooseLandingMethod(page: Page, body: string, method: keyof typeof landingMethods) {
  await chooseAtmosphericBody(page, body)
  await landingMethod(page, method).check()
}

export async function setCustomLanding(page: Page, body: string, value: string) {
  await chooseLandingMethod(page, body, 'custom')
  await landingInput(page, body).fill(value)
}

export async function revealCapture(page: Page, body: string) {
  await chooseAtmosphericBody(page, body)
  const section = atmosphereDialog(page).getByRole('button', { name: 'Orbital capture', exact: true })
  if (await section.getAttribute('aria-expanded') !== 'true') await section.click()
  return atmosphereDialog(page).getByRole('checkbox', { name: `Ideal capture at ${body}`, exact: true })
}

export async function setIdealCapture(page: Page, body: string, enabled = true) {
  await (await revealCapture(page, body)).setChecked(enabled)
}
