import { describe, expect, it } from 'vitest'

import { inkRegions } from '../../canvas/ink/classify.ts'
import { inkOnlyPage } from '../../test/inkFixtures.ts'
import type { ExportPage, ExportPenRegion, SiteJson } from '../types.ts'
import { BUILD_FROM_INK_RE } from '../validate/rules/briefCrossCheck.ts'

import { FALLBACK_NO_COPY_ITEMS, FALLBACK_NO_COPY_ITEMS_INK } from './boilerplate.ts'
import { generateBrief } from './generateBrief.ts'
import { copySourcesOf, inkLeadParagraphs, inkRegionBullets, siteHasDrawnCopy, topLevelRegions } from './ink.ts'
import type { CopySources } from './inkContents.ts'

/**
 * THE PROSE IS THE DELIVERABLE, so these tests assert PROSE.
 *
 * Each branch is checked for the sentence that removes a specific permission to ship
 * nothing — "these are ONE component used 2 times", "this is the `<h1>`", "this page
 * is not empty and it must not ship empty" — because those sentences ARE the feature.
 * The byte-exact pin for the assembled output is `__snapshots__/wide-fixture.md`;
 * what lives here is the reason each sentence is in it, plus the invariants that must
 * hold on EVERY branch: no guillemets, no 4-space indents, one logical line per
 * bullet, and no number the generator has not measured.
 */

/** Prefix/suffix assertions with a readable diff — vitest has no `toStartWith`. */
function expectStart(actual: string, expected: string): void {
  expect(actual.slice(0, expected.length)).toBe(expected)
}

function expectEnd(actual: string, expected: string): void {
  expect(actual.slice(-expected.length)).toBe(expected)
}

const BASE_REGION: ExportPenRegion = {
  id: 'reg_0001',
  kind: 'writing',
  confidence: 'clear',
  bbox: { x: 100, y: 200, w: 300, h: 60 },
  strokeIds: ['stk_0001'],
  parentRegionId: null,
  setId: null,
  setIndex: null,
  text: null,
}

function region(overrides: Partial<ExportPenRegion>): ExportPenRegion {
  return { ...BASE_REGION, ...overrides }
}

function pageWith(
  regions: readonly ExportPenRegion[],
  overrides: Partial<ExportPage> = {},
): ExportPage {
  return {
    id: 'pg_0001',
    name: 'Home',
    slug: 'home',
    height: 1600,
    screenshot: 'pages/01-home.png',
    blocks: [],
    penStrokes: [],
    penRegions: regions,
    ...overrides,
  }
}

/**
 * `The business` states, as the bullets see it. The DEFAULT for these tests is
 * "there is copy to write from", so the [N14] empty-source note appears only in the
 * tests that ask for it.
 */
const SOURCED: CopySources = { hasBusinessWords: true }
const UNSOURCED: CopySources = { hasBusinessWords: false }

/** The first bullet after the section header. */
const bulletFor = (
  regions: readonly ExportPenRegion[],
  overrides: Partial<ExportPage> = {},
  sources: CopySources = SOURCED,
): string => inkRegionBullets(pageWith(regions, overrides), sources)[1] ?? ''

const writingText = (words: number, glyphHeight: number, emphasis: 'display' | 'heading' | 'body') =>
  ({ lines: 1, words, glyphHeight, align: 'left', emphasis }) as const

/* ── the four things the product owner said went missing ───────────────────── */

