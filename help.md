# help.md — Human To-Do List

Things only Cam can do. Sessions add items here when they hit a wall; check items off as done.

## Open

- [ ] **Confirm the submit destination address** — the gated submit now ships, and its
  completion screen shows a real address (prefilled `mailto:` + copyable text). It is set to
  `cammer3034@gmail.com` in `site.config.ts` (`BOSS_SUBMIT_EMAIL`) — the working address this
  file already named. Say the word and it becomes a BOSS mailbox instead: it is one constant,
  no code around it. Worth knowing before launch: the address is visible on a public page, so
  a BOSS mailbox may be preferable to a personal one. **Blocks: nothing** — submit is fully
  functional today; this is a "is that the inbox you want it landing in?" question.

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
