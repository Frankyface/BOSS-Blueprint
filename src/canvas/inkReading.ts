import { inkRegions } from './ink/classify.ts'
import { toInkBlockKind } from './ink/types.ts'
import type { InkBlock, InkRegion, InkRegionKind } from './ink/types.ts'
import type { Block, PenStroke } from './types.ts'

/**
 * WHAT WE READ, IN THE CLIENT'S WORDS.
 *
 * `src/canvas/ink/**` decides what a drawing IS. This module is the other half of
 * that answer: the editor's adapter into it, plus the only vocabulary a
 * non-technical person is ever shown for the result.
 *
 * WHY THE ADAPTER LIVES HERE AND NOT IN `ink/`. `ink/types.ts` deliberately refuses
 * to speak either caller's block vocabulary — the editor says `image` and `nav-bar`,
 * the export says `imageSlot` and `navBar`, and importing either would tie a pure
 * geometry module to a spelling it does not own. `toInkBlockKind` is the sanctioned
 * bridge; this file is the editor's end of it, so the ink module keeps knowing
 * nothing about `Block`.
 *
 * ONE VOCABULARY, NOT TWO. The overlay's tag and the summary sentence are built from
 * the SAME table, so a client who reads "card" on their drawn box and "2 cards" in
 * the sentence beneath the toolbar is being told one thing twice, not two things
 * once. There is no taxonomy here to learn and none of these words appear in the
 * export contract — `InkRegionKind` is the contract, and it is deliberately not what
 * the client is shown.
 */

/**
 * A guess is never shown as a fact. `InkConfidence` has two levels precisely so
 * that uncertainty resolves toward "look at the picture and decide" — a bare `?` is
 * the whole of that idea in the one place the client can act on it.
 */
export const UNSURE_TAG_SUFFIX = '?'

/** Said when the pen has made marks but none of them are buildable yet. */
export const INK_READING_NOTHING_YET =
  'Nothing we can build from yet — draw a box, some words or a picture.'

const SUMMARY_LEAD = 'We read this as'

/**
 * The SAME reading, hedged, whenever any one region came back unsure — so the
 * sentence and the `?` on the tags tell ONE story. A flat "We read this as 2 cards"
 * over a badge that reads `card?` is the app sounding certain while showing it is
 * not; "This looks like 2 cards" matches the hedge the client can already see.
 * Plain language, and — like every word here — it names nothing internal.
 */
const SUMMARY_LEAD_UNSURE = 'This looks like'

interface ReadingWord {
  /** The lowercase one-word label painted beside the shape on the page. */
  readonly tag: string
  /** How one of them is named in the summary sentence. */
  readonly one: string
  /** How several of them are named. */
  readonly many: string
  /**
   * Whether the plural takes a number. `words` and `text` are mass nouns: "2 text"
   * would be worse English AND a worse fact, because the count that matters there
   * is lines of copy, not runs of ink. The overlay shows each one individually
   * anyway, so the sentence stays honest by staying vague.
   */
  readonly isCounted: boolean
}

/**
 * Every kind the classifier can emit has a word here, `annotation` included.
 * A region the classifier could not build from is still the client's work, and
 * showing it as `note` is the difference between "we saw it and it is a note" and
 * the silence that let a red background wave go missing without anyone noticing.
 */
const READING_WORDS: Readonly<Record<InkRegionKind, ReadingWord>> = {
  panel: { tag: 'card', one: 'a card', many: 'cards', isCounted: true },
  writing: { tag: 'words', one: 'some words', many: 'words', isCounted: false },
  navRow: { tag: 'nav', one: 'a nav row', many: 'nav rows', isCounted: true },
  rule: { tag: 'line', one: 'a line', many: 'lines', isCounted: true },
  textPlaceholder: { tag: 'text', one: 'some text', many: 'text', isCounted: false },
  artwork: { tag: 'drawing', one: 'a drawing', many: 'drawings', isCounted: true },
  annotation: { tag: 'note', one: 'a note', many: 'notes', isCounted: true },
}

/**
 * One page's blocks in the three facts the ink module uses. The block's own
 * geometry is echoed verbatim: the module vetoes ink that sits on a real block, so
 * a rounded-off frame here would move the veto's edge away from the client's eyes.
 */
function inkBlocksOf(blocks: readonly Block[]): readonly InkBlock[] {
  return blocks.map((block) => ({
    id: block.id,
    type: toInkBlockKind(block.type),
    frame: { x: block.x, y: block.y, w: block.width, h: block.height },
  }))
}

/**
 * THE EDITOR'S READING OF ONE PAGE — the same `inkRegions` the package is built
 * from, called with the same page, so the client and the builder can never be
 * looking at two different answers.
 */
export function inkReadingRegions(
  blocks: readonly Block[],
  strokes: readonly PenStroke[],
): readonly InkRegion[] {
  return inkRegions(inkBlocksOf(blocks), strokes)
}

/** The label painted beside one region on the page. */
export function inkReadingTag(region: InkRegion): string {
  const word = READING_WORDS[region.kind]
  return region.confidence === 'unsure' ? `${word.tag}${UNSURE_TAG_SUFFIX}` : word.tag
}

/** "a card, some words and 2 drawings" — never "1 cards", never "2 text". */
function phraseFor(kind: InkRegionKind, count: number): string {
  const word = READING_WORDS[kind]
  if (count === 1) return word.one
  return word.isCounted ? `${String(count)} ${word.many}` : word.many
}

/** "a, b and c" — the way a person says a list out loud. */
function joinPhrases(phrases: readonly string[]): string {
  if (phrases.length <= 1) return phrases[0] ?? ''
  return `${phrases.slice(0, -1).join(', ')} and ${phrases[phrases.length - 1] ?? ''}`
}

/**
 * The whole page in one sentence, for the toolbar.
 *
 * This is the KEYBOARD- AND SCREEN-READER-REACHABLE half of the feature: the
 * overlay is decorative SVG inside an `aria-hidden` layer, so without a sentence
 * the reading would only exist for people who can see it painted on the page.
 *
 * Kinds are named in the order they were first read, which is the export's
 * depth-first reading order — down the page, parents before their contents — so the
 * sentence walks the drawing the same way the client's eye does.
 */
export function inkReadingSummary(regions: readonly InkRegion[]): string {
  if (regions.length === 0) return INK_READING_NOTHING_YET

  const counts = new Map<InkRegionKind, number>()
  for (const region of regions) counts.set(region.kind, (counts.get(region.kind) ?? 0) + 1)

  const phrases = [...counts.entries()].map(([kind, count]) => phraseFor(kind, count))
  const anyUnsure = regions.some((region) => region.confidence === 'unsure')
  const lead = anyUnsure ? SUMMARY_LEAD_UNSURE : SUMMARY_LEAD
  return `${lead} ${joinPhrases(phrases)}.`
}
