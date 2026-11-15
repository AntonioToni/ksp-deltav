import { expect, test, type Locator, type Page } from '@playwright/test'
import { findRelayBodyPreset } from '../src/data/commnet'
import { stockPack } from '../src/data/stock'
import { calculateRelayPlan, type RelayNetworkInput, type SuccessfulRelayPlan } from '../src/utils/relay'

const planner = (page: Page) => page.getByRole('dialog', { name: 'CommNet relay planner', exact: true })
const field = (page: Page, name: string) => planner(page).getByRole('spinbutton', { name, exact: true })
const combo = (page: Page, name: string) => planner(page).getByRole('combobox', { name, exact: true })
const metric = (page: Page, id: string) => planner(page).getByTestId(id)
const deployment = (page: Page) => metric(page, 'deployment-diagram')
const button = (page: Page, name: string) => planner(page).getByRole('button', { name, exact: true })
let errors: string[]

test.beforeEach(async ({ page }) => {
  errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.goto('./')
  await page.getByRole('button', { name: 'CommNet relay planner', exact: true }).click()
  await expect(planner(page)).toBeVisible()
})

test.afterEach(() => expect(errors, 'Relay refinements must not produce browser errors').toEqual([]))

async function section(page: Page, name: 'Network' | 'Deployment' | 'Body data' | 'Signals') {
  await planner(page).getByRole('tab', { name, exact: true }).click()
}

async function choose(page: Page, name: string, option: string) {
  await combo(page, name).click()
  await page.getByRole('option', { name: option, exact: true }).click()
}

function inputFor(bodyId = 'stock:kerbin', altitudeKm = 800, mode: 'lower' | 'higher' = 'lower', marginKm = 10): RelayNetworkInput {
  const body = stockPack.bodies.find(candidate => candidate.id === bodyId)!
  const preset = findRelayBodyPreset(body)!
  return {
    body: {
      radiusM: preset.radiusM,
      gravitationalParameter: preset.gravitationalParameter,
      atmosphereHeightM: preset.atmosphereHeightM,
      ...(preset.sphereOfInfluenceM === undefined ? {} : { sphereOfInfluenceM: preset.sphereOfInfluenceM }),
    },
    hasSurface: body.hasSurface,
    satelliteCount: 3,
    altitudeM: altitudeKm * 1000,
    relayPower: 5e6,
    clientPower: 5e5,
    dsnPower: 250e9,
    rangeMultiplier: 1,
    occlusionFactor: 1,
    phaseDeg: 0,
    stationLongitudeDeg: 0,
    safetyMarginM: marginKm * 1000,
    deploymentMode: mode,
  }
}

function expected(input: RelayNetworkInput): SuccessfulRelayPlan {
  const result = calculateRelayPlan(input)
  if (result.status !== 'success') throw Error(result.errors.join('; '))
  return result
}

async function geometry(diagram: Locator) {
  return diagram.evaluate(svg => {
    const element = (selector: string) => {
      const node = svg.querySelector(selector)
      if (!node) throw Error(`Missing deployment geometry: ${selector}`)
      return node
    }
    const number = (node: Element, name: string) => {
      const value = node.getAttribute(name)
      if (value === null) throw Error(`Missing ${name} on deployment geometry`)
      return Number(value)
    }
    const circle = (selector: string) => {
      const node = element(selector)
      return { x: number(node, 'cx'), y: number(node, 'cy'), r: number(node, 'r') }
    }
    const carrier = element('[data-deployment-orbit="carrier"]')
    return {
      target: circle('[data-deployment-orbit="target"]'),
      body: circle('[data-deployment-body-radius]'),
      carrier: { x: number(carrier, 'cx'), y: number(carrier, 'cy'), a: number(carrier, 'rx'), b: number(carrier, 'ry') },
      periapsis: circle('[data-deployment-apsis="periapsis"]'),
      apoapsis: circle('[data-deployment-apsis="apoapsis"]'),
      release: circle('[data-deployment-point="release"]'),
    }
  })
}

