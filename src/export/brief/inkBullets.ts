/**
 * ONE BULLET PER DRAWN REGION — `docs/export-format.md` §3.2 (these branch texts are
 * normative, verbatim) and §4.4 [N14].
 *
 * THE PROSE IS THE FEATURE. `penRegions` already says, machine-readably, that the
 * client drew two matching cards, a heading, a nav row and a cat. What decided whether
 * any of it reached the built site was a brief that said in bold "do not invent extra
 * sections" and offered a pen mark exactly three readings — "words, an arrow, or an
 * emphasis mark" — with permission to skip it if illegible. A zero-context builder
 * resolving that conflict shipped nothing. Every branch below removes one specific
 * permission to ship nothing.
 *
 * Every bullet carries `**BUILD THIS FROM INK**`, the third counted marker (§3.3 rule
 * 2), which V30 pins at one per TOP-LEVEL region so a forgotten region BLOCKs instead
 * of vanishing. The one exception is a sibling set's lead bullet: a set of two cards is
 * TWO top-level regions, so the markers belong on the two members actually built and
 * the lead bullet states the component contract without one.
 *
 * NO `«…»`, EVER. V7 requires every guillemet span to resolve to a real `site.json`
 * string; ink carries geometry and never text, so there is nothing here it could
 * legitimately quote. Ink prose is quote-free by construction, asserted per branch.
 */

import { SIBLING_ALIGN_TOL_PX } from '../../canvas/ink/constants.ts'
import type { ExportPage, ExportPenRegion } from '../types.ts'

import {
  type Contents,
  type CopySources,
  contentsIds,
  contentsInstruction,
  contentsOf,
  contentsSummary,
  copySource,
  copySourceAndStyle,
  counted,
  inkIds,
  isEmpty,
  placeholderLines,
  tuple,
} from './inkContents.ts'
import { num } from './text.ts'

const BUILD = '**BUILD THIS FROM INK**'

/** Nested bullets are indented exactly two spaces (§3.3 rule 10 / Appendix A). */
const NESTED_INDENT = '  '

/**
 * Two drawn boxes are "a row" when their centres sit within this of each other.
 * Imported from the producer rather than restated, because a set the producer ordered
 * left→right and this module called a column would be a brief that contradicts its own
 * `setIndex`.
 */
const SET_ROW_TOL_PX = SIBLING_ALIGN_TOL_PX

/** §3.2 — appended to every bullet the producer marked `unsure`. */
const UNSURE_SUFFIX =
  'This reading is a geometric guess — if the PNG shows something different, trust the PNG, build ' +
  'what you see, and log the difference in BUILD_NOTES.md.'

/**
 * §3.2 — appended to EVERY artwork bullet. Geometry genuinely cannot decide whether a
 * drawing is line art or a stand-in for a photograph, so the call is handed to the
 * vision-capable builder explicitly rather than guessed at here.
 *
 * THE TWO ROUTES ARE EXCLUSIVE (v2.5). A band's own sentence rules it decorative and
 * out of the accessibility tree; this one orders alt text. Read together they asked
 * for both at once, which all three builders flagged. A band that takes the image
 * route stops being decoration, and the closing sentence says so — the alt text and
 * the `aria-hidden` never apply to the same element.
 */
function artworkJudgement(isBand: boolean): string {
  const placement = isBand
    ? 'run it full-bleed at this `y` in place of the band'
    : 'place it at this position and size'
  const swapped = isBand
    ? ' Taking that route replaces the decoration with content: the image carries that alt text and no `aria-hidden`.'
    : ''

  return (
    'One judgement call is yours: if, looking at it, the drawing is plainly a rough stand-in for a ' +
    'photograph rather than line art the client wants on the page — a stick figure for a person, a ' +
    'boxy "house" for a property photo, a scribbled landscape — treat it as an image brief instead. ' +
    `Source or generate a real image of what it depicts, ${placement}, write alt text from what it ` +
    `shows, and list it under "Images to replace" in BUILD_NOTES.md with your reasoning.${swapped} ` +
    'Prefer reproducing the ink when it is genuinely a drawing (a cat, a logo mark, a wave, a ' +
    'squiggle); prefer a real image when it is plainly a stand-in for one.'
  )
}

