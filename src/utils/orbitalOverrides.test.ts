import { describe, expect, it } from 'vitest'
import type { OrbitalBody, OrbitalElements } from '../types/orbital'
import {
  applyOrbitalOverrides, orbitalDraftValue, validOrbitalDraft,
  type OrbitalOverrideDrafts,
} from './orbitalOverrides'

const sourceOrbit: OrbitalElements = {
  semiMajorAxisM: 10_000_000,
  eccentricity: Number('.12345678901234567'),
  inclinationDeg: Number('12.123456789012345'),
  longitudeAscendingNodeDeg: Number('45.123456789012345'),
  argumentOfPeriapsisDeg: 67.12345678901235,
  meanAnomalyAtEpochRad: 1.2345678901234567,
  epochS: -31_542_641.784,
  // A configured period is intentionally distinct from the ordinary GM
  // derivation, as it can be for a mod's binary-orbit period patch.
  periodS: 46_140.9776743941,
}

const sourceBodies: OrbitalBody[] = [
  { id: 'parent', name: 'Primary', parentBodyId: null, radiusM: 6_000_000, gravitationalParameter: 398_600_441_800_000 },
  { id: 'a', name: 'Alpha', parentBodyId: 'parent', radiusM: 100_000, orbit: sourceOrbit },
  { id: 'b', name: 'Beta', parentBodyId: 'parent', radiusM: 200_000, orbit: { ...sourceOrbit, semiMajorAxisM: 20_000_000 } },
]

describe('Signals orbital input presentation', () => {
  it('keeps source precision intact when an unrelated field is edited', () => {
    const original = structuredClone(sourceBodies)
    const result = applyOrbitalOverrides(sourceBodies, { a: { argumentOfPeriapsisDeg: '90' } })
    expect(result.errors).toEqual([])
    expect(result.bodies[1]!.orbit).toEqual({ ...sourceOrbit, argumentOfPeriapsisDeg: 90 })
    expect(result.bodies[2]).toBe(sourceBodies[2])
    expect(sourceBodies).toEqual(original)
  })

  it('converts mean anomaly degrees to radians exactly once', () => {
    const drafts = { a: { meanAnomalyAtEpochRad: '270.000' } }
    const result = applyOrbitalOverrides(sourceBodies, drafts)
    expect(result.errors).toEqual([])
    expect(result.bodies[1]!.orbit!.meanAnomalyAtEpochRad).toBe(1.5 * Math.PI)
    expect(orbitalDraftValue(result.bodies[1]!, 'meanAnomalyAtEpochRad', drafts)).toBe('270.000')
    expect(Number(orbitalDraftValue(result.bodies[1]!, 'meanAnomalyAtEpochRad', {}))).toBe(270)
    expect(sourceOrbit.meanAnomalyAtEpochRad).toBe(1.2345678901234567)
  })

  it('distinguishes known zero values from missing source elements', () => {
    const unknown: OrbitalBody = { id: 'new', parentBodyId: 'parent', radiusM: 100, orbit: { epochS: 0, eccentricity: 0 } }
    expect(orbitalDraftValue(unknown, 'epochS', {})).toBe('0')
    expect(orbitalDraftValue(unknown, 'eccentricity', {})).toBe('0')
    expect(orbitalDraftValue(unknown, 'meanAnomalyAtEpochRad', {})).toBe('')
  })

  it('restores the original source when override drafts are removed', () => {
    const original = structuredClone(sourceBodies)
    const result = applyOrbitalOverrides(sourceBodies, { a: { eccentricity: '.75', epochS: '123456.789' } })
    expect(result.errors).toEqual([])
    expect(result.bodies[1]!.orbit).toMatchObject({ eccentricity: .75, epochS: 123456.789 })
    expect(applyOrbitalOverrides(sourceBodies, {}).bodies).toEqual(original)
    expect(sourceBodies).toEqual(original)
  })
})

