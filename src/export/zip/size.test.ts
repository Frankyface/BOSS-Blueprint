import { describe, expect, it } from 'vitest'

import { MAX_ZIP_BYTES, SIZE_TARGET_BYTES } from './constants.ts'
import { formatPackageSize, sizeBand } from './size.ts'

/** The number the client sees is the number they will forward. */

describe('formatPackageSize', () => {
  it('rounds to whole KB, per §4.4 [N11]', () => {
    expect(formatPackageSize(0)).toBe('~0 KB')
    expect(formatPackageSize(1024)).toBe('~1 KB')
    expect(formatPackageSize(24_300)).toBe('~24 KB')
    expect(formatPackageSize(1024 * 1024)).toBe('~1024 KB')
  })

  it('switches to MB once the KB figure passes 1024', () => {
    expect(formatPackageSize(1024 * 1024 + 1024)).toBe('~1.0 MB')
    expect(formatPackageSize(9 * 1024 * 1024)).toBe('~9.0 MB')
    expect(formatPackageSize(Math.round(1.5 * 1024 * 1024))).toBe('~1.5 MB')
  })
})

describe('sizeBand', () => {
  it('is comfortable up to the ladder target', () => {
    expect(sizeBand(100_000)).toBe('comfortable')
    expect(sizeBand(SIZE_TARGET_BYTES)).toBe('comfortable')
  })

  it('is large between the target and V10s warn line', () => {
    expect(sizeBand(SIZE_TARGET_BYTES + 1)).toBe('large')
    expect(sizeBand(MAX_ZIP_BYTES)).toBe('large')
  })

  it('is over the guideline past V10, which still never blocks', () => {
    expect(sizeBand(MAX_ZIP_BYTES + 1)).toBe('over-guideline')
  })
})
