# BOSS Blueprint

**Sketch your website. We build it.**

→ **[frankyface.github.io/BOSS-Blueprint](https://frankyface.github.io/BOSS-Blueprint/)**

BOSS Blueprint is a free, browser-based design tool from [BOSS](https://bossolutions.pro). Lay out
your future website like a slide deck — drop in sections, headings, text, images, buttons and a nav
bar, scribble notes over the top with the pen, add as many pages as you need and wire the menu up.
When you're happy, hit Submit: you get a build package to send us, and we build the real website
exactly the way you laid it out.

No account. No install. Nothing to pay. It runs entirely in your desktop browser, and your work
stays on your own machine until you choose to send it.

## What you can do

- **Start from a template or from nothing** — Restaurant, Trades, Portfolio and Shop come pre-laid
  out with real-looking placeholder copy; Blank is an empty page and a nudge in the right direction.
- **Six kinds of block** — Heading, Text, Image, Button, Nav bar and Section (a coloured background
  band). Click one to drop it on the page, drag it where you want it, drag its handles to resize,
  double-click to type.
- **A pen** — circle something, write a note in the margin, sketch the photo you have in mind. Your
  marks travel with the page and we read them.
- **Real photos** — put an image straight into a slot. Big photos are shrunk in the browser, so the
  package stays small.
- **As many pages as you like** — add, rename, duplicate, reorder. Link a button or a menu item to
  another page, and the **Nav map** shows what points where — and what nothing points at.
- **"Write it for me"** — no words yet? Describe what the text should say ("a warm two-sentence
  welcome for a family bakery") and leave the writing to us. The block shows your description, so a
  half-finished page still reads like a plan rather than a mistake.
- **It saves itself** — your draft is kept in this browser as you work. You can also download it as
  a `.blueprint` file and open it again later, here or on another computer.

## What happens when you press Submit

Submit checks the design over first and tells you, in plain English, about anything that would leave
us guessing — an empty text box, a "write it for me" block with no description — with a **Take me to
it** button beside each one. Warnings (a page nothing links to, template text you never changed) are
shown, but they never block you.

Then the package **downloads to your computer**: one `.zip`, named after your business, containing

| In the zip | What it is |
| --- | --- |
| `site.json` | every page, block, position, link and setting, as data |
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
npm run dev             # http://localhost:5173/BOSS-Blueprint/
npm test                # unit tests (vitest)
npm run test:coverage   # …with the per-layer coverage gates
npm run lint            # eslint, type-aware
npm run build           # production build into dist/
npm run e2e             # builds, then Playwright across chromium + firefox + webkit
```

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
