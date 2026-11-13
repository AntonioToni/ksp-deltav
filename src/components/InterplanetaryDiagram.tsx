import { useId, useMemo } from 'react'
import { Box, Stack, Typography, useMediaQuery } from '@mui/material'
import type { InterplanetarySignalInput, SuccessfulInterplanetarySignal } from '../types/interplanetary'
import { calculateInterplanetarySignal } from '../utils/interplanetary'

interface InterplanetaryDiagramProps {
  input: InterplanetarySignalInput
  result: SuccessfulInterplanetarySignal
  nameA: string
  nameB: string
  centerName: string
  colorA: string
  colorB: string
  centerColor?: string
  kerbalism?: boolean
  receivingEndpoint?: 'a' | 'b'
  onPhaseChange?: (phaseDeg: number) => void
}

const colors = { available: '#92d5c6', marginal: '#e7bd7b', blocked: '#dd939c', 'out-of-range': '#dd939c' }
const format = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })
type SignalSample = SuccessfulInterplanetarySignal & { samplePhaseDeg: number }

/** Refine narrow stellar conjunctions so a five-degree sample does not widen
 * the blocked interval. All signal and line-of-sight decisions stay in the
 * calculation engine, including the two sides of each discontinuity.
 */
function curveSamples(input: InterplanetarySignalInput): SignalSample[] {
  const sampleAt = (phaseDeg: number): SignalSample | null => {
    const sample = calculateInterplanetarySignal({ ...input, phaseDeg })
    return sample.status === 'success' ? { ...sample, samplePhaseDeg: phaseDeg } : null
  }
  const samples = Array.from({ length: 73 }, (_, index) => sampleAt(index * 5))
    .filter((sample): sample is SignalSample => sample !== null)
  const refinements: SignalSample[] = []
  for (let index = 1; index < samples.length; index++) {
    let left = samples[index - 1]!
    let right = samples[index]!
    if (left.occluded === right.occluded) continue
    for (let step = 0; step < 24; step++) {
      const mid = sampleAt((left.samplePhaseDeg + right.samplePhaseDeg) / 2)
      if (!mid) break
      if (mid.occluded === left.occluded) left = mid
      else right = mid
    }
    refinements.push(left, right)
  }
  return [...samples, ...refinements].sort((left, right) => left.samplePhaseDeg - right.samplePhaseDeg)
}

/** Reference visualizations follow the shared phase control; no animation
 * implies a date or advances an unmodeled ephemeris.
 */
