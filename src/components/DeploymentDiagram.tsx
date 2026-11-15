import { useId } from 'react'
import { Box, Stack, Typography, useMediaQuery } from '@mui/material'
import type { RelayNetworkInput, RelayResult } from '../utils/relay'

interface DeploymentDiagramProps {
  input: RelayNetworkInput
  result: Extract<RelayResult, { status: 'success' }>
  bodyName: string
  bodyColor: string
}

const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })
const distance = (metres: number) => `${number.format(metres / 1000)} km`
const period = (seconds: number) => `${number.format(seconds / 60)} min`
const targetColor = '#73c8fa'
const carrierColor = '#e7bd7b'
const limitColor = '#b8a7d9'

/** Draw the engine's returned apsides and semi-major axis, without solving a
 * second orbit. A fixed two-target-radius envelope keeps the target circle at
 * exactly the same scale and position when the carrier mode changes.
 */
export default function DeploymentDiagram({ input, result, bodyName, bodyColor }: DeploymentDiagramProps) {
  const compact = useMediaQuery('(max-width: 599px), (max-height: 500px)')
  const short = useMediaQuery('(max-height: 500px)')
  const prefix = useId().replace(/:/g, '')
  const deployment = result.deployment
  const width = compact ? 320 : 480
  const height = short ? 150 : compact ? 240 : 300
  const centerX = width / 2
  const centerY = short ? 75 : compact ? 119 : 149
  const targetRadius = short ? 40 : compact ? 70 : 105
  const labelSize = short ? 13 : 12
  const scale = targetRadius / result.orbitRadiusM
  const bodyRadius = input.body.radiusM * scale
  const periapsisM = input.body.radiusM + deployment.periapsisAltitudeM
  const apoapsisM = input.body.radiusM + deployment.apoapsisAltitudeM
  const semiMajorAxis = deployment.semiMajorAxisM * scale
  const focalDistance = (apoapsisM - periapsisM) / 2 * scale
  const semiMinorAxis = Math.sqrt(Math.max(0, semiMajorAxis ** 2 - focalDistance ** 2))
  const ellipseX = centerX + targetRadius - semiMajorAxis
  const sharedX = centerX + targetRadius
  const otherX = ellipseX - semiMajorAxis
  const periapsisX = deployment.mode === 'lower' ? otherX : sharedX
  const apoapsisX = deployment.mode === 'lower' ? sharedX : otherX
  const otherLabelX = Math.max(52, Math.min(width - 52, otherX))
  const sharedName = deployment.mode === 'lower' ? 'Apoapsis' : 'Periapsis'
  const otherName = deployment.mode === 'lower' ? 'Periapsis' : 'Apoapsis'
  const orbitColor = deployment.status === 'blocked' ? '#dd939c' : carrierColor
  const orbitDash = deployment.status === 'blocked' ? '6 4'
    : deployment.status === 'marginal' || deployment.status === 'unchecked' ? '3 3' : undefined
  const statusLabel = {
    clear: 'Carrier orbit', blocked: 'Carrier orbit · blocked',
    marginal: 'Carrier orbit · at a limit', unchecked: 'Carrier orbit · outer limit unchecked',
  }[deployment.status]
  const boundaryLimit = Math.min(centerX - 12, width - centerX - 12, centerY - 28, height - centerY - 30)
  const boundaries = [
    ...(input.body.atmosphereHeightM > 0 ? [{
      kind: 'atmosphere', name: 'Atmosphere', radiusM: input.body.radiusM + input.body.atmosphereHeightM,
      color: '#88adc7', dash: undefined,
    }] : []),
    ...(input.safetyMarginM > 0 ? [{
      kind: 'clearance', name: 'Clearance limit', radiusM: input.body.radiusM + input.body.atmosphereHeightM + input.safetyMarginM,
      color: limitColor, dash: '2 4',
    }] : []),
    ...(input.body.sphereOfInfluenceM !== undefined ? [{
      kind: 'soi', name: 'Sphere of influence', radiusM: input.body.sphereOfInfluenceM,
      color: limitColor, dash: '6 4',
    }] : []),
  ]
  const shownBoundaries = boundaries.filter(boundary => boundary.radiusM * scale <= boundaryLimit)
  const outsideBoundaries = boundaries.filter(boundary => boundary.radiusM * scale > boundaryLimit)
  const carrier = { x: ellipseX, y: centerY - semiMinorAxis }
  const radiusEnd = { x: centerX + bodyRadius / Math.SQRT2, y: centerY + bodyRadius / Math.SQRT2 }
  const legend = [
    { label: 'Target circle', color: targetColor, dash: false },
    { label: statusLabel, color: orbitColor, dash: orbitDash !== undefined },
    { label: 'Release / burn point', color: '#e9f5ff', dash: false },
    ...shownBoundaries.map(boundary => ({ label: boundary.name, color: boundary.color, dash: boundary.dash !== undefined })),
  ]

  return <Box component="figure" sx={{ m: 0, minWidth: 0, width: '100%' }}>
    <Box component="svg" role="img" aria-label={`${bodyName} deployment orbit diagram`} aria-describedby={`${prefix}-description`}
      data-testid="deployment-diagram" data-deployment-mode={deployment.mode} data-deployment-status={deployment.status}
      data-meters-to-pixels={scale} data-center-x={centerX} data-center-y={centerY}
      viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet"
      sx={{ display: 'block', width: '100%', height: short ? 136 : compact ? 226 : 285, minHeight: short ? 0 : 180, maxHeight: 300, overflow: 'hidden', scrollMarginBlock: '2px' }}>
      <title>{`${bodyName}: ${deployment.mode} carrier and circular relay orbit`}</title>
      <desc id={`${prefix}-description`}>
        {`The body is at one focus of the carrier ellipse. The target circle and carrier meet at the ${sharedName.toLowerCase()}, where relays are released and circularized. Body and orbits use one scale; markers are enlarged. Body radius ${distance(input.body.radiusM)}. Target altitude ${distance(input.altitudeM)} and period ${period(result.orbitalPeriodS)}. Carrier semi-major axis ${distance(deployment.semiMajorAxisM)}, periapsis altitude ${distance(deployment.periapsisAltitudeM)}, apoapsis altitude ${distance(deployment.apoapsisAltitudeM)}, and period ${period(deployment.carrierPeriodS)}. The first-to-last release duration is ${period(deployment.deploymentDurationS)}. Carrier injection uses ${number.format(deployment.injectionDeltaVMps)} m/s; each relay circularizes with ${number.format(deployment.relayCircularizationDeltaVMps)} m/s. The carrier marker is a static illustrative position, not a simulated time. ${deployment.issues.join(' ')}`}
      </desc>
      {shownBoundaries.map(boundary => <circle key={boundary.kind} cx={centerX} cy={centerY} r={boundary.radiusM * scale}
        fill={boundary.kind === 'atmosphere' ? '#88adc708' : 'none'} stroke={boundary.color} strokeWidth={1} strokeOpacity={.65} strokeDasharray={boundary.dash}
        data-deployment-boundary={boundary.kind} data-radius-m={boundary.radiusM}>
        <title>{`${boundary.name}: ${distance(boundary.radiusM)} from ${bodyName}'s center`}</title>
      </circle>)}
      <circle cx={centerX} cy={centerY} r={bodyRadius} fill={bodyColor} fillOpacity={.18} stroke={bodyColor} strokeWidth={1.25}
        data-deployment-body-radius={input.body.radiusM}>
        <title>{`${bodyName}'s physical radius: ${distance(input.body.radiusM)}`}</title>
      </circle>
      <circle cx={centerX} cy={centerY} r={targetRadius} fill="none" stroke={targetColor} strokeWidth={1.7}
        data-deployment-orbit="target" data-radius-m={result.orbitRadiusM}>
        <title>{`Target circular relay orbit: ${distance(input.altitudeM)} above the surface`}</title>
      </circle>
      <ellipse cx={ellipseX} cy={centerY} rx={semiMajorAxis} ry={semiMinorAxis} fill="none" stroke={orbitColor} strokeWidth={2}
        strokeDasharray={orbitDash} data-deployment-orbit="carrier" data-semi-major-axis-m={deployment.semiMajorAxisM}>
        <title>{`${deployment.mode === 'lower' ? 'Lower' : 'Higher'} carrier ellipse. ${statusLabel}.${deployment.issues.length ? ` ${deployment.issues.join(' ')}` : ''}`}</title>
      </ellipse>
      <line x1={centerX} y1={centerY} x2={radiusEnd.x} y2={radiusEnd.y} stroke={bodyColor} strokeOpacity={.8} strokeWidth={1} />
      <path d={`M ${centerX - 2} ${centerY} H ${centerX + 2} M ${centerX} ${centerY - 2} V ${centerY + 2}`} stroke="#c9d5e5" strokeWidth={1}>
        <title>{`${bodyName}'s center; the carrier ellipse has a focus here`}</title>
      </path>
      {bodyRadius >= 24 && <text x={centerX} y={centerY - 6} textAnchor="middle" fill="#d7e3f1" fontSize={labelSize}
        textLength={bodyName.length * 6.3 > bodyRadius * 1.65 ? bodyRadius * 1.65 : undefined} lengthAdjust="spacingAndGlyphs">{bodyName}</text>}
      <text x={centerX} y={centerY + bodyRadius + 16} textAnchor="middle" fill="#bacadd" fontSize={labelSize}>
        {`Radius ${distance(input.body.radiusM)}`}
      </text>
      <path d={`M ${otherX} ${centerY - 7} L ${otherLabelX} 29`} fill="none" stroke="#a8b6c8" strokeOpacity={.55} strokeDasharray="2 3" />
      <text x={otherLabelX} y={20} textAnchor="middle" fill={orbitColor} fontSize={labelSize}>{otherName}</text>
      <circle cx={periapsisX} cy={centerY} r={4} fill="#142039" stroke={orbitColor} strokeWidth={1.7}
        data-deployment-apsis="periapsis" data-altitude-m={deployment.periapsisAltitudeM}>
        <title>{`Carrier periapsis: ${distance(deployment.periapsisAltitudeM)} above the surface`}</title>
      </circle>
      <circle cx={apoapsisX} cy={centerY} r={4} fill="#142039" stroke={orbitColor} strokeWidth={1.7}
        data-deployment-apsis="apoapsis" data-altitude-m={deployment.apoapsisAltitudeM}>
        <title>{`Carrier apoapsis: ${distance(deployment.apoapsisAltitudeM)} above the surface`}</title>
      </circle>
      <circle cx={sharedX} cy={centerY} r={6} fill="#101b2f" stroke="#e9f5ff" strokeWidth={1.6} data-deployment-point="release">
        <title>{`Shared ${sharedName.toLowerCase()}: release and burn point. Carrier injection ${number.format(deployment.injectionDeltaVMps)} m/s; each relay circularizes with ${number.format(deployment.relayCircularizationDeltaVMps)} m/s.`}</title>
      </circle>
      <text x={sharedX + 10} y={centerY - 9} fill={orbitColor} fontSize={labelSize}>{sharedName}</text>
      <text x={sharedX + 10} y={centerY + 9} fill="#c9d5e5" fontSize={labelSize}>Release point</text>
      <g transform={`translate(${carrier.x} ${carrier.y})`} data-deployment-point="carrier">
        <path d="M -5 -3.5 L 5 0 L -5 3.5 L -2 0 Z" fill={orbitColor} stroke="#101b2f" strokeWidth={1} />
        <title>Carrier spacecraft · illustrative position</title>
      </g>
    </Box>
    <Box component="figcaption" sx={{ minWidth: 0 }}>
      <Stack direction="row" sx={{ flexWrap: 'wrap', columnGap: 1.25, rowGap: .5, alignItems: 'center' }}>
        {legend.map(item => <Stack key={item.label} direction="row" sx={{ minWidth: 0, alignItems: 'center', gap: .5 }}>
          <Box component="span" aria-hidden="true" sx={{ flexShrink: 0, width: 14, height: 0, borderTop: `2px ${item.dash ? 'dashed' : 'solid'} ${item.color}` }} />
          <Typography sx={{ fontSize: 11.5, lineHeight: 1.35, color: 'text.secondary' }}>{item.label}</Typography>
        </Stack>)}
      </Stack>
      <Typography sx={{ mt: 1, fontSize: 12, color: 'text.secondary', lineHeight: 1.45 }}>
        The carrier releases one relay at the marked point each orbit. Its {deployment.mode === 'lower' ? 'lower periapsis makes each lap shorter' : 'higher apoapsis makes each lap longer'} than the target orbit, gradually spacing the relays evenly.
      </Typography>
      {bodyRadius < 24 && <Typography sx={{ mt: .5, fontSize: 12, color: 'text.secondary', lineHeight: 1.4 }}>{bodyName} is at the center cross. Its physical circle uses the same scale as the orbits.</Typography>}
      {outsideBoundaries.length > 0 && <Typography sx={{ mt: .5, fontSize: 11.5, color: 'text.secondary', lineHeight: 1.4 }}>
        {outsideBoundaries.map(boundary => boundary.name).join(' / ')} {outsideBoundaries.length === 1 ? 'boundary extends' : 'boundaries extend'} beyond this view. The entered limits still apply.
      </Typography>}
    </Box>
  </Box>
}
