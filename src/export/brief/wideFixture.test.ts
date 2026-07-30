import { describe, expect, it } from 'vitest'

import { inkOnlyPage } from '../../test/inkFixtures.ts'
import { toExportRegions } from '../penRegions.ts'
import { roundCoordinate } from '../penRoles.ts'
import type { ExportPenRegion, ExportPenStroke, SiteJson } from '../types.ts'
import { BUILD_FROM_INK_RE } from '../validate/rules/briefCrossCheck.ts'

import { FALLBACK_NO_DESCRIPTION, FALLBACK_NO_DESCRIPTION_USAGE } from './boilerplate.ts'
import { generateBrief } from './generateBrief.ts'

/**
 * THE WIDE FIXTURE — every branch §7.1 cannot reach (Appendix A: "all six block
 * types, both copy modes, uploaded + empty image slot, internal + external + none
 * links, identical AND differing navs, both pen roles on empty and filled slots,
 * fromTemplate filler, unreachable page, absent optionals"), plus §3.3 rule-7/8
 * escaping torture strings.
 *
 * TWO KINDS OF ASSERTION, on purpose:
 *
 *  · a COMMITTED FILE SNAPSHOT (`__snapshots__/wide-fixture.md`). The spec has no
 *    expected output for this fixture, so nothing here can be byte-exact against
 *    the contract — but the generated brief can still be pinned, and pinning it
 *    as a real Markdown file means a PR that changes narration shows the changed
 *    PROSE in its diff rather than a green test count. That readable diff was the
 *    point (ruled 2026-07-28); an inline snapshot would have buried it in a
 *    template literal.
 *  · an INVARIANTS harness, which is what still holds if that snapshot is ever
 *    deliberately re-blessed: V7's counting contract, table integrity, guillemet
 *    integrity, printed-id integrity, and the v2.3 fallback strings.
 */

/**
 * PAGE 4 — the ink-only page, produced by the REAL classifier over the traced drawing.
 *
 * Hand-writing the regions here would prove only that the narrator can read a literal;
 * running `toExportRegions` over the same geometry the client would draw is what makes
 * the committed snapshot evidence that the product owner's four complaints — a drawn
 * nav, a drawn heading, two drawn pricing cards and a drawn cat, none of which reached
 * the built site — now arrive at the builder as things to build.
 */
const INK_PAGE_FIRST_STROKE = 4

const inkStrokes: readonly ExportPenStroke[] = inkOnlyPage().map((stroke, index) => ({
  id: `stk_${String(index + INK_PAGE_FIRST_STROKE).padStart(4, '0')}`,
  points: stroke.points.map((point) => [roundCoordinate(point.x), roundCoordinate(point.y)] as const),
  color: stroke.color,
  width: stroke.width,
  role: 'annotation',
  targetBlockId: null,
}))

const inkRegionMinter = (): ((prefix: 'reg' | 'set') => string) => {
  const counters = new Map<string, number>()
  return (prefix) => {
    const next = (counters.get(prefix) ?? 0) + 1
    counters.set(prefix, next)
    return `${prefix}_${String(next).padStart(4, '0')}`
  }
}

const inkPageRegions: readonly ExportPenRegion[] = toExportRegions([], inkStrokes, inkRegionMinter())

