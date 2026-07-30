/**
 * WHAT IS INSIDE A DRAWN REGION — the shared half of `docs/export-format.md` [N14].
 *
 * Split out of `ink.ts` so the prose modules stay under the 400-line house limit, and
 * because this is the half with the two rules that must not drift:
 *
 *  1. A container is described over ALL its descendants, not its direct children.
 *     Nesting reaches two deep, and a grandchild described nowhere would be ink that
 *     reaches the builder in no form at all — the exact failure V30 exists to make
 *     loud rather than silent.
 *  2. Only measured numbers are printed. A `textPlaceholder` stack's line count comes
 *     from `strokeIds.length` (see `placeholderLines`); handwriting never prints a
 *     line count at all, because the producer does not measure one.
 */

import type { ExportBbox, ExportPage, ExportPenRegion, SiteJson } from '../types.ts'

import { num } from './text.ts'

/* ── formatting ────────────────────────────────────────────────────────────── */

export function tuple(bbox: ExportBbox): string {
  return `(${num(bbox.x)}, ${num(bbox.y)}, ${num(bbox.w)}, ${num(bbox.h)})`
}

export function tuples(regions: readonly ExportPenRegion[]): string {
  return regions.map((region) => tuple(region.bbox)).join(' and ')
}

export function inkIds(ids: readonly string[]): string {
  return ids.map((id) => `\`${id}\``).join(', ')
}

export function counted(value: number, one: string, many: string): string {
  return `${String(value)} ${value === 1 ? one : many}`
}

/* ── what `The business` actually offers a builder who must invent copy ────── */

/**
 * Six ink bullets send the builder to `The business` for fallback copy. On the
 * flagship pen-only package that section reads "— none provided —" for BOTH the
 * tagline and the About text, so those bullets pointed at a source that does not
 * exist.
 *
 * v2.5 fixes that by SUBTRACTION. The v2.5 fix appended a caveat to each of the six,
 * so every one of them ordered the builder to write from `The business` and declared
 * it empty in the same sentence — a builder quoted it back as "it orders me to write
 * from a source it declares empty". A bullet now NAMES A SOURCE THAT EXISTS instead:
 * the state travels down with the bullets so each one says what to write from, never
 * what it cannot write from. The situation itself is stated once, in `The business`.
 */
export interface CopySources {
  /** `The business` carries a tagline or About text to write from. */
  readonly hasBusinessWords: boolean
}

/**
 * The source a bullet names for words the builder must invent. The business NAME is
 * never absent, and the sketch is always in front of them, so the empty case has a
 * real answer and never needs a caveat.
 */
export function copySource(sources: CopySources): string {
  return sources.hasBusinessWords ? '`The business` above' : 'the business name and what the sketch shows'
}

/** The same, for the bullets that also send the builder to `Look & feel` for tone. */
export function copySourceAndStyle(sources: CopySources): string {
  return sources.hasBusinessWords
    ? '`The business` and `Look & feel` above'
    : 'the business name, what the sketch shows, and `Look & feel` above'
}

/**
 * §3.2 — the drawn copy the copy-list section states AFTER its numbered list, split
 * by the job it actually is.
 *
 * TWO CATEGORIES, NOT ONE TOTAL (v2.5). A `textPlaceholder` stack is copy to WRITE:
 * its ink is wavy lines with no letters in it, so there is nothing there to read. A
 * `writing` region is words to TRANSCRIBE: they are already in the PNG, and an
 * authored replacement is the fallback for a run the builder cannot read. Merging
 * the two under one number is what made five of eight "copy you must write" items
 * transcription tasks.
 *
 * A `navRow` is NEITHER, and is counted in neither. Its bullet forbids guessing from
 * the ink and hands the builder a fixed label sequence instead — a lookup, not a
 * reading — so counting it as handwriting printed "5 runs" against the four
 * `writing` regions `site.json` carries, which a builder checked and reported.
 *
 * Counted at ANY depth, because a card's handwriting is copy whether or not it has a
 * bullet of its own.
 */
export function drawnCopyCounts(site: SiteJson): { placeholders: number; handwriting: number } {
  const regions = site.pages.flatMap((page) => [...regionsOf(page)])
  return {
    placeholders: regions.filter((region) => region.kind === 'textPlaceholder').length,
    handwriting: regions.filter((region) => region.kind === 'writing').length,
  }
}

