/**
 * BUG-CLASS BLOCK RULES — `docs/export-format.md` §5 V2, V3(collision),
 * V4(missing file), V6, V12, V16, V21, V24.
 *
 * None of these is anything a client did. They stop the submission and show
 * "something went wrong" with detail for the console, because shipping a package
 * that fails one of them would fail the round-trip test silently.
 */

import { ID_PATTERNS, ordinalId } from '../../ids.ts'
import { MIME_EXTENSIONS } from '../../imageHeader.ts'
import { EXPORT_PAGE_WIDTH } from '../../types.ts'
import { finding, type Finding, type PackageBundle } from '../types.ts'
import { eachBlock } from '../walk.ts'

/** A hand-edited package can carry a MIME type the union does not admit. */
const EXTENSION_BY_MIME: Record<string, string | undefined> = MIME_EXTENSIONS

/** V2 — referential integrity across the three reference fields. */
export function v02References({ site }: PackageBundle): Finding[] {
  const findings: Finding[] = []
  const pageIds = new Set(site.pages.map((page) => page.id))
  const assetIds = new Set(site.assets.map((asset) => asset.id))

  const checkLink = (link: { kind: string; pageId?: string }, owner: string): void => {
    if (link.kind === 'page' && link.pageId !== undefined && !pageIds.has(link.pageId)) {
      findings.push(finding('V02', 'BLOCK', 'bug', `${owner} links to missing page ${link.pageId}`, [owner]))
    }
  }

  for (const { block } of eachBlock(site)) {
    if (block.type === 'button') checkLink(block.link, block.id)
    if (block.type === 'navBar') for (const item of block.items) checkLink(item.link, item.id)
    if (block.type === 'imageSlot' && block.assetId !== null && !assetIds.has(block.assetId)) {
      findings.push(
        finding('V02', 'BLOCK', 'bug', `${block.id} references missing asset ${block.assetId}`, [block.id]),
      )
    }
  }

  for (const page of site.pages) {
    const blockIds = new Set(page.blocks.map((block) => block.id))
    for (const stroke of page.penStrokes) {
      if (stroke.targetBlockId !== null && !blockIds.has(stroke.targetBlockId)) {
        findings.push(
          finding(
            'V02',
            'BLOCK',
            'bug',
            `${stroke.id} targets ${stroke.targetBlockId}, which is not on ${page.id}`,
            [stroke.id],
          ),
        )
      }
    }
  }
  return findings
}

/** V3 (BLOCK half) — id and slug collisions. The z half is a FIX. */
export function v03Collisions({ site }: PackageBundle): Finding[] {
  const findings: Finding[] = []

  const duplicates = (values: readonly string[]): string[] => {
    const seen = new Set<string>()
    const dupes = new Set<string>()
    for (const value of values) {
      if (seen.has(value)) dupes.add(value)
      seen.add(value)
    }
    return [...dupes]
  }

  const report = (values: readonly string[], what: string): void => {
    for (const duplicate of duplicates(values)) {
      findings.push(finding('V03', 'BLOCK', 'bug', `duplicate ${what}: ${duplicate}`, [duplicate]))
    }
  }

  report(site.pages.map((page) => page.id), 'page id')
  report(site.pages.map((page) => page.slug), 'page slug')
  report(eachBlock(site).map(({ block }) => block.id), 'block id')
  report(site.assets.map((asset) => asset.id), 'asset id')
  report(site.assets.map((asset) => asset.path), 'asset path')

  for (const { block } of eachBlock(site)) {
    if (block.type === 'navBar') report(block.items.map((item) => item.id), `nav item id in ${block.id}`)
  }
  for (const page of site.pages) {
    report(page.penStrokes.map((stroke) => stroke.id), `stroke id on ${page.id}`)
  }
  return findings
}

/** V4 (BLOCK half) — a manifest entry with no staged file. */
export function v04MissingAssetFile({ site, stagedAssets }: PackageBundle): Finding[] {
  if (stagedAssets === undefined) return []

  const staged = new Set(stagedAssets.map((asset) => asset.path))
  return site.assets
    .filter((asset) => !staged.has(asset.path))
    .map((asset) => finding('V04', 'BLOCK', 'bug', `no file staged for ${asset.path}`, [asset.id]))
}

/** V6 — the PNG set: one per page, correctly paired, decodable, exactly sized, non-blank. */
export function v06RenderedPages({ site, renderedPages }: PackageBundle): Finding[] {
  if (renderedPages === undefined) return []

  const findings: Finding[] = []
  if (renderedPages.length !== site.pages.length) {
    findings.push(
      finding(
        'V06',
        'BLOCK',
        'bug',
        `${String(renderedPages.length)} page PNG(s) for ${String(site.pages.length)} page(s)`,
        [],
      ),
    )
  }

  for (const page of site.pages) {
    const rendered = renderedPages.find((candidate) => candidate.path === page.screenshot)
    if (rendered === undefined) {
      findings.push(finding('V06', 'BLOCK', 'bug', `no PNG staged at ${page.screenshot}`, [page.id]))
      continue
    }
    if (rendered.width !== EXPORT_PAGE_WIDTH || rendered.height !== page.height) {
      findings.push(
        finding(
          'V06',
          'BLOCK',
          'bug',
          `${page.screenshot} is ${String(rendered.width)}×${String(rendered.height)}, expected ${String(EXPORT_PAGE_WIDTH)}×${String(page.height)}`,
          [page.id],
        ),
      )
    }
    if (!rendered.nonBlank) {
      findings.push(finding('V06', 'BLOCK', 'bug', `${page.screenshot} rendered blank`, [page.id]))
    }
  }
  return findings
}

