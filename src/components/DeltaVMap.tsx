import { useId, useMemo, useRef, useState } from 'react'
import { Box, Button, Chip, Stack, Typography } from '@mui/material'
import type { KeyboardEvent } from 'react'
import type { NodeKind, PlanetPack, RouteResult } from '../types/planner'
import { connectionPath, createMapLayout } from './mapLayout'

interface DeltaVMapProps {
  pack: PlanetPack
  startId: string | null
  endId: string | null
  route: RouteResult | null
  onSelect: (nodeId: string) => void
}

const stateNames: Record<NodeKind, string> = { surface: 'Surface', orbit: 'Orbit', elliptical: 'High orbit', encounter: 'Encounter' }

function StateSymbol({ kind, color }: { kind: NodeKind; color: string }) {
  if (kind === 'elliptical') return <ellipse rx={10} ry={6} transform="rotate(-25)" fill="#121e30" stroke={color} strokeWidth={2} />
  if (kind === 'encounter') return <path d="M 0 -9 L 9 0 L 0 9 L -9 0 Z" fill="#121e30" stroke={color} strokeWidth={2} />
  if (kind === 'orbit') return <><circle r={9} fill="#121e30" stroke={color} strokeWidth={2} /><circle r={3} fill={color} /></>
  return <circle r={8} fill={color} stroke="#0b1120" strokeWidth={2} />
}

