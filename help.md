# help.md — Human To-Do List

Things only Cam can do. Sessions add items here when they hit a wall; check items off as done.

## Open

- [ ] **Regenerate the Linux screenshot baselines** — one tick-box on GitHub, then hand the files
  back. **Blocks: the v1.1 deploy** — CI will go red the first time v1.1 is pushed, and stay red
  until this is done.

  Why it needs doing: the BOSS colours changed what an exported sketch looks like. A button in a
  client's sketch PNG is now BOSS blue where it used to be amber. CI checks every export against six
  stored reference pictures taken on its own machine (Linux), and those pictures are still the amber
  ones. They are not wrong, they are just from before — but a stored picture that no longer matches
  counts as a failure, so the check now fails on colour alone. New pictures fix it.

  **Exactly what to do:**
  1. GitHub → the **BOSS-Blueprint** repo → **Actions** → the deploy workflow → **Run workflow**,
     and tick the box about regenerating the export-visual baselines. That run skips the normal
     build and deploy — all it does is take pictures.
  2. When it finishes, download the artifact it leaves behind (`visual-baselines-linux`): six
     `.png` files.
  3. Hand them to a session to commit, or drop them into `e2e/export-visual.spec.ts-snapshots/`
     yourself and commit.

  **Worth knowing:** the Windows half of the set was already regenerated here, so this is the
  remaining half — the two platforms draw text slightly differently, which is why each needs its
  own. And the job is deliberately manual: a workflow that re-took its own reference pictures on
  every push would quietly bless a visual bug instead of catching it.

