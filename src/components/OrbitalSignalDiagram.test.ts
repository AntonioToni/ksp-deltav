import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { OrbitalSignalInput, OrbitalSignalSample, OrbitalSignalSuccess, OrbitalSignalSweep } from '../types/orbital'
import OrbitalSignalDiagram from './OrbitalSignalDiagram'

const input: OrbitalSignalInput = {
  bodies: [
    { id: 'sun', parentBodyId: null, name: 'Sun', radiusM: 1 },
    { id: 'a', parentBodyId: 'sun', name: 'A', radiusM: .1 },
    { id: 'b', parentBodyId: 'sun', name: 'B', radiusM: .1 },
  ],
  bodyAId: 'a', bodyBId: 'b', geometry: 'actual', positionMode: 'phase',
  phaseDeg: 180, powerA: 1e9, powerB: 1e9, rangeMultiplier: 1,
  occlusionFactor: 1, dampingExponent: 6,
}

// A known ellipse with a = 10 and e = .5 has its focus at x = 0,
// periapsis x = 5, apoapsis x = -15, and geometric centre x = -5.
const current: OrbitalSignalSuccess = {
  status: 'success', geometryUsed: 'actual', positionMode: 'phase',
  phaseDeg: 180, utS: 43_200, distanceM: 25, maximumRangeM: 1e9,
  rangeStrength: .8, signalStrength: 0, dampedStrength: 0, dampedRangeStrength: .8 ** 6,
  linkStatus: 'blocked', pointA: { x: 5, y: 0, z: 0 }, pointB: { x: -20, y: 0, z: 0 },
  centerId: 'sun', bodyPositions: { sun: { x: 0, y: 0, z: 0 } },
  orbitPaths: [
    { bodyId: 'a', parentBodyId: 'sun', center: { x: 0, y: 0, z: 0 }, points: [
      { x: 5, y: 0, z: 0 }, { x: -5, y: Math.sqrt(75), z: 0 },
      { x: -15, y: 0, z: 0 }, { x: -5, y: -Math.sqrt(75), z: 0 }, { x: 5, y: 0, z: 0 },
    ] },
    { bodyId: 'b', parentBodyId: 'sun', center: { x: 0, y: 0, z: 0 }, points: [
      { x: 20, y: 0, z: 0 }, { x: 0, y: 20, z: 0 }, { x: -20, y: 0, z: 0 },
      { x: 0, y: -20, z: 0 }, { x: 20, y: 0, z: 0 },
    ] },
  ],
  occluded: true, minimumClearanceM: -1, blockingBodyIds: ['sun'], fallbackReasons: [], uncheckedBodyIds: [],
}

const samples: OrbitalSignalSample[] = [0, 90, 180, 270, 360].map(parameter => ({
  ...current, parameter, signalStrength: parameter === 180 ? 0 : .8,
  dampedStrength: parameter === 180 ? 0 : .8 ** 6,
  occluded: parameter === 180, linkStatus: parameter === 180 ? 'blocked' : 'available',
}))
const sweep: OrbitalSignalSweep = {
  status: 'success', current, samples, closest: samples[0]!, farthest: samples[2]!,
  interval: { start: 0, end: 360, kind: 'phase', label: 'Selected 0–360° sweep' },
  scopeLabel: 'Selected orbital sweep; A held at its reference position',
}

function render(overrides: { input?: OrbitalSignalInput; sweep?: OrbitalSignalSweep; kerbalism?: boolean } = {}) {
  return renderToStaticMarkup(createElement(OrbitalSignalDiagram, {
    input: overrides.input ?? input, sweep: overrides.sweep ?? sweep,
    nameA: 'A', nameB: 'B', colorA: '#73c8fa', colorB: '#e7bd7b', kerbalism: overrides.kerbalism,
    formatTime: value => `UT label ${value}`,
  }))
}

function tag(markup: string, element: string, attribute: string, value: string): string {
  const found = markup.match(new RegExp(`<${element}\\b[^>]*${attribute}="${value}"[^>]*>`))?.[0]
  if (!found) throw new Error(`Missing ${element} ${attribute}=${value}`)
  return found
}

function attribute(markup: string, name: string): string {
  const value = markup.match(new RegExp(`${name}="([^"]*)"`))?.[1]
  if (value === undefined) throw new Error(`Missing ${name}`)
  return value
}

function coordinates(path: string) {
  return [...attribute(path, 'd').matchAll(/[ML]\s+([\d.e+-]+)\s+([\d.e+-]+)/gi)]
    .map(match => ({ x: Number(match[1]), y: Number(match[2]) }))
}