describe('a sibling set of drawn panels — the two pricing cards', () => {
  const cards = [
    region({ id: 'reg_0001', kind: 'panel', variant: 'card', bbox: { x: 96, y: 980, w: 300, h: 320 }, setId: 'set_0001', setIndex: 0, strokeIds: ['stk_0006'] }),
    region({ id: 'reg_0002', kind: 'panel', variant: 'card', bbox: { x: 444, y: 980, w: 300, h: 320 }, setId: 'set_0001', setIndex: 1, strokeIds: ['stk_0011'] }),
    region({ id: 'reg_0003', kind: 'writing', bbox: { x: 128, y: 1024, w: 180, h: 48 }, parentRegionId: 'reg_0001', strokeIds: ['stk_0007', 'stk_0008'], text: writingText(3, 26, 'body') }),
    region({ id: 'reg_0004', kind: 'writing', bbox: { x: 476, y: 1024, w: 190, h: 48 }, parentRegionId: 'reg_0002', strokeIds: ['stk_0012'], text: writingText(2, 26, 'body') }),
  ]
  const bullets = inkRegionBullets(pageWith(cards), SOURCED)

  it('states the component contract once, before the members', () => {
    expectStart(
      bullets[1] ?? '',
      '- **Drawn card set** — 2 boxes the client drew at (96, 980, 300, 320), (444, 980, 300, 320): matching in size, side by side at the same height, about 48px apart. These are ONE component used 2 times. Build a single card component — one class, one set of styles — and instantiate it once per box below, in the order listed.',
    )
  })

  it('refuses the wobbly-outline reading and offers the pricing-table one', () => {
    expect(bullets[1]).toContain("The client's hand-drawn border is a *sketch of a card*, not a spec")
    expect(bullets[1]).toContain('never as a wobbly hand-drawn outline')
    expect(bullets[1]).toContain('If the words you read make the set look like a pricing table, build it as one')
  })

  it('gives each member its own indented bullet carrying the counted marker', () => {
    expectStart(
      bullets[2] ?? '',
      '  - **Drawn card 1 of 2** — a box the client drew at (96, 980, 300, 320), with handwriting inside it. **BUILD THIS FROM INK**:',
    )
    expectStart(
      bullets[3] ?? '',
      '  - **Drawn card 2 of 2** — a box the client drew at (444, 980, 300, 320), with handwriting inside it. **BUILD THIS FROM INK**:',
    )
  })

  it("sends the builder to the PNG for the card's own words, without promising a body it has not got", () => {
    expect(bullets[2]).toContain(
      "Read the words in `pages/01-home.png` inside (128, 1024, 180, 48) and use them verbatim as this card's content — it is this card's only run of handwriting, so it is its title",
    )
    expect(bullets[2]).not.toContain('the top line is its title and what follows is its body')
    expect(bullets[2]).toContain(
      'If you cannot read it, write fitting copy for it from `The business` above at the length the ink suggests and log it under "Pen marks I could not read"',
    )
  })

  it('splits title from body only when the card really holds more than one run (fix 15)', () => {
    const twoRuns = [
      region({ id: 'reg_0001', kind: 'panel', bbox: { x: 96, y: 980, w: 300, h: 320 }, strokeIds: ['stk_0006'] }),
      region({ id: 'reg_0002', kind: 'writing', bbox: { x: 128, y: 1024, w: 180, h: 48 }, parentRegionId: 'reg_0001', strokeIds: ['stk_0007'], text: writingText(3, 26, 'body') }),
      region({ id: 'reg_0003', kind: 'writing', bbox: { x: 128, y: 1094, w: 180, h: 48 }, parentRegionId: 'reg_0001', strokeIds: ['stk_0008'], text: writingText(6, 18, 'body') }),
    ]
    const bullet = bulletFor(twoRuns)
    expect(bullet).toContain(
      'in the order they are written, topmost first — the top line is its title and what follows is its body',
    )
    expect(bullet).toContain('If you cannot read a line, write fitting copy for it')
  })

  it('pins the card title to a real heading level, not to the ink emphasis (fix 14)', () => {
    expect(bullets[2]).toContain(
      "Mark that title up as a real heading one rung below the page's `<h1>` — `<h2>`, or `<h3>` where a nearer heading owns this section — never a styled `<div>`: the ink's measured size is not a heading level.",
    )
  })

  it('defers row composition to the coordinates instead of decreeing a 2-up row (fix 3)', () => {
    expect(bullets[1]).not.toContain('2-up row')
    expect(bullets[1]).toContain(
      'What you build is the component and its 2 instances, not a row: how many columns the row around them has is decided by the `x`/`y` coordinates of everything at this height',
    )
    expect(bullets[1]).toContain(
      'a block or another drawn region sharing this band of `y` belongs to the same row and makes it wider than 2 columns',
    )
    expect(bullets[1]).toContain('the `x`/`w` coordinates are the authority on horizontal arrangement')
    expect(bullets[1]).toContain('let the whole row stack on mobile per `Responsive rules`')
  })

  it('lists the box ink and the ink inside it separately', () => {
    expect(bullets[2]).toContain('Ink: `stk_0006` for the box, `stk_0007`, `stk_0008` for what is drawn inside.')
  })

  it('emits ONE marker per top-level region, which is what V30 counts', () => {
    // The contract bullet deliberately carries no marker: a two-card set is TWO
    // top-level regions, so the markers belong on the two things actually built.
    expect(bullets.join('\n').match(BUILD_FROM_INK_RE)).toHaveLength(2)
    expect(topLevelRegions(pageWith(cards))).toHaveLength(2)
  })

  it('reads a vertical set as a column', () => {
    const stacked = [
      region({ id: 'reg_0001', kind: 'panel', bbox: { x: 96, y: 100, w: 300, h: 200 }, setId: 'set_0001', setIndex: 0 }),
      region({ id: 'reg_0002', kind: 'panel', bbox: { x: 96, y: 340, w: 300, h: 200 }, setId: 'set_0001', setIndex: 1 }),
    ]
    expect(bulletFor(stacked)).toContain('stacked one above the next, about 40px apart')
  })
})

