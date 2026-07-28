import { MAX_RENDER_ATTEMPTS } from './constants.ts'
import { checkPngSanity, checkRenderableHeight } from './sanity.ts'
import type {
  InspectedPng,
  PageRenderResult,
  PngDimensions,
  PngEngineId,
  RenderAttemptRecord,
} from './types.ts'
import { PngRenderError, RENDER_HICCUP_MESSAGE } from './types.ts'

/**
 * THE LADDER: primary → primary retry → fallback engine → V6 BLOCK.
 *
 * The binding mitigation from debate #1, written as one function over injected
 * ports so every rung is unit-testable without a browser. The browser half —
 * mounting, `document.fonts.ready`, the two capture libraries, decoding and
 * sampling — lives behind `RenderLadderPorts` in
 * `src/platform/browserPngPorts.ts`.
 *
 * `settle()` runs before EVERY attempt, not just the retry: text rendered with a
 * fallback font is the most likely SILENT corruption there is — it passes both
 * the dimension check and the variance check while showing the client something
 * they never saw. Making the wait unconditional costs one frame and removes the
 * whole class from attempt one.
 */

export interface MountedRoot {
  readonly node: HTMLElement
  readonly dispose: () => void
}

export interface RenderLadderPorts {
  /** Mounts the export root offscreen. Called once; disposed in `finally`. */
  readonly mount: () => MountedRoot
  /** Awaits `document.fonts.ready` and a paint. */
  readonly settle: () => Promise<void>
  readonly capture: (engine: PngEngineId, node: HTMLElement, expected: PngDimensions) => Promise<Blob>
  /** Decodes, reads the IHDR bytes, and samples the pixels. */
  readonly inspect: (blob: Blob) => Promise<InspectedPng>
}

export interface RenderLadderPlan {
  readonly pageId: string
  readonly expected: PngDimensions
  /** True when the page has ≥ 1 block, which is when the ink floor applies. */
  readonly requiresInk: boolean
  /** Carried straight through to the result for the zip's compression ladder. */
  readonly hasStrokes: boolean
  /** `[primary, fallback]`. Order is the only place an engine is chosen. */
  readonly engines: readonly PngEngineId[]
}

/**
 * `[primary, primary, fallback]` — the retry is the same engine on purpose. Most
 * blank captures are a timing accident (fonts, an unpainted frame), not a broken
 * engine, and re-running the primary after a settle fixes those without paying
 * the fallback's different rendering.
 */
export function buildAttemptPlan(engines: readonly PngEngineId[]): readonly PngEngineId[] {
  const primary = engines[0]
  if (!primary) throw new Error('The render ladder needs at least one engine.')

  const fallback = engines[1] ?? primary
  const plan = [primary, primary, fallback]

  return plan.slice(0, MAX_RENDER_ATTEMPTS)
}

function detailOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function runRenderLadder(
  plan: RenderLadderPlan,
  ports: RenderLadderPorts,
): Promise<PageRenderResult> {
  const geometry = checkRenderableHeight(plan.expected.height)
  if (!geometry.ok) {
    throw new PngRenderError(
      plan.pageId,
      'geometry',
      [{ engine: plan.engines[0] ?? 'snapdom', failure: 'geometry', detail: geometry.detail }],
      RENDER_HICCUP_MESSAGE,
    )
  }

  const attemptPlan = buildAttemptPlan(plan.engines)
  const failures: RenderAttemptRecord[] = []
  const mounted = ports.mount()

  try {
    for (const [index, engine] of attemptPlan.entries()) {
      await ports.settle()

      let blob: Blob
      try {
        blob = await ports.capture(engine, mounted.node, plan.expected)
      } catch (error) {
        failures.push({ engine, failure: 'capture', detail: detailOf(error) })
        continue
      }

      let inspected: InspectedPng
      try {
        inspected = await ports.inspect(blob)
      } catch (error) {
        failures.push({ engine, failure: 'capture', detail: detailOf(error) })
        continue
      }

      const verdict = checkPngSanity({
        inspected,
        expected: plan.expected,
        requiresInk: plan.requiresInk,
      })

      if (verdict.ok) {
        return {
          blob,
          width: inspected.decoded.width,
          height: inspected.decoded.height,
          engine,
          attempts: index + 1,
          inkRatio: inspected.ink.inkRatio,
          hasStrokes: plan.hasStrokes,
        }
      }

      failures.push({ engine, failure: verdict.failure ?? 'blank', detail: verdict.detail })
    }
  } finally {
    mounted.dispose()
  }

  const last = failures.at(-1)
  throw new PngRenderError(plan.pageId, last?.failure ?? 'capture', failures, RENDER_HICCUP_MESSAGE)
}
