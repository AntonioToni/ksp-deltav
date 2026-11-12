import { useMemo, useState } from 'react'
import {
  Alert, Box, Button, IconButton, InputAdornment, Link, ListSubheader, MenuItem,
  Slider, Stack, TextField, Tooltip, Typography,
} from '@mui/material'
import SwapHorizRounded from '@mui/icons-material/SwapHorizRounded'
import type { PlanetPack } from '../types/planner'
import { getInterplanetaryPresets, interplanetarySources } from '../data/interplanetary'
import { getRadioProfile, radioProfileOptions, type RadioProfileId } from '../data/radioProfiles'
import { calculateAntennaArray, type AntennaArrayEntry } from '../utils/antennaArray'
import { calculateInterplanetarySignal } from '../utils/interplanetary'
import AntennaArrayDialog from './AntennaArrayDialog'
import InterplanetaryDiagram from './InterplanetaryDiagram'

interface InterplanetaryPlannerProps {
  pack: PlanetPack
  initialBodyId: string | null
  radioId: RadioProfileId
  onRadioChange: (id: RadioProfileId) => void
  rangeMultiplier: string
  onRangeMultiplierChange: (value: string) => void
}

interface EndpointDraft {
  selection: string
  customPower: string
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

function NumberField({ label, value, onChange, unit, min = 0, max }: {
  label: string; value: string; onChange: (value: string) => void; unit?: string; min?: number; max?: number
}) {
  const parsed = numeric(value)
  return <TextField fullWidth size="small" type="number" label={label} value={value}
    error={value !== '' && (!Number.isFinite(parsed) || parsed < min || max !== undefined && parsed > max)}
    onChange={event => onChange(event.target.value)} sx={fieldStyles}
    slotProps={{ htmlInput: { 'aria-label': label, min, max, step: 'any' }, input: unit ? { endAdornment: <InputAdornment position="end"><Typography sx={{ fontSize: 10 }}>{unit}</Typography></InputAdornment> } : undefined }} />
}

function Metric({ label, value, testId, color }: { label: string; value: string; testId: string; color?: string }) {
  return <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, px: 1, py: .75, minWidth: 0, bgcolor: '#080f2145' }}>
    <Typography sx={{ fontSize: 10, color: 'text.secondary', lineHeight: 1.3 }}>{label}</Typography>
    <Typography component="output" data-testid={testId} sx={{ display: 'block', mt: .25, fontSize: 16, lineHeight: 1.3, fontWeight: 500, fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere', color: color ?? 'text.primary' }}>{value}</Typography>
  </Box>
}

export default function InterplanetaryPlanner({ pack, initialBodyId, radioId, onRadioChange, rangeMultiplier, onRangeMultiplierChange }: InterplanetaryPlannerProps) {
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
  const [aDraft, setADraft] = useState<EndpointDraft>({ selection: 'ra-100', customPower: '', array: null })
  const [bDraft, setBDraft] = useState<EndpointDraft>({ selection: 'ra-100', customPower: '', array: null })
  const [editingArray, setEditingArray] = useState<'a' | 'b' | null>(null)
  const radio = getRadioProfile(radioId)
  const orbitA = presets.orbits.find(orbit => orbit.id === aId) ?? firstA
  const bOptions = presets.orbits.filter(orbit => orbit.id !== orbitA?.id && orbit.parentBodyId === orbitA?.parentBodyId)
  const orbitB = bOptions.find(orbit => orbit.id === bId) ?? bOptions[0]
  const center = presets.centers.find(candidate => candidate.id === orbitA?.parentBodyId)
  const reference = geometry === 'reference'
  const arrayA = aDraft.array ? calculateAntennaArray(aDraft.array, 'client', radio.vesselAntennas) : null
  const arrayB = bDraft.array ? calculateAntennaArray(bDraft.array, 'client', radio.vesselAntennas) : null
  const power = (draft: EndpointDraft, array: typeof arrayA) => draft.selection === 'custom' ? numeric(draft.customPower)
    : draft.selection === 'array' ? array?.status === 'success' ? array.effectivePower : NaN
      : draft.selection.startsWith('dsn:') ? radio.dsnLevels.find(level => level.id === draft.selection.slice(4))?.power ?? NaN
        : radio.vesselAntennas.find(antenna => antenna.id === draft.selection)?.power ?? NaN
  const input = {
    orbitRadiusAM: reference ? orbitA?.semiMajorAxisM ?? NaN : numeric(manual.a) * 1e9,
    orbitRadiusBM: reference ? orbitB?.semiMajorAxisM ?? NaN : numeric(manual.b) * 1e9,
    centralRadiusM: reference ? center?.radiusM ?? NaN : numeric(manual.center) * 1000,
    powerA: power(aDraft, arrayA), powerB: power(bDraft, arrayB),
    rangeMultiplier: numeric(rangeMultiplier), occlusionFactor: numeric(occlusionFactor), phaseDeg: phase,
  }
  const result = calculateInterplanetarySignal(input)
  const success = result.status === 'success' ? result : null
  const names = { a: reference ? orbitA?.name ?? 'Planet A' : 'Endpoint A', b: reference ? orbitB?.name ?? 'Planet B' : 'Endpoint B', center: reference ? center?.name ?? 'Central body' : 'Manual central body' }
  const setDraft = (endpoint: 'a' | 'b', changes: Partial<EndpointDraft>) => (endpoint === 'a' ? setADraft : setBDraft)(previous => ({ ...previous, ...changes }))
  const allowDsn = (endpoint: 'a' | 'b') => !reference || (endpoint === 'a' ? orbitA?.id : orbitB?.id) === pack.transferHubBodyId

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
    setManual(previous => ({ ...previous, a: previous.b, b: previous.a }))
    setPhase(value => (360 - value) % 360)
  }

  function endpointFields(endpoint: 'a' | 'b') {
    const draft = endpoint === 'a' ? aDraft : bDraft
    const array = endpoint === 'a' ? arrayA : arrayB
    const value = endpoint === 'a' ? input.powerA : input.powerB
    const label = endpoint.toUpperCase()
    const unavailable = !['array', 'custom'].includes(draft.selection) && !draft.selection.startsWith('dsn:')
      && !radio.vesselAntennas.some(antenna => antenna.id === draft.selection)
    const unavailableName = radioProfileOptions.flatMap(profile => profile.vesselAntennas).find(antenna => antenna.id === draft.selection)?.name ?? draft.selection
    const unavailableArray = draft.selection === 'array' && draft.array?.some(entry => !radio.vesselAntennas.some(antenna => antenna.id === entry.antennaId))
    return <Stack spacing={1.25} sx={{ minWidth: 0 }}>
      <TextField select fullWidth size="small" label={`Antenna ${label}`} value={draft.selection} error={unavailable || unavailableArray}
        onChange={event => { if (event.target.value !== 'array') setDraft(endpoint, { selection: event.target.value }) }} sx={fieldStyles}
        helperText={<Box component="span" data-testid={`signal-power-${endpoint}`}>{unavailable ? 'Unavailable in this setup' : unavailableArray ? 'Edit array or restore its radio setup' : Number.isFinite(value) && value > 0 ? `Effective power ${distance(value)}` : 'Enter effective power'}</Box>}
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
      {draft.selection === 'custom' && <NumberField label={`Power ${label}`} value={draft.customPower} onChange={value => setDraft(endpoint, { customPower: value })} min={Number.MIN_VALUE} max={1e18} unit="m" />}
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

  return <Box data-testid="interplanetary-planner" sx={{ minWidth: 0 }}>
    <Typography component="h3" sx={{ m: 0, fontSize: 15, fontWeight: 500 }}>Interplanetary signals</Typography>
    <Typography sx={{ mt: .25, mb: 1.5, fontSize: 11, lineHeight: 1.45, color: 'text.secondary' }}>Explore one link between vessels near planets. Relative phase is a circular reference model, not a date.</Typography>
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
        <Typography sx={{ fontSize: 10, color: 'text.secondary', lineHeight: 1.4 }}>{radioId === 'stock' ? 'Stock antenna and DSN powers.' : radio.description}</Typography>
        {reference ? <>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 28px minmax(0, 1fr)', gap: .5, alignItems: 'center' }}>
            <TextField select fullWidth size="small" label="Planet A" value={orbitA?.id ?? ''} onChange={event => changePlanet('a', event.target.value)} sx={fieldStyles}>
              {presets.centers.flatMap(primary => [<ListSubheader key={primary.id} sx={{ fontSize: 10, lineHeight: '24px' }}>{primary.name}</ListSubheader>, ...presets.orbits.filter(orbit => orbit.parentBodyId === primary.id).map(orbit => <MenuItem key={orbit.id} value={orbit.id} sx={{ fontSize: 12 }}>{orbit.name}</MenuItem>)])}
            </TextField>
            <Tooltip title="Swap planets and endpoint antennas"><IconButton aria-label="Swap signal endpoints" size="small" onClick={swap} sx={{ p: .25 }}><SwapHorizRounded sx={{ fontSize: 19 }} /></IconButton></Tooltip>
            <TextField select fullWidth size="small" label="Planet B" value={orbitB?.id ?? ''} onChange={event => changePlanet('b', event.target.value)} sx={fieldStyles}>
              {bOptions.map(orbit => <MenuItem key={orbit.id} value={orbit.id} sx={{ fontSize: 12 }}>{orbit.name}</MenuItem>)}
            </TextField>
          </Box>
          <Typography sx={{ fontSize: 10, color: 'text.secondary', lineHeight: 1.4 }}>{names.center} · circular radii {orbitA ? distance(orbitA.semiMajorAxisM) : '—'} / {orbitB ? distance(orbitB.semiMajorAxisM) : '—'}. Pairs share one parent; use manual geometry for other configurations.</Typography>
        </> : <>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1 }}>
            <NumberField label="Orbit radius A" value={manual.a} onChange={value => setManual(previous => ({ ...previous, a: value, initialized: true }))} unit="Gm" min={Number.MIN_VALUE} />
            <NumberField label="Orbit radius B" value={manual.b} onChange={value => setManual(previous => ({ ...previous, b: value, initialized: true }))} unit="Gm" min={Number.MIN_VALUE} />
          </Box>
          <NumberField label="Central radius" value={manual.center} onChange={value => setManual(previous => ({ ...previous, center: value, initialized: true }))} unit="km" min={Number.MIN_VALUE} />
          <Typography sx={{ fontSize: 10, color: 'text.secondary', lineHeight: 1.4 }}>Radii are measured from the common center. Manual geometry is user supplied; it does not model a cross-star or wormhole path.</Typography>
        </>}
        <Box sx={{ pt: .25, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1 }}>{endpointFields('a')}{endpointFields('b')}</Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1 }}>
          <NumberField label="Range multiplier" value={rangeMultiplier} onChange={onRangeMultiplierChange} min={Number.MIN_VALUE} max={100} />
          <NumberField label="Occlusion factor" value={occlusionFactor} onChange={setOcclusionFactor} min={Number.MIN_VALUE} max={1} />
        </Box>
        <Typography sx={{ fontSize: 10, color: 'text.secondary', lineHeight: 1.4 }}>Full physical central radius at factor 1. Custom powers are final values in meters, without profile scaling. A DSN power checks this single link, not a complete home connection.</Typography>
      </Stack>
      <Stack spacing={1} sx={{ minWidth: 0 }}>
        {success ? <>
          <Typography role="status" data-testid="signal-link-status" sx={{ fontSize: 12, fontWeight: 500, color: colors[success.linkStatus] }}>{status}</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: .75 }}>
            <Metric label="Current separation" value={distance(success.distanceM)} testId="signal-distance" />
            <Metric label="Signal now" value={strength(success.signalStrength)} testId="signal-strength" color={colors[success.linkStatus]} />
          </Box>
          <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>Maximum antenna range <Box component="output" data-testid="signal-range" sx={{ color: 'text.primary', fontVariantNumeric: 'tabular-nums' }}>{distance(success.maximumRangeM)}</Box></Typography>
        </> : <Alert severity="info" sx={{ fontSize: 12 }}>{result.status === 'invalid' ? result.errors[0] : 'Enter two orbital radii and antenna powers.'}</Alert>}
        {phaseControl}
        {success && <InterplanetaryDiagram input={input} result={success} nameA={names.a} nameB={names.b} centerName={names.center} colorA={orbitA?.color ?? '#73c8fa'} colorB={orbitB?.color ?? '#e7bd7b'} centerColor={center?.color} onPhaseChange={setPhase} />}
      </Stack>
    </Box>
    {success && <Box sx={{ mt: .5 }}>
      <Typography sx={{ mb: .5, fontSize: 11, color: 'text.secondary' }}>Circular-reference envelope · range only, before occlusion</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: .75 }}>
        <Metric label={`Best / closest · ${distance(success.minimumDistanceM)}`} value={strength(success.bestRangeStrength)} testId="signal-best" />
        <Metric label={`Worst / farthest · ${distance(success.maximumDistanceM)}`} value={strength(success.worstRangeStrength)} testId="signal-worst" />
      </Box>
    </Box>}
    <Typography sx={{ mt: 1, fontSize: 10, color: 'text.secondary', lineHeight: 1.45 }}>Central-body obstruction can reduce the actual signal to zero. These circular-reference bounds omit eccentricity, inclination, and dates. Local horizons, other planets or stars, and complete relay paths remain unchecked.</Typography>
    <Box component="details" sx={{ mt: 1, fontSize: 11, color: 'text.secondary', '& summary': { cursor: 'pointer', minHeight: 28, color: 'primary.main' } }}>
      <Box component="summary">Signal assumptions and sources</Box>
      <Typography sx={{ mt: .5, fontSize: 11, lineHeight: 1.45 }}>Stock CommNet: maximum range = √(power A × power B) × range multiplier. Signal uses the stock smoothstep curve; the central spherical occluder masks it to zero when blocked. Exact limb and range boundaries are marginal. Antennas on different craft never combine into one endpoint. RealAntennas and RemoteTech are not modeled.</Typography>
      {radio.kerbalism && <Typography sx={{ mt: .5, fontSize: 11, lineHeight: 1.45 }}>Kerbalism retains this CommNet signal curve. Science transmission rates, electric charge, deployment state, and storms are not calculated. This symmetric antenna-range reference does not verify forwarding: a receiving vessel needs a relay-capable antenna, and a complete home path remains unchecked.</Typography>}
      <Stack spacing={.5} sx={{ mt: .75 }}>{sources.map(source => <Link key={source.id} href={source.url} target="_blank" rel="noreferrer" sx={{ fontSize: 11, lineHeight: 1.4, overflowWrap: 'anywhere' }}>{source.title}</Link>)}</Stack>
    </Box>
    {editingArray && <AntennaArrayDialog open role="client" title={`Endpoint ${editingArray.toUpperCase()} antenna array`} description="This loadout is on one vessel. Direct and relay-capable antennas may combine for this endpoint; separate vessels never combine their power."
      entries={editingDraft.array ?? [{ antennaId: radio.vesselAntennas.some(antenna => antenna.id === editingDraft.selection) ? editingDraft.selection : 'ra-100', count: 1 }]}
      antennas={radio.vesselAntennas} radioLabel={radio.name} onClose={() => setEditingArray(null)} onApply={entries => { setDraft(editingArray, { selection: 'array', array: entries }); setEditingArray(null) }} />}
  </Box>
}
