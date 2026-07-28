/**
 * IDENTITY REMAP — `docs/export-format.md` §4.8.
 *
 * Internal app ids are semantic and free-form (`rest-home-hero-title`) because that
 * makes E2E selectors and debugging bearable. The package's ids are ordinals in
 * document order, which makes two exports of an unchanged design byte-identical and
 * makes a fixture diff show semantic changes rather than churned ids.
 *
 * The two worlds are provably separate: V24 blocks a package in which any internal
 * id survived, and the remap table never ships (§4.8 rule 4).
 */

/** §4.8 — every ordinal id is zero-padded to four digits. */
export const ORDINAL_DIGITS = 4

export type IdPrefix = 'pg' | 'blk' | 'nav' | 'stk'

export function ordinalId(prefix: IdPrefix, ordinal: number): string {
  return `${prefix}_${String(ordinal).padStart(ORDINAL_DIGITS, '0')}`
}

/**
 * A counter per prefix. One instance per export pass — page order, then `z`, then
 * item/draw order is the *caller's* walk; this only guarantees the numbering is
 * dense and starts at 1.
 */
export function createIdMinter(): (prefix: IdPrefix) => string {
  const counts = new Map<IdPrefix, number>()

  return (prefix: IdPrefix): string => {
    const next = (counts.get(prefix) ?? 0) + 1
    counts.set(prefix, next)
    return ordinalId(prefix, next)
  }
}

/** §4.8 patterns, reused by V24 to prove the remap was total. */
export const ID_PATTERNS = {
  pg: /^pg_[a-z0-9]{4,16}$/,
  blk: /^blk_[a-z0-9]{4,16}$/,
  nav: /^nav_[a-z0-9]{4,16}$/,
  stk: /^stk_[a-z0-9]{4,16}$/,
  img: /^img_[0-9]{3}$/,
} as const
