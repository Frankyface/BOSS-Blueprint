import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

import { BASE_PATH, DEV_PORT, PREVIEW_HOST, PREVIEW_PORT } from './site.config.ts'

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
  plugins: [react()],
  server: { port: DEV_PORT, strictPort: true },
  preview: { host: PREVIEW_HOST, port: PREVIEW_PORT, strictPort: true },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
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
        // Committed PNG bytes, not code.
        'src/export/png/fixtures/**',
      ],
      thresholds: {
        'src/canvas/**': { lines: COVERAGE_MINIMUM, functions: COVERAGE_MINIMUM },
        'src/store/**': { lines: COVERAGE_MINIMUM, functions: COVERAGE_MINIMUM },
      },
    },
  },
})
