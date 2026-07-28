import type { StorageLike } from '../store/canvasStorage.ts'

/**
 * An in-memory stand-in for `localStorage` that can be made to fail on demand, so
 * the quota and read-only paths are exercised for real rather than mocked away.
 */
export interface FakeStorage extends StorageLike {
  readonly entries: Map<string, string>
  /** Every subsequent `setItem` throws this; pass `null` to stop failing. */
  failWrites: (error: Error | null) => void
}

export function createFakeStorage(initial: Record<string, string> = {}): FakeStorage {
  const entries = new Map(Object.entries(initial))
  let writeError: Error | null = null

  return {
    entries,
    failWrites: (error) => {
      writeError = error
    },
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      if (writeError !== null) throw writeError
      entries.set(key, value)
    },
    removeItem: (key) => {
      entries.delete(key)
    },
  }
}

/** The shape browsers actually throw when localStorage is full. */
export function quotaExceededError(): Error {
  const error = new Error('The quota has been exceeded.')
  error.name = 'QuotaExceededError'
  return error
}
