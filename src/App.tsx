import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Box, Button, Checkbox, FormControlLabel, IconButton, Paper, Popper, Slider, Stack, Tab, Tabs,
  ToggleButton, ToggleButtonGroup, Tooltip, Typography, useMediaQuery,
} from '@mui/material'
import RocketLaunchRounded from '@mui/icons-material/RocketLaunchRounded'
import SwapHorizRounded from '@mui/icons-material/SwapHorizRounded'
import RestartAltRounded from '@mui/icons-material/RestartAltRounded'
import InfoOutlined from '@mui/icons-material/InfoOutlined'
import CloseRounded from '@mui/icons-material/CloseRounded'
import AltRouteRounded from '@mui/icons-material/AltRouteRounded'
import ChevronLeftRounded from '@mui/icons-material/ChevronLeftRounded'
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded'
import ExtensionOutlined from '@mui/icons-material/ExtensionOutlined'
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded'
import AirRounded from '@mui/icons-material/AirRounded'
import SatelliteAltRounded from '@mui/icons-material/SatelliteAltRounded'
import { stockPack } from './data/stock'
import { builtInConfigurations, changeBaseConfiguration, getBasePackId, planetPacks, primaryPlanetPacks } from './data/planetPacks'
import type { PlanetPack } from './types/planner'
import DeltaVMap from './components/DeltaVMap'
import SpaceBackground from './components/SpaceBackground'
import StopsDialog from './components/StopsDialog'
import PlanetPacksDialog from './components/PlanetPacksDialog'
import AtmosphereDialog from './components/AtmosphereDialog'
import RelayPlannerDialog from './components/RelayPlannerDialog'
import ConnectionAllowancesDialog from './components/ConnectionAllowancesDialog'
import EstimateInfoDialog, { type EstimateSection } from './components/EstimateInfoDialog'
import { basisColors, basisShortNames } from './components/estimatePresentation'
import { buildGraph } from './utils/buildGraph'
import { findMissionRoute, type MissionMode } from './utils/mission'
import { calculateBudget } from './utils/budget'
import { readCustomPacks, saveCustomPacks, validateCustomPackAddition } from './utils/customPacks'
import { applyAtmosphericAssistance, getAtmosphericCapabilities, type AtmosphericPlan } from './utils/atmosphericAssistance'
import { applyConnectionAllowances, type ConnectionPlan } from './utils/connectionAllowances'
import { describeManeuverBasis, summarizeBudgetBasis } from './utils/estimateBasis'

const format = new Intl.NumberFormat('en-US')
const compactBreakdown = '@media (max-height: 500px), (max-width: 699px) and (max-height: 650px)'
const selectorGroupStyles = {
  display: 'flex', width: '100%', border: '1px solid #456080', borderRadius: 1, bgcolor: '#080f2180',
  '& .MuiToggleButtonGroup-grouped': { flex: 1, minWidth: 0, m: 0, border: '1px solid transparent', borderRadius: '7px !important' },
  '& .MuiToggleButton-root': {
    minHeight: 32, px: .25, py: .5, gap: .75, fontSize: 12, lineHeight: 1.2, fontWeight: 500, whiteSpace: 'nowrap', color: 'text.secondary',
    '&:hover': { bgcolor: '#ffffff0a', color: 'text.primary' },
    '&.Mui-selected': { color: '#d9f1ff', borderColor: '#73c8fa70', bgcolor: '#285278', backgroundImage: 'linear-gradient(180deg, #315f86, #23486b)', boxShadow: '0 2px 6px #0003, inset 0 1px 0 #ffffff12', '&:hover': { bgcolor: '#315f86' } },
    '&.Mui-focusVisible': { outline: '2px solid #b3e3ff', outlineOffset: 1, zIndex: 1 },
  },
} as const

