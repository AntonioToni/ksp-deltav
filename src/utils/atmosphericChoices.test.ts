import { describe, expect, it } from 'vitest'
import { stockPack } from '../data/stock'
import { opmPack } from '../data/opm'
import { rssPack } from '../data/rss'
import { stockKcalbelohPack } from '../data/kcalbeloh'
import type { PlanetPack, PlannerGraph } from '../types/planner'
import { buildGraph } from './buildGraph'
import { findMissionRoute } from './mission'
import { describeManeuverBasis } from './estimateBasis'
import { applyAtmosphericAssistance, getAtmosphericCapabilities, getDefaultAtmosphericPlan, reconcileAtmosphericPlan, type AtmosphericPlan } from './atmosphericAssistance'
import { atmosphericChoicesValid, createAtmosphericChoices, referenceLandingBudgets, toAtmosphericPlan, type AtmosphericChoice } from './atmosphericChoices'

const kerbin = 'stock:kerbin'
const duna = 'stock:duna'
const landingId = `${kerbin}:orbit->${kerbin}:surface`
const edge = (graph: PlannerGraph, id: string) => [...graph.adjacency.values()].flat().find(candidate => candidate.id === id)!
const update = (choices: AtmosphericChoice[], bodyId: string, values: Partial<AtmosphericChoice>): AtmosphericChoice[] => choices.map(choice => choice.bodyId === bodyId ? { ...choice, ...values } : choice)
const choice = (choices: AtmosphericChoice[], bodyId: string) => choices.find(candidate => candidate.bodyId === bodyId)!
const draft = () => createAtmosphericChoices(stockPack, getDefaultAtmosphericPlan(stockPack, true))
const totals = (plan: AtmosphericPlan) => findMissionRoute(applyAtmosphericAssistance(buildGraph(stockPack), stockPack, plan).graph,
  `${kerbin}:surface`, 'stock:mun:surface', 'round-trip')
const numericalGraph = (graph: PlannerGraph) => [...graph.adjacency.values()].flat().map(({ id, deltaV }) => [id, deltaV])

