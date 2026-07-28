import { describe, expect, it } from 'vitest'

import type { SiteJson } from '../types.ts'

import { FALLBACK_NO_DESCRIPTION, FALLBACK_NO_DESCRIPTION_USAGE } from './boilerplate.ts'
import { generateBrief } from './generateBrief.ts'

/**
 * THE WIDE FIXTURE — every branch §7.1 cannot reach (Appendix A: "all six block
 * types, both copy modes, uploaded + empty image slot, internal + external + none
 * links, identical AND differing navs, both pen roles on empty and filled slots,
 * fromTemplate filler, unreachable page, absent optionals"), plus §3.3 rule-7/8
 * escaping torture strings.
 *
 * Not a byte-exactness test — the spec has no expected output for it. It is an
 * INVARIANTS harness: V7's counting contract, table integrity, guillemet integrity,
 * printed-id integrity, and the v2.3 fallback strings.
 */

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
    expect(rows).toHaveLength(3)
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
    expect(brief).toContain('3 pages. **Page 1 is the homepage.**')
  })

  it('uses every absent-optional fallback', () => {
    expect(brief).toContain('- **Tagline:** — none provided —')
    expect(brief).toContain("- **About (client's own words):** — none provided —")
    expect(brief).toContain('- **Client style notes:** — none —')
    expect(brief).toContain('- **Vibe:** not specified — infer a fitting tone')
    expect(brief).toContain('- **Preferred colors:** none given — derive a palette')
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
})
