# Round-trip report — scenario B

**SMOKE-FAIL 32/100** (pass needs ≥ 85, all hard gates, all floors)

- run dir: `C:\bp-runs\2026-07-29T16-07-51-270Z_B_2c50622`
- commit: `2c50622fc8cbf3870f43a5ea6ef647e0018ed251` (clean)
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
| S1 | 25.0 | 25 | met |
| S2 | skipped | 20 | met |
| S3 | skipped | 15 | met |
| S4 | 0.0 | 15 | **missed** |
| S5 | 7.0 | 15 | met |
| S6 | skipped | 10 | met |
| **Total** | **32.0** | **100** | |

## Misses and where they route

| Id | Problem | Fix lands in |
|---|---|---|
| S4 | S4 floor not met | brief generator §4.4 / assets usage lines |

## BUILD_NOTES triage

101 entries, 0 package-defect candidate(s) — **FRICTION**: the brief is making the builder guess too much

> 1 permission denial(s) in the transcript. R5.6: an H2 failure alongside a denial routes to **harness (allowlist too tight)**, never to the product.
