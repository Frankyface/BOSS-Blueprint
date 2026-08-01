/**
 * Deployment-shape constants shared by the Vite build and the Playwright E2E run.
 * Kept in one place so the served base path can never drift between them.
 */

/**
 * TYPE ONLY — erased by `verbatimModuleSyntax`, so this file stays runtime-free.
 * That matters: `vite.config.ts` imports this module at config time in Node, and
 * a real import here would drag the export pipeline into the build config.
 */
import type { RelayConfig } from './src/export/delivery/relayConfig.ts'

/**
 * THE PATH THE APP IS SERVED FROM — root, because it lives on its own domain.
 *
 * `sketch.bossolutions.pro` is a GitHub Pages CUSTOM DOMAIN (`public/CNAME`), and a
 * custom domain serves the site at `/`, not at `/<repo-name>/`. While this was the
 * `frankyface.github.io/BOSS-Blueprint/` project site it had to be `/BOSS-Blueprint/`;
 * leaving it that way after the domain landed asked the browser for
 * `/BOSS-Blueprint/assets/…` on a host that only has `/assets/…`, which is a 404 for
 * every script and stylesheet and a white screen with nothing in the console to
 * explain it.
 *
 * Vite bakes this into every asset URL in the built `index.html`, so it is not a
 * runtime setting: changing it means a rebuild and a redeploy.
 */
export const BASE_PATH = '/'

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

/**
 * Full URL of the previewed production build, including the served base path.
 * Derived, not written out, so the E2E run always visits the build's real root.
 */
export const PREVIEW_BASE_URL = `http://${PREVIEW_HOST}:${PREVIEW_PORT}${BASE_PATH}`

/**
 * WHERE THE APP ACTUALLY LIVES — the address handed to clients, and the round
 * trip's `deployed` target.
 *
 * A custom domain on GitHub Pages (`public/CNAME`, DNS + Let's Encrypt cert done
 * 2026-07-31). The old project-site address, `frankyface.github.io/BOSS-Blueprint/`,
 * now redirects here and is no longer a working target for anything.
 *
 * ENDS WITH `BASE_PATH` BY CONSTRUCTION, not by care. It used to be written out in
 * full, and the invariant lived in this comment — which is precisely how the white
 * screen of 2026-07-31 happened: the domain moved, `BASE_PATH` did not, and every
 * asset 404'd behind a valid certificate and a 200. Deriving it means the two can no
 * longer disagree, and `DEPLOYED_ORIGIN` is now the only thing an address change
 * touches. Every absolute URL in the head is built from this
 * (`src/meta/headTags.ts`, asserted by `headTags.test.ts` and `launch-polish.spec.ts`).
 *
 * `preview` is the hermetic, CI-able regression target; `deployed` runs once for the
 * ship gate because the Stage 4 DoD says "the REAL deployed UI"
 * (`docs/roundtrip-protocol.md` §10.1). The harness asserts the deployed bundle IS the
 * commit under test before it spends a builder budget on it
 * (`feature-roundtrip-harness.md` R3.6) — a stale Pages deploy would otherwise produce
 * a spectacular, meaningless FAIL.
 */
export const DEPLOYED_ORIGIN = 'https://sketch.bossolutions.pro'
export const DEPLOYED_BASE_URL = `${DEPLOYED_ORIGIN}${BASE_PATH}`

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

/**
 * THE NOTIFICATION RELAY — OFF, and shipped off on purpose.
 *
 * Delivery is download-first (`docs/decisions.md` 2026-07-27 debate #2): the zip
 * reaches the client's disk before anything here runs, and the client emails it
 * to `BOSS_SUBMIT_EMAIL` themselves. This relay is a kilobyte-scale TEXT
 * notification to Cam on top of that — "a package exists, here is who made it" —
 * and the product is fully functional without it.
 *
 * WHILE `endpoint` AND `credential` ARE BOTH EMPTY, NOTHING CHANGES: the app
 * binds the same no-op stub Stage 3 shipped, makes no request, and the completion
 * screen says nothing about a notification. That is asserted, in three browser
 * engines, by `e2e/notification-relay.spec.ts`.
 *
 * TO TURN IT ON (`help.md` carries the same steps in Cam's words):
 *   1. create a free account with any text-only form relay — Web3Forms,
 *      FormSubmit (ajax), Formspree, EmailJS — and point it at the inbox you want;
 *   2. paste its POST endpoint into `endpoint` and its public key into
 *      `credential`;
 *   3. if that provider names its fields differently, add `fields`; if it demands
 *      extra constants (EmailJS wants `service_id` and `template_id`), add
 *      `staticFields`; if it nests the human fields under one key (EmailJS's
 *      `template_params`), set `nestFieldsUnder` to that key.
 *   4. `npm run build`, push, submit once, check the inbox.
 *
 * The key is a PUBLIC FORM KEY — its only power is "submit to this one form",
 * which is why this class of provider works from a static page at all. It will be
 * visible in this public repo and in the shipped bundle. That is the model, not a
 * leak; it does mean somebody could use it to send you form spam, so lean on the
 * provider's rate limit and rotate the key if that ever happens.
 *
 * A typo cannot break submit: a config that is touched but unusable falls back to
 * the same no-op stub and logs why (`src/export/delivery/formRelay.ts`).
 */
export const BOSS_RELAY: RelayConfig = {
  endpoint: '',
  credential: '',
}