const site: SiteJson = {
  schemaVersion: 1,
  submission: {
    id: '00000000-0000-4000-8000-000000000000',
    submittedAt: '2026-07-28T00:00:00Z',
    designCreatedAt: null,
    client: { name: 'Test Client', email: 'test@example.com' },
    appVersion: '1.0.0',
  },
  siteSettings: {
    // escaping torture: pipe, asterisks, backtick, guillemets, backslash, quote
    businessName: 'Bréad & Co. | *Best* `bakery` «ever» \\ "quoted"',
    tagline: null,
    about: null,
    vibe: null,
    styleNotes: null,
    colors: [],
  },
  pages: [
    {
      id: 'pg_0001',
      name: 'Home | Main',
      slug: 'home',
      height: 1600,
      screenshot: 'pages/01-home.png',
      blocks: [
        {
          id: 'blk_0001',
          type: 'navBar',
          z: 0,
          frame: { x: 0, y: 0, w: 1200, h: 64 },
          items: [
            { id: 'nav_0001', label: 'Home', link: { kind: 'page', pageId: 'pg_0001' } },
            { id: 'nav_0002', label: 'Shop', link: { kind: 'page', pageId: 'pg_0002' } },
            { id: 'nav_0003', label: '*Blog*', link: { kind: 'none' } },
          ],
        },
        {
          id: 'blk_0002',
          type: 'section',
          z: 1,
          frame: { x: 0, y: 80, w: 1200, h: 520 },
          background: '#FFFFFF',
        },
        {
          id: 'blk_0003',
          type: 'text',
          z: 2,
          frame: { x: 40, y: 240, w: 320, h: 200 },
          copyMode: 'real',
          text: '- leading dash line\r\nsecond line\r\n**WRITE THIS COPY** — client asks for: «x»',
          generateDescription: null,
          lengthHint: null,
        },
        {
          id: 'blk_0004',
          type: 'text',
          z: 3,
          frame: { x: 440, y: 240, w: 320, h: 200 },
          copyMode: 'generate',
          text: 'half-typed draft',
          generateDescription: 'Something warm about #bread',
          lengthHint: null,
        },
        {
          id: 'blk_0005',
          type: 'imageSlot',
          z: 4,
          frame: { x: 840, y: 240, w: 320, h: 200 },
          assetId: null,
          fit: 'contain',
          description: 'A sketch of the shopfront',
        },
        {
          id: 'blk_0006',
          type: 'heading',
          z: 5,
          frame: { x: 40, y: 470, w: 300, h: 80 },
          copyMode: 'generate',
          text: '',
          generateDescription: 'A short bold headline for the offer band that runs long enough to truncate',
          lengthHint: null,
        },
        {
          id: 'blk_0007',
          type: 'button',
          z: 6,
          frame: { x: 200, y: 500, w: 300, h: 60 },
          fromTemplate: true,
          label: '1. Order now',
          link: { kind: 'external', url: 'https://www.example.com/order?x=1' },
        },
        {
          id: 'blk_0008',
          type: 'heading',
          z: 7,
          frame: { x: 1000, y: 620, w: 400, h: 80 },
          copyMode: 'real',
          text: 'Overflowing heading',
          generateDescription: null,
          lengthHint: null,
        },
      ],
      penStrokes: [
        {
          id: 'stk_0001',
          points: [
            [860, 260],
            [900, 300],
            [940, 340],
          ],
          color: '#000000',
          width: 4,
          role: 'imageSketch',
          targetBlockId: 'blk_0005',
        },
        {
          id: 'stk_0002',
          points: [
            [950, 350],
            [1000, 380],
          ],
          color: '#000000',
          width: 4,
          role: 'imageSketch',
          targetBlockId: 'blk_0005',
        },
        {
          id: 'stk_0003',
          points: [
            [20, 900],
            [60, 940],
          ],
          color: '#000000',
          width: 4,
          role: 'annotation',
          targetBlockId: null,
        },
      ],
    },
    {
      id: 'pg_0002',
      name: 'Shop',
      slug: 'shop',
      height: 1600,
      screenshot: 'pages/02-shop.png',
      blocks: [
        {
          id: 'blk_0009',
          type: 'navBar',
          z: 0,
          frame: { x: 0, y: 0, w: 1200, h: 64 },
          items: [{ id: 'nav_0004', label: 'Home', link: { kind: 'page', pageId: 'pg_0001' } }],
        },
        {
          id: 'blk_0010',
          type: 'imageSlot',
          z: 1,
          frame: { x: 80, y: 200, w: 1040, h: 400 },
          assetId: 'img_001',
          fit: 'cover',
          description: null,
        },
      ],
      penStrokes: [],
    },
    {
      id: 'pg_0003',
      name: 'Orphan',
      slug: 'orphan',
      height: 1600,
      screenshot: 'pages/03-orphan.png',
      blocks: [
        {
          id: 'blk_0011',
          type: 'heading',
          z: 0,
          frame: { x: 80, y: 100, w: 1040, h: 80 },
          copyMode: 'real',
          text: '# Orphan page',
          generateDescription: null,
          lengthHint: null,
        },
      ],
      penStrokes: [],
    },
    {
      id: 'pg_0004',
      name: 'Drawn',
      slug: 'drawn',
      height: 2200,
      extraBottomPx: 640,
      screenshot: 'pages/04-drawn.png',
      blocks: [],
      penStrokes: inkStrokes,
      penRegions: inkPageRegions,
    },
  ],
  assets: [
    {
      id: 'img_001',
      path: 'assets/img_001.jpg',
      originalFilename: 'my "best" photo|final.jpeg',
      mimeType: 'image/jpeg',
      width: 1600,
      height: 900,
      bytes: 500_000,
    },
  ],
}

