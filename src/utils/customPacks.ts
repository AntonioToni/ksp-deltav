import type { PlanetPack } from '../types/planner'
import { validatePlanetPack } from './validatePlanetPack'

export const MAX_CUSTOM_PACKS = 5
export const MAX_PACK_BYTES = 1024 * 1024
export const CUSTOM_PACK_STORAGE_KEY = 'ksp-deltav:custom-packs:v1'
const reservedIds = new Set(['stock', 'opm', 'rss', 'stock-kcalbeloh', 'opm-kcalbeloh'])
const collectionLimits = { bodies: 100, nodes: 400, maneuvers: 1000, sources: 20, unpricedConnections: 100, mapRegions: 20 } as const
const optionalCollections = new Set(['unpricedConnections', 'mapRegions'])
const idPattern = /^[A-Za-z0-9][A-Za-z0-9:._/>-]*$/
const colorPattern = /^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i
const encoder = new TextEncoder()
type Entry = Record<string, unknown>
export type PackImportResult = { status: 'success'; pack: PlanetPack } | { status: 'error'; errors: string[] }

function isEntry(value: unknown): value is Entry {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasUnsupportedControl(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0)
    if ((code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127) return true
  }
  return false
}

/** Bound imported collections and presentation data before topology validation. */
function validateImportLimits(raw: Entry): string[] {
  const errors: string[] = []
  const text = (value: unknown, label: string, max: number, optional = false) => {
    if (optional && value === undefined) return
    if (typeof value !== 'string' || !value.trim() || value.length > max || hasUnsupportedControl(value)) {
      errors.push(`${label} must be nonempty text of at most ${max} characters.`)
    }
  }
  const id = (value: unknown, label: string, optional = false) => {
    if (optional && value === undefined) return
    if (typeof value !== 'string' || value.length > 200 || !idPattern.test(value)) {
      errors.push(`${label} must use 1–200 letters, numbers, colons, periods, underscores, slashes, > or hyphens, starting with a letter or number.`)
    }
  }
  const assumptions = (value: unknown, label: string) => {
    if (!Array.isArray(value) || value.length > 30) {
      errors.push(`${label} must be an array of at most 30 text entries.`)
      return
    }
    for (const item of value) text(item, label, 1000)
  }

  id(raw.id, 'Pack ID')
  text(raw.name, 'Pack name', 80)
  text(raw.version, 'Pack version', 40)
  text(raw.description, 'Pack description', 4000)
  text(raw.shortName, 'Pack shortName', 12, true)
  text(raw.dataNotice, 'Pack dataNotice', 80, true)
  id(raw.transferHubBodyId, 'Pack transferHubBodyId', true)
  assumptions(raw.assumptions, 'Pack assumptions')

  // Return before scanning an oversized collection or following its hierarchy.
  for (const [key, limit] of Object.entries(collectionLimits)) {
    if (optionalCollections.has(key) && raw[key] === undefined) continue
    if (!Array.isArray(raw[key]) || raw[key].length > limit) {
      errors.push(`${key} must be an array of at most ${limit} entries.`)
    }
  }
  if (errors.length) return errors

  for (const [key] of Object.entries(collectionLimits)) {
    if (optionalCollections.has(key) && raw[key] === undefined) continue
    for (const [index, item] of (raw[key] as unknown[]).entries()) {
      const label = `${key}[${index}]`
      if (!isEntry(item)) {
        errors.push(`${label} must be an object.`)
        continue
      }
      id(item.id, `${label} ID`)
      if (key === 'bodies') {
        text(item.name, `${label} name`, 80)
        if (item.parentId !== null) id(item.parentId, `${label} parentId`)
        if (typeof item.color !== 'string' || !colorPattern.test(item.color)) {
          errors.push(`${label} color must be a hexadecimal color (#rgb, #rgba, #rrggbb or #rrggbbaa).`)
        }
      } else if (key === 'nodes') {
        id(item.bodyId, `${label} bodyId`)
        text(item.label, `${label} label`, 120)
      } else if (key === 'sources') {
        text(item.title, `${label} title`, 160)
        text(item.url, `${label} URL`, 2048)
        try {
          const url = new URL(typeof item.url === 'string' ? item.url : '')
          if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Unsafe source URL')
        } catch {
          errors.push(`${label} must have an HTTPS URL without embedded credentials.`)
        }
      } else if (key === 'mapRegions') {
        text(item.label, `${label} label`, 120)
        if (!Array.isArray(item.bodyIds) || item.bodyIds.length > 100) errors.push(`${label} bodyIds must be an array of at most 100 IDs.`)
        else for (const bodyId of item.bodyIds) id(bodyId, `${label} body ID`)
      } else {
        id(item.from, `${label} from`)
        id(item.to, `${label} to`)
        id(item.sourceId, `${label} sourceId`)
        text(item.label, `${label} label`, 160)
        assumptions(item.assumptions, `${label} assumptions`)
        if (key === 'maneuvers' && (typeof item.deltaV !== 'number' || !Number.isFinite(item.deltaV) || item.deltaV < 0 || item.deltaV > 1_000_000)) {
          errors.push(`${label} Delta-V must be between 0 and 1,000,000 m/s.`)
        }
      }
    }
  }
  return errors
}

