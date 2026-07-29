/**
 * WIRING THE SUBMIT PIPELINE TO THE REAL BROWSER.
 *
 * `submitFlow.ts` is pure over ports; this is the one file that names a renderer,
 * a download and a relay. Keeping the binding here is what lets the flow's unit
 * test run in milliseconds and lets the E2E swap one port without touching the
 * others.
 *
 * THE STUB SEAM FOLDS AWAY. `?submit-stub=…` is honoured by `vite dev` and the
 * `--mode test` build only — the same inline `import.meta.env` guard
 * `src/export/png/engineOrder.ts` and `src/store/testBridge.ts` use, so in a
 * production build the reads become constants, the branch is unreachable and the
 * stubs drop out of the bundle entirely. It exists because two success criteria
 * (the renderer-failure path, and "a failing relay changes nothing") cannot be
 * proven in a browser any other way.
 */

import { createNoopRelay, type DeliveryRelay } from '../export/delivery/relay.ts'
import { renderPagePng } from '../export/png/index.ts'
import type { PageRenderBytes } from '../export/zip/buildPackage.ts'
import { APP_LADDER_PORTS } from '../export/zip/ladder.ts'
import { downloadBlob } from '../platform/downloadFile.ts'
import { getCanvasDocument } from '../store/canvasStore.ts'

import { BROWSER_CLOCK } from './submission.ts'
import type { SubmitPorts, SubmitProgress } from './types.ts'

const ZIP_MIME = 'application/zip'

const STUB_QUERY_KEY = 'submit-stub'

/** What the E2E can ask for, and nothing else. */
type StubMode = 'render-fail' | 'relay-fail' | 'relay-sent'

const STUB_MODES: readonly string[] = ['render-fail', 'relay-fail', 'relay-sent']

function requestedStub(search?: string): StubMode | null {
  if (!(import.meta.env.DEV || import.meta.env.MODE === 'test')) return null
  if (typeof window === 'undefined') return null

  const requested = new URLSearchParams(search ?? window.location.search).get(STUB_QUERY_KEY)
  return requested !== null && STUB_MODES.includes(requested) ? (requested as StubMode) : null
}

/** The renderer's own typed shape — `submitFlow` recognises it structurally. */
class StubbedRenderError extends Error {
  readonly finding = 'V6'
  readonly clientMessage =
    'We hit a hiccup turning your page into a picture. Please try submitting again.'

  constructor() {
    super('V6: stubbed render failure (?submit-stub=render-fail)')
    this.name = 'PngRenderError'
  }
}

async function renderRealPage(pageId: string): Promise<PageRenderBytes> {
  const result = await renderPagePng(getCanvasDocument(), pageId)
  return {
    bytes: new Uint8Array(await result.blob.arrayBuffer()),
    width: result.width,
    height: result.height,
    nonBlank: result.inkRatio > 0,
    hasStrokes: result.hasStrokes,
  }
}

function relayFor(stub: StubMode | null, log: SubmitPorts['log']): DeliveryRelay {
  if (stub === 'relay-fail') {
    return {
      id: 'stub-failing',
      send: () => Promise.reject(new Error('stubbed relay failure (?submit-stub=relay-fail)')),
    }
  }
  if (stub === 'relay-sent') {
    return { id: 'stub-sent', send: () => Promise.resolve({ status: 'sent' as const }) }
  }
  return createNoopRelay({ log: (message, payload) => { log(message, payload) } })
}

export interface AppPortOptions {
  readonly onProgress: (progress: SubmitProgress) => void
  readonly log: SubmitPorts['log']
}

export function createAppSubmitPorts(options: AppPortOptions): SubmitPorts {
  const stub = requestedStub()

  return {
    clock: BROWSER_CLOCK,
    renderPage: stub === 'render-fail' ? () => Promise.reject(new StubbedRenderError()) : renderRealPage,
    download: (fileName, bytes) => {
      // A fresh copy of the buffer: the receipt keeps the original so "download
      // it again" can re-issue the very same package rather than regenerate one.
      downloadBlob(fileName, new Blob([bytes.slice()], { type: ZIP_MIME }))
    },
    relay: relayFor(stub, options.log),
    ladder: APP_LADDER_PORTS,
    onProgress: options.onProgress,
    log: options.log,
  }
}

/** "Download it again" — the retained bytes, never a regenerated package. */
export function downloadAgain(fileName: string, bytes: Uint8Array): void {
  downloadBlob(fileName, new Blob([bytes.slice()], { type: ZIP_MIME }))
}
