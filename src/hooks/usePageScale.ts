import { useCallback, useEffect, useRef, useState } from 'react'

import { pageScaleForViewport } from '../canvas/geometry.ts'
import { MAX_PAGE_SCALE } from '../canvas/constants.ts'

export interface PageScale {
  readonly viewportRef: React.RefObject<HTMLDivElement | null>
  /** Re-rendered value, used for layout. */
  readonly scale: number
  /** Stable reader for the gesture fast path (never re-created). */
  readonly getScale: () => number
}

/**
 * Fit-to-window zoom for the virtual page: measures the canvas viewport and
 * shrinks the fixed 1200px page until it fits, never past 1:1.
 *
 * `ResizeObserver` is feature-detected rather than assumed — jsdom (unit tests)
 * has no implementation, and there the initial 1:1 scale is exactly right.
 */
export function usePageScale(): PageScale {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const scaleRef = useRef(MAX_PAGE_SCALE)
  const [scale, setScale] = useState(MAX_PAGE_SCALE)

  const getScale = useCallback(() => scaleRef.current, [])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const measure = () => {
      const next = pageScaleForViewport(viewport.clientWidth)
      if (next === scaleRef.current) return
      scaleRef.current = next
      setScale(next)
    }

    measure()

    if (typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(measure)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [])

  return { viewportRef, scale, getScale }
}
