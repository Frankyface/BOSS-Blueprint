import { BOSS_SITE_URL } from '../../site.config.ts'

import './AppFooter.css'

const BUILT_BY = 'Built by BOSS'
const ARROW = '→'
const BOSS_DOMAIN = 'bossolutions.pro'

/**
 * THE ONE PIECE OF BOSS ON EVERY SCREEN — and the reason this tool exists as
 * lead capture rather than as a toy.
 *
 * It lives in the app SHELL, strictly outside the 1200px page element the PNG
 * renderer captures (`src/export/png/exportRoot.tsx` mounts its own root and
 * never sees this component). That separation is deliberate: a BOSS footer
 * inside a rendered page would arrive in the package as though the client had
 * drawn it, and the builder would faithfully reproduce it on their site.
 *
 * The arrow is decoration, so it is hidden from the accessible name — a link
 * announced as "Built by BOSS right arrow bossolutions.pro" is worse than one
 * announced as "Built by BOSS bossolutions.pro".
 */
export function AppFooter() {
  return (
    <footer className="app-footer" data-testid="app-footer">
      <a
        className="app-footer__link"
        data-testid="app-footer-link"
        href={BOSS_SITE_URL}
        target="_blank"
        rel="noopener noreferrer"
      >
        {BUILT_BY}{' '}
        <span className="app-footer__arrow" aria-hidden="true">
          {ARROW}
        </span>{' '}
        <span className="app-footer__domain">{BOSS_DOMAIN}</span>
      </a>
    </footer>
  )
}
