# BOSS Blueprint

**Sketch your website. We build it.**

→ **[frankyface.github.io/BOSS-Blueprint](https://frankyface.github.io/BOSS-Blueprint/)**

BOSS Blueprint is a free, browser-based design tool from [BOSS](https://bossolutions.pro). Lay out
your future website like a slide deck — drop in sections, headings, text, images, buttons and a nav
bar — or draw the page freehand with the pen, where a box becomes a card and your handwriting
becomes a heading. Add as many pages as you need and wire the menu up. When you're happy, hit
Submit: you get a build package to send us, and we build the real website exactly the way you laid
it out.

No account. No install. Nothing to pay. It runs entirely in your desktop browser, and your work
stays on your own machine until you choose to send it.

## What you can do

- **Start from a template or from nothing** — Restaurant, Trades, Portfolio and Shop come pre-laid
  out with real-looking placeholder copy; Blank is an empty page and a nudge in the right direction.
- **Six kinds of block** — Heading, Text, Image, Button, Nav bar and Section (a coloured background
  band). Click one to drop it on the page, drag it where you want it, drag its handles to resize,
  double-click to type.
- **A pen that draws the page, not just notes about it** — a box you draw is a card, your
  handwriting is a heading or a line of body text, a row of words is a nav bar, a wave across the
  top is artwork. Circling something and writing "make this bigger" still works exactly as before.
  You can sketch a whole page freehand, with no blocks on it at all, and still submit it.
- **Room to draw** — **Page length: Add space / Trim** in the toolbar, or drag the page's bottom
  edge. The space is added *below* your content, which is why Trim can never crop away a block or a
  pen mark: there is nothing of yours in the part it takes back.
- **Real photos** — put an image straight into a slot. Big photos are shrunk in the browser, so the
  package stays small.
- **As many pages as you like** — add, rename, duplicate, reorder. Link a button or a menu item to
  another page, and the **Nav map** shows what points where — and what nothing points at.
- **"Write it for me"** — no words yet? Describe what the text should say ("a warm two-sentence
  welcome for a family bakery") and leave the writing to us. The block shows your description, so a
  half-finished page still reads like a plan rather than a mistake.
- **It saves itself** — your draft is kept in this browser as you work. You can also download it as
  a `.blueprint` file and open it again later, here or on another computer.

## What the pen builds

Ink is design, not commentary. Every mark is measured where it sits and read as a thing to build:

| What you draw | What we build |
| --- | --- |
| a closed box | a card |
| two matching boxes side by side | **one** card component, used twice — not two unrelated boxes |
| handwriting | a heading or a line of body text, depending on how big you wrote it |
| a row of short words across the top | a nav bar |
| a long straight line | a divider |
| a stack of squiggly lines | body copy — "real paragraph text goes here" |
| anything else | artwork |

Artwork is reproduced from the exact path your pen travelled, as an inline SVG, and may then be
restyled into the site's colours. A drawing that is much wider than it is tall becomes a full-bleed
decorative band across the page.

Colour is how you separate things: draw one thing, then draw the next in a different colour, and we
read them as two objects rather than one. No colour means anything special any more — the pen starts
in Ink, and red is just red.

**"Show what we read"** — a checkbox on the pen toolbar. Tick it and each thing we detected is
outlined on your drawing and named in one word: `card`, `words`, `nav`, `line`, `text`, `drawing`,
or `note` for a mark we read as a note about the design rather than part of it. A `?` after the word
means we are not sure. If something is read wrongly, rub it out and draw it again — that is the fix,
and the reason there is no "no, it's a heading" button to press.

**Where this stops.** The reading is geometry, not magic. It measures shape, size, spacing and
colour; it has no idea what your business is, and it can be wrong — a box you didn't quite close can
come back as a `drawing` rather than a `card`. That is exactly what the overlay and the `?` are for.
The package we build from says the same thing: where the reading and the picture disagree, the
picture wins.

Handwriting is not read by the app. Nothing in your browser tries to recognise letters — the words
are read off the sketch picture by the person building the site. Small or messy handwriting may
still not be readable, and when it isn't, they write copy that fits the spot and log that they did
rather than guessing silently.

## What happens when you press Submit

Submit checks the design over first and tells you, in plain English, about anything that would leave
us guessing — an empty text box, a "write it for me" block with no description — with a **Take me to
it** button beside each one. Warnings (a page nothing links to, template text you never changed) are
shown, but they never block you.

Then the package **downloads to your computer**: one `.zip`, named after your business, containing

| In the zip | What it is |
| --- | --- |
| `site.json` | every page, block, drawn region, position, link and setting, as data |
| `brief.md` | the same thing written out for a human to read |
| `pages/01-home.png` … | a picture of each page exactly as you drew it, pen marks and all |
| `assets/img_001.jpg` … | the photos you uploaded |

The last screen gives you a pre-filled email to send it with, and the address as copyable text if
you would rather attach it yourself. Nothing is uploaded behind your back: the file is on your disk,
and sending it is your click.

**It works best on a desktop or laptop.** On a phone you can look around and scroll, but dragging,
drawing and resizing need a bigger screen — the app says so rather than pretending otherwise.

## Working on it

Requires Node 24+.

```bash
npm ci                  # install
npm ci --prefix scripts/roundtrip   # the round-trip gate's OWN lockfile — needed before `npm run e2e`
npm run dev             # http://localhost:5173/BOSS-Blueprint/
npm test                # unit tests (vitest)
npm run test:coverage   # …with the per-layer coverage gates
npm run lint            # eslint, type-aware
npm run build           # production build into dist/
npm run e2e             # builds, then Playwright across chromium + firefox + webkit
```

The second install is not optional and not obvious: `e2e/submit.spec.ts` shells out to
`scripts/roundtrip/gate.mjs`, which imports no app code on purpose and so carries its own
dependencies. Skip it and the E2E run fails on `ERR_MODULE_NOT_FOUND: adm-zip`.

The E2E suite always runs against the **production build** served by `vite preview`, so every run
also proves the `/BOSS-Blueprint/` base path is right.

```bash
npm run roundtrip:smoke   # one scenario, preview target, ~12 minutes
```

The round-trip test hands a real submitted package to a fresh Claude session with no other context
and scores the site it builds — the one check that says whether the export is genuinely buildable.
**The smoke run is mandatory before merging any change to `src/export/`, the export schema, the
brief generator, the starter templates or the PNG renderer.** The full gauntlet is
`npm run roundtrip:full`; the protocol both implement is `docs/roundtrip-protocol.md`.

The brand rasters in `public/` (the `.ico`, the Apple touch icon and the social card) are generated
from `public/favicon.svg` by `node scripts/brand/make-brand-assets.mjs` and committed. Regenerate
them when the mark changes rather than editing them by hand.

The palette is lifted from `bossolutions.pro`'s own stylesheet and lives in one file,
`src/styles/theme.css`; the only other places holding a brand literal are `public/favicon.svg` and
the generator above, so a rebrand is those three. **Only the colours are matched** — the site's other
half of the brand is Poppins, served from Google, and this app makes no third-party request at
runtime. Self-hosting a subset would be the way to close that gap.

The per-engine export baselines in `e2e/export-visual.spec.ts-snapshots/` are pictures of one
operating system's font rasterisation, so `-win32` and `-linux` files are committed side by side and
neither can stand in for the other. They regenerate **only** through the `update_visual_baselines`
input on the `workflow_dispatch` trigger in `.github/workflows/deploy.yml`, which runs the spec with
`--update-snapshots=all` on ubuntu, uploads the `-linux` files as an artifact and leaves committing
them to a human — a job that re-baselined itself on every push would bless regressions instead of
catching them. A committed baseline that no longer matches is a hard failure everywhere, so anything
that changes how an exported page looks (the theme included) means redoing both platforms' sets.

## Finding your way around the repo

| File | What it holds |
| --- | --- |
| `CLAUDE.md` | the constants — stack, conventions, verification protocol |
| `handoff.md` | where the work is right now (a snapshot, never a journal) |
| `staging/<stage>/feature-*.md` | the ordered work list, each with its own verification log |
| `docs/master_plan.md` | the full product vision |
| `docs/export-format.md` | the frozen package contract every consumer depends on |
| `docs/roundtrip-protocol.md` | how "is the export actually buildable?" is measured |
| `docs/decisions.md` | design calls that were argued out, and why they went that way |
| `help.md` | the things only a human can do, still open |

Built with React, TypeScript and Vite. Hosted on GitHub Pages. No backend, no database, no accounts,
and no third-party request at runtime.
