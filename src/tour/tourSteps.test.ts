import { describe, expect, it } from 'vitest'

import {
  countSentences,
  countWords,
  liveTourSteps,
  TOUR_BODY_SENTENCE_LIMIT,
  TOUR_STEPS,
  TOUR_TITLE_SENTENCE_LIMIT,
  TOUR_WORD_LIMIT,
  tourWordCount,
} from './tourSteps.ts'

/** The reading path the feature file fixes: left → centre → toolbar → right → top. */
const EXPECTED_ORDER = ['palette', 'canvas', 'pen-tool', 'side-panel', 'submit']

function domWith(tourIds: readonly string[]): ParentNode {
  const root = document.createElement('div')
  for (const id of tourIds) {
    const element = document.createElement('div')
    element.setAttribute('data-tour', id)
    root.append(element)
  }
  return root
}

describe('the tour step table', () => {
  it('is exactly the five pointers, in the reading order', () => {
    expect(TOUR_STEPS.map((step) => step.target)).toEqual(EXPECTED_ORDER)
  })

  it('stays under thirty seconds of reading', () => {
    // 200 wpm × 30s = 100 words; the budget is 95 so it is comfortably under even
    // for a slow reader. A copy edit that busts it fails here, not in front of a
    // client.
    expect(tourWordCount()).toBeLessThanOrEqual(TOUR_WORD_LIMIT)
  })

  it('keeps every pointer short', () => {
    for (const step of TOUR_STEPS) {
      expect(countWords(step.title), `${step.target} title`).toBeLessThanOrEqual(12)
      expect(countWords(step.body), `${step.target} body`).toBeLessThanOrEqual(20)
    }
  })

  it('keeps the title to one instruction and the body to two sentences', () => {
    // The claim used to be "≤2 sentences per pointer" with nothing but a word
    // count behind it — and pointer 2 is a title plus two body sentences, so the
    // claim was false as written. This is the rule the copy actually obeys.
    for (const step of TOUR_STEPS) {
      expect(countSentences(step.title), `${step.target} title`).toBeLessThanOrEqual(
        TOUR_TITLE_SENTENCE_LIMIT,
      )
      expect(countSentences(step.body), `${step.target} body`).toBeLessThanOrEqual(
        TOUR_BODY_SENTENCE_LIMIT,
      )
    }
  })

  it('counts sentences, not clause separators', () => {
    expect(countSentences('Block = its words · Site = your name and style.')).toBe(1)
    expect(countSentences("Your words replace the grey text. Press Enter when you're done.")).toBe(2)
    expect(countSentences('No terminator at all')).toBe(1)
    expect(countSentences('   ')).toBe(0)
  })

  it('counts words, not punctuation', () => {
    expect(countWords('Block = its words · Site = your name')).toBe(6)
    expect(countWords('  ')).toBe(0)
    expect(countWords('Double-click a block')).toBe(3)
  })
})

describe('pointers with nothing to point at', () => {
  it('keeps every step whose target is on the page', () => {
    const live = liveTourSteps(domWith(EXPECTED_ORDER))

    expect(live.map((step) => step.target)).toEqual(EXPECTED_ORDER)
  })

  it('skips a missing target and renumbers what is left', () => {
    // Submit before Stage 3 landed it; the pen hidden by a future layout.
    const live = liveTourSteps(domWith(['palette', 'canvas', 'side-panel']))

    expect(live.map((step) => step.target)).toEqual(['palette', 'canvas', 'side-panel'])
    expect(live).toHaveLength(3)
  })

  it('has nothing to show when none of the targets exist', () => {
    expect(liveTourSteps(domWith([]))).toEqual([])
  })
})
