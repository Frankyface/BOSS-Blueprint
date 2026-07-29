import { SubmitButton } from './submit/SubmitButton.tsx'

import { DesignFileControls } from './DesignFileControls.tsx'
import { TourHelpButton } from './TourHelpButton.tsx'

import './AppHeader.css'

const APP_NAME = 'BOSS Blueprint'
const APP_TAGLINE = 'Sketch your site, page by page'

/** Dark BOSS-branded bar across the top of the editor. */
export function AppHeader() {
  return (
    <header className="app-header" data-testid="app-header">
      <span className="app-header__mark" aria-hidden="true">
        B
      </span>
      <h1 className="app-header__title">{APP_NAME}</h1>
      <p className="app-header__tagline">{APP_TAGLINE}</p>
      {/* The tour's permanent way back in, before the whole-design actions. */}
      <TourHelpButton />
      {/* Whole-design actions, deliberately away from the per-block toolbar. */}
      <DesignFileControls />
      {/* The ending. Last in the row because it is the last thing you do. */}
      <SubmitButton />
    </header>
  )
}
