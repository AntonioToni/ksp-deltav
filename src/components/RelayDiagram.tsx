import { useId } from 'react'
import { Box, Button, Stack, Typography, useMediaQuery } from '@mui/material'
import RotateRightRounded from '@mui/icons-material/RotateRightRounded'
import type { LinkStatus, RelayNetworkInput, RelayResult } from '../utils/relay'

interface RelayDiagramProps {
  input: RelayNetworkInput
  result: Extract<RelayResult, { status: 'success' }>
  bodyName: string
  bodyColor: string
  onRotate: () => void
}

const tau = Math.PI * 2
const linkColors: Record<LinkStatus, string> = {
  available: '#8fcdbd', marginal: '#e7bd7b', blocked: '#c1808c', 'out-of-range': '#c1808c',
}
const format = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })

/** Merge footprint intervals so overlapping caps do not hide narrow gaps. */
function coverageIntervals(angles: readonly number[], halfAngle: number): [number, number][] {
  if (halfAngle <= 0) return []
  if (halfAngle >= Math.PI) return [[0, tau]]
  const intervals: [number, number][] = []
  for (const angle of angles) {
    const center = ((angle % tau) + tau) % tau
    const start = center - halfAngle
    const end = center + halfAngle
    if (start < 0) intervals.push([0, end], [start + tau, tau])
    else if (end > tau) intervals.push([start, tau], [0, end - tau])
    else intervals.push([start, end])
  }
  intervals.sort((a, b) => a[0] - b[0])
  const merged: [number, number][] = []
  for (const interval of intervals) {
    const last = merged.at(-1)
    if (last && interval[0] <= last[1]) last[1] = Math.max(last[1], interval[1])
    else merged.push([...interval])
  }
  return merged
}

