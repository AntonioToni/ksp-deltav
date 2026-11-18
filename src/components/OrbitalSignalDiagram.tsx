import { useEffect, useId, useRef, useState } from 'react'
import { Box, Stack, Typography, useMediaQuery } from '@mui/material'
import type { OrbitalSignalInput, OrbitalSignalSample, OrbitalSignalSweep, Vector3 } from '../types/orbital'

interface OrbitalSignalDiagramProps {
  input: OrbitalSignalInput
  sweep: OrbitalSignalSweep
  nameA: string
  nameB: string
  colorA: string
  colorB: string
  centerName?: string
  centerColor?: string
  kerbalism?: boolean
  receivingEndpoint?: 'a' | 'b'
  onPhaseChange?: (phaseDeg: number) => void
  onTimeChange?: (utS: number) => void
  formatTime?: (utS: number) => string
  calendarDayS?: number
}

const colors = { available: '#92d5c6', marginal: '#e7bd7b', blocked: '#dd939c', 'out-of-range': '#dd939c' }
const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })
const compactNumber = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })
const formatStrength = (value: number) => value > 0 && value < .0001 ? '<0.01%' : `${number.format(value * 100)}%`
const defaultTime = (utS: number) => `UT ${number.format(utS)} s`
const distance = (value: number) => `${number.format(value / 1e9)} Gm`

/** Only projection and presentation live here. Positions, orbit tracks,
 * blocking, sampling and interval selection all come from the shared engine. */
