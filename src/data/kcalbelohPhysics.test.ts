import { describe, expect, it } from 'vitest'
import { calculateRelayPlan, type RelayNetworkInput } from '../utils/relay'
import { suggestRelayAltitudeKm } from '../utils/relayDefaults'
import { opmKcalbelohPack, stockKcalbelohPack } from './kcalbeloh'
import { kcalbelohBodies, kcalbelohBodyFacts } from './kcalbelohReference'
import {
  kcalbelohGravityConstants, kcalbelohGravitySource,
  kcalbelohPhysicalReferences, kcalbelohSoiConstants, kcalbelohSoiSource,
} from './kcalbelohPhysics'

function reference(name: string) {
  const row = kcalbelohPhysicalReferences.find(candidate => candidate.bodyId === `kcalbeloh:${name}`)
  if (!row) throw new Error(`Missing physical reference for ${name}`)
  return row
}

function relayInput(name: string, altitudeM?: number): RelayNetworkInput {
  const row = reference(name)
  const body = kcalbelohBodies.find(body => body.id === row.bodyId)!
  return {
    body: {
      radiusM: row.radiusM,
      gravitationalParameter: row.gravitationalParameter,
      atmosphereHeightM: row.atmosphereHeightM,
      sphereOfInfluenceM: row.sphereOfInfluenceM,
    },
    hasSurface: body.hasSurface,
    satelliteCount: 3,
    altitudeM: altitudeM ?? Number(suggestRelayAltitudeKm(row.radiusM / 1000, row.atmosphereHeightM / 1000, 10, row.sphereOfInfluenceM / 1000)) * 1000,
    relayPower: 5_000_000,
    clientPower: 500_000,
    dsnPower: 250_000_000_000,
    rangeMultiplier: 1,
    occlusionFactor: 1,
    phaseDeg: 0,
    stationLongitudeDeg: 0,
    safetyMarginM: 10_000,
    deploymentMode: 'lower',
  }
}