describe('a drawn heading', () => {
  const heading = region({
    kind: 'writing',
    bbox: { x: 120, y: 220, w: 520, h: 78 },
    strokeIds: ['stk_0004'],
    text: writingText(1, 64, 'display'),
  })

  it('is a real heading, measured in words and glyph height — never in lines', () => {
    const bullet = bulletFor([heading])
    expectStart(
      bullet,
      '- **Drawn heading** — handwriting at (120, 220, 520, 78), the largest writing on this page (1 word, letters about 64px tall). **BUILD THIS FROM INK**: this is a real heading.',
    )
    expect(bullet).not.toMatch(/\b\d+ lines?\b/)
  })

  it('forbids reproducing the handwriting and names the fallback', () => {
    const bullet = bulletFor([heading])
    expect(bullet).toContain('do not reproduce the handwriting, and do not reach for a handwriting font unless `Look & feel` asks for one')
    expect(bullet).toContain('If you cannot read it, use the business name from `The business` above as the heading')
  })

  it('claims the `<h1>` when no heading block supplies one', () => {
    expect(bulletFor([heading])).toContain('No block on this page supplies an `<h1>`, so this is the `<h1>`.')
  })

  it('does NOT claim the `<h1>` when a heading block already does', () => {
    const withBlock = pageWith([heading], {
      blocks: [
        {
          id: 'blk_0001',
          type: 'heading',
          z: 0,
          frame: { x: 0, y: 0, w: 100, h: 40 },
          copyMode: 'real',
          text: 'Hi',
          generateDescription: null,
          lengthHint: null,
        },
      ],
    })
    expect(inkRegionBullets(withBlock, SOURCED)[1]).not.toContain('so this is the `<h1>`')
  })

  it('claims it exactly once when the client drew two headings', () => {
    const second = region({
      id: 'reg_0002',
      bbox: { x: 120, y: 400, w: 300, h: 50 },
      strokeIds: ['stk_0005'],
      text: writingText(2, 44, 'heading'),
    })
    const bullets = inkRegionBullets(pageWith([heading, second]), SOURCED).join('\n')
    expect(bullets.match(/so this is the `<h1>`/g)).toHaveLength(1)
  })

  it('narrates body-emphasis writing as words rather than as a heading', () => {
    const words = region({
      bbox: { x: 128, y: 1024, w: 180, h: 52 },
      strokeIds: ['stk_0007', 'stk_0008'],
      text: writingText(2, 26, 'body'),
    })
    expectStart(
      bulletFor([words]),
      '- **Drawn words** — handwriting at (128, 1024, 180, 52) (2 words, letters about 26px tall). **BUILD THIS FROM INK**: this is a real line of text.',
    )
  })
})

describe('drawn artwork — the cat and the wave', () => {
  const cat = region({
    kind: 'artwork',
    bbox: { x: 700, y: 1400, w: 320, h: 280 },
    strokeIds: ['stk_0016', 'stk_0017', 'stk_0018', 'stk_0019', 'stk_0020'],
  })

  it('leads with the SVG recipe, which works even without recognising the drawing', () => {
    const bullet = bulletFor([cat])
    expectStart(
      bullet,
      "- **Drawn artwork** — a drawing at (700, 1400, 320, 280), 5 strokes: not writing, not a container, not a line. **BUILD THIS FROM INK**: reproduce the client's drawing as real artwork on the page at this position and size.",
    )
    expect(bullet).toContain('emit one `<polyline>` per stroke inside a single **inline** `<svg>` whose `viewBox` is this region\'s box, with `fill="none"`')
    expect(bullet).toContain('do not link an external file, and do not trace it by hand')
  })

  it('permits restyling but not relocation, and demands an aria-label', () => {
    const bullet = bulletFor([cat])
    expect(bullet).toContain('keep it recognisably the same drawing in the same place')
    expect(bullet).toContain('give the `<svg>` a `role="img"` and an `aria-label` saying what that is')
  })

  it('hands the one call geometry cannot make to the builder, on EVERY artwork bullet', () => {
    expect(bulletFor([cat])).toContain('One judgement call is yours:')
    expect(bulletFor([region({ ...cat, variant: 'band' })])).toContain('One judgement call is yours:')
  })
})

/**
 * THE BAND, WHICH IS ONE INSTRUCTION AND NOT THREE (v2.5).
 *
 * Reported 3/3 by two consecutive runs of zero-context builders. The bullet used to
 * bind the drawing to its own geometry ("at this position and size", "recognisably
 * the same drawing in the same place") and then stretch it to the viewport, and its
 * own "For a band the width wins" was an admission rather than a resolution. A band
 * now states its placement and its fidelity rule ONCE, in its own branch, and the
 * general clauses that would contradict it are not emitted at all.
 */
describe('an artwork region the classifier called a band', () => {
  const band = (): ExportPenRegion =>
    region({ kind: 'artwork', variant: 'band', bbox: { x: 80, y: 1200, w: 1040, h: 96 }, strokeIds: ['stk_0030'] })

  it('states its placement once, and never binds the geometry it is about to change', () => {
    const bullet = bulletFor([band()])
    expect(bullet).toContain(
      'This region is 1040px wide and 96px tall — it spans most of the page width and is far wider than it is tall, so it is a full-bleed decorative band, not an inline picture: stretch the `<svg>` to 100% of the viewport width at this `y`, behind the content, with `preserveAspectRatio="none"`.',
    )
    expect(bullet).not.toContain('at this position and size')
    expect(bullet).not.toContain('For a band the width wins')
  })

  it('gives fidelity one rule — shapes and character, not proportions', () => {
    const bullet = bulletFor([band()])
    expect(bullet).toContain(
      'Its aspect ratio is expected to change — keep the shapes and the character of the line, not the proportions.',
    )
    expect(bullet).not.toContain('recognisably the same drawing')
    expect(bullet).not.toContain('in the same shapes and proportions')
  })

  it('says decorative elements are BUILT, and never calls a drawn region "not content"', () => {
    const bullet = bulletFor([band()])
    expect(bullet).toContain(
      'It is decorative: build it, and keep it out of the accessibility tree — `aria-hidden="true"`, no `role="img"`, no `aria-label`.',
    )
    expect(bullet).not.toContain('not content')
  })

  it('makes decoration and image-brief mutually exclusive, not simultaneous', () => {
    const bullet = bulletFor([band()])
    expect(bullet).toContain(
      'Source or generate a real image of what it depicts, run it full-bleed at this `y` in place of the band, write alt text from what it shows, and list it under "Images to replace" in BUILD_NOTES.md with your reasoning. Taking that route replaces the decoration with content: the image carries that alt text and no `aria-hidden`.',
    )
    expect(bullet).not.toContain('and an `aria-label` saying what that is')
  })
})

