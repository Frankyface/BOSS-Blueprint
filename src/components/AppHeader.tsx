import { DesignFileControls } from './DesignFileControls.tsx'

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
      {/* Whole-design actions, deliberately away from the per-block toolbar. */}
      <DesignFileControls />
    </header>
  )
}