function sentences(parts: readonly string[]): string {
  return parts.filter((part) => part !== '').join(' ')
}

function unsure(region: ExportPenRegion): string {
  return region.confidence === 'unsure' ? UNSURE_SUFFIX : ''
}

/* ── panels, alone and in sets ─────────────────────────────────────────────── */

function panelInstruction(
  region: ExportPenRegion,
  contents: Contents,
  page: ExportPage,
  noun: string,
  sources: CopySources,
): string {
  if (isEmpty(contents)) {
    return (
      'an empty drawn box is a placeholder for media the client has not supplied. Build a real ' +
      'image element at this position and aspect ratio, create the placeholder as a local file at ' +
      `\`assets/placeholders/${region.id}.<ext>\` (a stock or generated photo that fits this ` +
      'business is best; a clean solid-colour or gradient panel in the site palette is an ' +
      'acceptable fallback — never grey lorem-ipsum with a filename on it), write alt text from ' +
      `${copySource(sources)}, and list it under "Images to replace" in BUILD_NOTES.md with the ` +
      'page, the region id and its coordinates.'
    )
  }
  return sentences([
    `build this as a real ${noun} at this position and proportion — a styled container in the ` +
      "site's visual language, not a reproduction of the hand-drawn border.",
    contentsInstruction(contents, page, noun, sources),
  ])
}

function inkClause(region: ExportPenRegion, contents: Contents): string {
  const inside = contentsIds(contents)
  if (inside.length === 0) return `Ink: ${inkIds(region.strokeIds)}.`
  return `Ink: ${inkIds(region.strokeIds)} for the box, ${inkIds(inside)} for what is drawn inside.`
}

function panelBullet(
  region: ExportPenRegion,
  page: ExportPage,
  all: readonly ExportPenRegion[],
  label: string,
  indent: string,
  sources: CopySources,
): string {
  const contents = contentsOf(region, all)
  const empty = isEmpty(contents)
  const head = empty
    ? `${indent}- **${label}** — a box the client drew at ${tuple(region.bbox)} with nothing drawn inside it.`
    : `${indent}- **${label}** — a box the client drew at ${tuple(region.bbox)}, with ${contentsSummary(contents)} inside it.`

  return sentences([
    `${head} ${BUILD}: ${panelInstruction(region, contents, page, empty ? 'box' : 'card', sources)}`,
    inkClause(region, contents),
    unsure(region),
  ])
}

/** §3.2 — the sibling set: ONE component, instantiated once per member. */
export function setBullets(
  members: readonly ExportPenRegion[],
  page: ExportPage,
  all: readonly ExportPenRegion[],
  sources: CopySources,
): string[] {
  const centres = members.map((member) => member.bbox.y + member.bbox.h / 2)
  const isRow = Math.max(...centres) - Math.min(...centres) <= SET_ROW_TOL_PX
  const gaps = members.slice(1).map((member, index) => {
    const previous = members[index]?.bbox
    if (previous === undefined) return 0
    return isRow
      ? member.bbox.x - (previous.x + previous.w)
      : member.bbox.y - (previous.y + previous.h)
  })
  const gap = gaps.length === 0 ? 0 : Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length)
  const total = members.length

  const contract =
    `- **Drawn card set** — ${String(total)} boxes the client drew at ` +
    `${members.map((member) => tuple(member.bbox)).join(', ')}: matching in size, ` +
    // "side by side in ONE ROW" was the same layout claim in weaker form, so the
    // measured relationship is stated without naming a row or a column at all.
    `${isRow ? 'side by side at the same height' : 'stacked one above the next'}, about ${String(gap)}px apart. ` +
    `These are ONE component used ${String(total)} times. Build a single card component — one ` +
    'class, one set of styles — and instantiate it once per box below, in the order listed. Every ' +
    'instance gets identical padding, corner radius, border or shadow treatment, background and ' +
    'internal type scale; only the words inside differ. ' +
    // The old wording decreed an "N-up row", which contradicts `Your role`'s ruling
    // that x/w is the authority on horizontal arrangement — a third region at the same
    // y makes the row wider than the set, and all three test builders followed the
    // coordinates and logged a deviation from the brief. The set is a COMPONENT; the
    // row is composed from the geometry, so the two rules can no longer disagree.
    `What you build is the component and its ${String(total)} instances, not a row: how many ` +
    'columns the row around them has is decided by the `x`/`y` coordinates of everything at this ' +
    'height — a block or another drawn region sharing this band of `y` belongs to the same row and ' +
    `makes it wider than ${String(total)} columns. Compose the row from the coordinates (\`Your ` +
    'role`: the `x`/`w` coordinates are the authority on horizontal arrangement), place these ' +
    `${String(total)} instances in it in the order listed, and let the whole row stack on mobile ` +
    'per `Responsive rules`. ' +
    "The client's hand-drawn border is a *sketch of a card*, not a spec — style it in this site's " +
    'own visual language (see `Look & feel`), never as a wobbly hand-drawn outline. If the words ' +
    'you read make the set look like a pricing table, build it as one, with the same emphasis ' +
    'applied to the same line in every instance.'

  return [
    contract,
    ...members.map((member, index) =>
      panelBullet(
        member,
        page,
        all,
        `Drawn card ${String(index + 1)} of ${String(total)}`,
        NESTED_INDENT,
        sources,
      ),
    ),
  ]
}

