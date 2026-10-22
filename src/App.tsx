import { useMemo, useState } from 'react'
import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Chip,
  Container, Divider, IconButton, Link, Paper, Stack, Tooltip, Typography,
} from '@mui/material'
import RocketLaunchRounded from '@mui/icons-material/RocketLaunchRounded'
import SwapVertRounded from '@mui/icons-material/SwapVertRounded'
import RestartAltRounded from '@mui/icons-material/RestartAltRounded'
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded'
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded'
import PublicRounded from '@mui/icons-material/PublicRounded'
import { stockPack } from './data/stock'
import DeltaVMap from './components/DeltaVMap'
import { buildGraph } from './utils/buildGraph'
import { findLowestCostPath } from './utils/findRoute'

const format = new Intl.NumberFormat('en-US')
const graph = buildGraph(stockPack)
const nodesById = new Map(stockPack.nodes.map(node => [node.id, node]))
const bodiesById = new Map(stockPack.bodies.map(body => [body.id, body]))

export default function App() {
  const [startId, setStartId] = useState<string | null>(null)
  const [endId, setEndId] = useState<string | null>(null)
  const [selection, setSelection] = useState<'start' | 'end'>('start')
  const route = useMemo(
    () => startId !== null && endId !== null ? findLowestCostPath(graph, startId, endId) : null,
    [startId, endId],
  )
  const hasAtmosphericLanding = route?.status === 'success' && route.legs.some(({ edge }) =>
    edge.kind === 'descent' && bodiesById.get(nodesById.get(edge.to)?.bodyId ?? '')?.hasAtmosphere,
  )
  const hasInterplanetaryLayover = route?.status === 'success' && route.legs.filter(({ edge }) =>
    edge.kind === 'transfer' && nodesById.get(edge.from)?.kind === 'encounter' && nodesById.get(edge.to)?.kind === 'encounter',
  ).length > 1

  function selectNode(id: string) {
    if (selection === 'start') {
      setStartId(id)
      setSelection('end')
    } else {
      setEndId(id)
    }
  }

  function reset() {
    setStartId(null)
    setEndId(null)
    setSelection('start')
  }

  return (
    <Container maxWidth={false} sx={{ maxWidth: 1700, py: { xs: 2, md: 4 } }}>
      <Stack component="header" direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', gap: 2, mb: 4 }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <Box sx={{ display: 'grid', placeItems: 'center', width: 46, height: 46, borderRadius: 3, bgcolor: 'primary.main', color: 'background.default' }}>
            <RocketLaunchRounded />
          </Box>
          <Box>
            <Typography component="h1" variant="h5" sx={{ fontWeight: 750 }}>KSP DeltaV Planner</Typography>
            <Typography color="text.secondary" variant="body2">A flight plan starts with a destination.</Typography>
          </Box>
        </Stack>
        <Chip icon={<PublicRounded />} label="Stock Kerbol system" variant="outlined" sx={{ display: { xs: 'none', sm: 'flex' } }} />
      </Stack>

      <Box component="main" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '340px minmax(0, 1fr)' }, gridTemplateAreas: { xs: '"mission" "map" "route"', lg: '"mission map" "route map"' }, gridTemplateRows: { lg: 'auto 1fr' }, gap: 3, alignItems: 'start' }}>
          <Paper component="section" aria-labelledby="mission-heading" sx={{ p: 2.5, gridArea: 'mission' }}>
            <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Typography id="mission-heading" component="h2" variant="h6">Your mission</Typography>
              <Tooltip title="Reset mission"><IconButton aria-label="Reset mission" onClick={reset} size="small"><RestartAltRounded /></IconButton></Tooltip>
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Choose a state on the map for each end of your journey.</Typography>
            <Button
              fullWidth variant="outlined" aria-label="Choose origin" aria-pressed={selection === 'start'}
              onClick={() => setSelection('start')}
              sx={{ justifyContent: 'flex-start', textAlign: 'left', p: 1.5, borderWidth: selection === 'start' ? 2 : 1, bgcolor: selection === 'start' ? 'rgba(125,211,252,.07)' : undefined }}
            >
              <Box><Typography component="span" variant="overline" sx={{ display: 'block', lineHeight: 1.4 }}>A · Origin</Typography><Typography component="span" sx={{ display: 'block', fontWeight: 650 }}>{startId ? nodesById.get(startId)?.label : 'Select a starting point'}</Typography></Box>
            </Button>
            <Box sx={{ display: 'flex', justifyContent: 'center', my: .5 }}>
              <Tooltip title="Swap origin and destination"><span><IconButton aria-label="Swap origin and destination" disabled={!startId || !endId} onClick={() => { setStartId(endId); setEndId(startId) }} size="small"><SwapVertRounded /></IconButton></span></Tooltip>
            </Box>
            <Button
              fullWidth variant="outlined" color="secondary" aria-label="Choose destination" aria-pressed={selection === 'end'}
              onClick={() => setSelection('end')}
              sx={{ justifyContent: 'flex-start', textAlign: 'left', p: 1.5, borderWidth: selection === 'end' ? 2 : 1, bgcolor: selection === 'end' ? 'rgba(196,181,253,.07)' : undefined }}
            >
              <Box><Typography component="span" variant="overline" sx={{ display: 'block', lineHeight: 1.4 }}>B · Destination</Typography><Typography component="span" sx={{ display: 'block', fontWeight: 650 }}>{endId ? nodesById.get(endId)?.label : 'Select a destination'}</Typography></Box>
            </Button>
            <Typography role="status" variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
              Selecting {selection === 'start' ? 'origin (A)' : 'destination (B)'}. Click its card to change which endpoint you edit.
            </Typography>
          </Paper>

          <Paper component="section" aria-labelledby="route-heading" sx={{ p: 2.5, gridArea: 'route' }}>
            <Typography id="route-heading" component="h2" variant="h6" sx={{ mb: 1 }}>Flight plan</Typography>
            <Box aria-live="polite" aria-atomic="true">
              {!route && <Typography color="text.secondary" variant="body2">Select an origin and destination to see your route and maneuver budget.</Typography>}
              {route?.status === 'invalid' && <Alert severity="error">{route.message}</Alert>}
              {route?.status === 'unreachable' && <Alert severity="info">{route.message} No supported route is available in this dataset.</Alert>}
              {route?.status === 'success' && <>
                <Typography variant="overline" color="text.secondary">Estimated total Delta-V</Typography>
                <Typography data-testid="route-total" variant="h3" sx={{ fontWeight: 750, fontVariantNumeric: 'tabular-nums', mb: 1 }}>
                  {format.format(route.totalDeltaV)} <Typography component="span" variant="h6" color="text.secondary">m/s</Typography>
                </Typography>
                <Typography variant="caption" color="text.secondary">Lowest estimated cost within this dataset. Favorable windows; plane changes excluded. Fully powered maneuvers; no aerobraking.</Typography>
                {hasAtmosphericLanding && <Alert severity="warning" sx={{ mt: 1.5 }}>Atmospheric landing uses an ascent-sized planning allowance, not a calculated descent burn.</Alert>}
                {hasInterplanetaryLayover && <Alert severity="info" sx={{ mt: 1.5 }}>Includes a Kerbin parking-orbit layover. This dataset provides Kerbin-centered routes, rather than optimized direct transfers between other planets.</Alert>}
              </>}
            </Box>
            {route?.status === 'success' && <>
              <Divider sx={{ my: 2 }} />
              {route.legs.length === 0 ? <Alert severity="info">You’re already at your destination. No maneuvers required.</Alert> : <>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>{route.legs.length} maneuvers · cumulative budget shown below</Typography>
                <Stack component="ol" aria-label="Maneuver breakdown" sx={{ listStyle: 'none', p: 0, m: 0 }} spacing={1}>
                  {route.legs.map((leg, index) => <Box component="li" key={`${leg.edge.id}:${index}`} sx={{ borderLeft: '2px solid', borderColor: 'primary.dark', pl: 1.5, py: .75 }}>
                    <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: 650 }}>{index + 1}. {leg.edge.label}</Typography>
                      <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{format.format(leg.edge.deltaV)} m/s</Typography>
                    </Stack>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{nodesById.get(leg.edge.from)?.label} → {nodesById.get(leg.edge.to)?.label}</Typography>
                    <Typography variant="caption" color="primary.main" sx={{ display: 'block' }}>{format.format(leg.cumulativeDeltaV)} m/s cumulative</Typography>
                    {leg.edge.assumptions.length > 0 && <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{leg.edge.assumptions.join(' ')}</Typography>}
                  </Box>)}
                </Stack>
              </>}
            </>}
          </Paper>
        <Stack spacing={2.5} sx={{ minWidth: 0, gridArea: 'map' }}>
          <Paper component="section" aria-labelledby="map-heading" sx={{ overflow: 'hidden' }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ justifyContent: 'space-between', alignItems: { xs: 'start', sm: 'center' }, gap: 1, px: 2.5, pt: 2.5 }}>
              <Box>
                <Typography id="map-heading" component="h2" variant="h6">Interactive Delta-V map</Typography>
                <Typography variant="body2" color="text.secondary">Pick a surface, low orbit, high orbit, or encounter state.</Typography>
              </Box>
              <Chip size="small" label={`Selecting ${selection === 'start' ? 'A · Origin' : 'B · Destination'}`} color={selection === 'start' ? 'primary' : 'secondary'} variant="outlined" />
            </Stack>
            <Box sx={{ px: 2.5, pt: 1.5, display: { xs: 'block', lg: 'none' } }}>
              {route?.status === 'success' ? <Typography variant="body2"><strong>{format.format(route.totalDeltaV)} m/s</strong> estimated · <Link href="#route-heading">View flight plan</Link></Typography> : <Typography variant="caption" color="text.secondary">Your flight plan will appear below the map.</Typography>}
            </Box>
            <DeltaVMap pack={stockPack} startId={startId} endId={endId} route={route} onSelect={selectNode} />
          </Paper>

          <Accordion disableGutters>
            <AccordionSummary expandIcon={<ExpandMoreRounded />}>
              <Typography sx={{ fontWeight: 650 }}>Model assumptions &amp; data sources</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{stockPack.description}</Typography>
              <Box component="ul" sx={{ pl: 2.5, mt: 1 }}>
                {stockPack.assumptions.map(assumption => <Typography component="li" variant="body2" key={assumption} sx={{ mb: 1 }}>{assumption}</Typography>)}
              </Box>
              <Stack sx={{ gap: 1 }}>
                {stockPack.sources.map(source => <Link key={source.id} href={source.url} target="_blank" rel="noreferrer" variant="body2">{source.title}<ArrowForwardRounded sx={{ fontSize: 14, ml: .5, verticalAlign: 'middle' }} /></Link>)}
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>{stockPack.name} · dataset {stockPack.version}</Typography>
            </AccordionDetails>
          </Accordion>
        </Stack>
      </Box>
      <Typography component="footer" variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mt: 4 }}>
        Built for Kerbal Space Program · Schematic distances · Estimate your budget, then pack a margin.
      </Typography>
    </Container>
  )
}