export default function DeltaVMap({ pack, startId, endId, route, onSelect }: DeltaVMapProps) {
  const layout = useMemo(() => createMapLayout(pack), [pack])
  const nodeById = useMemo(() => new Map(pack.nodes.map(node => [node.id, node])), [pack])
  const routeEdges = useMemo(() => new Set(route?.status === 'success' ? route.legs.map(leg => leg.edge.id) : []), [route])
  const routeNodes = useMemo(() => new Set(route?.status === 'success' ? route.nodeIds : []), [route])
  const [zoom, setZoom] = useState(1)
  const [routeOnly, setRouteOnly] = useState(false)
  const [inspectedNodeId, setInspectedNodeId] = useState<string | null>(null)
  const viewport = useRef<HTMLDivElement>(null)
  const prefix = useId().replace(/:/g, '')
  const star = pack.bodies.find(body => body.kind === 'star')
  const inspectedNode = inspectedNodeId ? nodeById.get(inspectedNodeId) : undefined
  const outgoingManeuvers = inspectedNodeId ? pack.maneuvers.filter(edge => edge.from === inspectedNodeId) : []

  function activate(event: KeyboardEvent<SVGGElement>, id: string) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onSelect(id)
    }
  }

  const resetView = () => {
    setZoom(1)
    viewport.current?.scrollTo({ left: 0, top: 0, behavior: 'smooth' })
  }

  return (
    <Box sx={{ p: { xs: 2, sm: 2.5 } }}>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
          <Chip size="small" variant="outlined" label="● Surface" />
          <Chip size="small" variant="outlined" label="◉ Orbit" />
          <Chip size="small" variant="outlined" label="⬭ High orbit" />
          <Chip size="small" variant="outlined" label="◇ Encounter" />
        </Stack>
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
          <Button size="small" onClick={() => setRouteOnly(value => !value)} aria-pressed={routeOnly} sx={{ fontSize: 11 }}>
            {routeOnly ? 'Show connections' : 'Route only'}
          </Button>
          <Button size="small" aria-label="Zoom out map" disabled={zoom <= 1} onClick={() => setZoom(value => Math.max(1, value - 0.2))} sx={{ minWidth: 36 }}>−</Button>
          <Typography component="span" variant="caption" sx={{ minWidth: 36, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{Math.round(zoom * 100)}%</Typography>
          <Button size="small" aria-label="Zoom in map" disabled={zoom >= 1.8} onClick={() => setZoom(value => Math.min(1.8, value + 0.2))} sx={{ minWidth: 36 }}>+</Button>
          <Button size="small" onClick={resetView}>Reset view</Button>
        </Stack>
      </Stack>
      <Box
        ref={viewport}
        tabIndex={0}
        role="region"
        aria-label="Scrollable planetary map"
        sx={{ maxHeight: 680, overflow: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: '#0b1120', scrollbarColor: '#334155 #0b1120', '&:focus-visible': { outline: '2px solid #7dd3fc', outlineOffset: 3 } }}
      >
        <Box
          component="svg"
          role="group"
          aria-label="Kerbol system Delta-V state map"
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          sx={{ display: 'block', width: `${zoom * 100}%`, minWidth: layout.width * zoom, height: 'auto', '& .map-node': { cursor: 'pointer', outline: 'none' }, '& .map-node .focus-ring': { opacity: 0 }, '& .map-node:hover .focus-ring, & .map-node:focus-visible .focus-ring': { opacity: 1 } }}
        >
          <defs>
            <pattern id={`${prefix}-stars`} width="110" height="90" patternUnits="userSpaceOnUse">
              <circle cx="13" cy="25" r="0.8" fill="#475569" opacity="0.35" />
              <circle cx="78" cy="67" r="0.7" fill="#475569" opacity="0.3" />
            </pattern>
            <marker id={`${prefix}-arrow`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 Z" fill="#496279" /></marker>
            <marker id={`${prefix}-route-arrow`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 Z" fill="#7dd3fc" /></marker>
          </defs>
          <rect width={layout.width} height={layout.height} fill={`url(#${prefix}-stars)`} />
          <circle cx={70} cy={51} r={20} fill={star?.color ?? '#fbbf24'} opacity={0.12} />
          <circle cx={70} cy={51} r={11} fill={star?.color ?? '#fbbf24'} />
          <text x={102} y={48} fill="#e2e8f0" fontSize={18} fontWeight={700}>{star?.name ?? pack.name}</text>
          <text x={102} y={69} fill="#94a3b8" fontSize={12}>Choose a state to plan your mission</text>
          <text x={layout.width - 36} y={55} textAnchor="end" fill="#94a3b8" fontSize={11}>SCHEMATIC · NOT TO SCALE</text>

          {layout.systems.map(system => (
            <g key={system.id}>
              <rect x={35} y={system.y - 5} width={layout.width - 70} height={system.height - 15} rx={14} fill="#121e30" fillOpacity={0.5} stroke="#25354b" />
              <text x={50} y={system.y + 17} fill="#94a3b8" fontSize={11} fontWeight={600} letterSpacing={1.4}>{system.name.toUpperCase()}</text>
              {system.bodies.map(({ body, x, y }) => (
                <g key={body.id}>
                  <rect x={x} y={y} width={layout.cardWidth} height={107} rx={10} fill="#101b2b" stroke="#28384f" />
                  <circle cx={x + 22} cy={y + 24} r={12} fill={body.color} opacity={0.2} />
                  <circle cx={x + 22} cy={y + 24} r={8} fill={body.color} />
                  <text x={x + 40} y={y + 23} fill="#e2e8f0" fontSize={14} fontWeight={600}>{body.name}</text>
                  <text x={x + 40} y={y + 38} fill="#8194aa" fontSize={9}>{body.kind === 'moon' ? 'MOON' : body.hasSurface ? 'PLANET' : 'GAS GIANT'}{body.hasAtmosphere ? ' · ATMOSPHERE' : ''}</text>
                </g>
              ))}
            </g>
          ))}

          {[false, true].flatMap(highlighted => pack.maneuvers.map((edge, index) => {
            const selected = routeEdges.has(edge.id)
            if (selected !== highlighted || (!selected && routeOnly)) return null
            const from = layout.nodePositions.get(edge.from)
            const to = layout.nodePositions.get(edge.to)
            if (!from || !to) return null
            const sameBody = nodeById.get(edge.from)?.bodyId === nodeById.get(edge.to)?.bodyId
            const fromSystem = layout.systemByBody.get(nodeById.get(edge.from)?.bodyId ?? '')
            const toSystem = layout.systemByBody.get(nodeById.get(edge.to)?.bodyId ?? '')
            return (
              <path
                key={edge.id}
                d={connectionPath(from, to, sameBody, index, fromSystem === toSystem)}
                fill="none"
                stroke={selected ? '#7dd3fc' : '#496279'}
                strokeWidth={selected ? 3 : 1.25}
                strokeOpacity={selected ? 0.95 : 0.5}
                strokeDasharray={!sameBody && !selected ? '4 5' : undefined}
                markerEnd={`url(#${prefix}-${selected ? 'route-arrow' : 'arrow'})`}
                data-edge-id={edge.id}
                data-route-edge={selected ? 'true' : undefined}
              >
                <title>{edge.label}: {edge.deltaV.toLocaleString()} m/s</title>
              </path>
            )
          }))}

          {pack.nodes.map(node => {
            const point = layout.nodePositions.get(node.id)
            if (!point) return null
            const start = node.id === startId
            const end = node.id === endId
            const selected = start || end
            const color = end ? '#c4b5fd' : start || routeNodes.has(node.id) ? '#7dd3fc' : '#94a3b8'
            return (
              <g
                key={node.id}
                transform={`translate(${point.x}, ${point.y})`}
                role="button"
                tabIndex={0}
                aria-label={node.label}
                aria-pressed={selected}
                data-node-id={node.id}
                className="map-node"
                onClick={() => { setInspectedNodeId(node.id); onSelect(node.id) }}
                onKeyDown={event => activate(event, node.id)}
                onMouseEnter={() => setInspectedNodeId(node.id)}
                onFocus={event => {
                  setInspectedNodeId(node.id)
                  // Pointer focus must not move a target between pointerdown/up.
                  if (event.currentTarget.matches(':focus-visible')) {
                    event.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' })
                  }
                }}
              >
                <title>{node.label}{node.altitudeKm !== undefined ? ` · ${node.altitudeKm.toLocaleString()} km` : ''}{start ? ' · Start' : ''}{end ? ' · Destination' : ''}</title>
                <rect x={-23} y={-22} width={46} height={44} rx={8} fill="transparent" />
                <rect className="focus-ring" x={-23} y={-22} width={46} height={44} rx={8} fill="#7dd3fc" fillOpacity={0.1} stroke="#7dd3fc" strokeWidth={2} />
                {selected && <circle r={17} fill="none" stroke={color} strokeWidth={2} strokeDasharray={end ? '3 3' : undefined} />}
                <StateSymbol kind={node.kind} color={color} />
                <text y={30} textAnchor="middle" fill={color} fontSize={9}>{stateNames[node.kind]}</text>
                {selected && <text y={-25} textAnchor="middle" fill={color} fontSize={8} fontWeight={700}>{start && end ? 'START / END' : start ? 'START' : 'END'}</text>}
              </g>
            )
          })}
        </Box>
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
        Scroll horizontally and vertically to explore. Select a state with a click, Enter, or Space. Hover a connection for its cost. Solid ring: start; dashed ring: destination.
      </Typography>
      <Box
        role="region"
        aria-label="Outgoing maneuver costs"
        tabIndex={0}
        aria-live="polite"
        aria-atomic="true"
        sx={{
          // Keep document scroll anchoring stable while hover/focus changes content.
          height: { xs: 160, sm: 128 }, overflowY: 'auto', overscrollBehavior: 'contain',
          mt: 2, p: 1.5, borderRadius: 1.5, bgcolor: '#0b1120', border: '1px solid', borderColor: 'divider',
          '&:focus-visible': { outline: '2px solid #7dd3fc', outlineOffset: 3 },
        }}
      >
        <Typography variant="caption" sx={{ color: inspectedNode ? 'text.primary' : 'text.secondary', fontWeight: inspectedNode ? 600 : 400 }}>
          {inspectedNode ? `${inspectedNode.label} — outgoing maneuvers` : 'Focus or hover a state to inspect its outgoing maneuver costs before selecting it.'}
        </Typography>
        {inspectedNode && (
          <Box component="ul" sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, listStyle: 'none', m: 0, mt: 1, p: 0 }}>
            {outgoingManeuvers.map(edge => (
              <Typography component="li" key={edge.id} variant="caption" sx={{ py: 0.5, px: 1, bgcolor: '#172538', borderRadius: 1 }}>
                → {nodeById.get(edge.to)?.label ?? edge.to}: <Box component="strong" sx={{ color: 'primary.light' }}>{edge.deltaV.toLocaleString()} m/s</Box>
              </Typography>
            ))}
            {outgoingManeuvers.length === 0 && <Typography component="li" variant="caption" color="text.secondary">No outgoing maneuvers in this dataset.</Typography>}
          </Box>
        )}
      </Box>
    </Box>
  )
}
