import { describe, expect, it, vi } from 'vitest'

import { INK_SAMPLE_DIVISOR, MAX_SAFE_RENDER_HEIGHT_PX, PNG_MIME } from './constants.ts'
import { buildAttemptPlan, runRenderLadder } from './renderLadder.ts'
import type { RenderLadderPlan, RenderLadderPorts } from './renderLadder.ts'
import { assessInk } from './sanity.ts'
import type { InspectedPng, PngEngineId } from './types.ts'
import { PngRenderError } from './types.ts'

/**
 * The ladder with both engines stubbed: primary → primary retry → fallback →
 * V6. Every rung is asserted by the CALLS the ladder makes, not by its output
 * alone, so "the fallback was never reached" is a testable statement.
 */

const EXPECTED = { width: 1200, height: 1600 } as const

const SAMPLE_COUNT = Math.ceil(1200 / INK_SAMPLE_DIVISOR) * Math.ceil(1600 / INK_SAMPLE_DIVISOR)

function samples(darkPixels: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(SAMPLE_COUNT * 4)
  for (let index = 0; index < SAMPLE_COUNT; index += 1) {
    data.set([255, 255, 255, 255], index * 4)
  }
  for (let index = 0; index < darkPixels; index += 1) {
    data.set([0, 0, 0, 255], index * 4)
  }
  return data
}

const INKED: InspectedPng = {
  decoded: EXPECTED,
  header: EXPECTED,
  ink: assessInk(samples(Math.floor(SAMPLE_COUNT / 4))),
}

const BLANK: InspectedPng = { decoded: EXPECTED, header: EXPECTED, ink: assessInk(samples(0)) }

const WRONG_SIZE: InspectedPng = {
  decoded: { width: 2400, height: 3200 },
  header: { width: 2400, height: 3200 },
  ink: INKED.ink,
}

const PLAN: RenderLadderPlan = {
  pageId: 'page-home',
  expected: EXPECTED,
  requiresInk: true,
  hasStrokes: true,
  engines: ['snapdom', 'html-to-image'],
}

interface Harness {
  readonly ports: RenderLadderPorts
  readonly capture: ReturnType<typeof vi.fn>
  readonly settle: ReturnType<typeof vi.fn>
  readonly dispose: ReturnType<typeof vi.fn>
  readonly engines: PngEngineId[]
}

function harness(outcomes: readonly (InspectedPng | Error)[]): Harness {
  const engines: PngEngineId[] = []
  const dispose = vi.fn()
  const settle = vi.fn(() => Promise.resolve())

  const capture = vi.fn((engine: PngEngineId) => {
    engines.push(engine)
    return Promise.resolve(new Blob([new Uint8Array([1])], { type: PNG_MIME }))
  })

  let call = 0
  const inspect = vi.fn(() => {
    const outcome = outcomes[call] ?? outcomes.at(-1)
    call += 1
    if (outcome instanceof Error) return Promise.reject(outcome)
    return Promise.resolve(outcome as InspectedPng)
  })

  return {
    ports: {
      mount: () => ({ node: {} as HTMLElement, dispose }),
      settle,
      capture,
      inspect,
    },
    capture,
    settle,
    dispose,
    engines,
  }
}

describe('buildAttemptPlan', () => {
  it('is primary, primary, fallback', () => {
    expect(buildAttemptPlan(['snapdom', 'html-to-image'])).toEqual([
      'snapdom',
      'snapdom',
      'html-to-image',
    ])
  })

  it('honours a forced order — the fallback becomes the primary', () => {
    expect(buildAttemptPlan(['html-to-image', 'snapdom'])).toEqual([
      'html-to-image',
      'html-to-image',
      'snapdom',
    ])
  })

  it('refuses an empty engine list rather than silently rendering nothing', () => {
    expect(() => buildAttemptPlan([])).toThrow(/at least one engine/)
  })
})