/** Keep only supported data; extra JSON fields never become application config. */
function canonicalPack(pack: PlanetPack): PlanetPack {
  return {
    id: pack.id, name: pack.name, version: pack.version, description: pack.description,
    ...(pack.shortName !== undefined ? { shortName: pack.shortName } : {}),
    ...(pack.dataNotice !== undefined ? { dataNotice: pack.dataNotice } : {}),
    ...(pack.transferHubBodyId !== undefined ? { transferHubBodyId: pack.transferHubBodyId } : {}),
    assumptions: [...pack.assumptions],
    sources: pack.sources.map(({ id, title, url, budgetType }) => ({ id, title, url,
      ...(budgetType !== undefined ? { budgetType } : {}),
    })),
    bodies: pack.bodies.map(({ id, name, parentId, kind, hasSurface, hasAtmosphere, supportsAtmosphericBraking, color }) => ({
      id, name, parentId, kind, hasSurface, hasAtmosphere, color,
      ...(supportsAtmosphericBraking !== undefined ? { supportsAtmosphericBraking } : {}),
    })),
    nodes: pack.nodes.map(({ id, bodyId, kind, label, altitudeKm }) => ({
      id, bodyId, kind, label, ...(altitudeKm !== undefined ? { altitudeKm } : {}),
    })),
    ...(pack.unpricedConnections !== undefined ? { unpricedConnections: pack.unpricedConnections.map(({ id, label, from, to, forwardKind, reverseKind, sourceId, assumptions }) => ({
      id, label, from, to, forwardKind, reverseKind, sourceId, assumptions: [...assumptions],
    })) } : {}),
    ...(pack.mapRegions !== undefined ? { mapRegions: pack.mapRegions.map(({ id, label, bodyIds }) => ({ id, label, bodyIds: [...bodyIds] })) } : {}),
    maneuvers: pack.maneuvers.map(({ id, from, to, deltaV, kind, label, sourceId, assumptions }) => ({
      id, from, to, deltaV, kind, label, sourceId, assumptions: [...assumptions],
    })),
  }
}

/** Import existing PlanetPack JSON, with no inferred costs or reverse maneuvers. */
export function parsePlanetPackJson(text: string): PackImportResult {
  if (typeof text !== 'string' || text.length > MAX_PACK_BYTES || encoder.encode(text).byteLength > MAX_PACK_BYTES) {
    return { status: 'error', errors: ['The planet pack file must be no larger than 1 MiB.'] }
  }
  let raw: unknown
  try {
    // A UTF-8 BOM is common in hand-written Windows JSON files.
    raw = JSON.parse(text.replace(/^\uFEFF/, ''))
  } catch {
    return { status: 'error', errors: ['The file is not valid JSON. Export a planet pack to see the expected format.'] }
  }
  if (!isEntry(raw)) return { status: 'error', errors: ['Planet pack must be an object.'] }
  const bounds = validateImportLimits(raw)
  if (bounds.length) return { status: 'error', errors: bounds }
  const errors = validatePlanetPack(raw)
  if (reservedIds.has(raw.id as string)) errors.push('The pack ID is reserved for a built-in system. Give your custom pack a unique ID.')
  return errors.length ? { status: 'error', errors } : { status: 'success', pack: canonicalPack(raw as unknown as PlanetPack) }
}