/* ── everything else ───────────────────────────────────────────────────────── */

function writingBullet(
  region: ExportPenRegion,
  page: ExportPage,
  isH1: boolean,
  sources: CopySources,
): string {
  const text = region.text
  const wordCount = text?.words ?? 0
  const words = counted(wordCount, 'word', 'words')
  const glyph = `letters about ${num(text?.glyphHeight ?? 0)}px tall`

  if (text !== null && text.emphasis !== 'body') {
    const largest = text.emphasis === 'display' ? ', the largest writing on this page' : ''
    return sentences([
      `- **Drawn heading** — handwriting at ${tuple(region.bbox)}${largest} (${words}, ${glyph}).`,
      `${BUILD}: this is a real heading. Read the words in \`${page.screenshot}\` inside ` +
        `${tuple(region.bbox)} and set them as text at that position, at a size that keeps the same ` +
        'relative prominence — do not reproduce the handwriting, and do not reach for a handwriting ' +
        'font unless `Look & feel` asks for one.',
      isH1 ? 'No block on this page supplies an `<h1>`, so this is the `<h1>`.' : '',
      // The business NAME is never absent, so this fallback never needed the
      // empty-source caveat v2.5 stapled to it — it named the one field in `The
      // business` that is always filled and then denied the section had anything.
      'If you cannot read it, use the business name from `The business` above as the heading and ' +
        'log it under "Pen marks I could not read".',
      `Ink: ${inkIds(region.strokeIds)}.`,
      unsure(region),
    ])
  }

  // The fallback is scaled to the ink the classifier actually measured: "one fitting
  // sentence" for a 2-word box is a fallback that overshoots its own data, and a
  // builder who noticed wrote two words and logged a deviation from the brief.
  const length = wordCount > 0 ? `about ${words}, not a sentence` : 'at the length the ink suggests'
  return sentences([
    `- **Drawn words** — handwriting at ${tuple(region.bbox)} (${words}, ${glyph}).`,
    `${BUILD}: this is a real line of text. Read the words in \`${page.screenshot}\` inside that ` +
      'box and set them as body text at that position, using their words exactly. If you cannot ' +
      `read it, write a fitting replacement at the length the ink measures — ${length} — from ` +
      `${copySource(sources)}, and log it under "Pen marks I could not read".`,
    `Ink: ${inkIds(region.strokeIds)}.`,
    unsure(region),
  ])
}

