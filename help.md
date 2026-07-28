# help.md — Human To-Do List

Things only Cam can do. Sessions add items here when they hit a wall; check items off as done.

## Open

- [ ] **Create the email relay account** — the app has no backend, so submissions are emailed
  via a client-side relay service. Which service is decided by Fable debate #2 (see
  docs/decisions.md once recorded). When decided, create the free-tier account, configure the
  destination address (cammer3034@gmail.com or a BOSS address — your pick), and paste the
  public key/form ID into the project when asked. **Blocks: Stage 3 (Export & delivery)
  verification** — everything before that proceeds without it.

- [ ] **DNS: point `sketch.bossolutions.pro` at GitHub Pages** — optional custom domain for
  launch. Note your BOSS DNS repoint off GoHighLevel is still pending, so this rides on that.
  Until then the app lives at `https://frankyface.github.io/BOSS-Blueprint/`.
  **Blocks: nothing in v1** — custom domain is launch polish (Stage 4).

- [ ] **Add a "Sketch your site" link on bossolutions.pro** once the app is live — turns the
  tool into lead capture. **Blocks: Stage 4 launch step only.**

## Done

- [x] 2026-07-27 — GitHub CLI authenticated as Frankyface (verified during scaffold).
