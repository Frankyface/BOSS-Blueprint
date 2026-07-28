# BOSS Blueprint — Starter Template Content (design draft)

_Content design for `staging/stage-2-full-sketching/feature-templates.md`. Written 2026-07-28.
This is a **content spec**, not code — the implementer turns each page table into a design-state
fixture. Nothing here was written into the repo._

---

## 1. How to read this doc

Every page below is one table. Columns are fixed:

| Column | Meaning |
|---|---|
| `id` | Stable block id for the fixture. Prefix = `<template>-<page>-<role>`. Use these verbatim so E2E tests and link targets can reference them. |
| `type` | One of the six real block types (see mapping below). |
| `x y w h` | Integers in **page design units** on the fixed **1200px-wide** page. `y` is measured from the top of the page (not the section). Height grows downward; each page's total height is stated under its table. |
| `z` | Paint order, low → high. Convention: section bands `0`, ordinary content `1`, content deliberately layered on a photo `2`, nav bar `10` (always on top). |
| `props / default content` | Semicolon-separated fields. In copy strings, **`⏎` means a line break inside the block's text.** |

### Block type mapping (spec name → code id)

The task brief says `imageSlot` / `navBar`; the shipped palette
(`src/constants/blockTypes.ts`) uses `image` / `nav-bar`. **This doc uses the code ids.**

| Code id | Brief's name | Renders as |
|---|---|---|
| `section` | section | full-width background band |
| `heading` | heading | large single-line text |
| `text` | text | multi-line paragraph |
| `image` | imageSlot | dashed placeholder frame |
| `button` | button | rounded labelled pill |
| `nav-bar` | navBar | horizontal band of labelled items |

### Field vocabulary used in `props`

| Field | Applies to | Notes |
|---|---|---|
| `text` | heading, text | The default copy. Always paired with `copyMode: real`. |
| `copyMode` | heading, text | `real` \| `generate` (per `feature-copy-blocks.md`). **Every heading/text block below is `real` unless the row says `generate`.** |
| `description` | heading/text in `generate` mode; image always | The client-written prompt. On images this is the "what to upload" coach line and doubles as the empty-slot marker from `feature-image-upload.md`. |
| `lengthHint` | generate-mode copy only | Optional, e.g. `3 sentences`. |
| `fit` | image | `cover` \| `contain`. Defaults to `cover` here. |
| `label` + `linkTo` | button | `linkTo: page:<pageId>` \| `none` \| `url:<href>`. |
| `items` | nav-bar | `Label→pageId` pairs separated by `\|`. |
| `tone` | section | **OPTIONAL HINT** — `hero` / `tinted` / `plain`. If the Stage-1 section block has no background/colour field, ignore this and ship all sections identical. Do not add a field just for templates. |
| `level` | heading | **OPTIONAL HINT** — `1` = page title, `2` = section title. Ignore if headings have no size field. |

### Suggested fixture shape (one block, for naming reference)

```jsonc
{
  "id": "rest-home-about-body",
  "type": "text",
  "x": 80, "y": 640, "w": 520, "h": 200,
  "z": 1,
  "copyMode": "generate",
  "description": "A warm story about the family behind the restaurant — we opened in 2009, everything is made from scratch, these are my grandmother's recipes.",
  "lengthHint": "3 sentences",
  "fromTemplate": true
}
```

`fromTemplate` is a recommendation, not an existing field — see §8.1.

---

## 2. Shared geometry system

All four templates use the same skeleton so a client who learns one learns all four.
**Use named constants, not literals** (CLAUDE.md conventions).

| Constant | Value | Meaning |
|---|---|---|
| `PAGE_W` | 1200 | Design width (already a Stage-1 constant) |
| `MARGIN_X` | 80 | Left/right page gutter |
| `CONTENT_W` | 1040 | `PAGE_W − 2·MARGIN_X` |
| `NAV_H` | 72 | Nav bar height; nav always at `y=0`, page content starts at `y=72` |
| `GUTTER` | 40 | Gap between columns |
| `BAND_PAD_TOP` | 52 | Space between a band's top edge and its first block |

### Column presets (all derived from `MARGIN_X`/`GUTTER`)

| Preset | Widths | x positions |
|---|---|---|
| Full | 1040 | 80 |
| 2-col even | 500, 500 | 80, 620 |
| 2-col 60/40 | 620, 380 | 80, 740 |
| 3-col even | 320, 320, 320 | 80, 440, 800 |

### Section band heights used

| Name | Height | Used for |
|---|---|---|
| `BAND_HERO` | 420–440 | Landing hero |
| `BAND_HEADER` | 200–220 | Inner-page title strip |
| `BAND_STD` | 400–440 | Standard content band |
| `BAND_GRID` | 560–840 | Image/product grids |
| `BAND_CTA` | 240–320 | Closing call-to-action |

Bands **stack with no gaps** — each band's `y` equals the previous band's `y + h`. That
adjacency is deliberate: dragging a band and seeing the gap appear is how a client learns the
page is a stack of strips.

---

## 3. Copy conventions (apply to every template)

1. **Headings show the slot, using a plausible fake name.** `Martina's Trattoria`, not
   `[BUSINESS NAME]`. Clients replace confidently when they can see what belongs there.
