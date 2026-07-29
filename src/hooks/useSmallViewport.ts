import { useSyncExternalStore } from 'react'

import { SMALL_VIEWPORT_QUERY } from '../constants/viewport.ts'

/**
 * "Is this window too small to lay out a website in?" — live, for anyone who asks.
 *
 * `useSyncExternalStore` over the media query itself rather than a store of our
 * own: the browser already holds this state and already tells us when it changes,
 * so a copy in zustand would only be a second thing to keep in step. Every caller
 * subscribes to the same `MediaQueryList` and therefore cannot disagree — which is
 * the whole point, because the guard renders from it, the shell lays out from it
 * and the tour suppresses itself by it.
 *
 * A `change` listener, NOT a resize handler: the query includes `pointer: coarse`,
 * which no resize event would ever report.
 *
 * Feature-detected end to end. jsdom has no `matchMedia`, a blocked-storage-style
 * exotic host may throw on it, and the server snapshot is `false` — a viewport we
 * cannot measure is never treated as too small, because the cost of being wrong
 * that way is a missing warning rather than a warning nobody can escape.
 */

function mediaQueryList(): MediaQueryList | null {
  try {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null
    return window.matchMedia(SMALL_VIEWPORT_QUERY)
  } catch {
    return null
  }
}

function subscribe(onChange: () => void): () => void {
  const list = mediaQueryList()
  if (!list || typeof list.addEventListener !== 'function') return () => undefined

  list.addEventListener('change', onChange)
  return () => {
    list.removeEventListener('change', onChange)
  }
}

/** Read outside React too — the tour's auto-start decision needs it before paint. */
export function matchesSmallViewport(): boolean {
  return mediaQueryList()?.matches ?? false
}

function serverSnapshot(): boolean {
  return false
}

export function useSmallViewport(): boolean {
  return useSyncExternalStore(subscribe, matchesSmallViewport, serverSnapshot)
}
