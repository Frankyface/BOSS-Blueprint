import { describe, expect, it } from 'vitest'

import { BLUEBIRD_SUBMISSION, bluebirdDocument } from '../test/exportFixtures.ts'
import { buildSiteJson, type ExportDocument } from '../export/siteJson.ts'
import { v23TemplateFiller } from '../export/validate/rules/warnings.ts'

import { templateFillerBlocks } from './templateFiller.ts'

/**
 * The pre-flight panel is a VIEW of V23, not a second opinion about it — so the
 * two have to agree on the same design, including §2.6's scope rule that a
 * `section` never counts.
 */

function withFiller(): ExportDocument {
  const document = bluebirdDocument()
  const [home, ...rest] = document.pages
  if (home === undefined) throw new Error('fixture has no home page')

  return {
    ...document,
    pages: [
      {
        ...home,
        blocks: home.blocks.map((block) =>
          block.id === 'rest-home-hero-title' || block.id === 'home-hero-band'
            ? { ...block, fromTemplate: true }
            : block,
        ),
      },
      ...rest,
    ],
  }
}

describe('templateFillerBlocks', () => {
  it('finds nothing in a design the client wrote themselves', () => {
    expect(templateFillerBlocks(bluebirdDocument())).toEqual([])
  })

  it('names the block, its page and its text', () => {
    expect(templateFillerBlocks(withFiller())).toEqual([
      {
        pageId: 'page-home',
        pageName: 'Home',
        blockId: 'rest-home-hero-title',
        type: 'heading',
        preview: 'Bread worth crossing town for',
      },
    ])
  })

  it('ignores a `section` carrying the flag, exactly as V23 does (§2.6)', () => {
    const flagged = templateFillerBlocks(withFiller())

    expect(flagged.some((block) => block.type === 'section')).toBe(false)
  })

  it('agrees with the validator on the same design', () => {
    const site = buildSiteJson(withFiller(), BLUEBIRD_SUBMISSION)
    const fromValidator = v23TemplateFiller({ site, brief: null })

    expect(fromValidator).toHaveLength(templateFillerBlocks(withFiller()).length)
    expect(fromValidator[0]?.rule).toBe('V23')
  })

  it('falls back to an image slot’s description, and shortens a long one', () => {
    const document = bluebirdDocument()
    const [home, ...rest] = document.pages
    if (home === undefined) throw new Error('fixture has no home page')

    const long = 'A very long description of the shopfront '.repeat(4)
    const withSlot: ExportDocument = {
      ...document,
      pages: [
        {
          ...home,
          blocks: home.blocks.map((block) =>
            block.id === 'home-hero-photo'
              ? { ...block, fromTemplate: true, description: long }
              : block,
          ),
        },
        ...rest,
      ],
    }

    const preview = templateFillerBlocks(withSlot)[0]?.preview ?? ''
    expect(preview.endsWith('…')).toBe(true)
    expect(preview.length).toBeLessThanOrEqual(81)
  })
})
