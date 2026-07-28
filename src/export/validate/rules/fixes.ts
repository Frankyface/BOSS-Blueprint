/**
 * FIX RULES — `docs/export-format.md` §5 V3(z), V4(strip), V11(bare domain),
 * V17(screenshot), V20(stranded description), V23(section flag).
 *
 * A FIX is a deterministic, safe correction the exporter applies and then proceeds.
 * Every one returns a NEW package — immutability rule, no in-place correction — and
 * names what it did so the submit UI can log it.
 *
 * They run in rule-number order and BEFORE every check rule, which is why the brief
 * is generated after this pass, never before: stripping an asset renumbers
 * `img_NNN`, which rewrites `assetId`s, which changes the brief.
 */

import { assetId as assetIdFor } from '../../assets.ts'
import { MIME_EXTENSIONS } from '../../imageHeader.ts'
import { screenshotPath } from '../../siteJson.ts'
import type { ExportBlock, ExportLink, ExportPage } from '../../types.ts'
import type { AppliedFix, FixResult, PackageBundle, RuleId } from '../types.ts'

/** A bare domain the client typed without a scheme — `example.com`, `shop.example.co.uk/x`. */
const BARE_DOMAIN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+(?:[/?#].*)?$/i
const HTTP_URL = /^https?:\/\//

function fix(rule: RuleId, message: string, targetIds: readonly string[]): AppliedFix {
  return { rule, message, targetIds }
}

function withPages(bundle: PackageBundle, pages: readonly ExportPage[]): PackageBundle {
  return { ...bundle, site: { ...bundle.site, pages } }
}

/** V3 (FIX half) — re-sort `blocks[]` by `z` and renumber `z` to the array index. */
export function v03SortAndRenumberZ(bundle: PackageBundle): FixResult {
  const fixes: AppliedFix[] = []

  const pages = bundle.site.pages.map((page) => {
    const sorted = page.blocks.slice().sort((a, b) => a.z - b.z)
    const needsFix = sorted.some((block, index) => block.z !== index || block !== page.blocks[index])
    if (!needsFix) return page

    fixes.push(fix('V03', `re-sorted and renumbered z on page ${page.id}`, [page.id]))
    return { ...page, blocks: sorted.map((block, index) => ({ ...block, z: index })) }
  })

  return { bundle: fixes.length > 0 ? withPages(bundle, pages) : bundle, fixes }
}

/**
 * V4 (FIX half) — strip manifest entries no `imageSlot` references, then RENUMBER
 * the survivors to a dense `img_001…` in first-use order and rewrite every
 * `assetId`, `path` and staged-file key. Stripping without renumbering would leave
 * a gap that §4.6's "first-use order" forbids and that V24 would then flag.
 */
export function v04StripUnreferencedAssets(bundle: PackageBundle): FixResult {
  const { site } = bundle
  const referenced = new Set<string>()
  for (const page of site.pages) {
    for (const block of page.blocks) {
      if (block.type === 'imageSlot' && block.assetId !== null) referenced.add(block.assetId)
    }
  }

  const kept = site.assets.filter((asset) => referenced.has(asset.id))
  if (kept.length === site.assets.length) return { bundle, fixes: [] }

  const stripped = site.assets.filter((asset) => !referenced.has(asset.id))

  // First-use order over the surviving references, exactly as §4.6 numbers them.
  const order: string[] = []
  for (const page of site.pages) {
    for (const block of page.blocks.slice().sort((a, b) => a.z - b.z)) {
      if (block.type === 'imageSlot' && block.assetId !== null && !order.includes(block.assetId)) {
        order.push(block.assetId)
      }
    }
  }

  const renamed = new Map<string, { id: string; path: string }>()
  order.forEach((oldId, index) => {
    const asset = kept.find((candidate) => candidate.id === oldId)
    if (asset === undefined) return
    const id = assetIdFor(index + 1)
    renamed.set(oldId, { id, path: `assets/${id}.${MIME_EXTENSIONS[asset.mimeType]}` })
  })

  const assets = order.flatMap((oldId) => {
    const asset = kept.find((candidate) => candidate.id === oldId)
    const renamedTo = renamed.get(oldId)
    return asset === undefined || renamedTo === undefined ? [] : [{ ...asset, ...renamedTo }]
  })

  const pages = site.pages.map((page) => ({
    ...page,
    blocks: page.blocks.map((block): ExportBlock => {
      if (block.type !== 'imageSlot' || block.assetId === null) return block
      return { ...block, assetId: renamed.get(block.assetId)?.id ?? null }
    }),
  }))

  const stagedDataUrls =
    bundle.stagedDataUrls === undefined
      ? undefined
      : new Map(
          [...bundle.stagedDataUrls].flatMap(([path, dataUrl]) => {
            const oldAsset = site.assets.find((asset) => asset.path === path)
            const target = oldAsset === undefined ? undefined : renamed.get(oldAsset.id)
            return target === undefined ? [] : [[target.path, dataUrl] as const]
          }),
        )

  const next: PackageBundle = {
    ...bundle,
    site: { ...site, pages, assets },
    ...(stagedDataUrls === undefined ? {} : { stagedDataUrls }),
  }

  return {
    bundle: next,
    fixes: [
      fix(
        'V04',
        `stripped ${String(stripped.length)} unreferenced asset(s) and renumbered the rest`,
        stripped.map((asset) => asset.id),
      ),
    ],
  }
}

function repairLink(link: ExportLink): ExportLink | null {
  if (link.kind !== 'external' || HTTP_URL.test(link.url)) return null
  if (!BARE_DOMAIN.test(link.url)) return null
  return { kind: 'external', url: `https://${link.url}` }
}

/** V11 (FIX half) — prepend `https://` when a client typed a bare domain. */
export function v11PrependScheme(bundle: PackageBundle): FixResult {
  const fixes: AppliedFix[] = []

  const pages = bundle.site.pages.map((page) => ({
    ...page,
    blocks: page.blocks.map((block): ExportBlock => {
      if (block.type === 'button') {
        const repaired = repairLink(block.link)
        if (repaired === null) return block
        fixes.push(fix('V11', `prepended https:// to ${block.id}'s link`, [block.id]))
        return { ...block, link: repaired }
      }
      if (block.type === 'navBar') {
        let changed = false
        const items = block.items.map((item) => {
          const repaired = repairLink(item.link)
          if (repaired === null) return item
          changed = true
          fixes.push(fix('V11', `prepended https:// to nav item ${item.id}`, [item.id]))
          return { ...item, link: repaired }
        })
        return changed ? { ...block, items } : block
      }
      return block
    }),
  }))

  return { bundle: fixes.length > 0 ? withPages(bundle, pages) : bundle, fixes }
}

/** V17 — recompute `page.screenshot` from the page's position and slug. */
export function v17RecomputeScreenshots(bundle: PackageBundle): FixResult {
  const fixes: AppliedFix[] = []

  const pages = bundle.site.pages.map((page, index) => {
    const expected = screenshotPath(index, page.slug)
    if (page.screenshot === expected) return page
    fixes.push(fix('V17', `recomputed ${page.id} screenshot to ${expected}`, [page.id]))
    return { ...page, screenshot: expected }
  })

  return { bundle: fixes.length > 0 ? withPages(bundle, pages) : bundle, fixes }
}

/** V20 — a `real` block must not ship a description stranded by a mode switch. */
export function v20NullStrandedDescription(bundle: PackageBundle): FixResult {
  const fixes: AppliedFix[] = []

  const pages = bundle.site.pages.map((page) => ({
    ...page,
    blocks: page.blocks.map((block): ExportBlock => {
      if (block.type !== 'heading' && block.type !== 'text') return block
      if (block.copyMode !== 'real' || block.generateDescription === null) return block
      fixes.push(fix('V20', `cleared a stranded generateDescription on ${block.id}`, [block.id]))
      return { ...block, generateDescription: null }
    }),
  }))

  return { bundle: fixes.length > 0 ? withPages(bundle, pages) : bundle, fixes }
}

/**
 * V23 (FIX half) — strip `fromTemplate` from any `section` block. §2.6's v2.3 scope
 * rule: the flag clears on a CONTENT edit and a section has no content, so a flagged
 * section would make the V23 warning permanent for every template-start design.
 */
export function v23StripSectionFiller(bundle: PackageBundle): FixResult {
  const fixes: AppliedFix[] = []

  const pages = bundle.site.pages.map((page) => ({
    ...page,
    blocks: page.blocks.map((block): ExportBlock => {
      if (block.type !== 'section' || block.fromTemplate !== true) return block
      fixes.push(fix('V23', `stripped fromTemplate from section ${block.id}`, [block.id]))
      // Rebuild without the key rather than setting it to `undefined`: the
      // serializer would drop an undefined anyway, but an absent key is what §2.6
      // actually specifies.
      return {
        id: block.id,
        type: block.type,
        z: block.z,
        frame: block.frame,
        background: block.background,
      }
    }),
  }))

  return { bundle: fixes.length > 0 ? withPages(bundle, pages) : bundle, fixes }
}

/** §5's FIX pass, in rule-number order. */
export const FIX_RULES = [
  v03SortAndRenumberZ,
  v04StripUnreferencedAssets,
  v11PrependScheme,
  v17RecomputeScreenshots,
  v20NullStrandedDescription,
  v23StripSectionFiller,
] as const

export function applyFixes(bundle: PackageBundle): FixResult {
  let current = bundle
  const fixes: AppliedFix[] = []

  for (const rule of FIX_RULES) {
    const result = rule(current)
    current = result.bundle
    fixes.push(...result.fixes)
  }
  return { bundle: current, fixes }
}