2. **Text blocks coach, then get overwritten.** Every default text block either (a) is realistic
   sample copy the client can edit line by line, or (b) ends with a nudge naming the escape
   hatch: *"…or switch this block to **Write it for me** and just tell us the gist."*
3. **Image descriptions say what the photo should show, not what it is.** "A warm photo of your
   dining room at dinner service" beats "Hero image".
4. **Tone:** plain Canadian small-business English. Short sentences, no marketing jargon, no
   exclamation-mark stacking, no emoji. Prices in CAD. Phone numbers use the reserved-fictional
   `555-01xx` range.
5. **Every template ships at least one `copyMode: generate` block** with a genuinely good
   example description, so the feature is discovered by seeing it, not by finding the toggle.
6. **Every page has a nav bar linking to all three pages; every template has ≥1 button linking
   to another page.** (Counts per template listed in §8.3.)

---

## 4. Template: Restaurant

**Rationale (one line):** teaches that a page is a stack of full-width bands, that words can sit
on top of a photo, and that you can hand the writing to BOSS with "Write it for me".

### Pages

| order | pageId | name | slug | role |
|---|---|---|---|---|
| 1 | `home` | Home | `/` | landing |
| 2 | `menu` | Menu | `/menu` | content |
| 3 | `visit` | Visit Us | `/visit` | contact |

### Optional siteSettings seed

| field | value |
|---|---|
| `businessName` | *(leave empty — required field, client must type it; see §8.1)* |
| `tagline` | `Hand-rolled pasta, one room, no rush.` |
| `about` | *(empty)* |
| `vibe` | `warm` |
| `colors` | *(empty)* |

### 4.1 Page `home` — 12 blocks, page height ≈ 1232

| id | type | x | y | w | h | z | props / default content |
|---|---|---|---|---|---|---|---|
| `rest-home-nav` | nav-bar | 0 | 0 | 1200 | 72 | 10 | `items: Home→home \| Menu→menu \| Visit Us→visit` |
| `rest-home-hero-band` | section | 0 | 72 | 1200 | 440 | 0 | `tone: hero` |
| `rest-home-hero-photo` | image | 0 | 72 | 1200 | 440 | 1 | `fit: cover; description: "A wide, warm photo of your dining room during dinner service — lights on, tables full."` |
| `rest-home-hero-title` | heading | 100 | 232 | 700 | 84 | 2 | `level: 1; copyMode: real; text: "Martina's Trattoria"` |
| `rest-home-hero-cta` | button | 100 | 352 | 240 | 56 | 2 | `label: "See our menu"; linkTo: page:menu` |
| `rest-home-about-band` | section | 0 | 512 | 1200 | 380 | 0 | `tone: plain` |
| `rest-home-about-title` | heading | 80 | 564 | 520 | 56 | 1 | `level: 2; copyMode: real; text: "Our story"` |
| `rest-home-about-body` | text | 80 | 640 | 520 | 200 | 1 | `copyMode: generate; lengthHint: "3 sentences"; description: "A warm story about the family behind the restaurant — we opened in 2009, everything is made from scratch that morning, and the recipes came from my grandmother in Puglia."` |
| `rest-home-gallery-band` | section | 0 | 892 | 1200 | 340 | 0 | `tone: tinted` |
| `rest-home-gallery-1` | image | 80 | 940 | 320 | 240 | 1 | `fit: cover; description: "Your best-looking plate of food, shot from above in daylight."` |
| `rest-home-gallery-2` | image | 440 | 940 | 320 | 240 | 1 | `fit: cover; description: "Something being made — hands rolling pasta, the grill, the espresso machine."` |
| `rest-home-gallery-3` | image | 800 | 940 | 320 | 240 | 1 | `fit: cover; description: "People enjoying themselves in your room. Ask regulars for permission first."` |

**z-order note:** `rest-home-hero-photo` (z 1) fills the hero band exactly; the title (z 2) and
button (z 2) sit **on top of it**. This is the only intentional overlap in the template and it
exists to teach layering — the client can drag the title off the photo and see it still works.
Keep the heading's default text colour legible over a dark photo, or ship the band with
`tone: hero` behind the empty slot so it reads before any upload.

### 4.2 Page `menu` — 12 blocks, page height ≈ 1052

