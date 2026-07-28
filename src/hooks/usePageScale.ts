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
 * How much the display packs into one CSS pixel, right now. Browser zoom moves
 * this: 125% zoom multiplies it by 1.25, on top of whatever the monitor's own
 * scaling contributes. Defaulted rather than assumed — jsdom leaves it at 1, and a
 * hostile or exotic value must never be able to divide the scale by zero.
 */
function currentPixelRatio(): number {
  const ratio = typeof window === 'undefined' ? 1 : window.devicePixelRatio
  return Number.isFinite(ratio) && ratio > 0 ? ratio : 1
}

/**
 * Fit-to-window zoom for the virtual page: measures the canvas viewport and
 * shrinks the fixed 1200px page until it fits, never past 1:1.
 *
 * `ResizeObserver` is feature-detected rather than assumed — jsdom (unit tests)
 * has no implementation, and there the initial 1:1 scale is exactly right.
 *
 * FIT TO THE WINDOW, NOT TO THE ZOOM (UX audit MAJOR-7). The first measurement
 * latches the display's pixel ratio as the baseline; every later measurement
 * passes how far it has moved since as `zoomFactor`, so a *resized window*
 * re-fits the page (ratio unchanged, factor 1) while *browser zoom* leaves the fit
 * alone and simply makes everything — page included — physically bigger or
 * smaller, the way zoom behaves on every other page on the web.
 */
export function usePageScale(): PageScale {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const scaleRef = useRef(MAX_PAGE_SCALE)
  /** The pixel ratio the app opened at; zoom is measured relative to it. */
  const baselineRatioRef = useRef(0)
  const [scale, setScale] = useState(MAX_PAGE_SCALE)

  const getScale = useCallback(() => scaleRef.current, [])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const measure = () => {
      const ratio = currentPixelRatio()
      if (baselineRatioRef.current === 0) baselineRatioRef.current = ratio

      const next = pageScaleForViewport(viewport.clientWidth, ratio / baselineRatioRef.current)
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