describe('a pen-only page', () => {
  const page = pageWith([region({ kind: 'artwork', strokeIds: ['stk_0001', 'stk_0002', 'stk_0003'] })])

  it('says outright that the page is not empty and must not ship empty', () => {
    expect(inkLeadParagraphs(page)[0]).toBe(
      '**This page has no blocks — the client drew it instead.** Everything on this page comes from the drawn regions below. Treat that list as the complete page, top to bottom, exactly as you would treat a block walkthrough: build every region, in the order given, with real markup and real styling. This page is not empty and it must not ship empty.',
    )
  })

  it('omits that paragraph when the page also has blocks', () => {
    const mixed = pageWith([region({ kind: 'artwork' })], {
      blocks: [{ id: 'blk_0001', type: 'section', z: 0, frame: { x: 0, y: 0, w: 1200, h: 100 }, background: null }],
    })
    expectStart(inkLeadParagraphs(mixed)[0] ?? '', '**The client drew part of this page by hand.**')
  })

  it('carries the three-tier reading ladder, ending in "never silently drop a region"', () => {
    const ladder = inkLeadParagraphs(page)[1] ?? ''
    expect(ladder).toContain('is a 1× render of the 1200 × 1600 px page')
    expect(ladder).toContain("rebuild that region's ink at 4×")
    expect(ladder).toContain('build the region anyway using the fallback its bullet gives you')
    expectEnd(ladder, 'Never silently drop a region.')
  })

  it('sends a tall page straight to the rebuild, because its PNG arrives downscaled', () => {
    const tall = inkLeadParagraphs(pageWith([region({ kind: 'artwork' })], { height: 3200 }))
    expect(tall[2]).toBe(
      'This page is 1200 × 3200 px — taller than the 2576 px long edge your image input carries, so this PNG reaches you downscaled to about 0.81× and fine handwriting may not survive it. For every region below that asks you to read handwriting, go straight to the 4× rebuild.',
    )
  })

  it('omits the downscale warning at exactly the long edge', () => {
    expect(inkLeadParagraphs(pageWith([region({ kind: 'artwork' })], { height: 2576 }))).toHaveLength(2)
  })

  it('emits nothing at all for a page with no regions and no extra space', () => {
    expect(inkLeadParagraphs(pageWith([]))).toEqual([])
    expect(inkRegionBullets(pageWith([]), SOURCED)).toEqual([])
  })
})

/* ── the remaining branches ────────────────────────────────────────────────── */

