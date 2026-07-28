---
description: Update all relevant docs to match reality ("update all relevant files")
---

Sync the doc system to what actually happened this session. Record only reality — if it
wasn't verified, don't record it as working.

1. **Review the session** — what changed, what was decided, what was built, what failed.
2. **Update as needed:**
   - `handoff.md` — rewrite every section in place (Goals, Current State, Files, Changed,
     Watch Out, Next Up, Pointer). Always updates. Enforce the budget: ≤60 lines total,
     "Changed" keeps only the last 5, "Watch Out" at most 3 — full failure stories go to
     `docs/failed-approaches.md` with a one-line pointer left behind. Over budget? Compressing
     it is part of the sync, not optional.
   - Active `staging/**/feature-*.md` files — Status per the state machine (`verified done`
     requires a Verification Log entry — no exceptions); resolve or append Open Questions.
   - Stage `overview.md` — if scope, done-criteria, or a feature's status changed.
   - `docs/decisions.md` — append decisions made this session (why + rejected alternatives).
   - `docs/failed-approaches.md` — append dead ends (root cause + do-instead).
   - `docs/master_plan.md` — only if the vision or roadmap genuinely changed.
   - `CLAUDE.md` — only if a rule, convention, or stack fact changed.
   - `new_session_prompt.md` / `.claude/commands/resume.md` — if resume instructions changed.
   - `help.md` — new human to-dos, or completed ones checked off.
3. **Integrity check:** handoff pointer resolves to the real current stage + feature file;
   handoff within 60 lines; every `verified done` feature has Verification Log evidence;
   no file left mid-edit.
4. **Report in 3–5 lines:** which files updated and why, plus anything deliberately NOT updated.
5. If git is clean otherwise, offer to commit: `docs: sync session state`.
