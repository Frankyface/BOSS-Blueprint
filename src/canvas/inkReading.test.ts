import { describe, expect, it } from 'vitest'

import {
  circlePoints,
  headingAndColumns,
  navHeader,
  penStroke,
  pricingCards,
  waveAndCat,
} from '../test/inkFixtures.ts'

import { inkRegions } from './ink/classify.ts'
import type { InkConfidence, InkRegion, InkRegionKind } from './ink/types.ts'
import {
  INK_READING_NOTHING_YET,
  UNSURE_TAG_SUFFIX,
  inkReadingRegions,
  inkReadingSummary,
  inkReadingTag,
} from './inkReading.ts'
import type { Block, BlockTypeId } from './types.ts'

/**
 * THE CLIENT'S HALF OF THE INK MODULE.
 *
 * Every assertion here is a promise about what a NON-TECHNICAL person is shown when
 * they draw a thing — never a snapshot of the classifier, which `ink/` already owns.
 */

function block(type: BlockTypeId, x: number, y: number, width: number, height: number): Block {
  return { id: `blk-${type}-${String(x)}`, type, x, y, width, height, text: '' }
}

/** A minimal region, for the two facts a tag is made of. */
function region(kind: InkRegionKind, confidence: InkConfidence = 'clear'): InkRegion {
  return {
    id: 'reg_0001',
    kind,
    variant: null,
    frame: { x: 0, y: 0, w: 10, h: 10 },
    color: '#d92d20',
    strokeIds: [],
    parentId: null,
    confidence,
    setId: null,
    setIndex: null,
    align: null,
    words: null,
    lines: null,
    glyphHeight: null,
    attachedToId: null,
  }
}

const DOODLE = penStroke('doodle', circlePoints(940, 344, 60))

describe('the tag on one region', () => {
  it('calls a drawn box a card and handwriting words', () => {
    expect(inkReadingTag(region('panel'))).toBe('card')
    expect(inkReadingTag(region('writing'))).toBe('words')
  })

  it('has a word for every kind the classifier can emit, including the leftovers', () => {
    const kinds: readonly InkRegionKind[] = [
      'panel',
      'rule',
      'textPlaceholder',
      'writing',
      'navRow',
      'artwork',
      'annotation',
    ]

    expect(kinds.map((kind) => inkReadingTag(region(kind)))).toEqual([
      'card',
      'line',
      'text',
      'words',
      'nav',
      'drawing',
      'note',
    ])
  })

  it('marks an unsure reading, so a guess is never shown as a fact', () => {
    expect(inkReadingTag(region('panel', 'unsure'))).toBe(`card${UNSURE_TAG_SUFFIX}`)
  })

  it('keeps every tag one lowercase word — there is no vocabulary to learn', () => {
    for (const kind of ['panel', 'rule', 'textPlaceholder', 'writing', 'navRow', 'artwork', 'annotation'] as const) {
      const tag = inkReadingTag(region(kind))
      expect(tag).toBe(tag.toLowerCase())
      expect(tag).not.toMatch(/\s/)
    }
  })
})

describe('the plain-English summary', () => {
  it('reads two drawn pricing cards back as two cards', () => {
    expect(inkReadingSummary(inkReadingRegions([], pricingCards()))).toBe(
      'We read this as 2 cards, words and text.',
    )
  })

  it('never says "1 cards", and never counts words or text as if they were things', () => {
    expect(inkReadingSummary(inkReadingRegions([], headingAndColumns()))).toBe(
      'We read this as some words and text.',
    )
  })

  it('names a header box, its wordmark, its menu and its rule in reading order', () => {
    // The wordmark reads back `unsure`, so the whole sentence hedges to match the
    // `?` the tags already carry — one story, not a certain sentence over hedged badges.
    expect(inkReadingSummary(inkReadingRegions([], navHeader()))).toBe(
      'This looks like a card, some words, a nav row and a line.',
    )
  })

  it('counts a wave and a cat as two drawings — the pen alone made both', () => {
    expect(inkReadingSummary(inkReadingRegions([], waveAndCat()))).toBe(
      'We read this as 2 drawings.',
    )
  })

  it('says what to draw when there is nothing it can build from yet', () => {
    expect(inkReadingSummary([])).toBe(INK_READING_NOTHING_YET)
  })

  it('only ever uses words the overlay tags already use', () => {
    const summary = inkReadingSummary(inkReadingRegions([], navHeader()))

    for (const tag of ['card', 'words', 'nav', 'line']) {
      expect(summary).toContain(tag)
    }
  })
})

describe('the summary honours uncertainty exactly as the tags do', () => {
  it('states a reading as fact only when every region came back clear', () => {
    expect(inkReadingSummary([region('panel'), region('panel')])).toBe('We read this as 2 cards.')
  })

  it('hedges the whole sentence the moment any one region is unsure', () => {
    // The badge would read `card?`; the sentence must not read "We read this as".
    expect(inkReadingSummary([region('panel', 'unsure'), region('panel')])).toBe(
      'This looks like 2 cards.',
    )
  })

  it('never names an internal concept when it hedges', () => {
    const hedged = inkReadingSummary([region('writing', 'unsure')])

    for (const jargon of ['region', 'penRegion', 'classifier', 'bbox', 'unsure']) {
      expect(hedged.toLowerCase()).not.toContain(jargon.toLowerCase())
    }
  })
})

describe('reading the page the client is looking at', () => {
  it('gives the client exactly the regions the builder is given', () => {
    const strokes = pricingCards()

    expect(inkReadingRegions([], strokes)).toEqual(inkRegions([], strokes))
  })

  it('maps the editor\'s own block vocabulary, so a mark on a photo stays an annotation', () => {
    const slot = block('image', 760, 144, 360, 400)

    expect(inkReadingRegions([slot], [DOODLE])).toEqual([])
  })

  it('keeps a section band exempt, so ink drawn on a band is still design', () => {
    const band = block('section', 0, 200, 1200, 400)

    expect(inkReadingRegions([band], [DOODLE]).map((entry) => entry.kind)).toEqual(['panel'])
  })

  it('is byte-identical run to run — the client and the builder cannot disagree', () => {
    const strokes = navHeader()

    expect(JSON.stringify(inkReadingRegions([], strokes))).toBe(
      JSON.stringify(inkReadingRegions([], strokes)),
    )
  })

  it('reads an empty page as nothing at all rather than throwing', () => {
    expect(inkReadingRegions([], [])).toEqual([])
    expect(inkReadingSummary(inkReadingRegions([], []))).toBe(INK_READING_NOTHING_YET)
  })
})