- [ ] **v1.1 is not live yet** — the address you hand clients
  (`https://frankyface.github.io/BOSS-Blueprint/`) is still running **v1**. The new work — the pen
  that builds the page instead of just annotating it, Add space / Trim on the bottom of a page, and
  the BOSS colours — is written and in the repo, not deployed. **Blocks: nothing you own.** Two
  things stand between it and the live site: the mandatory round-trip smoke run (a session's job)
  and the baselines above (yours).

  The practical bit until then: if you demo the live app to a client, you are demoing v1 — the pen
  still only annotates there, and a sketch they send you comes back in the old amber. Worth knowing
  before you show anyone the drawing features.

- [ ] **Optional: do you want the BOSS typeface as well as the colours?** — bossolutions.pro uses
  **Poppins**, served from Google Fonts. Blueprint has a hard rule that it never makes a
  third-party request — that is the promise that nothing about a client's sketch leaves their
  machine until they send it — so pulling the font from Google the way your site does is off the
  table. The result is that the colours match your site exactly and the lettering does not.

  If you want the lettering to match too, the fix is to copy the font files into the repo and serve
  them from there: a small job, no rule bent, no network call. **Blocks: nothing** — this is a
  look-and-feel call, not a technical one. Say yes or no whenever it suits.

- [ ] **Confirm the submit destination address** — the gated submit now ships, and its
  completion screen shows a real address (prefilled `mailto:` + copyable text). It is set to
  `cammer3034@gmail.com` in `site.config.ts` (`BOSS_SUBMIT_EMAIL`) — the working address this
  file already named. Say the word and it becomes a BOSS mailbox instead: it is one constant,
  no code around it. Worth knowing before launch: the address is visible on a public page, so
  a BOSS mailbox may be preferable to a personal one. **Blocks: nothing** — submit is fully
  functional today; this is a "is that the inbox you want it landing in?" question.

- [ ] **Create the email relay account and paste two strings** — *the code is DONE and waiting.*
  **Blocks: nothing.** Submit works today; this only adds a heads-up email to you on top.

  The app has no backend, so the notification goes through a free client-side form relay. The
  adapter is built, tested in three browsers and shipped **switched off** — it makes no network
  call at all until you fill the two fields below.

  **Exactly what to do:**
  1. Sign up free at any text-only form relay and point it at the inbox you want
     (`cammer3034@gmail.com` or a BOSS address). **Web3Forms** matches the defaults with no extra
     config; FormSubmit (ajax), Formspree and EmailJS also work.
  2. Open **`site.config.ts`** and find the `BOSS_RELAY` block near the bottom. Paste the
     provider's POST endpoint into `endpoint` and its public access key into `credential`:
     ```ts
     export const BOSS_RELAY: RelayConfig = {
       endpoint: 'https://api.web3forms.com/submit',   // ← paste
       credential: 'your-public-access-key',           // ← paste
     }
     ```
     Only if your provider names things differently: add `fields` (its field names),
     `staticFields` (extra constants it demands, e.g. EmailJS's `service_id`/`template_id`), or
     `nestFieldsUnder` (EmailJS nests everything under `template_params`). Each one is documented
     in the block itself.
  3. `npm run build`, commit, push — CI deploys it.
  4. Submit one sketch through the live app and check the inbox. On a real 200 the completion
     screen also gains the line "We have also been notified that your sketch is ready."
  5. Screenshot the email + that line, and the feature goes from `awaiting verification` to
     `verified done`.

  **Worth knowing before you do it:**
  - The key is a **public form key** — its only power is "submit to this one form", which is why
    this kind of provider works from a static site. It will be visible in the public repo and in
    the shipped JavaScript. That is the model working, not a leak; but somebody could use it to
    send you form spam, so lean on the provider's rate limit and rotate the key if that happens.
  - **The email is a notification, never the package.** It carries your client's name and email,
    the reference, the page count, the warnings, and (size permitting) `brief.md` plus a
    compressed `site.json`. The zip itself never rides it — that was debate #2's whole finding.
    Your client still emails you the zip; this just tells you it is coming.
  - A typo cannot break anything: an endpoint that is not a valid https URL, or a missing key,
    falls straight back to today's behaviour and logs why in the browser console.
  - 2026-07-29 (launch polish): submit ships with the no-op `DeliveryRelay` stub, which never
    claims an email was sent; the client gets their package by download and sends it themselves,
    and that path is fully verified. The relay is a nice-to-have notification, not a dependency.

- [ ] **DNS: point `sketch.bossolutions.pro` at GitHub Pages** — optional custom domain for
  launch. Note your BOSS DNS repoint off GoHighLevel is still pending, so this rides on that.
  Until then the app lives at `https://frankyface.github.io/BOSS-Blueprint/`.
  **Blocks: nothing in v1** — custom domain is launch polish (Stage 4).
  - 2026-07-29 (launch polish): still open, and still optional. Worth knowing before you do it:
    **a DNS record on its own is not enough.** The page's canonical link and its social-card tags
    are absolute URLs naming the current origin, and Vite bakes the `/BOSS-Blueprint/` base path
    into the bundle. Switching domains is a one-line change to `DEPLOYED_BASE_URL` (and `BASE_PATH`)
    in `site.config.ts`, a `CNAME` file, and **a redeploy** — plus a re-run of the head assertions
    (`src/meta/headTags.test.ts`, `e2e/launch-polish.spec.ts`) and the Lighthouse pass. Say the word
    and it is a ten-minute job; nothing is blocked while it waits.

- [ ] **Add a "Sketch your site" link on bossolutions.pro** once the app is live — turns the
  tool into lead capture. **Blocks: Stage 4 launch step only.**
  - 2026-07-29 (launch polish): the app is live and branded, and every screen now carries a
    "Built by BOSS → bossolutions.pro" footer link, so traffic flows *from* Blueprint *to* BOSS.
    The link in the other direction is the half only you can add. **Still open, still awaiting you** —
    nothing in the product is waiting on it.
  - 2026-07-29 (v1.1 docs pass): checked again today — the pull request that adds it,
    **[Frankyface/BOSS-website#1](https://github.com/Frankyface/BOSS-website/pull/1)** ("Add
    'Sketch your site' link to BOSS Blueprint"), is still **open** and unmerged. It is written and
    ready; merging it is one click whenever you want the link live.

## Done

- [x] 2026-07-29 — **Claude Code CLI re-authenticated** (Cam). Verified by scrubbed-env probe,
  then exercised for real: three sandboxed builder sessions ran to completion in the gauntlet.
  The CLI also auto-updated 2.1.190 → 2.1.220 in the same step; the builtin manifest was extended
  after a named-delta review (docs/decisions.md 2026-07-29).
- [x] 2026-07-27 — GitHub CLI authenticated as Frankyface (verified during scaffold).