| id | type | x | y | w | h | z | props / default content |
|---|---|---|---|---|---|---|---|
| `rest-menu-nav` | nav-bar | 0 | 0 | 1200 | 72 | 10 | `items: Home→home \| Menu→menu \| Visit Us→visit` |
| `rest-menu-header-band` | section | 0 | 72 | 1200 | 220 | 0 | `tone: tinted` |
| `rest-menu-title` | heading | 80 | 124 | 520 | 64 | 1 | `level: 1; copyMode: real; text: "Our menu"` |
| `rest-menu-intro` | text | 80 | 204 | 720 | 56 | 1 | `copyMode: real; text: "Kitchen open Tuesday to Sunday, 5pm to 10pm. The menu changes with what's good that week."` |
| `rest-menu-band` | section | 0 | 292 | 1200 | 520 | 0 | `tone: plain` |
| `rest-menu-starters-title` | heading | 80 | 344 | 500 | 48 | 1 | `level: 2; copyMode: real; text: "To start"` |
| `rest-menu-starters-list` | text | 80 | 408 | 500 | 340 | 1 | `copyMode: real; text: "Focaccia, olive oil, sea salt — 8⏎Burrata, grilled peaches, basil — 16⏎Arancini, three per order — 12⏎Chopped salad, red wine vinaigrette — 11⏎⏎Replace these with your real dishes and prices. One dish per line keeps it easy to read."` |
| `rest-menu-mains-title` | heading | 620 | 344 | 500 | 48 | 1 | `level: 2; copyMode: real; text: "Mains"` |
| `rest-menu-mains-list` | text | 620 | 408 | 500 | 340 | 1 | `copyMode: real; text: "Tagliatelle bolognese — 26⏎Cacio e pepe — 23⏎Roast chicken, potatoes, lemon — 29⏎Whole fish for two — 54⏎⏎Got a long menu? Copy this block for each section — desserts, wine, specials."` |
| `rest-menu-cta-band` | section | 0 | 812 | 1200 | 240 | 0 | `tone: tinted` |
| `rest-menu-cta-title` | heading | 80 | 864 | 600 | 56 | 1 | `level: 2; copyMode: real; text: "Come hungry"` |
| `rest-menu-cta-button` | button | 80 | 944 | 240 | 56 | 1 | `label: "Book a table"; linkTo: page:visit` |

### 4.3 Page `visit` — 11 blocks, page height ≈ 992

| id | type | x | y | w | h | z | props / default content |
|---|---|---|---|---|---|---|---|
| `rest-visit-nav` | nav-bar | 0 | 0 | 1200 | 72 | 10 | `items: Home→home \| Menu→menu \| Visit Us→visit` |
| `rest-visit-header-band` | section | 0 | 72 | 1200 | 200 | 0 | `tone: tinted` |
| `rest-visit-title` | heading | 80 | 124 | 520 | 64 | 1 | `level: 1; copyMode: real; text: "Visit us"` |
| `rest-visit-details-band` | section | 0 | 272 | 1200 | 440 | 0 | `tone: plain` |
| `rest-visit-where-title` | heading | 80 | 324 | 500 | 48 | 1 | `level: 2; copyMode: real; text: "Where to find us"` |
| `rest-visit-where-body` | text | 80 | 388 | 500 | 280 | 1 | `copyMode: real; text: "148 Barrington Street⏎Halifax, NS  B3J 1Z4⏎(902) 555-0134⏎⏎Tuesday – Thursday  5pm – 10pm⏎Friday – Saturday  5pm – 11pm⏎Sunday  4pm – 9pm⏎Closed Mondays⏎⏎Street parking after 6pm, lot around the back."` |
| `rest-visit-photo` | image | 620 | 324 | 500 | 340 | 1 | `fit: cover; description: "A photo of your storefront from across the street, so people recognise it when they walk up."` |
| `rest-visit-book-band` | section | 0 | 712 | 1200 | 280 | 0 | `tone: tinted` |
| `rest-visit-book-title` | heading | 80 | 764 | 500 | 52 | 1 | `level: 2; copyMode: real; text: "Book a table"` |
| `rest-visit-book-body` | text | 80 | 832 | 500 | 104 | 1 | `copyMode: real; text: "Call us on (902) 555-0134, or tell BOSS which booking service you use and we'll wire the button up to it."` |
| `rest-visit-book-button` | button | 620 | 832 | 260 | 56 | 1 | `label: "Back to the menu"; linkTo: page:menu` |

---

## 5. Template: Trades / Services

**Rationale (one line):** teaches the trades pattern — one band per service, a phone-first call
to action above the fold, and that duplicating a band is how you add the next service.

### Pages

| order | pageId | name | slug | role |
|---|---|---|---|---|
| 1 | `home` | Home | `/` | landing |
| 2 | `services` | Services | `/services` | content |
| 3 | `quote` | Get a Quote | `/quote` | contact |

### Optional siteSettings seed

| field | value |
|---|---|
| `businessName` | *(leave empty)* |
| `tagline` | `Licensed, insured, and we show up when we say we will.` |
| `vibe` | `bold` |

### 5.1 Page `home` — 12 blocks, page height ≈ 972

