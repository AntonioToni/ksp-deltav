const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 })
const fraction = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 3 })
const units = ['B/s', 'kB/s', 'MB/s', 'GB/s'] as const

/** Format a byte-valued rate using decimal SI units; this function does not convert bits. */
export function formatRateBytesPerSecond(bytesPerSecond: number): string {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond < 0) return '—'
  if (bytesPerSecond === 0) return '0 B/s'

  let unitIndex = 0
  let scaledRate = bytesPerSecond
  while (scaledRate >= 1000 && unitIndex < units.length - 1) {
    scaledRate /= 1000
    unitIndex += 1
  }
  // Rounding must not leave a displayed 1,000 in a smaller SI unit.
  if (scaledRate >= 999.9995 && unitIndex < units.length - 1) {
    scaledRate /= 1000
    unitIndex += 1
  }

  const formatted = scaledRate < .001 ? scaledRate.toExponential(2)
    : scaledRate < 1 ? fraction.format(scaledRate) : number.format(scaledRate)
  return `${formatted} ${units[unitIndex]}`
}

/** UI boundary for planner science rates, whose calculation/storage unit is bit/s. */
export function formatScienceRateBitsPerSecond(bitsPerSecond: number): string {
  if (!Number.isFinite(bitsPerSecond) || bitsPerSecond < 0) return '—'
  if (bitsPerSecond > 0 && bitsPerSecond < .008) {
    // Convert the mantissa before formatting tiny rates, so division cannot
    // round a positive subnormal byte rate to zero or lose its precision.
    const [bitMantissa, bitExponent] = bitsPerSecond.toExponential(16).split('e')
    const [byteMantissa, byteExponent] = (Number(bitMantissa) / 8).toExponential(2).split('e')
    return `${byteMantissa}e${Number(bitExponent) + Number(byteExponent)} B/s`
  }
  return formatRateBytesPerSecond(bitsPerSecond / 8)
}