describe('OrbitalSignalDiagram geometry and signal presentation', () => {
  it('draws the parent at the physical ellipse focus rather than its geometric centre', () => {
    const markup = render()
    const focus = markup.match(/<g\b[^>]*data-signal-focus-body="sun"[^>]*>([\s\S]*?)<\/g>/)?.[1]
    if (!focus) throw new Error('Missing parent focus')
    const focusX = Number(attribute(focus, 'cx'))
    const points = coordinates(tag(markup, 'path', 'data-signal-orbit-body', 'a'))
    const periapsisX = points[0]!.x
    const apoapsisX = points[2]!.x
    expect(focusX - apoapsisX).toBeCloseTo(3 * (periapsisX - focusX), 10)
    expect(focusX).not.toBeCloseTo((periapsisX + apoapsisX) / 2, 5)
    expect(markup).toContain('data-orbit-focus-x-m="0"')
    expect(markup).toContain('data-position-z-m="0"')
    expect(markup).toContain('3D geometry projected into 2D')
  })

  it('keeps only blocked raw and optional efficiency curves, with the selected marker at their blocked value', () => {
    const stock = render()
    expect(stock.match(/data-signal-curve=/g)).toHaveLength(1)
    expect(stock).not.toContain('data-signal-current-transmission-efficiency')
    const markup = render({ kerbalism: true })
    expect(markup.match(/data-signal-curve=/g)).toHaveLength(2)
    expect(markup).not.toContain('range-only')
    const raw = coordinates(tag(markup, 'path', 'data-signal-curve', 'with-occlusion'))
    const efficiency = coordinates(tag(markup, 'path', 'data-signal-curve', 'transmission-efficiency'))
    const rawMarker = tag(markup, 'circle', 'data-signal-current-strength', '0')
    const efficiencyMarker = tag(markup, 'circle', 'data-signal-current-transmission-efficiency', '0')
    expect(Number(attribute(rawMarker, 'cy'))).toBe(raw[2]!.y)
    expect(Number(attribute(efficiencyMarker, 'cy'))).toBe(efficiency[2]!.y)
    expect(Number(attribute(rawMarker, 'cy'))).toBeGreaterThan(raw[0]!.y)
    expect(markup).toContain('data-signal-occlusion-band="true"')
    expect(markup).toContain('data-signal-blocking-bodies="sun"')
  })

  it('labels date windows and marks universal time instead of a phase value', () => {
    const dated = { ...current, positionMode: 'date' as const }
    const datedSweep: OrbitalSignalSweep = {
      ...sweep, current: dated,
      interval: { start: 21_600, end: 108_000, kind: 'synodic', label: 'One synodic period' },
      samples: samples.map((sample, index) => ({ ...sample, positionMode: 'date', parameter: 21_600 * (index + 1) })),
    }
    const markup = render({ input: { ...input, positionMode: 'date', utS: 43_200 }, sweep: datedSweep })
    expect(markup).toContain('data-signal-time-marker="43200"')
    expect(markup).not.toContain('data-signal-phase-marker=')
    expect(markup).toContain('data-signal-interval-start="21600"')
    expect(markup).toContain('data-signal-interval-end="108000"')
    expect(markup).toContain('One synodic period')
    expect(markup).toContain('UT label 21600 – UT label 108000')
    expect(markup).toContain('>4d</text>')
  })

  it('does not render unsupported geometry or blockage charts for a manual distance', () => {
    const manual: OrbitalSignalSweep = { ...sweep, current: {
      ...current, geometryUsed: 'manual-distance', pointA: null, pointB: null, orbitPaths: [], bodyPositions: {},
      occluded: false, minimumClearanceM: null, blockingBodyIds: [],
    } }
    expect(render({ input: { ...input, geometry: 'manual-distance', distanceM: 25 }, sweep: manual })).toBe('')
  })

  it('separates a parent label from a nearby moon endpoint label at a common orbital scale', () => {
    const parent = { id: 'planet', name: 'Duna', parentBodyId: 'sun', radiusM: .1 }
    const moonSweep: OrbitalSignalSweep = { ...sweep, current: { ...current, orbitPaths: current.orbitPaths.map(track =>
      track.bodyId === 'b' ? { ...track, parentBodyId: 'planet', center: current.pointB! } : track) } }
    const markup = render({ input: { ...input, bodies: [...input.bodies, parent] }, sweep: moonSweep })
    const parentLabel = markup.match(/<text\b[^>]*>Duna<\/text>/)?.[0]
    const moonLabel = markup.match(/<text\b[^>]*>B · B<\/text>/)?.[0]
    expect(parentLabel).toBeDefined()
    expect(moonLabel).toBeDefined()
    expect(Number(attribute(parentLabel!, 'y'))).toBeLessThan(Number(attribute(moonLabel!, 'y')) - 13)
  })
})