async function expectGeometry(diagram: Locator, input: RelayNetworkInput) {
  const plan = expected(input)
  await expect(diagram).toHaveAttribute('data-deployment-mode', input.deploymentMode)
  await expect(diagram).toHaveAttribute('data-deployment-status', plan.deployment.status)
  const drawn = await geometry(diagram)
  const scale = drawn.target.r / plan.orbitRadiusM
  const periapsis = input.body.radiusM + plan.deployment.periapsisAltitudeM
  const apoapsis = input.body.radiusM + plan.deployment.apoapsisAltitudeM
  expect(drawn.body.x).toBeCloseTo(drawn.target.x, 6)
  expect(drawn.body.y).toBeCloseTo(drawn.target.y, 6)
  expect(drawn.body.r).toBeCloseTo(input.body.radiusM * scale, 6)
  expect(drawn.carrier.a).toBeCloseTo(plan.deployment.semiMajorAxisM * scale, 6)
  expect(drawn.carrier.b).toBeCloseTo(Math.sqrt(periapsis * apoapsis) * scale, 6)
  expect(drawn.carrier.y).toBeCloseTo(drawn.body.y, 6)
  // The selected body is one focus, rather than the center, of the ellipse.
  expect(Math.abs(drawn.carrier.x - drawn.body.x)).toBeCloseTo(Math.sqrt(drawn.carrier.a ** 2 - drawn.carrier.b ** 2), 6)
  expect(drawn.carrier.x + drawn.carrier.a).toBeCloseTo(drawn.target.x + drawn.target.r, 6)
  expect(drawn.release.x).toBeCloseTo(drawn.target.x + drawn.target.r, 6)
  expect(drawn.release.y).toBeCloseTo(drawn.target.y, 6)
  expect(drawn.periapsis.x - drawn.body.x).toBeCloseTo((input.deploymentMode === 'lower' ? -periapsis : periapsis) * scale, 6)
  expect(drawn.apoapsis.x - drawn.body.x).toBeCloseTo((input.deploymentMode === 'lower' ? apoapsis : -apoapsis) * scale, 6)
  await expect(diagram.locator('[data-deployment-apsis="periapsis"]')).toHaveAttribute('data-altitude-m', String(plan.deployment.periapsisAltitudeM))
  await expect(diagram.locator('[data-deployment-apsis="apoapsis"]')).toHaveAttribute('data-altitude-m', String(plan.deployment.apoapsisAltitudeM))
  return drawn
}

test('draws calculated lower and higher carrier ellipses with a fixed target orbit and shared apsis', async ({ page }) => {
  await expect(planner(page).getByRole('img', { name: 'Kerbin equatorial relay diagram', exact: true })).toBeVisible()
  await section(page, 'Deployment')
  await expect(planner(page).getByRole('img', { name: 'Kerbin equatorial relay diagram', exact: true })).toHaveCount(0)
  const lower = await expectGeometry(deployment(page), inputFor())
  await expect(metric(page, 'relay-periapsis')).toHaveText('136.8 km')
  await expect(metric(page, 'relay-apoapsis')).toHaveText('800 km')
  await expect(metric(page, 'relay-release-interval')).toHaveText('1h 1m 32s')
  expect(lower.carrier.x).toBeGreaterThan(lower.body.x)
  await button(page, 'Higher carrier').click()
  const higher = await expectGeometry(deployment(page), inputFor('stock:kerbin', 800, 'higher'))
  expect(higher.target).toEqual(lower.target)
  expect(higher.carrier.x).toBeLessThan(higher.body.x)
  expect(higher.carrier.a).toBeGreaterThan(lower.carrier.a)
  await expect(metric(page, 'relay-apoapsis')).toHaveText('1,392 km')
  await expect(metric(page, 'relay-circularization')).toHaveText('133 m/s')
})

