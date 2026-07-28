# Feature: App Scaffold
_Stage: stage-1-canvas-core · Status: awaiting verification_

## Goal
Stand up the whole engineering skeleton: a Vite + React + TypeScript app with Vitest,
Playwright, linting, and a GitHub Actions pipeline that deploys `main` to GitHub Pages.
Everything after this feature is app logic, not infrastructure.

## Success Criteria
- [ ] `npm run dev` serves an app shell locally: BOSS Blueprint header bar + an empty canvas
      area + an (inert) block palette placeholder
- [ ] `npm test` runs Vitest with ≥1 real passing unit test (not a placeholder assert-true)
- [ ] `npm run e2e` runs Playwright headless: loads the app, asserts the shell renders
- [ ] `npm run build` produces a `dist/` that works under the `/BOSS-Blueprint/` base path
- [ ] Push to `main` triggers a GitHub Actions workflow that deploys to GitHub Pages, and
      `https://frankyface.github.io/BOSS-Blueprint/` serves the shell
- [ ] TypeScript strict mode on; ESLint configured; both clean

## How We'll Verify
1. `npm run dev` → open http://localhost:5173 with Playwright → screenshot shows shell.
2. `npm test` → expect exit 0, ≥1 test passed.
3. `npm run e2e` → expect exit 0, ≥1 test passed.
4. `npm run build && npm run preview` → E2E smoke against the preview server (base path check).
5. `git push` → `gh run watch` the Pages workflow to success → `curl -I` the Pages URL
   expecting 200, then Playwright against the live URL asserting the shell.
6. Record outputs (exit codes, test counts, screenshot) below.

## Verification Log

**Implementer run (2026-07-27):** every command below was run on Windows 11 / Node v24.15.0 /
npm 11.16.0 against commit `1f4fa54`. Awaiting independent review — criteria boxes left unticked.

| # | Command | Result |
|---|---------|--------|
| 1 | `npm run lint` (eslint 10.8.0, flat config, typescript-eslint 8.65.0) | exit 0 — 0 errors, 0 warnings |
| 2 | `npm test` (`vitest run`, jsdom + Testing Library) | exit 0 — **2 test files, 6 tests passed**, 0 failed |
| 3 | `npm run build` (`tsc -b && vite build`, TS 6.0 strict) | exit 0 — `dist/index.html` 0.66 kB, `assets/index-CwqeXSoB.css` 3.17 kB, `assets/index-DjNezX1e.js` 192.57 kB |
| 4 | `npm run e2e` (Playwright 1.62.0 vs `vite preview` production build) | exit 0 — **6 tests passed** (2 specs × chromium + firefox + webkit), 0 failed |
| 5 | `npm run dev` → `GET http://localhost:5173/BOSS-Blueprint/` | HTTP **200**; browser render confirmed header "BOSS Blueprint", `main[aria-label="Page canvas"]`, `aside[aria-label="Block palette"]` with 6 disabled buttons; 0 console errors |
| 6 | `gh api -X POST repos/Frankyface/BOSS-Blueprint/pages -f build_type=workflow` | exit 0 — `build_type: workflow`, `html_url: https://frankyface.github.io/BOSS-Blueprint/` |
| 7 | `git push origin main` (`4a7393a..1f4fa54`) | exit 0 |
| 8 | `gh run watch 30326865747 --exit-status` | exit 0 — **success**. Job "Lint, test, build, E2E" 2m53s (lint ✓, unit ✓, build ✓, Playwright install ✓, E2E ✓ `6 passed (14.1s)`), job "Deploy to GitHub Pages" 8s ✓. Run: https://github.com/Frankyface/BOSS-Blueprint/actions/runs/30326865747 |
| 9 | `GET https://frankyface.github.io/BOSS-Blueprint/` | HTTP **200**, `text/html; charset=utf-8`; body references `/BOSS-Blueprint/assets/index-DjNezX1e.js` + `.css` (base path correct) |
| 10 | Live-site browser render of `https://frankyface.github.io/BOSS-Blueprint/` | Accessibility tree shows `banner` → h1 "BOSS Blueprint", `complementary "Block palette"` → 6 buttons (Section, Heading, Text, Image, Button, Nav bar), `main "Page canvas"`; 0 console errors |

Base-path proof: the E2E suite always runs against `vite preview` at
`http://localhost:4173/BOSS-Blueprint/`, and one spec fails the run if **any** response
returns ≥400 — so a broken `base` can never pass CI.

Deviations from spec: none functional. Two notes for the reviewer —
(a) part of the config (`package.json`, `tsconfig*.json`, `eslint.config.js`, `site.config.ts`,
`vite.config.ts`, `playwright.config.ts`) was swept into commit `c11d426`
("docs: record Fable debate verdicts") by a concurrent session before this feature was
committed; the app code, tests, workflow and final config states all landed in `1f4fa54`.
(b) No canvas/drawing library and no Zustand were installed — this feature is skeleton only.

## Open Questions
- Canvas engine (Fable debate #1) — decides which rendering deps get installed here.
  Do not start until the verdict is in `docs/decisions.md`.

## Notes & Decisions
- Vite `base` must be `/BOSS-Blueprint/` for project Pages.
- Use the official `actions/deploy-pages` flow (build → artifact → deploy), not gh-pages branch.