| id | type | x | y | w | h | z | props / default content |
|---|---|---|---|---|---|---|---|
| `trade-home-nav` | nav-bar | 0 | 0 | 1200 | 72 | 10 | `items: Home→home \| Services→services \| Get a Quote→quote` |
| `trade-home-hero-band` | section | 0 | 72 | 1200 | 420 | 0 | `tone: hero` |
| `trade-home-hero-title` | heading | 80 | 140 | 600 | 100 | 1 | `level: 1; copyMode: real; text: "Ridgeway Plumbing & Heating"` |
| `trade-home-hero-sub` | text | 80 | 264 | 560 | 72 | 1 | `copyMode: real; text: "Licensed, insured, and serving the Annapolis Valley since 2011. Same-day emergency callouts."` |
| `trade-home-hero-cta` | button | 80 | 360 | 260 | 56 | 1 | `label: "Get a free quote"; linkTo: page:quote` |
| `trade-home-hero-photo` | image | 700 | 132 | 420 | 300 | 1 | `fit: cover; description: "A photo of you and your van, or you on a job. People hire the person, not the logo — a real photo beats a stock one every time."` |
| `trade-home-services-band` | section | 0 | 492 | 1200 | 480 | 0 | `tone: plain` |
| `trade-home-services-title` | heading | 80 | 540 | 520 | 52 | 1 | `level: 2; copyMode: real; text: "What we do"` |
| `trade-home-service-1` | text | 80 | 616 | 320 | 240 | 1 | `copyMode: real; text: "Boilers & furnaces⏎⏎Installs, servicing and repairs on gas, oil and electric. We carry common parts on the van so most jobs finish the same day."` |
| `trade-home-service-2` | text | 440 | 616 | 320 | 240 | 1 | `copyMode: real; text: "Bathrooms & wet rooms⏎⏎Full fit-outs and small upgrades. We handle the plumbing, tiling and the mess, and we tidy up before we leave."` |
| `trade-home-service-3` | text | 800 | 616 | 320 | 240 | 1 | `copyMode: generate; lengthHint: "40–60 words"; description: "Short blurb about our 24/7 emergency callout service — under an hour into town, no weekend surcharge, and we'll tell you the price before we start."` |
| `trade-home-services-cta` | button | 80 | 884 | 280 | 56 | 1 | `label: "See all our services"; linkTo: page:services` |

**Teaching note to surface in the picker preview:** the three service blocks are deliberately
identical in size — two written out, one showing "Write it for me". Side by side, the client
sees both options at once.

### 5.2 Page `services` — 12 blocks, page height ≈ 1112

| id | type | x | y | w | h | z | props / default content |
|---|---|---|---|---|---|---|---|
| `trade-svc-nav` | nav-bar | 0 | 0 | 1200 | 72 | 10 | `items: Home→home \| Services→services \| Get a Quote→quote` |
| `trade-svc-header-band` | section | 0 | 72 | 1200 | 200 | 0 | `tone: tinted` |
| `trade-svc-title` | heading | 80 | 124 | 600 | 64 | 1 | `level: 1; copyMode: real; text: "Our services"` |
| `trade-svc-a-band` | section | 0 | 272 | 1200 | 400 | 0 | `tone: plain` |
| `trade-svc-a-title` | heading | 80 | 324 | 500 | 52 | 1 | `level: 2; copyMode: real; text: "Boilers & furnaces"` |
| `trade-svc-a-body` | text | 80 | 392 | 500 | 220 | 1 | `copyMode: real; text: "What's included, roughly what it costs, and how long it takes. Two or three short paragraphs is plenty — people are checking you're the right trade, not reading a brochure."` |
| `trade-svc-a-photo` | image | 620 | 324 | 500 | 300 | 1 | `fit: cover; description: "A job you're proud of. Before-and-after side by side works well if you have one."` |
| `trade-svc-b-band` | section | 0 | 672 | 1200 | 440 | 0 | `tone: tinted` |
| `trade-svc-b-title` | heading | 80 | 724 | 500 | 52 | 1 | `level: 2; copyMode: real; text: "Bathrooms & wet rooms"` |
| `trade-svc-b-body` | text | 80 | 792 | 500 | 220 | 1 | `copyMode: real; text: "This band is a copy of the one above. Add a service by duplicating it and changing the words and the photo — that's the whole trick to building this page."` |
| `trade-svc-b-photo` | image | 620 | 724 | 500 | 300 | 1 | `fit: cover; description: "A finished job for this service. Daylight, phone camera is fine, wide enough to see the whole room."` |
| `trade-svc-b-cta` | button | 80 | 1032 | 260 | 56 | 1 | `label: "Get a free quote"; linkTo: page:quote` |

### 5.3 Page `quote` — 12 blocks, page height ≈ 1072

| id | type | x | y | w | h | z | props / default content |
|---|---|---|---|---|---|---|---|
| `trade-quote-nav` | nav-bar | 0 | 0 | 1200 | 72 | 10 | `items: Home→home \| Services→services \| Get a Quote→quote` |
| `trade-quote-header-band` | section | 0 | 72 | 1200 | 220 | 0 | `tone: tinted` |
| `trade-quote-title` | heading | 80 | 124 | 620 | 64 | 1 | `level: 1; copyMode: real; text: "Get a free quote"` |
| `trade-quote-intro` | text | 80 | 204 | 700 | 56 | 1 | `copyMode: real; text: "Tell us what's going on and we'll come back to you within one working day."` |
| `trade-quote-contact-band` | section | 0 | 292 | 1200 | 440 | 0 | `tone: plain` |
| `trade-quote-contact-title` | heading | 80 | 344 | 500 | 48 | 1 | `level: 2; copyMode: real; text: "Call, text or email"` |
| `trade-quote-contact-body` | text | 80 | 408 | 500 | 260 | 1 | `copyMode: real; text: "(902) 555-0188⏎hello@ridgewayplumbing.ca⏎⏎Monday – Friday  7am – 6pm⏎Emergencies, any hour⏎⏎Want a contact form here instead of a phone number? Write down the boxes you want people to fill in and BOSS will build the real form."` |
| `trade-quote-badges` | image | 620 | 344 | 500 | 280 | 1 | `fit: contain; description: "Your licence numbers, insurer and trade association badges, as one image. This is the block that makes strangers trust you."` |
| `trade-quote-area-band` | section | 0 | 732 | 1200 | 340 | 0 | `tone: tinted` |
| `trade-quote-area-title` | heading | 80 | 784 | 500 | 48 | 1 | `level: 2; copyMode: real; text: "Areas we cover"` |
| `trade-quote-area-body` | text | 80 | 848 | 500 | 160 | 1 | `copyMode: generate; lengthHint: "2 sentences"; description: "A friendly line naming the towns we cover — Wolfville, Kentville, New Minas and Berwick — and saying we'll still travel further for bigger jobs."` |
| `trade-quote-area-cta` | button | 620 | 848 | 260 | 56 | 1 | `label: "See what we do"; linkTo: page:services` |