export default function RelayDiagram({ input, result, bodyName, bodyColor, onRotate }: RelayDiagramProps) {
  const compact = useMediaQuery('(max-width: 599px), (max-height: 500px)')
  const prefix = useId().replace(/:/g, '')
  const width = compact ? 320 : 480
  const height = compact ? 118 : 270
  const centerX = width / 2
  const centerY = compact ? 52 : 128
  const orbitRadius = compact ? 42 : 107
  const scale = orbitRadius / result.orbitRadiusM
  const bodyRadius = input.body.radiusM * scale
  const occlusionRadius = bodyRadius * input.occlusionFactor
  const stationAngle = input.stationLongitudeDeg * Math.PI / 180
  const station = {
    x: centerX + bodyRadius * Math.cos(stationAngle),
    y: centerY - bodyRadius * Math.sin(stationAngle),
  }
  const satellites = result.satellites.map(satellite => ({
    x: centerX + satellite.x * scale,
    y: centerY - satellite.y * scale,
  }))
  const footprints = input.hasSurface && result.surfaceHalfAngleRad !== null
    ? coverageIntervals(result.satellites.map(satellite => satellite.angleRad), result.surfaceHalfAngleRad)
    : []
  const strokeWidth = compact ? 1.5 : 2
  const markerRadius = compact ? 5.5 : 7.5
  const pointOnBody = (angle: number) => ({
    x: centerX + bodyRadius * Math.cos(angle),
    y: centerY - bodyRadius * Math.sin(angle),
  })

  return <Box component="figure" sx={{ m: 0, minWidth: 0, width: '100%' }}>
    <Box component="svg" role="img" aria-label={`${bodyName} equatorial relay diagram`} aria-describedby={`${prefix}-description`}
      viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet"
      sx={{ display: 'block', width: '100%', height: compact ? 100 : 250, minHeight: 100, maxHeight: 260, overflow: 'hidden' }}>
      <title>{`${bodyName} circular relay constellation`}</title>
      <desc id={`${prefix}-description`}>{input.satelliteCount} equally spaced relays in a circular equatorial orbit {format.format(input.altitudeM / 1000)} km above {bodyName}. The body and orbit use their physical radius ratio. Colored neighbor lines show local line-of-sight and antenna-range results. Surface arcs show equatorial client footprints, not global coverage or a checked home connection.{input.occlusionFactor < 1 ? ` Dashed inner boundary uses an occlusion radius factor of ${input.occlusionFactor}.` : ''}</desc>
      <circle cx={centerX} cy={centerY} r={orbitRadius} fill="none" stroke="#647e9d" strokeOpacity={.5} strokeDasharray="3 5" strokeWidth={1} />
      {result.neighborLinks.map(link => {
        const from = satellites[link.fromIndex]
        const to = satellites[link.toIndex]
        if (!from || !to) return null
        return <line key={`${link.fromIndex}-${link.toIndex}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y}
          stroke={linkColors[link.status]} strokeWidth={strokeWidth} strokeOpacity={link.status === 'available' || link.status === 'marginal' ? .9 : .65}
          strokeDasharray={link.status === 'blocked' ? '5 4' : link.status === 'out-of-range' ? '2 4' : undefined}
          data-relay-link="neighbor" data-from-index={link.fromIndex} data-to-index={link.toIndex} data-link-status={link.status}>
          <title>{`Relay ${link.fromIndex + 1} ↔ ${link.toIndex + 1}: ${link.status}; ${format.format(link.distanceM / 1000)} km apart; ${format.format(link.clearanceM / 1000)} km occluder clearance.`}</title>
        </line>
      })}
      <circle cx={centerX} cy={centerY} r={bodyRadius} fill="#101b2f" fillOpacity={.85} />
      <circle cx={centerX} cy={centerY} r={bodyRadius} fill={bodyColor} fillOpacity={.18} stroke={bodyColor} strokeWidth={1.25} strokeOpacity={.8} data-relay-body-radius={input.body.radiusM} />
      {input.occlusionFactor < 1 && <circle cx={centerX} cy={centerY} r={occlusionRadius} fill="none" stroke="#b7c6d9" strokeWidth={1} strokeDasharray="3 3" strokeOpacity={.8} data-relay-occlusion-factor={input.occlusionFactor} />}
      {bodyRadius > (compact ? 24 : 34) && <text x={centerX} y={centerY + 3} textAnchor="middle" fill="#c9d5e5" fontSize={compact ? 9 : 12}
        textLength={bodyName.length * (compact ? 5 : 6.5) > bodyRadius * 1.6 ? bodyRadius * 1.6 : undefined} lengthAdjust="spacingAndGlyphs">{bodyName}</text>}
      {footprints.map(([start, end], index) => {
        const fullCircle = end - start >= tau
        const startPoint = pointOnBody(start)
        const endPoint = pointOnBody(end)
        const coverageStroke = Math.min(compact ? 2.5 : 3.5, Math.max(.5, bodyRadius * .1))
        return fullCircle
          ? <circle key={index} cx={centerX} cy={centerY} r={bodyRadius} fill="none" stroke="#8fcdbd" strokeWidth={coverageStroke} data-relay-coverage="true" />
          : <path key={index} d={`M ${startPoint.x} ${startPoint.y} A ${bodyRadius} ${bodyRadius} 0 ${end - start > Math.PI ? 1 : 0} 0 ${endPoint.x} ${endPoint.y}`} fill="none" stroke="#8fcdbd" strokeWidth={coverageStroke} strokeLinecap="butt" data-relay-coverage="true" />
      })}
      {input.hasSurface && result.stationLinks.filter(link => link.status === 'available' || link.status === 'marginal').map(link => {
        const satellite = satellites[link.satelliteIndex]
        if (!satellite) return null
        return <line key={link.satelliteIndex} x1={station.x} y1={station.y} x2={satellite.x} y2={satellite.y}
          stroke={link.status === 'marginal' ? '#e7bd7b' : '#73c8fa'} strokeWidth={strokeWidth} strokeDasharray="2 3" strokeOpacity={.9}
          data-relay-station-link={link.satelliteIndex} data-link-status={link.status}>
          <title>{`Surface client → relay ${link.satelliteIndex + 1}: ${link.status}; ${format.format(link.distanceM / 1000)} km.`}</title>
        </line>
      })}
      {input.hasSurface && <g transform={`translate(${station.x} ${station.y})`} data-relay-station="true">
        <path d="M 0 -4.5 L 4.5 0 L 0 4.5 L -4.5 0 Z" fill="#73c8fa" stroke="#101b2f" strokeWidth={1} />
        <title>{`Equatorial surface client at longitude ${format.format(input.stationLongitudeDeg)}°`}</title>
      </g>}
      {satellites.map((satellite, index) => <g key={index} transform={`translate(${satellite.x} ${satellite.y})`} data-relay-satellite={index}>
        <circle r={markerRadius} fill="#172d42" stroke="#b3e3ff" strokeWidth={1.2} />
        <text y={.5} dominantBaseline="central" textAnchor="middle" fill="#e9f5ff" fontSize={compact ? 8 : 10} fontWeight={500}>{index + 1}</text>
        <title>{`Relay ${index + 1}`}</title>
      </g>)}
      {input.occlusionFactor < 1 && <text x={width / 2} y={height - 4} textAnchor="middle" fill="#a3b0c4" fontSize={compact ? 8 : 10}>Dashed boundary: {input.occlusionFactor}× body radius</text>}
    </Box>
    <Box component="figcaption" sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', columnGap: .5, rowGap: .25, minWidth: 0 }}>
      <Typography sx={{ fontSize: 10, lineHeight: 1.2, color: 'text.secondary', minWidth: 0 }}>Equatorial cross-section</Typography>
      <Button size="small" aria-label="Rotate relays" onClick={onRotate} startIcon={<RotateRightRounded sx={{ fontSize: '15px !important' }} />}
        sx={{ minHeight: 26, minWidth: 0, px: .5, py: .25, fontSize: 10, lineHeight: 1.2, whiteSpace: 'nowrap', '& .MuiButton-startIcon': { mr: .25 } }}>Rotate relays</Button>
      <Stack direction="row" sx={{ gridColumn: '1 / -1', flexWrap: 'wrap', gap: { xs: .75, sm: 1.25 }, alignItems: 'center' }}>
        {[
          ['#8fcdbd', 'Available', false], ['#e7bd7b', 'At limit', false], ['#c1808c', 'Blocked/range', true],
          ...(input.hasSurface ? [['#73c8fa', 'Client', true]] : []),
        ].map(([color, label, dashed]) => <Stack key={String(label)} direction="row" sx={{ alignItems: 'center', gap: .4 }}>
          <Box component="span" aria-hidden="true" sx={{ width: 10, height: 0, borderTop: `2px ${dashed ? 'dashed' : 'solid'} ${String(color)}`, flexShrink: 0 }} />
          <Typography sx={{ fontSize: { xs: 9, sm: 10 }, lineHeight: 1.2, color: 'text.secondary', whiteSpace: 'nowrap' }}>{label}</Typography>
        </Stack>)}
      </Stack>
    </Box>
  </Box>
}