describe('landing-method UI adapter', () => {
  it('decodes built-in defaults without enabling other bodies or capture', () => {
    const choices = draft()
    expect(choice(choices, kerbin)).toEqual({ bodyId: kerbin, capture: false, landingMethod: 'atmospheric', customLandingText: '' })
    expect(choice(choices, duna)).toEqual({ bodyId: duna, capture: false, landingMethod: 'reference', customLandingText: '' })
    expect(choices.map(({ bodyId }) => bodyId)).toEqual(getAtmosphericCapabilities(stockPack).map(({ body }) => body.id))
  })

  it('restores the existing 6840/10240 planning fixtures through the three methods', () => {
    const choices = draft()
    const atmospheric = toAtmosphericPlan(stockPack, choices, true)
    expect(atmospheric.find(option => option.bodyId === kerbin)).toMatchObject({ landing: true, landingDeltaV: 0, landingPreset: 'kerbin-reentry', landingMethod: 'atmospheric' })
    expect(totals(atmospheric)).toMatchObject({ status: 'success', totalDeltaV: 6840 })
    const reference = toAtmosphericPlan(stockPack, update(choices, kerbin, { landingMethod: 'reference' }), true)
    expect(reference.find(option => option.bodyId === kerbin)).toEqual({ bodyId: kerbin, capture: false, landing: false, landingDeltaV: 0 })
    expect(totals(reference)).toMatchObject({ status: 'success', totalDeltaV: 10240 })
    const custom = toAtmosphericPlan(stockPack, update(choices, kerbin, { landingMethod: 'custom', customLandingText: '150' }), true)
    expect(totals(custom)).toMatchObject({ status: 'success', totalDeltaV: 6990 })
  })

  it('keeps atmospheric zero distinct from a custom-entered zero after reopening', () => {
    for (const bodyId of [kerbin, duna]) {
      const atmospheric = toAtmosphericPlan(stockPack, update(draft(), bodyId, { landingMethod: 'atmospheric' }), true)
      expect(choice(createAtmosphericChoices(stockPack, atmospheric), bodyId)).toMatchObject({ landingMethod: 'atmospheric', customLandingText: '' })
      const custom = toAtmosphericPlan(stockPack, update(draft(), bodyId, { landingMethod: 'custom', customLandingText: '0' }), true)
      expect(choice(createAtmosphericChoices(stockPack, custom), bodyId)).toMatchObject({ landingMethod: 'custom', customLandingText: '0' })
      expect(custom.find(option => option.bodyId === bodyId)?.landingPreset).toBeUndefined()
    }
    const legacyManual: AtmosphericPlan = [{ bodyId: duna, capture: false, landing: true, landingDeltaV: 0 }]
    expect(choice(createAtmosphericChoices(stockPack, legacyManual), duna)).toMatchObject({ landingMethod: 'custom', customLandingText: '0' })
  })

  it('classifies explicit atmospheric choices as assumptions and custom zero as a personal budget', () => {
    for (const [bodyId, expectedLabel] of [[kerbin, 'Atmospheric reentry'], [duna, 'Atmospheric landing']]) {
      const id = `${bodyId}:orbit->${bodyId}:surface`
      for (const method of ['atmospheric', 'custom'] as const) {
        const plan = toAtmosphericPlan(stockPack, update(draft(), bodyId!, { landingMethod: method, customLandingText: '0' }), true)
        const result = applyAtmosphericAssistance(buildGraph(stockPack), stockPack, plan)
        expect(describeManeuverBasis(edge(result.graph, id), stockPack, { atmosphericPlan: plan }))
          .toMatchObject(method === 'atmospheric' ? { kind: 'ideal', label: expectedLabel } : { kind: 'user', label: 'Your allowance' })
      }
    }
  })

  it('does not erase the draft custom value while another method is selected', () => {
    const custom = update(draft(), duna, { landingMethod: 'custom', customLandingText: '150' })
    for (const method of ['reference', 'atmospheric'] as const) {
      const changed = update(custom, duna, { landingMethod: method })
      toAtmosphericPlan(stockPack, changed, true)
      expect(choice(changed, duna).customLandingText).toBe('150')
      expect(choice(update(changed, duna, { landingMethod: 'custom' }), duna).customLandingText).toBe('150')
    }
  })

  it.each(['', ' ', '-1', '1000001', 'NaN', 'Infinity', '1e309'])('rejects the selected invalid custom budget %j', customLandingText => {
    const choices = update(draft(), duna, { landingMethod: 'custom', customLandingText })
    expect(atmosphericChoicesValid(choices)).toBe(false)
    expect(() => toAtmosphericPlan(stockPack, choices, true)).toThrow('0 to 1,000,000 m/s')
    expect(atmosphericChoicesValid(update(choices, duna, { landingMethod: 'reference' }))).toBe(true)
    expect(atmosphericChoicesValid(update(choices, duna, { landingMethod: 'atmospheric' }))).toBe(true)
  })

  it.each(['0', '150', '0.5', '1000000'])('accepts supported user budgets including %s', customLandingText => {
    const choices = update(draft(), duna, { landingMethod: 'custom', customLandingText })
    expect(atmosphericChoicesValid(choices)).toBe(true)
    expect(toAtmosphericPlan(stockPack, choices, true).find(option => option.bodyId === duna)?.landingDeltaV).toBe(Number(customLandingText))
  })

  it('keeps capture independent and clamps options unsupported by the selected pack', () => {
    const choices = update(draft(), 'stock:jool', { capture: true, landingMethod: 'custom', customLandingText: '-1' })
    const plan = toAtmosphericPlan(stockPack, choices, true)
    expect(plan.find(option => option.bodyId === 'stock:jool')).toEqual({ bodyId: 'stock:jool', capture: true, landing: false, landingDeltaV: 0 })
    const landingOnly = structuredClone(stockPack)
    const bodyNodes = new Set(landingOnly.nodes.filter(node => node.bodyId === kerbin).map(node => node.id))
    landingOnly.maneuvers = landingOnly.maneuvers.filter(edge => edge.kind !== 'capture' || !bodyNodes.has(edge.to))
    expect(toAtmosphericPlan(landingOnly, update(draft(), kerbin, { capture: true }), true).find(option => option.bodyId === kerbin))
      .toMatchObject({ capture: false, landing: true, landingDeltaV: 0 })
  })

  it('preserves all original costs apart from the selected standalone arrival changes', () => {
    const before = JSON.stringify(stockPack)
    const reference = buildGraph(stockPack)
    const plan = toAtmosphericPlan(stockPack, update(draft(), duna, { capture: true, landingMethod: 'atmospheric' }), true)
    const result = applyAtmosphericAssistance(reference, stockPack, plan)
    expect(edge(result.graph, `${kerbin}:surface->${kerbin}:orbit`).deltaV).toBe(3400)
    expect(edge(result.graph, `${kerbin}:encounter->${kerbin}:orbit`).deltaV).toBe(950)
    expect(edge(result.graph, 'stock:mun:encounter->stock:kerbin:orbit').deltaV).toBe(860)
    expect(edge(result.graph, `${duna}:orbit->${duna}:surface`).deltaV).toBe(0)
    expect(edge(result.graph, `${duna}:encounter->${duna}:elliptical`).deltaV).toBe(0)
    for (const original of stockPack.maneuvers.filter(edge => edge.directTransfer)) expect(edge(result.graph, original.id).deltaV).toBe(original.deltaV)
    expect(JSON.stringify(stockPack)).toBe(before)
  })

  it('retains numerical results from legacy custom plans when adding display metadata', () => {
    for (const landingDeltaV of [0, 100, 1450, 1_000_000]) {
      const legacy: AtmosphericPlan = [{ bodyId: duna, capture: true, landing: true, landingDeltaV }]
      const translated = toAtmosphericPlan(stockPack, createAtmosphericChoices(stockPack, legacy), true)
      expect(numericalGraph(applyAtmosphericAssistance(buildGraph(stockPack), stockPack, translated).graph))
        .toEqual(numericalGraph(applyAtmosphericAssistance(buildGraph(stockPack), stockPack, legacy).graph))
    }
  })

  it('preserves a compatible explicit reference opt-out and custom zero across built-in packs', () => {
    const choices = update(update(draft(), kerbin, { landingMethod: 'reference' }), duna, { landingMethod: 'custom', customLandingText: '0' })
    let plan: AtmosphericPlan = toAtmosphericPlan(stockPack, choices, true)
    for (const pack of [opmPack, stockKcalbelohPack, stockPack]) {
      plan = reconcileAtmosphericPlan(pack, plan, true)
      expect(choice(createAtmosphericChoices(pack, plan), kerbin).landingMethod).toBe('reference')
      expect(choice(createAtmosphericChoices(pack, plan), duna)).toMatchObject({ landingMethod: 'custom', customLandingText: '0' })
    }
  })

  it('never invents the Kerbin preset for RSS or imported packs sharing Stock IDs', () => {
    expect(createAtmosphericChoices(rssPack, getDefaultAtmosphericPlan(rssPack, true)).every(option => option.landingMethod === 'reference' && !option.capture)).toBe(true)
    const custom = toAtmosphericPlan(stockPack, update(createAtmosphericChoices(stockPack, []), kerbin, { landingMethod: 'atmospheric' }), false)
    expect(custom.find(option => option.bodyId === kerbin)).toMatchObject({ landing: true, landingDeltaV: 0, landingMethod: 'atmospheric' })
    expect(custom.every(option => option.landingPreset === undefined)).toBe(true)
    const defaultAndCapture = update(draft(), kerbin, { capture: true })
    const imported = reconcileAtmosphericPlan(stockPack, toAtmosphericPlan(stockPack, defaultAndCapture, true), false)
    expect(imported.find(option => option.bodyId === kerbin)).toEqual({ bodyId: kerbin, capture: true, landing: false, landingDeltaV: 0 })
  })

  it('derives reference budgets from eligible descent records, including custom values and duplicates', () => {
    expect(referenceLandingBudgets(stockPack, kerbin)).toEqual([3400])
    expect(referenceLandingBudgets(stockPack, 'stock:jool')).toEqual([])
    const pack: PlanetPack = structuredClone(stockPack)
    const descent = pack.maneuvers.find(edge => edge.id === landingId)!
    descent.deltaV = 876.5
    pack.maneuvers.push({ ...descent, id: 'second-landing', deltaV: 50 }, { ...descent, id: 'duplicate-budget' })
    pack.maneuvers.push({ ...descent, id: 'cross-body', from: 'stock:mun:orbit', deltaV: 1 })
    expect(referenceLandingBudgets(pack, kerbin)).toEqual([50, 876.5])
  })
})
