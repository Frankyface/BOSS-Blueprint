# Evaluator rubric — BOSS Blueprint round trip

You are scoring a built website against the sketch a client drew and the package that was
handed over. You did **not** build this site and you have not seen how it was built. Score
what is in front of you.

Everything you need is in the current directory:

| File | What it is |
|---|---|
| `site.json` | the machine-readable design the client produced |
| `scenario.json` | what the client was asked to sketch — the expectation list |
| `rubric-manifest.json` | **the exact item ids you must score. Score every one, and nothing else.** |
| `pages/*.png` | the client's sketch, one image per page, 1200px wide |
| `shots/*.png` | the built site, one full-page screenshot per page, 1200px wide |
| `BUILD_NOTES.md` | the builder's own notes about the calls it made |

## Output contract

Write **`judgments.json`** in this directory and nothing else. Exactly this shape:

```json
{
  "scenario": "A",
  "items": [
    { "id": "S2:home", "score": 2, "evidence": "shots/home.png vs pages/01-home.png: nav, hero and the two sections appear in the same order; the text-left image-right split is preserved", "confidence": "high" }
  ]
}
```

Rules the merger enforces mechanically — an item that breaks one is **rejected**, and a
malformed file gets exactly one retry before the run fails as INFRA:

1. every `id` must come from `rubric-manifest.json`, and every id in it must appear once;
2. `score` is an integer `0`, `1` or `2`;
3. `evidence` is a non-empty string that **names at least one artefact file** —
   `shots/<slug>.png`, `pages/NN-<slug>.png` or `BUILD_NOTES.md`. Uncited scores are
   thrown away, however sensible they read;
4. `confidence` is `"high"`, `"medium"` or `"low"`.

## What each item id means

### `S2:<slug>` — visual layout similarity

Compare `pages/NN-<slug>.png` (the sketch) with `shots/<slug>.png` (the build).

- **0** — does not resemble the sketch
- **1** — same content, notably different arrangement (a hero split flipped, sections reordered)
- **2** — same arrangement and roughly the same proportions

Your rationale **must** answer all three: is the top-to-bottom order the same? are the
left/right splits the same? is the hero as prominent?

### `S3:<blockId>` — generated copy quality

`site.json` marks some blocks `copyMode: "generate"` with a `generateDescription`. Find
what the build actually wrote there.

- **0** — off-topic, or generic filler that could belong to any business
- **1** — on-topic
- **2** — on-topic, on-vibe, and uses specifics about *this* business

### `S5:<slug>` — style and vibe

Does `shots/<slug>.png` read as the vibe and style notes in `site.json`'s `siteSettings`
for *this kind of business*?

- **0** — no · **1** — partly · **2** — yes

### `S6:<penRef>` — pen intent

`scenario.json` lists the pen clusters with a `role` and a `meaning`.

- **annotation** — did the build honour the intent, **and** does `BUILD_NOTES.md` record a
  reading of the mark? Both → 2; intent honoured but unrecorded → 1; neither → 0.
- **imageSketch** — does the placeholder in that slot relate to the sketched subject?
  Clearly → 2; loosely → 1; contradicts it → 0.

## Never penalise

These are acceptable interpretations, and marking them down would make the gate measure
taste instead of fidelity:

- typography, and any colour beyond the ones the client actually stated
- spacing and polish
- responsive or mobile behaviour — **it is unscored**; the sketches are desktop and only
  the 1200px shot is evaluated
- heading-level choices, and `null` section backgrounds
- how pretty a placeholder is
- an inert-or-guessed target for a link the client left as `none`, **when `BUILD_NOTES.md`
  records the call**
- copy wording beyond what the description actually asked for

## Blocks marked `"expect": "untouched-filler"`

`scenario.json` marks any block the client deliberately left as template filler. The brief
told the builder that text was filler to replace. **Any reasonable handling of it — kept,
replaced, or turned into a placeholder — is neutral.** Never count it for or against
`S2`, and say in your evidence what the build did with it; that observation is the signal
the brief generator's filler narration is being tuned on.
