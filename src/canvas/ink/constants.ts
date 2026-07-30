/**
 * INK REGION INFERENCE — every threshold the classifier decides on, in one place.
 *
 * No magic numbers anywhere else in `src/canvas/ink/**`, and every value a test
 * asserts on lives here with the reason it is that value. Where a number could be
 * MEASURED — off the app's own type scale, off the export contract, off a traced
 * drawing — it was measured rather than invented; where it could not, the comment
 * says which failure it is defending against, because a threshold with no named
 * failure mode is a threshold nobody can safely change later.
 */

/* ── Stage 0 — measurement ─────────────────────────────────────────────────── */

/**
 * The polyline is resampled to this spacing before turning is summed.
 *
 * Resampling is what makes `absTurn` SCALE-INVARIANT and immune to where the
 * commit-time RDP pass (`penThinning.ts`, ε = 0.5px) happened to keep vertices:
 * without it, the same shape drawn twice measures differently because the two
 * pointer traces were thinned differently. 12px is roughly a third of the smallest
 * glyph this module cares about, so a letter still contributes several samples.
 */
export const RESAMPLE_STEP_PX = 12

/**
 * Turning is measured between the chord BACK this many resampled samples and the
 * chord FORWARD the same. A ±1 lever arm measures the noise between two adjacent
 * samples; ±2 (a 24px arm at the step above) measures the shape.
 */
export const TURN_LEVER_SAMPLES = 2

/**
 * PERF BOUND: past this many candidate strokes the module returns no regions at all.
 *
 * Deterministic, bounded, and IDENTICAL TO TODAY'S BEHAVIOUR — which is only safe
 * because the empty result is a referential check, not a total partition: nothing
 * downstream may assume every stroke lands in a region. 400 is far past any real
 * sketch (the §7.1 fixture has 2) and keeps the enclosure search's worst case in
 * milliseconds.
 */
export const INK_MAX_STROKES = 400

/* ── Stage 1 — exclusions ──────────────────────────────────────────────────── */

/**
 * A stroke this far inside an image slot is a sketch OF the photo, not design.
 *
 * MIRRORS `IMAGE_SKETCH_AREA_RATIO` in `src/export/penRoles.ts` (§4.5). Kept as a
 * local copy rather than imported because `src/canvas` must not depend on
 * `src/export` — the export is the outer layer and imports canvas, not the reverse.
 * `metrics.test.ts` asserts the two stay equal, so the duplication cannot drift.
 */
export const INK_IMAGE_SKETCH_AREA_RATIO = 0.6

/* ── Stage 2 — segmentation ────────────────────────────────────────────────── */

/** Below this a shape is a letter or a tick, not a container worth building. */
export const ENCLOSURE_MIN_W_PX = 60
export const ENCLOSURE_MIN_H_PX = 40

/**
 * How far a drawn box may fail to meet itself and still count as closed.
 *
 * THE MOST TOLERANT of the three closure tests considered, on purpose: the defect in
 * the product owner's own drawing is "the pen strokes overshoot and leave gaps at
 * the corners". A `netTurn ≥ 5 rad` + corner-count gate fails on exactly that
 * drawing — a rounded corner spreads ~90° over ~47px of arc, so a 12px resample step
 * sees ~22° per vertex and counts ZERO corners.
 */
export const ENCLOSURE_CLOSE_GAP_PX = 24
/** …and the same gap as a fraction of path length, so a big box gets a big allowance. */
export const ENCLOSURE_CLOSE_GAP_RATIO = 0.12

/**
 * `pathLength ÷ bbox perimeter` ceiling — the honest rectangle/blob discriminator.
 *
 * A rectangle measures ≈1.0, an inscribed ellipse ≈0.79, and a cat outline with ears,
 * legs and a tail measures well above 1.5. This one number is why a cat is never a
 * panel, with a wide measurable margin rather than a coin flip.
 */
export const ENCLOSURE_PERIMETER_MAX = 1.6

