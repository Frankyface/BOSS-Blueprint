/**
 * WARN RULES — `docs/export-format.md` §5 V9(near-empty), V10, V13, V15, V18, V22,
 * V23, V25, V27.
 *
 * A WARN never stops a submission: the package ships and the condition is noted in
 * the notification payload for Cam. That is why the download-first delivery model
 * can promise the zip always downloads.
 */

import { pageHeightForContent } from '../../../canvas/geometry.ts'
import type { PenStroke } from '../../../canvas/types.ts'
import { clustersOf } from '../../brief/pen.ts'
import { unreachablePages } from '../../brief/links.ts'
import { keyOrderProblems } from '../../serialize.ts'
import { EXPORT_PAGE_WIDTH, type ExportPage } from '../../types.ts'
import { finding, type Finding, type PackageBundle } from '../types.ts'
import { eachBlock, jumpTarget } from '../walk.ts'

/** V10 — the size budget, surfaced as a meter. Never a BLOCK: download must not fail. */
export const MAX_ZIP_BYTES = 15 * 1024 * 1024

/** V18 — how far above the page a frame may sit before the PNG silently clips it. */
export const OFF_PAGE_TOP_TOLERANCE_PX = -40

/** V22 — a cluster below either of these is probably not readable at 1:1. */
export const MIN_LEGIBLE_CLUSTER_WIDTH_PX = 40
export const MIN_LEGIBLE_CLUSTER_HEIGHT_PX = 20
export const MIN_LEGIBLE_CLUSTER_POINTS = 12

/**
 * V9 (WARN half) — an individual page with nothing on it.
 *
 * "Nothing" means no blocks AND no ink. Counting blocks alone fired on every
 * deliberate pen-only page — the one thing this tool exists to let a client make —
 * so the client would have been warned about their own drawing every single time
 * they submitted. A warning that is wrong that often is a warning nobody reads,
 * which costs the WARNs that are right. Same message, narrower trigger.
 */
export function v09NearEmptyPage({ site }: PackageBundle): Finding[] {
  return site.pages
    .filter((page) => page.blocks.length === 0 && page.penStrokes.length === 0)
    .map((page) => finding('V09', 'WARN', 'client', `Page "${page.name}" is empty.`, [page.id], { pageId: page.id }))
}

/** V10 — zip size after the compression ladder. */
export function v10ZipSize({ zipBytes }: PackageBundle): Finding[] {
  if (zipBytes === undefined || zipBytes <= MAX_ZIP_BYTES) return []
  return [
    finding(
      'V10',
      'WARN',
      'bug',
      `package is ${String(Math.round(zipBytes / 1024))} KB, over the ${String(MAX_ZIP_BYTES / 1024 / 1024)} MB budget`,
      [],
    ),
  ]
}

/** V13 — duplicate page names make the brief's nav map ambiguous (slugs are uniquified, names are not). */
export function v13DuplicatePageNames({ site }: PackageBundle): Finding[] {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const page of site.pages) {
    if (seen.has(page.name)) duplicates.add(page.name)
    seen.add(page.name)
  }
  return [...duplicates].map((name) =>
    finding('V13', 'WARN', 'client', `More than one page is called "${name}".`, [name]),
  )
}

/** V15 — a page no link points at. The brief's unreachable conditional tells the builder what to do. */
export function v15Reachability(bundle: PackageBundle): Finding[] {
  return unreachablePages(bundle.site).map((page) =>
    finding('V15', 'WARN', 'client', `Nothing links to "${page.name}".`, [page.id], { pageId: page.id }),
  )
}

/** V18 — a frame the PNG render would clip away, breaking "the PNG shows what the client saw". */
export function v18OffPageFrames({ site }: PackageBundle): Finding[] {
  return eachBlock(site)
    .filter(({ block }) => {
      const { x, y, w, h } = block.frame
      return y + h <= 0 || y < OFF_PAGE_TOP_TOLERANCE_PX || x + w <= 0 || x > EXPORT_PAGE_WIDTH
    })
    .map((ref) =>
      finding(
        'V18',
        'WARN',
        'client',
        `A block sits off the page and will not appear in the sketch image.`,
        [ref.block.id],
        jumpTarget(ref),
      ),
    )
}

/**
 * V22 — an annotation cluster too small or too sparse to read.
 *
 * Spec-literal on "Annotation cluster": an imageSketch cluster is read alongside
 * the slot it sits in, so a sparse one is far less likely to be a lost instruction.
 * (The round-trip gate flags every cluster; that is a wider net than §5 asks for.)
 */
export function v22IllegibleClusters({ site }: PackageBundle): Finding[] {
  const findings: Finding[] = []

  for (const page of site.pages) {
    for (const cluster of clustersOf(page)) {
      if (cluster.role !== 'annotation') continue

      const width = cluster.bbox.maxX - cluster.bbox.minX
      const height = cluster.bbox.maxY - cluster.bbox.minY
      const points = cluster.strokes.reduce((total, stroke) => total + stroke.points.length, 0)
      if (
        width >= MIN_LEGIBLE_CLUSTER_WIDTH_PX &&
        height >= MIN_LEGIBLE_CLUSTER_HEIGHT_PX &&
        points >= MIN_LEGIBLE_CLUSTER_POINTS
      ) {
        continue
      }
      findings.push(
        finding(
          'V22',
          'WARN',
          'bug',
          `pen mark on ${page.id} may be illegible: ${String(Math.round(width))}×${String(Math.round(height))}px, ${String(points)} point(s)`,
          cluster.strokes.map((stroke) => stroke.id),
          { pageId: page.id },
        ),
      )
    }
  }
  return findings
}

