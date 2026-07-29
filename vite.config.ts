import { createRequire } from 'node:module'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

import { BASE_PATH, DEV_PORT, PREVIEW_HOST, PREVIEW_PORT } from './site.config.ts'

/**
 * The app's version, read from `package.json` at config time and folded into the
 * bundle as `__APP_VERSION__`. `submission.appVersion` and the brief's header
 * comment both come from it, so the package always names the build that made it
 * (`feature-submit-gate.md` open question) instead of a hand-maintained literal
 * that would drift the first time someone forgot to bump it.
 */
const { version: APP_VERSION } = createRequire(import.meta.url)('./package.json') as {
  version: string
}

/**
 * Coverage thresholds are per-glob on purpose. The logic layers — the pure canvas
 * maths, the document store, the history stack, the .blueprint serialiser and the
 * storage adapter — carry the correctness of the product and are held to 80% lines
 * and functions. UI components are still measured and still show up in the report,
 * but their behaviour is proven by the cross-browser Playwright suite rather than by
 * jsdom line counts, so they are not gated here yet.
 *
 * `src/platform/**` is ungated for the same reason, and it is worth naming: it holds
 * the thin adapters over browser APIs that jsdom does not implement at all
 * (`browserImagePorts.ts` is `<img>` + `<canvas>`). The DECISIONS those adapters
 * serve live in `src/canvas/imageCompression.ts`, which takes them as ports and is
 * gated; the adapters themselves are proven by `e2e/image-upload.spec.ts` against
 * real photos in all three engines. Logic that could be tested here must not be
 * hidden there — an adapter that starts making choices belongs back in `src/canvas`.
 */
const COVERAGE_MINIMUM = 80

// https://vite.dev/config/
export default defineConfig({
  base: BASE_PATH,
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
  plugins: [react()],
  server: { port: DEV_PORT, strictPort: true },
  preview: { host: PREVIEW_HOST, port: PREVIEW_PORT, strictPort: true },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    /**
     * The round-trip harness's own rules are covered by `npm test`
     * (`feature-roundtrip-harness.md`, Deliverables). A gate whose rules are only
     * exercised when the gate runs is a gate nobody notices breaking — and R10.1's
     * threshold pins, R5's scan rules and R2.2's driver-purity grep all live there.
     */
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.mjs'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/main.tsx',
        'src/test/**',
        // Dev/E2E-only seams: folded out of the production bundle entirely.
        'src/store/testBridge.ts',
        'src/export/png/pngTestBridge.ts',
        // The submit pipeline's browser adapter — the one file that names a
        // renderer, a download and a relay. Same rule as `src/platform/**`: the
        // DECISIONS live in `src/submit/submitFlow.ts` (gated below) and this
        // holds only the wiring, proven by `e2e/submit.spec.ts` in three engines.
        'src/submit/appPorts.ts',
        // Committed PNG bytes, not code.
        'src/export/png/fixtures/**',
      ],
      thresholds: {
        'src/canvas/**': { lines: COVERAGE_MINIMUM, functions: COVERAGE_MINIMUM },
        'src/store/**': { lines: COVERAGE_MINIMUM, functions: COVERAGE_MINIMUM },
        // `src/hooks/**` joined the gate with the UX-hardening batch. These are
        // logic, not markup — the committed-field protocol (one store write per
        // edit, and what a refused commit does), the canvas keyboard, and the
        // fit-to-window maths — and `useCommittedField` had sat at 29.62% of
        // statements while carrying the rule every text field in the app depends
        // on (review follow-up).
        'src/hooks/**': { lines: COVERAGE_MINIMUM, functions: COVERAGE_MINIMUM },
        // The export module is pure, has no UI to hide behind, and its bugs reach
        // every downstream artifact — same gate as the other logic layers.
        'src/export/**': { lines: COVERAGE_MINIMUM, functions: COVERAGE_MINIMUM },
        // The submit pipeline joins the gate with Stage 3's close: the lead gate,
        // the honeypot rule and the orchestration order are logic, and the one
        // adapter among them is excluded above rather than allowed to dilute it.
        'src/submit/**': { lines: COVERAGE_MINIMUM, functions: COVERAGE_MINIMUM },
      },
    },
  },
})
