/** Suggest a target altitude in km without overriding a requested clearance.
 * Unknown or impossible bounds remain visible to the relay input validator.
 */
export function suggestRelayAltitudeKm(radiusKm: number, atmosphereKm: number, marginKm = 10, sphereOfInfluenceKm?: number): string {
  if (!Number.isFinite(radiusKm) || radiusKm <= 0) return ''
  const atmosphere = Number.isFinite(atmosphereKm) ? atmosphereKm : 0
  const margin = Number.isFinite(marginKm) ? marginKm : 10
  const lower = atmosphere + margin
  const preferred = Math.max(radiusKm * 4 / 3, lower + 1)
  const roundedPreferred = Math.round(preferred * 1000) / 1000
  const upper = sphereOfInfluenceKm !== undefined && Number.isFinite(sphereOfInfluenceKm)
    ? sphereOfInfluenceKm - radiusKm : Infinity

  if (upper > lower && (preferred >= upper || roundedPreferred >= upper)) {
    const midpoint = lower + (upper - lower) / 2
    const rounded = Math.round(midpoint * 1000) / 1000
    if (rounded > lower && rounded < upper) return String(rounded)
    // A narrow interval can be smaller than the interface's usual meter step.
    if (midpoint > lower && midpoint < upper) return String(midpoint)
  }
  return String(roundedPreferred)
}