describe('runRenderLadder', () => {
  it('returns on the first attempt and never calls the fallback', async () => {
    const { ports, capture, engines, dispose } = harness([INKED])
    const result = await runRenderLadder(PLAN, ports)

    expect(result.engine).toBe('snapdom')
    expect(result.attempts).toBe(1)
    expect(result.width).toBe(1200)
    expect(result.height).toBe(1600)
    expect(result.inkRatio).toBeGreaterThan(0)
    expect(capture).toHaveBeenCalledTimes(1)
    expect(engines).toEqual(['snapdom'])
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('retries the primary once, then falls back — blank, blank, good', async () => {
    const { ports, engines, settle } = harness([BLANK, BLANK, INKED])
    const result = await runRenderLadder(PLAN, ports)

    expect(engines).toEqual(['snapdom', 'snapdom', 'html-to-image'])
    expect(result.engine).toBe('html-to-image')
    expect(result.attempts).toBe(3)
    // The settle (fonts + a frame) runs before EVERY attempt, not just the retry.
    expect(settle).toHaveBeenCalledTimes(3)
  })

  it('recovers on the retry without paying for the fallback', async () => {
    const { ports, engines } = harness([BLANK, INKED])
    const result = await runRenderLadder(PLAN, ports)

    expect(engines).toEqual(['snapdom', 'snapdom'])
    expect(result.engine).toBe('snapdom')
    expect(result.attempts).toBe(2)
  })

  it('raises a V6 PngRenderError once all three attempts fail', async () => {
    const { ports, engines, dispose } = harness([BLANK, BLANK, BLANK])

    const error = await runRenderLadder(PLAN, ports).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(PngRenderError)
    const rendered = error as PngRenderError
    expect(rendered.finding).toBe('V6')
    expect(rendered.failure).toBe('blank')
    expect(rendered.attempts).toHaveLength(3)
    expect(rendered.clientMessage).toMatch(/try submitting again/)
    expect(rendered.message).toContain('snapdom')
    expect(rendered.message).toContain('html-to-image')
    expect(engines).toEqual(['snapdom', 'snapdom', 'html-to-image'])
    // The offscreen root comes down even on the failing path.
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('treats a wrong-sized capture as a failure, not as a resize', async () => {
    const { ports } = harness([WRONG_SIZE, WRONG_SIZE, WRONG_SIZE])

    const error = (await runRenderLadder(PLAN, ports).catch((caught: unknown) => caught)) as PngRenderError

    expect(error.failure).toBe('dimensions')
    expect(error.attempts[0]?.detail).toContain('2400x3200')
  })

  it('records a thrown engine as a capture failure and carries on', async () => {
    const { ports, engines } = harness([new Error('snapdom exploded'), INKED])
    const result = await runRenderLadder(PLAN, ports)

    expect(result.attempts).toBe(2)
    expect(engines).toEqual(['snapdom', 'snapdom'])
  })

  it('refuses an impossible height before rendering anything', async () => {
    const { ports, capture } = harness([INKED])

    const error = (await runRenderLadder(
      { ...PLAN, expected: { width: 1200, height: MAX_SAFE_RENDER_HEIGHT_PX + 8 } },
      ports,
    ).catch((caught: unknown) => caught)) as PngRenderError

    expect(error.failure).toBe('geometry')
    expect(capture).not.toHaveBeenCalled()
  })

  it('carries hasStrokes through untouched — the packer obeys the flag, never re-derives it', async () => {
    const withStrokes = await runRenderLadder(PLAN, harness([INKED]).ports)
    const without = await runRenderLadder({ ...PLAN, hasStrokes: false }, harness([INKED]).ports)

    expect(withStrokes.hasStrokes).toBe(true)
    expect(without.hasStrokes).toBe(false)
  })

  /** A capture with two ink pixels on it: not blank, nowhere near the ink floor. */
  const SPARSE: InspectedPng = {
    decoded: EXPECTED,
    header: EXPECTED,
    ink: assessInk(samples(2)),
  }

  it('does not enforce the ink floor on a page that promised no ink', async () => {
    const result = await runRenderLadder({ ...PLAN, requiresInk: false }, harness([SPARSE]).ports)

    expect(result.attempts).toBe(1)
  })

  it('DOES enforce it on a page that promised ink and came back all but empty', async () => {
    // The other edge of the same rule: once a page's blocks or strokes say there
    // should be ink, a capture with none of it is a render failure, not a sketch.
    const { ports, engines } = harness([SPARSE, SPARSE, SPARSE])

    const error = (await runRenderLadder(PLAN, ports).catch((caught: unknown) => caught)) as PngRenderError

    expect(error).toBeInstanceOf(PngRenderError)
    expect(error.failure).toBe('blank')
    expect(error.attempts[0]?.detail).toContain('below the floor')
    expect(engines).toEqual(['snapdom', 'snapdom', 'html-to-image'])
  })
})
