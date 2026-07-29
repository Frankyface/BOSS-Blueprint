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
 * `src/export/png/engineOrder.ts` and `src/store/testBridge.ts` use. Note the
 * shape: EVERYTHING stub-related — the query key, the fake error, both fake
 * relays — lives inside `stubOverrides`, below the guard, so a production build
 * folds the whole body away rather than leaving the branches reachable from
 * outside. (Measured: hoisting the fakes to module scope left `submit-stub`,
 * `render-fail` and both stub relays in `npm run build`'s bundle.)
 *
 * The seam exists because two success criteria — the renderer-failure path, and
 * "a failing relay changes nothing the client sees" — cannot be proven in a real
 * browser any other way.
 */

import { BOSS_RELAY } from '../../site.config.ts'
import { createConfiguredRelay } from '../export/delivery/formRelay.ts'
import type { RelayConfig } from '../export/delivery/relayConfig.ts'
import type { DeliveryRelay } from '../export/delivery/relay.ts'
import { renderPagePng, RENDER_HICCUP_MESSAGE } from '../export/png/index.ts'
import type { PageRenderBytes } from '../export/zip/buildPackage.ts'
import { APP_LADDER_PORTS } from '../export/zip/ladder.ts'
import { downloadBlob } from '../platform/downloadFile.ts'
import { getCanvasDocument } from '../store/canvasStore.ts'

import { BROWSER_CLOCK } from './submission.ts'
import type { SubmitPorts, SubmitProgress } from './types.ts'

const ZIP_MIME = 'application/zip'

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

/** Ports the E2E may replace. Empty in every production build, by construction. */
interface StubOverrides {
  readonly renderPage?: SubmitPorts['renderPage']
  readonly relay?: DeliveryRelay
  /**
   * A relay CONFIG rather than a relay, so the live-relay E2E exercises the whole
   * production path — config validation, adapter construction, the degrade ladder,
   * fetch, status mapping — instead of a fake that proves only itself.
   */
  readonly relayConfig?: RelayConfig
}

function stubOverrides(search?: string): StubOverrides {
  if (!(import.meta.env.DEV || import.meta.env.MODE === 'test')) return {}
  if (typeof window === 'undefined') return {}

  const requested = new URLSearchParams(search ?? window.location.search).get('submit-stub')

  if (requested === 'relay-live') {
    return {
      /*
       * SAME ORIGIN, so `page.route` intercepts it with no CORS and no preflight
       * (Playwright does not reliably intercept preflight OPTIONS). `http:` to
       * localhost is exactly the case `relayConfig.ts` permits, and nothing
       * outside this folded-away branch ever names this path.
       */
      relayConfig: {
        endpoint: `${window.location.origin}${import.meta.env.BASE_URL}__relay-e2e`,
        credential: 'e2e-not-a-real-key',
      },
    }
  }
  if (requested === 'render-fail') {
    return {
      renderPage: () =>
        Promise.reject(
          // The renderer's own typed shape — `submitFlow` recognises it structurally.
          Object.assign(new Error('V6: stubbed render failure'), {
            name: 'PngRenderError',
            finding: 'V6',
            clientMessage: RENDER_HICCUP_MESSAGE,
          }),
        ),
    }
  }
  if (requested === 'relay-fail') {
    return {
      relay: { id: 'stub-failing', send: () => Promise.reject(new Error('stubbed relay failure')) },
    }
  }
  if (requested === 'relay-sent') {
    return { relay: { id: 'stub-sent', send: () => Promise.resolve({ status: 'sent' as const }) } }
  }
  return {}
}

export interface AppPortOptions {
  readonly onProgress: (progress: SubmitProgress) => void
  readonly log: SubmitPorts['log']
}

export function createAppSubmitPorts(options: AppPortOptions): SubmitPorts {
  const overrides = stubOverrides()

  return {
    clock: BROWSER_CLOCK,
    renderPage: overrides.renderPage ?? renderRealPage,
    download: (fileName, bytes) => {
      // A fresh copy of the buffer: the receipt keeps the original so "download
      // it again" can re-issue the very same package rather than regenerate one.
      downloadBlob(fileName, new Blob([bytes.slice()], { type: ZIP_MIME }))
    },
    /*
     * WITH `BOSS_RELAY` EMPTY — how it ships — `createConfiguredRelay` returns
     * the very same `createNoopRelay({ log })` this line used to construct
     * directly. Nothing about submit changes until Cam pastes an endpoint in.
     */
    relay:
      overrides.relay ??
      createConfiguredRelay(overrides.relayConfig ?? BOSS_RELAY, {
        fetch: (input, init) => fetch(input, init),
        log: options.log,
      }),
    ladder: APP_LADDER_PORTS,
    onProgress: options.onProgress,
    log: options.log,
  }
}

/** "Download it again" — the retained bytes, never a regenerated package. */
export function downloadAgain(fileName: string, bytes: Uint8Array): void {
  downloadBlob(fileName, new Blob([bytes.slice()], { type: ZIP_MIME }))
}
