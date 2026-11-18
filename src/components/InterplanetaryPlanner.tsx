import { useMemo, useState, type ReactNode } from 'react'
import {
  Alert, Box, Button, IconButton, InputAdornment, Link, ListSubheader, MenuItem,
  Stack, TextField, Tooltip, Typography,
} from '@mui/material'
import SwapHorizRounded from '@mui/icons-material/SwapHorizRounded'
import type { PlanetPack } from '../types/planner'
import { interplanetarySources } from '../data/interplanetary'
import { getSignalOrbitalCatalog } from '../data/signalOrbitalCatalog'
import { getEffectiveDsnLevels, getRadioProfile, radioProfileOptions, type RadioProfileId } from '../data/radioProfiles'
import { getKerbalismRadioProfileId } from '../data/kerbalism'
import { calculateAntennaArray, type AntennaArrayEntry } from '../utils/antennaArray'
import { calculateOrbitalSignal, sampleOrbitalSignals } from '../utils/orbitalSignals'
import { applyOrbitalOverrides, type OrbitalOverrideDrafts } from '../utils/orbitalOverrides'
import { utToGameDate } from '../utils/gameTime'
import { normalizeDegrees } from '../utils/orbitalGeometry'
import type { OrbitalBody, OrbitalPositionMode, OrbitalSignalInput, OrbitalSignalResult, OrbitalSignalSample } from '../types/orbital'
import { resolveSignalEndpointPower } from '../utils/signalEndpoint'
import { calculateKerbalismBitrate, resolveKerbalismBaseRate } from '../utils/kerbalismBitrate'
import { formatScienceRateBitsPerSecond } from '../utils/formatScienceRate'
import type { RelayMode } from '../utils/relayMode'
import AdvancedSettingsNotice from './AdvancedSettingsNotice'
import AntennaArrayDialog from './AntennaArrayDialog'
import OrbitalSignalDiagram from './OrbitalSignalDiagram'
import SignalPositionControls from './SignalPositionControls'
import OrbitalElementsEditor from './OrbitalElementsEditor'
import ScienceRateField from './ScienceRateField'
import UnavailableAntennaAlert from './UnavailableAntennaAlert'
import DsnModifierControls, { DsnModifierWarning } from './DsnModifierControls'

interface InterplanetaryPlannerProps {
  mode: RelayMode
  onOpenAdvanced: () => void
  advancedRadioSettingsActive: boolean
  pack: PlanetPack
  initialBodyId: string | null
  radioId: RadioProfileId
  onRadioChange: (id: RadioProfileId) => void
  dsnModifier: string
  onDsnModifierChange: (value: string) => void
  rangeMultiplier: string
  onRangeMultiplierChange: (value: string) => void
  dampingExponent: number
  dampingControls: ReactNode
  antennaSpeed: number
  minimumBitsPerSecond: number
  rateControls: ReactNode
}

interface EndpointDraft {
  selection: string
  customPower: string
  customRate: string
  array: AntennaArrayEntry[] | null
}

const format = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 })
const percent = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })
const fieldStyles = {
  minWidth: 0,
  '& .MuiInputBase-root': { fontSize: 13, minHeight: 40 },
  '& .MuiInputLabel-root': { fontSize: 16 },
  '& .MuiOutlinedInput-notchedOutline > legend': { fontSize: 12 },
  '& .MuiSelect-select': { py: 1, pr: '28px !important', overflow: 'hidden', textOverflow: 'ellipsis' },
  '& .MuiFormHelperText-root': { mx: 0, fontSize: 12, lineHeight: 1.4 },
} as const
const numeric = (value: string) => value.trim() === '' ? NaN : Number(value)
const distance = (value: number): string => {
  const [scale, unit] = value >= 1e12 ? [1e12, 'Tm'] : value >= 1e9 ? [1e9, 'Gm']
    : value >= 1e6 ? [1e6, 'Mm'] : value >= 1000 ? [1000, 'km'] : [1, 'm']
  return `${format.format(value / scale)} ${unit}`
}
const strength = (value: number) => value > 0 && value < .0001 ? '<0.01%' : `${percent.format(value * 100)}%`

function NumberField({ label, value, onChange, unit, min = 0, max, helperText }: {
  label: string; value: string; onChange: (value: string) => void; unit?: string; min?: number; max?: number; helperText?: string
}) {
  const parsed = numeric(value)
  return <TextField fullWidth size="small" type="number" label={label} value={value}
    error={value !== '' && (!Number.isFinite(parsed) || parsed < min || max !== undefined && parsed > max)}
    onChange={event => onChange(event.target.value)} helperText={helperText} sx={fieldStyles}
    slotProps={{ htmlInput: { 'aria-label': label, min, max, step: 'any' }, input: unit ? { endAdornment: <InputAdornment position="end"><Typography sx={{ fontSize: 12 }}>{unit}</Typography></InputAdornment> } : undefined }} />
}

