export type RelayMode = 'basic' | 'advanced'

export const RELAY_MODE_STORAGE_KEY = 'ksp-deltav:relay-planner-mode'

/** A missing or unavailable preference never prevents opening the planner. */
export function readRelayModePreference(storage?: Pick<Storage, 'getItem'>): RelayMode {
  try {
    const available = storage ?? (typeof window === 'undefined' ? undefined : window.localStorage)
    return available?.getItem(RELAY_MODE_STORAGE_KEY) === 'advanced' ? 'advanced' : 'basic'
  } catch {
    return 'basic'
  }
}

/** Save only the view preference; relay inputs remain in the existing session. */
export function writeRelayModePreference(mode: RelayMode, storage?: Pick<Storage, 'setItem'>): void {
  if (mode !== 'basic' && mode !== 'advanced') return
  try {
    const available = storage ?? (typeof window === 'undefined' ? undefined : window.localStorage)
    available?.setItem(RELAY_MODE_STORAGE_KEY, mode)
  } catch {
    // The caller still keeps the selected mode for this open session.
  }
}