---

## 6. Template: Portfolio

**Rationale (one line):** teaches the grid — pictures are the content, captions are optional
extras, and the landing page doesn't have to be called "Home".

### Pages

| order | pageId | name | slug | role |
|---|---|---|---|---|
| 1 | `work` | Work | `/` | landing |
| 2 | `about` | About | `/about` | content |
| 3 | `contact` | Contact | `/contact` | contact |

> Page 1 is named **Work** but is the site's home page (slug `/`). Deliberate: it shows the
> client that page names are theirs to choose. If the page strip UI can't yet express
> "name ≠ Home at slug /", rename it to `Home` and keep everything else.

### Optional siteSettings seed

| field | value |
|---|---|
| `businessName` | *(leave empty)* |
| `tagline` | `Portrait and food photography, Halifax and anywhere you'll fly me.` |
| `vibe` | `modern` |

### 6.1 Page `work` — 12 blocks, page height ≈ 1172

| id | type | x | y | w | h | z | props / default content |
|---|---|---|---|---|---|---|---|
| `port-work-nav` | nav-bar | 0 | 0 | 1200 | 72 | 10 | `items: Work→work \| About→about \| Contact→contact` |
| `port-work-intro-band` | section | 0 | 72 | 1200 | 260 | 0 | `tone: plain` |
| `port-work-title` | heading | 80 | 124 | 700 | 72 | 1 | `level: 1; copyMode: real; text: "Nadia Osei — Photography"` |
| `port-work-sub` | text | 80 | 212 | 620 | 64 | 1 | `copyMode: real; text: "Portraits, restaurants and small brands. Based in Halifax, happy to travel."` |
| `port-work-grid-band` | section | 0 | 332 | 1200 | 840 | 0 | `tone: plain` |
| `port-work-img-a` | image | 80 | 380 | 320 | 320 | 1 | `fit: cover; description: "Your single best piece of work. Whatever you put here is what people judge you on."` |
| `port-work-cap-a` | text | 80 | 712 | 320 | 56 | 1 | `copyMode: generate; lengthHint: "one line"; description: "One line naming this project — the client, what I shot for them, and where."` |
| `port-work-img-b` | image | 440 | 380 | 320 | 320 | 1 | `fit: cover; description: "A second piece, ideally a different kind of job from the first."` |
| `port-work-img-c` | image | 800 | 380 | 320 | 320 | 1 | `fit: cover; description: "A third piece. Aim for variety across the row rather than six versions of one shoot."` |
| `port-work-img-d` | image | 80 | 808 | 320 | 300 | 1 | `fit: cover; description: "Row two — keep going, or delete this row if three pieces is your best work."` |
| `port-work-img-e` | image | 440 | 808 | 320 | 300 | 1 | `fit: cover; description: "Another piece. Copy this block across for as many as you want."` |
| `port-work-cta` | button | 800 | 832 | 260 | 56 | 1 | `label: "Work with me"; linkTo: page:contact` |

**Teaching note:** only image A has a caption underneath, on purpose — it shows the pattern
("add one of these under any picture you want to explain") without cluttering the grid. The
button sits in the empty third cell of row two so the grid still reads as a grid.

### 6.2 Page `about` — 10 blocks, page height ≈ 972

| id | type | x | y | w | h | z | props / default content |
|---|---|---|---|---|---|---|---|
| `port-about-nav` | nav-bar | 0 | 0 | 1200 | 72 | 10 | `items: Work→work \| About→about \| Contact→contact` |
| `port-about-band` | section | 0 | 72 | 1200 | 500 | 0 | `tone: tinted` |
| `port-about-portrait` | image | 80 | 124 | 440 | 400 | 1 | `fit: cover; description: "A photo of you. Clients hire a person — this is the most important picture on your site after your work."` |
| `port-about-title` | heading | 600 | 140 | 520 | 64 | 1 | `level: 1; copyMode: real; text: "About Nadia"` |
| `port-about-body` | text | 600 | 228 | 520 | 260 | 1 | `copyMode: real; text: "Who you are, how you got here, and what it's like to work with you. Write it the way you'd say it out loud — three short paragraphs beats one long one.⏎⏎Not sure where to start? Switch this block to \"Write it for me\" and just tell us the gist."` |
| `port-about-clients-band` | section | 0 | 572 | 1200 | 400 | 0 | `tone: plain` |
| `port-about-clients-title` | heading | 80 | 620 | 500 | 52 | 1 | `level: 2; copyMode: real; text: "Clients & press"` |
| `port-about-clients-list` | text | 80 | 692 | 440 | 200 | 1 | `copyMode: real; text: "The Coast⏎Saltscapes Magazine⏎Two If By Sea⏎Halifax Seaport Market⏎⏎One name per line. Delete this whole band if you're just starting out — an empty client list is worse than no client list."` |
| `port-about-logos` | image | 620 | 620 | 500 | 180 | 1 | `fit: contain; description: "Your client logos in a single row, saved as one image."` |
| `port-about-cta` | button | 620 | 832 | 260 | 56 | 1 | `label: "See my work"; linkTo: page:work` |

