import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import { useSmallViewport } from '../hooks/useSmallViewport.ts'
import { useEditorStore } from '../store/editorStore.ts'
import { useSubmitStore } from '../store/submitStore.ts'
import { hasSeenTour, useTourStore } from '../store/tourStore.ts'
import { anchorBubble, rectOfElement, samePoint } from '../tour/tourAnchor.ts'
import type { AnchorPoint } from '../tour/tourAnchor.ts'
import { liveTourSteps } from '../tour/tourSteps.ts'
import type { TourStep } from '../tour/tourSteps.ts'

import './OnboardingTour.css'

const SKIP_LABEL = 'Skip'
const NEXT_LABEL = 'Next'
const DONE_LABEL = 'Got it'
const ESCAPE_KEY = 'Escape'

/**
 * FIVE POINTERS AT THINGS THAT ALREADY EXIST — and the strictest rule in the
 * feature: it never blocks a single click.
 *
 * That rule is structural, not stylistic. The layer is `pointer-events: none` and
 * only the bubble itself takes pointer events back, so there is no backdrop to
 * swallow a click on the palette underneath. There is no `aria-modal`, no focus
 * trap and no scroll lock, and `role="note"` rather than `role="dialog"` because a
 * screen reader must not announce this as a thing you have to deal with. A client
 * can add a block, type into it and scroll the page with a pointer still open.
 *
 * SUPPRESSION ORDER: template picker > desktop guard > tour. Nothing is polled —
 * `startState` is the picker's own state and `useSmallViewport` is the guard's own
 * media query, so all three read one source each. Two first-run experiences stacked
 * on each other would be exactly the overload this feature exists to remove.
 *
 * Suppression HIDES rather than closes: grow a small window back past the threshold
 * and the pointer you were on is still there.
 */
