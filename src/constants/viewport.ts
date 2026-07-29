/**
 * WHERE THE APP STOPS BEING A PLACE TO LAY OUT A WEBSITE.
 *
 * One exported string, matched with `window.matchMedia` — not a resize handler and
 * never a user-agent sniff. The desktop guard renders from it, the small-viewport
 * layout keys off the attribute it sets, and the onboarding tour stands down while
 * it matches. Three behaviours, one line, so they can never disagree.
 *
 * 1024px is the decision line, measured rather than rounded: at 1024x768 the UX
 * audit found "Delete page" and "Start over" clipped under the details panel and
 * the canvas fit-to-window scale under half. The coarse-pointer clause catches
 * tablets in the 1024-1279 band, where the width is survivable but the 8-handle
 * resize and the pen are not.
 *
 * EXACTLY 1024px MUST NOT MATCH — asserted from both sides in
 * `e2e/desktop-guard.spec.ts`, which duplicates this literal because the E2E suite
 * compiles under tsconfig.e2e.json and cannot import from `src/`. Change one, change
 * the other.
 */
export const SMALL_VIEWPORT_QUERY = '(max-width: 1023px), (pointer: coarse) and (max-width: 1279px)'
