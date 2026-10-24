import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Box, Typography } from '@mui/material'
import type { KeyboardEvent } from 'react'
import type { ManeuverEdge, NodeKind, PlanetPack, RouteResult } from '../types/planner'
import { arrowPosition, connectionPoints, createMapLayout, pathFromPoints } from './mapLayout'
import type { MapMode } from './mapLayout'
import { getAerobrakingEdges } from '../utils/aerobraking'

interface DeltaVMapProps {
  pack: PlanetPack
  startId: string | null
  endId: string | null
  route: RouteResult | null
  onSelect: (nodeId: string) => void
}

const stateNames: Record<NodeKind, string> = { surface: 'Land', orbit: 'Orbit', elliptical: 'High', encounter: 'Flyby' }
const originColor = '#73c8fa'
const destinationColor = '#e7bd7b'
const aerobrakingColor = '#c6e8d8'

export default function DeltaVMap({ pack, startId, endId, route, onSelect }: DeltaVMapProps) {
  const container = useRef<HTMLDivElement>(null)
  const [mode, setMode] = useState<MapMode>('wide')
  const [inspectedId, setInspectedId] = useState<string | null>(null)
  const prefix = useId().replace(/:/g, '')
  useLayoutEffect(() => {
    const element = container.current
    if (!element) return
    const observer = new ResizeObserver(entries => {
      const bounds = entries[0]?.contentRect
      if (!bounds || !bounds.width || !bounds.height) return
      const ratio = bounds.width / bounds.height
      setMode(ratio < 1.15 ? 'portrait' : ratio > 2.8 ? 'short' : 'wide')
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const layout = useMemo(() => createMapLayout(pack, mode), [pack, mode])
  const nodeById = useMemo(() => new Map(pack.nodes.map(node => [node.id, node])), [pack])
  const bodyById = useMemo(() => new Map(pack.bodies.map(body => [body.id, body])), [pack])
  const routeEdges = useMemo(() => new Set(route?.status === 'success' ? route.legs.map(leg => leg.edge.id) : []), [route])
  const routeNodes = useMemo(() => new Set(route?.status === 'success' ? route.nodeIds : []), [route])
  const aerobrakingEdges = useMemo(() => getAerobrakingEdges(pack), [pack])
  const connections = useMemo(() => {
    const seen = new Set<string>()
    return pack.maneuvers.filter(edge => {
      const pair = [edge.from, edge.to].sort().join('|')
      if (seen.has(pair)) return false
      seen.add(pair)
      return true
    })
  }, [pack])
  const inspected = inspectedId ? nodeById.get(inspectedId) : undefined

  function activate(event: KeyboardEvent<SVGGElement>, id: string) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onSelect(id)
    }
  }

  function edgeColor(edge: ManeuverEdge) {
    const from = bodyById.get(nodeById.get(edge.from)?.bodyId ?? '')
    const to = bodyById.get(nodeById.get(edge.to)?.bodyId ?? '')
    if (from?.kind === 'moon') return from.color
    if (to?.kind === 'moon') return to.color
    return (from?.id.endsWith(':kerbin') ? to?.color : from?.color) ?? '#a7aaba'
  }

  function pointsFor(edge: ManeuverEdge) {
    const from = nodeById.get(edge.from)
    const to = nodeById.get(edge.to)
    return from && to ? connectionPoints(from, to, layout, pack) : []
  }

  return (
    <Box ref={container} sx={{ position: 'relative', width: '100%', height: '100%', minWidth: 0, minHeight: 0, overflow: 'hidden' }} onMouseLeave={() => setInspectedId(null)}>
      <Box
        component="svg"
        role="group"
        aria-label="Kerbol system Delta-V state map"
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        preserveAspectRatio="xMidYMid meet"
        sx={{
          display: 'block', width: '100%', height: '100%', overflow: 'hidden',
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

        {connections.map(edge => <path
          key={edge.id}
          d={pathFromPoints(pointsFor(edge))}
          fill="none"
          stroke={edgeColor(edge)}
          strokeWidth={mode === 'portrait' ? 9 : 15}
          strokeOpacity={routeEdges.size ? 0.25 : 0.46}
          strokeLinejoin="round"
          strokeLinecap="round"
          data-connection-id={edge.id}
        ><title>{edge.label}: {edge.deltaV.toLocaleString()} m/s</title></path>)}

        {pack.maneuvers.filter(edge => routeEdges.has(edge.id)).map(edge => {
          const points = pointsFor(edge)
          const d = pathFromPoints(points)
          const color = edgeColor(edge)
          return <g key={edge.id}>
            <path d={d} fill="none" stroke={color} strokeWidth={mode === 'portrait' ? 20 : 29} strokeOpacity={0.1} strokeLinejoin="round" strokeLinecap="round" pointerEvents="none" />
            <path d={d} fill="none" stroke={color} strokeWidth={mode === 'portrait' ? 12 : 19} strokeOpacity={0.95} strokeLinejoin="round" strokeLinecap="round" data-edge-id={edge.id} data-route-edge="true"><title>{edge.label}: {edge.deltaV.toLocaleString()} m/s</title></path>
            <path d={d} fill="none" stroke="#ffffff" strokeWidth={1.5} strokeOpacity={0.16} strokeLinejoin="round" pointerEvents="none" />
          </g>
        })}

        {aerobrakingEdges.map(edge => {
          const arrow = arrowPosition(pointsFor(edge))
          if (!arrow) return null
          const label = `Atmospheric braking possible: ${nodeById.get(edge.from)?.label} → ${nodeById.get(edge.to)?.label}`
          const selected = routeEdges.has(edge.id)
          return <g key={`aero-${edge.id}`} role="img" aria-label={label}
            data-aerobraking-edge={edge.id} data-from={edge.from} data-to={edge.to} data-selected={selected ? 'true' : 'false'}
            transform={`translate(${arrow.x} ${arrow.y}) rotate(${arrow.angle})`}>
            <title>{label}. {edge.kind === 'descent' ? 'Atmospheric entry or landing assistance' : 'Aerocapture or aerobraking'}; savings are not included in the budget.</title>
            <path d="M -7 -6 L 7 0 L -7 6 Z" fill={selected ? '#effff6' : aerobrakingColor} fillOpacity={selected ? 1 : routeEdges.size ? 0.65 : 0.9} stroke="#172b25" strokeWidth={1} strokeLinejoin="round" />
          </g>
        })}

        {layout.labels.map(({ body, x, y, anchor }) => <text
          key={body.id} x={x} y={y} textAnchor={anchor}
          fontSize={mode === 'portrait' ? 21 : mode === 'short' ? 20 : 21}
          fontWeight={500} fill={body.color} fillOpacity={0.93}
          style={{ pointerEvents: 'none' }}
        >{body.name}</text>)}

        {pack.nodes.map(node => {
          const point = layout.nodePositions.get(node.id)
          if (!point) return null
          const start = node.id === startId
          const end = node.id === endId
          const selected = start || end
          const body = bodyById.get(node.bodyId)
          const color = end ? destinationColor : start ? originColor : body?.color ?? '#a7aaba'
          const hub = node.id === layout.hubId && mode !== 'portrait'
          const radius = hub ? layout.radius + 9 : layout.radius
          const title = `${node.label}${node.altitudeKm === undefined ? '' : ` · ${node.altitudeKm} km`}${start ? ' · Origin A' : ''}${end ? ' · Destination B' : ''}`
          return <g
            key={node.id} transform={`translate(${point.x} ${point.y})`}
            role="button" tabIndex={0} aria-label={node.label} aria-pressed={selected}
            data-node-id={node.id} className="map-node"
            onClick={() => { setInspectedId(node.id); onSelect(node.id) }}
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
              <text y={-3} textAnchor="middle" fill={selected ? '#20212d' : '#e2e4ed'} fontSize={13} fontWeight={600} pointerEvents="none">Kerbin</text>
              <text y={13} textAnchor="middle" fill={selected ? '#20212d' : '#b2b7c7'} fontSize={12} pointerEvents="none">escape</text>
            </> : <text dominantBaseline="central" textAnchor="middle" fill={selected ? '#20212d' : '#d0d3df'} fontSize={mode === 'portrait' ? 17 : mode === 'short' ? 15 : 14} fontWeight={selected ? 600 : 400} pointerEvents="none">{stateNames[node.kind]}</text>}
            {selected && <>
              <circle cx={radius - 1} cy={-radius + 1} r={9} fill="#20212d" stroke={color} strokeWidth={1} />
              <text x={radius - 1} y={-radius + 1} dominantBaseline="central" textAnchor="middle" fill={color} fontSize={10} fontWeight={700} pointerEvents="none">{start && end ? 'AB' : start ? 'A' : 'B'}</text>
            </>}
          </g>
        })}
      </Box>
      {inspected && mode === 'wide' && <Box sx={{ position: 'absolute', left: 10, bottom: 5, pointerEvents: 'none', px: 1, py: 0.5, bgcolor: 'rgba(25,26,36,.92)', borderRadius: 1, maxWidth: 'calc(100% - 20px)' }}>
        <Typography variant="caption" sx={{ color: '#d7dbe6', fontSize: { xs: 10, sm: 11 }, display: 'block' }}>{inspected.label}{inspected.altitudeKm === undefined ? '' : ` · ${inspected.altitudeKm} km`}</Typography>
      </Box>}
    </Box>
  )
}
