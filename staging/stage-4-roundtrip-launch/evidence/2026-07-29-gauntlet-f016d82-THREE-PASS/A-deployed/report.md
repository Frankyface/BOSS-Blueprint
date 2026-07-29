# Round-trip report — scenario A

**PASS 96.04/100** (pass needs ≥ 85, all hard gates, all floors)

- run dir: `C:\bp-runs\2026-07-29T17-47-28-781Z_A_f016d82`
- commit: `f016d82ca73d99edc12c5951c1a2c1e04f9cc3eb` (clean)
- target: `deployed` · builder model: `claude-opus-5`
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
| S1 | 23.5 | 25 | met |
| S2 | 20.0 | 20 | met |
| S3 | 15.0 | 15 | met |
| S4 | 15.0 | 15 | met |
| S5 | 15.0 | 15 | met |
| S6 | 7.5 | 10 | met |
| **Total** | **96.0** | **100** | |

## BUILD_NOTES triage

98 entries, 0 package-defect candidate(s) — **FRICTION**: the brief is making the builder guess too much

> 1 permission denial(s) in the transcript. R5.6: an H2 failure alongside a denial routes to **harness (allowlist too tight)**, never to the product.
