# `generateBrief()` prototype — Appendix A equality test B

A standalone, dependency-free TypeScript implementation of
`generateBrief(siteJson) -> string` from **`docs/export-format.md` v2.2**, built
*before* Stage 3 to find out whether the spec's own worked example is actually
reachable by a deterministic implementation of the written rules.

**Result: BYTE-EXACT.** `generateBrief(parse(§7.1)) === §7.2`, 14 016 bytes,
both sides `sha256 e8ae78bfe7596b3acbf610ab690677d984a950af68a31f263fc09d910c750412`.
No special-casing, no fixture-shaped hacks — every line traces to the template
plus one `[N]` rule (the table below).

The BOSS-Blueprint repo was **read-only** for this work. Nothing here was written
into it.

## Run it

```
node tools/run-equality-test.ts [path-to-export-format.md]   # equality test B (+ C, + V7 counts)
node tools/boundary-tests.ts                                  # Appendix A boundary cases
node tools/wide-fixture.ts [--print]                          # the branches §7.1 cannot reach
```

Node ≥ 22.18 (native TypeScript type-stripping; verified on v24.15.0). No
install step, no dependencies. `tsc --strict --noEmit` is clean.

The spec path defaults to
`C:/Users/Cam/Documents/.ClaudeCode Projects/BOSS-Blueprint/docs/export-format.md`.
Both fixtures are extracted from that file at run time (Appendix A: "with both
blocks extracted from `docs/export-format.md` itself"), so a spec edit is what
turns the test red — there is no committed copy of the expected output to drift.

## Files

| Path | What |
|---|---|
| `src/types.ts` | `site.json` shape (§2) |
| `src/text.ts` | escaping/quoting (§3.3 r7–r8), number & size formatting ([N11]) |
| `src/layout.ts` | grouping [N1], rows/columns [N2], position phrases [N4], overlap [N5], overflow [N13] |
| `src/links.ts` | links-out [N9], resolved targets + separators [N10], shared-nav & reachability conditionals |
| `src/narration.ts` | per-type narration [N6], filler marker [N12], the block bullet, rule-8 verbatim sub-block |
| `src/pen.ts` | pen clusters and their three branch texts [N7] |
| `src/boilerplate.ts` | the three frozen regions + fixed fallbacks (§3.3 r1, r4) |
| `src/generateBrief.ts` | section assembly in §3.3 rule-1 order, group headers [N3], copy list [N8], assets |
| `tools/extract.ts` | pulls §7.1 (3-backtick `json`) and §7.2 (4-backtick `markdown`, containing a 3-backtick fence) out of the spec |
| `tools/run-equality-test.ts` | test B + test C + V7 marker counts, first-divergence reporter |
| `tools/boundary-tests.ts` | [N2]/[N4] thresholds, rule-7 escaping, truncation |
| `tools/wide-fixture.ts` | all six types, both copy modes, both pen roles, filler, unreachable page, absent optionals, escaping torture |

The generator is pure: no I/O, no `Date`, no `Math.random`, no mutation of the
input. All file access lives in `tools/`.

## Proof the test is real

A byte-exact pass on the first run is only meaningful if the harness can fail.
Three single-value mutations, each reverted:

| Mutation | Result |
|---|---|
| `[N4]` `W_HALF_MIN` 600 → 700 | NOT EQUAL at char 7502 (line 86 col 17): expected `about half the width`, got `narrow` |
| `[N11]` `Math.round` → `Math.floor` in the KB formatter | NOT EQUAL at char 11962 (line 135 col 70): `~210 KB` vs `~209 KB` |
| `[N7]` cluster expansion 40 → 400 px | NOT EQUAL at char 9025 (line 98): the two pen clusters merge into one bullet |

## Rule coverage

Every generation rule implemented, with its citation and how it is covered.
"§7.1" = exercised by the spec fixture and therefore proven byte-exact;
"wide" = exercised only by `tools/wide-fixture.ts` (no normative expected output
exists, so it is checked by invariants, not bytes).

### Template regions (§3.2, order fixed by §3.3 rule 1)

| Region | Implementation | Cover |
|---|---|---|
| `# Build brief — {businessName}` + provenance HTML comment (§6.7: appVersion, submission id, submittedAt, schemaVersion) | `generateBrief.ts` | §7.1 |
| `## Your role` — frozen boilerplate (§3.3 r1) | `ROLE_LINES` | §7.1 |
| `## The business` — Name / Tagline / About with fixed fallbacks (§3.3 r4) | `generateBrief.ts` | §7.1 (present) + wide (`— none provided —`) |
| `## Look & feel` — vibe, bare-hex color list [N11], style notes, heading levels, "not captured", polish | `generateBrief.ts` | §7.1 + wide (all four fallbacks) |
| `## Responsive rules` — frozen boilerplate | `RESPONSIVE_LINES` | §7.1 |
| `## Site inventory` — count line, table header, delimiter row (D3), one row per page with `1200×height` and [N9] | `generateBrief.ts` | §7.1 + wide |
| `## Navigation map` — per-page entry lines, shared-nav conditional, unlinked conditional, unreachable conditional | `generateBrief.ts` + `links.ts` | §7.1 (first two) + wide (differing navs, unreachable, page with no links) |
| `## Page walkthroughs` — preamble, per-page header, `Sketch:` line, groups, rows/columns, bullets, pen marks | `generateBrief.ts` + `narration.ts` + `pen.ts` | §7.1 + wide |
| `## Copy you must write (N item/items)` [N8] | `generateBrief.ts` | §7.1 + wide (0-item and computed-estimate paths) |
| `## Assets` — path, quoted filename, dims, `~KB`, usage list; empty fallback | `generateBrief.ts` | §7.1 + wide (empty) |
| `## Definition of done` — frozen boilerplate | `DEFINITION_OF_DONE_LINES` | §7.1 |

### Narration rules (§4.4)

| Rule | Implementation | Cover |
|---|---|---|
| **[N1]** section grouping; first containing section by center-y; nav caption; single "Outside any section"; groups by top edge | `layout.ts groupBlocks` | §7.1 (nav + 2 bands) + wide (outside group, section-less page) |
| **[N2]** union-find rows (≥50% of shorter height), union-find columns (≥50% of narrower width), 1-column rows as plain bullets, ≥2-column rows with `Row (…— K columns):` + `Column k (left\|middle\|right{, stacked top → bottom}):` | `layout.ts rowsOf/columnsOf/columnPlacement` | §7.1 (2 columns, hero pattern) + boundary (exact 50%, 3 columns) |
| **[N3]** the four exact group-header strings, en dash in the range | `generateBrief.ts groupHeader` | §7.1 (nav, bg, null-bg) + wide (outside) |
| **[N4]** width buckets 1120/960/600, `\|leftGap − rightGap\| ≤ 24` centered, horizontal omitted when full-width | `layout.ts positionPhrase` | §7.1 + boundary (every threshold) |
| **[N5]** `(overlaps «X»)` vs lower-z non-section blocks, escaped + truncated to 40 | `layout.ts overlapSuffix` | wide |
| **[N6]** the six per-type narrations verbatim, incl. `assetW×assetH` lookup and both alt-text-FROM-description instructions | `narration.ts narrate` | §7.1 (real, generate+lengthHint, filled slot, empty slot, page/none/external button, navBar) + wide (residual-text branch, null description) |
| **[N7]** pen clusters: union-find on 40px-expanded bboxes, role, ordering by bbox top, empty/filled split, integer bbox tuple, nearest-block guess with the **block's own** frame | `pen.ts` | §7.1 (filled sketch + annotation with guess) + wide (empty-slot sketch, 2-stroke cluster, annotation with no guess) |
| **[N8]** copy list in walkthrough order, `1 item`/`N items`, `chars = (w/8)×(h/24)` → `roughly ⌊c/8⌋–⌊c/5⌋ words`, headings → `a short headline, a few words`, context line | `generateBrief.ts lengthEstimate/contextLine` | §7.1 (lengthHint path, both-sides context) + wide (both estimates, one-sided context, 0 items) |
| **[N9]** distinct internal page names (self excluded) then distinct external hosts (`www.` stripped), `—` when empty | `links.ts linksOut` | §7.1 + wide (`—`, `www.` stripping) |
| **[N10]** `Name (\`slug\`)` / full URL / the two `none` phrasings, `button ` prefix in the nav map only, z-order iteration, separators ` · ` and `, ` | `links.ts` | §7.1 + wide |
| **[N11]** `~round(bytes/1024) KB`, bare hex, en-dash ranges, coordinates as stored (1 decimal max) | `text.ts` | §7.1 |
| **[N12]** untouched-template-filler parenthetical | `narration.ts fillerMarker` | wide |
| **[N13]** right-overflow marker, inert inside the page | `layout.ts overflowMarker` | wide |

### Escaping & line discipline (§3.3)

| Rule | Implementation | Cover |
|---|---|---|
| r3 client text in «…» | `text.ts quote` | §7.1 |
| r7 escape `«` `»` `\|` `*` `` ` ``; prefix leading `#` `-` `>` / digit-period | `text.ts escapeClientText` | boundary + wide |
| r8 CR/LF → `↵` inside the quote **and** an indented fenced verbatim sub-block beneath the bullet | `text.ts` + `narration.ts verbatimSubBlock` | §7.1 (nested bullet, fence at bullet indent + 2) + wide (CRLF) |
| r9 no invented data | see defect list — every undefined case is flagged rather than improvised silently | — |
| r10 unwrapped logical lines, one physical line per paragraph/bullet/header/table row/comment | the emitter is a `string[]` of logical lines joined with `\n` | §7.1 + wide invariant |
| §1 UTF-8, LF, final newline | `generateBrief` returns `lines.join('\n') + '\n'` | §7.1 |

### V7's counting contract (§3.3 rule 2)

The two frame-tuple-anchored regexes are run against the generated brief by
`tools/run-equality-test.ts` and `tools/wide-fixture.ts`: they return
**1 and 1** on §7.2 (= its generate-block and empty-slot counts) and **2 and 1**
on the wide fixture, including when a client's `real` text literally contains
`**WRITE THIS COPY** — client asks for: «x»` (rule 7 escapes the asterisks and
guillemets, so the count cannot be inflated). The Definition-of-done boilerplate
is uncountable by construction, as the spec claims.

Note the staging file `staging/stage-3-export-delivery/feature-brief-generator.md`
still carries the **pre-v2.1 draft** of those regexes and a different `[N13]`
marker string; `docs/export-format.md` v2.2 is the binding text and is what this
prototype implements. The staging file needs a sync pass.

---

## Spec findings

Nothing below was worked around with a fixture-shaped special case. Byte-exactness
was achieved on the rules as written; every item here is either (a) a place where
§3.2/§3.3 and §7.2 disagree and **§7.2 was followed** (test B is the binding
equality test), or (b) a case the spec simply does not define, where the choice
made is stated in a `README Dn` comment at the point of implementation.

Severity: **A** = must fix in v2.3 (produces wrong or broken output today) ·
**B** = spec/fixture disagreement, harmless but must be reconciled ·
**C** = under-specification; two implementers would diverge.

### A — produces broken output today

**D22. `[N5]`/`[N7]`/`[N8]` render `«»` for any `copyMode: "generate"` block.**
Those rules reference "the block's text/label/description". On a generate block
`text` is the *residual draft*, which is `""` in the normal case (the §7.1
fixture's own `blk_0005` has `"text": ""`). Measured in the wide fixture:
`- **Button** narrow, on the left (200, 500, 300, 60) (overlaps «»):` and
`- Surrounding context: sits above the heading «»`. The builder is told a block
overlaps *nothing named*. **Fix:** define the reference text as
`copyMode === 'generate' ? generateDescription : text` for heading/text blocks
(V5 guarantees it is non-empty), in all three rules. Byte-neutral on §7.1 —
`blk_0005` is never the *target* of an overlap, guess, or context reference there.

**D5. Rule 7 never escapes `\` itself.** A client who types `\«` gets `\\«` in
the brief only by accident of the guillemet escape; a client who types a bare
`\` gets it verbatim, and V7's "after reversing rule-7 escapes" step then has no
well-defined inverse (is `\«` an escaped guillemet or a literal backslash plus a
guillemet?). **Fix:** escape `\` first in the rule-7 list.

**D6. The "digit-followed-by-period" escape as written does not escape anything.**
Rule 7 says to *prefix* with `\`, giving `\1. Order now` (see the wide fixture).
In CommonMark a backslash before a digit is a **literal backslash** — the
ordered-list marker survives *and* a stray `\` ships to the builder. **Fix:**
escape the period instead (`1\. Order now`), or state that the whole leading run
is wrapped. Implemented literally here (`text.ts LEADING_ORDERED_LIST`).

**D-fn. Rule 7 does not escape `"`, but filenames are quoted with `"…"`.**
`originalFilename: 'my "best" photo|final.jpeg'` renders as
`client's file "my "best" photo\|final.jpeg"` — the quoting is broken and a V7
filename check would have to guess. **Fix:** add `"` to the rule-7 escape set
(or quote filenames with guillemets like everything else).

### B — §3.2/§3.3 vs §7.2 disagreements (fixture followed)

**D1. `styleNotes` is guillemet-quoted in §7.2 but bare in the §3.2 template.**
§3.2: `- **Client style notes:** {{styleNotes | "— none —"}}`; §7.2 line 1481:
`- **Client style notes:** «Cozy but not twee. …»`. Implemented per §7.2. **Fix:**
show the guillemets in the template.

**D2. §3.3 rules 3 & 7 ("client text never appears outside a «…» quotation or a
quoted `"…"` filename") are violated by §7.2 itself** — six times, all of which
the byte-exact test requires: `businessName` in the H1 and in `- **Name:**`;
`tagline`; `about`; every page `name` (`### Page 1 — Home`, the inventory table,
`- **Home** →`, the copy-list item, the assets usage line); `lengthHint`
(`- Length: ~2 sentences` and `(length: ~2 sentences)`); the shared-nav label
list (`(Home, Contact)`). The rule is what is wrong, not the fixture — quoting
the H1 would be absurd. **Fix:** restate rule 7 as "escaped everywhere; quoted in
«…» wherever the value is *copy* rather than an identifier", and enumerate the
bare-but-escaped sites so V7's "every «…»-quoted string" check stays exact.

**D3. §3.2's inventory table has no markdown delimiter row.** The template shows
the header row and jumps straight to `{{#each pages}}`; §7.2 emits
`|---|---|---|---|---|---|`. Without it the table does not render as a table.
Implemented per §7.2. **Fix:** add the row to the template.

**D4. Equality test C, as written in the staging feature file ("byte-matches its
§3.2 counterpart"), is unsatisfiable** — and for exactly the reason rule 10
gives: §3.2 is *displayed* hard-wrapped. Measured this session, all three frozen
regions are **whitespace-normalized MATCH / byte MISMATCH** against §3.2. The
staging file's claim "verified this session that §3.2's 'Your role' region is
already byte-identical to §7.2's" is false. **Fix:** define test C as
whitespace-normalized (as `tools/run-equality-test.ts` does), or unwrap §3.2's
prose regions too. Note this does *not* weaken test B — B stays byte-exact.

### C — under-specified (choice documented at the implementation site)

| # | Gap | Choice made |
|---|---|---|
| D7 | [N5] says "escaped and truncated to 40" — escape-then-truncate can cut a `\«` pair in half, and V7 reverses escapes before comparing | truncate the raw string, then escape (`text.ts quoteTruncated`) |
| D8 | [N1]'s nav caption is defined as "above the first section"; a page with **no** sections has no first section | treat the boundary as +∞, so a nav bar still gets `Nav bar:` |
| D9 | [N1] does not say whether a section band containing no blocks still emits a header | emit it — DoD item 2 requires the builder to build every band |
| D10 | [N5] is singular; a block may overlap several lower blocks | one suffix per overlapped block, nearest paint-neighbour first (descending z) |
| D11 | [N5]/[N7]/[N8] say "text/label/description" — a `navBar` has none of them | its item labels joined with `, ` |
| D13 | [N6]'s **filled**-slot branch has no null-`description` fallback and no validator guarantees one (V14 covers empty slots only) | render `«»` spec-literally; **recommend** a V-rule or a fallback phrase — same for the assets usage line |
| D14 | [N7] "bboxes … intersect" — inclusive or exclusive at the boundary? | inclusive |
| D15 | [N7] does not say which member's guess to print for a multi-stroke annotation cluster | the first stroke in draw order with a non-null target |
| D16 | [N8] "nearest block above / below" has no metric, and a tall neighbour in the same row is neither | strictly non-overlapping (`bottom ≤ my top` / `top ≥ my bottom`); this is what makes §7.1's answer (the heading, not the tall image slot beside it) come out right |
| D17 | [N8] has no fixed string for a block with no neighbour in its group; rule 4 forbids dropping the line | `nothing directly above or below it` — **needs a normative string** |
| D18 | The inventory count line is never pluralized; a 1-page site would read `1 pages` | pluralize (`1 page` / `N pages`) |
| D19 | (see D3) | — |
| D20 | The nav map defines no rendering for a page with no buttons and no nav bar | `- **Name** → —`, matching [N9]'s empty marker |
| D21 | The assets usage list has no separator defined for a multi-slot asset | `; ` (the entries themselves contain commas) |
| D12 | `generateDescription` is typed nullable but [N6]'s generate branch has no null case | `?? ''`; V5 makes it unreachable |

### Recommended v2.3 amendment set

1. D22, D5, D6, D-fn — correctness fixes to §3.3 rule 7 and to [N5]/[N7]/[N8]'s
   reference-text definition. All byte-neutral on §7.1, so test B survives.
2. D1, D3 — bring §3.2's template into line with §7.2 (quoting + delimiter row).
3. D2 — restate rule 7's "never bare" claim to match what the fixture actually
   does, and enumerate the bare-but-escaped interpolation sites.
4. D4 — define equality test C as whitespace-normalized.
5. D17, D18, D20, D21, D13 — add the five missing fixed strings/separators.
6. D7, D8, D9, D10, D11, D14, D15, D16 — one sentence each in the relevant [N]
   rule; any of them can be settled either way, but two implementers will
   currently diverge.

None of these block Stage 3: the generator in `src/` is byte-exact against §7.2
as the spec stands today, and each open choice is isolated behind a named
constant or a single function.
