export type BodyKind = 'star' | 'black-hole' | 'barycenter' | 'wormhole' | 'planet' | 'moon'
export type NodeKind = 'surface' | 'orbit' | 'reference' | 'elliptical' | 'encounter'
export type ManeuverKind = 'ascent' | 'descent' | 'escape' | 'capture' | 'transfer' | 'wormhole'

export interface CelestialBody {
  id: string
  name: string
  parentId: string | null
  kind: BodyKind
  hasSurface: boolean
  hasAtmosphere: boolean
  /** Reference-backed braking markers; false excludes unmodeled atmospheric assistance. */
  supportsAtmosphericBraking?: boolean
  color: string
}

export interface RouteNode {
  id: string
  bodyId: string
  kind: NodeKind
  label: string
  altitudeKm?: number
}

export interface DataSource {
  id: string
  title: string
  url: string
}

export interface ManeuverEdge {
  id: string
  from: string
  to: string
  deltaV: number
  kind: ManeuverKind
  label: string
  sourceId: string
  assumptions: string[]
}

/** A documented link whose fuel budget must be supplied explicitly by the user. */
export interface UnpricedConnection {
  id: string
  label: string
  from: string
  to: string
  forwardKind: ManeuverKind
  reverseKind: ManeuverKind
  sourceId: string
  assumptions: string[]
}

/** Presentation-only group; all mission searches still use the complete pack. */
export interface MapRegion {
  id: string
  label: string
  bodyIds: string[]
}

export interface PlanetPack {
  id: string
  name: string
  /** Compact display name for pack selectors. */
  shortName?: string
  /** Optional short, visible data-quality note linked to the pack assumptions. */
  dataNotice?: string
  /** Planet used by this pack's supplied interplanetary transfer branches. */
  transferHubBodyId?: string
  version: string
  description: string
  sources: DataSource[]
  assumptions: string[]
  bodies: CelestialBody[]
  nodes: RouteNode[]
  maneuvers: ManeuverEdge[]
  unpricedConnections?: UnpricedConnection[]
  mapRegions?: MapRegion[]
}

export interface PlannerGraph {
  nodes: ReadonlyMap<string, RouteNode>
  adjacency: ReadonlyMap<string, readonly ManeuverEdge[]>
}

export interface RouteLeg {
  edge: ManeuverEdge
  cumulativeDeltaV: number
}

export type RouteResult =
  | { status: 'success'; nodeIds: string[]; legs: RouteLeg[]; totalDeltaV: number }
  | { status: 'invalid'; message: string }
  | { status: 'unreachable'; message: string }
