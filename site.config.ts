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

/**
 * Pinned to IPv4 on purpose. `localhost` is dual-stack: Node may bind the preview
 * server to ::1 only while a browser resolves to 127.0.0.1, which surfaced as
 * intermittent NS_ERROR_CONNECTION_REFUSED in the Firefox E2E run. Both sides now
 * agree on one address.
 */
export const PREVIEW_HOST = '127.0.0.1'

/** Full URL of the previewed production build, including the Pages base path. */
export const PREVIEW_BASE_URL = `http://${PREVIEW_HOST}:${PREVIEW_PORT}${BASE_PATH}`
