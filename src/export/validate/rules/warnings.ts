/**
 * WARN RULES — `docs/export-format.md` §5 V9(near-empty), V10, V13, V15, V18, V22,
 * V23, V25, V27.
 *
 * A WARN never stops a submission: the package ships and the condition is noted in
 * the notification payload for Cam. That is why the download-first delivery model
 * can promise the zip always downloads.
 */

import { clustersOf } from '../../brief/pen.ts'
import { unreachablePages } from '../../brief/links.ts'
import { keyOrderProblems } from '../../serialize.ts'
import { EXPORT_PAGE_WIDTH } from '../../types.ts'
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

/** V9 (WARN half) — an individual page with nothing on it. */
export function v09NearEmptyPage({ site }: PackageBundle): Finding[] {
  return site.pages
    .filter((page) => page.blocks.length === 0)
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
] as const
