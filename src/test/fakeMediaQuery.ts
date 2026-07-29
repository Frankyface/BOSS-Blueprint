/**
 * A controllable `window.matchMedia` for unit tests.
 *
 * jsdom has no media engine at all, so the desktop guard and the small-viewport
 * layout would otherwise be untestable outside a browser. This stands in for the
 * one thing the app asks of the platform: "does this query match, and tell me when
 * that changes".
 *
 * Every `matchMedia` call shares one match state and one listener set, exactly as a
 * real browser's do for the same query — which is what lets a test prove the guard
 * and the tour agree without wiring them together.
 */

export interface FakeMediaQuery {
  /** Every query string the code under test asked about, in order. */
  readonly queries: readonly string[]
  readonly listenerCount: number
  /** Flip the match and fire `change`, the way a real resize does. */
  setMatches: (matches: boolean) => void
  restore: () => void
}

type ChangeListener = (event: MediaQueryListEvent) => void

export function installFakeMediaQuery(initialMatches = false): FakeMediaQuery {
  const original = Object.getOwnPropertyDescriptor(window, 'matchMedia')
  const listeners = new Set<ChangeListener>()
  const queries: string[] = []
  let matches = initialMatches

  const createList = (query: string): MediaQueryList => {
    queries.push(query)
    return {
      get matches() {
        return matches
      },
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: ChangeListener) => {
        listeners.add(listener)
      },
      removeEventListener: (_type: string, listener: ChangeListener) => {
        listeners.delete(listener)
      },
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    } as unknown as MediaQueryList
  }

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: createList,
  })

  return {
    queries,
    get listenerCount() {
      return listeners.size
    },
    setMatches: (next: boolean) => {
      matches = next
      for (const listener of [...listeners]) {
        listener({ matches: next } as MediaQueryListEvent)
      }
    },
    restore: () => {
      if (original) Object.defineProperty(window, 'matchMedia', original)
      else Reflect.deleteProperty(window, 'matchMedia')
    },
  }
}

/** Remove `matchMedia` entirely — the "platform cannot answer" case. */
export function removeMatchMedia(): () => void {
  const original = Object.getOwnPropertyDescriptor(window, 'matchMedia')
  Reflect.deleteProperty(window, 'matchMedia')
  return () => {
    if (original) Object.defineProperty(window, 'matchMedia', original)
  }
}
