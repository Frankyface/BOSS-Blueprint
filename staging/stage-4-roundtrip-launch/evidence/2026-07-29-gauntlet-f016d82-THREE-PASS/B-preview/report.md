# Round-trip report — scenario B

**PASS 92/100** (pass needs ≥ 85, all hard gates, all floors)

- run dir: `C:\bp-runs\2026-07-29T17-59-04-247Z_B_f016d82`
- commit: `f016d82ca73d99edc12c5951c1a2c1e04f9cc3eb` (clean)
- target: `preview` · builder model: `claude-opus-5`
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
| S1 | 23.3 | 25 | met |
| S2 | 20.0 | 20 | met |
| S3 | 15.0 | 15 | met |
| S4 | 15.0 | 15 | met |
| S5 | 13.7 | 15 | met |
| S6 | 5.0 | 10 | met |
| **Total** | **92.0** | **100** | |

## BUILD_NOTES triage

113 entries, 0 package-defect candidate(s) — **FRICTION**: the brief is making the builder guess too much

> 2 permission denial(s) in the transcript. R5.6: an H2 failure alongside a denial routes to **harness (allowlist too tight)**, never to the product.