/** Report conflicts without overwriting a saved or built-in system. */
export function validateCustomPackAddition(pack: PlanetPack, existing: readonly PlanetPack[]): string | null {
  try {
    const parsed = parsePlanetPackJson(JSON.stringify(pack))
    if (parsed.status === 'error') return parsed.errors[0] ?? 'Invalid planet pack.'
    if (existing.some(candidate => candidate.id === pack.id)) return `A custom pack with ID “${pack.id}” already exists. Remove it first or use a new ID.`
    if (existing.length >= MAX_CUSTOM_PACKS) return `You can keep up to ${MAX_CUSTOM_PACKS} custom packs. Remove one before importing another.`
    return null
  } catch {
    return 'The custom pack could not be read as JSON.'
  }
}

/** Restore only validated entries; malformed local storage never reaches routing. */
export function readCustomPacks(storage: Pick<Storage, 'getItem'>): { packs: PlanetPack[]; warning: string | null } {
  try {
    const saved = storage.getItem(CUSTOM_PACK_STORAGE_KEY)
    if (saved === null) return { packs: [], warning: null }
    if (saved.length > MAX_CUSTOM_PACKS * MAX_PACK_BYTES + 1024 || encoder.encode(saved).byteLength > MAX_CUSTOM_PACKS * MAX_PACK_BYTES + 1024) {
      return { packs: [], warning: 'Saved custom packs exceeded the supported size and could not be restored.' }
    }
    const envelope: unknown = JSON.parse(saved)
    if (!isEntry(envelope) || envelope.version !== 1 || !Array.isArray(envelope.packs)) {
      return { packs: [], warning: 'Saved custom packs use an unsupported format and could not be restored.' }
    }
    const packs: PlanetPack[] = []
    let skipped = envelope.packs.length > MAX_CUSTOM_PACKS
    for (const raw of envelope.packs.slice(0, MAX_CUSTOM_PACKS)) {
      const result = parsePlanetPackJson(JSON.stringify(raw))
      if (result.status === 'error' || packs.some(pack => pack.id === result.pack.id)) skipped = true
      else packs.push(result.pack)
    }
    return { packs, warning: skipped ? 'Some saved custom packs were invalid or duplicated and were not restored.' : null }
  } catch {
    return { packs: [], warning: 'Custom packs could not be restored from this browser. You can still import and use them for this session.' }
  }
}

/** Keep the in-memory feature usable when private mode or storage quotas block saving. */
export function saveCustomPacks(storage: Pick<Storage, 'setItem'>, packs: readonly PlanetPack[]): string | null {
  if (packs.length > MAX_CUSTOM_PACKS) return `Only ${MAX_CUSTOM_PACKS} custom packs can be saved.`
  const canonical: PlanetPack[] = []
  try {
    for (const pack of packs) {
      const result = parsePlanetPackJson(JSON.stringify(pack))
      if (result.status === 'error') return result.errors[0] ?? 'Invalid custom pack.'
      if (canonical.some(candidate => candidate.id === result.pack.id)) return 'Custom pack IDs must be unique.'
      canonical.push(result.pack)
    }
    storage.setItem(CUSTOM_PACK_STORAGE_KEY, JSON.stringify({ version: 1, packs: canonical }))
    return null
  } catch {
    return 'This browser could not save custom packs. They remain available for this session; export a copy to keep them.'
  }
}
