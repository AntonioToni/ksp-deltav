import { useState } from 'react'
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  IconButton, InputAdornment, Link, MenuItem, Stack, Tab, Tabs, TextField,
  ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material'
import CloseRounded from '@mui/icons-material/CloseRounded'
import type { CelestialBody, PlanetPack } from '../types/planner'
import {
  commNetSources, findRelayBodyPreset,
} from '../data/commnet'
import { defaultRadioProfileId, getRadioProfile, radioProfileOptions, type RadioProfileId } from '../data/radioProfiles'
import { getKerbalismHomeOrbitRadiusM, getKerbalismRadioProfileId } from '../data/kerbalism'
import { calibrateKerbalismDamping } from '../utils/signalStrength'
import { calculateAntennaArray, type AntennaArrayEntry, type AntennaArrayRole } from '../utils/antennaArray'
import { calculateRelayPlan, type RelayNetworkInput } from '../utils/relay'
import { suggestRelayAltitudeKm } from '../utils/relayDefaults'
import {
  calculateKerbalismBitrate, resolveKerbalismBaseRate,
  DEFAULT_KERBALISM_ANTENNA_SPEED, DEFAULT_KERBALISM_MINIMUM_BITS_PER_SECOND,
} from '../utils/kerbalismBitrate'
import { formatBitrate } from '../utils/formatBitrate'
import AntennaArrayDialog from './AntennaArrayDialog'
import RelayDiagram from './RelayDiagram'
import InterplanetaryPlanner from './InterplanetaryPlanner'
import KerbalismDampingControls, { type KerbalismDampingMode } from './KerbalismDampingControls'
import KerbalismRateControls from './KerbalismRateControls'
import UnavailableAntennaAlert from './UnavailableAntennaAlert'

interface RelayPlannerDialogProps {
  open: boolean
  pack: PlanetPack
  initialBodyId: string | null
  onClose: () => void
}

interface BodyDraft {
  radius: string
  mu: string
  atmosphere: string
  soi: string
  altitude: string
  altitudeAutomatic: boolean
  edited: boolean
}

const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })
const signalNumber = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })
const signalPercent = (value: number) => value > 0 && value < .0001 ? '<0.01%' : `${signalNumber.format(value * 100)}%`
const fieldStyles = {
  minWidth: 0,
  '& .MuiInputBase-root': { fontSize: 12, minHeight: 38 },
  '& .MuiInputLabel-root': { fontSize: 11 },
  '& .MuiSelect-select': { py: 1, pr: '28px !important' },
  '& .MuiFormHelperText-root': { mx: 0, fontSize: 10 },
} as const
const compact = '@media (max-height: 500px)'

function numeric(text: string): number {
  return text.trim() === '' ? NaN : Number(text)
}

function automaticAltitude(draft: Pick<BodyDraft, 'radius' | 'atmosphere' | 'soi'>, marginKm: number): string {
  return suggestRelayAltitudeKm(numeric(draft.radius), numeric(draft.atmosphere), marginKm, numeric(draft.soi))
}

function profile(body: CelestialBody | undefined, marginKm = 10): BodyDraft {
  const preset = body ? findRelayBodyPreset(body) : undefined
  return {
    radius: preset ? String(preset.radiusM / 1000) : '',
    mu: preset ? String(preset.gravitationalParameter) : '',
    atmosphere: preset ? String(preset.atmosphereHeightM / 1000) : body?.hasAtmosphere ? '' : '0',
    soi: preset?.sphereOfInfluenceM !== undefined ? String(preset.sphereOfInfluenceM / 1000) : '',
    altitude: preset ? suggestRelayAltitudeKm(preset.radiusM / 1000, preset.atmosphereHeightM / 1000, marginKm,
      preset.sphereOfInfluenceM === undefined ? undefined : preset.sphereOfInfluenceM / 1000) : '',
    altitudeAutomatic: true,
    edited: false,
  }
}