export default function App() {
  const compactDetails = useMediaQuery('(max-width: 699px), (max-height: 750px)')
  const [customPackState, setCustomPackState] = useState(() => {
    try { return readCustomPacks(window.localStorage) }
    catch { return { packs: [] as PlanetPack[], warning: 'Browser storage is unavailable. Imported packs will work for this session; export a copy to keep them.' } }
  })
  const customPacks = customPackState.packs
  const availablePacks = useMemo(() => [...planetPacks, ...customPacks], [customPacks])
  const [packId, setPackId] = useState('stock')
  const pack = availablePacks.find(candidate => candidate.id === packId) ?? stockPack
  const isCustomPack = customPacks.some(candidate => candidate.id === pack.id)
  const activeAddons = builtInConfigurations.find(configuration => configuration.pack.id === pack.id)?.addons ?? []
  const [showPacks, setShowPacks] = useState(false)
  const [showAtmosphere, setShowAtmosphere] = useState(false)
  const [showRelays, setShowRelays] = useState(false)
  const [showAllowances, setShowAllowances] = useState(false)
  const [connectionPlan, setConnectionPlan] = useState<ConnectionPlan>([])
  const [mapFocusNodeId, setMapFocusNodeId] = useState<string | null>(null)
  const [atmosphericPlan, setAtmosphericPlan] = useState<AtmosphericPlan>([])
  const hasAtmosphericOptions = atmosphericPlan.some(option => option.capture || option.landing)
  const referenceGraph = useMemo(() => buildGraph(pack), [pack])
  const { graph: allowanceGraph, edges: allowanceEdges } = useMemo(() => applyConnectionAllowances(referenceGraph, pack, connectionPlan), [referenceGraph, pack, connectionPlan])
  const displayPack = useMemo(() => allowanceEdges.length ? { ...pack, maneuvers: [...pack.maneuvers, ...allowanceEdges] } : pack, [pack, allowanceEdges])
  const { graph, adjustments } = useMemo(() => applyAtmosphericAssistance(allowanceGraph, pack, atmosphericPlan), [allowanceGraph, pack, atmosphericPlan])
  const nodesById = useMemo(() => new Map(pack.nodes.map(node => [node.id, node])), [pack])
  const bodiesById = useMemo(() => new Map(pack.bodies.map(body => [body.id, body])), [pack])
  const [startId, setStartId] = useState<string | null>(null)
  const [endId, setEndId] = useState<string | null>(null)
  const [selection, setSelection] = useState<'start' | 'end' | 'stop'>('start')
  const previousSelection = useRef<'start' | 'end'>('start')
  const [waypointIds, setWaypointIds] = useState<string[]>([])
  const [showStops, setShowStops] = useState(false)
  const [redundancy, setRedundancy] = useState(0)
  const [missionMode, setMissionMode] = useState<MissionMode>('one-way')
  const roundTrip = missionMode === 'round-trip'
  const returnOnly = missionMode === 'return-only'
  const [breakdownLeg, setBreakdownLeg] = useState<'outbound' | 'return'>('outbound')
  const [breakdownStage, setBreakdownStage] = useState(0)
  const [breakdownPage, setBreakdownPage] = useState(0)
  const [showBreakdown, setShowBreakdown] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const [infoSection, setInfoSection] = useState<EstimateSection>('sources')
  const [breakdownAnchor, setBreakdownAnchor] = useState<HTMLDivElement | null>(null)
  const breakdownToggle = useRef<HTMLInputElement>(null)
  const route = useMemo(
    () => startId !== null && endId !== null ? findMissionRoute(graph, startId, endId, missionMode, waypointIds) : null,
    [graph, startId, endId, missionMode, waypointIds],
  )
  const referenceRoute = useMemo(
    () => hasAtmosphericOptions && startId !== null && endId !== null ? findMissionRoute(allowanceGraph, startId, endId, missionMode, waypointIds) : null,
    [allowanceGraph, hasAtmosphericOptions, startId, endId, missionMode, waypointIds],
  )
  const atmosphericDifference = route?.status === 'success' && referenceRoute?.status === 'success'
    ? route.totalDeltaV - referenceRoute.totalDeltaV : null
  const atmosphericComparison = atmosphericDifference !== null && referenceRoute?.status === 'success'
    ? `${atmosphericDifference > 0 ? '+' : ''}${format.format(atmosphericDifference)} m/s atmosphere · ${format.format(referenceRoute.totalDeltaV)} m/s before atmosphere, before reserve.` : null
  const showingReturn = returnOnly || roundTrip && breakdownLeg === 'return'
  const activeJourney = route?.status === 'success'
    ? showingReturn ? route.returnRoute : route.outbound
    : null
  const stages = route?.status === 'success' ? showingReturn ? route.returnStages : route.outboundStages : []
  const stageIndex = Math.min(breakdownStage, Math.max(0, stages.length - 1))
  const activeLeg = stages[stageIndex] ?? activeJourney
  const pageSize = compactDetails || isCustomPack || (activeLeg?.legs.length ?? 0) > 17 ? 8 : activeLeg?.legs.length || 1
  const pageCount = Math.ceil((activeLeg?.legs.length ?? 0) / pageSize)
  const pageIndex = Math.min(breakdownPage, Math.max(0, pageCount - 1))
  const pageStart = pageIndex * pageSize
  const visibleManeuvers = activeLeg?.legs.slice(pageStart, pageStart + pageSize) ?? []
  const activeStart = activeLeg?.nodeIds[0]
  const activeEnd = activeLeg?.nodeIds.at(-1)
  const startColor = activeStart === endId ? 'secondary.main' : activeStart === startId ? 'primary.main' : '#92d5c6'
  const endColor = activeEnd === endId ? 'secondary.main' : activeEnd === startId ? 'primary.main' : '#92d5c6'
  const budget = route?.status === 'success' ? calculateBudget(route.totalDeltaV, redundancy) : null
  const budgetText = budget ? format.format(budget.totalDeltaV) : ''
  // Reserve enough width for tabular digits, separators, and the smaller unit.
  const budgetTextWidth = [...budgetText].reduce((width, char) => width + (/\d/.test(char) ? .58 : .3), 1.5)
  const hasAtmosphericLanding = route?.status === 'success' && route.legs.some(({ edge }) =>
    edge.kind === 'descent' && bodiesById.get(nodesById.get(edge.to)?.bodyId ?? '')?.hasAtmosphere,
  )
  const hubName = bodiesById.get(pack.transferHubBodyId ?? '')?.name ?? 'the reference planet'
  const hasLayover = route?.status === 'success' && [...route.outboundStages, ...route.returnStages].some(leg => leg.legs.filter(({ edge }) =>
    edge.kind === 'transfer' && nodesById.get(edge.from)?.kind === 'encounter' && nodesById.get(edge.to)?.kind === 'encounter',
  ).length > 1)
  const layoverNotice = isCustomPack || pack.mapRegions ? 'Includes intermediate parking orbits.' : `Includes a ${hubName} parking-orbit layover.`
  const hasUnpricedLinks = (pack.unpricedConnections?.length ?? 0) > 0
  const needsLinkAllowances = hasUnpricedLinks && route?.status === 'unreachable'
  const allowanceEdgeIds = useMemo(() => new Set(allowanceEdges.map(edge => edge.id)), [allowanceEdges])
  const usesLinkAllowances = route?.status === 'success' && route.legs.some(({ edge }) => allowanceEdgeIds.has(edge.id))
  const basisOptions = useMemo(() => ({ customPack: isCustomPack, allowanceEdgeIds, atmosphericPlan }), [isCustomPack, allowanceEdgeIds, atmosphericPlan])
  const basisGroups = useMemo(() => route?.status === 'success' ? summarizeBudgetBasis(route.legs, pack, basisOptions) : [], [route, pack, basisOptions])
  const basisByEdge = useMemo(() => new Map(route?.status === 'success' ? route.legs.map(({ edge }) => [edge.id, describeManeuverBasis(edge, pack, basisOptions)]) : []), [route, pack, basisOptions])
  const estimateNotices = [
    ...(hasLayover ? [layoverNotice] : []),
    'Stops retain arrival conditions. Return only starts at the destination; the reserve applies once to the complete selected mission.',
  ]

  function openInfo(section: EstimateSection) {
    setInfoSection(section)
    setShowBreakdown(false)
    setShowInfo(true)
  }

  useEffect(() => {
    if (!showBreakdown && selection !== 'stop') return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (selection === 'stop') {
          setSelection(previousSelection.current)
          setShowStops(true)
        } else {
          setShowBreakdown(false)
          breakdownToggle.current?.focus()
        }
      }
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [showBreakdown, selection])

  function resetDetails() {
    setBreakdownLeg('outbound')
    setBreakdownStage(0)
    setBreakdownPage(0)
  }

  function changeStops(ids: string[]) {
    if (ids.length > waypointIds.length) setMapFocusNodeId(ids.at(-1) ?? null)
    setWaypointIds(ids)
    resetDetails()
  }

  function selectStopOnMap() {
    if (waypointIds.length >= 4) return
    if (selection !== 'stop') previousSelection.current = selection
    setSelection('stop')
    setShowStops(false)
    setShowBreakdown(false)
  }

  function selectNode(id: string) {
    setMapFocusNodeId(id)
    resetDetails()
    if (selection === 'stop') {
      setWaypointIds(ids => ids.length < 4 ? [...ids, id] : ids)
      setSelection(previousSelection.current)
      setShowStops(true)
      return
    }
    if (selection === 'start') {
      setStartId(id)
      setSelection('end')
    } else setEndId(id)
  }

  function changePack(id: string) {
    const nextPack = availablePacks.find(candidate => candidate.id === id)
    if (!nextPack || id === packId) return
    const available = new Set(nextPack.nodes.map(node => node.id))
    const nextStart = startId !== null && available.has(startId) ? startId : null
    const nextEnd = endId !== null && available.has(endId) ? endId : null
    setPackId(id)
    setMapFocusNodeId(nextEnd ?? nextStart)
    setStartId(nextStart)
    setEndId(nextEnd)
    setWaypointIds(ids => ids.filter(nodeId => available.has(nodeId)))
    const currentConnections = new Map((pack.unpricedConnections ?? []).map(connection => [connection.id, connection]))
    const compatibleConnections = new Set((nextPack.unpricedConnections ?? []).filter(connection => {
      const previous = currentConnections.get(connection.id)
      return previous?.from === connection.from && previous.to === connection.to
        && previous.forwardKind === connection.forwardKind && previous.reverseKind === connection.reverseKind
    }).map(connection => connection.id))
    setConnectionPlan(options => options.filter(option => compatibleConnections.has(option.connectionId)))
    const capabilities = new Map(getAtmosphericCapabilities(nextPack).map(capability => [capability.body.id, capability]))
    setAtmosphericPlan(options => options.flatMap(option => {
      const capability = capabilities.get(option.bodyId)
      if (!capability) return []
      const capture = option.capture && capability.capture
      const landing = option.landing && capability.landing
      return capture || landing ? [{ ...option, capture, landing }] : []
    }))
    setSelection(nextStart === null ? 'start' : nextEnd === null || selection === 'stop' ? 'end' : selection)
    setShowStops(false)
    setShowBreakdown(false)
    setShowAtmosphere(false)
    setShowRelays(false)
    setShowAllowances(false)
    resetDetails()
  }

  function storeCustomPacks(packs: PlanetPack[]) {
    let warning: string | null
    try { warning = saveCustomPacks(window.localStorage, packs) }
    catch { warning = 'Browser storage is unavailable. Imported packs will work for this session; export a copy to keep them.' }
    setCustomPackState({ packs, warning })
  }

  function importPack(candidate: PlanetPack): string | null {
    const error = validateCustomPackAddition(candidate, customPacks)
    if (error) return error
    storeCustomPacks([...customPacks, candidate])
    return null
  }

  function removePack(id: string) {
    if (id === pack.id) changePack(stockPack.id)
    storeCustomPacks(customPacks.filter(candidate => candidate.id !== id))
  }

  function reset() {
    setStartId(null)
    setMapFocusNodeId(null)
    setEndId(null)
    setSelection('start')
    setWaypointIds([])
    setShowStops(false)
    setRedundancy(0)
    setAtmosphericPlan([])
    setConnectionPlan([])
    setShowAllowances(false)
    setShowAtmosphere(false)
    setShowRelays(false)
    setMissionMode('one-way')
    resetDetails()
    setShowBreakdown(false)
  }

  const personalLanding = route?.status === 'success' && route.legs.some(({ edge }) => edge.kind === 'descent' && !allowanceEdgeIds.has(edge.id) && basisByEdge.get(edge.id)?.kind === 'user')
  const landingNotice = basisGroups.some(group => group.kind === 'placeholder') ? 'Atmospheric landing uses a default Delta-V allowance. Open budget info for details.'
    : personalLanding ? 'Atmospheric landing includes your powered allowance.' : "Atmospheric landing follows the pack's supplied budget."
  const routeStatus = needsLinkAllowances ? 'Some route links are unpriced. Open Link allowances to enter your estimates.'
    : route?.status === 'invalid' || route?.status === 'unreachable' ? route.message
    : route?.status === 'success' && route.legs.length === 0 ? 'No maneuvers required.'
      : hasAtmosphericLanding ? `${landingNotice}${hasLayover ? ` ${layoverNotice}` : ''}`
        : hasLayover ? layoverNotice
          : route?.status === 'success' ? usesLinkAllowances ? `${route.legs.length} maneuvers · Includes user link allowances.` : `${route.legs.length} maneuvers · Select a state to update your ${selection === 'start' ? 'origin' : 'destination'}.`
            : `Select ${selection === 'start' ? 'an origin' : 'a destination'} on the map.`
  const status = selection === 'stop' ? `Select stop ${waypointIds.length + 1} on the map. Escape cancels.`
    : returnOnly && route?.status === 'success'
    ? `Return only: ${nodesById.get(endId ?? '')?.label} → ${nodesById.get(startId ?? '')?.label}. ${routeStatus}`
    : routeStatus

  return (
    <Box sx={{ width: '100%', height: '100dvh', display: 'grid', gridTemplateRows: '44px minmax(0, 1fr) auto', overflow: 'hidden', '@media (max-height: 500px)': { gridTemplateRows: '34px minmax(0, 1fr) auto' } }}>
      <Box component="header" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: { xs: 1.25, sm: 2.5 }, borderBottom: '1px solid', borderColor: 'divider', gap: 1, background: 'linear-gradient(100deg, #111d32, #0c1628)', boxShadow: 'inset 0 1px 0 #ffffff04' }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0 }}>
          <RocketLaunchRounded sx={{ color: 'primary.main', fontSize: 21 }} />
          <Typography component="h1" sx={{ fontWeight: 700, fontSize: { xs: 14, sm: 16 }, letterSpacing: '-.015em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>KSP DeltaV Planner</Typography>
        </Stack>
        <Stack direction="row" spacing={{ xs: .5, sm: 1 }} sx={{ alignItems: 'center', minWidth: 0 }}>
          <Tooltip title="Configure ideal atmospheric capture and landing allowances. Map arrows show potential assistance; bundled transfers keep their reference cost.">
            <Box role="note" aria-label="Aerobraking legend">
            <Button aria-label="Atmospheric assistance" aria-haspopup="dialog" aria-expanded={showAtmosphere} aria-pressed={hasAtmosphericOptions} onClick={() => {
              if (selection === 'stop') setSelection(previousSelection.current)
              setShowStops(false)
              setShowPacks(false)
              setShowBreakdown(false)
              setShowAtmosphere(true)
            }} sx={{ display: 'flex', alignItems: 'center', gap: .5, minWidth: 0, minHeight: 28, px: .75, py: .35, border: '1px solid', borderColor: hasAtmosphericOptions ? '#92d5c680' : '#c6e8d830', borderRadius: 4, bgcolor: hasAtmosphericOptions ? '#285044' : '#1a202c99', color: hasAtmosphericOptions ? '#c1efdf' : '#b5c9bf', whiteSpace: 'nowrap', '&:hover': { bgcolor: '#285044' } }}>
              <svg width="10" height="10" viewBox="-8 -8 16 16" aria-hidden="true"><path d="M -7 -6 L 7 0 L -7 6 Z" fill="#c6e8d8" /></svg>
              <Typography component="span" sx={{ fontSize: 10, lineHeight: 1.4 }}>
                <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Atmosphere</Box>
                <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>Aero</Box>
              </Typography>
              <ExpandMoreRounded sx={{ fontSize: 14 }} />
            </Button>
            </Box>
          </Tooltip>
          <Tooltip title="CommNet relay coverage and deployment planning">
            <Button aria-label="CommNet relay planner" aria-haspopup="dialog" aria-expanded={showRelays} onClick={() => {
              if (selection === 'stop') setSelection(previousSelection.current)
              setShowStops(false)
              setShowPacks(false)
              setShowBreakdown(false)
              setShowAtmosphere(false)
              setShowInfo(false)
              setShowRelays(true)
            }} sx={{ minWidth: 28, minHeight: 28, px: { xs: .5, sm: .75 }, gap: .5, border: '1px solid #73c8fa35', borderRadius: 4, color: 'primary.main', bgcolor: '#73c8fa08', whiteSpace: 'nowrap', '&:hover': { bgcolor: '#73c8fa18' } }}>
              <SatelliteAltRounded sx={{ fontSize: 17 }} />
              <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' }, fontSize: 10 }}>Relays</Box>
            </Button>
          </Tooltip>
          <Typography variant="caption" color="text.secondary" title={pack.name} sx={{ display: { xs: 'none', sm: 'block' }, minWidth: 0, fontSize: 10, letterSpacing: '.1em', whiteSpace: 'nowrap', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>{pack.shortName ?? pack.name} · KSP 1</Typography>
          <Tooltip title="Model assumptions and data sources"><IconButton aria-label="Model assumptions and data sources" size="small" onClick={() => openInfo('sources')}><InfoOutlined sx={{ fontSize: 19 }} /></IconButton></Tooltip>
        </Stack>
      </Box>

      <Box component="main" aria-label="Interactive Delta-V map" sx={{ minHeight: 0, minWidth: 0, overflow: 'hidden', position: 'relative' }}>
        <SpaceBackground />
        <DeltaVMap key={pack.id} pack={displayPack} startId={startId} endId={endId} waypointIds={waypointIds} focusNodeId={mapFocusNodeId} route={route} adjustments={adjustments} onSelect={selectNode} />
      </Box>

      <Box ref={setBreakdownAnchor} component="footer" sx={{ bgcolor: 'background.paper', backgroundImage: 'linear-gradient(180deg, #16243b, #101b2f)', borderTop: '2px solid', borderColor: 'primary.dark', minWidth: 0, boxShadow: '0 -8px 24px #00000018, inset 0 1px 0 #ffffff03' }}>
        <Box component="section" aria-label="Mission controls" sx={{
          display: 'grid', minWidth: 0, columnGap: 2, rowGap: .75,
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
          gridTemplateAreas: '"selectors selectors" "mission mission" "reserve budget" "stops actions"',
          px: { xs: 1.25, sm: 2.5 }, pt: { xs: 1, sm: 1.5 }, pb: .5,
          '@media (min-width: 700px), (min-width: 600px) and (max-height: 500px)': { gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr) minmax(0, 1fr) auto', gridTemplateAreas: '"selectors selectors selectors stops" "mission reserve budget actions"', alignItems: 'center', columnGap: 3 },
          [compactBreakdown]: { pt: .25, pb: .125, rowGap: .5 },
          '@media (max-height: 500px)': { pt: .25, columnGap: 1.5 },
        }}>
          <Box sx={{ gridArea: 'selectors', display: 'grid', gridTemplateColumns: 'minmax(0, .78fr) minmax(0, 1fr)', gap: { xs: .75, sm: 1.5 }, width: '100%', maxWidth: 560, minWidth: 0 }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography title={pack.name} sx={{ mb: .25, fontSize: 10, lineHeight: 1.1, color: 'text.secondary', letterSpacing: '.06em', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', '@media (max-height: 500px)': { display: 'none' } }}>{isCustomPack ? `System · ${pack.shortName ?? pack.name}` : activeAddons.length ? `System · + ${activeAddons.join(', ')}` : 'System'}</Typography>
              <ToggleButtonGroup exclusive aria-label="Planet pack" value={isCustomPack ? 'custom' : getBasePackId(pack.id)} onChange={(_, value: string | null) => { if (value !== null && value !== 'custom') changePack(changeBaseConfiguration(pack.id, value)) }} sx={selectorGroupStyles}>
                {primaryPlanetPacks.map(candidate => <ToggleButton key={candidate.id} value={candidate.id} title={candidate.name}>{candidate.shortName ?? candidate.name}</ToggleButton>)}
                <ToggleButton value="custom" aria-label="Custom planet packs" aria-haspopup="dialog" aria-expanded={showPacks} title="Custom planet packs" onClick={() => {
                  if (selection === 'stop') setSelection(previousSelection.current)
                  setShowStops(false)
                  setShowBreakdown(false)
                  setShowPacks(true)
                }} sx={{ flex: '0 0 28px !important' }}><ExtensionOutlined sx={{ fontSize: 17 }} /></ToggleButton>
              </ToggleButtonGroup>
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ mb: .25, fontSize: 10, lineHeight: 1.1, color: 'text.secondary', letterSpacing: '.06em', textTransform: 'uppercase', '@media (max-height: 500px)': { display: 'none' } }}>Trip</Typography>
              <ToggleButtonGroup exclusive fullWidth aria-label="Mission mode" value={missionMode} onChange={(_, value: MissionMode | null) => { if (value !== null) { setMissionMode(value); resetDetails() } }} sx={{ ...selectorGroupStyles, '@media (max-width: 599px)': { '& [aria-hidden]': { display: 'none' }, '& .MuiToggleButton-root': { gap: 0 } }, '@media (max-width: 359px)': { '& .MuiToggleButton-root': { fontSize: 11 } } }}>
              <ToggleButton value="one-way"><Box component="span" aria-hidden="true" sx={{ fontSize: 17, lineHeight: 1 }}>→</Box>One way</ToggleButton>
              <ToggleButton value="round-trip"><Box component="span" aria-hidden="true" sx={{ fontSize: 17, lineHeight: 1 }}>⇄</Box>Round trip</ToggleButton>
              <ToggleButton value="return-only"><Box component="span" aria-hidden="true" sx={{ fontSize: 17, lineHeight: 1 }}>←</Box>Return only</ToggleButton>
              </ToggleButtonGroup>
            </Box>
          </Box>
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
                    <Typography component="span" sx={{ display: 'block', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', lineHeight: 1.2, opacity: .9, whiteSpace: 'nowrap', '@media (min-width: 700px) and (max-width: 899px), (max-height: 500px) and (max-width: 699px)': { fontSize: 9, letterSpacing: '.04em' } }}>{endpoint === 'start' ? 'A' : 'B'} · {label}</Typography>
                    <Typography component="span" id={`${endpoint}-state`} title={nodeId ? nodesById.get(nodeId)?.label : undefined} sx={{ display: 'block', fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', mt: .25 }}>{nodeId ? nodesById.get(nodeId)?.label : `Select ${label.toLowerCase()}`}</Typography>
                  </Box>
                </Button>
              </Box>
            })}
            <Tooltip title="Reverse the endpoints and stop order"><span style={{ gridColumn: 2, gridRow: 1 }}><IconButton aria-label="Swap origin and destination" disabled={!startId || !endId} onClick={() => { setStartId(endId); setEndId(startId); setWaypointIds(ids => [...ids].reverse()); resetDetails() }} size="small"><SwapHorizRounded sx={{ fontSize: 20 }} /></IconButton></span></Tooltip>
          </Box>

          <Box sx={{ gridArea: 'reserve', minWidth: 0, px: .5 }}>
            <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Typography component="label" htmlFor="redundancy-slider" sx={{ fontSize: 11, color: 'text.secondary' }}>Redundancy</Typography>
              <Typography sx={{ fontSize: 12, fontWeight: 500, color: 'primary.main', fontVariantNumeric: 'tabular-nums' }}>+{redundancy}%</Typography>
            </Stack>
            <Slider id="redundancy-slider" aria-label="Redundancy" min={0} max={100} step={5} value={redundancy} onChange={(_, value) => { if (typeof value === 'number') setRedundancy(value) }} getAriaValueText={value => `${value}% redundancy`} valueLabelDisplay="auto" valueLabelFormat={value => `+${value}%`} size="small" sx={{ display: 'block', width: 'calc(100% - 12px)', mx: '6px', py: 1.5, '& .MuiSlider-thumb': { width: 13, height: 13 } }} />
          </Box>

          <Box sx={{ gridArea: 'budget', minWidth: 0, containerType: 'inline-size' }}>
            <Button aria-label="Budget assumptions" aria-haspopup="dialog" onClick={() => openInfo('mission')} sx={{ minHeight: 24, minWidth: 0, maxWidth: '100%', px: 0, py: 0, gap: .5, color: 'text.secondary', fontSize: 10, letterSpacing: '.06em', textTransform: 'uppercase', '@media (max-height: 500px)': { minHeight: 18 } }}>
              <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{roundTrip ? 'Round-trip budget' : returnOnly ? 'Return-only budget' : 'Delta-V budget'}</Box><InfoOutlined sx={{ fontSize: 13, flexShrink: 0 }} />
            </Button>
            {budget ? <Typography component="output" data-testid="route-total" sx={{ display: 'block', fontSize: `min(32px, ${100 / budgetTextWidth}cqi)`, lineHeight: 1.1, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', fontWeight: 700, letterSpacing: '-.025em', '@container (max-width: 170px)': { fontSize: `min(25px, ${100 / budgetTextWidth}cqi)` } }}>
              {budgetText} <Box component="span" sx={{ fontSize: '.55em', color: 'text.secondary' }}>m/s</Box>
            </Typography> : <Typography sx={{ fontSize: 25, lineHeight: 1.1, color: 'text.secondary' }}>— <Box component="span" sx={{ fontSize: 13 }}>m/s</Box></Typography>}
            <Typography title={budget ? `${format.format(budget.baseDeltaV)} m/s maneuvers +${format.format(budget.extraDeltaV)} m/s reserve and final rounding. Open Budget assumptions for the cost basis.` : undefined} sx={{ fontSize: 10, color: 'text.secondary', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {budget ? <><Box component="span" data-testid="route-base">{format.format(budget.baseDeltaV)} m/s</Box> plan <Box component="span" sx={{ color: 'primary.main' }} data-testid="route-margin">+{format.format(budget.extraDeltaV)} m/s</Box></> : 'Select two states to calculate'}
            </Typography>
          </Box>

          <Button aria-label={selection === 'stop' ? 'Cancel stop selection' : 'Edit mission stops'} startIcon={<AltRouteRounded sx={{ fontSize: '16px !important' }} />} onClick={() => {
            if (selection === 'stop') setSelection(previousSelection.current)
            setShowBreakdown(false)
            setShowStops(true)
          }} sx={{ gridArea: 'stops', justifySelf: 'start', minHeight: 32, minWidth: 0, px: .75, fontSize: 11, color: waypointIds.length ? '#92d5c6' : 'text.secondary', border: '1px solid', borderColor: waypointIds.length || selection === 'stop' ? '#92d5c660' : 'divider', borderRadius: 1 }}>
            {selection === 'stop' ? 'Cancel' : 'Stops'}{waypointIds.length > 0 && <Box component="span" data-testid="stop-count" sx={{ ml: .75, color: '#92d5c6', fontVariantNumeric: 'tabular-nums' }}>{waypointIds.length}</Box>}
          </Button>
          <Box sx={{ gridArea: 'actions', display: 'flex', alignItems: 'center', justifyContent: { xs: 'space-between', sm: 'flex-start' }, gap: .25, '@media (min-width: 700px), (min-width: 600px) and (max-height: 500px)': { flexDirection: 'column', alignItems: 'flex-start', gap: 0 } }}>
            <FormControlLabel sx={{ m: 0, '& .MuiFormControlLabel-label': { fontSize: 11 } }} control={<Checkbox size="small" checked={showBreakdown} onChange={(_, checked) => setShowBreakdown(checked)} slotProps={{ input: { 'aria-label': 'Show breakdown', ref: breakdownToggle } }} sx={{ p: .5, '& .MuiSvgIcon-root': { fontSize: 17 } }} />} label="Breakdown" />
            <Button startIcon={<RestartAltRounded sx={{ fontSize: '16px !important' }} />} aria-label="Reset mission" size="small" onClick={reset} sx={{ minHeight: 28, minWidth: 0, fontSize: 11, px: .5 }}>Clear</Button>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', columnGap: 1, rowGap: .25, px: { xs: 1.25, sm: 2.5 }, pb: .75, minHeight: 20 }}>
          <Box role={selection !== 'stop' && (hasAtmosphericLanding || route?.status === 'invalid') ? 'alert' : 'status'} title={atmosphericComparison && selection !== 'stop' ? `${status} ${atmosphericComparison}` : status} sx={{ flex: '1 1 100%', minWidth: 0, color: selection === 'stop' ? '#92d5c6' : hasAtmosphericOptions ? '#92d5c6' : hasAtmosphericLanding ? 'secondary.main' : 'text.secondary', '@media (min-width: 700px)': { flex: '1 1 0' } }}>
            <Typography data-testid="route-status" sx={{ fontSize: 11, lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere', '@media (max-height: 500px)': { fontSize: 10, lineHeight: 1.2 } }}>{status}</Typography>
            {atmosphericDifference !== null && referenceRoute?.status === 'success' && selection !== 'stop' && <Typography sx={{ fontSize: 10, lineHeight: 1.3, color: '#92d5c6', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              <Box component="output" data-testid="atmospheric-change">{atmosphericDifference > 0 ? '+' : ''}{format.format(atmosphericDifference)} m/s</Box> atmosphere · <Box component="output" data-testid="atmospheric-reference">{format.format(referenceRoute.totalDeltaV)} m/s</Box> before atmosphere
            </Typography>}
          </Box>
          {needsLinkAllowances ? <Button size="small" color="secondary" onClick={() => setShowAllowances(true)} sx={{ minHeight: 20, minWidth: 0, px: .25, py: 0, fontSize: 11, whiteSpace: 'nowrap' }}>Link allowances</Button>
            : pack.dataNotice && <Button size="small" color="secondary" onClick={() => openInfo('sources')} title={pack.dataNotice} sx={{ minHeight: 18, minWidth: 0, maxWidth: isCustomPack ? '40%' : pack.mapRegions ? '45%' : undefined, flexShrink: 0, p: 0, fontSize: 10, lineHeight: 1.5 }}><Box component="span" sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pack.dataNotice}</Box></Button>}
          <Typography sx={{ display: { xs: 'none', md: 'block' }, fontSize: 10, color: 'text.secondary', whiteSpace: 'nowrap' }}>Estimates in m/s · {redundancy}% reserve · Schematic, not to scale</Typography>
        </Box>
      </Box>

      <Popper open={showBreakdown} anchorEl={breakdownAnchor} placement="top-end" popperOptions={{ strategy: 'fixed' }} modifiers={[{ name: 'offset', options: { offset: [0, 8] } }, { name: 'preventOverflow', options: { padding: 8 } }]} sx={{ zIndex: 1200 }}>
        <Paper role="region" aria-label="Maneuver breakdown panel" sx={{ width: 'min(320px, calc(100vw - 16px))', borderRadius: 1.5, overflow: 'hidden', boxShadow: '0 12px 40px #0008, inset 0 1px 0 #ffffff06', backgroundImage: 'linear-gradient(145deg, #1a2a42, #132037)', '@media (max-height: 500px)': { width: 'min(520px, calc(100vw - 16px))' } }}>
          <Box sx={{ px: 1.5, py: .5, display: 'flex', justifyContent: 'space-between', alignItems: 'center', bgcolor: '#ffffff05', boxShadow: 'inset 0 -1px 0 #ffffff06', [compactBreakdown]: { py: 0 } }}>
            <Typography sx={{ fontSize: 12, fontWeight: 600 }}>Maneuver breakdown</Typography>
            <Stack direction="row" sx={{ alignItems: 'center', gap: .25 }}>
              {stages.length > 1 && <>
                <IconButton aria-label="Previous stage" disabled={stageIndex === 0} onClick={() => { setBreakdownStage(stageIndex - 1); setBreakdownPage(0) }} size="small" sx={{ p: .25 }}><ChevronLeftRounded sx={{ fontSize: 16 }} /></IconButton>
                <Typography component="output" data-testid="stage-position" aria-label={`Stage ${stageIndex + 1} of ${stages.length}`} sx={{ fontSize: 11, whiteSpace: 'nowrap', color: '#92d5c6', fontVariantNumeric: 'tabular-nums' }}>{stageIndex + 1} / {stages.length}</Typography>
                <IconButton aria-label="Next stage" disabled={stageIndex === stages.length - 1} onClick={() => { setBreakdownStage(stageIndex + 1); setBreakdownPage(0) }} size="small" sx={{ p: .25 }}><ChevronRightRounded sx={{ fontSize: 16 }} /></IconButton>
              </>}
              <IconButton aria-label="Close breakdown" size="small" onClick={() => { setShowBreakdown(false); breakdownToggle.current?.focus() }} sx={{ [compactBreakdown]: { p: .25 } }}><CloseRounded sx={{ fontSize: 16 }} /></IconButton>
            </Stack>
          </Box>
          {route?.status === 'success' && activeLeg && budget ? <>
            {roundTrip && <Box sx={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid', borderColor: 'divider' }}>
              <Tabs aria-label="Trip leg" value={breakdownLeg} onChange={(_, value: 'outbound' | 'return') => { setBreakdownLeg(value); setBreakdownStage(0); setBreakdownPage(0) }} sx={{ minHeight: 28, flex: 1, '& .MuiTab-root': { minHeight: 28, minWidth: 72, py: .25, px: 1.25, fontSize: 11, textTransform: 'none' } }}>
                <Tab id="outbound-trip-tab" aria-controls="trip-breakdown-panel" value="outbound" label="Outbound" />
                <Tab id="return-trip-tab" aria-controls="trip-breakdown-panel" value="return" label="Return" />
              </Tabs>
              <Typography data-testid="leg-total" sx={{ px: 1.5, fontSize: 11, whiteSpace: 'nowrap', color: 'text.secondary' }}>{format.format(activeJourney?.totalDeltaV ?? 0)} m/s</Typography>
            </Box>}
            <Box role={roundTrip ? 'tabpanel' : undefined} id="trip-breakdown-panel" aria-labelledby={roundTrip ? `${breakdownLeg}-trip-tab` : undefined}>
            <Box sx={{ px: 1.5, py: .5, display: 'flex', alignItems: 'baseline', gap: .75, [compactBreakdown]: { py: .125 } }}>
              <Typography title={nodesById.get(activeStart ?? '')?.label} sx={{ minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: startColor, fontSize: 11 }}>Start · {nodesById.get(activeStart ?? '')?.label}</Typography>
              {stages.length > 1 && <Typography component="output" data-testid="stage-total" sx={{ flexShrink: 0, color: 'text.secondary', fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>{format.format(activeLeg.totalDeltaV)} m/s</Typography>}
            </Box>
            <Box component="ol" aria-label="Maneuver breakdown" sx={{ listStyle: 'none', m: 0, p: 0, '@media (max-height: 500px)': { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' } }}>
              {visibleManeuvers.map(({ edge }, index) => <Box component="li" key={`${edge.id}:${pageStart + index}`} data-budget-basis={basisByEdge.get(edge.id)?.kind} data-assisted={adjustments.has(edge.id) ? 'true' : undefined} title={`${edge.label}: ${format.format(edge.deltaV)} m/s · ${basisByEdge.get(edge.id)?.label}. ${basisByEdge.get(edge.id)?.description}${adjustments.has(edge.id) ? ` Original figure ${format.format(adjustments.get(edge.id)!.originalDeltaV)} m/s.` : ''}`} sx={{ display: 'flex', alignItems: 'center', gap: .75, px: 1.5, py: .45, bgcolor: index % 2 === 0 ? '#ffffff08' : undefined, minWidth: 0, [compactBreakdown]: { py: 0, '& .MuiTypography-root': { fontSize: 10, lineHeight: 1.25 } } }}>
                <Box component="span" sx={{ width: 5, height: 5, flexShrink: 0, borderRadius: '50%', bgcolor: bodiesById.get(nodesById.get(edge.to)?.bodyId ?? '')?.color ?? 'primary.main' }} />
                <Typography sx={{ flex: 1, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nodesById.get(edge.to)?.label}</Typography>
                {basisByEdge.get(edge.id) && <Box component="span" aria-label={`${basisByEdge.get(edge.id)!.label}: ${basisByEdge.get(edge.id)!.description}`} sx={{ flexShrink: 0, fontSize: 10, lineHeight: 1.3, color: basisColors[basisByEdge.get(edge.id)!.kind], bgcolor: '#ffffff06', borderRadius: .5, px: .5 }}>{basisShortNames[basisByEdge.get(edge.id)!.kind]}</Box>}
                {adjustments.has(edge.id) && <AirRounded aria-label="Atmospheric allowance" sx={{ fontSize: 11, color: '#92d5c6', flexShrink: 0 }} />}
                <Typography sx={{ fontSize: 11, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{format.format(edge.deltaV)} m/s</Typography>
              </Box>)}
            </Box>
            {pageCount > 1 && <Stack direction="row" sx={{ px: 1.5, py: .25, gap: .75, alignItems: 'center', justifyContent: 'flex-end', borderTop: '1px solid', borderColor: 'divider' }}>
              <Typography component="output" data-testid="maneuver-position" aria-live="polite" sx={{ mr: 'auto', fontSize: 10, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>{pageStart + 1}–{pageStart + visibleManeuvers.length} of {activeLeg.legs.length}</Typography>
              <IconButton aria-label="Previous maneuvers" disabled={pageIndex === 0} onClick={() => setBreakdownPage(pageIndex - 1)} size="small" sx={{ p: .25 }}><ChevronLeftRounded sx={{ fontSize: 16 }} /></IconButton>
              <IconButton aria-label="Next maneuvers" disabled={pageIndex === pageCount - 1} onClick={() => setBreakdownPage(pageIndex + 1)} size="small" sx={{ p: .25 }}><ChevronRightRounded sx={{ fontSize: 16 }} /></IconButton>
            </Stack>}
            {activeLeg.legs.length === 0 && <Typography sx={{ px: 1.5, py: 1, fontSize: 12 }}>No maneuvers required.</Typography>}
            <Typography title={nodesById.get(activeEnd ?? '')?.label} sx={{ px: 1.5, py: .5, color: endColor, fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', [compactBreakdown]: { py: .125 } }}>End · {nodesById.get(activeEnd ?? '')?.label}</Typography>
            </Box>
            {redundancy > 0 && <Typography sx={{ px: 1.5, py: .75, borderTop: '1px solid', borderColor: 'divider', fontSize: 11, [compactBreakdown]: { py: .5 } }}>+{redundancy}% redundancy · {format.format(budget.extraDeltaV)} m/s reserve + rounding</Typography>}
          </> : <Typography sx={{ p: 1.5, fontSize: 12, color: 'text.secondary' }}>Select an origin and destination to see the maneuvers.</Typography>}
        </Paper>
      </Popper>

      <StopsDialog open={showStops} pack={pack} waypointIds={waypointIds} startId={startId} endId={endId} onChange={changeStops} onClose={() => setShowStops(false)} onSelectOnMap={selectStopOnMap} />

      <PlanetPacksDialog open={showPacks} currentPack={pack} customPacks={customPacks} storageWarning={customPackState.warning} onImport={importPack} onSelect={id => { changePack(id); setShowPacks(false) }} onRemove={removePack} onEditAllowances={() => { setShowPacks(false); setShowAllowances(true) }} onClose={() => setShowPacks(false)} />

      <ConnectionAllowancesDialog open={showAllowances} pack={pack} plan={connectionPlan} onApply={options => { setConnectionPlan(options); setShowAllowances(false); resetDetails() }} onClose={() => setShowAllowances(false)} />

      <AtmosphereDialog open={showAtmosphere} pack={pack} plan={atmosphericPlan} onApply={options => { setAtmosphericPlan(options); setShowAtmosphere(false); resetDetails() }} onClose={() => setShowAtmosphere(false)} />

      <RelayPlannerDialog key={pack.id} open={showRelays} pack={pack} initialBodyId={nodesById.get(endId ?? '')?.bodyId ?? pack.transferHubBodyId ?? null} onClose={() => setShowRelays(false)} />

      <EstimateInfoDialog open={showInfo} initialSection={infoSection} pack={pack} customPack={isCustomPack} groups={basisGroups} budget={budget} notices={estimateNotices} onClose={() => setShowInfo(false)} />
    </Box>
  )
}