/** §1 — the exact entry list a package may contain, in write order. */
export function expectedZipEntries({ site }: PackageBundle): string[] {
  return [
    'site.json',
    'brief.md',
    ...site.pages.map((page) => page.screenshot),
    ...site.assets.map((asset) => asset.path),
  ]
}

/** V12 — the zip contains exactly §1's layout: no wrapper folder, nothing extra. */
export function v12ZipLayout(bundle: PackageBundle): Finding[] {
  const { zipEntries } = bundle
  if (zipEntries === undefined) return []

  const expected = expectedZipEntries(bundle)
  const findings: Finding[] = []

  for (const entry of expected) {
    if (!zipEntries.includes(entry)) {
      findings.push(finding('V12', 'BLOCK', 'bug', `zip is missing ${entry}`, [entry]))
    }
  }
  for (const entry of zipEntries) {
    if (!expected.includes(entry)) {
      findings.push(finding('V12', 'BLOCK', 'bug', `zip has unexpected entry ${entry}`, [entry]))
    }
  }
  return findings
}

/** V16 — `asset.path` must be `assets/<id>.<ext>` with the §4.6 extension. */
export function v16AssetPaths({ site }: PackageBundle): Finding[] {
  return site.assets.flatMap((asset) => {
    const extension = EXTENSION_BY_MIME[asset.mimeType]
    if (extension === undefined) {
      return [finding('V16', 'BLOCK', 'bug', `${asset.id} has unsupported mimeType ${asset.mimeType}`, [asset.id])]
    }
    const expected = `assets/${asset.id}.${extension}`
    return asset.path === expected
      ? []
      : [finding('V16', 'BLOCK', 'bug', `${asset.id} path is ${asset.path}, expected ${expected}`, [asset.id])]
  })
}

/** V21 — the manifest numbers must match the staged bytes; the brief prints them. */
export function v21AssetFacts({ site, stagedAssets }: PackageBundle): Finding[] {
  if (stagedAssets === undefined) return []

  return site.assets.flatMap((asset) => {
    const staged = stagedAssets.find((candidate) => candidate.path === asset.path)
    if (staged === undefined) return []

    const mismatches: string[] = []
    if (staged.width !== asset.width || staged.height !== asset.height) {
      mismatches.push(
        `dimensions ${String(staged.width)}×${String(staged.height)} vs manifest ${String(asset.width)}×${String(asset.height)}`,
      )
    }
    if (staged.byteLength !== asset.bytes) {
      mismatches.push(`bytes ${String(staged.byteLength)} vs manifest ${String(asset.bytes)}`)
    }
    if (staged.mimeType !== asset.mimeType) {
      mismatches.push(`mimeType ${staged.mimeType} vs manifest ${asset.mimeType}`)
    }
    return mismatches.length === 0
      ? []
      : [finding('V21', 'BLOCK', 'bug', `${asset.path}: ${mismatches.join('; ')}`, [asset.id])]
  })
}

/**
 * V24 — the identity remap is total: every id matches its schema pattern AND equals
 * the §4.8 ordinal for its document position, and no internal id survived.
 */
export function v24IdentityRemap({ site, brief, internalIds }: PackageBundle): Finding[] {
  const findings: Finding[] = []

  const expect = (actual: string, expected: string, what: string): void => {
    if (actual !== expected) {
      findings.push(finding('V24', 'BLOCK', 'bug', `${what} is ${actual}, expected ${expected}`, [actual]))
    }
  }

  let blockOrdinal = 0
  let navOrdinal = 0
  let strokeOrdinal = 0

  site.pages.forEach((page, pageIndex) => {
    expect(page.id, ordinalId('pg', pageIndex + 1), 'page id')
    for (const block of page.blocks) {
      blockOrdinal += 1
      expect(block.id, ordinalId('blk', blockOrdinal), 'block id')
      if (block.type === 'navBar') {
        for (const item of block.items) {
          navOrdinal += 1
          expect(item.id, ordinalId('nav', navOrdinal), 'nav item id')
        }
      }
    }
    for (const stroke of page.penStrokes) {
      strokeOrdinal += 1
      expect(stroke.id, ordinalId('stk', strokeOrdinal), 'stroke id')
    }
  })

  for (const asset of site.assets) {
    if (!ID_PATTERNS.img.test(asset.id)) {
      findings.push(finding('V24', 'BLOCK', 'bug', `asset id ${asset.id} is not an img_NNN id`, [asset.id]))
    }
  }

  if (internalIds !== undefined) {
    const haystack = `${JSON.stringify(site)}\n${brief ?? ''}`
    for (const internalId of internalIds) {
      if (internalId !== '' && haystack.includes(internalId)) {
        findings.push(
          finding('V24', 'BLOCK', 'bug', `internal id "${internalId}" leaked into the package`, [internalId]),
        )
      }
    }
  }
  return findings
}

export const BUG_BLOCK_RULES = [
  v02References,
  v03Collisions,
  v04MissingAssetFile,
  v06RenderedPages,
  v12ZipLayout,
  v16AssetPaths,
  v21AssetFacts,
  v24IdentityRemap,
] as const