test('uses the selected body and retains the Network constellation and carrier mode across tabs', async ({ page }) => {
  await choose(page, 'Relay body', 'Duna')
  const altitudeKm = Number(await field(page, 'Orbit altitude').inputValue())
  await expect(metric(page, 'relay-coverage')).toHaveText('100%')
  await section(page, 'Deployment')
  await expect(deployment(page)).toHaveAccessibleName(/Duna/)
  await expectGeometry(deployment(page), inputFor('stock:duna', altitudeKm))
  await button(page, 'Higher carrier').click()
  await section(page, 'Network')
  await expect(planner(page).getByRole('img', { name: 'Duna equatorial relay diagram', exact: true })).toBeVisible()
  await expect(planner(page).locator('[data-relay-satellite]')).toHaveCount(3)
  await expect(deployment(page)).toHaveCount(0)
  await section(page, 'Deployment')
  await expect(button(page, 'Higher carrier')).toHaveAttribute('aria-pressed', 'true')
  await expectGeometry(deployment(page), inputFor('stock:duna', altitudeKm, 'higher'))
})

test('keeps surface, atmosphere, and clearance violations visible in the calculated deployment geometry', async ({ page }) => {
  await section(page, 'Deployment')
  for (const scenario of [{ altitude: 400, margin: 10 }, { altitude: 600, margin: 10 }, { altitude: 800, margin: 100 }]) {
    await field(page, 'Orbit altitude').fill(String(scenario.altitude))
    await field(page, 'Clearance margin').fill(String(scenario.margin))
    await expectGeometry(deployment(page), inputFor('stock:kerbin', scenario.altitude, 'lower', scenario.margin))
    await expect(deployment(page)).toHaveAttribute('data-deployment-status', 'blocked')
    await expect(metric(page, 'relay-deployment-status')).toHaveText('Deployment blocked')
  }
})

test('shows sphere-of-influence failures, unchecked limits, and a marginal clearance without changing the orbit', async ({ page }) => {
  await section(page, 'Deployment')
  await field(page, 'Orbit altitude').fill('800')
  await button(page, 'Higher carrier').click()
  await section(page, 'Body data')
  await field(page, 'Sphere of influence').fill('1700')
  await section(page, 'Deployment')
  await expect(deployment(page)).toHaveAttribute('data-deployment-status', 'blocked')
  await expect(metric(page, 'relay-deployment-status')).toHaveText('Deployment blocked')
  const blocked = await geometry(deployment(page))
  await section(page, 'Body data')
  await field(page, 'Sphere of influence').fill('')
  await section(page, 'Deployment')
  await expect(deployment(page)).toHaveAttribute('data-deployment-status', 'unchecked')
  await expect(metric(page, 'relay-deployment-status')).toHaveText('Outer orbit limit not checked')
  const unchecked = await geometry(deployment(page))
  expect(unchecked.target).toEqual(blocked.target)
  expect(unchecked.carrier).toEqual(blocked.carrier)
  await button(page, 'Lower carrier').click()
  const input = inputFor()
  const marginKm = (expected(input).deployment.periapsisAltitudeM - input.body.atmosphereHeightM) / 1000
  await field(page, 'Clearance margin').fill(String(marginKm))
  await expect(deployment(page)).toHaveAttribute('data-deployment-status', 'marginal')
  await expect(metric(page, 'relay-deployment-status')).toHaveText('Orbit at a limit')
})

test('keeps full-precision body inputs while making their display and sources readable', async ({ page }) => {
  await section(page, 'Body data')
  const mu = '3531600000000.125'
  const soi = '84159.28647963052'
  await field(page, 'Gravitational parameter').fill(mu)
  await field(page, 'Sphere of influence').fill(soi)
  await expect(metric(page, 'relay-gravity-display')).toBeVisible()
  await expect(metric(page, 'relay-soi-display')).toBeVisible()
  await expect(metric(page, 'relay-gravity-display')).not.toHaveText(mu)
  await expect(metric(page, 'relay-soi-display')).not.toHaveText(soi)
  const sources = planner(page).locator('details').filter({ has: page.locator('summary', { hasText: 'Body data and radio sources' }) })
  await expect(sources).not.toHaveAttribute('open', '')
  await sources.locator('summary').click()
  await expect(sources.getByRole('link').first()).toBeVisible()
  await section(page, 'Deployment')
  await button(page, 'Higher carrier').click()
  await section(page, 'Signals')
  await section(page, 'Network')
  await section(page, 'Body data')
  await expect(field(page, 'Gravitational parameter')).toHaveValue(mu)
  await expect(field(page, 'Sphere of influence')).toHaveValue(soi)
  await section(page, 'Deployment')
  await expect(button(page, 'Higher carrier')).toHaveAttribute('aria-pressed', 'true')
})

