/**
 * Build-time constants injected by Vite's `define` (see `vite.config.ts`).
 *
 * `__APP_VERSION__` is `package.json`'s `version`, folded in at build time so
 * `submission.appVersion` and the brief's header comment name the build that
 * produced them rather than a string somebody has to remember to bump twice.
 */
declare const __APP_VERSION__: string