/** People draw boxes in two pen-downs; strokes closer than this may fuse into one. */
export const ENCLOSURE_JOIN_GAP_PX = 32
/** …and at most this many, which covers "four sides, four strokes". */
export const ENCLOSURE_MAX_STROKES = 4
/**
 * A fused enclosure must have ink along at least this fraction of EVERY edge of its
 * union box. The minimum-of-four is the point: three good edges and one empty one is
 * a bracket, not a box.
 *
 * RAISED FROM 0.55 AGAINST THE FIXTURE CORPUS, and it is the difference between a
 * heading and a card. At 0.55 the traced word "Heading" — seven glyphs 56px tall,
 * whose tops touch the top of its own box, whose V-bottoms touch the bottom, and whose
 * first and last strokes touch the sides — measured 0.66 and FUSED INTO A PANEL. So
 * did the five-glyph display word in the classifier table, and so did two stacked body
 * squiggles at 0.78. Meanwhile genuinely boxed ink measures 1.00: two L-shaped halves
 * of a 200px box, and a 900×200 rounded rectangle split into two pen-downs, both at
 * every tolerance from 12px up. A hand-drawn box with a 60px gap in a 300px edge still
 * measures 0.88. Nothing that is actually a box lives between 0.66 and 0.88; a row of
 * letters does, which is why the bar belongs above it.
 */
export const ENCLOSURE_EDGE_COVERAGE = 0.8

/**
 * Ceiling on how many connected stroke subsets the fuse search may examine.
 *
 * The search is over connected subsets of size 2..`ENCLOSURE_MAX_STROKES`, which is
 * cheap on any real sketch and combinatorial on a pathological one. Stopping at a
 * fixed count keeps the module's worst case bounded WITHOUT making it
 * non-deterministic: the same input always examines the same subsets in the same
 * order and always stops in the same place.
 */
export const ENCLOSURE_SUBSET_BUDGET = 20000

/** An enclosure claims ink whose bbox is at least this contained in its own. */
export const CONTAINMENT_RATIO = 0.6

/** Nesting past this collapses. Two levels is a card inside a section; three is noise. */
export const MAX_CONTAINMENT_DEPTH = 2

/**
 * ANISOTROPIC proximity: two runs of ink join when the TRUE bbox gap is within both.
 *
 * The asymmetry is the whole point. Letters and words join sideways readily (40px),
 * but a heading must NOT swallow the nav row drawn 40px beneath it (18px) — the
 * product owner's "Cats-R-Us / Home Shop Contact" header is exactly that case. Note
 * this is a DIFFERENT function from the shipped `boxesIntersect`
 * (`src/export/brief/pen.ts`), which expands BOTH boxes and so tolerates 80px of true
 * gap in every direction; that clustering governs annotation narration and is
 * untouched.
 */
export const CLUSTER_GAP_X_PX = 40
export const CLUSTER_GAP_Y_PX = 18

/* ── Stage 3 — classification ──────────────────────────────────────────────── */

/** A `rule` is long, thin, dead straight and level. */
export const RULE_ASPECT_MIN = 6
export const RULE_MAX_THICKNESS_PX = 24
/**
 * A rule may bow this much, as a fraction of its own length.
 *
 * The gap to `PLACEHOLDER_CHORD_DEV_MAX` (0.25) is a MEASURABLE five-fold gap, not a
 * coin flip: a dead-straight line drawn with a mouse measures 0, and a hand-drawn
 * "line of text goes here" squiggle measures 0.06–0.20.
 */
export const RULE_CHORD_DEV_MAX = 0.05
export const RULE_MIN_LENGTH_PX = 96
export const RULE_MAX_TILT_DEG = 12

/** At this fraction of the page a rule reads as a section divider, not an underline. */
export const RULE_FULL_WIDTH_RATIO = 0.55
/** An underline looks this far above itself for the writing it belongs to. */
export const UNDERLINE_ATTACH_PX = 48

