import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Box, MenuItem, TextField, Typography } from '@mui/material'
import type { KeyboardEvent } from 'react'
import type { ManeuverEdge, NodeKind, PlanetPack, RouteResult } from '../types/planner'
import { arrowPosition, connectionPoints, createMapLayout, packForMapRegion, pathFromPoints } from './mapLayout'
import type { MapMode } from './mapLayout'
import { getAerobrakingEdges } from '../utils/aerobraking'
import type { AtmosphericAdjustment } from '../utils/atmosphericAssistance'

interface DeltaVMapProps {
  pack: PlanetPack
  startId: string | null
  endId: string | null
  waypointIds?: readonly string[]
  adjustments?: ReadonlyMap<string, AtmosphericAdjustment>
  route: RouteResult | null
  /** Last explicit selection, including choices made outside the visible map. */
  focusNodeId?: string | null
  onSelect: (nodeId: string) => void
}

const stateNames: Record<NodeKind, string> = { surface: 'Land', orbit: 'Orbit', reference: 'Ref', elliptical: 'High', encounter: 'Flyby' }
const originColor = '#73c8fa'
const destinationColor = '#e7bd7b'
const waypointColor = '#8fcdbd'
const aerobrakingColor = '#c6e8d8'
const noWaypoints: readonly string[] = []
const noAdjustments: ReadonlyMap<string, AtmosphericAdjustment> = new Map()

