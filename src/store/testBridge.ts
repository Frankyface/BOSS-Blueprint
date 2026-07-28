import { useCanvasStore } from './canvasStore.ts'

/**
 * Window-exposed store seam, mandated by the canvas-engine decision (debate #1):
 * Playwright asserts on document JSON as well as on the DOM, and seeds the 30-block
 * perf probe through it.
 *
 * The guard is written inline so the bundler can fold it: in a real production build
 * both `import.meta.env` reads are replaced with constants, the branch becomes
 * unreachable and the whole body (key included) is dropped. It survives only in
 * `vite dev` and in the `--mode test` production build (`npm run build:e2e`).
 */
export function installStoreTestBridge(): void {
  if (!(import.meta.env.DEV || import.meta.env.MODE === 'test')) return
  if (typeof window === 'undefined') return

  Reflect.set(window, '__blueprintStore', useCanvasStore)
}