describe('the other drawn shapes', () => {
  it('narrates a drawn nav as THE navigation when no navBar block exists', () => {
    const nav = region({
      kind: 'navRow',
      bbox: { x: 118, y: 94, w: 644, h: 48 },
      strokeIds: ['stk_0001', 'stk_0002', 'stk_0003'],
      text: writingText(3, 24, 'body'),
    })
    const bullet = bulletFor([nav])
    expectStart(
      bullet,
      '- **Drawn nav** — 3 separate words drawn in a regular row across the top of the page at (118, 94, 644, 48). **BUILD THIS FROM INK**: this is the site navigation for this page.',
    )
    expect(bullet).toContain('Link each word to the page in `Site inventory` whose name or slug matches it, case-insensitively')
    expect(bullet).toContain('No `navBar` block exists on this page, so this drawn nav IS the navigation')
  })

  it('routes a nav word that matches page 1 to the site root, not to its slug (fix 2)', () => {
    const nav = region({ kind: 'navRow', text: writingText(3, 24, 'body') })
    expect(bulletFor([nav])).toContain(
      "to `/` when the page it matches is page 1, whose slug is a page title and never a URL (`Definition of done` item 1), and to that page's own URL otherwise",
    )
  })

  it('labels unreadable nav items from a fixed sequence — no blanks, no repeats, no ellipses (fix 1)', () => {
    const nav = region({ kind: 'navRow', text: writingText(3, 24, 'body') })
    const bullet = bulletFor([nav])
    expect(bullet).not.toContain('most plausibly points at')
    expect(bullet).toContain(
      'If you cannot read an item, do not guess it from the shape of the ink, and never ship a blank label, an ellipsis, or the same label twice.',
    )
    expect(bullet).toContain(
      'Fill the unreadable items left → right from this fixed sequence, skipping any label a readable item already uses: first the page names in `Site inventory`, in inventory order; then `About`, `Services`, `Work`, `Contact`; then the item\'s own left → right position — `Item 5`, `Item 6`, and so on.',
    )
    expect(bullet).toContain('The sequence does not depend on how many pages this site has, so the same drawn nav always produces the same labels.')
  })

  it('drops the "IS the navigation" clause when the page has a navBar block', () => {
    const nav = region({ kind: 'navRow', text: writingText(3, 24, 'body') })
    const withNav = pageWith([nav], {
      blocks: [{ id: 'blk_0001', type: 'navBar', z: 0, frame: { x: 0, y: 0, w: 1200, h: 64 }, items: [] }],
    })
    expect(inkRegionBullets(withNav, SOURCED)[1]).not.toContain('IS the navigation')
  })

  it('narrates a rule as a divider that carries no words', () => {
    const rule = region({ kind: 'rule', variant: 'divider', bbox: { x: 80, y: 320, w: 1040, h: 3 }, strokeIds: ['stk_0005'] })
    // "It is not content" was read as "optional" — the exact failure this release
    // exists to prevent — while `Your role` and DoD 8 both say every drawn region is
    // built. What the sentence is FOR is "there is nothing to read here", so that is
    // all it now says.
    expect(bulletFor([rule])).toBe(
      "- **Drawn rule** — a straight horizontal line at (80, 320, 1040, 3), 1040px long. **BUILD THIS FROM INK**: build it as a divider — a hairline rule, or a bottom border on whatever sits directly above it, in the site's own visual language. It carries no words. Ink: `stk_0005`.",
    )
  })

  it('measures a vertical rule down its long axis', () => {
    const rule = region({ kind: 'rule', variant: 'vertical', bbox: { x: 600, y: 100, w: 3, h: 420 } })
    expect(bulletFor([rule])).toContain('a straight vertical line at (600, 100, 3, 420), 420px long')
  })

  it('tells the builder a placeholder stack has no letters in it', () => {
    const stack = region({ kind: 'textPlaceholder', bbox: { x: 128, y: 1080, w: 220, h: 96 }, strokeIds: ['stk_0009', 'stk_0010', 'stk_0011'] })
    const bullet = bulletFor([stack])
    expectStart(
      bullet,
      '- **Drawn placeholder text** — 3 short wavy lines stacked at (128, 1080, 220, 96), up to 220px wide. **BUILD THIS FROM INK**: this is the client showing you WHERE body copy goes, not words to read — squiggles like these have no letters in them.',
    )
    expect(bullet).toContain('Write 3 lines of real body copy for this position')
    expect(bullet).toContain('Do not try to transcribe these lines and do not build them as rules or dividers.')
  })

  it('turns an empty drawn box into a real media placeholder, not a blank div', () => {
    const box = region({ id: 'reg_0003', kind: 'panel', bbox: { x: 760, y: 300, w: 380, h: 260 }, strokeIds: ['stk_0002'] })
    const bullet = bulletFor([box])
    expectStart(
      bullet,
      '- **Drawn box (empty)** — a box the client drew at (760, 300, 380, 260) with nothing drawn inside it. **BUILD THIS FROM INK**: an empty drawn box is a placeholder for media the client has not supplied.',
    )
    expect(bullet).toContain('create the placeholder as a local file at `assets/placeholders/reg_0003.<ext>`')
    expect(bullet).toContain('list it under "Images to replace" in BUILD_NOTES.md')
  })

  it('does NOT reuse the counted SOURCE AN IMAGE marker for an empty drawn box', () => {
    expect(bulletFor([region({ kind: 'panel', bbox: { x: 760, y: 300, w: 380, h: 260 } })])).not.toContain('SOURCE AN IMAGE')
  })

  it('describes a grandchild rather than losing it', () => {
    const outer = region({ id: 'reg_0001', kind: 'panel', bbox: { x: 60, y: 40, w: 1080, h: 160 } })
    const inner = region({ id: 'reg_0002', kind: 'panel', bbox: { x: 100, y: 60, w: 300, h: 100 }, parentRegionId: 'reg_0001' })
    const deep = region({ id: 'reg_0003', kind: 'artwork', bbox: { x: 120, y: 80, w: 100, h: 60 }, parentRegionId: 'reg_0002', strokeIds: ['stk_0099'] })
    const bullet = bulletFor([outer, inner, deep])
    expect(bullet).toContain('with a drawing and a nested box inside it')
    expect(bullet).toContain('`stk_0099`')
  })

  it('appends the unsure caveat, and only when the producer was unsure', () => {
    expectEnd(
      bulletFor([region({ kind: 'artwork', confidence: 'unsure' })]),
      'This reading is a geometric guess — if the PNG shows something different, trust the PNG, build what you see, and log the difference in BUILD_NOTES.md.',
    )
    expect(bulletFor([region({ kind: 'artwork' })])).not.toContain('This reading is a geometric guess')
  })

  it('names deliberate closing space as ADDED room, which is what the geometry says (fix 11)', () => {
    expect(inkLeadParagraphs(pageWith([], { extraBottomPx: 640 }))).toEqual([
      'The client deliberately added 640px of empty space at the bottom of this page with the editor\'s "Add space" control. That room is added on top of the closing space every page already has below its last element, so the gap you can measure under the last thing in the PNG is larger than 640px — the 640px is the client\'s request, not the measurement. Read it as design intent: real breathing room at the end of this page — generous bottom padding on the final section, or a quiet closing band — not a 640px empty spacer element.',
    ])
  })

  it('scales the unreadable-writing fallback to the words the ink measures (fix 6)', () => {
    const words = region({ bbox: { x: 758, y: 1238, w: 224, h: 30 }, text: writingText(2, 26, 'body') })
    const bullet = bulletFor([words])
    expect(bullet).not.toContain('write one fitting sentence')
    expect(bullet).toContain(
      'If you cannot read it, write a fitting replacement at the length the ink measures — about 2 words, not a sentence — from `The business` above, and log it under "Pen marks I could not read".',
    )
  })
})