function duration(seconds: number): string {
  const total = Math.round(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor(total % 3600 / 60)
  const remainder = total % 60
  return hours ? `${number.format(hours)}h ${minutes}m ${remainder}s` : minutes ? `${minutes}m ${remainder}s` : `${remainder}s`
}

function distance(value: number): string {
  return `${number.format(value / 1000)} km`
}

function range(value: number): string {
  return value >= 1e9 ? `${number.format(value / 1e9)} Gm` : value >= 1e6 ? `${number.format(value / 1e6)} Mm` : distance(value)
}

function Metric({ label, value, testId, color, rawValue, rawTestId }: { label: string; value: string; testId?: string; color?: string; rawValue?: string; rawTestId?: string }) {
  return <Box sx={{ px: 1, py: { xs: .25, sm: .5 }, minWidth: 0, border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: '#080f2145', [compact]: { py: .25 } }}>
    <Typography sx={{ fontSize: 10, lineHeight: 1.2, color: 'text.secondary' }}>{label}</Typography>
    <Typography component="output" data-testid={testId} sx={{ display: 'block', mt: { xs: .125, sm: .25 }, fontSize: { xs: 14, sm: 15 }, lineHeight: 1.25, fontWeight: 500, fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere', color: color ?? 'text.primary', [compact]: { fontSize: 13, mt: 0 } }}>{value}</Typography>
    {rawValue !== undefined && <Typography sx={{ mt: .25, fontSize: 10, lineHeight: 1.3, color: 'text.secondary' }}>Raw CommNet <Box component="output" data-testid={rawTestId} sx={{ fontVariantNumeric: 'tabular-nums' }}>{rawValue}</Box></Typography>}
  </Box>
}

function NumericField({ label, value, onChange, unit, min = 0, max, optional = false }: { label: string; value: string; onChange: (value: string) => void; unit?: string; min?: number; max?: number; optional?: boolean }) {
  const parsed = numeric(value)
  const invalid = value !== '' && (!Number.isFinite(parsed) || parsed < min || max !== undefined && parsed > max)
  return <TextField fullWidth size="small" type="number" label={label} value={value} error={invalid} onChange={event => onChange(event.target.value)}
    placeholder={optional ? 'Not supplied' : undefined} slotProps={{ htmlInput: { 'aria-label': label, min, max, step: 'any' }, input: unit ? { endAdornment: <InputAdornment position="end"><Typography sx={{ fontSize: 10 }}>{unit}</Typography></InputAdornment> } : undefined }} sx={fieldStyles} />
}

function RelayContent({ pack, initialBodyId, onClose }: Omit<RelayPlannerDialogProps, 'open'>) {
  const bodies = pack.bodies.filter(body => body.kind === 'planet' || body.kind === 'moon')
  const first = bodies.find(body => body.id === initialBodyId) ?? bodies.find(body => body.id === pack.transferHubBodyId) ?? bodies[0]
  const [bodyId, setBodyId] = useState(first?.id ?? '')
  const [profiles, setProfiles] = useState(() => new Map(first ? [[first.id, profile(first)]] : []))
  const body = bodies.find(candidate => candidate.id === bodyId) ?? first
  const current = profiles.get(bodyId) ?? profile(body)
  const preset = body ? findRelayBodyPreset(body) : undefined
  const source = commNetSources.find(candidate => candidate.id === preset?.sourceId)
  const usesRssBodyData = preset?.sourceId === 'commnet-rss-bodies'
  const [radioId, setRadioId] = useState<RadioProfileId>(() => defaultRadioProfileId(pack.id))
  const radioProfile = getRadioProfile(radioId)
  const { relayAntennas, clientAntennas, vesselAntennas, dsnLevels } = radioProfile
  const [dampingMode, setDampingMode] = useState<KerbalismDampingMode>('automatic')
  const [customExponent, setCustomExponent] = useState('6')
  const homeOrbitRadiusM = getKerbalismHomeOrbitRadiusM(pack)
  const maximumDsnPowerM = dsnLevels.at(-1)?.power ?? NaN
  const calibration = calibrateKerbalismDamping(homeOrbitRadiusM, maximumDsnPowerM)
  const dampingExponent = radioProfile.kerbalism ? dampingMode === 'automatic' ? calibration.exponent : numeric(customExponent) : 1
  const dampingControls = radioProfile.kerbalism ? <KerbalismDampingControls mode={dampingMode} customExponent={customExponent} onModeChange={setDampingMode} onExponentChange={setCustomExponent} calibration={calibration} homeOrbitRadiusM={homeOrbitRadiusM} maximumDsnPowerM={maximumDsnPowerM} /> : null
  const [antennaSpeed, setAntennaSpeed] = useState(String(DEFAULT_KERBALISM_ANTENNA_SPEED))
  const [minimumBitsPerSecond, setMinimumBitsPerSecond] = useState(String(DEFAULT_KERBALISM_MINIMUM_BITS_PER_SECOND))
  const rateControls = radioProfile.kerbalism ? <KerbalismRateControls antennaSpeed={antennaSpeed} minimumBitsPerSecond={minimumBitsPerSecond} onSpeedChange={setAntennaSpeed} onMinimumChange={setMinimumBitsPerSecond} /> : null
  const [tab, setTab] = useState<'network' | 'deployment' | 'body' | 'signals'>(() => !first ? 'signals' : findRelayBodyPreset(first) ? 'network' : 'body')
  const [signalsOpened, setSignalsOpened] = useState(!first)
  const [satelliteCount, setSatelliteCount] = useState(3)
  const [relayId, setRelayId] = useState(relayAntennas.find(antenna => antenna.id === 'hg-5')?.id ?? relayAntennas[0]?.id ?? '')
  const [clientId, setClientId] = useState(clientAntennas.find(antenna => antenna.id === 'communotron-16')?.id ?? clientAntennas[0]?.id ?? '')
  const [dsnId, setDsnId] = useState(dsnLevels.at(-1)?.id ?? '')
  const [relayCustomPower, setRelayCustomPower] = useState('')
  const [clientCustomPower, setClientCustomPower] = useState('')
  const [dsnCustomPower, setDsnCustomPower] = useState('')
  const [relayCustomRate, setRelayCustomRate] = useState('')
  const [clientCustomRate, setClientCustomRate] = useState('')
  const [relayArray, setRelayArray] = useState<AntennaArrayEntry[] | null>(null)
  const [clientArray, setClientArray] = useState<AntennaArrayEntry[] | null>(null)
  const [editingArray, setEditingArray] = useState<{ role: AntennaArrayRole; entries: AntennaArrayEntry[] } | null>(null)
  const [occlusion, setOcclusion] = useState<'full' | 'normal'>('full')
  const [rangeMultiplier, setRangeMultiplier] = useState('1')
  const [safetyMargin, setSafetyMargin] = useState('10')
  const [deploymentMode, setDeploymentMode] = useState<'lower' | 'higher'>('lower')
  const [phase, setPhase] = useState(0)
  const relayArrayResult = relayArray ? calculateAntennaArray(relayArray, 'relay', vesselAntennas) : null
  const clientArrayResult = clientArray ? calculateAntennaArray(clientArray, 'client', vesselAntennas) : null
  const normalOcclusionFactor = numeric(current.atmosphere) > 0 ? radioProfile.normalOcclusion.atmospheric : radioProfile.normalOcclusion.vacuum

  function openArray(role: AntennaArrayRole) {
    const saved = role === 'relay' ? relayArray : clientArray
    const selectedId = role === 'relay' ? relayId : clientId
    const options = role === 'relay' ? relayAntennas : vesselAntennas
    const antenna = options.find(option => option.id === selectedId)
      ?? options.find(option => option.id === (role === 'relay' ? 'hg-5' : 'communotron-16')) ?? options[0]!
    setEditingArray({ role, entries: saved ?? [{ antennaId: antenna.id, count: 1 }] })
  }

  function applyArray(entries: AntennaArrayEntry[]) {
    if (editingArray?.role === 'relay') {
      setRelayArray(entries)
      setRelayId('array')
    } else if (editingArray?.role === 'client') {
      setClientArray(entries)
      setClientId('array')
    }
    setEditingArray(null)
  }

  function changeProfile(changes: Partial<BodyDraft>, marginKm = numeric(safetyMargin)) {
    const next = { ...current, ...changes }
    if (next.altitudeAutomatic) next.altitude = automaticAltitude(next, marginKm)
    setProfiles(previous => new Map(previous).set(bodyId, next))
  }

  function changeBody(id: string) {
    const nextBody = bodies.find(candidate => candidate.id === id)
    if (!nextBody) return
    const cached = profiles.get(id)
    const next = cached?.altitudeAutomatic
      ? { ...cached, altitude: automaticAltitude(cached, numeric(safetyMargin)) }
      : cached ?? profile(nextBody, numeric(safetyMargin))
    setProfiles(previous => new Map(previous).set(id, next))
    setBodyId(id)
    setPhase(0)
    if (!Number.isFinite(numeric(next.radius)) || !Number.isFinite(numeric(next.mu))) setTab('body')
  }

  const input: RelayNetworkInput = {
    body: {
      radiusM: numeric(current.radius) * 1000,
      gravitationalParameter: numeric(current.mu),
      atmosphereHeightM: numeric(current.atmosphere) * 1000,
      ...(current.soi.trim() ? { sphereOfInfluenceM: numeric(current.soi) * 1000 } : {}),
    },
    hasSurface: body?.hasSurface ?? false,
    satelliteCount,
    altitudeM: numeric(current.altitude) * 1000,
    relayPower: relayId === 'array' ? relayArrayResult?.status === 'success' ? relayArrayResult.effectivePower : NaN
      : relayId === 'custom' ? numeric(relayCustomPower) : relayAntennas.find(antenna => antenna.id === relayId)?.power ?? NaN,
    clientPower: clientId === 'array' ? clientArrayResult?.status === 'success' ? clientArrayResult.effectivePower : NaN
      : clientId === 'custom' ? numeric(clientCustomPower) : clientAntennas.find(antenna => antenna.id === clientId)?.power ?? NaN,
    dsnPower: dsnId === 'custom' ? numeric(dsnCustomPower) : dsnLevels.find(level => level.id === dsnId)?.power ?? NaN,
    rangeMultiplier: numeric(rangeMultiplier),
    occlusionFactor: occlusion === 'full' ? 1 : normalOcclusionFactor,
    phaseDeg: phase,
    stationLongitudeDeg: 0,
    safetyMarginM: numeric(safetyMargin) * 1000,
    deploymentMode,
    dampingExponent,
  }
  const missingParts = (id: string, array: AntennaArrayEntry[] | null, options: readonly { id: string }[]) => id === 'array'
    ? array?.filter(entry => !options.some(antenna => antenna.id === entry.antennaId)).map(entry => entry.antennaId) ?? []
    : id !== 'custom' && !options.some(antenna => antenna.id === id) ? [id] : []
  const missingRelay = missingParts(relayId, relayArray, relayAntennas)
  const missingClient = missingParts(clientId, clientArray, vesselAntennas)
  const missingIds = [...missingRelay, ...missingClient]
  const missingNames = missingIds.map(id => radioProfileOptions.flatMap(profile => profile.vesselAntennas).find(antenna => antenna.id === id)?.name ?? id)
  const restoreProfileId = getKerbalismRadioProfileId(radioId)
  const missingArrayRole = missingRelay.length && relayId === 'array' ? 'relay' : missingClient.length && clientId === 'array' ? 'client' : null
  const result = calculateRelayPlan(input)
  const success = result.status === 'success' ? result : null
  const relayBaseRate = radioProfile.kerbalism ? resolveKerbalismBaseRate({ selection: relayId, customPower: relayCustomPower, array: relayArray }, vesselAntennas, numeric(relayCustomRate)) : null
  const clientBaseRate = radioProfile.kerbalism ? resolveKerbalismBaseRate({ selection: clientId, customPower: clientCustomPower, array: clientArray }, vesselAntennas, numeric(clientCustomRate)) : null
  const rateFor = (base: typeof relayBaseRate, rawStrength: number | null, linkAvailable: boolean) => base?.status === 'success' && rawStrength !== null
    ? calculateKerbalismBitrate({ baseRateBitsPerSecond: base.baseRateBitsPerSecond, rawStrength, dampingExponent, antennaSpeed: numeric(antennaSpeed), minimumBitsPerSecond: numeric(minimumBitsPerSecond), linkAvailable }) : null
  const neighborRate = success ? rateFor(relayBaseRate, success.neighborSignalStrength, success.ringLinkStatus === 'available' || success.ringLinkStatus === 'marginal') : null
  const stationRate = success ? rateFor(clientBaseRate, success.bestStationSignalStrength, success.stationLinks.some(link => link.status === 'available' || link.status === 'marginal')) : null
  const rateValue = (base: typeof relayBaseRate, rate: typeof neighborRate) => rate?.status === 'success' ? formatBitrate(rate.rateBitsPerSecond)
    : base?.status === 'needs-rate' ? 'Enter full-strength rate' : base?.status === 'success' ? 'Check rate settings' : 'Check antenna rate'
  const rateFloorApplied = neighborRate?.status === 'success' && neighborRate.floorApplied || stationRate?.status === 'success' && stationRate.floorApplied
  const ringLabel = success ? ({ available: 'Available', marginal: 'At limit', blocked: 'Body blocks links', 'out-of-range': 'Out of range' } as const)[success.ringLinkStatus] : '—'
  const statusColor = success?.ringLinkStatus === 'available' ? '#92d5c6' : success?.ringLinkStatus === 'marginal' ? 'secondary.main' : '#ee987d'
  const coverage = success?.equatorialCoverageFraction === null ? 'No surface' : success ? `${number.format(success.equatorialCoverageFraction! < 1 ? Math.min(99.9, success.equatorialCoverageFraction! * 100) : 100)}%` : '—'

  function antennaField(label: string, value: string, setValue: (value: string) => void, options: readonly { id: string; name: string; power: number }[], role?: AntennaArrayRole) {
    const array = role === 'relay' ? relayArray : clientArray
    const arrayResult = role === 'relay' ? relayArrayResult : clientArrayResult
    const unavailable = value !== 'array' && value !== 'custom' && !options.some(option => option.id === value)
    const unavailableName = radioProfileOptions.flatMap(profile => profile.vesselAntennas).find(antenna => antenna.id === value)?.name ?? value
    const unavailableArray = value === 'array' && array?.some(entry => !vesselAntennas.some(antenna => antenna.id === entry.antennaId))
    const summary = array?.map(entry => `${entry.count} × ${vesselAntennas.find(antenna => antenna.id === entry.antennaId)?.name ?? entry.antennaId}`).join(', ')
    const power = role === 'relay' ? input.relayPower : role === 'client' ? input.clientPower : input.dsnPower
    const selectedName = value === 'array' ? `${summary} · Effective power ${range(arrayResult?.status === 'success' ? arrayResult.effectivePower : 0)}`
      : value === 'custom' ? 'Custom power' : unavailable ? `${unavailableName} (unavailable)` : options.find(option => option.id === value)?.name ?? ''
    const compactName = value === 'array' ? `Array (${arrayResult?.status === 'success' ? arrayResult.totalCount : '—'})`
      : selectedName.replace(/^Communotron\s*/i, '').replace(/^DSN level\s*/i, 'Level ').replace('Custom power', 'Custom')
    return <TextField select fullWidth size="small" label={label} value={value} error={unavailable || unavailableArray} onChange={event => { if (event.target.value !== 'array') setValue(event.target.value) }} helperText={<Box component="span" data-testid={`relay-${role ?? 'dsn'}-power`}>{unavailable ? 'Unavailable in this setup' : unavailableArray ? 'Edit array or restore its radio setup' : Number.isFinite(power) && power > 0 ? range(power) : 'Enter power'}</Box>} slotProps={{ select: { renderValue: () => <Box component="span" title={`${selectedName} · ${Number.isFinite(power) ? range(power) : 'Enter power'}`}>{compactName}</Box> } }} sx={fieldStyles}>
      {unavailable && <MenuItem value={value} disabled sx={{ fontSize: 12 }}>{unavailableName} (unavailable)</MenuItem>}
      {options.map(option => <MenuItem key={option.id} value={option.id} sx={{ fontSize: 12 }}>{option.name}</MenuItem>)}
      {role && <MenuItem value="array" onClick={() => openArray(role)} sx={{ fontSize: 12 }}>Antenna array…</MenuItem>}
      <MenuItem value="custom" sx={{ fontSize: 12 }}>Custom power</MenuItem>
    </TextField>
  }

  return <>
    <DialogTitle id="relay-planner-title-row" sx={{ px: 1.5, py: .5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, fontSize: 16, lineHeight: 1.5 }}>
      <Box component="span" id="relay-planner-heading">CommNet relay planner</Box>
      <IconButton aria-label="Close relay planner" size="small" onClick={onClose}><CloseRounded sx={{ fontSize: 19 }} /></IconButton>
    </DialogTitle>
    <Box sx={{ px: 1.5, pt: 1.5, pb: .75, display: tab === 'signals' || !body ? 'none' : 'flex', alignItems: 'center', flexWrap: { xs: 'wrap', sm: 'nowrap' }, columnGap: 1, rowGap: .5, minWidth: 0 }}>
      <TextField select fullWidth size="small" label="Relay body" value={bodyId} onChange={event => changeBody(event.target.value)} sx={{ ...fieldStyles, maxWidth: 380 }}>
        {bodies.map(candidate => <MenuItem key={candidate.id} value={candidate.id} sx={{ fontSize: 12 }}>{candidate.name}</MenuItem>)}
      </TextField>
      <Typography sx={{ display: usesRssBodyData ? 'block' : { xs: 'none', sm: 'block' }, flexBasis: usesRssBodyData ? { xs: '100%', sm: 'auto' } : undefined, fontSize: 11, lineHeight: 1.35, color: 'text.secondary', minWidth: 0, overflowWrap: 'anywhere' }}>{usesRssBodyData ? 'RSS body data' : pack.shortName ?? pack.name} · {radioProfile.name}</Typography>
    </Box>
    <Tabs value={tab} onChange={(_, value: typeof tab) => { setTab(value); if (value === 'signals') setSignalsOpened(true) }} aria-label="Relay planner sections" variant="fullWidth" sx={{ px: 1.5, minHeight: 32, borderBottom: '1px solid', borderColor: 'divider', '& .MuiTab-root': { minHeight: 32, minWidth: 0, py: .5, px: 1, fontSize: 12, textTransform: 'none' } }}>
      <Tab id="relay-network-tab" aria-controls="relay-network-panel" value="network" label="Network" disabled={!body} />
      <Tab id="relay-deployment-tab" aria-controls="relay-deployment-panel" value="deployment" label="Deployment" disabled={!body} />
      <Tab id="relay-body-tab" aria-controls="relay-body-panel" value="body" label="Body data" disabled={!body} />
      <Tab id="relay-signals-tab" aria-controls="relay-signals-panel" value="signals" label="Signals" />
    </Tabs>
    <DialogContent sx={{ p: 1.5, minWidth: 0, minHeight: 0, overflowY: 'auto', [compact]: { pb: 1 } }}>
      <Box role="tabpanel" id="relay-signals-panel" aria-labelledby="relay-signals-tab" hidden={tab !== 'signals'} sx={{ display: tab === 'signals' ? 'block' : 'none', minWidth: 0 }}>
        {signalsOpened && <InterplanetaryPlanner pack={pack} initialBodyId={initialBodyId} radioId={radioId} onRadioChange={setRadioId} rangeMultiplier={rangeMultiplier} onRangeMultiplierChange={setRangeMultiplier} dampingExponent={dampingExponent} dampingControls={dampingControls} antennaSpeed={numeric(antennaSpeed)} minimumBitsPerSecond={numeric(minimumBitsPerSecond)} rateControls={rateControls} />}
      </Box>
      <Box sx={{ display: tab === 'signals' || !body ? 'none' : 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1.25, '@media (min-width: 600px)': { gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' } }}>
        <Box role={tab === 'signals' ? undefined : 'tabpanel'} id={tab === 'signals' ? undefined : `relay-${tab}-panel`} aria-labelledby={tab === 'signals' ? undefined : `relay-${tab}-tab`} sx={{ minWidth: 0, containerType: 'inline-size' }}>
          {tab === 'network' && <Stack spacing={.5}>
            <TextField select fullWidth size="small" label="Radio setup" value={radioId} onChange={event => setRadioId(event.target.value as RadioProfileId)} sx={fieldStyles}>
              {radioProfileOptions.map(option => <MenuItem key={option.id} value={option.id} sx={{ fontSize: 12 }}>{option.name}</MenuItem>)}
            </TextField>
            <Typography sx={{ fontSize: 10, lineHeight: 1.4, color: 'text.secondary' }}>{radioProfile.description}</Typography>
            {dampingControls}
            {rateControls}
            <Box sx={{ pt: 1, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, .7fr)', gap: .75 }}>
              <NumericField label="Orbit altitude" value={current.altitude} unit="km" onChange={value => changeProfile({ altitude: value, altitudeAutomatic: false })} />
              <TextField select fullWidth size="small" label="Relay count" value={satelliteCount} onChange={event => setSatelliteCount(Number(event.target.value))} sx={fieldStyles}>
                {Array.from({ length: 11 }, (_, index) => index + 2).map(count => <MenuItem key={count} value={count} sx={{ fontSize: 12 }}>{count} relays</MenuItem>)}
              </TextField>
            </Box>
            <Box sx={{ pt: 1, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: .5 }}>
              {antennaField('Relay antenna', relayId, setRelayId, relayAntennas, 'relay')}
              {antennaField('Surface antenna', clientId, setClientId, clientAntennas, 'client')}
              {antennaField('DSN level', dsnId, setDsnId, dsnLevels)}
            </Box>
            {(relayId === 'custom' || clientId === 'custom' || dsnId === 'custom') && <Box sx={{ pt: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', columnGap: .75, rowGap: 1.5 }}>
              {relayId === 'custom' && <NumericField label="Relay power" value={relayCustomPower} onChange={setRelayCustomPower} unit="m" min={Number.MIN_VALUE} />}
              {clientId === 'custom' && <NumericField label="Surface power" value={clientCustomPower} onChange={setClientCustomPower} unit="m" min={Number.MIN_VALUE} />}
              {dsnId === 'custom' && <NumericField label="DSN power" value={dsnCustomPower} onChange={setDsnCustomPower} unit="m" min={Number.MIN_VALUE} />}
            </Box>}
            {(relayId === 'custom' || clientId === 'custom' || dsnId === 'custom') && <Typography sx={{ fontSize: 10, lineHeight: 1.4, color: 'text.secondary' }}>Custom values are final effective powers; profile scaling is not applied.</Typography>}
            {radioProfile.kerbalism && (relayId === 'custom' || clientId === 'custom') && <Box sx={{ pt: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', columnGap: .75, rowGap: 1.5 }}>
              {relayId === 'custom' && <NumericField label="Relay full-strength rate" value={relayCustomRate} onChange={setRelayCustomRate} unit="bit/s" max={1e18} optional />}
              {clientId === 'custom' && <NumericField label="Surface full-strength rate" value={clientCustomRate} onChange={setClientCustomRate} unit="bit/s" max={1e18} optional />}
            </Box>}
            {radioProfile.kerbalism && (relayId === 'custom' || clientId === 'custom') && <Typography sx={{ fontSize: 10, lineHeight: 1.4, color: 'text.secondary' }}>Enter your hardware's science rate before Antenna Speed and damping. Blank leaves its bitrate unknown; signal and coverage still calculate.</Typography>}
            {success ? <>
              <Typography role="status" data-testid="relay-ring-status" sx={{ fontSize: 11, color: statusColor, lineHeight: 1.3 }}>Neighbor links · {ringLabel}<Box component="span" data-testid="relay-coverage-status" sx={{ color: 'text.secondary' }}> · {success.coverageStatus === null ? 'No surface' : ({ full: 'Full equator', partial: 'Partial equator', marginal: 'Coverage at boundary', none: 'No surface links' } as const)[success.coverageStatus]}</Box></Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: .5 }}>
                <Metric label="Equatorial coverage" value={coverage} testId="relay-coverage" color={success.coverageStatus === 'full' ? '#92d5c6' : undefined} />
                <Metric label="Neighbor distance" value={distance(success.neighborDistanceM)} testId="relay-neighbor-distance" />
                <Metric label="Orbital period" value={duration(success.orbitalPeriodS)} testId="relay-period" />
                <Metric label="Maximum DSN range" value={range(success.dsnRangeM)} testId="relay-dsn-range" />
                <Metric label={radioProfile.kerbalism ? 'Neighbor Kerbalism signal' : 'Neighbor signal'} value={signalPercent(radioProfile.kerbalism ? success.neighborDampedStrength : success.neighborSignalStrength)} testId="relay-neighbor-signal" rawValue={radioProfile.kerbalism ? signalPercent(success.neighborSignalStrength) : undefined} rawTestId="relay-neighbor-raw-signal" />
                <Metric label={radioProfile.kerbalism ? 'Best station Kerbalism signal' : 'Best station signal'} value={success.bestStationSignalStrength === null ? 'No surface' : signalPercent((radioProfile.kerbalism ? success.bestStationDampedStrength : success.bestStationSignalStrength)!)} testId="relay-station-signal" rawValue={radioProfile.kerbalism && success.bestStationSignalStrength !== null ? signalPercent(success.bestStationSignalStrength) : undefined} rawTestId="relay-station-raw-signal" />
                {radioProfile.kerbalism && <>
                  <Metric label="Neighbor science rate" value={rateValue(relayBaseRate, neighborRate)} testId="relay-neighbor-rate" color="primary.light" />
                  <Metric label="Surface → relay rate" value={success.bestStationSignalStrength === null ? 'No surface' : rateValue(clientBaseRate, stationRate)} testId="relay-station-rate" color="primary.light" />
                </>}
              </Box>
              <Typography sx={{ fontSize: 10, lineHeight: 1.4, color: 'text.secondary' }}>Station signal is the best visible hop from the sample surface point at this rotation. Coverage and link reach use raw CommNet strength.</Typography>
              {radioProfile.kerbalism && <Typography sx={{ fontSize: 10, lineHeight: 1.4, color: 'text.secondary' }}>Science rates are for each selected hop before downstream relay bottlenecks. All selected external antennas are assumed active and powered; a complete path home is still required.</Typography>}
              {radioProfile.kerbalism && clientBaseRate?.status === 'success' && clientBaseRate.externalCount === 0 && success.bestStationSignalStrength !== null && <Typography sx={{ fontSize: 10, lineHeight: 1.4, color: 'text.secondary' }}>Internal antennas provide control but do not transmit science.</Typography>}
              {radioProfile.kerbalism && rateFloorApplied && <Typography data-testid="relay-rate-floor" sx={{ fontSize: 10, lineHeight: 1.4, color: 'secondary.main' }}>Minimum science rate of {formatBitrate(numeric(minimumBitsPerSecond))} applied to a positive hop rate.</Typography>}
            </> : missingIds.length ? <UnavailableAntennaAlert names={missingNames} restoreLabel={getRadioProfile(restoreProfileId).name} onRestore={() => setRadioId(restoreProfileId)}
              replaceLabel={missingArrayRole ? 'Edit antenna array' : missingRelay.length ? 'Use HG-5' : 'Use Communotron 16'} onReplace={() => {
                if (missingArrayRole) openArray(missingArrayRole)
                else { if (missingRelay.length) setRelayId('hg-5'); if (missingClient.length) setClientId('communotron-16') }
              }} /> : <Alert severity="info" sx={{ py: .25, fontSize: 11, '& .MuiAlert-message': { minWidth: 0 } }}>{result.status === 'invalid' ? result.errors[0] : 'Enter the body and orbit data to calculate a network.'}</Alert>}
            <Typography sx={{ fontSize: 10, lineHeight: 1.35, color: 'text.secondary' }}>Same loadout on each relay · Equatorial coverage only · DSN range is not a home link.</Typography>
            <Typography sx={{ fontSize: 10, lineHeight: 1.35, color: 'text.secondary' }}>RealAntennas and RemoteTech are not modeled. Custom powers do not reproduce their radio systems.</Typography>
          </Stack>}

          {tab === 'deployment' && <Stack spacing={1}>
            <ToggleButtonGroup exclusive fullWidth aria-label="Carrier orbit" value={deploymentMode} onChange={(_, value: typeof deploymentMode | null) => { if (value) setDeploymentMode(value) }} sx={{ '& .MuiToggleButton-root': { flex: 1, minHeight: 34, py: .5, px: .5, fontSize: 11 } }}>
              <ToggleButton value="lower">Lower carrier</ToggleButton><ToggleButton value="higher">Higher carrier</ToggleButton>
            </ToggleButtonGroup>
            <Box sx={{ pt: .5, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: .75 }}>
              <NumericField label="Orbit altitude" value={current.altitude} unit="km" onChange={value => changeProfile({ altitude: value, altitudeAutomatic: false })} />
              <NumericField label="Clearance margin" value={safetyMargin} unit="km" onChange={value => {
                setSafetyMargin(value)
                if (current.altitudeAutomatic) changeProfile({}, numeric(value))
              }} />
            </Box>
            {success ? <>
              <Typography component="output" role="status" data-testid="relay-deployment-status" sx={{ display: 'block', fontSize: 12, color: success.deployment.status === 'clear' ? '#92d5c6' : success.deployment.status === 'blocked' ? '#ee987d' : 'secondary.main' }}>{({ clear: 'Clear of modeled limits', blocked: 'Deployment blocked', marginal: 'Deployment at boundary', unchecked: 'SOI limit not checked' } as const)[success.deployment.status]}</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: .5 }}>
                <Metric label="Carrier periapsis" value={distance(success.deployment.periapsisAltitudeM)} testId="relay-periapsis" />
                <Metric label="Carrier apoapsis" value={distance(success.deployment.apoapsisAltitudeM)} testId="relay-apoapsis" />
                <Metric label="Release interval" value={duration(success.deployment.carrierPeriodS)} testId="relay-release-interval" />
                <Metric label="Deployment elapsed" value={duration(success.deployment.deploymentDurationS)} />
                <Metric label="Each relay circularizes" value={`${number.format(success.deployment.relayCircularizationDeltaVMps)} m/s`} testId="relay-circularization" />
                <Metric label="Carrier injection burn" value={`${number.format(success.deployment.injectionDeltaVMps)} m/s`} />
              </Box>
              {success.deployment.issues.map((issue, index) => <Typography key={index} sx={{ fontSize: 11, lineHeight: 1.4, color: 'secondary.main' }}>{issue}</Typography>)}
            </> : <Alert severity="info" sx={{ py: .25, fontSize: 11 }}>{result.status === 'invalid' ? result.errors[0] : 'Enter a valid orbit first.'}</Alert>}
            <Typography sx={{ fontSize: 10, lineHeight: 1.4, color: 'text.secondary' }}>Start in the target circular orbit, then release one relay per carrier orbit at the shared apsis. Burns and elapsed time begin at the first release; launch and insertion are separate from your Delta-V mission.</Typography>
          </Stack>}

          {tab === 'body' && <Stack spacing={1}>
            <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: .5 }}>
              <Typography sx={{ fontSize: 12, color: 'text.secondary', lineHeight: 1.4 }}>{preset ? current.edited ? 'Edited reference body data' : 'Reference body preset' : 'Enter body data for this system'}</Typography>
              {preset && <Button size="small" onClick={() => setProfiles(previous => new Map(previous).set(bodyId, profile(body, numeric(safetyMargin))))} sx={{ minHeight: 32, fontSize: 11, minWidth: 0, flexShrink: 0, whiteSpace: 'nowrap' }}>Restore preset</Button>}
            </Stack>
            <Box sx={{ pt: .5, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gridTemplateAreas: '"radius atmosphere" "mu soi" "occlusion multiplier"', columnGap: .75, rowGap: 1.5, '@container (max-width: 399px)': { gridTemplateAreas: '"radius atmosphere" "mu mu" "soi soi" "occlusion multiplier"' } }}>
              <Box sx={{ gridArea: 'radius', minWidth: 0 }}><NumericField label="Body radius" value={current.radius} unit="km" min={Number.MIN_VALUE} onChange={value => changeProfile({ radius: value, edited: true })} /></Box>
              <Box sx={{ gridArea: 'atmosphere', minWidth: 0 }}><NumericField label="Atmosphere height" value={current.atmosphere} unit="km" onChange={value => changeProfile({ atmosphere: value, edited: true })} /></Box>
              <Box sx={{ gridArea: 'mu', minWidth: 0 }}><NumericField label="Gravitational parameter" value={current.mu} unit="m³/s²" min={Number.MIN_VALUE} onChange={value => changeProfile({ mu: value, edited: true })} /></Box>
              <Box sx={{ gridArea: 'soi', minWidth: 0 }}><NumericField label="Sphere of influence" value={current.soi} unit="km" optional onChange={value => changeProfile({ soi: value, edited: true })} /></Box>
              <TextField select fullWidth size="small" label="Occlusion" value={occlusion} onChange={event => setOcclusion(event.target.value as typeof occlusion)} sx={{ ...fieldStyles, gridArea: 'occlusion' }}>
                <MenuItem value="full" sx={{ fontSize: 12 }}>Full radius</MenuItem><MenuItem value="normal" sx={{ fontSize: 12 }}>{radioProfile.normalOcclusionLabel}</MenuItem>
              </TextField>
              <Box sx={{ gridArea: 'multiplier', minWidth: 0 }}><NumericField label="Range multiplier" value={rangeMultiplier} min={Number.MIN_VALUE} onChange={setRangeMultiplier} /></Box>
            </Box>
            <Typography sx={{ fontSize: 10, color: 'text.secondary', lineHeight: 1.4 }}>Occlusion uses {occlusion === 'full' ? 'the full body radius' : `${normalOcclusionFactor.toFixed(2)} × the body radius (${radioProfile.normalOcclusionLabel.replace(/ \(.*\)$/, '')})`}. Ground receivers remain at the physical radius. A missing SOI leaves the orbit limit unchecked.</Typography>
            <Typography sx={{ fontSize: 11, color: 'text.secondary', lineHeight: 1.4 }}>{usesRssBodyData ? 'RSS presets supply body physics.' : 'Body data is editable for your installation.'} Radio setup is selected separately on the Network tab. RealAntennas and RemoteTech are not modeled. Terrain and orbital perturbations are not modeled.</Typography>
            {source && <Link href={source.url} target="_blank" rel="noreferrer" sx={{ fontSize: 11, lineHeight: 1.4, overflowWrap: 'anywhere' }}>{source.title}</Link>}
            {radioProfile.sources.filter(reference => reference.id.startsWith('commnet-rss-') || reference.id.startsWith('commnet-kerbalism-')).map(reference => <Link key={reference.id} href={reference.url} target="_blank" rel="noreferrer" sx={{ fontSize: 11, lineHeight: 1.4, overflowWrap: 'anywhere' }}>{reference.title}</Link>)}
          </Stack>}
        </Box>

        <Box sx={{ minWidth: 0, display: tab === 'body' ? { xs: 'none', sm: 'block' } : 'block' }}>
          {success && body ? <RelayDiagram input={input} result={success} bodyName={body.name} bodyColor={body.color} onRotate={() => setPhase(value => (value + 15) % 360)} />
            : <Box sx={{ minHeight: 130, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', px: 2, border: '1px dashed', borderColor: 'divider', borderRadius: 1 }}><Typography sx={{ textAlign: 'center', color: 'text.secondary', fontSize: 12 }}>Enter valid body and orbit data to preview the constellation.</Typography></Box>}
          {success && body && !body.hasSurface && <Typography sx={{ mt: .5, fontSize: 10, color: 'text.secondary', lineHeight: 1.35 }}>No landable surface. This view checks relay links and DSN range, without a ground receiver.</Typography>}
          {success?.warnings.map((warning, index) => <Typography key={index} sx={{ mt: .5, fontSize: 10, lineHeight: 1.35, color: 'secondary.main' }}>{warning}</Typography>)}
        </Box>
      </Box>
    </DialogContent>
    <DialogActions sx={{ px: 1.5, py: .5, justifyContent: 'space-between', borderTop: '1px solid', borderColor: 'divider' }}>
      <Link href="https://github.com/AntonioToni/ksp-deltav/blob/main/docs/RELAYS.md" target="_blank" rel="noreferrer" sx={{ fontSize: 11 }}>Relay guide</Link>
      <Button size="small" variant="contained" onClick={onClose} sx={{ minHeight: 34, px: 2, fontSize: 12 }}>Close</Button>
    </DialogActions>
    {editingArray && <AntennaArrayDialog open role={editingArray.role} entries={editingArray.entries} antennas={vesselAntennas} radioLabel={radioProfile.name} onApply={applyArray} onClose={() => setEditingArray(null)} />}
  </>
}

/** Mount the editable session on its first opening, then preserve it while closed. */
export default function RelayPlannerDialog({ open, pack, initialBodyId, onClose }: RelayPlannerDialogProps) {
  const [opened, setOpened] = useState(open)
  if (open && !opened) setOpened(true)
  return <Dialog open={open} onClose={onClose} keepMounted fullWidth maxWidth="lg" aria-labelledby="relay-planner-heading" sx={{ '& .MuiDialog-paper': { m: 1, width: 'calc(100% - 16px)', maxWidth: 1050, maxHeight: 'calc(100dvh - 16px)' } }}>
    {opened && <RelayContent pack={pack} initialBodyId={initialBodyId} onClose={onClose} />}
  </Dialog>
}
