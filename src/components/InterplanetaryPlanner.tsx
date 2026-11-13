import { useMemo, useState, type ReactNode } from 'react'
import {
  Alert, Box, Button, IconButton, InputAdornment, Link, ListSubheader, MenuItem,
  Slider, Stack, TextField, Tooltip, Typography,
} from '@mui/material'
import SwapHorizRounded from '@mui/icons-material/SwapHorizRounded'
import type { PlanetPack } from '../types/planner'
import { getInterplanetaryPresets, interplanetarySources } from '../data/interplanetary'
import { getRadioProfile, radioProfileOptions, type RadioProfileId } from '../data/radioProfiles'
import { getKerbalismRadioProfileId } from '../data/kerbalism'
import { calculateAntennaArray, type AntennaArrayEntry } from '../utils/antennaArray'
import { calculateInterplanetarySignal } from '../utils/interplanetary'
import { resolveSignalEndpointPower } from '../utils/signalEndpoint'
import { calculateKerbalismBitrate, resolveKerbalismBaseRate } from '../utils/kerbalismBitrate'
import { formatBitrate } from '../utils/formatBitrate'
import AntennaArrayDialog from './AntennaArrayDialog'
import InterplanetaryDiagram from './InterplanetaryDiagram'
import UnavailableAntennaAlert from './UnavailableAntennaAlert'

interface InterplanetaryPlannerProps {
  pack: PlanetPack
  initialBodyId: string | null
  radioId: RadioProfileId
  onRadioChange: (id: RadioProfileId) => void
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
  '& .MuiInputBase-root': { fontSize: 12, minHeight: 40 },
  '& .MuiInputLabel-root': { fontSize: 11 },
  '& .MuiSelect-select': { py: 1, pr: '28px !important', overflow: 'hidden', textOverflow: 'ellipsis' },
  '& .MuiFormHelperText-root': { mx: 0, fontSize: 10, lineHeight: 1.4 },
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
    slotProps={{ htmlInput: { 'aria-label': label, min, max, step: 'any' }, input: unit ? { endAdornment: <InputAdornment position="end"><Typography sx={{ fontSize: 10 }}>{unit}</Typography></InputAdornment> } : undefined }} />
}

