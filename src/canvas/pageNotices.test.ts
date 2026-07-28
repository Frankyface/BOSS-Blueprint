import { describe, expect, it } from 'vitest'

import { describeReverted } from './pageNotices.ts'

describe('describeReverted', () => {
  it('says only that the page is gone when nothing pointed at it', () => {
    expect(describeReverted('Menu', 0)).toBe('"Menu" has been deleted.')
  })

  it('uses the SINGULAR verb for one link', () => {
    expect(describeReverted('Menu', 1)).toBe(
      '"Menu" has been deleted. 1 link that pointed at it is no longer linked — ' +
        "pick a new destination when you're ready.",
    )
  })

  it('uses the plural verb for more than one', () => {
    expect(describeReverted('Menu', 3)).toBe(
      '"Menu" has been deleted. 3 links that pointed at it are no longer linked — ' +
        "pick a new destination when you're ready.",
    )
  })

  it('names the page the client actually deleted', () => {
    expect(describeReverted('Book a table', 2)).toContain('"Book a table"')
  })

  it('treats a negative count as none, rather than printing nonsense', () => {
    expect(describeReverted('Menu', -1)).toBe('"Menu" has been deleted.')
  })
})