/**
 * THE HORIZONTAL SQUIGGLE — the single most common mark a non-technical person
 * makes, meaning "a line of body text goes here".
 *
 * Looser than `rule` on every axis because it is a gesture, not a construction:
 * shorter, thicker, wobblier. `rule` is tested FIRST, so a dead-straight long line is
 * a divider and a wobblier one is placeholder text.
 */
export const PLACEHOLDER_ASPECT_MIN = 5
export const PLACEHOLDER_MAX_H_PX = 40
export const PLACEHOLDER_CHORD_DEV_MAX = 0.25
/**
 * Total turning ceiling. A squiggle wanders; handwriting loops. 3.0 rad is a little
 * under one full revolution's worth of accumulated turn, which a single wavy line
 * cannot reach but a written word passes on its first two letters.
 */
export const PLACEHOLDER_ABS_TURN_MAX = 3.0
/**
 * How many stacked squiggles make ONE paragraph region rather than separate lines.
 *
 * A shorter run is still emitted — a lone squiggle is a one-line placeholder, not
 * nothing — so at 2 this reads as "always stack what you can". It is a knob rather
 * than a no-op: raising it to 3 would make a two-line stack come back as two
 * single-line regions, which is the behaviour a caller would want if it ever turned
 * out that two lines is too little evidence for a paragraph.
 */
export const PLACEHOLDER_MIN_LINES = 2
/** Consecutive lines of a stack are at most this far apart, baseline to baseline. */
export const PLACEHOLDER_LINE_GAP_PX = 60
/** …and start within this of each other, which is what makes a stack a BLOCK of text. */
export const PLACEHOLDER_LEFT_TOL_PX = 40

/**
 * WRITING, PRINT ROUTE. Print and cursive look nothing alike, so there are two
 * evidence routes and a region needs only one of them.
 */
export const TEXT_PRINT_MIN_STROKES = 3
export const TEXT_MIN_ASPECT = 1.5
/**
 * THE WAVE FILTER, and the reason print handwriting is separable from a squiggle at
 * all: a wavy line is ONE stroke spanning the whole atom, whereas handwriting is MANY
 * strokes each spanning a small fraction of it.
 */
export const TEXT_GLYPH_WIDTH_RATIO = 0.25
/**
 * How far the members' bottoms may scatter, as a fraction of the atom's height.
 *
 * 0.45 rather than 0.35 ON PURPOSE: real handwriting with a descender (the 'g' in
 * "Heading") measures around 0.36, and a 0.35 gate would demote the largest
 * handwriting on an otherwise empty page to `unsure`.
 */
export const TEXT_BASELINE_SPREAD_MAX = 0.45

/**
 * WRITING, CURSIVE ROUTE. Without it every single-stroke cursive word is lost — and
 * a wordmark like "Cats-R-Us" is exactly that. 9 rad is about a turn and a half of
 * accumulated wander, which no rule, squiggle or tick comes close to.
 */
export const TEXT_CURSIVE_ABS_TURN_RAD = 9.0
/** …and cursive is airy: its convex hull is mostly empty box, unlike a filled blob. */
export const TEXT_CURSIVE_HULL_FILL_MAX = 0.72
/** A written word is at least this much wider than it is tall. */
export const TEXT_CURSIVE_MIN_ASPECT = 2.0

/**
 * Writing at least this tall is a heading.
 *
 * ANCHORED TO THE APP'S OWN TYPE SCALE — `BlockView.css` renders a heading block at
 * 40px — so it is traceable to something the client has actually seen on screen
 * rather than invented here.
 */
