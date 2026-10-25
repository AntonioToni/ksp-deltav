import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, IconButton, Link, Paper, Popper, Slider, Stack, Tab, Tabs,
  ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material'
import RocketLaunchRounded from '@mui/icons-material/RocketLaunchRounded'
import SwapHorizRounded from '@mui/icons-material/SwapHorizRounded'
import RestartAltRounded from '@mui/icons-material/RestartAltRounded'
import InfoOutlined from '@mui/icons-material/InfoOutlined'
import CloseRounded from '@mui/icons-material/CloseRounded'
import { stockPack } from './data/stock'
import { planetPacks } from './data/planetPacks'
import DeltaVMap from './components/DeltaVMap'
import SpaceBackground from './components/SpaceBackground'
import { buildGraph } from './utils/buildGraph'
import { findMissionRoute } from './utils/mission'
import { calculateBudget } from './utils/budget'

const format = new Intl.NumberFormat('en-US')
const compactBreakdown = '@media (max-height: 500px), (max-width: 699px) and (max-height: 650px)'

export default function App() {
  const [packId, setPackId] = useState('stock')
  const pack = planetPacks.find(candidate => candidate.id === packId) ?? stockPack
  const graph = useMemo(() => buildGraph(pack), [pack])
  const nodesById = useMemo(() => new Map(pack.nodes.map(node => [node.id, node])), [pack])
  const bodiesById = useMemo(() => new Map(pack.bodies.map(body => [body.id, body])), [pack])
  const [startId, setStartId] = useState<string | null>(null)
  const [endId, setEndId] = useState<string | null>(null)
  const [selection, setSelection] = useState<'start' | 'end'>('start')
  const [redundancy, setRedundancy] = useState(0)
  const [roundTrip, setRoundTrip] = useState(false)
  const [breakdownLeg, setBreakdownLeg] = useState<'outbound' | 'return'>('outbound')
  const [showBreakdown, setShowBreakdown] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const [breakdownAnchor, setBreakdownAnchor] = useState<HTMLDivElement | null>(null)
  const breakdownToggle = useRef<HTMLInputElement>(null)
  const route = useMemo(
    () => startId !== null && endId !== null ? findMissionRoute(graph, startId, endId, roundTrip) : null,
    [graph, startId, endId, roundTrip],
  )
  const activeLeg = route?.status === 'success'
    ? breakdownLeg === 'return' && route.returnRoute ? route.returnRoute : route.outbound
    : null
  const budget = route?.status === 'success' ? calculateBudget(route.totalDeltaV, redundancy) : null
  const hasAtmosphericLanding = route?.status === 'success' && route.legs.some(({ edge }) =>
    edge.kind === 'descent' && bodiesById.get(nodesById.get(edge.to)?.bodyId ?? '')?.hasAtmosphere,
  )
  const hubName = bodiesById.get(pack.transferHubBodyId ?? '')?.name ?? 'the reference planet'
  const hasLayover = route?.status === 'success' && [route.outbound, route.returnRoute].some(leg => leg && leg.legs.filter(({ edge }) =>
    edge.kind === 'transfer' && nodesById.get(edge.from)?.kind === 'encounter' && nodesById.get(edge.to)?.kind === 'encounter',
  ).length > 1)

  useEffect(() => {
    if (!showBreakdown) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowBreakdown(false)
        breakdownToggle.current?.focus()
      }
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [showBreakdown])

  function selectNode(id: string) {
    setBreakdownLeg('outbound')
    if (selection === 'start') {
      setStartId(id)
      setSelection('end')
    } else setEndId(id)
  }

  function changePack(id: string) {
    const nextPack = planetPacks.find(candidate => candidate.id === id)
    if (!nextPack || id === packId) return
    const available = new Set(nextPack.nodes.map(node => node.id))
    const nextStart = startId !== null && available.has(startId) ? startId : null
    const nextEnd = endId !== null && available.has(endId) ? endId : null
    setPackId(id)
    setStartId(nextStart)
    setEndId(nextEnd)
    setSelection(nextStart === null ? 'start' : nextEnd === null ? 'end' : selection)
    setShowBreakdown(false)
    setBreakdownLeg('outbound')
  }

  function reset() {
    setStartId(null)
    setEndId(null)
    setSelection('start')
    setRedundancy(0)
    setRoundTrip(false)
    setBreakdownLeg('outbound')
    setShowBreakdown(false)
  }

  const status = route?.status === 'invalid' || route?.status === 'unreachable' ? route.message
    : route?.status === 'success' && route.legs.length === 0 ? 'No maneuvers required.'
      : hasAtmosphericLanding ? `Atmospheric landing uses a planning allowance.${hasLayover ? ` Includes a ${hubName} parking-orbit layover.` : ''}`
        : hasLayover ? `Includes a ${hubName} parking-orbit layover.`
          : route?.status === 'success' ? `${route.legs.length} maneuvers · Select a state to update your ${selection === 'start' ? 'origin' : 'destination'}.`
            : `Select ${selection === 'start' ? 'an origin' : 'a destination'} on the map.`

  return (
    <Box sx={{ width: '100%', height: '100dvh', display: 'grid', gridTemplateRows: '44px minmax(0, 1fr) auto', overflow: 'hidden', '@media (max-height: 500px)': { gridTemplateRows: '34px minmax(0, 1fr) auto' } }}>
      <Box component="header" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: { xs: 1.25, sm: 2.5 }, borderBottom: '1px solid', borderColor: 'divider', gap: 1, background: 'linear-gradient(100deg, #111d32, #0c1628)', boxShadow: 'inset 0 1px 0 #ffffff04' }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0 }}>
          <RocketLaunchRounded sx={{ color: 'primary.main', fontSize: 21 }} />
          <Typography component="h1" sx={{ fontWeight: 700, fontSize: { xs: 14, sm: 16 }, letterSpacing: '-.015em', whiteSpace: 'nowrap' }}>KSP DeltaV Planner</Typography>
        </Stack>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Tooltip title="Arrows point toward potential aerocapture, aerobraking, or atmospheric landing assistance. Savings are not included in the budget.">
            <Box role="note" aria-label="Aerobraking legend" sx={{ display: 'flex', alignItems: 'center', gap: .75, px: .75, py: .45, border: '1px solid #c6e8d81c', borderRadius: 4, bgcolor: '#1a202c99', color: '#b5c9bf', whiteSpace: 'nowrap' }}>
              <svg width="10" height="10" viewBox="-8 -8 16 16" aria-hidden="true"><path d="M -7 -6 L 7 0 L -7 6 Z" fill="#c6e8d8" /></svg>
              <Typography component="span" sx={{ fontSize: 10, lineHeight: 1.4 }}>
                <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Aerobraking possible</Box>
                <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>Aerobrake</Box>
              </Typography>
            </Box>
          </Tooltip>
          <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' }, fontSize: 10, letterSpacing: '.1em', whiteSpace: 'nowrap' }}>{pack.shortName ?? pack.name} · KSP 1</Typography>
          <Tooltip title="Model assumptions and data sources"><IconButton aria-label="Model assumptions and data sources" size="small" onClick={() => setShowInfo(true)}><InfoOutlined sx={{ fontSize: 19 }} /></IconButton></Tooltip>
        </Stack>
      </Box>

      <Box component="main" aria-label="Interactive Delta-V map" sx={{ minHeight: 0, minWidth: 0, overflow: 'hidden', position: 'relative' }}>
        <SpaceBackground />
        <DeltaVMap pack={pack} startId={startId} endId={endId} route={route} onSelect={selectNode} />
      </Box>

      <Box ref={setBreakdownAnchor} component="footer" sx={{ bgcolor: 'background.paper', backgroundImage: 'linear-gradient(180deg, #16243b, #101b2f)', borderTop: '2px solid', borderColor: 'primary.dark', minWidth: 0, boxShadow: '0 -8px 24px #00000018, inset 0 1px 0 #ffffff03' }}>
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', px: { xs: 1.25, sm: 2.5 }, pt: .5, gap: 1 }}>
          <ToggleButtonGroup exclusive size="small" aria-label="Planet pack" value={pack.id} onChange={(_, value: string | null) => { if (value !== null) changePack(value) }} sx={{ '& .MuiToggleButton-root': { px: 1.25, py: .15, fontSize: 10, textTransform: 'none', color: 'text.secondary', borderColor: 'divider', '&.Mui-selected': { bgcolor: '#73c8fa18', color: 'primary.main' } } }}>
            {planetPacks.map(candidate => <ToggleButton key={candidate.id} value={candidate.id} title={candidate.name}>{candidate.shortName ?? candidate.name}</ToggleButton>)}
          </ToggleButtonGroup>
          <FormControlLabel sx={{ m: 0, '& .MuiFormControlLabel-label': { fontSize: 11 } }} control={<Checkbox size="small" checked={roundTrip} onChange={(_, checked) => { setRoundTrip(checked); setBreakdownLeg('outbound') }} slotProps={{ input: { 'aria-label': 'Round trip' } }} sx={{ p: .5, '& .MuiSvgIcon-root': { fontSize: 17 } }} />} label="Round trip" />
        </Stack>
        <Box component="section" aria-label="Mission controls" sx={{
          display: 'grid', minWidth: 0, columnGap: 2, rowGap: .75,
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
          gridTemplateAreas: '"mission mission" "reserve budget" "actions actions"',
          px: { xs: 1.25, sm: 2.5 }, pt: { xs: 1, sm: 1.5 }, pb: .5,
          '@media (min-width: 700px), (min-width: 600px) and (max-height: 500px)': { gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr) minmax(0, 1fr) auto', gridTemplateAreas: '"mission reserve budget actions"', alignItems: 'center', columnGap: 3 },
          '@media (max-height: 500px)': { pt: .5, columnGap: 1.5 },
        }}>
          <Box sx={{ gridArea: 'mission', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 30px minmax(0, 1fr)', gap: .5, alignItems: 'center', minWidth: 0 }}>
            {(['start', 'end'] as const).map((endpoint, index) => {
              const nodeId = endpoint === 'start' ? startId : endId
              const color = endpoint === 'start' ? 'primary' : 'secondary'
              const label = endpoint === 'start' ? 'Origin' : 'Destination'
              return <Box key={endpoint} sx={{ gridColumn: index === 0 ? 1 : 3, gridRow: 1, minWidth: 0 }}>
                <Button fullWidth variant="outlined" color={color} aria-label={`Choose ${label.toLowerCase()}`} aria-describedby={`${endpoint}-state`} aria-pressed={selection === endpoint} onClick={() => setSelection(endpoint)} sx={{
                  px: 1, py: .75, minHeight: 44, justifyContent: 'flex-start', textAlign: 'left', borderRadius: 1.25, overflow: 'hidden',
                  borderColor: selection === endpoint ? `${color}.main` : 'divider',
                  bgcolor: selection === endpoint ? endpoint === 'start' ? 'rgba(115,200,250,.055)' : 'rgba(231,189,123,.055)' : 'rgba(14,17,26,.15)',
                  backgroundImage: selection === endpoint ? `linear-gradient(120deg, ${endpoint === 'start' ? 'rgba(115,200,250,.055)' : 'rgba(231,189,123,.055)'}, transparent)` : 'none',
                  boxShadow: 'inset 0 1px 0 #ffffff05',
                }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography component="span" sx={{ display: 'block', fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', lineHeight: 1.2, opacity: .82 }}>{endpoint === 'start' ? 'A' : 'B'} · {label}</Typography>
                    <Typography component="span" id={`${endpoint}-state`} title={nodeId ? nodesById.get(nodeId)?.label : undefined} sx={{ display: 'block', fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', mt: .25 }}>{nodeId ? nodesById.get(nodeId)?.label : `Select ${label.toLowerCase()}`}</Typography>
                  </Box>
                </Button>
              </Box>
            })}
            <Tooltip title="Swap origin and destination"><span style={{ gridColumn: 2, gridRow: 1 }}><IconButton aria-label="Swap origin and destination" disabled={!startId || !endId} onClick={() => { setStartId(endId); setEndId(startId); setBreakdownLeg('outbound') }} size="small"><SwapHorizRounded sx={{ fontSize: 20 }} /></IconButton></span></Tooltip>
          </Box>

          <Box sx={{ gridArea: 'reserve', minWidth: 0, px: .5 }}>
            <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Typography component="label" htmlFor="redundancy-slider" sx={{ fontSize: 11, color: 'text.secondary' }}>Redundancy</Typography>
              <Typography sx={{ fontSize: 12, fontWeight: 500, color: 'primary.main', fontVariantNumeric: 'tabular-nums' }}>+{redundancy}%</Typography>
            </Stack>
            <Slider id="redundancy-slider" aria-label="Redundancy" min={0} max={100} step={5} value={redundancy} onChange={(_, value) => { if (typeof value === 'number') setRedundancy(value) }} getAriaValueText={value => `${value}% redundancy`} valueLabelDisplay="auto" valueLabelFormat={value => `+${value}%`} size="small" sx={{ display: 'block', width: 'calc(100% - 12px)', mx: '6px', py: 1.5, '& .MuiSlider-thumb': { width: 13, height: 13 } }} />
          </Box>

          <Box sx={{ gridArea: 'budget', minWidth: 0 }}>
            <Typography sx={{ fontSize: 10, color: 'text.secondary', letterSpacing: '.1em', textTransform: 'uppercase' }}>{roundTrip ? 'Round-trip budget' : 'Delta-V budget'}</Typography>
            {budget ? <Typography component="output" data-testid="route-total" sx={{ display: 'block', fontSize: { xs: 25, sm: 32 }, lineHeight: 1.1, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', fontWeight: 700, letterSpacing: '-.025em' }}>
              {format.format(budget.totalDeltaV)} <Box component="span" sx={{ fontSize: '.55em', color: 'text.secondary' }}>m/s</Box>
            </Typography> : <Typography sx={{ fontSize: 25, lineHeight: 1.1, color: 'text.secondary' }}>— <Box component="span" sx={{ fontSize: 13 }}>m/s</Box></Typography>}
            <Typography sx={{ fontSize: 9, color: 'text.secondary', whiteSpace: 'nowrap' }}>
              {budget ? <><Box component="span" data-testid="route-base">{format.format(budget.baseDeltaV)} m/s</Box> base <Box component="span" sx={{ color: 'primary.main' }} data-testid="route-margin">+{format.format(budget.extraDeltaV)} m/s</Box></> : 'Select two states to calculate'}
            </Typography>
          </Box>

          <Box sx={{ gridArea: 'actions', display: 'flex', alignItems: 'center', justifyContent: { xs: 'space-between', sm: 'flex-start' }, gap: 1, '@media (min-width: 700px), (min-width: 600px) and (max-height: 500px)': { flexDirection: 'column', alignItems: 'flex-start', gap: 0 } }}>
            <FormControlLabel sx={{ m: 0, '& .MuiFormControlLabel-label': { fontSize: 11 } }} control={<Checkbox size="small" checked={showBreakdown} onChange={(_, checked) => setShowBreakdown(checked)} slotProps={{ input: { 'aria-label': 'Show breakdown', ref: breakdownToggle } }} sx={{ p: .5, '& .MuiSvgIcon-root': { fontSize: 17 } }} />} label="Breakdown" />
            <Button startIcon={<RestartAltRounded sx={{ fontSize: '16px !important' }} />} aria-label="Reset mission" size="small" onClick={reset} sx={{ minHeight: 28, fontSize: 11, px: .5 }}>Clear</Button>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, px: { xs: 1.25, sm: 2.5 }, pb: .75, minHeight: 20 }}>
          <Typography role={hasAtmosphericLanding || route?.status === 'invalid' ? 'alert' : 'status'} title={status} sx={{ flex: 1, minWidth: 0, fontSize: 10, color: hasAtmosphericLanding ? 'secondary.main' : 'text.secondary', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{status}</Typography>
          {pack.dataNotice && <Button size="small" color="secondary" onClick={() => setShowInfo(true)} title={pack.description} sx={{ minHeight: 15, minWidth: 0, flexShrink: 0, p: 0, fontSize: 10, lineHeight: 1.5, whiteSpace: 'nowrap' }}>{pack.dataNotice}</Button>}
          <Typography sx={{ display: { xs: 'none', md: 'block' }, fontSize: 10, color: 'text.secondary', whiteSpace: 'nowrap' }}>Estimates in m/s · {redundancy}% reserve · Schematic, not to scale</Typography>
        </Box>
      </Box>

      <Popper open={showBreakdown} anchorEl={breakdownAnchor} placement="top-end" popperOptions={{ strategy: 'fixed' }} modifiers={[{ name: 'offset', options: { offset: [0, 12] } }, { name: 'preventOverflow', options: { padding: 8 } }]} sx={{ zIndex: 1200 }}>
        <Paper role="region" aria-label="Maneuver breakdown panel" sx={{ width: 'min(320px, calc(100vw - 16px))', borderRadius: 1.5, overflow: 'hidden', boxShadow: '0 12px 40px #0008, inset 0 1px 0 #ffffff06', backgroundImage: 'linear-gradient(145deg, #1a2a42, #132037)', '@media (max-height: 500px)': { width: 'min(520px, calc(100vw - 16px))' } }}>
          <Box sx={{ px: 1.5, py: .5, display: 'flex', justifyContent: 'space-between', alignItems: 'center', bgcolor: '#ffffff05', boxShadow: 'inset 0 -1px 0 #ffffff06', [compactBreakdown]: { py: .25 } }}>
            <Typography sx={{ fontSize: 12, fontWeight: 600 }}>Maneuver breakdown</Typography>
            <IconButton aria-label="Close breakdown" size="small" onClick={() => { setShowBreakdown(false); breakdownToggle.current?.focus() }} sx={{ [compactBreakdown]: { p: .25 } }}><CloseRounded sx={{ fontSize: 16 }} /></IconButton>
          </Box>
          {route?.status === 'success' && activeLeg && budget ? <>
            {roundTrip && <Box sx={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid', borderColor: 'divider' }}>
              <Tabs aria-label="Trip leg" value={breakdownLeg} onChange={(_, value: 'outbound' | 'return') => setBreakdownLeg(value)} sx={{ minHeight: 28, flex: 1, '& .MuiTab-root': { minHeight: 28, minWidth: 72, py: .25, px: 1.25, fontSize: 11, textTransform: 'none' } }}>
                <Tab id="outbound-trip-tab" aria-controls="trip-breakdown-panel" value="outbound" label="Outbound" />
                <Tab id="return-trip-tab" aria-controls="trip-breakdown-panel" value="return" label="Return" />
              </Tabs>
              <Typography data-testid="leg-total" sx={{ px: 1.5, fontSize: 11, whiteSpace: 'nowrap', color: 'text.secondary' }}>{format.format(activeLeg.totalDeltaV)} m/s</Typography>
            </Box>}
            <Box role={roundTrip ? 'tabpanel' : undefined} id="trip-breakdown-panel" aria-labelledby={roundTrip ? `${breakdownLeg}-trip-tab` : undefined}>
            <Typography sx={{ px: 1.5, py: .5, color: 'primary.main', fontSize: 11, [compactBreakdown]: { py: .25 } }}>Start · {nodesById.get(activeLeg.nodeIds[0] ?? '')?.label}</Typography>
            <Box component="ol" aria-label="Maneuver breakdown" sx={{ listStyle: 'none', m: 0, p: 0, '@media (max-height: 500px)': { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' } }}>
              {activeLeg.legs.map(({ edge }, index) => <Box component="li" key={`${edge.id}:${index}`} title={edge.label} sx={{ display: 'flex', alignItems: 'center', gap: .75, px: 1.5, py: .45, bgcolor: index % 2 === 0 ? '#ffffff08' : undefined, minWidth: 0, [compactBreakdown]: { py: 0, '& .MuiTypography-root': { fontSize: 10, lineHeight: 1.25 } } }}>
                <Box component="span" sx={{ width: 5, height: 5, flexShrink: 0, borderRadius: '50%', bgcolor: bodiesById.get(nodesById.get(edge.to)?.bodyId ?? '')?.color ?? 'primary.main' }} />
                <Typography sx={{ flex: 1, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nodesById.get(edge.to)?.label}</Typography>
                <Typography sx={{ fontSize: 11, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{format.format(edge.deltaV)} m/s</Typography>
              </Box>)}
            </Box>
            {activeLeg.legs.length === 0 && <Typography sx={{ px: 1.5, py: 1, fontSize: 12 }}>No maneuvers required.</Typography>}
            <Typography sx={{ px: 1.5, py: .5, color: 'secondary.main', fontSize: 11, [compactBreakdown]: { py: .25 } }}>End · {nodesById.get(activeLeg.nodeIds.at(-1) ?? '')?.label}</Typography>
            </Box>
            {redundancy > 0 && <Typography sx={{ px: 1.5, py: .75, borderTop: '1px solid', borderColor: 'divider', fontSize: 11, [compactBreakdown]: { py: .5 } }}>+{redundancy}% redundancy · {format.format(budget.extraDeltaV)} m/s {roundTrip ? 'mission reserve' : 'extra'}</Typography>}
          </> : <Typography sx={{ p: 1.5, fontSize: 12, color: 'text.secondary' }}>Select an origin and destination to see the maneuvers.</Typography>}
        </Paper>
      </Popper>

      <Dialog open={showInfo} onClose={() => setShowInfo(false)} maxWidth="sm" fullWidth aria-labelledby="model-info-heading">
        <DialogTitle id="model-info-heading">About these estimates</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1.5 }}>{pack.description}</Typography>
          <Typography variant="body2" sx={{ mb: 1.5 }}>Round trips calculate outbound and return maneuvers separately. Redundancy applies once to the complete mission budget. Arrows show potential atmospheric braking; no atmospheric savings are included.</Typography>
          <Box component="ul" sx={{ pl: 2.5, '& li': { fontSize: 13, mb: 1 } }}>
            {pack.assumptions.map(assumption => <li key={assumption}>{assumption}</li>)}
          </Box>
          <Stack spacing={.75}>{pack.sources.map(source => <Link key={source.id} href={source.url} target="_blank" rel="noreferrer" variant="body2">{source.title}</Link>)}</Stack>
        </DialogContent>
        <DialogActions><Button onClick={() => setShowInfo(false)}>Close</Button></DialogActions>
      </Dialog>
    </Box>
  )
}