test('names selected planet positions and the actual sender and receiver without changing signal results', async ({ page }) => {
  await section(page, 'Signals')
  await expect(planner(page).getByRole('slider', { name: 'Planet positions', exact: true })).toHaveAttribute('aria-valuenow', '90')
  await expect(metric(page, 'signal-distance')).toHaveText('24.79 Gm')
  await expect(metric(page, 'signal-strength')).toHaveText('84.61%')
  await expect(planner(page).getByText('Separation at selected positions', { exact: true })).toBeVisible()
  await expect(planner(page).getByText('Estimated signal', { exact: true })).toBeVisible()
  await expect(metric(page, 'signals-strength-chart').locator('[data-signal-curve]')).toHaveCount(2)
  await expect(planner(page).getByText('CommNet · without blocking', { exact: true })).toBeVisible()
  await expect(planner(page).getByText('CommNet · with blocking', { exact: true })).toBeVisible()
  await choose(page, 'Radio setup', 'Kerbalism + CommNet')
  await expect(metric(page, 'signal-raw-strength')).toHaveText('84.61%')
  await expect(metric(page, 'signal-strength')).toHaveText('36.63%')
  await expect(metric(page, 'signals-strength-chart').locator('[data-signal-curve]')).toHaveCount(3)
  for (const label of ['Raw CommNet · with blocking', 'Kerbalism-adjusted · without blocking', 'Kerbalism-adjusted · with blocking']) {
    await expect(planner(page).getByText(label, { exact: true })).toBeVisible()
  }
  await choose(page, 'Radio setup', 'Stock CommNet')
  await expect(metric(page, 'signal-strength')).toHaveText('84.61%')
  await expect(planner(page).getByText('Kerbalism-adjusted · with blocking', { exact: true })).toHaveCount(0)
  await choose(page, 'Antenna A', 'DSN level 3')
  await expect(combo(page, 'Signal receiver')).toHaveText('A · Kerbin')
  await expect(metric(page, 'signal-direction')).toHaveText('Duna spacecraft → Kerbin ground station')
  await expect(metric(page, 'signal-strength')).toHaveText('93.4%')
  await section(page, 'Deployment')
  await section(page, 'Signals')
  await expect(combo(page, 'Signal receiver')).toHaveText('A · Kerbin')
  await expect(metric(page, 'signal-direction')).toHaveText('Duna spacecraft → Kerbin ground station')
  await expect(planner(page).getByRole('slider', { name: 'Planet positions', exact: true })).toHaveAttribute('aria-valuenow', '90')
})

for (const viewport of [{ width: 320, height: 568 }, { width: 667, height: 375 }, { width: 1280, height: 900 }, { width: 3440, height: 1440 }]) {
  test(`keeps all four tabs and dedicated diagrams inside the scrollable dialog at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    const content = planner(page).locator('.MuiDialogContent-root')
    for (const name of ['Network', 'Deployment', 'Body data', 'Signals'] as const) {
      await section(page, name)
      const close = button(page, 'Close')
      await expect(close).toBeInViewport({ ratio: 1 })
      expect(await content.evaluate(element => element.scrollWidth)).toBeLessThanOrEqual(await content.evaluate(element => element.clientWidth + 1))
      const visual = name === 'Deployment' ? deployment(page)
        : name === 'Network' ? planner(page).getByRole('img', { name: 'Kerbin equatorial relay diagram', exact: true })
          : name === 'Signals' ? metric(page, 'signals-orbit-diagram') : null
      if (visual) {
        await visual.scrollIntoViewIfNeeded()
        await expect(visual).toBeInViewport({ ratio: 1 })
        const bounds = await visual.boundingBox()
        const actions = await planner(page).locator('.MuiDialogActions-root').boundingBox()
        expect(bounds).not.toBeNull()
        expect(actions).not.toBeNull()
        if (bounds && actions) expect(bounds.y + bounds.height).toBeLessThanOrEqual(actions.y + 1)
      }
      expect(await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight }))).toEqual(viewport)
    }
  })
}
