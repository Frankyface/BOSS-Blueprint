import { SubmitButton } from './submit/SubmitButton.tsx'

import { BossMark } from './BossMark.tsx'
import { DesignFileControls } from './DesignFileControls.tsx'
import { TourHelpButton } from './TourHelpButton.tsx'

import './AppHeader.css'

const APP_NAME = 'BOSS Blueprint'
const APP_TAGLINE = 'Sketch your site, page by page'

/**
 * Dark BOSS-branded bar across the top of the editor.
 *
 * The mark is the SAME two paths as the favicon and the social card
 * (`BossMark`), so the tab, the bar and a pasted link agree. It replaced a
 * CSS-styled letter "B", which was a stand-in that looked like the logo only if
 * you already knew what the logo was.
 */
export function AppHeader() {
  return (
    <header className="app-header" data-testid="app-header">
      <BossMark className="app-header__mark" />
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