/** V23 (WARN half) — untouched template filler reaching the export. */
export function v23TemplateFiller({ site }: PackageBundle): Finding[] {
  return eachBlock(site)
    .filter(({ block }) => block.type !== 'section' && block.fromTemplate === true)
    .map((ref) =>
      finding(
        'V23',
        'WARN',
        'client',
        'Some template placeholder text is still in your design — want to review it?',
        [ref.block.id],
        jumpTarget(ref),
      ),
    )
}

/** V25 (v2.1) — content past x=1200 is clipped in the PNG; [N13] marks it in the brief. */
export function v25RightOverflow({ site }: PackageBundle): Finding[] {
  return eachBlock(site)
    .filter(({ block }) => block.frame.x + block.frame.w > EXPORT_PAGE_WIDTH)
    .map((ref) =>
      finding(
        'V25',
        'WARN',
        'client',
        'A block extends past the right edge of the page and will be cut off in the sketch image.',
        [ref.block.id],
        jumpTarget(ref),
      ),
    )
}

/**
 * V29 — the long edge a page PNG is resampled to before a vision model reads it.
 *
 * A 1200×8000 sketch does not reach the builder at 1200×8000: it arrives scaled so
 * its long edge fits this budget, which on the tallest page is a 3.1× reduction.
 * Handwriting that is comfortable at 1:1 can cross below legibility on the way in,
 * and the client never sees that happen.
 */
export const INK_VISION_LONG_EDGE_PX = 2576

/** Below this, in the pixels the reader actually gets, handwriting stops resolving. */
export const INK_READABLE_MIN_PX = 24

/**
 * V29 — drawn words the builder would be asked to read below readable size.
 *
 * A WARN, never a BLOCK: the ink is still in `penStrokes` as vectors, so a builder
 * can rebuild the region at any magnification it likes. What this rule buys is that
 * Cam is TOLD, on the page it happened, rather than finding out from a build that
 * quietly invented the wording.
 */
export function v29InkTooSmallToRead({ site }: PackageBundle): Finding[] {
  const findings: Finding[] = []

  for (const page of site.pages) {
    const scale = Math.min(1, INK_VISION_LONG_EDGE_PX / Math.max(EXPORT_PAGE_WIDTH, page.height))
    for (const region of page.penRegions ?? []) {
      if (region.kind !== 'writing' && region.kind !== 'navRow') continue
      if (region.text === null) continue

      const effective = region.text.glyphHeight * scale
      if (effective >= INK_READABLE_MIN_PX) continue
      findings.push(
        finding(
          'V29',
          'WARN',
          'bug',
          `${region.id} on ${page.id} is ${String(Math.round(region.text.glyphHeight))}px handwriting on a ${String(page.height)}px page — the builder reads it at ${String(Math.round(effective * 10) / 10)}px, under the ${String(INK_READABLE_MIN_PX)}px floor`,
          [region.id],
          { pageId: page.id },
        ),
      )
    }
  }
  return findings
}

/**
 * The content-only height of a page: `pageHeightForContent` with the client's added
 * room set to 0, computed from the SAME producer function so the validator and the
 * editor cannot disagree about how tall the content is. The export shapes are adapted
 * to what the geometry helper reads (`rect.y + rect.height`, `point.y`).
 */
function contentOnlyHeight(page: ExportPage): number {
  const rects = page.blocks.map((block) => ({
    x: block.frame.x,
    y: block.frame.y,
    width: block.frame.w,
    height: block.frame.h,
  }))
  const strokes: PenStroke[] = page.penStrokes.map((stroke) => ({
    id: stroke.id,
    points: stroke.points.map(([x, y]) => ({ x, y })),
    color: stroke.color,
    width: stroke.width,
  }))
  return pageHeightForContent(rects, strokes, 0)
}

/**
 * V31 — space the client asked for that the height cap actually truncated.
 *
 * §4.2 clamps `height` to 8000 AFTER adding `extraBottomPx`, so on a page whose
 * content already fills the sheet only PART of the added room lands — none of it, at
 * the cap. The amount that landed is the gap between the page's height and its
 * content-only height (`pageHeightForContent` with no extra); the client asked for
 * `extraBottomPx`. Truncation happened iff they asked for more than landed — which
 * is the ONLY case worth telling a client about, and never fires at the boundary
 * where a page lands on 8000 with every requested pixel applied (the false positive
 * V31 used to emit). Client-facing on purpose: it is the client's own action, and
 * being told the space was not applied when it was reads as the app being broken.
 */
export function v31TruncatedPageSpace({ site }: PackageBundle): Finding[] {
  return site.pages
    .filter((page) => {
      const requested = page.extraBottomPx ?? 0
      if (requested === 0) return false
      const applied = page.height - contentOnlyHeight(page)
      return requested > applied
    })
    .map((page) =>
      finding(
        'V31',
        'WARN',
        'client',
        `Page "${page.name}" is at its maximum height, so only part of the space you added below your content fits.`,
        [page.id],
        { pageId: page.id },
      ),
    )
}

/** V27 (v2.3) — the determinism check: same design, byte-identical serialization. */
export function v27KeyOrder({ site }: PackageBundle): Finding[] {
  return keyOrderProblems(site).map((problem) =>
    finding('V27', 'WARN', 'bug', `site.json key order: ${problem}`, []),
  )
}

export const WARN_RULES = [
  v09NearEmptyPage,
  v10ZipSize,
  v13DuplicatePageNames,
  v15Reachability,
  v18OffPageFrames,
  v22IllegibleClusters,
  v23TemplateFiller,
  v25RightOverflow,
  v27KeyOrder,
  v29InkTooSmallToRead,
  v31TruncatedPageSpace,
] as const