/* ── [N14] the copy source, named rather than apologised for (fix 8) ───────── */

describe('bullets that cite `The business` when `The business` is empty', () => {
  const branches: readonly (readonly [string, ExportPenRegion[]])[] = [
    ['drawn words', [region({ text: writingText(2, 26, 'body') })]],
    ['drawn heading', [region({ text: writingText(1, 64, 'display') })]],
    ['placeholder stack', [region({ kind: 'textPlaceholder', strokeIds: ['stk_0001', 'stk_0002'] })]],
    ['empty drawn box', [region({ kind: 'panel' })]],
    [
      'card with words inside',
      [
        region({ kind: 'panel' }),
        region({ id: 'reg_0002', kind: 'writing', parentRegionId: 'reg_0001', text: writingText(2, 20, 'body') }),
      ],
    ],
  ]

  /**
   * The v2.5 fix appended a per-bullet caveat, so six bullets ordered the builder to
   * write from `The business` and then declared it empty IN THE SAME SENTENCE. The
   * bullet now names what IS available instead; the situation is stated once, in
   * `The business` itself.
   */
  it.each(branches)('never declares its own source empty — %s', (_name, regions) => {
    const bullet = bulletFor(regions, {}, UNSOURCED)
    expect(bullet).not.toContain('no source there to write from')
    expect(bullet).not.toContain('has no tagline and no About text')
  })

  it.each(branches)('never sends an unsourced bullet to `The business` for words — %s', (_name, regions) => {
    const bullet = bulletFor(regions, {}, UNSOURCED)
    // The business NAME is always present; only "write words from it" is the dead pointer.
    expect(bullet).not.toContain('from `The business` above at the length')
    expect(bullet).not.toContain('from `The business` and `Look & feel` above')
  })

  it.each(branches)('keeps pointing at `The business` when there IS something there — %s', (_name, regions) => {
    expect(bulletFor(regions, {}, SOURCED)).toContain('`The business`')
  })

  it('names the business name and the sketch as the source instead', () => {
    expect(bulletFor([region({ text: writingText(2, 26, 'body') })], {}, UNSOURCED)).toContain(
      'write a fitting replacement at the length the ink measures — about 2 words, not a sentence — from the business name and what the sketch shows',
    )
    expect(
      bulletFor([region({ kind: 'textPlaceholder', strokeIds: ['stk_0001', 'stk_0002'] })], {}, UNSOURCED),
    ).toContain(
      'Write 2 lines of real body copy for this position from the business name, what the sketch shows, and `Look & feel` above',
    )
    expect(bulletFor([region({ kind: 'panel' })], {}, UNSOURCED)).toContain(
      'write alt text from the business name and what the sketch shows',
    )
  })

  it('reads the state off `siteSettings`, not off the page', () => {
    const settings = { businessName: 'Cats-R-Us', vibe: null, styleNotes: null, colors: [] }
    expect(copySourcesOf({ siteSettings: { ...settings, tagline: null, about: null } } as unknown as SiteJson)).toEqual({
      hasBusinessWords: false,
    })
    expect(copySourcesOf({ siteSettings: { ...settings, tagline: 'Fresh daily', about: null } } as unknown as SiteJson)).toEqual({
      hasBusinessWords: true,
    })
    expect(copySourcesOf({ siteSettings: { ...settings, tagline: null, about: 'We bake.' } } as unknown as SiteJson)).toEqual({
      hasBusinessWords: true,
    })
  })
})

/* ── the standing invariants ───────────────────────────────────────────────── */

const EVERY_BRANCH: readonly (readonly ExportPenRegion[])[] = [
  [
    region({ kind: 'panel', setId: 'set_0001', setIndex: 0 }),
    region({ id: 'reg_0002', kind: 'panel', bbox: { x: 500, y: 200, w: 300, h: 60 }, setId: 'set_0001', setIndex: 1 }),
  ],
  [region({ kind: 'panel' })],
  [
    region({ kind: 'panel' }),
    region({ id: 'reg_0002', kind: 'writing', parentRegionId: 'reg_0001', text: writingText(2, 20, 'body') }),
    region({ id: 'reg_0003', kind: 'textPlaceholder', parentRegionId: 'reg_0001', strokeIds: ['stk_0002', 'stk_0003'] }),
    region({ id: 'reg_0004', kind: 'rule', parentRegionId: 'reg_0001' }),
  ],
  [region({ kind: 'writing', text: writingText(1, 64, 'display') })],
  [region({ kind: 'writing', text: writingText(4, 20, 'body') })],
  [region({ kind: 'navRow', text: writingText(3, 24, 'body') })],
  [region({ kind: 'rule', variant: 'divider' })],
  [region({ kind: 'textPlaceholder', strokeIds: ['stk_0001', 'stk_0002'] })],
  [region({ kind: 'artwork', variant: 'band', confidence: 'unsure' })],
]