### 6.3 Page `contact` — 11 blocks, page height ≈ 1052

| id | type | x | y | w | h | z | props / default content |
|---|---|---|---|---|---|---|---|
| `port-contact-nav` | nav-bar | 0 | 0 | 1200 | 72 | 10 | `items: Work→work \| About→about \| Contact→contact` |
| `port-contact-header-band` | section | 0 | 72 | 1200 | 320 | 0 | `tone: hero` |
| `port-contact-title` | heading | 80 | 132 | 600 | 64 | 1 | `level: 1; copyMode: real; text: "Let's talk"` |
| `port-contact-intro` | text | 80 | 212 | 600 | 110 | 1 | `copyMode: real; text: "Tell me what you're shooting, roughly when, and where. I'll come back with availability and a price the same week."` |
| `port-contact-band` | section | 0 | 392 | 1200 | 420 | 0 | `tone: plain` |
| `port-contact-reach-title` | heading | 80 | 444 | 500 | 48 | 1 | `level: 2; copyMode: real; text: "How to reach me"` |
| `port-contact-reach-body` | text | 80 | 508 | 500 | 220 | 1 | `copyMode: real; text: "nadia@nadiaosei.ca⏎(902) 555-0176⏎@nadiaoseiphoto⏎⏎Prefer people fill in a form? List the questions you'd want answered and BOSS will build it."` |
| `port-contact-photo` | image | 620 | 444 | 500 | 320 | 1 | `fit: cover; description: "A behind-the-scenes shot from a shoot — you working, not a posed portrait."` |
| `port-contact-cta-band` | section | 0 | 812 | 1200 | 240 | 0 | `tone: tinted` |
| `port-contact-cta-title` | heading | 80 | 860 | 760 | 52 | 1 | `level: 2; copyMode: real; text: "Based in Halifax, shooting Canada-wide"` |
| `port-contact-cta` | button | 80 | 932 | 260 | 56 | 1 | `label: "Back to my work"; linkTo: page:work` |

---

## 7. Template: Shop

**Rationale (one line):** teaches the product card — a picture with a name and price underneath,
copied across a row — and where the "buy" part of a real shop will be wired in later.

### Pages

| order | pageId | name | slug | role |
|---|---|---|---|---|
| 1 | `home` | Home | `/` | landing |
| 2 | `shop` | Shop | `/shop` | content |
| 3 | `contact` | Find Us | `/contact` | contact |

### Optional siteSettings seed

| field | value |
|---|---|
| `businessName` | *(leave empty)* |
| `tagline` | `Small-batch goods, made on the South Shore.` |
| `vibe` | `warm` |

### 7.1 Page `home` — 11 blocks, page height ≈ 1052

| id | type | x | y | w | h | z | props / default content |
|---|---|---|---|---|---|---|---|
| `shop-home-nav` | nav-bar | 0 | 0 | 1200 | 72 | 10 | `items: Home→home \| Shop→shop \| Find Us→contact` |
| `shop-home-hero-band` | section | 0 | 72 | 1200 | 420 | 0 | `tone: hero` |
| `shop-home-hero-photo` | image | 0 | 72 | 1200 | 420 | 1 | `fit: cover; description: "A wide shot of your products together, or of the shop itself. Leave some plain space on the left so the words below sit on top of it comfortably."` |
| `shop-home-hero-title` | heading | 100 | 236 | 660 | 80 | 2 | `level: 1; copyMode: real; text: "Northwind Goods"` |
| `shop-home-hero-cta` | button | 100 | 348 | 280 | 56 | 2 | `label: "Shop the collection"; linkTo: page:shop` |
| `shop-home-featured-band` | section | 0 | 492 | 1200 | 560 | 0 | `tone: plain` |
| `shop-home-featured-title` | heading | 80 | 544 | 520 | 52 | 1 | `level: 2; copyMode: real; text: "This month's picks"` |
| `shop-home-feat-1` | image | 80 | 620 | 320 | 280 | 1 | `fit: cover; description: "Your best seller, shot on a plain background in daylight."` |
| `shop-home-feat-2` | image | 440 | 620 | 320 | 280 | 1 | `fit: cover; description: "Something new, or seasonal."` |
| `shop-home-feat-3` | image | 800 | 620 | 320 | 280 | 1 | `fit: cover; description: "The one people always ask about."` |
| `shop-home-promise` | text | 80 | 924 | 1040 | 72 | 1 | `copyMode: generate; lengthHint: "1–2 sentences"; description: "One warm line about what makes our stuff different — made by hand in small batches on the South Shore, no synthetic fragrance, free local delivery over $75."` |

