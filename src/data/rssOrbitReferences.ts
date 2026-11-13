import type { DataSource, PlanetPack } from '../types/planner'
import { hohmannArrivalSpeed, hohmannTransfer, parkingOrbitBurn, splitCapture } from '../utils/orbitalBudgets'
import { rssCentralMu, rssConfigBase, rssPhysicalReferences, rssPhysicsSource, type RssPhysicalReference } from './rssPhysics'

export interface RssOrbitReference extends RssPhysicalReference {
  parkingAltitudeM: number
  ellipticalApoapsisRadiusM?: number
}

/** Reprice existing RSS branches at explicitly defined reference ellipses. */
export function applyRssOrbitReferences(
  pack: PlanetPack,
  references: readonly RssOrbitReference[],
  source: DataSource,
  assumptions: readonly string[],
): PlanetPack {
  const modernById = new Map(references.map(reference => [reference.bodyId, reference]))
  const result: PlanetPack = {
    ...pack,
    sources: pack.sources.map(source => ({ ...source })),
    assumptions: pack.assumptions.filter(note => !note.startsWith('All budgets are in m/s, converted from the community diagram')),
    bodies: pack.bodies.map(body => ({ ...body })),
    nodes: pack.nodes.map(node => ({
      ...node,
      ...(node.kind === 'orbit' && modernById.has(node.bodyId)
        ? { altitudeKm: modernById.get(node.bodyId)!.parkingAltitudeM / 1000 } : {}),
    })),
    maneuvers: pack.maneuvers.map(edge => ({ ...edge, assumptions: [...edge.assumptions] })),
  }
  const referenceById = new Map(rssPhysicalReferences.map(reference => [reference.bodyId, reference]))
  const nodeById = new Map(result.nodes.map(node => [node.id, node]))
  const edgeById = new Map(result.maneuvers.map(edge => [edge.id, edge]))
  const bodyById = new Map(result.bodies.map(body => [body.id, body]))
  const nodeId = (bodyId: string, kind: string) => `${bodyId}:${kind}`
  const nameOf = (bodyId: string) => bodyById.get(bodyId)!.name
  const parkingRadius = (reference: RssPhysicalReference): number => {
    const altitude = nodeById.get(nodeId(reference.bodyId, 'orbit'))?.altitudeKm
    if (altitude === undefined || altitude * 1000 <= reference.atmosphereHeightM
      || reference.radiusM + altitude * 1000 >= reference.sphereOfInfluenceM) {
      throw new Error(`Invalid RSS modeled parking reference: ${reference.bodyId}.`)
    }
    return reference.radiusM + altitude * 1000
  }
  const replacePair = (from: string, to: string, deltaV: number, notes: string[]) => {
    if (!Number.isFinite(deltaV) || deltaV < 0) throw new Error(`Invalid RSS orbital budget: ${from} -> ${to}.`)
    for (const [start, end] of [[from, to], [to, from]]) {
      const edge = edgeById.get(`${start}->${end}`)
      if (!edge) throw new Error(`Missing RSS reference branch: ${start} -> ${end}.`)
      edge.deltaV = Math.ceil(deltaV)
      edge.sourceId = source.id
      edge.assumptions = [...assumptions, ...notes]
    }
  }
  const earth = referenceById.get('rss:earth')!
  const earthParkingRadius = parkingRadius(earth)
  const earthEscape = edgeById.get('rss:earth:orbit->rss:earth:encounter')!.deltaV

  for (const reference of references.filter(reference => reference.parentBodyId === 'rss:sun')) {
    const { bodyId, gravitationalParameter: mu, ellipticalApoapsisRadiusM: apoapsis } = reference
    const radius = parkingRadius(reference)
    if (apoapsis === undefined || apoapsis <= radius || apoapsis >= reference.sphereOfInfluenceM) {
      throw new Error(`Invalid RSS modeled high reference: ${bodyId}.`)
    }
    const notes = [
      `${nameOf(bodyId)} reference: circular parking height ${reference.parkingAltitudeM / 1000} km. The high ellipse's closest and farthest points are ${radius} m and ${apoapsis} m from the body center.`,
      `Physical/orbital source: ${rssConfigBase}/${reference.configPath}`,
    ]
    const transfer = hohmannTransfer(rssCentralMu, earth.semiMajorAxisM, reference.semiMajorAxisM)
    const earthBurn = parkingOrbitBurn(earth.gravitationalParameter, earthParkingRadius, transfer.departureDeltaV)
    const increment = Math.ceil(earthBurn) - earthEscape
    if (increment < 0) throw new Error(`RSS Earth reference exceeds modeled departure: ${bodyId}.`)
    replacePair('rss:earth:encounter', nodeId(bodyId, 'encounter'), increment, [
      ...notes,
      `Earth-to-${nameOf(bodyId)} Hohmann transfer using circular orbits in one plane around the Sun. The extra ${increment} m/s plus the separately listed ${earthEscape} m/s Earth escape adds up to ${Math.ceil(earthBurn)} m/s from Earth parking orbit, rounded up.`,
    ])
    const split = splitCapture(mu, radius, apoapsis, transfer.arrivalDeltaV)
    replacePair(nodeId(bodyId, 'orbit'), nodeId(bodyId, 'elliptical'), split.circularization, notes)
    replacePair(nodeId(bodyId, 'elliptical'), nodeId(bodyId, 'encounter'), split.captureToEllipse, [
      ...notes, `Assumed excess approach speed for the Earth transfer: ${transfer.arrivalDeltaV.toFixed(6)} m/s.`,
    ])

    const highPeriapsisSpeed = Math.sqrt(mu / radius) * Math.sqrt(2 / (1 + radius / apoapsis))
    for (const moon of rssPhysicalReferences.filter(candidate => candidate.parentBodyId === bodyId)) {
      if (moon.semiMajorAxisM <= radius || moon.semiMajorAxisM >= reference.sphereOfInfluenceM) {
        throw new Error(`Invalid RSS modeled moon orbital radius: ${moon.bodyId}.`)
      }
      const moonRadius = parkingRadius(moon)
      const moonTransfer = hohmannTransfer(mu, radius, moon.semiMajorAxisM)
      const transferPeriapsisSpeed = Math.sqrt(mu / radius) + moonTransfer.departureDeltaV
      const departure = Math.abs(highPeriapsisSpeed - transferPeriapsisSpeed)
      const arrivalSpeed = hohmannArrivalSpeed(mu, radius, moon.semiMajorAxisM, moon.inclinationDeg!)
      const moonNotes = [
        ...notes,
        `${nameOf(moon.bodyId)} uses a circular orbit of radius ${moon.semiMajorAxisM} m, tilted ${moon.inclinationDeg}° to the reference plane around its parent. Assumed relative approach speed: ${arrivalSpeed.toFixed(6)} m/s.`,
        `Moon parking altitude: ${nodeById.get(nodeId(moon.bodyId, 'orbit'))!.altitudeKm} km. Physical/orbital source: ${rssConfigBase}/${moon.configPath}`,
      ]
      replacePair(nodeId(bodyId, 'elliptical'), nodeId(moon.bodyId, 'encounter'), departure, [
        ...moonNotes,
        `Burn at the orbit's closest point to switch from the stated high ellipse to the moon-transfer ellipse: |${highPeriapsisSpeed.toFixed(6)} − ${transferPeriapsisSpeed.toFixed(6)}| m/s. Entering orbit at the moon is listed separately.`,
      ])
      replacePair(nodeId(moon.bodyId, 'encounter'), nodeId(moon.bodyId, 'orbit'),
        parkingOrbitBurn(moon.gravitationalParameter, moonRadius, arrivalSpeed), moonNotes)
    }
  }

  for (const dataSource of [rssPhysicsSource, source]) {
    if (!result.sources.some(existing => existing.id === dataSource.id)) result.sources.push({ ...dataSource })
  }
  const units = 'All budgets are in m/s. Community-map figures are converted from km/s; recalculated orbit budgets list their separate calculation source. The copied map has no visible version, date, or author credit. Its exact repository revision is linked so the figures can be checked, without claiming they are official RSS calculations.'
  if (!result.assumptions.includes(units)) result.assumptions.unshift(units)
  return result
}
