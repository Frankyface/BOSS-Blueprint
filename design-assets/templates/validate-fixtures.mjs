/**
 * Fixture validator for starterTemplates.ts — scratch tool, not repo code.
 *
 * It mirrors the LANDED repo modules into an OS temp dir (read-only copies; the repo is
 * never written to) so the fixture can import the REAL `blockTypes.ts`, `constants.ts` and
 * `blockText.ts`, then checks every invariant listed in the fixture's header comment.
 *
 * Run:  node validate-fixtures.mjs [--repo "<path to BOSS-Blueprint>"]
 * Exit: 0 = all checks passed, 1 = at least one violation.
 *
 * At landing this becomes a vitest spec (`src/templates/starterTemplates.test.ts`); the
 * checks are written to port over unchanged.
 */

import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

const repoArgIndex = process.argv.indexOf('--repo')
const REPO =
  repoArgIndex >= 0 && process.argv[repoArgIndex + 1]
    ? process.argv[repoArgIndex + 1]
    : 'C:/Users/Cam/Documents/.ClaudeCode Projects/BOSS-Blueprint'

// ── mirror the landed modules + the fixture into a scratch tree ──────────────
const root = mkdtempSync(path.join(tmpdir(), 'blueprint-fixture-'))
mkdirSync(path.join(root, 'canvas'), { recursive: true })
mkdirSync(path.join(root, 'constants'), { recursive: true })
mkdirSync(path.join(root, 'templates'), { recursive: true })

for (const [from, to] of [
  ['src/canvas/types.ts', 'canvas/types.ts'],
  ['src/canvas/constants.ts', 'canvas/constants.ts'],
  ['src/canvas/blockText.ts', 'canvas/blockText.ts'],
  ['src/constants/blockTypes.ts', 'constants/blockTypes.ts'],
]) {
  cpSync(path.join(REPO, from), path.join(root, to))
}
cpSync(path.join(here, 'starterTemplates.ts'), path.join(root, 'templates/starterTemplates.ts'))

const { BLOCK_TYPES } = await import(pathToFileURL(path.join(root, 'constants/blockTypes.ts')))
const { GRID_SIZE_PX, PAGE_WIDTH_PX, MAX_PAGE_HEIGHT_PX } = await import(
  pathToFileURL(path.join(root, 'canvas/constants.ts'))
)
const { parseNavItems, normaliseBlockText } = await import(
  pathToFileURL(path.join(root, 'canvas/blockText.ts'))
)
const { STARTER_TEMPLATES } = await import(
  pathToFileURL(path.join(root, 'templates/starterTemplates.ts'))
)

const DEFINITION = new Map(BLOCK_TYPES.map((d) => [d.id, d]))
const IS_BAND = (type) => DEFINITION.get(type)?.placement === 'stacked'

// ── expectations from the content draft (§9.4 counts table) ─────────────────
const EXPECTED = {
  restaurant: { blocks: [12, 12, 11], total: 35, generate: 1, crossPageButtons: 3 },
  trades: { blocks: [12, 12, 12], total: 36, generate: 2, crossPageButtons: 4 },
  portfolio: { blocks: [12, 10, 11], total: 33, generate: 1, crossPageButtons: 3 },
  shop: { blocks: [11, 12, 11], total: 34, generate: 2, crossPageButtons: 3 },
}

/** The only overlaps the design intends: words laid over a full-band hero photo. */
const ALLOWED_OVERLAPS = new Set([
  'rest-home-hero-photo|rest-home-hero-title',
  'rest-home-hero-photo|rest-home-hero-cta',
  'shop-home-hero-photo|shop-home-hero-title',
  'shop-home-hero-photo|shop-home-hero-cta',
])

const ALLOWED_KEYS = new Set([
  'id',
  'type',
  'x',
  'y',
  'width',
  'height',
  'text',
  'fromTemplate',
  'copyMode',
  'generateDescription',
  'lengthHint',
  'fit',
  'description',
  'link',
  'items',
])

/**
 * Landed sketch typography (src/components/BlockView.css). `.block-content` is
 * `overflow: hidden`, so copy that does not fit is CLIPPED — a fixture whose default words
 * overflow their box is a real defect, not a cosmetic one. Char widths are the usual
 * ~0.5em (regular) / ~0.55em (bold) approximation; the check is deliberately conservative.
 */