**z-order note:** same layering lesson as Restaurant — hero photo at z 1 fills the band, heading
and button at z 2 sit on top. The image description explicitly coaches the client to leave
"quiet" space in the photo where the words will land.

### 7.2 Page `shop` — 12 blocks, page height ≈ 892

| id | type | x | y | w | h | z | props / default content |
|---|---|---|---|---|---|---|---|
| `shop-shop-nav` | nav-bar | 0 | 0 | 1200 | 72 | 10 | `items: Home→home \| Shop→shop \| Find Us→contact` |
| `shop-shop-header-band` | section | 0 | 72 | 1200 | 220 | 0 | `tone: tinted` |
| `shop-shop-title` | heading | 80 | 124 | 400 | 64 | 1 | `level: 1; copyMode: real; text: "Shop"` |
| `shop-shop-intro` | text | 80 | 204 | 660 | 56 | 1 | `copyMode: real; text: "Everything is made in small batches, so what you see here is what we have."` |
| `shop-shop-grid-band` | section | 0 | 292 | 1200 | 600 | 0 | `tone: plain` |
| `shop-shop-img-1` | image | 80 | 340 | 320 | 300 | 1 | `fit: cover; description: "One product, plain background, shot straight on. Keep every product photo the same distance and background — that's what makes a shop page look tidy."` |
| `shop-shop-cap-1` | text | 80 | 652 | 320 | 60 | 1 | `copyMode: real; text: "Cedar & Sea Salt candle⏎$28"` |
| `shop-shop-img-2` | image | 440 | 340 | 320 | 300 | 1 | `fit: cover; description: "Second product, framed exactly like the first."` |
| `shop-shop-cap-2` | text | 440 | 652 | 320 | 60 | 1 | `copyMode: real; text: "Linen tea towel, two-pack⏎$34"` |
| `shop-shop-img-3` | image | 800 | 340 | 320 | 300 | 1 | `fit: cover; description: "Third product. Copy this picture-and-caption pair for every item you sell."` |
| `shop-shop-cap-3` | text | 800 | 652 | 320 | 60 | 1 | `copyMode: real; text: "Stoneware mug⏎$42"` |
| `shop-shop-cta` | button | 80 | 760 | 300 | 56 | 1 | `label: "Questions? Talk to us"; linkTo: page:contact` |

**Teaching note:** the image + caption pair is the unit to copy. Worth saying so in the
picker's template description, because "copy the pair, not just the picture" is the single most
useful thing a shop client can learn here.

### 7.3 Page `contact` — 11 blocks, page height ≈ 1032

| id | type | x | y | w | h | z | props / default content |
|---|---|---|---|---|---|---|---|
| `shop-contact-nav` | nav-bar | 0 | 0 | 1200 | 72 | 10 | `items: Home→home \| Shop→shop \| Find Us→contact` |
| `shop-contact-header-band` | section | 0 | 72 | 1200 | 200 | 0 | `tone: tinted` |
| `shop-contact-title` | heading | 80 | 124 | 520 | 64 | 1 | `level: 1; copyMode: real; text: "Find us"` |
| `shop-contact-store-band` | section | 0 | 272 | 1200 | 440 | 0 | `tone: plain` |
| `shop-contact-store-title` | heading | 80 | 324 | 500 | 48 | 1 | `level: 2; copyMode: real; text: "In the shop"` |
| `shop-contact-store-body` | text | 80 | 388 | 500 | 260 | 1 | `copyMode: real; text: "22 Montague Street⏎Lunenburg, NS  B0J 2C0⏎(902) 555-0119⏎⏎Thursday – Saturday  10am – 5pm⏎Sunday  11am – 4pm⏎⏎Want a map on this page? Say so and BOSS will drop one in."` |
| `shop-contact-store-photo` | image | 620 | 324 | 500 | 340 | 1 | `fit: cover; description: "Your storefront from the sidewalk, sign visible. This is how people find you on foot."` |
| `shop-contact-ship-band` | section | 0 | 712 | 1200 | 320 | 0 | `tone: tinted` |
| `shop-contact-ship-title` | heading | 80 | 764 | 560 | 48 | 1 | `level: 2; copyMode: real; text: "Online orders & shipping"` |
| `shop-contact-ship-body` | text | 80 | 828 | 560 | 140 | 1 | `copyMode: generate; lengthHint: "2 sentences"; description: "Two plain sentences about shipping — we ship Canada-wide, $12 flat rate, free over $75, and orders go out within two business days."` |
| `shop-contact-ship-cta` | button | 700 | 828 | 260 | 56 | 1 | `label: "Back to the shop"; linkTo: page:shop` |

---

## 8. Blank start

**Recommendation: Blank means zero blocks — the coaching is UI, not content.**

Rationale: if Blank quietly seeds a nav bar and a section, the picker is lying and the client's
export carries blocks they never chose. But a bare 1200px white page is exactly the paralysis
templates exist to cure, so the help has to come from somewhere that isn't the design.

### 8.0 Spec

