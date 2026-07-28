# Stage 1 — Canvas Core

## Goal
A working single-page block editor: a client can lay out one web page from structured blocks,
with editing that feels solid (move/resize/snap/undo), and never lose work to a reload.
This stage also stands up the entire engineering skeleton (build, tests, CI, deploy).

**Prerequisite:** the canvas-engine verdict (Fable debate #1) must be recorded in
`docs/decisions.md` before any canvas code is written.

## Features
- [x] feature-app-scaffold.md — Vite/React/TS project, Vitest, Playwright, Pages deploy pipeline (verified done 2026-07-28)
- [ ] feature-block-canvas.md — virtual page + block palette, add/render all six block types
- [ ] feature-block-editing.md — select, drag, resize, snap, inline text edit, z-order, delete
- [ ] feature-undo-redo.md — full history for every canvas mutation
- [ ] feature-autosave.md — debounced localStorage persistence + restore + start-over

## Definition of Done (testable checklist)
- [ ] `npm test` and `npm run e2e` pass locally and in CI on `main`
- [ ] Deployed GitHub Pages URL serves the app; E2E smoke passes against a production build
- [ ] E2E: starting blank, add one of each block type, arrange them, edit their text —
      reload the browser — the page is pixel-identical in structure (same blocks, positions, text)
- [ ] E2E: a 10-step edit sequence fully unwinds with undo and replays with redo
- [ ] Every feature file above is `verified done` with Verification Log evidence
