# RECONCILIATION — `template-content-draft.md` → `starterTemplates.ts`

_Written 2026-07-28. Every deviation the fixture makes from the content draft, and why.
Sources of truth, in order: **landed code** (`src/canvas/*`, `src/constants/blockTypes.ts`,
`src/components/BlockView.css`) > `docs/decisions.md` > the ruled-on export-format draft >
the content draft._

The **content itself is unchanged**: every heading, paragraph, menu line, phone number,
image description, button label and generate-prompt is transcribed verbatim from the draft
(`⏎` → a real `\n`). All deviations below are schema, geometry or naming.

---

## 1. Schema: fields dropped, renamed, or added

| Draft field | In the fixture | Why |
|---|---|---|
| `z` (0 / 1 / 2 / 10) | **dropped** — array position | The landed `Block` has no `z`. Paint order IS array order (`src/canvas/zorder.ts`). Encoded as: full-width bands first (by y), then content by (y, then x). |
| `section.tone` (`hero`/`tinted`/`plain`) | **dropped** | Not in the landed code; draft §9.2 says drop rather than add a field. All bands ship identical. (`section.background` exists only as Stage-3 *export* schema headroom — it is a hex colour, not a tone, so it is not a home for this.) |
| `heading.level` (1 / 2) | **dropped** | Same §9.2 fallback. Hierarchy is carried by size and position, which the export's brief generator already reads (export-format §4.4). |
| `text` (copy) | landed `text` | Unchanged. |
| `description` on heading/text | **`generateDescription`** | The draft overloads one name for two different things (a copy prompt vs an image's alt/sourcing line). The export contract already separates them (export-format §2.7); using its names makes the Stage-3 mapping a rename-free copy. |
| `label` on button | landed **`text`** | The landed button's `textMode` is `single-line` and `BlockView` renders `text` in the pill. A second field would be a duplicate the client could desync. |
| `linkTo: "page:menu"` | **`link: { kind: 'page', pageId: 'menu' }`** | The export's link union (export-format §2.8), verbatim. Storing the union avoids parsing a string at the boundary, and carries `external` / `none` for free. |
| `items: "Home→home \| Menu→menu"` | landed **`text`** (`"Home, Menu, Visit Us"`) **plus** `items: [{id,label,link}]` | The landed nav renders `text` split on `NAV_ITEM_SEPARATOR`; Stage 2 adds per-item link targets. The fixture writes both from ONE source (the `navBar()` builder), so they cannot disagree. |
| `fit`, `lengthHint`, image `description` | unchanged | Already specced (feature-image-upload / feature-copy-blocks). |
| `fromTemplate: true` | on all 138 blocks | decisions.md 2026-07-28. |
| — | `assetId` **not** added | An empty image slot is fully expressed by "no asset field". The export requires `assetId: null`; the Stage-3 mapper can supply it. Not inventing store fields for the templates. |
| — | `pickerTitle` / `pickerLine` added per template | Draft §8.2's picker card copy had no home; the picker needs it and it belongs with the template it describes. |
| — | `siteSettings` added per template | Draft's "Optional siteSettings seed" tables (feature-site-settings.md). Empty values are `''` / `[]` (form state), not `null`; the export maps empty → `null`. `businessName` is typed `''` so it *cannot* ship non-empty (decisions.md). |

**Not in the fixture:** the Blank start. It is zero blocks plus a dismissible non-block coach
overlay (decisions.md 2026-07-28), so there is nothing to seed — and a 0-block page would
violate the 5–12 rule the fixture tests assert.

---

## 2. Nav bar: draft `z: 10` (always on top) → back of the array

The landed palette marks `nav-bar` as `placement: 'stacked'`, and `addBlock` inserts stacked
blocks at the **back** (`insertBlock(..., 'back')`). Rather than fight that, every page's nav
is `blocks[0]`, and the validator asserts **nothing on any page overlaps the nav bar's
rectangle** — so "always on top" is unnecessary here: nothing can cover it. If Stage 2 later
lets a client drag a band up over the nav, `bringBlockForward` is the fix, not a new field.

---

## 3. Geometry: everything snapped to the landed 8px grid

`GRID_SIZE_PX` is 8 (`src/canvas/constants.ts`) and the editor snaps every drag/resize to it.
A fixture off the grid would jump the first time a client touched it. Several of the draft's
own layout constants are not multiples of 8, so they had to move.

### 3.1 Column presets (draft §2)

| Draft | Fixture | Why |
|---|---|---|
| 2-col even: 500 + 500, x 80 / 620, gutter 40 | **496 + 496, x 80 / 624, gutter 48** | 500 and 620 are off-grid. 1040 has no on-grid even split with a 40 gutter; 48 gives two clean 496s and keeps both page margins at 80. |
| 2-col 60/40: 620 + 380, x 80 / 740 | **624 + 376, x 80 / 744**, gutter 40 | 620, 380 and 740 are all off-grid. |
| 3-col even: 320 × 3, x 80 / 440 / 800 | **unchanged** | Already exact: 320×3 + 40×2 = 1040. |
| `BAND_PAD_TOP` 52 | **48** | 52 is off-grid, and it drives every "band top + 52" y in the draft. |
| Portfolio About's 440 / 520 split at x 80 / 600 | **unchanged** | Already on-grid. |

### 3.2 Band heights snapped (bands still stack with no gaps)

`380→384`, `340→336` (×2), `220→224` (×3), `420→424` (×3), `500→504`, `260→264`.
Every other drafted band height (200, 240, 280, 320, 400, 440, 480, 520, 560, 600, 840) was
already on-grid and is unchanged. Resulting page bottoms differ from the draft's stated
"page height ≈" by **at most 4px**; six of the twelve match exactly.

### 3.3 Block sizes snapped

`500→496`, `520→496` (half-column headings), `620→624`, `700→704`, `660→664`, `300→296`
or `304`, `340→344`, `260→264` (buttons), `220→224`, `180→176`, `140→144`, `110→112`,
`100→104`, `60→56`, `52→56`.

### 3.4 Hero text inset

Restaurant and Shop home lay their hero title/button at `x: 100` in the draft (off-grid, and
unexplained). Both now use `MARGIN_X` (**80**) — one margin system for the whole page, and
the deliberate overlap with the hero photo is unaffected.

---

## 4. Geometry: boxes grown so the default copy is not clipped

`.block-content` is `overflow: hidden` (`BlockView.css`), so copy that does not fit is
**clipped, not scrolled** — a template whose own coaching text is cut in half is a defect,
and it would be baked into the Stage-3 page PNG. Measured against the landed sketch
typography (text 18px/1.55, heading 40px/1.15 bold, button pill 18px bold `nowrap`):

| Block(s) | Draft | Fixture | Reason |
|---|---|---|---|
| 8 section-title headings (`rest-menu-starters-title`, `rest-menu-mains-title`, `rest-visit-where-title`, `trade-quote-contact-title`, `trade-quote-area-title`, `port-contact-reach-title`, `shop-contact-store-title`, `shop-contact-ship-title`) | h 48 | **h 56** | one 40px line needs 46 + 8 padding = 54 |
| `rest-menu-intro`, `shop-shop-intro` | h 56 | **h 72** | wraps to 2 lines |
| `port-work-sub` | h 64 | **h 72** | wraps to 2 lines |
| `shop-shop-cap-1/2/3` | h 60 | **h 72** | two explicit lines (name + price) |
| `rest-visit-where-body` | h 280 | **h 304** | 9 lines of address/hours + a wrapping tail |
| `trade-quote-contact-body`, `shop-contact-store-body` | h 260 | **h 280** | as above |
| `port-about-clients-list` | h 200 | **h 240** | 4 client lines + a 2-line coaching tail |
| `trade-home-hero-title` | 600 × 100 | **624 × 104** | "Ridgeway Plumbing & Heating" wrapped at 600 |
| `port-contact-cta-title` | 760 wide | **1040 wide** | "Based in Halifax, shooting Canada-wide" wrapped at 760 |

The fit model is an approximation (≈0.5em per char regular, ≈0.55em bold). It is
deliberately conservative, but a **real render check at landing** (Playwright screenshot of
each template, per feature-templates.md's "How We'll Verify") should confirm it.

---

## 5. Pages: slugs and ids

- **Slugs.** The draft writes routes (`/`, `/menu`, `/visit`). The fixture stores kebab-case
  slugs (`home`, `menu`, `visit-us`, `get-a-quote`, `find-us`, `work`, `about`, `contact`,
  `shop`) — the exact output of the export's `slugify(name)` (export-format §4.1). The
  homepage is `pages[0]`, by position, with **no** `isHome` flag and no `/` slug
  (export-format §2.1).
- **Slug may not need to be stored at all.** Export §4.1 computes slugs fresh at export so a
  rename can't leave a stale one. The field is included because the task asked for it and
  because E2E tests want a stable handle; if Stage 2 makes slugs derived, delete the field —
  the values here are then just the expected derived output.
- **Portfolio's home page is named "Work"**, at slug `work` (not "Home"). Kept per
  decisions.md 2026-07-28 ("page names are free-form"); the draft's fallback ("rename it to
  Home if the page strip can't express it") was NOT taken.

### 5.1 Open conflict for the Stage-3 implementer (not fixed here)

The export schema (export-format §2.5/§2.6/§2.7) requires `pg_` + 4–16 `[a-z0-9]` page ids,
`blk_` + 4–16 `[a-z0-9]` block ids and `nav_…` nav-item ids. **None of this fixture's ids
match those patterns** (`rest-home-hero-title`, `home`, `rest-home-nav-menu`) because the
content draft mandates them verbatim so E2E tests and link targets can reference them, and
the landed `parseBlueprint` accepts any non-empty string id. Two ways out, both cheap —
pick one and record it:

1. the exporter remaps ids at export time (exactly what §4.6 already does for `img_NNN`), or
2. the export schema's id patterns loosen to "non-empty string".

Option 1 preserves the export as a stable public contract and is the recommended one.

---

## 6. Consequences worth knowing at review

- **Bands render the palette's placeholder label.** Section blocks ship `text: ''`, so
  `BlockView` shows the type's placeholder ("Section band") exactly as it does for a
  hand-added section. Correct, but reviewers looking at a screenshot will see the tag.
- **Image slots ship `text: ''` too**; today they render the "Image" placeholder. The
  Stage-2 empty-slot marker is the `description` field, which is already populated on all 25
  slots.
- **File size.** 1,573 lines vs the repo's ≤400-line convention. Recommended landing shape:
  `src/templates/{restaurant,trades,portfolio,shop}.ts` plus a shared
  `src/templates/layout.ts` (constants + the two builders) re-exported from `index.ts`.
- **`validate-fixtures.mjs` is a scratch tool**, not repo code. Its checks are written to
  port straight into `src/templates/starterTemplates.test.ts` — which is what
  feature-templates.md's "each template fixture validates against the store schema" means.

---

## 7. What was verified, and how

| Check | Result |
|---|---|
| `tsc --noEmit` with the repo's exact flags (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `erasableSyntaxOnly`, `noUnusedLocals`, `verbatimModuleSyntax`) | exit 0 |
| `node validate-fixtures.mjs` (11 invariant families, 4 templates / 12 pages / 138 blocks) | ALL CHECKS PASSED |
| Block types, `minSize` clamps and nav-text parsing checked against the **real** landed modules (copied read-only into a temp tree — the repo was never written to) | conformant |
| Counts vs the draft's §9.4 table (per-page 12/12/11 · 12/12/12 · 12/10/11 · 11/12/11, generate 1/2/1/2, cross-page buttons 3/4/3/3) | exact match |
