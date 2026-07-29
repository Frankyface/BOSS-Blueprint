import { describe, expect, it } from 'vitest'

import { BLUEBIRD_SUBMISSION } from '../../test/exportFixtures.ts'

import { packageFileName, uuid8, UUID8_LENGTH } from './filename.ts'

/** §1 — `blueprint_<business-slug>_<uuid8>.zip`. */

const NAME_PATTERN = /^blueprint_[a-z0-9-]+_[0-9a-f]{8}\.zip$/

describe('uuid8', () => {
  it('takes the first eight hex characters of the submission UUID', () => {
    expect(uuid8(BLUEBIRD_SUBMISSION.id)).toBe('3f2a9c1e')
    expect(uuid8(BLUEBIRD_SUBMISSION.id)).toHaveLength(UUID8_LENGTH)
  })

  it('lower-cases, so the filename can never disagree with the JSON', () => {
    expect(uuid8('3F2A9C1E-8B4D-4E6A-9C0D-5B7E2F1A8D33')).toBe('3f2a9c1e')
  })
})

describe('packageFileName', () => {
  it('names the §7 fixture package', () => {
    expect(packageFileName('Bluebird Bakery', BLUEBIRD_SUBMISSION.id)).toBe(
      'blueprint_bluebird-bakery_3f2a9c1e.zip',
    )
  })

  it('folds diacritics and drops symbols and emoji (§4.1 steps 1–2)', () => {
    expect(packageFileName('Café Ürsula & Co. 🥐', BLUEBIRD_SUBMISSION.id)).toBe(
      'blueprint_cafe-ursula-co_3f2a9c1e.zip',
    )
  })

  it('falls back to `business` when the name slugifies to nothing (v2.1 ruling)', () => {
    expect(packageFileName('🥐🥖🍞', BLUEBIRD_SUBMISSION.id)).toBe('blueprint_business_3f2a9c1e.zip')
    expect(packageFileName('   ', BLUEBIRD_SUBMISSION.id)).toBe('blueprint_business_3f2a9c1e.zip')
  })

  it('always matches the convention the round-trip gate checks (F01)', () => {
    const names = ['Bluebird Bakery', 'ÜBER-Långnamn Aktiebolag för Bröd', '🥐', 'a'].map((business) =>
      packageFileName(business, BLUEBIRD_SUBMISSION.id),
    )

    for (const name of names) expect(name).toMatch(NAME_PATTERN)
  })
})