export const HEADING_MIN_GLYPH_PX = 40
/** …or this much taller than the page's median writing, whichever fires first. */
export const HEADING_RELATIVE_RATIO = 1.5
/**
 * A heading needs REAL LETTERS to be tall. Below this median glyph height a writing
 * run has no measurable letter shape, so it is body at most — never `heading`/`display`
 * and never a page's `<h1>`.
 *
 * The failure this defends against is a hand-drawn dashed divider: five dead-flat
 * dashes cluster into one writing run whose member heights are all 0, so its median
 * glyph height is 0. Nothing floored that, so `0 ≥ HEADING_RELATIVE_RATIO · 0` read as
 * true and promoted a flat line to the page's only `<h1>`. The degenerate value is
 * exactly 0 (a flat run's raw bbox height is 0); the smallest REAL glyph in the fixture
 * corpus is the 24px nav word, and RESAMPLE_STEP_PX (12) is the smallest feature this
 * module resolves — a run whose letters are shorter than one resample step carries no
 * letter shape. 12 sits between the two: it excludes every degenerate/near-flat run
 * while admitting every real glyph the corpus contains, so no genuine small heading is
 * demoted.
 */
export const HEADING_MIN_REAL_GLYPH_PX = 12

/** Centring/edge alignment is called within this of the scope's centre or edges. */
export const ALIGN_TOL_PX = 24

/**
 * Words split at a horizontal gap this many glyph-heights wide. Word segmentation is
 * what makes nav detection possible at all.
 */
export const WORD_SPLIT_GAP_RATIO = 1.2

/** A nav row lives in the top band of the page (or in a header box that does). */
export const NAV_TOP_BAND_PX = 240
export const NAV_MIN_WORDS = 2
/** Deliberately matches the export schema's `navBar` `maxItems: 10`. */
export const NAV_MAX_WORDS = 10
/** Nav items are spaced, not just adjacent. */
export const NAV_MIN_GAP_RATIO = 1.2
/**
 * REGULARITY, not just spacing: the gaps between nav items are near-equal, and a
 * sentence's are not. Expressed as a coefficient of variation so it holds at any size.
 */
export const NAV_GAP_CV = 0.6
/** A nav item is a word or two, never a sentence. */
export const NAV_MAX_WORD_WIDTH_RATIO = 0.22
/** A full-width rule this close beneath a nav row corroborates it. */
export const NAV_RULE_ATTACH_PX = 80
/** …as does the row itself spanning this fraction of the page. */
export const NAV_MIN_SPAN_RATIO = 0.5

/**
 * ARTWORK — the residual, but still POSITIVELY tested so an arrow never becomes art.
 *
 * A cat outline (5–15 strokes, path length in the thousands, huge accumulated turn)
 * passes. An arrow — shaft plus two head strokes — measures ≈2–3 rad of turn and
 * FAILS, returning to the annotation pool. That turn floor is the entire defence
 * against promoting marginalia to artwork.
 */
export const ARTWORK_MIN_STROKES = 3
export const ARTWORK_MIN_DIAG_PX = 160
export const ARTWORK_MIN_PATH_PX = 600
export const ARTWORK_MIN_ABS_TURN_RAD = 6.0
/** One or two strokes carry less evidence, so they need more turn — or real width. */
export const ARTWORK_SOLO_ABS_TURN_RAD = 4.0
export const ARTWORK_BAND_MIN_W_PX = 600

/** A long, shallow drawing across the page is a background wave, not a picture. */
export const BAND_WIDTH_RATIO = 0.6
export const BAND_ASPECT_MIN = 4

/* ── Stage 4 — sibling sets ────────────────────────────────────────────────── */

/**
 * Two drawn panels are the SAME COMPONENT USED TWICE when they are within this of
 * each other in both dimensions and share a row or a column. Hand-drawn boxes are
 * never the same size to the pixel; 15% is the slop of a steady hand at card scale.
 */
export const SIBLING_SIZE_TOL = 0.15
export const SIBLING_ALIGN_TOL_PX = 40
/** For three or more, the GAPS must be regular too, or it is a coincidence. */
export const SIBLING_GAP_TOL_PX = 40
export const SIBLING_MIN_MEMBERS = 2

/* ── Stage 5 — confidence, ids ─────────────────────────────────────────────── */

/**
 * A region that cleared its binding threshold by less than this RELATIVE margin is
 * `unsure`, and its narration will tell the builder to trust the PNG.
 *
 * Only measured gates count toward the margin; discrete counts (how many strokes, how
 * many lines) do not. A count of exactly the minimum is not "barely" anything — it is
 * exactly the rule, and integers carry no measurement noise to be near a boundary of.
 */
