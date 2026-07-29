# Round-trip report — scenario B

**SMOKE-FAIL 29.14/100** (pass needs ≥ 85, all hard gates, all floors)

- run dir: `C:\bp-runs\2026-07-29T16-22-28-450Z_B_c8c1540`
- commit: `c8c15401e4095f1f351d65b42894f2923df85141` (clean)
- target: `preview` · builder model: `claude-haiku-4-5-20251001`
- run validity: valid

## Hard gates

| Gate | Result | Detail |
|---|---|---|
| H1 | PASS | — |
| H2 | PASS | — |
| H3 | PASS | — |
| H4 | PASS | — |
| H5 | PASS | — |
| H6 | PASS | — |
| H7 | PASS | — |
| H8 | PASS | — |

## Score

| Dim | Points | Max | Floor |
|---|---|---|---|
| S1 | 22.1 | 25 | met |
| S2 | skipped | 20 | met |
| S3 | skipped | 15 | met |
| S4 | 0.0 | 15 | **missed** |
| S5 | 7.0 | 15 | met |
| S6 | skipped | 10 | met |
| **Total** | **29.1** | **100** | |

## Misses and where they route

| Id | Problem | Fix lands in |
|---|---|---|
| S4 | S4 floor not met | brief generator §4.4 / assets usage lines |

## BUILD_NOTES triage

65 entries, 0 package-defect candidate(s) — **FRICTION**: the brief is making the builder guess too much

> 1 permission denial(s) in the transcript. R5.6: an H2 failure alongside a denial routes to **harness (allowlist too tight)**, never to the product.