function Metric({ label, value, testId, color }: { label: string; value: string; testId: string; color?: string }) {
  return <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, px: 1, py: .75, minWidth: 0, bgcolor: '#080f2145' }}>
    <Typography sx={{ fontSize: 10, color: 'text.secondary', lineHeight: 1.3 }}>{label}</Typography>
    <Typography component="output" data-testid={testId} sx={{ display: 'block', mt: .25, fontSize: 16, lineHeight: 1.3, fontWeight: 500, fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere', color: color ?? 'text.primary' }}>{value}</Typography>
  </Box>
}

export default function InterplanetaryPlanner({ pack, initialBodyId, radioId, onRadioChange, rangeMultiplier, onRangeMultiplierChange, dampingExponent, dampingControls, antennaSpeed, minimumBitsPerSecond, rateControls }: InterplanetaryPlannerProps) {
  const presets = useMemo(() => getInterplanetaryPresets(pack), [pack])
  const firstA = presets.orbits.find(orbit => orbit.id === pack.transferHubBodyId) ?? presets.orbits[0]
  let initialPlanetId = initialBodyId
  const visited = new Set<string>()
  while (initialPlanetId && !presets.orbits.some(orbit => orbit.id === initialPlanetId) && !visited.has(initialPlanetId)) {
    visited.add(initialPlanetId)
    initialPlanetId = pack.bodies.find(body => body.id === initialPlanetId)?.parentId ?? null
  }
  const firstB = presets.orbits.find(orbit => orbit.id === initialPlanetId && orbit.id !== firstA?.id && orbit.parentBodyId === firstA?.parentBodyId)
    ?? presets.orbits.find(orbit => ['stock:duna', 'rss:mars'].includes(orbit.id) && orbit.parentBodyId === firstA?.parentBodyId)
    ?? presets.orbits.find(orbit => orbit.id !== firstA?.id && orbit.parentBodyId === firstA?.parentBodyId)
  const [geometry, setGeometry] = useState<'reference' | 'manual'>(firstA && firstB ? 'reference' : 'manual')
  const [aId, setAId] = useState(firstA?.id ?? '')
  const [bId, setBId] = useState(firstB?.id ?? '')
  const [manual, setManual] = useState({ a: '', b: '', center: '', initialized: false })
  const [phase, setPhase] = useState(90)
  const [occlusionFactor, setOcclusionFactor] = useState('1')
  const [aDraft, setADraft] = useState<EndpointDraft>({ selection: 'ra-100', customPower: '', customRate: '', array: null })
  const [bDraft, setBDraft] = useState<EndpointDraft>({ selection: 'ra-100', customPower: '', customRate: '', array: null })
  const [receivingEndpoint, setReceivingEndpoint] = useState<'a' | 'b'>('b')
  const [editingArray, setEditingArray] = useState<'a' | 'b' | null>(null)
  const radio = getRadioProfile(radioId)
  const orbitA = presets.orbits.find(orbit => orbit.id === aId) ?? firstA
  const bOptions = presets.orbits.filter(orbit => orbit.id !== orbitA?.id && orbit.parentBodyId === orbitA?.parentBodyId)
  const orbitB = bOptions.find(orbit => orbit.id === bId) ?? bOptions[0]
  const center = presets.centers.find(candidate => candidate.id === orbitA?.parentBodyId)
  const reference = geometry === 'reference'
  const arrayA = aDraft.array ? calculateAntennaArray(aDraft.array, 'client', radio.vesselAntennas) : null
  const arrayB = bDraft.array ? calculateAntennaArray(bDraft.array, 'client', radio.vesselAntennas) : null
  const endpointA = resolveSignalEndpointPower(aDraft, receivingEndpoint === 'a' ? 'receiver' : 'sender', radio.vesselAntennas, radio.dsnLevels)
  const endpointB = resolveSignalEndpointPower(bDraft, receivingEndpoint === 'b' ? 'receiver' : 'sender', radio.vesselAntennas, radio.dsnLevels)
  const receiver = receivingEndpoint === 'a' ? endpointA : endpointB
  const receiverNeedsRelay = receiver.status === 'needs-relay'
  const input = {
    orbitRadiusAM: reference ? orbitA?.semiMajorAxisM ?? NaN : numeric(manual.a) * 1e9,
    orbitRadiusBM: reference ? orbitB?.semiMajorAxisM ?? NaN : numeric(manual.b) * 1e9,
    centralRadiusM: reference ? center?.radiusM ?? NaN : numeric(manual.center) * 1000,
    powerA: endpointA.status === 'success' ? endpointA.power : NaN,
    powerB: endpointB.status === 'success' ? endpointB.power : NaN,
    rangeMultiplier: numeric(rangeMultiplier), occlusionFactor: numeric(occlusionFactor), phaseDeg: phase,
    dampingExponent: radio.kerbalism ? dampingExponent : 1,
  }
  const result = calculateInterplanetarySignal(input)
  const success = result.status === 'success' ? result : null
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
  const names = { a: reference ? orbitA?.name ?? 'Planet A' : 'Endpoint A', b: reference ? orbitB?.name ?? 'Planet B' : 'Endpoint B', center: reference ? center?.name ?? 'Central body' : 'Manual central body' }
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

  function changeGeometry(next: 'reference' | 'manual') {
    if (next === 'manual' && !manual.initialized) setManual({ a: orbitA ? String(orbitA.semiMajorAxisM / 1e9) : '', b: orbitB ? String(orbitB.semiMajorAxisM / 1e9) : '', center: center ? String(center.radiusM / 1000) : '', initialized: true })
    if (next === 'reference') {
      if (orbitA?.id !== pack.transferHubBodyId && aDraft.selection.startsWith('dsn:')) setDraft('a', { selection: 'ra-100' })
      if (orbitB?.id !== pack.transferHubBodyId && bDraft.selection.startsWith('dsn:')) setDraft('b', { selection: 'ra-100' })
    }
    setGeometry(next)
  }

  function changePlanet(endpoint: 'a' | 'b', id: string) {
    if (endpoint === 'a') {
      const next = presets.orbits.find(orbit => orbit.id === id)!
      const other = presets.orbits.find(orbit => orbit.id === bId && orbit.id !== id && orbit.parentBodyId === next.parentBodyId)
        ?? presets.orbits.find(orbit => orbit.id !== id && orbit.parentBodyId === next.parentBodyId)!
      setAId(id); setBId(other.id)
      if (id !== pack.transferHubBodyId && aDraft.selection.startsWith('dsn:')) setDraft('a', { selection: 'ra-100' })
      if (other.id !== pack.transferHubBodyId && bDraft.selection.startsWith('dsn:')) setDraft('b', { selection: 'ra-100' })
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
    return <Stack spacing={1.25} sx={{ minWidth: 0 }}>
      <TextField select fullWidth size="small" label={`Antenna ${label}`} value={draft.selection} error={unavailable || unavailableArray || resolved.status === 'needs-relay'}
        onChange={event => { if (event.target.value !== 'array') setDraft(endpoint, { selection: event.target.value }) }} sx={fieldStyles}
        helperText={<Box component="span" data-testid={`signal-power-${endpoint}`}>{unavailable ? 'Unavailable in this setup' : unavailableArray ? 'Edit array or restore its radio setup' : resolved.status === 'needs-relay' ? 'Relay receiver required' : Number.isFinite(value) && value > 0 ? `Effective power ${distance(value)}` : 'Enter effective power'}</Box>}
        slotProps={{ select: { renderValue: () => unavailable ? `${unavailableName} (unavailable)` : draft.selection === 'array' ? `Array (${array?.status === 'success' ? array.totalCount : '—'})`
          : draft.selection === 'custom' ? 'Custom power' : draft.selection.startsWith('dsn:') ? radio.dsnLevels.find(level => level.id === draft.selection.slice(4))?.name
            : radio.vesselAntennas.find(antenna => antenna.id === draft.selection)?.name } }}>
        {unavailable && <MenuItem value={draft.selection} disabled sx={{ fontSize: 12 }}>{unavailableName} (unavailable)</MenuItem>}
        {radio.vesselAntennas.map(antenna => <MenuItem key={antenna.id} value={antenna.id} sx={{ fontSize: 12 }}>{antenna.name}</MenuItem>)}
        {allowDsn(endpoint) && <ListSubheader sx={{ fontSize: 10, lineHeight: '24px' }}>DSN station power</ListSubheader>}
        {allowDsn(endpoint) && radio.dsnLevels.map(level => <MenuItem key={level.id} value={`dsn:${level.id}`} sx={{ fontSize: 12 }}>{level.name}</MenuItem>)}
        <MenuItem value="array" onClick={() => setEditingArray(endpoint)} sx={{ fontSize: 12 }}>Antenna array…</MenuItem>
        <MenuItem value="custom" sx={{ fontSize: 12 }}>Custom power</MenuItem>
      </TextField>
      {isReceiver && resolved.status === 'success' && resolved.ignoredDirectCount > 0 && <Typography sx={{ fontSize: 10, color: 'text.secondary', lineHeight: 1.4 }}>{resolved.ignoredDirectCount} direct antenna{resolved.ignoredDirectCount === 1 ? '' : 's'} retained for sending; only relay antennas help receive this link.</Typography>}
      {isReceiver && draft.selection === 'custom' && <Typography sx={{ fontSize: 10, color: 'text.secondary', lineHeight: 1.4 }}>This custom value assumes the receiving craft has a working relay antenna.</Typography>}
      {draft.selection === 'custom' && <NumberField label={`Power ${label}`} value={draft.customPower} onChange={value => setDraft(endpoint, { customPower: value })} min={Number.MIN_VALUE} max={1e18} unit="m" />}
      {radio.kerbalism && draft.selection === 'custom' && <NumberField label={`Full-strength rate ${label}`} value={draft.customRate} onChange={value => setDraft(endpoint, { customRate: value })} max={1e18} unit="bit/s"
        helperText="Science rate at full signal, before the Antenna speed multiplier. Needed only when this craft sends science." />}
    </Stack>
  }

  const sourceIds = new Set(reference ? [orbitA?.sourceId, orbitB?.sourceId, center?.sourceId, 'commnet-signal-strength'] : ['commnet-signal-strength'])
  const sources = [...new Map([...interplanetarySources.filter(source => sourceIds.has(source.id)), ...radio.sources].map(source => [source.id, source])).values()]
  const colors = { available: '#92d5c6', marginal: '#e7bd7b', blocked: '#ee987d', 'out-of-range': '#ee987d' }
  const status = success ? ({ available: 'Link available', marginal: 'Link at boundary', blocked: `Blocked by ${names.center}`, 'out-of-range': 'Out of antenna range' } as const)[success.linkStatus] : ''
  const editingDraft = editingArray === 'a' ? aDraft : bDraft
  const phaseControl = <Box sx={{ px: .75 }}>
    <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
      <Typography component="label" htmlFor="signal-phase-slider" sx={{ fontSize: 12 }}>Relative phase <Box component="span" sx={{ color: 'primary.main', fontVariantNumeric: 'tabular-nums' }}>{format.format(phase)}°</Box></Typography>
      <Stack direction="row" spacing={.5}><Button size="small" onClick={() => setPhase(0)} sx={{ minWidth: 0, fontSize: 11 }}>Closest</Button><Button size="small" onClick={() => setPhase(180)} sx={{ minWidth: 0, fontSize: 11 }}>Opposite</Button></Stack>
    </Stack>
    <Slider id="signal-phase-slider" aria-label="Relative phase" value={phase} min={0} max={360} step={1} onChange={(_, value) => { if (typeof value === 'number') setPhase(value) }} getAriaValueText={value => `${value} degrees`} valueLabelDisplay="auto" valueLabelFormat={value => `${value}°`} sx={{ display: 'block', width: 'calc(100% - 12px)', mx: '6px', py: 1.5 }} />
  </Box>
  const swapControl = <Tooltip title={reference ? 'Swap planets and endpoint antennas' : 'Swap orbit radii and endpoint antennas'}>
    <IconButton aria-label="Swap signal endpoints" size="small" onClick={swap} sx={{ p: .25 }}><SwapHorizRounded sx={{ fontSize: 19 }} /></IconButton>
  </Tooltip>

  return <Box data-testid="interplanetary-planner" sx={{ minWidth: 0 }}>
    <Typography component="h3" sx={{ m: 0, fontSize: 15, fontWeight: 500 }}>Interplanetary signals</Typography>
    <Typography sx={{ mt: .25, mb: 1.5, fontSize: 11, lineHeight: 1.45, color: 'text.secondary' }}>Estimate one radio link between craft near two bodies on circular orbits. Relative phase is their angle apart: 0° closest, 180° farthest. The tool doesn't use an in-game date.</Typography>
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1.5, '@media (min-width: 760px)': { gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.05fr)' } }}>
      <Stack spacing={1.5} sx={{ minWidth: 0 }}>
        <Box sx={{ pt: .5, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 1 }}>
          <TextField select fullWidth size="small" label="Signal geometry" value={geometry} onChange={event => changeGeometry(event.target.value as typeof geometry)} sx={fieldStyles}
            slotProps={{ select: { renderValue: () => geometry === 'reference' ? 'Reference' : 'Manual orbits' } }}>
            <MenuItem value="reference" disabled={presets.orbits.length === 0} sx={{ fontSize: 12 }}>Reference planets</MenuItem><MenuItem value="manual" sx={{ fontSize: 12 }}>Manual orbits</MenuItem>
          </TextField>
          <TextField select fullWidth size="small" label="Radio setup" value={radioId} onChange={event => onRadioChange(event.target.value as RadioProfileId)} sx={fieldStyles}>
            {radioProfileOptions.map(option => <MenuItem key={option.id} value={option.id} sx={{ fontSize: 12 }}>{option.name}</MenuItem>)}
          </TextField>
        </Box>
        <Typography sx={{ fontSize: 10, color: 'text.secondary', lineHeight: 1.4 }}>{radioId === 'stock' ? 'Uses stock antenna and ground-station power ratings.' : radio.description}</Typography>
        {radio.kerbalism && dampingControls}
        {radio.kerbalism && rateControls}
        {reference ? <>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 28px minmax(0, 1fr)', gap: .5, alignItems: 'center' }}>
            <TextField select fullWidth size="small" label="Planet A" value={orbitA?.id ?? ''} onChange={event => changePlanet('a', event.target.value)} sx={fieldStyles}>
              {presets.centers.flatMap(primary => [<ListSubheader key={primary.id} sx={{ fontSize: 10, lineHeight: '24px' }}>{primary.name}</ListSubheader>, ...presets.orbits.filter(orbit => orbit.parentBodyId === primary.id).map(orbit => <MenuItem key={orbit.id} value={orbit.id} sx={{ fontSize: 12 }}>{orbit.name}</MenuItem>)])}
            </TextField>
            {swapControl}
            <TextField select fullWidth size="small" label="Planet B" value={orbitB?.id ?? ''} onChange={event => changePlanet('b', event.target.value)} sx={fieldStyles}>
              {bOptions.map(orbit => <MenuItem key={orbit.id} value={orbit.id} sx={{ fontSize: 12 }}>{orbit.name}</MenuItem>)}
            </TextField>
          </Box>
          <Typography sx={{ fontSize: 10, color: 'text.secondary', lineHeight: 1.4 }}>Both bodies orbit {names.center}. Reference orbit radii: {orbitA ? distance(orbitA.semiMajorAxisM) : '—'} / {orbitB ? distance(orbitB.semiMajorAxisM) : '—'}. Use Manual orbits to enter different radii around one shared center.</Typography>
        </> : <>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 28px minmax(0, 1fr)', gap: .5, alignItems: 'center' }}>
            <NumberField label="Orbit radius A" value={manual.a} onChange={value => setManual(previous => ({ ...previous, a: value, initialized: true }))} unit="Gm" min={Number.MIN_VALUE} />
            {swapControl}
            <NumberField label="Orbit radius B" value={manual.b} onChange={value => setManual(previous => ({ ...previous, b: value, initialized: true }))} unit="Gm" min={Number.MIN_VALUE} />
          </Box>
          <NumberField label="Central radius" value={manual.center} onChange={value => setManual(previous => ({ ...previous, center: value, initialized: true }))} unit="km" min={Number.MIN_VALUE} />
          <Typography sx={{ fontSize: 10, color: 'text.secondary', lineHeight: 1.4 }}>Enter both orbit radii from the same center, not as altitudes above a surface. Central radius is the radius of the body at that center. Separate star systems and wormholes aren't modeled.</Typography>
        </>}
        <TextField select fullWidth size="small" label="Receiving endpoint" value={receivingEndpoint} onChange={event => setReceivingEndpoint(event.target.value as 'a' | 'b')} sx={fieldStyles}>
          <MenuItem value="a" sx={{ fontSize: 12 }}>A · Relay / DSN</MenuItem><MenuItem value="b" sx={{ fontSize: 12 }}>B · Relay / DSN</MenuItem>
        </TextField>
        <Typography sx={{ fontSize: 10, color: 'text.secondary', lineHeight: 1.4 }}>{receivingEndpoint === 'a' ? 'B sends → A receives' : 'A sends → B receives'}. A receiving craft needs a relay antenna; only relay antennas in its array count. DSN can receive directly.</Typography>
        <Box sx={{ pt: .25, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1 }}>{endpointFields('a')}{endpointFields('b')}</Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1 }}>
          <NumberField label="Range multiplier" value={rangeMultiplier} onChange={onRangeMultiplierChange} min={Number.MIN_VALUE} max={100} />
          <NumberField label="Occlusion factor" value={occlusionFactor} onChange={setOcclusionFactor} min={Number.MIN_VALUE} max={1} />
        </Box>
        <Typography sx={{ fontSize: 10, color: 'text.secondary', lineHeight: 1.4 }}>Range multiplier scales maximum link distance; 2 doubles it. Occlusion factor scales the blocking radius: 1 is full size, 0.9 is 90%.</Typography>
        {(aDraft.selection.startsWith('dsn:') || bDraft.selection.startsWith('dsn:')) && <Typography sx={{ fontSize: 10, color: 'text.secondary', lineHeight: 1.4 }}>DSN is KSP's ground-station network. The selected Tracking Station level sets its receiving power.</Typography>}
        {(aDraft.selection === 'custom' || bDraft.selection === 'custom') && <Typography sx={{ fontSize: 10, color: 'text.secondary', lineHeight: 1.4 }}>Custom power uses KSP's antenna rating in metres, not watts. It is used as entered; Radio setup does not rescale it.</Typography>}
      </Stack>
      <Stack spacing={1} sx={{ minWidth: 0 }}>
        {firstMissing ? <UnavailableAntennaAlert
          names={[...new Set(missingEndpoints.flatMap(endpoint => endpoint.names))]}
          restoreLabel={restoreRadio.name} onRestore={() => onRadioChange(restoreRadio.id)}
          replaceLabel={firstMissing.draft.selection === 'array' ? 'Edit antenna array' : 'Use RA-100'}
          onReplace={() => { if (firstMissing.draft.selection === 'array') setEditingArray(firstMissing.endpoint); else setDraft(firstMissing.endpoint, { selection: 'ra-100' }) }}
        /> : receiverNeedsRelay ? <Alert severity="warning" data-testid="signal-receiver-warning" sx={{ fontSize: 12, '& .MuiAlert-message': { minWidth: 0 } }}>
          <Typography sx={{ fontSize: 12, lineHeight: 1.45 }}>Choose a relay antenna or a DSN level for receiving endpoint {receivingEndpoint.toUpperCase()}.</Typography>
          <Button size="small" onClick={() => setDraft(receivingEndpoint, { selection: 'ra-100' })} sx={{ mt: .5, minHeight: 32, px: 1, fontSize: 11 }}>Use RA-100</Button>
        </Alert> : success ? <>
          <Typography role="status" data-testid="signal-link-status" sx={{ fontSize: 12, fontWeight: 500, color: colors[success.linkStatus] }}>{status}</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: .75 }}>
            <Metric label="Current separation" value={distance(success.distanceM)} testId="signal-distance" />
            <Metric label={radio.kerbalism ? 'Kerbalism signal' : 'Signal now'} value={strength(radio.kerbalism ? success.dampedStrength : success.signalStrength)} testId="signal-strength" color={colors[success.linkStatus]} />
          </Box>
          {radio.kerbalism && <>
            <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>Raw CommNet signal <Box component="output" data-testid="signal-raw-strength" sx={{ color: 'text.primary', fontVariantNumeric: 'tabular-nums' }}>{strength(success.signalStrength)}</Box></Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: .75 }}>
              <Metric label={`Science rate · ${scienceDirection}`} value={rate ? formatBitrate(rate.rateBitsPerSecond) : ratePlaceholder} testId="signal-science-rate" />
              <Metric label="Full-strength sender rate" value={rate ? formatBitrate(rate.fullStrengthBitsPerSecond) : ratePlaceholder} testId="signal-full-strength-rate" />
            </Box>
            {rate?.floorApplied && <Typography data-testid="signal-rate-floor" sx={{ fontSize: 10, color: 'secondary.main', lineHeight: 1.4 }}>The calculated rate is below your minimum; using {formatBitrate(minimumBitsPerSecond)}. Disconnected links stay at zero.</Typography>}
            <Typography sx={{ fontSize: 10, color: 'text.secondary', lineHeight: 1.4 }}>
              {senderBaseRate?.status === 'dsn' ? 'A DSN receives science; choose a vessel as the sender to estimate a science rate.'
                : senderBaseRate?.status === 'success' && senderBaseRate.externalCount === 0 ? 'Internal antennas do not transmit science. Select an external antenna for a science rate.'
                  : "Estimated science rate for this link. A relay's next link can be slower; complete paths home aren't calculated."}
            </Typography>
          </>}
          <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>Maximum antenna range <Box component="output" data-testid="signal-range" sx={{ color: 'text.primary', fontVariantNumeric: 'tabular-nums' }}>{distance(success.maximumRangeM)}</Box></Typography>
        </> : <Alert severity="info" sx={{ fontSize: 12 }}>{result.status === 'invalid' ? result.errors[0] : 'Enter two orbital radii and antenna powers.'}</Alert>}
        {phaseControl}
        {success && <InterplanetaryDiagram input={input} result={success} kerbalism={radio.kerbalism} receivingEndpoint={receivingEndpoint} nameA={names.a} nameB={names.b} centerName={names.center} colorA={orbitA?.color ?? '#73c8fa'} colorB={orbitB?.color ?? '#e7bd7b'} centerColor={center?.color} onPhaseChange={setPhase} />}
      </Stack>
    </Box>
    {success && <Box sx={{ mt: .5 }}>
      <Typography sx={{ mb: .5, fontSize: 11, color: 'text.secondary' }}>Closest and farthest positions · {radio.kerbalism ? 'Kerbalism signal ' : 'signal '}before blockage</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: .75 }}>
        <Metric label={`Best / closest · ${distance(success.minimumDistanceM)}`} value={strength(radio.kerbalism ? success.bestDampedStrength : success.bestRangeStrength)} testId="signal-best" />
        <Metric label={`Worst / farthest · ${distance(success.maximumDistanceM)}`} value={strength(radio.kerbalism ? success.worstDampedStrength : success.worstRangeStrength)} testId="signal-worst" />
      </Box>
    </Box>}
    <Typography sx={{ mt: 1, fontSize: 10, color: 'text.secondary', lineHeight: 1.45 }}>Checks this direct link and blocking by {names.center}. Other bodies, the ground near either craft, and routes through extra relays aren't checked.</Typography>
    <Box component="details" sx={{ mt: 1, fontSize: 11, color: 'text.secondary', '& summary': { cursor: 'pointer', minHeight: 28, color: 'primary.main' } }}>
      <Box component="summary">Signal assumptions and sources</Box>
      <Typography sx={{ mt: .5, fontSize: 11, lineHeight: 1.45 }}>Both bodies follow circular orbits in the same plane around one central body. Relative phase sets their angle apart; no date or save file is used. Manual orbits changes the two distances from that shared center. It cannot represent bodies orbiting different stars or travel through a wormhole. Closest and farthest values use these circles and ignore blockage; real eccentric or tilted orbits can produce different distances.</Typography>
      <Typography sx={{ mt: .5, fontSize: 11, lineHeight: 1.45 }}>Stock CommNet: maximum range = √(sender power × receiving relay/DSN power) × Range multiplier. Power values are KSP antenna ratings in metres, not watts. The sender uses its full antenna loadout; only relay antennas count on a receiving craft. Custom receiving power assumes relay hardware. Strength follows stock CommNet's distance curve and becomes zero when the central body blocks the link. A boundary result means the link is at its antenna range or touches the edge of the blocking body. Antennas on separate craft never combine. Only the central body is checked for blocking; other planets, moons and terrain near either craft are not checked. RealAntennas and RemoteTech use different rules and are unsupported.</Typography>
      {radio.kerbalism && <Typography sx={{ mt: .5, fontSize: 11, lineHeight: 1.45 }}>Raw CommNet strength is S; Kerbalism's adjusted signal is S^k, where k is the damping exponent. Science rate = the sender's geometric-mean external antenna rate × Antenna speed × S^k. The base rate uses all active external antenna rates, counted by quantity; it does not add them. Full-strength sender rate includes Antenna speed before signal loss. Selected antennas are assumed powered, enabled, deployed and working. Internal antennas send no science. A positive calculated rate uses your minimum science-rate setting when needed; blocked, out-of-range or zero rates stay at zero. Each extra relay can lower the final rate. Those extra links, power availability, failures, plasma blackouts and storms are not checked.</Typography>}
      <Stack spacing={.5} sx={{ mt: .75 }}>{sources.map(source => <Link key={source.id} href={source.url} target="_blank" rel="noreferrer" sx={{ fontSize: 11, lineHeight: 1.4, overflowWrap: 'anywhere' }}>{source.title}</Link>)}</Stack>
    </Box>
    {editingArray && <AntennaArrayDialog open role="client" title={`Endpoint ${editingArray.toUpperCase()} antenna array`} description={editingArray === receivingEndpoint ? 'Antennas fitted to the receiving craft. Only relay antennas help receive this link. Direct antennas stay in the loadout for sending; the combined power shown here is the sending rating.' : 'Antennas fitted to one sending craft. Direct and relay antennas may work together. Antennas on separate craft do not combine.'}
      entries={editingDraft.array ?? [{ antennaId: radio.vesselAntennas.some(antenna => antenna.id === editingDraft.selection) ? editingDraft.selection : 'ra-100', count: 1 }]}
      antennas={radio.vesselAntennas} radioLabel={radio.name} onClose={() => setEditingArray(null)} onApply={entries => { setDraft(editingArray, { selection: 'array', array: entries }); setEditingArray(null) }} />}
  </Box>
}
