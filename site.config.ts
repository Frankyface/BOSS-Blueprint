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

/**
 * The live GitHub Pages deploy — the round trip's `deployed` target.
 *
 * `preview` is the hermetic, CI-able regression target; `deployed` runs once for the
 * ship gate because the Stage 4 DoD says "the REAL deployed UI"
 * (`docs/roundtrip-protocol.md` §10.1). The harness asserts the deployed bundle IS the
 * commit under test before it spends a builder budget on it
 * (`feature-roundtrip-harness.md` R3.6) — a stale Pages deploy would otherwise produce
 * a spectacular, meaningless FAIL.
 */
export const DEPLOYED_BASE_URL = `https://frankyface.github.io${BASE_PATH}`

/**
 * The BOSS site the footer sends people to.
 *
 * Beside the deployment constants rather than inline in the footer component
 * because it is the other half of the same question `DEPLOYED_BASE_URL` answers:
 * where this app lives, and where the business that made it lives. `help.md`
 * carries Cam's open item to add the return link ("Sketch your site") there.
 */
export const BOSS_SITE_URL = 'https://bossolutions.pro'

/**
 * WHERE A FINISHED PACKAGE GOES.
 *
 * Download-first delivery (`docs/decisions.md` 2026-07-27 debate #2) makes this a
 * PUBLIC BUSINESS ADDRESS, not a secret: the client's own mail client sends to it
 * and the completion screen shows it as copyable text. It lives here beside the
 * other deployment constants rather than inline in a component so there is one
 * place to change it (`feature-submit-gate.md` open question).
 *
 * The value is the address `help.md` names as the working destination today. Cam
 * has an open item there to confirm it or swap in a BOSS mailbox — a one-line
 * change with no code around it.
 */
export const BOSS_SUBMIT_EMAIL = 'cammer3034@gmail.com'