export default function InterplanetaryDiagram({ input, result, nameA, nameB, centerName, colorA, colorB, centerColor = '#edc778', kerbalism = false, receivingEndpoint = 'b' }: InterplanetaryDiagramProps) {
  const compact = useMediaQuery('(max-width: 599px), (max-height: 500px)')
  const prefix = useId().replace(/:/g, '')
  const samples = useMemo(() => curveSamples(input), [input])
  const width = compact ? 320 : 480
  const orbitHeight = compact ? 172 : 212
  const chartHeight = compact ? 116 : 138
  const centerX = width / 2
  const centerY = orbitHeight / 2 - 2
  const orbitRadius = compact ? 62 : 86
  const scale = orbitRadius / Math.max(input.orbitRadiusAM, input.orbitRadiusBM)
  const point = (position: { x: number; y: number }) => ({ x: centerX + position.x * scale, y: centerY - position.y * scale })
  const pointA = point(result.pointA)
  const pointB = point(result.pointB)
  const senderPoint = receivingEndpoint === 'a' ? pointB : pointA
  const receiverPoint = receivingEndpoint === 'a' ? pointA : pointB
  const plot = { left: 34, right: width - 13, top: 12, bottom: chartHeight - 24 }
  const chartX = (phase: number) => plot.left + phase / 360 * (plot.right - plot.left)
  const chartY = (strength: number) => plot.bottom - strength * (plot.bottom - plot.top)
  const path = (key: 'rangeStrength' | 'signalStrength' | 'dampedRangeStrength' | 'dampedStrength') => samples.map((sample, index) => `${index ? 'L' : 'M'} ${chartX(sample.samplePhaseDeg)} ${chartY(sample[key])}`).join(' ')
  const currentPhase = input.phaseDeg > 0 && result.phaseDeg === 0 ? 360 : result.phaseDeg
  const blockedSamples = samples.filter(sample => sample.occluded)
  const blockedStart = blockedSamples[0]?.samplePhaseDeg
  const blockedEnd = blockedSamples.at(-1)?.samplePhaseDeg
  const linkColor = colors[result.linkStatus]
  const linkDescription = {
    available: 'available',
    marginal: 'at the antenna range or the edge of the blocking body',
    blocked: `blocked by ${centerName}`,
    'out-of-range': 'out of antenna range',
  }[result.linkStatus]
  const currentStrength = kerbalism ? result.dampedStrength : result.signalStrength
  const legend: { color: string; label: string; dashed: boolean }[] = [
    ...(kerbalism ? [{ color: '#8cbde7', label: 'Raw CommNet', dashed: true }] : []),
    { color: '#9fb2cd', label: kerbalism ? 'Adjusted, clear path' : 'Clear path', dashed: true },
    { color: '#92d5c6', label: kerbalism ? 'Adjusted, with blocking' : 'With blocking', dashed: false },
  ]
  const card = { minWidth: 0, border: '1px solid', borderColor: 'divider', borderRadius: 1.25, bgcolor: '#080f2145', overflow: 'hidden' } as const

  function endpoint(position: { x: number; y: number }, name: string, color: string, letter: string, above: boolean) {
    const right = position.x >= centerX
    const labelSpace = Math.max(24, (right ? width - position.x : position.x) - 14)
    return <g data-signal-endpoint={letter.toLowerCase()}>
      <circle cx={position.x} cy={position.y} r={5} fill={color} stroke="#091221" strokeWidth={1.5} />
      <text x={position.x + (right ? 10 : -10)} y={Math.max(13, Math.min(orbitHeight - 12, position.y + (above ? -10 : 16)))} textAnchor={right ? 'start' : 'end'} fill={color} fontSize={11}
        textLength={name.length * 6 > labelSpace ? labelSpace : undefined} lengthAdjust="spacingAndGlyphs">{letter} · {name}</text>
      <title>{`${letter}: vessel near ${name}`}</title>
    </g>
  }

  return <Stack spacing={.75} sx={{ minWidth: 0, width: '100%' }}>
    <Box component="figure" sx={{ m: 0, ...card }}>
      <Box component="svg" role="img" aria-label={`${nameA} and ${nameB} interplanetary reference geometry`} aria-describedby={`${prefix}-orbit-description`}
        data-testid="signals-orbit-diagram" data-signal-phase={result.phaseDeg} data-signal-receiver={receivingEndpoint} viewBox={`0 0 ${width} ${orbitHeight}`} preserveAspectRatio="xMidYMid meet"
        sx={{ display: 'block', width: '100%', height: compact ? 140 : 180 }}>
        <title>{`${nameA} ↔ ${nameB} around ${centerName}`}</title>
        <desc id={`${prefix}-orbit-description`}>{`Two circular orbits in the same plane around ${centerName}. The bodies are ${format.format(result.phaseDeg)} degrees apart. The arrow points ${receivingEndpoint === 'a' ? 'from sending craft B to receiving craft A' : 'from sending craft A to receiving craft B'}; the link is ${linkDescription}. Orbit sizes show relative distances; small craft and central-body markers are enlarged for visibility. Blocking uses the radius from your inputs, even when the marker is enlarged. Other planets, moons and the horizon near either craft are not checked.`}</desc>
        <defs><marker id={`${prefix}-receive-arrow`} markerWidth={6} markerHeight={6} refX={8} refY={3} orient="auto" markerUnits="strokeWidth"><path d="M 0 0 L 6 3 L 0 6 Z" fill={linkColor} /></marker></defs>
        {[{ radius: input.orbitRadiusAM, color: colorA }, { radius: input.orbitRadiusBM, color: colorB }].map((orbit, index) => <circle key={index} cx={centerX} cy={centerY} r={orbit.radius * scale} fill="none" stroke={orbit.color} strokeOpacity={.38} strokeWidth={1} strokeDasharray={index ? '3 4' : undefined} />)}
        <circle cx={centerX} cy={centerY} r={Math.max(1.5, input.centralRadiusM * scale)} fill={input.occlusionFactor < 1 ? 'none' : '#102037'} fillOpacity={.95} stroke={centerColor} strokeOpacity={input.occlusionFactor < 1 ? .45 : 1} strokeWidth={1} data-signal-central-radius-m={input.centralRadiusM} />
        <line x1={senderPoint.x} y1={senderPoint.y} x2={receiverPoint.x} y2={receiverPoint.y} stroke={linkColor} strokeWidth={2} markerEnd={`url(#${prefix}-receive-arrow)`} strokeDasharray={result.linkStatus === 'available' ? undefined : '5 4'}
          data-signal-link-status={result.linkStatus} data-signal-clearance-m={result.centralClearanceM}>
          <title>{`Distance ${format.format(result.distanceM / 1e9)} Gm; ${format.format(currentStrength * 100)}% ${kerbalism ? 'Kerbalism-adjusted' : 'current'} signal.${kerbalism ? ` Raw CommNet ${format.format(result.signalStrength * 100)}%.` : ''}`}</title>
        </line>
        <circle cx={centerX} cy={centerY} r={Math.max(input.occlusionFactor < 1 ? 1 : 1.5, input.centralRadiusM * input.occlusionFactor * scale)} fill="#102037" fillOpacity={.95} />
        <circle cx={centerX} cy={centerY} r={Math.max(input.occlusionFactor < 1 ? 1 : 1.5, input.centralRadiusM * input.occlusionFactor * scale)} fill={centerColor} fillOpacity={.24} stroke={centerColor} strokeWidth={1} strokeDasharray={input.occlusionFactor < 1 ? '2 2' : undefined} data-signal-occlusion-factor={input.occlusionFactor} />
        <text x={centerX} y={centerY + Math.max(14, input.centralRadiusM * scale + 13)} textAnchor="middle" fill={centerColor} fontSize={11}>{centerName}</text>
        {endpoint(pointA, nameA, colorA, 'A', true)}
        {endpoint(pointB, nameB, colorB, 'B', false)}
        <text x={width / 2} y={orbitHeight - 5} textAnchor="middle" fill="#9db1ca" fontSize={10}>{format.format(result.phaseDeg)}° relative phase</text>
      </Box>
      <Typography component="figcaption" sx={{ px: 1, pb: .75, fontSize: 10, lineHeight: 1.3, color: 'text.secondary' }}>Small markers are enlarged for visibility.</Typography>
    </Box>

    <Box component="figure" sx={{ m: 0, ...card }}>
      <Typography component="figcaption" sx={{ px: 1, pt: .75, fontSize: 11, lineHeight: 1.3, color: 'text.secondary' }}>Signal at each angle between the bodies{kerbalism ? ' · Kerbalism adjustment' : ''}</Typography>
      <Box component="svg" role="img" aria-label="Signal strength by relative phase" aria-describedby={`${prefix}-chart-description`}
        data-testid="signals-strength-chart" data-signal-damping-exponent={kerbalism ? input.dampingExponent : undefined} viewBox={`0 0 ${width} ${chartHeight}`} preserveAspectRatio="xMidYMid meet"
        sx={{ display: 'block', width: '100%', height: compact ? 92 : 112 }}>
        <title>{kerbalism ? 'Kerbalism-adjusted signal with a clear path and with blocking' : 'Signal with a clear path and with blocking'}</title>
        <desc id={`${prefix}-chart-description`}>{kerbalism ? 'The blue dotted curve shows raw CommNet strength with blocking. The gray dashed curve shows Kerbalism-adjusted strength for a clear path. The green solid curve also includes blocking by the central body. These are signal percentages, not rates in bits per second; the adjustment does not change maximum antenna range. ' : 'The dashed curve shows signal strength for a clear path. The solid curve also includes blocking by the central body. '}The shaded band marks angles where the central body blocks the link. The vertical marker shows the selected angle. Positions are chosen with the slider, not predicted from an in-game date.</desc>
        <defs><clipPath id={`${prefix}-plot-clip`}><rect x={plot.left} y={plot.top} width={plot.right - plot.left} height={plot.bottom - plot.top} /></clipPath></defs>
        {[0, .5, 1].map(value => <g key={value}>
          <line x1={plot.left} x2={plot.right} y1={chartY(value)} y2={chartY(value)} stroke="#677f9e" strokeOpacity={.25} strokeWidth={1} />
          <text x={plot.left - 5} y={chartY(value) + 3} textAnchor="end" fill="#a8bad0" fontSize={11}>{value * 100}%</text>
        </g>)}
        {[0, 90, 180, 270, 360].map(phase => <text key={phase} x={chartX(phase)} y={chartHeight - 8} textAnchor="middle" fill="#a8bad0" fontSize={11}>{phase}°</text>)}
        <g clipPath={`url(#${prefix}-plot-clip)`}>
          {blockedStart !== undefined && blockedEnd !== undefined && <rect x={chartX(blockedStart)} y={plot.top} width={Math.max(0, chartX(blockedEnd) - chartX(blockedStart))} height={plot.bottom - plot.top} fill="#dd939c" fillOpacity={.12} data-signal-occlusion-band="true" />}
          {kerbalism && <path d={path('signalStrength')} fill="none" stroke="#8cbde7" strokeWidth={1.25} strokeDasharray="1 3" data-signal-curve="raw-commnet" />}
          <path d={path(kerbalism ? 'dampedRangeStrength' : 'rangeStrength')} fill="none" stroke="#9fb2cd" strokeWidth={1.5} strokeDasharray="4 4" data-signal-curve="range-only" />
          <path d={path(kerbalism ? 'dampedStrength' : 'signalStrength')} fill="none" stroke="#92d5c6" strokeWidth={2} strokeLinejoin="round" data-signal-curve="with-occlusion" />
          <line x1={chartX(currentPhase)} x2={chartX(currentPhase)} y1={plot.top} y2={plot.bottom} stroke="#e7bd7b" strokeWidth={1} strokeOpacity={.7} data-signal-phase-marker={currentPhase} />
        </g>
        <circle cx={chartX(currentPhase)} cy={chartY(currentStrength)} r={3} fill={linkColor} stroke="#102037" strokeWidth={1} />
      </Box>
      <Stack direction="row" sx={{ px: 1, pb: .75, flexWrap: 'wrap', columnGap: 1.25, rowGap: .25 }}>
        {legend.map(({ color, label, dashed }) => <Stack key={label} direction="row" sx={{ alignItems: 'center', gap: .5 }}>
          <Box component="span" aria-hidden="true" sx={{ width: 12, borderTop: `2px ${dashed ? 'dashed' : 'solid'} ${color}` }} />
          <Typography sx={{ fontSize: 10, color: 'text.secondary', lineHeight: 1.3 }}>{label}</Typography>
        </Stack>)}
      </Stack>
    </Box>
  </Stack>
}
