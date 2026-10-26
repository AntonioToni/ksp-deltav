import { useState } from 'react'
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  IconButton, InputAdornment, Link, MenuItem, Stack, Tab, Tabs, TextField,
  ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material'
import CloseRounded from '@mui/icons-material/CloseRounded'
import type { CelestialBody, PlanetPack } from '../types/planner'
import {
  clientAntennas, commNetSources, dsnLevels, findRelayBodyPreset, relayAntennas,
} from '../data/commnet'
import { calculateRelayPlan, type RelayNetworkInput } from '../utils/relay'
import RelayDiagram from './RelayDiagram'

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

function defaultAltitude(radiusKm: number, atmosphereKm: number, marginKm = 10): string {
  if (!Number.isFinite(radiusKm) || radiusKm <= 0) return ''
  const atmosphere = Number.isFinite(atmosphereKm) ? atmosphereKm : 0
  const margin = Number.isFinite(marginKm) ? marginKm : 10
  return String(Math.round(Math.max(radiusKm * 4 / 3, atmosphere + margin + 1) * 1000) / 1000)
}

function profile(body: CelestialBody | undefined, marginKm = 10): BodyDraft {
  const preset = body ? findRelayBodyPreset(body) : undefined
  return {
    radius: preset ? String(preset.radiusM / 1000) : '',
    mu: preset ? String(preset.gravitationalParameter) : '',
    atmosphere: preset ? String(preset.atmosphereHeightM / 1000) : body?.hasAtmosphere ? '' : '0',
    soi: preset?.sphereOfInfluenceM !== undefined ? String(preset.sphereOfInfluenceM / 1000) : '',
    altitude: preset ? defaultAltitude(preset.radiusM / 1000, preset.atmosphereHeightM / 1000, marginKm) : '',
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

function Metric({ label, value, testId, color }: { label: string; value: string; testId?: string; color?: string }) {
  return <Box sx={{ px: 1, py: { xs: .25, sm: .5 }, minWidth: 0, border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: '#080f2145', [compact]: { py: .25 } }}>
    <Typography sx={{ fontSize: 10, lineHeight: 1.2, color: 'text.secondary' }}>{label}</Typography>
    <Typography component="output" data-testid={testId} sx={{ display: 'block', mt: { xs: .125, sm: .25 }, fontSize: { xs: 14, sm: 15 }, lineHeight: 1.25, fontWeight: 500, fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere', color: color ?? 'text.primary', [compact]: { fontSize: 13, mt: 0 } }}>{value}</Typography>
  </Box>
}

function NumericField({ label, value, onChange, unit, min = 0, optional = false }: { label: string; value: string; onChange: (value: string) => void; unit?: string; min?: number; optional?: boolean }) {
  const parsed = numeric(value)
  const invalid = value !== '' && (!Number.isFinite(parsed) || parsed < min)
  return <TextField fullWidth size="small" type="number" label={label} value={value} error={invalid} onChange={event => onChange(event.target.value)}
    placeholder={optional ? 'Not supplied' : undefined} slotProps={{ htmlInput: { 'aria-label': label, min, step: 'any' }, input: unit ? { endAdornment: <InputAdornment position="end"><Typography sx={{ fontSize: 10 }}>{unit}</Typography></InputAdornment> } : undefined }} sx={fieldStyles} />
}

function RelayContent({ pack, initialBodyId, onClose }: Omit<RelayPlannerDialogProps, 'open'>) {
  const bodies = pack.bodies.filter(body => body.kind !== 'star')
  const first = bodies.find(body => body.id === initialBodyId) ?? bodies.find(body => body.id === pack.transferHubBodyId) ?? bodies[0]
  const [bodyId, setBodyId] = useState(first?.id ?? '')
  const [profiles, setProfiles] = useState(() => new Map(first ? [[first.id, profile(first)]] : []))
  const body = bodies.find(candidate => candidate.id === bodyId) ?? first
  const current = profiles.get(bodyId) ?? profile(body)
  const preset = body ? findRelayBodyPreset(body) : undefined
  const source = commNetSources.find(candidate => candidate.id === preset?.sourceId)
  const [tab, setTab] = useState<'network' | 'deployment' | 'body'>(() => first && findRelayBodyPreset(first) ? 'network' : 'body')
  const [satelliteCount, setSatelliteCount] = useState(3)
  const [relayId, setRelayId] = useState(relayAntennas.find(antenna => antenna.id === 'hg-5')?.id ?? relayAntennas[0]?.id ?? '')
  const [clientId, setClientId] = useState(clientAntennas.find(antenna => antenna.id === 'communotron-16')?.id ?? clientAntennas[0]?.id ?? '')
  const [dsnId, setDsnId] = useState(dsnLevels.at(-1)?.id ?? '')
  const [relayCustomPower, setRelayCustomPower] = useState('')
  const [clientCustomPower, setClientCustomPower] = useState('')
  const [dsnCustomPower, setDsnCustomPower] = useState('')
  const [occlusion, setOcclusion] = useState<'full' | 'normal'>('full')
  const [rangeMultiplier, setRangeMultiplier] = useState('1')
  const [safetyMargin, setSafetyMargin] = useState('10')
  const [deploymentMode, setDeploymentMode] = useState<'lower' | 'higher'>('lower')
  const [phase, setPhase] = useState(0)

  function changeProfile(changes: Partial<BodyDraft>) {
    setProfiles(previous => new Map(previous).set(bodyId, { ...current, ...changes }))
  }

  function changeBody(id: string) {
    const nextBody = bodies.find(candidate => candidate.id === id)
    if (!nextBody) return
    const next = profiles.get(id) ?? profile(nextBody, numeric(safetyMargin))
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
    relayPower: relayId === 'custom' ? numeric(relayCustomPower) : relayAntennas.find(antenna => antenna.id === relayId)?.power ?? NaN,
    clientPower: clientId === 'custom' ? numeric(clientCustomPower) : clientAntennas.find(antenna => antenna.id === clientId)?.power ?? NaN,
    dsnPower: dsnId === 'custom' ? numeric(dsnCustomPower) : dsnLevels.find(level => level.id === dsnId)?.power ?? NaN,
    rangeMultiplier: numeric(rangeMultiplier),
    occlusionFactor: occlusion === 'full' ? 1 : numeric(current.atmosphere) > 0 ? .75 : .9,
    phaseDeg: phase,
    stationLongitudeDeg: 0,
    safetyMarginM: numeric(safetyMargin) * 1000,
    deploymentMode,
  }
  const result = calculateRelayPlan(input)
  const success = result.status === 'success' ? result : null
  const ringLabel = success ? ({ available: 'Available', marginal: 'At limit', blocked: 'Body blocks links', 'out-of-range': 'Out of range' } as const)[success.ringLinkStatus] : '—'
  const statusColor = success?.ringLinkStatus === 'available' ? '#92d5c6' : success?.ringLinkStatus === 'marginal' ? 'secondary.main' : '#ee987d'
  const coverage = success?.equatorialCoverageFraction === null ? 'No surface' : success ? `${number.format(success.equatorialCoverageFraction! < 1 ? Math.min(99.9, success.equatorialCoverageFraction! * 100) : 100)}%` : '—'

  function antennaField(label: string, value: string, setValue: (value: string) => void, options: readonly { id: string; name: string; power: number }[]) {
    const selectedName = value === 'custom' ? 'Custom power' : options.find(option => option.id === value)?.name ?? ''
    const compactName = selectedName.replace(/^Communotron\s*/i, '').replace(/^DSN level\s*/i, 'Level ').replace('Custom power', 'Custom')
    return <TextField select fullWidth size="small" label={label} value={value} onChange={event => setValue(event.target.value)} slotProps={{ select: { renderValue: () => <Box component="span" title={selectedName}>{compactName}</Box> } }} sx={fieldStyles}>
      {options.map(option => <MenuItem key={option.id} value={option.id} sx={{ fontSize: 12 }}>{option.name}</MenuItem>)}
      <MenuItem value="custom" sx={{ fontSize: 12 }}>Custom power</MenuItem>
    </TextField>
  }

  if (!body) return <>
    <DialogTitle id="relay-planner-heading" sx={{ px: 1.5, py: 1, fontSize: 16 }}>CommNet relay planner</DialogTitle>
    <DialogContent sx={{ px: 1.5, py: 1 }}><Typography sx={{ fontSize: 12, color: 'text.secondary' }}>This pack has no planetary bodies for relay planning.</Typography></DialogContent>
    <DialogActions sx={{ px: 1.5, py: .75 }}><Button onClick={onClose}>Close</Button></DialogActions>
  </>

  return <>
    <DialogTitle id="relay-planner-title-row" sx={{ px: 1.5, py: .5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, fontSize: 16, lineHeight: 1.5 }}>
      <Box component="span" id="relay-planner-heading">CommNet relay planner</Box>
      <IconButton aria-label="Close relay planner" size="small" onClick={onClose}><CloseRounded sx={{ fontSize: 19 }} /></IconButton>
    </DialogTitle>
    <Box sx={{ px: 1.5, pt: .5, pb: .75, display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
      <TextField select fullWidth size="small" label="Relay body" value={bodyId} onChange={event => changeBody(event.target.value)} sx={{ ...fieldStyles, maxWidth: 380 }}>
        {bodies.map(candidate => <MenuItem key={candidate.id} value={candidate.id} sx={{ fontSize: 12 }}>{candidate.name}</MenuItem>)}
      </TextField>
      <Typography sx={{ display: { xs: 'none', sm: 'block' }, fontSize: 11, color: 'text.secondary', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pack.shortName ?? pack.name} · Stock CommNet model</Typography>
    </Box>
    <Tabs value={tab} onChange={(_, value: typeof tab) => setTab(value)} aria-label="Relay planner sections" variant="fullWidth" sx={{ px: 1.5, minHeight: 32, borderBottom: '1px solid', borderColor: 'divider', '& .MuiTab-root': { minHeight: 32, minWidth: 0, py: .5, px: 1, fontSize: 12, textTransform: 'none' } }}>
      <Tab id="relay-network-tab" aria-controls="relay-network-panel" value="network" label="Network" />
      <Tab id="relay-deployment-tab" aria-controls="relay-deployment-panel" value="deployment" label="Deployment" />
      <Tab id="relay-body-tab" aria-controls="relay-body-panel" value="body" label="Body data" />
    </Tabs>
    <DialogContent sx={{ p: 1.5, minWidth: 0, minHeight: 0, overflowY: 'auto', [compact]: { py: 1 } }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1.25, '@media (min-width: 600px)': { gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' } }}>
        <Box role="tabpanel" id={`relay-${tab}-panel`} aria-labelledby={`relay-${tab}-tab`} sx={{ minWidth: 0 }}>
          {tab === 'network' && <Stack spacing={.5}>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, .7fr)', gap: .75 }}>
              <NumericField label="Orbit altitude" value={current.altitude} unit="km" onChange={value => changeProfile({ altitude: value, altitudeAutomatic: false })} />
              <TextField select fullWidth size="small" label="Relay count" value={satelliteCount} onChange={event => setSatelliteCount(Number(event.target.value))} sx={fieldStyles}>
                {Array.from({ length: 11 }, (_, index) => index + 2).map(count => <MenuItem key={count} value={count} sx={{ fontSize: 12 }}>{count} relays</MenuItem>)}
              </TextField>
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: .5 }}>
              {antennaField('Relay antenna', relayId, setRelayId, relayAntennas)}
              {antennaField('Surface antenna', clientId, setClientId, clientAntennas)}
              {antennaField('DSN level', dsnId, setDsnId, dsnLevels)}
            </Box>
            {(relayId === 'custom' || clientId === 'custom' || dsnId === 'custom') && <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: .75 }}>
              {relayId === 'custom' && <NumericField label="Relay power" value={relayCustomPower} onChange={setRelayCustomPower} unit="m" min={Number.MIN_VALUE} />}
              {clientId === 'custom' && <NumericField label="Surface power" value={clientCustomPower} onChange={setClientCustomPower} unit="m" min={Number.MIN_VALUE} />}
              {dsnId === 'custom' && <NumericField label="DSN power" value={dsnCustomPower} onChange={setDsnCustomPower} unit="m" min={Number.MIN_VALUE} />}
            </Box>}
            {success ? <>
              <Typography role="status" data-testid="relay-ring-status" sx={{ fontSize: 11, color: statusColor, lineHeight: 1.3 }}>Neighbor links · {ringLabel}<Box component="span" data-testid="relay-coverage-status" sx={{ color: 'text.secondary' }}> · {success.coverageStatus === null ? 'No surface' : ({ full: 'Full equator', partial: 'Partial equator', marginal: 'Coverage at boundary', none: 'No surface links' } as const)[success.coverageStatus]}</Box></Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: .5 }}>
                <Metric label="Equatorial coverage" value={coverage} testId="relay-coverage" color={success.coverageStatus === 'full' ? '#92d5c6' : undefined} />
                <Metric label="Neighbor distance" value={distance(success.neighborDistanceM)} testId="relay-neighbor-distance" />
                <Metric label="Orbital period" value={duration(success.orbitalPeriodS)} testId="relay-period" />
                <Metric label="Maximum DSN range" value={range(success.dsnRangeM)} testId="relay-dsn-range" />
              </Box>
            </> : <Alert severity="info" sx={{ py: .25, fontSize: 11, '& .MuiAlert-message': { minWidth: 0 } }}>{result.status === 'invalid' ? result.errors[0] : 'Enter the body and orbit data to calculate a network.'}</Alert>}
            <Typography sx={{ fontSize: 10, lineHeight: 1.35, color: 'text.secondary' }}>Equatorial coverage only · DSN range is not a home link.</Typography>
          </Stack>}

          {tab === 'deployment' && <Stack spacing={1}>
            <ToggleButtonGroup exclusive fullWidth aria-label="Carrier orbit" value={deploymentMode} onChange={(_, value: typeof deploymentMode | null) => { if (value) setDeploymentMode(value) }} sx={{ '& .MuiToggleButton-root': { flex: 1, minHeight: 34, py: .5, px: .5, fontSize: 11 } }}>
              <ToggleButton value="lower">Lower carrier</ToggleButton><ToggleButton value="higher">Higher carrier</ToggleButton>
            </ToggleButtonGroup>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: .75 }}>
              <NumericField label="Orbit altitude" value={current.altitude} unit="km" onChange={value => changeProfile({ altitude: value, altitudeAutomatic: false })} />
              <NumericField label="Clearance margin" value={safetyMargin} unit="km" onChange={value => {
                setSafetyMargin(value)
                if (current.altitudeAutomatic) changeProfile({ altitude: defaultAltitude(numeric(current.radius), numeric(current.atmosphere), numeric(value)) })
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
              <Typography sx={{ fontSize: 11, color: 'text.secondary', lineHeight: 1.35 }}>{preset ? current.edited ? 'Edited reference body data' : 'Reference body preset' : 'Enter body data for this system'}</Typography>
              {preset && <Button size="small" onClick={() => setProfiles(previous => new Map(previous).set(bodyId, profile(body, numeric(safetyMargin))))} sx={{ minHeight: 28, fontSize: 10, minWidth: 0, whiteSpace: 'nowrap' }}>Restore preset</Button>}
            </Stack>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: .75 }}>
              <NumericField label="Body radius" value={current.radius} unit="km" min={Number.MIN_VALUE} onChange={value => changeProfile({ radius: value, edited: true, ...(current.altitudeAutomatic ? { altitude: defaultAltitude(numeric(value), numeric(current.atmosphere), numeric(safetyMargin)) } : {}) })} />
              <NumericField label="Gravitational parameter" value={current.mu} unit="m³/s²" min={Number.MIN_VALUE} onChange={value => changeProfile({ mu: value, edited: true })} />
              <NumericField label="Atmosphere height" value={current.atmosphere} unit="km" onChange={value => changeProfile({ atmosphere: value, edited: true, ...(current.altitudeAutomatic ? { altitude: defaultAltitude(numeric(current.radius), numeric(value), numeric(safetyMargin)) } : {}) })} />
              <NumericField label="Sphere of influence" value={current.soi} unit="km" optional onChange={value => changeProfile({ soi: value, edited: true })} />
              <TextField select fullWidth size="small" label="Occlusion" value={occlusion} onChange={event => setOcclusion(event.target.value as typeof occlusion)} sx={fieldStyles}>
                <MenuItem value="full" sx={{ fontSize: 12 }}>Full radius</MenuItem><MenuItem value="normal" sx={{ fontSize: 12 }}>KSP normal</MenuItem>
              </TextField>
              <NumericField label="Range multiplier" value={rangeMultiplier} min={Number.MIN_VALUE} onChange={setRangeMultiplier} />
            </Box>
            <Typography sx={{ fontSize: 10, color: 'text.secondary', lineHeight: 1.4 }}>Occlusion uses {occlusion === 'full' ? 'the full body radius' : `${numeric(current.atmosphere) > 0 ? '0.75' : '0.90'} × the body radius (KSP normal)`}. Ground receivers remain at the physical radius. A missing SOI leaves the orbit limit unchecked.</Typography>
            <Typography sx={{ fontSize: 10, color: 'text.secondary', lineHeight: 1.4 }}>Body data is editable for your installation. The radio model stays stock CommNet; RealAntennas, RemoteTech, antenna stacking, terrain, and perturbations are not modeled.</Typography>
            {source && <Link href={source.url} target="_blank" rel="noreferrer" sx={{ fontSize: 11 }}>{source.title}</Link>}
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