describe('invariants that must hold on every branch', () => {
  const emitted = (regions: readonly ExportPenRegion[]): string[] => [
    ...inkLeadParagraphs(pageWith(regions)),
    ...inkRegionBullets(pageWith(regions), SOURCED),
  ]

  it('never emits a guillemet — V7 could never resolve one from geometry', () => {
    for (const regions of EVERY_BRANCH) {
      for (const line of emitted(regions)) expect(line).not.toMatch(/[«»]/)
    }
  })

  it('never emits a line that starts with four or more spaces (§3.3 rule 10)', () => {
    for (const regions of EVERY_BRANCH) {
      for (const line of emitted(regions)) expect(line).not.toMatch(/^\s{4}/)
    }
  })

  it('emits one unwrapped logical line per bullet', () => {
    for (const regions of EVERY_BRANCH) {
      for (const line of emitted(regions)) expect(line).not.toContain('\n')
    }
  })

  it('never claims a line count for handwriting — `text.lines` is unmeasured there', () => {
    for (const regions of EVERY_BRANCH) {
      if (!regions.some((item) => item.kind === 'writing' || item.kind === 'navRow')) continue
      expect(inkRegionBullets(pageWith(regions), SOURCED).join('\n')).not.toMatch(/\b\d+ lines? of handwriting\b/)
    }
  })

  it('marks exactly one bullet per top-level region, on every branch', () => {
    for (const regions of EVERY_BRANCH) {
      const page = pageWith(regions)
      expect(inkRegionBullets(page, SOURCED).join('\n').match(BUILD_FROM_INK_RE)).toHaveLength(
        topLevelRegions(page).length,
      )
    }
  })
})

/**
 * THE PIN FOR DATA GAP (b): a `textPlaceholder` ships `text: null`, so the brief
 * recovers its line count as `strokeIds.length`. That is exact only because a
 * placeholder is classified from a SINGLE stroke and `stackPlaceholders` merges one
 * per line. If a future change to the merger breaks that, the brief starts printing a
 * false line count silently — so the equality is asserted here, on real traced
 * geometry, instead of assumed.
 */
describe('the placeholder line-count invariant the prose relies on', () => {
  it('holds for every placeholder stack the traced page produces', () => {
    const stacks = inkRegions([], inkOnlyPage()).filter((item) => item.kind === 'textPlaceholder')
    expect(stacks.length).toBeGreaterThan(0)
    for (const stack of stacks) expect(stack.lines).toBe(stack.strokeIds.length)
  })
})

/* ── the copy-list fallback ────────────────────────────────────────────────── */

