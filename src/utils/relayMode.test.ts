import { afterEach, describe, expect, it, vi } from 'vitest'
import { readRelayModePreference, RELAY_MODE_STORAGE_KEY, writeRelayModePreference } from './relayMode'

function store(initial?: string) {
  const values = new Map<string, string>([['unrelated-preference', 'keep this value']])
  if (initial !== undefined) values.set(RELAY_MODE_STORAGE_KEY, initial)
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('relay planner mode preference', () => {
  it('starts new users in Basic without writing or clearing other preferences', () => {
    const storage = store()
    expect(readRelayModePreference(storage)).toBe('basic')
    expect([...storage.values]).toEqual([['unrelated-preference', 'keep this value']])
  })

  it.each(['basic', 'advanced'] as const)('remembers the saved %s view', mode => {
    const storage = store()
    writeRelayModePreference(mode, storage)
    expect(storage.getItem(RELAY_MODE_STORAGE_KEY)).toBe(mode)
    expect(readRelayModePreference(storage)).toBe(mode)
    expect(storage.getItem('unrelated-preference')).toBe('keep this value')
  })

  it.each(['', 'Advanced', 'null', '"advanced"', '{"mode":"advanced"}', 'unexpected'])('falls back safely for the unsupported preference %j', value => {
    expect(readRelayModePreference(store(value))).toBe('basic')
  })

  it('uses browser storage when no explicit storage is supplied', () => {
    const storage = store()
    vi.stubGlobal('window', { localStorage: storage })
    writeRelayModePreference('advanced')
    expect(readRelayModePreference()).toBe('advanced')
    writeRelayModePreference('basic')
    expect(readRelayModePreference()).toBe('basic')
    expect(storage.getItem('unrelated-preference')).toBe('keep this value')
  })

  it('works without a browser or storage object', () => {
    vi.stubGlobal('window', undefined)
    expect(readRelayModePreference()).toBe('basic')
    expect(() => writeRelayModePreference('advanced')).not.toThrow()
  })

  it('handles a blocked localStorage getter', () => {
    vi.stubGlobal('window', Object.defineProperty({}, 'localStorage', {
      get: () => { throw new Error('Storage is blocked') },
    }))
    expect(readRelayModePreference()).toBe('basic')
    expect(() => writeRelayModePreference('advanced')).not.toThrow()
  })

  it('handles read and write failures without interrupting the planner', () => {
    expect(readRelayModePreference({ getItem: () => { throw new Error('Read blocked') } })).toBe('basic')
    expect(() => writeRelayModePreference('advanced', { setItem: () => { throw new Error('Write blocked') } })).not.toThrow()
  })
})
