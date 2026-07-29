import { getCanvasDocument } from '../../store/canvasStore.ts'

import { renderPagePng } from './renderPagePng.ts'
import { PngRenderError } from './types.ts'

/**
 * Window-exposed render seam for Playwright, alongside the store seam in
 * `src/store/testBridge.ts` and folded away by the same inline `import.meta.env`
 * guard: in a production build both reads become constants, the branch is
 * unreachable and the whole body drops out. It survives only in `vite dev` and
 * in `npm run build:e2e`.
 *
 * The E2E suite has to reach the renderer directly because the submit flow that
 * will eventually call it is a later Stage 3 feature. The bridge hands back the
 * PNG as base64 so the spec can parse the IHDR and diff the artifact in Node —
 * testing the bytes that would be zipped, not a screenshot of the editor.
 */

/** Below the argument-count limit of every engine's `String.fromCharCode`. */
const BASE64_CHUNK = 0x8000

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + BASE64_CHUNK))
  }
  return btoa(binary)
}

export interface BridgeRenderSuccess {
  readonly ok: true
  readonly width: number
  readonly height: number
  readonly engine: string
  readonly attempts: number
  readonly inkRatio: number
  readonly hasStrokes: boolean
  readonly bytes: number
  readonly base64: string
  readonly elapsedMs: number
}

export interface BridgeRenderFailure {
  readonly ok: false
  readonly finding: string
  readonly failure: string
  readonly clientMessage: string
  readonly message: string
}

export type BridgeRenderOutcome = BridgeRenderSuccess | BridgeRenderFailure

async function renderForTest(pageId: string): Promise<BridgeRenderOutcome> {
  const startedAt = performance.now()

  try {
    const result = await renderPagePng(getCanvasDocument(), pageId)
    const bytes = new Uint8Array(await result.blob.arrayBuffer())

    return {
      ok: true,
      width: result.width,
      height: result.height,
      engine: result.engine,
      attempts: result.attempts,
      inkRatio: result.inkRatio,
      hasStrokes: result.hasStrokes,
      bytes: bytes.length,
      base64: toBase64(bytes),
      elapsedMs: performance.now() - startedAt,
    }
  } catch (error) {
    if (error instanceof PngRenderError) {
      return {
        ok: false,
        finding: error.finding,
        failure: error.failure,
        clientMessage: error.clientMessage,
        message: error.message,
      }
    }

    return {
      ok: false,
      finding: 'none',
      failure: 'capture',
      clientMessage: '',
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

export function installPngExportTestBridge(): void {
  if (!(import.meta.env.DEV || import.meta.env.MODE === 'test')) return
  if (typeof window === 'undefined') return

  Reflect.set(window, '__blueprintRenderPagePng', renderForTest)
}