function navBullet(region: ExportPenRegion, page: ExportPage): string {
  const words = region.text?.words ?? 0
  const hasNavBlock = page.blocks.some((block) => block.type === 'navBar')

  return sentences([
    `- **Drawn nav** — ${counted(words, 'word', 'separate words')} drawn in a regular row across ` +
      `the top of the page at ${tuple(region.bbox)}.`,
    `${BUILD}: this is the site navigation for this page. Read the ${String(words)} words in ` +
      `\`${page.screenshot}\` inside that box, left → right, and build them as one real nav bar in ` +
      'exactly that order. Link each word to the page in `Site inventory` whose name or slug ' +
      // The carve-out is stated inline because the rule it depends on lives three
      // sections away: page 1's slug is a title, not a URL, so a word matching it must
      // link to `/`. One builder in three found that on his own.
      'matches it, case-insensitively — to `/` when the page it matches is page 1, whose slug is a ' +
      "page title and never a URL (`Definition of done` item 1), and to that page's own URL " +
      'otherwise; render any word with no match as an inert `<a>` with no `href` and ' +
      'non-interactive styling, and log it in BUILD_NOTES.md.',
    hasNavBlock
      ? ''
      : 'No `navBar` block exists on this page, so this drawn nav IS the navigation — apply the ' +
        'nav rules in `Responsive rules` to it, including the mobile disclosure menu, and repeat it ' +
        'on every page unless another page draws or blocks out its own.',
    // "Label it from the inventory page it most plausibly points at" gave the SAME
    // label to all three items of a three-word nav on a one-page site: two builders
    // guessed from glyph-run lengths and one shipped `Drawn … …`. A fixed sequence
    // that never repeats and never elides is what makes three builders converge.
    'If you cannot read an item, do not guess it from the shape of the ink, and never ship a blank ' +
      'label, an ellipsis, or the same label twice. Fill the unreadable items left → right from ' +
      'this fixed sequence, skipping any label a readable item already uses: first the page names ' +
      'in `Site inventory`, in inventory order; then `About`, `Services`, `Work`, `Contact`; then ' +
      "the item's own left → right position — `Item 5`, `Item 6`, and so on. The sequence does not " +
      'depend on how many pages this site has, so the same drawn nav always produces the same ' +
      'labels. Link each label you filled in by the same match rule above, and log every one in ' +
      'BUILD_NOTES.md under "Pen marks I could not read".',
    `Ink: ${inkIds(region.strokeIds)}.`,
    unsure(region),
  ])
}

function ruleBullet(region: ExportPenRegion): string {
  const vertical = region.variant === 'vertical'
  const length = num(vertical ? region.bbox.h : region.bbox.w)

  return sentences([
    `- **Drawn rule** — a straight ${vertical ? 'vertical' : 'horizontal'} line at ` +
      `${tuple(region.bbox)}, ${length}px long.`,
    // "It is not content" (v2.5) read to a builder as "optional", against `Your
    // role`'s "ink IS design" and DoD 8's "every drawn region is a real, styled
    // element". What the sentence is FOR is "there is nothing to read here".
    `${BUILD}: build it as a divider — a hairline rule, or a bottom border on whatever sits ` +
      "directly above it, in the site's own visual language. It carries no words.",
    `Ink: ${inkIds(region.strokeIds)}.`,
    unsure(region),
  ])
}

function placeholderBullet(region: ExportPenRegion, sources: CopySources): string {
  const lines = placeholderLines(region)

  return sentences([
    // "up to Npx wide", not "each about Npx long": the box is the UNION of the lines,
    // so its width is the widest of them and a ragged last line makes "each" false.
    `- **Drawn placeholder text** — ${counted(lines, 'short wavy line', 'short wavy lines stacked')} ` +
      `at ${tuple(region.bbox)}, up to ${num(region.bbox.w)}px wide.`,
    `${BUILD}: this is the client showing you WHERE body copy goes, not words to read — squiggles ` +
      `like these have no letters in them. Write ${counted(lines, 'line', 'lines')} of real body ` +
      `copy for this position from ${copySourceAndStyle(sources)}, at roughly the width and ` +
      'line count drawn, and log in BUILD_NOTES.md under "Copy I wrote for drawn placeholder text" ' +
      'what you wrote and where. Do not try to transcribe these lines and do not build them as ' +
      'rules or dividers.',
    `Ink: ${inkIds(region.strokeIds)}.`,
    unsure(region),
  ])
}

