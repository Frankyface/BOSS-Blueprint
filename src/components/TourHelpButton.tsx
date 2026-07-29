import { useTourStore } from '../store/tourStore.ts'

import './OnboardingTour.css'

const HELP_LABEL = 'Show me around'

/**
 * THE WAY BACK IN. Permanent, in the header, next to the other whole-design
 * controls — visible on every page of the sketch and during Submit, because the
 * moment a client wants the pointers again is exactly the moment they have lost
 * the thread.
 *
 * It re-opens from pointer 1 and never clears the "seen" flag: asking for help once
 * must not sign a client up for the tour on every future visit.
 */
export function TourHelpButton() {
  const openFromHelp = useTourStore((state) => state.openFromHelp)

  return (
    <button type="button" className="tour-help" data-testid="tour-help" onClick={openFromHelp}>
      <span className="tour-help__mark" aria-hidden="true">
        ?
      </span>
      {HELP_LABEL}
    </button>
  )
}
