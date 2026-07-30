import { PAGE_WIDTH_PX } from '../../canvas/constants.ts'
import type { PenPoint, PenStroke } from '../../canvas/types.ts'

import { INK_EXPECTATION_SAFETY_FACTOR, INK_LUMA_DELTA } from './constants.ts'
import { inkFloorFor, LUMA_BLUE, LUMA_GREEN, LUMA_RED, WHITE_LUMA } from './sanity.ts'

/**
 * DOES THIS PAGE'S INK PROMISE ENOUGH TO BE WORTH CHECKING? — the gate in front of
 * V6's ink floor for a page drawn with the pen (`docs/export-format.md` §5 V6).
 *
 * The floor exists to catch one failure: the capture came back empty. It can only
 * catch it where there is a reason to expect ink in the first place. A block is
 * such a reason on its own — the smallest one the editor allows already paints
 * more than the floor asks for. A pen stroke is not: the client may have drawn a
 * single tick, and holding that page to the floor would fail a render that is
 * perfectly correct, with the one V6 message the client cannot act on ("export
 * hiccup, try again"). So the pen-only arm asks the strokes first.
 *
 * The prediction is deliberately a LOWER BOUND on what a stroke paints — distance
 * travelled × nib width, with overlaps double-counted and end caps ignored — and
 * it is then required to clear the floor several times over
 * (`INK_EXPECTATION_SAFETY_FACTOR`). Both choices push the same way: when in
 * doubt, don't judge the page.
 */

const HEX_COLOR = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i
const HEX_RADIX = 16

function distance(from: PenPoint, to: PenPoint): number {
  return Math.hypot(to.x - from.x, to.y - from.y)
}

/**
 * Would a pixel of this colour survive `assessInk`'s threshold? A stroke painted
 * too near page white covers real pixels and registers as none of them, so
 * counting its area would predict ink that no correct capture can ever show. An
 * unparseable colour is treated the same way — an unknown is never grounds to
 * judge a page. (Every colour in the pen palette clears this by a wide margin;
 * the case exists because an imported `.blueprint` file may carry any hex.)
 */
function countsAsInk(color: string): boolean {
  const parsed = HEX_COLOR.exec(color)
  if (!parsed) return false

  const [red, green, blue] = [parsed[1], parsed[2], parsed[3]].map((part) =>
    Number.parseInt(part ?? '', HEX_RADIX),
  )
  const luma = LUMA_RED * (red ?? 0) + LUMA_GREEN * (green ?? 0) + LUMA_BLUE * (blue ?? 0)

  return Math.abs(WHITE_LUMA - luma) > INK_LUMA_DELTA
}

function drawnLengthPx(points: readonly PenPoint[]): number {
  return points.reduce(
    (length, point, index) => (index === 0 ? length : length + distance(points[index - 1] ?? point, point)),
    0,
  )
}

/**
 * Roughly how many page pixels of COUNTABLE ink these strokes should paint: for
 * each stroke the gate could see at all, the length of its polyline times its
 * width. Page coordinates are page pixels and the PNG renders at 1:1 (§4.3), so
 * this needs no scaling to compare against a measured capture.
 */
export function expectedInkAreaPx(strokes: readonly PenStroke[]): number {
  return strokes
    .filter((stroke) => countsAsInk(stroke.color))
    .reduce((total, stroke) => total + drawnLengthPx(stroke.points) * stroke.width, 0)
}

/**
 * Should a page of exactly these strokes be held to the ink floor?
 *
 * `inkFloorFor` is a ratio over the page, so multiplying by the page's own area
 * turns it back into the number of ink PIXELS the floor is really asking for —
 * 192 of them on any page from the reference height up, since the floor is scaled
 * by height precisely to keep that number fixed.
 */
export function expectsVisibleInk(strokes: readonly PenStroke[], pageHeight: number): boolean {
  const floorAreaPx = inkFloorFor(pageHeight) * PAGE_WIDTH_PX * pageHeight

  return expectedInkAreaPx(strokes) >= floorAreaPx * INK_EXPECTATION_SAFETY_FACTOR
}
