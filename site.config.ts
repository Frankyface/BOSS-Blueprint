/**
 * Deployment-shape constants shared by the Vite build and the Playwright E2E run.
 * Kept in one place so the GitHub Pages base path can never drift between them.
 */

/** GitHub Pages project sites are served from `/<repo-name>/`. */
export const BASE_PATH = '/BOSS-Blueprint/'

/** Port used by `vite preview` (the production build the E2E suite runs against). */
export const PREVIEW_PORT = 4173

/** Port used by `vite dev`. */
export const DEV_PORT = 5173

/** Full URL of the previewed production build, including the Pages base path. */
export const PREVIEW_BASE_URL = `http://localhost:${PREVIEW_PORT}${BASE_PATH}`
