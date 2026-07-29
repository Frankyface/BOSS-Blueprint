import { afterEach, describe, expect, it } from 'vitest'

import { FLAG_DISMISSED, isDismissed, markDismissed, readFlag, writeFlag } from './chromeFlags.ts'

const KEY = 'boss-blueprint:test-flag'

/** Replace a storage area with one that throws on every access, private-mode style. */
function breakStorage(area: 'localStorage' | 'sessionStorage'): () => void {
  const original = Object.getOwnPropertyDescriptor(window, area)
  Object.defineProperty(window, area, {
    configurable: true,
    get() {
      throw new Error('The operation is insecure.')
    },
  })
  return () => {
    if (original) Object.defineProperty(window, area, original)
  }
}

afterEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
})

describe('chrome flags', () => {
  it('remembers a flag in localStorage across the session', () => {
    markDismissed('local', KEY)

    expect(window.localStorage.getItem(KEY)).toBe(FLAG_DISMISSED)
    expect(isDismissed('local', KEY)).toBe(true)
  })

  it('keeps the two areas apart', () => {
    markDismissed('session', KEY)

    expect(isDismissed('session', KEY)).toBe(true)
    expect(isDismissed('local', KEY)).toBe(false)
  })

  it('reports an unset flag as not dismissed', () => {
    expect(readFlag('local', KEY)).toBeNull()
    expect(isDismissed('local', KEY)).toBe(false)
  })

  it('treats any other value as not dismissed', () => {
    writeFlag('local', KEY, 'later')

    expect(isDismissed('local', KEY)).toBe(false)
  })

  describe('when the browser will not let us store anything', () => {
    it('reads as "never seen" instead of throwing', () => {
      const restore = breakStorage('localStorage')
      try {
        expect(() => readFlag('local', KEY)).not.toThrow()
        expect(isDismissed('local', KEY)).toBe(false)
      } finally {
        restore()
      }
    })

    it('swallows the write, so the notice shows and simply is not remembered', () => {
      const restore = breakStorage('sessionStorage')
      try {
        expect(() => {
          markDismissed('session', KEY)
        }).not.toThrow()
      } finally {
        restore()
      }

      expect(isDismissed('session', KEY)).toBe(false)
    })

    it('survives a storage that exists but refuses to write', () => {
      const original = Object.getOwnPropertyDescriptor(window, 'localStorage')
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        value: {
          getItem: () => null,
          setItem: () => {
            const error = new Error('The quota has been exceeded.')
            error.name = 'QuotaExceededError'
            throw error
          },
          removeItem: () => undefined,
        },
      })

      try {
        expect(() => {
          markDismissed('local', KEY)
        }).not.toThrow()
      } finally {
        if (original) Object.defineProperty(window, 'localStorage', original)
      }
    })
  })
})