describe('orbital period overrides', () => {
  it('derives the new period from the effective parent GM after a semi-major-axis edit', () => {
    const drafts: OrbitalOverrideDrafts = { a: { semiMajorAxisM: '.04' } }
    const result = applyOrbitalOverrides(sourceBodies, drafts)
    expect(result.errors).toEqual([])
    expect(result.bodies[1]!.orbit!.semiMajorAxisM).toBe(40_000_000)
    // Independent scalar reference: 2π sqrt((4e7)^3 / 3.986004418e14).
    expect(result.bodies[1]!.orbit!.periodS).toBeCloseTo(79_616.11240392951, 8)
    expect(result.bodies[1]!.orbit!.periodS).not.toBe(sourceOrbit.periodS)
    expect(Number(orbitalDraftValue(result.bodies[1]!, 'periodS', drafts))).toBe(result.bodies[1]!.orbit!.periodS)
    expect(sourceOrbit.periodS).toBe(46_140.9776743941)
  })

  it('uses the current effective parent gravity rather than a stored source value', () => {
    const strongerParent = sourceBodies.map(body => body.id === 'parent'
      ? { ...body, gravitationalParameter: body.gravitationalParameter! * 4 } : body)
    const result = applyOrbitalOverrides(strongerParent, { a: { semiMajorAxisM: '.04' } })
    expect(result.errors).toEqual([])
    expect(result.bodies[1]!.orbit!.periodS).toBeCloseTo(39_808.05620196476, 8)
  })

  it('retains configured periods when the semi-major axis is unchanged', () => {
    const cases: readonly OrbitalOverrideDrafts[] = [{}, { a: { semiMajorAxisM: '0.0100' } }, { a: { inclinationDeg: '30' } }]
    for (const drafts of cases) {
      const result = applyOrbitalOverrides(sourceBodies, drafts)
      expect(result.errors).toEqual([])
      expect(result.bodies[1]!.orbit!.periodS).toBe(sourceOrbit.periodS)
    }
  })

  it('gives an explicit period override priority over automatic derivation', () => {
    const result = applyOrbitalOverrides(sourceBodies, { a: { semiMajorAxisM: '.04', periodS: '123456.789012345' } })
    expect(result.errors).toEqual([])
    expect(result.bodies[1]!.orbit!.periodS).toBe(123456.789012345)
  })

  it('does not replace an invalid explicit period with an automatic value', () => {
    const result = applyOrbitalOverrides(sourceBodies, { a: { semiMajorAxisM: '.04', periodS: '0' } })
    expect(result.errors).toEqual(['Alpha: enter a valid orbital period.'])
    expect(result.bodies[1]!.orbit!.periodS).toBe(0)
  })

  it('requires an explicit period when a changed axis has no verified parent gravity', () => {
    const unknownParent = sourceBodies.map(body => body.id === 'parent' ? { ...body, gravitationalParameter: undefined } : body)
    const result = applyOrbitalOverrides(unknownParent, { a: { semiMajorAxisM: '.04' } })
    expect(result.errors).toEqual(["Alpha: enter an orbital period; the parent's gravitational parameter is unavailable."])
    expect(Number.isNaN(result.bodies[1]!.orbit!.periodS)).toBe(true)
    expect(applyOrbitalOverrides(unknownParent, { a: { semiMajorAxisM: '.04', periodS: '100000' } }).errors).toEqual([])
  })
})

describe('orbital override validation', () => {
  it.each([
    ['semiMajorAxisM', '0', 'semi-major axis'],
    ['periodS', '0', 'orbital period'],
    ['eccentricity', '1', 'eccentricity'],
    ['eccentricity', '-0.01', 'eccentricity'],
    ['inclinationDeg', '180.01', 'inclination'],
    ['inclinationDeg', '-1', 'inclination'],
    ['epochS', '', 'reference epoch'],
    ['meanAnomalyAtEpochRad', 'Infinity', 'mean anomaly at epoch'],
    ['semiMajorAxisM', '1e308', 'semi-major axis'],
  ] as const)('rejects %s = %s with a body-specific error', (key, text, label) => {
    expect(validOrbitalDraft(key, text)).toBe(false)
    const result = applyOrbitalOverrides(sourceBodies, { a: { [key]: text } })
    expect(result.errors).toEqual([`Alpha: enter a valid ${label}.`])
  })

  it('keeps valid boundary values and negative epochs available', () => {
    for (const [key, text] of [
      ['eccentricity', '0'], ['inclinationDeg', '0'], ['inclinationDeg', '180'],
      ['epochS', '-31542641.784'], ['longitudeAscendingNodeDeg', '-90'],
    ] as const) expect(validOrbitalDraft(key, text)).toBe(true)
  })

  it('reports independent invalid fields against the correct bodies without mutating data', () => {
    const original = structuredClone(sourceBodies)
    const result = applyOrbitalOverrides(sourceBodies, { a: { eccentricity: '1' }, b: { inclinationDeg: '181' } })
    expect(result.errors).toEqual(['Alpha: enter a valid eccentricity.', 'Beta: enter a valid inclination.'])
    expect(sourceBodies).toEqual(original)
  })
})
