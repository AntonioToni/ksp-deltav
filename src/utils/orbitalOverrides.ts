import type { OrbitalBody, OrbitalElements } from '../types/orbital'
import { deriveOrbitalPeriod } from './orbitalGeometry'

export type OrbitalElementDraft = Partial<Record<keyof OrbitalElements, string>>
export type OrbitalOverrideDrafts = Record<string, OrbitalElementDraft>

export const orbitalElementFields = [
  { key: 'semiMajorAxisM', label: 'Semi-major axis', unit: 'Gm', scale: 1e9 },
  { key: 'eccentricity', label: 'Eccentricity', unit: '', scale: 1 },
  { key: 'inclinationDeg', label: 'Inclination', unit: '°', scale: 1 },
  { key: 'longitudeAscendingNodeDeg', label: 'Ascending node longitude', unit: '°', scale: 1 },
  { key: 'argumentOfPeriapsisDeg', label: 'Argument of periapsis', unit: '°', scale: 1 },
  { key: 'meanAnomalyAtEpochRad', label: 'Mean anomaly at epoch', unit: '°', scale: Math.PI / 180 },
  { key: 'epochS', label: 'Reference epoch', unit: 'UT s', scale: 1 },
  { key: 'periodS', label: 'Orbital period', unit: 's', scale: 1 },
] as const

export function orbitalDraftValue(body: OrbitalBody, key: keyof OrbitalElements, drafts: OrbitalOverrideDrafts): string {
  const override = drafts[body.id]?.[key]
  if (override !== undefined) return override
  const value = body.orbit?.[key]
  const scale = orbitalElementFields.find(field => field.key === key)!.scale
  return value === undefined || !Number.isFinite(value) ? '' : String(value / scale)
}

export function validOrbitalDraft(key: keyof OrbitalElements, text: string): boolean {
  const value = text.trim() === '' ? NaN : Number(text)
  if (!Number.isFinite(value)) return false
  const scale = orbitalElementFields.find(field => field.key === key)!.scale
  if (!Number.isFinite(value * scale)) return false
  if (key === 'semiMajorAxisM' || key === 'periodS') return value > 0
  if (key === 'eccentricity') return value >= 0 && value < 1
  if (key === 'inclinationDeg') return value >= 0 && value <= 180
  return true
}

/** Only edited fields are converted; untouched source values keep full precision. */
export function applyOrbitalOverrides<T extends OrbitalBody>(bodies: readonly T[], drafts: OrbitalOverrideDrafts): { bodies: T[]; errors: string[] } {
  const errors: string[] = []
  const byId = new Map(bodies.map(body => [body.id, body]))
  return {
    bodies: bodies.map(body => {
      const draft = drafts[body.id]
      if (!draft || Object.keys(draft).length === 0) return body
      const orbit = { ...body.orbit }
      for (const field of orbitalElementFields) {
        const text = draft[field.key]
        if (text === undefined) continue
        if (!validOrbitalDraft(field.key, text)) errors.push(`${body.name ?? body.id}: enter a valid ${field.label.toLowerCase()}.`)
        orbit[field.key] = text.trim() === '' ? NaN : Number(text) * field.scale
      }
      if (draft.semiMajorAxisM !== undefined && draft.periodS === undefined
        && orbit.semiMajorAxisM !== body.orbit?.semiMajorAxisM
        && validOrbitalDraft('semiMajorAxisM', draft.semiMajorAxisM)) {
        // A period derived for the old semi-major axis is no longer valid.
        // Source-only periods (including patched binaries) remain unchanged
        // until the player edits the axis, or explicitly supplies a period.
        const parentMu = body.parentBodyId === null ? undefined : byId.get(body.parentBodyId)?.gravitationalParameter
        orbit.periodS = deriveOrbitalPeriod(orbit.semiMajorAxisM!, parentMu ?? NaN)
        if (!Number.isFinite(orbit.periodS)) {
          errors.push(`${body.name ?? body.id}: enter an orbital period; the parent's gravitational parameter is unavailable.`)
        }
      }
      return { ...body, orbit }
    }), errors,
  }
}
