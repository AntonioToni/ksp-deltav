export type BodyKind = 'star' | 'planet' | 'moon'
export type NodeKind = 'surface' | 'orbit' | 'elliptical' | 'encounter'
export type ManeuverKind = 'ascent' | 'descent' | 'escape' | 'capture' | 'transfer'

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
