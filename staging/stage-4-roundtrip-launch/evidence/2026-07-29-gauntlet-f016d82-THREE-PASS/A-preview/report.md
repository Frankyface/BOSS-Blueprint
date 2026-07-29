# Round-trip report — scenario A

**PASS 96.36/100** (pass needs ≥ 85, all hard gates, all floors)

- run dir: `C:\bp-runs\2026-07-29T17-33-12-658Z_A_f016d82`
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
| S1 | 23.9 | 25 | met |
| S2 | 20.0 | 20 | met |
| S3 | 15.0 | 15 | met |
| S4 | 15.0 | 15 | met |
| S5 | 15.0 | 15 | met |
| S6 | 7.5 | 10 | met |
| **Total** | **96.4** | **100** | |

## BUILD_NOTES triage

133 entries, 2 package-defect candidate(s) — **FRICTION**: the brief is making the builder guess too much
- outlined pill so it reads as "not wired up yet" rather than broken. Wire it
- **Band backgrounds.** No band specified a background, so I picked from the

> 4 permission denial(s) in the transcript. R5.6: an H2 failure alongside a denial routes to **harness (allowlist too tight)**, never to the product.