function joinPhrases(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? ''
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1] ?? ''}`
}

/* ── the region tree ───────────────────────────────────────────────────────── */

export function regionsOf(page: ExportPage): readonly ExportPenRegion[] {
  return page.penRegions ?? []
}

/** V30 counts exactly these: a nested region is described inside its parent's bullet. */
export function topLevelRegions(page: ExportPage): readonly ExportPenRegion[] {
  return regionsOf(page).filter((region) => region.parentRegionId === null)
}

function descendantsOf(
  region: ExportPenRegion,
  all: readonly ExportPenRegion[],
): readonly ExportPenRegion[] {
  const direct = all.filter((other) => other.parentRegionId === region.id)
  return direct.flatMap((child) => [child, ...descendantsOf(child, all)])
}

export interface Contents {
  readonly words: readonly ExportPenRegion[]
  readonly placeholders: readonly ExportPenRegion[]
  readonly rules: readonly ExportPenRegion[]
  readonly artwork: readonly ExportPenRegion[]
  readonly panels: readonly ExportPenRegion[]
}

export function contentsOf(
  region: ExportPenRegion,
  all: readonly ExportPenRegion[],
): Contents {
  const inside = descendantsOf(region, all)
  const ofKind = (...kinds: readonly ExportPenRegion['kind'][]): readonly ExportPenRegion[] =>
    inside.filter((child) => kinds.includes(child.kind))

  return {
    words: ofKind('writing', 'navRow'),
    placeholders: ofKind('textPlaceholder'),
    rules: ofKind('rule'),
    artwork: ofKind('artwork'),
    panels: ofKind('panel'),
  }
}

export function isEmpty(contents: Contents): boolean {
  return (
    contents.words.length === 0 &&
    contents.placeholders.length === 0 &&
    contents.rules.length === 0 &&
    contents.artwork.length === 0 &&
    contents.panels.length === 0
  )
}

/**
 * A placeholder stack's line count, taken from its strokes rather than from a `lines`
 * field the contract does not ship for a region with no words. They are equal by
 * construction — only a SINGLE-stroke squiggle is ever classified as a placeholder,
 * and the stack merger keeps one per line — and `ink.test.ts` pins that equality on
 * real traced geometry so a change to the merger cannot make the brief lie.
 */
export function placeholderLines(region: ExportPenRegion): number {
  return region.strokeIds.length
}

function placeholderTotal(contents: Contents): number {
  return contents.placeholders.reduce((total, region) => total + placeholderLines(region), 0)
}

export function contentsSummary(contents: Contents): string {
  const parts: string[] = []
  if (contents.words.length > 0) {
    parts.push(
      contents.words.length === 1
        ? 'handwriting'
        : `${String(contents.words.length)} runs of handwriting`,
    )
  }
  if (contents.placeholders.length > 0) {
    parts.push(counted(placeholderTotal(contents), 'placeholder line', 'placeholder lines'))
  }
  if (contents.rules.length > 0) {
    parts.push(counted(contents.rules.length, 'drawn line', 'drawn lines'))
  }
  if (contents.artwork.length > 0) {
    parts.push(
      contents.artwork.length === 1 ? 'a drawing' : `${String(contents.artwork.length)} drawings`,
    )
  }
  if (contents.panels.length > 0) {
    parts.push(
      contents.panels.length === 1
        ? 'a nested box'
        : `${String(contents.panels.length)} nested boxes`,
    )
  }
  return joinPhrases(parts)
}

/** Every stroke inside the region, so the 4× rebuild ladder can reach all of it. */
export function contentsIds(contents: Contents): readonly string[] {
  return [
    ...contents.words,
    ...contents.placeholders,
    ...contents.rules,
    ...contents.artwork,
    ...contents.panels,
  ].flatMap((region) => region.strokeIds)
}

/** One sentence per kind of thing drawn inside a container, in reading priority. */
export function contentsInstruction(
  contents: Contents,
  page: ExportPage,
  noun: string,
  sources: CopySources,
): string {
  const said: string[] = []

  if (contents.words.length > 0) {
    // "the top line is its title and what follows is its body" needs a line to
    // follow. A container holding ONE run of handwriting has none — `text.lines` is
    // 1 for every `writing` region by construction — and a builder reading the two
    // card bullets against `site.json` reported "there is no 'what follows'". The
    // split is therefore emitted only where the ink really carries two runs.
    const single = contents.words.length === 1
    const ordering = single
      ? ` — it is this ${noun}'s only run of handwriting, so it is its title`
      : ', in the order they are written, topmost first — the top line is its title and what follows is its body'
    said.push(
      `Read the words in \`${page.screenshot}\` inside ${tuples(contents.words)} and use them ` +
        `verbatim as this ${noun}'s content${ordering}, unless the words themselves plainly ` +
        `say otherwise (a price, a list, a button label). Mark that title up as a real heading one ` +
        `rung below the page's \`<h1>\` — \`<h2>\`, or \`<h3>\` where a nearer heading owns this ` +
        `section — never a styled \`<div>\`: the ink's measured size is not a heading level. ` +
        `${single ? 'If you cannot read it' : 'If you cannot read a line'}, write fitting copy for ` +
        `it from ${copySource(sources)} at the length the ink suggests and log it under "Pen marks ` +
        `I could not read".`,
    )
  }
  if (contents.placeholders.length > 0) {
    const lines = placeholderTotal(contents)
    said.push(
      `The ${counted(lines, 'wavy placeholder line', 'wavy placeholder lines')} inside it at ` +
        `${tuples(contents.placeholders)} carry no letters — write ${counted(lines, 'line', 'lines')} ` +
        `of real body copy there from ${copySourceAndStyle(sources)}, and log what you ` +
        `wrote in BUILD_NOTES.md under "Copy I wrote for drawn placeholder text".`,
    )
  }
  if (contents.rules.length > 0) {
    said.push(
      `The straight line drawn inside it at ${tuples(contents.rules)} is a divider — build it as a ` +
        `hairline rule, or as a bottom border on whatever sits directly above it.`,
    )
  }
  if (contents.artwork.length > 0) {
    said.push(
      `The drawing inside it at ${tuples(contents.artwork)} is the client's own artwork — reproduce ` +
        `it as an inline \`<svg>\`, one \`<polyline>\` per stroke taking \`points\`, \`color\` and ` +
        `\`width\` from \`site.json\` with the \`viewBox\` set to that box, restyle it to fit ` +
        `\`Look & feel\`, and give it \`role="img"\` and an \`aria-label\` saying what it depicts.`,
    )
  }
  if (contents.panels.length > 0) {
    said.push(
      `The box drawn inside it at ${tuples(contents.panels)} is a nested panel — build it as a ` +
        `styled sub-container in the same visual language.`,
    )
  }
  return said.join(' ')
}
