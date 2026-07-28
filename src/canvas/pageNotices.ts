/**
 * What we SAY when a page is deleted.
 *
 * Its own module, and pure, so the wording is unit-testable without mounting the
 * page strip (review bounce #4). Deleting a page can silently unwire buttons and
 * menu items on other pages — the client has to be told how many, in a sentence
 * that reads correctly whether it is one or five.
 */

/**
 * "1 link … is no longer linked" / "3 links … are no longer linked".
 *
 * The verb agrees with the count. The old wording said "1 link … are no longer
 * linked", which is the kind of small wrongness that makes a client trust the
 * rest of the message less.
 */
export function describeReverted(pageName: string, revertedLinks: number): string {
  const deleted = `"${pageName}" has been deleted.`
  if (revertedLinks <= 0) return deleted

  const subject =
    revertedLinks === 1
      ? '1 link that pointed at it is'
      : `${String(revertedLinks)} links that pointed at it are`

  return `${deleted} ${subject} no longer linked — pick a new destination when you're ready.`
}
