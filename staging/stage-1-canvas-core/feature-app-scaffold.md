# Feature: App Scaffold
_Stage: stage-1-canvas-core · Status: not started_

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
_Empty — nothing verified yet. A feature with an empty log can never be `verified done`._

## Open Questions
- Canvas engine (Fable debate #1) — decides which rendering deps get installed here.
  Do not start until the verdict is in `docs/decisions.md`.

## Notes & Decisions
- Vite `base` must be `/BOSS-Blueprint/` for project Pages.
- Use the official `actions/deploy-pages` flow (build → artifact → deploy), not gh-pages branch.
