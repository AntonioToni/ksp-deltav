/** UI-only unit conversion; drafts and calculations continue to use bit/s. */
export function scienceRateBitsToBytesInput(value: string): string {
  return value.trim() === '' ? '' : String(Number(value) / 8)
}

export function scienceRateBytesToBitsInput(value: string): string {
  return value.trim() === '' ? '' : String(Number(value) * 8)
}
