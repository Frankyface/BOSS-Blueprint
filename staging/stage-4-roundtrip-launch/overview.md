# Stage 4 — Round-trip & Launch

_Sketch only — specced when Stage 3 nears done. Progressive detail rule applies._

## Goal
Prove the entire value chain with the round-trip test, then polish and go live as a BOSS
lead-capture tool.

## Planned features (files created when this stage is specced)
- **The round-trip test** (v1's definition of done): an agent acting as a fake client sketches
  a realistic 3+ page business site (blocks, both copy modes, images, pen sketches, wired nav),
  submits it; the received package is handed to a FRESH Claude Code session with zero other
  context; that session builds a website; an evaluation pass confirms the build visibly matches
  the sketch and that no clarifying questions were needed. Failures feed schema/brief fixes in
  Stage 3 files until the loop passes.
- **Onboarding tour** — 30-second first-run pointers (palette, pen, pages, submit)
- **Desktop guard** — small-viewport notice: "Blueprint works best on a computer"
- **BOSS branding polish** — logo, colors, footer link to bossolutions.pro
- **Launch** — link from bossolutions.pro (help.md item), optional sketch.bossolutions.pro
  custom domain (help.md, rides on the pending DNS repoint)

## Definition of done (rough — firmed when specced)
- Round-trip test passes and its full evidence (sketch screenshots, package, built site
  screenshots, comparison) is recorded; app live on GitHub Pages; tour + guard verified by E2E;
  launch checklist done or explicitly waiting on help.md items.