export function OnboardingTour() {
  const isOpen = useTourStore((state) => state.isOpen)
  const stepIndex = useTourStore((state) => state.stepIndex)
  const openCount = useTourStore((state) => state.openCount)
  const shouldFocus = useTourStore((state) => state.shouldFocus)
  const nextStep = useTourStore((state) => state.nextStep)
  const closeTour = useTourStore((state) => state.closeTour)
  const startState = useEditorStore((state) => state.startState)
  const isSubmitting = useSubmitStore((state) => state.screen !== 'closed')
  const isSmallViewport = useSmallViewport()

  const bubbleRef = useRef<HTMLDivElement | null>(null)
  const [position, setPosition] = useState<AnchorPoint | null>(null)

  /*
   * Submit TAKES OVER the editor body, which unmounts four of the five targets —
   * so a bubble left open would be pointing at a form. It comes back if they close
   * the form, because suppression hides rather than closes.
   */
  const isSuppressed = startState !== 'editing' || isSmallViewport || isSubmitting
  const isShowing = isOpen && !isSuppressed

  /**
   * AUTO-START, once per browser, and only after the first-open choice is
   * resolved. `hasSeenTour` is read here rather than held in the store so nothing
   * caches a stale answer across a reload, and the flag is written the moment the
   * tour appears (`autoStart`) — a tour that is half-read has still been seen.
   */
  useEffect(() => {
    if (isSuppressed) return

    const tour = useTourStore.getState()
    if (tour.isOpen || tour.hasAutoStarted) return
    if (hasSeenTour()) return

    tour.autoStart()
  }, [isSuppressed])

  /**
   * Which pointers have something to point at, decided per opening. A step whose
   * target is missing is skipped and the rest renumber — the app must never show
   * "step 3 of 5" beside an empty patch of screen.
   *
   * READ AFTER THE COMMIT, NEVER DURING THE RENDER. This used to be a `useMemo`
   * keyed on the same two values, and that was a real defect: the render where
   * `isShowing` flips back to true (closing Submit) still sees the OLD DOM, where
   * four of the five targets are unmounted and only the header's `submit` survives
   * — so the tour came back as "step 1 of 1" pointing at Submit. A layout effect
   * runs after React has applied every DOM mutation of that commit and before the
   * browser paints, so the list is read from the page the client is about to see
   * and there is no flicker.
   *
   * `set-state-in-effect` is disabled for exactly one line below, deliberately: this
   * is React's own documented "measure the DOM before the browser repaints" case, and
   * it runs at most once per suppression transition. The rule's suggested shape —
   * `useSyncExternalStore` over a `MutationObserver` — would mean observing
   * `document.body` with `subtree: true` and re-querying five selectors on every DOM
   * mutation, in an app whose main interaction is dragging things around a canvas.
   * A once-per-transition state write is the cheaper and clearer trade.
   */
  const [steps, setSteps] = useState<readonly TourStep[]>([])

  useLayoutEffect(() => {
    // Reading `openCount` IS the dependency: every opening re-reads the DOM, so a
    // target that appeared (or went) since last time is accounted for.
    void openCount
    // eslint-disable-next-line react-hooks/set-state-in-effect -- post-commit DOM read; see above.
    setSteps(isShowing ? liveTourSteps(document) : [])
  }, [isShowing, openCount])

  const lastIndex = steps.length - 1
  const step = steps[Math.min(stepIndex, Math.max(lastIndex, 0))] ?? null
  const isLastStep = stepIndex >= lastIndex
  /**
   * The bubble is mounted from the commit AFTER the live step list is read, so
   * anything that needs the element itself (focus) has to wait for this to flip
   * rather than for `isShowing`. A boolean, not `step`, on purpose: pressing Next
   * changes the step but must not yank focus off the Next button.
   */
  const hasBubble = step !== null

  /**
   * Re-anchor on the frame after anything moves. `scroll` is captured because the
   * canvas viewport is the app's scroller, not the window, and a bubble that stays
   * put while its target slides away is pointing at the wrong thing.
   */
  useLayoutEffect(() => {
    if (!step) return

    let frame = 0

    const reposition = () => {
      const bubble = bubbleRef.current
      if (!bubble) return

      const target = document.querySelector(`[data-tour="${step.target}"]`)
      // A target that has gone since the tour opened takes its bubble with it: a
      // pointer aimed at nothing is worse than no pointer at all.
      if (!target) {
        setPosition(null)
        return
      }

      const next = anchorBubble(
        rectOfElement(target),
        { width: bubble.offsetWidth, height: bubble.offsetHeight },
        { width: window.innerWidth, height: window.innerHeight },
        step.placement,
      )
      setPosition((current) => (samePoint(current, next) ? current : next))
    }

    const schedule = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(reposition)
    }

    reposition()
    window.addEventListener('resize', schedule)
    window.addEventListener('scroll', schedule, true)

    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', schedule)
      window.removeEventListener('scroll', schedule, true)
    }
  }, [step])

  /** Escape is the third way out, and it writes the flag like the other two. */
  useEffect(() => {
    if (!isShowing) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== ESCAPE_KEY) return
      closeTour()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isShowing, closeTour])

  /**
   * Focus moves ONLY when a click asked for the tour. On a first visit the client
   * is looking at the palette, and yanking focus out of the page they are about to
   * use is precisely the modal behaviour this feature refuses.
   *
   * IT ALSO HAS TO WAIT FOR THE BUBBLE TO BE ANCHORED. The bubble renders
   * `visibility: hidden` until `position` is measured, and `.focus()` on a
   * visibility-hidden element is a no-op in every real engine — so keying this on
   * `hasBubble` alone left a client who clicked "Show me around" several Tab stops
   * from Skip, in chromium, firefox AND webkit (T-1, 2026-07-29). jsdom does not
   * implement the visibility rule, which is why only the browsers could find it.
   *
   * Both gates stay BOOLEAN: `position` itself changes on every Next and on every
   * re-anchor, and depending on it would yank focus off the Next button mid-tour.
   */
  const isAnchored = position !== null

  useEffect(() => {
    if (!isShowing || !shouldFocus || !hasBubble || !isAnchored) return
    bubbleRef.current?.focus()
  }, [isShowing, shouldFocus, openCount, hasBubble, isAnchored])

  if (!isShowing || !step) return null

  const stepNumber = Math.min(stepIndex, lastIndex) + 1
  const counter = `Step ${String(stepNumber)} of ${String(steps.length)}`

  return (
    <div className="onboarding-tour" data-testid="onboarding-tour" aria-live="polite">
      <div
        className="onboarding-tour__bubble"
        data-testid="tour-bubble"
        data-tour-target={step.target}
        data-tour-step={stepNumber}
        data-tour-count={steps.length}
        role="note"
        aria-label={`Getting started, ${counter.toLowerCase()}`}
        tabIndex={-1}
        ref={bubbleRef}
        style={{
          left: `${String(position?.left ?? 0)}px`,
          top: `${String(position?.top ?? 0)}px`,
          visibility: position ? 'visible' : 'hidden',
        }}
      >
        <p className="onboarding-tour__counter">{counter}</p>
        <p className="onboarding-tour__title">{step.title}</p>
        <p className="onboarding-tour__body">{step.body}</p>
        <div className="onboarding-tour__actions">
          <button
            type="button"
            className="onboarding-tour__skip"
            data-testid="tour-skip"
            onClick={closeTour}
          >
            {SKIP_LABEL}
          </button>
          <button
            type="button"
            className="onboarding-tour__next"
            data-testid={isLastStep ? 'tour-done' : 'tour-next'}
            onClick={isLastStep ? closeTour : nextStep}
          >
            {isLastStep ? DONE_LABEL : NEXT_LABEL}
          </button>
        </div>
      </div>
    </div>
  )
}