export const CONFIDENCE_MARGIN = 0.25

/** §4.8 — every ordinal id is zero-padded to four digits, as `blk_`/`stk_` already are. */
export const INK_ORDINAL_DIGITS = 4
export const INK_REGION_ID_PREFIX = 'reg'
export const INK_SET_ID_PREFIX = 'set'

/* ── Derived page measures ─────────────────────────────────────────────────── */

/*
 * The page's design width is NOT re-declared here. Every ratio that needs it imports
 * `PAGE_WIDTH_PX` from `src/canvas/constants.ts`, which already carries the rule that
 * the design width and the export render width are never forked. A local copy would be
 * exactly that fork.
 */

/** Edge coverage samples 51 positions per edge — odd, so a midpoint is always tested. */
export const EDGE_COVERAGE_SAMPLES = 51
/** …and accepts ink within the larger of 12px and 6% of the box diagonal. */
export const EDGE_COVERAGE_MIN_TOL_PX = 12
export const EDGE_COVERAGE_DIAG_RATIO = 0.06
/**
 * …but never further than `ENCLOSURE_CLOSE_GAP_PX`, however big the box is.
 *
 * MEASURED, NOT GUESSED, and load-bearing. On the traced wave-and-cat drawing the red
 * wave's union box is 1080×91, so 6% of its diagonal is 65px — wide enough that a sine
 * curve wandering through the MIDDLE of the box counts as ink "on" all four edges. It
 * measured 0.84 coverage and fused into a panel: the page-wide background wave would
 * have been BUILT AS A CARD. The ratio exists to forgive a shaky hand, not a shape
 * that is nowhere near its own edge, and a hand does not get shakier because the box
 * is wider.
 *
 * The cap is the closure allowance for a reason: 24px is already this module's
 * statement of how far a hand may stray from where a box ought to be. Swept over the
 * fixture corpus, the wave measures 0.84 at 65px, 0.51 at 40px and 0.39 at 24px, while
 * genuinely boxed ink — two L-shaped halves, and a 900px rounded rectangle split in
 * two — measures 1.00 at EVERY tolerance from 12px up. So this only ever costs
 * tolerance where tolerance was doing harm.
 */
export const EDGE_COVERAGE_MAX_TOL_PX = ENCLOSURE_CLOSE_GAP_PX

/* ── Derived measurement helpers ───────────────────────────────────────────── */

/**
 * The band, as a multiple of the rough median, that the second glyph-height pass
 * keeps. Capitals run tall and descenders run long, and a plain median over a word
 * like "Heading" is dragged by both; re-medianing over the members that are plausibly
 * the same size as each other is what makes the answer the X-HEIGHT rather than the
 * average of the outliers.
 */
export const GLYPH_HEIGHT_LOW_RATIO = 0.5
export const GLYPH_HEIGHT_HIGH_RATIO = 1.6

/** The cursive route reads one unbroken trace, or two if the pen was lifted once. */
export const TEXT_CURSIVE_MAX_STROKES = 2

/**
 * No single member of print handwriting may span more than this much of the word.
 *
 * MEASURED, NOT GUESSED, and it is what stopped the traced wave-and-cat drawing being
 * built as text. The median-glyph-width term alone is the stated wave filter, but on
 * the real drawing the page-wide wave picks up four short tick marks hanging off it:
 * five members, four of them a pixel wide, so the MEDIAN member width is 0 and the
 * filter passes. The wave was classified `writing`. The design's own words for the
 * filter are "many strokes EACH spanning a small fraction", and this is that sentence
 * as a gate. At 0.6 it cannot touch real handwriting — a seven-glyph word measures
 * 0.10 — but a stroke that spans the whole atom is a line THROUGH the writing, never a
 * letter in it.
 */
export const TEXT_WIDEST_GLYPH_RATIO = 0.6
