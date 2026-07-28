import { describe, expect, it } from 'vitest'

import { DEFAULT_ENGINE_ORDER, resolveEngineOrder } from './engineOrder.ts'

/**
 * Which engine goes first. Vitest runs with `MODE === 'test'`, so the seam is
 * live here — in a production build the whole override folds away.
 */
describe('resolveEngineOrder', () => {
  it('is snapdom first, html-to-image second (debate #1 verdict)', () => {
    expect(DEFAULT_ENGINE_ORDER).toEqual(['snapdom', 'html-to-image'])
    expect(resolveEngineOrder('')).toEqual(['snapdom', 'html-to-image'])
  })

  it('swaps the order for ?export-engine=fallback', () => {
    expect(resolveEngineOrder('?export-engine=fallback')).toEqual(['html-to-image', 'snapdom'])
  })

  it('accepts the engine name as an alias for the same thing', () => {
    expect(resolveEngineOrder('?export-engine=html-to-image')).toEqual(['html-to-image', 'snapdom'])
  })

  it('ignores an unknown value rather than rendering with nothing', () => {
    expect(resolveEngineOrder('?export-engine=konva')).toEqual(DEFAULT_ENGINE_ORDER)
    expect(resolveEngineOrder('?other=1')).toEqual(DEFAULT_ENGINE_ORDER)
  })
})