| Item | Value |
|---|---|
| Pages created | 1 — `home`, name `Home`, slug `/` |
| Blocks created | none |
| Pen strokes | none |
| siteSettings | all empty |
| Coach overlay | a dismissible, **non-block** card rendered over the empty canvas, gone the moment the first block is added (and never shown again for that design) |

### 8.1 Coach overlay copy (verbatim)

> **Nothing here yet — that's the point.**
> Build your page the way a page is actually built, from the top down:
>
> 1. **Nav bar** across the top — the menu people click to move around your site.
> 2. A **Section** band under it — pages are just a stack of full-width strips.
> 3. Drop a **Heading**, some **Text** and an **Image** inside that band.
> 4. Add a **Button** and point it at another page.
>
> Don't worry about it looking finished. Rough and honest is more useful to us than tidy and
> vague — we'll do the polish.
>
> *Changed your mind?* **Start from a template instead →**

The last line must re-open the picker: a client who picks Blank and freezes needs a way back in
one click, and without it the only escape is clearing localStorage.

### 8.2 Picker card copy for all five options

| Option | Card title | Card line |
|---|---|---|
| Restaurant | Restaurant or café | Hero photo, your story, a menu page and how to find you. |
| Trades/Services | Trades & services | Phone-first, one band per service, and a quote page. |
| Portfolio | Portfolio | A grid of your work, an about page, and a way to hire you. |
| Shop | Shop | Product pictures with names and prices, plus your opening hours. |
| Blank | Start blank | An empty page and a nudge in the right direction. |

---

## 9. Notes and flags for the implementer

### 9.1 Placeholder-leak guard (recommended — affects Stage 3)

Every block in these fixtures is fake by design. If a client picks Restaurant, edits the menu
and submits, Cam's package will confidently say the business is called **Martina's Trattoria**
and lives at 148 Barrington Street. That is a real round-trip-test failure mode, and it lands
on Stage 3, not here.

Cheapest fix, decided now: give every template-created block a boolean `fromTemplate: true`,
cleared on the block's first user edit. Then:

- Stage 3's `brief.md` can list "blocks the client never touched" so Cam and Claude know what's
  filler rather than requirement.
- The submit gate can warn: *"12 blocks still have our example words in them — is that on
  purpose?"*
- Templates stay plain design-state JSON (the feature doc's stated constraint) — this is one
  extra boolean field, no special machinery.

**`siteSettings.businessName` deliberately ships empty in all four templates** for the same
reason: it's the one required field, so an empty value forces a real answer instead of letting
a fake name ride through into the export.

### 9.2 Fields these templates assume, that may not exist yet

| Field | Used by | If it doesn't exist |
|---|---|---|
| `section.tone` | all bands | Drop it — ship every section identical. The layouts still read correctly; they just look flatter. Not worth adding a field for. |
| `heading.level` | all headings | Drop it. Headings will all render at one size; the geometry already implies hierarchy. |
| `image.fit` | all images | Already specced in `feature-image-upload.md`; safe. |
| `text.lengthHint` | generate blocks | Already specced in `feature-copy-blocks.md` as optional; safe. |
| `fromTemplate` | everything | New — see §9.1. |

### 9.3 What these templates cannot express (genuine scope flag)

The six block types cover layout well but there are four things every one of these industries
actually wants, and the templates work around all four with coaching text rather than blocks:

1. **Contact forms** — Trades `quote` and Portfolio `contact` both tell the client to *describe*
   the form they want in a text block. That works, but it's the most-requested missing block by
   a distance. Candidate for a 7th block type later; out of scope for v1.
2. **Maps** — Shop `contact` and Restaurant `visit` use an image slot plus a coaching line.
3. **Footers** — none of these 12 pages has one. Deliberate: a footer band would cost 3–4 blocks
   on every page and blow the "keep it editable" budget. Real sites need one; the brief should
   note that BOSS adds a standard footer unless the client sketched their own.
4. **Repeating lists** (menus, product grids, service lists) — handled by "copy this block",
   which is honest but means a 40-item menu is painful. Fine for a sketch tool; worth watching
   if clients complain.

None of these blocks Stage 2. All four are worth a line in `docs/decisions.md` if the parent
agent agrees, so the gap is a recorded choice rather than an oversight.

### 9.4 Counts (for the fixture unit tests)

| Template | Pages | Blocks (H / P2 / P3) | Total | `generate` blocks | Cross-page buttons |
|---|---|---|---|---|---|
| Restaurant | 3 | 12 / 12 / 11 | 35 | 1 | 3 |
| Trades/Services | 3 | 12 / 12 / 12 | 36 | 2 | 4 |
| Portfolio | 3 | 12 / 10 / 11 | 33 | 1 | 3 |
| Shop | 3 | 11 / 12 / 11 | 34 | 2 | 3 |
| Blank | 1 | 0 | 0 | 0 | 0 |

Invariants worth asserting in unit tests:
- every page has exactly one `nav-bar` at `y=0`, with one item per page in the template
- every `linkTo: page:<id>` resolves to a page in the same template
- every page's block count is between 5 and 12
- every block's box is inside `0 ≤ x`, `x + w ≤ 1200`
- every image block has a non-empty `description`
- each template has ≥1 block with `copyMode: 'generate'` and a non-empty `description`
