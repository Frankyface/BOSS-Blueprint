import { create } from 'zustand'

import { isDismissed, markDismissed } from './chromeFlags.ts'

/**
 * The onboarding tour's own little state: is it up, which pointer, and did a human
 * ask for it.
 *
 * Separate from `editorStore` (the chrome around the document) and miles away from
 * `canvasStore` (the document itself): the tour is the only thing in the app that
 * can be entirely absent without changing a single byte of what the client
 * exports. Keeping it in its own store is what makes that obvious.
 */

/**
 * Matches the `boss-blueprint:canvas:v1` naming. The `v1` suffix exists so a future
 * interaction model can re-teach returning clients — NEVER bump it for copy tweaks.
 *
 * `e2e/support/tour.ts` duplicates this literal (the E2E suite cannot import from
 * `src/`); change one, change the other.
 */
export const TOUR_STORAGE_KEY = 'boss-blueprint:tour:v1'

export interface TourState {
  readonly isOpen: boolean
  readonly stepIndex: number
  /** Focus moves to the bubble only when a click asked for the tour. */
  readonly shouldFocus: boolean
  /** Bumped on every open, so the live step list is re-read from the DOM. */
  readonly openCount: number
  /**
   * Whether this page-load has already made the auto-start decision. The
   * localStorage flag is the real latch; this covers the browser where storage
   * throws, so a dismissed tour cannot bounce back on the next re-render.
   */
  readonly hasAutoStarted: boolean
}

export interface TourActions {
  /** First visit: shown without stealing focus, and marked seen immediately. */
  autoStart: () => void
  /** The help control: always from pointer 1, and it takes the focus with it. */
  openFromHelp: () => void
  nextStep: () => void
  /** Skip, Got it, Escape — one exit, one flag write. */
  closeTour: () => void
}

/**
 * SEEN IS SEEN. The flag is written when the tour first appears, not when it is
 * completed: a half-read tour has still been read at, and showing it again is more
 * annoying than useful. Reloading mid-tour therefore does not bring it back — the
 * help control does, deliberately and on request.
 */
export function hasSeenTour(): boolean {
  return isDismissed('local', TOUR_STORAGE_KEY)
}

export const useTourStore = create<TourState & TourActions>()((set) => ({
  isOpen: false,
  stepIndex: 0,
  shouldFocus: false,
  openCount: 0,
  hasAutoStarted: false,

  autoStart: () => {
    markDismissed('local', TOUR_STORAGE_KEY)
    set((state) => ({
      isOpen: true,
      stepIndex: 0,
      shouldFocus: false,
      openCount: state.openCount + 1,
      hasAutoStarted: true,
    }))
  },

  openFromHelp: () => {
    set((state) => ({
      isOpen: true,
      stepIndex: 0,
      shouldFocus: true,
      openCount: state.openCount + 1,
      hasAutoStarted: true,
    }))
  },

  nextStep: () => {
    set((state) => ({ stepIndex: state.stepIndex + 1 }))
  },

  closeTour: () => {
    markDismissed('local', TOUR_STORAGE_KEY)
    set({ isOpen: false, shouldFocus: false, hasAutoStarted: true })
  },
}))
