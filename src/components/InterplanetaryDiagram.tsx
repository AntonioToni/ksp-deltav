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
export default function InterplanetaryDiagram({ input, result, nameA, nameB, centerName, colorA, colorB, centerColor = '#edc778' }: InterplanetaryDiagramProps) {
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
  const plot = { left: 34, right: width - 13, top: 12, bottom: chartHeight - 24 }
  const chartX = (phase: number) => plot.left + phase / 360 * (plot.right - plot.left)
  const chartY = (strength: number) => plot.bottom - strength * (plot.bottom - plot.top)
  const path = (key: 'rangeStrength' | 'signalStrength') => samples.map((sample, index) => `${index ? 'L' : 'M'} ${chartX(sample.samplePhaseDeg)} ${chartY(sample[key])}`).join(' ')
  const currentPhase = input.phaseDeg > 0 && result.phaseDeg === 0 ? 360 : result.phaseDeg
  const blockedSamples = samples.filter(sample => sample.occluded)
  const blockedStart = blockedSamples[0]?.samplePhaseDeg
  const blockedEnd = blockedSamples.at(-1)?.samplePhaseDeg
  const linkColor = colors[result.linkStatus]
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
        data-testid="signals-orbit-diagram" data-signal-phase={result.phaseDeg} viewBox={`0 0 ${width} ${orbitHeight}`} preserveAspectRatio="xMidYMid meet"
        sx={{ display: 'block', width: '100%', height: compact ? 140 : 180 }}>
        <title>{`${nameA} ↔ ${nameB} around ${centerName}`}</title>
        <desc id={`${prefix}-orbit-description`}>{`Circular coplanar reference orbits around ${centerName}. Relative phase ${format.format(result.phaseDeg)} degrees. The straight line is ${result.linkStatus.replaceAll('-', ' ')}. Orbital radii use their physical ratio; endpoint markers and very small central disks are enlarged. The calculation uses the exact effective central radius, not the enlarged marker. Local endpoint horizons and other bodies are not checked.`}</desc>
        {[{ radius: input.orbitRadiusAM, color: colorA }, { radius: input.orbitRadiusBM, color: colorB }].map((orbit, index) => <circle key={index} cx={centerX} cy={centerY} r={orbit.radius * scale} fill="none" stroke={orbit.color} strokeOpacity={.38} strokeWidth={1} strokeDasharray={index ? '3 4' : undefined} />)}
        <circle cx={centerX} cy={centerY} r={Math.max(1.5, input.centralRadiusM * scale)} fill={input.occlusionFactor < 1 ? 'none' : '#102037'} fillOpacity={.95} stroke={centerColor} strokeOpacity={input.occlusionFactor < 1 ? .45 : 1} strokeWidth={1} data-signal-central-radius-m={input.centralRadiusM} />
        <line x1={pointA.x} y1={pointA.y} x2={pointB.x} y2={pointB.y} stroke={linkColor} strokeWidth={2} strokeDasharray={result.linkStatus === 'available' ? undefined : '5 4'}
          data-signal-link-status={result.linkStatus} data-signal-clearance-m={result.centralClearanceM}>
          <title>{`${format.format(result.distanceM / 1e9)} Gm separation; ${format.format(result.signalStrength * 100)}% current signal.`}</title>
        </line>
        <circle cx={centerX} cy={centerY} r={Math.max(input.occlusionFactor < 1 ? 1 : 1.5, input.centralRadiusM * input.occlusionFactor * scale)} fill="#102037" fillOpacity={.95} />
        <circle cx={centerX} cy={centerY} r={Math.max(input.occlusionFactor < 1 ? 1 : 1.5, input.centralRadiusM * input.occlusionFactor * scale)} fill={centerColor} fillOpacity={.24} stroke={centerColor} strokeWidth={1} strokeDasharray={input.occlusionFactor < 1 ? '2 2' : undefined} data-signal-occlusion-factor={input.occlusionFactor} />
        <text x={centerX} y={centerY + Math.max(14, input.centralRadiusM * scale + 13)} textAnchor="middle" fill={centerColor} fontSize={11}>{centerName}</text>
        {endpoint(pointA, nameA, colorA, 'A', true)}
        {endpoint(pointB, nameB, colorB, 'B', false)}
        <text x={width / 2} y={orbitHeight - 5} textAnchor="middle" fill="#9db1ca" fontSize={10}>{format.format(result.phaseDeg)}° relative phase</text>
      </Box>
      <Typography component="figcaption" sx={{ px: 1, pb: .75, fontSize: 10, lineHeight: 1.3, color: 'text.secondary' }}>Markers enlarged; circular reference geometry.</Typography>
    </Box>

    <Box component="figure" sx={{ m: 0, ...card }}>
      <Typography component="figcaption" sx={{ px: 1, pt: .75, fontSize: 11, lineHeight: 1.3, color: 'text.secondary' }}>Signal across a relative-phase cycle</Typography>
      <Box component="svg" role="img" aria-label="Signal strength by relative phase" aria-describedby={`${prefix}-chart-description`}
        data-testid="signals-strength-chart" viewBox={`0 0 ${width} ${chartHeight}`} preserveAspectRatio="xMidYMid meet"
        sx={{ display: 'block', width: '100%', height: compact ? 92 : 112 }}>
        <title>Range-only strength and central-body occlusion</title>
        <desc id={`${prefix}-chart-description`}>The dashed curve shows antenna strength before occlusion. The solid curve includes the central body blocking the link; the shaded band is its blocked phase interval. The vertical marker follows the phase control. This reference cycle does not predict calendar dates.</desc>
        <defs><clipPath id={`${prefix}-plot-clip`}><rect x={plot.left} y={plot.top} width={plot.right - plot.left} height={plot.bottom - plot.top} /></clipPath></defs>
        {[0, .5, 1].map(value => <g key={value}>
          <line x1={plot.left} x2={plot.right} y1={chartY(value)} y2={chartY(value)} stroke="#677f9e" strokeOpacity={.25} strokeWidth={1} />
          <text x={plot.left - 5} y={chartY(value) + 3} textAnchor="end" fill="#a8bad0" fontSize={11}>{value * 100}%</text>
        </g>)}
        {[0, 90, 180, 270, 360].map(phase => <text key={phase} x={chartX(phase)} y={chartHeight - 8} textAnchor="middle" fill="#a8bad0" fontSize={11}>{phase}°</text>)}
        <g clipPath={`url(#${prefix}-plot-clip)`}>
          {blockedStart !== undefined && blockedEnd !== undefined && <rect x={chartX(blockedStart)} y={plot.top} width={Math.max(0, chartX(blockedEnd) - chartX(blockedStart))} height={plot.bottom - plot.top} fill="#dd939c" fillOpacity={.12} data-signal-occlusion-band="true" />}
          <path d={path('rangeStrength')} fill="none" stroke="#9fb2cd" strokeWidth={1.5} strokeDasharray="4 4" data-signal-curve="range-only" />
          <path d={path('signalStrength')} fill="none" stroke="#92d5c6" strokeWidth={2} strokeLinejoin="round" data-signal-curve="with-occlusion" />
          <line x1={chartX(currentPhase)} x2={chartX(currentPhase)} y1={plot.top} y2={plot.bottom} stroke="#e7bd7b" strokeWidth={1} strokeOpacity={.7} data-signal-phase-marker={currentPhase} />
        </g>
        <circle cx={chartX(currentPhase)} cy={chartY(result.signalStrength)} r={3} fill={linkColor} stroke="#102037" strokeWidth={1} />
      </Box>
      <Stack direction="row" sx={{ px: 1, pb: .75, flexWrap: 'wrap', columnGap: 1.25, rowGap: .25 }}>
        {[['#9fb2cd', 'Range only', true], ['#92d5c6', 'With central occlusion', false]].map(([color, label, dashed]) => <Stack key={String(label)} direction="row" sx={{ alignItems: 'center', gap: .5 }}>
          <Box component="span" aria-hidden="true" sx={{ width: 12, borderTop: `2px ${dashed ? 'dashed' : 'solid'} ${String(color)}` }} />
          <Typography sx={{ fontSize: 10, color: 'text.secondary', lineHeight: 1.3 }}>{label}</Typography>
        </Stack>)}
      </Stack>
    </Box>
  </Stack>
}