function Metric({ label, value, testId, color, secondary, description, rateText, rateTestId, availabilityText }: { label: string; value: string; testId: string; color?: string; secondary?: { label: string; value: string; testId: string }; description?: string; rateText?: string; rateTestId?: string; availabilityText?: string }) {
  return <Box title={description} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, px: 1, py: .75, minWidth: 0, bgcolor: '#080f2145' }}>
    <Typography sx={{ fontSize: 12, color: 'text.secondary', lineHeight: 1.3 }}>{label}</Typography>
    <Typography component="output" data-testid={testId} aria-description={description} sx={{ display: 'block', mt: .25, fontSize: 16, lineHeight: 1.3, fontWeight: 500, fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere', color: color ?? 'text.primary' }}>{value}</Typography>
    {secondary && <Typography title="Kerbalism transmission efficiency is S^k for the same positions and blocking assumptions as the raw signal value." sx={{ mt: .5, fontSize: 12, color: 'text.secondary', lineHeight: 1.3 }}>{secondary.label} <Box component="output" data-testid={secondary.testId} aria-description="Kerbalism factor applied to science rate, separate from raw CommNet signal strength." sx={{ color: 'text.primary', fontVariantNumeric: 'tabular-nums' }}>{secondary.value}</Box></Typography>}
    {rateText !== undefined && <Typography sx={{ mt: .5, fontSize: 12, color: 'text.secondary', lineHeight: 1.4 }}>Potential science rate <Box component="output" data-testid={rateTestId} sx={{ color: 'primary.light', fontVariantNumeric: 'tabular-nums' }}>{rateText}</Box></Typography>}
    {availabilityText && <Typography sx={{ mt: .5, fontSize: 12, color: 'text.secondary', lineHeight: 1.4 }}>{availabilityText}</Typography>}
  </Box>
}

export default function InterplanetaryPlanner({ mode, onOpenAdvanced, advancedRadioSettingsActive, pack, initialBodyId, radioId, onRadioChange, dsnModifier, onDsnModifierChange, rangeMultiplier, onRangeMultiplierChange, dampingExponent, dampingControls, antennaSpeed, minimumBitsPerSecond, rateControls }: InterplanetaryPlannerProps) {
  const advanced = mode === 'advanced'
  const catalog = useMemo(() => getSignalOrbitalCatalog(pack), [pack])
  const candidates = catalog.bodies.filter(body => catalog.selectableBodyIds.includes(body.id))
  const firstA = candidates.find(body => body.id === pack.transferHubBodyId) ?? candidates[0]
  const firstB = candidates.find(body => body.id === initialBodyId && body.id !== firstA?.id)
    ?? candidates.find(body => ['stock:duna', 'rss:mars'].includes(body.id))
    ?? candidates.find(body => body.id !== firstA?.id)
  const [geometry, setGeometry] = useState<'actual' | 'reference' | 'manual' | 'manual-distance'>(firstA?.orbit?.semiMajorAxisM && firstB?.orbit?.semiMajorAxisM ? 'actual' : 'manual')
  const [aId, setAId] = useState(firstA?.id ?? '')
  const [bId, setBId] = useState(firstB?.id ?? '')
  const [manual, setManual] = useState({ a: '', b: '', center: '', initialized: false })
  const [manualDistance, setManualDistance] = useState('')
  const [phase, setPhase] = useState(90)
  const [positionMode, setPositionMode] = useState<OrbitalPositionMode>('phase')
  const [ut, setUT] = useState('0')
  const [windowUT, setWindowUT] = useState('0')
  const [referenceAngle, setReferenceAngle] = useState('0')
  const [orbitalDrafts, setOrbitalDrafts] = useState<OrbitalOverrideDrafts>({})
  const [orbitalEditorSelection, setOrbitalEditorSelection] = useState('a')
  const [occlusionFactor, setOcclusionFactor] = useState('1')
  const [aDraft, setADraft] = useState<EndpointDraft>({ selection: 'ra-100', customPower: '', customRate: '', array: null })
  const [bDraft, setBDraft] = useState<EndpointDraft>({ selection: 'ra-100', customPower: '', customRate: '', array: null })
  const [receivingEndpoint, setReceivingEndpoint] = useState<'a' | 'b'>('b')
  const [editingArray, setEditingArray] = useState<'a' | 'b' | null>(null)
  const radio = getRadioProfile(radioId)
  const dsnLevels = getEffectiveDsnLevels(radio, numeric(dsnModifier))
  const dsnSettingsValid = dsnLevels.every(level => Number.isFinite(level.power) && level.power > 0)
  const overridden = useMemo(() => applyOrbitalOverrides(catalog.bodies, orbitalDrafts), [catalog.bodies, orbitalDrafts])
  const orbitA = overridden.bodies.find(body => body.id === aId) ?? firstA
  const bOptions = candidates.filter(body => body.id !== orbitA?.id && (geometry !== 'reference' || body.parentBodyId === orbitA?.parentBodyId))
  const orbitB = overridden.bodies.find(body => body.id === bId && bOptions.some(option => option.id === body.id))
    ?? overridden.bodies.find(body => body.id === bOptions[0]?.id)
  const reference = geometry === 'actual' || geometry === 'reference'
  const manualLink = geometry === 'manual-distance'
  const effectivePositionMode = geometry === 'manual' || geometry === 'manual-distance' ? 'phase' : positionMode
  const arrayA = aDraft.array ? calculateAntennaArray(aDraft.array, 'client', radio.vesselAntennas) : null
  const arrayB = bDraft.array ? calculateAntennaArray(bDraft.array, 'client', radio.vesselAntennas) : null
  const endpointA = resolveSignalEndpointPower(aDraft, receivingEndpoint === 'a' ? 'receiver' : 'sender', radio.vesselAntennas, dsnLevels)
  const endpointB = resolveSignalEndpointPower(bDraft, receivingEndpoint === 'b' ? 'receiver' : 'sender', radio.vesselAntennas, dsnLevels)
  const receiver = receivingEndpoint === 'a' ? endpointA : endpointB
  const receiverNeedsRelay = receiver.status === 'needs-relay'
  const syntheticBodies = useMemo<OrbitalBody[]>(() => [
    { id: 'manual:center', name: 'Manual central body', parentBodyId: null, radiusM: numeric(manual.center) * 1000 },
    { id: 'manual:a', name: 'Endpoint A', parentBodyId: 'manual:center', radiusM: 0, orbit: { semiMajorAxisM: numeric(manual.a) * 1e9 } },
    { id: 'manual:b', name: 'Endpoint B', parentBodyId: 'manual:center', radiusM: 0, orbit: { semiMajorAxisM: numeric(manual.b) * 1e9 } },
  ], [manual.a, manual.b, manual.center])
  const bodies = geometry === 'manual' ? syntheticBodies : overridden.bodies
  // Snapshot primitives from catalog/resolver records so React Compiler can
  // preserve the sweep memo independently of later calculation-helper calls.
  const selectedAId = geometry === 'manual' ? 'manual:a' : String(orbitA?.id ?? '')
  const selectedBId = geometry === 'manual' ? 'manual:b' : String(orbitB?.id ?? '')
  const powerA = endpointA.status === 'success' ? Number(endpointA.power) : NaN
  const powerB = endpointB.status === 'success' ? Number(endpointB.power) : NaN
  const numericRange = numeric(rangeMultiplier)
  const numericOcclusion = numeric(occlusionFactor)
  const numericReference = geometry === 'actual' ? numeric(referenceAngle) : 0
  const numericDistance = numeric(manualDistance) * 1e9
  const exponent = radio.kerbalism ? dampingExponent : 1
  const baseInput = useMemo(() => ({
    bodies, bodyAId: selectedAId, bodyBId: selectedBId,
    geometry: geometry === 'reference' || geometry === 'manual' ? 'circular' as const : geometry,
    referenceTrueAnomalyDeg: numericReference, distanceM: numericDistance,
    powerA, powerB, rangeMultiplier: numericRange, occlusionFactor: geometry === 'manual-distance' ? 1 : numericOcclusion, dampingExponent: exponent,
  }), [bodies, selectedAId, selectedBId, geometry, numericReference, numericDistance, powerA, powerB, numericRange, numericOcclusion, exponent])
  const input: OrbitalSignalInput = { ...baseInput, positionMode: effectivePositionMode, phaseDeg: phase, utS: numeric(ut) }
  const sweepUT = effectivePositionMode === 'date' ? numeric(windowUT) : numeric(ut)
  const sweepInput = useMemo<OrbitalSignalInput>(() => ({ ...baseInput, positionMode: effectivePositionMode, phaseDeg: 0, utS: sweepUT }), [baseInput, effectivePositionMode, sweepUT])
  // A drag or extrema navigation changes the selected marker, not the sweep.
  const sweepResult = useMemo(() => manualLink ? null : sampleOrbitalSignals(sweepInput), [sweepInput, manualLink])
  const calculated = calculateOrbitalSignal(input)
  const sweep = sweepResult?.status === 'success' && calculated.status === 'success' ? { ...sweepResult, current: calculated } : null
  const manualErrors = geometry === 'manual' ? [
    ...([[manual.a, 'Orbit radius A', 1e7], [manual.b, 'Orbit radius B', 1e7], [manual.center, 'Central body radius', 1e9]] as const)
      .filter(([value, , maximum]) => !Number.isFinite(numeric(value)) || numeric(value) <= 0 || numeric(value) > maximum)
      .map(([, label]) => `${label}: enter a finite positive value within the supported range.`),
    ...(numeric(manual.a) * 1e9 <= numeric(manual.center) * 1000 || numeric(manual.b) * 1e9 <= numeric(manual.center) * 1000
      ? ['Each orbit radius must be larger than the central body’s radius.'] : []),
  ] : []
  const geometryErrors = reference ? overridden.errors : manualErrors
  const calendarErrors = effectivePositionMode === 'date' && ut.trim() !== '' && Number.isFinite(Number(ut)) && !utToGameDate(Number(ut), catalog.calendar)
    ? ['This universal time is outside the supported calendar years (1–9,999). Enter a valid in-game date or UT.'] : []
  const result: OrbitalSignalResult = geometryErrors.length || calendarErrors.length ? { status: 'invalid', errors: [...geometryErrors, ...calendarErrors] } : calculated
  const success = result.status === 'success' ? result : null
  const center = catalog.bodies.find(body => body.id === success?.centerId)
  const senderDraft = receivingEndpoint === 'a' ? bDraft : aDraft
  const senderBaseRate = radio.kerbalism ? resolveKerbalismBaseRate(senderDraft, radio.vesselAntennas, numeric(senderDraft.customRate)) : null
  const scienceRate = success && senderBaseRate?.status === 'success' ? calculateKerbalismBitrate({
    baseRateBitsPerSecond: senderBaseRate.baseRateBitsPerSecond,
    rawStrength: success.signalStrength,
    dampingExponent,
    antennaSpeed,
    minimumBitsPerSecond,
    linkAvailable: success.linkStatus === 'available' || success.linkStatus === 'marginal',
  }) : null
  const rate = scienceRate?.status === 'success' ? scienceRate : null
  const ratePlaceholder = senderBaseRate?.status === 'dsn' ? 'Not applicable'
    : senderBaseRate?.status === 'needs-rate' ? 'Enter sender rate'
      : senderBaseRate?.status === 'success' ? 'Check rate settings'
        : senderDraft.selection === 'custom' ? 'Check sender rate' : 'Check sender antenna'
  const scienceDirection = receivingEndpoint === 'a' ? 'B → A' : 'A → B'
  const names = { a: reference ? orbitA?.name ?? 'Planet A' : 'Endpoint A', b: reference ? orbitB?.name ?? 'Planet B' : 'Endpoint B', center: reference ? center?.name ?? 'Common reference' : 'Manual central body' }
  const endpointName = (endpoint: 'a' | 'b') => `${names[endpoint]} ${(endpoint === 'a' ? aDraft : bDraft).selection.startsWith('dsn:') ? 'ground station' : 'spacecraft'}`
  const directionSummary = `${endpointName(receivingEndpoint === 'a' ? 'b' : 'a')} → ${endpointName(receivingEndpoint)}`
  const setDraft = (endpoint: 'a' | 'b', changes: Partial<EndpointDraft>) => {
    if (changes.selection?.startsWith('dsn:')) setReceivingEndpoint(endpoint)
    ;(endpoint === 'a' ? setADraft : setBDraft)(previous => ({ ...previous, ...changes }))
  }
  const allowDsn = (endpoint: 'a' | 'b') => !reference || (endpoint === 'a' ? orbitA?.id : orbitB?.id) === pack.transferHubBodyId
  const allAntennas = radioProfileOptions.flatMap(profile => profile.vesselAntennas)
  const missingEndpoints = ([['a', aDraft], ['b', bDraft]] as const).flatMap(([endpoint, draft]) => {
    const ids = draft.selection === 'array' ? draft.array?.map(entry => entry.antennaId) ?? []
      : draft.selection === 'custom' || draft.selection.startsWith('dsn:') ? [] : [draft.selection]
    const missing = ids.filter(id => !radio.vesselAntennas.some(antenna => antenna.id === id))
    return missing.length ? [{ endpoint, draft, names: missing.map(id => allAntennas.find(antenna => antenna.id === id)?.name ?? id) }] : []
  })
  const firstMissing = missingEndpoints[0]
  const restoreRadio = getRadioProfile(getKerbalismRadioProfileId(radioId))
  const manualRequired = !firstA?.orbit || !firstB?.orbit
  const advancedSettingsActive = geometry !== 'actual' || Object.keys(orbitalDrafts).length > 0 || numeric(referenceAngle) !== 0
    || effectivePositionMode === 'phase' && numeric(ut) !== 0 || numeric(rangeMultiplier) !== 1 || numeric(occlusionFactor) !== 1
    || radio.pbc === true && numeric(dsnModifier) !== 1 && [aDraft.selection, bDraft.selection].some(selection => selection.startsWith('dsn:'))
    || [aDraft.selection, bDraft.selection].some(selection => selection === 'custom' || selection === 'array')
    || radio.kerbalism === true && advancedRadioSettingsActive

  function editArray(endpoint: 'a' | 'b') {
    if (!advanced) onOpenAdvanced()
    setEditingArray(endpoint)
  }

  function changeGeometry(next: typeof geometry) {
    if (next === 'manual' && !manual.initialized) {
      const parent = catalog.bodies.find(body => body.id === orbitA?.parentBodyId)
      setManual({ a: orbitA?.orbit?.semiMajorAxisM ? String(orbitA.orbit.semiMajorAxisM / 1e9) : '', b: orbitB?.orbit?.semiMajorAxisM ? String(orbitB.orbit.semiMajorAxisM / 1e9) : '', center: parent?.radiusM ? String(parent.radiusM / 1000) : '', initialized: true })
    }
    if (next === 'manual-distance' && manualDistance === '' && success) setManualDistance(String(success.distanceM / 1e9))
    if (next === 'reference' && orbitB?.parentBodyId !== orbitA?.parentBodyId) {
      const sibling = candidates.find(body => body.id !== orbitA?.id && body.parentBodyId === orbitA?.parentBodyId)
      if (sibling) setBId(sibling.id)
    }
    if (next === 'actual' || next === 'reference') {
      if (orbitA?.id !== pack.transferHubBodyId && aDraft.selection.startsWith('dsn:')) setDraft('a', { selection: 'ra-100' })
      if (orbitB?.id !== pack.transferHubBodyId && bDraft.selection.startsWith('dsn:')) setDraft('b', { selection: 'ra-100' })
    }
    setGeometry(next)
  }

  function changePlanet(endpoint: 'a' | 'b', id: string) {
    if (endpoint === 'a') {
      const next = candidates.find(body => body.id === id)!
      const other = candidates.find(body => body.id === bId && body.id !== id && (geometry !== 'reference' || body.parentBodyId === next.parentBodyId))
        ?? candidates.find(body => body.id !== id && (geometry !== 'reference' || body.parentBodyId === next.parentBodyId))
      setAId(id)
      setBId(other?.id ?? '')
      if (id !== pack.transferHubBodyId && aDraft.selection.startsWith('dsn:')) setDraft('a', { selection: 'ra-100' })
      if (other?.id !== pack.transferHubBodyId && bDraft.selection.startsWith('dsn:')) setDraft('b', { selection: 'ra-100' })
    } else {
      setBId(id)
      if (id !== pack.transferHubBodyId && bDraft.selection.startsWith('dsn:')) setDraft('b', { selection: 'ra-100' })
    }
  }

  function swap() {
    setAId(orbitB?.id ?? ''); setBId(orbitA?.id ?? '')
    setADraft(bDraft); setBDraft(aDraft)
    setReceivingEndpoint(previous => previous === 'a' ? 'b' : 'a')
    setManual(previous => ({ ...previous, a: previous.b, b: previous.a }))
    if (geometry === 'actual') setReferenceAngle(String(normalizeDegrees(numeric(referenceAngle) + phase)))
    setPhase(value => (360 - value) % 360)
  }

  function endpointFields(endpoint: 'a' | 'b') {
    const draft = endpoint === 'a' ? aDraft : bDraft
    const array = endpoint === 'a' ? arrayA : arrayB
    const value = endpoint === 'a' ? input.powerA : input.powerB
    const resolved = endpoint === 'a' ? endpointA : endpointB
    const isReceiver = receivingEndpoint === endpoint
    const label = endpoint.toUpperCase()
    const unavailable = !['array', 'custom'].includes(draft.selection) && !draft.selection.startsWith('dsn:')
      && !radio.vesselAntennas.some(antenna => antenna.id === draft.selection)
    const unavailableName = radioProfileOptions.flatMap(profile => profile.vesselAntennas).find(antenna => antenna.id === draft.selection)?.name ?? draft.selection
    const unavailableArray = draft.selection === 'array' && draft.array?.some(entry => !radio.vesselAntennas.some(antenna => antenna.id === entry.antennaId))
    const antennaLabel = `${names[endpoint]} antenna${names.a === names.b ? ` (${label})` : ''}`
    return <Stack data-signal-endpoint-config={endpoint} spacing={1.25} sx={{ minWidth: 0 }}>
      <TextField data-signal-antenna={endpoint} select fullWidth size="small" label={antennaLabel} value={draft.selection} error={unavailable || unavailableArray || resolved.status === 'needs-relay'}
        onChange={event => { if (event.target.value !== 'array') setDraft(endpoint, { selection: event.target.value }) }} sx={fieldStyles}
        helperText={<Box component="span" data-testid={`signal-power-${endpoint}`}>{unavailable ? 'Unavailable in this setup' : unavailableArray ? 'Edit array or restore its radio setup' : resolved.status === 'needs-relay' ? 'Relay receiver required' : Number.isFinite(value) && value > 0 ? `Effective power ${distance(value)}` : 'Enter effective power'}</Box>}
        slotProps={{ select: { renderValue: () => unavailable ? `${unavailableName} (unavailable)` : draft.selection === 'array' ? `Array (${array?.status === 'success' ? array.totalCount : '—'})`
          : draft.selection === 'custom' ? 'Custom power' : draft.selection.startsWith('dsn:') ? dsnLevels.find(level => level.id === draft.selection.slice(4))?.name
            : radio.vesselAntennas.find(antenna => antenna.id === draft.selection)?.name } }}>
        {unavailable && <MenuItem value={draft.selection} disabled sx={{ fontSize: 12 }}>{unavailableName} (unavailable)</MenuItem>}
        {radio.vesselAntennas.map(antenna => <MenuItem key={antenna.id} value={antenna.id} sx={{ fontSize: 12 }}>{antenna.name}</MenuItem>)}
        {allowDsn(endpoint) && <ListSubheader sx={{ fontSize: 12, lineHeight: '24px' }}>DSN station power</ListSubheader>}
        {allowDsn(endpoint) && dsnLevels.map(level => <MenuItem key={level.id} value={`dsn:${level.id}`} sx={{ fontSize: 12 }}>{level.name}</MenuItem>)}
        {(advanced || draft.selection === 'array') && <MenuItem value="array" disabled={!advanced} onClick={advanced ? () => editArray(endpoint) : undefined} sx={{ fontSize: 12 }}>{advanced ? 'Antenna array…' : 'Custom array (Advanced)'}</MenuItem>}
        {(advanced || draft.selection === 'custom') && <MenuItem value="custom" disabled={!advanced} sx={{ fontSize: 12 }}>{advanced ? 'Custom power' : 'Custom power (Advanced)'}</MenuItem>}
      </TextField>
      {isReceiver && resolved.status === 'success' && resolved.ignoredDirectCount > 0 && <Typography sx={{ fontSize: 12, color: 'text.secondary', lineHeight: 1.4 }}>{resolved.ignoredDirectCount} direct antenna{resolved.ignoredDirectCount === 1 ? '' : 's'} retained for sending; only relay antennas help receive this link.</Typography>}
      {isReceiver && draft.selection === 'custom' && <Typography sx={{ fontSize: 12, color: 'text.secondary', lineHeight: 1.4 }}>This custom value assumes the receiving craft has a working relay antenna.</Typography>}
      {advanced && draft.selection === 'custom' && <NumberField label={`Power ${label}`} value={draft.customPower} onChange={value => setDraft(endpoint, { customPower: value })} min={Number.MIN_VALUE} max={1e18} unit="m" />}
      {advanced && radio.kerbalism && draft.selection === 'custom' && <ScienceRateField label={`Full-strength rate ${label}`} valueBitsPerSecond={draft.customRate} onChangeBitsPerSecond={value => setDraft(endpoint, { customRate: value })}
        helperText="Science rate at full signal, before the Antenna speed multiplier. Needed only when this craft sends science." />}
    </Stack>
  }

  const sources = [...new Map([
    ...catalog.sources, ...interplanetarySources.filter(source => source.id === 'commnet-signal-strength'), ...radio.sources,
  ].map(source => [source.id, source])).values()]
  const colors = { available: '#92d5c6', marginal: '#e7bd7b', blocked: '#ee987d', 'out-of-range': '#ee987d' }
  const blockers = (ids: readonly string[]) => ids.map(id => bodies.find(body => body.id === id)?.name ?? id).join(', ')
  const status = success ? manualLink
    ? success.linkStatus === 'out-of-range' ? 'Out of antenna range · blocking unknown' : 'Within antenna range · blocking unknown'
    : ({ available: 'Link available', marginal: 'Link at boundary', blocked: `Blocked by ${blockers(success.blockingBodyIds) || names.center}`, 'out-of-range': 'Out of antenna range' } as const)[success.linkStatus] : ''
  const editingDraft = editingArray === 'a' ? aDraft : bDraft
  function changeTime(value: string) {
    setUT(value)
    if (value.trim() !== '' && Number.isFinite(Number(value))) setWindowUT(value)
  }
  function formatGameTime(value: number) {
    const date = utToGameDate(value, catalog.calendar)
    if (!date) return `UT ${format.format(value)} s`
    return `Y${date.year} D${date.day} ${String(date.hour).padStart(2, '0')}:${String(date.minute).padStart(2, '0')}`
  }
  function potentialRate(sample: OrbitalSignalSample) {
    if (!senderBaseRate || senderBaseRate.status !== 'success') return ratePlaceholder
    const estimate = calculateKerbalismBitrate({
      baseRateBitsPerSecond: senderBaseRate.baseRateBitsPerSecond, rawStrength: sample.rangeStrength,
      dampingExponent, antennaSpeed, minimumBitsPerSecond,
      linkAvailable: sample.linkStatus !== 'out-of-range' && sample.distanceM <= sample.maximumRangeM,
    })
    return estimate.status === 'success' ? formatScienceRateBitsPerSecond(estimate.rateBitsPerSecond) : 'Check rate settings'
  }
  function availability(sample: OrbitalSignalSample) {
    return sample.occluded ? `Blocked by ${blockers(sample.blockingBodyIds) || names.center} · actual signal 0%${radio.kerbalism ? ', science rate 0 B/s' : ''}`
      : sample.linkStatus === 'out-of-range' ? 'Out of antenna range' : 'Direct link available at these positions'
  }
  const phaseControl = !manualLink && <SignalPositionControls mode={effectivePositionMode}
    onModeChange={value => { setPositionMode(value); if (value === 'date') setWindowUT(ut) }}
    phase={phase} onPhaseChange={setPhase} ut={ut} onUTChange={changeTime} onNavigateUT={setUT}
    calendar={catalog.calendar} advanced={advanced} referenceAngle={referenceAngle} onReferenceAngleChange={setReferenceAngle}
    sweep={sweep} nameA={names.a} circular={geometry === 'reference' || geometry === 'manual'} manualOrbits={geometry === 'manual'} />
  const swapControl = <Tooltip title={reference ? 'Swap planets and endpoint antennas' : 'Swap orbit radii and endpoint antennas'}>
    <IconButton aria-label="Swap signal endpoints" size="small" onClick={swap} sx={{ p: .25 }}><SwapHorizRounded sx={{ fontSize: 19 }} /></IconButton>
  </Tooltip>

  return <Box data-testid="interplanetary-planner" data-signal-geometry={geometry} data-signal-position-mode={effectivePositionMode} sx={{ minWidth: 0 }}>
    <Typography component="h3" sx={{ m: 0, fontSize: 15, fontWeight: 500 }}>Interplanetary signals</Typography>
    <Typography sx={{ mt: .25, mb: 1.5, fontSize: 12, lineHeight: 1.45, color: 'text.secondary' }}>Choose planet positions or an in-game date to estimate one direct radio link. Actual orbits use the source eccentricity, inclination, and orbital timing where available.</Typography>
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1.5, '@media (min-width: 760px)': { gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.05fr)' } }}>
      <Stack spacing={1.5} sx={{ minWidth: 0 }}>
        {!advanced && advancedSettingsActive && <AdvancedSettingsNotice onOpen={onOpenAdvanced}
          message={!reference && manualRequired ? 'Reference orbits are unavailable for this pair. Enter orbital data or an exact link distance in Advanced mode.' : undefined} />}
        <Box sx={{ pt: .5, display: 'grid', gridTemplateColumns: advanced ? 'minmax(0, 1fr) minmax(0, 1fr)' : 'minmax(0, 1fr)', gap: 1 }}>
          {advanced && <TextField select fullWidth size="small" label="Signal geometry" value={geometry} onChange={event => changeGeometry(event.target.value as typeof geometry)} sx={fieldStyles}
            slotProps={{ select: { renderValue: () => ({ actual: 'Actual orbits', reference: 'Circular reference orbits', manual: 'Manual orbits', 'manual-distance': 'Manual link distance' })[geometry] } }}>
            <MenuItem value="actual" disabled={candidates.length < 2} sx={{ fontSize: 12 }}>Actual orbits</MenuItem><MenuItem value="reference" disabled={candidates.length < 2} sx={{ fontSize: 12 }}>Circular reference orbits</MenuItem><MenuItem value="manual-distance" sx={{ fontSize: 12 }}>Manual link distance</MenuItem><MenuItem value="manual" sx={{ fontSize: 12 }}>Manual orbits</MenuItem>
          </TextField>}
          <TextField select fullWidth size="small" label="Radio setup" value={radioId} onChange={event => onRadioChange(event.target.value as RadioProfileId)} sx={fieldStyles}>
            {radioProfileOptions.map(option => <MenuItem key={option.id} value={option.id} sx={{ fontSize: 12 }}>{option.name}</MenuItem>)}
          </TextField>
        </Box>
        <Typography sx={{ fontSize: 12, color: 'text.secondary', lineHeight: 1.4 }}>{radioId === 'stock' ? 'Uses stock antenna and ground-station power ratings.' : radio.description}</Typography>
        {!dsnSettingsValid && <DsnModifierWarning onEdit={!advanced ? onOpenAdvanced : undefined} />}
        {advanced && radio.pbc && <DsnModifierControls value={dsnModifier} onChange={onDsnModifierChange} />}
        {advanced && radio.kerbalism && dampingControls}
        {advanced && radio.kerbalism && rateControls}
        {reference ? <>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 28px minmax(0, 1fr)', gap: .5, alignItems: 'center' }}>
            <TextField select fullWidth size="small" label="Planet A" value={orbitA?.id ?? ''} onChange={event => changePlanet('a', event.target.value)} sx={fieldStyles}>
              {catalog.bodies.filter(primary => candidates.some(body => body.parentBodyId === primary.id)).flatMap(primary => [<ListSubheader key={primary.id} sx={{ fontSize: 12, lineHeight: '24px' }}>{primary.name}</ListSubheader>, ...candidates.filter(body => body.parentBodyId === primary.id).map(body => <MenuItem key={body.id} value={body.id} sx={{ fontSize: 12 }}>{body.name}</MenuItem>)])}
            </TextField>
            {swapControl}
            <TextField select fullWidth size="small" label="Planet B" value={orbitB?.id ?? ''} onChange={event => changePlanet('b', event.target.value)} sx={fieldStyles}>
              {bOptions.map(orbit => <MenuItem key={orbit.id} value={orbit.id} sx={{ fontSize: 12 }}>{orbit.name}</MenuItem>)}
            </TextField>
          </Box>
          <Typography sx={{ fontSize: 12, color: 'text.secondary', lineHeight: 1.4 }}>{orbitA?.parentBodyId === orbitB?.parentBodyId ? `Both bodies orbit ${catalog.bodies.find(body => body.id === orbitA?.parentBodyId)?.name ?? 'the same parent'}.` : 'Body positions include their separate parent orbits.'} Semi-major axes: {orbitA?.orbit?.semiMajorAxisM ? distance(orbitA.orbit.semiMajorAxisM) : 'unknown'} / {orbitB?.orbit?.semiMajorAxisM ? distance(orbitB.orbit.semiMajorAxisM) : 'unknown'}.</Typography>
        </> : manualLink ? <>
          {advanced ? <NumberField label="Link distance" value={manualDistance} onChange={setManualDistance} min={0} max={1e7} unit="Gm" helperText="Exact spacecraft separation. Distance alone cannot determine body blocking or orbital positions." /> : <Typography sx={{ fontSize: 13 }}>Manual link distance: {Number.isFinite(input.distanceM) ? distance(input.distanceM!) : 'Not supplied'}</Typography>}
        </> : advanced ? <>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 28px minmax(0, 1fr)', gap: .5, alignItems: 'center' }}>
            <NumberField label="Orbit radius A" value={manual.a} onChange={value => setManual(previous => ({ ...previous, a: value, initialized: true }))} unit="Gm" min={Number.MIN_VALUE} />
            {swapControl}
            <NumberField label="Orbit radius B" value={manual.b} onChange={value => setManual(previous => ({ ...previous, b: value, initialized: true }))} unit="Gm" min={Number.MIN_VALUE} />
          </Box>
          <NumberField label="Central radius" value={manual.center} onChange={value => setManual(previous => ({ ...previous, center: value, initialized: true }))} unit="km" min={Number.MIN_VALUE} />
          <Typography sx={{ fontSize: 12, color: 'text.secondary', lineHeight: 1.4 }}>Enter both orbit radii from the same center, not as altitudes above a surface. Central radius is the radius of the body at that center. Separate star systems and wormholes aren't modeled.</Typography>
        </> : <Box data-testid="signal-manual-summary" sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 500, lineHeight: 1.4 }}>Manual orbit geometry is active</Typography>
          <Typography sx={{ mt: .375, fontSize: 12, color: 'text.secondary', lineHeight: 1.45 }}>
            Orbit radii: {Number.isFinite(numeric(manual.a)) ? distance(numeric(manual.a) * 1e9) : 'Not supplied'} / {Number.isFinite(numeric(manual.b)) ? distance(numeric(manual.b) * 1e9) : 'Not supplied'}. Central body radius: {Number.isFinite(numeric(manual.center)) ? distance(numeric(manual.center) * 1000) : 'Not supplied'}.
          </Typography>
        </Box>}
        <TextField select fullWidth size="small" label="Signal receiver" value={receivingEndpoint} onChange={event => setReceivingEndpoint(event.target.value as 'a' | 'b')} sx={fieldStyles}>
          <MenuItem value="a" sx={{ fontSize: 12 }}>A · {names.a}</MenuItem><MenuItem value="b" sx={{ fontSize: 12 }}>B · {names.b}</MenuItem>
        </TextField>
        <Box>
          <Typography data-testid="signal-direction" sx={{ fontSize: 13, fontWeight: 500, lineHeight: 1.4, overflowWrap: 'anywhere' }}>{directionSummary}</Typography>
          <Typography sx={{ mt: .375, fontSize: 12, color: 'text.secondary', lineHeight: 1.4 }}>The receiving spacecraft needs a relay antenna. Only relay antennas in its array count; a DSN ground station can receive directly.</Typography>
        </Box>
        <Box sx={{ pt: .25, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1 }}>{endpointFields('a')}{endpointFields('b')}</Box>
        {advanced && geometry === 'actual' && <OrbitalElementsEditor bodies={overridden.bodies} bodyAId={aId} bodyBId={bId} drafts={orbitalDrafts} selection={orbitalEditorSelection} onSelectionChange={setOrbitalEditorSelection}
          onChange={(id, key, value) => setOrbitalDrafts(previous => ({ ...previous, [id]: { ...previous[id], [key]: value } }))}
          onRestore={id => setOrbitalDrafts(previous => { if (!id) return {}; const next = { ...previous }; delete next[id]; return next })} />}
        {advanced && <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1 }}>
          <NumberField label="Range multiplier" value={rangeMultiplier} onChange={onRangeMultiplierChange} min={Number.MIN_VALUE} max={100} />
          {!manualLink && <NumberField label="Occlusion factor" value={occlusionFactor} onChange={setOcclusionFactor} min={Number.MIN_VALUE} max={1} />}
        </Box>}
        {advanced && <Typography sx={{ fontSize: 12, color: 'text.secondary', lineHeight: 1.4 }}>Range multiplier scales maximum link distance; 2 doubles it.{!manualLink && ' Occlusion factor scales blocking radii: 1 is full size, 0.9 is 90%.'}</Typography>}
        {(aDraft.selection.startsWith('dsn:') || bDraft.selection.startsWith('dsn:')) && <Typography sx={{ fontSize: 12, color: 'text.secondary', lineHeight: 1.4 }}>DSN is KSP's ground-station network. The selected Tracking Station level sets its receiving power.</Typography>}
        {advanced && (aDraft.selection === 'custom' || bDraft.selection === 'custom') && <Typography sx={{ fontSize: 12, color: 'text.secondary', lineHeight: 1.4 }}>Custom power uses KSP's antenna rating in metres, not watts. It is used as entered; Radio setup does not rescale it.</Typography>}
      </Stack>
      <Stack spacing={1} sx={{ minWidth: 0 }}>
        {firstMissing ? <UnavailableAntennaAlert
          names={[...new Set(missingEndpoints.flatMap(endpoint => endpoint.names))]}
          restoreLabel={restoreRadio.name} onRestore={() => onRadioChange(restoreRadio.id)}
          replaceLabel={firstMissing.draft.selection === 'array' ? advanced ? 'Edit antenna array' : 'Edit in Advanced mode' : 'Use RA-100'}
          onReplace={() => { if (firstMissing.draft.selection === 'array') editArray(firstMissing.endpoint); else setDraft(firstMissing.endpoint, { selection: 'ra-100' }) }}
        /> : receiverNeedsRelay ? <Alert severity="warning" data-testid="signal-receiver-warning" sx={{ fontSize: 12, '& .MuiAlert-message': { minWidth: 0 } }}>
          <Typography sx={{ fontSize: 12, lineHeight: 1.45 }}>Choose a relay antenna or a DSN level for signal receiver {receivingEndpoint.toUpperCase()}.</Typography>
          <Button size="small" onClick={() => setDraft(receivingEndpoint, { selection: 'ra-100' })} sx={{ mt: .5, minHeight: 32, px: 1, fontSize: 12 }}>Use RA-100</Button>
          {!advanced && (receivingEndpoint === 'a' ? aDraft : bDraft).selection === 'array' && <Button size="small" onClick={() => editArray(receivingEndpoint)} sx={{ mt: .5, minHeight: 32, px: 1, fontSize: 12 }}>Edit in Advanced mode</Button>}
        </Alert> : success ? <>
          <Typography role="status" data-testid="signal-link-status" sx={{ fontSize: 12, fontWeight: 500, color: colors[success.linkStatus] }}>{status}</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: .75 }}>
            <Metric label="Separation at selected positions" value={distance(success.distanceM)} testId="signal-distance" />
            <Metric label="Signal strength" value={strength(success.signalStrength)} testId="signal-strength" color={colors[success.linkStatus]} description={manualLink ? 'Distance-based CommNet strength; body blocking cannot be determined from distance alone.' : 'Raw CommNet signal strength for the selected 3D positions, including blocking by bodies with known positions. Kerbalism damping does not change this value.'}
              secondary={radio.kerbalism ? { label: 'Transmission efficiency', value: strength(success.dampedStrength), testId: 'signal-transmission-efficiency' } : undefined} />
          </Box>
          {radio.kerbalism && <>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: .75 }}>
              <Metric label={`Science rate · ${scienceDirection}`} value={rate ? formatScienceRateBitsPerSecond(rate.rateBitsPerSecond) : ratePlaceholder} testId="signal-science-rate" description="Science transmitted per second on this hop, after Antenna speed, transmission efficiency, and any configured minimum. Displayed in decimal bytes per second." />
              <Metric label="Full-strength sender rate" value={rate ? formatScienceRateBitsPerSecond(rate.fullStrengthBitsPerSecond) : ratePlaceholder} testId="signal-full-strength-rate" description="Sender rate after Antenna speed, before transmission efficiency reduces it. Displayed in decimal bytes per second." />
            </Box>
            {rate?.floorApplied && <Typography data-testid="signal-rate-floor" sx={{ fontSize: 12, color: 'secondary.main', lineHeight: 1.4 }}>The calculated rate is below your minimum; using {formatScienceRateBitsPerSecond(minimumBitsPerSecond)}. Disconnected links stay at zero.</Typography>}
            <Typography sx={{ fontSize: 12, color: 'text.secondary', lineHeight: 1.4 }}>
              {senderBaseRate?.status === 'dsn' ? 'A DSN receives science; choose a vessel as the sender to estimate a science rate.'
                : senderBaseRate?.status === 'success' && senderBaseRate.externalCount === 0 ? 'Internal antennas do not transmit science. Select an external antenna for a science rate.'
                  : "Estimated science rate for this link. A relay's next link can be slower; complete paths home aren't calculated."}
            </Typography>
          </>}
          <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Maximum antenna range <Box component="output" data-testid="signal-range" sx={{ color: 'text.primary', fontVariantNumeric: 'tabular-nums' }}>{distance(success.maximumRangeM)}</Box></Typography>
        </> : <Alert severity="info" sx={{ fontSize: 12, '& .MuiAlert-message': { minWidth: 0 } }}>
          <Typography sx={{ fontSize: 12, lineHeight: 1.45 }}>{result.status === 'invalid' ? result.errors[0] : 'Enter two orbital radii and antenna powers.'}</Typography>
          {effectivePositionMode === 'date' && <Button size="small" onClick={() => setPositionMode('phase')} sx={{ mt: .5, minHeight: 32, px: 1, fontSize: 12 }}>Use Relative phase</Button>}
          {!advanced && <Button size="small" onClick={onOpenAdvanced} sx={{ mt: .5, minHeight: 32, px: 1, fontSize: 12 }}>Edit in Advanced mode</Button>}
        </Alert>}
        {success && success.fallbackReasons.length > 0 && <Alert severity="info" data-testid="signal-geometry-notice" sx={{ fontSize: 12, '& .MuiAlert-message': { minWidth: 0 } }}>Circular approximation: {success.fallbackReasons.join(' ')}</Alert>}
        {success && sweepResult?.status === 'invalid' && <Alert severity="info" data-testid="signal-sweep-notice" sx={{ fontSize: 12, '& .MuiAlert-message': { minWidth: 0 } }}>Graph unavailable: {sweepResult.errors[0]} The selected-position result above is still calculated.</Alert>}
        {reference && [...new Set([...(orbitA?.limitations ?? []), ...(orbitB?.limitations ?? [])])].map(note => <Typography key={note} sx={{ fontSize: 12, lineHeight: 1.4, color: 'text.secondary' }}>{note}</Typography>)}
        {phaseControl}
        {success && sweep && !manualLink && <OrbitalSignalDiagram input={input} sweep={sweep} kerbalism={radio.kerbalism} receivingEndpoint={receivingEndpoint} nameA={names.a} nameB={names.b} centerName={names.center} colorA={orbitA?.color ?? '#73c8fa'} colorB={orbitB?.color ?? '#e7bd7b'} centerColor={center?.color} onPhaseChange={setPhase} onTimeChange={value => setUT(String(value))} formatTime={formatGameTime} calendarDayS={catalog.calendar === 'kerbin' ? 21600 : 86400} />}
      </Stack>
    </Box>
    {success && sweep && !manualLink && <Box sx={{ mt: .5 }}>
      <Typography sx={{ mb: .5, fontSize: 12, color: 'text.secondary' }}>Closest and farthest positions · potential before blockage</Typography>
      <Typography data-testid="signal-extrema-scope" sx={{ mb: .75, fontSize: 12, color: 'text.secondary', lineHeight: 1.4 }}>{sweep.scopeLabel} These are estimates within this sweep or time window, not all possible alignments.</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: .75 }}>
        <Metric label={`Closest position · ${distance(sweep.closest.distanceM)}`} value={strength(sweep.closest.rangeStrength)} testId="signal-best"
          secondary={radio.kerbalism ? { label: 'Transmission efficiency', value: strength(sweep.closest.dampedRangeStrength), testId: 'signal-best-transmission-efficiency' } : undefined}
          rateText={radio.kerbalism ? potentialRate(sweep.closest) : undefined} rateTestId="signal-best-rate" availabilityText={availability(sweep.closest)} description="Distance-based signal potential before body blocking within the displayed sweep. The availability line includes blocking." />
        <Metric label={`Farthest position · ${distance(sweep.farthest.distanceM)}`} value={strength(sweep.farthest.rangeStrength)} testId="signal-worst"
          secondary={radio.kerbalism ? { label: 'Transmission efficiency', value: strength(sweep.farthest.dampedRangeStrength), testId: 'signal-worst-transmission-efficiency' } : undefined}
          rateText={radio.kerbalism ? potentialRate(sweep.farthest) : undefined} rateTestId="signal-worst-rate" availabilityText={availability(sweep.farthest)} description="Distance-based signal potential before body blocking within the displayed sweep. The availability line includes blocking." />
      </Box>
    </Box>}
    <Typography sx={{ mt: 1, fontSize: 12, color: 'text.secondary', lineHeight: 1.45 }}>{manualLink ? 'Distance alone does not establish a clear path. Body blocking and orbital positions are unknown.' : 'Estimates one direct link between body centres. Spacecraft altitude, surface horizons, terrain, and a complete path home are not modeled.'}{!manualLink && success?.geometryUsed === 'circular' ? ' Circular geometry checks blocking by the shared central body only.' : !manualLink && success?.uncheckedBodyIds.length ? ' Some bodies have unknown positions or radii, so their blocking is not checked.' : ''}</Typography>
    <Box component="details" sx={{ mt: 1, fontSize: 12, color: 'text.secondary', '& summary': { cursor: 'pointer', minHeight: 32, color: 'primary.main' } }}>
      <Box component="summary">Signal assumptions and sources</Box>
      <Typography sx={{ mt: .5, fontSize: 12, lineHeight: 1.45 }}>Actual orbits use Keplerian ellipses with eccentricity, inclination, ascending node, periapsis direction, mean anomaly, epoch, and period from pinned source data. Positions are 3D and are translated through the parent hierarchy to a common frame. In Relative phase, A stays at its reference true anomaly (0° at periapsis by default); B’s true anomaly equals that reference plus the slider angle, each measured from its own periapsis. Ancestor positions are held at the reference UT. This sweep is a selected configuration, not an in-game date or a complete range of all alignments.</Typography>
      <Typography sx={{ mt: .5, fontSize: 12, lineHeight: 1.45 }}>In-game date advances both orbits from their source epochs using Kepler’s equation. The graph covers its labeled synodic or fallback time interval; Closest and Farthest refer only to that window. Clicking the graph or navigating extrema keeps that window fixed; entering a new date starts a new window. Kerbin uses 426 six-hour days; RSS uses the Gregorian calendar from 1951-01-01 TAI. Match UT directly if your installation changes the calendar. Circular reference orbits deliberately omit eccentricity and inclination. Missing orbital shape data causes an explicit circular fallback; missing dated phase or epoch data does not produce an invented dated position. Manual orbits retains the older coplanar radius model; Manual link distance evaluates only the entered distance, without blockage or orbit claims.</Typography>
      <Typography sx={{ mt: .5, fontSize: 12, lineHeight: 1.45 }}>Stock CommNet: maximum range = √(sender power × receiving relay/DSN power) × Range multiplier. Power values are KSP antenna ratings in metres, not watts. Signal strength follows the existing CommNet curve and becomes zero when a known intervening body blocks the 3D segment. Actual orbits checks all bodies with known positions and radii; Circular reference and Manual orbits preserve the shared-central-body-only blocking model. Endpoint bodies themselves are excluded because these estimates use their centres; local horizon checks require actual craft or ground-station positions. Bodies with missing positions or radii are not checked. Antennas on separate craft never combine. The sender uses its full antenna loadout; only relay antennas count on a receiving craft. Custom receiving power assumes relay hardware. RealAntennas and RemoteTech use different rules and remain unsupported.</Typography>
      {catalog.notes.map(note => <Typography key={note} sx={{ mt: .5, fontSize: 12, lineHeight: 1.45 }}>{note}</Typography>)}
      {radio.kerbalism && <Typography sx={{ mt: .5, fontSize: 12, lineHeight: 1.45 }}>Kerbalism transmission efficiency is S^k, where S is raw CommNet signal strength and k is the damping exponent. It scales science rate without changing signal strength or maximum antenna range. Science rate = the sender's geometric-mean external antenna rate × Antenna speed × S^k. The base rate uses all active external antenna rates, counted by quantity; it does not add them. Full-strength sender rate includes Antenna speed before signal loss. Selected antennas are assumed powered, enabled, deployed and working. Internal antennas send no science. A positive calculated rate uses your minimum science-rate setting when needed; blocked, out-of-range or zero rates stay at zero. Each extra relay can lower the final rate. Those extra links, power availability, failures, plasma blackouts and storms are not checked.</Typography>}
      <Stack spacing={.5} sx={{ mt: .75 }}>{sources.map(source => <Link key={source.id} href={source.url} target="_blank" rel="noreferrer" sx={{ fontSize: 12, lineHeight: 1.4, overflowWrap: 'anywhere' }}>{source.title}</Link>)}</Stack>
    </Box>
    {editingArray && <AntennaArrayDialog open role="client" title={`Endpoint ${editingArray.toUpperCase()} antenna array`} description={editingArray === receivingEndpoint ? 'Antennas fitted to the receiving craft. Only relay antennas help receive this link. Direct antennas stay in the loadout for sending; the combined power shown here is the sending rating.' : 'Antennas fitted to one sending craft. Direct and relay antennas may work together. Antennas on separate craft do not combine.'}
      entries={editingDraft.array ?? [{ antennaId: radio.vesselAntennas.some(antenna => antenna.id === editingDraft.selection) ? editingDraft.selection : 'ra-100', count: 1 }]}
      antennas={radio.vesselAntennas} radioLabel={radio.name} onClose={() => setEditingArray(null)} onApply={entries => { setDraft(editingArray, { selection: 'array', array: entries }); setEditingArray(null) }} />}
  </Box>
}
