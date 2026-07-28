---
description: Run the active feature's verification and record evidence
---

Run the verification loop on the active feature:

1. Read `handoff.md` → **🔗 Pointer** → open the active feature file.
2. **Claim** — state what you believe is complete and which success criteria it satisfies.
3. **Test** — actually execute the feature's **How We'll Verify** steps: run the real commands
   (`npm test`, `npm run e2e`, builds, deployed-URL checks). "It compiles" or "code looks
   right" does not count.
4. **Evidence** — append a dated entry to the feature's **Verification Log**: what was run and
   the actual output/result (exit codes, test counts, screenshots where relevant).
5. **Status** — on pass: flip to `verified done`, tick satisfied criteria, sync the stage
   `overview.md` checklist. On fail: status stays `in progress`, record the failure, and if it
   was a dead end append it to `docs/failed-approaches.md`.
6. If verification is blocked on something only Cam can do: status stays
   `awaiting verification`, add the blocker to `help.md`, and say so plainly.

Never weaken success criteria to make them pass — that requires Cam's sign-off plus a
`docs/decisions.md` entry.
