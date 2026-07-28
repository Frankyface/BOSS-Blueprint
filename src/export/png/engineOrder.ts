import type { PngEngineId } from './types.ts'

/**
 * WHICH ENGINE GOES FIRST — the one place in the app an engine is named.
 *
 * snapdom is primary and html-to-image is the API-comparable fallback
 * (`docs/decisions.md` 2026-07-27, debate #1). No caller of `renderPagePng` ever
 * sees this list.
 *
 * THE OVERRIDE IS A TEST SEAM AND FOLDS AWAY. `?export-engine=fallback` makes
 * the fallback the primary so Playwright can exercise the fallback path for real
 * rather than with a unit stub — the Stage 3 DoD asks for exactly that. The
 * guard is written inline so the bundler can fold it: in a production build both
 * `import.meta.env` reads become constants, the branch is unreachable and the
 * whole body — query string included — is dropped. It survives only in
 * `vite dev` and in `npm run build:e2e` (`--mode test`), exactly like
 * `src/store/testBridge.ts`.
 */

export const DEFAULT_ENGINE_ORDER: readonly PngEngineId[] = ['snapdom', 'html-to-image']

const FALLBACK_FIRST_ORDER: readonly PngEngineId[] = ['html-to-image', 'snapdom']

const ENGINE_QUERY_KEY = 'export-engine'

/** Values that mean "run the fallback engine first". */
const FALLBACK_ALIASES = new Set(['fallback', 'html-to-image'])

export function resolveEngineOrder(search?: string): readonly PngEngineId[] {
  if (!(import.meta.env.DEV || import.meta.env.MODE === 'test')) return DEFAULT_ENGINE_ORDER
  if (typeof window === 'undefined') return DEFAULT_ENGINE_ORDER

  const requested = new URLSearchParams(search ?? window.location.search).get(ENGINE_QUERY_KEY)
  if (requested !== null && FALLBACK_ALIASES.has(requested)) return FALLBACK_FIRST_ORDER

  return DEFAULT_ENGINE_ORDER
}