describe('Kcalbeloh physical relay references', () => {
  it('covers the 25 physical planets and moons once without turning technical centers into relay targets', () => {
    const physicalBodies = kcalbelohBodies.filter(body => body.kind === 'planet' || body.kind === 'moon')
    expect(kcalbelohPhysicalReferences).toHaveLength(25)
    expect(new Set(kcalbelohPhysicalReferences.map(row => row.bodyId)))
      .toEqual(new Set(physicalBodies.map(body => body.id)))
    for (const body of kcalbelohBodies.filter(body => body.kind !== 'planet' && body.kind !== 'moon')) {
      expect(kcalbelohPhysicalReferences.some(row => row.bodyId === body.id), body.name).toBe(false)
    }
  })

  it.each([stockKcalbelohPack, opmKcalbelohPack])('uses the same physical parent contexts in $name', pack => {
    for (const row of kcalbelohPhysicalReferences) {
      const body = pack.bodies.find(body => body.id === row.bodyId)!
      const fact = kcalbelohBodyFacts.find(fact => fact.bodyId === row.bodyId)!
      expect(row.parentBodyId, row.bodyId).toBe(body.parentId)
      expect(row.radiusM, row.bodyId).toBe(fact.radiusM)
      expect(row.atmosphereHeightM, row.bodyId).toBe(fact.atmosphereHeightM)
      expect(row.configPath, row.bodyId).toBe(fact.configPath)
      expect(row.gravitationalParameter, row.bodyId).toBeGreaterThan(0)
      expect(Number.isFinite(row.gravitationalParameter), row.bodyId).toBe(true)
      expect(row.sphereOfInfluenceM, row.bodyId).toBeGreaterThan(row.radiusM + row.atmosphereHeightM)
    }
  })

  it('uses the game conversion constants and retains auditable pinned sources', () => {
    expect(kcalbelohGravityConstants).toEqual({ gravitationalConstant: 6.67408e-11, standardGravity: 9.80665 })
    expect(kcalbelohSoiConstants).toEqual({ minimumRadiusMultiplier: 2, minimumAltitudeM: 40_000 })
    for (const source of [kcalbelohGravitySource, kcalbelohSoiSource]) {
      expect(source.url).toContain('c19a16e901ead27ff8f82ae2730a61c22980ed2d')
      expect(new URL(source.url).protocol).toBe('https:')
    }
  })

  it('converts source surface gravity into SI orbital parameters and uses the actual atmosphere ceilings', () => {
    expect(reference('suluco')).toMatchObject({ radiusM: 520_000, gravitationalParameter: 2_253_960_436_000, atmosphereHeightM: 65_000 })
    expect(reference('sera')).toMatchObject({ radiusM: 690_000, gravitationalParameter: 5_042_461_750_200, atmosphereHeightM: 71_000 })
    expect(reference('suluco').sphereOfInfluenceM).toBeCloseTo(31_359_322.313602865, 5)
    expect(reference('sera').sphereOfInfluenceM).toBeCloseTo(80_510_513.8660487, 5)
    expect(reference('efil').atmosphereHeightM).toBe(72_000)
    expect(reference('noyreg').atmosphereHeightM).toBe(96_000)
  })

  it.each([
    ['rouqea', 22_305_876_583_200],
    ['sedah', 41_209_240_441_600],
    ['anehta', 685_207_771_360_000],
    ['simetra', 237_917_603_840_000],
    ['simeht', 144_460_461_600_000],
    ['noi', 11_546_158.4],
    ['tot', 1_154_615.84],
    ['enots', 143_492_720],
  ] as const)('converts the configured mass of %s without substituting a similar body', (name, expectedMu) => {
    // Literal SI results from the source mass and the game's G. Large double
    // products can differ by a fraction of one m³/s² after binary rounding.
    const actual = reference(name).gravitationalParameter
    expect(Math.abs(actual - expectedMu)).toBeLessThanOrEqual(Math.max(1e-8, expectedMu * Number.EPSILON * 2))
  })

  it.each([
    ['onrefni', 3_427_888.40885751], ['rouqea', 27_251_254.2938285],
    ['iomena', 9_233_328.14499067], ['simetra', 15_000_000], ['simeht', 12_000_000],
  ] as const)('retains the explicit configured SOI override for %s', (name, sphereOfInfluenceM) => {
    expect(reference(name).sphereOfInfluenceM).toBe(sphereOfInfluenceM)
  })

  it('applies Kopernicus minimum SOIs to the tiny moons instead of using the raw Laplace radius', () => {
    // Tot a=5,940km, mass=1.73e16kg around Suluco; Enots a=14,510.625km,
    // mass=2.15e18kg around Anehta. Their raw SOIs are below R+40km.
    const totRaw = 5_940_000 * (1_154_615.84 / 2_253_960_436_000) ** .4
    const enotsRaw = 14_510_625 * (2.15e18 / 1.02667e25) ** .4
    expect(totRaw).toBeLessThan(43_250)
    expect(enotsRaw).toBeLessThan(58_000)
    expect(reference('tot').sphereOfInfluenceM).toBe(43_250)
    expect(reference('enots').sphereOfInfluenceM).toBe(58_000)
  })

  it('derives circumbinary satellite SOIs from SimeSystem rather than either gas giant', () => {
    expect(reference('noira').parentBodyId).toBe('kcalbeloh:simesystem')
    expect(reference('norihc').parentBodyId).toBe('kcalbeloh:simesystem')
    expect(reference('noyreg').parentBodyId).toBe('kcalbeloh:simesystem')
    expect(reference('noira').sphereOfInfluenceM).toBeCloseTo(664_191.6232816651, 5)
    expect(reference('norihc').sphereOfInfluenceM).toBeCloseTo(8_648_841.928030465, 5)
    expect(reference('noyreg').sphereOfInfluenceM).toBeCloseTo(22_706_698.00959728, 5)
  })

  it('provides physics for cataloged bodies even when the Delta-V map has no priced state for them', () => {
    for (const name of ['noi', 'simetra', 'simeht']) {
      expect(reference(name).gravitationalParameter).toBeGreaterThan(0)
      for (const pack of [stockKcalbelohPack, opmKcalbelohPack]) {
        expect(pack.nodes.some(node => node.bodyId === `kcalbeloh:${name}`)).toBe(false)
      }
    }
  })

  it.each(kcalbelohPhysicalReferences)('supports a valid automatic target orbit for $bodyId without promising an unblocked carrier orbit', row => {
    const result = calculateRelayPlan(relayInput(row.bodyId.slice('kcalbeloh:'.length)))
    expect(result.status, row.bodyId).toBe('success')
  })

  it('reproduces an independent Suluco orbital period and preserves the input and source data', () => {
    const input = relayInput('suluco', 700_000)
    const before = structuredClone({ input, references: kcalbelohPhysicalReferences, bodies: kcalbelohBodies, facts: kcalbelohBodyFacts })
    Object.freeze(input.body)
    Object.freeze(input)
    const result = calculateRelayPlan(input)
    if (result.status !== 'success') throw new Error(result.errors.join('\n'))
    expect(result.orbitRadiusM).toBe(1_220_000)
    expect(result.orbitalPeriodS).toBeCloseTo(5_639.576213253774, 7)
    expect(result.equatorialCoverageFraction).toBe(1)
    expect({ input, references: kcalbelohPhysicalReferences, bodies: kcalbelohBodies, facts: kcalbelohBodyFacts }).toEqual(before)
  })

  it.each(['sedah', 'anehta', 'simetra', 'simeht'])('models orbital relays at %s without inventing a surface receiver', name => {
    const result = calculateRelayPlan(relayInput(name))
    if (result.status !== 'success') throw new Error(result.errors.join('\n'))
    expect(result.equatorialCoverageFraction).toBeNull()
    expect(result.surfaceHalfAngleRad).toBeNull()
    expect(result.stationLinks).toEqual([])
  })
})
