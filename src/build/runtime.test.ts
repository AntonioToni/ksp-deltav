import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })

async function runtime(pr?: string) {
  vi.resetModules()
  vi.stubEnv('PROD', true)
  vi.stubEnv('BASE_URL', pr ? `/ksp-deltav/previews/pr-${pr}/` : '/ksp-deltav/')
  vi.stubEnv('VITE_PREVIEW_PR_NUMBER', pr)
  return import('./runtime')
}

function storage() {
  const values = new Map<string, string>()
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
}

describe('Preview runtime protections and application storage', () => {
  it('leaves production keys untouched and permits a future analytics initializer only in production', async () => {
    const context = await runtime()
    expect(context.analyticsEnabled).toBe(true)
    expect(context.appStorageKey('ksp-deltav:relay-planner-mode')).toBe('ksp-deltav:relay-planner-mode')
  })

  it('uses a separate namespace for every PR and never enables preview analytics', async () => {
    const first = await runtime('24')
    expect(first.analyticsEnabled).toBe(false)
    expect(first.appStorageKey('key')).toBe('ksp-deltav:preview:pr-24:key')
    const second = await runtime('25')
    expect(second.analyticsEnabled).toBe(false)
    expect(second.appStorageKey('key')).not.toBe(first.appStorageKey('key'))
  })

  it('does not read or overwrite production relay preferences, even with explicitly supplied storage', async () => {
    await runtime('24')
    const { readRelayModePreference, writeRelayModePreference, RELAY_MODE_STORAGE_KEY } = await import('../utils/relayMode')
    const store = storage()
    store.setItem(RELAY_MODE_STORAGE_KEY, 'advanced')
    expect(readRelayModePreference(store)).toBe('basic')
    writeRelayModePreference('advanced', store)
    writeRelayModePreference('basic', store)
    expect(store.getItem(RELAY_MODE_STORAGE_KEY)).toBe('advanced')
    expect(store.getItem(`ksp-deltav:preview:pr-24:${RELAY_MODE_STORAGE_KEY}`)).toBe('basic')
  })

  it('separates imported packs from production and other previews without clearing their data', async () => {
    await runtime('24')
    const { readCustomPacks, saveCustomPacks, CUSTOM_PACK_STORAGE_KEY } = await import('../utils/customPacks')
    const store = storage()
    store.setItem(CUSTOM_PACK_STORAGE_KEY, 'production data, deliberately not valid JSON')
    store.setItem(`ksp-deltav:preview:pr-25:${CUSTOM_PACK_STORAGE_KEY}`, 'other PR data')
    expect(readCustomPacks(store)).toEqual({ packs: [], warning: null })
    expect(saveCustomPacks(store, [])).toBeNull()
    expect(store.getItem(`ksp-deltav:preview:pr-24:${CUSTOM_PACK_STORAGE_KEY}`)).toBe('{"version":1,"packs":[]}')
    expect(store.getItem(CUSTOM_PACK_STORAGE_KEY)).toBe('production data, deliberately not valid JSON')
    expect(store.getItem(`ksp-deltav:preview:pr-25:${CUSTOM_PACK_STORAGE_KEY}`)).toBe('other PR data')
  })
})