/**
 * The SVG reproduction recipe leads, because it is the one instruction that still
 * produces something correct when the builder cannot tell what the drawing depicts.
 *
 * A BAND IS ONE INSTRUCTION, NOT THREE (v2.5). The general branch binds the drawing
 * to its own geometry — "at this position and size", "recognisably the same drawing
 * in the same place" — and a band is then stretched to the viewport, so the bullet
 * bound geometry it went on to discard. Three builders in each of two consecutive
 * runs read the pair as a contradiction, and the old "For a band the width wins" was
 * an admission of it rather than a resolution. A band now states its own placement
 * and its own fidelity rule, and the clauses those replace are not emitted.
 */
function artworkBullet(region: ExportPenRegion, page: ExportPage): string {
  const isBand = region.variant === 'band'
  const placement = isBand ? '' : ' at this position and size'
  const fidelity = isBand
    ? '.'
    : ' in the same shapes and proportions — but keep it recognisably the same drawing in the same place.'
  const band = isBand
    ? `This region is ${num(region.bbox.w)}px wide and ${num(region.bbox.h)}px tall — it spans ` +
      'most of the page width and is far wider than it is tall, so it is a full-bleed decorative ' +
      'band, not an inline picture: stretch the `<svg>` to 100% of the viewport width at this ' +
      '`y`, behind the content, with `preserveAspectRatio="none"`. Its aspect ratio is expected ' +
      'to change — keep the shapes and the character of the line, not the proportions. It is ' +
      'decorative: build it, and keep it out of the accessibility tree — `aria-hidden="true"`, ' +
      'no `role="img"`, no `aria-label`.'
    : ''
  // A band gets ONE accessibility treatment. Emitting the generic role/aria-label
  // sentence as well asked for two mutually exclusive ones, which all three builders
  // flagged — so the band branch suppresses it rather than contradicting it.
  const label = isBand
    ? ''
    : 'give the `<svg>` a `role="img"` and an `aria-label` saying what that is, '

  return sentences([
    `- **Drawn artwork** — a drawing at ${tuple(region.bbox)}, ` +
      `${counted(region.strokeIds.length, 'stroke', 'strokes')}: not writing, not a container, not ` +
      'a line.',
    `${BUILD}: reproduce the client's drawing as real artwork on the page${placement}. The exact ` +
      `ink is in \`site.json\` — for each of ${inkIds(region.strokeIds)} take ` +
      '`points`, `color` and `width` and emit one `<polyline>` per stroke inside a single ' +
      '**inline** `<svg>` whose `viewBox` is this region\'s box, with `fill="none"`, `stroke` set ' +
      "to that stroke's `color`, `stroke-width` set to that stroke's `width`, " +
      '`stroke-linecap="round"` and `stroke-linejoin="round"`. That reproduces the client\'s line ' +
      'exactly — inline it in the HTML, do not link an external file, and do not trace it by hand. ' +
      'You may then restyle it to fit `Look & feel`: recolour it to a palette colour, thicken or ' +
      `thin the line, smooth it, or redraw it more cleanly${fidelity} Look at it in ` +
      `\`${page.screenshot}\` at ${tuple(region.bbox)} first so you know what it depicts, ` +
      `${label}and record in BUILD_NOTES.md what you decided it was and what you did to it.`,
    band,
    artworkJudgement(isBand),
    unsure(region),
  ])
}

/** One top-level region, narrated. A set is `setBullets`' job, never this one's. */
export function regionBullet(
  region: ExportPenRegion,
  page: ExportPage,
  all: readonly ExportPenRegion[],
  isH1: boolean,
  sources: CopySources,
): string {
  switch (region.kind) {
    case 'panel':
      return panelBullet(
        region,
        page,
        all,
        isEmpty(contentsOf(region, all)) ? 'Drawn box (empty)' : 'Drawn card',
        '',
        sources,
      )
    case 'writing':
      return writingBullet(region, page, isH1, sources)
    case 'navRow':
      return navBullet(region, page)
    case 'rule':
      return ruleBullet(region)
    case 'textPlaceholder':
      return placeholderBullet(region, sources)
    case 'artwork':
      return artworkBullet(region, page)
  }
}