describe('the copy list on an ink-only site', () => {
  const site = (regions: readonly ExportPenRegion[]): SiteJson => ({
    schemaVersion: 1,
    submission: {
      id: '00000000-0000-4000-8000-000000000000',
      submittedAt: '2026-07-29T00:00:00Z',
      designCreatedAt: null,
      client: { name: 'Test', email: 'test@example.com' },
      appVersion: '1.0.0',
    },
    siteSettings: { businessName: 'Cats-R-Us', tagline: null, about: null, vibe: null, styleNotes: null, colors: [] },
    pages: [pageWith(regions)],
    assets: [],
  })

  it('stops telling the builder the client wrote all their own copy', () => {
    const brief = generateBrief(site([region({ kind: 'writing', text: writingText(2, 40, 'heading') })]))
    expect(brief).toContain(FALLBACK_NO_COPY_ITEMS_INK)
    expect(brief).not.toContain(FALLBACK_NO_COPY_ITEMS)
  })

  it('counts drawn placeholder text as drawn copy too — it is written, not read', () => {
    // The old predicate asked only about drawn WORDS, so a page whose only ink was
    // placeholder squiggles fell through to "the client wrote all their own copy"
    // while three stacks of body copy waited in the walkthrough.
    const placeholders = site([region({ kind: 'textPlaceholder', strokeIds: ['stk_0001', 'stk_0002'] })])
    expect(siteHasDrawnCopy(placeholders)).toBe(true)
    expect(generateBrief(placeholders)).not.toContain(FALLBACK_NO_COPY_ITEMS)
  })

  it('keeps the old fallback when the only ink is a drawing', () => {
    expect(siteHasDrawnCopy(site([region({ kind: 'artwork' })]))).toBe(false)
    expect(generateBrief(site([region({ kind: 'artwork' })]))).toContain(FALLBACK_NO_COPY_ITEMS)
  })

  it('counts the drawn regions in the inventory Blocks cell', () => {
    const brief = generateBrief(site([region({ kind: 'artwork' })]))
    expect(brief).toContain('| 1 | Home | `home` | `pages/01-home.png` (1200×1600) | 0 (+1 drawn) |')
  })

  it('says nothing about nesting when no region nests (fix 10)', () => {
    expect(generateBrief(site([region({ kind: 'artwork' })]))).not.toContain('Drawn regions nest:')
  })

  /**
   * THE SECTION THAT REGRESSED TWICE (v2.5).
   *
   * It was built around one origin — `generate` blocks — and then asked to account
   * for drawn regions too, so every patch broke an assumption baked into the prose
   * beside it. The heading counted blocks + ink while the preamble said "the client
   * marked these BLOCKS" on a page with none, and one number stood for two different
   * jobs: copy to WRITE and words to TRANSCRIBE.
   *
   * The restructure gives each job its own number and its own verb. The heading
   * counts the numbered list under it and nothing else, so heading, preamble and body
   * are one claim; the ink categories are stated after the list, as their own work,
   * never as a correction of the number above them.
   */
  it('makes the heading, the preamble and the list one claim about one thing', () => {
    const brief = generateBrief(
      site([
        region({ kind: 'writing', text: writingText(2, 40, 'heading') }),
        region({ id: 'reg_0002', kind: 'textPlaceholder', strokeIds: ['stk_0002', 'stk_0003'] }),
      ]),
    )
    expect(brief).toContain('## Copy you must write (0 items)')
    // The preamble names blocks, so it is not emitted where there are none.
    expect(brief).not.toContain('The client marked these blocks "write it for me"')
    expect(brief).not.toContain('Drawn regions account for')
    expect(brief).not.toContain('this heading does not count')
    expect(brief).not.toContain('The number in this heading counts blocks only')
  })

  it('separates copy to WRITE from words to TRANSCRIBE, with a number each', () => {
    const brief = generateBrief(
      site([
        region({ kind: 'writing', text: writingText(2, 40, 'heading') }),
        region({ id: 'reg_0002', kind: 'textPlaceholder', strokeIds: ['stk_0002', 'stk_0003'] }),
      ]),
    )
    expect(brief).toContain(
      'Copy that comes from ink is not numbered here. Each piece is specified in its own bullet under "What the client drew on this page" in the walkthroughs:',
    )
    expect(brief).toContain(
      '- **Write** 1 block of body copy where the client drew placeholder text — those wavy lines carry no letters, so there is nothing there to read.',
    )
    expect(brief).toContain(
      '- **Transcribe** 1 run of handwriting — the words are already in the PNG, so read them and use them verbatim; write a replacement only where you cannot read one.',
    )
  })

  it('emits only the categories the site actually has', () => {
    const writingOnly = generateBrief(site([region({ kind: 'writing', text: writingText(2, 40, 'heading') })]))
    expect(writingOnly).toContain('- **Transcribe** 1 run of handwriting')
    expect(writingOnly).not.toContain('- **Write**')

    const placeholderOnly = generateBrief(
      site([region({ kind: 'textPlaceholder', strokeIds: ['stk_0001', 'stk_0002'] })]),
    )
    expect(placeholderOnly).toContain('- **Write** 1 block of body copy')
    expect(placeholderOnly).not.toContain('- **Transcribe**')
  })

  it('does not call a drawn nav a run of handwriting — it is a label lookup', () => {
    // `reg_0001` is a navRow: its bullet forbids guessing from the ink and hands the
    // builder a fixed label sequence instead. Counting it as handwriting printed "5
    // runs" against the four `writing` regions site.json actually carries.
    const brief = generateBrief(site([region({ kind: 'navRow', text: writingText(3, 24, 'body') })]))
    expect(brief).toContain('## Copy you must write (0 items)')
    expect(brief).not.toContain('- **Transcribe**')
    expect(brief).not.toContain('- **Write**')
  })

  it('omits the ink lines entirely when no drawn region carries copy', () => {
    expect(generateBrief(site([region({ kind: 'artwork' })]))).toContain('## Copy you must write (0 items)')
    expect(generateBrief(site([region({ kind: 'artwork' })]))).not.toContain('Copy that comes from ink')
  })

  it('does not promise an `assets/` directory the package has not got (fix 16)', () => {
    const brief = generateBrief(site([region({ kind: 'artwork' })]))
    expect(brief).not.toContain("- `assets/` — the client's real images, build-ready.")
    expect(brief).toContain('No uploaded images. Every image slot describes what it wants')
  })

  it('states the empty copy source once, in `The business` (fix 8)', () => {
    const brief = generateBrief(site([region({ kind: 'writing', text: writingText(2, 40, 'heading') })]))
    expect(brief.split('- **Nothing to write copy from:**')).toHaveLength(2)
    expect(brief).not.toContain('no source there to write from')
  })

  it('names the no-colour-signal case when there is no vibe and no photo either (fix 9)', () => {
    const brief = generateBrief(site([region({ kind: 'artwork' })]))
    expect(brief).toContain(
      'There is no vibe and no uploaded photo to infer one from either, so choose it from the business name and from what the sketch shows, and flag the palette for the client to confirm.',
    )
  })
})
