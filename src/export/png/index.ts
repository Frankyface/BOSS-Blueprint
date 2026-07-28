/**
 * The page PNG renderer's public surface. Stage 3's packager, validator and
 * submit flow import from here and never reach past it — in particular they
 * never name a capture engine (§4.3, debate #1).
 */

export { renderPagePng, exportHeightForPage } from './renderPagePng.ts'
export { PngRenderError, RENDER_HICCUP_MESSAGE } from './types.ts'
export type {
  PageRenderResult,
  PngEngineId,
  PngRenderFailure,
  RenderAttemptRecord,
} from './types.ts'
export { MAX_SAFE_RENDER_HEIGHT_PX, MIN_INK_RATIO, PNG_MIME } from './constants.ts'
