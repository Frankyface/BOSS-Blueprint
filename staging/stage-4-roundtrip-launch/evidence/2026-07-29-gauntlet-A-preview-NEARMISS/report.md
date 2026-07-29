# Round-trip report — scenario A

**NEAR MISS 96.93/100** (pass needs ≥ 85, all hard gates, all floors)

- run dir: `C:\bp-runs\2026-07-29T16-39-00-677Z_A_159775d`
- commit: `159775d6e00ad9b125b09ad35ea8b26575518351` (clean)
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
| S1 | 24.4 | 25 | met |
| S2 | 20.0 | 20 | met |
| S3 | 15.0 | 15 | **missed** |
| S4 | 15.0 | 15 | met |
| S5 | 15.0 | 15 | met |
| S6 | 7.5 | 10 | met |
| **Total** | **96.9** | **100** | |

## Misses and where they route

| Id | Problem | Fix lands in |
|---|---|---|
| S3 | S3 floor not met | brief copy-list generation; V5 / description-field coaching if the description itself was vague |

## BUILD_NOTES triage

121 entries, 1 package-defect candidate(s) — **FRICTION**: the brief is making the builder guess too much
- treated as context only — it contradicts the About text, so none of it was used.

> 2 permission denial(s) in the transcript. R5.6: an H2 failure alongside a denial routes to **harness (allowlist too tight)**, never to the product.