const TYPE_METRICS = {
  text: { charWidth: 9, lineHeight: 27.9, padX: 16, padY: 16 },
  heading: { charWidth: 22, lineHeight: 46, padX: 16, padY: 8 },
  button: { charWidth: 9.9, padX: 32 },
  'nav-bar': { charWidth: 9.35, gap: 28, padX: 48 },
}

function wrappedLines(text, usableWidth, charWidth) {
  const perLine = Math.max(1, Math.floor(usableWidth / charWidth))
  return text
    .split('\n')
    .reduce((lines, line) => lines + Math.max(1, Math.ceil(line.length / perLine)), 0)
}

const failures = []
const stats = {
  templates: 0,
  pages: 0,
  blocks: 0,
  byType: {},
  generate: 0,
  links: 0,
  navItems: 0,
  pageHeights: [],
}
const seenBlockIds = new Set()

const fail = (where, message) => failures.push(`${where}: ${message}`)
const onGrid = (n) => Number.isInteger(n) && n % GRID_SIZE_PX === 0
const overlaps = (a, b) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

for (const template of STARTER_TEMPLATES) {
  stats.templates += 1
  const expected = EXPECTED[template.id]
  if (!expected) fail(template.id, 'template id is not one of the four drafted templates')

  // template-level
  if (template.siteSettings.businessName !== '') {
    fail(template.id, 'siteSettings.businessName must ship EMPTY (decisions.md 2026-07-28)')
  }
  if (!template.pickerTitle || !template.pickerLine) {
    fail(template.id, 'missing picker card copy')
  }
  const pageIds = template.pages.map((p) => p.id)
  if (new Set(pageIds).size !== pageIds.length) fail(template.id, 'duplicate page ids')

  let templateGenerate = 0
  let templateCrossPageButtons = 0
  let templateBlocks = 0

  template.pages.forEach((page, pageIndex) => {
    stats.pages += 1
    const where = `${template.id}/${page.id}`
    const blocks = page.blocks
    templateBlocks += blocks.length

    // ── per-page counts ──
    if (blocks.length < 5 || blocks.length > 12) {
      fail(where, `block count ${blocks.length} outside the 5–12 range`)
    }
    if (expected && blocks.length !== expected.blocks[pageIndex]) {
      fail(where, `block count ${blocks.length} ≠ drafted ${expected.blocks[pageIndex]}`)
    }
    if (!page.name || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(page.slug)) {
      fail(where, `page name/slug missing or slug not kebab-case ("${page.slug}")`)
    }

    // ── per-block ──
    for (const b of blocks) {
      stats.blocks += 1
      stats.byType[b.type] = (stats.byType[b.type] ?? 0) + 1

      if (seenBlockIds.has(b.id)) fail(where, `duplicate block id "${b.id}"`)
      seenBlockIds.add(b.id)

      const def = DEFINITION.get(b.type)
      if (!def) {
        fail(where, `"${b.id}" has unknown block type "${b.type}"`)
        continue
      }

      for (const key of Object.keys(b)) {
        if (!ALLOWED_KEYS.has(key)) fail(where, `"${b.id}" has unexpected field "${key}"`)
      }

      // 1 · grid
      for (const [field, value] of [
        ['x', b.x],
        ['y', b.y],
        ['width', b.width],
        ['height', b.height],
      ]) {
        if (!onGrid(value)) fail(where, `"${b.id}".${field} = ${value} is off the 8px grid`)
      }

      // 2 · page bounds
      if (b.x < 0 || b.x + b.width > PAGE_WIDTH_PX) {
        fail(where, `"${b.id}" spans ${b.x}–${b.x + b.width}, outside 0–${PAGE_WIDTH_PX}`)
      }
      if (b.y < 0) fail(where, `"${b.id}".y = ${b.y} is above the page`)

      // 10 · min sizes from the landed palette
      if (b.width < def.minSize.width || b.height < def.minSize.height) {
        fail(
          where,
          `"${b.id}" ${b.width}×${b.height} is below the ${b.type} minSize ` +
            `${def.minSize.width}×${def.minSize.height}`,
        )
      }

      // text hygiene
      if (typeof b.text !== 'string') fail(where, `"${b.id}".text is not a string`)
      else {
        if (b.text !== normaliseBlockText(b.text)) {
          fail(where, `"${b.id}".text is not already normalised (leading/trailing whitespace)`)
        }
        if (b.text.includes('⏎')) fail(where, `"${b.id}".text still contains a literal ⏎`)
      }
      if (b.fromTemplate !== true) fail(where, `"${b.id}" is missing fromTemplate: true`)

      // 11 · the default copy must actually FIT (block content is clipped, not scrolled)
      if ((b.type === 'text' || b.type === 'heading') && b.text.length > 0) {
        const m = TYPE_METRICS[b.type]
        const needed = wrappedLines(b.text, b.width - m.padX, m.charWidth) * m.lineHeight + m.padY
        if (needed > b.height) {
          fail(where, `"${b.id}" copy needs ~${Math.ceil(needed)}px, box is ${b.height}px (clipped)`)
        }
      }
      if (b.type === 'button') {
        const m = TYPE_METRICS.button
        const needed = b.text.length * m.charWidth + m.padX
        if (needed > b.width) {
          fail(where, `"${b.id}" label needs ~${Math.ceil(needed)}px, pill is ${b.width}px`)
        }
      }
      if (b.type === 'nav-bar' && Array.isArray(b.items)) {
        const m = TYPE_METRICS['nav-bar']
        const needed =
          b.items.reduce((sum, i) => sum + i.label.length * m.charWidth, 0) +
          m.gap * Math.max(0, b.items.length - 1) +
          m.padX
        if (needed > b.width) fail(where, `"${b.id}" nav items need ~${Math.ceil(needed)}px`)
      }

      // per-type rules
      if (b.type === 'heading' || b.type === 'text') {
        if (b.copyMode !== 'real' && b.copyMode !== 'generate') {
          fail(where, `"${b.id}" has no valid copyMode`)
        } else if (b.copyMode === 'real') {
          if (b.text.length === 0) fail(where, `"${b.id}" is copyMode real with empty text`)
          if (b.generateDescription) fail(where, `"${b.id}" is real but has generateDescription`)
        } else {
          stats.generate += 1
          templateGenerate += 1
          if (b.text !== '') fail(where, `"${b.id}" is generate but carries text`)
          if (!b.generateDescription || b.generateDescription.trim().length === 0) {
            fail(where, `"${b.id}" is generate with no generateDescription`)
          }
        }
      } else if (b.copyMode) {
        fail(where, `"${b.id}" (${b.type}) should not carry copyMode`)
      }

      if (b.type === 'image') {
        if (b.fit !== 'cover' && b.fit !== 'contain') fail(where, `"${b.id}" has no valid fit`)
        if (!b.description || b.description.trim().length === 0) {
          fail(where, `"${b.id}" image has no description`)
        }
      } else if (b.fit || b.description) {
        fail(where, `"${b.id}" (${b.type}) should not carry fit/description`)
      }

      if (b.type === 'button') {
        if (b.text.trim().length === 0) fail(where, `"${b.id}" button has no label text`)
        if (!b.link) fail(where, `"${b.id}" button has no link`)
        else {
          stats.links += 1
          if (b.link.kind === 'page') {
            if (!pageIds.includes(b.link.pageId)) {
              fail(where, `"${b.id}" links to unknown page "${b.link.pageId}"`)
            }
            if (b.link.pageId !== page.id) templateCrossPageButtons += 1
          }
        }
      } else if (b.link) {
        fail(where, `"${b.id}" (${b.type}) should not carry link`)
      }

      if (b.type === 'nav-bar') {
        if (b.x !== 0 || b.y !== 0 || b.width !== PAGE_WIDTH_PX) {
          fail(where, `"${b.id}" nav bar must span the full width at y=0`)
        }
        if (!Array.isArray(b.items) || b.items.length !== template.pages.length) {
          fail(where, `"${b.id}" nav must have one item per page (${template.pages.length})`)
        } else {
          const labels = parseNavItems(b.text)
          if (labels.join('|') !== b.items.map((i) => i.label).join('|')) {
            fail(where, `"${b.id}" nav text labels disagree with items (${b.text})`)
          }
          for (const item of b.items) {
            stats.navItems += 1
            if (!item.id || !item.label) fail(where, `"${b.id}" nav item missing id/label`)
            if (item.link?.kind !== 'page' || !pageIds.includes(item.link.pageId)) {
              fail(where, `"${b.id}" nav item "${item.label}" has an unresolved link`)
            }
            stats.links += 1
          }
        }
      } else if (b.items) {
        fail(where, `"${b.id}" (${b.type}) should not carry items`)
      }
    }

    // 7 · exactly one nav bar, at the top
    const navs = blocks.filter((b) => b.type === 'nav-bar')
    if (navs.length !== 1) fail(where, `expected exactly 1 nav-bar, found ${navs.length}`)

    // 3 · array order == paint order: bands first (by y), then content by (y, x)
    const bands = blocks.filter((b) => IS_BAND(b.type))
    const content = blocks.filter((b) => !IS_BAND(b.type))
    const prefixIsBands = blocks.slice(0, bands.length).every((b) => IS_BAND(b.type))
    if (!prefixIsBands) fail(where, 'full-width bands are not a contiguous block at the back')
    for (let i = 1; i < bands.length; i += 1) {
      if (bands[i].y < bands[i - 1].y) {
        fail(where, `bands out of order: "${bands[i].id}" paints after a lower band`)
      }
    }
    for (let i = 1; i < content.length; i += 1) {
      const prev = content[i - 1]
      const cur = content[i]
      if (cur.y < prev.y || (cur.y === prev.y && cur.x < prev.x)) {
        fail(where, `content out of reading order: "${cur.id}" precedes "${prev.id}" on the page`)
      }
    }

    // 4 · section bands stack with no gaps under the nav
    const sections = blocks.filter((b) => b.type === 'section')
    const navHeight = navs[0]?.height ?? 0
    let cursor = navHeight
    for (const s of sections) {
      if (s.y !== cursor) {
        fail(where, `band "${s.id}" starts at ${s.y}, expected ${cursor} (bands stack, no gaps)`)
      }
      if (s.x !== 0 || s.width !== PAGE_WIDTH_PX) fail(where, `band "${s.id}" is not full width`)
      cursor = s.y + s.height
    }

    // 5 · every content block sits wholly inside one band (nav bar excepted)
    for (const b of content) {
      const home = sections.find((s) => b.y >= s.y && b.y + b.height <= s.y + s.height)
      if (!home) {
        fail(where, `"${b.id}" (${b.y}–${b.y + b.height}) is not wholly inside any band`)
      }
    }

    // 6 · no unintended overlaps between content blocks
    for (let i = 0; i < content.length; i += 1) {
      for (let j = i + 1; j < content.length; j += 1) {
        const a = content[i]
        const b = content[j]
        if (!overlaps(a, b)) continue
        if (!ALLOWED_OVERLAPS.has(`${a.id}|${b.id}`) && !ALLOWED_OVERLAPS.has(`${b.id}|${a.id}`)) {
          fail(where, `unintended overlap: "${a.id}" × "${b.id}"`)
        }
      }
    }

    // nav bar must not be covered by anything (this is why the draft's z:10 is unnecessary)
    if (navs[0]) {
      for (const b of blocks) {
        if (b === navs[0]) continue
        if (overlaps(navs[0], b)) fail(where, `"${b.id}" overlaps the nav bar`)
      }
    }

    // export-format §4.2 page height, for the record
    const maxBottom = Math.max(...blocks.map((b) => b.y + b.height))
    const height = Math.max(800, Math.ceil((maxBottom + 80) / GRID_SIZE_PX) * GRID_SIZE_PX)
    if (height > MAX_PAGE_HEIGHT_PX) fail(where, `page height ${height} exceeds the canvas ceiling`)
    stats.pageHeights.push(`${where}=${height}`)
  })

  if (expected) {
    if (templateBlocks !== expected.total) {
      fail(template.id, `total blocks ${templateBlocks} ≠ drafted ${expected.total}`)
    }
    if (templateGenerate !== expected.generate) {
      fail(template.id, `generate blocks ${templateGenerate} ≠ drafted ${expected.generate}`)
    }
    if (templateCrossPageButtons !== expected.crossPageButtons) {
      fail(
        template.id,
        `cross-page buttons ${templateCrossPageButtons} ≠ drafted ${expected.crossPageButtons}`,
      )
    }
  }
}

rmSync(root, { recursive: true, force: true })

console.log('── BOSS Blueprint · starter template fixtures ──')
console.log(`templates      ${stats.templates}`)
console.log(`pages          ${stats.pages}`)
console.log(`blocks         ${stats.blocks}`)
console.log(`  by type      ${JSON.stringify(stats.byType)}`)
console.log(`generate blocks ${stats.generate}`)
console.log(`resolved links ${stats.links} (incl. ${stats.navItems} nav items)`)
console.log(`page heights   ${stats.pageHeights.join('  ')}`)
console.log('')

if (failures.length > 0) {
  console.error(`FAILED — ${failures.length} violation(s):`)
  for (const f of failures) console.error(`  · ${f}`)
  process.exit(1)
}
console.log('ALL CHECKS PASSED')