export default function DeltaVMap({ pack, startId, endId, waypointIds = noWaypoints, adjustments = noAdjustments, route, focusNodeId = null, onSelect }: DeltaVMapProps) {
  const container = useRef<HTMLDivElement>(null)
  const [mode, setMode] = useState<MapMode>('wide')
  const [inspectedId, setInspectedId] = useState<string | null>(null)
  const [regionChoice, setRegionChoice] = useState(() => ({ packId: pack.id, focusNodeId, regionId: pack.mapRegions?.[0]?.id ?? 'all' }))
  if (regionChoice.packId !== pack.id) setRegionChoice({ packId: pack.id, focusNodeId, regionId: pack.mapRegions?.[0]?.id ?? 'all' })
  const prefix = useId().replace(/:/g, '')
  useLayoutEffect(() => {
    const element = container.current
    if (!element) return
    const observer = new ResizeObserver(entries => {
      const bounds = entries[0]?.contentRect
      if (!bounds || !bounds.width || !bounds.height) return
      const ratio = bounds.width / bounds.height
      setMode(ratio > 2.8 ? 'short' : bounds.width < 600 || ratio < 1.15 ? 'portrait' : 'wide')
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const nodeById = useMemo(() => new Map(pack.nodes.map(node => [node.id, node])), [pack])
  const regions = pack.mapRegions ?? []
  const focusedBodyId = focusNodeId ? nodeById.get(focusNodeId)?.bodyId : undefined
  const focusedRegion = regions.find(region => focusedBodyId && region.bodyIds.includes(focusedBodyId))
  // The selection key lets a manual view choice survive unrelated renders,
  // while an endpoint/stop selected outside this view can reveal its region.
  const regionId = regionChoice.packId !== pack.id ? regions[0]?.id ?? 'all'
    : regionChoice.focusNodeId !== focusNodeId ? focusedRegion?.id ?? regionChoice.regionId
      : regionChoice.regionId
  const visiblePack = useMemo(() => packForMapRegion(pack, regionId), [pack, regionId])
  const layout = useMemo(() => createMapLayout(visiblePack, mode), [visiblePack, mode])
  const bodyById = useMemo(() => new Map(pack.bodies.map(body => [body.id, body])), [pack])
  const waypointIndexes = useMemo(() => {
    const indexes = new Map<string, number[]>()
    waypointIds.forEach((id, index) => {
      const visits = indexes.get(id) ?? []
      visits.push(index + 1)
      indexes.set(id, visits)
    })
    return indexes
  }, [waypointIds])
  const routeEdges = useMemo(() => new Set(route?.status === 'success' ? route.legs.map(leg => leg.edge.id) : []), [route])
  const routeNodes = useMemo(() => new Set(route?.status === 'success' ? route.nodeIds : []), [route])
  const aerobrakingEdges = useMemo(() => getAerobrakingEdges(visiblePack), [visiblePack])
  const connectionGroups = useMemo(() => {
    const groups = new Map<string, ManeuverEdge[]>()
    for (const edge of visiblePack.maneuvers) {
      const pair = JSON.stringify([edge.from, edge.to].sort())
      const group = groups.get(pair) ?? []
      group.push(edge)
      groups.set(pair, group)
    }
    return [...groups.values()]
  }, [visiblePack])
  const unpricedConnections = (visiblePack.unpricedConnections ?? []).filter(connection => !visiblePack.maneuvers.some(edge =>
    edge.id === `allowance:${connection.id}:forward` || edge.id === `allowance:${connection.id}:reverse`))
  const routeRegions = route?.status === 'success' ? route.nodeIds.flatMap(id => {
    const bodyId = nodeById.get(id)?.bodyId
    const region = regions.find(candidate => bodyId && candidate.bodyIds.includes(bodyId))
    return region ? [region] : []
  }).filter((region, index, all) => region.id !== all[index - 1]?.id) : []
  const regionSummary = routeRegions.length ? `Route: ${routeRegions.map(region => region.label).join(' → ')}`
    : regionId === 'all' ? 'Complete mission map · Choose a regional view for a closer look.' : 'Views show one part of the complete mission map.'
  const inspected = inspectedId ? visiblePack.nodes.find(node => node.id === inspectedId) : undefined
  const inspectedStops = inspected ? waypointIndexes.get(inspected.id) : undefined

  function activate(event: KeyboardEvent<SVGGElement>, id: string) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setRegionChoice({ packId: pack.id, focusNodeId: id, regionId })
      onSelect(id)
    }
  }

  function edgeColor(edge: ManeuverEdge) {
    const from = bodyById.get(nodeById.get(edge.from)?.bodyId ?? '')
    const to = bodyById.get(nodeById.get(edge.to)?.bodyId ?? '')
    if (from?.kind === 'moon') return from.color
    if (to?.kind === 'moon') return to.color
    const hubBodyId = layout.hubId ? nodeById.get(layout.hubId)?.bodyId : undefined
    return (from?.id === hubBodyId ? to?.color : from?.color) ?? '#a7aaba'
  }

  function pointsFor(edge: ManeuverEdge) {
    const from = nodeById.get(edge.from)
    const to = nodeById.get(edge.to)
    return from && to ? connectionPoints(from, to, layout, visiblePack) : []
  }

  function adjustmentDescription(adjustment: AtmosphericAdjustment) {
    const assumption = adjustment.kind === 'capture' ? 'ideal atmospheric capture' : 'user-supplied landing allowance'
    return `${adjustment.deltaV.toLocaleString()} m/s · ${assumption} (reference ${adjustment.originalDeltaV.toLocaleString()} m/s)`
  }

  function edgeTitle(edge: ManeuverEdge) {
    const adjustment = adjustments.get(edge.id)
    return `${edge.label}: ${adjustment ? adjustmentDescription(adjustment) : `${edge.deltaV.toLocaleString()} m/s`}`
  }

  return (
    <Box ref={container} data-map-region={regions.length ? regionId : undefined} sx={{ position: 'relative', display: 'flex', flexDirection: 'column', width: '100%', height: '100%', minWidth: 0, minHeight: 0, overflow: 'hidden' }} onMouseLeave={() => setInspectedId(null)}>
      {regions.length > 0 && <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, pt: .75, pb: .25, minWidth: 0, flexShrink: 0 }}>
        <TextField select size="small" label="Map view" value={regionId} onChange={event => {
          setRegionChoice({ packId: pack.id, focusNodeId, regionId: event.target.value })
          setInspectedId(null)
        }} sx={{ width: { xs: 152, sm: 190 }, flexShrink: 0, '& .MuiInputBase-root': { fontSize: 12, minHeight: 32, bgcolor: '#101b2fdd' }, '& .MuiInputLabel-root': { fontSize: 11 }, '& .MuiSelect-select': { py: .75 } }}>
          {regions.map(region => <MenuItem key={region.id} value={region.id} sx={{ fontSize: 12 }}>{region.label}</MenuItem>)}
          <MenuItem value="all" sx={{ fontSize: 12 }}>All systems</MenuItem>
        </TextField>
        <Typography role="status" title={regionSummary} sx={{ fontSize: 10, lineHeight: 1.35, color: 'text.secondary', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{regionSummary}</Typography>
      </Box>}
      <Box
        component="svg"
        role="group"
        data-map-presentation={layout.presentation}
        aria-label={regions.length ? `${regions.find(region => region.id === regionId)?.label ?? 'All systems'} Delta-V state map` : `${pack.bodies.find(body => body.kind === 'star')?.name ?? pack.name} system Delta-V state map`}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        preserveAspectRatio="xMidYMid meet"
        sx={{
          display: 'block', width: '100%', height: '100%', minHeight: 0, flex: 1, overflow: 'hidden',
          '& .map-node': { cursor: 'pointer', outline: 'none' },
          '& .map-node .state-circle': { transition: 'stroke-width 120ms ease, stroke-opacity 120ms ease' },
          '& .map-node .focus-ring': { opacity: 0 },
          '& .map-node:hover .focus-ring, & .map-node:focus-visible .focus-ring': { opacity: 1 },
          '& .map-node:hover .state-circle, & .map-node:focus-visible .state-circle': { strokeWidth: 3 },
          '@media (prefers-reduced-motion: reduce)': { '& .map-node .state-circle': { transition: 'none' } },
        }}
      >
        <defs>
          <linearGradient id={`${prefix}-node-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#303748" />
            <stop offset="1" stopColor="#20232f" />
          </linearGradient>
          <filter id={`${prefix}-glow`} x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="5" /></filter>
        </defs>

        {layout.panels?.map(panel => <g key={panel.id} data-map-panel={panel.id} pointerEvents="none">
          <rect x={panel.x} y={panel.y} width={panel.width} height={panel.height} rx={18} fill="#13243a" fillOpacity={.34} stroke="#83aec8" strokeOpacity={.16} strokeWidth={1.5} />
          <rect x={panel.x + 20} y={panel.y + 18} width={4} height={20} rx={2} fill={panel.color} fillOpacity={.9} />
          <text x={panel.x + 36} y={panel.y + 34} fill="#cbddec" fontSize={24} fontWeight={500}>{panel.label}</text>
        </g>)}

        {unpricedConnections.map(connection => {
          const from = nodeById.get(connection.from)
          const to = nodeById.get(connection.to)
          return from && to ? <path key={`unpriced-${connection.id}`} d={pathFromPoints(connectionPoints(from, to, layout, visiblePack))} fill="none" stroke="#ddbf91" strokeWidth={layout.presentation === 'overview' ? 5 : mode === 'portrait' ? 6 : 10} strokeOpacity={layout.presentation === 'overview' ? .45 : .6} strokeDasharray="14 12" strokeLinejoin="round" strokeLinecap="round" data-unpriced-id={connection.id}>
            <title>{`Unpriced: ${connection.label}. Set link allowances to include this connection in a mission.`}</title>
          </path> : null
        })}

        {connectionGroups.map(edges => {
          const edge = edges[0]!
          const assisted = edges.some(candidate => adjustments.has(candidate.id))
          return <path
            key={edge.id}
            d={pathFromPoints(pointsFor(edge))}
            fill="none"
            stroke={edgeColor(edge)}
            strokeWidth={layout.presentation === 'overview' ? 7 : mode === 'portrait' ? 9 : 15}
            strokeOpacity={routeEdges.size ? 0.25 : 0.46}
            strokeLinejoin="round"
            strokeLinecap="round"
            data-connection-id={edge.id}
            data-assisted={assisted ? 'true' : undefined}
          ><title>{assisted ? edges.map(edgeTitle).join('; ') : edgeTitle(edge)}</title></path>
        })}

        {visiblePack.maneuvers.filter(edge => routeEdges.has(edge.id)).map(edge => {
          const points = pointsFor(edge)
          const d = pathFromPoints(points)
          const color = edgeColor(edge)
          return <g key={edge.id}>
            <path d={d} fill="none" stroke={color} strokeWidth={layout.presentation === 'overview' ? 19 : mode === 'portrait' ? 20 : 29} strokeOpacity={0.1} strokeLinejoin="round" strokeLinecap="round" pointerEvents="none" />
            <path d={d} fill="none" stroke={color} strokeWidth={layout.presentation === 'overview' ? 11 : mode === 'portrait' ? 12 : 19} strokeOpacity={0.95} strokeLinejoin="round" strokeLinecap="round" data-edge-id={edge.id} data-route-edge="true" data-assisted={adjustments.has(edge.id) ? 'true' : undefined}><title>{edgeTitle(edge)}</title></path>
            <path d={d} fill="none" stroke="#ffffff" strokeWidth={1.5} strokeOpacity={0.16} strokeLinejoin="round" pointerEvents="none" />
          </g>
        })}

        {aerobrakingEdges.map(edge => {
          const arrow = arrowPosition(pointsFor(edge))
          if (!arrow) return null
          const label = `Atmospheric braking possible: ${nodeById.get(edge.from)?.label} → ${nodeById.get(edge.to)?.label}`
          const selected = routeEdges.has(edge.id)
          const adjustment = adjustments.get(edge.id)
          const description = adjustment ? adjustmentDescription(adjustment) : undefined
          const tooltip = description ? `${label}. ${description}; this is a planning assumption, not a trajectory calculation.`
            : adjustments.size > 0 && edge.kind === 'transfer' ? `${label}. This combined transfer keeps its reference cost; atmospheric savings are not separated from its other maneuvers.`
              : `${label}. ${edge.kind === 'descent' ? 'Atmospheric entry or landing assistance' : 'Aerocapture or aerobraking'}; savings are not included in the budget.`
          return <g key={`aero-${edge.id}`} role="img" aria-label={label}
            aria-description={description} data-assisted={adjustment ? 'true' : undefined}
            data-aerobraking-edge={edge.id} data-from={edge.from} data-to={edge.to} data-selected={selected ? 'true' : 'false'}
            transform={`translate(${arrow.x} ${arrow.y}) rotate(${arrow.angle})`}>
            <title>{tooltip}</title>
            <path d="M -7 -6 L 7 0 L -7 6 Z" fill={selected ? '#effff6' : aerobrakingColor} fillOpacity={selected ? 1 : routeEdges.size ? 0.65 : 0.9} stroke="#172b25" strokeWidth={1} strokeLinejoin="round" />
          </g>
        })}

        {layout.labels.map(({ body, x, y, anchor, maxWidth }) => <text
          key={body.id} x={x} y={y} textAnchor={anchor}
          data-body-label={body.id}
          fontSize={layout.labelFontSize}
          textLength={maxWidth && body.name.length * layout.labelFontSize * 0.6 > maxWidth ? maxWidth : undefined}
          lengthAdjust="spacingAndGlyphs"
          fontWeight={500} fill={body.color} fillOpacity={0.93}
          style={{ pointerEvents: 'none' }}
        >{body.name}<title>{body.name}</title></text>)}

        {visiblePack.nodes.map(node => {
          const point = layout.nodePositions.get(node.id)
          if (!point) return null
          const start = node.id === startId
          const end = node.id === endId
          const stopIndexes = waypointIndexes.get(node.id)
          const stop = stopIndexes !== undefined
          const stopDescription = stopIndexes ? `Intermediate ${stopIndexes.length === 1 ? 'stop' : 'stops'} ${stopIndexes.join(', ')}` : undefined
          const selected = start || end || stop
          const body = bodyById.get(node.bodyId)
          const color = end ? destinationColor : start ? originColor : stop ? waypointColor : body?.color ?? '#a7aaba'
          const hub = node.id === layout.hubId && mode !== 'portrait'
          const radius = hub ? layout.radius + 9 : layout.radius
          const title = `${node.label}${node.altitudeKm === undefined ? '' : ` · ${node.altitudeKm} km`}${start ? ' · Origin A' : ''}${end ? ' · Destination B' : ''}${stopDescription ? ` · ${stopDescription}` : ''}`
          // Keep stop badges within the existing hit area, including large hubs.
          const stopBadgeOffset = Math.max(0, Math.min(radius - 1, layout.hitRadius - 8))
          return <g
            key={node.id} transform={`translate(${point.x} ${point.y})`}
            role="button" tabIndex={0} aria-label={node.label} aria-pressed={selected}
            aria-description={stopDescription} data-waypoint-indexes={stopIndexes?.join(',')}
            data-node-id={node.id} className="map-node"
            onClick={() => { setInspectedId(node.id); setRegionChoice({ packId: pack.id, focusNodeId: node.id, regionId }); onSelect(node.id) }}
            onKeyDown={event => activate(event, node.id)}
            onMouseEnter={() => setInspectedId(node.id)}
            onFocus={() => setInspectedId(node.id)}
            onBlur={() => setInspectedId(null)}
          >
            <title>{title}</title>
            <rect x={-layout.hitRadius} y={-layout.hitRadius} width={layout.hitRadius * 2} height={layout.hitRadius * 2} fill="transparent" rx={8} />
            {selected && <circle r={radius + 5} fill={color} fillOpacity={0.5} filter={`url(#${prefix}-glow)`} />}
            <circle className="focus-ring" r={radius + 6} fill="none" stroke="#f2f4fa" strokeWidth={2} />
            <circle className="state-circle" r={radius} fill={selected ? color : routeNodes.has(node.id) ? '#354355' : `url(#${prefix}-node-fill)`} stroke={color} strokeWidth={selected ? 2.5 : 1.5} strokeOpacity={selected || routeNodes.has(node.id) ? 1 : 0.85} />
            {hub ? <>
              <text y={-3} textAnchor="middle" fill={selected ? '#20212d' : '#e2e4ed'} fontSize={Math.min(13, radius * 1.7 / Math.max(1, (body?.name.length ?? 3) * 0.6))} fontWeight={600} pointerEvents="none">{body?.name ?? 'Hub'}</text>
              <text y={13} textAnchor="middle" fill={selected ? '#20212d' : '#b2b7c7'} fontSize={12} pointerEvents="none">{node.kind === 'encounter' ? 'escape' : stateNames[node.kind]}</text>
            </> : <text dominantBaseline="central" textAnchor="middle" fill={selected ? '#20212d' : '#d0d3df'} fontSize={layout.nodeFontSize} fontWeight={selected ? 600 : 400} pointerEvents="none">{stateNames[node.kind]}</text>}
            {(start || end) && <>
              <circle cx={radius - 1} cy={-radius + 1} r={9} fill="#20212d" stroke={color} strokeWidth={1} />
              <text x={radius - 1} y={-radius + 1} dominantBaseline="central" textAnchor="middle" fill={color} fontSize={10} fontWeight={700} pointerEvents="none">{start && end ? 'AB' : start ? 'A' : 'B'}</text>
            </>}
            {stopIndexes && <g pointerEvents="none" data-waypoint-badge="true">
              <title>{stopDescription}</title>
              <circle cx={start || end ? -stopBadgeOffset : stopBadgeOffset} cy={start || end ? stopBadgeOffset : -stopBadgeOffset} r={8} fill="#172b2b" stroke={waypointColor} strokeWidth={1} />
              <text x={start || end ? -stopBadgeOffset : stopBadgeOffset} y={start || end ? stopBadgeOffset : -stopBadgeOffset} dominantBaseline="central" textAnchor="middle" fill={waypointColor} fontSize={stopIndexes.length > 1 ? 8 : 10} fontWeight={700}>{stopIndexes[0]}{stopIndexes.length > 1 ? '+' : ''}</text>
            </g>}
          </g>
        })}
      </Box>
      {inspected && mode === 'wide' && <Box sx={{ position: 'absolute', left: 10, bottom: 5, pointerEvents: 'none', px: 1, py: 0.5, bgcolor: 'rgba(25,26,36,.92)', borderRadius: 1, maxWidth: 'calc(100% - 20px)' }}>
        <Typography variant="caption" sx={{ color: '#d7dbe6', fontSize: { xs: 10, sm: 11 }, display: 'block' }}>{inspected.label}{inspected.altitudeKm === undefined ? '' : ` · ${inspected.altitudeKm} km`}{inspectedStops ? ` · ${inspectedStops.length === 1 ? 'Stop' : 'Stops'} ${inspectedStops.join(', ')}` : ''}</Typography>
      </Box>}
    </Box>
  )
}
