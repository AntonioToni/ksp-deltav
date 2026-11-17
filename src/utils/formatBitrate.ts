const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 })

/** Bit-valued configuration summary for Kerbalism's MinimumScienceRate setting. */
export function formatBitrate(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '—'
  const formatted = value > 0 && (value < .001 || value >= 1e9) ? value.toExponential(2) : number.format(value)
  return `${formatted} bit/s`
}