/** §3.3 rule 2 — the binding frame-tuple-anchored regexes, copied verbatim. */
const WRITE_THIS_COPY_RE =
  /^\s*- \*\*(Heading|Text)\*\* [^(\n]*\((-?\d+(\.\d)?, ){3}-?\d+(\.\d)?\)[^\n]*?\*\*WRITE THIS COPY\*\* — client asks for: «/gm
const SOURCE_AN_IMAGE_RE =
  /^\s*- \*\*Image slot\*\* [^(\n]*\((-?\d+(\.\d)?, ){3}-?\d+(\.\d)?\)[^\n]*?\*\*SOURCE AN IMAGE\*\* — no upload; client wants: «/gm

const brief = generateBrief(site)

describe('wide fixture — V7 counting contract', () => {
  it('counts exactly the generate blocks, uninflatable by client text', () => {
    expect(brief.match(WRITE_THIS_COPY_RE)).toHaveLength(2)
  })

  it('counts exactly the empty image slots', () => {
    expect(brief.match(SOURCE_AN_IMAGE_RE)).toHaveLength(1)
  })

  it('is not inflated by the Definition-of-done boilerplate', () => {
    expect(brief).toContain('4. Every WRITE THIS COPY item above has final written copy')
  })
})

describe('wide fixture — structural integrity', () => {
  it('keeps 7 unescaped pipes in every inventory row despite a client pipe', () => {
    const rows = brief.split('\n').filter((line) => /^\| \d+ \| /.test(line))
    expect(rows).toHaveLength(4)
    for (const row of rows) expect(row.match(/(?<!\\)\|/g)).toHaveLength(7)
  })

  it('balances unescaped guillemets', () => {
    expect(brief.match(/(?<!\\)«/g)?.length).toBe(brief.match(/(?<!\\)»/g)?.length)
  })

  it('prints only block ids that exist in site.json', () => {
    const printed = new Set(brief.match(/blk_\d{4}/g) ?? [])
    const real = new Set(site.pages.flatMap((page) => page.blocks.map((block) => block.id)))
    for (const id of printed) expect(real.has(id)).toBe(true)
  })

  it('emits one walkthrough bullet per non-section block', () => {
    const bullets = brief.match(/^\s*- \*\*(Heading|Text|Image slot|Button|Nav bar)\*\* /gm) ?? []
    const nonSection = site.pages.flatMap((page) =>
      page.blocks.filter((block) => block.type !== 'section'),
    )
    expect(bullets).toHaveLength(nonSection.length)
  })

  it('is deterministic', () => {
    expect(generateBrief(site)).toBe(brief)
  })
})

describe('wide fixture — page 4, the four things that went missing (v2.5)', () => {
  const page = brief.slice(brief.indexOf('### Page 4 — Drawn'), brief.indexOf('## Copy you must write'))

  it('does not let a page the client drew advertise itself as empty', () => {
    expect(brief).toContain('| 4 | Drawn | `drawn` | `pages/04-drawn.png` (1200×2200) | 0 (+10 drawn) |')
    expect(page).toContain('**This page has no blocks — the client drew it instead.**')
    expect(page).toContain('This page is not empty and it must not ship empty.')
  })

  it('1 — the two pricing cards are ONE component, instantiated twice', () => {
    expect(page).toContain('- **Drawn card set** — 2 boxes the client drew at (118, 398, 324, 264), (518, 398, 324, 264)')
    expect(page).toContain('These are ONE component used 2 times.')
    expect(page).toContain('  - **Drawn card 1 of 2** — a box the client drew at (118, 398, 324, 264), with handwriting and 3 placeholder lines inside it.')
    expect(page).toContain('  - **Drawn card 2 of 2** — a box the client drew at (518, 398, 324, 264), with handwriting and 3 placeholder lines inside it.')
  })

  it('2 — the drawn heading is a real heading, and it is the `<h1>`', () => {
    expect(page).toContain('- **Drawn heading** — handwriting at (198, 218, 270, 82.4), the largest writing on this page (1 word, letters about 56px tall).')
    expect(page).toContain('No block on this page supplies an `<h1>`, so this is the `<h1>`.')
  })

  it('3 — the drawn nav IS the navigation, and the wave is a decorative band', () => {
    expect(page).toContain('- **Drawn nav** — 3 separate words drawn in a regular row across the top of the page at (118, 58, 354, 28).')
    expect(page).toContain('No `navBar` block exists on this page, so this drawn nav IS the navigation')
    expect(page).toContain('so it is a full-bleed decorative band, not an inline picture')
  })

  it('4 — the cat is reproduced as real artwork from its own strokes', () => {
    expect(page).toContain('- **Drawn artwork** — a drawing at (372, 908, 320, 258), 6 strokes: not writing, not a container, not a line.')
    expect(page).toContain('One judgement call is yours:')
  })

  it('carries exactly one BUILD THIS FROM INK marker per top-level region', () => {
    const topLevel = inkPageRegions.filter((region) => region.parentRegionId === null)
    expect(topLevel).toHaveLength(10)
    expect(brief.match(BUILD_FROM_INK_RE)).toHaveLength(topLevel.length)
  })

  it('names the client’s deliberate closing space as ADDED room, reconcilable with the geometry', () => {
    expect(page).toContain(
      'The client deliberately added 640px of empty space at the bottom of this page with the editor\'s "Add space" control.',
    )
    expect(page).toContain('the 640px is the client\'s request, not the measurement')
    expect(page).not.toContain('640px of empty space below the last thing on this page')
  })

  it('never quotes anything in an ink bullet — V7 could not resolve it', () => {
    const inkLines = page.split('\n').filter((line) => line.includes('BUILD THIS FROM INK'))
    expect(inkLines).toHaveLength(10)
    for (const line of inkLines) expect(line).not.toMatch(/[«»]/)
  })
})

describe('wide fixture — the wording fixes three zero-context builders needed', () => {
  it('7 — the copy-list heading counts the list under it, and nothing corrects it', () => {
    // 2 generate blocks — and exactly 2 numbered items below the heading.
    expect(brief).toContain('## Copy you must write (2 items)')
    expect(brief.match(/^\d+\. \*\*/gm)).toHaveLength(2)
    // Every framing that made one number stand for two different jobs is gone.
    expect(brief).not.toContain('Drawn regions account for')
    expect(brief).not.toContain('The number in this heading counts blocks only')
    expect(brief).not.toContain('this heading does not count')
    expect(brief).not.toContain('the real writing scope for this build is')
  })

  it('7b — copy from ink gets its own verbs and its own numbers, after the list', () => {
    expect(brief).toContain(
      'Copy that comes from ink is not numbered here. Each piece is specified in its own bullet under "What the client drew on this page" in the walkthroughs:',
    )
    // 3 textPlaceholder stacks to write; 4 `writing` regions to transcribe. The drawn
    // NAV is neither — its bullet is a label lookup, not a reading — so the count of
    // handwriting is 4, which is what site.json carries.
    expect(brief).toContain(
      '- **Write** 3 blocks of body copy where the client drew placeholder text — those wavy lines carry no letters, so there is nothing there to read.',
    )
    expect(brief).toContain(
      '- **Transcribe** 4 runs of handwriting — the words are already in the PNG, so read them and use them verbatim; write a replacement only where you cannot read one.',
    )
    expect(brief).not.toContain('5 runs of handwriting')
    // The ink lines follow the numbered list, so nothing sits between the heading and
    // the items it counts.
    expect(brief.indexOf('Copy that comes from ink')).toBeGreaterThan(brief.indexOf('2. **Home'))
  })

  it('8 — no bullet orders the builder to write from a source it declares empty', () => {
    expect(brief).not.toContain('no source there to write from')
    expect(brief).toContain(
      '- **Nothing to write copy from:** the client gave no tagline and no About text, so where this brief asks you to write copy, write it from the business name and what the sketch shows, invent no facts about this business, and list what you wrote in BUILD_NOTES.md under "Copy to confirm with the client".',
    )
    expect(brief).toContain(
      'If you cannot read it, write a fitting replacement at the length the ink measures — about 2 words, not a sentence — from the business name and what the sketch shows, and log it under "Pen marks I could not read".',
    )
    expect(brief).toContain(
      'write 3 lines of real body copy there from the business name, what the sketch shows, and `Look & feel` above',
    )
    // The business NAME is never absent, so the heading fallback needs no caveat at all.
    expect(brief).toContain(
      'If you cannot read it, use the business name from `The business` above as the heading and log it under "Pen marks I could not read".',
    )
  })

  it('8b — the copy-list preamble does not cite an About text that is null', () => {
    expect(brief).not.toContain('(use the About text above)')
  })

  it('9 — an empty palette gets its own branch, and rules pen ink out as a seed', () => {
    expect(brief).not.toContain('none given — derive a palette that fits the vibe and the uploaded photos')
    expect(brief).toContain(
      '- **Preferred colors:** none given — **no colour signal was supplied with this sketch**: the client picked no colours, so there is no "first colour" here to treat as the brand colour.',
    )
    expect(brief).toContain(
      "**The client's pen ink colour is not a colour signal** — it is the ink of a sketch, never a brand colour, so never seed the palette from it; reproducing a drawn region's own stroke colours inside its `<svg>`, as the artwork bullets require, is copying a drawing and not a palette choice.",
    )
    expect(brief).toContain('Record the palette you chose, and why, in BUILD_NOTES.md under "Palette I chose".')
    // This fixture HAS an uploaded photo, so the inference sources are real.
    expect(brief).toContain('Fit it to the vibe above and to the uploaded photos in `Assets`.')
  })

  it('10 — the inventory reconciles its region count with site.json', () => {
    expect(brief).toContain(
      'Drawn regions nest: the **Blocks** column counts blocks and, after the "+", TOP-LEVEL drawn regions only. `site.json` carries 14 drawn regions in all — 10 top-level and 4 nested inside them. A nested region is described inside its parent\'s bullet in the walkthrough rather than as a row here, and all 14 must be built.',
    )
  })

  it('12 — definition of done 4 is satisfiable when the copy came from unreadable ink', () => {
    expect(brief).toContain(
      '**Handwriting you could not read has no verbatim form** — where a piece of copy came from ink you could not read, the fallback in that region\'s bullet IS its final copy, and this item is satisfied for it once you have used that fallback and logged the region under "Pen marks I could not read".',
    )
  })

  it('13 — a page with no legible copy still has a defined `<html lang>`', () => {
    expect(brief).toContain(
      'where there is no legible copy to read a language from — a page the client only drew, handwriting you could not make out — use `lang="en"` and log that assumption in BUILD_NOTES.md',
    )
  })

  it('14 — definition of done 3 points at where the unlinked-item rule really is', () => {
    expect(brief).toContain(
      '3. All navigation works: every wired link goes to its target; the shared nav (if any) appears on every page; unlinked items are handled where their rule is given — the Navigation map for a button or nav item, the **Drawn nav** bullet in the walkthrough for a word the client drew.',
    )
    expect(brief).not.toContain('unlinked items are handled as the Navigation map says')
  })

  it('15 — the card content model does not promise a body line the ink has not got', () => {
    const page = brief.slice(brief.indexOf('### Page 4 — Drawn'), brief.indexOf('## Copy you must write'))
    expect(page).toContain(
      "Read the words in `pages/04-drawn.png` inside (148, 438, 216, 34) and use them verbatim as this card's content — it is this card's only run of handwriting, so it is its title, unless the words themselves plainly say otherwise (a price, a list, a button label).",
    )
    expect(page).not.toContain('the top line is its title and what follows is its body')
  })

  it('16 — assets are promised only when there are assets, and DoD 5 is vacuous-safe', () => {
    // This fixture HAS an upload, so `Your role` legitimately names the directory.
    expect(brief).toContain("- `assets/` — the client's real images, build-ready.")
    expect(brief).toContain(
      '5. Every asset the `Assets` section lists appears in its slot with its fit and an alt text you wrote from its description — a package that lists none satisfies this on its own; every SOURCE AN IMAGE slot has its placeholder file and is listed in BUILD_NOTES.md under "Images to replace".',
    )
    expect(brief).not.toContain('5. Every uploaded asset appears in its slot')
  })
})

describe('wide fixture — the v2.3 branches §7.1 cannot reach', () => {
  it('renders the fixed sentence for a FILLED slot with no description [N6]', () => {
    expect(brief).toContain(FALLBACK_NO_DESCRIPTION)
    expect(brief).not.toContain('Client\'s description: «»')
  })

  it('renders "(no description)" in that asset\'s usage entry [N6]', () => {
    expect(brief).toContain(`cover, ${FALLBACK_NO_DESCRIPTION_USAGE}`)
  })

  it('omits the guess clause for an annotation cluster with no target [N7]', () => {
    const bullet = brief
      .split('\n')
      .find((line) => line.startsWith('- A handwritten annotation'))
    expect(bullet).toBeDefined()
    expect(bullet).not.toContain('the nearest block is')
  })

  it('groups the two sketch strokes on the empty slot into ONE cluster [N7]', () => {
    expect(brief).toContain('the client *drew what the image should contain* — 2 stroke(s)')
  })

  it('marks untouched template filler [N12]', () => {
    expect(brief).toContain('(untouched template filler')
  })

  it('marks the right-overflowing block [N13]', () => {
    expect(brief.match(/extends past the right page edge/g)).toHaveLength(1)
  })

  it('names the unreachable page', () => {
    expect(brief).toContain('No link points at: Orphan (`orphan`)')
  })

  it('omits the shared-nav paragraph when the navs differ', () => {
    expect(brief).not.toContain('All pages share an identical nav bar')
  })

  it('pluralizes the inventory count [N11]', () => {
    expect(brief).toContain('4 pages. **Page 1 is the homepage.**')
  })

  it('uses every absent-optional fallback', () => {
    expect(brief).toContain('- **Tagline:** — none provided —')
    expect(brief).toContain("- **About (client's own words):** — none provided —")
    expect(brief).toContain('- **Client style notes:** — none —')
    expect(brief).toContain('- **Vibe:** not specified — infer a fitting tone')
    expect(brief).toContain('- **Preferred colors:** none given — **no colour signal')
  })

  it('computes the [N8] length estimate for both copy types', () => {
    expect(brief).toContain('- Length: fit the box: roughly 41–66 words')
    expect(brief).toContain('- Length: fit the box: a short headline, a few words')
  })

  it('escapes a leading ordered-list marker in a button label as 1\\.', () => {
    expect(brief).toContain('labeled «1\\. Order now»')
  })

  it('emits the rule-8 verbatim sub-block for multi-line real copy', () => {
    expect(brief).toContain('    - leading dash line\n    second line')
  })
  /*
   * The committed artifact. Re-bless it with `npx vitest -u` ONLY after reading
   * the diff: every line of a brief traces to the §3.2 template plus exactly one
   * [N1]–[N13] rule, so a surprise in this file is a narration bug, not noise.
   */
  it('matches the committed wide-fixture brief', async () => {
    await expect(brief).toMatchFileSnapshot('./__snapshots__/wide-fixture.md')
  })
})