export default function OrbitalSignalDiagram({ input, sweep, nameA, nameB, colorA, colorB, centerName, centerColor = '#edc778', kerbalism = false, receivingEndpoint = 'b', onPhaseChange, onTimeChange, formatTime = defaultTime, calendarDayS = 21_600 }: OrbitalSignalDiagramProps) {
  const narrowViewport = useMediaQuery('(max-width: 599px)')
  const shortViewport = useMediaQuery('(max-height: 500px)')
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const prefix = useId().replace(/:/g, '')
  const result = sweep.current
  const hasGeometry = result.geometryUsed !== 'manual-distance' && result.pointA !== null && result.pointB !== null
  useEffect(() => {
    const element = containerRef.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(entries => setContainerWidth(entries[0]?.contentRect.width ?? 0))
    observer.observe(element)
    return () => observer.disconnect()
  }, [hasGeometry])
  if (!hasGeometry || !result.pointA || !result.pointB) return null

  const compact = shortViewport || (containerWidth > 0 ? containerWidth < 400 : narrowViewport)
  const width = compact ? 320 : 480
  const orbitHeight = compact ? 188 : 230
  const chartHeight = compact ? 126 : 148
  const phaseMode = input.positionMode === 'phase'
  const currentParameter = phaseMode ? input.phaseDeg : result.utS
  const focusName = centerName ?? input.bodies.find(body => body.id === result.centerId)?.name ?? 'shared reference'
  const bodyName = (id: string) => input.bodies.find(body => body.id === id)?.name ?? id
  const blockerNames = result.blockingBodyIds.map(bodyName).join(', ')
  const linkDescription = result.linkStatus === 'blocked' ? `blocked by ${blockerNames || 'a body'}`
    : result.linkStatus === 'out-of-range' ? 'out of antenna range'
      : result.linkStatus === 'marginal' ? 'at an antenna-range or body-limb boundary' : 'available'
  const currentSummary = `Signal strength is ${formatStrength(result.signalStrength)} (raw CommNet).${kerbalism ? ` Transmission efficiency is ${formatStrength(result.dampedStrength)}.` : ''}`
  const positionLabel = phaseMode ? `${number.format(input.phaseDeg)}° relative phase` : formatTime(result.utS)
  const legend = [{ color: '#92d5c6', label: 'Signal strength' }, ...(kerbalism ? [{ color: '#8cbde7', label: 'Transmission efficiency' }] : [])]
  const card = { minWidth: 0, border: '1px solid', borderColor: 'divider', borderRadius: 1.25, bgcolor: '#080f2145', overflow: 'hidden' } as const

  // A fixed orthographic view keeps every orbit and separation at one scale.
  // The tilted camera exposes vertical structure without changing the 3D data.
  const project = (point: Vector3) => ({ x: point.x, y: point.y * .8660254037844386 + point.z * .5 })
  const fitPoints = [result.pointA, result.pointB, ...result.orbitPaths.flatMap(track => [track.center, ...track.points])].map(project)
  const minX = Math.min(...fitPoints.map(point => point.x))
  const maxX = Math.max(...fitPoints.map(point => point.x))
  const minY = Math.min(...fitPoints.map(point => point.y))
  const maxY = Math.max(...fitPoints.map(point => point.y))
  const scale = Math.min((width - 70) / Math.max(1, maxX - minX), (orbitHeight - 58) / Math.max(1, maxY - minY))
  const point = (position: Vector3) => {
    const projected = project(position)
    return { x: width / 2 + (projected.x - (minX + maxX) / 2) * scale, y: (orbitHeight - 10) / 2 - (projected.y - (minY + maxY) / 2) * scale }
  }
  const pointA = point(result.pointA)
  const pointB = point(result.pointB)
  function endpointLabel(position: { x: number; y: number }, name: string, letter: string, above: boolean) {
    const right = position.x < width * .65
    const x = Math.max(8, Math.min(width - 8, position.x + (right ? 10 : -10)))
    const space = Math.max(24, right ? width - x - 8 : x - 8)
    const text = `${letter} · ${name}`
    const labelWidth = Math.min(text.length * 6.5, space)
    const y = Math.max(13, Math.min(orbitHeight - 22, position.y + (above ? -10 : 17)))
    return { x, y, space, text, right, left: right ? x : x - labelWidth, width: labelWidth }
  }
  const labelA = endpointLabel(pointA, nameA, 'A', true)
  const labelB = endpointLabel(pointB, nameB, 'B', false)
  const senderPoint = receivingEndpoint === 'a' ? pointB : pointA
  const receiverPoint = receivingEndpoint === 'a' ? pointA : pointB
  const focusTracks = [...new Map(result.orbitPaths.map(track => [track.parentBodyId, track])).values()]
  const orbitPath = (points: Vector3[]) => points.map((position, index) => {
    const projected = point(position)
    return `${index ? 'L' : 'M'} ${projected.x} ${projected.y}`
  }).join(' ')
  const plot = { left: 34, right: width - 13, top: 12, bottom: chartHeight - 24 }
  const parameterSpan = Math.max(Number.MIN_VALUE, sweep.interval.end - sweep.interval.start)
  const chartX = (parameter: number) => plot.left + (parameter - sweep.interval.start) / parameterSpan * (plot.right - plot.left)
  const chartY = (value: number) => plot.bottom - value * (plot.bottom - plot.top)
  const signalPath = (key: 'signalStrength' | 'dampedStrength') => sweep.samples.map((sample, index) => `${index ? 'L' : 'M'} ${chartX(sample.parameter)} ${chartY(sample[key])}`).join(' ')
  const blockedIntervals: { start: number; end: number }[] = []
  let blockedStart: number | null = null
  for (const sample of sweep.samples) {
    if (sample.occluded && blockedStart === null) blockedStart = sample.parameter
    if (!sample.occluded && blockedStart !== null) {
      blockedIntervals.push({ start: blockedStart, end: sample.parameter })
      blockedStart = null
    }
  }
  if (blockedStart !== null) blockedIntervals.push({ start: blockedStart, end: sweep.interval.end })
  const hoverStride = Math.max(1, Math.ceil(sweep.samples.length / 180))
  const hoverSamples = sweep.samples.filter((_, index) => index % hoverStride === 0 || index === sweep.samples.length - 1)

  function chooseParameter(parameter: number) {
    if (phaseMode) onPhaseChange?.(Math.max(0, Math.min(360, parameter)))
    else onTimeChange?.(parameter)
  }

  function sampleTitle(sample: OrbitalSignalSample) {
    return `${phaseMode ? `${number.format(sample.parameter)}° relative phase` : formatTime(sample.parameter)}: ${distance(sample.distanceM)}; raw signal ${formatStrength(sample.signalStrength)}${kerbalism ? `; transmission efficiency ${formatStrength(sample.dampedStrength)}` : ''}; ${sample.linkStatus}.`
  }

  function endpoint(position: { x: number; y: number }, physical: Vector3, name: string, color: string, letter: string, label: ReturnType<typeof endpointLabel>) {
    return <g data-signal-endpoint={letter.toLowerCase()} data-position-x-m={physical.x} data-position-y-m={physical.y} data-position-z-m={physical.z}>
      <circle cx={position.x} cy={position.y} r={5} fill={color} stroke="#091221" strokeWidth={1.5} />
      <text x={label.x} y={label.y} textAnchor={label.right ? 'start' : 'end'} fill={color} fontSize={12}
        textLength={label.text.length * 6.5 > label.space ? label.space : undefined} lengthAdjust="spacingAndGlyphs">{label.text}</text>
      <title>{`${letter}: near ${name}. 3D position ${number.format(physical.x)} / ${number.format(physical.y)} / ${number.format(physical.z)} m.`}</title>
    </g>
  }

  return <Stack ref={containerRef} spacing={.75} sx={{ minWidth: 0, width: '100%' }}>
    <Box component="figure" sx={{ m: 0, ...card }}>
      <Box component="svg" role="img" aria-label={`${nameA} and ${nameB} orbital geometry`} aria-describedby={`${prefix}-orbit-description`}
        data-testid="signals-orbit-diagram" data-signal-phase={result.phaseDeg} data-signal-ut={result.utS} data-signal-receiver={receivingEndpoint} data-signal-geometry={result.geometryUsed}
        viewBox={`0 0 ${width} ${orbitHeight}`} preserveAspectRatio="xMidYMid meet"
        onPointerDown={phaseMode && onPhaseChange ? event => {
          const bounds = event.currentTarget.getBoundingClientRect()
          const clicked = { x: (event.clientX - bounds.left) / bounds.width * width, y: (event.clientY - bounds.top) / bounds.height * orbitHeight }
          const nearest = sweep.samples.filter(sample => sample.pointB).map(sample => ({ sample, projected: point(sample.pointB!) }))
            .sort((left, right) => Math.hypot(left.projected.x - clicked.x, left.projected.y - clicked.y) - Math.hypot(right.projected.x - clicked.x, right.projected.y - clicked.y))[0]
          if (nearest && Math.hypot(nearest.projected.x - clicked.x, nearest.projected.y - clicked.y) <= 20) chooseParameter(nearest.sample.parameter)
        } : undefined}
        sx={{ display: 'block', width: '100%', height: orbitHeight, cursor: phaseMode && onPhaseChange ? 'crosshair' : undefined }}>
        <title>{`${nameA} ↔ ${nameB} around ${focusName}`}</title>
        <desc id={`${prefix}-orbit-description`}>{`A two-dimensional projection of the calculated three-dimensional positions and parent-relative orbits. The reference is ${focusName}. ${positionLabel}. The arrow points ${receivingEndpoint === 'a' ? 'from B to A' : 'from A to B'}; the link is ${linkDescription}. ${currentSummary} All paths use one common scale. Body and vessel markers are enlarged for visibility. Visual overlap in this projection does not establish a blocked link: availability is calculated in three dimensions. ${phaseMode ? 'Planet A is held at its chosen reference position while B moves along its orbit. Use the Planet positions slider or click near B’s orbit to choose a position.' : 'Positions are calculated at the selected universal game time. Local orbit paths keep their parents fixed at that time.'}`}</desc>
        <defs><marker id={`${prefix}-receive-arrow`} markerWidth={6} markerHeight={6} refX={8} refY={3} orient="auto" markerUnits="strokeWidth"><path d="M 0 0 L 6 3 L 0 6 Z" fill={colors[result.linkStatus]} /></marker></defs>
        {result.orbitPaths.map(track => <path key={track.bodyId} d={orbitPath(track.points)} fill="none"
          stroke={track.bodyId === input.bodyAId ? colorA : track.bodyId === input.bodyBId ? colorB : '#9fb2cd'} strokeOpacity={track.bodyId === input.bodyAId || track.bodyId === input.bodyBId ? .55 : .25} strokeWidth={1}
          strokeDasharray={track.bodyId === input.bodyBId ? '3 4' : undefined} data-signal-orbit-body={track.bodyId} data-signal-orbit-parent={track.parentBodyId}
          data-orbit-focus-x-m={track.center.x} data-orbit-focus-y-m={track.center.y} data-orbit-focus-z-m={track.center.z}>
          <title>{`${bodyName(track.bodyId)} orbit around ${bodyName(track.parentBodyId)}. Parent at the physical orbital focus; shown in projection.`}</title>
        </path>)}
        {focusTracks.map(track => {
          const center = point(track.center)
          const body = input.bodies.find(candidate => candidate.id === track.parentBodyId)
          const radius = Math.max(1.5, (body?.radiusM ?? 0) * scale)
          const primary = track.parentBodyId === result.centerId
          const label = body?.name ?? track.parentBodyId
          const anchor = center.x < width * .25 ? 'start' : center.x > width * .75 ? 'end' : 'middle'
          const labelX = Math.max(8, Math.min(width - 8, center.x))
          const labelSpace = anchor === 'start' ? width - labelX - 8 : anchor === 'end' ? labelX - 8 : 2 * Math.min(labelX - 8, width - labelX - 8)
          const labelWidth = Math.min(label.length * 6, Math.max(24, labelSpace))
          const labelLeft = anchor === 'start' ? labelX : anchor === 'end' ? labelX - labelWidth : labelX - labelWidth / 2
          const belowY = Math.max(13, Math.min(orbitHeight - 24, center.y + Math.max(14, radius + 12)))
          // A moon can be almost on top of its parent at this scale. Keep the
          // parent name on the other side of the endpoint label in that case.
          const overlapsEndpoint = [labelA, labelB].some(endpoint => labelLeft < endpoint.left + endpoint.width + 3
            && labelLeft + labelWidth + 3 > endpoint.left && belowY - 11 < endpoint.y + 3 && belowY + 3 > endpoint.y - 12)
          const labelY = overlapsEndpoint ? Math.max(13, center.y - Math.max(10, radius + 6)) : belowY
          return <g key={track.parentBodyId} data-signal-focus-body={track.parentBodyId}>
            <circle cx={center.x} cy={center.y} r={radius} fill="#102037" stroke={primary ? centerColor : '#9fb2cd'} strokeWidth={1}
              data-signal-central-radius-m={primary ? body?.radiusM : undefined} data-signal-occlusion-factor={primary ? input.occlusionFactor : undefined} />
            {input.occlusionFactor !== 1 && <circle cx={center.x} cy={center.y} r={Math.max(.5, radius * input.occlusionFactor)} fill="none" stroke={primary ? centerColor : '#9fb2cd'} strokeDasharray="2 2" strokeOpacity={.65} />}
            <text x={labelX} y={labelY} textAnchor={anchor} fill={primary ? centerColor : '#a8bad0'} fontSize={11}
              textLength={label.length * 6 > labelSpace ? Math.max(24, labelSpace) : undefined} lengthAdjust="spacingAndGlyphs">{label}</text>
            <title>{`${body?.name ?? track.parentBodyId}, physical radius ${number.format(body?.radiusM ?? 0)} m. Markers may be enlarged.`}</title>
          </g>
        })}
        <line x1={senderPoint.x} y1={senderPoint.y} x2={receiverPoint.x} y2={receiverPoint.y} stroke={colors[result.linkStatus]} strokeWidth={2} markerEnd={`url(#${prefix}-receive-arrow)`}
          strokeDasharray={result.linkStatus === 'available' ? undefined : '5 4'} data-signal-link-status={result.linkStatus} data-signal-clearance-m={result.minimumClearanceM ?? undefined} data-signal-blocking-bodies={result.blockingBodyIds.join(',')}>
          <title>{`${distance(result.distanceM)}; ${linkDescription}. ${currentSummary}`}</title>
        </line>
        {endpoint(pointA, result.pointA, nameA, colorA, 'A', labelA)}
        {endpoint(pointB, result.pointB, nameB, colorB, 'B', labelB)}
        <text x={width / 2} y={orbitHeight - 5} textAnchor="middle" fill="#9db1ca" fontSize={12}>{positionLabel}</text>
      </Box>
      <Typography component="figcaption" sx={{ px: 1, pb: .75, fontSize: 12, lineHeight: 1.3, color: 'text.secondary' }}>3D geometry projected into 2D. Small markers are enlarged.</Typography>
    </Box>

    <Box component="figure" sx={{ m: 0, ...card }}>
      <Typography component="figcaption" sx={{ px: 1, pt: .75, fontSize: 12, lineHeight: 1.3, color: 'text.secondary' }}>
        {phaseMode ? 'Signal strength over the selected orbital sweep' : sweep.interval.label} · includes body blocking
      </Typography>
      {!phaseMode && <Typography sx={{ px: 1, pt: .25, fontSize: 11, lineHeight: 1.35, color: 'text.secondary', overflowWrap: 'anywhere' }}>{formatTime(sweep.interval.start)} – {formatTime(sweep.interval.end)}</Typography>}
      <Box component="svg" role="img" aria-label={phaseMode ? 'Signal strength by relative phase' : 'Signal strength by in-game time'} aria-describedby={`${prefix}-chart-description`}
        data-testid="signals-strength-chart" data-signal-damping-exponent={kerbalism ? input.dampingExponent : undefined} data-signal-position-mode={input.positionMode}
        data-signal-interval-start={sweep.interval.start} data-signal-interval-end={sweep.interval.end} data-signal-interval-kind={sweep.interval.kind}
        viewBox={`0 0 ${width} ${chartHeight}`} preserveAspectRatio="xMidYMid meet" tabIndex={onPhaseChange || onTimeChange ? 0 : undefined}
        onPointerDown={onPhaseChange || onTimeChange ? event => {
          const bounds = event.currentTarget.getBoundingClientRect()
          const x = (event.clientX - bounds.left) / bounds.width * width
          chooseParameter(sweep.interval.start + Math.max(0, Math.min(1, (x - plot.left) / (plot.right - plot.left))) * parameterSpan)
        } : undefined}
        onKeyDown={event => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
          if (phaseMode ? !onPhaseChange : !onTimeChange) return
          event.preventDefault()
          chooseParameter(Math.max(sweep.interval.start, Math.min(sweep.interval.end, currentParameter + (event.key === 'ArrowRight' ? 1 : -1) * (phaseMode ? 1 : parameterSpan / 360))))
        }}
        sx={{ display: 'block', width: '100%', height: chartHeight, cursor: onPhaseChange || onTimeChange ? 'crosshair' : undefined }}>
        <title>{kerbalism ? 'Raw CommNet signal strength and Kerbalism transmission efficiency, including body blocking' : 'Raw CommNet signal strength including body blocking'}</title>
        <desc id={`${prefix}-chart-description`}>{`The green curve shows raw CommNet signal strength including three-dimensional body blocking.${kerbalism ? ' The blue curve shows Kerbalism transmission efficiency S^k with the same blocking. Damping changes science rate, not raw signal strength or maximum range.' : ''} Shaded intervals are blocked. Out-of-range positions have zero raw strength. The marker shows ${positionLabel}. ${currentSummary} ${sweep.scopeLabel}. ${phaseMode ? 'The horizontal axis is relative phase in degrees, not a date.' : `The horizontal axis is time in ${number.format(calendarDayS / 3600)}-hour days from the displayed interval start.`}`}</desc>
        <defs><clipPath id={`${prefix}-plot-clip`}><rect x={plot.left} y={plot.top} width={plot.right - plot.left} height={plot.bottom - plot.top} /></clipPath></defs>
        {[0, .5, 1].map(value => <g key={value}>
          <line x1={plot.left} x2={plot.right} y1={chartY(value)} y2={chartY(value)} stroke="#677f9e" strokeOpacity={.25} strokeWidth={1} />
          <text x={plot.left - 5} y={chartY(value) + 3} textAnchor="end" fill="#a8bad0" fontSize={12}>{value * 100}%</text>
        </g>)}
        {[0, .25, .5, .75, 1].map(fraction => {
          const parameter = sweep.interval.start + fraction * parameterSpan
          const days = (parameter - sweep.interval.start) / calendarDayS
          return <text key={fraction} x={chartX(parameter)} y={chartHeight - 8} textAnchor="middle" fill="#a8bad0" fontSize={12}>{phaseMode ? `${number.format(parameter)}°` : `${days >= 10_000 ? compactNumber.format(days) : number.format(days)}d`}</text>
        })}
        <g clipPath={`url(#${prefix}-plot-clip)`}>
          {blockedIntervals.map((interval, index) => <rect key={index} x={chartX(interval.start)} y={plot.top} width={Math.max(0, chartX(interval.end) - chartX(interval.start))} height={plot.bottom - plot.top} fill="#dd939c" fillOpacity={.12} data-signal-occlusion-band="true" data-interval-start={interval.start} data-interval-end={interval.end} />)}
          {kerbalism && <path d={signalPath('dampedStrength')} fill="none" stroke="#8cbde7" strokeWidth={1.25} strokeLinejoin="round" data-signal-curve="transmission-efficiency"><title>Transmission efficiency (S^k) with body blocking</title></path>}
          <path d={signalPath('signalStrength')} fill="none" stroke="#92d5c6" strokeWidth={2} strokeLinejoin="round" data-signal-curve="with-occlusion"><title>Raw CommNet signal strength (S) with body blocking</title></path>
          <line x1={chartX(currentParameter)} x2={chartX(currentParameter)} y1={plot.top} y2={plot.bottom} stroke="#e7bd7b" strokeWidth={1} strokeOpacity={.7}
            data-signal-phase-marker={phaseMode ? currentParameter : undefined} data-signal-time-marker={!phaseMode ? currentParameter : undefined} />
          {hoverSamples.map((sample, index) => <circle key={index} cx={chartX(sample.parameter)} cy={chartY(sample.signalStrength)} r={2.5} fill="transparent" pointerEvents="all"><title>{sampleTitle(sample)}</title></circle>)}
        </g>
        {kerbalism && <circle cx={chartX(currentParameter)} cy={chartY(result.dampedStrength)} r={2.5} fill="#8cbde7" stroke="#102037" strokeWidth={1} data-signal-current-transmission-efficiency={result.dampedStrength}><title>{`Transmission efficiency at selected positions: ${formatStrength(result.dampedStrength)}`}</title></circle>}
        <circle cx={chartX(currentParameter)} cy={chartY(result.signalStrength)} r={3} fill={colors[result.linkStatus]} stroke="#102037" strokeWidth={1} data-signal-current-strength={result.signalStrength}><title>{`Signal strength at selected positions: ${formatStrength(result.signalStrength)} (raw CommNet)`}</title></circle>
      </Box>
      <Stack direction="row" sx={{ px: 1, pb: .75, flexWrap: 'wrap', columnGap: 1.25, rowGap: .25 }}>
        {legend.map(({ color, label }) => <Stack key={label} direction="row" sx={{ alignItems: 'center', gap: .5 }}>
          <Box component="span" aria-hidden="true" sx={{ width: 12, borderTop: `2px solid ${color}` }} />
          <Typography sx={{ fontSize: 12, color: 'text.secondary', lineHeight: 1.3 }}>{label}</Typography>
        </Stack>)}
      </Stack>
    </Box>
  </Stack>
}
