const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 })

/** Decimal SI units; bit/s is deliberately distinct from Kerbalism's MB/s. */
export function formatBitrate(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '—'
  const [scale, unit] = value >= 1e15 ? [1e15, 'Pbit/s'] : value >= 1e12 ? [1e12, 'Tbit/s']
    : value >= 1e9 ? [1e9, 'Gbit/s'] : value >= 1e6 ? [1e6, 'Mbit/s']
      : value >= 1e3 ? [1e3, 'kbit/s'] : [1, 'bit/s']
  return `${value > 0 && value < .001 ? value.toExponential(2) : number.format(value / scale)} ${unit}`
}
